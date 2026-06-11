const fs = require("node:fs");
const path = require("node:path");

const { hasRichReviewContent, mergeReviewContent, readReviewRecord } = require("./reviews");
const {
  hydrateCatalogSearch,
  normalizeTag,
  scoreCatalog,
  tokenizeQuery,
} = require("../../shared/archive-search");

const VALID_REVIEW_STATUSES = new Set(["full-review", "spotlight", "indexed-only", "planned"]);
const VALID_STATUS_VALUES = new Set(["published", "draft"]);
const VALID_RELEASE_STATUSES = new Set(["active", "completed", "hiatus", "inactive", "unknown"]);
const VALID_COMPLETION_STATUSES = new Set(["ongoing", "finished", "cancelled", "unclear"]);

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function isValidDateValue(value = "") {
  if (!value) {
    return true;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function isValidSlug(value = "") {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function normalizeTextMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, text]) => [String(key || "").trim(), String(text || "").trim()])
      .filter(([key, text]) => key && text),
  );
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

function normalizeRecord(record) {
  const tags = Array.isArray(record.tags) ? record.tags.filter(Boolean) : [];
  const genres = Array.isArray(record.genres) ? record.genres.filter(Boolean) : [];
  const tones = Array.isArray(record.tones) ? record.tones.filter(Boolean) : [];
  const formats = Array.isArray(record.formats) ? record.formats.filter(Boolean) : [];
  const bestFor = Array.isArray(record.bestFor) ? record.bestFor.filter(Boolean) : [];
  const similarTo = Array.isArray(record.similarTo) ? record.similarTo.filter(Boolean) : [];
  const similarReasons = normalizeTextMap(record.similarReasons);
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
    similarReasons,
    ratings,
    finalRating: Number.isFinite(finalRating) ? finalRating : null,
    href: formatShowHref(record.id),
    hasPage: record.status === "published",
    image: record.cover || "",
    imageAlt: record.coverAlt || `${record.title} cover art`,
    summary: record.description || "",
    spoilerFreeReviewParagraphs: Array.isArray(record.spoilerFreeReviewParagraphs) ? record.spoilerFreeReviewParagraphs : [],
    thoughtsParagraphs: Array.isArray(record.thoughtsParagraphs) ? record.thoughtsParagraphs : [],
    searchText: "",
  };
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
  assertUniqueNormalized(record.bestFor, "bestFor", record.id);

  if (record.createdAt && !isValidDateValue(record.createdAt)) {
    throw new Error(`Show "${record.id}" has invalid createdAt "${record.createdAt}".`);
  }

  if (record.updatedAt && !isValidDateValue(record.updatedAt)) {
    throw new Error(`Show "${record.id}" has invalid updatedAt "${record.updatedAt}".`);
  }

  if (record.creatorId && !isValidSlug(record.creatorId)) {
    throw new Error(`Show "${record.id}" has invalid creatorId "${record.creatorId}".`);
  }

  if (record.networkId && !isValidSlug(record.networkId)) {
    throw new Error(`Show "${record.id}" has invalid networkId "${record.networkId}".`);
  }

  if (record.similarReasons && (typeof record.similarReasons !== "object" || Array.isArray(record.similarReasons))) {
    throw new Error(`Show "${record.id}" has invalid similarReasons data.`);
  }

  const listenLinks = record.listenLinks && typeof record.listenLinks === "object" ? record.listenLinks : {};
  Object.entries(listenLinks).forEach(([key, value]) => {
    if (!isValidUrl(value || "")) {
      throw new Error(`Show "${record.id}" has invalid listenLinks.${key} URL.`);
    }
  });

  if (record.reviewStatus === "full-review" && !hasRichReviewContent(record)) {
      throw new Error(`Show "${record.id}" is marked full-review without richer review content.`);
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

  if (record.updatedAt && !isValidDateValue(record.updatedAt)) {
    throw new Error(`Collection "${record.id}" has invalid updatedAt "${record.updatedAt}".`);
  }

  if (record.createdAt && !isValidDateValue(record.createdAt)) {
    throw new Error(`Collection "${record.id}" has invalid createdAt "${record.createdAt}".`);
  }

  record.showIds.forEach((showId) => {
    if (!knownShowIds.has(showId)) {
      throw new Error(`Collection "${record.id}" references unknown show "${showId}".`);
    }
  });

  if (record.showReasons && (typeof record.showReasons !== "object" || Array.isArray(record.showReasons))) {
    throw new Error(`Collection "${record.id}" has invalid showReasons data.`);
  }

  Object.keys(normalizeTextMap(record.showReasons)).forEach((showId) => {
    if (!record.showIds.includes(showId)) {
      throw new Error(`Collection "${record.id}" defines a showReason for unknown show "${showId}".`);
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

  const mergedRecords = records.map((record) => mergeReviewContent(record, readReviewRecord(siteRoot, record.id)));

  mergedRecords.forEach((record) => validateShowRecord(record, seenIds));

  const normalized = mergedRecords.map(normalizeRecord);
  const idSet = new Set(normalized.map((record) => record.id));

  normalized.forEach((record) => {
    record.similarTo.forEach((showId) => {
      if (!idSet.has(showId)) {
        throw new Error(`Show "${record.id}" references unknown similarTo id "${showId}".`);
      }
    });

    Object.keys(record.similarReasons).forEach((showId) => {
      if (!idSet.has(showId)) {
        throw new Error(`Show "${record.id}" references unknown similarReasons id "${showId}".`);
      }

      if (!record.similarTo.includes(showId)) {
        throw new Error(`Show "${record.id}" defines a similarReason for "${showId}" without listing it in similarTo.`);
      }
    });
  });

  return hydrateCatalogSearch(normalized);
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
  return records.map((record) => ({
    ...record,
    showReasons: normalizeTextMap(record.showReasons),
  }));
}

function resolveCollectionView({ catalog, collections, collectionId }) {
  const collectionRecords = Array.isArray(collections) ? collections : [];
  const catalogRecords = Array.isArray(catalog) ? catalog : [];
  const collection = collectionRecords.find((entry) => entry.id === collectionId);

  if (!collection) {
    const error = new Error(`Unknown collection "${collectionId}".`);
    error.statusCode = 404;
    throw error;
  }

  const showsById = new Map(catalogRecords.map((record) => [record.id, record]));
  const shows = collection.showIds
    .map((showId) => showsById.get(showId))
    .filter((show) => show && show.status === "published");

  return {
    collection,
    shows,
  };
}

function loadCatalog(siteRoot) {
  return loadShows(siteRoot);
}

module.exports = {
  loadCatalog,
  loadCollections,
  loadShows,
  resolveCollectionView,
  scoreCatalog,
  tokenizeQuery,
};
