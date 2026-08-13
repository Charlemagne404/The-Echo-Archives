const { createImportContext } = require("./import-helpers");

async function main() {
  const args = process.argv.slice(2);
  const candidateId = String(args[0] || "").trim();
  const reviewerIndex = args.indexOf("--reviewer");
  const reviewer = reviewerIndex >= 0 ? String(args[reviewerIndex + 1] || "").trim() : "";
  if (!candidateId || !reviewer) {
    throw new Error("Usage: npm run import:promote -- <candidate-id> --reviewer <maintainer-name>");
  }

  const context = createImportContext();
  try {
    context.service.markFactsReviewedForMaintainer(candidateId, reviewer);
    const result = await context.service.promoteForMaintainer(candidateId, reviewer);
    console.log(`Confirmed factual review and promoted ${result.showId} to indexed-only.`);
  } finally {
    context.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
