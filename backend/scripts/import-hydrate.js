const { createImportContext } = require("./import-helpers");

async function main() {
  const ids = process.argv.slice(2).map((value) => String(value || "").trim()).filter(Boolean);
  const context = createImportContext();

  try {
    const targetIds = ids.length > 0
      ? ids
      : context.service
          .listForMaintainer({ page: 1, pageSize: 50 })
          .items
          .filter((candidate) => ["queued", "failed", "needs-review"].includes(candidate.status))
          .map((candidate) => candidate.id);

    if (targetIds.length === 0) {
      throw new Error("No import candidates found to hydrate.");
    }

    for (const candidateId of targetIds) {
      const candidate = await context.service.hydrateForMaintainer(candidateId, "cli");
      console.log(`Prepared ${candidate.id} :: ${candidate.title || candidate.seedQuery} [${candidate.status}]`);
    }
  } finally {
    context.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
