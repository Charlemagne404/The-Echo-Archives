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

async function startPublicRouteServer() {
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
