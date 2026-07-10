const fs = require("node:fs");
const path = require("node:path");

const archiveRecord = require("../../shared/archive-record.js");

const TOP_RATED_BADGE_ASSET_URL = "/images/badges/top-rated-bookmark.png";
const DEFAULT_FALLBACK_COVER_IMAGE = "/images/TEA-Logo-S.png";
const HOME_MOST_POPULAR_LIMIT = 4;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function toDisplayTag(value = "") {
  return String(value || "")
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

function formatRating(value) {
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

function formatCompactDate(value) {
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

function resolveImageSrc(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return DEFAULT_FALLBACK_COVER_IMAGE;
  }

  if (/^(?:https?:)?\/\//i.test(normalized) || /^data:image\//i.test(normalized)) {
    return normalized;
  }

  return `/${normalized.replace(/^\/+/, "")}`;
}

function createShowHref(id = "") {
  return `/show?id=${encodeURIComponent(id)}`;
}

function createCollectionHref(id = "") {
  return `/collection?id=${encodeURIComponent(id)}`;
}

function getSortableDateValue(value) {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getArchiveStats(shows, collections) {
  const fullReviewCount = shows.filter((show) => show.reviewStatus === "full-review").length;
  const latestUpdatedAt = [
    ...shows.map((show) => show.updatedAt),
    ...collections.map((collection) => collection.updatedAt),
  ]
    .filter(Boolean)
    .sort((left, right) => getSortableDateValue(left) - getSortableDateValue(right))
    .at(-1);

  return {
    showCount: shows.length,
    fullReviewCount,
    collectionCount: collections.length,
    latestUpdatedAt: latestUpdatedAt || "",
  };
}

function getCollectionShows(collection, showMap) {
  return (Array.isArray(collection?.showIds) ? collection.showIds : [])
    .map((showId) => showMap.get(showId))
    .filter((show) => show && show.status === "published");
}

function getCollectionAnchorShow(collection, showMap) {
  const anchorShowId = String(collection?.anchorShowId || "").trim();
  return anchorShowId ? showMap.get(anchorShowId) || null : null;
}

function getCollectionCoverShows(collection, shows, limit = 1) {
  const showMap = new Map((Array.isArray(shows) ? shows : []).map((show) => [show.id, show]));
  const preferred = (collection?.coverShowIds || []).map((showId) => showMap.get(showId)).filter(Boolean);
  const remaining = shows.filter((show) => !preferred.some((preferredShow) => preferredShow.id === show.id));
  return [...preferred, ...remaining].slice(0, limit);
}

function getCollectionLeadShow(collection, showMap) {
  const collectionShows = getCollectionShows(collection, showMap);
  const anchorShow = getCollectionAnchorShow(collection, showMap);
  return anchorShow || getCollectionCoverShows(collection, collectionShows, 1)[0] || null;
}

function getMostPopularLifecycleLabel(show) {
  if (show.completionStatus && show.completionStatus !== "unclear") {
    return toDisplayTag(show.completionStatus);
  }

  if (show.releaseStatus && show.releaseStatus !== "unknown") {
    return toDisplayTag(show.releaseStatus);
  }

  return "";
}

function getMostPopularMetaText(show) {
  const bestFor = Array.isArray(show.bestFor) ? show.bestFor : [];
  const tags = Array.isArray(show.tags) ? show.tags : [];
  const preferredValues = bestFor.length > 0 ? bestFor.slice(0, 2) : tags.slice(0, 2);
  return preferredValues.map((value) => toDisplayTag(value)).join(" • ");
}

function renderEditorialBadges(show) {
  const badges = [];

  if ((show.finalRating || 0) >= 9) {
    badges.push(
      `<span class="editorial-badge editorial-badge-corner"><img class="editorial-badge-artwork" src="${TOP_RATED_BADGE_ASSET_URL}" alt="" loading="lazy" decoding="async" width="128" height="128" /></span>`,
    );
  }

  if (show.reviewStatus === "full-review") {
    badges.push(
      '<span class="editorial-badge editorial-badge-ribbon"><span class="editorial-badge-ribbon-label">Full review</span></span>',
    );
  }

  return `<div class="editorial-badges" aria-hidden="true">${badges.join("")}</div>`;
}

function renderArchiveScore(show, { showLabel = true, treatZeroAsUnrated = false } = {}) {
  const rawRating = show?.finalRating;
  const numericRating =
    rawRating === null || rawRating === undefined || (typeof rawRating === "string" && !rawRating.trim())
      ? null
      : Number(rawRating);
  const archiveScore =
    Number.isFinite(numericRating) &&
    numericRating >= 0 &&
    numericRating <= 10 &&
    (!treatZeroAsUnrated || numericRating > 0)
      ? numericRating
      : null;

  return `
    <div class="archive-inline-score">
      <span class="inline-score-topline">
        <span class="inline-score-icon archive-score-icon" aria-hidden="true">★</span>
        <span class="inline-score-value">${formatRating(archiveScore)}/10</span>
      </span>
      ${showLabel ? '<span class="inline-score-label">Archive Rating</span>' : ""}
    </div>
  `.trim();
}

function renderCommunityScore(show, { showLabel = true } = {}) {
  return `
    <div class="community-inline-score" data-podcast-id="${escapeAttribute(show.id || "")}" aria-label="Community score --/10. No ratings yet.">
      <span class="inline-score-topline">
        <svg viewBox="0 0 28 24" aria-hidden="true" focusable="false">
          <rect x="1.5" y="9" width="2.5" height="6" rx="1.25" />
          <rect x="5.75" y="6.5" width="2.5" height="11" rx="1.25" />
          <rect x="10" y="2.75" width="2.5" height="18.5" rx="1.25" />
          <rect x="14.25" y="7.75" width="2.5" height="8.5" rx="1.25" />
          <rect x="18.5" y="1.5" width="2.5" height="21" rx="1.25" />
          <rect x="22.75" y="6.5" width="2.5" height="11" rx="1.25" />
        </svg>
        <span class="community-inline-score-value">--/10</span>
      </span>
      ${showLabel ? '<span class="inline-score-label">Community Rating</span>' : ""}
    </div>
  `.trim();
}

function renderArchiveCard(show) {
  const metaText = (Array.isArray(show.tags) ? show.tags : [])
    .slice(0, 2)
    .map((tag) => toDisplayTag(tag))
    .join(" • ");
  const title = escapeHtml(show.title || "Untitled show");
  const href = escapeAttribute(show.href || createShowHref(show.id || ""));
  const imageSrc = escapeAttribute(show.imageSrc || resolveImageSrc(show.cover));
  const imageAlt = escapeAttribute(show.imageAlt || show.coverAlt || `${show.title || "Untitled show"} cover art`);

  return `
    <div class="podcast-card-shell" data-podcast-id="${escapeAttribute(show.id || "unknown-show")}">
      <a class="podcast-card" href="${href}" data-podcast-id="${escapeAttribute(show.id || "unknown-show")}">
        ${renderEditorialBadges(show)}
        <img src="${imageSrc}" alt="${imageAlt}" loading="lazy" decoding="async" width="320" height="320" />
        <h2 data-card-title="true">${title}</h2>
        <p class="tags" data-card-meta="true"${metaText ? "" : " hidden"}>${escapeHtml(metaText)}</p>
        <div class="rating">
          ${renderArchiveScore(show, { showLabel: false })}
          <span class="rating-divider" aria-hidden="true"></span>
          ${renderCommunityScore(show, { showLabel: false })}
        </div>
      </a>
    </div>
  `.trim();
}

function renderMostPopularCard(show) {
  const lifecycleLabel = getMostPopularLifecycleLabel(show);
  const chips = [];
  if ((show.finalRating || 0) >= 9) {
    chips.push('<span class="popular-card-chip is-accent">Top rated</span>');
  }
  if (lifecycleLabel) {
    chips.push(`<span class="popular-card-chip is-muted">${escapeHtml(lifecycleLabel)}</span>`);
  }
  if (show.reviewStatus === "full-review") {
    chips.push('<span class="popular-card-chip is-review">Full review</span>');
  }
  const accentStyle = show.accent?.rgb ? ` style="--popular-card-accent-rgb: ${escapeAttribute(show.accent.rgb)};"` : "";
  const subtitle = String(show.subtitle || "").trim();
  const metaText = getMostPopularMetaText(show);
  const copy = String(show.archiveTake || show.description || "").trim();

  return `
    <a class="popular-card" href="${escapeAttribute(show.href || createShowHref(show.id || ""))}" data-podcast-id="${escapeAttribute(show.id || "")}" aria-label="Open ${escapeAttribute(show.title || "Untitled show")} in the archive"${accentStyle}>
      <div class="popular-card-media">
        <img src="${escapeAttribute(show.imageSrc || resolveImageSrc(show.cover))}" alt="${escapeAttribute(show.imageAlt || show.coverAlt || `${show.title || "Untitled show"} cover art`)}" loading="lazy" decoding="async" width="320" height="320" />
      </div>
      <div class="popular-card-body">
        <div class="popular-card-status"${chips.length === 0 ? " hidden" : ""}>${chips.join("")}</div>
        <h3 class="popular-card-title">${escapeHtml(show.title || "Untitled show")}</h3>
        <p class="popular-card-subtitle"${subtitle ? "" : " hidden"}>${escapeHtml(subtitle)}</p>
        <p class="popular-card-meta"${metaText ? "" : " hidden"}>${escapeHtml(metaText)}</p>
        <p class="popular-card-copy"${copy ? "" : " hidden"}>${escapeHtml(copy)}</p>
        <div class="popular-card-footer">
          <div class="popular-card-ratings">
            ${renderArchiveScore(show)}
            <span class="rating-divider" aria-hidden="true"></span>
            ${renderCommunityScore(show)}
          </div>
        </div>
      </div>
    </a>
  `.trim();
}

function renderCollectionCard(collection, showMap) {
  const collectionShows = getCollectionShows(collection, showMap);
  const anchorShow = getCollectionAnchorShow(collection, showMap);
  const leadShow = anchorShow || getCollectionLeadShow(collection, showMap);
  const accent = (anchorShow || collectionShows.find((show) => show?.accent?.hex))?.accent?.hex || "";
  const styleFragments = [];
  if (leadShow?.imageSrc || leadShow?.cover) {
    styleFragments.push(`--collection-cover-image: url(&quot;${escapeAttribute(leadShow.imageSrc || resolveImageSrc(leadShow.cover))}&quot;)`);
  }
  if (accent) {
    styleFragments.push(`--collection-accent: ${escapeAttribute(accent)}`);
  }
  const styleAttribute = styleFragments.length > 0 ? ` style="${styleFragments.join("; ")}"` : "";

  return `
    <a class="collection-card" href="${escapeAttribute(createCollectionHref(collection.id || ""))}" aria-label="Browse the ${escapeAttribute(collection.title || "Untitled collection")} collection" data-collection-id="${escapeAttribute(collection.id || "")}"${anchorShow?.id ? ` data-anchor-show-id="${escapeAttribute(anchorShow.id)}"` : ""}${styleAttribute}>
      <h3>${escapeHtml(collection.title || "Untitled collection")}</h3>
      <div class="collection-card-footer">
        <p class="collection-card-count">${escapeHtml(`${collectionShows.length} ${collectionShows.length === 1 ? "show" : "shows"}`)}</p>
        <span class="collection-card-cta">Browse</span>
      </div>
    </a>
  `.trim();
}

function replaceMarkup(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`Unable to update homepage ${label}.`);
  }
  return next;
}

function setSectionVisibility(markup, isVisible, dataAttributeValue = "") {
  return markup.replace(/<section\b([^>]*)>/i, (_match, attributes) => {
    const withoutHidden = attributes.replace(/\shidden\b/i, "");
    const withPrerender =
      dataAttributeValue && !/\sdata-home-prerendered=/.test(withoutHidden)
        ? `${withoutHidden} data-home-prerendered="${escapeAttribute(dataAttributeValue)}"`
        : withoutHidden;
    return `<section${withPrerender}${isVisible ? "" : " hidden"}>`;
  });
}

function loadHomePrerenderData(rootDir) {
  const showsPath = path.join(rootDir, "data", "search-index.json");
  const collectionsPath = path.join(rootDir, "data", "collections.json");
  const showRecords = readJson(showsPath).map((record) => archiveRecord.normalizeShowRecord(record));
  const collections = readJson(collectionsPath).map((record) => archiveRecord.normalizeCollectionRecord(record));
  const publishedShows = showRecords.filter((show) => show.status === "published");
  return {
    collections,
    publishedShows,
    showMap: new Map(publishedShows.map((show) => [show.id, show])),
  };
}

function renderHomePagePrerender(pageBody, { rootDir, homeMostPopularIds = [], homeFavoriteRouteIds = [] }) {
  const { collections, publishedShows, showMap } = loadHomePrerenderData(rootDir);
  const collectionsById = new Map(collections.map((collection) => [collection.id, collection]));
  const stats = getArchiveStats(publishedShows, collections);
  const featuredCollections = collections.filter((collection) => collection.featured);
  const favoriteCollections = homeFavoriteRouteIds.map((collectionId) => collectionsById.get(collectionId)).filter(Boolean);
  const mostPopularShows = homeMostPopularIds
    .map((showId) => showMap.get(showId))
    .filter((show) => show && show.status === "published")
    .slice(0, HOME_MOST_POPULAR_LIMIT);
  const resultsSummary = `${publishedShows.length} results • ${stats.fullReviewCount} ${stats.fullReviewCount === 1 ? "full review" : "full reviews"}`;

  let rendered = pageBody;

  rendered = replaceMarkup(rendered, /(<strong id="homeShowCount">)[^<]*(<\/strong>)/, `$1${stats.showCount}$2`, "show count");
  rendered = replaceMarkup(rendered, /(<strong id="homeReviewCount">)[^<]*(<\/strong>)/, `$1${stats.fullReviewCount}$2`, "review count");
  rendered = replaceMarkup(rendered, /(<strong id="homeCollectionCount">)[^<]*(<\/strong>)/, `$1${stats.collectionCount}$2`, "collection count");
  rendered = replaceMarkup(
    rendered,
    /(<strong id="homeLastUpdated">)[^<]*(<\/strong>)/,
    `$1${escapeHtml(formatCompactDate(stats.latestUpdatedAt))}$2`,
    "last updated",
  );
  rendered = replaceMarkup(
    rendered,
    /(<p id="resultsSummary" class="results-summary">)[\s\S]*?(<\/p>)/,
    `$1${escapeHtml(resultsSummary)}$2`,
    "results summary",
  );
  rendered = replaceMarkup(
    rendered,
    /<div class="popular-grid" id="popularGrid"><\/div>/,
    `<div class="popular-grid" id="popularGrid" data-home-prerendered="true">${mostPopularShows.map(renderMostPopularCard).join("")}</div>`,
    "most popular grid",
  );
  rendered = replaceMarkup(
    rendered,
    /<div id="podcast-grid"><\/div>/,
    `<div id="podcast-grid" data-home-prerendered="true">${publishedShows.map(renderArchiveCard).join("")}</div>`,
    "archive grid",
  );
  rendered = replaceMarkup(
    rendered,
    /<div class="collection-grid collection-carousel-track" id="favoriteRoutesGrid"><\/div>/,
    `<div class="collection-grid collection-carousel-track" id="favoriteRoutesGrid" data-home-prerendered="true">${favoriteCollections.map((collection) => renderCollectionCard(collection, showMap)).join("")}</div>`,
    "favorite routes grid",
  );
  rendered = replaceMarkup(
    rendered,
    /<div class="collection-grid collection-carousel-track" id="collectionGrid"><\/div>/,
    `<div class="collection-grid collection-carousel-track" id="collectionGrid" data-home-prerendered="true">${featuredCollections.map((collection) => renderCollectionCard(collection, showMap)).join("")}</div>`,
    "featured collections grid",
  );

  const mostPopularMatch = rendered.match(/<section class="most-popular-band" id="mostPopular"[\s\S]*?<\/section>/);
  if (!mostPopularMatch) {
    throw new Error("Unable to locate homepage most popular section.");
  }
  rendered = replaceMarkup(
    rendered,
    /<section class="most-popular-band" id="mostPopular"[\s\S]*?<\/section>/,
    setSectionVisibility(mostPopularMatch[0], mostPopularShows.length > 0, "true"),
    "most popular section visibility",
  );

  const favoriteRoutesMatch = rendered.match(/<section class="collection-band" id="favoriteRoutes"[\s\S]*?<\/section>/);
  if (!favoriteRoutesMatch) {
    throw new Error("Unable to locate homepage favorite routes section.");
  }
  rendered = replaceMarkup(
    rendered,
    /<section class="collection-band" id="favoriteRoutes"[\s\S]*?<\/section>/,
    setSectionVisibility(favoriteRoutesMatch[0], favoriteCollections.length > 0, "true"),
    "favorite routes section visibility",
  );

  const collectionsMatch = rendered.match(/<section class="collection-band" id="collections"[\s\S]*?<\/section>/);
  if (!collectionsMatch) {
    throw new Error("Unable to locate homepage collections section.");
  }
  rendered = replaceMarkup(
    rendered,
    /<section class="collection-band" id="collections"[\s\S]*?<\/section>/,
    setSectionVisibility(collectionsMatch[0], featuredCollections.length > 0, "true"),
    "featured collections section visibility",
  );

  return rendered;
}

module.exports = {
  renderHomePagePrerender,
};
