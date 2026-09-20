const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadCatalog, loadCollections } = require("../lib/catalog");
const { loadEntities } = require("../lib/entities");
const { buildPublicReferenceManifest, latestDate } = require("../lib/public-reference");

const siteRoot = path.resolve(__dirname, "../..");

test("public reference manifest documents stable resources and relationships", async () => {
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  const entities = loadEntities(siteRoot, catalog);
  const manifest = buildPublicReferenceManifest({
    siteUrl: "https://echoarchives.net",
    catalog,
    collections,
    entities,
  });

  assert.equal(manifest.schemaVersion, "1.0");
  assert.equal(manifest.canonical, "https://echoarchives.net/data/archive.json");
  assert.equal(manifest.homepage, "https://echoarchives.net/");
  assert.equal(manifest.sitemap, "https://echoarchives.net/sitemap.xml");
  assert.equal(manifest.counts.publishedShows, catalog.filter((show) => show.status === "published").length);
  assert.ok(manifest.counts.indexableCollections > 0);
  assert.ok(manifest.counts.indexableEntities > 0);

  const resources = new Map(manifest.resources.map((resource) => [resource.id, resource]));
  assert.deepEqual([...resources.keys()], ["shows", "collections", "entities", "entity-graph", "search-index"]);
  assert.equal(resources.get("shows").href, "https://echoarchives.net/data/shows.json");
  assert.equal(resources.get("shows").idField, "id");
  assert.equal(resources.get("shows").canonicalUrlTemplate, "https://echoarchives.net/shows/{id}");
  assert.equal(resources.get("collections").canonicalUrlTemplate, "https://echoarchives.net/collections/{id}");
  assert.equal(resources.get("entities").canonicalUrlTemplate, "https://echoarchives.net/creators/{id}");
  assert.equal(resources.get("entity-graph").href, "https://echoarchives.net/data/entity-graph.json");
  assert.equal(resources.get("entity-graph").recordType, "EntityGraph");

  assert.deepEqual(
    manifest.relationships.map(({ source, field, target, relation }) => ({ source, field, target, relation })),
    [
      { source: "shows", field: "entityLinks", target: "entities", relation: "typed-entity-credit" },
      { source: "shows", field: "similarTo", target: "shows", relation: "curated-similarity" },
      { source: "collections", field: "showIds", target: "shows", relation: "curated-membership" },
    ],
  );
  assert.match(manifest.lastModified, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(latestDate(["2026-01-01", "2026-09-20", "not-a-date"]), "2026-09-20");
  assert.equal(Object.hasOwn(manifest, "scope"), false, "the discovery document should remain a small index, not a second catalogue dump");
});
