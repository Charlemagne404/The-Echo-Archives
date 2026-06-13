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
const showFixtures = loadCatalog(siteRoot);
const collectionFixtures = loadCollections(siteRoot, new Set(showFixtures.map((show) => show.id)));
const legacyRedirectManifest = JSON.parse(
  fs.readFileSync(path.resolve(siteRoot, "docs/archive/legacy-redirects.json"), "utf8"),
);
const basePort = 3310;
const baseUrl = `http://127.0.0.1:${basePort}`;
const firstCollectionId = collectionFixtures[0].id;
const firstShowId = showFixtures[0].id;
const homeMostPopularIds = ["midnight-burger", "were-alive", "red-valley", "derelict"];
const homeMostPopularTitles = homeMostPopularIds.map(
  (id) => showFixtures.find((show) => show.id === id)?.title || id,
);

let browser;
let serverProcess;
let tempDir;

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
      const content = panel?.querySelector(".home-card-preview-content");
      const kicker = panel?.querySelector(".home-card-preview-kicker");
      const goodFor = panel?.querySelector(".preview-good-for");
      const tags = panel?.querySelector(".preview-tags");
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

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-smoke-"));
  const dbPath = path.join(tempDir, "community.sqlite");

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
    assert.equal(layout.disabledChips, 4);
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
    assert.equal(layout.heroCommunityValue, "--");
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
    assert.equal(communityState.heroValue, "8.0/10");
    assert.equal(communityState.railValue, "8.0/10");
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
    assert.equal(communityState.heroValue, "--");
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

test("indexed-only detail page shows truthful empty states without narrow legacy layout constraints", async () => {
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
    assert.match(state.creatorValue, /Not cataloged yet/i);
    assert.match(state.linkStatus, /Links being verified/i);
    assert.match(state.firstRelease, /Not cataloged yet/i);
    assert.match(state.latestRelease, /Not cataloged yet/i);
    assert.equal(state.disabledChips, 4);
    assert.ok(state.routeCount >= 1);
  } finally {
    await page.close();
  }
});

test("homepage supports structured filtering, recently updated mode, and no-result recovery", async () => {
  const page = await browser.newPage();
  const expectedSimilarTitle = scoreCatalog(showFixtures, "like Midnight Burger")[0]?.title || "";

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Filters" }).click();
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

    await page.getByRole("button", { name: "All" }).click();
    await page.waitForFunction(
      (expectedCount) =>
        document.querySelectorAll("#podcast-grid .podcast-card-shell").length === expectedCount &&
        (document.querySelector("#search")?.value || "") === "",
      showFixtures.length,
    );
  } finally {
    await page.close();
  }
});

test("homepage most popular band renders curated cards and hides outside the default archive state", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#popularGrid .popular-card").first().waitFor();

    const defaultState = await page.evaluate((popularIds) => ({
      sectionHidden: document.getElementById("mostPopular")?.hidden ?? true,
      cardIds: Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => card.dataset.podcastId || ""),
      titles: Array.from(document.querySelectorAll("#popularGrid .popular-card-title")).map((node) => node.textContent?.trim() || ""),
      hrefs: Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => card.getAttribute("href") || ""),
      shellCount: document.querySelectorAll("#popularGrid .podcast-card-shell").length,
      previewCount: document.querySelectorAll("#popularGrid .home-card-preview, #popularGrid .home-card-preview-layer").length,
      gridCounts: popularIds.map((id) => ({
        id,
        count: document.querySelectorAll(`#podcast-grid .podcast-card-shell[data-podcast-id="${id}"]`).length,
      })),
    }), homeMostPopularIds);

    assert.equal(defaultState.sectionHidden, false);
    assert.deepEqual(defaultState.cardIds, homeMostPopularIds);
    assert.deepEqual(defaultState.titles, homeMostPopularTitles);
    assert.equal(defaultState.shellCount, 0);
    assert.equal(defaultState.previewCount, 0);
    defaultState.hrefs.forEach((href, index) => {
      assert.match(href, new RegExp(`show\\.html\\?id=${homeMostPopularIds[index]}$`));
    });
    defaultState.gridCounts.forEach(({ count }) => {
      assert.equal(count, 1);
    });

    await page.locator("#search").fill("midnight");
    await page.waitForFunction(() => document.getElementById("mostPopular")?.hidden === true);

    await page.locator("#search").fill("");
    await page.waitForFunction(() => document.getElementById("mostPopular")?.hidden === false);

    await page.getByRole("button", { name: "Filters" }).click();
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
    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });

    await page.goto(`${baseUrl}/submit.html`, { waitUntil: "networkidle" });
    await page.locator("#openSubmitArchivist").click();
    await page.locator("#chat-container.is-open").waitFor();
    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });

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
  } finally {
    await page.close();
  }
});
