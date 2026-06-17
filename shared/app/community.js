import {
  COMMUNITY_PROFILE_HEADER,
  COMMUNITY_PROFILE_KEY,
  communityState,
  dataCache,
} from "./constants.js";
import { createSubmissionHref } from "./urls.js";
import { syncInlineScoreGroup } from "./render-cards.js";

const EMPTY_COMMUNITY_SCORE_TEXT = "--/10";

export async function initializeDetailRatingPage(show) {
  const detailRoot = document.querySelector(".podcast-detail");
  if (!detailRoot || !show?.id) {
    return;
  }

  const widget = mountDetailRatingWidget(detailRoot, {
    podcastId: show.id,
    title: show.title,
  });

  try {
    const profileId = await ensureCommunityProfile();
    const summaries = await fetchRatingSummaries([show.id], profileId);
    syncDetailRatingWidget(widget, summaries[show.id]);
  } catch (_error) {
    setCommunityWidgetUnavailable(widget);
  }
}

function mountDetailRatingWidget(detailRoot, podcast) {
  const section = document.createElement("section");
  section.className = "detail-side-card community-review-panel";
  section.dataset.podcastId = podcast.podcastId;

  const kicker = document.createElement("p");
  kicker.className = "community-review-kicker";
  kicker.textContent = "Listener rating";

  const title = document.createElement("h2");
  title.textContent = "Community voice";

  const metricRow = document.createElement("div");
  metricRow.className = "community-review-metric";

  const metricValue = document.createElement("strong");
  metricValue.className = "community-review-metric-value";
  metricValue.textContent = EMPTY_COMMUNITY_SCORE_TEXT;

  const metricCount = document.createElement("span");
  metricCount.className = "community-review-metric-count";
  metricCount.textContent = "No ratings yet";

  metricRow.append(metricValue, metricCount);

  const summary = document.createElement("p");
  summary.className = "community-review-summary";
  summary.textContent = formatDetailCommunitySummary(null);

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "community-review-toggle";
  toggleButton.setAttribute("aria-expanded", "false");

  const reviewLink = document.createElement("a");
  reviewLink.className = "community-review-link";
  reviewLink.href = createSubmissionHref("listener-review", podcast.podcastId);
  reviewLink.textContent = "Submit a listener review";

  const actions = document.createElement("div");
  actions.className = "community-review-actions";

  const buttons = document.createElement("div");
  buttons.className = "community-review-buttons";

  const distribution = document.createElement("div");
  distribution.className = "community-review-distribution";

  const body = document.createElement("div");
  body.className = "community-review-body";
  body.hidden = true;

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "community-review-clear";
  clearButton.textContent = "Clear your rating";
  clearButton.hidden = true;

  const ratingButtons = [];
  const widget = {
    root: section,
    summary,
    clearButton,
    ratingButtons,
    distribution,
    metricValue,
    metricCount,
    toggleButton,
    reviewLink,
    body,
    heroValue: detailRoot.querySelector("[data-community-hero-rating]"),
    heroCount: detailRoot.querySelector("[data-community-hero-count]"),
  };

  toggleButton.addEventListener("click", () => {
    setDetailWidgetExpanded(widget, widget.body.hidden);
  });

  for (let rating = 1; rating <= 10; rating += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "community-review-button";
    button.textContent = String(rating);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", async () => {
      setDetailWidgetBusy(widget, true);
      try {
        const result = await submitCommunityRating(podcast.podcastId, rating);
        syncDetailRatingWidget(widget, result.summary);
      } catch (_error) {
        widget.summary.textContent = "Saving your rating failed.";
      } finally {
        setDetailWidgetBusy(widget, false);
      }
    });
    ratingButtons.push(button);
    buttons.appendChild(button);
  }

  clearButton.addEventListener("click", async () => {
    setDetailWidgetBusy(widget, true);
    try {
      const result = await clearCommunityRating(podcast.podcastId);
      syncDetailRatingWidget(widget, result.summary);
    } catch (_error) {
      widget.summary.textContent = "Removing your rating failed.";
    } finally {
      setDetailWidgetBusy(widget, false);
    }
  });

  for (let rating = 10; rating >= 1; rating -= 1) {
    const row = document.createElement("div");
    row.className = "community-distribution-row";
    row.dataset.ratingValue = String(rating);

    const label = document.createElement("span");
    label.className = "community-distribution-label";
    label.textContent = `${rating}`;

    const bar = document.createElement("div");
    bar.className = "community-distribution-bar";

    const fill = document.createElement("div");
    fill.className = "community-distribution-fill";
    bar.appendChild(fill);

    const count = document.createElement("span");
    count.className = "community-distribution-count";
    count.textContent = "0";

    row.append(label, bar, count);
    distribution.appendChild(row);
  }

  actions.append(toggleButton, reviewLink);
  body.append(buttons, clearButton, distribution);
  section.append(kicker, title, metricRow, summary, actions, body);

  const communitySlot = detailRoot.querySelector(".detail-community-slot");
  if (communitySlot) {
    communitySlot.replaceWith(section);
  } else {
    detailRoot.appendChild(section);
  }

  updateDetailWidgetToggleLabel(widget);
  return widget;
}

function syncDetailRatingWidget(widget, summary) {
  if (!widget) {
    return;
  }

  widget.summary.textContent = formatDetailCommunitySummary(summary);
  widget.metricValue.textContent = getDetailCommunityMetricValue(summary);
  widget.metricCount.textContent = getDetailCommunityMetricCount(summary);
  widget.clearButton.hidden = !summary?.myRating;

  widget.ratingButtons.forEach((button, index) => {
    const rating = index + 1;
    const isActive = summary?.myRating === rating;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const distributionValues = Object.values(summary?.distribution || {});
  const maxCount = distributionValues.length > 0 ? Math.max(...distributionValues) : 0;

  widget.distribution.querySelectorAll(".community-distribution-row").forEach((row) => {
    const rating = row.dataset.ratingValue || "";
    const count = summary?.distribution?.[rating] || 0;
    const fill = row.querySelector(".community-distribution-fill");
    const countNode = row.querySelector(".community-distribution-count");

    if (fill) {
      fill.style.width = `${maxCount > 0 ? (count / maxCount) * 100 : 0}%`;
    }

    if (countNode) {
      countNode.textContent = String(count);
    }
  });

  syncHeroCommunityMetric(widget, summary);
  updateDetailWidgetToggleLabel(widget, summary);
}

function setDetailWidgetBusy(widget, isBusy) {
  widget.ratingButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  widget.clearButton.disabled = isBusy;
  widget.toggleButton.disabled = isBusy;
}

function setDetailWidgetExpanded(widget, isExpanded) {
  widget.body.hidden = !isExpanded;
  widget.root.classList.toggle("is-expanded", isExpanded);
  widget.toggleButton.setAttribute("aria-expanded", String(isExpanded));
  updateDetailWidgetToggleLabel(widget);
}

function updateDetailWidgetToggleLabel(widget, summary = null) {
  if (widget.body.hidden) {
    const hasRating = Boolean(summary?.myRating);
    widget.toggleButton.textContent = hasRating ? "Update your rating" : "Rate this show";
    return;
  }

  widget.toggleButton.textContent = "Hide rating controls";
}

function formatDetailCommunitySummary(summary) {
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return "No community ratings yet. Listener scores stay separate from the archive rating and only appear once people actually rate the show.";
  }

  const noun = summary.ratingCount === 1 ? "rating" : "ratings";
  const yourRating = summary.myRating ? ` Your rating: ${summary.myRating}/10.` : "";
  return `Community average ${summary.averageRating.toFixed(1)}/10 from ${summary.ratingCount} ${noun}.${yourRating}`;
}

function getDetailCommunityMetricValue(summary) {
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return EMPTY_COMMUNITY_SCORE_TEXT;
  }

  return `${summary.averageRating.toFixed(1)}/10`;
}

function getDetailCommunityMetricCount(summary) {
  if (!summary || summary.ratingCount === 0) {
    return "No ratings yet";
  }

  return `${summary.ratingCount} ${summary.ratingCount === 1 ? "rating" : "ratings"}`;
}

function syncHeroCommunityMetric(widget, summary) {
  if (widget.heroValue) {
    widget.heroValue.textContent = getDetailCommunityMetricValue(summary);
  }

  if (widget.heroCount) {
    widget.heroCount.textContent = getDetailCommunityMetricCount(summary);
  }
}

function setCommunityWidgetUnavailable(widget) {
  widget.summary.textContent = "Community ratings are offline right now.";
  widget.metricValue.textContent = EMPTY_COMMUNITY_SCORE_TEXT;
  widget.metricCount.textContent = "Offline";
  widget.toggleButton.disabled = true;
  widget.body.hidden = true;
  widget.toggleButton.setAttribute("aria-expanded", "false");
  widget.toggleButton.textContent = "Ratings offline";
  if (widget.heroValue) {
    widget.heroValue.textContent = EMPTY_COMMUNITY_SCORE_TEXT;
  }
  if (widget.heroCount) {
    widget.heroCount.textContent = "Offline";
  }
}

async function ensureCommunityProfile() {
  if (communityState.profileId) {
    return communityState.profileId;
  }

  if (!communityState.profilePromise) {
    communityState.profilePromise = (async () => {
      try {
        const existingProfileId = window.localStorage.getItem(COMMUNITY_PROFILE_KEY);
        const response = await fetch("/api/community/profiles/anonymous", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ existingProfileId }),
        });

        if (!response.ok) {
          throw new Error(`Profile bootstrap failed with ${response.status}`);
        }

        const result = await response.json();
        communityState.profileId = result.profileId;
        window.localStorage.setItem(COMMUNITY_PROFILE_KEY, result.profileId);
        return result.profileId;
      } catch (error) {
        communityState.profilePromise = null;
        throw error;
      }
    })();
  }

  return communityState.profilePromise;
}

async function fetchRatingSummaries(podcastIds, profileId) {
  const query = new URLSearchParams();
  query.set("podcastIds", podcastIds.join(","));

  const response = await fetch(`/api/community/ratings/summary?${query.toString()}`, {
    headers: profileId
      ? {
          [COMMUNITY_PROFILE_HEADER]: profileId,
        }
      : {},
  });

  if (!response.ok) {
    throw new Error(`Summary request failed with ${response.status}`);
  }

  const result = await response.json();
  return result.summaries || {};
}

async function submitCommunityRating(podcastId, rating) {
  const profileId = await ensureCommunityProfile();
  const response = await fetch(`/api/community/podcasts/${encodeURIComponent(podcastId)}/rating`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      [COMMUNITY_PROFILE_HEADER]: profileId,
    },
    body: JSON.stringify({ rating }),
  });

  if (!response.ok) {
    throw new Error(`Rating request failed with ${response.status}`);
  }

  return response.json();
}

async function clearCommunityRating(podcastId) {
  const profileId = await ensureCommunityProfile();
  const response = await fetch(`/api/community/podcasts/${encodeURIComponent(podcastId)}/rating`, {
    method: "DELETE",
    headers: {
      [COMMUNITY_PROFILE_HEADER]: profileId,
    },
  });

  if (!response.ok) {
    throw new Error(`Rating removal failed with ${response.status}`);
  }

  return response.json();
}

async function loadCommunitySummaries(podcastIds) {
  const ids = Array.from(new Set((Array.isArray(podcastIds) ? podcastIds : []).filter(Boolean)));
  const missingIds = ids.filter((id) => !dataCache.communitySummaries.has(id));

  if (missingIds.length > 0) {
    const summaries = await fetchRatingSummaries(missingIds, null);
    Object.entries(summaries).forEach(([id, summary]) => {
      dataCache.communitySummaries.set(id, summary);
    });
  }

  return ids.reduce((result, id) => {
    result[id] = dataCache.communitySummaries.get(id) || null;
    return result;
  }, {});
}

function formatCommunityBadgeText(summary) {
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return EMPTY_COMMUNITY_SCORE_TEXT;
  }

  return `${summary.averageRating.toFixed(1)}/10`;
}

function formatCommunityBadgeAriaLabel(summary) {
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return "Community score --/10. No ratings yet.";
  }

  const noun = summary.ratingCount === 1 ? "rating" : "ratings";
  return `Community score ${summary.averageRating.toFixed(1)}/10 from ${summary.ratingCount} ${noun}.`;
}

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
