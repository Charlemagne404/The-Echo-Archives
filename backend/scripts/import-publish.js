const { createImportContext } = require("./import-helpers");

async function main() {
  const args = process.argv.slice(2);
  const candidateId = String(args[0] || "").trim();
  const tierIndex = args.indexOf("--tier");
  const publicationTier = tierIndex >= 0 ? String(args[tierIndex + 1] || "").trim() : "";
  if (!candidateId || !["imported", "indexed-only"].includes(publicationTier)) {
    throw new Error("Usage: npm run import:publish -- <candidate-id> --tier <imported|indexed-only>");
  }

  const context = createImportContext();
  try {
    const result = await context.service.publishForMaintainer(candidateId, "cli", publicationTier);
    console.log(`Published ${result.showId} as ${publicationTier} from import candidate ${result.candidate.id}.`);
  } finally {
    context.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
