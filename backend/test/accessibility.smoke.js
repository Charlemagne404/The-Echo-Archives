const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const axeScriptPath = require.resolve("axe-core/axe.min.js");
const {
  createReadOnlyBrowserContext,
} = require("./helpers/read-only-browser");
const {
  getSmokeContext,
  gotoSmokePage,
  setupSmoke,
  teardownSmoke,
} = require("./helpers/browser-smoke");

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const PAGE_MANIFEST_PATH = path.resolve(__dirname, "../../site-src/page-manifest.json");

let browser;
let baseUrl;
let firstCollectionId;
let firstShowId;

test.before(async () => {
  await setupSmoke();
  ({ browser, baseUrl, firstCollectionId, firstShowId } = getSmokeContext());
});

test.after(async () => {
  await teardownSmoke();
});

async function installAxe(context) {
  await context.addInitScript({ path: axeScriptPath });
}

async function assertAxeClean(page, label) {
  const results = await page.evaluate(async (tags) => window.axe.run(document, {
    runOnly: { type: "tag", values: tags },
  }), AXE_TAGS);
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
  }));
  assert.deepEqual(violations, [], `${label} has accessibility violations: ${JSON.stringify(violations)}`);
}

test("all authored public templates, a creator page, and maintainer sign-in pass WCAG and semantic checks", { timeout: 120_000 }, async () => {
  const guard = await createReadOnlyBrowserContext(browser);
  await installAxe(guard.context);
  const page = await guard.context.newPage();
  const pageManifest = JSON.parse(fs.readFileSync(PAGE_MANIFEST_PATH, "utf8"));
  const publicTemplateRoutes = pageManifest
    .filter((entry) => !entry.output.startsWith("maintainer/"))
    .map((entry) => [entry.output, new URL(entry.canonicalUrl, baseUrl).pathname]);
  const routes = [
    ...publicTemplateRoutes,
    ["collection detail", `/collections/${encodeURIComponent(firstCollectionId)}`],
    ["show detail", `/shows/${encodeURIComponent(firstShowId)}`],
    ["creator detail", "/creators/7-lamb-productions"],
    ["protected maintainer sign-in", "/maintainer/submissions.html"],
  ];

  try {
    for (const [label, route] of routes) {
      await gotoSmokePage(page, `${baseUrl}${route}`, { waitUntil: "networkidle" });
      await assertAxeClean(page, label);
    }
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("core discovery, detail, creator, and submit routes reflow at 320 CSS pixels", { timeout: 90_000 }, async () => {
  const guard = await createReadOnlyBrowserContext(browser, {
    viewport: { width: 320, height: 844 },
    reducedMotion: "reduce",
  });
  await installAxe(guard.context);
  const page = await guard.context.newPage();
  const routes = [
    ["browse", "/"],
    ["collections", "/collections"],
    ["collection detail", `/collections/${encodeURIComponent(firstCollectionId)}`],
    ["show detail", `/shows/${encodeURIComponent(firstShowId)}`],
    ["creator directory", "/creators"],
    ["creator detail", "/creators/7-lamb-productions"],
    ["submission form", "/submit"],
  ];

  try {
    for (const [label, route] of routes) {
      await gotoSmokePage(page, `${baseUrl}${route}`, { waitUntil: "networkidle" });
      await assertAxeClean(page, `${label} at 320 CSS pixels`);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `${label} overflows the 320 CSS pixel viewport`,
      );
    }
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("collections search announces the result count without making every card a live region", async () => {
  const guard = await createReadOnlyBrowserContext(browser);
  await installAxe(guard.context);
  const page = await guard.context.newPage();

  try {
    await gotoSmokePage(page, `${baseUrl}/collections`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#collectionsDirectory").getAttribute("aria-live"), null);
    assert.equal(await page.locator("#collectionsDirectorySummary").getAttribute("role"), "status");
    assert.equal(await page.locator("#collectionsDirectorySummary").getAttribute("aria-atomic"), "true");

    const search = page.locator("#collectionsSearch");
    await search.fill("zz-no-collection-493");
    await page.waitForFunction(() => /0 collections/.test(document.getElementById("collectionsDirectorySummary")?.textContent || ""));
    assert.match(await page.locator("#collectionsDirectorySummary").innerText(), /0 collections/);
    assert.equal(await page.locator("#collectionsEmptyState").isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), await search.getAttribute("id"));
    assert.equal(
      await page.locator('[aria-hidden="true"][href]:not([tabindex="-1"]), [aria-hidden="true"] a[href]:not([tabindex="-1"])').count(),
      0,
      "filtered collection cards must not remain keyboard-focusable while their exit animation runs",
    );
    await assertAxeClean(page, "empty collection search results");
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("creator directory search and filters work from the keyboard and announce results", async () => {
  const guard = await createReadOnlyBrowserContext(browser);
  await installAxe(guard.context);
  const page = await guard.context.newPage();

  try {
    await gotoSmokePage(page, `${baseUrl}/creators`, { waitUntil: "networkidle" });

    const search = page.getByRole("searchbox", {
      name: "Search production companies, studios, and networks",
    });
    assert.equal(await search.count(), 1, "creator search has a programmatic label");
    await search.focus();
    await page.keyboard.type("zz-no-organization-a11y");
    await page.waitForFunction(() => document.getElementById("entityResults")?.textContent?.startsWith("0 organizations"));
    assert.equal(await search.evaluate((node) => node === document.activeElement), true);
    assert.equal(await page.locator("#entityResults").getAttribute("role"), "status");
    assert.equal(await page.locator("#entityResults").getAttribute("aria-live"), "polite");
    assert.equal(await page.locator("#entityEmpty").isVisible(), true);
    assert.equal(await page.locator("#entityGrid .entity-card:not([hidden])").count(), 0);
    await assertAxeClean(page, "empty creator directory search");

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("entityResults")?.textContent?.includes("organizations in the directory"));
    assert.equal(await search.evaluate((node) => node === document.activeElement), true);
    assert.equal(await page.locator("#entityEmpty").isVisible(), false);

    const networkFilter = page.locator('[data-entity-filter="network"]');
    await networkFilter.focus();
    await page.keyboard.press("Space");
    assert.equal(await networkFilter.getAttribute("aria-pressed"), "true");
    assert.equal(await networkFilter.evaluate((node) => node === document.activeElement), true);
    assert.match(await page.locator("#entityResults").innerText(), /organizations found/);

    const sort = page.getByLabel("Sort");
    await sort.focus();
    assert.equal(await sort.evaluate((node) => node === document.activeElement), true);
    await sort.selectOption("shows");
    assert.equal(await sort.inputValue(), "shows");
    assert.equal(await sort.evaluate((node) => node === document.activeElement), true);
    await assertAxeClean(page, "keyboard-filtered creator directory");
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("browse catalogue error state keeps its explanation and disabled controls accessible", async () => {
  const guard = await createReadOnlyBrowserContext(browser);
  await installAxe(guard.context);
  const page = await guard.context.newPage();
  await page.route("**/data/search-index.json*", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
  });
  await page.route("**/data/collections.json*", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
  });

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => /Search and filters could not load right now/i.test(document.getElementById("resultsSummary")?.textContent || ""));
    assert.equal(await page.locator("#resultsSummary").getAttribute("role"), "status");
    assert.equal(await page.locator("#search").isDisabled(), true);
    assert.equal(await page.locator("#filterToggle").isDisabled(), true);
    const quickFilters = page.locator("#quickFilters");
    assert.equal(await quickFilters.getAttribute("tabindex"), "0");
    let quickFiltersReachedByKeyboard = false;
    for (let index = 0; index < 25; index += 1) {
      await page.keyboard.press("Tab");
      if (await quickFilters.evaluate((node) => node === document.activeElement)) {
        quickFiltersReachedByKeyboard = true;
        break;
      }
    }
    assert.equal(quickFiltersReachedByKeyboard, true);
    assert.notEqual(await quickFilters.evaluate((node) => getComputedStyle(node).outlineStyle), "none");
    await assertAxeClean(page, "browse with catalogue data unavailable");
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("browse empty results announce the count and keep recovery controls accessible", async () => {
  const guard = await createReadOnlyBrowserContext(browser);
  await installAxe(guard.context);
  const page = await guard.context.newPage();

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    const search = page.locator("#search");
    await search.fill("no-such-echo-archive-show-493");
    await page.locator("#noResultsMsg").waitFor({ state: "visible" });
    await page.waitForFunction(() => /0 results/.test(document.getElementById("resultsSummary")?.textContent || ""));
    assert.equal(await page.locator("#resultsSummary").getAttribute("role"), "status");
    assert.equal(await page.locator("#resultsSummary").getAttribute("aria-atomic"), "true");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "search");
    await assertAxeClean(page, "browse with no matching shows");
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("mobile navigation and filter sheet support keyboard focus, Escape, and focus return", async () => {
  const guard = await createReadOnlyBrowserContext(browser, {
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await installAxe(guard.context);
  const page = await guard.context.newPage();

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });

    const navigationToggle = page.locator("#siteNavToggle");
    await navigationToggle.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("siteNavShell")?.dataset.state === "open");
    assert.equal(await page.locator(".site-nav-drawer").getAttribute("role"), "dialog");
    assert.equal(await page.locator(".site-nav-drawer").getAttribute("aria-modal"), "true");
    await page.waitForFunction(() => document.activeElement?.classList.contains("site-nav-close"));
    assert.notEqual(await page.locator(".site-nav-close").evaluate((node) => getComputedStyle(node).outlineStyle), "none");
    await assertAxeClean(page, "open mobile navigation");

    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator(".site-mobile-nav-link").last().evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(".site-nav-close").evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("siteNavShell")?.dataset.state === "closed");
    assert.equal(await navigationToggle.evaluate((node) => node === document.activeElement), true);

    const filterToggle = page.locator("#filterToggle");
    await filterToggle.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("filterDropdown")?.dataset.state === "open");
    await page.waitForFunction(() => {
      const grid = document.querySelector("#filterDropdown .filter-option-grid");
      return grid && Number.parseFloat(getComputedStyle(grid).opacity) >= 0.99;
    });
    assert.equal(await page.locator("#filterDropdown").getAttribute("role"), "dialog");
    assert.equal(await page.locator("#filterDropdown").getAttribute("aria-modal"), "true");
    assert.equal(await filterToggle.getAttribute("aria-expanded"), "true");
    await assertAxeClean(page, "open mobile filter sheet");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("filterDropdown")?.hidden === true);
    assert.equal(await filterToggle.evaluate((node) => node === document.activeElement), true);
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("Ask the Archivist dialog passes semantic checks and returns focus on close", async () => {
  const guard = await createReadOnlyBrowserContext(browser, {
    viewport: { width: 1280, height: 900 },
  });
  await installAxe(guard.context);
  const page = await guard.context.newPage();

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    const toggle = page.locator("#chat-toggle");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.locator("#chat-container.is-open").waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "userInput");
    assert.equal(await page.locator("#chat-container").getAttribute("role"), "dialog");
    assert.equal(await page.locator("#chat-container").getAttribute("aria-modal"), "true");
    await assertAxeClean(page, "open Ask the Archivist dialog");

    await page.keyboard.press("Escape");
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });
    assert.equal(await toggle.evaluate((node) => node === document.activeElement), true);
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("submission mode, tag-picker, and correction-result states pass semantic checks", { timeout: 90_000 }, async () => {
  const guard = await createReadOnlyBrowserContext(browser);
  await installAxe(guard.context);
  const page = await guard.context.newPage();

  try {
    await gotoSmokePage(page, `${baseUrl}/submit`, { waitUntil: "networkidle" });
    await page.locator("#submitHelpfulDetails > summary").click();
    await page.waitForFunction(() => document.getElementById("submitHelpfulDetails")?.open === true);
    const tagPickerToggle = page.locator('[data-toggle-tag-picker="selectedTags"]');
    await tagPickerToggle.press("Enter");
    const tagInput = page.locator('[data-tag-input="selectedTags"]');
    await page.waitForFunction(
      () => document.querySelector('[data-toggle-tag-picker="selectedTags"]')?.getAttribute("aria-expanded") === "true",
    );
    await page.waitForFunction(
      () => document.activeElement === document.querySelector('[data-tag-input="selectedTags"]'),
      null,
      { timeout: 5_000 },
    );
    const tagPickerFocusDebug = await page.evaluate(() => {
      const input = document.querySelector('[data-tag-input="selectedTags"]');
      const ancestors = [];
      for (let node = input; node instanceof HTMLElement && ancestors.length < 8; node = node.parentElement) {
        const style = getComputedStyle(node);
        ancestors.push({ tag: node.tagName, id: node.id, detailsOpen: node instanceof HTMLDetailsElement ? node.open : undefined, hidden: node.hidden, display: style.display, visibility: style.visibility });
      }
      return { active: document.activeElement?.id || document.activeElement?.tagName, detailsOpen: document.getElementById("submitHelpfulDetails")?.open, ancestors };
    });
    assert.equal(
      await tagInput.evaluate((node) => node === document.activeElement),
      true,
      `tag-picker input should receive focus after keyboard activation: ${JSON.stringify(tagPickerFocusDebug)}`,
    );
    assert.equal(await page.locator("#submitHelpfulDetails").evaluate((details) => details.open), true);
    await tagInput.press("ArrowDown");
    await page.waitForFunction(() => Boolean(document.querySelector('[data-tag-input="selectedTags"]')?.getAttribute("aria-activedescendant")));
    await page.locator(".submit-tag-picker-menu:not([hidden])").waitFor();
    await assertAxeClean(page, "open submission tag picker");
    await tagInput.press("Escape");
    await page.waitForFunction(() => document.querySelector('[data-toggle-tag-picker="selectedTags"]')?.getAttribute("aria-expanded") === "false");
    assert.equal(await tagInput.evaluate((node) => node === document.activeElement), true);

    await page.locator('[data-submission-mode="listener-review"]').click();
    await page.waitForFunction(() => document.getElementById("submissionType")?.value === "listener-review");
    await page.waitForFunction(() => document.querySelectorAll("[data-category-score-group]").length === 6);
    await assertAxeClean(page, "listener review submission mode");
    await page.locator("#submitDetailedRatings > summary").click();
    await assertAxeClean(page, "expanded listener category ratings");

    await page.locator('[data-submission-mode="creator-verification"]').click();
    await page.waitForFunction(() => document.getElementById("submissionType")?.value === "creator-verification");
    await assertAxeClean(page, "creator verification submission mode");

    await page.locator('[data-submission-mode="correction"]').click();
    const showSearch = page.locator("#submitExistingShowSearch");
    await showSearch.waitFor();
    await showSearch.fill("Impact");
    await showSearch.press("ArrowDown");
    await page.waitForFunction(() => Boolean(document.getElementById("submitExistingShowSearch")?.getAttribute("aria-activedescendant")));
    await assertAxeClean(page, "show correction search with an active result");

    await gotoSmokePage(
      page,
      `${baseUrl}/submit?submissionType=correction&correctionType=creator-page&entityId=fool-and-scholar-productions&entityName=${encodeURIComponent("Fool & Scholar Productions")}`,
      { waitUntil: "networkidle" },
    );
    await page.locator("#submitCreatorPageName").waitFor();
    await assertAxeClean(page, "creator page correction mode");
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("show-lookup error state is announced and remains keyboard accessible", async () => {
  const guard = await createReadOnlyBrowserContext(browser);
  await installAxe(guard.context);
  const page = await guard.context.newPage();
  await page.route("**/data/search-index.json*", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "catalogue unavailable" }) });
  });

  try {
    await gotoSmokePage(page, `${baseUrl}/submit`, { waitUntil: "networkidle" });
    await page.locator('[data-submission-mode="correction"]').click();
    await page.locator('.submit-lookup-status[data-state="error"]').waitFor();
    assert.equal(await page.locator(".submit-lookup-status").getAttribute("role"), "alert");
    const retry = page.locator("[data-retry-submit-lookup]");
    assert.equal(await retry.isVisible(), true);
    let retryReachedByKeyboard = false;
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      if (await retry.evaluate((node) => node === document.activeElement)) {
        retryReachedByKeyboard = true;
        break;
      }
    }
    assert.equal(retryReachedByKeyboard, true);
    assert.notEqual(await retry.evaluate((node) => getComputedStyle(node).outlineStyle), "none");
    await assertAxeClean(page, "show lookup unavailable state");
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("compact Library controls on cards and show pages pass semantic checks", { timeout: 60_000 }, async () => {
  const guard = await createReadOnlyBrowserContext(browser);
  await installAxe(guard.context);
  const page = await guard.context.newPage();

  try {
    await gotoSmokePage(page, `${baseUrl}/`, { waitUntil: "networkidle" });
    const cardControl = page.locator('[data-library-control="card"]').first();
    const cardSummary = cardControl.locator("summary");
    await cardSummary.press("Enter");
    await page.waitForFunction((showId) => {
      const details = document.querySelector(`[data-library-control="card"][data-library-show-id="${CSS.escape(showId)}"]`);
      return details?.open === true;
    }, await cardControl.getAttribute("data-library-show-id"));
    const cardState = cardControl.locator("[data-library-state-select]");
    await cardState.waitFor({ state: "visible" });
    await assertAxeClean(page, "open show-card Library controls");
    assert.equal(await cardControl.evaluate((node) => node.closest("a") !== null), false, "the control stays outside the card link");
    await cardState.selectOption("saved");
    await page.waitForFunction((showId) => {
      const control = document.querySelector(`[data-library-control="card"][data-library-show-id="${CSS.escape(showId)}"]`);
      return control?.querySelector("summary")?.textContent?.includes("Saved") === true && control.open === false;
    }, await cardControl.getAttribute("data-library-show-id"));
    assert.equal(await cardSummary.evaluate((node) => node === document.activeElement), true);

    await gotoSmokePage(page, `${baseUrl}/shows/${encodeURIComponent(firstShowId)}`, { waitUntil: "networkidle" });
    const detailControl = page.locator('[data-library-control="detail"]');
    await detailControl.waitFor();
    assert.ok(await page.locator(".detail-actions a").count() > 0, "listen actions remain in the primary action area");
    const detailSummary = detailControl.locator("summary");
    await detailSummary.press("Enter");
    await detailControl.locator("[data-library-state-select]").waitFor({ state: "visible" });
    await assertAxeClean(page, "open show-detail Library controls");
    await detailControl.locator("[data-library-state-select]").selectOption("listening");
    await detailControl.locator("[data-library-rating-select]").selectOption("4");
    assert.match(await detailControl.locator(".library-detail-rating-note").textContent(), /never submits a Community Rating/);
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("form validation exposes a field error and returns focus to the invalid control", async () => {
  const guard = await createReadOnlyBrowserContext(browser);
  await installAxe(guard.context);
  const page = await guard.context.newPage();

  try {
    await gotoSmokePage(page, `${baseUrl}/submit`, { waitUntil: "networkidle" });
    await page.locator("#submitLegalAcknowledgement").check();
    await page.locator("#submitPrimaryButton").click();
    await page.waitForFunction(() => document.getElementById("submitShowTitle")?.getAttribute("aria-invalid") === "true");
    assert.equal(await page.locator("#submitShowTitleError").getAttribute("role"), "alert");
    assert.equal(await page.locator("#submitShowTitleError").isVisible(), true);
    assert.equal(await page.locator("#submitStatus").getAttribute("role"), "alert");
    assert.equal(await page.locator("#submitShowTitle").evaluate((node) => node === document.activeElement), true);
    await assertAxeClean(page, "submission form validation errors");
    guard.assertNoMutationAttempts();
  } finally {
    await page.close();
    await guard.close();
  }
});

test("protected maintainer workspaces remain accessible after local smoke authentication", { timeout: 60_000 }, async () => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const origin = new URL(baseUrl).origin;
  const blockedMutations = [];
  await context.addInitScript(() => {
    const disableAnalytics = () => {
      if (!document.documentElement) return false;
      document.documentElement.setAttribute("data-analytics-enabled", "false");
      return true;
    };
    if (!disableAnalytics()) {
      const observer = new MutationObserver(() => {
        if (disableAnalytics()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  });
  await installAxe(context);
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const isLocalMaintainerLogin = url.origin === origin && url.pathname === "/api/maintainer/session" && method === "POST";
    if (url.origin === origin && (["GET", "HEAD"].includes(method) || isLocalMaintainerLogin)) {
      await route.continue();
      return;
    }
    if (!["GET", "HEAD"].includes(method)) blockedMutations.push(`${method} ${url.origin}${url.pathname}`);
    await route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const pageErrors = [];
  const maintainerResponses = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/maintainer/")) {
      maintainerResponses.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
    }
  });
  const routes = [
    ["maintainer submissions", "/maintainer/submissions.html"],
    ["maintainer submission report", "/maintainer/submissions/report.html"],
    ["maintainer imports", "/maintainer/imports.html"],
    ["maintainer import report", "/maintainer/imports/report.html"],
    ["maintainer collections", "/maintainer/collections.html"],
    ["maintainer analytics", "/maintainer/analytics.html"],
  ];

  try {
    await gotoSmokePage(page, `${baseUrl}/maintainer/submissions.html`, { waitUntil: "networkidle" });
    await page.locator("#maintainerAuthPanel").waitFor({ state: "visible" });
    await page.locator("#maintainerPassphrase").fill("smoke-maintainer");
    await page.locator("#maintainerAuthForm button[type=submit]").click();
    await page.locator("#maintainerAppShell").waitFor({ state: "visible" });
    for (const [label, route] of routes) {
      try {
        await gotoSmokePage(page, `${baseUrl}${route}`, { waitUntil: "networkidle" });
      } catch (error) {
        const state = await page.evaluate(() => ({
          appReady: document.body?.dataset.appReady || "false",
          stateTitle: document.getElementById("maintainerStateTitle")?.textContent || "",
          stateMessage: document.getElementById("maintainerStateMessage")?.textContent || "",
          authVisible: document.getElementById("maintainerAuthPanel")?.hidden === false,
          workspaceVisible: ["maintainerAppShell", "maintainerReportShell"].some((id) => document.getElementById(id)?.hidden === false),
        }));
        throw new Error(`Could not finish loading ${label}; browser errors: ${pageErrors.join(" | ") || "none"}; responses: ${maintainerResponses.join(" | ")}; state: ${JSON.stringify(state)}`, { cause: error });
      }
      await assertAxeClean(page, label);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
        `${label} overflows the 320 CSS pixel viewport`,
      );
      if (label === "maintainer analytics") {
        for (const [chartId, headingId] of [
          ["analyticsTrafficChart", "analyticsTrafficHeading"],
          ["analyticsInteractionsChart", "analyticsInteractionsHeading"],
          ["analyticsContributionsChart", "analyticsContributionsHeading"],
        ]) {
          const scrollRegion = page.locator(`#${chartId} .analytics-chart-rows`);
          assert.equal(await scrollRegion.getAttribute("role"), "region");
          assert.equal(await scrollRegion.getAttribute("tabindex"), "0");
          assert.equal(await scrollRegion.getAttribute("aria-labelledby"), headingId);
        }
      }
    }
    assert.deepEqual(blockedMutations, [], `unexpected non-read-only request(s): ${blockedMutations.join(", ")}`);
  } finally {
    await page.close();
    await context.close();
  }
});
