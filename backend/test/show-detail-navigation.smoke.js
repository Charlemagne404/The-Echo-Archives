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
      () => Boolean(document.querySelector(".detail-main--indexed") && document.querySelector(".detail-facts-links-card--inline")),
      undefined,
      { timeout: 5_000 },
    );

    const state = await page.evaluate(() => {
      const main = document.querySelector(".detail-main");
      const reviewHeading = Array.from(document.querySelectorAll(".detail-section-header h2"))
        .map((node) => (node.textContent || "").trim())
        .find((text) => /reviews/i.test(text)) || "";
      const creatorValue = document.querySelector(".detail-fact-row:nth-child(1) dd")?.textContent?.trim() || "";
      const linkStatus = document.querySelector(".detail-link-status")?.textContent?.trim() || "";
      const firstRelease = Array.from(document.querySelectorAll(".detail-fact-row"))
        .find((row) => /first release/i.test(row.querySelector("dt")?.textContent || ""))
        ?.querySelector("dd")?.textContent?.trim() || "";
      const latestRelease = Array.from(document.querySelectorAll(".detail-fact-row"))
        .find((row) => /latest release/i.test(row.querySelector("dt")?.textContent || ""))
        ?.querySelector("dd")?.textContent?.trim() || "";
      const routeCount = document.querySelectorAll(".detail-collection-route").length;
      const routeArtCount = document.querySelectorAll(".detail-collection-route-art").length;
      const routeArtImageCount = document.querySelectorAll(".detail-collection-route-art img").length;
      const routeArtFrameCount = document.querySelectorAll(".detail-collection-route-art .collection-cover-frame").length;
      const routeArtWidth = document.querySelector(".detail-collection-route-art")?.getBoundingClientRect().width || 0;
      const disabledChips = document.querySelectorAll(".detail-link-chip.is-disabled").length;
      const hasRail = Boolean(document.querySelector(".detail-side-rail"));
      const firstReviewCard = document.querySelector(".detail-first-review-card");

      return {
        mainWidth: main?.getBoundingClientRect().width || 0,
        reviewHeading,
        creatorValue,
        linkStatus,
        firstRelease,
        latestRelease,
        routeCount,
        routeArtCount,
        routeArtImageCount,
        routeArtFrameCount,
        routeArtWidth,
        disabledChips,
        hasRail,
        firstReviewText: firstReviewCard?.textContent?.trim() || "",
        firstReviewHref: firstReviewCard?.querySelector("a")?.getAttribute("href") || "",
        hasScoreBreakdown: Boolean(document.querySelector(".detail-community-score-section")),
      };
    });

    assert.ok(state.mainWidth > 1200);
    assert.equal(state.reviewHeading, "");
    assert.match(state.firstReviewText, /Add your take to help listeners find their next show\./);
    assert.match(state.firstReviewText, /Be the first to review/);
    assert.match(state.firstReviewHref, /submissionType=listener-review/);
    assert.match(state.firstReviewHref, /showId=solar/);
    assert.equal(state.hasScoreBreakdown, false);
    assert.match(state.creatorValue, /Chris Porter/i);
    assert.match(state.creatorValue, /CurtCo Media/i);
    assert.equal(state.linkStatus, "");
    assert.match(state.firstRelease, /2022/i);
    assert.match(state.latestRelease, /2022/i);
    assert.equal(state.disabledChips, 0);
    assert.equal(state.hasRail, false);
    assert.ok(state.routeCount >= 1);
    assert.equal(state.routeArtCount, state.routeCount);
    assert.ok(state.routeArtImageCount >= state.routeCount * 4);
    assert.ok(state.routeArtFrameCount >= state.routeCount * 4);
    assert.ok(state.routeArtWidth >= 148);

    const firstRoute = page.locator(".detail-collection-route").first();
    const secondFrame = firstRoute.locator('.collection-cover-frame[data-cover-index="2"]');
    const beforeHover = await secondFrame.evaluate((node) => window.getComputedStyle(node).transform);
    await firstRoute.hover();
    await page.waitForTimeout(300);
    const afterHover = await secondFrame.evaluate((node) => window.getComputedStyle(node).transform);
    assert.notEqual(afterHover, beforeHover);
  } finally {
    await page.close();
  }
});

test("show detail layouts stay readable across desktop, intermediate, and compact widths", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  try {
    await page.goto(`${baseUrl}/shows/were-alive`, { waitUntil: "networkidle" });
    const indexedDesktop = await page.evaluate(() => {
      const layout = document.querySelector(".detail-content-layout");
      const facts = document.querySelector(".detail-facts-links-card");
      return {
        layoutWidth: layout?.getBoundingClientRect().width || 0,
        factsWidth: facts?.getBoundingClientRect().width || 0,
        sideRail: Boolean(document.querySelector(".detail-side-rail")),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        archiveNote: Boolean(document.querySelector(".detail-indexed-archive-note")),
        firstReviewCard: Boolean(document.querySelector(".detail-first-review-card")),
        reviewSection: Boolean(document.querySelector(".detail-review-section")),
        scoreBreakdown: Boolean(document.querySelector(".detail-community-score-section")),
      };
    });
    assert.equal(indexedDesktop.sideRail, false);
    assert.ok(indexedDesktop.factsWidth > indexedDesktop.layoutWidth * 0.8);
    assert.ok(indexedDesktop.overflow <= 1);
    assert.equal(indexedDesktop.archiveNote, true);
    assert.equal(indexedDesktop.firstReviewCard, true);
    assert.equal(indexedDesktop.reviewSection, false);
    assert.equal(indexedDesktop.scoreBreakdown, false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/shows/were-alive`, { waitUntil: "networkidle" });
    const indexedMobile = await page.evaluate(() => {
      const card = document.querySelector(".detail-first-review-card");
      const action = card?.querySelector(".detail-primary-action");
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        cardWidth: card?.getBoundingClientRect().width || 0,
        actionWidth: action?.getBoundingClientRect().width || 0,
      };
    });
    assert.ok(indexedMobile.overflow <= 1);
    assert.ok(indexedMobile.cardWidth > 0);
    assert.ok(indexedMobile.actionWidth >= indexedMobile.cardWidth - 40);

    await page.setViewportSize({ width: 980, height: 1100 });
    await page.goto(`${baseUrl}/shows/impact-winter`, { waitUntil: "networkidle" });
    const intermediate = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      reviewTop: document.querySelector("#review-notes")?.getBoundingClientRect().top || 0,
      factsTop: document.querySelector(".detail-facts-links-card")?.getBoundingClientRect().top || 0,
      communityTop: document.querySelector(".community-review-panel")?.getBoundingClientRect().top || 0,
    }));
    assert.ok(intermediate.overflow <= 1);
    assert.ok(intermediate.reviewTop < intermediate.factsTop);
    assert.ok(intermediate.factsTop < intermediate.communityTop);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${baseUrl}/shows/impact-winter`, { waitUntil: "networkidle" });
      const expansion = page.locator(".detail-route-overflow summary");
      await expansion.focus();
      const focused = await expansion.evaluate((node) => {
        const styles = window.getComputedStyle(node);
        return { outlineStyle: styles.outlineStyle, outlineWidth: styles.outlineWidth };
      });
      await expansion.click();
      const compact = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        expanded: document.querySelector(".detail-route-overflow")?.open || false,
        visibleRoutes: document.querySelectorAll(".detail-collection-route").length,
      }));
      assert.ok(compact.overflow <= 1, `${width}px should not overflow`);
      assert.equal(focused.outlineStyle, "solid");
      assert.notEqual(focused.outlineWidth, "0px");
      assert.equal(compact.expanded, true);
      assert.equal(compact.visibleRoutes, 8);
    }
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
