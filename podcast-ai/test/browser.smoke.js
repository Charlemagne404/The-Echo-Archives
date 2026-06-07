const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { chromium } = require("playwright");

const showFixtures = require("../../data/shows.json");
const collectionFixtures = require("../../data/collections.json");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");
const basePort = 3310;
const baseUrl = `http://127.0.0.1:${basePort}`;
const firstCollectionId = collectionFixtures[0].id;
const firstShowId = showFixtures[0].id;

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
      const below = shells[belowIndex] || null;
      const layer = shell?.querySelector(".home-card-preview-layer");
      const panel = layer?.querySelector(".home-card-preview");
      const closeButton = panel?.querySelector(".preview-close-button");
      const media = panel?.querySelector(".home-card-preview-media");
      const content = panel?.querySelector(".home-card-preview-content");
      const goodFor = panel?.querySelector(".preview-good-for");
      const tags = panel?.querySelector(".preview-tags");
      const footer = panel?.querySelector(".home-card-preview-footer");
      const openLink = panel?.querySelector(".preview-open-link");
      const shellRect = shell?.getBoundingClientRect();
      const belowRect = below?.getBoundingClientRect();
      const panelRect = panel?.getBoundingClientRect();
      const mediaRect = media?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      const sourceCard = shell?.querySelector(".podcast-card-primary");
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

test("homepage supports structured filtering, recently updated mode, and no-result recovery", async () => {
  const page = await browser.newPage();

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
  } finally {
    await page.close();
  }
});

test("homepage expanding archive card supports stable hover, keyboard, touch, and edge-safe geometry", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const shells = page.locator("#podcast-grid .podcast-card-shell");
    const cardCount = await shells.count();
    assert.ok(cardCount >= 6);

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
    assert.ok(["above", "below"].includes(middleMetrics.panelPlacement));
    assert.ok(Math.abs(middleMetrics.shellTopDoc - middleBefore.shellTopDoc) < 1);
    assert.ok(Math.abs(middleMetrics.belowTopDoc - middleBefore.belowTopDoc) < 1);
    assert.ok(middleMetrics.panelWidth > middleMetrics.shellWidth * 2.2);
    assert.ok(middleMetrics.panelLeft >= 0);
    assert.ok(middleMetrics.panelRight <= middleMetrics.viewport);
    assert.ok(middleMetrics.panelBottom <= middleMetrics.viewportHeight);
    assert.ok(middleMetrics.panelTopDoc <= middleBefore.shellTopDoc);
    assert.ok(middleMetrics.mediaRight <= middleMetrics.contentLeft);
    assert.equal(middleMetrics.panelBoundsOk, true);
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
    assert.ok(firstMetrics.panelLeft >= 0);
    assert.ok(firstMetrics.panelRight <= firstMetrics.viewport);
    assert.ok(firstMetrics.panelBottom <= firstMetrics.viewportHeight);

    await page.locator("#resultsSummary").hover();
    await page.waitForTimeout(240);
    await rightEdgeShell.locator(".podcast-card-primary").hover();
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
    assert.ok(rightMetrics.panelLeft >= 0);
    assert.ok(rightMetrics.panelRight <= rightMetrics.viewport);
    assert.ok(rightMetrics.panelBottom <= rightMetrics.viewportHeight);

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
    const touchBefore = await getOverlayMetrics(touchPage, 0, 2);
    await firstCard.tap();

    await touchPage.waitForTimeout(360);
    const touchMetrics = await getOverlayMetrics(touchPage, 0, 2);
    assert.equal(touchMetrics.overlayOpen, true);
    assert.equal(new URL(await touchPage.url()).pathname, "/");
    assert.equal(touchMetrics.panelLayout, "stack");
    assert.equal(touchMetrics.panelPlacement, "below");
    assert.ok(Math.abs(touchMetrics.shellTopDoc - touchBefore.shellTopDoc) < 1);
    assert.ok(Math.abs(touchMetrics.belowTopDoc - touchBefore.belowTopDoc) < 1);
    assert.ok(touchMetrics.panelWidth > touchMetrics.shellWidth * 1.9);
    assert.ok(touchMetrics.panelLeft >= 0);
    assert.ok(touchMetrics.panelRight <= touchMetrics.viewport);
    assert.ok(touchMetrics.panelBottom <= touchMetrics.viewportHeight);
    assert.equal(touchMetrics.panelBoundsOk, true);

    await firstShell.locator(".preview-close-button").tap();
    await touchPage.waitForTimeout(180);
    assert.equal((await getOverlayMetrics(touchPage, 0, 2)).overlayOpen, false);

    await firstCard.tap();
    await touchPage.waitForTimeout(360);
    await touchPage.touchscreen.tap(8, 8);
    await touchPage.waitForTimeout(180);
    assert.equal((await getOverlayMetrics(touchPage, 0, 2)).overlayOpen, false);

    await firstCard.tap();
    await touchPage.waitForTimeout(200);
    await firstShell.locator(".preview-open-link").tap();
    await touchPage.waitForURL(`${baseUrl}/show.html?id=*`, { timeout: 5_000 });
  } finally {
    await touchPage.close();
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
    await firstShell.locator(".podcast-card-primary").tap();
    await narrowTouchPage.waitForTimeout(360);

    const narrowMetrics = await getOverlayMetrics(narrowTouchPage, 0, 2);
    assert.equal(narrowMetrics.overlayOpen, true);
    assert.equal(narrowMetrics.panelLayout, "stack");
    assert.ok(narrowMetrics.panelWidth > narrowMetrics.shellWidth * 1.9);
    assert.ok(narrowMetrics.panelLeft >= 0);
    assert.ok(narrowMetrics.panelRight <= narrowMetrics.viewport);
    assert.ok(narrowMetrics.panelBottom <= narrowMetrics.viewportHeight);
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
    await reducedMotionPage.waitForTimeout(780);

    const reducedMetrics = await getOverlayMetrics(reducedMotionPage, 1, 7);
    assert.equal(reducedMetrics.overlayOpen, true);
    assert.equal(reducedMetrics.panelTransform, "none");
    assert.equal(reducedMetrics.cardTransform, "none");
  } finally {
    await reducedMotionPage.close();
  }
});

test("homepage expanding archive card flips above and caps height when viewport space is tight", async () => {
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
    assert.equal(metrics.panelPlacement, "above");
    assert.ok(metrics.panelTop >= 0);
    assert.ok(metrics.panelBottom <= metrics.viewportHeight + 2);
    assert.ok(metrics.panelScrollHeight >= metrics.panelClientHeight);

    if (metrics.panelScrollHeight > metrics.panelClientHeight + 2) {
      await page.evaluate((index) => {
        const shells = Array.from(document.querySelectorAll("#podcast-grid .podcast-card-shell"));
        const panel = shells[index]?.querySelector(".home-card-preview");
        if (panel) {
          panel.scrollTop = panel.scrollHeight;
        }
      }, targetIndex);
      await page.waitForTimeout(80);

      const scrolledMetrics = await getOverlayMetrics(page, targetIndex, targetIndex + 6);
      assert.ok(scrolledMetrics.panelScrollTop > 0);
    }
    assert.equal(await shell.locator(".preview-open-link").isVisible(), true);
    assert.equal(await shell.locator(".preview-close-button").isVisible(), true);
  } finally {
    await page.close();
  }
});

test("Ask the Archivist and submit mode switching work without exposing empty future sections", async () => {
  const page = await browser.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });

    await page.goto(`${baseUrl}/submit.html`, { waitUntil: "networkidle" });

    await page.locator("#submissionType").selectOption("listener-review");
    await page.locator("#listenerReviewField").waitFor();
    let formState = await page.evaluate(() => ({
      listenerReviewHidden: document.getElementById("listenerReviewField")?.hidden,
      verificationSourcesHidden: document.getElementById("verificationSourcesField")?.hidden,
    }));
    assert.equal(formState.listenerReviewHidden, false);
    assert.equal(formState.verificationSourcesHidden, true);

    await page.locator("#submissionType").selectOption("creator-verification");
    await page.locator("#verificationSourcesField").waitFor();
    await page.locator("#provenanceNotesField").waitFor();
    formState = await page.evaluate(() => ({
      listenerReviewHidden: document.getElementById("listenerReviewField")?.hidden,
      verificationSourcesHidden: document.getElementById("verificationSourcesField")?.hidden,
      provenanceNotesHidden: document.getElementById("provenanceNotesField")?.hidden,
    }));
    assert.equal(formState.listenerReviewHidden, true);
    assert.equal(formState.verificationSourcesHidden, false);
    assert.equal(formState.provenanceNotesHidden, false);
  } finally {
    await page.close();
  }
});
