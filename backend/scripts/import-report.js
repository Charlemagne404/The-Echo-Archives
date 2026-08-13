const { createImportContext } = require("./import-helpers");

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

function summarizeCounts(counts = {}) {
  return Object.entries(counts)
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}

function main() {
  const context = createImportContext();

  try {
    const report = context.service.buildReport({});
    console.log("Import queue report");
    console.log(`Total candidates: ${report.total}`);
    console.log(`By status: ${summarizeCounts(report.counts.status)}`);
    console.log(`By scope: ${summarizeCounts(report.counts.scopeStatus)}`);
    console.log(`By source: ${summarizeCounts(report.counts.sourceType)}`);
    console.log(`Duplicate state: ${summarizeCounts(report.counts.duplicateState)}`);

    printSection(
      "Ready for Imported publication",
      report.items.filter((candidate) => candidate.status === "ready" && candidate.readiness?.publicationEligibility?.imported?.eligible),
      (candidate) => `${candidate.id} :: ${candidate.title || candidate.seedQuery}`,
    );

    printSection(
      "Ready for indexed-only publication",
      report.items.filter((candidate) => candidate.status === "ready" && candidate.readiness?.publicationEligibility?.indexedOnly?.eligible),
      (candidate) => `${candidate.id} :: ${candidate.title || candidate.seedQuery} [facts revision ${candidate.factsReviewedRevision}/${candidate.inputRevision}]`,
    );

    printSection(
      "Candidates needing review or recovery",
      report.items.filter((candidate) => ["needs-review", "failed"].includes(candidate.status)),
      (candidate) => `${candidate.id} :: ${candidate.title || candidate.seedQuery} [${candidate.status}] ${(candidate.readiness?.blockers || []).map((blocker) => blocker.code).join(", ")}`,
    );

    printSection(
      "Candidates with duplicate matches",
      report.items.filter((candidate) => candidate.hasDuplicateMatch),
      (candidate) => `${candidate.id} :: ${candidate.title || candidate.seedQuery}`,
    );
  } finally {
    context.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
