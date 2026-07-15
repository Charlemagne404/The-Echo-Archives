const {
  buildCollectionPath,
  buildShowPath,
  isIndexableCollection,
  normalizeSiteUrl,
} = require("./seo");

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSitemapEntries({ siteUrl, catalog, collections }) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const publishedShows = (Array.isArray(catalog) ? catalog : []).filter((show) => show.status === "published");
  const showMap = new Map(publishedShows.map((show) => [show.id, show]));
  const collectionRecords = (Array.isArray(collections) ? collections : []).filter((collection) => {
    const collectionShows = (Array.isArray(collection.showIds) ? collection.showIds : [])
      .map((showId) => showMap.get(showId))
      .filter(Boolean);
    return isIndexableCollection(collection, collectionShows);
  });

  return [
    { loc: `${baseUrl}/` },
    { loc: `${baseUrl}/about` },
    { loc: `${baseUrl}/for-creators` },
    { loc: `${baseUrl}/creator-standards` },
    { loc: `${baseUrl}/supporters` },
    { loc: `${baseUrl}/help-center` },
    { loc: `${baseUrl}/submit` },
    { loc: `${baseUrl}/collections` },
    { loc: `${baseUrl}/privacy` },
    { loc: `${baseUrl}/terms` },
    { loc: `${baseUrl}/cookies` },
    { loc: `${baseUrl}/copyright` },
    ...publishedShows.map((show) => ({
      loc: `${baseUrl}${buildShowPath(show.id)}`,
      lastmod: show.updatedAt || "",
    })),
    ...collectionRecords.map((collection) => ({
      loc: `${baseUrl}${buildCollectionPath(collection.id)}`,
      lastmod: collection.updatedAt || "",
    })),
  ];
}

function buildSitemapXml({ siteUrl, catalog, collections }) {
  const entries = buildSitemapEntries({ siteUrl, catalog, collections });
  const body = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
      return `<url><loc>${escapeXml(entry.loc)}</loc>${lastmod}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

module.exports = {
  buildSitemapEntries,
  buildSitemapXml,
};
