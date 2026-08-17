import { normalizeReviewParagraphs } from "../data.js";
import { archiveRecord } from "../constants.js";
import {
  escapeHtml,
  formatCount,
  formatRouteExpansion,
  formatCompactDate,
  formatDate,
  formatRating,
  getRuntimeLabel,
  normalizeArchiveRating,
  toDisplayTag,
  toLabel,
} from "../utils.js";

export {
  escapeHtml,
  formatCount,
  formatRouteExpansion,
  formatCompactDate,
  formatDate,
  formatRating,
  getRuntimeLabel,
  normalizeArchiveRating,
  toDisplayTag,
  toLabel,
};

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

  return "The archive review is not finished yet. This show is still listed in the archive.";
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
  const seen = new Set();
  return values.map((entry) => String(entry || "").trim()).filter((entry) => {
    const key = entry.toLocaleLowerCase();
    if (!entry || isSuppressedCatalogValue(entry) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    return { text: "Not listed yet", isEmpty: true };
  }

  return { text: formatDate(value), isEmpty: false };
}

export function getHeroRuntimeValue(show) {
  if (typeof show.length?.totalHours === "number" && show.length.totalHours > 0) {
    const hours = formatRating(show.length.totalHours);
    return `${hours} ${show.length.totalHours === 1 ? "hour" : "hours"}`;
  }

  if (typeof show.length?.episodes === "number" && show.length.episodes > 0) {
    return formatCount(show.length.episodes, "episode");
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
    return `${formatCount(show.length.episodes, "episode")} total`;
  }

  if (show.length?.label) {
    return show.length.label;
  }

  return "Runtime not listed yet";
}

export function getHeroFormatValue(show) {
  if (show.formats[0]) {
    return toDisplayTag(show.formats[0]);
  }

  return "Not listed";
}

export function getHeroFormatNote(show) {
  if (show.formats.length > 1) {
    return show.formats
      .slice(1, 3)
      .map((format) => toDisplayTag(format))
      .join(" • ");
  }

  return show.formats[0] ? "Format" : "Format not listed yet";
}

export function getCompletionNote(show) {
  const seasonsLabel = typeof show.length?.seasons === "number" && show.length.seasons > 0 ? formatCount(show.length.seasons, "season") : "";
  const episodesLabel = typeof show.length?.episodes === "number" && show.length.episodes > 0 ? formatCount(show.length.episodes, "episode") : "";
  return [seasonsLabel, episodesLabel].filter(Boolean).join(" • ") || "Completion not listed yet";
}

export function getReleaseNote(show) {
  const firstKnownDate = getShowDateValue(show, "first");
  if (firstKnownDate) {
    return formatCompactDate(firstKnownDate);
  }

  return "Catalog state";
}

export function getPublicStatus(show) {
  return archiveRecord.derivePublicStatus(show);
}

export function getPublicVerificationLabel(show) {
  return archiveRecord.getPublicVerificationLabel(show?.verification);
}

export function getCreatorNetworkLabel(show) {
  const values = [...getCreatorNames(show), getNetworkLabel(show)].filter(Boolean);
  const text = [...new Map(values.map((value) => [value.toLocaleLowerCase(), value])).values()].join(" • ");

  if (!text) {
    return { text: "Not listed yet", isEmpty: true };
  }

  return { text, isEmpty: false };
}

export function getSeasonsEpisodesLabel(show) {
  const seasons = typeof show.length?.seasons === "number" && show.length.seasons > 0 ? formatCount(show.length.seasons, "season") : "";
  const episodes = typeof show.length?.episodes === "number" && show.length.episodes > 0 ? formatCount(show.length.episodes, "episode") : "";
  const text = [seasons, episodes].filter(Boolean).join(" • ");

  if (!text) {
    return { text: "Not listed yet", isEmpty: true };
  }

  return { text, isEmpty: false };
}

export function getSimilarReason(show, neighborId) {
  const reason = show?.similarReasons?.[neighborId];
  return typeof reason === "string" && reason.trim() ? reason.trim() : "";
}
