const { loadCatalog } = require("../lib/catalog");
const { getReviewFileStatus, hasAnyListenLink, hasDetailedLength, resolveSiteRoot } = require("./review-helpers");

function formatBoolean(value) {
  return value ? "yes" : "no";
}

async function main() {
  const siteRoot = resolveSiteRoot();
  const catalog = (await loadCatalog(siteRoot)).filter((show) => show.status === "published");
  const headers = [
    "id",
    "title",
    "reviewStatus",
    "hasReviewFile",
    "hasArchiveTake",
    "hasSpoilerFreeReview",
    "hasAnyListenLink",
    "hasDetailedLength",
    "updatedAt",
  ];

  console.log(headers.join("\t"));

  catalog.forEach((show) => {
    const reviewFile = getReviewFileStatus(siteRoot, show.id);
    const row = [
      show.id,
      show.title,
      show.reviewStatus,
      formatBoolean(reviewFile.exists),
      formatBoolean(Boolean(String(show.archiveTake || "").trim())),
      formatBoolean(Array.isArray(show.spoilerFreeReviewParagraphs) && show.spoilerFreeReviewParagraphs.length > 0),
      formatBoolean(hasAnyListenLink(show)),
      formatBoolean(hasDetailedLength(show)),
      String(show.updatedAt || ""),
    ];

    console.log(row.join("\t"));
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
