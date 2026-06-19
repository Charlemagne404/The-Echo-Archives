import { createSubmissionHref } from "../urls.js";
import { clearCommunityRating, ensureCommunityProfile, fetchRatingSummaries, submitCommunityRating } from "./api.js";
import {
  EMPTY_COMMUNITY_SCORE_TEXT,
  formatDetailCommunitySummary,
  getDetailCommunityMetricCount,
  getDetailCommunityMetricValue,
} from "./formatters.js";

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
