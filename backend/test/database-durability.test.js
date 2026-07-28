const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { openDatabase } = require("../lib/store/database");
const { createCommunityStore } = require("../lib/store/community-store");
const { createRateLimitStore } = require("../lib/store/rate-limit-store");
const { createSubmissionStore } = require("../lib/store/submission-store");

const SQLITE_SYNCHRONOUS_FULL = 2;
const SQLITE_SYNCHRONOUS_NORMAL = 1;

function createTempDatabase(mode) {
  const label = mode ? mode.toLowerCase() : "default";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `echo-archives-sqlite-${label}-`));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = mode ? openDatabase(dbPath, { synchronous: mode }) : openDatabase(dbPath);
  return { db, tempDir };
}

function cleanupTempDatabase(context) {
  context.db.close();
  fs.rmSync(context.tempDir, { recursive: true, force: true });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function benchmarkRepresentativeWrites(mode, iterations = 24) {
  const context = createTempDatabase(mode);
  try {
    const catalog = [{
      id: "durability-benchmark",
      title: "Durability Benchmark",
      href: "/shows/durability-benchmark",
      image: "",
      hasPage: true,
      finalRating: null,
      tags: [],
      summary: "",
      bestFor: [],
      similarTo: [],
    }];
    const communityStore = createCommunityStore({ db: context.db, catalog });
    const rateLimitStore = createRateLimitStore({ db: context.db });
    const submissionStore = createSubmissionStore({ db: context.db });
    const samples = [];

    for (let index = 0; index < iterations; index += 1) {
      const startedAt = performance.now();
      const timestamp = 1_800_000_000_000 + index;
      const abuseHash = `benchmark-abuse-${index}`;
      const profileId = communityStore.ensureDeviceProfile({
        voterHash: `benchmark-voter-${index}`,
        userAgent: "durability-benchmark",
        abuseHash,
      });

      rateLimitStore.consume({
        scope: "community",
        clientIp: abuseHash,
        windowMs: 60_000,
        maxEvents: iterations + 1,
        createdAtMs: timestamp,
      });
      communityStore.recordAbuseEvent({
        scope: "community-rating",
        abuseHash,
        createdAtMs: timestamp,
        retentionMs: 30 * 24 * 60 * 60 * 1000,
      });
      communityStore.upsertRating({
        podcastId: "durability-benchmark",
        profileId,
        rating: (index % 10) + 1,
        source: "benchmark",
        abuseHash,
      });

      const submission = submissionStore.createShowSubmission({
        status: "new",
        priority: "normal",
        submissionType: "show",
        existingShowId: "",
        showTitle: `Benchmark submission ${index}`,
        creatorName: "",
        contactEmail: "",
        officialSite: "https://example.test",
        rssOrListenLink: "",
        genres: "",
        notes: "",
        payload: { intakeVersion: 2 },
        provenance: {},
        sourceIp: "198.51.100.1",
        userAgent: "durability-benchmark",
      });
      submissionStore.updateShowSubmissionReview(submission.id, {
        priority: "high",
        reviewNotes: "Representative moderation update.",
        reviewedBy: "benchmark",
      });
      samples.push(performance.now() - startedAt);
    }

    context.db.pragma("wal_checkpoint(TRUNCATE)");
    const counts = {
      profiles: context.db.prepare("SELECT COUNT(*) AS count FROM community_profiles").get().count,
      ratings: context.db.prepare("SELECT COUNT(*) AS count FROM rating_submissions").get().count,
      ratingEvents: context.db.prepare("SELECT COUNT(*) AS count FROM rating_events").get().count,
      submissions: context.db.prepare("SELECT COUNT(*) AS count FROM show_submissions").get().count,
      rateLimitEvents: context.db.prepare("SELECT COUNT(*) AS count FROM rate_limit_events").get().count,
    };

    return {
      mode,
      iterations,
      meanMs: samples.reduce((sum, duration) => sum + duration, 0) / samples.length,
      medianMs: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
      maxMs: Math.max(...samples),
      counts,
    };
  } finally {
    cleanupTempDatabase(context);
  }
}

test("SQLite uses WAL with FULL synchronization by default and validates the override", () => {
  const previousSynchronousMode = process.env.SQLITE_SYNCHRONOUS;
  delete process.env.SQLITE_SYNCHRONOUS;
  const defaultContext = createTempDatabase();
  process.env.SQLITE_SYNCHRONOUS = "NORMAL";
  const environmentOverrideContext = createTempDatabase();
  const invalidDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-sqlite-invalid-"));

  try {
    assert.equal(defaultContext.db.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(defaultContext.db.pragma("synchronous", { simple: true }), SQLITE_SYNCHRONOUS_FULL);
    assert.equal(environmentOverrideContext.db.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(
      environmentOverrideContext.db.pragma("synchronous", { simple: true }),
      SQLITE_SYNCHRONOUS_NORMAL,
    );
    assert.throws(
      () => openDatabase(path.join(invalidDir, "community.sqlite"), { synchronous: "OFF" }),
      /SQLITE_SYNCHRONOUS must be FULL or NORMAL/,
    );
  } finally {
    if (previousSynchronousMode === undefined) {
      delete process.env.SQLITE_SYNCHRONOUS;
    } else {
      process.env.SQLITE_SYNCHRONOUS = previousSynchronousMode;
    }
    cleanupTempDatabase(defaultContext);
    cleanupTempDatabase(environmentOverrideContext);
    fs.rmSync(invalidDir, { recursive: true, force: true });
  }
});

test("representative temporary-database writes complete under NORMAL and FULL", (context) => {
  const normal = benchmarkRepresentativeWrites("NORMAL");
  const full = benchmarkRepresentativeWrites("FULL");

  for (const result of [normal, full]) {
    assert.deepEqual(result.counts, {
      profiles: result.iterations,
      ratings: result.iterations,
      ratingEvents: result.iterations,
      submissions: result.iterations,
      rateLimitEvents: result.iterations,
    });
    context.diagnostic(
      `${result.mode}: ${result.iterations} mixed flows; mean=${result.meanMs.toFixed(2)}ms, median=${result.medianMs.toFixed(2)}ms, p95=${result.p95Ms.toFixed(2)}ms, max=${result.maxMs.toFixed(2)}ms`,
    );
  }
});
