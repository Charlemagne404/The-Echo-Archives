import { syncInlineScoreGroup } from "../render-cards.js";
import { dataCache } from "../constants.js";
import { loadCommunitySummaries } from "./api.js";
import { formatCommunityBadgeAriaLabel, formatCommunityBadgeText } from "./formatters.js";

const EMPTY_CARD_SCORE_TEXT = "--/10";
const LISTENER_REVIEW_SUMMARY_BATCH_SIZE = 100;

function formatCommunityCardScoreText(summary) {
  const text = formatCommunityBadgeText(summary);
  return text && text !== "Pending" ? text : EMPTY_CARD_SCORE_TEXT;
}

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

async function fetchListenerReviewSummaryBatch(showIds) {
  const query = new URLSearchParams({ showIds: showIds.join(",") });
  const response = await fetch(`/api/reviews/scores/summary?${query.toString()}`, {
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Listener review score request failed with ${response.status}`);
  return response.json();
}

async function loadListenerReviewSummaries(showIds) {
  const ids = Array.from(new Set((Array.isArray(showIds) ? showIds : []).filter(Boolean)));
  const missingIds = ids.filter(
    (id) => !dataCache.listenerReviewSummaries.has(id) && !dataCache.listenerReviewSummaryRequests.has(id),
  );

  for (let index = 0; index < missingIds.length; index += LISTENER_REVIEW_SUMMARY_BATCH_SIZE) {
    const batchIds = missingIds.slice(index, index + LISTENER_REVIEW_SUMMARY_BATCH_SIZE);
    const request = fetchListenerReviewSummaryBatch(batchIds)
      .then((payload) => {
        const summaries = payload?.summaries || {};
        batchIds.forEach((id) => {
          dataCache.listenerReviewSummaries.set(id, Object.hasOwn(summaries, id) ? summaries[id] : null);
        });
      })
      .finally(() => {
        batchIds.forEach((id) => {
          if (dataCache.listenerReviewSummaryRequests.get(id) === request) {
            dataCache.listenerReviewSummaryRequests.delete(id);
          }
        });
      });

    batchIds.forEach((id) => dataCache.listenerReviewSummaryRequests.set(id, request));
  }

  const pendingRequests = Array.from(
    new Set(ids.map((id) => dataCache.listenerReviewSummaryRequests.get(id)).filter(Boolean)),
  );
  await Promise.all(pendingRequests);

  return ids.reduce((result, id) => {
    result[id] = dataCache.listenerReviewSummaries.get(id) || null;
    return result;
  }, {});
}

async function syncListenerReviewCardScores(container, shows) {
  const scores = Array.from(container.querySelectorAll(".listener-review-inline-score"));
  scores.forEach((score) => {
    const value = score.querySelector(".listener-review-inline-score-value");
    if (value) value.textContent = EMPTY_CARD_SCORE_TEXT;
    score.hidden = false;
    score.setAttribute("aria-label", "Listener Review Score --/10. No published listener reviews yet.");
  });

  const ids = Array.from(new Set((Array.isArray(shows) ? shows : []).map((show) => show?.id).filter(Boolean)));
  if (scores.length === 0 || ids.length === 0) return;

  try {
    const summaries = await loadListenerReviewSummaries(ids);
    scores.forEach((score) => {
      const summary = summaries[score.dataset.podcastId || ""];
      const value = score.querySelector(".listener-review-inline-score-value");
      const text = formatListenerReviewScoreText(summary);
      if (value) value.textContent = text || EMPTY_CARD_SCORE_TEXT;
      score.hidden = false;
      score.setAttribute("aria-label", formatListenerReviewScoreAriaLabel(summary));
    });
  } catch (_error) {
    scores.forEach((score) => {
      const value = score.querySelector(".listener-review-inline-score-value");
      if (value) value.textContent = EMPTY_CARD_SCORE_TEXT;
      score.hidden = false;
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
      value.textContent = EMPTY_CARD_SCORE_TEXT;
    }
    badge.hidden = false;
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
      const text = formatCommunityCardScoreText(summary);
      const value = badge.querySelector(".community-inline-score-value");
      if (value) {
        value.textContent = text;
      }
      badge.setAttribute("aria-label", formatCommunityBadgeAriaLabel(summary));
      badge.hidden = false;
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
        value.textContent = EMPTY_CARD_SCORE_TEXT;
      }
      badge.hidden = false;
      badge.setAttribute("aria-label", "Community rating unavailable.");
    });
    container.querySelectorAll(".rating, .home-card-preview-ratings, .popular-card-ratings").forEach((group) => {
      syncInlineScoreGroup(group);
    });
  }
}
