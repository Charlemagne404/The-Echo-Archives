const crypto = require("node:crypto");

const {
  DEFAULT_IMPORT_USER_AGENT,
  cleanDescription,
  normalizeStringArray,
  normalizeUrl,
  trimText,
} = require("../utils");
const { fetchJsonWithLimits, throwForUpstreamStatus } = require("../fetch");

const PODCAST_INDEX_BASE_URL = "https://api.podcastindex.org/api/1.0";

function buildPodcastIndexAuthHeaders({ apiKey, apiSecret, userAgent = DEFAULT_IMPORT_USER_AGENT, now = Date.now() }) {
  const authDate = String(Math.floor(now / 1000));
  const authorization = crypto
    .createHash("sha1")
    .update(`${apiKey}${apiSecret}${authDate}`)
    .digest("hex");

  return {
    "User-Agent": userAgent,
    "X-Auth-Key": apiKey,
    "X-Auth-Date": authDate,
    Authorization: authorization,
    Accept: "application/json",
  };
}

function normalizePodcastIndexResult(feed = {}, fallbackSourceUrl = "") {
  const categories = normalizeStringArray(
    Object.values(feed.categories || {}).map((value) => trimText(value, 120)),
    20,
  );

  return {
    title: trimText(feed.title, 240),
    creatorName: trimText(feed.author || feed.ownerName || "", 240),
    description: cleanDescription(feed.description || feed.itunesSummary || ""),
    podcastIndexFeedId: String(feed.id || "").trim(),
    podcastIndexGuid: trimText(feed.guid, 240),
    rssUrl: normalizeUrl(feed.url || ""),
    websiteUrl: normalizeUrl(feed.link || fallbackSourceUrl || ""),
    artworkUrl: normalizeUrl(feed.artwork || feed.image || ""),
    language: trimText(feed.language, 40).toLowerCase(),
    categories,
    explicit: trimText(feed.explicit, 40),
    episodeCount: Number.isFinite(Number(feed.episodeCount)) ? Number(feed.episodeCount) : null,
    latestPublicationDate: Number.isFinite(Number(feed.newestItemPubdate))
      ? new Date(Number(feed.newestItemPubdate) * 1000).toISOString()
      : "",
    dead: Number(feed.dead) === 1,
    medium: trimText(feed.medium, 80),
    networkName: trimText(feed.ownerName || "", 240),
    appleCollectionId: String(feed.itunesId || "").trim(),
    funding: normalizeStringArray(feed.funding || [], 12),
    contentType: trimText(feed.contentType, 120),
    lastUpdateTime: Number.isFinite(Number(feed.lastUpdateTime))
      ? new Date(Number(feed.lastUpdateTime) * 1000).toISOString()
      : "",
  };
}

async function fetchJson(fetchImpl, url, headers, limits) {
  const { response, json } = await fetchJsonWithLimits(fetchImpl, url, { headers }, {
    ...limits,
    label: "Podcast Index request",
  });
  throwForUpstreamStatus(response, "Podcast Index request");

  return json;
}

function createPodcastIndexAdapter({
  fetchImpl = globalThis.fetch,
  apiKey = "",
  apiSecret = "",
  userAgent = DEFAULT_IMPORT_USER_AGENT,
  timeoutMs = 15_000,
  maxBytes = 5 * 1024 * 1024,
} = {}) {
  const enabled = Boolean(apiKey && apiSecret && userAgent);

  async function request(pathname, searchParams) {
    if (!enabled) {
      throw new Error("Podcast Index credentials are not configured.");
    }

    const url = `${PODCAST_INDEX_BASE_URL}${pathname}?${searchParams.toString()}`;
    const payload = await fetchJson(
      fetchImpl,
      url,
      buildPodcastIndexAuthHeaders({ apiKey, apiSecret, userAgent }),
      { timeoutMs, maxBytes },
    );
    return payload;
  }

  async function searchByTerm(query, limit = 10) {
    const q = trimText(query, 240);
    if (!q) {
      return [];
    }

    const search = new URLSearchParams({
      q,
      max: String(Math.min(20, Math.max(1, limit))),
      pretty: "false",
    });
    const payload = await request("/search/byterm", search);

    return (Array.isArray(payload.feeds) ? payload.feeds : []).map((feed) => ({
      sourceType: "podcast-index",
      sourceKey: String(feed.id || feed.guid || ""),
      sourceUrl: normalizeUrl(feed.url || feed.link || ""),
      raw: feed,
      normalized: normalizePodcastIndexResult(feed),
    }));
  }

  async function lookupByFeedUrl(url) {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      throw new Error("Podcast Index lookup requires a feed URL.");
    }

    const payload = await request("/podcasts/byfeedurl", new URLSearchParams({ url: normalizedUrl }));
    const feed = payload.feed || null;
    if (!feed) {
      throw new Error(`Podcast Index lookup returned no feed for ${normalizedUrl}.`);
    }

    return {
      sourceType: "podcast-index",
      sourceKey: String(feed.id || feed.guid || ""),
      sourceUrl: normalizedUrl,
      raw: feed,
      normalized: normalizePodcastIndexResult(feed, normalizedUrl),
    };
  }

  async function lookupByItunesId(itunesId) {
    const normalizedId = String(itunesId || "").trim();
    if (!normalizedId) {
      throw new Error("Podcast Index iTunes lookup requires an id.");
    }

    const payload = await request("/podcasts/byitunesid", new URLSearchParams({ id: normalizedId }));
    const feed = payload.feed || null;
    if (!feed) {
      throw new Error(`Podcast Index returned no feed for Apple id ${normalizedId}.`);
    }

    return {
      sourceType: "podcast-index",
      sourceKey: String(feed.id || feed.guid || ""),
      sourceUrl: normalizeUrl(feed.url || ""),
      raw: feed,
      normalized: normalizePodcastIndexResult(feed),
    };
  }

  return {
    buildPodcastIndexAuthHeaders,
    enabled,
    lookupByFeedUrl,
    lookupByItunesId,
    normalizePodcastIndexResult,
    searchByTerm,
  };
}

module.exports = {
  PODCAST_INDEX_BASE_URL,
  buildPodcastIndexAuthHeaders,
  createPodcastIndexAdapter,
  normalizePodcastIndexResult,
};
