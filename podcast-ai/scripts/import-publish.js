const { createImportContext } = require("./import-helpers");

async function main() {
  const candidateId = String(process.argv[2] || "").trim();
  if (!candidateId) {
    throw new Error("Usage: npm run import:publish -- <candidate-id>");
  }

  const context = createImportContext();
  try {
    const result = await context.service.publishForMaintainer(candidateId, "cli");
    console.log(`Published ${result.showId} from import candidate ${result.candidate.id}.`);
  } finally {
    context.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
