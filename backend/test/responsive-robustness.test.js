const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSmokeContext,
  gotoSmokePage,
  setupSmoke,
  teardownSmoke,
} = require("./helpers/browser-smoke");

async function settleLayout(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function readOverflowState(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const ignoredScrollableAncestor = (node) => {
      const ancestor = node.closest(".info-storage-table-wrap, .collection-carousel-viewport, .collections-mood-chips, .quick-filters, .home-hero-actions, .site-mobile-primary-nav, .info-rail-links");
      return Boolean(ancestor && ancestor.scrollWidth > ancestor.clientWidth + 1);
    };
    const hasOutOfFlowAncestor = (node) => {
      let ancestor = node.parentElement;
      while (ancestor) {
        const position = getComputedStyle(ancestor).position;
        if (position === "absolute" || position === "fixed") {
          return true;
        }
        ancestor = ancestor.parentElement;
      }
      return false;
    };

    const offenders = Array.from(document.body.querySelectorAll("*")).filter((node) => {
      if (
        !(node instanceof HTMLElement) ||
        node.hidden ||
        node.closest(".hp-field") ||
        ignoredScrollableAncestor(node) ||
        hasOutOfFlowAncestor(node)
      ) {
        return false;
      }

      const styles = getComputedStyle(node);
      if (
        styles.display === "none" ||
        styles.visibility === "hidden" ||
        styles.position === "fixed" ||
        styles.position === "absolute"
      ) {
        return false;
      }

      const rect = node.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
    }).slice(0, 5).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        selector: `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${node.classList.length ? `.${Array.from(node.classList).slice(0, 2).join(".")}` : ""}`,
        parent: `${node.parentElement?.tagName.toLowerCase() || ""}${node.parentElement?.id ? `#${node.parentElement.id}` : ""}${node.parentElement?.classList.length ? `.${Array.from(node.parentElement.classList).slice(0, 2).join(".")}` : ""}`,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      };
    });

    return {
      viewportWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders,
    };
  });
}

function assertNoOverflow(state, context) {
  assert.ok(
    state.rootScrollWidth <= state.viewportWidth + 1 && state.bodyScrollWidth <= state.viewportWidth + 1,
    `${context} created horizontal document overflow: ${JSON.stringify(state)}`,
  );
  assert.deepEqual(state.offenders, [], `${context} has out-of-bounds flow content.`);
}

async function assertFixedElementContained(page, selector, context) {
  const state = await page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const styles = getComputedStyle(node);
    return {
      display: styles.display,
      visibility: styles.visibility,
      opacity: Number.parseFloat(styles.opacity) || 0,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.visualViewport?.width || innerWidth,
      viewportHeight: window.visualViewport?.height || innerHeight,
    };
  });

  assert.notEqual(state.display, "none", `${context}: ${selector} should be rendered.`);
  assert.notEqual(state.visibility, "hidden", `${context}: ${selector} should be visible.`);
  assert.ok(state.opacity > 0, `${context}: ${selector} should be opaque enough to use.`);
  assert.ok(
    state.left >= -1 && state.right <= state.viewportWidth + 1 && state.top >= -1 && state.bottom <= state.viewportHeight + 1,
    `${context}: ${selector} escaped the visual viewport: ${JSON.stringify(state)}`,
  );
}

test("responsive robustness keeps major page families usable across awkward viewports and content", { timeout: 120_000 }, async () => {
  await setupSmoke();
  const { browser, baseUrl, firstCollectionId, firstShowId } = getSmokeContext();
  const page = await browser.newPage({ hasTouch: true });

  const allMajorRoutes = [
    "/",
    "/about",
    "/for-creators",
    "/help-center",
    "/collections",
    `/collections/${encodeURIComponent(firstCollectionId)}`,
    `/shows/${encodeURIComponent(firstShowId)}`,
    "/submit",
    "/privacy",
    "/cookies",
    "/maintainer/submissions.html",
  ];
  const checks = [
    { width: 320, height: 568, routes: allMajorRoutes },
    { width: 390, height: 420, routes: ["/", "/collections", `/shows/${encodeURIComponent(firstShowId)}`, "/submit", "/help-center"] },
    { width: 568, height: 320, routes: ["/", "/collections", `/shows/${encodeURIComponent(firstShowId)}`, "/for-creators"] },
    { width: 768, height: 1024, routes: ["/", "/collections", `/collections/${encodeURIComponent(firstCollectionId)}`, `/shows/${encodeURIComponent(firstShowId)}`, "/submit"] },
    { width: 1280, height: 720, routes: ["/", "/collections", `/shows/${encodeURIComponent(firstShowId)}`, "/help-center"] },
  ];

  try {
    for (const check of checks) {
      await page.setViewportSize({ width: check.width, height: check.height });
      for (const route of check.routes) {
        await gotoSmokePage(page, `${baseUrl}${route}`, { waitUntil: "networkidle" });
        await settleLayout(page);
        assertNoOverflow(await readOverflowState(page), `${route} at ${check.width}x${check.height}`);
      }
    }

    await page.setViewportSize({ width: 320, height: 420 });
    await gotoSmokePage(page, `${baseUrl}/collections`, { waitUntil: "networkidle" });
    await page.locator(".collections-hero-copy h1").evaluate((node) => {
      node.textContent = "An unusually long collection heading that must remain readable in a narrow archive hero";
    });
    await page.addStyleTag({ content: "html { font-size: 20px !important; }" });
    await settleLayout(page);
    const longHeadingState = await page.locator(".collections-hero-copy h1").evaluate((node) => {
      const heading = node.getBoundingClientRect();
      const panel = node.closest(".collections-hero-panel")?.getBoundingClientRect();
      return { headingRight: heading.right, panelRight: panel?.right || 0, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    });
    assert.ok(
      longHeadingState.headingRight <= longHeadingState.panelRight + 1 && longHeadingState.scrollWidth <= longHeadingState.clientWidth + 1,
      `Long public hero heading was clipped: ${JSON.stringify(longHeadingState)}`,
    );
    assertNoOverflow(await readOverflowState(page), "long collection hero heading at 320px with zoomed text");

    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("#podcast-grid .podcast-card img");

    const fullReviewBadgeState = await page.locator("#podcast-grid .editorial-badge-ribbon").first().evaluate((badge) => {
      const card = badge.closest(".podcast-card");
      const cover = card?.querySelector("img:not(.editorial-badge-artwork)");
      const badgeRect = badge.getBoundingClientRect();
      const coverRect = cover?.getBoundingClientRect();
      const label = badge.querySelector(".editorial-badge-ribbon-label");
      return {
        badgeLeft: badgeRect.left,
        badgeRight: badgeRect.right,
        badgeTop: badgeRect.top,
        badgeBottom: badgeRect.bottom,
        coverLeft: coverRect?.left || 0,
        coverRight: coverRect?.right || 0,
        coverTop: coverRect?.top || 0,
        coverBottom: coverRect?.bottom || 0,
        transform: getComputedStyle(badge).transform,
        labelWidth: label?.getBoundingClientRect().width || 0,
        labelScrollWidth: label?.scrollWidth || 0,
      };
    });
    assert.ok(
      fullReviewBadgeState.badgeLeft >= fullReviewBadgeState.coverLeft - 1 &&
        fullReviewBadgeState.badgeRight <= fullReviewBadgeState.coverRight + 1 &&
        fullReviewBadgeState.badgeTop >= fullReviewBadgeState.coverTop - 1 &&
        fullReviewBadgeState.badgeBottom <= fullReviewBadgeState.coverBottom + 1,
      `Full review badge escaped its cover bounds: ${JSON.stringify(fullReviewBadgeState)}`,
    );
    assert.equal(fullReviewBadgeState.transform, "none");
    assert.ok(fullReviewBadgeState.labelScrollWidth <= fullReviewBadgeState.labelWidth + 1);

    await page.locator("#podcast-grid .podcast-card img").first().evaluate((image) => {
      image.removeAttribute("src");
    });
    const missingImageState = await page.locator("#podcast-grid .podcast-card img").first().evaluate((image) => {
      const rect = image.getBoundingClientRect();
      return { hasSource: image.hasAttribute("src"), width: rect.width, height: rect.height };
    });
    assert.ok(
      !missingImageState.hasSource && missingImageState.width > 0 && missingImageState.height > 0,
      `A missing cover should preserve card geometry: ${JSON.stringify(missingImageState)}`,
    );
    assertNoOverflow(await readOverflowState(page), "home card with a missing cover image");

    await page.locator("#filterToggle").click();
    await page.waitForFunction(() => document.getElementById("filterDropdown")?.dataset.state === "open");
    await assertFixedElementContained(page, "#filterDropdown", "short mobile filter sheet");
    await page.keyboard.press("Escape");

    await page.locator("#siteNavToggle").click();
    await page.waitForFunction(() => document.getElementById("siteNavShell")?.dataset.state === "open");
    await page.waitForFunction(() => {
      const drawer = document.querySelector(".site-nav-drawer");
      const rect = drawer?.getBoundingClientRect();
      return (
        drawer &&
        rect &&
        Number.parseFloat(getComputedStyle(drawer).opacity) > 0.99 &&
        Math.abs(rect.right - (window.visualViewport?.width || innerWidth)) <= 1
      );
    });
    await assertFixedElementContained(page, ".site-nav-drawer", "short mobile navigation drawer");
    await page.keyboard.press("Escape");
  } finally {
    await page.close();
    await teardownSmoke();
  }
});
