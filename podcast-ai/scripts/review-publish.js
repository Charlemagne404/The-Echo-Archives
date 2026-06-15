const { readReviewRecord } = require("../lib/reviews");
const {
  assertPublishableReview,
  assertShowExists,
  readShowsFile,
  resolveSiteRoot,
  todayStamp,
  validateSiteData,
  writeShowsFile,
} = require("./review-helpers");

async function main() {
  const showId = String(process.argv[2] || "").trim();
  if (!showId) {
    throw new Error("Usage: npm run review:publish -- <show-id>");
  }

  const siteRoot = resolveSiteRoot();
  const shows = readShowsFile(siteRoot);
  const show = assertShowExists(shows, showId);
  const reviewRecord = readReviewRecord(siteRoot, showId);

  if (!reviewRecord) {
    throw new Error(`Review companion file is required before publishing "${showId}".`);
  }

  assertPublishableReview(reviewRecord);

  const previousReviewStatus = show.reviewStatus;
  const previousUpdatedAt = show.updatedAt;
  show.reviewStatus = "full-review";
  show.updatedAt = todayStamp();
  writeShowsFile(siteRoot, shows);

  try {
    await validateSiteData(siteRoot);
  } catch (error) {
    show.reviewStatus = previousReviewStatus;
    show.updatedAt = previousUpdatedAt;
    writeShowsFile(siteRoot, shows);
    throw error;
  }

  console.log(`Published full review for "${showId}".`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
