const { createImportContext } = require("./import-helpers");

async function main() {
  const candidateId = String(process.argv[2] || "").trim();
  if (!candidateId) {
    throw new Error("Usage: npm run import:draft -- <candidate-id>");
  }

  const context = createImportContext();
  try {
    const result = await context.service.draftForMaintainer(candidateId, "cli");
    console.log(`Drafted ${result.showId} from import candidate ${result.candidate.id}.`);
  } finally {
    context.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
