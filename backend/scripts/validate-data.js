const path = require("node:path");

const { loadArchiveContext } = require("../lib/ai/archive-context");
const { loadCatalog, loadCollections } = require("../lib/catalog");
const { assertCatalogIntegrity } = require("../lib/catalog-integrity");
const { getGateBCriticalValidationErrors } = require("../lib/discovery-gaps");

const siteRoot = path.resolve(__dirname, "../..");

async function main() {
  const integrity = assertCatalogIntegrity(siteRoot);
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  const archiveContext = await loadArchiveContext(siteRoot, catalog, collections);
  const gateBErrors = getGateBCriticalValidationErrors(catalog, collections);

  if (gateBErrors.length > 0) {
    throw new Error(`Gate B validation failed:\n- ${gateBErrors.join("\n- ")}`);
  }

  console.log(`Validated ${catalog.length} shows and ${collections.length} collections.`);
  console.log(`Content integrity: ${integrity.errors.length} errors across ${integrity.stats.shows} shows, ${integrity.stats.collections} collections, ${integrity.stats.entities} entities, and ${integrity.stats.reviews} review companions.`);
  if (integrity.warnings.length > 0) {
    console.log(`Content integrity warnings:\n- ${integrity.warnings.join("\n- ")}`);
  }
  console.log(`Curated entities: ${archiveContext.entities.length}; linked published shows: ${catalog.filter((show) => show.status === "published" && show.resolvedEntities?.length).length}.`);
  console.log(`Legacy optional datasets: ${archiveContext.creators.length} creators, ${archiveContext.networks.length} networks, ${archiveContext.changelog.length} changelog entries.`);
  console.log(`Feature availability: ${JSON.stringify(archiveContext.featureAvailability)}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
