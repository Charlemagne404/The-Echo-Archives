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

test("for creators page is reachable from nav and its primary interactions work", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator('.site-nav a[href="/for-creators"]').click();
    await page.waitForURL(`${baseUrl}/for-creators`);
    await page.waitForFunction(
      () => {
        const creatorCount = document.getElementById("creatorsCreatorCount");
        return Boolean(creatorCount && creatorCount.textContent && creatorCount.textContent.trim() !== "-");
      },
      undefined,
      { timeout: 5_000 },
    );

    const initialState = await page.evaluate(() => ({
      activeNavHref: document.querySelector(".site-nav a.is-active")?.getAttribute("href") || "",
      creatorCount: document.getElementById("creatorsCreatorCount")?.textContent?.trim() || "",
      showCount: document.getElementById("creatorsShowCount")?.textContent?.trim() || "",
      metadataCount: document.getElementById("creatorsMetadataCount")?.textContent?.trim() || "",
      reviewCount: document.getElementById("creatorsReviewCount")?.textContent?.trim() || "",
      spotlightPresent: Boolean(document.getElementById("creator-spotlight")),
      futureSpotlightText:
        Array.from(document.querySelectorAll(".creator-list-item"))
          .find((item) => (item.textContent || "").includes("Spotlights & features"))
          ?.textContent?.trim() || "",
      submitHref:
        document.querySelector('.creator-action-card a[href^="/submit?submissionType=show"]')?.getAttribute("href") || "",
      correctionHref:
        document.querySelector('.creator-action-card a[href^="/submit?submissionType=correction"]')?.getAttribute("href") || "",
      verificationHref:
        document.querySelector('.creator-action-card a[href^="/submit?submissionType=creator-verification"]')?.getAttribute("href") || "",
      standardsHref:
        document.querySelector('.creator-action-card a[href="/creator-standards"]')?.getAttribute("href") || "",
      updatesStandardsHref:
        document.querySelector('.creator-list-card-updates .creator-list-footer-link')?.getAttribute("href") || "",
      independentStandardsHref:
        document.querySelector('.creator-list-card-independent .creator-list-footer-link')?.getAttribute("href") || "",
      independentGridColumnCount: (() => {
        const grid = document.querySelector(".creator-list-grid-independent");
        if (!(grid instanceof HTMLElement)) {
          return 0;
        }

        const template = window.getComputedStyle(grid).gridTemplateColumns.trim();
        return template ? template.split(" ").length : 0;
      })(),
      faqExpanded: document.getElementById("creatorFaqQuestion1")?.getAttribute("aria-expanded") || "",
      faqHidden: Boolean(document.getElementById("creatorFaqAnswer1")?.hidden),
    }));

    assert.equal(initialState.activeNavHref, "/for-creators");
    assert.ok(Number.parseInt(initialState.creatorCount, 10) > 0);
    assert.ok(Number.parseInt(initialState.showCount, 10) > 0);
    assert.ok(Number.parseInt(initialState.metadataCount, 10) > 0);
    assert.ok(Number.parseInt(initialState.reviewCount, 10) >= 0);
    assert.equal(initialState.spotlightPresent, false);
    assert.match(initialState.futureSpotlightText, /Spotlights & features/i);
    assert.match(initialState.futureSpotlightText, /When they launch, they stay editorial/i);
    assert.equal(initialState.submitHref, "/submit?submissionType=show");
    assert.equal(initialState.correctionHref, "/submit?submissionType=correction");
    assert.equal(initialState.verificationHref, "/submit?submissionType=creator-verification");
    assert.equal(initialState.standardsHref, "/creator-standards");
    assert.equal(initialState.updatesStandardsHref, "/creator-standards");
    assert.equal(initialState.independentStandardsHref, "/creator-standards#creatorStandardsIndependence");
    assert.equal(initialState.independentGridColumnCount, 1);
    assert.equal(initialState.faqExpanded, "false");
    assert.equal(initialState.faqHidden, true);

    await page.locator("#creatorFaqQuestion1").click();
    await page.waitForFunction(
      () => document.getElementById("creatorFaqQuestion1")?.getAttribute("aria-expanded") === "true",
      undefined,
      { timeout: 5_000 },
    );
    let faqState = await page.evaluate(() => ({
      expanded: document.getElementById("creatorFaqQuestion1")?.getAttribute("aria-expanded") || "",
      hidden: Boolean(document.getElementById("creatorFaqAnswer1")?.hidden),
      answerText: document.getElementById("creatorFaqAnswer1")?.textContent?.trim() || "",
    }));
    assert.equal(faqState.expanded, "true");
    assert.equal(faqState.hidden, false);
    assert.match(faqState.answerText, /manual|nothing auto-publishes|sources/i);

    await page.locator("#creatorFaqQuestion1").click();
    await page.waitForFunction(
      () => document.getElementById("creatorFaqQuestion1")?.getAttribute("aria-expanded") === "false",
      undefined,
      { timeout: 5_000 },
    );
    faqState = await page.evaluate(() => ({
      expanded: document.getElementById("creatorFaqQuestion1")?.getAttribute("aria-expanded") || "",
      hidden: Boolean(document.getElementById("creatorFaqAnswer1")?.hidden),
    }));
    assert.equal(faqState.expanded, "false");
    assert.equal(faqState.hidden, true);

    await page.locator('.creator-action-card a[href="/creator-standards"]').click();
    await page.waitForURL(`${baseUrl}/creator-standards`);
    assert.equal(await page.title(), "Creator Standards - The Echo Archives");
  } finally {
    await page.close();
  }
});
