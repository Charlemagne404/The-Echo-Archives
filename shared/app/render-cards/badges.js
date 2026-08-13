import { TOP_RATED_BADGE_ASSET_URL } from "../constants.js";
import { configureImageElement } from "../images.js";
import { normalizeArchiveRating } from "../utils.js";

function createEditorialBadges(show) {
  const badges = document.createElement("div");
  badges.className = "editorial-badges";
  badges.setAttribute("aria-hidden", "true");

  const archiveRating = normalizeArchiveRating(show.finalRating);
  if (archiveRating !== null && archiveRating >= 9) {
    const topRatedBadge = document.createElement("span");
    topRatedBadge.className = "editorial-badge editorial-badge-corner";
    const topRatedArtwork = document.createElement("img");
    topRatedArtwork.className = "editorial-badge-artwork";
    topRatedArtwork.src = TOP_RATED_BADGE_ASSET_URL;
    topRatedArtwork.alt = "";
    configureImageElement(topRatedArtwork, {
      loading: "lazy",
      width: 128,
      height: 128,
      fallbackSrc: TOP_RATED_BADGE_ASSET_URL,
    });
    topRatedBadge.appendChild(topRatedArtwork);
    badges.appendChild(topRatedBadge);
  }

  if (show.reviewStatus === "full-review") {
    const fullReviewBadge = document.createElement("span");
    fullReviewBadge.className = "editorial-badge editorial-badge-ribbon";
    const fullReviewLabel = document.createElement("span");
    fullReviewLabel.className = "editorial-badge-ribbon-label";
    fullReviewLabel.textContent = "Full review";
    fullReviewBadge.appendChild(fullReviewLabel);
    badges.appendChild(fullReviewBadge);
  }

  if (show.reviewStatus === "imported") {
    const importedBadge = document.createElement("span");
    importedBadge.className = "editorial-badge editorial-badge-imported";
    importedBadge.textContent = "Imported";
    badges.appendChild(importedBadge);
  }

  return badges;
}

export { createEditorialBadges };
