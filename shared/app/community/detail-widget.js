import {
  clearCommunityRating,
  fetchCommunityConfig,
  fetchRatingSummaries,
  getExistingCommunityProfileId,
  submitCommunityRating,
} from "./api.js";
import {
  EMPTY_COMMUNITY_SCORE_TEXT,
  formatDetailCommunitySummary,
  getDetailCommunityMetricCount,
  getDetailCommunityMetricValue,
  normalizeCommunitySummary,
} from "./formatters.js";
import { configureRatingVerification, getRatingVerificationToken, resetRatingVerification } from "./turnstile.js";
import { playRatingConfirmation, prepareRollingTextNode, setRollingTextNodeContent } from "./detail-motion.js";

function buildCommunityWidgetId(podcastId, suffix) {
  return `community-${String(podcastId || "show").replace(/[^a-zA-Z0-9_-]+/g, "-")}-${suffix}`;
}

export async function initializeDetailRatingPage(show) {
  const detailRoot = document.querySelector(".podcast-detail");
  if (!detailRoot || !show?.id) {
    return;
  }

  const widget = mountDetailRatingWidget(detailRoot, { podcastId: show.id });
  const requestId = beginSummaryRequest(widget);

  try {
    const config = await fetchCommunityConfig();
    widget.writesEnabled = Boolean(config.ratings?.writeEnabled);
    widget.verificationPromise = widget.writesEnabled ? configureRatingVerification(widget) : Promise.resolve();
    const profileId = getExistingCommunityProfileId();
    const summaries = await fetchRatingSummaries([show.id], profileId);
    if (isActiveSummaryRequest(widget, requestId)) {
      syncDetailRatingWidget(widget, summaries[show.id]);
      if (!widget.writesEnabled) {
        setCommunityWidgetReadOnly(widget);
      }
    }
  } catch (_error) {
    if (isActiveSummaryRequest(widget, requestId)) {
      setCommunityWidgetUnavailable(widget);
    }
  }
}

function mountDetailRatingWidget(detailRoot, podcast) {
  const section = document.createElement("section");
  section.className = "detail-section community-review-panel";
  section.dataset.podcastId = podcast.podcastId;
  section.setAttribute("aria-labelledby", buildCommunityWidgetId(podcast.podcastId, "title"));

  const kicker = document.createElement("p");
  kicker.className = "community-review-kicker";
  kicker.textContent = "Community Rating";

  const title = document.createElement("h2");
  title.id = buildCommunityWidgetId(podcast.podcastId, "title");
  title.textContent = "Quick listener ratings";

  const heading = document.createElement("div");
  heading.className = "community-review-heading";
  heading.append(kicker, title);

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

  const buttons = document.createElement("div");
  buttons.className = "community-review-buttons";
  buttons.setAttribute("role", "group");
  buttons.setAttribute("aria-label", "Rate this show from 1 to 10");

  const distribution = document.createElement("div");
  distribution.className = "community-review-distribution";
  distribution.setAttribute("role", "list");
  distribution.setAttribute("aria-label", "Community rating distribution");

  const verification = document.createElement("div");
  verification.className = "community-turnstile-shell";
  verification.hidden = true;

  const verificationSlot = document.createElement("div");
  verificationSlot.className = "community-turnstile-slot";

  const verificationStatus = document.createElement("p");
  verificationStatus.className = "community-turnstile-status";
  verificationStatus.setAttribute("aria-live", "polite");

  verification.append(verificationSlot, verificationStatus);

  const body = document.createElement("div");
  body.className = "community-review-body";
  body.id = buildCommunityWidgetId(podcast.podcastId, "body");
  body.dataset.state = "open";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "community-review-clear";
  clearButton.textContent = "Clear your rating";
  clearButton.hidden = true;

  const ratingHint = document.createElement("p");
  ratingHint.className = "community-review-hint";
  ratingHint.textContent = "Choose a score to save it.";

  const utility = document.createElement("div");
  utility.className = "community-review-utility";
  utility.append(ratingHint, clearButton);

  const ratingButtons = [];
  const widget = {
    root: section,
    summary,
    clearButton,
    ratingHint,
    ratingButtons,
    distribution,
    metricValue,
    metricCount,
    body,
    verification,
    verificationSlot,
    verificationStatus,
    verificationPromise: Promise.resolve(),
    writesEnabled: false,
    turnstileEnabled: false,
    turnstileToken: "",
    turnstileWidgetId: null,
    lastSummary: null,
    summaryRequestId: 0,
    hasHydratedSummary: false,
  };

  prepareRollingTextNode(metricValue);
  prepareRollingTextNode(metricCount);

  for (let rating = 1; rating <= 10; rating += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "community-review-button";
    button.textContent = String(rating);
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `Rate ${rating} out of 10`);
    button.addEventListener("click", async () => {
      if (!widget.writesEnabled) {
        return;
      }

      const requestId = beginSummaryRequest(widget);
      setDetailWidgetBusy(widget, true);
      try {
        const turnstileToken = await getRatingVerificationToken(widget);
        const result = await submitCommunityRating(podcast.podcastId, rating, turnstileToken);
        if (isActiveSummaryRequest(widget, requestId)) {
          syncDetailRatingWidget(widget, result.summary);
          playRatingConfirmation(widget, rating);
        }
      } catch (_error) {
        if (isActiveSummaryRequest(widget, requestId)) {
          widget.summary.textContent = "Saving your rating failed.";
        }
      } finally {
        resetRatingVerification(widget);
        setDetailWidgetBusy(widget, false);
      }
    });
    ratingButtons.push(button);
    buttons.appendChild(button);
  }

  clearButton.addEventListener("click", async () => {
    if (!widget.writesEnabled) {
      return;
    }

    const requestId = beginSummaryRequest(widget);
    setDetailWidgetBusy(widget, true);
    try {
      const turnstileToken = await getRatingVerificationToken(widget);
      const result = await clearCommunityRating(podcast.podcastId, turnstileToken);
      if (isActiveSummaryRequest(widget, requestId)) {
        syncDetailRatingWidget(widget, result.summary);
      }
    } catch (_error) {
      if (isActiveSummaryRequest(widget, requestId)) {
        widget.summary.textContent = "Removing your rating failed.";
      }
    } finally {
      resetRatingVerification(widget);
      setDetailWidgetBusy(widget, false);
    }
  });

  for (let rating = 1; rating <= 10; rating += 1) {
    const row = document.createElement("div");
    row.className = "community-distribution-row";
    row.dataset.ratingValue = String(rating);
    row.setAttribute("role", "listitem");

    const label = document.createElement("span");
    label.className = "community-distribution-label";
    label.textContent = `${rating}`;

    const bar = document.createElement("div");
    bar.className = "community-distribution-bar";
    bar.setAttribute("aria-hidden", "true");

    const fill = document.createElement("div");
    fill.className = "community-distribution-fill";
    bar.appendChild(fill);

    const count = document.createElement("span");
    count.className = "community-distribution-count";
    count.textContent = "0";
    prepareRollingTextNode(count);

    row.append(label, bar, count);
    distribution.appendChild(row);
  }

  body.append(buttons, utility, distribution, verification);
  section.append(heading, metricRow, summary, body);

  const communitySlot = detailRoot.querySelector(".detail-community-slot");
  if (communitySlot) {
    communitySlot.replaceWith(section);
  } else {
    detailRoot.appendChild(section);
  }

  return widget;
}

function beginSummaryRequest(widget) { widget.summaryRequestId += 1; return widget.summaryRequestId; }
function isActiveSummaryRequest(widget, requestId) { return widget.summaryRequestId === requestId; }

function syncDetailRatingWidget(widget, summary) {
  if (!widget) {
    return;
  }

  summary = normalizeCommunitySummary(summary);
  widget.lastSummary = summary || null;
  const shouldAnimateMetrics = widget.hasHydratedSummary;

  widget.summary.textContent = formatDetailCommunitySummary(summary);
  setRollingTextNodeContent(widget.metricValue, getDetailCommunityMetricValue(summary), shouldAnimateMetrics);
  setRollingTextNodeContent(widget.metricCount, getDetailCommunityMetricCount(summary), shouldAnimateMetrics);
  widget.clearButton.hidden = !summary?.myRating;
  widget.ratingHint.hidden = Boolean(summary?.myRating);

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
    row.setAttribute("aria-label", `${rating} out of 10: ${count} ${count === 1 ? "rating" : "ratings"}`);

    if (fill) {
      fill.style.width = `${maxCount > 0 ? (count / maxCount) * 100 : 0}%`;
    }

    if (countNode) {
      setRollingTextNodeContent(countNode, String(count), shouldAnimateMetrics);
    }
  });

  widget.hasHydratedSummary = true;
}

function setDetailWidgetBusy(widget, isBusy) {
  widget.ratingButtons.forEach((button) => { button.disabled = isBusy; });
  widget.clearButton.disabled = isBusy;
}

function setCommunityWidgetReadOnly(widget) {
  widget.summary.textContent = "Public rating summaries remain visible when available. New rating submissions are not enabled on this deployment.";
  widget.ratingButtons.forEach((button) => {
    button.disabled = true;
  });
  widget.clearButton.hidden = true;
  widget.ratingHint.hidden = false;
}

function setCommunityWidgetUnavailable(widget) {
  widget.lastSummary = null;
  widget.summary.textContent = "Community ratings are temporarily unavailable.";
  setRollingTextNodeContent(widget.metricValue, EMPTY_COMMUNITY_SCORE_TEXT, false);
  setRollingTextNodeContent(widget.metricCount, "Offline", false);
  widget.ratingButtons.forEach((button) => {
    button.disabled = true;
  });
  widget.clearButton.hidden = true;
  widget.ratingHint.hidden = false;
}
