const { createImportContext } = require("./import-helpers");

async function main() {
  const force = process.argv.includes("--all");
  const context = createImportContext();
  try {
    const scheduled = await context.service.runDueDiscovery({
      force,
      actor: "scheduled-discovery",
    });
    if (scheduled.runIds.length === 0) {
      console.log("No discovery sources are due.");
      return;
    }

    const runs = [];
    for (const runId of scheduled.runIds) {
      runs.push(await context.service.waitForDiscoveryRun(runId, 120_000));
    }

    for (let index = 0; index < 32; index += 1) {
      const result = await context.service.processPendingJobs({ limit: 4 });
      if (result.claimed === 0) break;
    }

    const found = runs.reduce((total, run) => total + (Number(run.summary?.found) || 0), 0);
    const candidates = runs.reduce((total, run) => total + (run.summary?.candidateIds?.length || 0), 0);
    console.log(`Discovery completed for ${runs.length} source(s): ${found} results scanned, ${candidates} candidates queued.`);
  } finally {
    context.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
