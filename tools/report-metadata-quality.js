const fs = require("node:fs");
const path = require("node:path");

const { getDiscoveryTaxonomy } = require("../shared/archive-tags");
const { readCatalogSource, readJsonFile } = require("./lib/catalog-source");
const {
  DEFAULT_SAMPLE_LIMIT,
  buildMetadataQualityReport,
  formatMetadataQualityReport,
} = require("./lib/metadata-quality-report");

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function parseArguments(argv) {
  const options = {
    json: false,
    includeDrafts: false,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--all") {
      options.includeDrafts = true;
      continue;
    }
    if (argument === "--limit" || argument.startsWith("--limit=")) {
      const raw = argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) : argv[++index];
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1) throw new Error("--limit must be a positive integer.");
      options.sampleLimit = value;
      continue;
    }
    throw new Error("Unknown argument. Use --json, --all, or --limit N.");
  }

  return options;
}

function loadInputs(siteRoot) {
  const sourceData = readCatalogSource(siteRoot);
  const entitiesPath = path.join(siteRoot, "catalog-src", "entities.json");
  const taxonomyPath = path.join(siteRoot, "catalog-src", "tag-taxonomy.json");
  const entities = fs.existsSync(entitiesPath) ? readJsonFile(entitiesPath) : [];
  const taxonomy = fs.existsSync(taxonomyPath) ? readJsonFile(taxonomyPath) : getDiscoveryTaxonomy();

  if (!Array.isArray(entities)) throw new Error("catalog-src/entities.json must contain an array.");

  return {
    shows: sourceData.shows,
    collections: sourceData.collections,
    entities,
    taxonomy,
    siteRoot,
    inputSummary: {
      shows: sourceData.mode === "split" ? "catalog-src/shows" : "data/shows.json",
      collections: sourceData.mode === "split" ? "catalog-src/collections" : "data/collections.json",
      entities: fs.existsSync(entitiesPath) ? "catalog-src/entities.json" : "data/entities.json",
      taxonomy: fs.existsSync(taxonomyPath) ? "catalog-src/tag-taxonomy.json" : "data/tag-taxonomy.json",
      reviews: Object.keys(sourceData.reviewsById || {}).length,
    },
  };
}

function main() {
  const siteRoot = resolveSiteRoot();
  const options = parseArguments(process.argv.slice(2));
  const inputs = loadInputs(siteRoot);
  const report = buildMetadataQualityReport(inputs, options);

  process.stdout.write(options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatMetadataQualityReport(report, { sampleLimit: options.sampleLimit })}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  loadInputs,
  main,
  parseArguments,
  resolveSiteRoot,
};
