import { normalizeReviewParagraphs } from "../data.js";
import {
  escapeHtml,
  formatCompactDate,
  formatDate,
  formatRating,
  getRuntimeLabel,
  toDisplayTag,
  toLabel,
} from "../utils.js";

export { escapeHtml, formatCompactDate, formatDate, formatRating, getRuntimeLabel, toDisplayTag, toLabel };

export function renderParagraphMarkup(paragraphs, fallbackText) {
  const normalized = normalizeReviewParagraphs(paragraphs);
  const fallback = String(fallbackText || "").trim();
  const entries = normalized.length > 0 ? normalized : fallback ? [fallback] : [];

  return entries.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

export function getArchivePerspectiveText(show) {
  const archiveTake = String(show.archiveTake || "").trim();
  if (archiveTake) {
    return archiveTake;
  }

  const spoilerFree = String(show.spoilerFreeReview || "").trim();
  if (spoilerFree) {
    return spoilerFree;
  }

  const thoughts = String(show.thoughts || "").trim();
  if (thoughts) {
    return thoughts;
  }

  return "Archive perspective is still being expanded. This entry stays live because the show is already useful in the discovery graph.";
}

export function getShowDateValue(show, kind) {
  if (kind === "first") {
    return show.releaseDates?.first || "";
  }

  return show.releaseDates?.latest || "";
}

export function getKnownDateLabel(value) {
  if (!value) {
    return { text: "Not cataloged yet", isEmpty: true };
  }

  return { text: formatDate(value), isEmpty: false };
}

export function getHeroRuntimeValue(show) {
  if (typeof show.length?.totalHours === "number") {
    const hours = formatRating(show.length.totalHours);
    return `${hours} ${show.length.totalHours === 1 ? "hour" : "hours"}`;
  }

  return getRuntimeLabel(show);
}

export function getHeroRuntimeNote(show) {
  if (show.length?.label) {
    return show.length.label;
  }

  return "Runtime being cataloged";
}

export function getHeroFormatValue(show) {
  if (show.formats[0]) {
    return toDisplayTag(show.formats[0]);
  }

  return "Not cataloged";
}

export function getHeroFormatNote(show) {
  if (show.formats.length > 1) {
    return show.formats
      .slice(1, 3)
      .map((format) => toDisplayTag(format))
      .join(" • ");
  }

  return show.formats[0] ? "Archive format" : "Format being cataloged";
}

export function getCompletionNote(show) {
  const seasonsLabel = typeof show.length?.seasons === "number" ? `${show.length.seasons} seasons` : "";
  const episodesLabel = typeof show.length?.episodes === "number" ? `${show.length.episodes} episodes` : "";
  return [seasonsLabel, episodesLabel].filter(Boolean).join(" • ") || "Archive completion";
}

export function getReleaseNote(show) {
  const firstKnownDate = getShowDateValue(show, "first");
  if (firstKnownDate) {
    return formatCompactDate(firstKnownDate);
  }

  return "Catalog state";
}

export function getCreatorNetworkLabel(show) {
  const creator = Array.isArray(show.creators) && show.creators.length > 0
    ? show.creators.join(", ")
    : show.creatorId
      ? toLabel(show.creatorId)
      : "";
  const network = typeof show.credits?.network === "string" && show.credits.network
    ? show.credits.network
    : show.networkId
      ? toLabel(show.networkId)
      : "";
  const text = [creator, network].filter(Boolean).join(" • ");

  if (!text) {
    return { text: "Not cataloged yet", isEmpty: true };
  }

  return { text, isEmpty: false };
}

export function getSeasonsEpisodesLabel(show) {
  const seasons = typeof show.length?.seasons === "number" ? `${show.length.seasons} seasons` : "";
  const episodes = typeof show.length?.episodes === "number" ? `${show.length.episodes} episodes` : "";
  const text = [seasons, episodes].filter(Boolean).join(" • ");

  if (!text) {
    return { text: "Not cataloged yet", isEmpty: true };
  }

  return { text, isEmpty: false };
}

export function getSimilarReason(show, neighborId) {
  const reason = show?.similarReasons?.[neighborId];
  return typeof reason === "string" && reason.trim() ? reason.trim() : "";
}
