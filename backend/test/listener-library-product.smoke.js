const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { after, before, test } = require("node:test");
const { chromium } = require("playwright");
const { findFreePort } = require("./helpers/free-port");

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
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVE_STATIC: "true",
      STATIC_ROOT: repositoryRoot,
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

function makeBackup(entries) {
  return {
    format: "the-echo-archives.listener-library",
    schemaVersion: 1,
    exportedAt: "2026-09-28T12:00:00.000Z",
    entries: entries.map((entry) => ({
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T11:00:00.000Z",
      ...entry,
    })),
  };
}

async function newContext() {
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
  context.setDefaultTimeout(5_000);
  context.setDefaultNavigationTimeout(8_000);
  return context;
}

test("/library is a private generated shell, excluded from indexing, sitemap, and analytics", async () => {
  const response = await fetch(`${baseUrl}/library`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/i);
  const html = await response.text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(html, /data-analytics-enabled="false"/);
  assert.match(html, /<noscript>[\s\S]*JavaScript and browser storage are required/);
  assert.match(html, /This Library belongs to this browser and device/);
  assert.match(html, /library\.css\?v=[a-f0-9]+/);
  assert.match(html, /data-library-version="[a-f0-9]+"/);
  assert.doesNotMatch(html, /personalDiscoveryEnabled|titleSnapshot|createdAt|updatedAt|echo-listener-library-recovery/);
  assert.doesNotMatch(html, /id="personalContext"|data-library-state="(?:saved|listening|finished|dropped|hidden)"/);

  const sitemap = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  assert.doesNotMatch(sitemap, /\/library(?:<|\/)/);
  const showResponse = await fetch(`${baseUrl}/shows/solar`);
  assert.equal(showResponse.status, 200);
  assert.match(await showResponse.text(), /class="detail-actions"/);

  const noScriptContext = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
  try {
    const page = await noScriptContext.newPage();
    await page.goto(`${baseUrl}/library`);
    await page.getByRole("heading", { name: "JavaScript and browser storage are required for your Library" }).waitFor();
    await page.getByRole("link", { name: "Browse the archive" }).waitFor();
  } finally {
    await noScriptContext.close();
  }
});

test("Library UI integrates cards, show detail, local management, import/export, and tabs", async () => {
  const context = await newContext();
  const requests = [];
  const responses = [];
  context.on("request", (request) => requests.push({
    method: request.method(),
    url: request.url(),
    body: request.postData() || "",
  }));
  context.on("response", (response) => responses.push({ status: response.status(), url: response.url() }));
  let releaseCatalogue;
  let catalogueRouteInstalled = false;
  let libraryTab;
  try {
    const browse = await context.newPage();
    await browse.goto(`${baseUrl}/`);
    await browse.waitForSelector(".podcast-card-shell .library-card-summary");
    const repeatedShow = await browse.evaluate(() => {
      const archiveCards = [...document.querySelectorAll("#podcast-grid a[data-discovery-show-id]")];
      const popularIds = new Set([...document.querySelectorAll(".popular-card-shell a[data-discovery-show-id]")].map((anchor) => anchor.dataset.discoveryShowId));
      const anchor = archiveCards.find((candidate) => popularIds.has(candidate.dataset.discoveryShowId));
      if (!anchor) return null;
      return { id: anchor.dataset.discoveryShowId, href: anchor.href, title: anchor.querySelector("h2")?.textContent?.trim() || "" };
    });
    assert.ok(repeatedShow?.id, "home should contain a show repeated in the popular rail and archive grid");
    const repeatedControls = browse.locator(`[data-library-control="card"][data-library-show-id="${repeatedShow.id}"]`);
    await assertEventually(async () => assert.ok(await repeatedControls.count() >= 2));

    const cardSummary = repeatedControls.first().locator("summary");
    await cardSummary.focus();
    await cardSummary.press("Enter");
    await assertEventually(async () => assert.equal(await repeatedControls.first().evaluate((node) => node.open), true));
    const savedAction = repeatedControls.first().locator('[data-library-state-action="saved"]');
    await savedAction.focus();
    await savedAction.press("Escape");
    await assertEventually(async () => {
      assert.equal(await repeatedControls.first().evaluate((node) => node.open), false);
      assert.equal(await cardSummary.evaluate((node) => node === document.activeElement), true);
    });
    await cardSummary.press("Enter");
    await assertEventually(async () => assert.equal(await repeatedControls.first().evaluate((node) => node.open), true));
    await savedAction.focus();
    await savedAction.press("Enter");
    await assertEventually(async () => {
      const labels = await repeatedControls.locator("summary").allTextContents();
      assert.ok(labels.every((label) => label.includes("Saved")), JSON.stringify(labels));
      assert.equal(await repeatedControls.first().evaluate((node) => node.open), false);
      assert.equal(await repeatedControls.first().locator("summary").evaluate((node) => node === document.activeElement), true);
    });
    const cardEntry = await browse.evaluate((showId) => new Promise((resolve, reject) => {
      const request = indexedDB.open("echo-archives-listener-library", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const get = database.transaction("entries", "readonly").objectStore("entries").get(showId);
        get.onsuccess = () => { database.close(); resolve(get.result); };
        get.onerror = () => { database.close(); reject(get.error); };
      };
    }), repeatedShow.id);
    assert.equal(Object.hasOwn(cardEntry, "titleSnapshot"), false, "known catalogue shows do not need stored title snapshots");

    libraryTab = await context.newPage();
    await libraryTab.goto(`${baseUrl}/library`);
    await libraryTab.waitForSelector("#listenerLibraryApp:not([hidden])");
    await assertEventually(async () => assert.ok((await libraryTab.locator("#libraryPageStatus").textContent()).trim()));
    await libraryTab.waitForFunction(() => ["available", "unavailable"].includes(document.getElementById("listenerLibraryApp")?.dataset.libraryCatalogueState));
    assert.equal(await libraryTab.locator("#listenerLibraryApp").getAttribute("data-library-catalogue-state"), "available", await libraryTab.locator("#libraryPageStatus").textContent());
    const catalogueStatus = await libraryTab.locator("#libraryPageStatus").textContent();
    assert.match(catalogueStatus, /stored in this browser/, `catalogue IDs should be available for exact import preview resolution: ${catalogueStatus}`);
    const libraryRow = libraryTab.locator(`[data-library-show-id="${repeatedShow.id}"]`);
    await libraryRow.waitFor();
    const libraryState = libraryRow.locator("[data-library-state-select]");
    assert.equal(await libraryState.inputValue(), "saved");
    await libraryState.focus();
    await libraryState.selectOption("listening");
    await assertEventually(async () => {
      assert.equal(await libraryRow.locator("[data-library-state-select]").inputValue(), "listening");
      assert.equal(await libraryRow.locator("[data-library-state-select]").evaluate((node) => node === document.activeElement), true);
    });

    const detail = await context.newPage();
    const detailErrors = [];
    detail.on("pageerror", (error) => detailErrors.push(error.message));
    const detailResponse = await detail.goto(repeatedShow.href);
    await detail.waitForSelector(".podcast-detail .detail-actions", { timeout: 8_000 }).catch(async () => {
      const details = await detail.evaluate(() => ({
        url: location.href,
        bodyClass: document.body.className,
        title: document.title,
        showRoot: document.getElementById("showRoot")?.innerHTML.slice(0, 600) || "",
        libraryBound: document.documentElement.dataset.listenerLibraryBound || "",
      }));
      throw new Error(`Show detail did not render: status=${detailResponse?.status()} ${JSON.stringify(details)} pageErrors=${JSON.stringify(detailErrors)}`);
    });
    const detailControl = detail.locator('[data-library-control="detail"]');
    await detailControl.waitFor({ timeout: 5_000 }).catch(async () => {
      const details = await detail.evaluate(() => ({
        url: location.href,
        actions: document.querySelectorAll(".podcast-detail .detail-actions").length,
        libraryBound: document.documentElement.dataset.listenerLibraryBound || "",
        integrationStatus: document.getElementById("libraryGlobalStatus")?.textContent || "",
      }));
      throw new Error(`Library detail control was not added: ${JSON.stringify(details)} pageErrors=${JSON.stringify(detailErrors)}`);
    });
    assert.equal(await detailControl.locator("[data-library-state-select]").inputValue(), "listening");
    assert.ok(await detail.locator(".detail-actions a").count() > 0, "listen actions remain above the Library panel");
    await detailControl.locator("[data-library-state-select]").selectOption("dropped");
    await assertEventually(async () => {
      assert.equal(await detailControl.locator("[data-library-state-select]").inputValue(), "dropped");
      assert.equal(await libraryRow.locator("[data-library-state-select]").inputValue(), "dropped");
      const labels = await repeatedControls.locator("summary").allTextContents();
      assert.ok(labels.every((label) => label.includes("Dropped")), JSON.stringify(labels));
    });

    await detailControl.locator("[data-library-rating-select]").selectOption("4");
    await assertEventually(async () => assert.equal(await libraryRow.locator("[data-library-rating-select]").inputValue(), "4"));
    assert.match(await detailControl.locator(".library-detail-rating-note").textContent(), /never submits a Community Rating/);

    const libraryFilter = libraryTab.locator('[data-library-filter="dropped"]');
    await libraryFilter.click();
    assert.equal(await libraryRow.isVisible(), true);
    await libraryTab.locator("#librarySort").selectOption("title");
    await libraryTab.locator("#librarySearch").fill(repeatedShow.title);
    await assertEventually(async () => assert.equal(await libraryRow.count(), 1));
    await libraryTab.locator("#librarySearch").fill("no local match exists");
    await libraryTab.getByRole("heading", { name: "No matching shows" }).waitFor();
    await libraryTab.locator("#librarySearch").fill("");
    await libraryTab.locator('[data-library-filter="all"]').click();

    await libraryRow.locator("[data-library-rating-select]").selectOption("");
    await assertEventually(async () => assert.equal(await detailControl.locator("[data-library-rating-select]").inputValue(), ""));

    const enabledPreference = libraryTab.locator("#libraryPersonalDiscovery");
    await enabledPreference.check();
    await assertEventually(async () => assert.match(await libraryTab.locator("#libraryPreferenceStatus").textContent(), /not using the preference yet/));

    let markCatalogueRequest;
    const catalogueRequestSeen = new Promise((resolve) => { markCatalogueRequest = resolve; });
    const catalogueGate = new Promise((resolve) => { releaseCatalogue = resolve; });
    await libraryTab.route("**/data/shows.json*", async (route) => {
      markCatalogueRequest();
      await catalogueGate;
      try {
        await route.continue();
      } catch (error) {
        if (!/already handled|aborted/i.test(error?.message || "")) throw error;
      }
    });
    catalogueRouteInstalled = true;
    await libraryTab.reload();
    await libraryTab.waitForSelector("#listenerLibraryApp:not([hidden])");
    await catalogueRequestSeen;
    await assertEventually(async () => assert.equal(await libraryTab.locator("#libraryPersonalDiscovery").isChecked(), true));

    const mergeBackup = makeBackup([
      { showId: repeatedShow.id, state: "finished", rating: 3 },
      { showId: "retired-library-import-fixture", state: "hidden", titleSnapshot: "Retired Transmission" },
    ]);
    await libraryTab.locator("#libraryImportFile").setInputFiles({
      name: "merge-library.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(mergeBackup)),
    });
    await libraryTab.locator("#libraryImportPreview:not([hidden])").waitFor();
    await libraryTab.getByText("Current catalogue data was unavailable, so unknown IDs could not be checked.").waitFor();
    releaseCatalogue();
    releaseCatalogue = null;
    await libraryTab.waitForFunction(() => document.getElementById("listenerLibraryApp")?.dataset.libraryCatalogueState === "available");
    assert.match(await libraryTab.locator("#libraryImportPreviewContent").textContent(), /2 entries in this file/);
    assert.match(await libraryTab.locator("#libraryImportPreviewContent").textContent(), /Same-ID conflicts \(1\)/);
    await assertEventually(async () => assert.match(await libraryTab.locator("#libraryImportPreviewContent").textContent(), /Unresolved IDs \(1\)/));
    assert.doesNotMatch(await libraryTab.locator("#libraryImportPreviewContent").textContent(), /catalogue data was unavailable/);
    assert.match(await libraryTab.locator("#libraryImportPreviewContent").textContent(), /Finished: 1/);
    await libraryTab.getByRole("button", { name: "Merge into Library" }).click();
    await assertEventually(async () => {
      assert.equal(await libraryTab.locator(`[data-library-show-id="${repeatedShow.id}"] [data-library-state-select]`).inputValue(), "finished");
      assert.equal(await detailControl.locator("[data-library-state-select]").inputValue(), "finished");
      assert.equal(await libraryTab.locator("#libraryPersonalDiscovery").isChecked(), true);
    });
    await libraryTab.locator("#libraryUnresolvedEntries").getByText("Retired Transmission").waitFor();

    const canceledBackup = makeBackup([{ showId: "canceled-library-import-fixture", state: "saved" }]);
    await libraryTab.locator("#libraryImportFile").setInputFiles({
      name: "canceled-library.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(canceledBackup)),
    });
    await libraryTab.locator("#libraryImportPreview:not([hidden])").waitFor();
    await libraryTab.getByRole("button", { name: "Cancel import" }).click();
    await assertEventually(async () => assert.equal(await libraryTab.locator("#libraryImportPreview").isHidden(), true));
    assert.equal(await libraryTab.locator('[data-library-show-id="canceled-library-import-fixture"]').count(), 0);

    const replaceBackup = makeBackup([{ showId: "retired-library-replacement", state: "dropped", rating: 5, titleSnapshot: "Replacement Broadcast" }]);
    await libraryTab.locator("#libraryImportFile").setInputFiles({
      name: "replace-library.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(replaceBackup)),
    });
    await libraryTab.locator("#libraryImportPreview:not([hidden])").waitFor();
    await libraryTab.getByRole("radio", { name: "Replace" }).check();
    const replaceButton = libraryTab.getByRole("button", { name: "Review Replace" });
    await replaceButton.click();
    const replaceDialog = libraryTab.locator("#libraryReplaceDialog");
    await assertEventually(async () => assert.equal(await replaceDialog.evaluate((node) => node.open), true));
    assert.equal(await libraryTab.locator("#libraryReplaceConfirmButton").isDisabled(), true);
    await libraryTab.keyboard.press("Escape");
    await assertEventually(async () => assert.equal(await replaceDialog.evaluate((node) => node.open), false));
    assert.equal(await replaceButton.evaluate((node) => node === document.activeElement), true, "Escape returns focus to the Replace review button");
    assert.equal(await libraryTab.locator(`[data-library-show-id="${repeatedShow.id}"]`).count(), 1, "Escape leaves the Library unchanged");
    await replaceButton.click();
    await assertEventually(async () => assert.equal(await replaceDialog.evaluate((node) => node.open), true));
    await libraryTab.locator("#libraryReplaceCancelButton").click();
    await assertEventually(async () => assert.equal(await libraryTab.locator('[data-library-show-id="' + repeatedShow.id + '"]').count(), 1));
    assert.equal(await libraryTab.locator("#libraryPersonalDiscovery").isChecked(), true);

    await replaceButton.click();
    await libraryTab.locator("#libraryReplaceAcknowledgement").check();
    await libraryTab.locator("#libraryReplaceConfirmButton").click();
    const replacementRow = libraryTab.locator('[data-library-show-id="retired-library-replacement"]');
    await replacementRow.waitFor();
    assert.equal(await replacementRow.locator("[data-library-state-select]").inputValue(), "dropped");
    assert.equal(await replacementRow.locator("[data-library-rating-select]").inputValue(), "5");
    assert.equal(await libraryTab.locator("#libraryPersonalDiscovery").isChecked(), true);
    await libraryTab.locator("#libraryUnresolvedEntries").getByText("Replacement Broadcast").waitFor();

    const downloadPromise = libraryTab.waitForEvent("download");
    await libraryTab.getByRole("button", { name: "Download Library backup" }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(exported.entries.length, 1);
    assert.equal(exported.entries[0].showId, "retired-library-replacement");
    assert.equal(Object.hasOwn(exported, "personalDiscoveryEnabled"), false);

    await replacementRow.locator("[data-library-rating-select]").selectOption("");
    await assertEventually(async () => assert.equal(await libraryTab.locator('[data-library-show-id="retired-library-replacement"] [data-library-rating-select]').inputValue(), ""));
    await libraryTab.getByRole("button", { name: "Remove Replacement Broadcast from your Library" }).click();
    await assertEventually(async () => assert.equal(await libraryTab.locator('[data-library-show-id="retired-library-replacement"]').count(), 0));
    await libraryTab.getByRole("heading", { name: "Your Library is empty" }).waitFor();

    await browse.setViewportSize({ width: 390, height: 844 });
    await browse.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await browse.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    assert.equal(await browse.locator(".library-card-control").first().evaluate((node) => getComputedStyle(node).transitionProperty), "none");
    assert.equal(await browse.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Library controls should not cause horizontal browse overflow on mobile");

    const directResponse = await fetch(`${baseUrl}/library`);
    const directHtml = await directResponse.text();
    assert.doesNotMatch(directHtml, /retired-library-replacement|Replacement Broadcast|canceled-library-import-fixture/);
    const personalPayloadRequests = requests.filter(({ url, body }) => /retired-library-|Replacement Broadcast|canceled-library-import-fixture/.test(`${url}\n${body}`));
    assert.deepEqual(personalPayloadRequests, []);
    const apiWrites = requests.filter(({ method, url }) => method !== "GET" && !/\/api\/analytics\/events(?:\?|$)/.test(url) && !url.endsWith("/api/health"));
    assert.deepEqual(apiWrites, [], "Library interactions do not write personal state to an API");
    const analyticsRequests = requests.filter(({ url }) => /\/api\/analytics/.test(url));
    const libraryAnalyticsRequests = analyticsRequests.filter(({ body }) => {
      try {
        const event = JSON.parse(body);
        return event.pagePath === "/library" || /library/i.test(event.eventName || "");
      } catch {
        return true;
      }
    });
    assert.deepEqual(libraryAnalyticsRequests, [], "the Library page does not enable Echo analytics or emit Library events");
  } finally {
    releaseCatalogue?.();
    if (catalogueRouteInstalled) await libraryTab.unroute("**/data/shows.json*").catch(() => {});
    await context.close();
  }
});

test("show detail Library control appears after asynchronous page hydration", async () => {
  const context = await newContext();
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/`);
    const sourceAnchor = page.locator("#podcast-grid a[data-discovery-show-id]").first();
    await sourceAnchor.waitFor();
    const href = await sourceAnchor.getAttribute("href");
    const showId = await sourceAnchor.getAttribute("data-discovery-show-id");
    const response = await page.goto(new URL(href, baseUrl).href);
    await page.waitForSelector(".podcast-detail .detail-actions", { timeout: 5_000 }).catch(async () => {
      const evaluation = page.evaluate(() => ({
          path: location.pathname,
          search: location.search,
          bodyClass: document.body.className,
          title: document.title,
          root: document.getElementById("showRoot")?.innerHTML.slice(0, 700) || "",
        }))
        .catch((error) => ({ evaluationError: error.message }));
      const state = await Promise.race([evaluation, new Promise((resolve) => setTimeout(() => resolve({ evaluationError: "page evaluation timed out" }), 2_000))]);
      throw new Error(`Show action surface did not render: source=${JSON.stringify({ href, id: showId })} status=${response?.status()} state=${JSON.stringify(state)}`);
    });
    const control = page.locator('[data-library-control="detail"]');
    await control.waitFor({ timeout: 5_000 }).catch(async () => {
      const state = await page.evaluate(() => ({
        path: location.pathname,
        bodyClass: document.body.className,
        root: document.getElementById("showRoot")?.innerHTML.slice(0, 500) || "",
        bound: document.documentElement.dataset.listenerLibraryBound || "",
      }));
      throw new Error(`No Library detail control: status=${response?.status()} state=${JSON.stringify(state)} errors=${JSON.stringify(pageErrors)}`);
    });
    assert.equal(await control.locator("[data-library-state-select]").isVisible(), true);
    assert.equal(await page.locator(".detail-actions a").count() > 0, true);
  } finally {
    await context.close();
  }
});

test("storage denial stays honest and malformed persisted rows remain recoverable", async () => {
  const unavailableContext = await newContext();
  try {
    await unavailableContext.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    });
    const page = await unavailableContext.newPage();
    await page.goto(`${baseUrl}/`);
    const summary = page.locator(".library-card-summary").first();
    await summary.waitFor();
    await assertEventually(async () => assert.match(await summary.textContent(), /Local saving unavailable/));
    assert.equal(await summary.evaluate((node) => node.tabIndex), 0);
    assert.equal(await page.locator("[data-library-state-action]").first().isDisabled(), true);
  } finally {
    await unavailableContext.close();
  }

  const recoveryContext = await newContext();
  try {
    const page = await recoveryContext.newPage();
    await page.goto(`${baseUrl}/library`);
    await page.waitForSelector("#listenerLibraryApp:not([hidden])");
    await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("echo-archives-listener-library", 1);
      request.onsuccess = () => {
        const transaction = request.result.transaction("entries", "readwrite");
        transaction.objectStore("entries").put({ showId: "malformed-library-row", state: "not-a-state", createdAt: "bad", updatedAt: "bad", extra: "preserve this raw data" });
        transaction.oncomplete = () => { request.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    }));
    await page.reload();
    await page.waitForSelector("#listenerLibraryApp:not([hidden])");
    await assertEventually(async () => assert.match(await page.locator("#libraryPageStatus").textContent(), /malformed|recover|could not be read/i));
    await page.locator(".library-recovery-details > summary").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download raw recovery snapshot" }).click();
    const download = await downloadPromise;
    const recovery = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(recovery.entries.find((entry) => entry.showId === "malformed-library-row").extra, "preserve this raw data");
    assert.match(await page.locator("#libraryRecoveryStatus").textContent(), /Keep the raw recovery file private/);
  } finally {
    await recoveryContext.close();
  }
});

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

test("the latest Library backup selection wins when an earlier file read is delayed", async () => {
  const context = await newContext();
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const readFileText = File.prototype.text;
      Object.defineProperty(File.prototype, "text", {
        configurable: true,
        value() {
          if (this.name !== "slow-backup.json") return readFileText.call(this);
          return new Promise((resolve, reject) => {
            window.releaseSlowBackupRead = () => readFileText.call(this).then(resolve, reject);
          });
        },
      });
    });
    await page.goto(`${baseUrl}/library`);
    await page.waitForSelector("#listenerLibraryApp:not([hidden])");
    await page.waitForFunction(() => document.getElementById("listenerLibraryApp")?.dataset.libraryCatalogueState === "available");

    const importFile = page.locator("#libraryImportFile");
    const staleFile = makeBackup([{ showId: "stale-import-selection", state: "saved", titleSnapshot: "Older delayed backup" }]);
    const currentFile = makeBackup([{ showId: "current-import-selection", state: "saved", titleSnapshot: "Most recently selected backup" }]);
    await importFile.setInputFiles({
      name: "slow-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(staleFile)),
    });
    await page.waitForFunction(() => typeof window.releaseSlowBackupRead === "function");
    await importFile.setInputFiles({
      name: "current-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(currentFile)),
    });
    await page.getByText(/Most recently selected backup/).waitFor();

    await page.evaluate(() => window.releaseSlowBackupRead());
    await page.waitForTimeout(100);
    const previewText = await page.locator("#libraryImportPreviewContent").textContent();
    assert.match(previewText, /Most recently selected backup/);
    assert.doesNotMatch(previewText, /Older delayed backup/);
  } finally {
    await context.close();
  }
});
