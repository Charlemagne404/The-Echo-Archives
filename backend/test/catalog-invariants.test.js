const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { loadCatalog, loadCollections, resolveCollectionView } = require("../lib/catalog");
const { buildCollectionPath, buildShowPath, isIndexableCollection } = require("../lib/seo");
const { loadEntities, publicEntityRecords } = require("../lib/entities");
const { readCatalogSource } = require("../../tools/lib/catalog-source");
const { createSearchIndexRecord, serializeRuntimeShow } = require("../../tools/lib/catalog-artifacts");
const {
  getEntityShows,
  getPublicEntities,
  isIndexableEntity,
} = require("../../shared/archive-entities");
const { buildSitemapEntries } = require("../lib/sitemap");

const siteRoot = path.resolve(__dirname, "../..");
const siteUrl = "https://archive-contracts.example";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(siteRoot, relativePath), "utf8"));
}

function withoutGeneratedCoverVariants(record) {
  const { coverVariants: _coverVariants, ...stableRecord } = record;
  return JSON.parse(JSON.stringify(stableRecord));
}

test("generated public datasets stay in lockstep with validated source records", async () => {
  const catalog = await loadCatalog(siteRoot);
  const source = readCatalogSource(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  const entities = loadEntities(siteRoot, catalog);
  const runtimeShows = readJson("data/shows.json");
  const searchIndex = readJson("data/search-index.json");
  const runtimeCollections = readJson("data/collections.json");
  const runtimeEntities = readJson("data/entities.json");

  const expectedRuntimeShows = catalog.filter((show) => show.status === "published").map(serializeRuntimeShow);
  const expectedSearchIndex = catalog.filter((show) => show.status === "published").map(createSearchIndexRecord);

  assert.equal(catalog.length, source.shows.length);
  assert.deepEqual(
    runtimeShows.map((show) => show.id),
    expectedRuntimeShows.map((show) => show.id),
    "runtime show order must follow the validated catalog",
  );
  assert.deepEqual(
    searchIndex.map((show) => show.id),
    expectedSearchIndex.map((show) => show.id),
    "search index must cover the same public shows in the same order",
  );

  assert.deepEqual(
    runtimeShows.map(withoutGeneratedCoverVariants),
    expectedRuntimeShows.map(withoutGeneratedCoverVariants),
    "runtime show records must not drift from validated source records",
  );
  assert.deepEqual(
    searchIndex.map(withoutGeneratedCoverVariants),
    expectedSearchIndex.map(withoutGeneratedCoverVariants),
    "search records must not drift from runtime show records",
  );
  assert.deepEqual(runtimeCollections, collections, "runtime collections must match validated collections");
  assert.deepEqual(
    runtimeEntities,
    publicEntityRecords(entities, catalog),
    "runtime creator records must match the public relationship projection",
  );

  assert.ok(runtimeShows.every((show) => show.status === "published"));
  assert.ok(searchIndex.every((show) => show.status === "published"));
});

test("public creator relationships resolve in both directions without orphaned links", async () => {
  const catalog = await loadCatalog(siteRoot);
  const publishedShows = catalog.filter((show) => show.status === "published");
  const entities = loadEntities(siteRoot, catalog);
  const publicEntities = getPublicEntities(entities, publishedShows);
  const publicEntityIds = new Set(publicEntities.map((entity) => entity.id));

  for (const show of publishedShows) {
    const sourceLinks = (show.entityLinks || []).filter((link) => publicEntityIds.has(link.entityId));
    const resolvedLinks = show.resolvedEntities || [];

    assert.deepEqual(
      resolvedLinks.map((entity) => `${entity.id}:${entity.role}`),
      sourceLinks.map((link) => `${link.entityId}:${link.role}`),
      `resolved creator relationships drifted for ${show.id}`,
    );
    assert.ok(resolvedLinks.every((entity) => publicEntityIds.has(entity.id)), show.id);
  }

  for (const entity of publicEntities) {
    const expectedShowIds = publishedShows
      .filter((show) => show.status === "published" && (show.entityLinks || []).some((link) => link.entityId === entity.id))
      .map((show) => show.id);
    const actualShowIds = getEntityShows(entity.id, publishedShows).map((show) => show.id);
    assert.deepEqual(actualShowIds, expectedShowIds, `creator catalogue drifted for ${entity.id}`);
  }
});

test("collection views preserve authored order and sitemap eligibility", async () => {
  const catalog = await loadCatalog(siteRoot);
  const publishedShows = catalog.filter((show) => show.status === "published");
  const showMap = new Map(catalog.map((show) => [show.id, show]));
  const collections = loadCollections(siteRoot, new Set(showMap.keys()));
  const entities = loadEntities(siteRoot, catalog);
  const sitemapUrls = new Set(buildSitemapEntries({ siteUrl, catalog, collections, entities }).map((entry) => entry.loc));

  for (const collection of collections) {
    const view = resolveCollectionView({ catalog, collections, collectionId: collection.id });
    const expectedShowIds = collection.showIds
      .map((showId) => showMap.get(showId))
      .filter((show) => show?.status === "published")
      .map((show) => show.id);

    assert.deepEqual(view.shows.map((show) => show.id), expectedShowIds, `collection order drifted for ${collection.id}`);
    if (collection.kind === "similarity") {
      assert.ok(collection.anchorShowId, collection.id);
      assert.ok(!collection.showIds.includes(collection.anchorShowId), collection.id);
    }

    const indexable = isIndexableCollection(collection, view.shows);
    assert.equal(
      sitemapUrls.has(`${siteUrl}${buildCollectionPath(collection.id)}`),
      indexable,
      `sitemap eligibility drifted for ${collection.id}`,
    );
  }

  assert.ok(publishedShows.every((show) => sitemapUrls.has(`${siteUrl}${buildShowPath(show.id)}`)));
  assert.ok(entities.filter((entity) => isIndexableEntity(entity, publishedShows)).every((entity) => sitemapUrls.has(`${siteUrl}/creators/${encodeURIComponent(entity.id)}`)));
});
