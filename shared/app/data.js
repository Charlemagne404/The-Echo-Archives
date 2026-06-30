import {
  SHOWS_DATA_URL,
  COLLECTIONS_DATA_URL,
  archiveSearch,
  archiveRecord,
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

const {
  normalizeCollectionRecord,
  normalizeReviewParagraphs,
  normalizeShowRecord: normalizeArchiveShowRecord,
} = archiveRecord;

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

export { normalizeReviewParagraphs };

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
  const normalized = normalizeArchiveShowRecord(record);

  return {
    ...normalized,
    genreTokens: normalized.genres.map((genre) => normalizeTag(genre)),
    tagTokens: normalized.tags.map((tag) => normalizeTag(tag)),
    bestForTokens: normalized.bestFor.map((tag) => normalizeTag(tag)),
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
    { id: "genres", label: "Genre", options: createCountedOptions(shows, (show) => show.genres, toDisplayTag) },
    { id: "tones", label: "Tone", options: createCountedOptions(shows, (show) => show.tones, toDisplayTag) },
    { id: "formats", label: "Format", options: createCountedOptions(shows, (show) => show.formats, toDisplayTag) },
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
