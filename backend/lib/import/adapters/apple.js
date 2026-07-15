const {
  buildHeaders,
  cleanDescription,
  extractAppleCollectionId,
  isApplePodcastUrl,
  normalizeStringArray,
  normalizeUrl,
  trimText,
} = require("../utils");
const { fetchJsonWithLimits, throwForUpstreamStatus } = require("../fetch");

const APPLE_SEARCH_BASE_URL = "https://itunes.apple.com/search";
const APPLE_LOOKUP_BASE_URL = "https://itunes.apple.com/lookup";

function normalizeAppleResult(result = {}, fallbackUrl = "") {
  const appleCollectionId = String(result.collectionId || result.trackId || "").trim();
  const appleUrl = normalizeUrl(result.collectionViewUrl || result.trackViewUrl || fallbackUrl || "");
  const genres = normalizeStringArray(result.genres || [], 12);

  return {
    title: trimText(result.collectionName || result.trackName || result.collectionCensoredName, 240),
    creatorName: trimText(result.artistName, 240),
    description: cleanDescription(result.description || result.collectionCensoredName || ""),
    appleCollectionId,
    appleUrl,
    rssUrl: normalizeUrl(result.feedUrl || ""),
    artworkUrl: normalizeUrl(result.artworkUrl600 || result.artworkUrl100 || result.artworkUrl60 || ""),
    genreHints: genres,
    primaryGenre: trimText(result.primaryGenreName, 120),
    explicit: trimText(result.contentAdvisoryRating, 60),
    episodeCount: Number.isFinite(Number(result.trackCount)) ? Number(result.trackCount) : null,
    latestPublicationDate: trimText(result.releaseDate, 60),
    country: trimText(result.country, 40),
    feedType: trimText(result.kind, 80).toLowerCase() === "podcast" ? "" : trimText(result.kind, 80).toLowerCase(),
    copyright: trimText(result.copyright, 500),
    identityExact: true,
  };
}

async function fetchJson(fetchImpl, url, userAgent, limits) {
  const { response, json } = await fetchJsonWithLimits(fetchImpl, url, {
    headers: buildHeaders({
      userAgent,
      accept: "application/json, text/javascript;q=0.9, */*;q=0.8",
    }),
  }, { ...limits, label: "Apple request" });

  throwForUpstreamStatus(response, "Apple request");

  return json;
}

function createAppleAdapter({ fetchImpl = globalThis.fetch, userAgent, timeoutMs = 15_000, maxBytes = 5 * 1024 * 1024 } = {}) {
  async function searchByTerm(query, limit = 10) {
    const trimmedQuery = trimText(query, 240);
    if (!trimmedQuery) {
      return [];
    }

    const search = new URLSearchParams({
      media: "podcast",
      entity: "podcast",
      term: trimmedQuery,
      limit: String(Math.min(20, Math.max(1, limit))),
    });
    const payload = await fetchJson(fetchImpl, `${APPLE_SEARCH_BASE_URL}?${search.toString()}`, userAgent, { timeoutMs, maxBytes });

    return (Array.isArray(payload.results) ? payload.results : []).map((result) => ({
      sourceType: "apple",
      sourceKey: String(result.collectionId || result.trackId || ""),
      sourceUrl: normalizeUrl(result.collectionViewUrl || result.trackViewUrl || ""),
      raw: result,
      normalized: { ...normalizeAppleResult(result), identityExact: false },
    }));
  }

  async function lookupByCollectionId(collectionId) {
    const normalizedId = extractAppleCollectionId(collectionId);
    if (!normalizedId) {
      throw new Error("Apple lookup requires a collection id.");
    }

    const search = new URLSearchParams({
      media: "podcast",
      entity: "podcast",
      id: normalizedId,
    });
    const payload = await fetchJson(fetchImpl, `${APPLE_LOOKUP_BASE_URL}?${search.toString()}`, userAgent, { timeoutMs, maxBytes });
    const result = Array.isArray(payload.results) ? payload.results[0] : null;
    if (!result) {
      throw new Error(`Apple lookup returned no podcast for ${normalizedId}.`);
    }

    return {
      sourceType: "apple",
      sourceKey: normalizedId,
      sourceUrl: normalizeUrl(result.collectionViewUrl || result.trackViewUrl || ""),
      raw: result,
      normalized: normalizeAppleResult(result),
    };
  }

  async function lookupByUrl(value = "") {
    if (!isApplePodcastUrl(value) && !extractAppleCollectionId(value)) {
      throw new Error("Apple lookup URL is not valid.");
    }

    return lookupByCollectionId(extractAppleCollectionId(value));
  }

  return {
    lookupByCollectionId,
    lookupByUrl,
    normalizeAppleResult,
    searchByTerm,
  };
}

module.exports = {
  APPLE_LOOKUP_BASE_URL,
  APPLE_SEARCH_BASE_URL,
  createAppleAdapter,
  normalizeAppleResult,
};
