const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { findFreePort } = require("./helpers/free-port");
const { openDatabase } = require("../lib/store/database");
const { createSubmissionStore } = require("../lib/store/submission-store");
const { createPublishedListenerReviewStore } = require("../lib/store/published-listener-review-store");

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

function seedPublishedListenerReview(dbPath) {
  const db = openDatabase(dbPath);
  const submissions = createSubmissionStore({ db });
  const reviews = createPublishedListenerReviewStore({ db });
  const submission = submissions.createShowSubmission({
    status: "accepted",
    priority: "normal",
    submissionType: "listener-review",
    existingShowId: "impact-winter",
    showTitle: "Impact Winter",
    contactEmail: "listener@example.com",
    payload: {},
    sourceIp: "127.0.0.1",
    userAgent: "test-agent",
  });
  const review = reviews.upsert({
    submissionId: submission.id,
    showId: "impact-winter",
    authorName: "Route listener",
    title: "Route test review",
    body: "A moderated review for the public endpoint.",
    ratingStars: 4,
    categoryScores: { voiceActing: 9, soundDesign: 8, story: 7, characters: 8, ads: 6, length: 7 },
    spoilerLevel: "spoiler-free",
    bestFor: [],
    workedBest: [],
    publish: true,
  });
  db.close();
  return review;
}

async function startCommunityServer({ writesEnabled = true, minimumPublicRatings = 1 } = {}) {
  const turnstile = await createTurnstileMock();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-community-route-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const review = seedPublishedListenerReview(dbPath);
  const port = await findFreePort();
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
      COMMUNITY_MIN_PUBLIC_RATINGS: String(minimumPublicRatings),
      COMMUNITY_TURNSTILE_ENABLED: "true",
      COMMUNITY_TURNSTILE_SITE_KEY: "test-site-key",
      COMMUNITY_TURNSTILE_SECRET_KEY: "test-secret-key",
      COMMUNITY_TURNSTILE_VERIFY_URL: turnstile.url,
      COMMUNITY_VOTER_HASH_SECRET: "test-community-voter-hash-secret-123456",
      COMMUNITY_RATING_WRITES_ENABLED: String(writesEnabled),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(`${baseUrl}/api/health`);

  return {
    baseUrl,
    serverProcess,
    tempDir,
    turnstile,
    review,
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

test("community rating summaries ignore malformed cookie values", async () => {
  const context = await startCommunityServer();

  try {
    const summaryResponse = await fetch(
      `${context.baseUrl}/api/community/ratings/summary?podcastIds=impact-winter`,
      {
        headers: {
          cookie: "echo-community-voter=%E0%A4%A; unrelated=ok",
        },
      },
    );

    assert.equal(summaryResponse.status, 200);
    const summaryPayload = await summaryResponse.json();
    assert.equal(summaryPayload.profileId, null);
    assert.equal(summaryPayload.summaries["impact-winter"].ratingCount, 0);
  } finally {
    await stopCommunityServer(context);
  }
});

test("published review pages paginate listener reviews and helpful votes use the device identity", async () => {
  const context = await startCommunityServer({ minimumPublicRatings: 3 });

  try {
    const firstPage = await fetch(`${context.baseUrl}/api/reviews/shows/impact-winter?page=1`);
    assert.equal(firstPage.status, 200);
    const firstPayload = await firstPage.json();
    assert.deepEqual(firstPayload.pagination, { page: 1, pageSize: 1, totalPages: 1, totalReviews: 1 });
    assert.equal(firstPayload.reviews[0].id, context.review.id);
    assert.equal(firstPayload.scoreSummary.voiceActing.isPublic, false);
    assert.equal(firstPayload.scoreSummary.voiceActing.ratingCount, 1);

    const profileResponse = await postJson(`${context.baseUrl}/api/community/profiles/anonymous`, {});
    const cookie = getCookieHeader(profileResponse);
    const helpfulResponse = await putJson(
      `${context.baseUrl}/api/reviews/${context.review.id}/helpful`,
      { turnstileToken: "valid-token" },
      { headers: { cookie } },
    );
    assert.equal(helpfulResponse.status, 200);
    assert.deepEqual(await helpfulResponse.json(), {
      reviewId: context.review.id,
      helpfulCount: 1,
      viewerMarkedHelpful: true,
    });

    const repeatedResponse = await putJson(
      `${context.baseUrl}/api/reviews/${context.review.id}/helpful`,
      { turnstileToken: "valid-token" },
      { headers: { cookie } },
    );
    assert.equal((await repeatedResponse.json()).helpfulCount, 1);

    const reviewWithViewer = await fetch(`${context.baseUrl}/api/reviews/shows/impact-winter`, { headers: { cookie } });
    assert.equal((await reviewWithViewer.json()).reviews[0].viewerMarkedHelpful, true);

    const removeResponse = await fetch(`${context.baseUrl}/api/reviews/${context.review.id}/helpful`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    });
    assert.equal(removeResponse.status, 200);
    assert.equal((await removeResponse.json()).helpfulCount, 0);
    assert.deepEqual(context.turnstile.calls.map((call) => call.response), ["valid-token", "valid-token", "valid-token"]);
  } finally {
    await stopCommunityServer(context);
  }
});

test("helpful voting returns the same disabled-write response as instant ratings", async () => {
  const context = await startCommunityServer({ writesEnabled: false });

  try {
    const response = await putJson(
      `${context.baseUrl}/api/reviews/${context.review.id}/helpful`,
      { turnstileToken: "valid-token" },
    );
    assert.equal(response.status, 503);
    assert.match((await response.json()).error || "", /unavailable/i);
  } finally {
    await stopCommunityServer(context);
  }
});
