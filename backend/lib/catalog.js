const fs = require("node:fs");
const path = require("node:path");

const { syncShowCovers } = require("./cover-sync");
const { hasRichReviewContent, mergeReviewContent, readReviewRecord } = require("./reviews");
const {
  hydrateCatalogSearch,
  normalizeTag,
  scoreCatalog,
  tokenizeQuery,
} = require("../../shared/archive-search");
const {
  DEPRECATED_SHOW_FIELDS,
  normalizeCollectionRecord,
  normalizeKeyedTextMap,
  normalizeShowRecord,
} = require("../../shared/archive-record");
const {
  COMPLETION_STATUSES,
  RELEASE_STATUSES,
  REVIEW_STATUSES,
  SHOW_STATUSES,
} = require("../../tools/lib/catalog-schema");
const {
  CANONICAL_SCI_FI_TAG,
  MIN_PUBLISHED_DISCOVERY_TAGS,
  SCI_FI_TAG_PATTERN,
  isRedundantDiscoveryTag,
} = require("../../shared/archive-tags");
const {
  readCatalogSource,
  writeCatalogSource,
} = require("../../tools/lib/catalog-source");

const VALID_REVIEW_STATUSES = new Set(REVIEW_STATUSES);
const VALID_STATUS_VALUES = new Set(SHOW_STATUSES);
const VALID_RELEASE_STATUSES = new Set(RELEASE_STATUSES);
const VALID_COMPLETION_STATUSES = new Set(COMPLETION_STATUSES);

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

  const text = String(value || "").trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return (
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day)
    );
  }

  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp);
}

function isValidSlug(value = "") {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isValidOptionalNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  return Number.isFinite(Number.parseFloat(value.trim()));
}

function parseOptionalNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function validateUrlMap(showId, fieldName, value) {
  const links = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  Object.entries(links).forEach(([key, href]) => {
    if (!isValidUrl(href || "")) {
      throw new Error(`Show "${showId}" has invalid ${fieldName}.${key} URL.`);
    }
  });
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

function assertUniqueNormalizedCollection(collection, fieldName, collectionId) {
  const seen = new Set();

  (Array.isArray(collection) ? collection : []).forEach((value) => {
    const normalized = normalizeTag(value);
    if (!normalized) {
      return;
    }

    if (seen.has(normalized)) {
      throw new Error(`Collection "${collectionId}" contains duplicate ${fieldName} value "${value}".`);
    }

    seen.add(normalized);
  });
}

function validateRatingMap(showId, value) {
  if (value === undefined) {
    return;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Show "${showId}" has invalid ratings data.`);
  }

  Object.entries(value).forEach(([key, ratingValue]) => {
    const numericValue = parseOptionalNumber(ratingValue);
    if (numericValue === null) {
      throw new Error(`Show "${showId}" has invalid ratings.${key} value.`);
    }

    if (numericValue < 0 || numericValue > 10) {
      throw new Error(`Show "${showId}" has out-of-range ratings.${key} value.`);
    }
  });
}

function validateDeprecatedShowFields(record) {
  DEPRECATED_SHOW_FIELDS.forEach((fieldName) => {
    if (Object.hasOwn(record, fieldName)) {
      throw new Error(`Show "${record.id}" still uses deprecated field "${fieldName}".`);
    }
  });
}

function validateDiscoveryTags(record) {
  const tags = Array.isArray(record.tags) ? record.tags : [];

  if (record.status === "published" && tags.length < MIN_PUBLISHED_DISCOVERY_TAGS) {
    throw new Error(`Show "${record.id}" must have at least ${MIN_PUBLISHED_DISCOVERY_TAGS} discovery tags before publication.`);
  }

  tags.forEach((tag) => {
    if (SCI_FI_TAG_PATTERN.test(String(tag || "").trim()) && tag !== CANONICAL_SCI_FI_TAG) {
      throw new Error(`Show "${record.id}" must use the canonical "${CANONICAL_SCI_FI_TAG}" discovery tag instead of "${tag}".`);
    }

    if (isRedundantDiscoveryTag(tag)) {
      throw new Error(`Show "${record.id}" uses redundant discovery tag "${tag}".`);
    }
  });
}

function validateShowRecord(record, seenIds) {
  if (!record || typeof record !== "object") {
    throw new Error("Every show record must be an object.");
  }

  if (typeof record.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) {
    throw new Error(`Invalid show id "${record.id}".`);
  }

  validateDeprecatedShowFields(record);

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

  validateDiscoveryTags(record);
  assertUniqueNormalized(record.tags, "tags", record.id);
  assertUniqueNormalized(record.genres, "genres", record.id);
  assertUniqueNormalized(record.tones, "tones", record.id);
  assertUniqueNormalized(record.formats, "formats", record.id);
  assertUniqueNormalized(record.bestFor, "bestFor", record.id);
  assertUniqueNormalized(record.aliases, "aliases", record.id);
  assertUniqueNormalized(record.themes, "themes", record.id);
  assertUniqueNormalized(record.contentNotes, "contentNotes", record.id);
  assertUniqueNormalized(record.languages, "languages", record.id);
  assertUniqueNormalized(record.transcriptLanguages, "transcriptLanguages", record.id);
  assertUniqueNormalized(record.cast, "cast", record.id);
  assertUniqueNormalized(record.creators, "creators", record.id);

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

  if (record.popularity !== undefined) {
    if (!record.popularity || typeof record.popularity !== "object" || Array.isArray(record.popularity)) {
      throw new Error(`Show "${record.id}" has invalid popularity data.`);
    }

    if (Object.hasOwn(record.popularity, "score") && !isValidOptionalNumber(record.popularity.score)) {
      throw new Error(`Show "${record.id}" has invalid popularity.score value.`);
    }
  }

  validateRatingMap(record.id, record.ratings);
  validateUrlMap(record.id, "listenLinks", record.listenLinks);
  validateUrlMap(record.id, "officialLinks", record.officialLinks);

  if (record.officialDescription !== undefined) {
    if (!record.officialDescription || typeof record.officialDescription !== "object" || Array.isArray(record.officialDescription)) {
      throw new Error(`Show "${record.id}" has invalid officialDescription data.`);
    }
    const official = record.officialDescription;
    if (official.text || official.sourceLabel || official.sourceUrl || official.verifiedAt) {
      if (typeof official.text !== "string" || !official.text.trim() || typeof official.sourceLabel !== "string" || !official.sourceLabel.trim()) {
        throw new Error(`Show "${record.id}" needs official description text and source label.`);
      }
      if (!isValidUrl(official.sourceUrl)) {
        throw new Error(`Show "${record.id}" has invalid officialDescription.sourceUrl.`);
      }
      if (official.verifiedAt && !isValidDateValue(official.verifiedAt)) {
        throw new Error(`Show "${record.id}" has invalid officialDescription.verifiedAt.`);
      }
    }
  }

  const datedFields = [
    ["releaseDates.first", record.releaseDates?.first],
    ["releaseDates.latest", record.releaseDates?.latest],
    ["verification.verifiedAt", record.verification?.verifiedAt],
  ];
  datedFields.forEach(([fieldName, value]) => {
    if (value && !isValidDateValue(value)) {
      throw new Error(`Show "${record.id}" has invalid ${fieldName} "${value}".`);
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

  assertUniqueNormalizedCollection(record.showIds, "showIds", record.id);
  assertUniqueNormalizedCollection(record.coverShowIds, "coverShowIds", record.id);
  assertUniqueNormalizedCollection(record.intentTags, "intentTags", record.id);

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

  if (record.kind === "similarity" && !record.anchorShowId) {
    throw new Error(`Collection "${record.id}" must include anchorShowId.`);
  }

  if (record.anchorShowId !== undefined) {
    if (!isValidSlug(record.anchorShowId)) {
      throw new Error(`Collection "${record.id}" has invalid anchorShowId "${record.anchorShowId}".`);
    }

    if (!knownShowIds.has(record.anchorShowId)) {
      throw new Error(`Collection "${record.id}" references unknown anchorShowId "${record.anchorShowId}".`);
    }
  }

  if (record.coverShowIds !== undefined && !Array.isArray(record.coverShowIds)) {
    throw new Error(`Collection "${record.id}" has invalid coverShowIds data.`);
  }

  (Array.isArray(record.coverShowIds) ? record.coverShowIds : []).forEach((showId) => {
    if (!record.showIds.includes(showId)) {
      throw new Error(`Collection "${record.id}" defines a coverShowId for a show outside showIds.`);
    }
  });

  if (record.intentTags !== undefined && !Array.isArray(record.intentTags)) {
    throw new Error(`Collection "${record.id}" has invalid intentTags data.`);
  }

  if (record.showReasons && (typeof record.showReasons !== "object" || Array.isArray(record.showReasons))) {
    throw new Error(`Collection "${record.id}" has invalid showReasons data.`);
  }

  Object.keys(normalizeKeyedTextMap(record.showReasons)).forEach((showId) => {
    if (!record.showIds.includes(showId)) {
      throw new Error(`Collection "${record.id}" defines a showReason for unknown show "${showId}".`);
    }
  });
}

async function loadShows(siteRoot, options = {}) {
  const sourceData = readCatalogSource(siteRoot);
  const records = Array.isArray(options.sourceData?.shows) ? options.sourceData.shows : sourceData.shows;
  const reviewsById = options.sourceData?.reviewsById || sourceData.reviewsById;

  await syncShowCovers(siteRoot, records, {
    ...(options.coverSync || {}),
    persistRecords: async (nextRecords) => {
      writeCatalogSource(
        siteRoot,
        {
          ...sourceData,
          shows: nextRecords,
        },
        { mode: sourceData.mode },
      );
    },
  });

  const seenIds = new Set();
  const mergedRecords = records.map((record) => mergeReviewContent(record, reviewsById[record.id] || readReviewRecord(siteRoot, record.id)));

  mergedRecords.forEach((record) => validateShowRecord(record, seenIds));

  const normalized = mergedRecords.map((record) => normalizeShowRecord(record));
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

function loadCollections(siteRoot, knownShowIds = null, options = {}) {
  const sourceData = readCatalogSource(siteRoot);
  const records = Array.isArray(options.sourceData?.collections) ? options.sourceData.collections : sourceData.collections;
  const seenIds = new Set();
  const showIdSet =
    knownShowIds ||
    new Set(sourceData.shows.filter((record) => record && typeof record === "object" && typeof record.id === "string").map((record) => record.id));

  records.forEach((record) => validateCollectionRecord(record, seenIds, showIdSet));
  return records.map((record) => normalizeCollectionRecord(record));
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

async function loadCatalog(siteRoot, options = {}) {
  return loadShows(siteRoot, options);
}

module.exports = {
  loadCatalog,
  loadCollections,
  loadShows,
  resolveCollectionView,
  scoreCatalog,
  tokenizeQuery,
};
