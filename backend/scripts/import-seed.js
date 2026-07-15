const { createImportContext, parseSeedEntries, readSeedInput } = require("./import-helpers");

async function main() {
  const input = await readSeedInput(process.argv.slice(2));
  const entries = parseSeedEntries(input);
  if (entries.length === 0) {
    throw new Error("Usage: npm run import:seed -- <file|newline-separated entries>");
  }

  const context = createImportContext();
  try {
    const result = await context.service.seedCandidates({ entries, actor: "cli" });
    await context.service.processPendingJobs();
    await context.service.waitForRun(result.runId);
    const candidates = result.candidateIds.map((id) => context.service.getForMaintainer(id));
    console.log(`Prepared ${candidates.length} import candidates in run ${result.runId}.`);
    candidates.forEach((candidate) => {
      console.log(`- ${candidate.id} :: ${candidate.title || candidate.seedQuery} [${candidate.primarySourceType || "title"}]`);
    });
  } finally {
    context.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
