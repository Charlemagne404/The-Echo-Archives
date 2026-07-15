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

async function ensureFilterMenuOpen(page) {
  await page.waitForFunction(() => document.body.dataset.homeReady === "true");
  const isOpen = await page.evaluate(() => {
    const dropdown = document.getElementById("filterDropdown");
    return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
  });

  if (isOpen) {
    return;
  }

  await page.locator("#filterToggle").click();
  await page.waitForFunction(() => {
    const dropdown = document.getElementById("filterDropdown");
    return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
  });
}

async function openFilterBucket(page, bucketId) {
  await ensureFilterMenuOpen(page);
  await page.locator(`#filterDropdown [data-filter-bucket-id="${bucketId}"]`).click();
  await page.waitForFunction(
    (currentBucketId) => {
      const detail = document.querySelector("#filterDropdown .filter-menu-detail");
      return Boolean(detail && detail.dataset.filterBucket === currentBucketId);
    },
    bucketId,
  );
}

test("indexed-only detail page shows truthful canonical metadata without narrow legacy layout constraints", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/shows/solar`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => Boolean(document.querySelector(".detail-side-rail") && document.querySelector(".detail-main-column")),
      undefined,
      { timeout: 5_000 },
    );

    const state = await page.evaluate(() => {
      const main = document.querySelector(".detail-main");
      const reviewHeading = Array.from(document.querySelectorAll(".detail-section-header h2"))
        .map((node) => (node.textContent || "").trim())
        .find((text) => /archive note|review notes/i.test(text)) || "";
      const creatorValue = document.querySelector(".detail-fact-row:nth-child(1) dd")?.textContent?.trim() || "";
      const linkStatus = document.querySelector(".detail-link-status")?.textContent?.trim() || "";
      const firstRelease = Array.from(document.querySelectorAll(".detail-fact-row"))
        .find((row) => /first release/i.test(row.querySelector("dt")?.textContent || ""))
        ?.querySelector("dd")?.textContent?.trim() || "";
      const latestRelease = Array.from(document.querySelectorAll(".detail-fact-row"))
        .find((row) => /latest release/i.test(row.querySelector("dt")?.textContent || ""))
        ?.querySelector("dd")?.textContent?.trim() || "";
      const routeCount = document.querySelectorAll(".detail-collection-route").length;
      const disabledChips = document.querySelectorAll(".detail-link-chip.is-disabled").length;

      return {
        mainWidth: main?.getBoundingClientRect().width || 0,
        reviewHeading,
        creatorValue,
        linkStatus,
        firstRelease,
        latestRelease,
        routeCount,
        disabledChips,
      };
    });

    assert.ok(state.mainWidth > 1200);
    assert.equal(state.reviewHeading, "Archive note");
    assert.match(state.creatorValue, /Chris Porter/i);
    assert.match(state.creatorValue, /CurtCo Media/i);
    assert.equal(state.linkStatus, "");
    assert.match(state.firstRelease, /2022/i);
    assert.match(state.latestRelease, /2022/i);
    assert.equal(state.disabledChips, 2);
    assert.ok(state.routeCount >= 1);
  } finally {
    await page.close();
  }
});

test("show-page genre breadcrumb returns to the archive with that genre filter active", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/shows/were-alive`, { waitUntil: "networkidle" });
    await page.locator('.detail-breadcrumbs a[href*="genre=thriller"]').click();
    await page.waitForURL(`${baseUrl}/?genre=thriller#archive`);
    await openFilterBucket(page, "storyType");
    await page.waitForFunction(
      () =>
        document.querySelector('.filter-option[data-filter-group="genres"][data-filter-value="thriller"]')?.classList.contains("is-active") &&
        document.getElementById("filterCount")?.textContent === "1" &&
        document.querySelector('#activeBrowseState:not([hidden]) .active-browse-chip')?.textContent?.includes("Genre: Thriller") &&
        document.querySelector("#resultsSummary")?.textContent?.includes("Genre: Thriller") &&
        document.querySelectorAll("#podcast-grid .podcast-card-shell").length > 0,
      undefined,
      { timeout: 5_000 },
    );

    const state = await page.evaluate(() => ({
      filterCount: document.getElementById("filterCount")?.textContent?.trim() || "",
      genreActive:
        document
          .querySelector('.filter-option[data-filter-group="genres"][data-filter-value="thriller"]')
          ?.classList.contains("is-active") || false,
      activeChipText: document.querySelector("#activeBrowseState .active-browse-chip")?.textContent?.trim() || "",
      summary: document.querySelector("#resultsSummary")?.textContent?.trim() || "",
      cardIds: Array.from(document.querySelectorAll("#podcast-grid .podcast-card-shell"))
        .map((node) => node.getAttribute("data-podcast-id") || "")
        .filter(Boolean),
    }));

    assert.equal(state.filterCount, "1");
    assert.equal(state.genreActive, true);
    assert.match(state.activeChipText, /Genre:\s*Thriller/i);
    assert.match(state.summary, /Genre:\s*Thriller/i);
    assert.ok(state.cardIds.length > 0);
    assert.ok(state.cardIds.includes("were-alive"));
  } finally {
    await page.close();
  }
});

test("clearing a breadcrumb-driven genre filter also clears it from the URL after refresh", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/shows/were-alive`, { waitUntil: "networkidle" });
    await page.locator('.detail-breadcrumbs a[href*="genre=thriller"]').click();
    await page.waitForURL(`${baseUrl}/?genre=thriller#archive`);
    await page.locator('#activeBrowseState .active-browse-chip[data-active-browse-id="genres:thriller"]').click();
    await page.waitForFunction(
      () =>
        !window.location.search.includes("genre=") &&
        document.getElementById("filterCount")?.hidden === true &&
        document.getElementById("activeBrowseState")?.hidden === true,
      undefined,
      { timeout: 5_000 },
    );

    await page.reload({ waitUntil: "networkidle" });
    await openFilterBucket(page, "storyType");

    const state = await page.evaluate(() => ({
      search: window.location.search,
      filterCountHidden: document.getElementById("filterCount")?.hidden ?? false,
      activeBrowseHidden: document.getElementById("activeBrowseState")?.hidden ?? false,
      thrillerActive:
        document
          .querySelector('.filter-option[data-filter-group="genres"][data-filter-value="thriller"]')
          ?.classList.contains("is-active") || false,
    }));

    assert.equal(state.search.includes("genre="), false);
    assert.equal(state.filterCountHidden, true);
    assert.equal(state.activeBrowseHidden, true);
    assert.equal(state.thrillerActive, false);
  } finally {
    await page.close();
  }
});
