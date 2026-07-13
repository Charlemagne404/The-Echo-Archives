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

function normalizeSiteUrl(siteUrl = "") {
  return String(siteUrl || "").replace(/\/+$/, "");
}

function buildAbsoluteUrl(siteUrl, value = "") {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);

  try {
    return new URL(value, `${normalizedSiteUrl}/`).toString();
  } catch (_error) {
    return `${normalizedSiteUrl}${value}`;
  }
}

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

function fallbackDescription(description = "") {
  return (
    String(description || "").trim() ||
    "A human-curated archive for discovering fiction podcasts by mood, tone, format, completion status, and similarity."
  );
}

function fallbackImageUrl(siteUrl) {
  return buildAbsoluteUrl(siteUrl, "/og-image.png");
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
    title: `${show.title} - The Echo Archives`,
    description: fallbackDescription(show.description),
    canonicalUrl: buildAbsoluteUrl(siteUrl, `/show?id=${encodeURIComponent(show.id)}`),
    imageUrl: imageSource ? buildAbsoluteUrl(siteUrl, imageSource) : fallbackImageUrl(siteUrl),
    imageAlt: String(show.coverAlt || `${show.title} cover art`).trim(),
  };
}

function buildCollectionPageMetadata({ siteUrl, collection, collectionShows = [], anchorShow = null }) {
  const firstCoverShow = getCollectionLeadShow(collection, { collectionShows, anchorShow });
  const firstCover = getShowImagePath(firstCoverShow);
  return {
    title: `${collection.title} - The Echo Archives`,
    description: fallbackDescription(collection.description),
    canonicalUrl: buildAbsoluteUrl(siteUrl, `/collection?id=${encodeURIComponent(collection.id)}`),
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
  const data = {
    "@context": "https://schema.org",
    "@type": "PodcastSeries",
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

  if (genres.length > 0) {
    const seenGenres = new Set();
    data.genre = genres.filter((genre) => {
      const key = genre.toLowerCase();
      if (seenGenres.has(key)) return false;
      seenGenres.add(key);
      return true;
    });
  }
  if (creators.length > 0) data.creator = creators;
  if (languages.length > 0) data.inLanguage = languages;
  if (show.updatedAt) data.dateModified = show.updatedAt;
  if (sameAs.length > 0) data.sameAs = sameAs;
  return data;
}

function buildCollectionStructuredData({ siteUrl, collection, collectionShows = [] }) {
  const canonicalUrl = buildAbsoluteUrl(siteUrl, `/collection?id=${encodeURIComponent(collection.id)}`);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: collection.title,
    description: fallbackDescription(collection.description),
    url: canonicalUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: collectionShows.length,
      itemListElement: collectionShows.map((show, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: show.title,
        url: buildAbsoluteUrl(siteUrl, `/show?id=${encodeURIComponent(show.id)}`),
      })),
    },
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

function injectNoIndex(html) {
  return replaceNamedMeta(html, "robots", "noindex, nofollow, noarchive");
}

function replaceElementText(html, id, value) {
  const pattern = new RegExp(`(<[^>]+\\bid="${escapeRegExp(id)}"[^>]*>)[\\s\\S]*?(<\\/[^>]+>)`, "i");
  return html.replace(pattern, (_match, opening, closing) => `${opening}${escapeHtml(value)}${closing}`);
}

function injectCollectionSummary(html, { collection, collectionShows = [] }) {
  let rendered = replaceElementText(html, "collectionTitle", collection.title);
  rendered = replaceElementText(rendered, "collectionDescription", fallbackDescription(collection.description));
  const count = collectionShows.length;
  const showTitles = collectionShows.slice(0, 4).map((show) => show.title).filter(Boolean);
  const titleSummary = showTitles.length > 0 ? ` Includes ${showTitles.join(", ")}${count > showTitles.length ? ", and more" : ""}.` : "";
  rendered = replaceElementText(
    rendered,
    "collectionShowsSummary",
    `${count} curated ${count === 1 ? "entry" : "entries"} in this listening path.${titleSummary}`,
  );
  return rendered;
}

module.exports = {
  buildCollectionPageMetadata,
  buildCollectionStructuredData,
  buildShowPageMetadata,
  buildShowStructuredData,
  injectRuntimeSiteConfig,
  injectPageMetadata,
  injectCollectionSummary,
  injectJsonBootstrap,
  injectNoIndex,
  injectStructuredData,
  safeJson,
};
