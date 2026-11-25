const fs = require("node:fs");
const path = require("node:path");
const { readReviewRecord } = require("../lib/reviews");
const { readCatalogSource, writeCatalogSource } = require("../../tools/lib/catalog-source");
const {
  assertPublishableReview,
  assertShowExists,
  resolveSiteRoot,
  todayStamp,
  validateSiteData,
} = require("./review-helpers");

async function main() {
  const showId = String(process.argv[2] || "").trim();
  if (!showId) {
    throw new Error("Usage: npm run review:publish -- <show-id>");
  }

  const siteRoot = resolveSiteRoot();
  const sourceData = readCatalogSource(siteRoot);
  const shows = sourceData.shows;
  const show = assertShowExists(shows, showId);
  const reviewRecord = readReviewRecord(siteRoot, showId);

  if (!reviewRecord) {
    throw new Error(`Review companion file is required before publishing "${showId}".`);
  }

  assertPublishableReview(reviewRecord);

  const previousReviewStatus = show.reviewStatus;
  const previousUpdatedAt = show.updatedAt;
  const previousReviewRecord = sourceData.reviewsById[showId];
  const publishedAt = todayStamp();
  show.reviewStatus = "full-review";
  show.updatedAt = publishedAt;
  sourceData.reviewsById[showId] = { ...previousReviewRecord, publishedAt };
  writeCatalogSource(siteRoot, sourceData, { mode: sourceData.mode });

  try {
    await validateSiteData(siteRoot, { recoverCovers: true });
  } catch (error) {
    show.reviewStatus = previousReviewStatus;
    show.updatedAt = previousUpdatedAt;
    if (previousReviewRecord) sourceData.reviewsById[showId] = previousReviewRecord;
    else delete sourceData.reviewsById[showId];
    const rollbackMode = fs.existsSync(path.join(siteRoot, "catalog-src"))
      ? "split"
      : sourceData.mode;
    writeCatalogSource(siteRoot, sourceData, { mode: rollbackMode });
    throw error;
  }

  console.log(`Published full review for "${showId}".`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
