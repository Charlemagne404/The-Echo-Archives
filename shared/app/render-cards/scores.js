import { formatRating, normalizeArchiveRating } from "../utils.js";

export function createArchiveScoreElement(show, { showLabel = true, treatZeroAsUnrated = false } = {}) {
  const numericRating = normalizeArchiveRating(show?.finalRating);
  const archiveScore = treatZeroAsUnrated && numericRating === 0 ? null : numericRating;
  const archiveValue = archiveScore === null ? "Unrated" : `${formatRating(archiveScore)}/10`;
  const archiveRating = document.createElement("div");
  archiveRating.className = "archive-inline-score";
  archiveRating.innerHTML = `
    <span class="inline-score-topline">
      <span class="inline-score-icon archive-score-icon" aria-hidden="true">★</span>
      <span class="inline-score-value">${archiveValue}</span>
    </span>
    ${showLabel ? '<span class="inline-score-label">Archive Rating</span>' : ""}
  `;
  return archiveRating;
}

function getListenerReviewScore(show) {
  const summary = show?.listenerReviewScore;
  const reviewCount = Number(summary?.reviewCount);
  const averageRating = Number(summary?.averageRating);
  const hasReviews = Number.isInteger(reviewCount) && reviewCount > 0;
  return {
    reviewCount: hasReviews ? reviewCount : 0,
    averageRating: hasReviews && Number.isFinite(averageRating) && averageRating >= 0 && averageRating <= 10 ? averageRating : null,
  };
}

function formatListenerReviewScoreAriaLabel({ averageRating, reviewCount }) {
  if (averageRating === null || reviewCount === 0) {
    return "Listener Review Score --/10. No published listener reviews yet.";
  }
  return `Listener Review Score ${averageRating.toFixed(1)}/10 from ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}.`;
}

export function createListenerReviewScoreElement(show, { showLabel = true } = {}) {
  const summary = getListenerReviewScore(show);
  const score = document.createElement("div");
  score.className = "listener-review-inline-score";
  score.dataset.podcastId = show.id || "";
  score.setAttribute("aria-label", formatListenerReviewScoreAriaLabel(summary));
  score.innerHTML = `
    <span class="inline-score-topline">
      <svg class="listener-review-score-icon" viewBox="0 0 28 24" aria-hidden="true" focusable="false">
        <path d="M5.5 3.25h17a3.25 3.25 0 0 1 3.25 3.25v9.25A3.25 3.25 0 0 1 22.5 19H13l-5 3 .9-3H5.5a3.25 3.25 0 0 1-3.25-3.25V6.5A3.25 3.25 0 0 1 5.5 3.25Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.75"/>
        <path d="m14 5.7 1.75 3.55 3.93.57-2.85 2.78.67 3.92L14 14.68l-3.5 1.84.67-3.92-2.85-2.78 3.93-.57L14 5.7Z" fill="currentColor"/>
      </svg>
      <span class="listener-review-inline-score-value">${summary.averageRating === null ? "--/10" : `${summary.averageRating.toFixed(1)}/10`}</span>
    </span>
    ${showLabel ? '<span class="inline-score-label">Listener Review Score</span>' : ""}
  `;
  return score;
}

export function createPrimaryScoreElement(show, options = {}) {
  const archiveRating = normalizeArchiveRating(show?.finalRating);
  if (archiveRating !== null && !(options.treatZeroAsUnrated && archiveRating === 0)) {
    return createArchiveScoreElement(show, options);
  }
  return createListenerReviewScoreElement(show, options);
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
  const primaryScore = group.querySelector(".archive-inline-score, .listener-review-inline-score");
  const communityScore = group.querySelector(".community-inline-score");
  if (!divider || !primaryScore) {
    return;
  }

  divider.hidden = !communityScore || communityScore.hidden;
}
