import { FALLBACK_TAG_OPTIONS } from "./config.js";
import {
  escapeAttribute,
  escapeHtml,
  getShowContributorLabel,
  iconMarkup,
  toDisplayLabel,
} from "./utils.js";

export function buildTagOptions(shows) {
  const counts = new Map();
  shows.forEach((show) => {
    const values = [
      ...(Array.isArray(show.genres) ? show.genres : []),
      ...(Array.isArray(show.tags) ? show.tags : []),
      ...(Array.isArray(show.formats) ? show.formats : []),
    ];

    values.forEach((value) => {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return;
      }
      const key = normalized.toLowerCase();
      const entry = counts.get(key) || { label: normalized, count: 0 };
      entry.count += 1;
      if (normalized.length < entry.label.length) {
        entry.label = normalized;
      }
      counts.set(key, entry);
    });
  });

  const derivedOptions = [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((entry) => toDisplayLabel(entry.label))
    .filter((value, index, collection) => collection.indexOf(value) === index);

  return [...derivedOptions, ...FALLBACK_TAG_OPTIONS]
    .filter((value, index, collection) => collection.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 40);
}

export function getTagSuggestions(query, options, selectedValues = []) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const selectedSet = new Set(selectedValues.map((value) => value.trim().toLowerCase()));
  const availableOptions = options.filter((option) => !selectedSet.has(option.trim().toLowerCase()));

  if (!normalizedQuery) {
    return availableOptions.slice(0, 16);
  }

  const prefixMatches = [];
  const partialMatches = [];

  availableOptions.forEach((option) => {
    const normalizedOption = option.toLowerCase();
    if (normalizedOption.startsWith(normalizedQuery)) {
      prefixMatches.push(option);
      return;
    }

    if (normalizedOption.includes(normalizedQuery)) {
      partialMatches.push(option);
    }
  });

  return [...prefixMatches, ...partialMatches].slice(0, 12);
}

export function resolveTagSubmission(query, highlightedSuggestion, options) {
  if (highlightedSuggestion) {
    return highlightedSuggestion;
  }

  const normalizedQuery = normalizeCustomTag(query);
  if (!normalizedQuery) {
    return "";
  }

  const existingOption = options.find((option) => option.trim().toLowerCase() === normalizedQuery.toLowerCase());
  return existingOption || normalizedQuery;
}

export function normalizeCustomTag(value = "") {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  return trimmed
    .split(" ")
    .map((segment) => segment
      .split("-")
      .map((part) => {
        if (!part) {
          return "";
        }

        if ((part === part.toUpperCase() && part.length <= 6) || /[A-Z]/.test(part.slice(1))) {
          return part;
        }

        return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
      })
      .join("-"))
    .join(" ")
    .replace(/\bSci Fi\b/i, "Sci-fi")
    .replace(/\bScifi\b/i, "Sci-fi")
    .replace(/\bFull Cast\b/i, "Full-cast");
}

export function getShowMatches(shows, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return shows.slice(0, 7);
  }

  return shows.filter((show) => {
    const creators = Array.isArray(show.creators) ? show.creators.join(" ") : "";
    const haystack = [show.title, creators, ...(show.genres || []), ...(show.tags || [])].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function renderSearchResultsMarkup(results, selectedShowId, query) {
  if (!Array.isArray(results) || results.length === 0) {
    return `<div class="submit-search-empty">No matching archive entry found for "${escapeHtml(query || "")}".</div>`;
  }

  return results.slice(0, 7).map((show) => `
    <button type="button" class="submit-search-result" data-show-option-id="${escapeAttribute(show.id)}">
      <span class="submit-search-result-topline">
        <span class="submit-search-result-title">${escapeHtml(show.title)}</span>
        ${selectedShowId === show.id ? `<span class="submit-search-result-check" aria-hidden="true">${iconMarkup("check")}</span>` : ""}
      </span>
      <span class="submit-search-result-meta">${escapeHtml(getShowContributorLabel(show))}</span>
    </button>
  `).join("");
}
