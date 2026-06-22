const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { chromium } = require("playwright");
const { loadCatalog, loadCollections, scoreCatalog } = require("../lib/catalog");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");
const legacyRedirectManifest = JSON.parse(
  fs.readFileSync(path.resolve(siteRoot, "shared/config/legacy-redirects.json"), "utf8"),
);
const basePort = 3310;
const baseUrl = `http://127.0.0.1:${basePort}`;
const homeMostPopularIds = ["midnight-burger", "were-alive", "red-valley", "derelict"];

let browser;
let serverProcess;
let tempDir;
let showFixtures;
let collectionFixtures;
let firstCollectionId;
let firstShowId;
let homeMostPopularTitles;

async function waitForServer(url, timeoutMs = 20_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function getOverlayMetrics(page, sourceIndex, belowIndex) {
  return page.evaluate(
    ({ sourceIndex, belowIndex }) => {
      const shells = Array.from(document.querySelectorAll("#podcast-grid .podcast-card-shell"));
      const shell = shells[sourceIndex] || null;
      const leftNeighbor = shells[sourceIndex - 1] || null;
      const rightNeighbor = shells[sourceIndex + 1] || null;
      const below = shells[belowIndex] || null;
      const layer = shell?.querySelector(".home-card-preview-layer");
      const panel = layer?.querySelector(".home-card-preview");
      const closeButton = panel?.querySelector(".preview-close-button");
      const media = panel?.querySelector(".home-card-preview-media");
      const mediaArt = panel?.querySelector(".home-card-preview-media-art");
      const content = panel?.querySelector(".home-card-preview-content");
      const kicker = panel?.querySelector(".home-card-preview-kicker");
      const title = panel?.querySelector(".home-card-preview-title");
      const copyBody = panel?.querySelector(".home-card-preview-copy-body");
      const goodFor = panel?.querySelector(".preview-good-for");
      const tags = panel?.querySelector(".preview-tags");
      const take = panel?.querySelector(".preview-take");
      const footer = panel?.querySelector(".home-card-preview-footer");
      const openLink = panel?.querySelector(".preview-open-link");
      const shellRect = shell?.getBoundingClientRect();
      const leftNeighborRect = leftNeighbor?.getBoundingClientRect();
      const rightNeighborRect = rightNeighbor?.getBoundingClientRect();
      const belowRect = below?.getBoundingClientRect();
      const panelRect = panel?.getBoundingClientRect();
      const mediaRect = media?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      const sourceCard = shell?.querySelector(".podcast-card-primary");
      const openLinkStyles = openLink ? window.getComputedStyle(openLink) : null;
      const titleStyles = title ? window.getComputedStyle(title) : null;
      const copyBodyStyles = copyBody ? window.getComputedStyle(copyBody) : null;
      const footerStyles = footer ? window.getComputedStyle(footer) : null;
      const takeStyles = take ? window.getComputedStyle(take) : null;
      const mediaArtStyles = mediaArt ? window.getComputedStyle(mediaArt) : null;
      const panelBoundsOk = [closeButton, goodFor, tags, footer, openLink]
        .filter(Boolean)
        .every((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.left >= (panelRect?.left ?? 0) - 1 &&
            rect.right <= (panelRect?.right ?? 0) + 1 &&
            rect.top >= (panelRect?.top ?? 0) - 1 &&
            rect.bottom <= (panelRect?.bottom ?? 0) + 1
          );
        });

      return {
        overlayOpen: Boolean(layer && !layer.hidden && shell?.classList.contains("is-preview-expanded")),
        sourceActive: shell?.classList.contains("preview-source-active") || false,
        shellTopDoc: shellRect ? shellRect.top + window.scrollY : 0,
        shellLeftDoc: shellRect ? shellRect.left + window.scrollX : 0,
        shellWidth: shellRect?.width || 0,
        belowTopDoc: belowRect ? belowRect.top + window.scrollY : 0,
        panelLeft: panelRect?.left || 0,
        panelRight: panelRect?.right || 0,
        panelTop: panelRect?.top || 0,
        panelTopDoc: panelRect ? panelRect.top + window.scrollY : 0,
        panelBottom: panelRect?.bottom || 0,
        panelWidth: panelRect?.width || 0,
        panelHeight: panelRect?.height || 0,
        panelLayout: panel?.dataset.previewLayout || "",
        panelPlacement: panel?.dataset.previewPlacement || "",
        panelClientHeight: panel?.clientHeight || 0,
        panelScrollHeight: panel?.scrollHeight || 0,
        panelScrollTop: panel?.scrollTop || 0,
        mediaRight: mediaRect?.right || 0,
        contentLeft: contentRect?.left || 0,
        mediaTop: mediaRect?.top || 0,
        contentTop: contentRect?.top || 0,
        panelBoundsOk,
        viewport: window.innerWidth,
        viewportHeight: window.innerHeight,
        leftNeighborWidth: leftNeighborRect?.width || 0,
        rightNeighborWidth: rightNeighborRect?.width || 0,
        overlapLeft: leftNeighborRect && panelRect ? Math.max(0, leftNeighborRect.right - panelRect.left) : 0,
        overlapRight: rightNeighborRect && panelRect ? Math.max(0, panelRect.right - rightNeighborRect.left) : 0,
        closeText: closeButton?.textContent?.trim() || "",
        kickerText: kicker?.textContent?.trim() || "",
        openLinkMinHeight: openLinkStyles ? Number.parseFloat(openLinkStyles.minHeight) || 0 : 0,
        openLinkBoxShadow: openLinkStyles?.boxShadow || "",
        activeIsLink: document.activeElement?.classList.contains("preview-open-link") || false,
        activeIsCloseButton: document.activeElement?.classList.contains("preview-close-button") || false,
        activeIsCard: document.activeElement?.classList.contains("podcast-card-primary") || false,
        sourceOpacity: sourceCard ? Number.parseFloat(window.getComputedStyle(sourceCard).opacity) || 0 : 0,
        cardTransform: sourceCard ? window.getComputedStyle(sourceCard).transform : "",
        panelTransform: panel ? window.getComputedStyle(panel).transform : "",
        titleOpacity: titleStyles ? Number.parseFloat(titleStyles.opacity) || 0 : 0,
        copyBodyOpacity: copyBodyStyles ? Number.parseFloat(copyBodyStyles.opacity) || 0 : 0,
        footerOpacity: footerStyles ? Number.parseFloat(footerStyles.opacity) || 0 : 0,
        takeOpacity: takeStyles ? Number.parseFloat(takeStyles.opacity) || 0 : 0,
        titleTransform: titleStyles?.transform || "",
        copyBodyTransform: copyBodyStyles?.transform || "",
        footerTransform: footerStyles?.transform || "",
        takeTransform: takeStyles?.transform || "",
        mediaArtTransform: mediaArtStyles?.transform || "",
      };
    },
    { sourceIndex, belowIndex },
  );
}

async function getPreviewOverlapPoint(page, sourceIndex) {
  return page.evaluate(
    ({ sourceIndex }) => {
      const shells = Array.from(document.querySelectorAll("#podcast-grid .podcast-card-shell"));
      const sourceShell = shells[sourceIndex] || null;
      const panelRect = sourceShell?.querySelector(".home-card-preview")?.getBoundingClientRect();
      if (!panelRect) {
        return null;
      }

      let best = null;
      shells.forEach((coveredShell, coveredIndex) => {
        if (coveredIndex === sourceIndex) {
          return;
        }

        const coveredRect = coveredShell.getBoundingClientRect();
        const left = Math.max(panelRect.left, coveredRect.left);
        const right = Math.min(panelRect.right, coveredRect.right);
        const top = Math.max(panelRect.top, coveredRect.top);
        const bottom = Math.min(panelRect.bottom, coveredRect.bottom);
        const width = Math.max(0, right - left);
        const height = Math.max(0, bottom - top);
        const area = width * height;

        if (width < 8 || height < 8 || area <= 0) {
          return;
        }

        if (!best || area > best.area) {
          best = {
            area,
            coveredIndex,
            x: left + width / 2,
            y: top + Math.min(24, height / 2),
          };
        }
      });

      return best;
    },
    { sourceIndex },
  );
}

function countDistinctRows(items, tolerance = 8) {
  const rows = [];

  items.forEach(({ top }) => {
    if (!rows.some((rowTop) => Math.abs(rowTop - top) <= tolerance)) {
      rows.push(top);
    }
  });

  return rows.length;
}

function createEmptyDistribution() {
  return Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), 0]));
}

function createSummary({ averageRating, ratingCount, myRating = null, distribution = null }) {
  return {
    averageRating,
    ratingCount,
    myRating,
    distribution: distribution || createEmptyDistribution(),
  };
}

function buildSummaryPayload(summaryMap, requestUrl) {
  const requestedIds = (new URL(requestUrl).searchParams.get("podcastIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const summaries = {};
  requestedIds.forEach((id) => {
    if (summaryMap[id]) {
      summaries[id] = summaryMap[id];
    }
  });

  return { summaries };
}

async function getMostPopularBandState(page) {
  return page.evaluate(() => ({
    sectionHidden: document.getElementById("mostPopular")?.hidden ?? true,
    cardIds: Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => card.dataset.podcastId || ""),
    titles: Array.from(document.querySelectorAll("#popularGrid .popular-card-title")).map((node) => node.textContent?.trim() || ""),
    hrefs: Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => card.getAttribute("href") || ""),
    shellCount: document.querySelectorAll("#popularGrid .podcast-card-shell").length,
    previewCount: document.querySelectorAll("#popularGrid .home-card-preview, #popularGrid .home-card-preview-layer").length,
  }));
}

async function getCollectionCarouselFocusState(page) {
  return page.evaluate(() => {
    const viewport = document.getElementById("collectionViewport");
    const viewportRect = viewport?.getBoundingClientRect();
    const viewportCenter = viewportRect ? viewportRect.left + viewportRect.width / 2 : 0;

    const parseTransform = (value) => {
      if (!value || value === "none") {
        return { scale: 1, translateY: 0 };
      }

      const matrix = new DOMMatrixReadOnly(value);
      return {
        scale: matrix.a,
        translateY: matrix.f,
      };
    };

    return Array.from(document.querySelectorAll("#collectionGrid .collection-card")).map((card, index) => {
      const rect = card.getBoundingClientRect();
      const styles = window.getComputedStyle(card);
      const transform = parseTransform(styles.transform);
      const cardCenter = rect.left + rect.width / 2;

      return {
        index,
        title: card.querySelector("h3")?.textContent?.trim() || "",
        collectionId: card.dataset.collectionId || "",
        focusValue: Number.parseFloat(card.style.getPropertyValue("--collection-focus")) || 0,
        scale: transform.scale,
        translateY: transform.translateY,
        transform: styles.transform,
        boosted: card.classList.contains("is-interaction-boosted"),
        centerWeighted: card.classList.contains("is-center-weighted"),
        isVisible: Boolean(viewportRect && rect.right > viewportRect.left && rect.left < viewportRect.right),
        distanceFromCenter: Math.abs(cardCenter - viewportCenter),
      };
    });
  });
}

async function waitForMostPopularBandIds(page, expectedIds) {
  await page.waitForFunction(
    (ids) =>
      JSON.stringify(Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => card.dataset.podcastId || "")) ===
      JSON.stringify(ids),
    expectedIds,
  );
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-smoke-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  showFixtures = await loadCatalog(siteRoot);
  collectionFixtures = loadCollections(siteRoot, new Set(showFixtures.map((show) => show.id)));
  firstCollectionId = collectionFixtures[0].id;
  firstShowId = showFixtures[0].id;
  homeMostPopularTitles = homeMostPopularIds.map(
    (id) => showFixtures.find((show) => show.id === id)?.title || id,
  );

  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(basePort),
      SERVE_STATIC: "true",
      DB_PATH: dbPath,
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      STATIC_ROOT: siteRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(`${baseUrl}/api/health`);
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
      { url: `${baseUrl}/collection.html?id=${firstCollectionId}`, title: `${collectionFixtures[0].title} - The Echo Archives` },
      { url: `${baseUrl}/show.html?id=${firstShowId}`, title: `${showFixtures[0].title} - The Echo Archives` },
      { url: `${baseUrl}/submit.html`, title: "Submit a Show - The Echo Archives" },
    ];

    for (const route of routes) {
      await page.goto(route.url, { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      assert.equal(await page.title(), route.title);
    }
  } finally {
    await page.close();
  }
});

test("for creators page is reachable from nav and its primary interactions work", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator('.site-nav a[href="/for-creators.html"]').click();
    await page.waitForURL(`${baseUrl}/for-creators.html`);
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
      spotlightTitle: document.getElementById("creatorSpotlightTitle")?.textContent?.trim() || "",
      spotlightCreator: document.getElementById("creatorSpotlightCreator")?.textContent?.trim() || "",
      placeholderName: document.getElementById("creatorSpotlightPlaceholderName")?.textContent?.trim() || "",
      placeholderCopy: document.getElementById("creatorSpotlightPlaceholderCopy")?.textContent?.trim() || "",
      spotlightText: document.getElementById("creator-spotlight")?.textContent || "",
      spotlightLinks: Array.from(document.querySelectorAll("#creator-spotlight a")).map((link) => ({
        label: link.textContent?.trim() || "",
        href: link.getAttribute("href") || "",
      })),
      submitHref:
        document.querySelector('.creator-action-card a[href^="/submit.html?submissionType=show"]')?.getAttribute("href") || "",
      correctionHref:
        document.querySelector('.creator-action-card a[href^="/submit.html?submissionType=correction"]')?.getAttribute("href") || "",
      verificationHref:
        document.querySelector('.creator-action-card a[href^="/submit.html?submissionType=creator-verification"]')?.getAttribute("href") || "",
      standardsHref:
        document.querySelector('.creator-action-card a[href="/creator-standards.html"]')?.getAttribute("href") || "",
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

    assert.equal(initialState.activeNavHref, "/for-creators.html");
    assert.ok(Number.parseInt(initialState.creatorCount, 10) > 0);
    assert.ok(Number.parseInt(initialState.showCount, 10) > 0);
    assert.ok(Number.parseInt(initialState.metadataCount, 10) > 0);
    assert.ok(Number.parseInt(initialState.reviewCount, 10) >= 0);
    assert.equal(initialState.spotlightTitle, "Example audio drama");
    assert.equal(initialState.spotlightCreator, "Sample sci-fi mystery");
    assert.equal(initialState.placeholderName, "Example Creator");
    assert.match(initialState.placeholderCopy, /sample quote|real spotlight is sourced/i);
    assert.match(initialState.spotlightText, /View example spotlights/i);
    assert.match(initialState.spotlightText, /Read example interview/i);
    assert.doesNotMatch(initialState.spotlightText, /Impact Winter|Travis Beacham/i);
    assert.deepEqual(initialState.spotlightLinks, []);
    assert.equal(initialState.submitHref, "/submit.html?submissionType=show");
    assert.equal(initialState.correctionHref, "/submit.html?submissionType=correction");
    assert.equal(initialState.verificationHref, "/submit.html?submissionType=creator-verification");
    assert.equal(initialState.standardsHref, "/creator-standards.html");
    assert.equal(initialState.updatesStandardsHref, "/creator-standards.html");
    assert.equal(initialState.independentStandardsHref, "/creator-standards.html#creatorStandardsIndependence");
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

    await page.locator('.creator-action-card a[href="/creator-standards.html"]').click();
    await page.waitForURL(`${baseUrl}/creator-standards.html`);
    assert.equal(await page.title(), "Creator Standards - The Echo Archives");
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
      await page.goto(encodeURI(`${baseUrl}/${redirect.path}`), { waitUntil: "load" });
      await page.waitForURL(`${baseUrl}${redirect.target}`, { timeout: 5_000 });
      assert.equal(new URL(await page.url()).pathname + new URL(await page.url()).search, redirect.target);
    }
  } finally {
    await page.close();
  }
});

test("full-review detail page promotes community, trims the rail, and preserves rating interaction", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/show.html?id=impact-winter`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => {
        const heroCount = document.querySelector("[data-community-hero-count]");
        return Boolean(heroCount && !/Checking listener signal/i.test(heroCount.textContent || ""));
      },
      undefined,
      { timeout: 5_000 },
    );

    const layout = await page.evaluate(() => {
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
      const disabledChips = document.querySelectorAll(".detail-link-chip.is-disabled").length;
      const railHeadings = Array.from(rail?.querySelectorAll("h2") || []).map((node) => (node.textContent || "").trim());
      const routeInRail = Boolean(rail?.querySelector(".detail-collections-section, .detail-collections-card"));
      const correctionInRail = Boolean(rail?.querySelector(".detail-correction-section, .detail-correction-card"));
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
        heroCommunityCount: document.querySelector("[data-community-hero-count]")?.textContent?.trim() || "",
      heroCommunityValue: document.querySelector("[data-community-hero-rating]")?.textContent?.trim() || "",
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
      "official / listen links",
      "status",
      "seasons / episodes",
      "first release",
      "latest release",
    ]);
    assert.deepEqual(layout.railHeadings, ["Archive take", "Facts & links"]);
    assert.equal(layout.routeInRail, false);
    assert.equal(layout.correctionInRail, false);
    assert.ok(layout.routeSectionWidth > 900);
    assert.ok(layout.correctionSectionWidth > 900);
    assert.ok(layout.officialTop < layout.overviewTop);
    assert.ok(layout.communityTop <= layout.archiveTop);
    assert.match(layout.reviewLinkHref, /submit\.html\?submissionType=listener-review&showId=impact-winter/);
    assert.match(layout.heroCommunityCount, /No ratings yet/i);
    assert.equal(layout.heroCommunityValue, "--/10");
    assert.equal(layout.turnstileHidden, true);
    assert.equal(await page.locator(".community-review-body").isVisible(), false);
    assert.equal(await page.locator(".community-review-clear").isVisible(), false);
    assert.equal(await page.locator(".community-review-link").isVisible(), true);

    await page.getByRole("button", { name: "Rate this show" }).click();
    await page.waitForFunction(
      () => {
        const body = document.querySelector(".community-review-body");
        return Boolean(body && !body.hidden);
      },
      undefined,
      { timeout: 2_000 },
    );

    await page.locator(".community-review-button").nth(7).click();
    await page.waitForFunction(
      () => /1 rating/i.test(document.querySelector("[data-community-hero-count]")?.textContent || ""),
      undefined,
      { timeout: 5_000 },
    );

    let communityState = await page.evaluate(() => ({
      heroCount: document.querySelector("[data-community-hero-count]")?.textContent?.trim() || "",
      heroValue: document.querySelector("[data-community-hero-rating]")?.textContent?.trim() || "",
      railValue: document.querySelector(".community-review-metric-value")?.textContent?.trim() || "",
      clearVisible: !document.querySelector(".community-review-clear")?.hidden,
    }));
    assert.match(communityState.heroCount, /1 rating/i);
    assert.equal(communityState.heroValue, "--/10");
    assert.equal(communityState.railValue, "--/10");
    assert.equal(communityState.clearVisible, true);

    await page.getByRole("button", { name: "Clear your rating" }).click();
    await page.waitForFunction(
      () => /No ratings yet/i.test(document.querySelector("[data-community-hero-count]")?.textContent || ""),
      undefined,
      { timeout: 5_000 },
    );

    communityState = await page.evaluate(() => ({
      heroCount: document.querySelector("[data-community-hero-count]")?.textContent?.trim() || "",
      heroValue: document.querySelector("[data-community-hero-rating]")?.textContent?.trim() || "",
      clearVisible: !document.querySelector(".community-review-clear")?.hidden,
    }));
    assert.match(communityState.heroCount, /No ratings yet/i);
    assert.equal(communityState.heroValue, "--/10");
    assert.equal(communityState.clearVisible, false);
  } finally {
    await page.close();
  }

  const mobilePage = await browser.newPage({ viewport: { width: 900, height: 1600 } });

  try {
    await mobilePage.goto(`${baseUrl}/show.html?id=impact-winter`, { waitUntil: "networkidle" });
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

    await page.goto(`${baseUrl}/show.html?id=impact-winter`, { waitUntil: "networkidle" });
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
    assert.match(badgeState.aria, /No ratings yet/i);

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

test("indexed-only detail page shows truthful canonical metadata without narrow legacy layout constraints", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/show.html?id=solar`, { waitUntil: "networkidle" });
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
    await page.goto(`${baseUrl}/show.html?id=were-alive`, { waitUntil: "networkidle" });
    await page.locator('.detail-breadcrumbs a[href*="genre=thriller"]').click();
    await page.waitForURL(`${baseUrl}/index.html?genre=thriller#archive`);
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
    await page.goto(`${baseUrl}/show.html?id=were-alive`, { waitUntil: "networkidle" });
    await page.locator('.detail-breadcrumbs a[href*="genre=thriller"]').click();
    await page.waitForURL(`${baseUrl}/index.html?genre=thriller#archive`);
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

test("homepage supports structured filtering, recently updated mode, and no-result recovery", async () => {
  const page = await browser.newPage();
  const expectedSimilarTitle = scoreCatalog(showFixtures, "like Midnight Burger")[0]?.title || "";

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#activeBrowseState").isVisible(), false);

    await page.locator("#filterToggle").click();
    await page.waitForFunction(() => {
      const dropdown = document.getElementById("filterDropdown");
      return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
    });
    const openState = await page.evaluate(() => ({
      hidden: document.getElementById("filterDropdown")?.hidden ?? true,
      state: document.getElementById("filterDropdown")?.dataset.state || "",
      expanded: document.getElementById("filterToggle")?.getAttribute("aria-expanded") || "false",
      groupCount: document.querySelectorAll("#filterOptionGrid .filter-group").length,
    }));
    assert.equal(openState.hidden, false);
    assert.equal(openState.state, "open");
    assert.equal(openState.expanded, "true");
    assert.ok(openState.groupCount > 0);

    await page.mouse.click(4, 4);
    await page.waitForFunction(() => document.getElementById("filterDropdown")?.hidden === true);

    await page.locator("#filterToggle").click();
    await page.waitForFunction(() => {
      const dropdown = document.getElementById("filterDropdown");
      return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.getElementById("filterDropdown")?.hidden === true && document.activeElement?.id === "filterToggle",
    );

    await page.locator("#filterToggle").click();
    await page.waitForFunction(() => {
      const dropdown = document.getElementById("filterDropdown");
      return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
    });
    await page.evaluate(() => {
      document
        .querySelector('.filter-option[data-filter-group="completionStatus"][data-filter-value="finished"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document
        .querySelector('.filter-option[data-filter-group="reviewStatus"][data-filter-value="indexed-only"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.getByText("results", { exact: false }).waitFor();

    const filterCount = page.locator("#filterCount");
    await assert.doesNotReject(() => filterCount.waitFor());
    assert.equal(await filterCount.textContent(), "2");
    assert.equal(await page.locator("#activeBrowseState").isVisible(), true);
    assert.match((await page.locator("#activeBrowseState").textContent()) || "", /Completion:\s*Finished/i);
    assert.match((await page.locator("#activeBrowseState").textContent()) || "", /Coverage:\s*Indexed Only/i);
    const chipState = await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll("#activeBrowseChips .active-browse-chip:not(.is-exiting)"));
      return {
        ids: chips.map((chip) => chip.dataset.activeBrowseId || ""),
        visibleClear: !(document.getElementById("activeBrowseClear")?.hidden ?? true),
      };
    });
    assert.equal(new Set(chipState.ids).size, chipState.ids.length);
    assert.equal(chipState.ids.length, 2);
    assert.equal(chipState.visibleClear, true);

    await page.locator("#activeBrowseChips .active-browse-chip").nth(0).click();
    await page.waitForFunction(() => document.getElementById("filterCount")?.textContent?.trim() === "1");
    const afterChipRemoval = await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll("#activeBrowseChips .active-browse-chip:not(.is-exiting)"));
      return chips.map((chip) => chip.dataset.activeBrowseId || "");
    });
    assert.equal(afterChipRemoval.length, 1);
    assert.equal(new Set(afterChipRemoval).size, afterChipRemoval.length);

    await page.locator("#activeBrowseClear").click();
    await page.waitForFunction(
      (expectedCount) =>
        document.querySelectorAll("#podcast-grid .podcast-card-shell").length === expectedCount &&
        document.getElementById("activeBrowseState")?.hidden === true &&
        document.getElementById("filterCount")?.hidden === true,
      showFixtures.length,
    );

    await page.locator("#filterToggle").click();
    await page.waitForFunction(() => {
      const dropdown = document.getElementById("filterDropdown");
      return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
    });
    await page.evaluate(() => {
      document
        .querySelector('.filter-option[data-filter-group="completionStatus"][data-filter-value="finished"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document
        .querySelector('.filter-option[data-filter-group="reviewStatus"][data-filter-value="indexed-only"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForFunction(() => document.getElementById("filterCount")?.textContent?.trim() === "2");
    const reappliedChipState = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#activeBrowseChips .active-browse-chip:not(.is-exiting)")).map((chip) => chip.dataset.activeBrowseId || ""),
    );
    assert.equal(new Set(reappliedChipState).size, reappliedChipState.length);
    assert.equal(reappliedChipState.length, 2);

    await page.getByRole("button", { name: "Recently updated" }).click();
    await page.locator("#resultsSummary").waitFor();
    assert.match((await page.locator("#resultsSummary").textContent()) || "", /Recently updated/i);

    await page.locator("#search").fill("zzzzzz-not-in-archive");
    await page.getByText("No matches yet.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();

    const cardCount = await page.locator("#podcast-grid .podcast-card-shell").count();
    assert.ok(cardCount > 0);

    const searchCases = [
      { query: "easy entry" },
      { query: "long walks" },
      { query: "completed sci fi" },
      { query: "like Midnight Burger", expectedTopTitle: expectedSimilarTitle },
    ];

    for (const searchCase of searchCases) {
      await page.locator("#search").fill(searchCase.query);
      await page.waitForFunction(
        (query) => (document.querySelector("#resultsSummary")?.textContent || "").includes(`results for "${query}"`),
        searchCase.query,
      );

      const searchState = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("#podcast-grid .podcast-card-shell")).slice(0, 5);
        return {
          allActive: document.querySelector('.quick-filter[data-chip-filter="all"]')?.classList.contains("is-active") || false,
          summary: document.querySelector("#resultsSummary")?.textContent?.trim() || "",
          titles: cards
            .map((card) => card.querySelector(".podcast-card-title, h2, h3")?.textContent?.trim() || "")
            .filter(Boolean),
        };
      });

      assert.equal(searchState.allActive, false);
      assert.match(searchState.summary, new RegExp(`results for "${searchCase.query}"`, "i"));
      assert.ok(searchState.titles.length > 0);

      if (searchCase.expectedTopTitle) {
        assert.equal(searchState.titles[0], searchCase.expectedTopTitle);
      }
    }

    await page.locator('.quick-filter[data-chip-filter="all"]').click();
    await page.waitForFunction(
      (expectedCount) =>
        document.querySelectorAll("#podcast-grid .podcast-card-shell").length === expectedCount &&
        (document.querySelector("#search")?.value || "") === "" &&
        document.getElementById("activeBrowseState")?.hidden === true,
      showFixtures.length,
    );
  } finally {
    await page.close();
  }
});

test("homepage most popular band renders a valid 4-card band and hides outside the default archive state", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#popularGrid .popular-card").first().waitFor();

    const defaultState = await getMostPopularBandState(page);
    const uniqueCardIds = new Set(defaultState.cardIds);

    assert.equal(defaultState.sectionHidden, false);
    assert.equal(defaultState.cardIds.length, 4);
    assert.equal(uniqueCardIds.size, 4);
    assert.equal(defaultState.shellCount, 0);
    assert.equal(defaultState.previewCount, 0);
    defaultState.titles.forEach((title) => {
      assert.ok(title);
    });
    defaultState.hrefs.forEach((href, index) => {
      assert.match(href, new RegExp(`show\\.html\\?id=${defaultState.cardIds[index]}$`));
    });

    const gridCounts = await page.evaluate(
      (cardIds) =>
        cardIds.map((id) => ({
          id,
          count: document.querySelectorAll(`#podcast-grid .podcast-card-shell[data-podcast-id="${id}"]`).length,
        })),
      defaultState.cardIds,
    );
    gridCounts.forEach(({ count }) => {
      assert.equal(count, 1);
    });

    await page.locator("#search").fill("midnight");
    await page.waitForFunction(() => document.getElementById("mostPopular")?.hidden === true);

    await page.locator("#search").fill("");
    await page.waitForFunction(() => document.getElementById("mostPopular")?.hidden === false);

    await page.locator("#filterToggle").click();
    await page.evaluate(() => {
      document
        .querySelector('.filter-option[data-filter-group="completionStatus"][data-filter-value="finished"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForFunction(() => document.getElementById("mostPopular")?.hidden === true);

    await page.locator('.quick-filter[data-chip-filter="all"]').click();
    await page.waitForFunction(() => document.getElementById("mostPopular")?.hidden === false);

    await page.getByRole("button", { name: "Recently updated" }).click();
    await page.waitForFunction(() => document.getElementById("mostPopular")?.hidden === true);

    await page.getByRole("button", { name: "Default order" }).click();
    await page.waitForFunction(() => document.getElementById("mostPopular")?.hidden === false);

    await page.goto(`${baseUrl}/?collection=${firstCollectionId}#archive`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("mostPopular")?.hidden === true);
  } finally {
    await page.close();
  }
});

test("homepage most popular band keeps the hardcoded fallback when community summaries are unavailable", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.route("**/api/community/ratings/summary?*", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "offline" }),
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await waitForMostPopularBandIds(page, homeMostPopularIds);

    const fallbackState = await getMostPopularBandState(page);
    assert.equal(fallbackState.sectionHidden, false);
    assert.deepEqual(fallbackState.cardIds, homeMostPopularIds);
    assert.deepEqual(fallbackState.titles, homeMostPopularTitles);
  } finally {
    await page.close();
  }
});

test("homepage most popular band reorders by community rating volume and average", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const summaryMap = {
    "midnight-burger": createSummary({ averageRating: 8.7, ratingCount: 12 }),
    derelict: createSummary({ averageRating: 9.4, ratingCount: 10 }),
    "were-alive": createSummary({ averageRating: 8.9, ratingCount: 10 }),
    "red-valley": createSummary({ averageRating: 9.8, ratingCount: 3 }),
  };
  const expectedIds = ["midnight-burger", "derelict", "were-alive", "red-valley"];

  try {
    await page.route("**/api/community/ratings/summary?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildSummaryPayload(summaryMap, route.request().url())),
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await waitForMostPopularBandIds(page, expectedIds);

    const rankedState = await getMostPopularBandState(page);
    assert.deepEqual(rankedState.cardIds, expectedIds);
  } finally {
    await page.close();
  }
});

test("homepage most popular band fills remaining slots from popularity metadata before the hardcoded fallback", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const summaryMap = {
    story: createSummary({ averageRating: 8.6, ratingCount: 7 }),
    "station-151": createSummary({ averageRating: 9.2, ratingCount: 3 }),
  };
  const expectedIds = ["story", "station-151", "impact-winter", "ars-paradoxica"];

  try {
    await page.route("**/data/shows.json", async (route) => {
      const records = showFixtures.map((show) => {
        if (show.id === "impact-winter") {
          return {
            ...show,
            popularity: { ...(show.popularity || {}), score: 98 },
          };
        }

        if (show.id === "ars-paradoxica") {
          return {
            ...show,
            popularity: { ...(show.popularity || {}), score: 97 },
          };
        }

        return show;
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(records),
      });
    });

    await page.route("**/api/community/ratings/summary?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildSummaryPayload(summaryMap, route.request().url())),
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await waitForMostPopularBandIds(page, expectedIds);

    const rankedState = await getMostPopularBandState(page);
    assert.deepEqual(rankedState.cardIds, expectedIds);
  } finally {
    await page.close();
  }
});

test("homepage most popular band uses 4-up, 2-up, and 1-up responsive layouts", async () => {
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await desktopPage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await desktopPage.locator("#popularGrid .popular-card").first().waitFor();

    const desktopLayout = await desktopPage.evaluate(() =>
      Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: Math.round(rect.top), left: Math.round(rect.left) };
      }),
    );

    assert.equal(countDistinctRows(desktopLayout), 1);
    assert.ok(desktopLayout[1].left > desktopLayout[0].left);
    assert.ok(desktopLayout[2].left > desktopLayout[1].left);
    assert.ok(desktopLayout[3].left > desktopLayout[2].left);
  } finally {
    await desktopPage.close();
  }

  const tabletPage = await browser.newPage({ viewport: { width: 980, height: 1400 } });

  try {
    await tabletPage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await tabletPage.locator("#popularGrid .popular-card").first().waitFor();

    const tabletLayout = await tabletPage.evaluate(() =>
      Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: Math.round(rect.top), left: Math.round(rect.left) };
      }),
    );

    assert.equal(countDistinctRows(tabletLayout), 2);
    assert.ok(Math.abs(tabletLayout[0].top - tabletLayout[1].top) <= 8);
    assert.ok(tabletLayout[2].top > tabletLayout[0].top + 8);
  } finally {
    await tabletPage.close();
  }

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 1400 } });

  try {
    await mobilePage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await mobilePage.locator("#popularGrid .popular-card").first().waitFor();

    const mobileLayout = await mobilePage.evaluate(() =>
      Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: Math.round(rect.top), left: Math.round(rect.left) };
      }),
    );

    assert.equal(countDistinctRows(mobileLayout), 4);
    assert.ok(mobileLayout[1].top > mobileLayout[0].top + 8);
    assert.ok(mobileLayout[2].top > mobileLayout[1].top + 8);
    assert.ok(mobileLayout[3].top > mobileLayout[2].top + 8);
  } finally {
    await mobilePage.close();
  }
});

test("homepage featured collections carousel applies center-weighted focus and direct hover emphasis", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#collectionGrid .collection-card").first().waitFor();
    await page.waitForTimeout(180);

    const initialVisibleCards = (await getCollectionCarouselFocusState(page)).filter((card) => card.isVisible);
    assert.ok(initialVisibleCards.length >= 3);

    const nearestToCenter = [...initialVisibleCards].sort((left, right) => left.distanceFromCenter - right.distanceFromCenter)[0];
    const strongestAmbientCard = [...initialVisibleCards].sort((left, right) => right.focusValue - left.focusValue)[0];
    assert.equal(strongestAmbientCard.index, nearestToCenter.index);
    assert.ok(strongestAmbientCard.centerWeighted);
    assert.ok(strongestAmbientCard.focusValue > 0.6);

    const hoverTarget = initialVisibleCards.find((card) => card.index !== nearestToCenter.index) || nearestToCenter;
    await page.locator("#collectionGrid .collection-card").nth(hoverTarget.index).hover();
    await page.waitForTimeout(140);

    const hoveredCards = await getCollectionCarouselFocusState(page);
    const hoveredTargetState = hoveredCards.find((card) => card.index === hoverTarget.index);
    assert.ok(hoveredTargetState?.boosted);
    assert.ok((hoveredTargetState?.scale || 0) > 1.02);
    assert.ok((hoveredTargetState?.translateY || 0) < -2.5);

    await page.locator("#collectionNext").click();
    await page.waitForTimeout(520);

    const afterNextVisibleCards = (await getCollectionCarouselFocusState(page)).filter((card) => card.isVisible);
    const nextNearestToCenter = [...afterNextVisibleCards].sort((left, right) => left.distanceFromCenter - right.distanceFromCenter)[0];
    const nextStrongestAmbientCard = [...afterNextVisibleCards].sort((left, right) => right.focusValue - left.focusValue)[0];
    assert.equal(nextStrongestAmbientCard.index, nextNearestToCenter.index);
    assert.notEqual(nextNearestToCenter.collectionId, nearestToCenter.collectionId);
  } finally {
    await page.close();
  }
});

test("homepage expanding archive card supports stable hover, keyboard, touch, and compact anchored geometry", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const shells = page.locator("#podcast-grid .podcast-card-shell");
    const cardCount = await shells.count();
    assert.ok(cardCount >= 8);

    const firstShell = shells.nth(0);
    const middleShell = shells.nth(1);
    const rightEdgeShell = shells.nth(5);
    const middleBefore = await getOverlayMetrics(page, 1, 7);

    await middleShell.locator(".podcast-card-primary").hover();
    await page.waitForTimeout(420);
    assert.equal((await getOverlayMetrics(page, 1, 7)).overlayOpen, false);
    await page.waitForFunction(
      () => {
        const shell = document.querySelectorAll("#podcast-grid .podcast-card-shell")[1];
        const layer = shell?.querySelector(".home-card-preview-layer");
        return Boolean(layer && !layer.hidden && shell?.classList.contains("is-preview-expanded"));
      },
      undefined,
      { timeout: 2_000 },
    );
    await page.waitForTimeout(220);
    const middleMetrics = await getOverlayMetrics(page, 1, 7);
    assert.equal(middleMetrics.overlayOpen, true);
    assert.equal(middleMetrics.sourceActive, true);
    assert.equal(middleMetrics.panelLayout, "split");
    assert.equal(middleMetrics.panelPlacement, "card");
    assert.ok(Math.abs(middleMetrics.shellTopDoc - middleBefore.shellTopDoc) < 1);
    assert.ok(Math.abs(middleMetrics.belowTopDoc - middleBefore.belowTopDoc) < 1);
    assert.ok(middleMetrics.panelWidth > middleMetrics.shellWidth * 1.9);
    assert.ok(middleMetrics.panelWidth < middleMetrics.shellWidth * 2.2);
    assert.ok(middleMetrics.panelTopDoc <= middleBefore.shellTopDoc);
    assert.ok(middleBefore.shellTopDoc - middleMetrics.panelTopDoc < 12);
    assert.ok(middleMetrics.overlapLeft <= middleMetrics.leftNeighborWidth * 0.55);
    assert.ok(middleMetrics.overlapRight <= middleMetrics.rightNeighborWidth * 0.55);
    assert.ok(middleMetrics.mediaRight <= middleMetrics.contentLeft);
    assert.equal(middleMetrics.panelBoundsOk, true);
    assert.equal(middleMetrics.closeText, "x");
    assert.equal(middleMetrics.kickerText, "");
    assert.ok(middleMetrics.openLinkMinHeight < 8);
    assert.equal(middleMetrics.openLinkBoxShadow, "none");
    assert.ok(middleMetrics.sourceOpacity < 0.05);
    assert.ok(middleMetrics.titleOpacity > 0.95);
    assert.ok(middleMetrics.copyBodyOpacity > 0.95);
    assert.ok(middleMetrics.footerOpacity > 0.95);
    assert.ok(middleMetrics.takeOpacity > 0.9 || middleMetrics.takeOpacity === 0);

    await page.mouse.wheel(0, 220);
    await page.waitForTimeout(120);
    const scrolledMiddleMetrics = await getOverlayMetrics(page, 1, 7);
    assert.equal(scrolledMiddleMetrics.overlayOpen, false);
    assert.equal(scrolledMiddleMetrics.sourceActive, false);
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(120);

    await page.locator("#resultsSummary").hover();
    await page.waitForTimeout(240);
    const middleClosed = await getOverlayMetrics(page, 1, 7);
    assert.equal(middleClosed.overlayOpen, false);
    assert.equal(middleClosed.sourceActive, false);
    assert.ok(Math.abs(middleClosed.shellTopDoc - middleBefore.shellTopDoc) < 1);
    assert.ok(Math.abs(middleClosed.belowTopDoc - middleBefore.belowTopDoc) < 1);

    await middleShell.locator(".podcast-card-primary").hover();
    await page.waitForFunction(
      () => {
        const shell = document.querySelectorAll("#podcast-grid .podcast-card-shell")[1];
        const layer = shell?.querySelector(".home-card-preview-layer");
        return Boolean(layer && !layer.hidden && shell?.classList.contains("is-preview-expanded"));
      },
      undefined,
      { timeout: 2_000 },
    );
    const overlapPoint = await getPreviewOverlapPoint(page, 1);
    assert.ok(overlapPoint);
    await page.mouse.move(overlapPoint.x, overlapPoint.y, { steps: 10 });
    await page.waitForTimeout(140);
    const overlapMetrics = await getOverlayMetrics(page, 1, 7);
    assert.equal(overlapMetrics.overlayOpen, true);
    assert.equal(overlapMetrics.sourceActive, true);

    await shells.nth(4).locator(".podcast-card-primary").hover();
    await page.waitForTimeout(140);
    const movedOffMiddleMetrics = await getOverlayMetrics(page, 1, 7);
    assert.equal(movedOffMiddleMetrics.overlayOpen, false);
    assert.equal(movedOffMiddleMetrics.sourceActive, false);
    await page.waitForFunction(
      () => {
        const shell = document.querySelectorAll("#podcast-grid .podcast-card-shell")[4];
        const layer = shell?.querySelector(".home-card-preview-layer");
        return Boolean(layer && !layer.hidden && shell?.classList.contains("is-preview-expanded"));
      },
      undefined,
      { timeout: 2_000 },
    );
    const switchedShellMetrics = await getOverlayMetrics(page, 4, 0);
    assert.equal(switchedShellMetrics.overlayOpen, true);
    assert.equal(switchedShellMetrics.sourceActive, true);

    await page.locator("#resultsSummary").hover();
    await page.waitForTimeout(240);
    assert.equal((await getOverlayMetrics(page, 4, 0)).overlayOpen, false);

    await firstShell.locator(".podcast-card-primary").hover();
    await page.waitForFunction(
      () => {
        const shell = document.querySelectorAll("#podcast-grid .podcast-card-shell")[0];
        const layer = shell?.querySelector(".home-card-preview-layer");
        return Boolean(layer && !layer.hidden && shell?.classList.contains("is-preview-expanded"));
      },
      undefined,
      { timeout: 2_000 },
    );
    const firstMetrics = await getOverlayMetrics(page, 0, 6);
    assert.equal(firstMetrics.overlayOpen, true);
    assert.equal(firstMetrics.panelPlacement, "card");
    assert.ok(firstMetrics.panelTopDoc <= firstMetrics.shellTopDoc);
    assert.ok(firstMetrics.shellTopDoc - firstMetrics.panelTopDoc < 12);
    assert.ok(firstMetrics.panelLeft >= 0);
    assert.ok(firstMetrics.panelRight <= firstMetrics.viewport);

    await page.locator("#resultsSummary").hover();
    await page.waitForTimeout(240);
    await rightEdgeShell.locator(".podcast-card-primary").focus();
    await page.waitForFunction(
      () => {
        const shell = document.querySelectorAll("#podcast-grid .podcast-card-shell")[5];
        const layer = shell?.querySelector(".home-card-preview-layer");
        return Boolean(layer && !layer.hidden && shell?.classList.contains("is-preview-expanded"));
      },
      undefined,
      { timeout: 2_000 },
    );
    const rightMetrics = await getOverlayMetrics(page, 5, 11);
    assert.equal(rightMetrics.overlayOpen, true);
    assert.equal(rightMetrics.panelPlacement, "card");
    assert.ok(rightMetrics.panelTopDoc <= rightMetrics.shellTopDoc);
    assert.ok(rightMetrics.shellTopDoc - rightMetrics.panelTopDoc < 12);
    assert.ok(rightMetrics.panelLeft >= 0);
    assert.ok(rightMetrics.panelRight <= rightMetrics.viewport);

    await middleShell.locator(".podcast-card-primary").focus();
    await page.waitForFunction(
      () => {
        const shell = document.querySelectorAll("#podcast-grid .podcast-card-shell")[1];
        const layer = shell?.querySelector(".home-card-preview-layer");
        return Boolean(layer && !layer.hidden && shell?.classList.contains("is-preview-expanded"));
      },
      undefined,
      { timeout: 2_000 },
    );
    const focusedMetrics = await getOverlayMetrics(page, 1, 7);
    assert.equal(focusedMetrics.overlayOpen, true);
    assert.equal(focusedMetrics.activeIsCard, true);

    await page.keyboard.press("Tab");
    await page.waitForFunction(
      () => document.activeElement?.classList.contains("preview-close-button") || false,
      undefined,
      { timeout: 2_000 },
    );
    assert.equal((await getOverlayMetrics(page, 1, 7)).activeIsCloseButton, true);

    await page.keyboard.press("Tab");
    await page.waitForFunction(
      () => document.activeElement?.classList.contains("preview-open-link") || false,
      undefined,
      { timeout: 2_000 },
    );
    assert.equal((await getOverlayMetrics(page, 1, 7)).activeIsLink, true);

    await page.keyboard.press("Shift+Tab");
    await page.waitForFunction(
      () => document.activeElement?.classList.contains("preview-close-button") || false,
      undefined,
      { timeout: 2_000 },
    );
    assert.equal((await getOverlayMetrics(page, 1, 7)).activeIsCloseButton, true);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(180);
    assert.equal((await getOverlayMetrics(page, 1, 7)).overlayOpen, false);
    await page.waitForFunction(
      () => document.activeElement?.classList.contains("podcast-card-primary") || false,
      undefined,
      { timeout: 2_000 },
    );
  } finally {
    await page.close();
  }

  const touchPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  try {
    await touchPage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const touchGridLayout = await Promise.all([
      touchPage.locator("#podcast-grid .podcast-card-shell").nth(0).boundingBox(),
      touchPage.locator("#podcast-grid .podcast-card-shell").nth(1).boundingBox(),
    ]);
    assert.ok(touchGridLayout[0] && touchGridLayout[1]);
    assert.ok(Math.abs(touchGridLayout[0].y - touchGridLayout[1].y) < 4);
    assert.ok(touchGridLayout[1].x > touchGridLayout[0].x);

    const firstShell = touchPage.locator("#podcast-grid .podcast-card-shell").nth(0);
    const firstCard = firstShell.locator(".podcast-card-primary");
    await firstCard.scrollIntoViewIfNeeded();
    const touchBefore = await getOverlayMetrics(touchPage, 0, 2);
    await firstCard.tap();

    await touchPage.waitForTimeout(360);
    const touchMetrics = await getOverlayMetrics(touchPage, 0, 2);
    assert.equal(touchMetrics.overlayOpen, true);
    assert.equal(new URL(await touchPage.url()).pathname, "/");
    assert.equal(touchMetrics.panelLayout, "stack");
    assert.equal(touchMetrics.panelPlacement, "card");
    assert.ok(Math.abs(touchMetrics.shellTopDoc - touchBefore.shellTopDoc) < 1);
    assert.ok(Math.abs(touchMetrics.belowTopDoc - touchBefore.belowTopDoc) < 1);
    assert.ok(touchMetrics.panelWidth > touchMetrics.shellWidth * 1.9);
    assert.ok(touchMetrics.panelWidth < touchMetrics.shellWidth * 2.2);
    assert.ok(touchMetrics.panelTopDoc <= touchBefore.shellTopDoc);
    assert.ok(touchBefore.shellTopDoc - touchMetrics.panelTopDoc < 12);
    assert.ok(touchMetrics.panelLeft >= 0);
    assert.ok(touchMetrics.panelRight <= touchMetrics.viewport);
    assert.equal(touchMetrics.panelBoundsOk, true);

    await firstShell.locator(".preview-close-button").tap();
    await touchPage.waitForTimeout(180);
    assert.equal((await getOverlayMetrics(touchPage, 0, 2)).overlayOpen, false);

    await firstCard.scrollIntoViewIfNeeded();
    await firstCard.tap();
    await touchPage.waitForTimeout(360);
    await touchPage.touchscreen.tap(8, 8);
    await touchPage.waitForTimeout(180);
    assert.equal((await getOverlayMetrics(touchPage, 0, 2)).overlayOpen, false);

  } finally {
    await touchPage.close();
  }

  const touchLinkPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  try {
    await touchLinkPage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const firstShell = touchLinkPage.locator("#podcast-grid .podcast-card-shell").nth(0);
    const firstCard = firstShell.locator(".podcast-card-primary");
    await firstCard.scrollIntoViewIfNeeded();
    await firstCard.tap();
    await touchLinkPage.waitForTimeout(200);
    await firstShell.locator(".preview-open-link").tap();
    await touchLinkPage.waitForURL(`${baseUrl}/show.html?id=*`, { timeout: 5_000 });
  } finally {
    await touchLinkPage.close();
  }

  const narrowTouchPage = await browser.newPage({
    viewport: { width: 320, height: 844 },
    hasTouch: true,
  });

  try {
    await narrowTouchPage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const narrowGridLayout = await Promise.all([
      narrowTouchPage.locator("#podcast-grid .podcast-card-shell").nth(0).boundingBox(),
      narrowTouchPage.locator("#podcast-grid .podcast-card-shell").nth(1).boundingBox(),
    ]);
    assert.ok(narrowGridLayout[0] && narrowGridLayout[1]);
    assert.ok(Math.abs(narrowGridLayout[0].y - narrowGridLayout[1].y) < 4);
    assert.ok(narrowGridLayout[1].x > narrowGridLayout[0].x);

    const firstShell = narrowTouchPage.locator("#podcast-grid .podcast-card-shell").nth(0);
    await firstShell.locator(".podcast-card-primary").scrollIntoViewIfNeeded();
    await firstShell.locator(".podcast-card-primary").tap();
    await narrowTouchPage.waitForTimeout(360);

    const narrowMetrics = await getOverlayMetrics(narrowTouchPage, 0, 2);
    assert.equal(narrowMetrics.overlayOpen, true);
    assert.equal(narrowMetrics.panelLayout, "stack");
    assert.equal(narrowMetrics.panelPlacement, "card");
    assert.ok(narrowMetrics.panelWidth > narrowMetrics.shellWidth * 1.9);
    assert.ok(narrowMetrics.panelWidth < narrowMetrics.shellWidth * 2.25);
    assert.ok(narrowMetrics.panelTopDoc <= narrowMetrics.shellTopDoc);
    assert.ok(narrowMetrics.shellTopDoc - narrowMetrics.panelTopDoc < 12);
    assert.ok(narrowMetrics.panelLeft >= 0);
    assert.ok(narrowMetrics.panelRight <= narrowMetrics.viewport);
    assert.equal(narrowMetrics.panelBoundsOk, true);
  } finally {
    await narrowTouchPage.close();
  }

  const reducedMotionPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  try {
    await reducedMotionPage.emulateMedia({ reducedMotion: "reduce" });
    await reducedMotionPage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const middleShell = reducedMotionPage.locator("#podcast-grid .podcast-card-shell").nth(1);
    await middleShell.locator(".podcast-card-primary").hover();
    await reducedMotionPage.waitForFunction(
      () => {
        const shell = document.querySelectorAll("#podcast-grid .podcast-card-shell")[1];
        const layer = shell?.querySelector(".home-card-preview-layer");
        return Boolean(layer && !layer.hidden && shell?.classList.contains("is-preview-expanded"));
      },
      undefined,
      { timeout: 2_000 },
    );

    const reducedMetrics = await getOverlayMetrics(reducedMotionPage, 1, 7);
    assert.equal(reducedMetrics.overlayOpen, true);
    assert.equal(reducedMetrics.panelTransform, "none");
    assert.equal(reducedMetrics.cardTransform, "none");
    assert.equal(reducedMetrics.titleTransform, "none");
    assert.equal(reducedMetrics.copyBodyTransform, "none");
    assert.equal(reducedMetrics.footerTransform, "none");
    assert.equal(reducedMetrics.mediaArtTransform, "none");

    const reducedCollectionState = (await getCollectionCarouselFocusState(reducedMotionPage)).filter((card) => card.isVisible);
    assert.ok(reducedCollectionState.length > 0);
    reducedCollectionState.forEach((card) => {
      assert.equal(card.transform, "none");
    });
  } finally {
    await reducedMotionPage.close();
  }
});

test("homepage expanding archive card stays card-anchored and can overflow the viewport", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 400 } });
  const targetIndex = 12;

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.evaluate((index) => {
      const shells = Array.from(document.querySelectorAll("#podcast-grid .podcast-card-shell"));
      const shell = shells[index];
      if (!shell) {
        return;
      }

      const rect = shell.getBoundingClientRect();
      const targetTop = 112;
      window.scrollBy(0, rect.top - targetTop);
    }, targetIndex);
    await page.waitForTimeout(120);

    const shell = page.locator("#podcast-grid .podcast-card-shell").nth(targetIndex);
    await shell.locator(".podcast-card-primary").hover({ position: { x: 40, y: 40 } });
    await page.waitForFunction(
      (index) => {
        const shells = document.querySelectorAll("#podcast-grid .podcast-card-shell");
        const shell = shells[index];
        const layer = shell?.querySelector(".home-card-preview-layer");
        return Boolean(layer && !layer.hidden && shell?.classList.contains("is-preview-expanded"));
      },
      targetIndex,
      { timeout: 2_000 },
    );

    const metrics = await getOverlayMetrics(page, targetIndex, targetIndex + 6);
    assert.equal(metrics.overlayOpen, true);
    assert.equal(metrics.panelLayout, "split");
    assert.equal(metrics.panelPlacement, "card");
    assert.ok(metrics.panelTopDoc <= metrics.shellTopDoc);
    assert.ok(metrics.shellTopDoc - metrics.panelTopDoc < 12);
    assert.ok(metrics.panelBottom > metrics.viewportHeight);
    assert.ok(Math.abs(metrics.panelScrollHeight - metrics.panelClientHeight) < 2);
    assert.equal(metrics.panelScrollTop, 0);
    assert.equal(await shell.locator(".preview-open-link").isVisible(), true);
    assert.equal(await shell.locator(".preview-close-button").isVisible(), true);
  } finally {
    await page.close();
  }
});

test("Ask the Archivist and the remade submit page interactions work across modes", async () => {
  const page = await browser.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    let chatState = await page.evaluate(() => ({
      placeholder: document.getElementById("userInput")?.getAttribute("placeholder") || "",
      suggestions: Array.from(document.querySelectorAll("#chatSuggestions .chat-suggestion")).map((node) =>
        node.textContent?.trim() || "",
      ),
    }));
    assert.match(chatState.placeholder, /archive|site works/i);
    assert.ok(chatState.suggestions.includes("How do I submit a correction?"));
    assert.ok(chatState.suggestions.includes("What does creator verified mean?"));

    await page.locator("#userInput").fill("How do I submit a correction?");
    await page.locator("#sendMessageButton").click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#chatLog .message.bot")).some((node) =>
          /Corrections are for metadata and links/i.test(node.textContent || ""),
        ),
      undefined,
      { timeout: 5_000 },
    );
    await page.locator('.chat-action-link[href="/submit.html"]').waitFor();

    await page.locator("#chat-clear").click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#chatLog .message.bot")).some((node) =>
          /Ask about a show, the archive, ratings, creators, runtime, transcripts, collections/i.test(node.textContent || ""),
        ),
      undefined,
      { timeout: 5_000 },
    );

    await page.locator("#userInput").fill("Recommend a finished sci-fi show");
    await page.locator("#sendMessageButton").click();
    await page.locator(".chat-recommendation-card").first().waitFor({ timeout: 5_000 });
    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });

    await page.goto(`${baseUrl}/submit.html`, { waitUntil: "networkidle" });
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    await page.locator("#userInput").fill("How do creator verification requests work?");
    await page.locator("#sendMessageButton").click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#chatLog .message.bot")).some((node) =>
          /creator verification|factual metadata/i.test(node.textContent || ""),
        ),
      undefined,
      { timeout: 5_000 },
    );
    await page.locator('.chat-action-link[href="/submit.html"]').waitFor();
    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });

    let tagAndLinkState = await page.evaluate(() => ({
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      completionTop: (() => {
        const field = document.getElementById("submitCompletionStatus");
        if (!field) {
          return 0;
        }
        const rect = field.getBoundingClientRect();
        return rect.top + window.scrollY;
      })(),
    }));
    assert.equal(tagAndLinkState.tagMenuOpen, false);
    const completionTopBeforeTagMenu = tagAndLinkState.completionTop;

    await page.locator("[data-toggle-tag-picker]").click();
    await page.locator(".submit-tag-picker-menu:not([hidden])").waitFor();
    tagAndLinkState = await page.evaluate(() => ({
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      completionTop: (() => {
        const field = document.getElementById("submitCompletionStatus");
        if (!field) {
          return 0;
        }
        const rect = field.getBoundingClientRect();
        return rect.top + window.scrollY;
      })(),
    }));
    assert.equal(tagAndLinkState.tagMenuOpen, true);
    assert.equal(tagAndLinkState.completionTop, completionTopBeforeTagMenu);

    await page.locator('.submit-tag-picker-menu:not([hidden]) [data-tag-suggestion="Horror"]').click();
    tagAndLinkState = await page.evaluate(() => ({
      selectedTags: Array.from(document.querySelectorAll(".submit-tag-picker-values .submit-chip")).map((node) =>
        node.textContent?.replace("×", "").trim(),
      ),
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      completionTop: (() => {
        const field = document.getElementById("submitCompletionStatus");
        if (!field) {
          return 0;
        }
        const rect = field.getBoundingClientRect();
        return rect.top + window.scrollY;
      })(),
    }));
    assert.deepEqual(tagAndLinkState.selectedTags, ["Horror"]);
    assert.equal(tagAndLinkState.tagMenuOpen, false);
    assert.equal(tagAndLinkState.completionTop > 0, true);

    await page.locator("#submitTagInput").fill("ghost story");
    await page.locator(".submit-tag-picker-menu:not([hidden])").waitFor();
    await page.locator("#submitTagInput").press("Enter");
    tagAndLinkState = await page.evaluate(() => ({
      selectedTags: Array.from(document.querySelectorAll(".submit-tag-picker-values .submit-chip")).map((node) =>
        node.textContent?.replace("×", "").trim(),
      ),
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      tagInputValue: document.getElementById("submitTagInput")?.value || "",
      completionTop: (() => {
        const field = document.getElementById("submitCompletionStatus");
        if (!field) {
          return 0;
        }
        const rect = field.getBoundingClientRect();
        return rect.top + window.scrollY;
      })(),
    }));
    assert.deepEqual(tagAndLinkState.selectedTags, ["Horror", "Ghost Story"]);
    assert.equal(tagAndLinkState.tagMenuOpen, false);
    assert.equal(tagAndLinkState.tagInputValue, "");

    for (const tag of ["Sci-fi", "Full-cast", "Mystery", "Serialized", "Thriller", "Comedy"]) {
      await page.locator("[data-toggle-tag-picker]").click();
      await page.locator(".submit-tag-picker-menu:not([hidden])").waitFor();
      await page.locator(`.submit-tag-picker-menu:not([hidden]) [data-tag-suggestion="${tag}"]`).click();
    }

    tagAndLinkState = await page.evaluate(() => ({
      selectedTags: Array.from(document.querySelectorAll(".submit-tag-picker-values .submit-chip")).map((node) =>
        node.textContent?.replace("×", "").trim(),
      ),
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      tagInputDisabled: Boolean(document.getElementById("submitTagInput")?.hasAttribute("disabled")),
      tagToggleDisabled: Boolean(document.querySelector("[data-toggle-tag-picker]")?.hasAttribute("disabled")),
      tagLimitMessage: document.querySelector(".submit-tag-limit")?.textContent?.trim() || "",
    }));
    assert.equal(tagAndLinkState.selectedTags.length, 8);
    assert.equal(tagAndLinkState.tagMenuOpen, false);
    assert.equal(tagAndLinkState.tagInputDisabled, true);
    assert.equal(tagAndLinkState.tagToggleDisabled, true);
    assert.match(tagAndLinkState.tagLimitMessage, /Tag limit reached \(8\/8\)/);

    await page.locator('[data-add-link-option="listenLinks"][data-add-link-value="Apple Podcasts"]').click();
    tagAndLinkState = await page.evaluate(() => ({
      badgeLabels: Array.from(document.querySelectorAll(".submit-link-source-text")).map((node) => node.textContent?.trim()),
      selectValues: Array.from(document.querySelectorAll('[data-link-list="listenLinks"][data-link-part="label"]')).map((node) => node.value),
      removeIconSize: {
        width: window.getComputedStyle(document.querySelector(".submit-link-remove svg")).width,
        height: window.getComputedStyle(document.querySelector(".submit-link-remove svg")).height,
      },
      emptyStateVisible: Boolean(document.querySelector(".submit-link-list-empty")),
    }));
    assert.equal(tagAndLinkState.emptyStateVisible, false);
    assert.equal(tagAndLinkState.badgeLabels[0], "Apple Podcasts");
    assert.equal(tagAndLinkState.selectValues[0], "Apple Podcasts");
    assert.equal(tagAndLinkState.removeIconSize.width, "16px");
    assert.equal(tagAndLinkState.removeIconSize.height, "16px");

    await page.locator('[data-add-link-option="listenLinks"][data-add-link-value="RSS Feed"]').click();
    tagAndLinkState = await page.evaluate(() => ({
      selectValues: Array.from(document.querySelectorAll('[data-link-list="listenLinks"][data-link-part="label"]')).map((node) => node.value),
      addLinkOptionCount: document.querySelectorAll('[data-add-link-option="listenLinks"]').length,
    }));
    assert.deepEqual(tagAndLinkState.selectValues, ["Apple Podcasts", "RSS Feed"]);
    assert.equal(tagAndLinkState.addLinkOptionCount, 6);

    await page.locator('[data-submission-mode="listener-review"]').click();
    await page.locator("#submitReviewText").waitFor();
    let formState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      reviewFieldVisible: Boolean(document.getElementById("submitReviewText")),
      proofFieldVisible: Boolean(document.getElementById("submitProofUrl")),
    }));
    assert.equal(formState.submissionType, "listener-review");
    assert.equal(formState.reviewFieldVisible, true);
    assert.equal(formState.proofFieldVisible, false);

    await page.locator('[data-submission-mode="creator-verification"]').click();
    await page.locator("#submitProofUrl").waitFor();
    await page.getByRole("button", { name: "Add another link" }).click();
    formState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      reviewFieldVisible: Boolean(document.getElementById("submitReviewText")),
      proofFieldVisible: Boolean(document.getElementById("submitProofUrl")),
      officialLinkRows: document.querySelectorAll('[data-link-list="officialLinks"][data-link-part="url"]').length,
    }));
    assert.equal(formState.submissionType, "creator-verification");
    assert.equal(formState.reviewFieldVisible, false);
    assert.equal(formState.proofFieldVisible, true);
    assert.equal(formState.officialLinkRows, 2);

    await page.locator('[data-submission-mode="correction"]').click();
    await page.locator("#submitExistingShowSearch").fill("Impact");
    await page.locator('[data-show-option-id="impact-winter"]').click();
    formState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      existingShowId: document.getElementById("existingShowId")?.value || "",
      showSearch: document.getElementById("submitExistingShowSearch")?.value || "",
    }));
    assert.equal(formState.submissionType, "correction");
    assert.equal(formState.existingShowId, "impact-winter");
    assert.equal(formState.showSearch, "Impact Winter");

    await page.goto(`${baseUrl}/submit.html?submissionType=listener-review&showId=impact-winter`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(
      () => {
        const submissionType = document.getElementById("submissionType");
        const existingShowId = document.getElementById("existingShowId");
        return Boolean(
          submissionType instanceof HTMLInputElement &&
            existingShowId instanceof HTMLInputElement &&
            submissionType.value === "listener-review" &&
            existingShowId.value === "impact-winter",
        );
      },
      undefined,
      { timeout: 5_000 },
    );

    const deepLinkState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      existingShowId: document.getElementById("existingShowId")?.value || "",
      showSearch: document.getElementById("submitExistingShowSearch")?.value || "",
      reviewFieldVisible: Boolean(document.getElementById("submitReviewText")),
      ratingButtons: document.querySelectorAll("[data-rating-stars]").length,
    }));
    assert.equal(deepLinkState.submissionType, "listener-review");
    assert.equal(deepLinkState.existingShowId, "impact-winter");
    assert.equal(deepLinkState.showSearch, "Impact Winter");
    assert.equal(deepLinkState.reviewFieldVisible, true);
    assert.equal(deepLinkState.ratingButtons, 5);

    await page.goto(`${baseUrl}/show.html?id=impact-winter`, { waitUntil: "networkidle" });
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    await page.locator("#userInput").fill("What does creator verified mean?");
    await page.locator("#sendMessageButton").click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#chatLog .message.bot")).some((node) =>
          /Impact Winter is marked creator verified/i.test(node.textContent || ""),
        ),
      undefined,
      { timeout: 5_000 },
    );
    chatState = await page.evaluate(() => ({
      actionHrefs: Array.from(document.querySelectorAll(".chat-action-link")).map((node) => node.getAttribute("href") || ""),
    }));
    assert.ok(chatState.actionHrefs.includes("/submit.html"));
  } finally {
    await page.close();
  }
});
