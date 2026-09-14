const fs = require("node:fs");
const path = require("node:path");

const { readCatalogSource, readJsonFile } = require("./lib/catalog-source");
const {
  buildDiscoveryQualityReport,
  formatDiscoveryQualityReport,
} = require("./lib/discovery-quality-report");

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function readArrayIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const value = readJsonFile(filePath);
  if (!Array.isArray(value)) throw new Error(`${path.relative(process.cwd(), filePath)} must contain an array.`);
  return value;
}

function readTaxonomy(siteRoot) {
  const sourcePath = path.join(siteRoot, "catalog-src", "tag-taxonomy.json");
  const generatedPath = path.join(siteRoot, "data", "tag-taxonomy.json");
  const filePath = fs.existsSync(sourcePath) ? sourcePath : generatedPath;
  return fs.existsSync(filePath) ? readJsonFile(filePath) : { tags: [] };
}

function loadInputs(siteRoot) {
  const sourceData = readCatalogSource(siteRoot);
  const generatedShowsPath = path.join(siteRoot, "data", "shows.json");
  const generatedCollectionsPath = path.join(siteRoot, "data", "collections.json");
  const sourceEntitiesPath = path.join(siteRoot, "catalog-src", "entities.json");
  const generatedEntitiesPath = path.join(siteRoot, "data", "entities.json");
  const generatedShows = readArrayIfPresent(generatedShowsPath);
  const generatedCollections = readArrayIfPresent(generatedCollectionsPath);
  const generatedEntities = readArrayIfPresent(generatedEntitiesPath);
  const entities = fs.existsSync(sourceEntitiesPath) ? readJsonFile(sourceEntitiesPath) : generatedEntities || [];

  if (!Array.isArray(entities)) throw new Error("Entity registry must contain an array.");

  return {
    data: {
      shows: generatedShows || sourceData.shows,
      collections: generatedCollections || sourceData.collections,
      entities,
      taxonomy: readTaxonomy(siteRoot),
    },
    summary: {
      shows: generatedShows ? "data/shows.json" : sourceData.mode === "split" ? "catalog-src/shows" : "data/shows.json",
      collections: generatedCollections ? "data/collections.json" : sourceData.mode === "split" ? "catalog-src/collections" : "data/collections.json",
      entities: fs.existsSync(sourceEntitiesPath) ? "catalog-src/entities.json" : "data/entities.json",
    },
  };
}

function parseArguments(argv) {
  const options = { json: false, sampleLimit: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--limit") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) throw new Error("--limit must be a positive integer.");
      options.sampleLimit = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument "${argument}". Use --json or --limit N.`);
  }
  return options;
}

function main() {
  const siteRoot = resolveSiteRoot();
  const options = parseArguments(process.argv.slice(2));
  const inputs = loadInputs(siteRoot);
  const report = buildDiscoveryQualityReport(inputs.data, {
    sampleLimit: options.sampleLimit,
    inputSummary: inputs.summary,
  });

  process.stdout.write(options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatDiscoveryQualityReport(report)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
