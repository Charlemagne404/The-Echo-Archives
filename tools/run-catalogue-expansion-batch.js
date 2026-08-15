const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const backendRoot = path.join(root, "backend");
const progressPath = path.join(root, "docs", "catalogue-expansion", "import-progress.csv");

function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function rowsFromCsv(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const headers = Object.fromEntries(rows[0].map((value, index) => [value, index]));
  return rows.slice(1).map((row) => Object.fromEntries(Object.entries(headers).map(([key, index]) => [key, row[index] || ""])));
}

async function main() {
  const batchNumber = Number(process.argv[2] || 1);
  const batchSize = Number(process.argv[3] || 25);
  const priority = String(process.argv[4] || "P1").toUpperCase();
  if (!Number.isInteger(batchNumber) || batchNumber < 1 || !Number.isInteger(batchSize) || batchSize < 1 || !["P0", "P1"].includes(priority)) {
    throw new Error("Usage: node tools/run-catalogue-expansion-batch.js <batch-number> [batch-size] [P0|P1]");
  }

  process.chdir(backendRoot);
  const { createImportContext } = require("../backend/scripts/import-helpers");
  const progressRows = rowsFromCsv(progressPath);
  const targets = progressRows
    .filter((row) => row.priority === priority && row.current_outcome === "unattempted")
    .slice(0, batchSize);
  if (targets.length === 0) {
    console.log(JSON.stringify({ batchNumber, targets: [], message: "No unattempted P1 rows remain." }, null, 2));
    return;
  }

  const actor = `catalogue-expansion-${priority.toLowerCase()}-batch-${String(batchNumber).padStart(3, "0")}`;
  const searchResults = targets.map((row) => ({
    sourceType: "backlog",
      sourceKey: `catalogue-expansion:${priority.toLowerCase()}:${row.backlog_row}`,
    sourceUrl: "",
    title: row.title,
    creatorName: row.creator,
    seedQuery: row.title,
    objective: {
      title: row.title,
      creatorName: row.creator,
      objectiveSources: [`backlog:master-backlog.csv#${row.backlog_row}`],
    },
  }));

  const context = createImportContext();
  try {
    const seeded = await context.service.seedCandidates({ searchResults, actor });
    const run = await context.service.waitForRun(seeded.runId, 900_000);
    const candidates = seeded.candidateIds.map((id) => context.service.getForMaintainer(id));
    const publishIds = candidates
      .filter((candidate) => candidate.status === "ready" && candidate.readiness?.publicationEligibility?.imported?.eligible)
      .map((candidate) => candidate.id);
    let published = [];
    if (publishIds.length) {
      const result = await context.service.batchPublishForMaintainer(publishIds, actor, "imported");
      published = result.showIds || [];
    }
    const summary = candidates.map((candidate) => ({
      id: candidate.id,
      backlogRow: targets.find((row) => row.title === candidate.seedQuery)?.backlog_row || "",
      seed: candidate.seedQuery,
      title: candidate.title,
      status: candidate.status,
      importedEligible: Boolean(candidate.readiness?.publicationEligibility?.imported?.eligible),
      blockers: (candidate.readiness?.blockers || []).map((blocker) => blocker.code),
      lastError: candidate.lastError || "",
    }));
    console.log(JSON.stringify({
      batchNumber,
      priority,
      actor,
      targets: targets.map((row) => ({ row: row.backlog_row, title: row.title, creator: row.creator })),
      run: { id: run.id, status: run.status, progress: run.progress },
      published,
      counts: {
        ready: summary.filter((row) => row.status === "ready").length,
        needsReview: summary.filter((row) => row.status === "needs-review").length,
        failed: summary.filter((row) => row.status === "failed").length,
        importedEligible: summary.filter((row) => row.importedEligible).length,
      },
      summary,
    }, null, 2));
  } finally {
    context.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
