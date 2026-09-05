const { loadEntities, publicEntityRecords } = require("../entities");
const fs = require("node:fs");
const path = require("node:path");

const { loadCatalog, loadCollections } = require("../catalog");

function readOptionalJsonArray(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.basename(filePath)} must contain an array when present.`);
  }

  return parsed;
}

function isValidSlug(value = "") {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
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

  return Number.isFinite(Date.parse(value));
}

function assertUniqueIds(records, typeLabel) {
  const seenIds = new Set();

  records.forEach((record) => {
    if (!record || typeof record !== "object") {
      throw new Error(`Every ${typeLabel} record must be an object.`);
    }

    if (!isValidSlug(record.id)) {
      throw new Error(`Invalid ${typeLabel} id "${record.id}".`);
    }

    if (seenIds.has(record.id)) {
      throw new Error(`Duplicate ${typeLabel} id "${record.id}".`);
    }

    seenIds.add(record.id);
  });
}

function loadCreators(siteRoot) {
  const records = readOptionalJsonArray(path.join(siteRoot, "data", "creators.json"));
  assertUniqueIds(records, "creator");

  records.forEach((record) => {
    if (typeof record.name !== "string" || !record.name.trim()) {
      throw new Error(`Creator "${record.id}" is missing a name.`);
    }

    if (!isValidUrl(record.website || "")) {
      throw new Error(`Creator "${record.id}" has invalid website URL.`);
    }
  });

  return records;
}

function loadNetworks(siteRoot) {
  const records = readOptionalJsonArray(path.join(siteRoot, "data", "networks.json"));
  assertUniqueIds(records, "network");

  records.forEach((record) => {
    if (typeof record.name !== "string" || !record.name.trim()) {
      throw new Error(`Network "${record.id}" is missing a name.`);
    }

    if (!isValidUrl(record.website || "")) {
      throw new Error(`Network "${record.id}" has invalid website URL.`);
    }
  });

  return records;
}

function loadChangelog(siteRoot, knownShowIds = new Set()) {
  const records = readOptionalJsonArray(path.join(siteRoot, "data", "changelog.json"));
  assertUniqueIds(records, "changelog entry");

  records.forEach((record) => {
    if (typeof record.title !== "string" || !record.title.trim()) {
      throw new Error(`Changelog entry "${record.id}" is missing a title.`);
    }

    if (typeof record.summary !== "string" || !record.summary.trim()) {
      throw new Error(`Changelog entry "${record.id}" is missing a summary.`);
    }

    if (record.status && !new Set(["draft", "published"]).has(record.status)) {
      throw new Error(`Changelog entry "${record.id}" has invalid status "${record.status}".`);
    }

    if (record.publishedAt && !isValidDateValue(record.publishedAt)) {
      throw new Error(`Changelog entry "${record.id}" has invalid publishedAt "${record.publishedAt}".`);
    }

    if (record.showIds && !Array.isArray(record.showIds)) {
      throw new Error(`Changelog entry "${record.id}" must use an array for showIds.`);
    }

    (record.showIds || []).forEach((showId) => {
      if (!knownShowIds.has(showId)) {
        throw new Error(`Changelog entry "${record.id}" references unknown show "${showId}".`);
      }
    });
  });

  return records;
}

function deriveFeatureAvailability({ catalog, collections, creators, networks, changelog, entities = [] }) {
  const creatorIds = new Set(creators.map((record) => record.id));
  const networkIds = new Set(networks.map((record) => record.id));
  const publishedShows = Array.isArray(catalog) ? catalog.filter((record) => record.status === "published") : [];
  const collectionRecords = Array.isArray(collections) ? collections : [];

  const hasPublicChangelog = changelog.some((entry) => (entry.status || "published") === "published");
  const hasCreatorPages =
    creators.length > 0 &&
    publishedShows.some((show) => typeof show.creatorId === "string" && creatorIds.has(show.creatorId));
  const hasNetworkPages =
    networks.length > 0 &&
    publishedShows.some((show) => typeof show.networkId === "string" && networkIds.has(show.networkId));
  const hasSimilarReasons = publishedShows.some((show) => Object.keys(show.similarReasons || {}).length > 0);
  const hasCollectionShowReasons = collectionRecords.some((collection) => Object.keys(collection.showReasons || {}).length > 0);
  const hasRecentlyAdded = publishedShows.some((show) => Boolean(show.createdAt));

  return {
    hasPublicChangelog,
    hasCreatorPages: entities.length > 0 || hasCreatorPages,
    hasNetworkPages,
    hasSimilarReasons,
    hasCollectionShowReasons,
    hasRecentlyAdded,
  };
}

async function loadArchiveContext(siteRoot, catalog = null, collections = null, options = {}) {
  const resolvedCatalog = Array.isArray(catalog) ? catalog : await loadCatalog(siteRoot, options);
  const resolvedCollections =
    Array.isArray(collections) ? collections : loadCollections(siteRoot, new Set(resolvedCatalog.map((show) => show.id)));
  const entities = publicEntityRecords(loadEntities(siteRoot, resolvedCatalog), resolvedCatalog);
  const creators = loadCreators(siteRoot);
  const networks = loadNetworks(siteRoot);
  const changelog = loadChangelog(siteRoot, new Set(resolvedCatalog.map((show) => show.id)));

  const creatorIds = new Set(creators.map((record) => record.id));
  const networkIds = new Set(networks.map((record) => record.id));

  resolvedCatalog.forEach((show) => {
    if (creatorIds.size > 0 && show.creatorId && !creatorIds.has(show.creatorId)) {
      throw new Error(`Show "${show.id}" references unknown creatorId "${show.creatorId}".`);
    }

    if (networkIds.size > 0 && show.networkId && !networkIds.has(show.networkId)) {
      throw new Error(`Show "${show.id}" references unknown networkId "${show.networkId}".`);
    }
  });

  return {
    entities,
    creators,
    networks,
    changelog,
    featureAvailability: deriveFeatureAvailability({
      entities,
      catalog: resolvedCatalog,
      collections: resolvedCollections,
      creators,
      networks,
      changelog,
    }),
  };
}

module.exports = {
  deriveFeatureAvailability,
  loadArchiveContext,
  loadChangelog,
  loadCreators,
  loadNetworks,
};
