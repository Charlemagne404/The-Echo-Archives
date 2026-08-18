const path = require("node:path");

const { loadArchiveContext } = require("../backend/lib/ai/archive-context");
const { loadCatalog, loadCollections } = require("../backend/lib/catalog");
const { buildDiscoveryGapReport } = require("../backend/lib/discovery-gaps");
const { getDiscoveryTaxonomy } = require("../shared/archive-tags");
const { applyGeneratedCoverVariants } = require("../backend/lib/responsive-images");
const {
  buildCatalogSnapshot,
  buildCatalogStatusMarkdown,
  createSearchIndexRecord,
  serializeRuntimeShow,
} = require("./lib/catalog-artifacts");
const {
  GENERATED_STATUS_PATH,
  RUNTIME_DATA_DIR,
  SEARCH_INDEX_PATH,
  ensureSplitCatalogSource,
  readCatalogSource,
  readGeneratedFileText,
  readJsonFile,
} = require("./lib/catalog-source");

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function hasJsonDrift(filePath, expectedValue) {
  try {
    const actual = readJsonFile(filePath);
    return JSON.stringify(actual) !== JSON.stringify(expectedValue);
  } catch (_error) {
    return true;
  }
}

async function main() {
  const siteRoot = resolveSiteRoot();
  ensureSplitCatalogSource(siteRoot);

  const catalog = await loadCatalog(siteRoot);
  applyGeneratedCoverVariants(siteRoot, catalog);
  const sourceData = readCatalogSource(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)), { sourceData });
  const archiveContext = await loadArchiveContext(siteRoot, catalog, collections);
  const gapReport = buildDiscoveryGapReport(catalog, collections);
  const snapshot = buildCatalogSnapshot(
    catalog,
    collections,
    Object.keys(sourceData.reviewsById).length,
    gapReport,
    archiveContext,
    sourceData.reviewsById,
    getDiscoveryTaxonomy(),
  );
  const statusMarkdown = buildCatalogStatusMarkdown(snapshot);
  const runtimeCatalog = catalog.filter((show) => show.status === "published").map(serializeRuntimeShow);
  const runtimeSearchIndex = catalog.filter((show) => show.status === "published").map(createSearchIndexRecord);

  const drift = {
    shows: hasJsonDrift(path.join(siteRoot, RUNTIME_DATA_DIR, "shows.json"), runtimeCatalog),
    collections: hasJsonDrift(path.join(siteRoot, RUNTIME_DATA_DIR, "collections.json"), collections),
    searchIndex: hasJsonDrift(path.join(siteRoot, SEARCH_INDEX_PATH), runtimeSearchIndex),
    statusDoc: readGeneratedFileText(path.join(siteRoot, GENERATED_STATUS_PATH)).trim() !== statusMarkdown.trim(),
  };

  console.log(`Published shows: ${snapshot.metrics.publishedShows}`);
  console.log(`Draft shows: ${snapshot.metrics.draftShows}`);
  console.log(`Collections: ${snapshot.metrics.collections}`);
  console.log(`Review companions: ${snapshot.metrics.reviewCompanions}`);
  console.log(`Missing similarReasons: ${gapReport.publishedShowsMissingSimilarReasons.length}`);
  console.log(`Shows with weak collection coverage: ${gapReport.publishedShowsWithTooFewCollectionMemberships.length}`);
  console.log(`Missing RSS links: ${snapshot.metrics.publishedShows - snapshot.metrics.withRss}`);
  console.log(`Phase 2 / Gate B: ${snapshot.phase2.complete ? "complete" : "content-pending"}`);
  console.log(`Phase 2 blocking errors: ${snapshot.phase2.blockingErrors.length}`);
  console.log(`Phase 2 actionable RSS gaps: ${snapshot.phase2.factual.actionableMissingRss.length}`);
  console.log(`Phase 2 documented research-gap records: ${snapshot.phase2.factual.documentedResearchGaps.length}`);
  console.log(`Phase 2 editorial gaps: ${snapshot.phase2.editorial.gaps.length}`);
  console.log(`Phase 2 taxonomy unknown/non-approved tags: ${snapshot.phase2.taxonomy.unknownTags.length + snapshot.phase2.taxonomy.nonApprovedTags.length}`);
  if (snapshot.phase2.blockingErrors.length > 0) {
    snapshot.phase2.blockingErrors.forEach((error) => console.log(`Phase 2 BLOCKER: ${error}`));
  }
  console.log(
    `Generated output drift: shows=${drift.shows ? "stale" : "ok"}, collections=${drift.collections ? "stale" : "ok"}, search-index=${drift.searchIndex ? "stale" : "ok"}, catalog-status=${drift.statusDoc ? "stale" : "ok"}`,
  );
  if (snapshot.phase2.blockingErrors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
