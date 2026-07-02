function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeSiteUrl(siteUrl = "") {
  return String(siteUrl || "").replace(/\/+$/, "");
}

function buildSitemapEntries({ siteUrl, catalog, collections }) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const publishedShows = (Array.isArray(catalog) ? catalog : []).filter((show) => show.status === "published");
  const collectionRecords = Array.isArray(collections) ? collections : [];

  return [
    { loc: `${baseUrl}/` },
    { loc: `${baseUrl}/about.html` },
    { loc: `${baseUrl}/for-creators.html` },
    { loc: `${baseUrl}/creator-standards.html` },
    { loc: `${baseUrl}/submit.html` },
    { loc: `${baseUrl}/collections.html` },
    { loc: `${baseUrl}/privacy.html` },
    { loc: `${baseUrl}/terms.html` },
    { loc: `${baseUrl}/cookies.html` },
    { loc: `${baseUrl}/copyright.html` },
    ...publishedShows.map((show) => ({
      loc: `${baseUrl}/show.html?id=${encodeURIComponent(show.id)}`,
      lastmod: show.updatedAt || "",
    })),
    ...collectionRecords.map((collection) => ({
      loc: `${baseUrl}/collection.html?id=${encodeURIComponent(collection.id)}`,
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
