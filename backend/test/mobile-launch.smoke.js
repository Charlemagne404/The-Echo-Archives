const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSmokeContext,
  setupSmoke,
  teardownSmoke,
} = require("./helpers/browser-smoke");

let browser;
let baseUrl;

test.before(async () => {
  await setupSmoke();
  ({ browser, baseUrl } = getSmokeContext());
});

test.after(async () => {
  await teardownSmoke();
});

async function waitForSettledLayout(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  });
}

async function readRootOverflowState(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const rootScrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const offenders = Array.from(document.body.querySelectorAll("*"))
      .filter((node) => {
        if (!(node instanceof HTMLElement) || node.hidden) {
          return false;
        }
        const styles = window.getComputedStyle(node);
        if (styles.display === "none" || styles.visibility === "hidden" || styles.position === "fixed") {
          return false;
        }
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
      })
      .slice(0, 5)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          selector: `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${node.classList.length ? `.${Array.from(node.classList).slice(0, 2).join(".")}` : ""}`,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      });

    return {
      viewportWidth,
      rootScrollWidth,
      bodyScrollWidth,
      offenders,
    };
  });
}

function assertNoRootOverflow(state, context) {
  assert.ok(
    state.rootScrollWidth <= state.viewportWidth + 1 && state.bodyScrollWidth <= state.viewportWidth + 1,
    `${context} overflowed: ${JSON.stringify(state)}`,
  );
}

async function readControlMetrics(page, selectors) {
  return page.evaluate((currentSelectors) =>
    currentSelectors.map(({ selector, requireFontSize = false }) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) {
        return { selector, missing: true };
      }
      const rect = node.getBoundingClientRect();
      const styles = window.getComputedStyle(node);
      return {
        selector,
        missing: false,
        visible: rect.width > 0 && rect.height > 0 && styles.display !== "none" && styles.visibility !== "hidden",
        width: rect.width,
        height: rect.height,
        fontSize: requireFontSize ? Number.parseFloat(styles.fontSize) || 0 : null,
      };
    }), selectors);
}

function assertMobileControlMetrics(metrics, context) {
  metrics.forEach((metric) => {
    assert.equal(metric.missing, false, `${context}: ${metric.selector} should exist.`);
    assert.equal(metric.visible, true, `${context}: ${metric.selector} should be visible.`);
    assert.ok(
      metric.width >= 43.5 && metric.height >= 43.5,
      `${context}: ${metric.selector} should expose a 44x44px touch area, received ${metric.width}x${metric.height}.`,
    );
    if (metric.fontSize !== null) {
      assert.ok(metric.fontSize >= 16, `${context}: ${metric.selector} should use at least 16px text, received ${metric.fontSize}px.`);
    }
  });
}

test("mobile launch viewport matrix keeps discovery and creator layouts inside the root viewport", { timeout: 90_000 }, async () => {
  const page = await browser.newPage({ hasTouch: true });
  const checks = [
    { width: 320, height: 568, routes: ["/"] },
    { width: 360, height: 800, routes: ["/"] },
    { width: 390, height: 844, routes: ["/", "/for-creators"] },
    { width: 430, height: 932, routes: ["/"] },
    { width: 568, height: 320, routes: ["/"] },
    { width: 667, height: 375, routes: ["/", "/for-creators"] },
    { width: 844, height: 390, routes: ["/", "/for-creators"] },
    { width: 932, height: 430, routes: ["/", "/for-creators"] },
    { width: 768, height: 1024, routes: ["/", "/for-creators"] },
    { width: 820, height: 1180, routes: ["/", "/for-creators"] },
    { width: 1024, height: 768, routes: ["/", "/for-creators"] },
    { width: 1280, height: 720, routes: ["/"] },
    { width: 1440, height: 900, routes: ["/"] },
  ];

  try {
    for (const check of checks) {
      await page.setViewportSize({ width: check.width, height: check.height });
      for (const route of check.routes) {
        await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
        await page.waitForFunction(
          (currentRoute) => currentRoute === "/"
            ? document.querySelectorAll("#podcast-grid .podcast-card-shell").length > 0
            : document.querySelectorAll(".creator-stat-card").length > 0,
          route,
          { timeout: 5_000 },
        );
        await waitForSettledLayout(page);

        const overflowState = await readRootOverflowState(page);
        assertNoRootOverflow(overflowState, `${route} at ${check.width}x${check.height}`);

        if (route === "/") {
          const toggleDisplay = await page.locator("#siteNavToggle").evaluate((node) => window.getComputedStyle(node).display);
          assert.equal(
            toggleDisplay !== "none",
            check.width < 960,
            `Navigation mode should match the 960px compact breakpoint at ${check.width}x${check.height}.`,
          );
        }
      }
    }
  } finally {
    await page.close();
  }
});

test("short-height filter sheet stays contained, modal, inert, and focus trapped", { timeout: 45_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 420 }, hasTouch: true });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#filterToggle").click();
    await page.waitForFunction(() => document.getElementById("filterDropdown")?.dataset.state === "open");

    const openState = await page.evaluate(() => {
      const dialog = document.getElementById("filterDropdown");
      const rect = dialog?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      return {
        role: dialog?.getAttribute("role") || "",
        ariaModal: dialog?.getAttribute("aria-modal") || "",
        bodyLocked: document.body.classList.contains("filter-sheet-open"),
        mainInert: document.querySelector("main")?.inert || false,
        focusInside: Boolean(dialog?.contains(document.activeElement)),
        closeFocused: document.activeElement?.classList.contains("filter-sheet-close") || false,
        contained: Boolean(
          rect &&
          rect.top >= viewportTop - 1 &&
          rect.left >= viewportLeft - 1 &&
          rect.right <= viewportLeft + viewportWidth + 1 &&
          rect.bottom <= viewportTop + viewportHeight + 1
        ),
        scrollable: Boolean(dialog && dialog.scrollHeight <= dialog.clientHeight + 1) ||
          window.getComputedStyle(document.querySelector("#filterDropdown .filter-option-grid") || document.body).overflowY === "auto",
      };
    });

    assert.equal(openState.role, "dialog");
    assert.equal(openState.ariaModal, "true");
    assert.equal(openState.bodyLocked, true);
    assert.equal(openState.mainInert, true);
    assert.equal(openState.focusInside, true);
    assert.equal(openState.closeFocused, true);
    assert.equal(openState.contained, true);
    assert.equal(openState.scrollable, true);

    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator("#filterDropdown").evaluate((dialog) => dialog.contains(document.activeElement)), true);

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.getElementById("filterDropdown")?.hidden === true && document.activeElement?.id === "filterToggle",
    );
    assert.equal(await page.locator("main").evaluate((main) => main.inert), false);
  } finally {
    await page.close();
  }
});

test("keyboard-height chat remains usable and contained while the background is locked", { timeout: 45_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 420 }, hasTouch: true });

  try {
    await page.goto(`${baseUrl}/privacy`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo({ top: 240, behavior: "auto" }));
    await page.waitForFunction(() => {
      const toggle = document.getElementById("chat-toggle");
      return Boolean(toggle && window.getComputedStyle(toggle).visibility === "visible");
    });
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "userInput");

    const chatState = await page.evaluate(() => {
      const chat = document.getElementById("chat-container");
      const input = document.getElementById("userInput");
      const log = document.getElementById("chatLog");
      const chatRect = chat?.getBoundingClientRect();
      const inputRect = input?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      return {
        bodyLocked: document.body.classList.contains("chat-panel-open"),
        mainInert: document.querySelector("main")?.inert || false,
        inputFocused: document.activeElement === input,
        inputFontSize: input ? Number.parseFloat(window.getComputedStyle(input).fontSize) || 0 : 0,
        logHeight: log?.clientHeight || 0,
        chatContained: Boolean(
          chatRect &&
          chatRect.top >= viewportTop - 1 &&
          chatRect.left >= viewportLeft - 1 &&
          chatRect.right <= viewportLeft + viewportWidth + 1 &&
          chatRect.bottom <= viewportTop + viewportHeight + 1
        ),
        inputContained: Boolean(
          inputRect &&
          inputRect.top >= viewportTop - 1 &&
          inputRect.bottom <= viewportTop + viewportHeight + 1
        ),
      };
    });

    assert.equal(chatState.bodyLocked, true);
    assert.equal(chatState.mainInert, true);
    assert.equal(chatState.inputFocused, true);
    assert.ok(chatState.inputFontSize >= 16);
    assert.ok(chatState.logHeight >= 44, `Chat log should retain usable height, received ${chatState.logHeight}px.`);
    assert.equal(chatState.chatContained, true);
    assert.equal(chatState.inputContained, true);

    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });
    assert.equal(await page.locator("main").evaluate((main) => main.inert), false);
  } finally {
    await page.close();
  }
});

test("mobile discovery, collection, and submit controls meet input and touch sizing floors", { timeout: 60_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.getElementById("search")?.disabled);
    assertMobileControlMetrics(
      await readControlMetrics(page, [
        { selector: "#search", requireFontSize: true },
        { selector: "#filterToggle" },
        { selector: "#siteNavToggle" },
        { selector: "#browseModes .browse-mode-button" },
        { selector: "#quickFilters .quick-filter" },
      ]),
      "Homepage",
    );

    await page.goto(`${baseUrl}/collections`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#collectionsDirectory .collections-directory-card").length > 0);
    assertMobileControlMetrics(
      await readControlMetrics(page, [
        { selector: "#collectionsSearch", requireFontSize: true },
        { selector: "#collectionsSort" },
        { selector: "#collectionsMoodChips .collections-mood-chip" },
      ]),
      "Collections",
    );

    await page.goto(`${baseUrl}/submit`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(document.getElementById("submitShowTitle")));
    assertMobileControlMetrics(
      await readControlMetrics(page, [
        { selector: "#submitShowTitle", requireFontSize: true },
        { selector: "#submitModeCards .submit-mode-card" },
        { selector: ".submit-tag-picker-toggle" },
        { selector: "#submitPrimaryButton" },
      ]),
      "Submit",
    );
  } finally {
    await page.close();
  }
});

test("mobile sticky search prioritizes typing space and stays out of the way while browsing down", { timeout: 45_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.getElementById("search")?.disabled);
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 2, behavior: "auto" }));
    await page.waitForFunction(() => document.getElementById("stickyBrowseBar")?.dataset.visibility === "hidden");

    await page.evaluate(() => window.scrollBy({ top: -280, behavior: "auto" }));
    await page.waitForFunction(
      () =>
        document.getElementById("stickyBrowseBar")?.dataset.visibility === "visible" &&
        document.getElementById("stickyBrowseBar")?.dataset.mode === "expanded",
    );

    const stickyState = await page.evaluate(() => {
      const search = document.getElementById("stickySearch");
      const filter = document.getElementById("stickyFilterToggle");
      const toggle = document.getElementById("stickySearchToggle");
      const searchRect = search?.getBoundingClientRect();
      const filterRect = filter?.getBoundingClientRect();
      return {
        searchWidth: searchRect?.width || 0,
        filterWidth: filterRect?.width || 0,
        filterHeight: filterRect?.height || 0,
        toggleDisplay: toggle ? window.getComputedStyle(toggle).display : "",
        searchTabIndex: search?.getAttribute("tabindex"),
      };
    });

    assert.ok(stickyState.searchWidth >= 250, `Expected at least 250px of sticky search width, received ${stickyState.searchWidth}px.`);
    assert.ok(stickyState.filterWidth >= 44 && stickyState.filterHeight >= 44);
    assert.equal(stickyState.toggleDisplay, "none");
    assert.equal(stickyState.searchTabIndex, null);

    await page.locator("#stickySearch").fill("midnight");
    await page.evaluate(() => window.scrollBy({ top: 280, behavior: "auto" }));
    await page.waitForFunction(
      () =>
        document.getElementById("stickyBrowseBar")?.dataset.visibility === "visible" &&
        document.getElementById("stickySearch")?.value === "midnight",
    );
  } finally {
    await page.close();
  }
});

test("reduced motion disables continuous and nonessential animation", { timeout: 30_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const motionState = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "archive-skeleton-block";
      probe.style.animation = "scale-up4 1s linear infinite";
      probe.style.transition = "transform 1s ease 250ms";
      document.body.append(probe);
      const styles = window.getComputedStyle(probe);
      const pseudoStyles = window.getComputedStyle(probe, "::after");
      const state = {
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        scrollBehavior: window.getComputedStyle(document.documentElement).scrollBehavior,
        animationDuration: Number.parseFloat(styles.animationDuration) || 0,
        animationIterationCount: styles.animationIterationCount,
        transitionDuration: Number.parseFloat(styles.transitionDuration) || 0,
        transitionDelay: Number.parseFloat(styles.transitionDelay) || 0,
        skeletonAnimationName: pseudoStyles.animationName,
      };
      probe.remove();
      return state;
    });

    assert.equal(motionState.reducedMotion, true);
    assert.equal(motionState.scrollBehavior, "auto");
    assert.ok(motionState.animationDuration <= 0.001);
    assert.equal(motionState.animationIterationCount, "1");
    assert.ok(motionState.transitionDuration <= 0.001);
    assert.equal(motionState.transitionDelay, 0);
    assert.equal(motionState.skeletonAnimationName, "none");
  } finally {
    await page.close();
  }
});

test("default submit and static mobile pages stay within launch CLS budgets", { timeout: 60_000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const searchIndexRequests = [];

  await page.addInitScript(() => {
    window.__echoMobileLayoutShiftScore = 0;
    window.__echoMobileLayoutShiftSupported =
      "PerformanceObserver" in window && PerformanceObserver.supportedEntryTypes.includes("layout-shift");
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) {
            window.__echoMobileLayoutShiftScore += entry.value;
          }
        });
      });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch (_error) {
      // The Chromium smoke runtime supports Layout Instability; keep unsupported engines deterministic.
    }
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/data/search-index.json") {
      searchIndexRequests.push(request.url());
    }
  });

  async function readLayoutShift(pathname, ready, budget) {
    await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
    await page.waitForFunction(ready, undefined, { timeout: 5_000 });
    await waitForSettledLayout(page);
    const { score, supported } = await page.evaluate(() => ({
      score: window.__echoMobileLayoutShiftScore || 0,
      supported: window.__echoMobileLayoutShiftSupported || false,
    }));
    assert.equal(supported, true, "The smoke browser must support Layout Instability metrics.");
    assert.ok(score <= budget, `${pathname} CLS ${score.toFixed(4)} exceeded the ${budget.toFixed(2)} budget.`);
    return score;
  }

  try {
    await readLayoutShift("/submit", () => Boolean(document.getElementById("submitShowTitle")), 0.1);
    assert.deepEqual(searchIndexRequests, [], "The default new-show form must not request the full search index.");
    await readLayoutShift("/privacy", () => Boolean(document.querySelector(".info-document-layout")), 0.05);
    await readLayoutShift("/offline.html", () => Boolean(document.querySelector(".archive-error-main")), 0.05);
  } finally {
    await page.close();
  }
});

test("cold mobile routes stay inside responsive-image transfer and intrinsic-size budgets", { timeout: 60_000 }, async () => {
  const checks = [
    { route: "/", maxImageBytes: Math.round(1.15 * 1024 * 1024) },
    { route: "/collections", maxImageBytes: Math.round(1.01 * 1024 * 1024) },
  ];

  for (const check of checks) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      serviceWorkers: "block",
    });
    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl}${check.route}`, { waitUntil: "networkidle" });
      await waitForSettledLayout(page);
      const metrics = await page.evaluate(() => {
        const imageEntries = performance.getEntriesByType("resource").filter((entry) => {
          const pathname = new URL(entry.name).pathname;
          return entry.initiatorType === "img" || /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(pathname);
        });
        const unreservedImages = Array.from(document.images)
          .filter((image) => !image.hasAttribute("width") || !image.hasAttribute("height"))
          .map((image) => image.currentSrc || image.src);

        return {
          imageBytes: imageEntries.reduce((total, entry) => total + (entry.encodedBodySize || 0), 0),
          generatedCoverCount: imageEntries.filter((entry) => entry.name.includes("/images/generated/covers/")).length,
          responsiveCoverCount: document.querySelectorAll('img[srcset*="/images/generated/covers/"]').length,
          unreservedImages,
        };
      });

      assert.ok(
        metrics.imageBytes <= check.maxImageBytes,
        `${check.route} transferred ${metrics.imageBytes} image bytes; expected at most ${check.maxImageBytes}.`,
      );
      assert.ok(metrics.generatedCoverCount > 0, `${check.route} should request generated cover variants.`);
      assert.ok(metrics.responsiveCoverCount > 0, `${check.route} should render responsive cover srcsets.`);
      assert.deepEqual(metrics.unreservedImages, [], `${check.route} should reserve intrinsic image space.`);
    } finally {
      await context.close();
    }
  }
});
