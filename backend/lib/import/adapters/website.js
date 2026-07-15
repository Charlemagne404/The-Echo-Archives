const cheerio = require("cheerio");

const {
  cleanDescription,
  mergeUniqueStrings,
  normalizeUrl,
  resolveUrl,
  safeJsonParse,
  trimText,
} = require("../utils");
const { fetchTextWithLimits, throwForUpstreamStatus } = require("../fetch");

const CRAWL_HINT = /\b(listen|about|cast|credits?|episodes?|transcripts?)\b/i;

function flattenJsonLdNodes(value, results = []) {
  if (!value) return results;
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenJsonLdNodes(entry, results));
  } else if (typeof value === "object") {
    results.push(value);
    flattenJsonLdNodes(value["@graph"], results);
  }
  return results;
}

function readNodeText(value) {
  if (typeof value === "string") return trimText(value, 2_000);
  if (Array.isArray(value)) return trimText(value.map(readNodeText).filter(Boolean).join(", "), 2_000);
  if (value && typeof value === "object") return trimText(value.name || value.text || value["@value"] || value.alternateName || value.legalName || "", 2_000);
  return "";
}

function classifyOfficialUrl(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host === "podcasts.apple.com" || host === "itunes.apple.com") return "apple";
    if (host === "open.spotify.com" && path.startsWith("/show/")) return "spotify";
    if (host === "music.youtube.com" && (path.startsWith("/playlist") || path.startsWith("/channel"))) return "youtubeMusic";
    if (host === "music.amazon.com" || host.endsWith(".amazon.com") && path.includes("podcast")) return "amazonMusic";
    if (host === "pca.st" || host === "pocketcasts.com") return "pocketCasts";
    if (host === "patreon.com" || host.endsWith(".patreon.com")) return "patreon";
    if (host === "ko-fi.com" || host.endsWith(".ko-fi.com")) return "koFi";
    if (host === "discord.gg" || host === "discord.com" || host.endsWith(".discord.com")) return "discord";
    if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "youtube";
    if (host === "instagram.com" || host === "facebook.com" || host === "threads.net" || host === "x.com" || host === "twitter.com" || host === "bsky.app" || host === "tiktok.com") return "social";
  } catch (_error) {
    return "";
  }
  return "";
}

function jsonLdNodes($) {
  const nodes = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    const parsed = safeJsonParse($(element).text(), null);
    if (parsed !== null) flattenJsonLdNodes(parsed, nodes);
  });
  return nodes;
}

function nodeTypes(node) {
  return [].concat(node?.["@type"] || []).map((value) => String(value || "").toLowerCase());
}

function pickPrimaryNode(nodes = []) {
  const preferred = ["podcastseries", "podcastseason", "podcast", "audioobject", "creativework", "organization"];
  return [...nodes].sort((left, right) => {
    const leftRank = preferred.findIndex((type) => nodeTypes(left).includes(type));
    const rightRank = preferred.findIndex((type) => nodeTypes(right).includes(type));
    return (leftRank < 0 ? preferred.length : leftRank) - (rightRank < 0 ? preferred.length : rightRank);
  })[0] || null;
}

function metaContent($, ...keys) {
  for (const key of keys) {
    const content = trimText($(`meta[property="${key}"], meta[name="${key}"]`).first().attr("content") || "", 4_000);
    if (content) return content;
  }
  return "";
}

function normalizePerson(value, role = "") {
  const name = readNodeText(value);
  if (!name) return null;
  return {
    name: trimText(name, 240),
    role: trimText(role || value?.jobTitle || "creator", 100).toLowerCase(),
    url: normalizeUrl(value?.url || ""),
  };
}

function parseWebsiteHtml(html = "", sourceUrl = "") {
  const $ = cheerio.load(String(html || ""));
  const nodes = jsonLdNodes($);
  const primaryNode = pickPrimaryNode(nodes);
  const links = [];
  const crawlUrls = [];
  const officialLinks = {};
  const socialUrls = [];
  const sourceOrigin = (() => { try { return new URL(sourceUrl).origin; } catch (_error) { return ""; } })();

  $("a[href]").each((_index, element) => {
    const href = resolveUrl($(element).attr("href") || "", sourceUrl);
    if (!href) return;
    const label = trimText($(element).text() || $(element).attr("aria-label") || $(element).attr("title") || "", 240);
    links.push({ url: href, label });
    const classification = classifyOfficialUrl(href);
    if (classification === "social") socialUrls.push(href);
    else if (classification && !officialLinks[classification]) officialLinks[classification] = href;
    try {
      const parsed = new URL(href);
      if (parsed.origin === sourceOrigin && parsed.pathname !== new URL(sourceUrl).pathname && CRAWL_HINT.test(`${label} ${parsed.pathname}`)) crawlUrls.push(href);
    } catch (_error) {
      // Ignore malformed links already rejected by resolveUrl.
    }
  });

  nodes.flatMap((node) => [].concat(node.sameAs || [])).forEach((entry) => {
    const url = resolveUrl(typeof entry === "string" ? entry : entry?.url || "", sourceUrl);
    const classification = classifyOfficialUrl(url);
    if (classification === "social") socialUrls.push(url);
    else if (classification && !officialLinks[classification]) officialLinks[classification] = url;
  });

  const people = [];
  nodes.forEach((node) => {
    [[node.author, "author"], [node.creator, "creator"], [node.actor, "cast"], [node.director, "director"], [node.producer, "producer"]].forEach(([value, role]) => {
      [].concat(value || []).forEach((entry) => {
        const person = normalizePerson(entry, role);
        if (person) people.push(person);
      });
    });
  });
  const dedupedPeople = [...new Map(people.map((person) => [`${person.name.toLowerCase()}|${person.role}`, person])).values()];
  const feedLink = $('link[rel~="alternate"][type*="rss"], link[rel~="alternate"][type*="atom"]').first().attr("href") || "";
  const image = primaryNode?.image?.url || primaryNode?.image || metaContent($, "og:image", "twitter:image");
  const title = readNodeText(primaryNode?.name) || metaContent($, "og:title", "twitter:title") || trimText($("title").first().text(), 240);
  const creatorName = readNodeText(primaryNode?.author) || readNodeText(primaryNode?.creator) || metaContent($, "author");
  const networkName = readNodeText(primaryNode?.publisher) || readNodeText(primaryNode?.provider) || metaContent($, "og:site_name");
  const evidenceText = $("main, article").first().find("h1, h2, p").map((_index, element) => cleanDescription($(element).text(), 500)).get().filter(Boolean).slice(0, 8);

  return {
    title: trimText(title, 240),
    creatorName: trimText(creatorName, 240),
    description: cleanDescription(readNodeText(primaryNode?.description) || metaContent($, "og:description", "description", "twitter:description"), 4_000),
    websiteUrl: normalizeUrl(sourceUrl),
    artworkUrl: resolveUrl(image, sourceUrl),
    rssUrl: resolveUrl(feedLink, sourceUrl),
    language: trimText(readNodeText(primaryNode?.inLanguage) || $("html").attr("lang") || "", 40).toLowerCase(),
    networkName: trimText(networkName, 240),
    people: dedupedPeople,
    officialLinks,
    appleUrl: officialLinks.apple || "",
    spotifyUrl: officialLinks.spotify || "",
    youtubeMusicUrl: officialLinks.youtubeMusic || "",
    amazonMusicUrl: officialLinks.amazonMusic || "",
    pocketCastsUrl: officialLinks.pocketCasts || "",
    patreonUrl: officialLinks.patreon || "",
    koFiUrl: officialLinks.koFi || "",
    discordUrl: officialLinks.discord || "",
    youtubeUrl: officialLinks.youtube || "",
    socialUrls: mergeUniqueStrings(socialUrls),
    crawlUrls: mergeUniqueStrings(crawlUrls).slice(0, 4),
    structured: Boolean(primaryNode),
    evidenceText,
    labeledLinks: links.filter((link) => link.label).slice(0, 100),
  };
}

function mergeWebsitePages(results = []) {
  const normalized = { ...(results[0]?.normalized || {}) };
  const listFields = ["people", "socialUrls", "evidenceText", "labeledLinks"];
  listFields.forEach((field) => {
    const values = results.flatMap((result) => result.normalized?.[field] || []);
    normalized[field] = field === "people" || field === "labeledLinks"
      ? [...new Map(values.map((entry) => [JSON.stringify(entry), entry])).values()]
      : mergeUniqueStrings(values);
  });
  const linkFields = ["appleUrl", "spotifyUrl", "youtubeMusicUrl", "amazonMusicUrl", "pocketCastsUrl", "patreonUrl", "koFiUrl", "discordUrl", "youtubeUrl", "rssUrl", "artworkUrl"];
  linkFields.forEach((field) => {
    normalized[field] = results.map((result) => result.normalized?.[field]).find(Boolean) || normalized[field] || "";
  });
  normalized.crawledPages = results.map((result) => result.sourceUrl);
  delete normalized.crawlUrls;
  return normalized;
}

function createWebsiteAdapter({ fetchImpl = globalThis.fetch, userAgent, timeoutMs = 15_000, maxBytes = 5 * 1024 * 1024 } = {}) {
  async function fetchByUrl(url) {
    const { response, text: html, resolvedUrl } = await fetchTextWithLimits(fetchImpl, url, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": userAgent },
    }, {
      timeoutMs, maxBytes, label: "Website request", allowedContentTypes: ["text/html", "application/xhtml+xml"],
    });
    throwForUpstreamStatus(response, "Website request");
    const sourceUrl = normalizeUrl(resolvedUrl || url);
    return {
      sourceType: "website",
      sourceKey: sourceUrl,
      sourceUrl,
      httpStatus: response.status,
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
      raw: { contentType: response.headers.get("content-type") || "", text: html },
      normalized: parseWebsiteHtml(html, sourceUrl),
    };
  }

  async function crawlByUrl(url) {
    const homepage = await fetchByUrl(url);
    const results = [homepage];
    for (const crawlUrl of homepage.normalized.crawlUrls.slice(0, 4)) {
      try {
        const secondary = await fetchByUrl(crawlUrl);
        secondary.normalized.isSecondaryPage = true;
        results.push(secondary);
      } catch (_error) {
        // Optional depth-one pages improve evidence but never invalidate the homepage.
      }
    }
    return { results, normalized: mergeWebsitePages(results) };
  }

  return { crawlByUrl, fetchByUrl, mergeWebsitePages, parseWebsiteHtml };
}

module.exports = { classifyOfficialUrl, createWebsiteAdapter, mergeWebsitePages, parseWebsiteHtml };
