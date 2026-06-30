const fs = require("node:fs");
const path = require("node:path");

const { buildCatalog } = require("../../tools/build-catalog");
const { getReviewSourcePath, readCatalogSource, writeCatalogSource } = require("../../tools/lib/catalog-source");
const { loadArchiveContext } = require("../lib/ai/archive-context");
const { loadCatalog, loadCollections } = require("../lib/catalog");
const { getGateBCriticalValidationErrors } = require("../lib/discovery-gaps");
const {
  hasRichReviewContent,
  normalizeParagraphs,
  normalizeQuote,
} = require("../lib/reviews");

function resolveSiteRoot() {
  return path.resolve(process.cwd(), process.env.STATIC_ROOT || "..");
}

function getShowsFilePath(siteRoot) {
  return path.join(siteRoot, "data", "shows.json");
}

function readShowsFile(siteRoot) {
  return readCatalogSource(siteRoot).shows;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeShowsFile(siteRoot, shows) {
  const sourceData = readCatalogSource(siteRoot);
  writeCatalogSource(
    siteRoot,
    {
      ...sourceData,
      shows,
    },
    { mode: sourceData.mode },
  );
}

function findShowRecord(shows, showId) {
  return shows.find((show) => show.id === showId) || null;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function createReviewPayloadFromShow(show) {
  return {
    archiveTake: String(show?.archiveTake || "").trim(),
    spoilerFreeReview: normalizeParagraphs(show?.spoilerFreeReview),
    thoughts: normalizeParagraphs(show?.thoughts),
    quote: normalizeQuote(show?.quote),
  };
}

function getReviewFileStatus(siteRoot, showId) {
  const reviewFilePath = getReviewSourcePath(siteRoot, showId);
  return {
    exists: fs.existsSync(reviewFilePath),
    path: reviewFilePath,
  };
}

function writeReviewFile(siteRoot, showId, payload) {
  const sourceData = readCatalogSource(siteRoot);
  sourceData.reviewsById[showId] = {
    archiveTake: String(payload.archiveTake || "").trim(),
    spoilerFreeReview: normalizeParagraphs(payload.spoilerFreeReview),
    thoughts: normalizeParagraphs(payload.thoughts),
    quote: normalizeQuote(payload.quote),
  };
  writeCatalogSource(siteRoot, sourceData, { mode: sourceData.mode });
}

function assertShowExists(shows, showId) {
  const show = findShowRecord(shows, showId);

  if (!show) {
    throw new Error(`Unknown show "${showId}".`);
  }

  return show;
}

async function validateSiteData(siteRoot) {
  await buildCatalog(siteRoot);
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  await loadArchiveContext(siteRoot, catalog, collections);

  const gateBErrors = getGateBCriticalValidationErrors(catalog, collections);
  if (gateBErrors.length > 0) {
    throw new Error(`Gate B validation failed:\n- ${gateBErrors.join("\n- ")}`);
  }
}

function hasDetailedLength(show) {
  return Boolean(show?.length && typeof show.length === "object" && Object.keys(show.length).length > 1);
}

function hasAnyListenLink(show) {
  return Object.values(show?.listenLinks || {}).some(Boolean);
}

function assertPublishableReview(reviewRecord) {
  if (!hasRichReviewContent(reviewRecord)) {
    throw new Error("Review companion file must include a non-empty archiveTake and spoilerFreeReview before publishing.");
  }
}

module.exports = {
  assertPublishableReview,
  assertShowExists,
  createReviewPayloadFromShow,
  findShowRecord,
  getReviewFileStatus,
  hasAnyListenLink,
  hasDetailedLength,
  readShowsFile,
  resolveSiteRoot,
  todayStamp,
  validateSiteData,
  writeReviewFile,
  writeShowsFile,
};
