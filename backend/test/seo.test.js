const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadCatalog, loadCollections } = require("../lib/catalog");
const {
  buildCollectionPageMetadata,
  buildCollectionStructuredData,
  buildShowPageMetadata,
  buildShowStructuredData,
} = require("../lib/public-page-render");
const { buildSitemapEntries } = require("../lib/sitemap");
const { buildCollectionPath, buildShowPath, buildShowSeoTitle, isIndexableCollection } = require("../lib/seo");

const siteRoot = path.resolve(__dirname, "../..");
const siteUrl = "https://seo.example.test";
const placeholderPattern = /(?:loading|placeholder|untitled|description unavailable|coming soon)/i;

function graphNode(data, type) {
  return data["@graph"].find((node) => node["@type"] === type);
}

test("show titles only promise reviews or recommendations backed by public content", () => {
  assert.equal(
    buildShowSeoTitle({ title: "Reviewed", reviewStatus: "full-review", archiveTake: "A complete archive verdict." }),
    "Reviewed Review, Rating & Similar Shows | The Echo Archives",
  );
  assert.equal(
    buildShowSeoTitle({ title: "Connected", similarTo: ["neighbor"], similarReasons: { neighbor: "Shared tone and form." } }),
    "Connected — Similar Audio Dramas | The Echo Archives",
  );
  assert.equal(
    buildShowSeoTitle({ title: "Sparse", reviewStatus: "full-review", similarTo: ["neighbor"], similarReasons: {} }),
    "Sparse — Episodes, Links & Details | The Echo Archives",
  );
});

test("every published show has unique canonical metadata and connected JSON-LD", async () => {
  const catalog = (await loadCatalog(siteRoot)).filter((show) => show.status === "published");
  const canonicals = [];

  for (const show of catalog) {
    const metadata = buildShowPageMetadata({ siteUrl, show });
    const structuredData = buildShowStructuredData({ siteUrl, show });
    const webPage = graphNode(structuredData, "WebPage");
    const podcastSeries = graphNode(structuredData, "PodcastSeries");
    const breadcrumbs = graphNode(structuredData, "BreadcrumbList");

    assert.equal(metadata.canonicalUrl, `${siteUrl}${buildShowPath(show.id)}`, show.id);
    assert.match(metadata.title, /(?:Review, Rating & Similar Shows|Similar Audio Dramas|Episodes, Links & Details) \| The Echo Archives$/);
    assert.match(metadata.description, /audio drama/i);
    assert.doesNotMatch(metadata.title, placeholderPattern);
    assert.doesNotMatch(metadata.description, placeholderPattern);
    assert.equal(webPage.url, metadata.canonicalUrl);
    assert.equal(webPage.mainEntity["@id"], podcastSeries["@id"]);
    assert.equal(podcastSeries.url, metadata.canonicalUrl);
    assert.equal(breadcrumbs.itemListElement.at(-1).item, metadata.canonicalUrl);
    assert.equal(webPage.primaryImageOfPage.url, metadata.imageUrl);
    assert.equal(webPage.datePublished, show.createdAt, show.id);
    assert.equal(webPage.dateModified, show.updatedAt || show.createdAt, show.id);
    assert.equal(podcastSeries.datePublished, undefined);
    canonicals.push(metadata.canonicalUrl);
  }

  assert.ok(canonicals.length > 0);
  assert.equal(new Set(canonicals).size, canonicals.length);
});

test("indexable collections meet the editorial quality gate and use canonical show URLs", async () => {
  const catalog = (await loadCatalog(siteRoot)).filter((show) => show.status === "published");
  const showMap = new Map(catalog.map((show) => [show.id, show]));
  const collections = loadCollections(siteRoot, new Set(showMap.keys()));
  const canonicals = [];

  for (const collection of collections) {
    const collectionShows = collection.showIds.map((showId) => showMap.get(showId)).filter(Boolean);
    if (!isIndexableCollection(collection, collectionShows)) continue;

    const metadata = buildCollectionPageMetadata({ siteUrl, collection, collectionShows });
    const structuredData = buildCollectionStructuredData({ siteUrl, collection, collectionShows });
    const collectionPage = graphNode(structuredData, "CollectionPage");
    const itemList = graphNode(structuredData, "ItemList");
    const breadcrumbs = graphNode(structuredData, "BreadcrumbList");

    assert.equal(metadata.canonicalUrl, `${siteUrl}${buildCollectionPath(collection.id)}`, collection.id);
    assert.match(metadata.title, /Audio Drama Recommendations \| The Echo Archives$/);
    assert.match(metadata.description, /human-curated audio drama and fiction podcast recommendations/i);
    assert.doesNotMatch(metadata.description, placeholderPattern);
    assert.equal(collectionPage.url, metadata.canonicalUrl);
    assert.equal(collectionPage.mainEntity["@id"], itemList["@id"]);
    assert.equal(itemList.numberOfItems, collectionShows.length);
    assert.ok(itemList.itemListElement.every((item) => item.url.startsWith(`${siteUrl}/shows/`)));
    assert.ok(itemList.itemListElement.every((item) => item.description.length >= 20));
    assert.equal(breadcrumbs.itemListElement.at(-1).item, metadata.canonicalUrl);
    canonicals.push(metadata.canonicalUrl);
  }

  assert.ok(canonicals.length > 0);
  assert.equal(new Set(canonicals).size, canonicals.length);
});

test("the sitemap is exactly the canonical indexable route set", async () => {
  const catalog = await loadCatalog(siteRoot);
  const publishedShows = catalog.filter((show) => show.status === "published");
  const showMap = new Map(publishedShows.map((show) => [show.id, show]));
  const collections = loadCollections(siteRoot, new Set(showMap.keys()));
  const indexableCollections = collections.filter((collection) => {
    const collectionShows = collection.showIds.map((showId) => showMap.get(showId)).filter(Boolean);
    return isIndexableCollection(collection, collectionShows);
  });
  const staticPaths = [
    "/",
    "/about",
    "/for-creators",
    "/creator-standards",
    "/supporters",
    "/help-center",
    "/submit",
    "/collections",
    "/privacy",
    "/terms",
    "/cookies",
    "/copyright",
  ];
  const expectedUrls = new Set([
    ...staticPaths.map((routePath) => `${siteUrl}${routePath}`),
    ...publishedShows.map((show) => `${siteUrl}${buildShowPath(show.id)}`),
    ...indexableCollections.map((collection) => `${siteUrl}${buildCollectionPath(collection.id)}`),
  ]);
  const entries = buildSitemapEntries({ siteUrl, catalog, collections });
  const actualUrls = entries.map((entry) => entry.loc);

  assert.equal(new Set(actualUrls).size, actualUrls.length);
  assert.deepEqual(new Set(actualUrls), expectedUrls);
  assert.ok(actualUrls.every((url) => !url.includes("?") && !url.endsWith(".html")));
});
