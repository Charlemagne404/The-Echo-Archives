const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSummaryPayload,
  countDistinctRows,
  createEmptyDistribution,
  createSummary,
  getArchiveGridMotionState,
  getCenteredVisibleCollectionCard,
  getCollectionCarouselFocusState,
  getMostPopularBandState,
  getOverlayMetrics,
  getPreviewOverlapPoint,
  getSmokeContext,
  homeMostPopularIds,
  legacyRedirectManifest,
  scoreCatalog,
  setupSmoke,
  teardownSmoke,
  waitForMostPopularBandIds,
} = require("./helpers/browser-smoke");

let browser;
let baseUrl;
let showFixtures;
let collectionFixtures;
let firstCollectionId;
let firstShowId;
let homeMostPopularTitles;

test.before(async () => {
  await setupSmoke();

  ({
    browser,
    baseUrl,
    showFixtures,
    collectionFixtures,
    firstCollectionId,
    firstShowId,
    homeMostPopularTitles,
  } = getSmokeContext());
});

test.after(async () => {
  await teardownSmoke();
});

test("main routes render expected page titles", async () => {
  const page = await browser.newPage();

  try {
    const routes = [
      { url: `${baseUrl}/`, title: "The Echo Archives" },
      { url: `${baseUrl}/about.html`, title: "About - The Echo Archives" },
      { url: `${baseUrl}/for-creators.html`, title: "For Creators - The Echo Archives" },
      { url: `${baseUrl}/creator-standards.html`, title: "Creator Standards - The Echo Archives" },
      { url: `${baseUrl}/supporters.html`, title: "Support the Archive - The Echo Archives" },
      { url: `${baseUrl}/collections.html`, title: "Collections - The Echo Archives" },
      {
        url: `${baseUrl}/collection.html?id=${firstCollectionId}`,
        title: `${collectionFixtures[0].title} - The Echo Archives`,
        waitForResolvedTitle: true,
      },
      {
        url: `${baseUrl}/show.html?id=${firstShowId}`,
        title: `${showFixtures[0].title} - The Echo Archives`,
        waitForResolvedTitle: true,
      },
      { url: `${baseUrl}/submit.html`, title: "Submit a Show - The Echo Archives" },
    ];

    for (const route of routes) {
      await page.goto(route.url, { waitUntil: "load" });
      await page.waitForLoadState("domcontentloaded");
      if (route.waitForResolvedTitle) {
        await page.waitForFunction((expectedTitle) => document.title === expectedTitle, route.title, { timeout: 5_000 });
      }
      assert.equal(await page.title(), route.title);
    }
  } finally {
    await page.close();
  }
});

test("static delivery files remain directly servable", async () => {
  const staticPaths = [
    "/404.html",
    "/robots.txt",
    "/site.webmanifest",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/og-image.png",
  ];

  for (const staticPath of staticPaths) {
    const response = await fetch(`${baseUrl}${staticPath}`);
    assert.equal(response.ok, true, `${staticPath} should be directly servable.`);
  }
});

test("legacy detail redirects still land on the canonical show route", async () => {
  const page = await browser.newPage();

  try {
    for (const redirect of legacyRedirectManifest) {
      await page.goto(encodeURI(`${baseUrl}/${redirect.path}`), { waitUntil: "domcontentloaded" });
      await page.waitForFunction((expectedTarget) => location.pathname + location.search === expectedTarget, redirect.target, {
        timeout: 5_000,
      });
      assert.equal(new URL(await page.url()).pathname + new URL(await page.url()).search, redirect.target);
    }
  } finally {
    await page.close();
  }
});
