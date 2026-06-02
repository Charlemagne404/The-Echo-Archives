const fs = require("node:fs");
const path = require("node:path");

const VALID_REVIEW_STATUSES = new Set(["full-review", "spotlight", "indexed-only", "planned"]);
const VALID_STATUS_VALUES = new Set(["published", "draft"]);
const VALID_RELEASE_STATUSES = new Set(["active", "completed", "hiatus", "inactive", "unknown"]);
const VALID_COMPLETION_STATUSES = new Set(["ongoing", "finished", "cancelled", "unclear"]);

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeTag(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "-");
}

function isValidUrl(value = "") {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function assertUniqueNormalized(collection, fieldName, showId) {
  const seen = new Set();

  (Array.isArray(collection) ? collection : []).forEach((value) => {
    const normalized = normalizeTag(value);
    if (!normalized) {
      return;
    }

    if (seen.has(normalized)) {
      throw new Error(`Show "${showId}" contains duplicate ${fieldName} value "${value}".`);
    }

    seen.add(normalized);
  });
}

function formatShowHref(id) {
  return `/show.html?id=${encodeURIComponent(id)}`;
}

function buildSearchText(record) {
  return [
    record.title,
    record.subtitle,
    record.description,
    record.archiveTake,
    record.spoilerFreeReview,
    record.thoughts,
    ...(record.tags || []),
    ...(record.genres || []),
    ...(record.tones || []),
    ...(record.formats || []),
    ...(record.bestFor || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeRecord(record) {
  const tags = Array.isArray(record.tags) ? record.tags.filter(Boolean) : [];
  const genres = Array.isArray(record.genres) ? record.genres.filter(Boolean) : [];
  const tones = Array.isArray(record.tones) ? record.tones.filter(Boolean) : [];
  const formats = Array.isArray(record.formats) ? record.formats.filter(Boolean) : [];
  const bestFor = Array.isArray(record.bestFor) ? record.bestFor.filter(Boolean) : [];
  const similarTo = Array.isArray(record.similarTo) ? record.similarTo.filter(Boolean) : [];
  const ratings = record.ratings && typeof record.ratings === "object" ? record.ratings : {};
  const finalRating =
    typeof ratings.archive === "number"
      ? ratings.archive
      : typeof ratings.archive === "string"
        ? Number.parseFloat(ratings.archive)
        : null;

  const normalized = {
    ...record,
    tags,
    genres,
    tones,
    formats,
    bestFor,
    similarTo,
    ratings,
    finalRating: Number.isFinite(finalRating) ? finalRating : null,
    href: formatShowHref(record.id),
    hasPage: record.status === "published",
    image: record.cover || "",
    imageAlt: record.coverAlt || `${record.title} cover art`,
    summary: record.description || "",
    searchText: "",
  };

  normalized.searchText = buildSearchText(normalized);
  return normalized;
}

function validateShowRecord(record, seenIds) {
  if (!record || typeof record !== "object") {
    throw new Error("Every show record must be an object.");
  }

  if (typeof record.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) {
    throw new Error(`Invalid show id "${record.id}".`);
  }

  if (seenIds.has(record.id)) {
    throw new Error(`Duplicate show id "${record.id}".`);
  }
  seenIds.add(record.id);

  if (typeof record.title !== "string" || !record.title.trim()) {
    throw new Error(`Show "${record.id}" is missing a title.`);
  }

  if (typeof record.description !== "string" || !record.description.trim()) {
    throw new Error(`Show "${record.id}" is missing a description.`);
  }

  if (typeof record.cover !== "string" || !record.cover.trim()) {
    throw new Error(`Show "${record.id}" is missing a cover path.`);
  }

  if (!VALID_STATUS_VALUES.has(record.status)) {
    throw new Error(`Show "${record.id}" has invalid status "${record.status}".`);
  }

  if (!VALID_REVIEW_STATUSES.has(record.reviewStatus)) {
    throw new Error(`Show "${record.id}" has invalid reviewStatus "${record.reviewStatus}".`);
  }

  if (record.releaseStatus && !VALID_RELEASE_STATUSES.has(record.releaseStatus)) {
    throw new Error(`Show "${record.id}" has invalid releaseStatus "${record.releaseStatus}".`);
  }

  if (record.completionStatus && !VALID_COMPLETION_STATUSES.has(record.completionStatus)) {
    throw new Error(`Show "${record.id}" has invalid completionStatus "${record.completionStatus}".`);
  }

  if (
    !record.ratings ||
    typeof record.ratings !== "object" ||
    !Number.isFinite(Number(record.ratings.archive))
  ) {
    throw new Error(`Show "${record.id}" is missing a numeric ratings.archive value.`);
  }

  assertUniqueNormalized(record.tags, "tags", record.id);
  assertUniqueNormalized(record.genres, "genres", record.id);
  assertUniqueNormalized(record.tones, "tones", record.id);
  assertUniqueNormalized(record.formats, "formats", record.id);

  const listenLinks = record.listenLinks && typeof record.listenLinks === "object" ? record.listenLinks : {};
  Object.entries(listenLinks).forEach(([key, value]) => {
    if (!isValidUrl(value || "")) {
      throw new Error(`Show "${record.id}" has invalid listenLinks.${key} URL.`);
    }
  });

  if (record.reviewStatus === "full-review") {
    const hasRichContent =
      typeof record.archiveTake === "string" &&
      record.archiveTake.trim() &&
      typeof record.spoilerFreeReview === "string" &&
      record.spoilerFreeReview.trim();

    if (!hasRichContent) {
      throw new Error(`Show "${record.id}" is marked full-review without richer review content.`);
    }
  }
}

function validateCollectionRecord(record, seenIds, knownShowIds) {
  if (!record || typeof record !== "object") {
    throw new Error("Every collection record must be an object.");
  }

  if (typeof record.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) {
    throw new Error(`Invalid collection id "${record.id}".`);
  }

  if (seenIds.has(record.id)) {
    throw new Error(`Duplicate collection id "${record.id}".`);
  }
  seenIds.add(record.id);

  if (!Array.isArray(record.showIds) || record.showIds.length === 0) {
    throw new Error(`Collection "${record.id}" must include showIds.`);
  }

  record.showIds.forEach((showId) => {
    if (!knownShowIds.has(showId)) {
      throw new Error(`Collection "${record.id}" references unknown show "${showId}".`);
    }
  });
}

function loadShows(siteRoot) {
  const showsPath = path.join(siteRoot, "data", "shows.json");
  const records = readJsonFile(showsPath);
  const seenIds = new Set();

  if (!Array.isArray(records)) {
    throw new Error("data/shows.json must contain an array.");
  }

  records.forEach((record) => validateShowRecord(record, seenIds));

  const normalized = records.map(normalizeRecord);
  const idSet = new Set(normalized.map((record) => record.id));

  normalized.forEach((record) => {
    record.similarTo.forEach((showId) => {
      if (!idSet.has(showId)) {
        throw new Error(`Show "${record.id}" references unknown similarTo id "${showId}".`);
      }
    });
  });

  return normalized;
}

function loadCollections(siteRoot, knownShowIds = null) {
  const collectionsPath = path.join(siteRoot, "data", "collections.json");
  const records = readJsonFile(collectionsPath);
  const seenIds = new Set();
  const showIdSet = knownShowIds || new Set(loadShows(siteRoot).map((record) => record.id));

  if (!Array.isArray(records)) {
    throw new Error("data/collections.json must contain an array.");
  }

  records.forEach((record) => validateCollectionRecord(record, seenIds, showIdSet));
  return records;
}

function loadCatalog(siteRoot) {
  return loadShows(siteRoot);
}

function tokenizeQuery(message = "") {
  return Array.from(
    new Set(
      message
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1),
    ),
  );
}

function scoreCatalog(catalog, message) {
  const lowered = message.toLowerCase();
  const tokens = tokenizeQuery(message);

  return catalog
    .map((record) => {
      let score = 0;
      const reasons = [];

      if (lowered.includes(record.title.toLowerCase())) {
        score += 10;
        reasons.push(`direct title match for ${record.title}`);
      }

      for (const tag of record.tags) {
        const normalizedTag = tag.toLowerCase();
        if (lowered.includes(normalizedTag)) {
          score += 4;
          reasons.push(`matches ${tag}`);
        }
      }

      for (const genre of record.genres) {
        if (lowered.includes(genre.toLowerCase())) {
          score += 3;
          reasons.push(`fits ${genre}`);
        }
      }

      for (const token of tokens) {
        if (record.searchText.includes(token)) {
          score += 1;
        }
      }

      if (record.finalRating && record.finalRating >= 9 && /(best|favorite|top|highest|amazing)/i.test(lowered)) {
        score += 3;
        reasons.push("one of the archive's strongest rated picks");
      }

      if (record.facts?.wouldRelisten && /(relisten|rewatch|comfort|return)/i.test(lowered)) {
        score += 2;
        reasons.push("strong replay value");
      }

      return {
        ...record,
        score,
        reasons: Array.from(new Set(reasons)),
      };
    })
    .filter((record) => record.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (right.finalRating || 0) - (left.finalRating || 0);
    });
}

module.exports = {
  loadCatalog,
  loadCollections,
  loadShows,
  scoreCatalog,
  tokenizeQuery,
};
