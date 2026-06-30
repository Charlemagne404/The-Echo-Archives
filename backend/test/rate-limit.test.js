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

async function startRateLimitServer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-rate-limit-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const port = 3420 + Math.floor(Math.random() * 200);
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
      CHAT_RATE_LIMIT_MAX: "2",
      CHAT_RATE_LIMIT_WINDOW_MS: "120",
      COMMUNITY_WRITE_MAX: "2",
      COMMUNITY_WRITE_WINDOW_MS: "120",
      SUBMISSION_RATE_LIMIT_MAX: "1",
      SUBMISSION_RATE_LIMIT_WINDOW_MS: "120",
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

async function stopRateLimitServer({ serverProcess, tempDir }) {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function waitForWindowReset() {
  await new Promise((resolve) => setTimeout(resolve, 180));
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
    assert.equal(Object.hasOwn(health, "databasePath"), false);

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
      (await putJson(`${context.baseUrl}/api/community/podcasts/impact-winter/rating`, { rating: 8 }, { headers: communityHeaders })).status,
      200,
    );
    assert.equal(
      (await putJson(`${context.baseUrl}/api/community/podcasts/impact-winter/rating`, { rating: 9 }, { headers: communityHeaders })).status,
      200,
    );

    const throttledCommunity = await fetch(`${context.baseUrl}/api/community/podcasts/impact-winter/rating`, {
      method: "DELETE",
      headers: communityHeaders,
    });
    assert.equal(throttledCommunity.status, 429);
    assert.match(throttledCommunity.headers.get("retry-after") || "", /^[1-9]\d*$/);
    const throttledCommunityBody = await throttledCommunity.json();
    assert.match(throttledCommunityBody.error || "", /too many community requests/i);
    assert.equal(throttledCommunityBody.retryAfterSeconds, 1);

    await waitForWindowReset();
    assert.equal(
      (await fetch(`${context.baseUrl}/api/community/podcasts/impact-winter/rating`, {
        method: "DELETE",
        headers: communityHeaders,
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
    assert.equal((await postJson(`${context.baseUrl}/api/submissions/shows`, submissionBody)).status, 201);

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
