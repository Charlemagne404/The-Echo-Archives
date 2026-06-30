const fs = require("node:fs");
const path = require("node:path");

const COVER_SOURCE_TIMEOUT_MS = 10_000;
const COVER_SYNC_USER_AGENT = "TheEchoArchivesCoverSync/1.0 (+https://echo.continental-hub.com)";
const MANAGED_COVERS_DIR = "images/covers";
const PLACEHOLDER_COVER = "images/TEA-Logo-S.png";

function isHttpUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function toLocalCoverPath(value = "") {
  return String(value || "").trim().replace(/^\/+/, "");
}

function getDefaultCoverAlt(record) {
  const title = String(record?.title || "").trim() || "Show";
  return `${title} cover art`;
}

function getLocalCoverAbsolutePath(siteRoot, coverPath = "") {
  return path.join(siteRoot, toLocalCoverPath(coverPath));
}

function decodeHtmlEntities(value = "") {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function resolveUrl(value = "", baseUrl = "") {
  const trimmed = decodeHtmlEntities(String(value || "").trim());
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed, baseUrl || undefined).href;
  } catch (_error) {
    return "";
  }
}

function getSourceCandidates(record) {
  const candidates = [
    { type: "rss", label: "listenLinks.rss", url: record?.listenLinks?.rss },
    { type: "apple", label: "listenLinks.apple", url: record?.listenLinks?.apple },
    { type: "website", label: "officialLinks.website", url: record?.officialLinks?.website },
    { type: "website", label: "listenLinks.website", url: record?.listenLinks?.website },
  ];
  const seen = new Set();

  return candidates.filter((candidate) => {
    const url = String(candidate.url || "").trim();
    if (!isHttpUrl(url) || seen.has(url)) {
      return false;
    }

    seen.add(url);
    candidate.url = url;
    return true;
  });
}

function getAttributeMap(tag = "") {
  const attributes = {};
  const attributePattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const match of tag.matchAll(attributePattern)) {
    const [, rawName, , doubleQuotedValue, singleQuotedValue, bareValue] = match;
    const name = String(rawName || "").toLowerCase();
    const value = doubleQuotedValue ?? singleQuotedValue ?? bareValue ?? "";
    attributes[name] = decodeHtmlEntities(String(value || "").trim());
  }

  return attributes;
}

function extractMetaImageUrl(documentText = "", baseUrl = "") {
  let twitterImage = "";

  for (const match of String(documentText || "").matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = getAttributeMap(match[0]);
    const property = String(attributes.property || "").toLowerCase();
    const name = String(attributes.name || "").toLowerCase();
    const content = resolveUrl(attributes.content || "", baseUrl);

    if (!content) {
      continue;
    }

    if (property === "og:image") {
      return content;
    }

    if (!twitterImage && name === "twitter:image") {
      twitterImage = content;
    }
  }

  return twitterImage;
}

function extractRssImageUrl(documentText = "", baseUrl = "") {
  const rssText = String(documentText || "");
  const itunesImageMatch = rssText.match(/<itunes:image\b[^>]*\bhref=(["'])(.*?)\1/i);
  if (itunesImageMatch) {
    return resolveUrl(itunesImageMatch[2], baseUrl);
  }

  const channelMatch = rssText.match(/<channel\b[\s\S]*?<\/channel>/i);
  const searchScope = channelMatch ? channelMatch[0] : rssText;
  const imageUrlMatch = searchScope.match(/<image\b[\s\S]*?<url>\s*([^<]+?)\s*<\/url>/i);
  if (imageUrlMatch) {
    return resolveUrl(imageUrlMatch[1], baseUrl);
  }

  return "";
}

async function fetchWithTimeout(fetchImpl, url, { accept = "*/*" } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COVER_SOURCE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: accept,
        "User-Agent": COVER_SYNC_USER_AGENT,
      },
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchText(fetchImpl, url, parserLabel, accept) {
  const response = await fetchWithTimeout(fetchImpl, url, { accept });
  if (!response.ok) {
    throw new Error(`${parserLabel} request failed with ${response.status}`);
  }

  return {
    url: response.url || url,
    text: await response.text(),
  };
}

function getExtensionFromContentType(contentType = "") {
  const normalizedType = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  const contentTypeMap = new Map([
    ["image/jpeg", ".jpg"],
    ["image/jpg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/gif", ".gif"],
    ["image/avif", ".avif"],
    ["image/svg+xml", ".svg"],
  ]);

  return contentTypeMap.get(normalizedType) || "";
}

function getExtensionFromUrl(url = "") {
  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname).toLowerCase();
    if (!extension) {
      return "";
    }

    if (extension === ".jpeg") {
      return ".jpg";
    }

    if ([".jpg", ".png", ".webp", ".gif", ".avif", ".svg"].includes(extension)) {
      return extension;
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function getManagedCoverRelativePath(showId, imageUrl, contentType) {
  const extension = getExtensionFromContentType(contentType) || getExtensionFromUrl(imageUrl) || ".jpg";
  return path.posix.join(MANAGED_COVERS_DIR, `${showId}${extension}`);
}

function removeStaleManagedCoverVariants(siteRoot, showId, nextRelativePath) {
  const absoluteManagedDir = path.join(siteRoot, MANAGED_COVERS_DIR);
  if (!fs.existsSync(absoluteManagedDir)) {
    return;
  }

  const nextFileName = path.posix.basename(nextRelativePath);
  for (const fileName of fs.readdirSync(absoluteManagedDir)) {
    if (!fileName.startsWith(`${showId}.`) || fileName === nextFileName) {
      continue;
    }

    fs.rmSync(path.join(absoluteManagedDir, fileName), { force: true });
  }
}

async function resolveImageUrlForSource(fetchImpl, source) {
  if (source.type === "rss") {
    const rss = await fetchText(fetchImpl, source.url, source.label, "application/rss+xml, application/xml, text/xml;q=0.9, text/plain;q=0.8");
    const imageUrl = extractRssImageUrl(rss.text, rss.url);
    if (!imageUrl) {
      throw new Error(`${source.label} did not expose an RSS cover image`);
    }

    return imageUrl;
  }

  if (source.type === "apple") {
    const page = await fetchText(fetchImpl, source.url, source.label, "text/html,application/xhtml+xml");
    const imageUrl = extractMetaImageUrl(page.text, page.url);
    if (!imageUrl) {
      throw new Error(`${source.label} did not expose og:image`);
    }

    return imageUrl;
  }

  const page = await fetchText(fetchImpl, source.url, source.label, "text/html,application/xhtml+xml");
  const imageUrl = extractMetaImageUrl(page.text, page.url);
  if (!imageUrl) {
    throw new Error(`${source.label} did not expose og:image or twitter:image`);
  }

  return imageUrl;
}

async function downloadManagedCover(siteRoot, showId, imageUrl, fetchImpl) {
  const response = await fetchWithTimeout(fetchImpl, imageUrl, { accept: "image/*,*/*;q=0.8" });
  if (!response.ok) {
    throw new Error(`cover download failed with ${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(`cover download returned non-image content type "${contentType || "unknown"}"`);
  }

  const relativePath = getManagedCoverRelativePath(showId, response.url || imageUrl, contentType);
  const absolutePath = path.join(siteRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("cover download returned an empty body");
  }

  removeStaleManagedCoverVariants(siteRoot, showId, relativePath);
  fs.writeFileSync(absolutePath, bytes);
  return relativePath;
}

function shouldSyncCover(siteRoot, record) {
  const coverPath = toLocalCoverPath(record?.cover);
  if (!coverPath) {
    return true;
  }

  if (isHttpUrl(coverPath)) {
    return false;
  }

  return !fs.existsSync(getLocalCoverAbsolutePath(siteRoot, coverPath));
}

async function resolveManagedCoverForRecord(siteRoot, record, fetchImpl) {
  const sources = getSourceCandidates(record);
  if (sources.length === 0) {
    return {
      ok: false,
      reason: "no eligible RSS, Apple, or website source links were provided",
    };
  }

  const failures = [];
  for (const source of sources) {
    try {
      const imageUrl = await resolveImageUrlForSource(fetchImpl, source);
      const relativePath = await downloadManagedCover(siteRoot, record.id, imageUrl, fetchImpl);
      return {
        ok: true,
        relativePath,
      };
    } catch (error) {
      failures.push(`${source.label}: ${error.message || error}`);
    }
  }

  return {
    ok: false,
    reason: failures.join("; "),
  };
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function syncShowCovers(
  siteRoot,
  records,
  { fetchImpl = globalThis.fetch, logger = console, persistRecords = null } = {},
) {
  if (!Array.isArray(records) || records.length === 0) {
    return { didPersist: false, warnings: [] };
  }

  const fetchFunction = typeof fetchImpl === "function" ? fetchImpl : null;
  const runtimePatches = [];
  const warnings = [];
  let didPersist = false;

  for (const record of records) {
    if (!shouldSyncCover(siteRoot, record)) {
      continue;
    }

    if (!fetchFunction) {
      const reason = "cover sync requires a fetch implementation";
      warnings.push(`Cover sync warning for "${record.id}": ${reason}`);
      runtimePatches.push({
        record,
        cover: PLACEHOLDER_COVER,
        coverAlt: String(record?.coverAlt || "").trim() ? null : getDefaultCoverAlt(record),
        reason,
      });
      continue;
    }

    const result = await resolveManagedCoverForRecord(siteRoot, record, fetchFunction);
    if (result.ok) {
      record.cover = result.relativePath;
      if (!String(record.coverAlt || "").trim()) {
        record.coverAlt = getDefaultCoverAlt(record);
      }
      didPersist = true;
      continue;
    }

    runtimePatches.push({
      record,
      cover: PLACEHOLDER_COVER,
      coverAlt: String(record?.coverAlt || "").trim() ? null : getDefaultCoverAlt(record),
      reason: result.reason,
    });
    warnings.push(`Cover sync warning for "${record.id}": ${result.reason}`);
  }

  if (didPersist) {
    if (typeof persistRecords === "function") {
      await persistRecords(records);
    } else {
      writeJsonFile(path.join(siteRoot, "data", "shows.json"), records);
    }
  }

  runtimePatches.forEach((patch) => {
    patch.record.cover = patch.cover;
    if (patch.coverAlt) {
      patch.record.coverAlt = patch.coverAlt;
    }
    if (logger && typeof logger.warn === "function") {
      logger.warn(`Cover sync warning for "${patch.record.id}": ${patch.reason}`);
    }
  });

  return { didPersist, warnings };
}

module.exports = {
  MANAGED_COVERS_DIR,
  PLACEHOLDER_COVER,
  extractMetaImageUrl,
  extractRssImageUrl,
  syncShowCovers,
};
