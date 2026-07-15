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

async function ensureFilterMenuOpen(page, { dropdownId = "filterDropdown", toggleSelector = "#filterToggle" } = {}) {
  const isOpen = await page.evaluate((id) => {
    const dropdown = document.getElementById(id);
    return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
  }, dropdownId);

  if (isOpen) {
    return;
  }

  await page.locator(toggleSelector).click();
  await page.waitForFunction((id) => {
    const dropdown = document.getElementById(id);
    return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
  }, dropdownId);
}

async function openFilterBucket(
  page,
  bucketId,
  { dropdownId = "filterDropdown", interaction = "dispatch", toggleSelector = "#filterToggle" } = {},
) {
  await ensureFilterMenuOpen(page, { dropdownId, toggleSelector });
  if (interaction === "click") {
    await page.locator(`#${dropdownId} [data-filter-bucket-id="${bucketId}"]`).click();
  } else {
    await page.evaluate(
      ({ currentBucketId, currentDropdownId }) => {
        document
          .querySelector(`#${currentDropdownId} [data-filter-bucket-id="${currentBucketId}"]`)
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      },
      { currentBucketId: bucketId, currentDropdownId: dropdownId },
    );
  }
  await page.waitForFunction(
    ({ currentDropdownId, currentBucketId }) => {
      const detail = document.querySelector(`#${currentDropdownId} .filter-menu-detail`);
      return Boolean(detail && detail.dataset.filterBucket === currentBucketId);
    },
    { currentBucketId: bucketId, currentDropdownId: dropdownId },
  );
}

async function returnToFilterLauncher(page, { dropdownId = "filterDropdown" } = {}) {
  await page.evaluate((id) => {
    document.querySelector(`#${id} .filter-back-button`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, dropdownId);
  await page.waitForFunction((id) => Boolean(document.querySelector(`#${id} .filter-menu-launcher`)), dropdownId);
}

async function clickFilterOption(page, groupId, value, { dropdownId = "filterDropdown" } = {}) {
  await page.evaluate(
    ({ currentDropdownId, currentGroupId, currentValue }) => {
      document
        .querySelector(
          `#${currentDropdownId} .filter-option[data-filter-group="${currentGroupId}"][data-filter-value="${currentValue}"]`,
        )
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    },
    { currentDropdownId: dropdownId, currentGroupId: groupId, currentValue: value },
  );
}

test("homepage supports structured filtering, recently updated mode, and no-result recovery", async () => {
  const page = await browser.newPage();
  const expectedSimilarTitle = scoreCatalog(showFixtures, "like Midnight Burger")[0]?.title || "";

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#activeBrowseState").isVisible(), false);
    const defaultGridState = await getArchiveGridMotionState(page);
    const defaultVisibleIds = defaultGridState.visibleIds;

    await page.locator("#filterToggle").click();
    await page.waitForFunction(() => {
      const dropdown = document.getElementById("filterDropdown");
      return Boolean(dropdown && !dropdown.hidden && dropdown.dataset.state === "open");
    });
    const openState = await page.evaluate(() => ({
      hidden: document.getElementById("filterDropdown")?.hidden ?? true,
      state: document.getElementById("filterDropdown")?.dataset.state || "",
      expanded: document.getElementById("filterToggle")?.getAttribute("aria-expanded") || "false",
      bucketCount: document.querySelectorAll("#filterOptionGrid .filter-bucket-card").length,
      launcherScrollable: (() => {
        const launcher = document.querySelector("#filterOptionGrid .filter-menu-launcher");
        return launcher ? launcher.scrollHeight > launcher.clientHeight : true;
      })(),
    }));
    assert.equal(openState.hidden, false);
    assert.equal(openState.state, "open");
    assert.equal(openState.expanded, "true");
    assert.equal(openState.bucketCount, 5);
    assert.equal(openState.launcherScrollable, false);

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

    await openFilterBucket(page, "archiveStatus", { interaction: "click" });
    await page.waitForFunction(
      () =>
        document.getElementById("filterDropdown")?.hidden === false &&
        document.getElementById("filterDropdown")?.dataset.state === "open",
    );
    await page.evaluate(() => {
      document
        .querySelector('.filter-option[data-filter-group="completionStatus"][data-filter-value="finished"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document
        .querySelector('.filter-option[data-filter-group="reviewStatus"][data-filter-value="indexed-only"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForFunction(() => document.getElementById("filterCount")?.textContent?.trim() === "2");
    const filterMotionState = await getArchiveGridMotionState(page);
    const capturedGridMotion = filterMotionState.shells.some((shell) => shell.isExiting || shell.isFlipping);
    if (capturedGridMotion) {
      assert.equal(filterMotionState.reason, "explicit");
      assert.equal(filterMotionState.flipDuration, 230);
      assert.equal(filterMotionState.enterDuration, 170);
      assert.equal(filterMotionState.exitDuration, 150);
    }
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
    await page.waitForFunction(() => {
      const grid = document.getElementById("podcast-grid");
      const shells = Array.from(document.querySelectorAll("#podcast-grid .podcast-card-shell"));
      return (
        grid?.dataset.gridMotionReason === "explicit" &&
        (shells.some((shell) => shell.classList.contains("is-grid-entering")) ||
          (document.getElementById("activeBrowseState")?.hidden === true &&
            document.getElementById("filterCount")?.hidden === true))
      );
    });
    const clearMotionState = await getArchiveGridMotionState(page);
    const clearUiState = await page.evaluate(() => ({
      activeBrowseHidden: document.getElementById("activeBrowseState")?.hidden === true,
      filterCountHidden: document.getElementById("filterCount")?.hidden === true,
    }));
    assert.equal(clearMotionState.reason, "explicit");
    assert.equal(
      clearMotionState.shells.some((shell) => shell.isEntering && shell.animationDurations.includes(170)) ||
        (clearUiState.activeBrowseHidden &&
          clearUiState.filterCountHidden &&
          clearMotionState.shells.every((shell) => !shell.isEntering)),
      true,
    );
    await page.waitForFunction(
      (expectedCount) =>
        document.querySelectorAll("#podcast-grid .podcast-card-shell").length === expectedCount &&
        document.getElementById("activeBrowseState")?.hidden === true &&
        document.getElementById("filterCount")?.hidden === true,
      showFixtures.length,
    );

    await openFilterBucket(page, "archiveStatus");
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

    await returnToFilterLauncher(page);
    await openFilterBucket(page, "findTags");
    const tagFinderState = await page.evaluate(() => ({
      renderedOptions: document.querySelectorAll("#filterDropdown .filter-tag-results .filter-option").length,
      hasMatchingSection: Boolean(
        Array.from(document.querySelectorAll("#filterDropdown .filter-group-title")).find((node) => node.textContent?.includes("Matching")),
      ),
    }));
    assert.ok(tagFinderState.renderedOptions <= 8);
    assert.equal(tagFinderState.hasMatchingSection, false);

    await page.locator("#filterDropdown .filter-tag-search-input").fill("horror");
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("#filterDropdown .filter-group-title")).some((node) => node.textContent?.includes("Matching")),
    );
    await clickFilterOption(page, "tags", "horror");
    await page.waitForFunction(
      () =>
        document.getElementById("filterCount")?.textContent?.trim() === "3" &&
        document.querySelector('.quick-filter[data-chip-filter="horror"]')?.classList.contains("is-active") &&
        (document.getElementById("activeBrowseState")?.textContent || "").includes("Tags: Horror"),
    );

    await page.evaluate(() => {
      document.querySelector("#filterDropdown .filter-bucket-clear")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForFunction(
      () =>
        document.getElementById("filterCount")?.textContent?.trim() === "2" &&
        !document.querySelector('.quick-filter[data-chip-filter="horror"]')?.classList.contains("is-active"),
    );

    await page.evaluate(() => {
      window.scrollTo({ top: window.innerHeight * 2 });
    });
    await page.waitForFunction(() => document.getElementById("stickyBrowseBar")?.dataset.visibility === "visible");
    await page.waitForFunction(() => document.getElementById("stickyBrowseBar")?.dataset.mode === "collapsed");
    await ensureFilterMenuOpen(page, { dropdownId: "stickyFilterDropdown", toggleSelector: "#stickyFilterToggle" });
    await page.waitForFunction(() => {
      const summary = document.querySelector('#stickyFilterDropdown [data-filter-bucket-status="archiveStatus"]');
      return Boolean(summary && !summary.textContent?.includes("none"));
    });
    await openFilterBucket(page, "archiveStatus", {
      dropdownId: "stickyFilterDropdown",
      toggleSelector: "#stickyFilterToggle",
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector('#stickyFilterDropdown .filter-option[data-filter-group="completionStatus"][data-filter-value="finished"]')
          ?.classList.contains("is-active") &&
        document
          .querySelector('#stickyFilterDropdown .filter-option[data-filter-group="reviewStatus"][data-filter-value="indexed-only"]')
          ?.classList.contains("is-active"),
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("stickyFilterDropdown")?.hidden === true);

    await page.getByRole("button", { name: "Recently updated" }).click();
    await page.waitForTimeout(20);
    const sortMotionState = await getArchiveGridMotionState(page);
    assert.equal(sortMotionState.reason, "explicit");
    assert.notDeepEqual(sortMotionState.visibleIds.slice(0, 8), defaultVisibleIds.slice(0, 8));
    assert.equal(
      (sortMotionState.flipDuration === 230 &&
        sortMotionState.shells.some(
          (shell) => shell.isFlipping && shell.animationDurations.includes(230) && shell.transform !== "none",
        )) ||
        sortMotionState.flipDuration === 0,
      true,
    );
    await page.locator("#resultsSummary").waitFor();
    assert.match((await page.locator("#resultsSummary").textContent()) || "", /Recently updated/i);

    await page.locator("#activeBrowseClear").click();
    await page.waitForFunction(
      (expectedCount) =>
        document.querySelectorAll("#podcast-grid .podcast-card-shell").length === expectedCount &&
        document.getElementById("activeBrowseState")?.hidden === true &&
        document.getElementById("filterCount")?.hidden === true,
      showFixtures.length,
    );
    await page.evaluate(() => {
      window.scrollTo({ top: window.innerHeight * 2 });
    });
    await page.waitForFunction(() => document.getElementById("stickyBrowseBar")?.dataset.visibility === "visible");
    await page.waitForFunction(() => document.getElementById("stickyBrowseBar")?.dataset.mode === "collapsed");

    await page.locator("#stickySearchToggle").click();
    await page.waitForFunction(
      () =>
        document.getElementById("stickyBrowseBar")?.dataset.mode === "expanded" &&
        document.activeElement?.id === "stickySearch",
    );
    await page.locator("#stickySearch").fill("midnight");
    await page.waitForFunction(
      () =>
        (document.querySelector("#resultsSummary")?.textContent || "").includes('results for "midnight"') &&
        (document.querySelector("#search")?.value || "") === "midnight",
    );
    const liveSearchMotionState = await getArchiveGridMotionState(page);
    assert.equal(liveSearchMotionState.reason, "live-search");
    assert.equal(liveSearchMotionState.flipDuration, 150);
    assert.equal(liveSearchMotionState.enterDuration, 120);
    assert.equal(liveSearchMotionState.exitDuration, 110);
    assert.equal(
      liveSearchMotionState.shells.some(
        (shell) =>
          (shell.isExiting && shell.animationDurations.includes(110)) ||
          (shell.isFlipping && shell.animationDurations.includes(150)),
      ),
      true,
    );
    const restoredCardId = defaultVisibleIds.find((id) => !liveSearchMotionState.visibleIds.includes(id));
    assert.ok(restoredCardId);
    await page.mouse.click(20, 220);
    await page.waitForFunction(
      () =>
        document.activeElement?.id !== "stickySearch" &&
        document.getElementById("stickyBrowseBar")?.dataset.mode === "expanded",
    );
    await page.locator("#stickySearch").fill("");
    await page.waitForFunction(
      () =>
        (document.querySelector("#stickySearch")?.value || "") === "" &&
        document.getElementById("stickyBrowseBar")?.dataset.mode === "expanded" &&
        Boolean(document.querySelector("#podcast-grid .podcast-card-shell.is-grid-entering")),
    );
    const restoredGridState = await getArchiveGridMotionState(page);
    await page.waitForFunction(
      () => !(document.querySelector("#resultsSummary")?.textContent || "").includes('results for "midnight"'),
    );
    assert.equal(restoredGridState.reason, "live-search");
    assert.equal(restoredGridState.shells.some((shell) => shell.isEntering && shell.animationDurations.includes(120)), true);
    assert.equal(restoredGridState.shells.filter((shell) => shell.id === restoredCardId).length, 1);
    assert.equal(
      restoredGridState.shells.some((shell) => shell.id === restoredCardId && shell.isExiting),
      false,
    );
    await page.mouse.click(20, 220);
    await page.waitForFunction(() => document.getElementById("stickyBrowseBar")?.dataset.mode === "collapsed");
    await page.locator("#stickySearchToggle").click();
    await page.waitForFunction(
      () =>
        document.getElementById("stickyBrowseBar")?.dataset.mode === "expanded" &&
        document.activeElement?.id === "stickySearch",
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        document.getElementById("stickyBrowseBar")?.dataset.mode === "collapsed" &&
        document.activeElement?.id === "stickySearchToggle",
    );

    await page.locator("#search").fill("zzzzzz-not-in-archive");
    await page.getByText("No matches yet.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("#podcast-grid .podcast-card-shell").length > 0 &&
        (document.querySelector("#search")?.value || "") === "" &&
        document.getElementById("stickyBrowseBar")?.dataset.mode === "collapsed",
    );

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

test("homepage mobile filter uses a non-scrolling launcher sheet with drill-in detail views", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    await ensureFilterMenuOpen(page);
    const launcherState = await page.evaluate(() => {
      const dropdown = document.getElementById("filterDropdown");
      const launcher = document.querySelector("#filterOptionGrid .filter-menu-launcher");
      const styles = dropdown ? window.getComputedStyle(dropdown) : null;
      return {
        bodyLocked: document.body.classList.contains("filter-sheet-open"),
        bucketCount: document.querySelectorAll("#filterOptionGrid .filter-bucket-card").length,
        dialogRole: dropdown?.getAttribute("role") || "",
        ariaModal: dropdown?.getAttribute("aria-modal") || "",
        closeFocused: document.activeElement?.classList.contains("filter-sheet-close") || false,
        mainInert: document.querySelector("main")?.inert || false,
        launcherScrollable: launcher ? launcher.scrollHeight > launcher.clientHeight : true,
        position: styles?.position || "",
      };
    });

    assert.equal(launcherState.bodyLocked, true);
    assert.equal(launcherState.bucketCount, 5);
    assert.equal(launcherState.dialogRole, "dialog");
    assert.equal(launcherState.ariaModal, "true");
    assert.equal(launcherState.closeFocused, true);
    assert.equal(launcherState.mainInert, true);
    assert.equal(launcherState.launcherScrollable, false);
    assert.equal(launcherState.position, "fixed");

    await openFilterBucket(page, "tone", { interaction: "click" });
    const detailState = await page.evaluate(() => {
      const detail = document.querySelector("#filterDropdown .filter-menu-detail");
      const scroll = document.querySelector("#filterDropdown .filter-detail-scroll");
      return {
        activeBucket: detail?.getAttribute("data-filter-bucket") || "",
        overflowY: scroll ? window.getComputedStyle(scroll).overflowY : "",
      };
    });
    assert.equal(detailState.activeBucket, "tone");
    assert.equal(detailState.overflowY, "auto");

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        document.getElementById("filterDropdown")?.hidden === true &&
        !document.body.classList.contains("filter-sheet-open") &&
        document.activeElement?.id === "filterToggle",
    );
  } finally {
    await page.close();
  }
});

test("homepage rapid filter toggles fall back to a stable grid when animations overlap", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const readStableGridState = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("#podcast-grid > .podcast-card-shell")).map((shell) => ({
          id: shell.dataset.podcastId || "",
          top: Math.round(shell.getBoundingClientRect().top),
          left: Math.round(shell.getBoundingClientRect().left),
          position: window.getComputedStyle(shell).position,
          opacity: window.getComputedStyle(shell).opacity,
          isEntering: shell.classList.contains("is-grid-entering"),
          isExiting: shell.classList.contains("is-grid-exiting"),
          isFlipping: shell.classList.contains("is-grid-flipping"),
        })),
      );
    const toRelativeLayout = (shells) => {
      const topOffset = Math.min(...shells.map((shell) => shell.top));
      const leftOffset = Math.min(...shells.map((shell) => shell.left));
      return shells.map((shell) => ({
        id: shell.id,
        top: shell.top - topOffset,
        left: shell.left - leftOffset,
      }));
    };

    const baselineShells = await readStableGridState();

    await openFilterBucket(page, "archiveStatus");
    await page.evaluate(() => {
      [
        ["completionStatus", "finished"],
        ["reviewStatus", "indexed-only"],
        ["completionStatus", "finished"],
        ["reviewStatus", "indexed-only"],
      ].forEach(([group, value]) => {
        document
          .querySelector(`.filter-option[data-filter-group="${group}"][data-filter-value="${value}"]`)
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    });

    await page.waitForTimeout(40);

    const afterSpamState = await page.evaluate(() => ({
      activeFilters: Array.from(document.querySelectorAll(".filter-option.is-active")).map(
        (button) => `${button.dataset.filterGroup || ""}:${button.dataset.filterValue || ""}`,
      ),
    }));
    const stableShells = await readStableGridState();

    assert.deepEqual(afterSpamState.activeFilters, []);
    assert.deepEqual(
      stableShells.map((shell) => shell.id),
      baselineShells.map((shell) => shell.id),
    );
    stableShells.forEach((shell, index) => {
      assert.equal(shell.position, "relative");
      assert.equal(shell.opacity, "1");
      assert.equal(shell.isEntering, false);
      assert.equal(shell.isExiting, false);
      assert.equal(shell.isFlipping, false);
      assert.equal(shell.top, baselineShells[index].top);
      assert.equal(shell.left, baselineShells[index].left);
    });
  } finally {
    await page.close();
  }
});

test("homepage filter reversals during in-flight grid motion recover to the baseline layout", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    const readStableGridState = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("#podcast-grid > .podcast-card-shell")).map((shell) => ({
          id: shell.dataset.podcastId || "",
          top: Math.round(shell.getBoundingClientRect().top),
          left: Math.round(shell.getBoundingClientRect().left),
          position: window.getComputedStyle(shell).position,
          opacity: window.getComputedStyle(shell).opacity,
          isEntering: shell.classList.contains("is-grid-entering"),
          isExiting: shell.classList.contains("is-grid-exiting"),
          isFlipping: shell.classList.contains("is-grid-flipping"),
        })),
      );
    const toRelativeLayout = (shells) => {
      const topOffset = Math.min(...shells.map((shell) => shell.top));
      const leftOffset = Math.min(...shells.map((shell) => shell.left));
      return shells.map((shell) => ({
        id: shell.id,
        top: shell.top - topOffset,
        left: shell.left - leftOffset,
      }));
    };

    const baselineShells = await readStableGridState();

    await openFilterBucket(page, "archiveStatus");

    await clickFilterOption(page, "completionStatus", "finished");
    await page.waitForFunction(
      () =>
        Boolean(
          document.querySelector("#podcast-grid .podcast-card-shell.is-grid-exiting") ||
            document.querySelector("#podcast-grid .podcast-card-shell.is-grid-flipping"),
        ),
    );

    await returnToFilterLauncher(page);
    await openFilterBucket(page, "storyType");
    await clickFilterOption(page, "formats", "full-cast");
    await page.waitForFunction(
      () =>
        document.getElementById("filterCount")?.textContent?.trim() === "2" &&
        (document.getElementById("activeBrowseState")?.textContent || "").includes("Format: Full Cast"),
    );

    await returnToFilterLauncher(page);
    await openFilterBucket(page, "archiveStatus");
    await clickFilterOption(page, "completionStatus", "finished");
    await page.waitForFunction(
      () =>
        document.getElementById("filterCount")?.textContent?.trim() === "1" &&
        !(document.getElementById("activeBrowseState")?.textContent || "").includes("Completion: Finished"),
    );
    await returnToFilterLauncher(page);
    await openFilterBucket(page, "storyType");
    await clickFilterOption(page, "formats", "full-cast");
    await page.waitForFunction(
      () => document.getElementById("filterCount")?.hidden === true && document.getElementById("activeBrowseState")?.hidden === true,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("filterDropdown")?.hidden === true);
    await page.waitForFunction(
      (expectedCount) => document.querySelectorAll("#podcast-grid > .podcast-card-shell").length === expectedCount,
      baselineShells.length,
    );
    await page.waitForTimeout(320);

    const stableShells = await readStableGridState();
    const baselineLayout = toRelativeLayout(baselineShells);
    const stableLayout = toRelativeLayout(stableShells);
    assert.deepEqual(
      stableShells.map((shell) => shell.id),
      baselineShells.map((shell) => shell.id),
    );
    stableShells.forEach((shell, index) => {
      assert.equal(shell.position, "relative");
      assert.equal(shell.opacity, "1");
      assert.equal(shell.isEntering, false);
      assert.equal(shell.isExiting, false);
      assert.equal(shell.isFlipping, false);
      assert.ok(Math.abs(stableLayout[index].top - baselineLayout[index].top) <= 1);
      assert.ok(Math.abs(stableLayout[index].left - baselineLayout[index].left) <= 1);
    });
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
      assert.equal(href, `/show?id=${defaultState.cardIds[index]}`);
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

    await openFilterBucket(page, "archiveStatus");
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  const summaryMap = {
    story: createSummary({ averageRating: 8.6, ratingCount: 7 }),
    "station-151": createSummary({ averageRating: 9.2, ratingCount: 3 }),
  };
  const expectedIds = ["story", "station-151", "impact-winter", "ars-paradoxica"];

  try {
    await context.route("**/data/search-index.json*", async (route) => {
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

    await context.route("**/api/community/ratings/summary?*", async (route) => {
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
    await context.close();
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
