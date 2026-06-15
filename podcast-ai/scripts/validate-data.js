const path = require("node:path");

const { loadArchiveContext } = require("../lib/archive-context");
const { loadCatalog, loadCollections } = require("../lib/catalog");

const siteRoot = path.resolve(__dirname, "../..");

async function main() {
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  const archiveContext = await loadArchiveContext(siteRoot, catalog, collections);

  console.log(`Validated ${catalog.length} shows and ${collections.length} collections.`);
  console.log(`Optional datasets: ${archiveContext.creators.length} creators, ${archiveContext.networks.length} networks, ${archiveContext.changelog.length} changelog entries.`);
  console.log(`Feature availability: ${JSON.stringify(archiveContext.featureAvailability)}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
