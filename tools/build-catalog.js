const path = require("node:path");

const { loadArchiveContext } = require("../backend/lib/ai/archive-context");
const { loadCatalog, loadCollections } = require("../backend/lib/catalog");
const { buildDiscoveryGapReport, getGateBCriticalValidationErrors } = require("../backend/lib/discovery-gaps");
const { generateCoverVariants } = require("../backend/lib/responsive-images");
const { writeCatalogArtifacts } = require("./lib/catalog-artifacts");
const { ensureSplitCatalogSource, readCatalogSource } = require("./lib/catalog-source");
const { getDiscoveryTaxonomy } = require("../shared/archive-tags");

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

async function buildCatalog(siteRoot = resolveSiteRoot()) {
  ensureSplitCatalogSource(siteRoot);

  const catalog = await loadCatalog(siteRoot);
  const sourceData = readCatalogSource(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)), { sourceData });
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
    reviewsById: sourceData.reviewsById,
    gapReport,
    archiveContext,
    tagTaxonomy: getDiscoveryTaxonomy(),
  });

  return {
    artifacts,
    archiveContext,
    catalog,
    collections,
    gapReport,
  };
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
