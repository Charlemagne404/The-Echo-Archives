import { syncInlineScoreGroup } from "../render-cards.js";
import { loadCommunitySummaries } from "./api.js";
import { EMPTY_COMMUNITY_SCORE_TEXT, formatCommunityBadgeAriaLabel, formatCommunityBadgeText } from "./formatters.js";

export async function syncCommunityCardBadges(container, shows) {
  if (!container) {
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  container.dataset.communityRequestId = requestId;

  const badges = Array.from(container.querySelectorAll(".community-inline-score"));
  badges.forEach((badge) => {
    const value = badge.querySelector(".community-inline-score-value");
    if (value) {
      value.textContent = EMPTY_COMMUNITY_SCORE_TEXT;
    }
    badge.hidden = false;
    badge.setAttribute("aria-label", "Community score --/10. No ratings yet.");
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
        value.textContent = EMPTY_COMMUNITY_SCORE_TEXT;
      }
      badge.hidden = false;
      badge.setAttribute("aria-label", "Community score --/10. No ratings yet.");
    });
    container.querySelectorAll(".rating, .home-card-preview-ratings, .popular-card-ratings").forEach((group) => {
      syncInlineScoreGroup(group);
    });
  }
}
