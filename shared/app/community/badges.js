import { syncInlineScoreGroup } from "../render-cards.js";
import { loadCommunitySummaries } from "./api.js";
import { formatCommunityBadgeAriaLabel, formatCommunityBadgeText } from "./formatters.js";

function formatListenerReviewScoreText(summary) {
  const averageRating = Number(summary?.averageRating);
  const reviewCount = Number(summary?.reviewCount);
  return Number.isFinite(averageRating) && averageRating >= 0 && averageRating <= 10 && Number.isInteger(reviewCount) && reviewCount > 0
    ? `${averageRating.toFixed(1)}/10`
    : "";
}

function formatListenerReviewScoreAriaLabel(summary) {
  const reviewCount = Number(summary?.reviewCount);
  const text = formatListenerReviewScoreText(summary);
  if (!Number.isInteger(reviewCount) || reviewCount < 1 || !text) {
    return "No listener reviews yet.";
  }
  return `Listener Review Score ${text} from ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}.`;
}

async function syncListenerReviewCardScores(container, shows) {
  const scores = Array.from(container.querySelectorAll(".listener-review-inline-score"));
  scores.forEach((score) => {
    const value = score.querySelector(".listener-review-inline-score-value");
    if (value) value.textContent = "";
    score.hidden = true;
    score.setAttribute("aria-label", "Listener review score");
  });

  const ids = Array.from(new Set((Array.isArray(shows) ? shows : []).map((show) => show?.id).filter(Boolean)));
  if (scores.length === 0 || ids.length === 0) return;

  try {
    const query = new URLSearchParams({ showIds: ids.join(",") });
    const response = await fetch(`/api/reviews/scores/summary?${query.toString()}`);
    if (!response.ok) throw new Error(`Listener review score request failed with ${response.status}`);
    const payload = await response.json();
    const summaries = payload?.summaries || {};
    scores.forEach((score) => {
      const summary = summaries[score.dataset.podcastId || ""];
      const value = score.querySelector(".listener-review-inline-score-value");
      const text = formatListenerReviewScoreText(summary);
      if (value) value.textContent = text;
      score.hidden = !text;
      score.setAttribute("aria-label", formatListenerReviewScoreAriaLabel(summary));
    });
  } catch (_error) {
    scores.forEach((score) => {
      score.hidden = true;
      score.setAttribute("aria-label", "Listener review score unavailable.");
    });
  }
}

export async function syncCommunityCardBadges(container, shows) {
  if (!container) {
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  container.dataset.communityRequestId = requestId;
  void syncListenerReviewCardScores(container, shows);

  const badges = Array.from(container.querySelectorAll(".community-inline-score"));
  badges.forEach((badge) => {
    const value = badge.querySelector(".community-inline-score-value");
    if (value) {
      value.textContent = "";
    }
    badge.hidden = true;
    badge.setAttribute("aria-label", "Community rating");
  });
  container.querySelectorAll(".rating, .home-card-preview-ratings, .popular-card-ratings").forEach((group) => {
    syncInlineScoreGroup(group);
  });

  const ids = shows.map((show) => show.id);
  if (ids.length === 0) {
    return;
  }

  try {
    const summaries = await loadCommunitySummaries(ids);
    if (container.dataset.communityRequestId !== requestId) {
      return;
    }

    badges.forEach((badge) => {
      const summary = summaries[badge.dataset.podcastId || ""];
      const text = formatCommunityBadgeText(summary);
      const value = badge.querySelector(".community-inline-score-value");
      if (value) {
        value.textContent = text;
      }
      badge.setAttribute("aria-label", formatCommunityBadgeAriaLabel(summary));
      badge.hidden = !text;
    });
    container.querySelectorAll(".rating, .home-card-preview-ratings, .popular-card-ratings").forEach((group) => {
      syncInlineScoreGroup(group);
    });
  } catch (_error) {
    if (container.dataset.communityRequestId !== requestId) {
      return;
    }

    badges.forEach((badge) => {
      const value = badge.querySelector(".community-inline-score-value");
      if (value) {
        value.textContent = "";
      }
      badge.hidden = true;
      badge.setAttribute("aria-label", "Community rating unavailable.");
    });
    container.querySelectorAll(".rating, .home-card-preview-ratings, .popular-card-ratings").forEach((group) => {
      syncInlineScoreGroup(group);
    });
  }
}
