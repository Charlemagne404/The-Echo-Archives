const test = require("node:test");
const assert = require("node:assert/strict");
const { getSmokeContext, setupSmoke, teardownSmoke } = require("./helpers/browser-smoke");

let browser;
let baseUrl;
let showFixtures;
let collectionFixtures;
let firstCollectionId;

function getCollectionAggregateValue(collection, catalogById, selector) {
  const values = (collection.showIds || [])
    .map((showId) => catalogById.get(showId))
    .filter(Boolean)
    .map((show) => selector(show))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getExpectedCollectionOrder(sortMode, collections, shows) {
  const catalogById = new Map(shows.map((show) => [show.id, show]));
  return [...collections]
    .sort((left, right) => {
      if (sortMode === "newest") {
        return String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")) || left.order - right.order;
      }
      if (sortMode === "rating") {
        return (
          getCollectionAggregateValue(right, catalogById, (show) => show.finalRating) -
            getCollectionAggregateValue(left, catalogById, (show) => show.finalRating) ||
          left.order - right.order ||
          left.title.localeCompare(right.title)
        );
      }
      if (sortMode === "popularity") {
        return (
          getCollectionAggregateValue(right, catalogById, (show) => show.popularity?.score) -
            getCollectionAggregateValue(left, catalogById, (show) => show.popularity?.score) ||
          left.order - right.order ||
          left.title.localeCompare(right.title)
        );
      }

      return left.order - right.order || left.title.localeCompare(right.title);
    })
    .map((collection) => collection.id);
}

async function ensureFilterMenuOpen(page) {
  const isOpen = await page.evaluate(() => {
    const dropdown = document.getElementById("filterDropdown");
    return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
  });

  if (isOpen) {
    return;
  }

  await page.locator("#filterToggle").click();
  await page.waitForFunction(() => {
    const dropdown = document.getElementById("filterDropdown");
    return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
  });
}

async function openFilterBucket(page, bucketId) {
  await ensureFilterMenuOpen(page);
  await page.locator(`#filterDropdown [data-filter-bucket-id="${bucketId}"]`).click();
  await page.waitForFunction(
    (currentBucketId) => {
      const detail = document.querySelector("#filterDropdown .filter-menu-detail");
      return Boolean(detail && detail.dataset.filterBucket === currentBucketId);
    },
    bucketId,
  );
}

test.before(async () => {
  await setupSmoke();
  ({ browser, baseUrl, showFixtures, collectionFixtures, firstCollectionId } = getSmokeContext());
});

test.after(async () => {
  await teardownSmoke();
});

test("home browse keeps shareable state, restores scroll, highlights typo-tolerant matches, and falls back broken images", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#podcast-grid .podcast-card-shell").length > 0);

    const homeSurfaceState = await page.evaluate(() => ({
      creatorSpotlightExists: Boolean(document.getElementById("homeCreatorSpotlight")),
      recentlyAddedHidden: document.getElementById("recentlyAdded")?.hidden ?? false,
      recentlyAddedEmptyHidden: document.getElementById("recentlyAddedEmptyState")?.hidden ?? false,
      skeletonCount: document.querySelectorAll("#podcast-grid .archive-skeleton-card").length,
    }));
    assert.equal(homeSurfaceState.creatorSpotlightExists, false);
    assert.equal(homeSurfaceState.recentlyAddedHidden, true);
    assert.equal(homeSurfaceState.recentlyAddedEmptyHidden, true);
    assert.equal(homeSurfaceState.skeletonCount, 0);

    const fallbackState = await page.evaluate(() => {
      const image = document.querySelector("#recentlyAddedGrid img") || document.querySelector("#podcast-grid img");
      if (!(image instanceof HTMLImageElement)) {
        return null;
      }

      image.src = "/images/missing-cover.png";
      image.dispatchEvent(new Event("error"));
      return {
        applied: image.dataset.imageFallbackApplied === "true",
        attributeSrc: image.getAttribute("src") || "",
        currentSrc: image.currentSrc,
      };
    });
    assert.equal(fallbackState?.applied, true);
    assert.equal(fallbackState?.attributeSrc, "/images/TEA-Logo-S.png");

    await page.locator("#search").fill("derelct");
    await page.waitForFunction(
      () =>
        (document.querySelector("#resultsSummary")?.textContent || "").includes('results for "derelct"') &&
        document.querySelector("#podcast-grid .podcast-card h2")?.textContent?.includes("Derelict"),
    );

    await openFilterBucket(page, "storyType");
    await page.locator('.filter-option[data-filter-group="genres"][data-filter-value="sci-fi"]').click();
    await page.waitForFunction(() => document.getElementById("filterCount")?.textContent?.trim() === "1");
    await page.getByRole("button", { name: "Recently updated" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('.browse-mode-button[data-browse-mode="recently-updated"]')?.getAttribute("aria-pressed") === "true" &&
        document.querySelector("#podcast-grid .podcast-card h2 mark"),
    );

    const stateBeforeNavigate = await page.evaluate(() => {
      const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const scrollTarget = Math.min(960, maxScrollTop);
      window.scrollTo({ top: scrollTarget, behavior: "auto" });
      return {
        url: window.location.href,
        scrollTarget,
      };
    });
    await page.waitForFunction((scrollTarget) => window.scrollY >= Math.max(0, scrollTarget - 8), stateBeforeNavigate.scrollTarget);

    await page.locator("#podcast-grid .podcast-card").first().click();
    await page.waitForURL(/\/show\?id=/);
    await page.goBack({ waitUntil: "networkidle" });

    await page.waitForFunction(
      (scrollTarget) =>
        (document.getElementById("search")?.value || "") === "derelct" &&
        document.getElementById("filterCount")?.textContent?.trim() === "1" &&
        document.querySelector('.browse-mode-button[data-browse-mode="recently-updated"]')?.getAttribute("aria-pressed") === "true" &&
        window.scrollY >= Math.max(0, scrollTarget - 8),
      stateBeforeNavigate.scrollTarget,
      { timeout: 5_000 },
    );

    const restoredState = await page.evaluate(() => ({
      url: window.location.href,
      scrollY: window.scrollY,
      title: document.querySelector("#podcast-grid .podcast-card h2")?.textContent?.trim() || "",
      hasHighlight: Boolean(document.querySelector("#podcast-grid .podcast-card h2 mark")),
    }));

    assert.match(restoredState.url, /q=derelct/);
    assert.match(restoredState.url, /genre=sci-fi/);
    assert.match(restoredState.url, /sort=recently-updated/);
    assert.equal(restoredState.url, stateBeforeNavigate.url);
    assert.ok(restoredState.scrollY >= Math.max(0, stateBeforeNavigate.scrollTarget - 8));
    assert.equal(restoredState.title, "Derelict");
    assert.equal(restoredState.hasHighlight, true);
  } finally {
    await page.close();
  }
});

test("collections page supports newest, rating, and popularity sorting", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const expectedNewestOrder = getExpectedCollectionOrder("newest", collectionFixtures, showFixtures).slice(0, 6);
  const expectedRatingOrder = getExpectedCollectionOrder("rating", collectionFixtures, showFixtures).slice(0, 6);
  const expectedPopularityOrder = getExpectedCollectionOrder("popularity", collectionFixtures, showFixtures).slice(0, 6);

  try {
    await page.goto(`${baseUrl}/collections`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll("#collectionsDirectory .collections-directory-card").length > 0);

    await page.locator("#collectionsSort").selectOption("newest");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("sort") === "newest");
    const newestOrder = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#collectionsDirectory .collections-directory-card")).map((node) => node.dataset.collectionId || "").slice(0, 6),
    );
    assert.deepEqual(newestOrder, expectedNewestOrder);

    await page.locator("#collectionsSort").selectOption("rating");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("sort") === "rating");
    const ratingOrder = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#collectionsDirectory .collections-directory-card")).map((node) => node.dataset.collectionId || "").slice(0, 6),
    );
    assert.deepEqual(ratingOrder, expectedRatingOrder);

    await page.locator("#collectionsSort").selectOption("popularity");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("sort") === "popularity");
    const popularityOrder = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#collectionsDirectory .collections-directory-card")).map((node) => node.dataset.collectionId || "").slice(0, 6),
    );
    assert.deepEqual(popularityOrder, expectedPopularityOrder);
  } finally {
    await page.close();
  }
});

test("show and collection pages expose honest empty states and working copy-link actions", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/show?id=solar`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(document.querySelector(".detail-listener-reviews-section")));
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__copiedValue = value;
          },
        },
      });
    });
    await page.locator("[data-copy-link]").click();
    await page.waitForFunction(() => document.querySelector("[data-copy-link-status]")?.textContent?.includes("copied"));

    const showState = await page.evaluate(() => ({
      copiedValue: window.__copiedValue || "",
      emptyCopy: document.querySelector(".detail-reviews-empty-state")?.textContent || "",
      reviewHref: document.querySelector('.detail-reviews-empty-state a[href*="submissionType=listener-review"]')?.getAttribute("href") || "",
    }));
    assert.equal(showState.copiedValue, `${baseUrl}/show?id=solar`);
    assert.match(showState.emptyCopy, /No listener reviews are published/i);
    assert.equal(showState.reviewHref, "/submit?submissionType=listener-review&showId=solar");

    await page.goto(`${baseUrl}/collection?id=${encodeURIComponent(firstCollectionId)}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(document.getElementById("collectionCopyLink")));
    await page.evaluate(() => {
      delete navigator.clipboard;
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: (command) => {
          window.__legacyCommand = command;
          return true;
        },
      });
    });
    await page.locator("#collectionCopyLink").click();
    await page.waitForFunction(() => document.querySelector("[data-copy-link-status]")?.textContent?.includes("copied"));

    const collectionState = await page.evaluate(() => ({
      legacyCommand: window.__legacyCommand || "",
      status: document.querySelector("[data-copy-link-status]")?.textContent?.trim() || "",
    }));

    assert.equal(collectionState.legacyCommand, "copy");
    assert.match(collectionState.status, /Link copied/i);
  } finally {
    await page.close();
  }
});
