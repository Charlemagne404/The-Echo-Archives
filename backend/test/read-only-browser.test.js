const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { chromium } = require("playwright");

const { createReadOnlyBrowserContext } = require("./helpers/read-only-browser");

let browser;
let server;
let baseUrl;
let receivedRequests;

function writeResponse(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers });
  response.end(body);
}

function readOnlyFixtureMarkup() {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Read-only fixture</title></head>
  <body>
    <form id="mutatingForm" method="POST" action="/form-submit" target="mutatingFrame">
      <input name="fixture" value="fixture">
    </form>
    <iframe name="mutatingFrame" title="mutation target"></iframe>
    <script>
      window.analyticsSettingAtScript = document.documentElement.dataset.analyticsEnabled || "";
      window.ready = true;
    </script>
  </body>
</html>`;
}

function serviceWorkerFixtureMarkup() {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Service worker fixture</title></head>
  <body>
    <script>
      window.swRegistration = navigator.serviceWorker.register('/sw-write.js')
        .then(() => 'registered')
        .catch((error) => error.name || 'blocked');
    </script>
  </body>
</html>`;
}

function createFixtureServer() {
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    receivedRequests.push({ method: request.method, pathname: requestUrl.pathname });

    if (requestUrl.pathname === "/") {
      writeResponse(response, 200, readOnlyFixtureMarkup(), { "content-type": "text/html; charset=utf-8" });
      return;
    }
    if (requestUrl.pathname === "/service-worker-fixture") {
      writeResponse(response, 200, serviceWorkerFixtureMarkup(), { "content-type": "text/html; charset=utf-8" });
      return;
    }
    if (requestUrl.pathname === "/sw-write.js") {
      writeResponse(
        response,
        200,
        `self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', event => {
          if (event.request.method !== 'GET') event.respondWith(fetch(event.request));
        });`,
        { "content-type": "text/javascript; charset=utf-8" },
      );
      return;
    }
    if (requestUrl.pathname === "/read-only-get") {
      writeResponse(response, 200, "GET works");
      return;
    }
    if (requestUrl.pathname.startsWith("/mutate") || requestUrl.pathname === "/form-submit") {
      writeResponse(response, 204, "");
      return;
    }
    writeResponse(response, 404, "not found");
  });
}

function listen(serverToStart) {
  return new Promise((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${serverToStart.address().port}`);
    });
  });
}

test.before(async () => {
  receivedRequests = [];
  server = createFixtureServer();
  baseUrl = await listen(server);
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test("read-only context disables analytics before scripts and blocks fetch, XHR, beacon, form, PUT, PATCH, and DELETE", async () => {
  receivedRequests = [];
  const guard = await createReadOnlyBrowserContext(browser);
  const page = await guard.context.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "load" });
    assert.equal(await page.title(), "Read-only fixture");
    assert.equal(await page.evaluate(() => window.analyticsSettingAtScript), "false");

    await page.evaluate(async () => {
      await fetch("/mutate-fetch", { method: "POST", body: "fetch" }).catch(() => {});
      await fetch("/mutate-put", { method: "PUT", body: "put" }).catch(() => {});
      await fetch("/mutate-patch", { method: "PATCH", body: "patch" }).catch(() => {});
      await fetch("/mutate-delete", { method: "DELETE" }).catch(() => {});

      await new Promise((resolve) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/mutate-xhr");
        request.addEventListener("loadend", resolve, { once: true });
        request.addEventListener("error", resolve, { once: true });
        request.send("xhr");
      });

      navigator.sendBeacon("/mutate-beacon", new Blob(["beacon"], { type: "text/plain" }));
      document.getElementById("mutatingForm").requestSubmit();
    });
    await page.waitForTimeout(150);

    const attempts = guard.getMutationAttempts();
    assert.deepEqual(
      attempts.map(({ method, pathname }) => ({ method, pathname })),
      [
        { method: "POST", pathname: "/mutate-fetch" },
        { method: "PUT", pathname: "/mutate-put" },
        { method: "PATCH", pathname: "/mutate-patch" },
        { method: "DELETE", pathname: "/mutate-delete" },
        { method: "POST", pathname: "/mutate-xhr" },
        { method: "POST", pathname: "/mutate-beacon" },
        { method: "POST", pathname: "/form-submit" },
      ],
    );
    assert.deepEqual(receivedRequests, [
      { method: "GET", pathname: "/" },
    ]);
    assert.throws(() => guard.assertNoMutationAttempts(), /unexpected mutation request/);
  } finally {
    await guard.close();
  }
});

test("read-only context allows GET navigation and blocks service-worker registration before it can originate a write", async () => {
  receivedRequests = [];
  const guard = await createReadOnlyBrowserContext(browser);
  const page = await guard.context.newPage();

  try {
    await page.goto(`${baseUrl}/service-worker-fixture`, { waitUntil: "load" });
    const registrationResult = await page.evaluate(() => window.swRegistration);
    assert.equal(registrationResult, "registered");
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);

    await page.goto(`${baseUrl}/read-only-get`, { waitUntil: "load" });
    assert.equal(await page.locator("body").textContent(), "GET works");
    assert.deepEqual(guard.getMutationAttempts(), []);
    guard.assertNoMutationAttempts();
    assert.deepEqual(
      receivedRequests.filter(({ method }) => method !== "POST"),
      [
        { method: "GET", pathname: "/service-worker-fixture" },
        { method: "GET", pathname: "/read-only-get" },
      ],
    );
    assert.equal(receivedRequests.some(({ method }) => method === "POST"), false);
  } finally {
    await guard.close();
  }
});

test("page-level routing is demonstrably bypassed by a service worker that responds with fetch", async () => {
  receivedRequests = [];
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const intercepted = [];

  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      intercepted.push({ method: request.method(), pathname: new URL(request.url()).pathname });
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  try {
    await page.goto(`${baseUrl}/service-worker-fixture`, { waitUntil: "load" });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
      }
      await fetch("/mutate-through-worker", { method: "POST", body: "worker" });
    });
    await page.waitForTimeout(100);

    assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
    assert.deepEqual(intercepted, []);
    assert.deepEqual(receivedRequests, [
      { method: "GET", pathname: "/service-worker-fixture" },
      { method: "GET", pathname: "/sw-write.js" },
      { method: "POST", pathname: "/mutate-through-worker" },
    ]);
  } finally {
    await context.close();
  }
});
