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
let fullReviewShowId;

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
  fullReviewShowId = showFixtures.find((show) => show.reviewStatus === "full-review")?.id || firstShowId;
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
      { url: `${baseUrl}/help-center.html`, title: "Help Center - The Echo Archives" },
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

test("mobile header menu opens, closes, and routes cleanly on phone widths", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const closedState = await page.evaluate(() => ({
      toggleVisible: window.getComputedStyle(document.getElementById("siteNavToggle") || document.body).display !== "none",
      navState: document.getElementById("siteNavShell")?.dataset.state || "",
      expanded: document.getElementById("siteNavToggle")?.getAttribute("aria-expanded") || "",
      bodyLocked: document.body.classList.contains("site-nav-open"),
    }));
    assert.equal(closedState.toggleVisible, true);
    assert.equal(closedState.navState, "closed");
    assert.equal(closedState.expanded, "false");
    assert.equal(closedState.bodyLocked, false);

    await page.locator("#siteNavToggle").click();
    await page.waitForFunction(() => document.getElementById("siteNavShell")?.dataset.state === "open");

    const openState = await page.evaluate(() => ({
      navState: document.getElementById("siteNavShell")?.dataset.state || "",
      expanded: document.getElementById("siteNavToggle")?.getAttribute("aria-expanded") || "",
      bodyLocked: document.body.classList.contains("site-nav-open"),
      navLinkCount: document.querySelectorAll(".site-nav a").length,
      profileVisible: window.getComputedStyle(document.querySelector(".site-nav-shell .profile-button") || document.body).display !== "none",
    }));
    assert.equal(openState.navState, "open");
    assert.equal(openState.expanded, "true");
    assert.equal(openState.bodyLocked, true);
    assert.ok(openState.navLinkCount >= 5);
    assert.equal(openState.profileVisible, true);

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        document.getElementById("siteNavShell")?.dataset.state === "closed" &&
        document.getElementById("siteNavToggle")?.getAttribute("aria-expanded") === "false" &&
        document.activeElement?.id === "siteNavToggle",
    );

    await page.locator("#siteNavToggle").click();
    await page.locator('.site-nav a[href="/for-creators.html"]').click();
    await page.waitForURL(`${baseUrl}/for-creators.html`);
    await page.waitForFunction(
      () =>
        document.getElementById("siteNavShell")?.dataset.state === "closed" &&
        document.querySelector('.site-nav a.is-active')?.getAttribute("href") === "/for-creators.html",
    );
  } finally {
    await page.close();
  }
});

test("public mobile route families stay stacked and avoid horizontal overflow at 320px", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } });

  try {
    const routeChecks = [
      {
        url: `${baseUrl}/`,
        ready: () => document.querySelectorAll("#podcast-grid .podcast-card-shell").length > 0,
        evaluate: () => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          mainWidth: Math.round(document.querySelector(".home-main")?.getBoundingClientRect().width || 0),
          footerWidth: Math.round(document.getElementById("site-footer")?.getBoundingClientRect().width || 0),
          browseModeColumns: (() => {
            const template = window.getComputedStyle(document.getElementById("browseModes")).gridTemplateColumns.trim();
            return template && template !== "none" ? template.split(" ").length : 0;
          })(),
          stickyWidth: Math.round(document.getElementById("stickyBrowseBar")?.getBoundingClientRect().width || 0),
        }),
        assert(result) {
          assert.ok(result.mainWidth <= result.viewport);
          assert.ok(result.footerWidth <= result.viewport);
          assert.equal(result.browseModeColumns, 1);
          assert.ok(result.stickyWidth <= result.viewport);
        },
      },
      {
        url: `${baseUrl}/collections.html`,
        ready: () => document.querySelectorAll("#collectionsDirectory .collections-directory-card").length > 0,
        evaluate: () => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          statsColumns: (() => {
            const template = window.getComputedStyle(document.querySelector(".collections-stat-grid")).gridTemplateColumns.trim();
            return template && template !== "none" ? template.split(" ").length : 0;
          })(),
          directoryColumns: (() => {
            const template = window.getComputedStyle(document.querySelector(".collections-directory-toolbar")).gridTemplateColumns.trim();
            return template && template !== "none" ? template.split(" ").length : 0;
          })(),
        }),
        assert(result) {
          assert.ok(result.scrollWidth <= result.viewport + 1);
          assert.equal(result.statsColumns, 1);
          assert.equal(result.directoryColumns, 1);
        },
      },
      {
        url: `${baseUrl}/collection.html?id=${firstCollectionId}`,
        ready: () => document.getElementById("collectionTitle")?.textContent?.trim() !== "Collection",
        evaluate: () => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          heroColumns: (() => {
            const template = window.getComputedStyle(document.getElementById("collectionHeroPanel")).gridTemplateColumns.trim();
            return template && template !== "none" ? template.split(" ").length : 0;
          })(),
          artDisplay: window.getComputedStyle(document.getElementById("collectionHeroArt")).display,
        }),
        assert(result) {
          assert.ok(result.scrollWidth <= result.viewport + 1);
          assert.equal(result.heroColumns, 1);
          assert.equal(result.artDisplay, "none");
        },
      },
      {
        url: `${baseUrl}/show.html?id=${fullReviewShowId}`,
        ready: () => document.querySelector(".detail-official-summary-section") && document.querySelector(".community-review-panel"),
        evaluate: () => {
          const officialTop = document.querySelector(".detail-official-summary-section")?.getBoundingClientRect().top || 0;
          const communityTop = document.querySelector(".community-review-panel")?.getBoundingClientRect().top || 0;
          const overviewTop = document.querySelector(".detail-overview-section")?.getBoundingClientRect().top || 0;
          return {
            scrollWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            metaColumns: (() => {
              const template = window.getComputedStyle(document.querySelector(".detail-meta-grid")).gridTemplateColumns.trim();
              return template && template !== "none" ? template.split(" ").length : 0;
            })(),
            officialTop,
            communityTop,
            overviewTop,
          };
        },
        assert(result) {
          assert.ok(result.scrollWidth <= result.viewport + 1);
          assert.equal(result.metaColumns, 1);
          assert.ok(result.officialTop < result.communityTop);
          assert.ok(result.communityTop < result.overviewTop);
        },
      },
      {
        url: `${baseUrl}/submit.html`,
        ready: () => document.querySelector(".submit-content-grid") && document.getElementById("submissionType"),
        evaluate: () => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          contentColumns: (() => {
            const template = window.getComputedStyle(document.querySelector(".submit-content-grid")).gridTemplateColumns.trim();
            return template && template !== "none" ? template.split(" ").length : 0;
          })(),
          modeColumns: (() => {
            const template = window.getComputedStyle(document.querySelector(".submit-mode-grid")).gridTemplateColumns.trim();
            return template && template !== "none" ? template.split(" ").length : 0;
          })(),
        }),
        async afterLoad() {
          await page.locator('[data-submission-mode="creator-verification"]').click();
          await page.locator("#submitProofUrl").waitFor();
          await page.locator('[data-submission-mode="correction"]').click();
          await page.locator("#submitExistingShowSearch").waitFor();
          const modeState = await page.evaluate(() => ({
            submissionType: document.getElementById("submissionType")?.value || "",
            existingFieldVisible: Boolean(document.getElementById("submitExistingShowSearch")),
          }));
          assert.equal(modeState.submissionType, "correction");
          assert.equal(modeState.existingFieldVisible, true);
        },
        assert(result) {
          assert.ok(result.scrollWidth <= result.viewport + 1);
          assert.equal(result.contentColumns, 1);
          assert.equal(result.modeColumns, 1);
        },
      },
      {
        url: `${baseUrl}/privacy.html`,
        ready: () => document.querySelector(".info-page-rail") && document.querySelector(".info-section-card"),
        evaluate: () => {
          const railRect = document.querySelector(".info-page-rail")?.getBoundingClientRect();
          const sectionRect = document.querySelector(".info-section-card")?.getBoundingClientRect();
          return {
            scrollWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            layoutColumns: (() => {
              const template = window.getComputedStyle(document.querySelector(".info-document-layout")).gridTemplateColumns.trim();
              return template && template !== "none" ? template.split(" ").length : 0;
            })(),
            railTop: railRect?.top || 0,
            sectionTop: sectionRect?.top || 0,
            railLinkColumns: (() => {
              const template = window.getComputedStyle(document.querySelector(".info-rail-links")).gridTemplateColumns.trim();
              return template && template !== "none" ? template.split(" ").length : 0;
            })(),
          };
        },
        assert(result) {
          assert.ok(result.scrollWidth <= result.viewport + 1);
          assert.equal(result.layoutColumns, 1);
          assert.ok(result.railTop < result.sectionTop);
          assert.equal(result.railLinkColumns, 1);
        },
      },
      {
        url: `${baseUrl}/help-center.html`,
        ready: () => document.querySelector(".help-center-hero-visual") && document.querySelector("#help-common-issues .creator-action-card"),
        evaluate: () => {
          const railRect = document.querySelector(".help-center-page-rail")?.getBoundingClientRect();
          const sectionRect = document.querySelector("#help-common-issues")?.getBoundingClientRect();
          return {
            scrollWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            layoutColumns: (() => {
              const template = window.getComputedStyle(document.querySelector(".help-center-document-layout")).gridTemplateColumns.trim();
              return template && template !== "none" ? template.split(" ").length : 0;
            })(),
            summaryColumns: (() => {
              const template = window.getComputedStyle(document.querySelector(".help-center-summary-grid")).gridTemplateColumns.trim();
              return template && template !== "none" ? template.split(" ").length : 0;
            })(),
            issueColumns: (() => {
              const template = window.getComputedStyle(document.querySelector(".help-center-issue-grid")).gridTemplateColumns.trim();
              return template && template !== "none" ? template.split(" ").length : 0;
            })(),
            railTop: railRect?.top || 0,
            sectionTop: sectionRect?.top || 0,
          };
        },
        assert(result) {
          assert.ok(result.scrollWidth <= result.viewport + 1);
          assert.equal(result.layoutColumns, 1);
          assert.equal(result.summaryColumns, 1);
          assert.equal(result.issueColumns, 1);
          assert.ok(result.railTop < result.sectionTop);
        },
      },
    ];

    for (const routeCheck of routeChecks) {
      await page.goto(routeCheck.url, { waitUntil: "networkidle" });
      await page.waitForFunction(routeCheck.ready, undefined, { timeout: 5_000 });
      const result = await page.evaluate(routeCheck.evaluate);
      routeCheck.assert(result);
      if (routeCheck.afterLoad) {
        await routeCheck.afterLoad();
      }
    }
  } finally {
    await page.close();
  }
});

test("maintainer public shells stay usable on mobile and tablet breakpoints before auth", async () => {
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const tabletPage = await browser.newPage({ viewport: { width: 980, height: 1180 } });

  try {
    const mobileRoutes = [
      `${baseUrl}/maintainer/submissions.html`,
      `${baseUrl}/maintainer/submissions/report.html`,
      `${baseUrl}/maintainer/imports.html`,
      `${baseUrl}/maintainer/imports/report.html`,
    ];

    for (const route of mobileRoutes) {
      await mobilePage.goto(route, { waitUntil: "networkidle" });
      await mobilePage.waitForFunction(
        () => document.querySelector(".maintainer-hero-panel") && document.querySelector("#maintainerAuthPanel"),
        undefined,
        { timeout: 5_000 },
      );

      const mobileState = await mobilePage.evaluate(() => {
        const actionTops = Array.from(document.querySelectorAll(".maintainer-hero-actions > *"))
          .filter((node) => node instanceof HTMLElement && window.getComputedStyle(node).display !== "none")
          .map((node) => Math.round(node.getBoundingClientRect().top));
        return {
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          authVisible: !document.getElementById("maintainerAuthPanel")?.hidden,
          actionTops,
        };
      });

      assert.ok(mobileState.scrollWidth <= mobileState.viewport + 1);
      assert.equal(mobileState.authVisible, true);
      assert.ok(new Set(mobileState.actionTops).size >= Math.min(mobileState.actionTops.length, 2));
    }

    await tabletPage.goto(`${baseUrl}/maintainer/imports.html`, { waitUntil: "networkidle" });
    await tabletPage.waitForFunction(
      () => document.querySelector(".maintainer-hero-panel") && document.querySelector("#maintainerAuthPanel"),
      undefined,
      { timeout: 5_000 },
    );

    const tabletState = await tabletPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      authVisible: !document.getElementById("maintainerAuthPanel")?.hidden,
      heroTop: document.querySelector(".maintainer-hero-panel")?.getBoundingClientRect().top || 0,
      authTop: document.getElementById("maintainerAuthPanel")?.getBoundingClientRect().top || 0,
    }));
    assert.ok(tabletState.scrollWidth <= tabletState.viewport + 1);
    assert.equal(tabletState.authVisible, true);
    assert.ok(tabletState.authTop > tabletState.heroTop);
  } finally {
    await mobilePage.close();
    await tabletPage.close();
  }
});

test("homepage collection carousels keep rounded cover art and stay stable during manual navigation", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#favoriteRoutesGrid .collection-card").first().waitFor();
    await page.locator("#collectionGrid .collection-card").first().waitFor();

    const initialState = await page.evaluate(() => {
      const describeRail = ({ viewportId, gridId }) => {
        const viewport = document.getElementById(viewportId);
        const viewportRect = viewport?.getBoundingClientRect();
        const cards = Array.from(document.querySelectorAll(`#${gridId} .collection-card`));
        const visibleCards = cards
          .map((card, index) => {
            const rect = card.getBoundingClientRect();
            const beforeStyles = window.getComputedStyle(card, "::before");
            const cardStyles = window.getComputedStyle(card);
            return {
              index,
              leftInset: viewportRect ? rect.left - viewportRect.left : 0,
              isVisible: Boolean(viewportRect && rect.right > viewportRect.left && rect.left < viewportRect.right),
              borderRadius: cardStyles.borderRadius,
              beforeBorderRadius: beforeStyles.borderRadius,
              beforeBackgroundPosition: beforeStyles.backgroundPosition,
            };
          })
          .filter((card) => card.isVisible)
          .sort((left, right) => left.leftInset - right.leftInset);

        return {
          scrollLeft: viewport?.scrollLeft || 0,
          visibleCards,
        };
      };

      return {
        favoriteRoutes: describeRail({ viewportId: "favoriteRoutesViewport", gridId: "favoriteRoutesGrid" }),
        collections: describeRail({ viewportId: "collectionViewport", gridId: "collectionGrid" }),
      };
    });

    for (const railState of [initialState.favoriteRoutes, initialState.collections]) {
      assert.ok(railState.visibleCards.length >= 3);
      railState.visibleCards.forEach((card) => {
        assert.equal(card.borderRadius, "18px");
        assert.equal(card.beforeBorderRadius, card.borderRadius);
        assert.match(card.beforeBackgroundPosition, /^50% 50%(, 50% 50%)?$/);
      });
    }

    const startScrollLeft = await page.evaluate(() => ({
      favoriteRoutes: document.getElementById("favoriteRoutesViewport")?.scrollLeft || 0,
      collections: document.getElementById("collectionViewport")?.scrollLeft || 0,
    }));

    await page.evaluate(() => {
      document.getElementById("favoriteRoutesNext")?.click();
      document.getElementById("collectionNext")?.click();
    });
    await page.waitForTimeout(900);

    const afterManualNavigation = await page.evaluate(() => ({
      favoriteRoutes: document.getElementById("favoriteRoutesViewport")?.scrollLeft || 0,
      collections: document.getElementById("collectionViewport")?.scrollLeft || 0,
    }));

    assert.notEqual(afterManualNavigation.favoriteRoutes, startScrollLeft.favoriteRoutes);
    assert.notEqual(afterManualNavigation.collections, startScrollLeft.collections);

  } finally {
    await page.close();
  }
});
