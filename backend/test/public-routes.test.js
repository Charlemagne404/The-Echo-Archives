const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");

async function waitForServer(url, timeoutMs = 20_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Retry until the process is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function startPublicRouteServer(envOverrides = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-public-routes-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const port = 3660 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVE_STATIC: "true",
      STATIC_ROOT: siteRoot,
      DB_PATH: dbPath,
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      ENABLE_TEST_ERROR_ROUTES: "true",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(`${baseUrl}/api/health`);

  return {
    baseUrl,
    serverProcess,
    tempDir,
  };
}

async function stopPublicRouteServer({ serverProcess, tempDir }) {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("public clean routes resolve and legacy html routes redirect", async () => {
  const context = await startPublicRouteServer();

  try {
    for (const route of ["/about", "/collections", "/submit", "/privacy", "/show?id=impact-winter", "/collection?id=best-for-long-walks"]) {
      const response = await fetch(`${context.baseUrl}${route}`);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get("content-type") || "", /text\/html/);
    }

    const redirectResponse = await fetch(`${context.baseUrl}/collections.html`, {
      redirect: "manual",
    });
    assert.equal(redirectResponse.status, 301);
    assert.equal(redirectResponse.headers.get("location"), "/collections");
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("show and collection routes include crawler-visible metadata in the raw HTML response", async () => {
  const context = await startPublicRouteServer();

  try {
    const showResponse = await fetch(`${context.baseUrl}/show?id=impact-winter`);
    assert.equal(showResponse.status, 200);
    const showHtml = await showResponse.text();
    assert.match(showHtml, /<title>Impact Winter - The Echo Archives<\/title>/);
    assert.match(showHtml, new RegExp(`<link rel="canonical" href="${context.baseUrl}/show\\?id=impact-winter" \\/>`));
    assert.match(showHtml, new RegExp(`<meta property="og:image" content="${context.baseUrl}/`));
    assert.match(showHtml, /<main\b[^>]*id="showRoot"[^>]*>\s*<section class="detail-main podcast-detail">/);
    assert.match(showHtml, /<h1>Impact Winter<\/h1>/);

    const collectionResponse = await fetch(`${context.baseUrl}/collection?id=best-for-long-walks`);
    assert.equal(collectionResponse.status, 200);
    const collectionHtml = await collectionResponse.text();
    assert.match(
      collectionHtml,
      new RegExp(`<title>${"Best for long walks".replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} - The Echo Archives<\\/title>`),
    );
    assert.match(
      collectionHtml,
      new RegExp(`<link rel="canonical" href="${context.baseUrl}/collection\\?id=best-for-long-walks" \\/>`),
    );

    const missingShowResponse = await fetch(`${context.baseUrl}/show?id=missing-show`);
    assert.equal(missingShowResponse.status, 404);
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("public routes expose the home card hover expansion flag from env", async () => {
  const context = await startPublicRouteServer({
    HOME_CARD_HOVER_EXPAND_ENABLED: "false",
  });

  try {
    const response = await fetch(`${context.baseUrl}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<body[^>]*data-home-card-hover-expand-enabled="false"/);
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("public 500s return branded HTML while API 500s stay JSON", async () => {
  const context = await startPublicRouteServer();

  try {
    const pageFailure = await fetch(`${context.baseUrl}/__test/boom`, {
      headers: {
        Accept: "text/html",
      },
    });
    assert.equal(pageFailure.status, 500);
    assert.match(pageFailure.headers.get("content-type") || "", /text\/html/);
    assert.match(await pageFailure.text(), /Temporary archive fault\./);

    const apiFailure = await fetch(`${context.baseUrl}/api/__test/boom`, {
      headers: {
        Accept: "application\/json",
      },
    });
    assert.equal(apiFailure.status, 500);
    assert.match(apiFailure.headers.get("content-type") || "", /application\/json/);
    assert.deepEqual(await apiFailure.json(), {
      error: "Intentional API test route failure.",
    });
  } finally {
    await stopPublicRouteServer(context);
  }
});
