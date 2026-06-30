const {
  assertShowExists,
  createReviewPayloadFromShow,
  getReviewFileStatus,
  readShowsFile,
  resolveSiteRoot,
  todayStamp,
  writeReviewFile,
  writeShowsFile,
} = require("./review-helpers");

function main() {
  const showId = String(process.argv[2] || "").trim();
  if (!showId) {
    throw new Error("Usage: npm run review:new -- <show-id>");
  }

  const siteRoot = resolveSiteRoot();
  const shows = readShowsFile(siteRoot);
  const show = assertShowExists(shows, showId);
  const reviewFile = getReviewFileStatus(siteRoot, showId);

  if (reviewFile.exists) {
    throw new Error(`Review companion file already exists for "${showId}".`);
  }

  writeReviewFile(siteRoot, showId, createReviewPayloadFromShow(show));

  if (show.reviewStatus === "indexed-only") {
    show.reviewStatus = "planned";
  }
  show.updatedAt = todayStamp();

  writeShowsFile(siteRoot, shows);
  console.log(`Created ${reviewFile.path} and updated ${showId} for review drafting.`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
