const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { getSmokeContext, setupSmoke, teardownSmoke } = require("./helpers/browser-smoke");

let browser;
let baseUrl;

before(async () => {
  await setupSmoke();
  ({ browser, baseUrl } = getSmokeContext());
});

after(async () => {
  await teardownSmoke();
});

test("native fetch aborts and client fetchJson bounds slow responses and rejects malformed JSON", async () => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  try {
    await page.route(`${baseUrl}/compat/malformed-json`, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{",
    }));
    await page.route(`${baseUrl}/compat/stalled-json`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      }).catch(() => {});
    });
    await page.goto(baseUrl, { waitUntil: "load" });
    await page.waitForFunction(() => document.body.dataset.appReady === "true");
    const outcomes = await page.evaluate(async ({ apiBaseUrl }) => {
      const { fetchJson } = await import("/shared/app/data.js");
      const malformed = await fetchJson(`${apiBaseUrl}/malformed-json`).then(
        () => "resolved",
        (error) => error.message,
      );
      const timedOut = await fetchJson(`${apiBaseUrl}/stalled-json`, { timeoutMs: 80 }).then(
        () => "resolved",
        (error) => error.message,
      );
      const controller = new AbortController();
      const abortedFetch = fetch(`${apiBaseUrl}/stalled-json`, { signal: controller.signal })
        .then((response) => response.json())
        .then(() => "resolved", (error) => error.name);
      await new Promise((resolve) => setTimeout(resolve, 30));
      controller.abort();
      return { malformed, timedOut, aborted: await abortedFetch };
    }, { apiBaseUrl: `${baseUrl}/compat` });

    assert.match(outcomes.malformed, /did not return valid JSON/i);
    assert.match(outcomes.timedOut, /timed out/i);
    assert.equal(outcomes.aborted, "AbortError");
  } finally {
    await context.close();
  }
});
