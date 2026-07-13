const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadCatalog } = require("../lib/catalog");
const { openDatabase } = require("../lib/store/database");
const { createCommunityStore } = require("../lib/store/community-store");
const { createCommunityService, createAbuseHash } = require("../lib/services/community-service");

const siteRoot = path.resolve(__dirname, "../..");

async function createCommunityContext({ minPublicRatings = 3, serviceOptions = {} } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-community-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const catalog = await loadCatalog(siteRoot);
  const store = createCommunityStore({ db, catalog, minPublicRatings });
  const community = createCommunityService({
    store,
    voterHashSecret: "test-community-secret",
    ...serviceOptions,
  });

  return {
    community,
    db,
    store,
    tempDir,
  };
}

function cleanupCommunityContext({ db, tempDir }) {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

test("device-scoped community ratings update one active vote per show", async () => {
  const context = await createCommunityContext();

  try {
    const firstSubmission = await context.community.submitRating({
      podcastId: "impact-winter",
      rating: 9,
      voterSecret: "device-one",
      userAgent: "test-agent",
    });
    const secondSubmission = await context.community.submitRating({
      podcastId: "impact-winter",
      rating: 7,
      voterSecret: "device-two",
      userAgent: "test-agent",
    });
    const thirdSubmission = await context.community.submitRating({
      podcastId: "impact-winter",
      rating: 8,
      voterSecret: "device-three",
      userAgent: "test-agent",
    });

    assert.equal(firstSubmission.summary.averageRating, null);
    assert.equal(secondSubmission.summary.averageRating, null);
    assert.equal(thirdSubmission.summary.averageRating, 8);
    assert.equal(thirdSubmission.summary.ratingCount, 3);

    const updatedSubmission = await context.community.submitRating({
      podcastId: "impact-winter",
      rating: 10,
      voterSecret: "device-one",
      userAgent: "test-agent",
    });

    assert.equal(updatedSubmission.summary.averageRating, 8.33);
    assert.equal(updatedSubmission.summary.ratingCount, 3);
    assert.equal(updatedSubmission.summary.myRating, 10);
    assert.equal(updatedSubmission.summary.distribution["10"], 1);
    assert.equal(updatedSubmission.summary.distribution["7"], 1);
    assert.equal(updatedSubmission.summary.distribution["9"], 0);
  } finally {
    cleanupCommunityContext(context);
  }
});

test("community ratings can be removed for a device voter", async () => {
  const context = await createCommunityContext({ minPublicRatings: 1 });

  try {
    await context.community.submitRating({
      podcastId: "ars-paradoxica",
      rating: 8,
      voterSecret: "device-one",
      userAgent: "test-agent",
    });

    const afterDelete = await context.community.removeRating({
      podcastId: "ars-paradoxica",
      voterSecret: "device-one",
      userAgent: "test-agent",
    });

    assert.equal(afterDelete.summary.ratingCount, 0);
    assert.equal(afterDelete.summary.averageRating, null);
    assert.equal(afterDelete.summary.myRating, null);
  } finally {
    cleanupCommunityContext(context);
  }
});

test("Turnstile is required before rating writes when enabled", async () => {
  const verifyCalls = [];
  const context = await createCommunityContext({
    minPublicRatings: 1,
    serviceOptions: {
      turnstile: {
        async verify(token, remoteIp) {
          verifyCalls.push({ token, remoteIp });
          if (token !== "valid-token") {
            const error = new Error("Rating verification failed.");
            error.statusCode = 400;
            throw error;
          }
        },
      },
    },
  });

  try {
    await assert.rejects(
      () =>
        context.community.submitRating({
          podcastId: "impact-winter",
          rating: 9,
          voterSecret: "device-one",
          turnstileToken: "invalid-token",
          userAgent: "test-agent",
          sourceIp: "203.0.113.10",
        }),
      /verification failed/i,
    );

    const result = await context.community.submitRating({
      podcastId: "impact-winter",
      rating: 9,
      voterSecret: "device-one",
      turnstileToken: "valid-token",
      userAgent: "test-agent",
      sourceIp: "203.0.113.10",
    });

    await assert.rejects(
      () =>
        context.community.removeRating({
          podcastId: "impact-winter",
          voterSecret: "device-one",
          turnstileToken: "invalid-token",
          userAgent: "test-agent",
          sourceIp: "203.0.113.10",
        }),
      /verification failed/i,
    );

    assert.equal(result.summary.averageRating, 9);
    assert.deepEqual(verifyCalls, [
      { token: "invalid-token", remoteIp: "203.0.113.10" },
      { token: "valid-token", remoteIp: "203.0.113.10" },
      { token: "invalid-token", remoteIp: "203.0.113.10" },
    ]);
  } finally {
    cleanupCommunityContext(context);
  }
});

test("community rating writes are throttled by salted abuse hash", async () => {
  const context = await createCommunityContext({
    serviceOptions: {
      rateLimiter: {
        check(scope, clientIp) {
          context.calls.push({ scope, clientIp });
          context.remainingWrites -= 1;
          if (context.remainingWrites < 0) {
            const error = new Error("Too many community requests from this address. Try again later.");
            error.statusCode = 429;
            error.retryAfterSeconds = 60;
            throw error;
          }
        },
      },
    },
  });
  context.calls = [];
  context.remainingWrites = 2;

  try {
    const basePayload = {
      podcastId: "impact-winter",
      voterSecret: "device-one",
      userAgent: "test-agent",
      sourceIp: "127.0.0.1",
    };

    await context.community.submitRating({ ...basePayload, rating: 9 });
    await context.community.submitRating({ ...basePayload, rating: 8 });

    await assert.rejects(
      () => context.community.removeRating(basePayload),
      /too many community requests/i,
    );
    assert.equal(context.calls.length, 3);
    assert.equal(context.calls[0].scope, "community");
    assert.match(context.calls[0].clientIp, /^[0-9a-f]{64}$/);
    assert.equal(context.calls[0].clientIp, context.calls[1].clientIp);
  } finally {
    cleanupCommunityContext(context);
  }
});

test("abuse hash events are pruned after the retention window", async () => {
  const context = await createCommunityContext();

  try {
    const abuseHash = createAbuseHash({
      secret: "test-community-secret",
      sourceIp: "127.0.0.1",
      userAgent: "test-agent",
      date: new Date("2026-06-21T12:00:00.000Z"),
    });

    context.store.recordAbuseEvent({
      abuseHash,
      createdAtMs: 1_000,
      retentionMs: 30 * 24 * 60 * 60 * 1000,
    });
    context.store.recordAbuseEvent({
      abuseHash,
      createdAtMs: 31 * 24 * 60 * 60 * 1000,
      retentionMs: 30 * 24 * 60 * 60 * 1000,
    });

    const rows = context.store.listAbuseEvents(abuseHash);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].created_at_ms, 31 * 24 * 60 * 60 * 1000);
  } finally {
    cleanupCommunityContext(context);
  }
});

test("community summary batches are capped before querying the store", async () => {
  const context = await createCommunityContext({
    serviceOptions: { maxSummaryIds: 1 },
  });

  try {
    const result = context.community.getRatingSummaries({
      podcastIds: "impact-winter,ars-paradoxica",
      profileId: null,
      userAgent: "test-agent",
    });
    assert.deepEqual(Object.keys(result.summaries), ["impact-winter"]);
  } finally {
    cleanupCommunityContext(context);
  }
});

test("community summary reads never create profiles for unrecognized client identifiers", async () => {
  const context = await createCommunityContext({ minPublicRatings: 1 });

  try {
    const countProfiles = () => context.db.prepare("SELECT COUNT(*) AS count FROM community_profiles").get().count;
    const beforeCount = countProfiles();

    const byCookie = context.community.getRatingSummaries({
      podcastIds: "impact-winter",
      voterSecret: "forged-but-syntactically-valid-cookie-value",
    });
    const byHeader = context.community.getRatingSummaries({
      podcastIds: "impact-winter",
      profileId: "11111111-1111-1111-1111-111111111111",
    });

    assert.equal(byCookie.profileId, null);
    assert.equal(byHeader.profileId, null);
    assert.equal(countProfiles(), beforeCount);
  } finally {
    cleanupCommunityContext(context);
  }
});
