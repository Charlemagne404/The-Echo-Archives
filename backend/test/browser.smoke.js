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
  gotoSmokePage,
  homeMostPopularIds,
  legacyRedirectManifest,
  scoreCatalog,
  setupSmoke,
  startSmokeServer,
  stopSmokeServer,
  teardownSmoke,
  waitForMostPopularBandIds,
} = require("./helpers/browser-smoke");
const { buildCollectionSeoTitle, buildShowSeoTitle } = require("../lib/seo");

let browser;
let baseUrl;
let showFixtures;
let collectionFixtures;
let firstCollectionId;
let firstSimilarityCollectionId;
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
  firstSimilarityCollectionId = collectionFixtures.find((collection) => collection.kind === "similarity")?.id || firstCollectionId;
  fullReviewShowId = showFixtures.find((show) => show.reviewStatus === "full-review")?.id || firstShowId;
});

test.after(async () => {
  await teardownSmoke();
});

test("main routes render expected page titles", async () => {
  const page = await browser.newPage();

  try {
    const routes = [
      { url: `${baseUrl}/`, title: "The Echo Archives — Audio Drama Discovery" },
      { url: `${baseUrl}/about`, title: "About Our Audio Drama Archive | The Echo Archives" },
      { url: `${baseUrl}/for-creators`, title: "For Audio Drama Creators | The Echo Archives" },
      { url: `${baseUrl}/creator-standards`, title: "Creator Standards - The Echo Archives" },
      { url: `${baseUrl}/supporters`, title: "Support the Archive - The Echo Archives" },
      { url: `${baseUrl}/help-center`, title: "Help Center - The Echo Archives" },
      { url: `${baseUrl}/collections`, title: "Audio Drama & Fiction Podcast Collections | The Echo Archives" },
      {
        url: `${baseUrl}/collections/${firstCollectionId}`,
        title: buildCollectionSeoTitle(collectionFixtures[0]),
        waitForResolvedTitle: true,
      },
      {
        url: `${baseUrl}/shows/${firstShowId}`,
        title: buildShowSeoTitle(showFixtures[0]),
        waitForResolvedTitle: true,
      },
      { url: `${baseUrl}/submit`, title: "Submit a Show - The Echo Archives" },
      { url: `${baseUrl}/privacy`, title: "Privacy - The Echo Archives" },
      { url: `${baseUrl}/terms`, title: "Terms - The Echo Archives" },
      { url: `${baseUrl}/cookies`, title: "Cookies - The Echo Archives" },
      { url: `${baseUrl}/copyright`, title: "Copyright & Takedown - The Echo Archives" },
      { url: `${baseUrl}/404.html`, title: "Page Not Found - The Echo Archives" },
      { url: `${baseUrl}/500.html`, title: "Server Error - The Echo Archives" },
      { url: `${baseUrl}/offline.html`, title: "Offline - The Echo Archives" },
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

test("collections trust bar matches the browse hero", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const trustBarStyles = async (selector) =>
    page.locator(selector).evaluate((element) => {
      const grid = window.getComputedStyle(element);
      const item = window.getComputedStyle(element.querySelector(".archive-trust-item"));
      return {
        display: grid.display,
        gridTemplateColumns: grid.gridTemplateColumns,
        gap: grid.gap,
        paddingTop: grid.paddingTop,
        borderTopWidth: grid.borderTopWidth,
        textAlign: item.textAlign,
        whiteSpace: item.whiteSpace,
        fontSize: item.fontSize,
        lineHeight: item.lineHeight,
      };
    });

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    const browseStyles = await trustBarStyles(".archive-trust-grid");

    await gotoSmokePage(page, `${baseUrl}/collections`, { waitUntil: "networkidle" });
    const collectionStyles = await trustBarStyles(".collections-hero-panel .archive-trust-grid");

    assert.deepEqual(collectionStyles, browseStyles);
  } finally {
    await page.close();
  }
});

test("public heroes keep full and compact sizing contracts", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fullRoutes = [
    { url: "/collections", panel: ".collections-hero-panel", copy: ".collections-hero-copy" },
    { url: "/help-center", panel: ".help-center-hero-panel", copy: ".help-center-hero-copy" },
  ];
  const compactRoutes = [
    { url: "/for-creators", panel: ".creators-hero-panel", copy: ".creators-hero-copy" },
    { url: "/submit", panel: ".submit-hero-panel", copy: ".submit-hero-copy" },
    { url: "/about", panel: ".about-hero-panel", copy: ".about-hero-copy" },
  ];
  const heroStyles = async (panelSelector, copySelector) =>
    page.locator(panelSelector).evaluate((panel, copy) => {
      const panelStyles = window.getComputedStyle(panel);
      const headingStyles = window.getComputedStyle(document.querySelector(`${copy} h1`));
      return {
        panel: {
          minHeight: panelStyles.minHeight,
          padding: panelStyles.padding,
          borderRadius: panelStyles.borderRadius,
        },
        heading: {
          fontSize: headingStyles.fontSize,
          lineHeight: headingStyles.lineHeight,
          letterSpacing: headingStyles.letterSpacing,
        },
      };
    }, copySelector);

  try {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}/`, { waitUntil: "load" });
      const browseStyles = await heroStyles(".hero-panel", ".hero-copy");

      for (const route of fullRoutes) {
        await page.goto(`${baseUrl}${route.url}`, { waitUntil: "load" });
        assert.deepEqual(
          await heroStyles(route.panel, route.copy),
          browseStyles,
          `${route.url} should match the browse hero at ${viewport.width}px`,
        );
      }

      if (viewport.width <= 780) {
        for (const route of compactRoutes) {
          await page.goto(`${baseUrl}${route.url}`, { waitUntil: "load" });
          assert.deepEqual(
            await heroStyles(route.panel, route.copy),
            browseStyles,
            `${route.url} should use the browse mobile contract at ${viewport.width}px`,
          );
        }
      } else {
        let compactPanelStyles = null;
        for (const route of compactRoutes) {
          await page.goto(`${baseUrl}${route.url}`, { waitUntil: "load" });
          const routeStyles = await heroStyles(route.panel, route.copy);
          compactPanelStyles ||= routeStyles.panel;
          assert.deepEqual(routeStyles.panel, compactPanelStyles, `${route.url} should use the shared compact panel`);
          assert.deepEqual(routeStyles.heading, browseStyles.heading, `${route.url} should keep browse heading typography`);
          assert.equal(
            Math.round(await page.locator(route.panel).evaluate((panel) => panel.getBoundingClientRect().height)),
            330,
            `${route.url} should render at the compact desktop height`,
          );
        }
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/collections`, { waitUntil: "load" });
    const moodActionStyles = await page.locator("#startWithMood").evaluate((button) => {
      const styles = window.getComputedStyle(button);
      return {
        display: styles.display,
        minHeight: styles.minHeight,
        borderRadius: styles.borderRadius,
      };
    });
    assert.deepEqual(moodActionStyles, {
      display: "flex",
      minHeight: "58px",
      borderRadius: "14px",
    });
  } finally {
    await page.close();
  }
});

test("static delivery files expose intentional HTTP statuses", async () => {
  const staticPaths = [
    { path: "/404.html", status: 404 },
    { path: "/500.html", status: 500 },
    { path: "/offline.html", status: 200 },
    { path: "/sw.js", status: 200 },
    { path: "/robots.txt", status: 200 },
    { path: "/site.webmanifest", status: 200 },
    { path: "/favicon.ico", status: 200, contentType: "image/x-icon" },
    { path: "/icon-192.png", status: 200 },
    { path: "/apple-touch-icon.png", status: 200 },
    { path: "/og-image.png", status: 200 },
  ];

  for (const staticPath of staticPaths) {
    const response = await fetch(`${baseUrl}${staticPath.path}`);
    assert.equal(response.status, staticPath.status, `${staticPath.path} should return ${staticPath.status}.`);
    if (staticPath.contentType) {
      assert.match(
        response.headers.get("content-type") || "",
        new RegExp(`^${staticPath.contentType}(?:;|$)`),
        `${staticPath.path} should use the expected content type.`,
      );
    }
  }
});

test("public and error routes expose the expected metadata", async () => {
  const page = await browser.newPage();

  try {
    const checks = [
      {
        url: `${baseUrl}/`,
        expectedTitle: "The Echo Archives — Audio Drama Discovery",
        expectedCanonical: `${baseUrl}/`,
        noIndex: false,
      },
      {
        url: `${baseUrl}/shows/${firstShowId}`,
        expectedTitle: buildShowSeoTitle(showFixtures[0]),
        expectedCanonical: `${baseUrl}/shows/${encodeURIComponent(firstShowId)}`,
        noIndex: false,
      },
      {
        url: `${baseUrl}/collections/${firstCollectionId}`,
        expectedTitle: buildCollectionSeoTitle(collectionFixtures[0]),
        expectedCanonical: `${baseUrl}/collections/${encodeURIComponent(firstCollectionId)}`,
        noIndex: false,
      },
      {
        url: `${baseUrl}/404.html`,
        expectedTitle: "Page Not Found - The Echo Archives",
        expectedCanonical: `${baseUrl}/404.html`,
        noIndex: true,
      },
      {
        url: `${baseUrl}/500.html`,
        expectedTitle: "Server Error - The Echo Archives",
        expectedCanonical: `${baseUrl}/500.html`,
        noIndex: true,
      },
    ];

    for (const check of checks) {
      await page.goto(check.url, { waitUntil: "load" });
      await page.waitForFunction((expectedTitle) => document.title === expectedTitle, check.expectedTitle, { timeout: 5_000 });

      const metadata = await page.evaluate(() => ({
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "",
        ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "",
        ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "",
        ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content") || "",
        ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "",
        twitterTitle: document.querySelector('meta[name="twitter:title"]')?.getAttribute("content") || "",
        twitterDescription: document.querySelector('meta[name="twitter:description"]')?.getAttribute("content") || "",
        twitterImage: document.querySelector('meta[name="twitter:image"]')?.getAttribute("content") || "",
        themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "",
        manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href") || "",
        robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") || "",
      }));

      assert.equal(metadata.title, check.expectedTitle);
      assert.ok(metadata.description.length > 0);
      assert.equal(metadata.canonical, check.expectedCanonical);
      assert.equal(metadata.ogTitle, check.expectedTitle);
      assert.equal(metadata.ogDescription, metadata.description);
      assert.equal(metadata.ogUrl, check.expectedCanonical);
      assert.ok(metadata.ogImage.length > 0);
      assert.equal(metadata.twitterTitle, check.expectedTitle);
      assert.equal(metadata.twitterDescription, metadata.description);
      assert.ok(metadata.twitterImage.length > 0);
      assert.equal(metadata.themeColor, "#06080b");
      assert.equal(metadata.manifest, "/site.webmanifest");
      assert.equal(metadata.robots, check.noIndex ? "noindex, nofollow, noarchive" : "index, follow, max-image-preview:large");
    }
  } finally {
    await page.close();
  }
});

test("collection detail pages expose listener-facing overview and related route context", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await gotoSmokePage(page, `${baseUrl}/collections/${encodeURIComponent(firstCollectionId)}`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#collectionOverviewChips .collection-detail-signal-chip").length > 0 &&
        document.querySelectorAll(".collection-show-card-note").length > 0,
      undefined,
      { timeout: 5_000 },
    );

    const collectionState = await page.evaluate(() => ({
      overviewKicker: document.querySelector(".collection-detail-overview-kicker")?.textContent?.trim() || "",
      metaLine: document.getElementById("collectionOverviewMetaLine")?.textContent?.trim() || "",
      oldHeadingPresent: Array.from(document.querySelectorAll("h2, p, span"))
        .some((node) => ["How this route works", "Route signals"].includes(node.textContent?.trim() || "")),
      detachedReasonCount: document.querySelectorAll(".collection-card-reason").length,
      inlineNoteCount: document.querySelectorAll(".collection-show-card-note").length,
      relatedCount: document.querySelectorAll("#collectionRelatedGrid .collections-directory-card").length,
      overviewChipCount: document.querySelectorAll("#collectionOverviewChips .collection-detail-signal-chip").length,
      compactRelatedCount: document.querySelectorAll("#collectionRelatedGrid .collections-directory-card-compact").length,
    }));

    assert.equal(collectionState.overviewKicker, "At a glance");
    assert.match(collectionState.metaLine, /\d+\s+shows?/i);
    assert.match(collectionState.metaLine, /\bCollection\b|Similar shows/i);
    assert.match(collectionState.metaLine, /Updated /);
    assert.equal(collectionState.oldHeadingPresent, false);
    assert.equal(collectionState.detachedReasonCount, 0);
    assert.ok(collectionState.inlineNoteCount > 0);
    assert.ok(collectionState.relatedCount > 0);
    assert.ok(collectionState.overviewChipCount > 0);
    assert.ok(collectionState.compactRelatedCount > 0);

    await gotoSmokePage(page, `${baseUrl}/collections/${encodeURIComponent(firstSimilarityCollectionId)}`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.querySelector("#collectionOverviewMetaLine .collection-detail-anchor-link"),
      undefined,
      { timeout: 5_000 },
    );

    const similarityState = await page.evaluate(() => ({
      anchorText: document.querySelector("#collectionOverviewMetaLine .collection-detail-anchor-link")?.textContent?.trim() || "",
      anchorHref: document.querySelector("#collectionOverviewMetaLine .collection-detail-anchor-link")?.getAttribute("href") || "",
    }));

    assert.ok(similarityState.anchorText.length > 0);
    assert.match(similarityState.anchorHref, /^\/shows\//);
  } finally {
    await page.close();
  }
});

test("collection detail routes arrive complete without catalog rehydration", async () => {
  const noScriptPage = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let catalogRequests = 0;
  page.on("request", (request) => {
    if (["/data/search-index.json", "/data/collections.json"].includes(new URL(request.url()).pathname)) {
      catalogRequests += 1;
    }
  });

  try {
    const collectionUrl = `${baseUrl}/collections/${encodeURIComponent(firstCollectionId)}`;
    await noScriptPage.goto(collectionUrl, { waitUntil: "domcontentloaded" });
    const serverState = await noScriptPage.evaluate(() => ({
      prerendered: document.getElementById("collectionRoot")?.dataset.collectionPrerendered,
      overviewVisible: !document.getElementById("collectionRoot")?.hidden,
      heroArtCount: document.querySelectorAll("#collectionHeroArt .collection-cover-frame").length,
      cardCount: document.querySelectorAll("#collectionShowGrid .collection-show-card-shell").length,
      relatedCount: document.querySelectorAll("#collectionRelatedGrid .collections-directory-card").length,
    }));

    assert.equal(serverState.prerendered, "true");
    assert.equal(serverState.overviewVisible, true);
    assert.ok(serverState.heroArtCount > 0);
    assert.ok(serverState.cardCount > 0);
    assert.ok(serverState.relatedCount > 0);

    await gotoSmokePage(page, collectionUrl, { waitUntil: "networkidle" });
    assert.equal(catalogRequests, 0, "the complete route should not refetch catalog data after first paint");
  } finally {
    await noScriptPage.close();
    await page.close();
  }
});

test("show and collection share actions trigger native share or copy feedback", async () => {
  const nativeSharePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const fallbackCopyPage = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await nativeSharePage.addInitScript(() => {
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query === "(pointer: coarse)") {
          return {
            matches: true,
            media: query,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent() {
              return false;
            },
          };
        }

        return originalMatchMedia(query);
      };

      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data) => {
          window.__lastShareData = data;
        },
      });
    });

    await gotoSmokePage(nativeSharePage, `${baseUrl}/shows/${firstShowId}`, { waitUntil: "networkidle" });
    await nativeSharePage.locator('[data-share-action]').click();
    await nativeSharePage.locator(".archive-toast-message").waitFor({ timeout: 5_000 });

    const nativeShareState = await nativeSharePage.evaluate(() => ({
      buttonLabel: document.querySelector('[data-share-action]')?.textContent?.trim() || "",
      toastMessage: document.querySelector(".archive-toast-message")?.textContent?.trim() || "",
      shareData: window.__lastShareData || null,
    }));
    assert.equal(nativeShareState.buttonLabel, "Share");
    assert.equal(nativeShareState.toastMessage, "Shared from the archive.");
    assert.equal(nativeShareState.shareData?.url, `${baseUrl}/shows/${encodeURIComponent(firstShowId)}`);
    assert.match(nativeShareState.shareData?.title || "", /The Echo Archives/);

    await fallbackCopyPage.addInitScript(() => {
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query === "(pointer: coarse)") {
          return {
            matches: false,
            media: query,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent() {
              return false;
            },
          };
        }

        return originalMatchMedia(query);
      };

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__copiedText = text;
          },
        },
      });
    });

    await gotoSmokePage(fallbackCopyPage, `${baseUrl}/collections/${firstCollectionId}`, { waitUntil: "networkidle" });
    await fallbackCopyPage.locator("#collectionCopyLink").click();
    await fallbackCopyPage.locator(".archive-toast-message").waitFor({ timeout: 5_000 });

    const fallbackCopyState = await fallbackCopyPage.evaluate(() => ({
      buttonLabel: document.getElementById("collectionCopyLink")?.textContent?.trim() || "",
      toastMessage: document.querySelector(".archive-toast-message")?.textContent?.trim() || "",
      copiedText: window.__copiedText || "",
    }));
    assert.equal(fallbackCopyState.buttonLabel, "Share");
    assert.equal(fallbackCopyState.toastMessage, "Link copied to clipboard.");
    assert.match(fallbackCopyState.copiedText, /\/collections\//);
  } finally {
    await nativeSharePage.close();
    await fallbackCopyPage.close();
  }
});

test("service worker supports cached public pages offline and falls back for uncached routes", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  let serverStopped = false;

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 10_000 });
    await page.waitForFunction(() => document.body.dataset.offlineReady === "true", undefined, { timeout: 10_000 });

    await stopSmokeServer();
    serverStopped = true;
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.title(), "The Echo Archives — Audio Drama Discovery");
    await page.waitForFunction(() => document.body.dataset.homeReady === "true", undefined, { timeout: 10_000 });
    await page.locator("#filterToggle").click();
    await page.waitForFunction(() => document.getElementById("filterDropdown")?.dataset.state === "open");

    await page.goto(`${baseUrl}/this-route-should-fallback-offline`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.title(), "Offline - The Echo Archives");
  } finally {
    if (serverStopped) {
      await startSmokeServer();
    }
    await context.close();
  }
});

test("fresh browser contexts load the core public routes without relying on prior storage", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    assert.equal(await page.title(), "The Echo Archives — Audio Drama Discovery");

    const homeStorageState = await page.evaluate(() => ({
      chatHistory: window.sessionStorage.getItem("echo-archives-chat-v3"),
      communityProfile: window.localStorage.getItem("echo-community-profile-id"),
      chatControls: document.getElementById("chat-toggle")?.getAttribute("aria-controls") || "",
    }));
    assert.equal(homeStorageState.chatHistory, null);
    assert.equal(homeStorageState.communityProfile, null);
    assert.equal(homeStorageState.chatControls, "");

    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    const mountedChatState = await page.evaluate(() => ({
      chatHistory: window.sessionStorage.getItem("echo-archives-chat-v3"),
      chatControls: document.getElementById("chat-toggle")?.getAttribute("aria-controls") || "",
    }));
    assert.match(mountedChatState.chatHistory || "", /Ask about a show, the archive, ratings, creators, runtime, transcripts, collections/);
    assert.equal(mountedChatState.chatControls, "chat-container");
    await page.getByRole("button", { name: "Close chat" }).click();

    await gotoSmokePage(page, `${baseUrl}/shows/${firstShowId}`, { waitUntil: "networkidle" });
    await page.locator('[data-share-action]').waitFor();
    assert.equal(await page.title(), buildShowSeoTitle(showFixtures[0]));

    await gotoSmokePage(page, `${baseUrl}/submit`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => {
        const submissionType = document.getElementById("submissionType");
        return Boolean(submissionType instanceof HTMLInputElement && submissionType.value === "show");
      },
      undefined,
      { timeout: 5_000 },
    );
    assert.equal(await page.title(), "Submit a Show - The Echo Archives");
  } finally {
    await context.close();
  }
});

test("legacy detail redirects still land on the canonical show route", async () => {
  const page = await browser.newPage();

  try {
    for (const redirect of legacyRedirectManifest) {
      const showId = new URL(redirect.target, baseUrl).searchParams.get("id");
      const expectedTarget = `/shows/${encodeURIComponent(showId)}`;
      await page.goto(encodeURI(`${baseUrl}/${redirect.path}`), { waitUntil: "domcontentloaded" });
      await page.waitForFunction((target) => location.pathname + location.search === target, expectedTarget, {
        timeout: 5_000,
      });
      assert.equal(new URL(await page.url()).pathname + new URL(await page.url()).search, expectedTarget);
    }
  } finally {
    await page.close();
  }
});

test("mobile header menu opens, closes, and routes cleanly on phone widths", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });

    const closedState = await page.evaluate(() => ({
      toggleVisible: window.getComputedStyle(document.getElementById("siteNavToggle") || document.body).display !== "none",
      navState: document.getElementById("siteNavShell")?.dataset.state || "",
      expanded: document.getElementById("siteNavToggle")?.getAttribute("aria-expanded") || "",
      bodyLocked: document.body.classList.contains("site-nav-open"),
      primaryLinks: Array.from(document.querySelectorAll(".site-mobile-primary-nav a")).map((link) => link.textContent?.trim()),
      activePrimaryHref: document.querySelector(".site-mobile-primary-nav a.is-active")?.getAttribute("href") || "",
    }));
    assert.equal(closedState.toggleVisible, true);
    assert.equal(closedState.navState, "closed");
    assert.equal(closedState.expanded, "false");
    assert.equal(closedState.bodyLocked, false);
    assert.deepEqual(closedState.primaryLinks, ["Browse", "Collections", "Creators", "Submit"]);
    assert.equal(closedState.activePrimaryHref, "/");

    await page.locator("#siteNavToggle").click();
    await page.waitForFunction(() => document.getElementById("siteNavShell")?.dataset.state === "open");

    const openState = await page.evaluate(() => ({
      navState: document.getElementById("siteNavShell")?.dataset.state || "",
      expanded: document.getElementById("siteNavToggle")?.getAttribute("aria-expanded") || "",
      bodyLocked: document.body.classList.contains("site-nav-open"),
      drawerRole: document.querySelector(".site-nav-drawer")?.getAttribute("role") || "",
      drawerModal: document.querySelector(".site-nav-drawer")?.getAttribute("aria-modal") || "",
      navLinkCount: document.querySelectorAll(".site-mobile-nav-link").length,
      closeFocused: document.activeElement?.classList.contains("site-nav-close") || false,
    }));
    assert.equal(openState.navState, "open");
    assert.equal(openState.expanded, "true");
    assert.equal(openState.bodyLocked, true);
    assert.equal(openState.drawerRole, "dialog");
    assert.equal(openState.drawerModal, "true");
    assert.ok(openState.navLinkCount >= 13);
    assert.equal(openState.closeFocused, true);

    await page.locator(".site-nav-backdrop").click({ position: { x: 8, y: 8 } });
    await page.waitForFunction(() => document.getElementById("siteNavShell")?.dataset.state === "closed");

    await page.locator("#siteNavToggle").click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        document.getElementById("siteNavShell")?.dataset.state === "closed" &&
        document.getElementById("siteNavToggle")?.getAttribute("aria-expanded") === "false" &&
        document.activeElement?.id === "siteNavToggle",
    );

    await page.locator("#siteNavToggle").click();
    await page.locator('.site-mobile-nav-link[href="/for-creators"]').click();
    await page.waitForURL(`${baseUrl}/for-creators`);
    await page.waitForFunction(
      () =>
        document.getElementById("siteNavShell")?.dataset.state === "closed" &&
        document.querySelector('.site-mobile-nav-link.is-active')?.getAttribute("href") === "/for-creators",
    );

    await page.setViewportSize({ width: 844, height: 390 });
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    assert.notEqual(await page.locator("#siteNavToggle").evaluate((node) => window.getComputedStyle(node).display), "none");
  } finally {
    await page.close();
  }
});

test("site header keeps the primary navigation reachable across responsive breakpoints", async () => {
  const page = await browser.newPage();
  const desktopWidths = [960, 1024, 1180, 1280, 1440];
  const mobileWidths = [320, 390, 568, 768, 959];

  try {
    for (const width of desktopWidths) {
      await page.setViewportSize({ width, height: 844 });
      await gotoSmokePage(page, `${baseUrl}/about`, { waitUntil: "networkidle" });

      const state = await page.evaluate(() => {
        const header = document.querySelector(".site-header");
        const nav = document.querySelector(".site-header > .site-nav");
        const brand = document.querySelector(".site-brand");
        const navRect = nav?.getBoundingClientRect();
        const headerRect = header?.getBoundingClientRect();
        const brandRect = brand?.getBoundingClientRect();
        return {
          navVisible: Boolean(nav && getComputedStyle(nav).display !== "none"),
          mobileNavVisible: getComputedStyle(document.querySelector(".site-mobile-primary-nav")).display !== "none",
          toggleVisible: getComputedStyle(document.getElementById("siteNavToggle")).display !== "none",
          linkCount: document.querySelectorAll(".site-header > .site-nav a").length,
          navWithinHeader: Boolean(navRect && headerRect && navRect.left >= headerRect.left && navRect.right <= headerRect.right),
          brandWithinHeader: Boolean(brandRect && headerRect && brandRect.left >= headerRect.left && brandRect.right <= headerRect.right),
          noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });

      assert.equal(state.navVisible, true, `desktop nav should be visible at ${width}px`);
      assert.equal(state.mobileNavVisible, false, `mobile strip should be hidden at ${width}px`);
      assert.equal(state.toggleVisible, false, `menu toggle should be hidden at ${width}px`);
      assert.equal(state.linkCount, 6);
      assert.equal(state.navWithinHeader, true, `desktop nav escaped the header at ${width}px`);
      assert.equal(state.brandWithinHeader, true, `brand escaped the header at ${width}px`);
      assert.equal(state.noOverflow, true, `header created overflow at ${width}px`);
    }

    for (const width of mobileWidths) {
      await page.setViewportSize({ width, height: 844 });
      await gotoSmokePage(page, `${baseUrl}/about`, { waitUntil: "networkidle" });

      const closedState = await page.evaluate(() => ({
        navVisible: getComputedStyle(document.querySelector(".site-header > .site-nav")).display !== "none",
        mobileNavVisible: getComputedStyle(document.querySelector(".site-mobile-primary-nav")).display !== "none",
        toggleVisible: getComputedStyle(document.getElementById("siteNavToggle")).display !== "none",
        primaryLinkCount: document.querySelectorAll(".site-mobile-primary-nav a").length,
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      }));

      assert.equal(closedState.navVisible, false, `desktop nav should be hidden at ${width}px`);
      assert.equal(closedState.mobileNavVisible, true, `mobile strip should be visible at ${width}px`);
      assert.equal(closedState.toggleVisible, true, `menu toggle should be visible at ${width}px`);
      assert.equal(closedState.primaryLinkCount, 4);
      assert.equal(closedState.noOverflow, true, `mobile header created overflow at ${width}px`);

      await page.locator("#siteNavToggle").click();
      await page.waitForFunction(() => document.getElementById("siteNavShell")?.dataset.state === "open");
      await page.waitForTimeout(320);

      const drawerState = await page.locator(".site-nav-drawer").evaluate((drawer) => {
        const rect = drawer.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          linkCount: drawer.querySelectorAll(".site-mobile-nav-link").length,
        };
      });

      assert.equal(drawerState.linkCount, 14);
      assert.ok(drawerState.left >= -1 && drawerState.right <= drawerState.viewportWidth + 1, `drawer escaped horizontally at ${width}px`);
      assert.ok(drawerState.top >= -1 && drawerState.bottom <= drawerState.viewportHeight + 1, `drawer escaped vertically at ${width}px`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.getElementById("siteNavShell")?.dataset.state === "closed");
    }
  } finally {
    await page.close();
  }
});

test("mobile chat launcher stays out of the first viewport until the user starts scrolling", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 740 }, hasTouch: true });

  try {
    const routeChecks = [
      { url: `${baseUrl}/`, ready: () => document.querySelectorAll("#podcast-grid .podcast-card-shell").length > 0 },
      { url: `${baseUrl}/privacy`, ready: () => Boolean(document.querySelector(".info-document-layout")) },
      { url: `${baseUrl}/shows/${fullReviewShowId}`, ready: () => Boolean(document.querySelector(".podcast-detail")) },
    ];

    for (const routeCheck of routeChecks) {
      await gotoSmokePage(page, routeCheck.url, { waitUntil: "networkidle" });
      await page.waitForFunction(routeCheck.ready, undefined, { timeout: 5_000 });

      await page.waitForFunction(() => {
        const button = document.getElementById("chat-toggle");
        if (!(button instanceof HTMLElement)) {
          return false;
        }

        const styles = window.getComputedStyle(button);
        return styles.visibility === "hidden" && styles.pointerEvents === "none";
      });

      await page.evaluate(() => window.scrollTo({ top: 180, behavior: "auto" }));
      await page.waitForFunction(() => {
        const button = document.getElementById("chat-toggle");
        if (!(button instanceof HTMLElement)) {
          return false;
        }

        const styles = window.getComputedStyle(button);
        return styles.visibility === "visible" && styles.pointerEvents !== "none";
      });
    }
  } finally {
    await page.close();
  }
});

test("public mobile route families preserve compact layouts and avoid horizontal overflow at 320px", async () => {
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
        url: `${baseUrl}/collections`,
        ready: () => document.querySelectorAll("#collectionsDirectory .collections-directory-card").length > 0,
        evaluate: () => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          statsColumns: (() => {
            const template = window.getComputedStyle(document.querySelector(".collections-hero-panel .archive-trust-grid")).gridTemplateColumns.trim();
            return template && template !== "none" ? template.split(" ").length : 0;
          })(),
          directoryColumns: (() => {
            const template = window.getComputedStyle(document.querySelector(".collections-directory-toolbar")).gridTemplateColumns.trim();
            return template && template !== "none" ? template.split(" ").length : 0;
          })(),
        }),
        assert(result) {
          assert.ok(result.scrollWidth <= result.viewport + 1);
          assert.equal(result.statsColumns, 2);
          assert.equal(result.directoryColumns, 1);
        },
      },
      {
        url: `${baseUrl}/collections/${firstCollectionId}`,
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
        url: `${baseUrl}/shows/${fullReviewShowId}`,
        ready: () => document.querySelector(".detail-official-summary-section") && document.querySelector(".community-review-panel"),
        evaluate: () => {
          const officialTop = document.querySelector(".detail-official-summary-section")?.getBoundingClientRect().top || 0;
          const communityTop = document.querySelector(".community-review-panel")?.getBoundingClientRect().top || 0;
          const reviewTop = document.querySelector("#review-notes")?.getBoundingClientRect().top || 0;
          const decisionConsoleTop = document.querySelector(".detail-decision-console")?.getBoundingClientRect().top || 0;
          const coverTop = document.querySelector(".detail-cover-column")?.getBoundingClientRect().top || 0;
          const coverWidth = document.querySelector(".detail-cover-column")?.getBoundingClientRect().width || 0;
          return {
            scrollWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            metaColumns: (() => {
              const template = window.getComputedStyle(document.querySelector(".detail-meta-grid")).gridTemplateColumns.trim();
              return template && template !== "none" ? template.split(" ").length : 0;
            })(),
            officialTop,
            communityTop,
            reviewTop,
            decisionConsoleTop,
            coverTop,
            coverWidth,
          };
        },
        assert(result) {
          assert.ok(result.scrollWidth <= result.viewport + 1);
          assert.equal(result.metaColumns, 1);
          assert.ok(result.decisionConsoleTop < result.coverTop);
          assert.ok(result.coverWidth <= 220);
          assert.ok(result.officialTop < result.reviewTop);
          assert.ok(result.reviewTop < result.communityTop);
        },
      },
      {
        url: `${baseUrl}/submit`,
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
          await page.locator("#submitCreatorName").waitFor();
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
          assert.equal(result.modeColumns, 2);
        },
      },
      {
        url: `${baseUrl}/privacy`,
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
        url: `${baseUrl}/cookies`,
        ready: () => document.querySelector(".info-storage-table-wrap") && document.querySelector(".info-storage-table"),
        evaluate: () => ({
          scrollWidth: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          layoutColumns: (() => {
            const template = window.getComputedStyle(document.querySelector(".info-document-layout")).gridTemplateColumns.trim();
            return template && template !== "none" ? template.split(" ").length : 0;
          })(),
          tableWrapWidth: Math.round(document.querySelector(".info-storage-table-wrap")?.getBoundingClientRect().width || 0),
        }),
        assert(result) {
          assert.ok(result.scrollWidth <= result.viewport + 1);
          assert.equal(result.layoutColumns, 1);
          assert.ok(result.tableWrapWidth <= result.viewport);
        },
      },
      {
        url: `${baseUrl}/help-center`,
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
      await gotoSmokePage(page, routeCheck.url, { waitUntil: "networkidle" });
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

test("collections sticky mood bar stays compact, appears after scroll, and mirrors the active mood", async () => {
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await gotoSmokePage(desktopPage, `${baseUrl}/collections`, { waitUntil: "networkidle" });
    await desktopPage.waitForFunction(
      () =>
        document.querySelectorAll("#collectionsMoodChips .collections-mood-chip").length > 0 &&
        document.querySelectorAll("#collectionsStickyMoodChips .collections-mood-chip").length > 0,
    );

    const initialDesktopState = await desktopPage.evaluate(() => ({
      stickyVisibility: document.getElementById("collectionsStickyMoodBar")?.dataset.visibility || "",
      stickyAriaHidden: document.getElementById("collectionsStickyMoodBar")?.getAttribute("aria-hidden") || "",
      heroChipCount: document.querySelectorAll("#collectionsMoodChips .collections-mood-chip").length,
      stickyChipCount: document.querySelectorAll("#collectionsStickyMoodChips .collections-mood-chip").length,
    }));

    assert.equal(initialDesktopState.stickyVisibility, "hidden");
    assert.equal(initialDesktopState.stickyAriaHidden, "true");
    assert.equal(initialDesktopState.heroChipCount, initialDesktopState.stickyChipCount);

    await desktopPage.locator('#collectionsMoodChips .collections-mood-chip[data-intent="finished"]').click();
    await desktopPage.waitForFunction(() => new URL(window.location.href).searchParams.get("intent") === "finished");
    await desktopPage.evaluate(() => {
      const section = document.getElementById("collectionsSimilaritySection");
      if (section instanceof HTMLElement) {
        window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY, behavior: "auto" });
      }
    });
    await desktopPage.waitForFunction(() => document.getElementById("collectionsStickyMoodBar")?.dataset.visibility === "visible");

    const scrolledDesktopState = await desktopPage.evaluate(() => ({
      stickyVisibility: document.getElementById("collectionsStickyMoodBar")?.dataset.visibility || "",
      stickyWidth: Math.round(document.getElementById("collectionsStickyMoodBar")?.getBoundingClientRect().width || 0),
      viewport: window.innerWidth,
      scrollY: window.scrollY,
      activeHeroIntent:
        document.querySelector('#collectionsMoodChips .collections-mood-chip[aria-pressed="true"]')?.getAttribute("data-intent") || "",
      activeStickyIntent:
        document.querySelector('#collectionsStickyMoodChips .collections-mood-chip[aria-pressed="true"]')?.getAttribute("data-intent") || "",
    }));

    assert.equal(scrolledDesktopState.stickyVisibility, "visible");
    assert.ok(scrolledDesktopState.stickyWidth <= scrolledDesktopState.viewport);
    assert.equal(scrolledDesktopState.activeHeroIntent, "finished");
    assert.equal(scrolledDesktopState.activeStickyIntent, "finished");

    await desktopPage.locator('#collectionsStickyMoodChips .collections-mood-chip[data-intent="warm-weird"]').click();
    await desktopPage.waitForFunction(
      () =>
        new URL(window.location.href).searchParams.get("intent") === "warm-weird" &&
        document.querySelector('#collectionsStickyMoodChips .collections-mood-chip[aria-pressed="true"]')?.getAttribute("data-intent") ===
          "warm-weird",
    );

    const stickyClickState = await desktopPage.evaluate(() => ({
      scrollY: window.scrollY,
      activeHeroIntent:
        document.querySelector('#collectionsMoodChips .collections-mood-chip[aria-pressed="true"]')?.getAttribute("data-intent") || "",
      activeStickyIntent:
        document.querySelector('#collectionsStickyMoodChips .collections-mood-chip[aria-pressed="true"]')?.getAttribute("data-intent") || "",
    }));

    assert.ok(stickyClickState.scrollY >= scrolledDesktopState.scrollY - 24);
    assert.equal(stickyClickState.activeHeroIntent, "warm-weird");
    assert.equal(stickyClickState.activeStickyIntent, "warm-weird");

    await gotoSmokePage(mobilePage, `${baseUrl}/collections`, { waitUntil: "networkidle" });
    await mobilePage.waitForFunction(() => document.querySelectorAll("#collectionsStickyMoodChips .collections-mood-chip").length > 0);
    await mobilePage.evaluate(() => {
      const section = document.getElementById("collectionsSimilaritySection");
      if (section instanceof HTMLElement) {
        window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY, behavior: "auto" });
      }
    });
    await mobilePage.waitForFunction(() => document.getElementById("collectionsStickyMoodBar")?.dataset.visibility === "visible");

    const mobileState = await mobilePage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      stickyWidth: Math.round(document.getElementById("collectionsStickyMoodBar")?.getBoundingClientRect().width || 0),
      stickyInnerWidth: Math.round(document.querySelector(".collections-sticky-mood-bar-inner")?.getBoundingClientRect().width || 0),
      stickyWrap: window.getComputedStyle(document.getElementById("collectionsStickyMoodChips")).flexWrap,
      stickyCountBadges: document.querySelectorAll("#collectionsStickyMoodChips .collections-mood-chip strong").length,
    }));

    assert.ok(mobileState.scrollWidth <= mobileState.viewport + 1);
    assert.ok(mobileState.stickyWidth <= mobileState.viewport);
    assert.ok(mobileState.stickyInnerWidth <= mobileState.viewport);
    assert.equal(mobileState.stickyWrap, "nowrap");
    assert.equal(mobileState.stickyCountBadges, 0);
  } finally {
    await desktopPage.close();
    await mobilePage.close();
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
      await gotoSmokePage(mobilePage, route, { waitUntil: "networkidle" });
      await mobilePage.waitForFunction(
        () =>
          document.body.dataset.maintainerState === "authRequired" &&
          document.querySelector(".maintainer-hero-panel") &&
          document.querySelector("#maintainerAuthPanel:not([hidden])"),
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

    await gotoSmokePage(tabletPage, `${baseUrl}/maintainer/imports.html`, { waitUntil: "networkidle" });
    await tabletPage.waitForFunction(
      () =>
        document.body.dataset.maintainerState === "authRequired" &&
        document.querySelector(".maintainer-hero-panel") &&
        document.querySelector("#maintainerAuthPanel:not([hidden])"),
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
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
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

test("homepage collection carousels autoplay and resume after a mobile touch leaves the rail", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#favoriteRoutesGrid .collection-card").first().waitFor();
    await page.locator("#collectionGrid .collection-card").first().waitFor();
    await page.waitForFunction(() => {
      const favoriteRoutesViewport = document.getElementById("favoriteRoutesViewport");
      const collectionViewport = document.getElementById("collectionViewport");
      return Boolean(
        favoriteRoutesViewport?.scrollWidth > favoriteRoutesViewport?.clientWidth &&
        collectionViewport?.scrollWidth > collectionViewport?.clientWidth,
      );
    });

    const initialState = await page.evaluate(() => ({
      favoriteRoutes: document.getElementById("favoriteRoutesViewport")?.scrollLeft || 0,
      collections: document.getElementById("collectionViewport")?.scrollLeft || 0,
    }));
    await page.waitForTimeout(1_200);

    const afterAutoplay = await page.evaluate(() => ({
      favoriteRoutes: document.getElementById("favoriteRoutesViewport")?.scrollLeft || 0,
      collections: document.getElementById("collectionViewport")?.scrollLeft || 0,
    }));
    assert.ok(afterAutoplay.favoriteRoutes > initialState.favoriteRoutes + 10);
    assert.ok(afterAutoplay.collections > initialState.collections + 10);

    await page.evaluate(() => {
      const viewport = document.getElementById("collectionViewport");
      viewport?.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 501,
        pointerType: "touch",
        isPrimary: true,
      }));
      window.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 501,
        pointerType: "touch",
        isPrimary: true,
      }));
    });
    await page.waitForTimeout(700);

    const afterTouchResume = await page.evaluate(() => ({
      favoriteRoutes: document.getElementById("favoriteRoutesViewport")?.scrollLeft || 0,
      collections: document.getElementById("collectionViewport")?.scrollLeft || 0,
    }));
    assert.ok(afterTouchResume.favoriteRoutes > afterAutoplay.favoriteRoutes + 8);
    assert.ok(afterTouchResume.collections > afterAutoplay.collections + 8);
  } finally {
    await page.close();
  }
});
