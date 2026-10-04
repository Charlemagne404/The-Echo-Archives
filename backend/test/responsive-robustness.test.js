const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSmokeContext,
  gotoSmokePage,
  smokeBrowserAvailable,
  smokeBrowserExecutable,
  smokeBrowserName,
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

async function readArtworkSlots(page, surfaces) {
  return page.evaluate((surfaceDefinitions) => surfaceDefinitions.map(({ name, selector, ratio = 1 }) => {
    const slots = [...document.querySelectorAll(selector)]
      .filter((node) => node.getBoundingClientRect().width > 0)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, ratio };
      });
    return { name, slots };
  }), surfaces);
}

function assertArtworkSlots(surfaces, context) {
  for (const surface of surfaces) {
    for (const slot of surface.slots) {
      assert.ok(
        slot.width > 0 && slot.height > 0 && Math.abs(slot.width / slot.height - slot.ratio) < 0.03,
        `${surface.name} artwork slot lost its aspect ratio at ${context}: ${JSON.stringify(slot)}`,
      );
    }
  }
}

test(
  "responsive robustness keeps major page families usable across awkward viewports and content",
  {
    timeout: 120_000,
    skip: smokeBrowserAvailable
      ? undefined
      : `Playwright ${smokeBrowserName} is not installed at ${smokeBrowserExecutable}.`,
  },
  async () => {
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
    await page.waitForSelector("#podcast-grid .podcast-card > .show-card-artwork > img:not(.editorial-badge-artwork)");

    const homeArtworkSurfaces = [
      { name: "archive", selector: "#podcast-grid .podcast-card > .show-card-artwork" },
      { name: "Popular", selector: "#popularGrid .popular-card-media.show-card-artwork" },
      { name: "Recently Added", selector: "#recentlyAddedGrid .podcast-card > .show-card-artwork" },
    ];
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 720 : 844 });
      await settleLayout(page);
      const surfaces = await readArtworkSlots(page, homeArtworkSurfaces);
      assert.ok(surfaces.find(({ name }) => name === "archive")?.slots.length, `archive artwork is present at ${width}px`);
      assert.ok(surfaces.find(({ name }) => name === "Popular")?.slots.length, `Popular artwork is present at ${width}px`);
      assertArtworkSlots(surfaces, `${width}px home Browse`);

      if (width === 320) {
        const mobileSave = page.locator("#popularGrid button.library-card-quick-save").first();
        await mobileSave.waitFor({ state: "attached" });
        const saveState = await mobileSave.evaluate((button) => {
          const control = button.getBoundingClientRect();
          const card = button.closest(".popular-card-shell")?.getBoundingClientRect();
          return {
            opacity: Number.parseFloat(getComputedStyle(button).opacity) || 0,
            width: control.width,
            height: control.height,
            contained: Boolean(card && control.left >= card.left - 1 && control.right <= card.right + 1),
          };
        });
        assert.ok(saveState.opacity > 0 && saveState.width >= 40 && saveState.height >= 40 && saveState.contained,
          `touch quick-save remains visible, usable, and within the Popular card at 320px: ${JSON.stringify(saveState)}`);
      }
    }

    await page.setViewportSize({ width: 320, height: 420 });
    await gotoSmokePage(page, `${baseUrl}/shows/${encodeURIComponent(firstShowId)}`, { waitUntil: "networkidle" });
    await settleLayout(page);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 720 : 844 });
      await settleLayout(page);
      const showArtworkSurfaces = await readArtworkSlots(page, [
        { name: "similar-show recommendation", selector: ".detail-similar-card > .detail-similar-artwork", ratio: width <= 959 ? 16 / 9 : 1 },
        { name: "creator more-from recommendation", selector: ".detail-more-from .show-card-artwork" },
      ]);
      assertArtworkSlots(showArtworkSurfaces, `${width}px show recommendations`);
    }
    await page.setViewportSize({ width: 320, height: 420 });
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("#podcast-grid .podcast-card > .show-card-artwork > img:not(.editorial-badge-artwork)");

    const fullReviewBadgeState = await page.locator("#podcast-grid .editorial-badge-ribbon").first().evaluate((badge) => {
      const card = badge.closest(".podcast-card");
      const cover = card?.querySelector(".show-card-artwork > img:not(.editorial-badge-artwork)");
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

    const missingCover = page.locator("#podcast-grid .podcast-card > .show-card-artwork > img:not(.editorial-badge-artwork)").first();
    await missingCover.evaluate((image) => {
      image.removeAttribute("src");
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
    });
    const missingImageState = await missingCover.evaluate((image) => {
      const rect = image.getBoundingClientRect();
      const artwork = image.closest(".show-card-artwork")?.getBoundingClientRect();
      return {
        hasSource: image.hasAttribute("src"),
        width: rect.width,
        height: rect.height,
        artworkWidth: artwork?.width || 0,
        artworkHeight: artwork?.height || 0,
      };
    });
    assert.ok(
      !missingImageState.hasSource && missingImageState.width > 0 && missingImageState.height > 0 &&
        missingImageState.artworkWidth > 0 && missingImageState.artworkHeight > 0 &&
        Math.abs(missingImageState.artworkWidth - missingImageState.artworkHeight) <= 1,
      `A source-less cover must keep a square artwork slot: ${JSON.stringify(missingImageState)}`,
    );

    const missingBadge = page.locator("#podcast-grid .editorial-badge-artwork").first();
    assert.ok(await missingBadge.count() > 0, "the leading card includes its top-rated artwork badge");
    await missingBadge.evaluate((image) => {
      image.removeAttribute("src");
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
    });
    const missingBadgeState = await missingBadge.evaluate((image) => {
      const imageRect = image.getBoundingClientRect();
      const badgeRect = image.parentElement.getBoundingClientRect();
      return { imageWidth: imageRect.width, imageHeight: imageRect.height, badgeWidth: badgeRect.width, badgeHeight: badgeRect.height };
    });
    assert.ok(missingBadgeState.imageWidth > 0 && missingBadgeState.imageHeight > 0 && missingBadgeState.badgeHeight > 0,
      `a source-less editorial badge keeps its bookmark slot: ${JSON.stringify(missingBadgeState)}`);

    const failedCover = page.locator("#podcast-grid .podcast-card > .show-card-artwork > img:not(.editorial-badge-artwork)").nth(1);
    await failedCover.evaluate((image) => {
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.removeAttribute("src");
      image.removeAttribute("data-image-fallback-applied");
      image.dataset.imageFallbackSrc = "/images/responsive-robustness-unavailable-fallback.svg";
      image.src = "/images/responsive-robustness-missing-cover.svg";
    });
    await page.waitForFunction(() => {
      const image = document.querySelectorAll("#podcast-grid .podcast-card > .show-card-artwork > img:not(.editorial-badge-artwork)")[1];
      return image?.dataset.imageFallbackApplied === "true" && image.complete && image.src.endsWith("/images/responsive-robustness-unavailable-fallback.svg");
    });
    const failedImageState = await failedCover.evaluate((image) => {
      const imageRect = image.getBoundingClientRect();
      const artworkRect = image.closest(".show-card-artwork").getBoundingClientRect();
      return {
        loaded: image.naturalWidth > 0,
        imageWidth: imageRect.width,
        imageHeight: imageRect.height,
        artworkWidth: artworkRect.width,
        artworkHeight: artworkRect.height,
        fallbackBackground: getComputedStyle(image.closest(".show-card-artwork")).backgroundImage,
      };
    });
    assert.ok(!failedImageState.loaded && failedImageState.imageHeight > 0 && failedImageState.artworkHeight > 0 &&
      Math.abs(failedImageState.artworkWidth - failedImageState.artworkHeight) <= 1 &&
      failedImageState.fallbackBackground !== "none",
    `a failed cover and unavailable fallback retain the artwork area: ${JSON.stringify(failedImageState)}`);
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
  },
);
