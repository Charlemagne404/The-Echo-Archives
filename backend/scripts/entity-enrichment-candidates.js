const path = require("node:path");

const { loadEntities } = require("../lib/entities");
const { buildEntityEnrichmentCandidates, candidatesToCsv } = require("../lib/entity-enrichment-candidates");
const { readCatalogSource } = require("../../tools/lib/catalog-source");

function resolveSiteRoot() {
  return path.resolve(__dirname, "../..");
}

function getLimit(args) {
  const inline = args.find((argument) => argument.startsWith("--limit="));
  const separateIndex = args.indexOf("--limit");
  const raw = inline ? inline.slice("--limit=".length) : separateIndex >= 0 ? args[separateIndex + 1] : "";
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 20;
}

function loadReport(siteRoot, options = {}) {
  const sourceData = readCatalogSource(siteRoot);
  const entities = loadEntities(siteRoot, sourceData.shows);
  return buildEntityEnrichmentCandidates(sourceData.shows, entities, {
    showStatuses: options.includeAll ? null : ["published"],
    entityPublications: options.includeAll ? null : ["public"],
    unlinkedOnly: !options.includeLinked,
  });
}

function formatTarget(target) {
  if (target.kind === "existing-entity") return `${target.name} [${target.entityId}]`;
  return `${target.name} (new entity may be needed)`;
}

function printHumanReport(report, limit) {
  const { summary } = report;
  console.log("Entity enrichment candidates");
  console.log("Scope: authored source only; no external lookups; no relationships or entities are written.");
  console.log(`Shows: ${summary.unlinkedShowCount} unlinked in scope of ${summary.showCount}`);
  console.log(`Relationship candidates: ${summary.relationshipCandidateCount} across ${summary.candidateShowCount} shows`);
  console.log(`Supporting credit leads without a safe public role: ${summary.creditLeadCount}`);
  console.log(`Existing-entity candidates: ${summary.existingEntityCandidateCount}`);
  console.log(`New-entity candidates: ${summary.newEntityCandidateCount}`);
  console.log(`Compound core evidence: ${summary.compoundEvidenceShowCount} shows / ${summary.compoundEvidenceCount} values; review batches: ${summary.compoundBatchCount}`);
  console.log("");

  console.log(`Manual enrichment batches (${Math.min(limit, report.batches.length)} of ${report.batches.length}):`);
  report.batches.slice(0, limit).forEach((batch) => {
    console.log(`- ${formatTarget(batch.target)} — ${batch.showCount} show${batch.showCount === 1 ? "" : "s"}; ${batch.relationshipCandidateCount} relationship candidate${batch.relationshipCandidateCount === 1 ? "" : "s"}; ${batch.confidence} confidence`);
    console.log(`  Fields: ${batch.sourceFields.join(", ")}`);
    console.log(`  Shows: ${batch.showTitles.map(({ id, title }) => `${id} — ${title}`).join(" | ")}`);
  });
  if (report.batches.length > limit) console.log(`  ... ${report.batches.length - limit} more; use --json or --csv for the complete queue.`);
  console.log("");

  console.log(`Compound review queue (${Math.min(limit, report.compoundReviews.length)} of ${report.compoundReviews.length}):`);
  report.compoundReviews.slice(0, limit).forEach((review) => {
    const matches = review.matchedEntities.length ? review.matchedEntities.map((entity) => `${entity.name} [${entity.entityId}]`).join("; ") : "no existing entity match; new entity may be needed";
    console.log(`- ${review.show.id} — ${review.show.title}`);
    console.log(`  Evidence: ${review.evidence.map((entry) => `${entry.field}=${entry.value}`).join(" | ")}`);
    console.log(`  Existing matches: ${matches}`);
    console.log(`  Possible components for manual split: ${review.possibleComponents.map((component) => component.name).join("; ") || "none"}`);
  });
  if (report.compoundReviews.length > limit) console.log(`  ... ${report.compoundReviews.length - limit} more; use --json for the complete compound queue.`);
  console.log("");
  console.log("Use --include-linked to inspect partially connected shows, --all to include draft source records, --json for exact evidence, or --csv for a flat batching sheet.");
}

function main() {
  const args = process.argv.slice(2);
  const report = loadReport(resolveSiteRoot(), {
    includeAll: args.includes("--all"),
    includeLinked: args.includes("--include-linked"),
  });

  if (args.includes("--csv")) {
    console.log(candidatesToCsv(report.candidates));
    return report;
  }
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  printHumanReport(report, getLimit(args));
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
  getLimit,
  loadReport,
  main,
  printHumanReport,
  resolveSiteRoot,
};
