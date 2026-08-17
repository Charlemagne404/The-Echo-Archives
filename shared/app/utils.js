import { DEFAULT_SOCIAL_IMAGE, archiveRecord } from "./constants.js";

export function getRuntimeLabel(show) {
  return show.length?.label || "Runtime still being filled in";
}

export function formatCount(value, singular, plural) {
  return archiveRecord.formatCount(value, singular, plural);
}

export function formatRouteExpansion(value) {
  return archiveRecord.formatRouteExpansion(value);
}

export function getFormatLabel(show) {
  if (typeof show.length?.seasons === "number" && show.length.seasons > 0) {
    return formatCount(show.length.seasons, "season");
  }

  if (show.formats.length > 0) {
    return show.formats.map((format) => toDisplayTag(format)).join(" • ");
  }

  return "Format still being filled in";
}

export function toDisplayTag(value = "") {
  return archiveRecord.toPublicLabel(value);
}

export function toLabel(value = "") {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeTag(tag) {
  return String(tag).trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
}

export function formatRating(value) {
  if (value === null || value === undefined) {
    return "--";
  }

  if (typeof value === "string" && !value.trim()) {
    return "--";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

export function normalizeArchiveRating(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    return null;
  }

  return value;
}

function parseDisplayDate(value) {
  const text = String(value || "").trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    const isSameDate =
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day);
    return isSameDate ? date : null;
  }

  return text ? new Date(text) : null;
}

export function formatDate(value) {
  const date = parseDisplayDate(value);
  if (!date) {
    return value ? "Date needs review" : "Not listed yet";
  }

  if (Number.isNaN(date.getTime())) {
    return "Date needs review";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatCompactDate(value) {
  const date = parseDisplayDate(value);
  if (!date) {
    return value ? "Needs review" : "Not cataloged";
  }

  if (Number.isNaN(date.getTime())) {
    return "Needs review";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function addMediaQueryListener(mediaQueryList, listener) {
  if (!mediaQueryList || typeof listener !== "function") {
    return () => {};
  }

  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", listener);
    return () => mediaQueryList.removeEventListener("change", listener);
  }

  if (typeof mediaQueryList.addListener === "function") {
    mediaQueryList.addListener(listener);
    return () => mediaQueryList.removeListener(listener);
  }

  return () => {};
}

const DEFAULT_SOCIAL_IMAGE_ALT = "The Echo Archives social preview";

export function getSiteOrigin() {
  const configuredSiteUrl = document.body?.dataset.siteUrl?.trim();
  const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  const candidates = [configuredSiteUrl, canonicalHref, window.location.origin];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      return new URL(candidate, window.location.origin).origin;
    } catch (_error) {
      // Try the next source of public site configuration.
    }
  }

  return window.location.origin;
}

export function buildSiteAbsoluteUrl(value = "") {
  const fallback = new URL(DEFAULT_SOCIAL_IMAGE, getSiteOrigin()).toString();
  if (!value) {
    return fallback;
  }

  try {
    return new URL(value, `${getSiteOrigin()}/`).toString();
  } catch (_error) {
    return fallback;
  }
}

function setMetaContent(selector, value) {
  const node = document.querySelector(selector);
  if (node) {
    node.setAttribute("content", value);
  }
}

function setCanonicalHref(value) {
  const node = document.querySelector('link[rel="canonical"]');
  if (node) {
    node.setAttribute("href", value);
  }
}

function serializeStructuredData(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function syncStructuredData(value) {
  let node = document.getElementById("pageStructuredData");
  if (!value) {
    node?.remove();
    return;
  }

  if (!(node instanceof HTMLScriptElement)) {
    node?.remove();
    node = document.createElement("script");
    node.id = "pageStructuredData";
    node.type = "application/ld+json";
    document.head.appendChild(node);
  }
  node.textContent = serializeStructuredData(value);
}

export function updateDocumentMetadata({ title, description, path, image, imageAlt, structuredData }) {
  const resolvedTitle = title || "The Echo Archives";
  const resolvedDescription =
    description || "An archive for discovering fiction podcasts by mood, tone, format, completion status, and similar shows.";
  const resolvedUrl = buildSiteAbsoluteUrl(path || window.location.pathname);
  const resolvedImage = buildSiteAbsoluteUrl(image || DEFAULT_SOCIAL_IMAGE);
  const resolvedImageAlt = imageAlt || DEFAULT_SOCIAL_IMAGE_ALT;

  document.title = resolvedTitle;
  setMetaContent('meta[name="description"]', resolvedDescription);
  setMetaContent('meta[property="og:title"]', resolvedTitle);
  setMetaContent('meta[property="og:description"]', resolvedDescription);
  setMetaContent('meta[property="og:url"]', resolvedUrl);
  setMetaContent('meta[property="og:image"]', resolvedImage);
  setMetaContent('meta[property="og:image:alt"]', resolvedImageAlt);
  setMetaContent('meta[name="twitter:title"]', resolvedTitle);
  setMetaContent('meta[name="twitter:description"]', resolvedDescription);
  setMetaContent('meta[name="twitter:image"]', resolvedImage);
  setMetaContent('meta[name="twitter:image:alt"]', resolvedImageAlt);
  setCanonicalHref(resolvedUrl);
  syncStructuredData(structuredData);
}

export function setTextContent(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHighlightTerms(terms = []) {
  return Array.from(
    new Set(
      (Array.isArray(terms) ? terms : [terms])
        .map((term) => String(term || "").trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length),
    ),
  );
}

export function buildHighlightedHtml(value = "", terms = []) {
  const text = String(value || "");
  const normalizedTerms = normalizeHighlightTerms(terms);
  if (!text || normalizedTerms.length === 0) {
    return escapeHtml(text);
  }

  const pattern = normalizedTerms.map((term) => escapeRegExp(term)).join("|");
  if (!pattern) {
    return escapeHtml(text);
  }

  const matcher = new RegExp(`(${pattern})`, "gi");
  return escapeHtml(text).replace(
    matcher,
    (match) => `<mark class="search-highlight">${escapeHtml(match)}</mark>`,
  );
}

export function setHighlightedText(node, value = "", terms = []) {
  if (!(node instanceof HTMLElement)) {
    return;
  }

  node.innerHTML = buildHighlightedHtml(value, terms);
}
