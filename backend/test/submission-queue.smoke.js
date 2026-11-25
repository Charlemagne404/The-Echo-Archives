const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSmokeContext,
  setupSmoke,
  teardownSmoke,
  smokeBrowserAvailable,
} = require("./helpers/browser-smoke");

let browser;
let baseUrl;

if (!smokeBrowserAvailable) {
  test("maintainer submission queue browser workflow", { skip: "Chromium is not installed in this environment." }, () => {});
} else {
  test.before(async () => {
    await setupSmoke();
    ({ browser, baseUrl } = getSmokeContext());
  });

  test.after(async () => {
    await teardownSmoke();
  });

  test("maintainer can inspect an accepted submission in the responsive queue", async () => {
    const title = `Queue Browser Smoke ${Date.now()}`;
    const response = await fetch(`${baseUrl}/api/submissions/shows`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `queue-browser-${Date.now()}` },
      body: JSON.stringify({
        intakeVersion: 2,
        submissionType: "show",
        showTitle: title,
        legalAcknowledged: true,
        legalVersion: "2026-09-15",
        listenLinks: [{ label: "RSS Feed", url: "https://feeds.example.test/queue-smoke.xml" }],
        website: "",
      }),
    });
    const responseText = await response.text();
    assert.equal(response.status, 201, responseText);
    const accepted = JSON.parse(responseText);
    assert.ok(accepted.submissionId);

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${baseUrl}/maintainer/submissions.html?lane=all&submissionType=show`, { waitUntil: "networkidle" });
      await page.locator("#maintainerAuthPanel").waitFor({ state: "visible" });
      await page.locator("#maintainerPassphrase").fill("smoke-maintainer");
      await page.getByRole("button", { name: "Unlock queue" }).click();
      await page.waitForFunction(() => document.body.dataset.maintainerState === "ready");
      await page.locator("#maintainerList").getByText(title, { exact: true }).waitFor({ state: "visible" });
      await page.locator("#maintainerDetail").getByRole("heading", { name: "Submission lifecycle" }).waitFor({ state: "visible" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
      assert.equal(await page.locator("#maintainerQueueHealth").getAttribute("role"), "status");

      await page.setViewportSize({ width: 1440, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    } finally {
      await page.close();
    }
  });
}
