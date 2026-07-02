const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadCatalog, loadCollections } = require("../lib/catalog");
const { buildSitemapEntries, buildSitemapXml } = require("../lib/sitemap");

const siteRoot = path.resolve(__dirname, "../..");

test("buildSitemapEntries includes public pages, shows, and collections", async () => {
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  const entries = buildSitemapEntries({
    siteUrl: "https://echo.continental-hub.com",
    catalog,
    collections,
  });
  const urls = entries.map((entry) => entry.loc);

  assert.ok(urls.includes("https://echo.continental-hub.com/"));
  assert.ok(urls.includes("https://echo.continental-hub.com/collections.html"));
  assert.ok(urls.includes("https://echo.continental-hub.com/for-creators.html"));
  assert.ok(urls.includes("https://echo.continental-hub.com/creator-standards.html"));
  assert.ok(urls.includes("https://echo.continental-hub.com/privacy.html"));
  assert.ok(urls.includes("https://echo.continental-hub.com/terms.html"));
  assert.ok(urls.includes("https://echo.continental-hub.com/cookies.html"));
  assert.ok(urls.includes("https://echo.continental-hub.com/copyright.html"));
  assert.ok(urls.includes("https://echo.continental-hub.com/show.html?id=impact-winter"));
  assert.ok(urls.includes("https://echo.continental-hub.com/collection.html?id=best-for-long-walks"));
});

test("buildSitemapXml serializes the sitemap document", () => {
  const xml = buildSitemapXml({
    siteUrl: "https://echo.continental-hub.com",
    catalog: [{ id: "impact-winter", status: "published", updatedAt: "2026-06-02" }],
    collections: [{ id: "best-for-long-walks", updatedAt: "2026-06-02" }],
  });

  assert.match(xml, /<urlset/);
  assert.match(xml, /show\.html\?id=impact-winter/);
  assert.match(xml, /collection\.html\?id=best-for-long-walks/);
  assert.match(xml, /<lastmod>2026-06-02<\/lastmod>/);
});
