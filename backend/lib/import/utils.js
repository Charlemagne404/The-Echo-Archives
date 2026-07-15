const IMPORT_CANDIDATE_STATUSES = new Set([
  "queued",
  "processing",
  "ready",
  "needs-review",
  "failed",
  "published",
  "duplicate",
  "rejected",
]);
const IMPORT_OPEN_STATUSES = ["queued", "processing", "ready", "needs-review", "failed"];
const IMPORT_SCOPE_STATUSES = new Set(["in-scope", "borderline", "out-of-scope"]);
const DEFAULT_IMPORT_USER_AGENT = "TheEchoArchivesImport/1.0 (+https://echo.continental-hub.com)";

const APPLE_PODCAST_HOSTS = new Set(["podcasts.apple.com", "itunes.apple.com"]);

function trimText(value = "", maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeHtmlEntities(value = "") {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x27;/gi, "'");
}

function normalizeWhitespace(value = "") {
  return trimText(String(value || "").replace(/\s+/g, " "));
}

function cleanDescription(value = "", maxLength = 1200) {
  const cleaned = normalizeWhitespace(stripHtml(decodeHtmlEntities(value)));
  return cleaned.slice(0, maxLength);
}

function isHttpUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function normalizeUrl(value = "") {
  if (!isHttpUrl(value)) {
    return "";
  }

  try {
    const url = new URL(String(value).trim());
    url.hash = "";
    return url.href;
  } catch (_error) {
    return "";
  }
}

function resolveUrl(value = "", baseUrl = "") {
  const trimmed = trimText(decodeHtmlEntities(value), 1000);
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed, baseUrl || undefined).href;
  } catch (_error) {
    return "";
  }
}

function slugify(value = "") {
  return trimText(value, 200)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeTitleCreatorKey(title = "", creatorName = "") {
  const titleSlug = slugify(title);
  const creatorSlug = slugify(creatorName);
  if (!titleSlug) {
    return "";
  }

  return creatorSlug ? `${titleSlug}::${creatorSlug}` : titleSlug;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const trimmed = trimText(value, 2000);
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

function mergeUniqueStrings(...collections) {
  const seen = new Set();
  const values = [];

  collections.forEach((collection) => {
    (Array.isArray(collection) ? collection : []).forEach((value) => {
      const normalized = trimText(value, 160);
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) {
        return;
      }

      seen.add(key);
      values.push(normalized);
    });
  });

  return values;
}

function normalizeStringArray(value, maxItems = 20) {
  return mergeUniqueStrings(Array.isArray(value) ? value : []).slice(0, maxItems);
}

function parseDateValue(value = "") {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function toDateStamp(value = "") {
  const normalized = parseDateValue(value);
  return normalized ? normalized.slice(0, 10) : "";
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function buildHeaders({ userAgent = DEFAULT_IMPORT_USER_AGENT, accept = "*/*" } = {}) {
  return {
    Accept: accept,
    "User-Agent": userAgent,
  };
}

function extractAppleCollectionId(value = "") {
  const trimmed = trimText(value, 500);
  if (!trimmed) {
    return "";
  }

  const directMatch = trimmed.match(/(?:id=|\/id)(\d{5,})/i);
  if (directMatch) {
    return directMatch[1];
  }

  if (/^\d{5,}$/.test(trimmed)) {
    return trimmed;
  }

  return "";
}

function isApplePodcastUrl(value = "") {
  if (!isHttpUrl(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return APPLE_PODCAST_HOSTS.has(url.hostname);
  } catch (_error) {
    return false;
  }
}

function looksLikeRssUrl(value = "") {
  const normalized = normalizeUrl(value);
  return Boolean(
    normalized &&
      (/\.xml($|\?)/i.test(normalized) ||
        /\/rss($|[/?])/i.test(normalized) ||
        /\/feed($|[/?])/i.test(normalized) ||
        /feeds\./i.test(normalized)),
  );
}

function detectSeedEntry(value = "") {
  const trimmed = trimText(value, 800);
  if (!trimmed) {
    return null;
  }

  if (isApplePodcastUrl(trimmed) || extractAppleCollectionId(trimmed)) {
    const collectionId = extractAppleCollectionId(trimmed);
    return {
      seedType: "apple",
      rawValue: trimmed,
      titleQuery: "",
      appleCollectionId: collectionId,
      appleUrl: isHttpUrl(trimmed) ? normalizeUrl(trimmed) : "",
      rssUrl: "",
      websiteUrl: "",
    };
  }

  if (isHttpUrl(trimmed) && looksLikeRssUrl(trimmed)) {
    return {
      seedType: "rss",
      rawValue: trimmed,
      titleQuery: "",
      appleCollectionId: "",
      appleUrl: "",
      rssUrl: normalizeUrl(trimmed),
      websiteUrl: "",
    };
  }

  if (isHttpUrl(trimmed)) {
    return {
      seedType: "website",
      rawValue: trimmed,
      titleQuery: "",
      appleCollectionId: "",
      appleUrl: "",
      rssUrl: "",
      websiteUrl: normalizeUrl(trimmed),
    };
  }

  return {
    seedType: "title",
    rawValue: trimmed,
    titleQuery: trimmed,
    appleCollectionId: "",
    appleUrl: "",
    rssUrl: "",
    websiteUrl: "",
  };
}

function mapCategoryToGenre(value = "") {
  const normalized = trimText(value, 120).toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized.includes("science fiction") || normalized === "sci-fi" || normalized === "science fiction") {
    return "sci-fi";
  }

  if (normalized.includes("comedy")) {
    return "comedy";
  }

  if (normalized.includes("drama")) {
    return "drama";
  }

  if (normalized.includes("fiction")) {
    return "drama";
  }

  if (normalized.includes("horror")) {
    return "horror";
  }

  if (normalized.includes("mystery")) {
    return "mystery";
  }

  if (normalized.includes("fantasy")) {
    return "fantasy";
  }

  if (normalized.includes("thriller")) {
    return "thriller";
  }

  if (normalized.includes("supernatural")) {
    return "supernatural";
  }

  if (normalized.includes("adventure")) {
    return "adventure";
  }

  return "";
}

function buildResearchGaps(objective = {}) {
  const gaps = [];

  if (!objective.rssUrl) {
    gaps.push("exact RSS feed URL");
  }

  if (!objective.description) {
    gaps.push("spoiler-free description");
  }

  if (!objective.creatorName) {
    gaps.push("creator name");
  }

  if (!objective.latestPublicationDate) {
    gaps.push("latest release date");
  }

  if (!Array.isArray(objective.categories) || objective.categories.length === 0) {
    gaps.push("category/genre mapping");
  }

  return gaps;
}

module.exports = {
  DEFAULT_IMPORT_USER_AGENT,
  IMPORT_CANDIDATE_STATUSES,
  IMPORT_OPEN_STATUSES,
  IMPORT_SCOPE_STATUSES,
  buildHeaders,
  buildResearchGaps,
  cleanDescription,
  decodeHtmlEntities,
  detectSeedEntry,
  extractAppleCollectionId,
  firstNonEmpty,
  isApplePodcastUrl,
  isHttpUrl,
  looksLikeRssUrl,
  mapCategoryToGenre,
  mergeUniqueStrings,
  normalizeStringArray,
  normalizeTitleCreatorKey,
  normalizeUrl,
  normalizeWhitespace,
  parseDateValue,
  resolveUrl,
  safeJsonParse,
  slugify,
  stripHtml,
  toDateStamp,
  trimText,
};
