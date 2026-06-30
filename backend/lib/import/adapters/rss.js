const {
  cleanDescription,
  decodeHtmlEntities,
  normalizeStringArray,
  normalizeUrl,
  parseDateValue,
  resolveUrl,
  trimText,
} = require("../utils");

function extractFirstMatch(text = "", pattern) {
  const match = String(text || "").match(pattern);
  return match ? trimText(decodeHtmlEntities(match[1])) : "";
}

function extractAllMatches(text = "", pattern) {
  return normalizeStringArray(
    Array.from(String(text || "").matchAll(pattern)).map((match) => trimText(decodeHtmlEntities(match.at(-1) || ""))),
    24,
  );
}

function parseRssText(text = "", sourceUrl = "") {
  const channelMatch = String(text || "").match(/<channel\b[\s\S]*?<\/channel>/i);
  const searchText = channelMatch ? channelMatch[0] : String(text || "");
  const title =
    extractFirstMatch(searchText, /<title><!\[CDATA\[(.*?)\]\]><\/title>/i) ||
    extractFirstMatch(searchText, /<title>(.*?)<\/title>/i);
  const creatorName =
    extractFirstMatch(searchText, /<itunes:author>(.*?)<\/itunes:author>/i) ||
    extractFirstMatch(searchText, /<managingEditor>(.*?)<\/managingEditor>/i);
  const description =
    cleanDescription(
      extractFirstMatch(searchText, /<itunes:summary><!\[CDATA\[([\s\S]*?)\]\]><\/itunes:summary>/i) ||
        extractFirstMatch(searchText, /<itunes:summary>([\s\S]*?)<\/itunes:summary>/i) ||
        extractFirstMatch(searchText, /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ||
        extractFirstMatch(searchText, /<description>([\s\S]*?)<\/description>/i),
    ) || "";
  const websiteUrl = resolveUrl(
    extractFirstMatch(searchText, /<link>(.*?)<\/link>/i),
    sourceUrl,
  );
  const artworkUrl =
    resolveUrl(((searchText.match(/<itunes:image\b[^>]*\bhref=(["'])(.*?)\1/i) || [])[2]) || "", sourceUrl) ||
    resolveUrl(extractFirstMatch(searchText, /<image\b[\s\S]*?<url>\s*([^<]+?)\s*<\/url>/i), sourceUrl);
  const language = extractFirstMatch(searchText, /<language>(.*?)<\/language>/i).toLowerCase();
  const explicit = extractFirstMatch(searchText, /<itunes:explicit>(.*?)<\/itunes:explicit>/i).toLowerCase();
  const categories = extractAllMatches(searchText, /<itunes:category\b[^>]*\btext=(["'])(.*?)\1/gi);
  const pubDates = extractAllMatches(String(text || ""), /<pubDate>(.*?)<\/pubDate>/gi)
    .map((value) => parseDateValue(value))
    .filter(Boolean)
    .sort();

  return {
    title,
    creatorName,
    description,
    rssUrl: normalizeUrl(sourceUrl),
    websiteUrl,
    artworkUrl,
    language,
    categories,
    explicit,
    episodeCount: (String(text || "").match(/<item\b/gi) || []).length || null,
    latestPublicationDate: pubDates.at(-1) || "",
  };
}

function createRssAdapter({ fetchImpl = globalThis.fetch, userAgent } = {}) {
  async function fetchByUrl(url) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, text/plain;q=0.8, */*;q=0.7",
        "User-Agent": userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`RSS request failed with ${response.status}`);
    }

    const text = await response.text();

    return {
      sourceType: "rss",
      sourceKey: normalizeUrl(response.url || url),
      sourceUrl: normalizeUrl(response.url || url),
      raw: {
        contentType: response.headers.get("content-type") || "",
        text,
      },
      normalized: parseRssText(text, response.url || url),
    };
  }

  return {
    fetchByUrl,
    parseRssText,
  };
}

module.exports = {
  createRssAdapter,
  parseRssText,
};
