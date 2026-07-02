import { DEFAULT_SOCIAL_IMAGE } from "./constants.js";

export function getRuntimeLabel(show) {
  return show.length?.label || "Runtime still being filled in";
}

export function getFormatLabel(show) {
  if (typeof show.length?.seasons === "number" && show.length.seasons > 0) {
    return `${show.length.seasons} seasons`;
  }

  if (show.formats.length > 0) {
    return show.formats.map((format) => toDisplayTag(format)).join(" • ");
  }

  return "Format still being filled in";
}

export function toDisplayTag(value = "") {
  return String(value)
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z0-9]+$/.test(part)) {
        return part;
      }

      if (part.length <= 3 && part === part.toUpperCase()) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
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

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatCompactDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getSiteOrigin() {
  const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  const candidate = canonicalHref || window.location.origin;

  try {
    return new URL(candidate, window.location.origin).origin;
  } catch (_error) {
    return window.location.origin;
  }
}

function buildAbsoluteUrl(value = "") {
  const fallback = new URL(DEFAULT_SOCIAL_IMAGE, getSiteOrigin()).toString();
  if (!value) {
    return fallback;
  }

  try {
    return new URL(value, window.location.origin).toString();
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

export function updateDocumentMetadata({ title, description, path, image }) {
  const resolvedTitle = title || "The Echo Archives";
  const resolvedDescription =
    description || "A human-curated archive for discovering fiction podcasts by mood, tone, format, completion status, and similarity.";
  const resolvedUrl = buildAbsoluteUrl(path || window.location.pathname);
  const resolvedImage = buildAbsoluteUrl(image || DEFAULT_SOCIAL_IMAGE);

  document.title = resolvedTitle;
  setMetaContent('meta[name="description"]', resolvedDescription);
  setMetaContent('meta[property="og:title"]', resolvedTitle);
  setMetaContent('meta[property="og:description"]', resolvedDescription);
  setMetaContent('meta[property="og:url"]', resolvedUrl);
  setMetaContent('meta[property="og:image"]', resolvedImage);
  setMetaContent('meta[name="twitter:title"]', resolvedTitle);
  setMetaContent('meta[name="twitter:description"]', resolvedDescription);
  setMetaContent('meta[name="twitter:image"]', resolvedImage);
  setCanonicalHref(resolvedUrl);
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
