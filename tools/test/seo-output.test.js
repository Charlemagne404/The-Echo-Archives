const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
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
  assert.match(read("sitemap.xml"), new RegExp(`<loc>${siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/</loc>`));
});

test("generated structured data describes only supported discovery entities", () => {
  const website = readStructuredData("index.html");
  assert.equal(website["@type"], "WebSite");
  assert.equal(website.potentialAction["@type"], "SearchAction");
  assert.match(website.potentialAction.target.urlTemplate, /\?q=\{search_term_string\}#archive$/);

  const directory = readStructuredData("collections.html");
  const collections = JSON.parse(read("data/collections.json"));
  assert.equal(directory["@type"], "CollectionPage");
  assert.equal(directory.mainEntity["@type"], "ItemList");
  assert.equal(directory.mainEntity.numberOfItems, collections.length);
  assert.equal(directory.mainEntity.itemListElement.length, collections.length);
});

test("private pages and generated asset plumbing have launch-safe output", () => {
  [
    "maintainer/submissions.html",
    "maintainer/submissions/report.html",
    "maintainer/imports.html",
    "maintainer/imports/report.html",
  ].forEach((relativePath) => {
    assert.match(read(relativePath), /<meta name="robots" content="noindex, nofollow"/);
  });

  ["style.css", "home.css", "detail.css"].forEach((relativePath) => {
    assert.doesNotMatch(read(relativePath), /@import\b/i, `${relativePath} should be flattened`);
  });

  const serviceWorker = read("sw.js");
  assert.doesNotMatch(serviceWorker, /"\/404\.html"/);
  assert.doesNotMatch(serviceWorker, /"\/500\.html"/);
  assert.match(serviceWorker, /"\/data\/shows\.json\?v=[a-f0-9]+"/);
  assert.match(serviceWorker, /"\/data\/collections\.json\?v=[a-f0-9]+"/);
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
