const {
  buildCollectionPath,
  buildShowPath,
  isIndexableCollection,
  normalizeSiteUrl,
} = require("./seo");

const { entityPath, isIndexableEntity } = require("../../shared/archive-entities");

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function latestDate(values = []) {
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))
    .sort()
    .at(-1) || "";
}

function buildSitemapEntries({ siteUrl, catalog, collections, entities = [] }) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const publishedShows = (Array.isArray(catalog) ? catalog : []).filter((show) => show.status === "published");
  const showMap = new Map(publishedShows.map((show) => [show.id, show]));
  const collectionRecords = (Array.isArray(collections) ? collections : []).filter((collection) => {
    const collectionShows = (Array.isArray(collection.showIds) ? collection.showIds : [])
      .map((showId) => showMap.get(showId))
      .filter(Boolean);
    return isIndexableCollection(collection, collectionShows);
  });
  const latestShowsDate = latestDate(publishedShows.map((show) => show.updatedAt));
  const latestCollectionsDate = latestDate((Array.isArray(collections) ? collections : []).map((collection) => collection.updatedAt));
  const latestEntitiesDate = latestDate((Array.isArray(entities) ? entities : []).map((entity) => entity.reviewedAt));

  return [
    { loc: `${baseUrl}/`, lastmod: latestDate([latestShowsDate, latestCollectionsDate]) },
    { loc: `${baseUrl}/about` },
    { loc: `${baseUrl}/for-creators` },
    { loc: `${baseUrl}/creator-standards` },
    { loc: `${baseUrl}/supporters` },
    { loc: `${baseUrl}/help-center` },
    { loc: `${baseUrl}/submit` },
    { loc: `${baseUrl}/collections`, lastmod: latestCollectionsDate },
    { loc: `${baseUrl}/creators`, lastmod: latestEntitiesDate },
    ...entities.filter((entity) => isIndexableEntity(entity, publishedShows)).map((entity) => ({
      loc: `${baseUrl}${entityPath(entity.id)}`,
      lastmod: entity.reviewedAt || "",
    })),
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

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
const URLSET_OPEN = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
const URLSET_CLOSE = '</urlset>';

function serializeEntry(entry) {
  const lastmod = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
  return `<url><loc>${escapeXml(entry.loc)}</loc>${lastmod}</url>`;
}

function buildSitemapDocuments(options, { maxUrls = 50000, maxBytes = 52428800 } = {}) {
  if (!Number.isInteger(maxUrls) || maxUrls < 1 || maxUrls > 50000 || !Number.isInteger(maxBytes) || maxBytes < 256 || maxBytes > 52428800) throw new Error("Invalid sitemap limits.");
  const overhead = Buffer.byteLength(XML_HEADER + URLSET_OPEN + URLSET_CLOSE);
  const chunks = [];
  let entries = [];
  let bytes = overhead;
  for (const entry of buildSitemapEntries(options)) {
    const xml = serializeEntry(entry);
    const size = Buffer.byteLength(xml);
    if (overhead + size > maxBytes) throw new Error("A sitemap entry exceeds the document byte limit.");
    if (entries.length === maxUrls || bytes + size > maxBytes) {
      chunks.push(XML_HEADER + URLSET_OPEN + entries.join("") + URLSET_CLOSE);
      entries = [];
      bytes = overhead;
    }
    entries.push(xml);
    bytes += size;
  }
  chunks.push(XML_HEADER + URLSET_OPEN + entries.join("") + URLSET_CLOSE);
  if (chunks.length === 1) return new Map([["sitemap.xml", chunks[0]]]);
  if (chunks.length > 50000) throw new Error("Too many sitemap shards for one index.");
  const documents = new Map();
  const baseUrl = normalizeSiteUrl(options.siteUrl);
  const indexEntries = chunks.map((xml, index) => {
    const name = `sitemap-${index + 1}.xml`;
    documents.set(name, xml);
    return `<sitemap><loc>${escapeXml(`${baseUrl}/${name}`)}</loc></sitemap>`;
  });
  const indexXml = XML_HEADER + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + indexEntries.join("") + '</sitemapindex>';
  if (Buffer.byteLength(indexXml) > 52428800) throw new Error("Sitemap index exceeds the document byte limit.");
  documents.set("sitemap.xml", indexXml);
  return documents;
}

function buildSitemapXml(options) {
  return buildSitemapDocuments(options).get("sitemap.xml");
}

module.exports = { buildSitemapEntries, buildSitemapXml, buildSitemapDocuments };
