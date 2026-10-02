const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadCatalog, loadCollections } = require("../lib/catalog");
const { loadEntities } = require("../lib/entities");
const { buildSitemapEntries, buildSitemapXml } = require("../lib/sitemap");

const siteRoot = path.resolve(__dirname, "../..");

test("buildSitemapEntries includes public pages, shows, and collections", async () => {
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  const entities = loadEntities(siteRoot, catalog);
  const entries = buildSitemapEntries({
    siteUrl: "https://echoarchives.net",
    catalog,
    collections,
    entities,
  });
  const urls = entries.map((entry) => entry.loc);

  assert.ok(urls.includes("https://echoarchives.net/"));
  assert.ok(urls.includes("https://echoarchives.net/collections"));
  assert.ok(urls.includes("https://echoarchives.net/for-creators"));
  assert.ok(urls.includes("https://echoarchives.net/creator-standards"));
  assert.ok(urls.includes("https://echoarchives.net/supporters"));
  assert.ok(urls.includes("https://echoarchives.net/help-center"));
  assert.ok(urls.includes("https://echoarchives.net/privacy"));
  assert.ok(urls.includes("https://echoarchives.net/terms"));
  assert.ok(urls.includes("https://echoarchives.net/cookies"));
  assert.ok(urls.includes("https://echoarchives.net/copyright"));
  assert.ok(urls.includes("https://echoarchives.net/shows/impact-winter"));
  assert.ok(urls.includes("https://echoarchives.net/collections/best-for-long-walks"));
  const latest = (values) => values.filter(Boolean).sort().at(-1);
  assert.equal(
    entries.find((entry) => entry.loc === "https://echoarchives.net/").lastmod,
    latest([
      ...catalog.filter((show) => show.status === "published").map((show) => show.updatedAt),
      ...collections.map((collection) => collection.updatedAt),
    ]),
  );
  assert.equal(
    entries.find((entry) => entry.loc === "https://echoarchives.net/collections").lastmod,
    latest(collections.map((collection) => collection.updatedAt)),
  );
  assert.equal(
    entries.find((entry) => entry.loc === "https://echoarchives.net/creators").lastmod,
    latest(entities.map((entity) => entity.reviewedAt)),
  );
  assert.equal(urls.some((url) => url.includes("?id=")), false);
  assert.equal(new Set(urls).size, urls.length);
});

test("buildSitemapXml serializes the sitemap document", () => {
  const xml = buildSitemapXml({
    siteUrl: "https://echoarchives.net",
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

test("sitemaps beyond 50000 URLs produce bounded shards and a canonical index", () => {
  const { buildSitemapDocuments } = require("../lib/sitemap");
  const { XMLValidator, XMLParser } = require("fast-xml-parser");
  const catalog = Array.from({ length: 50001 }, (_, index) => ({ id: `show-${index}`, status: "published", updatedAt: "2026-10-01" }));
  const documents = buildSitemapDocuments({ siteUrl: "https://echo.example", catalog, collections: [] });
  assert.equal(documents.size, 3);
  const parser = new XMLParser();
  const index = parser.parse(documents.get("sitemap.xml")).sitemapindex.sitemap;
  assert.deepEqual(index.map((entry) => entry.loc), ["https://echo.example/sitemap-1.xml", "https://echo.example/sitemap-2.xml"]);
  const urls = [];
  for (const name of ["sitemap-1.xml", "sitemap-2.xml"]) {
    const xml = documents.get(name);
    assert.equal(XMLValidator.validate(xml), true);
    assert.ok(Buffer.byteLength(xml) <= 52428800);
    const entries = parser.parse(xml).urlset.url;
    assert.ok(entries.length <= 50000);
    urls.push(...entries.map((entry) => entry.loc));
  }
  assert.equal(urls.length, 50014);
  assert.equal(new Set(urls).size, urls.length);
});

test("sitemap byte limits use UTF-8 bytes and preserve every escaped URL", () => {
  const { buildSitemapDocuments, buildSitemapEntries } = require("../lib/sitemap");
  const options = { siteUrl: "https://echo.example", catalog: Array.from({ length: 20 }, (_, index) => ({ id: `café-${index}`, status: "published" })), collections: [] };
  const documents = buildSitemapDocuments(options, { maxBytes: 512 });
  assert.match(documents.get("sitemap.xml"), /sitemapindex/);
  let count = 0;
  for (const [name, xml] of documents) {
    if (name === "sitemap.xml") continue;
    assert.ok(Buffer.byteLength(xml) <= 512);
    count += (xml.match(/<url>/g) || []).length;
  }
  assert.equal(count, buildSitemapEntries(options).length);
});
