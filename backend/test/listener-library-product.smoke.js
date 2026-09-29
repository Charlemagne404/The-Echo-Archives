const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { after, before, test } = require("node:test");
const { chromium } = require("playwright");
const { findFreePort } = require("./helpers/free-port");
const { createVisibleStaticRoot } = require("./helpers/visible-static-root");

const repositoryRoot = path.resolve(__dirname, "../..");
const backendRoot = path.join(repositoryRoot, "backend");
let serverProcess;
let serverOutput = "";
let tempDirectory;
let browser;
let baseUrl;

async function waitFor(url, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}. Server output: ${serverOutput}`);
}

before(async () => {
  const port = await findFreePort();
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "echo-library-product-"));
  const staticRoot = createVisibleStaticRoot(tempDirectory, repositoryRoot);
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVE_STATIC: "true",
      STATIC_ROOT: staticRoot,
      DB_PATH: path.join(tempDirectory, "community.sqlite"),
      SITE_URL: `http://127.0.0.1:${port}`,
      NODE_ENV: "test",
      PUBLIC_ANALYTICS_ENABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", (data) => { serverOutput += data.toString(); });
  serverProcess.stderr.on("data", (data) => { serverOutput += data.toString(); });
  baseUrl = `http://127.0.0.1:${port}`;
  await waitFor(`${baseUrl}/api/health`);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }
  if (tempDirectory) fs.rmSync(tempDirectory, { recursive: true, force: true });
});

async function newContext() {
  const context = await browser.newContext({ serviceWorkers: "block" });
  context.setDefaultTimeout(5_000);
  context.setDefaultNavigationTimeout(8_000);
  return context;
}

async function assertEventually(assertion, timeoutMs = 5_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError || new Error("Expected condition did not become true.");
}

test("the dedicated Library route, page modules, styles, and navigation are gone", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "site-src/page-manifest.json"), "utf8"));
  assert.equal(manifest.some((entry) => entry.canonicalUrl === "/library"), false);
  for (const relativePath of [
    "site-src/pages/library.html",
    "shared/app/pages/library",
    "shared/styles/home/library.css",
    "library.html",
    "library/index.html",
    "library.css",
  ]) {
    assert.equal(fs.existsSync(path.join(repositoryRoot, relativePath)), false, `${relativePath} should be removed`);
  }

  for (const route of ["/library", "/library/", "/library.html", "/library.css"]) {
    assert.equal((await fetch(`${baseUrl}${route}`)).status, 404, `${route} should not resolve publicly`);
  }
  const home = await (await fetch(`${baseUrl}/`)).text();
  assert.doesNotMatch(home, /href="\/library(?:\/|["?])/);
  assert.doesNotMatch(home, /data-library-state=/);
  assert.doesNotMatch(await (await fetch(`${baseUrl}/sitemap.xml`)).text(), /\/library(?:<|\/)/);
  assert.doesNotMatch(await fs.promises.readFile(path.join(repositoryRoot, "sw.js"), "utf8"), /library\.css|shared\/app\/pages\/library/);
});

test("compact card and show controls persist and synchronize without exposing Library state", async () => {
  const context = await newContext();
  const requests = [];
  context.on("request", (request) => requests.push({ method: request.method(), url: request.url(), body: request.postData() || "" }));
  try {
    const browse = await context.newPage();
    await browse.goto(`${baseUrl}/`);
    await browse.waitForSelector("#podcast-grid a[data-discovery-show-id]");
    await browse.waitForSelector('[data-library-control="card"]');
    const repeatedShow = await browse.evaluate(() => {
      const archiveCards = [...document.querySelectorAll("#podcast-grid a[data-discovery-show-id]")];
      const popularIds = new Set([...document.querySelectorAll(".popular-card-shell a[data-discovery-show-id]")].map((anchor) => anchor.dataset.discoveryShowId));
      const anchor = archiveCards.find((candidate) => popularIds.has(candidate.dataset.discoveryShowId));
      return anchor ? { id: anchor.dataset.discoveryShowId, href: anchor.href, title: anchor.querySelector("h2")?.textContent?.trim() || "" } : null;
    });
    assert.ok(repeatedShow?.id, "the home page repeats at least one show across its existing card surfaces");

    const cards = browse.locator(`[data-library-control="card"][data-library-show-id="${repeatedShow.id}"]`);
    await assertEventually(async () => assert.ok(await cards.count() >= 2));
    assert.equal(await cards.locator("[data-library-rating-select]").count(), 0, "cards do not expose private rating controls");
    const cardControl = browse.locator(`#podcast-grid [data-library-control="card"][data-library-show-id="${repeatedShow.id}"]`).first();
    const cardSummary = cardControl.locator("summary");
    let summarySize = null;
    await assertEventually(async () => {
      summarySize = await cardSummary.boundingBox();
      assert.ok(summarySize, "the archive-card Library summary is visible before measuring it");
    });
    assert.ok(summarySize.height <= 40, `card Library affordance stays compact (${summarySize.height}px)`);
    assert.equal(await cardControl.evaluate((node) => node.closest("a") !== null), false, "the control is a sibling of the show link");

    await cardSummary.focus();
    await cardSummary.press("Enter");
    await assertEventually(async () => assert.equal(await cardControl.evaluate((node) => node.open), true));
    await cardControl.locator("[data-library-state-select]").selectOption("saved");
    await assertEventually(async () => {
      const summaries = await cards.locator("summary").allTextContents();
      assert.ok(summaries.every((label) => label === "Saved"), JSON.stringify(summaries));
      assert.equal(await cardControl.evaluate((node) => node.open), false);
      assert.equal(await cardSummary.evaluate((node) => node === document.activeElement), true);
    });

    const detail = await context.newPage();
    await detail.goto(repeatedShow.href);
    await detail.waitForSelector(".podcast-detail .detail-actions");
    const detailControl = detail.locator('[data-library-control="detail"]');
    await detailControl.waitFor();
    assert.equal(await detailControl.evaluate((node) => node.parentElement.matches(".detail-actions")), true, "the detail control lives with the listening actions");
    assert.ok(await detail.locator(".detail-actions a").count() > 0, "existing listen actions remain present");
    assert.equal(await detailControl.locator("[data-library-state-select]").inputValue(), "saved");

    await detailControl.locator("summary").click();
    await detailControl.locator("[data-library-state-select]").selectOption("listening");
    await assertEventually(async () => {
      const summaries = await cards.locator("summary").allTextContents();
      assert.ok(summaries.every((label) => label === "Listening"), JSON.stringify(summaries));
    });
    await detailControl.locator("[data-library-rating-select]").selectOption("4");
    assert.match(await detailControl.locator(".library-detail-rating-note").textContent(), /never submits a Community Rating/);

    await cardControl.locator("summary").click();
    await cardControl.locator("[data-library-state-select]").selectOption("hidden");
    await assertEventually(async () => {
      assert.match(await detailControl.locator("[data-library-state-select]").inputValue(), /hidden/);
      const summaries = await cards.locator("summary").allTextContents();
      assert.ok(summaries.every((label) => label === "Hidden"), JSON.stringify(summaries));
    });
    assert.equal(await browse.locator(`#podcast-grid a[data-discovery-show-id="${repeatedShow.id}"]`).isVisible(), true, "Hidden does not change ordinary browse visibility");

    await detail.reload();
    await detailControl.waitFor();
    await assertEventually(async () => {
      assert.equal(await detailControl.locator("[data-library-state-select]").inputValue(), "hidden");
      assert.equal(await detailControl.locator("[data-library-rating-select]").inputValue(), "4");
    });

    await detail.setViewportSize({ width: 390, height: 844 });
    const personalPreference = detailControl.locator("[data-library-discovery-preference]");
    await detailControl.locator("summary").click();
    assert.equal(await personalPreference.isChecked(), false, "Personal Discovery defaults to off on this browser");
    assert.equal(await personalPreference.getAttribute("aria-label"), "Use my Library in discovery");
    assert.match(await detail.locator(`#${await personalPreference.getAttribute("aria-describedby")}`).textContent(), /this browser’s Library states and private ratings/i);
    await personalPreference.focus();
    await personalPreference.press("Space");
    await assertEventually(async () => assert.equal(await personalPreference.isChecked(), true));
    const preferenceBounds = await personalPreference.boundingBox();
    const detailControlBounds = await detailControl.boundingBox();
    const detailPanelBounds = await detailControl.locator(".library-detail-panel").boundingBox();
    assert.ok(
      preferenceBounds.x >= 0 && preferenceBounds.x + preferenceBounds.width <= 390,
      `the opt-in remains visible at a 390px viewport (${JSON.stringify({ preferenceBounds, detailControlBounds, detailPanelBounds })})`,
    );
    const urlAndHistory = await detail.evaluate(() => `${location.href}\n${JSON.stringify(history.state)}`);
    assert.doesNotMatch(urlAndHistory, /personalContext|personalDiscovery|privateRating|"rating"|"state"|hidden|listening|saved/i);

    const secondDetail = await context.newPage();
    await secondDetail.goto(repeatedShow.href);
    const secondControl = secondDetail.locator('[data-library-control="detail"]');
    await secondControl.waitFor();
    await secondControl.locator("summary").click();
    const secondPreference = secondControl.locator("[data-library-discovery-preference]");
    await assertEventually(async () => assert.equal(await secondPreference.isChecked(), true), 8_000);
    await personalPreference.uncheck();
    await assertEventually(async () => assert.equal(await secondPreference.isChecked(), false), 8_000);
    await personalPreference.check();
    await assertEventually(async () => assert.match(await detailControl.locator(".library-control-status").textContent(), /Personal Discovery enabled/i), 8_000);
    await detail.reload();
    await detailControl.waitFor();
    await detailControl.locator("summary").click();
    await assertEventually(async () => assert.equal(await detailControl.locator("[data-library-discovery-preference]").isChecked(), true));
    await secondDetail.close();

    const tryNextPage = await context.newPage();
    await tryNextPage.goto(`${baseUrl}/shows/midnight-burger`);
    const computedGroup = tryNextPage.locator('.detail-similar-group[data-recommendation-source="computed"]');
    const computedRecommendations = computedGroup.locator('a[data-discovery-show-id]');
    await computedRecommendations.first().waitFor();
    const hiddenTarget = await computedRecommendations.evaluateAll((links, excludedId) => {
      const link = links.find((candidate) => candidate.dataset.discoveryShowId !== excludedId);
      return link ? { id: link.dataset.discoveryShowId, href: link.href } : null;
    }, repeatedShow.id);
    assert.ok(hiddenTarget?.id, "the Try Next fixture has a computed candidate besides the previously hidden show");
    const targetPage = await context.newPage();
    await targetPage.goto(hiddenTarget.href);
    const targetControl = targetPage.locator('[data-library-control="detail"]');
    await targetControl.waitFor();
    await targetControl.locator("summary").click();
    await targetControl.locator("[data-library-state-select]").selectOption("hidden");
    const hiddenRecommendation = computedGroup.locator(`a[data-discovery-show-id="${hiddenTarget.id}"]`);
    await assertEventually(async () => assert.equal(await hiddenRecommendation.count(), 0), 8_000);
    assert.ok(await targetPage.locator(".podcast-detail h1").textContent(), "the direct route for a Hidden show still renders");

    await personalPreference.uncheck();
    await assertEventually(async () => assert.match(await detailControl.locator(".library-control-status").textContent(), /Personal Discovery disabled/i), 8_000);
    await assertEventually(async () => assert.equal(await hiddenRecommendation.count(), 1), 8_000);
    await targetPage.close();
    await tryNextPage.close();

    const pageHtml = await (await fetch(repeatedShow.href)).text();
    assert.doesNotMatch(pageHtml, /data-library-state|private listener rating|personalContext|personalDiscovery/i);
    const writeRequests = requests.filter(({ method, url }) => method !== "GET" && !url.endsWith("/api/health") && !/\/api\/analytics\/events(?:\?|$)/.test(url));
    assert.deepEqual(writeRequests, [], "Library actions do not write personal state to the server");
    const analyticsRequests = requests.filter(({ url }) => /\/api\/analytics\/events(?:\?|$)/.test(url));
    for (const { body } of analyticsRequests) {
      assert.doesNotMatch(body, /libraryState|personalContext|privateRating|"state"\s*:|"rating"\s*:/i);
    }
    const requestsContainingPrivateValues = requests.filter(({ url, body }) => /"(?:state|rating|libraryState|privateRating|personalDiscoveryEnabled)"\s*:|\b(hidden|listening|saved|personalDiscovery)\b/i.test(`${url}\n${body}`));
    assert.deepEqual(requestsContainingPrivateValues, [], "Library status and private rating do not enter request URLs or bodies");
  } finally {
    await context.close();
  }
});

test("Personal Discovery refines existing search locally and restores public order when disabled or cleared", async () => {
  const context = await newContext();
  const requests = [];
  context.on("request", (request) => requests.push({ method: request.method(), url: request.url(), body: request.postData() || "" }));
  try {
    const home = await context.newPage();
    await home.setViewportSize({ width: 390, height: 844 });
    await home.goto(`${baseUrl}/`);
    await home.waitForSelector("#podcast-grid a[data-discovery-show-id]");
    await home.waitForSelector('[data-library-control="card"]');

    const search = async (query) => {
      const input = home.locator("#search");
      await input.fill(query);
      await input.press("Enter");
      await assertEventually(async () => {
        assert.ok((await home.locator("#resultsSummary").innerText()).includes(`results for "${query}"`));
      });
      return home.locator("#podcast-grid a[data-discovery-show-id]").evaluateAll((links) => links.map((link) => ({
        id: link.dataset.discoveryShowId,
        positionBucket: link.dataset.discoveryResultPositionBucket,
      })));
    };
    const baselineRows = await search("sci-fi");
    const baselineIds = baselineRows.map((row) => row.id);
    const baselinePositions = new Map(baselineRows.map((row) => [row.id, row.positionBucket]));
    assert.ok(baselineIds.includes("ars-paradoxica"), "the fixture Hidden show begins in the ordinary public search");
    assert.equal(baselinePositions.get("midnight-burger"), "25+", "the personalization fixture begins after the public top 24");

    const kingFallsDetail = await context.newPage();
    await kingFallsDetail.goto(`${baseUrl}/shows/king-falls-am`);
    const kingFallsControl = kingFallsDetail.locator('[data-library-control="detail"]');
    await kingFallsControl.waitFor();
    await kingFallsControl.locator("summary").click();
    await kingFallsControl.locator("[data-library-state-select]").selectOption("saved");
    await assertEventually(async () => assert.match(await kingFallsControl.locator(".library-control-status").textContent(), /Library state changed to Saved/i));
    await kingFallsControl.locator("[data-library-rating-select]").selectOption("5");
    await assertEventually(async () => assert.match(await kingFallsControl.locator(".library-control-status").textContent(), /private rating is 5 of 5/i));
    const preference = kingFallsControl.locator("[data-library-discovery-preference]");
    await preference.check();
    await assertEventually(async () => {
      assert.equal(await preference.isChecked(), true);
      assert.match(await kingFallsControl.locator(".library-control-status").textContent(), /Personal Discovery enabled/i);
    });
    const homeRuntimeState = await home.evaluate(async () => {
      const { getLibraryRuntimeState } = await import("/shared/app/library/runtime.js");
      const runtimeState = getLibraryRuntimeState();
      return {
        loading: runtimeState.loading,
        available: runtimeState.storageAvailable,
        personalDiscoveryError: runtimeState.personalDiscoveryError?.code || null,
        personalContext: runtimeState.personalContext,
      };
    });
    assert.equal(homeRuntimeState.loading, false);
    assert.equal(homeRuntimeState.available, true);
    assert.equal(homeRuntimeState.personalContext.enabled, true, "the other tab receives the explicit opt-in");
    assert.ok(homeRuntimeState.personalContext.entries.some((entry) => entry.showId === "king-falls-am" && entry.rating === 5), "the other tab receives the local rating anchor");
    await assertEventually(async () => {
      const ids = await home.locator("#podcast-grid a[data-discovery-show-id]").evaluateAll((links) => links.map((link) => link.dataset.discoveryShowId));
      const reason = await home.locator("#personalDiscoveryReason").textContent();
      assert.match(reason, /tone .+ discovery tags .+ King Falls AM, which you rated 5\/5/i, `the moved candidate has a grounded reason (${JSON.stringify({ homeRuntimeState, reason })})`);
      assert.notDeepEqual(ids, baselineIds, "the existing result order updates in the other tab");
      assert.ok(ids.indexOf("midnight-burger") < baselineIds.indexOf("midnight-burger"), "a public-similarity match moves up modestly");
    });
    assert.equal(await home.locator("#personalDiscoveryReason").getAttribute("role"), "note");
    assert.equal(await home.locator("#personalDiscoveryReason").getAttribute("aria-live"), "off");
    assert.equal(await home.locator("#personalDiscoveryReason").isVisible(), true, "the grounded explanation is available without hover");
    const mobileReasonBounds = await home.locator("#personalDiscoveryReason").boundingBox();
    assert.ok(mobileReasonBounds && mobileReasonBounds.x >= 0 && mobileReasonBounds.x + mobileReasonBounds.width <= 390, "the reason stays inside the mobile viewport");

    const arsDetail = await context.newPage();
    await arsDetail.goto(`${baseUrl}/shows/ars-paradoxica`);
    const arsControl = arsDetail.locator('[data-library-control="detail"]');
    await arsControl.waitFor();
    await arsControl.locator("summary").click();
    await arsControl.locator("[data-library-state-select]").selectOption("hidden");
    await assertEventually(async () => assert.match(await arsControl.locator(".library-control-status").textContent(), /Library state changed to Hidden/i));
    await assertEventually(async () => {
      const ids = await home.locator("#podcast-grid a[data-discovery-show-id]").evaluateAll((links) => links.map((link) => link.dataset.discoveryShowId));
      assert.equal(ids.includes("ars-paradoxica"), false, "Hidden suppresses that exact result in the existing broad search");
    });

    const directTitleRows = await search("Ars Paradoxica");
    assert.ok(directTitleRows.some((row) => row.id === "ars-paradoxica"), "an explicit exact-title search still finds a Hidden show");
    await search("sci-fi");
    await home.reload();
    await assertEventually(async () => {
      const ids = await home.locator("#podcast-grid a[data-discovery-show-id]").evaluateAll((links) => links.map((link) => link.dataset.discoveryShowId));
      assert.equal(ids.includes("ars-paradoxica"), false, "the enabled Hidden preference survives reload");
      assert.match(await home.locator("#personalDiscoveryReason").textContent(), /King Falls AM, which you rated 5\/5/i);
    });

    await preference.uncheck();
    await assertEventually(async () => {
      assert.equal(await preference.isChecked(), false);
      assert.match(await kingFallsControl.locator(".library-control-status").textContent(), /Personal Discovery disabled/i);
    });
    const disabledRows = await search("sci-fi");
    assert.deepEqual(disabledRows, baselineRows, "disabling restores exact public result IDs, order, and position buckets");
    assert.equal(await home.locator("#personalDiscoveryReason").isVisible(), false, "disabling clears the personal reason");

    await preference.check();
    await assertEventually(async () => assert.equal(await preference.isChecked(), true));
    await assertEventually(async () => {
      const ids = await home.locator("#podcast-grid a[data-discovery-show-id]").evaluateAll((links) => links.map((link) => link.dataset.discoveryShowId));
      assert.equal(ids.includes("ars-paradoxica"), false);
    });
    await arsControl.locator("[data-library-remove]").click();
    await assertEventually(async () => {
      const ids = await home.locator("#podcast-grid a[data-discovery-show-id]").evaluateAll((links) => links.map((link) => link.dataset.discoveryShowId));
      assert.ok(ids.includes("ars-paradoxica"), "removing the Hidden entry restores that exact result while opt-in remains on");
    });
    await kingFallsDetail.goto(`${baseUrl}/shows/king-falls-am`);
    const kingFallsRemoveControl = kingFallsDetail.locator('[data-library-control="detail"]');
    await kingFallsRemoveControl.waitFor();
    await kingFallsRemoveControl.locator("summary").click();
    await kingFallsRemoveControl.locator("[data-library-remove]").click();
    await assertEventually(async () => {
      const homeRuntime = await home.evaluate(async () => {
        const { getLibraryRuntimeState } = await import("/shared/app/library/runtime.js");
        const state = getLibraryRuntimeState();
        return { loading: state.loading, enabled: state.personalContext?.enabled, entries: state.personalContext?.entries?.length };
      });
      assert.equal(homeRuntime.loading, false);
      assert.equal(homeRuntime.entries, 0, "the final cross-tab Library removal reaches the search tab");
      const clearedRows = await home.locator("#podcast-grid a[data-discovery-show-id]").evaluateAll((links) => links.map((link) => ({
        id: link.dataset.discoveryShowId,
        positionBucket: link.dataset.discoveryResultPositionBucket,
      })));
      assert.deepEqual(clearedRows, baselineRows, "clearing the final Library entry restores exact public search order");
    });
    assert.equal(await home.locator("#personalDiscoveryReason").isVisible(), false, "clearing removes stale explanation text");

    const urlAndHistory = await home.evaluate(() => `${location.href}\n${JSON.stringify(history.state)}`);
    assert.doesNotMatch(urlAndHistory, /personalContext|personalDiscovery|privateRating|"rating"|"state"|hidden|listening|saved/i);
    const nonAnalyticsWrites = requests.filter(({ method, url }) => method !== "GET" && !/\/api\/analytics\/events(?:\?|$)/.test(url));
    assert.deepEqual(nonAnalyticsWrites, [], "Library state and preference do not write to the server");
    const privateNetworkRequests = requests.filter(({ url, body }) => (
      /personalContext|personalDiscovery|privateRating|libraryState/i.test(`${url}\n${body}`)
        || /(?:[?&])(?:personalDiscoveryEnabled|state|rating)=(?:true|false|hidden|listening|saved|finished|dropped|[1-5])(?:&|$)/i.test(url)
        || /"(?:state|rating)"\s*:\s*(?:"(?:hidden|listening|saved|finished|dropped)"|[1-5])\b/i.test(body)
    ));
    assert.deepEqual(privateNetworkRequests, [], "local statuses, preference, and private ratings do not enter request URLs or bodies");
  } finally {
    await context.close();
  }
});

test("storage denial stays visible and disables Library changes without blocking browse", async () => {
  const context = await newContext();
  try {
    await context.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/`);
    const control = page.locator('[data-library-control="card"]').first();
    const summary = control.locator("summary");
    await assertEventually(async () => assert.equal(await summary.textContent(), "Unavailable"));
    assert.match(await summary.getAttribute("aria-label"), /unavailable/i);
    assert.equal(await summary.evaluate((node) => node.tabIndex), 0);
    await summary.click();
    assert.equal(await control.locator("[data-library-state-select]").isDisabled(), true);
    await assertEventually(async () => assert.match(await control.locator(".library-control-status").textContent(), /Local Library unavailable/i));
    assert.ok(await page.locator("#podcast-grid .podcast-card-shell").count() > 0, "ordinary browsing remains available");
  } finally {
    await context.close();
  }
});
