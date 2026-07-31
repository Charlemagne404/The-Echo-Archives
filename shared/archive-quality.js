const CANONICAL_GENRES = new Set([
  "adventure",
  "comedy",
  "drama",
  "fantasy",
  "horror",
  "mystery",
  "sci-fi",
  "science",
  "supernatural",
  "thriller",
]);

const MIN_PUBLISHED_DESCRIPTION_LENGTH = 40;
const NON_WEBSITE_HOSTS = new Set([
  "bsky.app",
  "facebook.com",
  "instagram.com",
  "linktr.ee",
  "patreon.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
]);

function comparableText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPlaceholderDescription(title = "", description = "") {
  const text = String(description || "").trim();
  if (text.length < MIN_PUBLISHED_DESCRIPTION_LENGTH) return true;
  return comparableText(text) === comparableText(title);
}

function normalizedHostname(value = "") {
  try {
    return new URL(String(value || "").trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
}

function isNonWebsiteUrl(value = "") {
  const hostname = normalizedHostname(value);
  return Boolean(hostname && NON_WEBSITE_HOSTS.has(hostname));
}

function appleCollectionIdFromUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    if (!["itunes.apple.com", "podcasts.apple.com"].includes(url.hostname.toLowerCase())) return "";
    return url.pathname.match(/\/id(\d+)/i)?.[1] || "";
  } catch (_error) {
    return "";
  }
}

module.exports = {
  CANONICAL_GENRES,
  MIN_PUBLISHED_DESCRIPTION_LENGTH,
  NON_WEBSITE_HOSTS,
  appleCollectionIdFromUrl,
  comparableText,
  isNonWebsiteUrl,
  isPlaceholderDescription,
};
