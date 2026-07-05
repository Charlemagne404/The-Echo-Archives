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

test("full-review detail page promotes community, trims the rail, and preserves rating interaction", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/show?id=impact-winter`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => {
        const heroCount = document.querySelector("[data-community-hero-count]");
        return Boolean(heroCount && !/Checking listener signal/i.test(heroCount.textContent || ""));
      },
      undefined,
      { timeout: 5_000 },
    );

    const layout = await page.evaluate(() => {
      const getRollingText = (selector) => {
        const node = document.querySelector(selector);
        return node?.dataset.displayText?.trim() || node?.textContent?.trim() || "";
      };
      const main = document.querySelector(".detail-main");
      const rail = document.querySelector(".detail-side-rail");
      const mainColumn = document.querySelector(".detail-main-column");
      const officialSummary = document.querySelector(".detail-official-summary-section");
      const communityCard = document.querySelector(".community-review-panel");
      const archiveTakeCard = document.querySelector(".detail-archive-take-card");
      const communityBody = document.querySelector(".community-review-body");
      const factLabels = Array.from(document.querySelectorAll(".detail-fact-row dt")).map((node) =>
        (node.textContent || "").trim().toLowerCase(),
      );
      const factCheckText =
        Array.from(document.querySelectorAll(".detail-fact-row"))
          .find((row) => /fact check/i.test(row.querySelector("dt")?.textContent || ""))
          ?.querySelector("dd")?.textContent?.trim() || "";
      const disabledChips = document.querySelectorAll(".detail-link-chip.is-disabled").length;
      const railHeadings = Array.from(rail?.querySelectorAll("h2") || []).map((node) => (node.textContent || "").trim());
      const routeInRail = Boolean(rail?.querySelector(".detail-collections-section, .detail-collections-card"));
      const correctionInRail = Boolean(rail?.querySelector(".detail-correction-section, .detail-correction-card"));
      const listenAction = document.querySelector(".detail-listen-action");
      const routeSection = document.querySelector(".detail-collections-section");
      const correctionSection = document.querySelector(".detail-correction-section");
      const bestForLabel = document.querySelector(".detail-best-for-label")?.textContent?.trim() || "";
      const bestForItems = document.querySelectorAll(".detail-best-for-item").length;
      const boxedDiscoveryGroups = document.querySelectorAll(".detail-discovery-group").length;
      const heroTagLabel = document.querySelector(".detail-hero-tag-label")?.textContent?.trim() || "";
      const heroTagCount = document.querySelectorAll(".detail-hero-tag-list .detail-tag").length;
      const reviewLinkHref = document.querySelector(".community-review-link")?.getAttribute("href") || "";

      return {
        mainWidth: main?.getBoundingClientRect().width || 0,
        railLeft: communityCard?.getBoundingClientRect().left || 0,
        mainLeft: mainColumn?.getBoundingClientRect().left || 0,
        communityCollapsed: communityBody?.hidden ?? null,
        factLabels,
        factCheckText,
        disabledChips,
        railHeadings,
        routeInRail,
        correctionInRail,
        routeSectionWidth: routeSection?.getBoundingClientRect().width || 0,
        correctionSectionWidth: correctionSection?.getBoundingClientRect().width || 0,
        bestForLabel,
        bestForItems,
        boxedDiscoveryGroups,
        heroTagLabel,
        heroTagCount,
        reviewLinkHref,
        officialTop: officialSummary?.getBoundingClientRect().top || 0,
        overviewTop: document.querySelector(".detail-overview-section")?.getBoundingClientRect().top || 0,
        communityTop: communityCard?.getBoundingClientRect().top || 0,
        archiveTop: archiveTakeCard?.getBoundingClientRect().top || 0,
        heroCommunityCount: getRollingText("[data-community-hero-count]"),
        heroCommunityValue: getRollingText("[data-community-hero-rating]"),
        listenActionText: listenAction?.textContent?.trim() || "",
        listenActionHref: listenAction?.getAttribute("href") || "",
        turnstileHidden: document.querySelector(".community-turnstile-shell")?.hidden ?? null,
      };
    });

    assert.ok(layout.mainWidth > 1200);
    assert.ok(layout.railLeft > layout.mainLeft);
    assert.equal(layout.communityCollapsed, true);
    assert.equal(layout.bestForLabel, "Best for");
    assert.ok(layout.bestForItems >= 1);
    assert.equal(layout.boxedDiscoveryGroups, 0);
    assert.equal(layout.heroTagLabel, "Key tags");
    assert.ok(layout.heroTagCount >= 1);
    assert.equal(layout.disabledChips, 2);
    assert.deepEqual(layout.factLabels, [
      "creator / network",
      "fact check",
      "official / listen links",
      "status",
      "seasons / episodes",
      "first release",
      "latest release",
    ]);
    assert.match(layout.factCheckText, /Factual metadata only/i);
    assert.match(layout.listenActionText, /^Open /);
    assert.match(layout.listenActionHref, /^https?:\/\//);
    assert.deepEqual(layout.railHeadings, ["Archive take", "Facts & links"]);
    assert.equal(layout.routeInRail, false);
    assert.equal(layout.correctionInRail, false);
    assert.ok(layout.routeSectionWidth > 900);
    assert.ok(layout.correctionSectionWidth > 900);
    assert.ok(layout.officialTop < layout.overviewTop);
    assert.ok(layout.communityTop <= layout.archiveTop);
    assert.equal(layout.reviewLinkHref, "/submit?submissionType=listener-review&showId=impact-winter");
    assert.match(layout.heroCommunityCount, /No ratings yet/i);
    assert.equal(layout.heroCommunityValue, "--/10");
    assert.equal(layout.turnstileHidden, true);
    assert.equal(await page.locator(".community-review-body").isVisible(), false);
    assert.equal(await page.locator(".community-review-clear").isVisible(), false);
    assert.equal(await page.locator(".community-review-link").isVisible(), true);

    const communityState = await page.evaluate(() => {
      const getRollingText = (selector) => {
        const node = document.querySelector(selector);
        return node?.dataset.displayText?.trim() || node?.textContent?.trim() || "";
      };

      return {
        heroCount: getRollingText("[data-community-hero-count]"),
        heroValue: getRollingText("[data-community-hero-rating]"),
        railValue: getRollingText(".community-review-metric-value"),
        toggleText: document.querySelector(".community-review-toggle")?.textContent?.trim() || "",
        toggleDisabled: Boolean(document.querySelector(".community-review-toggle")?.disabled),
        clearVisible: !document.querySelector(".community-review-clear")?.hidden,
      };
    });
    assert.match(communityState.heroCount, /No ratings yet/i);
    assert.equal(communityState.heroValue, "--/10");
    assert.equal(communityState.railValue, "--/10");
    assert.match(communityState.toggleText, /read-only/i);
    assert.equal(communityState.toggleDisabled, true);
    assert.equal(communityState.clearVisible, false);
  } finally {
    await page.close();
  }

  const mobilePage = await browser.newPage({ viewport: { width: 900, height: 1600 } });

  try {
    await mobilePage.goto(`${baseUrl}/show?id=impact-winter`, { waitUntil: "networkidle" });
    await mobilePage.waitForFunction(
      () => Boolean(document.querySelector(".detail-official-summary-section") && document.querySelector(".community-review-panel")),
      undefined,
      { timeout: 5_000 },
    );

    const mobileLayout = await mobilePage.evaluate(() => ({
      officialTop: document.querySelector(".detail-official-summary-section")?.getBoundingClientRect().top || 0,
      communityTop: document.querySelector(".community-review-panel")?.getBoundingClientRect().top || 0,
      overviewTop: document.querySelector(".detail-overview-section")?.getBoundingClientRect().top || 0,
      archiveTop: document.querySelector(".detail-archive-take-card")?.getBoundingClientRect().top || 0,
    }));

    assert.ok(mobileLayout.officialTop < mobileLayout.communityTop);
    assert.ok(mobileLayout.communityTop < mobileLayout.overviewTop);
    assert.ok(mobileLayout.archiveTop > mobileLayout.overviewTop);
  } finally {
    await mobilePage.close();
  }
});

test("detail community rating renders Turnstile and sends the verification token when enabled", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const ratingRequests = [];

  try {
    await page.addInitScript(() => {
      window.turnstile = {
        render(element, options) {
          element.textContent = "listener check";
          window.__echoTurnstileOptions = options;
          window.setTimeout(() => options.callback("browser-turnstile-token"), 0);
          return "test-widget-id";
        },
        reset(widgetId) {
          window.__echoTurnstileReset = widgetId;
        },
      };
    });

    await page.route("**/api/community/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          minPublicRatings: 3,
          ratings: {
            writeEnabled: true,
          },
          turnstile: {
            enabled: true,
            siteKey: "test-site-key",
          },
        }),
      });
    });

    await page.route("**/api/community/podcasts/impact-winter/rating", async (route) => {
      const body = route.request().postDataJSON();
      ratingRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          summary: createSummary({
            averageRating: null,
            ratingCount: 1,
            myRating: body.rating,
            distribution: { ...createEmptyDistribution(), [String(body.rating)]: 1 },
          }),
        }),
      });
    });

    await page.goto(`${baseUrl}/show?id=impact-winter`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Rate this show" }).click();
    await page.locator(".community-turnstile-shell").waitFor({ state: "visible" });
    await page.waitForFunction(() => /complete/i.test(document.querySelector(".community-turnstile-status")?.textContent || ""));

    await page.locator(".community-review-button").nth(6).click();
    await page.waitForFunction(() => window.__echoTurnstileReset === "test-widget-id");

    assert.equal(ratingRequests.length, 1);
    assert.equal(ratingRequests[0].rating, 7);
    assert.equal(ratingRequests[0].turnstileToken, "browser-turnstile-token");
  } finally {
    await page.close();
  }
});

test("homepage community badges stay truthful across empty, offline, and stale async summary updates", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const emptyShowId = "impact-winter";
  const delayedShowId = "impact-winter";
  const activeShowId = "midnight-burger";

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator(`#podcast-grid .podcast-card-shell[data-podcast-id="${emptyShowId}"] .podcast-card-primary .community-inline-score[data-podcast-id="${emptyShowId}"]`).waitFor();

    let badgeState = await page.evaluate((showId) => {
      const badge = document.querySelector(`#podcast-grid .podcast-card-shell[data-podcast-id="${showId}"] .podcast-card-primary .community-inline-score[data-podcast-id="${showId}"]`);
      const value = badge?.querySelector(".community-inline-score-value")?.textContent?.trim() || "";
      return {
        value,
        aria: badge?.getAttribute("aria-label") || "",
      };
    }, emptyShowId);
    assert.equal(badgeState.value, "--/10");
    assert.match(badgeState.aria, /No ratings yet/i);

    await page.route("**/api/community/ratings/summary?*", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "offline" }),
      });
    });

    await page.evaluate(async (showId) => {
      const { dataCache } = await import("/shared/app/constants.js");
      const { syncCommunityCardBadges } = await import("/shared/app/community.js");
      dataCache.communitySummaries.clear();
      const container = document.getElementById("podcast-grid");
      await syncCommunityCardBadges(container, [{ id: showId }]);
    }, emptyShowId);

    badgeState = await page.evaluate((showId) => {
      const badge = document.querySelector(`#podcast-grid .podcast-card-shell[data-podcast-id="${showId}"] .podcast-card-primary .community-inline-score[data-podcast-id="${showId}"]`);
      const value = badge?.querySelector(".community-inline-score-value")?.textContent?.trim() || "";
      return {
        value,
        aria: badge?.getAttribute("aria-label") || "",
      };
    }, emptyShowId);
    assert.equal(badgeState.value, "--/10");
    assert.match(badgeState.aria, /unavailable/i);

    await page.unroute("**/api/community/ratings/summary?*");

    let releaseDelayedResponse;
    const delayedRequestSeen = new Promise((resolve) => {
      releaseDelayedResponse = resolve;
    });

    await page.route("**/api/community/ratings/summary?*", async (route) => {
      const url = new URL(route.request().url());
      const ids = url.searchParams.get("podcastIds") || "";

      if (ids === delayedShowId) {
        await delayedRequestSeen;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            summaries: {
              [delayedShowId]: {
                averageRating: 4,
                ratingCount: 1,
                myRating: null,
                distribution: { "4": 1 },
              },
            },
          }),
        });
        return;
      }

      if (ids === activeShowId) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            summaries: {
              [activeShowId]: {
                averageRating: 6.5,
                ratingCount: 2,
                myRating: null,
                distribution: { "6": 1, "7": 1 },
              },
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.evaluate(async ({ delayedShowId, activeShowId }) => {
      const { dataCache } = await import("/shared/app/constants.js");
      const { syncCommunityCardBadges } = await import("/shared/app/community.js");
      dataCache.communitySummaries.clear();
      const container = document.getElementById("podcast-grid");
      void syncCommunityCardBadges(container, [{ id: delayedShowId }]);
      await syncCommunityCardBadges(container, [{ id: activeShowId }]);
    }, { delayedShowId, activeShowId });

    let staleState = await page.evaluate(({ delayedShowId, activeShowId }) => {
      const delayedBadge = document.querySelector(`#podcast-grid .podcast-card-shell[data-podcast-id="${delayedShowId}"] .podcast-card-primary .community-inline-score[data-podcast-id="${delayedShowId}"]`);
      const activeBadge = document.querySelector(`#podcast-grid .podcast-card-shell[data-podcast-id="${activeShowId}"] .podcast-card-primary .community-inline-score[data-podcast-id="${activeShowId}"]`);
      return {
        delayedValue: delayedBadge?.querySelector(".community-inline-score-value")?.textContent?.trim() || "",
        activeValue: activeBadge?.querySelector(".community-inline-score-value")?.textContent?.trim() || "",
      };
    }, { delayedShowId, activeShowId });
    assert.equal(staleState.delayedValue, "--/10");
    assert.equal(staleState.activeValue, "6.5/10");

    releaseDelayedResponse();
    await page.waitForTimeout(100);

    staleState = await page.evaluate(({ delayedShowId, activeShowId }) => {
      const delayedBadge = document.querySelector(`#podcast-grid .podcast-card-shell[data-podcast-id="${delayedShowId}"] .podcast-card-primary .community-inline-score[data-podcast-id="${delayedShowId}"]`);
      const activeBadge = document.querySelector(`#podcast-grid .podcast-card-shell[data-podcast-id="${activeShowId}"] .podcast-card-primary .community-inline-score[data-podcast-id="${activeShowId}"]`);
      return {
        delayedValue: delayedBadge?.querySelector(".community-inline-score-value")?.textContent?.trim() || "",
        activeValue: activeBadge?.querySelector(".community-inline-score-value")?.textContent?.trim() || "",
      };
    }, { delayedShowId, activeShowId });
    assert.equal(staleState.delayedValue, "--/10");
    assert.equal(staleState.activeValue, "6.5/10");
  } finally {
    await page.close();
  }
});
