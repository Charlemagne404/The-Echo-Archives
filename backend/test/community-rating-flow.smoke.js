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
    await page.goto(`${baseUrl}/shows/impact-winter`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(document.querySelector(".community-review-panel")), undefined, { timeout: 5_000 });

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
      const listenerReviewHref = document.querySelector(".detail-review-section a[href*='listener-review']")?.getAttribute("href") || "";

      return {
        mainWidth: main?.getBoundingClientRect().width || 0,
        railLeft: rail?.getBoundingClientRect().left || 0,
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
        listenerReviewHref,
        officialTop: officialSummary?.getBoundingClientRect().top || 0,
        reviewTop: document.querySelector("#review-notes")?.getBoundingClientRect().top || 0,
        communityTop: communityCard?.getBoundingClientRect().top || 0,
        heroCommunityCount: document.querySelectorAll("[data-community-hero-count]").length,
        heroCommunityValue: document.querySelectorAll("[data-community-hero-rating]").length,
        listenActionText: listenAction?.textContent?.trim() || "",
        listenActionHref: listenAction?.getAttribute("href") || "",
        turnstileHidden: document.querySelector(".community-turnstile-shell")?.hidden ?? null,
      };
    });

    assert.ok(layout.mainWidth > 1200);
    assert.ok(layout.railLeft > layout.mainLeft);
    assert.equal(layout.communityCollapsed, false);
    assert.equal(layout.bestForLabel, "Best for");
    assert.ok(layout.bestForItems >= 1);
    assert.equal(layout.boxedDiscoveryGroups, 0);
    assert.equal(layout.heroTagLabel, "Key tags");
    assert.ok(layout.heroTagCount >= 1);
    assert.equal(layout.disabledChips, 0);
    assert.deepEqual(layout.factLabels, [
      "creator / network",
      "fact check",
      "official / listen links",
      "status",
      "seasons / episodes",
      "first release",
      "latest release",
      "runtime note",
    ]);
    assert.match(layout.factCheckText, /Factual metadata only/i);
    assert.match(layout.listenActionText, /^Open /);
    assert.match(layout.listenActionHref, /^https?:\/\//);
    assert.deepEqual(layout.railHeadings, ["Facts & links"]);
    assert.equal(layout.routeInRail, false);
    assert.equal(layout.correctionInRail, false);
    assert.ok(layout.routeSectionWidth > 900);
    assert.ok(layout.correctionSectionWidth > 900);
    assert.ok(layout.officialTop < layout.reviewTop);
    assert.equal(layout.listenerReviewHref, "/submit?submissionType=listener-review&showId=impact-winter");
    assert.equal(layout.heroCommunityCount, 0);
    assert.equal(layout.heroCommunityValue, 0);
    assert.equal(layout.turnstileHidden, true);
    assert.equal(await page.locator(".community-review-body").isVisible(), true);
    assert.equal(await page.locator(".community-review-clear").isVisible(), false);

    const communityState = await page.evaluate(() => {
      const distribution = document.querySelector(".community-review-distribution");
      const distributionBounds = distribution?.getBoundingClientRect();
      const distributionRows = Array.from(document.querySelectorAll(".community-distribution-row")).map((row) => {
        const bounds = row.getBoundingClientRect();
        return {
          rating: Number(row.dataset.ratingValue),
          left: bounds.left,
          top: bounds.top,
        };
      });
      const midpoint = (distributionBounds?.left || 0) + (distributionBounds?.width || 0) / 2;

      return {
        railValue: document.querySelector(".community-review-metric-value")?.dataset.displayText?.trim() || document.querySelector(".community-review-metric-value")?.textContent?.trim() || "",
        ratingButtonsDisabled: Array.from(document.querySelectorAll(".community-review-button")).every((button) => button.disabled),
        distributionRows,
        distributionLeftRatings: distributionRows
          .filter((row) => row.left < midpoint)
          .sort((left, right) => left.top - right.top)
          .map((row) => row.rating),
        distributionRightRatings: distributionRows
          .filter((row) => row.left >= midpoint)
          .sort((left, right) => left.top - right.top)
          .map((row) => row.rating),
        distributionVisible: Boolean(document.querySelector(".community-review-distribution")?.getClientRects().length),
        clearVisible: !document.querySelector(".community-review-clear")?.hidden,
      };
    });
    assert.equal(communityState.railValue, "--/10");
    assert.equal(communityState.ratingButtonsDisabled, true);
    assert.deepEqual(communityState.distributionRows.map((row) => row.rating), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(communityState.distributionLeftRatings, [1, 2, 3, 4, 5]);
    assert.deepEqual(communityState.distributionRightRatings, [6, 7, 8, 9, 10]);
    assert.equal(communityState.distributionVisible, true);
    assert.equal(communityState.clearVisible, false);
  } finally {
    await page.close();
  }

  const mobilePage = await browser.newPage({ viewport: { width: 900, height: 1600 } });

  try {
    await mobilePage.goto(`${baseUrl}/shows/impact-winter`, { waitUntil: "networkidle" });
    await mobilePage.waitForFunction(
      () => Boolean(document.querySelector(".detail-official-summary-section") && document.querySelector(".community-review-panel")),
      undefined,
      { timeout: 5_000 },
    );

    const mobileLayout = await mobilePage.evaluate(() => ({
      officialTop: document.querySelector(".detail-official-summary-section")?.getBoundingClientRect().top || 0,
      communityTop: document.querySelector(".community-review-panel")?.getBoundingClientRect().top || 0,
      reviewTop: document.querySelector("#review-notes")?.getBoundingClientRect().top || 0,
      factsTop: document.querySelector(".detail-facts-links-card")?.getBoundingClientRect().top || 0,
    }));

    assert.ok(mobileLayout.officialTop < mobileLayout.communityTop);
    assert.ok(mobileLayout.reviewTop < mobileLayout.communityTop);
    assert.ok(mobileLayout.communityTop < mobileLayout.factsTop);
  } finally {
    await mobilePage.close();
  }
});

test("detail community rating renders Turnstile and sends the verification token when enabled", async () => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1400 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const ratingRequests = [];
  const summaryProfileIds = [];
  let profileRequests = 0;

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

    await page.route("**/api/community/ratings/summary?*", async (route) => {
      const profileId = route.request().headers()["x-echo-profile-id"] || null;
      summaryProfileIds.push(profileId);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          profileId,
          summaries: {
            "impact-winter": createSummary({
              averageRating: profileId ? 7 : null,
              ratingCount: profileId ? 1 : 0,
              myRating: profileId ? 7 : null,
              distribution: {
                ...createEmptyDistribution(),
                ...(profileId ? { 7: 1 } : {}),
              },
            }),
          },
        }),
      });
    });

    await page.route("**/api/community/profiles/anonymous", async (route) => {
      profileRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ profileId: "00000000-0000-4000-8000-000000000007" }),
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

    await page.goto(`${baseUrl}/shows/impact-winter`, { waitUntil: "networkidle" });
    await page.locator(".community-review-panel .community-turnstile-shell").waitFor({ state: "visible" });
    await page.waitForFunction(() => /complete/i.test(document.querySelector(".community-turnstile-status")?.textContent || ""));
    assert.equal(profileRequests, 0);
    assert.deepEqual(summaryProfileIds, [null]);
    assert.equal(
      await page.evaluate(() => window.localStorage.getItem("echo-community-profile-id")),
      null,
    );

    const turnstilePlacement = await page.evaluate(() => {
      const body = document.querySelector(".community-review-body");
      const verification = document.querySelector(".community-turnstile-shell");
      const distribution = document.querySelector(".community-review-distribution");
      return {
        isLastControl: body?.lastElementChild === verification,
        verificationTop: verification?.getBoundingClientRect().top || 0,
        distributionBottom: distribution?.getBoundingClientRect().bottom || 0,
      };
    });
    assert.equal(turnstilePlacement.isLastControl, true);
    assert.ok(turnstilePlacement.verificationTop >= turnstilePlacement.distributionBottom);

    await page.locator(".community-review-button").nth(6).click();
    await page.waitForFunction(() => window.__echoTurnstileReset === "test-widget-id");

    assert.equal(profileRequests, 1);
    assert.equal(ratingRequests.length, 1);
    assert.equal(ratingRequests[0].rating, 7);
    assert.equal(ratingRequests[0].turnstileToken, "browser-turnstile-token");
    assert.equal(
      await page.evaluate(() => window.localStorage.getItem("echo-community-profile-id")),
      "00000000-0000-4000-8000-000000000007",
    );

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".community-review-button.is-active").waitFor();

    assert.equal(profileRequests, 1);
    assert.equal(summaryProfileIds.at(-1), "00000000-0000-4000-8000-000000000007");
    assert.equal(await page.locator(".community-review-button.is-active").textContent(), "7");
    assert.equal(await page.locator(".community-review-clear").isVisible(), true);
  } finally {
    await context.close();
  }
});

test("review carousel keeps the server-rendered archive first, supports accessible navigation, and recovers from later-page failures", { timeout: 60_000 }, async () => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  let failedPage = 0;
  const helpfulRequests = [];

  try {
    await page.route("**/shows/impact-winter", async (route) => {
      if (!route.request().isNavigationRequest()) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = (await response.text())
        .replace('data-listener-total="0"', 'data-listener-total="8"')
        .replace('Review 1 of 1', 'Review 1 of 9');
      await route.fulfill({ response, body });
    });
    await page.route("**/api/community/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          minPublicRatings: 3,
          ratings: { writeEnabled: true },
          turnstile: { enabled: false, siteKey: "" },
        }),
      });
    });
    await page.route("**/api/community/profiles/anonymous", async (route) => {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ profileId: "carousel-profile" }) });
    });
    await page.route("**/api/reviews/shows/impact-winter?*", async (route) => {
      const requestUrl = new URL(route.request().url());
      const reviewPage = Number(requestUrl.searchParams.get("page") || "1");
      if (reviewPage === failedPage) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "offline" }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reviews: [{
            id: `listener-${reviewPage}`,
            authorName: `Listener ${reviewPage}`,
            title: `Listener page ${reviewPage}`,
            body: `A moderated response from page ${reviewPage}.`,
            ratingStars: 4,
            spoilerLevel: "spoiler-free",
            bestFor: [],
            workedBest: [],
            helpfulCount: reviewPage - 1,
            viewerMarkedHelpful: false,
            publishedAt: "2026-07-16T12:00:00.000Z",
          }],
          pagination: { page: reviewPage, pageSize: 1, totalPages: 8, totalReviews: 8 },
          scoreSummary: {},
        }),
      });
    });
    await page.route("**/api/reviews/*/helpful", async (route) => {
      helpfulRequests.push({ method: route.request().method(), body: route.request().postDataJSON() });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reviewId: "listener-3", helpfulCount: 3, viewerMarkedHelpful: true }),
      });
    });

    await page.goto(`${baseUrl}/shows/impact-winter`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("[data-review-carousel-status]")?.textContent?.includes("Review 1 of 9"));
    const carousel = page.locator("[data-review-carousel]");
    const sectionOrder = await page.evaluate(() => {
      const reviews = document.querySelector("#review-notes");
      const scoreBreakdown = document.querySelector(".detail-community-score-section");
      return {
        hasQuote: Boolean(document.querySelector(".detail-quote")),
        reviewTop: reviews?.getBoundingClientRect().top || 0,
        scoreTop: scoreBreakdown?.getBoundingClientRect().top || 0,
        scoreInsideReviews: Boolean(reviews?.contains(scoreBreakdown)),
      };
    });
    assert.equal(sectionOrder.hasQuote, false);
    assert.equal(sectionOrder.scoreInsideReviews, false);
    assert.ok(sectionOrder.scoreTop > sectionOrder.reviewTop);
    assert.equal(await carousel.locator("[data-review-carousel-slide] .detail-archive-review").count(), 1);

    await carousel.locator("[data-review-carousel-next]").click();
    await page.waitForFunction(() => document.querySelector("[data-review-carousel-slide]")?.textContent?.includes("Listener page 1"));
    await carousel.locator("[data-review-carousel-viewport]").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector("[data-review-carousel-slide]")?.textContent?.includes("Listener page 2"));

    await carousel.locator("[data-review-carousel-viewport]").evaluate((node) => {
      node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 320 }));
      node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 80 }));
    });
    await page.waitForFunction(
      () =>
        document.querySelector("[data-review-carousel-slide]")?.textContent?.includes("Listener page 3") &&
        document.querySelector("[data-review-carousel]")?.getAttribute("data-current-index") === "3",
    );
    const dotState = await carousel.evaluate((node) => ({
      dots: node.querySelectorAll("[data-review-carousel-dot]").length,
      hasEllipsis: Boolean(node.querySelector(".detail-review-carousel-ellipsis")),
    }));
    assert.equal(dotState.dots, 7);
    assert.equal(dotState.hasEllipsis, true);

    await carousel.locator("[data-review-helpful]").click();
    await page.waitForFunction(() => document.querySelector("[data-review-helpful]")?.getAttribute("aria-pressed") === "true");
    assert.deepEqual(helpfulRequests, [{ method: "PUT", body: {} }]);

    failedPage = 4;
    await carousel.locator("[data-review-carousel-next]").click();
    await page.waitForFunction(() => /Review page failed.*Try another review/i.test(document.querySelector("[data-review-carousel-status]")?.textContent || ""));
    assert.match(await carousel.locator("[data-review-carousel-slide]").textContent(), /Listener page 3/);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await carousel.evaluate((node) => ({
      width: node.getBoundingClientRect().width,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      previousWidth: node.querySelector("[data-review-carousel-previous]")?.getBoundingClientRect().width || 0,
      nextWidth: node.querySelector("[data-review-carousel-next]")?.getBoundingClientRect().width || 0,
    }));
    assert.ok(mobile.width > 0);
    assert.ok(mobile.overflow <= 1);
    assert.ok(mobile.previousWidth >= 40);
    assert.ok(mobile.nextWidth >= 40);
  } finally {
    await context.close();
  }
});

test("listener review category controls start optional, collapsed, and expose six labelled stepped sliders", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(`${baseUrl}/submit?submissionType=listener-review&showId=impact-winter`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("[data-category-score-group]").length === 6);
    const categories = await page.evaluate(() => Array.from(document.querySelectorAll("[data-category-score-group]")).map((group) => {
      const slider = group.querySelector('[data-category-score-slider]');
      return {
        name: slider?.getAttribute("aria-label") || "",
        min: slider?.getAttribute("min"),
        max: slider?.getAttribute("max"),
        step: slider?.getAttribute("step"),
        selected: slider?.getAttribute("data-category-score-selected"),
        display: group.querySelector('[data-category-rating-value]')?.textContent?.trim() || "",
      };
    }));
    assert.equal(categories.length, 6);
    categories.forEach((category) => {
      assert.match(category.name, /rating$/i);
      assert.equal(category.min, "1");
      assert.equal(category.max, "10");
      assert.equal(category.step, "1");
      assert.equal(category.selected, "false");
      assert.equal(category.display, "Not rated");
    });
    assert.equal(await page.locator("#submitDetailedRatings").getAttribute("open"), null);
    await page.locator("#submitDetailedRatings > summary").click();
    const voiceActing = page.locator('[data-category-score-slider="voiceActing"]');
    await voiceActing.evaluate((input) => {
      input.value = "8";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(await voiceActing.inputValue(), "8");
    assert.equal(await voiceActing.getAttribute("data-category-score-selected"), "true");
    assert.equal(await page.locator('[data-category-score-group="voiceActing"] [data-category-rating-value]').textContent(), "8/10");
    assert.equal(await voiceActing.evaluate((input) => input.parentElement?.style.getPropertyValue("--category-rating-progress")), "77.77777777777779%");
    assert.match(await page.locator("#submitDetailedRatings > summary").innerText(), /1 of 6 rated/);
  } finally {
    await page.close();
  }
});

test("homepage community badges stay truthful across empty, offline, and stale async summary updates", async () => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
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
    await context.close();
  }
});
