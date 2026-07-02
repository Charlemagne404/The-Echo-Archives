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

function parseDurationMinutes(value = "") {
  const trimmed = trimText(value, 40);
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null;
  }

  const parts = trimmed.split(":").map((entry) => Number.parseInt(entry, 10));
  if (parts.some((entry) => !Number.isInteger(entry) || entry < 0) || parts.length < 2 || parts.length > 3) {
    return null;
  }

  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0], parts[1]];
  const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
  return totalSeconds > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : null;
}

function parseRssText(text = "", sourceUrl = "") {
  const channelMatch = String(text || "").match(/<channel\b[\s\S]*?<\/channel>/i);
  const searchText = channelMatch ? channelMatch[0] : String(text || "");
  const title =
    extractFirstMatch(searchText, /<title><!\[CDATA\[(.*?)\]\]><\/title>/i) ||
    extractFirstMatch(searchText, /<title>(.*?)<\/title>/i);
  const creatorName =
    extractFirstMatch(searchText, /<itunes:author>(.*?)<\/itunes:author>/i) ||
    extractFirstMatch(searchText, /<itunes:owner>\s*<itunes:name>(.*?)<\/itunes:name>/i) ||
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
  const seasonNumbers = extractAllMatches(String(text || ""), /<itunes:season>(.*?)<\/itunes:season>/gi)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  const durationMinutes = extractAllMatches(String(text || ""), /<itunes:duration>(.*?)<\/itunes:duration>/gi)
    .map((value) => parseDurationMinutes(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  const completeValue = extractFirstMatch(searchText, /<itunes:complete>(.*?)<\/itunes:complete>/i);

  return {
    title,
    creatorName,
    subtitle: cleanDescription(extractFirstMatch(searchText, /<itunes:subtitle>([\s\S]*?)<\/itunes:subtitle>/i), 240),
    description,
    rssUrl: normalizeUrl(sourceUrl),
    websiteUrl,
    artworkUrl,
    language,
    categories,
    explicit,
    episodeCount: (String(text || "").match(/<item\b/gi) || []).length || null,
    firstPublicationDate: pubDates[0] || "",
    latestPublicationDate: pubDates.at(-1) || "",
    avgEpisodeMinutes:
      durationMinutes.length > 0
        ? Math.round(durationMinutes.reduce((sum, value) => sum + value, 0) / durationMinutes.length)
        : null,
    seasonCount: seasonNumbers.length > 0 ? Math.max(...seasonNumbers) : null,
    feedType: trimText(extractFirstMatch(searchText, /<itunes:type>(.*?)<\/itunes:type>/i), 80).toLowerCase(),
    complete: completeValue ? /^(yes|true|1)$/i.test(completeValue) : null,
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
