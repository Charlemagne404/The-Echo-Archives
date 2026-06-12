import {
  SHOWS_DATA_URL,
  COLLECTIONS_DATA_URL,
  archiveSearch,
  dataCache,
  PREFERRED_QUICK_FILTERS,
} from "./constants.js";
import {
  formatCompactDate,
  formatDate,
  normalizeTag,
  setTextContent,
  toDisplayTag,
  toLabel,
} from "./utils.js";

export async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request for ${url} failed with ${response.status}`);
  }

  return response.json();
}

export async function loadShows() {
  if (dataCache.shows) {
    return dataCache.shows;
  }

  const records = await fetchJson(SHOWS_DATA_URL);
  dataCache.shows = archiveSearch.hydrateCatalogSearch(records.map((record) => normalizeShowRecord(record)));
  return dataCache.shows;
}

export async function loadCollections() {
  if (dataCache.collections) {
    return dataCache.collections;
  }

  const records = await fetchJson(COLLECTIONS_DATA_URL);
  dataCache.collections = records.map((record) => normalizeCollectionRecord(record));
  return dataCache.collections;
}

export function getPublishedShows(shows) {
  return shows.filter((show) => show.status === "published");
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

function normalizeKeyedTextMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, text]) => [String(key || "").trim(), String(text || "").trim()])
      .filter(([key, text]) => key && text),
  );
}

function normalizeUrlMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, href]) => [String(key || "").trim(), String(href || "").trim()])
      .filter(([key, href]) => key && href),
  );
}

function normalizeStructuredValue(value) {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeStructuredValue(entry))
      .filter((entry) => entry !== undefined);
    return normalized.length > 0 ? normalized : undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const normalizedEntries = Object.entries(value)
    .map(([key, entryValue]) => [String(key || "").trim(), normalizeStructuredValue(entryValue)])
    .filter(([key, entryValue]) => key && entryValue !== undefined);

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

function normalizeStructuredObject(value) {
  const normalized = normalizeStructuredValue(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return {};
  }

  return normalized;
}

function normalizeCollectionRecord(record) {
  return {
    ...record,
    showIds: Array.isArray(record.showIds) ? record.showIds.filter(Boolean) : [],
    showReasons: normalizeKeyedTextMap(record.showReasons),
  };
}

export function normalizeReviewParagraphs(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return String(value)
    .split(/\n\s*\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinReviewParagraphs(paragraphs) {
  return normalizeReviewParagraphs(paragraphs).join(" ");
}

export function buildCollectionMap(collections) {
  return new Map(collections.map((collection) => [collection.id, collection]));
}

export function getCollectionShows(collection, showMap) {
  if (!collection) {
    return [];
  }

  return collection.showIds
    .map((showId) => showMap.get(showId))
    .filter((show) => show && show.status === "published");
}

function normalizeShowRecord(record) {
  const tags = normalizeStringArray(record.tags);
  const genres = normalizeStringArray(record.genres);
  const tones = normalizeStringArray(record.tones);
  const formats = normalizeStringArray(record.formats);
  const bestFor = normalizeStringArray(record.bestFor);
  const similarTo = normalizeStringArray(record.similarTo);
  const aliases = normalizeStringArray(record.aliases);
  const themes = normalizeStringArray(record.themes);
  const contentNotes = normalizeStringArray(record.contentNotes);
  const languages = normalizeStringArray(record.languages);
  const transcriptLanguages = normalizeStringArray(record.transcriptLanguages);
  const cast = normalizeStringArray(record.cast);
  const creators = normalizeStringArray(record.creators);
  const similarReasons = normalizeKeyedTextMap(record.similarReasons);
  const listenLinks = normalizeUrlMap(record.listenLinks);
  const officialLinks = normalizeUrlMap(record.officialLinks);
  const facts = normalizeStructuredObject(record.facts);
  const credits = normalizeStructuredObject(record.credits);
  const availability = normalizeStructuredObject(record.availability);
  const content = normalizeStructuredObject(record.content);
  const verification = normalizeStructuredObject(record.verification);
  const metadata = normalizeStructuredObject(record.metadata);
  const releaseDates = normalizeStructuredObject(record.releaseDates);
  const spoilerFreeReviewParagraphs = normalizeReviewParagraphs(
    record.spoilerFreeReviewParagraphs ?? record.spoilerFreeReview,
  );
  const thoughtsParagraphs = normalizeReviewParagraphs(record.thoughtsParagraphs ?? record.thoughts);
  const spoilerFreeReview = typeof record.spoilerFreeReview === "string"
    ? record.spoilerFreeReview.trim()
    : joinReviewParagraphs(spoilerFreeReviewParagraphs);
  const thoughts = typeof record.thoughts === "string" ? record.thoughts.trim() : joinReviewParagraphs(thoughtsParagraphs);
  const rating = Number(record.ratings?.archive);

  return {
    ...record,
    tags,
    genres,
    tones,
    formats,
    bestFor,
    similarTo,
    aliases,
    themes,
    contentNotes,
    languages,
    transcriptLanguages,
    cast,
    creators,
    similarReasons,
    listenLinks,
    officialLinks,
    facts,
    credits,
    availability,
    content,
    verification,
    metadata,
    releaseDates: {
      ...releaseDates,
      first: record.firstRelease || record.firstReleasedAt || releaseDates.first || "",
      latest: record.latestRelease || record.lastReleasedAt || releaseDates.latest || "",
    },
    spoilerFreeReview,
    spoilerFreeReviewParagraphs,
    thoughts,
    thoughtsParagraphs,
    href: `/show.html?id=${encodeURIComponent(record.id)}`,
    finalRating: Number.isFinite(rating) ? rating : null,
    searchText: "",
    tagTokens: tags.map((tag) => normalizeTag(tag)),
    bestForTokens: bestFor.map((tag) => normalizeTag(tag)),
  };
}

export function buildShowMap(shows) {
  return new Map(shows.map((show) => [show.id, show]));
}

export function getArchiveStats(shows, collections) {
  const publishedShows = getPublishedShows(shows);
  const fullReviewCount = publishedShows.filter((show) => show.reviewStatus === "full-review").length;
  const latestUpdatedAt = [
    ...publishedShows.map((show) => show.updatedAt),
    ...(Array.isArray(collections) ? collections.map((collection) => collection.updatedAt) : []),
  ]
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    showCount: publishedShows.length,
    fullReviewCount,
    collectionCount: Array.isArray(collections) ? collections.length : 0,
    latestUpdatedAt: latestUpdatedAt || "",
  };
}

export function applyArchiveStats(prefix, stats) {
  setTextContent(`${prefix}ShowCount`, String(stats.showCount));
  setTextContent(`${prefix}ReviewCount`, String(stats.fullReviewCount));
  setTextContent(`${prefix}CollectionCount`, String(stats.collectionCount));
  const formattedDate = stats.latestUpdatedAt
    ? prefix === "home"
      ? formatCompactDate(stats.latestUpdatedAt)
      : formatDate(stats.latestUpdatedAt)
    : "Unknown";
  setTextContent(`${prefix}LastUpdated`, formattedDate);
}

export function getVisibleFilterTags(shows) {
  const counts = new Map();

  shows.forEach((show) => {
    show.tags.forEach((tag) => {
      const normalized = normalizeTag(tag);
      if (!normalized) {
        return;
      }

      const current = counts.get(normalized) || {
        id: normalized,
        label: toDisplayTag(tag),
        count: 0,
      };
      current.count += 1;
      counts.set(normalized, current);
    });
  });

  return Array.from(counts.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

export function getQuickFilters(filterTags) {
  const tagsById = new Map(filterTags.map((tag) => [tag.id, tag]));
  return PREFERRED_QUICK_FILTERS.filter((id) => tagsById.has(id)).map((id) => tagsById.get(id));
}

function createCountedOptions(shows, selector, formatter = toDisplayTag) {
  const counts = new Map();

  shows.forEach((show) => {
    const values = Array.isArray(selector(show)) ? selector(show) : [];
    values.forEach((value) => {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return;
      }

      const current = counts.get(normalized) || {
        id: normalized,
        label: formatter(normalized),
        count: 0,
      };
      current.count += 1;
      counts.set(normalized, current);
    });
  });

  return Array.from(counts.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

export function getStructuredFilterGroups(shows) {
  return [
    { id: "reviewStatus", label: "Coverage", options: createCountedOptions(shows, (show) => [show.reviewStatus], toLabel) },
    {
      id: "completionStatus",
      label: "Completion",
      options: createCountedOptions(shows, (show) => [show.completionStatus], toDisplayTag),
    },
    { id: "bestFor", label: "Best for", options: createCountedOptions(shows, (show) => show.bestFor, toDisplayTag) },
    { id: "tags", label: "Tags", options: getVisibleFilterTags(shows) },
  ].filter((group) => group.options.length > 0);
}
