import { createArchiveScoreElement, createCommunityScoreElement, createRatingDividerElement, syncInlineScoreGroup } from "./scores.js";
import { configureShowImageElement } from "../images.js";
import { toDisplayTag } from "../utils.js";

export function createMostPopularCard(show) {
  const card = document.createElement("a");
  card.className = "popular-card";
  card.href = show.href || "/";
  card.dataset.podcastId = show.id || "";
  card.setAttribute("aria-label", `Open ${show.title || "Untitled show"} in the archive`);

  if (show.accent?.rgb) {
    card.style.setProperty("--popular-card-accent-rgb", show.accent.rgb);
  }

  const media = document.createElement("div");
  media.className = "popular-card-media";

  const image = document.createElement("img");
  image.alt = show.imageAlt || show.coverAlt || `${show.title || "Untitled show"} cover art`;
  configureShowImageElement(image, show, {
    loading: "lazy",
    width: 320,
    height: 320,
    sizes: "(max-width: 560px) 82vw, (max-width: 960px) 44vw, 320px",
  });
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
  title.textContent = show.title || "Untitled show";

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

  const lifecycleLabel = getMostPopularCardLifecycleLabel(show);
  if (lifecycleLabel) {
    labels.push({ label: lifecycleLabel, tone: "muted" });
  }

  if (show.reviewStatus === "full-review") {
    labels.push({ label: "Full review", tone: "review" });
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
  const bestFor = Array.isArray(show.bestFor) ? show.bestFor : [];
  const tags = Array.isArray(show.tags) ? show.tags : [];
  const preferredValues = bestFor.length > 0 ? bestFor.slice(0, 2) : tags.slice(0, 2);
  return preferredValues.map((value) => toDisplayTag(value)).join(" • ");
}
