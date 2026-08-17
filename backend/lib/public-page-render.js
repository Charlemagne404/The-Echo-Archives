function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const {
  BRAND_DESCRIPTOR,
  buildAbsoluteUrl,
  buildCollectionPath,
  buildCollectionSeoDescription,
  buildCollectionSeoTitle,
  buildShowPath,
  buildShowSeoDescription,
  buildShowSeoTitle,
} = require("./seo");
const { renderCollectionDirectoryCard, renderCollectionShowCard } = require("../../tools/lib/home-page-prerender");
const { formatCount, getWebPageDates, toPublicLabel } = require("../../shared/archive-record");

function replaceNamedMeta(html, name, content) {
  const escapedName = escapeRegExp(name);
  const replacement = `<meta name="${name}" content="${escapeAttribute(content)}" />`;
  const pattern = new RegExp(`<meta\\s+name="${escapedName}"\\s+content="[^"]*"\\s*\\/?>`, "i");
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace(/<\/head>/i, `  ${replacement}\n</head>`);
}

function replacePropertyMeta(html, property, content) {
  const escapedProperty = escapeRegExp(property);
  const replacement = `<meta property="${property}" content="${escapeAttribute(content)}" />`;
  const pattern = new RegExp(`<meta\\s+property="${escapedProperty}"\\s+content="[^"]*"\\s*\\/?>`, "i");
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace(/<\/head>/i, `  ${replacement}\n</head>`);
}

function replaceCanonicalLink(html, href) {
  return html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeAttribute(href)}" />`,
  );
}

function replaceBodyDataAttribute(html, attributeName, value) {
  const escapedAttributeName = escapeRegExp(attributeName);
  const renderedValue = escapeAttribute(value);

  return html.replace(/<body\b([^>]*)>/i, (match, attributes) => {
    if (new RegExp(`\\s${escapedAttributeName}="[^"]*"`).test(attributes)) {
      return `<body${attributes.replace(
        new RegExp(`\\s${escapedAttributeName}="[^"]*"`, "i"),
        ` ${attributeName}="${renderedValue}"`,
      )}>`;
    }

    return `<body${attributes} ${attributeName}="${renderedValue}">`;
  });
}

function replaceStructuredDataOrigin(html, previousSiteUrl, nextSiteUrl) {
  const previousOrigin = String(previousSiteUrl || "").replace(/\/+$/, "");
  const nextOrigin = String(nextSiteUrl || "").replace(/\/+$/, "");
  if (!previousOrigin || !nextOrigin || previousOrigin === nextOrigin) {
    return html;
  }

  const rewriteValue = (value) => {
    if (typeof value === "string") {
      return value === previousOrigin || value.startsWith(`${previousOrigin}/`) || value.startsWith(`${previousOrigin}#`)
        ? `${nextOrigin}${value.slice(previousOrigin.length)}`
        : value;
    }
    if (Array.isArray(value)) return value.map(rewriteValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewriteValue(entry)]));
    }
    return value;
  };

  return html.replace(
    /(<script\b[^>]*\bid="pageStructuredData"[^>]*\btype="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/i,
    (match, opening, json, closing) => {
      try {
        return `${opening}${safeJson(rewriteValue(JSON.parse(json)))}${closing}`;
      } catch (_error) {
        return match;
      }
    },
  );
}

function fallbackDescription(description = "") {
  return (
    String(description || "").trim() ||
    "An archive for discovering fiction podcasts by mood, tone, format, completion status, and similar shows."
  );
}

function fallbackImageUrl(siteUrl) {
  return buildAbsoluteUrl(siteUrl, "/echo-wordmark1.png");
}

function getShowImagePath(show) {
  const imageSrc = String(show?.imageSrc || "").trim();
  if (imageSrc) {
    return imageSrc;
  }

  const cover = String(show?.cover || "").trim();
  if (!cover) {
    return "";
  }

  if (/^(?:https?:)?\/\//i.test(cover) || /^data:image\//i.test(cover)) {
    return cover;
  }

  return `/${cover.replace(/^\/+/, "")}`;
}

function getCollectionLeadShow(collection, { collectionShows = [], anchorShow = null } = {}) {
  if (anchorShow?.imageSrc || anchorShow?.cover) {
    return anchorShow;
  }

  return collectionShows.find((show) => show?.imageSrc || show?.cover) || null;
}

function buildShowPageMetadata({ siteUrl, show }) {
  const imageSource = getShowImagePath(show);
  return {
    title: buildShowSeoTitle(show),
    description: buildShowSeoDescription(show),
    canonicalUrl: buildAbsoluteUrl(siteUrl, buildShowPath(show.id)),
    imageUrl: imageSource ? buildAbsoluteUrl(siteUrl, imageSource) : fallbackImageUrl(siteUrl),
    imageAlt: String(show.coverAlt || `${show.title} cover art`).trim(),
  };
}

function buildCollectionPageMetadata({ siteUrl, collection, collectionShows = [], anchorShow = null }) {
  const firstCoverShow = getCollectionLeadShow(collection, { collectionShows, anchorShow });
  const firstCover = getShowImagePath(firstCoverShow);
  return {
    title: buildCollectionSeoTitle(collection),
    description: buildCollectionSeoDescription(collection, collectionShows),
    canonicalUrl: buildAbsoluteUrl(siteUrl, buildCollectionPath(collection.id)),
    imageUrl: firstCover ? buildAbsoluteUrl(siteUrl, firstCover) : fallbackImageUrl(siteUrl),
    imageAlt: String(firstCoverShow?.coverAlt || `${collection.title} collection preview`).trim(),
  };
}

function collectHttpUrls(...sources) {
  const urls = [];
  const addValue = (value) => {
    if (typeof value === "string") {
      try {
        const parsed = new URL(value);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          urls.push(parsed.toString());
        }
      } catch (_error) {
        // Ignore invalid or non-public link values.
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(addValue);
      return;
    }

    if (value && typeof value === "object") {
      Object.values(value).forEach(addValue);
    }
  };

  sources.forEach(addValue);
  return [...new Set(urls)];
}

function buildShowStructuredData({ siteUrl, show }) {
  const metadata = buildShowPageMetadata({ siteUrl, show });
  const homeUrl = buildAbsoluteUrl(siteUrl, "/");
  const pageId = `${metadata.canonicalUrl}#webpage`;
  const podcastId = `${metadata.canonicalUrl}#podcast`;
  const breadcrumbId = `${metadata.canonicalUrl}#breadcrumb`;
  const podcast = {
    "@type": "PodcastSeries",
    "@id": podcastId,
    name: show.title,
    description: fallbackDescription(show.description),
    url: metadata.canonicalUrl,
    image: metadata.imageUrl,
  };
  const genres = (Array.isArray(show.genres) ? show.genres : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  const creators = (Array.isArray(show.creators) ? show.creators : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  const languages = (Array.isArray(show.languages) ? show.languages : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  const sameAs = collectHttpUrls(show.officialLinks, show.listenLinks);
  const pageDates = getWebPageDates(show);

  if (genres.length > 0) {
    const seenGenres = new Set();
    podcast.genre = genres.filter((genre) => {
      const key = genre.toLowerCase();
      if (seenGenres.has(key)) return false;
      seenGenres.add(key);
      return true;
    });
  }
  if (creators.length > 0) podcast.creator = creators;
  if (languages.length > 0) podcast.inLanguage = languages;
  if (sameAs.length > 0) podcast.sameAs = sameAs;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": pageId,
        url: metadata.canonicalUrl,
        name: metadata.title,
        description: metadata.description,
        isPartOf: { "@id": `${homeUrl}#website` },
        breadcrumb: { "@id": breadcrumbId },
        mainEntity: { "@id": podcastId },
        primaryImageOfPage: { "@type": "ImageObject", url: metadata.imageUrl },
        ...(pageDates.datePublished ? { datePublished: pageDates.datePublished } : {}),
        ...(pageDates.dateModified ? { dateModified: pageDates.dateModified } : {}),
      },
      podcast,
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND_DESCRIPTOR, item: homeUrl },
          { "@type": "ListItem", position: 2, name: show.title, item: metadata.canonicalUrl },
        ],
      },
    ],
  };
}

function buildCollectionStructuredData({ siteUrl, collection, collectionShows = [], anchorShow = null }) {
  const metadata = buildCollectionPageMetadata({ siteUrl, collection, collectionShows, anchorShow });
  const canonicalUrl = metadata.canonicalUrl;
  const homeUrl = buildAbsoluteUrl(siteUrl, "/");
  const collectionsUrl = buildAbsoluteUrl(siteUrl, "/collections");
  const pageId = `${canonicalUrl}#webpage`;
  const listId = `${canonicalUrl}#itemlist`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;
  const showReasons = collection.showReasons && typeof collection.showReasons === "object" ? collection.showReasons : {};
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": pageId,
        name: metadata.title,
        description: metadata.description,
        url: canonicalUrl,
        isPartOf: { "@id": `${homeUrl}#website` },
        breadcrumb: { "@id": breadcrumbId },
        mainEntity: { "@id": listId },
        primaryImageOfPage: { "@type": "ImageObject", url: metadata.imageUrl },
        ...(collection.updatedAt ? { dateModified: collection.updatedAt } : {}),
        ...(anchorShow
          ? {
              about: {
                "@type": "PodcastSeries",
                name: anchorShow.title,
                url: buildAbsoluteUrl(siteUrl, buildShowPath(anchorShow.id)),
              },
            }
          : {}),
      },
      {
        "@type": "ItemList",
        "@id": listId,
        numberOfItems: collectionShows.length,
        itemListElement: collectionShows.map((show, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: show.title,
          description: String(showReasons[show.id] || "").trim(),
          url: buildAbsoluteUrl(siteUrl, buildShowPath(show.id)),
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND_DESCRIPTOR, item: homeUrl },
          { "@type": "ListItem", position: 2, name: "Audio drama collections", item: collectionsUrl },
          { "@type": "ListItem", position: 3, name: collection.title, item: canonicalUrl },
        ],
      },
    ],
  };
}

function injectPageMetadata(html, metadata) {
  let rendered = html;

  rendered = rendered.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`);
  rendered = replaceNamedMeta(rendered, "description", metadata.description);
  rendered = replacePropertyMeta(rendered, "og:title", metadata.title);
  rendered = replacePropertyMeta(rendered, "og:description", metadata.description);
  rendered = replacePropertyMeta(rendered, "og:url", metadata.canonicalUrl);
  rendered = replacePropertyMeta(rendered, "og:image", metadata.imageUrl);
  rendered = replacePropertyMeta(rendered, "og:image:alt", metadata.imageAlt || "The Echo Archives social preview");
  rendered = replaceNamedMeta(rendered, "twitter:title", metadata.title);
  rendered = replaceNamedMeta(rendered, "twitter:description", metadata.description);
  rendered = replaceNamedMeta(rendered, "twitter:image", metadata.imageUrl);
  rendered = replaceNamedMeta(rendered, "twitter:image:alt", metadata.imageAlt || "The Echo Archives social preview");
  rendered = replaceCanonicalLink(rendered, metadata.canonicalUrl);

  return rendered;
}

function injectRuntimeSiteConfig(html, config = {}) {
  let rendered = html;
  const previousSiteUrl = rendered.match(/<body\b[^>]*\bdata-site-url="([^"]*)"/i)?.[1] || "";

  if (Object.hasOwn(config, "homeCardHoverExpandEnabled")) {
    rendered = replaceBodyDataAttribute(
      rendered,
      "data-home-card-hover-expand-enabled",
      String(Boolean(config.homeCardHoverExpandEnabled)),
    );
  }

  for (const [key, attributeName] of [
    ["siteUrl", "data-site-url"],
    ["showsVersion", "data-shows-version"],
    ["collectionsVersion", "data-collections-version"],
    ["searchIndexVersion", "data-search-index-version"],
  ]) {
    if (Object.hasOwn(config, key)) {
      rendered = replaceBodyDataAttribute(rendered, attributeName, String(config[key] || ""));
    }
  }

  if (Object.hasOwn(config, "siteUrl")) {
    rendered = replaceStructuredDataOrigin(rendered, previousSiteUrl, config.siteUrl);
  }

  if (config.nonce) {
    const nonce = escapeAttribute(config.nonce);
    rendered = rendered.replace(
      /<script\b([^>]*\btype="application\/(?:ld\+json|json)"[^>]*)>/gi,
      (match, attributes) =>
        /\bnonce="[^"]*"/i.test(attributes) ? match : `<script${attributes} nonce="${nonce}">`,
    );
  }

  return rendered;
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function injectStructuredData(html, data) {
  const markup = `<script id="pageStructuredData" type="application/ld+json">${safeJson(data)}</script>`;
  const pattern = /\s*<script\s+id="pageStructuredData"\s+type="application\/ld\+json">[\s\S]*?<\/script>/i;
  const withoutExisting = html.replace(pattern, "");
  return withoutExisting.replace(/<\/head>/i, `  ${markup}\n</head>`);
}

function injectJsonBootstrap(html, id, data) {
  const escapedId = escapeAttribute(id);
  const markup = `<script id="${escapedId}" type="application/json">${safeJson(data)}</script>`;
  const pattern = new RegExp(`\\s*<script\\s+id="${escapeRegExp(id)}"\\s+type="application/json">[\\s\\S]*?<\\/script>`, "i");
  const withoutExisting = html.replace(pattern, "");
  return withoutExisting.replace(/<\/body>/i, `  ${markup}\n</body>`);
}

function injectNoIndex(html, { follow = false } = {}) {
  return replaceNamedMeta(html, "robots", `noindex, ${follow ? "follow" : "nofollow"}, noarchive`);
}

function replaceElementText(html, id, value) {
  const pattern = new RegExp(`(<[^>]+\\bid="${escapeRegExp(id)}"[^>]*>)[\\s\\S]*?(<\\/[^>]+>)`, "i");
  return html.replace(pattern, (_match, opening, closing) => `${opening}${escapeHtml(value)}${closing}`);
}

function replaceElementContents(html, id, value) {
  const pattern = new RegExp(`(<([a-z][a-z0-9-]*)[^>]*\\bid="${escapeRegExp(id)}"[^>]*>)[\\s\\S]*?(<\\/\\2>)`, "i");
  return html.replace(pattern, (_match, opening, _tagName, closing) => `${opening}${value}${closing}`);
}

function getRouteTypeLabel(collection) {
  return collection?.kind === "similarity" ? "Similar shows" : "Collection";
}

function countOverlap(leftValues = [], rightValues = []) {
  const values = new Set(Array.isArray(leftValues) ? leftValues : []);
  return (Array.isArray(rightValues) ? rightValues : []).reduce((count, value) => count + Number(values.has(value)), 0);
}

function getRelatedCollections(collection, collections = []) {
  return collections
    .filter((candidate) => candidate.id && candidate.id !== collection.id)
    .map((candidate) => {
      const sharedIntentCount = countOverlap(collection.intentTags, candidate.intentTags);
      const sharedShowCount = countOverlap(collection.showIds, candidate.showIds);
      const sameKind = Number(candidate.kind === collection.kind);
      return { candidate, sharedIntentCount, sharedShowCount, sameKind, score: sharedIntentCount * 4 + sharedShowCount * 3 + sameKind };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.sharedShowCount - left.sharedShowCount || right.sharedIntentCount - left.sharedIntentCount || right.sameKind - left.sameKind || left.candidate.order - right.candidate.order || String(left.candidate.title || "").localeCompare(String(right.candidate.title || "")))
    .slice(0, 3)
    .map((entry) => entry.candidate);
}

function renderCollectionHeroTags(collection) {
  const tags = [];
  if (collection.label) tags.push(`<span class="collection-intent-tag-featured">${escapeHtml(collection.label)}</span>`);
  (collection.intentTags || []).slice(0, 4).forEach((tag) => tags.push(`<span>${escapeHtml(toPublicLabel(tag))}</span>`));
  return `<div class="collection-intent-tags collection-hero-tags">${tags.join("")}</div>`;
}

function renderCollectionHeroArt(collection, collectionShows, anchorShow) {
  const selected = [anchorShow, ...(collection.coverShowIds || []).map((id) => collectionShows.find((show) => show.id === id)), ...collectionShows]
    .filter(Boolean)
    .filter((show, index, shows) => shows.findIndex((candidate) => candidate.id === show.id) === index)
    .slice(0, 4);
  return `<div class="collection-cover-collage collection-detail-collage" aria-hidden="true">${selected.map((show, index) => `<span class="collection-cover-frame" data-cover-index="${index + 1}"><img src="${escapeAttribute(getShowImagePath(show))}" alt="" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" width="320" height="320" /></span>`).join("")}</div>`;
}

function formatCollectionDate(value) {
  const date = new Date(`${String(value || "").trim()}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function renderCollectionOverview(collection, collectionShows, anchorShow) {
  const routeTypeLabel = getRouteTypeLabel(collection);
  const meta = [
    `<span class="collection-detail-meta-text">${escapeHtml(formatCount(collectionShows.length, "show"))}</span>`,
    `<span class="collection-detail-meta-separator" aria-hidden="true"> · </span>`,
    `<span class="collection-detail-meta-text">${escapeHtml(routeTypeLabel)}</span>`,
    collection.kind === "similarity" && anchorShow ? `<span class="collection-detail-meta-separator" aria-hidden="true"> · </span><span class="collection-detail-meta-text collection-detail-meta-text-anchor"><span class="collection-detail-anchor-prefix">Starts with </span><a class="collection-detail-anchor-link" href="${escapeAttribute(buildShowPath(anchorShow.id))}">${escapeHtml(anchorShow.title)}</a></span>` : "",
    collection.updatedAt ? `<span class="collection-detail-meta-separator" aria-hidden="true"> · </span><span class="collection-detail-meta-text">Updated ${escapeHtml(formatCollectionDate(collection.updatedAt))}</span>` : "",
  ].join("");
  const chips = [collection.label, ...(collection.intentTags || []).slice(0, 2)]
    .filter(Boolean)
    .map((value, index) => `<span class="collection-detail-signal-chip${index === 0 && collection.label ? " collection-detail-signal-chip-featured" : ""}">${escapeHtml(index === 0 && collection.label ? value : toPublicLabel(value))}</span>`)
    .join("");
  return { meta, chips };
}

function injectCollectionSummary(html, { collection, collectionShows = [], anchorShow = null, collections = [], allShows = [] }) {
  let rendered = replaceElementText(html, "collectionTitle", collection.title);
  rendered = replaceElementText(rendered, "collectionBreadcrumbTitle", collection.title);
  rendered = replaceElementText(rendered, "collectionDescription", fallbackDescription(collection.description));
  const count = collectionShows.length;
  const showTitles = collectionShows.slice(0, 4).map((show) => show.title).filter(Boolean);
  const titleSummary = showTitles.length > 0 ? ` Includes ${showTitles.join(", ")}${count > showTitles.length ? ", and more" : ""}.` : "";
  rendered = replaceElementText(
    rendered,
    "collectionShowsSummary",
    `${count} ${count === 1 ? "show" : "shows"} in this collection.${titleSummary}`,
  );
  const overview = renderCollectionOverview(collection, collectionShows, anchorShow);
  rendered = replaceElementContents(rendered, "collectionHeroTags", renderCollectionHeroTags(collection));
  rendered = replaceElementContents(rendered, "collectionHeroArt", renderCollectionHeroArt(collection, collectionShows, anchorShow));
  rendered = replaceElementContents(rendered, "collectionOverviewMetaLine", overview.meta);
  rendered = replaceElementContents(rendered, "collectionOverviewChips", overview.chips);
  rendered = rendered.replace('id="collectionRoot" class="page-card collection-detail-overview" aria-label="Collection at a glance" hidden', 'id="collectionRoot" class="page-card collection-detail-overview" aria-label="Collection at a glance" data-collection-prerendered="true"');
  const showMap = new Map(allShows.map((show) => [show.id, show]));
  const relatedMarkup = getRelatedCollections(collection, collections)
    .map((relatedCollection) => renderCollectionDirectoryCard(relatedCollection, showMap, { compact: true }))
    .join("");
  if (relatedMarkup) {
    rendered = replaceElementContents(rendered, "collectionRelatedGrid", relatedMarkup);
    rendered = rendered.replace('id="collectionRelatedSection" class="page-card collection-detail-related-section" aria-labelledby="collection-related-title" hidden', 'id="collectionRelatedSection" class="page-card collection-detail-related-section" aria-labelledby="collection-related-title"');
  }
  return rendered;
}

function injectCollectionShowCards(html, { collection, collectionShows = [] }) {
  const showReasons = collection.showReasons && typeof collection.showReasons === "object" ? collection.showReasons : {};
  const markup = collectionShows
    .map((show) => renderCollectionShowCard(show, showReasons[show.id]))
    .join("");
  return html.replace(
    /(<div\s+id="collectionShowGrid"\s+class="podcast-card-grid">)[\s\S]*?(<\/div>)/i,
    `$1${markup}$2`,
  );
}

module.exports = {
  buildCollectionPageMetadata,
  buildCollectionStructuredData,
  buildShowPageMetadata,
  buildShowStructuredData,
  injectRuntimeSiteConfig,
  injectPageMetadata,
  injectCollectionSummary,
  injectCollectionShowCards,
  injectJsonBootstrap,
  injectNoIndex,
  injectStructuredData,
  safeJson,
};
