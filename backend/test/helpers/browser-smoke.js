const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { chromium } = require("playwright");
const { loadCatalog, loadCollections, scoreCatalog } = require("../../lib/catalog");

const projectRoot = path.resolve(__dirname, "../..");
const siteRoot = path.resolve(projectRoot, "..");
const legacyRedirectManifest = JSON.parse(
  fs.readFileSync(path.resolve(siteRoot, "shared/config/legacy-redirects.json"), "utf8"),
);
let baseUrl;
const homeMostPopularIds = ["midnight-burger", "were-alive", "red-valley", "derelict"];

let browser;
let serverProcess;
let tempDir;
let showFixtures;
let collectionFixtures;
let firstCollectionId;
let firstShowId;
let homeMostPopularTitles;

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const portServer = net.createServer();
    portServer.once("error", reject);
    portServer.listen(0, "127.0.0.1", () => {
      const address = portServer.address();
      const port = typeof address === "object" && address ? address.port : 0;
      portServer.close(() => resolve(port));
    });
  });
}

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

function getCenteredVisibleCollectionCard(state) {
  return [...state.cards.filter((card) => card.isVisible)].sort((left, right) => left.distanceFromCenter - right.distanceFromCenter)[0];
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
    const carousel = document.getElementById("collectionCarousel");
    const prevArrow = document.getElementById("collectionPrev");
    const nextArrow = document.getElementById("collectionNext");
    const viewportRect = viewport?.getBoundingClientRect();
    const viewportCenter = viewportRect ? viewportRect.left + viewportRect.width / 2 : 0;
    const describeHitTarget = (element) => {
      if (!element) {
        return "";
      }

      const interactive = element.closest("button, a");
      if (interactive) {
        return interactive.getAttribute("aria-label") || interactive.textContent?.trim() || interactive.tagName;
      }

      return element.className || element.tagName || "";
    };
    const getArrowHitTarget = (arrow) => {
      if (!arrow) {
        return "";
      }

      const rect = arrow.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return describeHitTarget(target);
    };

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

    return {
      prevArrowHitTarget: getArrowHitTarget(prevArrow),
      nextArrowHitTarget: getArrowHitTarget(nextArrow),
      cards: Array.from(document.querySelectorAll("#collectionGrid .collection-card")).map((card, index) => {
        const rect = card.getBoundingClientRect();
        const styles = window.getComputedStyle(card);
        const transform = parseTransform(styles.transform);
        const cardCenter = rect.left + rect.width / 2;

        return {
          index,
          title: card.querySelector("h3")?.textContent?.trim() || "",
          collectionId: card.dataset.collectionId || "",
          clone: card.dataset.collectionClone === "true",
          focusValue: Number.parseFloat(card.style.getPropertyValue("--collection-focus")) || 0,
          focusWeight: Number.parseFloat(card.style.getPropertyValue("--collection-focus-weight")) || 0,
          scale: transform.scale,
          translateY: transform.translateY,
          transform: styles.transform,
          boosted: card.classList.contains("is-interaction-boosted"),
          centerWeighted: card.classList.contains("is-center-weighted"),
          isVisible: Boolean(viewportRect && rect.right > viewportRect.left && rect.left < viewportRect.right),
          distanceFromCenter: Math.abs(cardCenter - viewportCenter),
          carouselInteraction: carousel?.dataset.collectionInteraction || "",
          carouselDirection: carousel?.dataset.collectionDirection || "",
          prevArrowTransform: prevArrow ? window.getComputedStyle(prevArrow).transform : "",
          nextArrowTransform: nextArrow ? window.getComputedStyle(nextArrow).transform : "",
          prevArrowGlyphTransform: prevArrow?.querySelector("span")
            ? window.getComputedStyle(prevArrow.querySelector("span")).transform
            : "",
          nextArrowGlyphTransform: nextArrow?.querySelector("span")
            ? window.getComputedStyle(nextArrow.querySelector("span")).transform
            : "",
        };
      }),
    };
  });
}

async function getArchiveGridMotionState(page) {
  return page.evaluate(() => {
    const grid = document.getElementById("podcast-grid");
    const shells = Array.from(grid?.querySelectorAll(":scope > .podcast-card-shell") || []);
    const readDurations = (shell) =>
      typeof shell.getAnimations === "function"
        ? shell
            .getAnimations()
            .map((animation) => Number(animation.effect?.getTiming?.()?.duration || 0))
            .filter((duration) => duration > 0)
        : [];

    return {
      reason: grid?.dataset.gridMotionReason || "",
      flipDuration: Number(grid?.dataset.gridMotionFlipDuration || 0),
      enterDuration: Number(grid?.dataset.gridMotionEnterDuration || 0),
      exitDuration: Number(grid?.dataset.gridMotionExitDuration || 0),
      visibleIds: shells
        .filter((shell) => !shell.classList.contains("is-grid-exiting"))
        .map((shell) => shell.dataset.podcastId || "")
        .filter(Boolean),
      shells: shells.map((shell) => ({
        id: shell.dataset.podcastId || "",
        isEntering: shell.classList.contains("is-grid-entering"),
        isExiting: shell.classList.contains("is-grid-exiting"),
        isFlipping: shell.classList.contains("is-grid-flipping"),
        position: window.getComputedStyle(shell).position,
        transform: window.getComputedStyle(shell).transform,
        opacity: window.getComputedStyle(shell).opacity,
        animationDurations: readDurations(shell),
      })),
    };
  });
}

async function waitForMostPopularBandIds(page, expectedIds) {
  try {
    await page.waitForFunction(
      (ids) =>
        JSON.stringify(Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => card.dataset.podcastId || "")) ===
        JSON.stringify(ids),
      expectedIds,
    );
  } catch (error) {
    const actualIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#popularGrid .popular-card")).map((card) => card.dataset.podcastId || ""),
    );
    throw new Error(
      `${error.message}\nExpected popular ids: ${JSON.stringify(expectedIds)}\nActual popular ids: ${JSON.stringify(actualIds)}`,
      { cause: error },
    );
  }
}

async function setupSmoke() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-smoke-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const basePort = await findFreePort();
  baseUrl = `http://127.0.0.1:${basePort}`;
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
      COMMUNITY_RATING_WRITES_ENABLED: "false",
      HOME_CARD_HOVER_EXPAND_ENABLED: "true",
      MAINTAINER_REVIEW_PASSPHRASE: "smoke-maintainer",
      MAINTAINER_REVIEW_COOKIE_SECRET: "smoke-maintainer-secret",
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      STATIC_ROOT: siteRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(`${baseUrl}/api/health`);
  browser = await chromium.launch();
}

async function teardownSmoke() {
  await browser?.close();

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}


function getSmokeContext() {
  return {
    browser,
    baseUrl,
    showFixtures,
    collectionFixtures,
    firstCollectionId,
    firstShowId,
    homeMostPopularTitles,
    siteRoot,
    projectRoot,
  };
}

module.exports = {
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
};
