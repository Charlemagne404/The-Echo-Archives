const fs = require("node:fs");
const path = require("node:path");

const { loadEntities } = require("../backend/lib/entities");
const { resolveShowEntities } = require("../shared/archive-entities");
const { normalizeCollectionRecord, normalizeShowRecord } = require("../shared/archive-record");
const { readCatalogSource } = require("./lib/catalog-source");
const {
  buildCollectionCandidateReport,
  formatCollectionCandidateReport,
} = require("./lib/collection-candidate-report");

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function loadInputs(siteRoot) {
  const sourceData = readCatalogSource(siteRoot);
  const entities = loadEntities(siteRoot, sourceData.shows);
  const shows = sourceData.shows
    .filter((show) => show && show.status === "published")
    .map((record) => {
      const show = normalizeShowRecord(record);
      const resolvedEntities = resolveShowEntities(show, entities);
      return resolvedEntities.length ? { ...show, resolvedEntities } : show;
    });
  const collections = sourceData.collections.map(normalizeCollectionRecord);
  const sourceDirectory = sourceData.mode === "split" ? "catalog-src" : "data";

  return {
    shows,
    collections,
    entities,
    sourceSummary: {
      shows: `${sourceDirectory}/${sourceData.mode === "split" ? "shows" : "shows.json"}`,
      collections: `${sourceDirectory}/${sourceData.mode === "split" ? "collections" : "collections.json"}`,
      entities: fs.existsSync(path.join(siteRoot, "catalog-src", "entities.json"))
        ? "catalog-src/entities.json"
        : fs.existsSync(path.join(siteRoot, "data", "entities.json")) ? "data/entities.json" : "none",
    },
  };
}

function parseArguments(argv) {
  const options = { json: false, candidateLimit: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--limit" || argument.startsWith("--limit=")) {
      const rawValue = argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) : argv[index + 1];
      const value = Number(rawValue);
      if (!Number.isInteger(value) || value < 1) throw new Error("--limit must be a positive integer.");
      options.candidateLimit = value;
      if (!argument.includes("=")) index += 1;
      continue;
    }
    throw new Error(`Unknown argument "${argument}". Use --json or --limit N.`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const siteRoot = resolveSiteRoot();
  const options = parseArguments(argv);
  const inputs = loadInputs(siteRoot);
  const report = buildCollectionCandidateReport(inputs, options);
  process.stdout.write(options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatCollectionCandidateReport(report)}\n`);
  return report;
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
