const { createImportContext } = require("./import-helpers");

async function main() {
  const context = createImportContext();
  try {
    const result = await context.service.auditCatalog({ actor: "cli" });
    console.log(`Queued ${result.candidateIds.length} safe catalog refresh candidates in run ${result.runId}.`);
    console.log("Published catalog records were not changed.");
  } finally {
    context.service.stop?.();
    context.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
