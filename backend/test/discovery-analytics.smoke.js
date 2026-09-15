const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getSmokeContext,
  gotoSmokePage,
  setupSmoke,
  teardownSmoke,
} = require("./helpers/browser-smoke");

let browser;
let baseUrl;
let showId;

test.before(async () => {
  await setupSmoke();
  const context = getSmokeContext();
  browser = context.browser;
  baseUrl = context.baseUrl;
  showId = context.showFixtures.find((show) => Object.values(show.listenLinks || {}).some(Boolean))?.id;
});

test.after(async () => {
  await teardownSmoke();
});

test("listen analytics is best-effort while the outbound link still opens", async () => {
  assert.ok(showId, "the smoke catalog should contain a show with a listening link");
  const page = await browser.newPage();

  try {
    await page.addInitScript(() => {
    });
    const analyticsRequests = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/analytics/events" && request.postData()) {
        analyticsRequests.push(JSON.parse(request.postData()));
      }
    });
    await gotoSmokePage(page, `${baseUrl}/shows/${encodeURIComponent(showId)}`);
    await page.evaluate(() => {
      document.body.dataset.analyticsEnabled = "true";
    });

    const listenLink = page.locator('a[data-discovery-listen-show-id]').first();
    await listenLink.waitFor();
    const destination = await listenLink.getAttribute("href");
    assert.match(destination || "", /^https?:\/\//);

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      listenLink.click(),
    ]);
    assert.equal(page.url(), `${baseUrl}/shows/${encodeURIComponent(showId)}`);
    assert.ok(popup);

    await page.waitForTimeout(100);
    const listenCalls = analyticsRequests.filter(({ eventName }) => eventName === "Listen Link Opened");
    assert.equal(listenCalls.length, 1);
    assert.equal(listenCalls[0].properties.show_id, showId);
    assert.equal(listenCalls[0].properties.provider, await listenLink.getAttribute("data-discovery-provider"));
    assert.equal(listenCalls[0].pagePath, `${new URL(page.url()).pathname}`);
    assert.doesNotMatch(JSON.stringify(listenCalls[0].properties), /https?:\/\//);
    assert.doesNotMatch(JSON.stringify(listenCalls[0].properties), /[?&#]/);
  } finally {
    await page.close();
  }
});
