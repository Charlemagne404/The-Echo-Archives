const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const SHARED_ROOT = path.join(ROOT, "shared");
let browser;
let server;
let baseUrl;

function fixtureMarkup(enabled = true, homePage = false) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Discovery analytics fixture</title></head>
  <body${homePage ? ' class="home-page"' : ""} data-analytics-enabled="${enabled ? "true" : "false"}" data-archivist-enabled="false">
    <a id="listen" href="https://example.com/listen?utm_source=echo" target="_blank" rel="noreferrer" data-discovery-listen-show-id="fixture-show" data-discovery-provider="spotify" data-discovery-link-role="primary" data-discovery-surface="show_page_hero" data-discovery-content-profile="full_review"><span>Listen</span></a>
    <a id="collection-clone" href="#clone" data-collection-clone="true" data-discovery-collection-id="fixture-collection" data-discovery-collection-kind="curated" data-discovery-surface="collections_directory">Clone</a>
    <a id="collection" href="#collection" data-discovery-collection-id="fixture-collection" data-discovery-collection-kind="curated" data-discovery-surface="collections_directory"><span>Collection</span></a>
    <a id="synthetic-show" href="javascript:void(0)" data-discovery-show-id="fixture-show" data-discovery-surface="home_archive_grid" data-discovery-browse-state="default" data-discovery-result-type="show_card" data-discovery-recommendation-source="none" data-discovery-result-position-bucket="1" data-discovery-content-profile="full_review">Synthetic show</a>
    <a id="synthetic-show-duplicate" href="javascript:void(0)"${homePage ? ' style="display:none"' : ""} data-discovery-show-id="fixture-show" data-discovery-surface="home_archive_grid" data-discovery-browse-state="default" data-discovery-result-type="show_card" data-discovery-recommendation-source="none" data-discovery-result-position-bucket="2-4" data-discovery-content-profile="full_review">Same show on another card</a>
    <script>
      window.EchoArchiveSearch = {};
      window.EchoArchiveSimilarity = {};
      window.EchoArchiveRecord = {};
    </script>
    <script type="module">
      import { initializeApp } from "/shared/app/app.js";
      initializeApp().catch((error) => console.error(error));
    </script>
  </body>
</html>`;
}

function createFixtureServer() {
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/discovery-fixture") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(fixtureMarkup(requestUrl.searchParams.get("disabled") !== "1", requestUrl.searchParams.get("home") === "1"));
      return;
    }

    if (["/api/analytics/events", "/api/analytics/events/batch"].includes(requestUrl.pathname)) {
      response.writeHead(204);
      response.end();
      return;
    }

    if (requestUrl.pathname === "/sw.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(fs.readFileSync(path.join(ROOT, "sw.js")));
      return;
    }

    const relativePath = requestUrl.pathname.replace(/^\/+/, "");
    const filePath = path.resolve(ROOT, relativePath);
    if (!filePath.startsWith(`${SHARED_ROOT}${path.sep}`) || !filePath.endsWith(".js")) {
      response.writeHead(404);
      response.end();
      return;
    }

    try {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(fs.readFileSync(filePath));
    } catch (_error) {
      response.writeHead(404);
      response.end();
    }
  });
}

function listen(serverToStart) {
  return new Promise((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(0, "127.0.0.1", () => {
      const address = serverToStart.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test.before(async () => {
  server = createFixtureServer();
  baseUrl = await listen(server);
  browser = await chromium.launch();
});

test("show-card impressions require visibility and are batched once per show and surface", async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const impressionRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/analytics/events/batch" && request.postData()) {
      impressionRequests.push(JSON.parse(request.postData()));
    }
  });

  try {
    await page.goto(`${baseUrl}/discovery-fixture`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body?.dataset.appReady === "true");
    await page.waitForFunction(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/api/analytics/events/batch")), undefined, { timeout: 5_000 });
    await page.waitForTimeout(100);

    const events = impressionRequests.flatMap((request) => request.events || []);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventName, "Show Card Impression");
    assert.deepEqual(events[0].properties, {
      show_id: "fixture-show",
      discovery_surface: "home_archive_grid",
      browse_state: "default",
      result_position_bucket: "1",
    });
  } finally {
    await page.close();
  }
});

test("home impressions and opens wait for sorted card positions", async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const requests = [];
  page.on("request", (request) => {
    if (["/api/analytics/events", "/api/analytics/events/batch"].includes(new URL(request.url()).pathname) && request.postData()) {
      requests.push({ path: new URL(request.url()).pathname, payload: JSON.parse(request.postData()) });
    }
  });

  try {
    await page.goto(`${baseUrl}/discovery-fixture?home=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body?.dataset.appReady === "true");
    assert.equal(await page.locator("body").getAttribute("data-home-popularity-ready"), "false");
    await page.locator("#synthetic-show").click();
    await page.waitForTimeout(800);
    assert.equal(requests.flatMap(({ payload }) => payload.events || [payload]).filter(({ eventName }) => eventName === "Show Opened").length, 0);
    assert.equal(requests.flatMap(({ payload }) => payload.events || []).filter(({ eventName }) => eventName === "Show Card Impression").length, 0);

    await page.evaluate(() => {
      document.body.dataset.homePopularityReady = "true";
      document.querySelector("#synthetic-show").dataset.discoveryResultPositionBucket = "5-9";
      document.dispatchEvent(new Event("echo:home-popularity-ready"));
    });
    await page.locator("#synthetic-show").click();
    await page.waitForFunction(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/api/analytics/events/batch")));
    await page.waitForTimeout(350);

    const events = requests.flatMap(({ payload }) => payload.events || [payload]);
    const opened = events.find(({ eventName }) => eventName === "Show Opened");
    const impression = events.find(({ eventName }) => eventName === "Show Card Impression");
    assert.equal(opened?.properties.result_position_bucket, "5-9");
    assert.equal(impression?.properties.result_position_bucket, "5-9");
  } finally {
    await page.close();
  }
});

test.after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test("delegated analytics ignores clones and synthetic clicks while direct listening navigation succeeds", async () => {
  const page = await browser.newPage();
  const analyticsRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/analytics/events" && request.postData()) {
      analyticsRequests.push(JSON.parse(request.postData()));
    }
  });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  const fixtureUrl = `${baseUrl}/discovery-fixture?q=raw%20query#archive`;

  try {
    await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body?.dataset.appReady === "true");

    await page.locator("#collection-clone").click();
    await page.evaluate(() => history.replaceState(history.state, "", "/discovery-fixture?q=raw%20query#archive"));
    await page.evaluate(() => {
      document.querySelector("#synthetic-show").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await page.locator("#collection span").click();

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.locator("#listen span").click(),
    ]);
    assert.equal(popup.url(), "https://example.com/listen?utm_source=echo");
    await popup.close();

    await page.waitForTimeout(100);
    const listenCalls = analyticsRequests.filter(({ eventName }) => eventName === "Listen Link Opened");
    const collectionCalls = analyticsRequests.filter(({ eventName }) => eventName === "Collection Opened");
    const showCalls = analyticsRequests.filter(({ eventName }) => eventName === "Show Opened");

    assert.equal(listenCalls.length, 1);
    assert.equal(collectionCalls.length, 1);
    assert.equal(showCalls.length, 0);
    assert.equal(listenCalls[0].properties.show_id, "fixture-show");
    assert.equal(listenCalls[0].properties.provider, "spotify");
    assert.equal(collectionCalls[0].properties.collection_id, "fixture-collection");
    assert.equal(listenCalls[0].pagePath, "/discovery-fixture");
    assert.equal(page.url(), `${baseUrl}/discovery-fixture?q=raw%20query#collection`);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);

    const serializedCalls = JSON.stringify(analyticsRequests);
    assert.doesNotMatch(serializedCalls, /raw query|example\.com|utm_source/i);
    assert.ok(analyticsRequests.some(({ eventName }) => eventName === "Page Viewed"));
  } finally {
    await page.close();
  }
});
