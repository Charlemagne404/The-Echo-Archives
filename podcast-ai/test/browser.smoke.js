const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { chromium } = require("playwright");

const showFixtures = require("../../data/shows.json");
const collectionFixtures = require("../../data/collections.json");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");
const basePort = 3310;
const baseUrl = `http://127.0.0.1:${basePort}`;
const firstCollectionId = collectionFixtures[0].id;
const firstShowId = showFixtures[0].id;

let browser;
let serverProcess;
let tempDir;

async function waitForServer(url, timeoutMs = 20_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-smoke-"));
  const dbPath = path.join(tempDir, "community.sqlite");

  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(basePort),
      SERVE_STATIC: "true",
      DB_PATH: dbPath,
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      STATIC_ROOT: siteRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(`${baseUrl}/api/health`);
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("main routes render expected page titles", async () => {
  const page = await browser.newPage();

  try {
    const routes = [
      { url: `${baseUrl}/`, title: "The Echo Archives" },
      { url: `${baseUrl}/about.html`, title: "About - The Echo Archives" },
      { url: `${baseUrl}/collections.html`, title: "Collections - The Echo Archives" },
      { url: `${baseUrl}/collection.html?id=${firstCollectionId}`, title: `${collectionFixtures[0].title} - The Echo Archives` },
      { url: `${baseUrl}/show.html?id=${firstShowId}`, title: `${showFixtures[0].title} - The Echo Archives` },
      { url: `${baseUrl}/submit.html`, title: "Submit a Show - The Echo Archives" },
    ];

    for (const route of routes) {
      await page.goto(route.url, { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      assert.equal(await page.title(), route.title);
    }
  } finally {
    await page.close();
  }
});

test("homepage supports structured filtering, recently updated mode, and no-result recovery", async () => {
  const page = await browser.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Filters" }).click();
    await page.evaluate(() => {
      document
        .querySelector('.filter-option[data-filter-group="completionStatus"][data-filter-value="finished"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document
        .querySelector('.filter-option[data-filter-group="reviewStatus"][data-filter-value="indexed-only"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.getByText("results", { exact: false }).waitFor();

    const filterCount = page.locator("#filterCount");
    await assert.doesNotReject(() => filterCount.waitFor());
    assert.equal(await filterCount.textContent(), "2");

    await page.getByRole("button", { name: "Recently updated" }).click();
    await page.locator("#resultsSummary").waitFor();
    assert.match((await page.locator("#resultsSummary").textContent()) || "", /Recently updated/i);

    await page.locator("#search").fill("zzzzzz-not-in-archive");
    await page.getByText("No matches yet.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();

    const cardCount = await page.locator("#podcast-grid .podcast-card-shell").count();
    assert.ok(cardCount > 0);
  } finally {
    await page.close();
  }
});

test("Ask the Archivist and submit mode switching work without exposing empty future sections", async () => {
  const page = await browser.newPage();

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });

    await page.goto(`${baseUrl}/submit.html`, { waitUntil: "networkidle" });

    await page.locator("#submissionType").selectOption("listener-review");
    await page.locator("#listenerReviewField").waitFor();
    let formState = await page.evaluate(() => ({
      listenerReviewHidden: document.getElementById("listenerReviewField")?.hidden,
      verificationSourcesHidden: document.getElementById("verificationSourcesField")?.hidden,
    }));
    assert.equal(formState.listenerReviewHidden, false);
    assert.equal(formState.verificationSourcesHidden, true);

    await page.locator("#submissionType").selectOption("creator-verification");
    await page.locator("#verificationSourcesField").waitFor();
    await page.locator("#provenanceNotesField").waitFor();
    formState = await page.evaluate(() => ({
      listenerReviewHidden: document.getElementById("listenerReviewField")?.hidden,
      verificationSourcesHidden: document.getElementById("verificationSourcesField")?.hidden,
      provenanceNotesHidden: document.getElementById("provenanceNotesField")?.hidden,
    }));
    assert.equal(formState.listenerReviewHidden, true);
    assert.equal(formState.verificationSourcesHidden, false);
    assert.equal(formState.provenanceNotesHidden, false);
  } finally {
    await page.close();
  }
});
