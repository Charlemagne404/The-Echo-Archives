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
  assert.ok(urls.includes("https://echo.continental-hub.com/collections"));
  assert.ok(urls.includes("https://echo.continental-hub.com/for-creators"));
  assert.ok(urls.includes("https://echo.continental-hub.com/creator-standards"));
  assert.ok(urls.includes("https://echo.continental-hub.com/supporters"));
  assert.ok(urls.includes("https://echo.continental-hub.com/help-center"));
  assert.ok(urls.includes("https://echo.continental-hub.com/privacy"));
  assert.ok(urls.includes("https://echo.continental-hub.com/terms"));
  assert.ok(urls.includes("https://echo.continental-hub.com/cookies"));
  assert.ok(urls.includes("https://echo.continental-hub.com/copyright"));
  assert.ok(urls.includes("https://echo.continental-hub.com/shows/impact-winter"));
  assert.ok(urls.includes("https://echo.continental-hub.com/collections/best-for-long-walks"));
  assert.equal(urls.some((url) => url.includes("?id=")), false);
  assert.equal(new Set(urls).size, urls.length);
});

test("buildSitemapXml serializes the sitemap document", () => {
  const xml = buildSitemapXml({
    siteUrl: "https://echo.continental-hub.com",
    catalog: [
      { id: "impact-winter", status: "published", updatedAt: "2026-06-02" },
      { id: "solar", status: "published", updatedAt: "2026-06-02" },
      { id: "derelict", status: "published", updatedAt: "2026-06-02" },
      { id: "tower-4", status: "published", updatedAt: "2026-06-02" },
    ],
    collections: [{
      id: "best-for-long-walks",
      title: "Best for long walks",
      description: "Long-form audio dramas with enough momentum and scale to carry an extended walk.",
      updatedAt: "2026-06-02",
      showIds: ["impact-winter", "solar", "derelict", "tower-4"],
      showReasons: {
        "impact-winter": "A cinematic survival listen with enough story for a long route.",
        solar: "A focused space thriller that keeps moving across a full walk.",
        derelict: "Big production and sustained pressure reward uninterrupted listening.",
        "tower-4": "A slow-burn mystery that fits a longer, quieter route.",
      },
    }],
  });

  assert.match(xml, /<urlset/);
  assert.match(xml, /shows\/impact-winter/);
  assert.match(xml, /collections\/best-for-long-walks/);
  assert.match(xml, /<lastmod>2026-06-02<\/lastmod>/);
});

test("thin collections stay out of the sitemap", () => {
  const entries = buildSitemapEntries({
    siteUrl: "https://example.test",
    catalog: [{ id: "show-one", status: "published" }],
    collections: [{ id: "thin", title: "Thin", description: "Too short", showIds: ["show-one"] }],
  });
  assert.equal(entries.some((entry) => entry.loc.endsWith("/collections/thin")), false);
});
