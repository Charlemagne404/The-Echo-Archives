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
      "Candidates needing draft or publish follow-through",
      report.items.filter((candidate) => ["hydrated", "needs-review", "drafted"].includes(candidate.status)),
      (candidate) => `${candidate.id} :: ${candidate.title || candidate.seedQuery} [${candidate.status}]`,
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
