const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createPrecacheUrlSet,
  renderServiceWorker,
  resolveManifestCanonicalUrls,
  resolveSiteUrl,
  serializeStructuredData,
} = require("../build-pages");
const { loadCatalog, loadCollections } = require("../../backend/lib/catalog");
const { loadEntities } = require("../../backend/lib/entities");
const { buildSitemapEntries } = require("../../backend/lib/sitemap");

const ROOT = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readStructuredData(relativePath) {
  const html = read(relativePath);
  const match = html.match(/<script id="pageStructuredData" type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, `${relativePath} should include page structured data`);
  return JSON.parse(match[1]);
}

function graphNode(data, type) {
  return (Array.isArray(data?.["@graph"]) ? data["@graph"] : [data]).find((entry) => entry?.["@type"] === type);
}

test("SITE_URL is authoritative for generated canonical origins", () => {
  const previousSiteUrl = process.env.SITE_URL;
  process.env.SITE_URL = "https://preview.example.test/some-path";
  try {
    const siteUrl = resolveSiteUrl([]);
    assert.equal(siteUrl, "https://preview.example.test");
    const [entry] = resolveManifestCanonicalUrls(
      [{ output: "about.html", canonicalUrl: "https://old.example/about" }],
      siteUrl,
    );
    assert.equal(entry.canonicalUrl, "https://preview.example.test/about");
  } finally {
    if (previousSiteUrl === undefined) {
      delete process.env.SITE_URL;
    } else {
      process.env.SITE_URL = previousSiteUrl;
    }
  }
});

test("structured data serialization cannot close its script element", () => {
  const serialized = serializeStructuredData({ value: "</script><script>alert(1)</script>" });
  assert.doesNotMatch(serialized, /</);
  assert.equal(JSON.parse(serialized).value, "</script><script>alert(1)</script>");
});

test("service-worker install list stays within the offline-shell budget", () => {
  const urls = createPrecacheUrlSet([], {
    app: "app-version",
    archiveRecord: "record-version",
    archiveSearch: "search-version",
    archiveSimilarity: "similarity-version",
    script: "script-version",
    style: "style-version",
    extra: new Map([["info.css", "info-version"]]),
  });

  assert.ok(urls.length <= 30, `expected no more than 30 install URLs, received ${urls.length}`);
  assert.ok(urls.includes("/offline.html"));
  assert.ok(urls.includes("/shared/archive-similarity.js?v=similarity-version"));
  assert.ok(urls.some((url) => url.startsWith("/info.css?v=")));
  assert.equal(urls.some((url) => url.includes("/data/")), false);
  assert.equal(urls.some((url) => url.includes("/pages/") || url.includes("maintainer") || url.includes("chat")), false);
});

test("Library route is a noindex static shell and its modules and stylesheet invalidate the worker cache", () => {
  const manifest = JSON.parse(read("site-src/page-manifest.json"));
  const entry = manifest.find((candidate) => candidate.canonicalUrl === "/library");
  assert.ok(entry);
  assert.equal(entry.output, "library.html");
  assert.equal(entry.noIndex, true);
  assert.equal(entry.includeAnalytics, false);

  const shell = read("library/index.html");
  assert.match(shell, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(shell, /data-analytics-enabled="false"/);
  assert.match(shell, /<noscript>[\s\S]*JavaScript and browser storage are required/);
  assert.doesNotMatch(shell, /personalDiscoveryEnabled|titleSnapshot|createdAt|updatedAt/);
  assert.doesNotMatch(read("sitemap.xml"), /\/library(?:<|\/)/);

  const style = read("library.css");
  assert.match(shell, /library\.css\?v=[a-f0-9]+/);
  assert.match(style, /max-width: 640px/);
  assert.match(read("style.css"), /prefers-reduced-motion/);

  const versions = {
    script: "script",
    library: "library-platform",
    libraryIntegration: "library-ui",
    app: "app",
    scrollRestorationBoot: "boot",
    style: "style",
    archiveRecord: "record",
    archiveSearch: "search",
    archiveSimilarity: "similarity",
    archiveEntities: "entities",
    icons: ["icons"],
    shows: "shows",
    collections: "collections",
    searchIndex: "index",
    extra: new Map([["public-heroes.css", "heroes"], ["info.css", "info"], ["library.css", "library-styles"]]),
  };
  const firstWorker = renderServiceWorker({ versions, manifest: [] });
  const updatedWorker = renderServiceWorker({ versions: { ...versions, library: "changed-library-platform" }, manifest: [] });
  const updatedLibraryStyles = new Map(versions.extra);
  updatedLibraryStyles.set("library.css", "changed-library-styles");
  const updatedLibraryStylesWorker = renderServiceWorker({ versions: { ...versions, extra: updatedLibraryStyles }, manifest: [] });
  assert.notEqual(firstWorker.match(/const CACHE_VERSION = "([^"]+)"/)[1], updatedWorker.match(/const CACHE_VERSION = "([^"]+)"/)[1]);
  assert.notEqual(firstWorker.match(/const CACHE_VERSION = "([^"]+)"/)[1], updatedLibraryStylesWorker.match(/const CACHE_VERSION = "([^"]+)"/)[1]);
  assert.match(read("sw.js"), /const CACHE_VERSION = "[a-f0-9]+"/);
  assert.doesNotMatch(read("sw.js"), /\/shared\/library\//, "local IndexedDB content and Library modules are not precached");
});

test("generated public metadata and discovery documents use one configured origin", async () => {
  const indexHtml = read("index.html");
  const siteUrl = indexHtml.match(/data-site-url="([^"]+)"/)?.[1];
  assert.ok(siteUrl);
  assert.match(indexHtml, /data-shows-version="[a-f0-9]+"/);
  assert.match(indexHtml, /data-collections-version="[a-f0-9]+"/);
  assert.match(indexHtml, /<link rel="preload" as="image" href="\/images\/hero-archive-dish\.webp" type="image\/webp" fetchpriority="high" \/>/);

  ["index.html", "about.html", "collections.html"].forEach((relativePath) => {
    const html = read(relativePath);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    const socialImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    assert.equal(new URL(canonical).origin, siteUrl, `${relativePath} canonical origin`);
    assert.equal(new URL(socialImage).origin, siteUrl, `${relativePath} social image origin`);
    assert.match(html, /<meta property="og:image:alt" content="[^"]+"/);
    assert.match(html, /<meta name="twitter:image:alt" content="[^"]+"/);
  });

  const robots = read("robots.txt");
  const robotsGeneralGroup = robots.split(/\n\s*\n/)[0];
  assert.match(robotsGeneralGroup, /^User-agent: \*$/m);
  assert.match(robotsGeneralGroup, /^Content-Signal: ai-train=no, search=yes, ai-input=yes$/m);
  assert.match(robotsGeneralGroup, /^Allow: \/$/m);
  assert.match(robotsGeneralGroup, /^Disallow: \/maintainer\/$/m);
  assert.match(robotsGeneralGroup, /^Disallow: \/api\/$/m);
  assert.match(robots, new RegExp(`Sitemap: ${siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/sitemap\\.xml`));
  const sitemapXml = read("sitemap.xml");
  assert.match(sitemapXml, /<urlset\b/);
  assert.doesNotMatch(sitemapXml, /<sitemapindex\b/i);
  assert.doesNotMatch(sitemapXml, /\/(?:show|collection)\?id=/);

  const catalog = await loadCatalog(ROOT);
  const collections = loadCollections(ROOT, new Set(catalog.map((show) => show.id)));
  const entities = loadEntities(ROOT, catalog);
  const expectedUrls = buildSitemapEntries({ siteUrl, catalog, collections, entities }).map((entry) => entry.loc);
  const decodeXml = (value) => String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
  const actualUrls = [...sitemapXml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => decodeXml(match[1]));
  assert.ok(actualUrls.length < 50_000, "generated sitemap remains within the URL limit");
  assert.ok(Buffer.byteLength(sitemapXml) < 52_428_800, "generated sitemap remains within the size limit");
  assert.equal(new Set(actualUrls).size, actualUrls.length, "generated sitemap URLs must be unique");
  assert.deepEqual(new Set(actualUrls), new Set(expectedUrls));
});

test("generated structured data describes only supported discovery entities", () => {
  const websiteData = readStructuredData("index.html");
  const website = graphNode(websiteData, "WebSite");
  const homepage = graphNode(websiteData, "WebPage");
  assert.equal(website["@type"], "WebSite");
  assert.equal(website.alternateName, "The Echo Archives — Audio Drama Discovery");
  assert.equal(website.potentialAction["@type"], "SearchAction");
  assert.match(website.potentialAction.target.urlTemplate, /\?q=\{search_term_string\}#archive$/);
  assert.equal(homepage.name, "The Echo Archives — Audio Drama Discovery");

  const directoryData = readStructuredData("collections.html");
  const directory = graphNode(directoryData, "CollectionPage");
  const itemList = graphNode(directoryData, "ItemList");
  const collections = JSON.parse(read("data/collections.json"));
  assert.equal(directory["@type"], "CollectionPage");
  assert.equal(directory.name, "Audio Drama & Fiction Podcast Collections | The Echo Archives");
  assert.equal(directory.mainEntity["@id"], itemList["@id"]);
  assert.equal(itemList.numberOfItems, collections.length);
  assert.equal(itemList.itemListElement.length, collections.length);
  assert.equal(itemList.itemListOrder, "https://schema.org/ItemListOrderAscending");
  assert.ok(itemList.itemListElement.every((entry) => /\/collections\/[a-z0-9-]+$/.test(entry.url)));
  assert.ok(itemList.itemListElement.every((entry) =>
    entry.item?.["@type"] === "CollectionPage" &&
    entry.item["@id"] === `${entry.url}#webpage` &&
    entry.item.url === entry.url,
  ));
  assert.match(read("collections.html"), /data-collections-prerendered="true"/);
  assert.match(read("collections.html"), /href="\/collections\/shows-like-midnight-burger"/);
});

test("private pages and generated asset plumbing have launch-safe output", () => {
  [
    "maintainer/submissions.html",
    "maintainer/submissions/report.html",
    "maintainer/imports.html",
    "maintainer/imports/report.html",
  ].forEach((relativePath) => {
    assert.match(read(relativePath), /<meta name="robots" content="noindex, nofollow, noarchive"/);
  });

  const home = read("index.html");
  assert.match(home, /href="\/home\.css\?v=/);
  assert.match(home, /href="\/collections\.css\?v=/);
  assert.match(home, /href="\/public-heroes\.css\?v=/);
  assert.doesNotMatch(home, /href="\/(?:submit|maintainer|creators)\.css\?v=/);

  const submit = read("submit.html");
  assert.match(submit, /href="\/submit\.css\?v=/);
  assert.match(submit, /href="\/public-heroes\.css\?v=/);
  assert.doesNotMatch(submit, /href="\/(?:home|maintainer|creators)\.css\?v=/);

  const maintainer = read("maintainer/submissions.html");
  assert.match(maintainer, /href="\/maintainer\.css\?v=/);
  assert.doesNotMatch(maintainer, /href="\/(?:home|submit|creators)\.css\?v=/);

  [
    "style.css",
    "public-heroes.css",
    "home.css",
    "info.css",
    "collections.css",
    "creators.css",
    "submit.css",
    "maintainer.css",
    "detail.css",
    "chat.css",
  ].forEach((relativePath) => {
    assert.doesNotMatch(read(relativePath), /@import\b/i, `${relativePath} should be flattened`);
  });

  const serviceWorker = read("sw.js");
  assert.doesNotMatch(serviceWorker, /"\/404\.html"/);
  assert.doesNotMatch(serviceWorker, /"\/500\.html"/);
  assert.match(serviceWorker, /"\/offline\.html"/);
  assert.match(serviceWorker, /"\/info\.css\?v=[a-f0-9]+"/);
  assert.match(serviceWorker, /"\/public-heroes\.css\?v=[a-f0-9]+"/);
  assert.doesNotMatch(serviceWorker, /"\/data\/(?:shows|collections|search-index)\.json/);
  assert.doesNotMatch(serviceWorker, /"\/shared\/app\/(?:chat|maintainer|pages)\//);
  assert.match(serviceWorker, /function isImmutableAssetRequest\(request, url\)/);
  assert.doesNotMatch(serviceWorker, /shouldUseNetworkFirstAssetStrategy|handleNetworkFirstAssetRequest/);
});

test("archive statistics are present before client JavaScript runs", () => {
  const stats = JSON.parse(read("data/archive-stats.json"));
  const about = read("about.html");
  const creators = read("for-creators.html");
  assert.match(about, new RegExp(`id="aboutShowCount">${stats.showCount}<`));
  assert.match(about, new RegExp(`id="aboutReviewCount">${stats.fullReviewCount}<`));
  assert.match(about, new RegExp(`id="aboutCollectionCount">${stats.collectionCount}<`));
  assert.match(creators, new RegExp(`id="creatorsCreatorCount">${stats.creatorCount}<`));
  assert.match(creators, new RegExp(`id="creatorsMetadataCount">${stats.metadataCheckedCount}<`));
});
