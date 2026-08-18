const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { openDatabase } = require("../lib/store/database");
const { createRateLimitStore } = require("../lib/store/rate-limit-store");
const { findFreePort } = require("./helpers/free-port");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");

async function createTurnstileMock() {
  const server = require("node:http").createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = body ? JSON.parse(body) : {};
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: payload.response === "valid-token" }));
    });
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/siteverify`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

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

async function startRateLimitServer() {
  const turnstile = await createTurnstileMock();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-rate-limit-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVE_STATIC: "true",
      DB_PATH: dbPath,
      ARCHIVIST_ENABLED: "true",
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      STATIC_ROOT: siteRoot,
      CHAT_RATE_LIMIT_MAX: "2",
      CHAT_RATE_LIMIT_WINDOW_MS: "1000",
      COMMUNITY_WRITE_MAX: "2",
      COMMUNITY_WRITE_WINDOW_MS: "3000",
      COMMUNITY_TURNSTILE_ENABLED: "true",
      COMMUNITY_TURNSTILE_SITE_KEY: "test-site-key",
      COMMUNITY_TURNSTILE_SECRET_KEY: "test-secret-key",
      COMMUNITY_TURNSTILE_VERIFY_URL: turnstile.url,
      COMMUNITY_VOTER_HASH_SECRET: "test-community-voter-hash-secret-123456",
      SUBMISSION_RATE_LIMIT_MAX: "1",
      SUBMISSION_RATE_LIMIT_WINDOW_MS: "1000",
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

async function stopRateLimitServer({ serverProcess, tempDir, turnstile }) {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  await turnstile.close();
}

async function waitForWindowReset(delayMs = 1200) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
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

test("chat, community, and submission writes return 429 with Retry-After and recover after the window", async () => {
  const context = await startRateLimitServer();

  try {
    const healthResponse = await fetch(`${context.baseUrl}/api/health`);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);
    assert.equal(healthResponse.headers.get("cache-control"), "no-store");
    assert.equal(Object.hasOwn(health, "databasePath"), false);
    assert.equal(Object.hasOwn(health, "model"), false);
    assert.equal(typeof health.features.communityRatingWrites, "boolean");
    assert.deepEqual(health.durability, {
      journalMode: "WAL",
      synchronous: "FULL",
    });

    const chatBody = { message: "Find me a completed sci-fi show.", history: [] };
    assert.equal((await postJson(`${context.baseUrl}/api/chat`, chatBody)).status, 200);
    assert.equal((await postJson(`${context.baseUrl}/api/chat`, chatBody)).status, 200);

    const throttledChat = await postJson(`${context.baseUrl}/api/chat`, chatBody);
    assert.equal(throttledChat.status, 429);
    assert.match(throttledChat.headers.get("retry-after") || "", /^[1-9]\d*$/);
    const throttledChatBody = await throttledChat.json();
    assert.match(throttledChatBody.error || "", /too many chat requests/i);
    assert.equal(throttledChatBody.retryAfterSeconds, 1);

    await waitForWindowReset();
    assert.equal((await postJson(`${context.baseUrl}/api/chat`, chatBody)).status, 200);

    const profileResponse = await postJson(`${context.baseUrl}/api/community/profiles/anonymous`, {
      existingProfileId: null,
    });
    const profilePayload = await profileResponse.json();
    const profileId = profilePayload.profileId;
    assert.match(profileId, /^[0-9a-f-]{36}$/i);

    const communityHeaders = {
      "x-echo-profile-id": profileId,
    };
    assert.equal(
      (await putJson(`${context.baseUrl}/api/community/podcasts/impact-winter/rating`, { rating: 8, turnstileToken: "valid-token" }, { headers: communityHeaders })).status,
      200,
    );
    assert.equal(
      (await putJson(`${context.baseUrl}/api/community/podcasts/impact-winter/rating`, { rating: 9, turnstileToken: "valid-token" }, { headers: communityHeaders })).status,
      200,
    );

    const throttledCommunity = await fetch(`${context.baseUrl}/api/community/podcasts/impact-winter/rating`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...communityHeaders,
      },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    });
    assert.equal(throttledCommunity.status, 429);
    assert.match(throttledCommunity.headers.get("retry-after") || "", /^[1-9]\d*$/);
    const throttledCommunityBody = await throttledCommunity.json();
    assert.match(throttledCommunityBody.error || "", /too many community requests/i);
    assert.ok(throttledCommunityBody.retryAfterSeconds >= 1);

    await waitForWindowReset(3200);
    assert.equal(
      (await fetch(`${context.baseUrl}/api/community/podcasts/impact-winter/rating`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...communityHeaders,
        },
        body: JSON.stringify({ turnstileToken: "valid-token" }),
      })).status,
      200,
    );

    const submissionBody = {
      submissionType: "show",
      showTitle: "Rate Limited Show",
      creatorName: "Example Studio",
      contactEmail: "hello@example.com",
      officialSite: "https://example.com",
      listenLinks: [{ label: "Website", url: "https://example.com/listen" }],
      selectedTags: ["Drama"],
      completionStatus: "ongoing",
      shortDescription: "A spoiler-free description.",
      archiveFitNote: "Worth archiving.",
      website: "",
    };
    const acceptedSubmission = await postJson(`${context.baseUrl}/api/submissions/shows`, submissionBody);
    assert.equal(acceptedSubmission.status, 201);
    const acceptedPayload = await acceptedSubmission.json();
    assert.equal(acceptedPayload.accepted, true);
    assert.match(acceptedPayload.submissionId, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(Object.keys(acceptedPayload).sort(), ["accepted", "submissionId"]);

    const throttledSubmission = await postJson(`${context.baseUrl}/api/submissions/shows`, submissionBody);
    assert.equal(throttledSubmission.status, 429);
    assert.match(throttledSubmission.headers.get("retry-after") || "", /^[1-9]\d*$/);
    const throttledSubmissionBody = await throttledSubmission.json();
    assert.match(throttledSubmissionBody.error || "", /too many submissions requests/i);
    assert.equal(throttledSubmissionBody.retryAfterSeconds, 1);

    await waitForWindowReset();
    assert.equal((await postJson(`${context.baseUrl}/api/submissions/shows`, {
      ...submissionBody,
      showTitle: "Rate Limited Show Again",
    })).status, 201);
  } finally {
    await stopRateLimitServer(context);
  }
});

test("rate limiting prunes expired rows for inactive clients across the scope", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-rate-prune-"));
  const db = openDatabase(path.join(tempDir, "community.sqlite"));

  try {
    const insert = db.prepare(`
      INSERT INTO rate_limit_events (scope, client_ip, created_at_ms)
      VALUES (?, ?, ?)
    `);
    insert.run("chat", "198.51.100.1", 100);
    insert.run("chat", "198.51.100.2", 200);
    insert.run("chat", "198.51.100.3", 950);
    insert.run("community", "198.51.100.4", 100);

    const store = createRateLimitStore({ db });
    const result = store.consume({
      scope: "chat",
      clientIp: "198.51.100.5",
      windowMs: 500,
      maxEvents: 5,
      createdAtMs: 1000,
    });
    assert.equal(result.allowed, true);

    const chatRows = db.prepare("SELECT client_ip FROM rate_limit_events WHERE scope = 'chat' ORDER BY client_ip").all();
    assert.deepEqual(chatRows.map((row) => row.client_ip), ["198.51.100.3", "198.51.100.5"]);
    const communityRows = db.prepare("SELECT client_ip FROM rate_limit_events WHERE scope = 'community'").all();
    assert.deepEqual(communityRows.map((row) => row.client_ip), ["198.51.100.4"]);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
