const {
  cleanDescription,
  decodeHtmlEntities,
  normalizeUrl,
  safeJsonParse,
  resolveUrl,
  trimText,
} = require("../utils");
const { fetchTextWithLimits } = require("../fetch");

function getAttributeMap(tag = "") {
  const attributes = {};
  const attributePattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const match of String(tag || "").matchAll(attributePattern)) {
    const [, rawName, , doubleQuotedValue, singleQuotedValue, bareValue] = match;
    attributes[String(rawName || "").toLowerCase()] = decodeHtmlEntities(
      doubleQuotedValue ?? singleQuotedValue ?? bareValue ?? "",
    );
  }

  return attributes;
}

function getMetaContent(metaTags = [], ...keys) {
  for (const key of keys) {
    const found = metaTags.find((tag) => String(tag.property || tag.name || "").toLowerCase() === key);
    const content = trimText(found?.content || "", 1200);
    if (content) {
      return content;
    }
  }

  return "";
}

function extractHtmlLanguage(html = "") {
  return trimText((String(html || "").match(/<html\b[^>]*\blang=(["'])(.*?)\1/i) || [])[2] || "", 40).toLowerCase();
}

function extractAlternateFeedUrl(html = "", sourceUrl = "") {
  for (const match of String(html || "").matchAll(/<link\b[^>]*>/gi)) {
    const attributes = getAttributeMap(match[0]);
    const rel = trimText(attributes.rel || "", 200).toLowerCase();
    const type = trimText(attributes.type || "", 200).toLowerCase();
    if (!rel.includes("alternate") || !/(rss|atom)\+xml/.test(type)) {
      continue;
    }

    const resolved = resolveUrl(attributes.href || "", sourceUrl);
    if (resolved) {
      return resolved;
    }
  }

  return "";
}

function extractAnchorUrls(html = "", sourceUrl = "") {
  const values = [];
  const seen = new Set();

  for (const match of String(html || "").matchAll(/<a\b[^>]*>/gi)) {
    const attributes = getAttributeMap(match[0]);
    const resolved = resolveUrl(attributes.href || "", sourceUrl);
    const key = resolved.toLowerCase();
    if (!resolved || seen.has(key)) {
      continue;
    }

    seen.add(key);
    values.push(resolved);
  }

  return values;
}

function normalizeSameAsUrls(value, sourceUrl = "") {
  const items = Array.isArray(value) ? value : [value];
  const urls = [];
  const seen = new Set();

  items.forEach((entry) => {
    const resolved = resolveUrl(typeof entry === "string" ? entry : entry?.url || "", sourceUrl);
    const key = resolved.toLowerCase();
    if (!resolved || seen.has(key)) {
      return;
    }

    seen.add(key);
    urls.push(resolved);
  });

  return urls;
}

function readJsonLdNodeText(value) {
  if (typeof value === "string") {
    return trimText(decodeHtmlEntities(value), 1200);
  }

  if (value && typeof value === "object") {
    return trimText(
      value.name ||
        value.text ||
        value["@value"] ||
        value.alternateName ||
        value.legalName ||
        "",
      1200,
    );
  }

  return "";
}

function flattenJsonLdNodes(value, results = []) {
  if (!value) {
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => flattenJsonLdNodes(entry, results));
    return results;
  }

  if (value && typeof value === "object") {
    results.push(value);

    if (Array.isArray(value["@graph"])) {
      value["@graph"].forEach((entry) => flattenJsonLdNodes(entry, results));
    }
  }

  return results;
}

function parseJsonLdBlocks(html = "") {
  const blocks = [];

  for (const match of String(html || "").matchAll(
    /<script\b[^>]*type=(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const parsed = safeJsonParse(match[2], null);
    if (parsed !== null) {
      blocks.push(parsed);
    }
  }

  return blocks.flatMap((block) => flattenJsonLdNodes(block, []));
}

function classifyOfficialUrl(url = "") {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (hostname === "patreon.com" || hostname.endsWith(".patreon.com")) {
      return "patreonUrl";
    }

    if (hostname === "discord.gg" || hostname === "discord.com" || hostname.endsWith(".discord.com")) {
      return "discordUrl";
    }

    if (hostname === "youtube.com" || hostname === "youtu.be" || hostname.endsWith(".youtube.com")) {
      return "youtubeUrl";
    }

    if (hostname === "open.spotify.com" && pathname.startsWith("/show/")) {
      return "spotifyUrl";
    }

    if (hostname === "podcasts.apple.com" || hostname === "itunes.apple.com") {
      return "appleUrl";
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function extractOfficialLinkHints(urls = []) {
  return urls.reduce(
    (accumulator, url) => {
      const fieldName = classifyOfficialUrl(url);
      if (fieldName && !accumulator[fieldName]) {
        accumulator[fieldName] = url;
      }
      return accumulator;
    },
    {
      appleUrl: "",
      spotifyUrl: "",
      patreonUrl: "",
      discordUrl: "",
      youtubeUrl: "",
    },
  );
}

function pickPrimaryJsonLdNode(nodes = []) {
  const preferredTypes = ["podcastseries", "podcastseason", "podcast", "audioobject", "creativework", "organization"];

  return [...nodes].sort((left, right) => {
    const leftTypes = []
      .concat(left?.["@type"] || [])
      .map((entry) => String(entry || "").toLowerCase());
    const rightTypes = []
      .concat(right?.["@type"] || [])
      .map((entry) => String(entry || "").toLowerCase());

    const leftRank = preferredTypes.findIndex((type) => leftTypes.includes(type));
    const rightRank = preferredTypes.findIndex((type) => rightTypes.includes(type));

    return (leftRank === -1 ? preferredTypes.length : leftRank) - (rightRank === -1 ? preferredTypes.length : rightRank);
  })[0] || null;
}

function parseWebsiteHtml(html = "", sourceUrl = "") {
  const normalizedHtml = String(html || "");
  const title = trimText((normalizedHtml.match(/<title>([\s\S]*?)<\/title>/i) || [])[1], 240) || "";
  const metaTags = Array.from(String(html || "").matchAll(/<meta\b[^>]*>/gi)).map((match) => getAttributeMap(match[0]));
  const jsonLdNodes = parseJsonLdBlocks(normalizedHtml);
  const primaryNode = pickPrimaryJsonLdNode(jsonLdNodes);
  const linkedUrls = [
    ...extractAnchorUrls(normalizedHtml, sourceUrl),
    ...normalizeSameAsUrls(primaryNode?.sameAs || [], sourceUrl),
    ...normalizeSameAsUrls(jsonLdNodes.flatMap((node) => node?.sameAs || []), sourceUrl),
  ];
  const officialLinkHints = extractOfficialLinkHints(linkedUrls);
  const imageValue = primaryNode?.image?.url || primaryNode?.image || getMetaContent(metaTags, "og:image", "twitter:image");
  const creatorName =
    readJsonLdNodeText(primaryNode?.author) ||
    readJsonLdNodeText(primaryNode?.creator) ||
    trimText(getMetaContent(metaTags, "author"), 240);
  const networkName =
    readJsonLdNodeText(primaryNode?.publisher) ||
    readJsonLdNodeText(primaryNode?.provider) ||
    trimText(getMetaContent(metaTags, "og:site_name"), 240);

  return {
    title:
      trimText(
        readJsonLdNodeText(primaryNode?.name) ||
          getMetaContent(metaTags, "og:title", "twitter:title"),
        240,
      ) || title,
    creatorName,
    description: cleanDescription(
      readJsonLdNodeText(primaryNode?.description) ||
        getMetaContent(metaTags, "og:description", "description", "twitter:description"),
    ),
    websiteUrl: normalizeUrl(sourceUrl),
    artworkUrl: resolveUrl(imageValue, sourceUrl),
    rssUrl: extractAlternateFeedUrl(normalizedHtml, sourceUrl),
    language: trimText(
      readJsonLdNodeText(primaryNode?.inLanguage) ||
        extractHtmlLanguage(normalizedHtml),
      40,
    ).toLowerCase(),
    appleUrl: officialLinkHints.appleUrl,
    spotifyUrl: officialLinkHints.spotifyUrl,
    patreonUrl: officialLinkHints.patreonUrl,
    discordUrl: officialLinkHints.discordUrl,
    youtubeUrl: officialLinkHints.youtubeUrl,
    networkName,
  };
}

function createWebsiteAdapter({ fetchImpl = globalThis.fetch, userAgent, timeoutMs = 15_000, maxBytes = 5 * 1024 * 1024 } = {}) {
  async function fetchByUrl(url) {
    const { response, text: html } = await fetchTextWithLimits(fetchImpl, url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": userAgent,
      },
    }, { timeoutMs, maxBytes, label: "Website request" });

    if (!response.ok) {
      throw new Error(`Website request failed with ${response.status}`);
    }

    return {
      sourceType: "website",
      sourceKey: normalizeUrl(response.url || url),
      sourceUrl: normalizeUrl(response.url || url),
      raw: {
        contentType: response.headers.get("content-type") || "",
        html,
      },
      normalized: parseWebsiteHtml(html, response.url || url),
    };
  }

  return {
    fetchByUrl,
    parseWebsiteHtml,
  };
}

module.exports = {
  createWebsiteAdapter,
  parseWebsiteHtml,
};
