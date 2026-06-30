const { loadCatalog, loadCollections } = require("../lib/catalog");
const { buildDiscoveryGapReport } = require("../lib/discovery-gaps");
const { resolveSiteRoot } = require("./review-helpers");

function printSection(title, entries, formatter) {
  console.log(`\n${title} (${entries.length})`);

  if (entries.length === 0) {
    console.log("- none");
    return;
  }

  entries.forEach((entry) => {
    console.log(`- ${formatter(entry)}`);
  });
}

async function main() {
  const siteRoot = resolveSiteRoot();
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  const report = buildDiscoveryGapReport(catalog, collections);

  console.log("Discovery gap report");
  console.log(`Published shows: ${report.summary.publishedShowCount}`);
  console.log(`Full reviews: ${report.summary.fullReviewCount}`);
  console.log(`Shows like X routes: ${report.summary.routeCollectionCount}`);

  printSection(
    "Published shows with fewer than 2 similar links",
    report.publishedShowsWithTooFewSimilarLinks,
    (show) => `${show.id} (${show.title}) -> ${show.count}`,
  );
  printSection(
    "Anchor shows missing similarReasons",
    report.anchorShowsMissingSimilarReasons,
    (show) => `${show.id} (${show.title || "missing"}) -> ${show.missingFor.join(", ")}`,
  );
  printSection(
    "Published shows missing tone, format, or bestFor",
    report.publishedShowsMissingDiscoveryFields,
    (show) => `${show.id} (${show.title}) -> ${show.missing.join(", ")}`,
  );
  printSection(
    "Shows like X collections missing showReasons",
    report.routeCollectionsMissingShowReasons,
    (collection) => `${collection.id} (${collection.title}) -> ${collection.missingFor.join(", ")}`,
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
