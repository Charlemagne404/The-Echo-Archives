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
  return html.replace(new RegExp(`<meta\\s+name="${escapedName}"\\s+content="[^"]*"\\s*\\/?>`, "i"), replacement);
}

function replacePropertyMeta(html, property, content) {
  const escapedProperty = escapeRegExp(property);
  const replacement = `<meta property="${property}" content="${escapeAttribute(content)}" />`;
  return html.replace(
    new RegExp(`<meta\\s+property="${escapedProperty}"\\s+content="[^"]*"\\s*\\/?>`, "i"),
    replacement,
  );
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

function buildShowPageMetadata({ siteUrl, show }) {
  const imageSource = getShowImagePath(show);
  return {
    title: `${show.title} - The Echo Archives`,
    description: fallbackDescription(show.description),
    canonicalUrl: buildAbsoluteUrl(siteUrl, `/show?id=${encodeURIComponent(show.id)}`),
    imageUrl: imageSource ? buildAbsoluteUrl(siteUrl, imageSource) : fallbackImageUrl(siteUrl),
  };
}

function buildCollectionPageMetadata({ siteUrl, collection, collectionShows = [] }) {
  const firstCoverShow = collectionShows.find((show) => show?.imageSrc || show?.cover);
  const firstCover = getShowImagePath(firstCoverShow);
  return {
    title: `${collection.title} - The Echo Archives`,
    description: fallbackDescription(collection.description),
    canonicalUrl: buildAbsoluteUrl(siteUrl, `/collection?id=${encodeURIComponent(collection.id)}`),
    imageUrl: firstCover ? buildAbsoluteUrl(siteUrl, firstCover) : fallbackImageUrl(siteUrl),
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
  rendered = replaceNamedMeta(rendered, "twitter:title", metadata.title);
  rendered = replaceNamedMeta(rendered, "twitter:description", metadata.description);
  rendered = replaceNamedMeta(rendered, "twitter:image", metadata.imageUrl);
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

  return rendered;
}

module.exports = {
  buildCollectionPageMetadata,
  buildShowPageMetadata,
  injectRuntimeSiteConfig,
  injectPageMetadata,
};
