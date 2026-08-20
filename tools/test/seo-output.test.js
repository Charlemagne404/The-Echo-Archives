const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createPrecacheUrlSet,
  resolveManifestCanonicalUrls,
  resolveSiteUrl,
  serializeStructuredData,
} = require("../build-pages");

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
    script: "script-version",
    style: "style-version",
    extra: new Map([["info.css", "info-version"]]),
  });

  assert.ok(urls.length <= 30, `expected no more than 30 install URLs, received ${urls.length}`);
  assert.ok(urls.includes("/offline.html"));
  assert.ok(urls.some((url) => url.startsWith("/info.css?v=")));
  assert.equal(urls.some((url) => url.includes("/data/")), false);
  assert.equal(urls.some((url) => url.includes("/pages/") || url.includes("maintainer") || url.includes("chat")), false);
});

test("generated public metadata and discovery documents use one configured origin", () => {
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

  assert.match(read("robots.txt"), new RegExp(`Sitemap: ${siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/sitemap\\.xml`));
  assert.match(read("robots.txt"), /^Disallow: \/maintainer\/$/m);
  assert.match(read("robots.txt"), /^Disallow: \/api\/$/m);
  assert.match(read("sitemap.xml"), new RegExp(`<loc>${siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/</loc>`));
  assert.doesNotMatch(read("sitemap.xml"), /\/(?:show|collection)\?id=/);
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
  assert.ok(itemList.itemListElement.every((entry) => /\/collections\/[a-z0-9-]+$/.test(entry.url)));
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
