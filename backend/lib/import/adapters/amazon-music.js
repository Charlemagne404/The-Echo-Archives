const { normalizeUrl, trimText } = require("../utils");
const { fetchTextWithLimits, throwForUpstreamStatus } = require("../fetch");

const AMAZON_MUSIC_HOSTS = new Set([
  "music.amazon.ca",
  "music.amazon.co.jp",
  "music.amazon.co.uk",
  "music.amazon.com",
  "music.amazon.com.au",
  "music.amazon.de",
  "music.amazon.es",
  "music.amazon.fr",
  "music.amazon.in",
  "music.amazon.it",
]);
const PODCAST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function identityError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "IMPORT_INVALID_EXTERNAL_IDENTITY";
  error.retryable = false;
  return error;
}

function parseAmazonMusicIdentityUrl(value = "") {
  const normalized = normalizeUrl(value);
  if (!normalized) throw identityError("Amazon Music identity must be an HTTP URL.");

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (_error) {
    throw identityError("Amazon Music identity URL is invalid.");
  }

  if (
    parsed.protocol !== "https:" ||
    !AMAZON_MUSIC_HOSTS.has(parsed.hostname.toLowerCase()) ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw identityError("Use a public Amazon Music podcast listing URL on a supported music.amazon host.");
  }

  const match = parsed.pathname.match(/^\/podcasts\/([0-9a-f-]+)(?:\/[a-z0-9-]+)?\/?$/i);
  if (!match || !PODCAST_ID_PATTERN.test(match[1])) {
    throw identityError("Amazon Music identity must point to a podcast show page, not an episode or general website.");
  }

  const id = match[1].toLowerCase();
  parsed.pathname = `/podcasts/${id}`;
  parsed.search = "";
  parsed.hash = "";
  return { provider: "amazon-music", id, url: parsed.href };
}

function isVerifiedAmazonMusicIdentity(objective = {}) {
  const identity = objective.externalIdentity || {};
  if (identity.provider !== "amazon-music" || identity.verified !== true) return false;
  try {
    const parsed = parseAmazonMusicIdentityUrl(identity.url || "");
    return Boolean(
      identity.id && parsed.id === String(identity.id).toLowerCase() &&
      identity.verifiedBy && identity.verifiedAt && identity.confirmedTitle && identity.confirmedCreator,
    );
  } catch (_error) {
    return false;
  }
}

function createAmazonMusicAdapter({
  fetchImpl = globalThis.fetch,
  userAgent,
  timeoutMs = 15_000,
  maxBytes = 2 * 1024 * 1024,
} = {}) {
  async function fetchByUrl(value) {
    const identity = parseAmazonMusicIdentityUrl(value);
    const { response, text, resolvedUrl } = await fetchTextWithLimits(fetchImpl, identity.url, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": userAgent },
    }, {
      timeoutMs,
      maxBytes,
      label: "Amazon Music request",
      allowedContentTypes: ["text/html", "application/xhtml+xml"],
    });
    throwForUpstreamStatus(response, "Amazon Music request");

    const resolvedIdentity = parseAmazonMusicIdentityUrl(resolvedUrl || identity.url);
    if (resolvedIdentity.id !== identity.id) {
      const error = new Error("Amazon Music redirected to a different podcast listing.");
      error.statusCode = 409;
      error.code = "IMPORT_EXTERNAL_IDENTITY_REDIRECT_MISMATCH";
      error.retryable = false;
      throw error;
    }

    return {
      sourceType: "amazon-music",
      sourceKey: identity.id,
      sourceUrl: resolvedIdentity.url,
      httpStatus: response.status,
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
      raw: { contentType: response.headers.get("content-type") || "", text },
      normalized: {
        amazonMusicId: identity.id,
        amazonMusicUrl: resolvedIdentity.url,
        identityExact: true,
      },
    };
  }

  return { fetchByUrl };
}

module.exports = {
  AMAZON_MUSIC_HOSTS,
  createAmazonMusicAdapter,
  isVerifiedAmazonMusicIdentity,
  parseAmazonMusicIdentityUrl,
};
