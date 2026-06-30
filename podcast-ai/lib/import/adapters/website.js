const {
  cleanDescription,
  decodeHtmlEntities,
  normalizeUrl,
  resolveUrl,
  trimText,
} = require("../utils");

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

function parseWebsiteHtml(html = "", sourceUrl = "") {
  const title =
    trimText((String(html || "").match(/<title>([\s\S]*?)<\/title>/i) || [])[1], 240) || "";
  const metaTags = Array.from(String(html || "").matchAll(/<meta\b[^>]*>/gi)).map((match) => getAttributeMap(match[0]));
  const getMetaContent = (...keys) => {
    for (const key of keys) {
      const found = metaTags.find((tag) => String(tag.property || tag.name || "").toLowerCase() === key);
      const content = trimText(found?.content || "", 1200);
      if (content) {
        return content;
      }
    }

    return "";
  };

  return {
    title,
    creatorName: "",
    description: cleanDescription(getMetaContent("og:description", "description", "twitter:description")),
    websiteUrl: normalizeUrl(sourceUrl),
    artworkUrl: resolveUrl(getMetaContent("og:image", "twitter:image"), sourceUrl),
  };
}

function createWebsiteAdapter({ fetchImpl = globalThis.fetch, userAgent } = {}) {
  async function fetchByUrl(url) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`Website request failed with ${response.status}`);
    }

    const html = await response.text();

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
