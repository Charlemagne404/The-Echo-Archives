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

async function clickCollectionArrow(page, selector) {
  await page.evaluate((currentSelector) => {
    document.querySelector(currentSelector)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, selector);
}

async function waitForCenteredCollection(page, expectedCollectionId, { maxDistance = 16 } = {}) {
  await page.waitForFunction(
    ({ currentExpectedCollectionId, currentMaxDistance }) => {
      const viewport = document.getElementById("collectionViewport");
      const carousel = document.getElementById("collectionCarousel");
      if (!viewport) {
        return false;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const viewportCenter = viewportRect.left + viewportRect.width / 2;
      const visibleCards = Array.from(document.querySelectorAll("#collectionGrid .collection-card")).filter((card) => {
        const rect = card.getBoundingClientRect();
        return rect.right > viewportRect.left && rect.left < viewportRect.right;
      });

      if (visibleCards.length === 0) {
        return false;
      }

      const centeredCard = visibleCards
        .map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            collectionId: card.dataset.collectionId || "",
            distanceFromCenter: Math.abs(rect.left + rect.width / 2 - viewportCenter),
          };
        })
        .sort((left, right) => left.distanceFromCenter - right.distanceFromCenter)[0];

      return (
        centeredCard.collectionId === currentExpectedCollectionId &&
        centeredCard.distanceFromCenter < currentMaxDistance &&
        !(carousel?.dataset.collectionInteraction || "")
      );
    },
    { currentExpectedCollectionId: expectedCollectionId, currentMaxDistance: maxDistance },
    { timeout: 3_000 },
  );
}

async function waitForPreviewClosed(page, sourceIndex) {
  await page.waitForFunction(
    (currentSourceIndex) => {
      const shell = document.querySelectorAll("#podcast-grid .podcast-card-shell")[currentSourceIndex];
      const layer = shell?.querySelector(".home-card-preview-layer");
      return Boolean(
        shell &&
          !shell.classList.contains("is-preview-expanded") &&
          !shell.classList.contains("is-preview-closing") &&
          !shell.classList.contains("preview-source-active") &&
          (layer?.hidden ?? true),
      );
    },
    sourceIndex,
    { timeout: 2_000 },
  );
}

test("homepage featured collections carousel applies center-weighted focus and direct hover emphasis", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#collectionGrid .collection-card").first().waitFor();
    await page.locator("#collectionCarousel").hover();
    await page.waitForTimeout(180);
    const prefersReducedMotion = await page.evaluate(() =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    const initialState = await getCollectionCarouselFocusState(page);
    const initialVisibleCards = initialState.cards.filter((card) => card.isVisible);
    assert.ok(initialVisibleCards.length >= 3);
    assert.equal(initialState.prevArrowHitTarget, "Scroll featured collections left");
    assert.equal(initialState.nextArrowHitTarget, "Scroll featured collections right");

    const nearestToCenter = [...initialVisibleCards].sort((left, right) => left.distanceFromCenter - right.distanceFromCenter)[0];
    const strongestAmbientCard = [...initialVisibleCards].sort((left, right) => right.focusValue - left.focusValue)[0];
    const weakestVisibleCard = [...initialVisibleCards].sort((left, right) => left.focusValue - right.focusValue)[0];
    const featuredCollectionIds = collectionFixtures.filter((collection) => collection.featured).map((collection) => collection.id);
    let expectedCollectionIndex = featuredCollectionIds.indexOf(nearestToCenter.collectionId);
    assert.equal(strongestAmbientCard.index, nearestToCenter.index);
    assert.ok(strongestAmbientCard.centerWeighted);
    assert.ok(strongestAmbientCard.focusValue > 0.6);
    assert.ok(strongestAmbientCard.focusWeight > weakestVisibleCard.focusWeight);
    assert.ok(strongestAmbientCard.scale - weakestVisibleCard.scale > 0.04);
    assert.notEqual(expectedCollectionIndex, -1);

    const hoverTarget =
      initialVisibleCards.find((card) => !card.clone && card.index !== nearestToCenter.index) ||
      initialVisibleCards.find((card) => !card.clone) ||
      nearestToCenter;
    await page.locator(`#collectionGrid .collection-card[data-collection-id="${hoverTarget.collectionId}"]:not([data-collection-clone])`).hover();
    await page.waitForFunction(
      (collectionId) =>
        Array.from(document.querySelectorAll("#collectionGrid .collection-card")).some(
          (card) => card.dataset.collectionId === collectionId && card.classList.contains("is-interaction-boosted"),
        ),
      hoverTarget.collectionId,
      { timeout: 2_000 },
    );
    await page.waitForTimeout(180);

    const hoveredState = await getCollectionCarouselFocusState(page);
    const hoveredTargetState = hoveredState.cards.find(
      (card) => card.collectionId === hoverTarget.collectionId && card.boosted,
    );
    assert.ok(hoveredTargetState?.boosted);
    assert.ok((hoveredTargetState?.scale || 0) > 1.03);
    assert.ok((hoveredTargetState?.translateY || 0) < -5);

    await clickCollectionArrow(page, "#collectionNext");
    if (!prefersReducedMotion) {
      await page.waitForFunction(
        () =>
          document.getElementById("collectionCarousel")?.dataset.collectionInteraction === "active" &&
          document.getElementById("collectionCarousel")?.dataset.collectionDirection === "next",
        undefined,
        { timeout: 1_000 },
      );
    }

    const duringNextPulseState = await getCollectionCarouselFocusState(page);
    const nextPulseCards = duringNextPulseState.cards;
    const nextPulseState = nextPulseCards.find((card) => card.index === nearestToCenter.index) || nextPulseCards[0];
    if (prefersReducedMotion) {
      assert.equal(nextPulseState?.carouselInteraction, "");
      assert.equal(nextPulseState?.carouselDirection, "");
    } else {
      assert.equal(nextPulseState?.carouselInteraction, "active");
      assert.equal(nextPulseState?.carouselDirection, "next");
      assert.notEqual(nextPulseState?.nextArrowTransform, "none");
      assert.notEqual(nextPulseState?.nextArrowGlyphTransform, "none");
    }
    expectedCollectionIndex = (expectedCollectionIndex + 1) % featuredCollectionIds.length;
    await waitForCenteredCollection(page, featuredCollectionIds[expectedCollectionIndex]);

    const afterNextState = await getCollectionCarouselFocusState(page);
    const afterNextVisibleCards = afterNextState.cards.filter((card) => card.isVisible);
    const nextNearestToCenter = [...afterNextVisibleCards].sort((left, right) => left.distanceFromCenter - right.distanceFromCenter)[0];
    const nextStrongestAmbientCard = [...afterNextVisibleCards].sort((left, right) => right.focusValue - left.focusValue)[0];
    assert.equal(nextStrongestAmbientCard.index, nextNearestToCenter.index);
    assert.notEqual(nextNearestToCenter.collectionId, nearestToCenter.collectionId);
    assert.equal(nextStrongestAmbientCard.carouselInteraction, "");
    assert.equal(nextStrongestAmbientCard.carouselDirection, "");
    assert.ok(nextNearestToCenter.distanceFromCenter < 16);

    await clickCollectionArrow(page, "#collectionPrev");
    if (!prefersReducedMotion) {
      await page.waitForFunction(
        () =>
          document.getElementById("collectionCarousel")?.dataset.collectionInteraction === "active" &&
          document.getElementById("collectionCarousel")?.dataset.collectionDirection === "prev",
        undefined,
        { timeout: 1_000 },
      );
    }

    const duringPrevPulseState = await getCollectionCarouselFocusState(page);
    const prevPulseCards = duringPrevPulseState.cards;
    const prevPulseState = prevPulseCards.find((card) => card.index === nextNearestToCenter.index) || prevPulseCards[0];
    if (prefersReducedMotion) {
      assert.equal(prevPulseState?.carouselInteraction, "");
      assert.equal(prevPulseState?.carouselDirection, "");
    } else {
      assert.equal(prevPulseState?.carouselInteraction, "active");
      assert.equal(prevPulseState?.carouselDirection, "prev");
      assert.notEqual(prevPulseState?.prevArrowTransform, "none");
      assert.notEqual(prevPulseState?.prevArrowGlyphTransform, "none");
    }
    expectedCollectionIndex = (expectedCollectionIndex - 1 + featuredCollectionIds.length) % featuredCollectionIds.length;
    await waitForCenteredCollection(page, featuredCollectionIds[expectedCollectionIndex]);

    const afterPrevState = await getCollectionCarouselFocusState(page);
    const afterPrevVisibleCards = afterPrevState.cards.filter((card) => card.isVisible);
    const prevNearestToCenter = [...afterPrevVisibleCards].sort((left, right) => left.distanceFromCenter - right.distanceFromCenter)[0];
    assert.equal(prevNearestToCenter.collectionId, nearestToCenter.collectionId);
    assert.ok(prevNearestToCenter.distanceFromCenter < 16);

    for (let step = 0; step < featuredCollectionIds.length + 1; step += 1) {
      await clickCollectionArrow(page, "#collectionNext");
      expectedCollectionIndex = (expectedCollectionIndex + 1) % featuredCollectionIds.length;
      await waitForCenteredCollection(page, featuredCollectionIds[expectedCollectionIndex]);

      const wrappedNextState = await getCollectionCarouselFocusState(page);
      const wrappedNextCenteredCard = getCenteredVisibleCollectionCard(wrappedNextState);

      assert.equal(wrappedNextCenteredCard?.collectionId, featuredCollectionIds[expectedCollectionIndex]);
      assert.ok((wrappedNextCenteredCard?.distanceFromCenter || 0) < 16);
    }
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
    await page.waitForTimeout(300);
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
    await page.waitForFunction(
      () => {
        const shell = document.querySelectorAll("#podcast-grid .podcast-card-shell")[1];
        const copyBody = shell?.querySelector(".home-card-preview-copy-body");
        const footer = shell?.querySelector(".home-card-preview-footer");
        return (
          copyBody &&
          footer &&
          Number.parseFloat(window.getComputedStyle(copyBody).opacity) > 0.95 &&
          Number.parseFloat(window.getComputedStyle(footer).opacity) > 0.95
        );
      },
      undefined,
      { timeout: 2_000 },
    );
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
    await waitForPreviewClosed(page, 1);
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
    await waitForPreviewClosed(touchPage, 0);
    assert.equal((await getOverlayMetrics(touchPage, 0, 2)).overlayOpen, false);

    await firstCard.scrollIntoViewIfNeeded();
    await firstCard.tap();
    await touchPage.waitForTimeout(360);
    await touchPage.touchscreen.tap(8, 8);
    await waitForPreviewClosed(touchPage, 0);
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
    await firstCard.evaluate((node) => node.scrollIntoView({ block: "start" }));
    await touchLinkPage.waitForTimeout(300);
    await firstCard.tap();
    await touchLinkPage.waitForFunction(
      () => {
        const shell = document.querySelector("#podcast-grid .podcast-card-shell");
        const link = shell?.querySelector(".preview-open-link");
        const layer = shell?.querySelector(".home-card-preview-layer");
        if (!(link instanceof HTMLElement) || layer?.hidden || !shell?.classList.contains("is-preview-expanded")) return false;
        const rect = link.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
      },
      undefined,
      { timeout: 2_000 },
    );
    const openLinkBox = await firstShell.locator(".preview-open-link").boundingBox();
    assert.ok(openLinkBox);
    await touchLinkPage.touchscreen.tap(
      openLinkBox.x + openLinkBox.width / 2,
      openLinkBox.y + openLinkBox.height / 2,
    );
    await touchLinkPage.waitForURL(`${baseUrl}/shows/*`, { timeout: 5_000 });
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

    const reducedCollectionState = (await getCollectionCarouselFocusState(reducedMotionPage)).cards.filter((card) => card.isVisible);
    assert.ok(reducedCollectionState.length > 0);
    reducedCollectionState.forEach((card) => {
      assert.equal(card.transform, "none");
      assert.equal(card.prevArrowTransform, "none");
      assert.equal(card.nextArrowTransform, "none");
    });

    const reducedCenteredBefore = getCenteredVisibleCollectionCard(await getCollectionCarouselFocusState(reducedMotionPage));
    await clickCollectionArrow(reducedMotionPage, "#collectionNext");
    await reducedMotionPage.waitForFunction(
      (previousCollectionId) => {
        const viewport = document.getElementById("collectionViewport");
        if (!viewport) {
          return false;
        }

        const viewportRect = viewport.getBoundingClientRect();
        const viewportCenter = viewportRect.left + viewportRect.width / 2;
        const visibleCards = Array.from(document.querySelectorAll("#collectionGrid .collection-card")).filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.right > viewportRect.left && rect.left < viewportRect.right;
        });

        if (visibleCards.length === 0) {
          return false;
        }

        const centeredCard = visibleCards
          .map((card) => {
            const rect = card.getBoundingClientRect();
            return {
              collectionId: card.dataset.collectionId || "",
              distanceFromCenter: Math.abs(rect.left + rect.width / 2 - viewportCenter),
            };
          })
          .sort((left, right) => left.distanceFromCenter - right.distanceFromCenter)[0];

        return centeredCard.collectionId !== previousCollectionId;
      },
      reducedCenteredBefore?.collectionId || "",
      { timeout: 2_000 },
    );

    const reducedAfterArrow = (await getCollectionCarouselFocusState(reducedMotionPage)).cards.filter((card) => card.isVisible);
    reducedAfterArrow.forEach((card) => {
      assert.equal(card.carouselInteraction, "");
      assert.equal(card.carouselDirection, "");
      assert.equal(card.prevArrowTransform, "none");
      assert.equal(card.nextArrowTransform, "none");
    });

    await reducedMotionPage.getByRole("button", { name: "Recently updated" }).click();
    await reducedMotionPage.waitForFunction(() => /Recently updated/i.test(document.getElementById("resultsSummary")?.textContent || ""));
    const reducedGridState = await getArchiveGridMotionState(reducedMotionPage);
    assert.equal(reducedGridState.reason, "explicit");
    assert.equal(reducedGridState.flipDuration, 0);
    assert.equal(reducedGridState.enterDuration, 0);
    assert.equal(reducedGridState.exitDuration, 0);
    reducedGridState.shells.forEach((shell) => {
      assert.equal(shell.transform, "none");
      assert.equal(shell.animationDurations.length, 0);
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
