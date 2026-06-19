import { HOME_CARD_PREVIEW_ID_PREFIX } from "../constants.js";
import { toDisplayTag } from "../utils.js";
import { createEditorialBadges } from "./badges.js";
import { createArchiveScoreElement, createCommunityScoreElement, createRatingDividerElement, syncInlineScoreGroup } from "./scores.js";
import { formatInlineTagList } from "./shared.js";

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
