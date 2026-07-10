import { formatRating } from "../utils.js";

export function createArchiveScoreElement(show, { showLabel = true, treatZeroAsUnrated = false } = {}) {
  const rawRating = show?.finalRating;
  const numericRating =
    rawRating === null || rawRating === undefined || (typeof rawRating === "string" && !rawRating.trim())
      ? null
      : Number(rawRating);
  const archiveScore =
    Number.isFinite(numericRating) &&
    numericRating >= 0 &&
    numericRating <= 10 &&
    (!treatZeroAsUnrated || numericRating > 0)
      ? numericRating
      : null;
  const archiveRating = document.createElement("div");
  archiveRating.className = "archive-inline-score";
  archiveRating.innerHTML = `
    <span class="inline-score-topline">
      <span class="inline-score-icon archive-score-icon" aria-hidden="true">★</span>
      <span class="inline-score-value">${formatRating(archiveScore)}/10</span>
    </span>
    ${showLabel ? '<span class="inline-score-label">Archive Rating</span>' : ""}
  `;
  return archiveRating;
}

export function createCommunityScoreElement(show, { showLabel = true } = {}) {
  const communityBadge = document.createElement("div");
  communityBadge.className = "community-inline-score";
  communityBadge.dataset.podcastId = show.id;
  communityBadge.hidden = false;
  communityBadge.setAttribute("aria-label", "Community score --/10. No ratings yet.");
  communityBadge.innerHTML = `
    <span class="inline-score-topline">
      <svg viewBox="0 0 28 24" aria-hidden="true" focusable="false">
        <rect x="1.5" y="9" width="2.5" height="6" rx="1.25" />
        <rect x="5.75" y="6.5" width="2.5" height="11" rx="1.25" />
        <rect x="10" y="2.75" width="2.5" height="18.5" rx="1.25" />
        <rect x="14.25" y="7.75" width="2.5" height="8.5" rx="1.25" />
        <rect x="18.5" y="1.5" width="2.5" height="21" rx="1.25" />
        <rect x="22.75" y="6.5" width="2.5" height="11" rx="1.25" />
      </svg>
      <span class="community-inline-score-value">--/10</span>
    </span>
    ${showLabel ? '<span class="inline-score-label">Community Rating</span>' : ""}
  `;
  return communityBadge;
}

export function createRatingDividerElement() {
  const ratingDivider = document.createElement("span");
  ratingDivider.className = "rating-divider";
  ratingDivider.setAttribute("aria-hidden", "true");
  return ratingDivider;
}

export function syncInlineScoreGroup(group) {
  if (!group) {
    return;
  }

  const divider = group.querySelector(".rating-divider");
  const archiveScore = group.querySelector(".archive-inline-score");
  const communityScore = group.querySelector(".community-inline-score");
  if (!divider || !archiveScore) {
    return;
  }

  divider.hidden = !communityScore || communityScore.hidden;
}
