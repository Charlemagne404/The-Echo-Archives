import {
  ARCHIVE_STATS_URL,
  SHOWS_DATA_URL,
  COLLECTIONS_DATA_URL,
  SEARCH_INDEX_URL,
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

export async function fetchJson(url, options = {}) {
  const { headers: headerOverrides = {}, timeoutMs = 12_000, ...requestOptions } = options || {};
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      ...requestOptions,
      signal: timeoutController.signal,
      headers: {
        Accept: "application/json",
        ...headerOverrides,
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request for ${url} timed out.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`Request for ${url} failed with ${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Request for ${url} did not return valid JSON.`, { cause: error });
  }
}

function assertJsonArray(value, url, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} from ${url} must be a JSON array.`);
  }

  return value;
}

export async function loadShows() {
  if (dataCache.shows) {
    return dataCache.shows;
  }

  const records = assertJsonArray(await fetchJson(SHOWS_DATA_URL), SHOWS_DATA_URL, "Show data");
  dataCache.shows = archiveSearch.hydrateCatalogSearch(records.map((record) => normalizeShowRecord(record)));
  return dataCache.shows;
}

export async function loadArchiveStats() {
  if (dataCache.archiveStats) {
    return dataCache.archiveStats;
  }

  const record = await fetchJson(ARCHIVE_STATS_URL);
  dataCache.archiveStats = record;
  return dataCache.archiveStats;
}

export async function loadSearchIndex() {
  if (dataCache.searchIndex) {
    return dataCache.searchIndex;
  }

  const records = assertJsonArray(await fetchJson(SEARCH_INDEX_URL), SEARCH_INDEX_URL, "Search index data");
  dataCache.searchIndex = archiveSearch.hydrateCatalogSearch(records.map((record) => normalizeShowRecord(record)));
  return dataCache.searchIndex;
}

export async function loadCollections() {
  if (dataCache.collections) {
    return dataCache.collections;
  }

  const records = assertJsonArray(await fetchJson(COLLECTIONS_DATA_URL), COLLECTIONS_DATA_URL, "Collection data");
  dataCache.collections = records.map((record) => normalizeCollectionRecord(record));
  return dataCache.collections;
}

export function getPublishedShows(shows) {
  return (Array.isArray(shows) ? shows : []).filter((show) => show.status === "published");
}

export { normalizeReviewParagraphs };

export function buildCollectionMap(collections) {
  return new Map((Array.isArray(collections) ? collections : []).map((collection) => [collection.id, collection]));
}

export function getCollectionShows(collection, showMap) {
  if (!collection || !showMap || typeof showMap.get !== "function") {
    return [];
  }

  return (Array.isArray(collection.showIds) ? collection.showIds : [])
    .map((showId) => showMap.get(showId))
    .filter((show) => show && show.status === "published");
}

export function normalizeShowRecord(record) {
  const normalized = normalizeArchiveShowRecord(record);

  return {
    ...normalized,
    genreTokens: normalized.genres.map((genre) => normalizeTag(genre)),
    tagTokens: normalized.tags.map((tag) => normalizeTag(tag)),
    bestForTokens: normalized.bestFor.map((tag) => normalizeTag(tag)),
  };
}

export function buildShowMap(shows) {
  return new Map((Array.isArray(shows) ? shows : []).map((show) => [show.id, show]));
}

export function getArchiveStats(shows, collections) {
  const publishedShows = getPublishedShows(shows);
  const fullReviewCount = publishedShows.filter((show) => show.reviewStatus === "full-review").length;
  const latestUpdatedAt = [
    ...publishedShows.map((show) => show.updatedAt),
    ...(Array.isArray(collections) ? collections.map((collection) => collection.updatedAt) : []),
  ]
    .filter(Boolean)
    .sort((left, right) => {
      const leftTimestamp = Date.parse(String(left || ""));
      const rightTimestamp = Date.parse(String(right || ""));
      return (
        (Number.isFinite(leftTimestamp) ? leftTimestamp : Number.NEGATIVE_INFINITY) -
        (Number.isFinite(rightTimestamp) ? rightTimestamp : Number.NEGATIVE_INFINITY)
      );
    })
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

  (Array.isArray(shows) ? shows : []).forEach((show) => {
    (Array.isArray(show.tags) ? show.tags : []).forEach((tag) => {
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

const FILTER_MENU_BUCKETS = [
  {
    id: "storyType",
    label: "Story type",
    description: "Genre and format",
    groupIds: ["genres", "formats"],
  },
  {
    id: "tone",
    label: "Tone",
    description: "Mood and atmosphere",
    groupIds: ["tones"],
  },
  {
    id: "listeningContext",
    label: "Listening context",
    description: "Best for, commitment, and use case",
    groupIds: ["bestFor"],
  },
  {
    id: "archiveStatus",
    label: "Archive status",
    description: "Completion status and archive coverage",
    groupIds: ["completionStatus", "reviewStatus"],
  },
  {
    id: "findTags",
    label: "Find tags",
    description: "Search the long-tail archive tags",
    groupIds: ["tags"],
    searchable: true,
  },
];

function createCountedOptions(shows, selector, formatter = toDisplayTag) {
  const counts = new Map();

  (Array.isArray(shows) ? shows : []).forEach((show) => {
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

export function getFilterMenuBuckets(structuredFilterGroups) {
  const groupsById = new Map(structuredFilterGroups.map((group) => [group.id, group]));

  return FILTER_MENU_BUCKETS.map((bucket) => {
    const groups = bucket.groupIds.map((groupId) => groupsById.get(groupId)).filter(Boolean);
    if (groups.length === 0) {
      return null;
    }

    return {
      ...bucket,
      groups,
      optionCount: groups.reduce((count, group) => count + group.options.length, 0),
    };
  }).filter(Boolean);
}
