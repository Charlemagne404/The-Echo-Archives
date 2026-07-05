const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
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

async function createTurnstileMock() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = body ? JSON.parse(body) : {};
      calls.push(payload);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: payload.response === "valid-token" }));
    });
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    calls,
    url: `http://127.0.0.1:${address.port}/siteverify`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function startCommunityServer() {
  const turnstile = await createTurnstileMock();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-community-route-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const port = 3620 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVE_STATIC: "true",
      DB_PATH: dbPath,
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      STATIC_ROOT: siteRoot,
      COMMUNITY_MIN_PUBLIC_RATINGS: "1",
      COMMUNITY_TURNSTILE_ENABLED: "true",
      COMMUNITY_TURNSTILE_SITE_KEY: "test-site-key",
      COMMUNITY_TURNSTILE_SECRET_KEY: "test-secret-key",
      COMMUNITY_TURNSTILE_VERIFY_URL: turnstile.url,
      COMMUNITY_VOTER_HASH_SECRET: "test-community-voter-hash-secret-123456",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(`${baseUrl}/api/health`);

  return {
    baseUrl,
    serverProcess,
    tempDir,
    turnstile,
  };
}

async function stopCommunityServer({ serverProcess, tempDir, turnstile }) {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }

  await turnstile.close();

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function getCookieHeader(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return setCookie.split(";")[0];
}

async function postJson(url, body, init = {}) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: JSON.stringify(body),
  });
}

async function putJson(url, body, init = {}) {
  return fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: JSON.stringify(body),
  });
}

test("community rating routes use the voter cookie instead of forged profile headers", async () => {
  const context = await startCommunityServer();

  try {
    const profileResponse = await postJson(`${context.baseUrl}/api/community/profiles/anonymous`, {});
    assert.equal(profileResponse.status, 201);
    const cookie = getCookieHeader(profileResponse);
    assert.match(cookie, /^echo-community-voter=/);

    const firstWrite = await putJson(
      `${context.baseUrl}/api/community/podcasts/impact-winter/rating`,
      { rating: 9, turnstileToken: "valid-token" },
      {
        headers: {
          cookie,
          "x-echo-profile-id": "11111111-1111-1111-1111-111111111111",
        },
      },
    );
    assert.equal(firstWrite.status, 200);

    const secondWrite = await putJson(
      `${context.baseUrl}/api/community/podcasts/impact-winter/rating`,
      { rating: 5, turnstileToken: "valid-token" },
      {
        headers: {
          cookie,
          "x-echo-profile-id": "22222222-2222-2222-2222-222222222222",
        },
      },
    );
    assert.equal(secondWrite.status, 200);

    const summaryResponse = await fetch(
      `${context.baseUrl}/api/community/ratings/summary?podcastIds=impact-winter`,
      {
        headers: {
          cookie,
        },
      },
    );
    const summaryPayload = await summaryResponse.json();
    assert.equal(summaryPayload.summaries["impact-winter"].ratingCount, 1);
    assert.equal(summaryPayload.summaries["impact-winter"].averageRating, 5);
    assert.equal(summaryPayload.summaries["impact-winter"].myRating, 5);
  } finally {
    await stopCommunityServer(context);
  }
});

test("community rating routes reject failed Turnstile tokens", async () => {
  const context = await startCommunityServer();

  try {
    const profileResponse = await postJson(`${context.baseUrl}/api/community/profiles/anonymous`, {});
    const cookie = getCookieHeader(profileResponse);

    const rejectedWrite = await putJson(
      `${context.baseUrl}/api/community/podcasts/impact-winter/rating`,
      { rating: 9, turnstileToken: "bad-token" },
      {
        headers: {
          cookie,
        },
      },
    );
    assert.equal(rejectedWrite.status, 400);
    const rejectedPayload = await rejectedWrite.json();
    assert.match(rejectedPayload.error || "", /verification failed/i);

    const acceptedWrite = await putJson(
      `${context.baseUrl}/api/community/podcasts/impact-winter/rating`,
      { rating: 9, turnstileToken: "valid-token" },
      {
        headers: {
          cookie,
        },
      },
    );
    assert.equal(acceptedWrite.status, 200);
    assert.deepEqual(
      context.turnstile.calls.map((call) => call.response),
      ["bad-token", "valid-token"],
    );
  } finally {
    await stopCommunityServer(context);
  }
});
