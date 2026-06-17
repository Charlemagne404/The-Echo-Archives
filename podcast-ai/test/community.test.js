const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadCatalog } = require("../lib/catalog");
const { openDatabase } = require("../lib/store/database");
const { createCommunityStore } = require("../lib/store/community-store");
const { createCommunityService } = require("../lib/services/community-service");

const siteRoot = path.resolve(__dirname, "../..");

test("community ratings persist and update aggregate summaries", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-community-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const catalog = await loadCatalog(siteRoot);
  const store = createCommunityStore({ db, catalog });
  const community = createCommunityService({ store });

  const firstProfile = community.createAnonymousProfile(null, "test-agent").profileId;
  const secondProfile = community.createAnonymousProfile(null, "test-agent").profileId;

  const firstSubmission = community.submitRating({
    podcastId: "impact-winter",
    rating: 9,
    profileId: firstProfile,
    userAgent: "test-agent",
  });
  const secondSubmission = community.submitRating({
    podcastId: "impact-winter",
    rating: 7,
    profileId: secondProfile,
    userAgent: "test-agent",
  });

  assert.equal(firstSubmission.summary.averageRating, 9);
  assert.equal(secondSubmission.summary.averageRating, 8);
  assert.equal(secondSubmission.summary.ratingCount, 2);

  const updatedSubmission = community.submitRating({
    podcastId: "impact-winter",
    rating: 10,
    profileId: firstProfile,
    userAgent: "test-agent",
  });

  assert.equal(updatedSubmission.summary.averageRating, 8.5);
  assert.equal(updatedSubmission.summary.ratingCount, 2);
  assert.equal(updatedSubmission.summary.myRating, 10);
  assert.equal(updatedSubmission.summary.distribution["10"], 1);
  assert.equal(updatedSubmission.summary.distribution["7"], 1);
  assert.equal(updatedSubmission.summary.distribution["9"], 0);

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("community ratings can be removed for a profile", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-community-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const catalog = await loadCatalog(siteRoot);
  const store = createCommunityStore({ db, catalog });
  const community = createCommunityService({ store });

  const profileId = community.createAnonymousProfile(null, "test-agent").profileId;
  community.submitRating({
    podcastId: "ars-paradoxica",
    rating: 8,
    profileId,
    userAgent: "test-agent",
  });

  const afterDelete = community.removeRating({
    podcastId: "ars-paradoxica",
    profileId,
    userAgent: "test-agent",
  });

  assert.equal(afterDelete.summary.ratingCount, 0);
  assert.equal(afterDelete.summary.averageRating, null);
  assert.equal(afterDelete.summary.myRating, null);

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("community rating writes are throttled after the configured burst limit", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-community-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const catalog = await loadCatalog(siteRoot);
  const store = createCommunityStore({ db, catalog });
  const calls = [];
  let remainingWrites = 2;
  const community = createCommunityService({
    store,
    rateLimiter: {
      check(scope, clientIp) {
        calls.push({ scope, clientIp });
        remainingWrites -= 1;
        if (remainingWrites < 0) {
          const error = new Error("Too many community requests from this address. Try again later.");
          error.statusCode = 429;
          error.retryAfterSeconds = 60;
          throw error;
        }
      },
    },
  });

  const profileId = community.createAnonymousProfile(null, "test-agent").profileId;
  const basePayload = {
    podcastId: "impact-winter",
    profileId,
    userAgent: "test-agent",
    sourceIp: "127.0.0.1",
  };

  community.submitRating({ ...basePayload, rating: 9 });
  community.submitRating({ ...basePayload, rating: 8 });

  assert.throws(
    () => {
      community.removeRating(basePayload);
    },
    {
      message: /too many community requests/i,
    },
  );
  assert.deepEqual(calls, [
    { scope: "community", clientIp: "127.0.0.1" },
    { scope: "community", clientIp: "127.0.0.1" },
    { scope: "community", clientIp: "127.0.0.1" },
  ]);

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
