const path = require("node:path");
const { beginCatalogPublication } = require("./lib/catalog-publication-transaction");

const { loadArchiveContext } = require("../backend/lib/ai/archive-context");
const { loadCatalog, loadCollections, syncCatalogCovers } = require("../backend/lib/catalog");
const { assertCatalogIntegrity } = require("../backend/lib/catalog-integrity");
const { buildDiscoveryGapReport, getGateBCriticalValidationErrors } = require("../backend/lib/discovery-gaps");
const { generateCoverVariants } = require("../backend/lib/responsive-images");
const { writeCatalogArtifacts } = require("./lib/catalog-artifacts");
const { ensureSplitCatalogSource, readCatalogSource } = require("./lib/catalog-source");
const { getDiscoveryTaxonomy } = require("../shared/archive-tags");

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

async function buildCatalog(siteRoot = resolveSiteRoot(), options = {}) {
  // This is the explicit maintenance boundary: migrate legacy source layout,
  // optionally recover covers, and generate runtime catalogue artifacts.
  const sourceData = readCatalogSource(siteRoot);
  assertCatalogIntegrity(siteRoot, { sourceData });
  ensureSplitCatalogSource(siteRoot);
  const publication = beginCatalogPublication(siteRoot, () => Object.keys(readCatalogSource(siteRoot).reviewsById)
    .map((id) => path.join(siteRoot, "data/reviews", `${id}.json`)), { includeGenerated: true, includeSource: true, joinExisting: true });
  try {
  if (options.recoverCovers !== false) {
    await syncCatalogCovers(siteRoot);
  }
  const catalog = await loadCatalog(siteRoot);
  const generatedSourceData = readCatalogSource(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)), { sourceData: generatedSourceData });
  const archiveContext = await loadArchiveContext(siteRoot, catalog, collections);
  const gapReport = buildDiscoveryGapReport(catalog, collections);
  const gateBErrors = getGateBCriticalValidationErrors(catalog, collections);

  if (gateBErrors.length > 0) {
    throw new Error(`Gate B validation failed:\n- ${gateBErrors.join("\n- ")}`);
  }

  await generateCoverVariants(siteRoot, catalog);

  const artifacts = writeCatalogArtifacts(siteRoot, {
    catalog,
    collections,
    reviewsById: generatedSourceData.reviewsById,
    gapReport,
    archiveContext,
    tagTaxonomy: getDiscoveryTaxonomy(),
  });

  publication.commit();
  return {
    artifacts,
    archiveContext,
    catalog,
    collections,
    gapReport,
  };
  } catch (error) {
    publication.rollback();
    throw error;
  }
}

async function main() {
  const siteRoot = resolveSiteRoot();
  const { catalog, collections, artifacts } = await buildCatalog(siteRoot);

  console.log(
    `Built catalog artifacts for ${catalog.length} shows, ${collections.length} collections, and ${artifacts.snapshot.metrics.reviewCompanions} review companions.`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildCatalog,
  resolveSiteRoot,
};
