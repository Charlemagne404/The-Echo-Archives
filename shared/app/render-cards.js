import {
  HOME_CARD_PREVIEW_ID_PREFIX,
  TOP_RATED_BADGE_ASSET_URL,
} from "./constants.js";
import { formatRating, toDisplayTag } from "./utils.js";

function formatInlineTagList(tags, maxItems) {
  return tags
    .slice(0, maxItems)
    .map((tag) => toDisplayTag(tag))
    .join(" • ");
}

export function createMostPopularCard(show) {
  const card = document.createElement("a");
  card.className = "popular-card";
  card.href = show.href;
  card.dataset.podcastId = show.id;
  card.setAttribute("aria-label", `Open ${show.title} in the archive`);

  if (show.accent?.rgb) {
    card.style.setProperty("--popular-card-accent-rgb", show.accent.rgb);
  }

  const media = document.createElement("div");
  media.className = "popular-card-media";

  const image = document.createElement("img");
  image.src = show.cover;
  image.alt = show.coverAlt;
  media.appendChild(image);

  const body = document.createElement("div");
  body.className = "popular-card-body";

  const statusRow = document.createElement("div");
  statusRow.className = "popular-card-status";
  getMostPopularCardStatusLabels(show).forEach((status) => {
    statusRow.appendChild(createMostPopularStatusChip(status));
  });
  statusRow.hidden = statusRow.childElementCount === 0;

  const title = document.createElement("h3");
  title.className = "popular-card-title";
  title.textContent = show.title;

  const subtitle = document.createElement("p");
  subtitle.className = "popular-card-subtitle";
  subtitle.textContent = String(show.subtitle || "").trim();
  subtitle.hidden = !subtitle.textContent;

  const metadata = document.createElement("p");
  metadata.className = "popular-card-meta";
  metadata.textContent = getMostPopularCardMetaText(show);
  metadata.hidden = !metadata.textContent;

  const copy = document.createElement("p");
  copy.className = "popular-card-copy";
  copy.textContent = String(show.archiveTake || show.description || "").trim();
  copy.hidden = !copy.textContent;

  const footer = document.createElement("div");
  footer.className = "popular-card-footer";

  const ratings = document.createElement("div");
  ratings.className = "popular-card-ratings";
  ratings.append(
    createArchiveScoreElement(show),
    createRatingDividerElement(),
    createCommunityScoreElement(show),
  );
  syncInlineScoreGroup(ratings);
  footer.appendChild(ratings);

  body.append(statusRow, title, subtitle, metadata, copy, footer);
  card.append(media, body);
  return card;
}

function createMostPopularStatusChip({ label, tone = "default" }) {
  const chip = document.createElement("span");
  chip.className = `popular-card-chip${tone ? ` is-${tone}` : ""}`;
  chip.textContent = label;
  return chip;
}

function getMostPopularCardStatusLabels(show) {
  const labels = [];

  if ((show.finalRating || 0) >= 9) {
    labels.push({ label: "Top rated", tone: "accent" });
  }

  if (show.reviewStatus === "full-review") {
    labels.push({ label: "Full review", tone: "review" });
  }

  const lifecycleLabel = getMostPopularCardLifecycleLabel(show);
  if (lifecycleLabel) {
    labels.push({ label: lifecycleLabel, tone: "muted" });
  }

  return labels;
}

function getMostPopularCardLifecycleLabel(show) {
  if (show.completionStatus && show.completionStatus !== "unclear") {
    return toDisplayTag(show.completionStatus);
  }

  if (show.releaseStatus && show.releaseStatus !== "unknown") {
    return toDisplayTag(show.releaseStatus);
  }

  return "";
}

function getMostPopularCardMetaText(show) {
  const preferredValues = show.bestFor.length > 0 ? show.bestFor.slice(0, 2) : show.tags.slice(0, 2);
  return preferredValues.map((value) => toDisplayTag(value)).join(" • ");
}

export function createShowCard(show, { previewMode = "" } = {}) {
  const shell = document.createElement("div");
  shell.className = "podcast-card-shell";
  shell.dataset.podcastId = show.id;
  if (previewMode === "inline-expand") {
    shell.dataset.previewCard = "true";
  }

  const previewId = previewMode === "inline-expand" ? buildHomeCardPreviewId(show.id) : "";
  const card = createShowCardPrimary(show, {
    isPreviewTrigger: previewMode === "inline-expand",
    previewId,
  });
  shell.append(card);
  if (previewMode === "inline-expand") {
    shell.append(createHomeCardPreviewPanel(show, previewId));
  }
  return shell;
}

function createShowCardPrimary(show, { isPreviewTrigger = false, previewId = "" } = {}) {
  const card = document.createElement("a");
  card.className = isPreviewTrigger ? "podcast-card podcast-card-primary" : "podcast-card";
  card.href = show.href;
  card.dataset.podcastId = show.id;
  if (isPreviewTrigger) {
    card.setAttribute("aria-controls", previewId);
    card.setAttribute("aria-expanded", "false");
  }

  const image = document.createElement("img");
  image.src = show.cover;
  image.alt = show.coverAlt;

  const editorialBadges = createEditorialBadges(show);

  const title = document.createElement("h2");
  title.textContent = show.title;

  const tags = document.createElement("p");
  tags.className = "tags";
  tags.textContent = formatInlineTagList(show.tags, 2);
  tags.hidden = !tags.textContent;

  const rating = document.createElement("div");
  rating.className = "rating";

  rating.append(
    createArchiveScoreElement(show, { showLabel: false }),
    createRatingDividerElement(),
    createCommunityScoreElement(show, { showLabel: false }),
  );
  card.append(editorialBadges, image, title, tags, rating);
  return card;
}

export function createArchiveScoreElement(show, { showLabel = true } = {}) {
  const archiveRating = document.createElement("div");
  archiveRating.className = "archive-inline-score";
  archiveRating.innerHTML = `
    <span class="inline-score-topline">
      <span class="inline-score-icon archive-score-icon" aria-hidden="true">★</span>
      <span class="inline-score-value">${formatRating(show.finalRating)}/10</span>
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

export function buildHomeCardPreviewId(value) {
  return `${HOME_CARD_PREVIEW_ID_PREFIX}-${String(value).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export function getShellPreviewPanel(shell) {
  if (!shell) {
    return null;
  }

  return shell.querySelector(".home-card-preview");
}

function createHomeCardPreviewPanel(show, previewId) {
  const layer = document.createElement("div");
  layer.className = "home-card-preview-layer";
  layer.hidden = true;
  layer.setAttribute("aria-hidden", "true");

  const panel = document.createElement("article");
  panel.className = "home-card-preview";
  panel.id = previewId;
  panel.dataset.podcastId = show.id;
  panel.setAttribute("role", "group");

  const titleId = `${previewId}-title`;
  panel.setAttribute("aria-labelledby", titleId);

  const closeButton = document.createElement("button");
  closeButton.className = "preview-close-button";
  closeButton.type = "button";
  closeButton.setAttribute("tabindex", "-1");
  closeButton.setAttribute("aria-label", `Close the ${show.title} archive preview`);
  closeButton.textContent = "x";

  const media = document.createElement("div");
  media.className = "home-card-preview-media";

  const image = document.createElement("img");
  image.src = show.cover;
  image.alt = show.coverAlt;
  media.appendChild(image);

  const content = document.createElement("div");
  content.className = "home-card-preview-content";

  const title = document.createElement("h3");
  title.className = "home-card-preview-title";
  title.id = titleId;
  title.textContent = show.title;

  const accentRule = document.createElement("span");
  accentRule.className = "home-card-preview-rule";
  accentRule.setAttribute("aria-hidden", "true");

  const copy = document.createElement("div");
  copy.className = "home-card-preview-copy";

  const copyBody = document.createElement("div");
  copyBody.className = "home-card-preview-copy-body";

  const lead = document.createElement("p");
  lead.className = "preview-lead";
  lead.textContent = String(show.subtitle || "").trim();
  lead.hidden = !lead.textContent;

  const goodFor = document.createElement("p");
  goodFor.className = "preview-good-for";

  const goodForLabel = document.createElement("span");
  goodForLabel.className = "preview-good-for-label";
  goodForLabel.textContent = "Good for:";
  const goodForText = document.createElement("span");
  const bestForValues = show.bestFor.slice(0, 3).map((value) => toDisplayTag(value));
  goodForText.textContent = bestForValues.length > 0 ? ` ${bestForValues.join(", ")}` : "";
  goodFor.append(goodForLabel, goodForText);
  goodFor.hidden = bestForValues.length === 0;

  const previewTags = document.createElement("div");
  previewTags.className = "preview-tags";
  previewTags.textContent = formatInlineTagList(show.tags, 3);
  previewTags.hidden = !previewTags.textContent;

  const previewTake = document.createElement("p");
  previewTake.className = "preview-take";
  previewTake.textContent = String(show.archiveTake || show.description || "").trim();
  previewTake.hidden = !previewTake.textContent;

  const footer = document.createElement("div");
  footer.className = "home-card-preview-footer";

  const ratings = document.createElement("div");
  ratings.className = "home-card-preview-ratings";
  ratings.append(
    createArchiveScoreElement(show),
    createRatingDividerElement(),
    createCommunityScoreElement(show),
  );
  syncInlineScoreGroup(ratings);
  footer.appendChild(ratings);

  const openLink = document.createElement("a");
  openLink.className = "preview-open-link";
  openLink.href = show.href;
  openLink.setAttribute("tabindex", "-1");
  openLink.setAttribute("aria-label", `Open the ${show.title} archive page`);
  const openText = document.createElement("span");
  openText.textContent = "Open archive";
  const openArrow = document.createElement("span");
  openArrow.className = "preview-open-link-arrow";
  openArrow.setAttribute("aria-hidden", "true");
  openArrow.textContent = "→";
  openLink.append(openText, openArrow);
  footer.appendChild(openLink);

  copyBody.append(lead, goodFor, previewTags);
  copy.append(copyBody, previewTake);
  content.append(title, accentRule, copy);
  panel.append(closeButton, media, content, footer);
  layer.appendChild(panel);

  return layer;
}

function createEditorialBadges(show) {
  const badges = document.createElement("div");
  badges.className = "editorial-badges";
  badges.setAttribute("aria-hidden", "true");

  if ((show.finalRating || 0) >= 9) {
    const topRatedBadge = document.createElement("span");
    topRatedBadge.className = "editorial-badge editorial-badge-corner";
    const topRatedArtwork = document.createElement("img");
    topRatedArtwork.className = "editorial-badge-artwork";
    topRatedArtwork.src = TOP_RATED_BADGE_ASSET_URL;
    topRatedArtwork.alt = "";
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

  return badges;
}

export function createCollectionShowCard(show, reason = "") {
  const shell = createShowCard(show);
  if (!reason) {
    return shell;
  }

  const reasonNode = document.createElement("p");
  reasonNode.className = "collection-card-reason";
  reasonNode.textContent = reason;
  shell.appendChild(reasonNode);
  return shell;
}
