const path = require("node:path");

const { buildGeneratedSimilarityCollections } = require("../backend/lib/shows-like-routes");
const { normalizeCollectionRecord, normalizeShowRecord } = require("../shared/archive-record");
const { readCatalogSource } = require("./lib/catalog-source");
const {
  buildCollectionCatalogueAudit,
  formatCollectionCatalogueAudit,
} = require("./lib/collection-catalogue-audit");

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function parseArguments(argv) {
  const options = { json: false, check: false };
  argv.forEach((argument) => {
    if (argument === "--json") options.json = true;
    else if (argument === "--check") options.check = true;
    else throw new Error("Unknown argument. Use --json and/or --check.");
  });
  return options;
}

function loadInputs(siteRoot) {
  const sourceData = readCatalogSource(siteRoot);
  const shows = sourceData.shows
    .filter((show) => show && show.status === "published")
    .map(normalizeShowRecord);
  const authoredCollections = sourceData.collections.map(normalizeCollectionRecord);
  const generatedCollections = buildGeneratedSimilarityCollections({
    shows,
    collections: authoredCollections,
  }).map(normalizeCollectionRecord);
  return {
    shows,
    collections: [...authoredCollections, ...generatedCollections],
    sourceCollectionCount: authoredCollections.length,
    generatedCollectionCount: generatedCollections.length,
    generatedCollectionIds: generatedCollections.map((collection) => collection.id),
    sourceSummary: {
      mode: sourceData.mode,
      shows: sourceData.shows.length,
      authoredCollections: authoredCollections.length,
      generatedCollections: generatedCollections.length,
      publicCollections: authoredCollections.length + generatedCollections.length,
    },
  };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const inputs = loadInputs(resolveSiteRoot());
  const report = buildCollectionCatalogueAudit({
    shows: inputs.shows,
    collections: inputs.collections,
    sourceCollectionCount: inputs.sourceCollectionCount,
    generatedCollectionCount: inputs.generatedCollectionCount,
    generatedCollectionIds: inputs.generatedCollectionIds,
  });
  report.source = inputs.sourceSummary;
  process.stdout.write(options.json
    ? JSON.stringify(report, null, 2) + "\n"
    : formatCollectionCatalogueAudit(report) + "\n");
  if (options.check && !report.membershipQuality.valid) process.exitCode = 1;
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
