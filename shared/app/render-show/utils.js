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

export function getSummaryDescriptor(show) {
  const official = show?.officialDescription && typeof show.officialDescription === "object" ? show.officialDescription : {};
  const officialText = String(official.text || "").trim();
  if (officialText) {
    return {
      title: "Official description",
      description: `From ${String(official.sourceLabel || "Official source").trim()}.`,
      text: officialText,
      sourceUrl: String(official.sourceUrl || "").trim(),
    };
  }

  const importedSummary = String(show?.metadata?.importOfficialSummary || "").trim();
  const importedSource = Array.isArray(show?.metadata?.objectiveSources)
    ? show.metadata.objectiveSources.find((value) => /^https?:\/\//i.test(String(value || "")))
    : "";
  if (importedSummary && importedSource) {
    return {
      title: "Official description",
      description: "From an official listing.",
      text: importedSummary,
      sourceUrl: importedSource,
    };
  }

  const description = String(show?.description || "").trim();
  if (description) {
    return {
      title: "About this show",
      description: "A concise spoiler-free setup from the archive.",
      text: description,
    };
  }

  const subtitle = String(show?.subtitle || "").trim();
  if (subtitle) {
    return {
      title: "About this show",
      description: "A concise spoiler-free setup from the archive.",
      text: subtitle,
    };
  }

  return null;
}

function isSuppressedCatalogValue(value = "") {
  return /^(not[-\s]?verified|unknown|n\/a|none)$/i.test(String(value || "").trim());
}

function normalizeEntityNames(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return values.map((entry) => String(entry || "").trim()).filter((entry) => entry && !isSuppressedCatalogValue(entry));
}

function toEntityLabelFromId(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized || isSuppressedCatalogValue(normalized)) {
    return "";
  }

  return toLabel(normalized);
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
  if (typeof show.length?.totalHours === "number" && show.length.totalHours > 0) {
    const hours = formatRating(show.length.totalHours);
    return `${hours} ${show.length.totalHours === 1 ? "hour" : "hours"}`;
  }

  if (typeof show.length?.episodes === "number" && show.length.episodes > 0) {
    return `${show.length.episodes} episodes`;
  }

  return getRuntimeLabel(show);
}

export function getCreatorNames(show) {
  const directCreators = normalizeEntityNames(show?.creators);
  if (directCreators.length > 0) {
    return directCreators;
  }

  const creditedCreators = normalizeEntityNames(show?.credits?.creatorName);
  if (creditedCreators.length > 0) {
    return creditedCreators;
  }

  const creatorLabel = toEntityLabelFromId(show?.creatorId);
  return creatorLabel ? [creatorLabel] : [];
}

export function getNetworkLabel(show) {
  const creditedNetwork = normalizeEntityNames(show?.credits?.network)[0] || "";
  if (creditedNetwork) {
    return creditedNetwork;
  }

  return toEntityLabelFromId(show?.networkId);
}

export function getHeroRuntimeNote(show) {
  if (typeof show.length?.avgEpisodeMinutes === "number") {
    return `~${show.length.avgEpisodeMinutes} min episodes`;
  }

  if (typeof show.length?.episodes === "number") {
    return `${show.length.episodes} episodes total`;
  }

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
  const seasonsLabel = typeof show.length?.seasons === "number" && show.length.seasons > 0 ? `${show.length.seasons} seasons` : "";
  const episodesLabel = typeof show.length?.episodes === "number" && show.length.episodes > 0 ? `${show.length.episodes} episodes` : "";
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
  const text = [...getCreatorNames(show), getNetworkLabel(show)].filter(Boolean).join(" • ");

  if (!text) {
    return { text: "Not cataloged yet", isEmpty: true };
  }

  return { text, isEmpty: false };
}

export function getSeasonsEpisodesLabel(show) {
  const seasons = typeof show.length?.seasons === "number" && show.length.seasons > 0 ? `${show.length.seasons} seasons` : "";
  const episodes = typeof show.length?.episodes === "number" && show.length.episodes > 0 ? `${show.length.episodes} episodes` : "";
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
