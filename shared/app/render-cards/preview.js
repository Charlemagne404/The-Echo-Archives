import { HOME_CARD_PREVIEW_ID_PREFIX } from "../constants.js";
import { configureImageElement, resolveImageSrc } from "../images.js";
import { setHighlightedText, toDisplayTag } from "../utils.js";
import { createEditorialBadges } from "./badges.js";
import { createArchiveScoreElement, createCommunityScoreElement, createRatingDividerElement, syncInlineScoreGroup } from "./scores.js";
import { formatInlineTagList } from "./shared.js";

export function createShowCard(show, { previewMode = "" } = {}) {
  const showId = show.id || "unknown-show";
  const shell = document.createElement("div");
  shell.className = "podcast-card-shell";
  shell.dataset.podcastId = showId;
  if (previewMode === "inline-expand") {
    shell.dataset.previewCard = "true";
  }

  const previewId = previewMode === "inline-expand" ? buildHomeCardPreviewId(showId) : "";
  const card = createShowCardPrimary(show, {
    isPreviewTrigger: previewMode === "inline-expand",
    previewId,
  });
  shell.append(card);
  if (previewMode === "inline-expand") {
    shell.__homeCardPreviewShow = show;
    shell.__homeCardPreviewId = previewId;
  }
  syncShowCardPresentation(shell, show);
  return shell;
}

function createShowCardPrimary(show, { isPreviewTrigger = false, previewId = "" } = {}) {
  const card = document.createElement("a");
  card.className = isPreviewTrigger ? "podcast-card podcast-card-primary" : "podcast-card";
  card.href = show.href || "/";
  card.dataset.podcastId = show.id || "unknown-show";
  if (isPreviewTrigger) {
    card.setAttribute("aria-controls", previewId);
    card.setAttribute("aria-expanded", "false");
  }

  const image = document.createElement("img");
  image.src = show.imageSrc || resolveImageSrc(show.cover);
  image.alt = show.imageAlt || show.coverAlt || `${show.title || "Untitled show"} cover art`;
  configureImageElement(image, {
    loading: "lazy",
    width: 320,
    height: 320,
  });

  const editorialBadges = createEditorialBadges(show);

  const title = document.createElement("h2");
  title.dataset.cardTitle = "true";

  const tags = document.createElement("p");
  tags.className = "tags";
  tags.dataset.cardMeta = "true";

  const rating = document.createElement("div");
  rating.className = "rating";

  rating.append(
    createArchiveScoreElement(show, { showLabel: false }),
    createRatingDividerElement(),
    createCommunityScoreElement(show, { showLabel: false }),
  );
  card.append(editorialBadges, image, title, tags, rating);
  card.__cardNodes = { title, tags };
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

export function ensureShellPreviewPanel(shell) {
  if (!(shell instanceof HTMLElement) || shell.dataset.previewCard !== "true") {
    return null;
  }

  const existingLayer = shell.querySelector(".home-card-preview-layer");
  if (existingLayer) {
    return existingLayer.querySelector(".home-card-preview");
  }

  const show = shell.__homeCardPreviewShow;
  const previewId = shell.__homeCardPreviewId || shell.querySelector(".podcast-card-primary")?.getAttribute("aria-controls");
  if (!show || !previewId) {
    return null;
  }

  const layer = createHomeCardPreviewPanel(show, previewId);
  shell.appendChild(layer);
  return layer.querySelector(".home-card-preview");
}

function markPreviewStage(element, { delay = 0, offset = 10, scale = 0.985 } = {}) {
  if (!(element instanceof HTMLElement)) {
    return element;
  }

  element.classList.add("home-card-preview-stage");
  element.style.setProperty("--preview-stage-delay", `${delay}ms`);
  element.style.setProperty("--preview-stage-offset", `${offset}px`);
  element.style.setProperty("--preview-stage-scale", `${scale}`);
  return element;
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

  const titleText = show.title || "Untitled show";
  const closeButton = document.createElement("button");
  closeButton.className = "preview-close-button";
  closeButton.type = "button";
  closeButton.setAttribute("tabindex", "-1");
  closeButton.setAttribute("aria-label", `Close the ${titleText} archive preview`);
  closeButton.textContent = "x";

  const media = document.createElement("div");
  media.className = "home-card-preview-media";

  const image = document.createElement("img");
  image.src = show.imageSrc || resolveImageSrc(show.cover);
  image.alt = show.imageAlt || show.coverAlt || `${titleText} cover art`;
  image.className = "home-card-preview-media-art";
  configureImageElement(image, {
    loading: "lazy",
    width: 320,
    height: 320,
  });
  media.appendChild(image);

  const content = document.createElement("div");
  content.className = "home-card-preview-content";

  const title = document.createElement("h3");
  title.className = "home-card-preview-title";
  title.id = titleId;
  title.textContent = titleText;

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
  const bestForValues = (Array.isArray(show.bestFor) ? show.bestFor : []).slice(0, 3).map((value) => toDisplayTag(value));
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
  openLink.href = show.href || "/";
  openLink.setAttribute("tabindex", "-1");
  openLink.setAttribute("aria-label", `Open the ${titleText} archive page`);
  const openText = document.createElement("span");
  openText.textContent = "Open archive";
  const openArrow = document.createElement("span");
  openArrow.className = "preview-open-link-arrow";
  openArrow.setAttribute("aria-hidden", "true");
  openArrow.textContent = "→";
  openLink.append(openText, openArrow);
  footer.appendChild(openLink);

  markPreviewStage(media, { delay: 0, offset: 6, scale: 0.992 });
  markPreviewStage(title, { delay: 45, offset: 8, scale: 0.985 });
  markPreviewStage(accentRule, { delay: 45, offset: 10, scale: 0.96 });
  markPreviewStage(copyBody, { delay: 75, offset: 10, scale: 0.985 });
  markPreviewStage(previewTake, { delay: 105, offset: 12, scale: 0.982 });
  markPreviewStage(footer, { delay: 105, offset: 10, scale: 0.985 });

  copyBody.append(lead, goodFor, previewTags);
  copy.append(copyBody, previewTake);
  content.append(title, accentRule, copy);
  panel.append(closeButton, media, content, footer);
  layer.appendChild(panel);

  return layer;
}

export function createCollectionShowCard(show, reason = "") {
  const shell = createShowCard(show);
  shell.classList.add("collection-show-card-shell");

  const card = shell.querySelector(".podcast-card");
  card?.classList.add("collection-show-card");

  if (!reason || !card) {
    return shell;
  }

  const rating = card.querySelector(".rating");
  const reasonNode = document.createElement("p");
  reasonNode.className = "collection-show-card-note";
  reasonNode.textContent = reason;

  if (rating) {
    card.insertBefore(reasonNode, rating);
  } else {
    card.appendChild(reasonNode);
  }

  return shell;
}

export function syncShowCardPresentation(shell, show) {
  if (!(shell instanceof HTMLElement)) {
    return;
  }

  const card = shell.querySelector(".podcast-card");
  const nodes = card?.__cardNodes;
  if (!nodes) {
    return;
  }

  const presentation = show?.searchPresentation || null;
  const titleTerms = Array.isArray(presentation?.titleTerms) ? presentation.titleTerms : [];
  const metaText = presentation?.metaText || formatInlineTagList(show.tags, 2);
  const metaTerms = Array.isArray(presentation?.metaTerms) ? presentation.metaTerms : [];

  setHighlightedText(nodes.title, show.title || "Untitled show", titleTerms);
  setHighlightedText(nodes.tags, metaText, metaTerms);
  nodes.tags.hidden = !String(metaText || "").trim();
  nodes.tags.dataset.searchPresentation = presentation?.metaText ? "true" : "false";
}
