const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createDataRetentionService } = require("../lib/services/data-retention-service");
const { createSubmissionService } = require("../lib/services/submission-service");
const { openDatabase } = require("../lib/store/database");
const { createCommunityStore } = require("../lib/store/community-store");
const { createRateLimitStore } = require("../lib/store/rate-limit-store");
const { createSubmissionStore } = require("../lib/store/submission-store");

const NOW = new Date("2026-08-20T00:00:00.000Z");
const OLD_SUBMISSION_DATE = "2025-12-01T00:00:00.000Z";
const OLD_NETWORK_DATE = "2026-07-01T00:00:00.000Z";
const OLD_PROFILE_DATE = "2026-04-01T00:00:00.000Z";
const RECENT_EVENT_MS = NOW.getTime() - (2 * 24 * 60 * 60 * 1000);

function createContext() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-retention-"));
  const db = openDatabase(path.join(tempDir, "community.sqlite"));
  const catalog = [{
    id: "impact-winter",
    title: "Impact Winter",
    href: "/shows/impact-winter",
    image: "",
    hasPage: true,
    finalRating: 10,
    tags: [],
    summary: "",
    bestFor: [],
    similarTo: [],
  }];
  const communityStore = createCommunityStore({ db, catalog });
  const rateLimitStore = createRateLimitStore({ db });
  const submissionStore = createSubmissionStore({ db });
  const retention = createDataRetentionService({
    communityStore,
    rateLimitStore,
    submissionStore,
    policy: {
      communityAbuseRetentionDays: 30,
      communityProfileMetadataRetentionDays: 30,
      communityOrphanProfileRetentionDays: 90,
      submissionNetworkDataRetentionDays: 30,
      submissionPersonalDataRetentionDays: 180,
      rateLimitWindows: {
        chat: 10 * 60 * 1000,
        community: 10 * 60 * 1000,
        submissions: 60 * 60 * 1000,
        "maintainer-login": 15 * 60 * 1000,
      },
    },
  });

  return { db, communityStore, rateLimitStore, submissionStore, retention, tempDir };
}

function cleanup(context) {
  context.db.close();
  fs.rmSync(context.tempDir, { recursive: true, force: true });
}

function createSubmission(store, overrides = {}) {
  return store.createShowSubmission({
    status: "new",
    priority: "normal",
    submissionType: "show",
    existingShowId: "",
    showTitle: "Retention test submission",
    creatorName: "Creator",
    contactEmail: "creator@example.com",
    officialSite: "https://example.com/show",
    rssOrListenLink: "",
    genres: "",
    notes: "Private moderation note",
    payload: { privateField: "private value" },
    provenance: { source: "test" },
    sourceIp: "198.51.100.10",
    userAgent: "retention-test-agent",
    ...overrides,
  });
}

function setSubmissionDates(db, id, submittedAt, reviewedAt = null) {
  db.prepare(`
    UPDATE show_submissions
    SET submitted_at = ?, reviewed_at = ?
    WHERE id = ?
  `).run(submittedAt, reviewedAt, id);
}

function createPublishedReview(db, submissionId) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO published_listener_reviews (
      id, submission_id, show_id, author_name, title, body, rating_stars, is_published, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id,
    submissionId,
    "impact-winter",
    "Public listener",
    "A public review",
    "Public review text",
    4,
    OLD_SUBMISSION_DATE,
  );
  return id;
}

test("retention cleanup deletes, redacts, and preserves data according to the published policy", () => {
  const context = createContext();

  try {
    const expired = createSubmission(context.submissionStore);
    setSubmissionDates(context.db, expired.id, OLD_SUBMISSION_DATE, OLD_SUBMISSION_DATE);

    const published = createSubmission(context.submissionStore, {
      status: "accepted",
      submissionType: "listener-review",
    });
    setSubmissionDates(context.db, published.id, OLD_SUBMISSION_DATE, OLD_SUBMISSION_DATE);
    const publishedReviewId = createPublishedReview(context.db, published.id);

    const networkOnly = createSubmission(context.submissionStore, {
      contactEmail: "keep-contact@example.com",
    });
    setSubmissionDates(context.db, networkOnly.id, OLD_NETWORK_DATE, null);

    const recent = createSubmission(context.submissionStore, {
      showTitle: "Recent submission",
    });

    context.db.prepare(`
      INSERT INTO rate_limit_events (scope, client_ip, created_at_ms)
      VALUES (?, ?, ?), (?, ?, ?)
    `).run(
      "submissions", "198.51.100.20", NOW.getTime() - (2 * 60 * 60 * 1000),
      "submissions", "198.51.100.21", NOW.getTime() - (30 * 60 * 1000),
    );

    const orphanProfileId = context.communityStore.ensureDeviceProfile({
      voterHash: "orphan-voter-hash",
      userAgent: "old-orphan-agent",
      abuseHash: "old-orphan-abuse",
    });
    const activeProfileId = context.communityStore.ensureDeviceProfile({
      voterHash: "active-voter-hash",
      userAgent: "old-active-agent",
      abuseHash: "old-active-abuse",
    });
    context.communityStore.upsertRating({
      podcastId: "impact-winter",
      profileId: activeProfileId,
      rating: 9,
      source: "test",
      abuseHash: "old-active-abuse",
    });
    context.communityStore.recordAbuseEvent({
      scope: "community-rating",
      abuseHash: "old-abuse-event",
      createdAtMs: NOW.getTime() - (40 * 24 * 60 * 60 * 1000),
    });
    context.communityStore.recordAbuseEvent({
      scope: "community-rating",
      abuseHash: "recent-abuse-event",
      createdAtMs: RECENT_EVENT_MS,
    });
    context.db.prepare(`
      UPDATE community_profiles
      SET last_seen_at = ?, updated_at = ?
      WHERE id IN (?, ?)
    `).run(OLD_PROFILE_DATE, OLD_PROFILE_DATE, orphanProfileId, activeProfileId);
    context.db.prepare("UPDATE rating_events SET created_at = ? WHERE profile_id = ?").run(OLD_PROFILE_DATE, activeProfileId);
    context.db.prepare("UPDATE rating_submissions SET updated_at = ? WHERE profile_id = ?").run(OLD_PROFILE_DATE, activeProfileId);

    const result = context.retention.run({ now: NOW });

    assert.equal(context.submissionStore.getShowSubmission(expired.id), null);

    const retainedNetworkOnly = context.submissionStore.getShowSubmission(networkOnly.id);
    assert.equal(retainedNetworkOnly.contact_email, "keep-contact@example.com");
    assert.equal(retainedNetworkOnly.source_ip, "");
    assert.equal(retainedNetworkOnly.user_agent, "");

    const redactedPublished = context.submissionStore.getShowSubmission(published.id);
    assert.equal(redactedPublished.contact_email, "");
    assert.equal(redactedPublished.creator_name, "");
    assert.deepEqual(redactedPublished.payload_json, {});
    assert.deepEqual(redactedPublished.provenance_json, {});
    assert.equal(redactedPublished.source_ip, "");
    assert.equal(redactedPublished.user_agent, "");
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM published_listener_reviews WHERE id = ? AND is_published = 1").get(publishedReviewId).count, 1);
    assert.ok(context.submissionStore.getShowSubmission(recent.id));

    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM rate_limit_events WHERE client_ip = ?").get("198.51.100.20").count, 0);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM rate_limit_events WHERE client_ip = ?").get("198.51.100.21").count, 1);

    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM community_profiles WHERE id = ?").get(orphanProfileId).count, 0);
    const activeProfile = context.db.prepare("SELECT last_user_agent, last_abuse_hash FROM community_profiles WHERE id = ?").get(activeProfileId);
    assert.deepEqual(activeProfile, { last_user_agent: "", last_abuse_hash: "" });
    const activeRating = context.db.prepare("SELECT rating, abuse_hash FROM rating_submissions WHERE profile_id = ?").get(activeProfileId);
    assert.deepEqual(activeRating, { rating: 9, abuse_hash: "" });
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM rating_events WHERE profile_id = ?").get(activeProfileId).count, 0);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM community_abuse_events WHERE abuse_hash = ?").get("old-abuse-event").count, 0);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM community_abuse_events WHERE abuse_hash = ?").get("recent-abuse-event").count, 1);

    assert.ok(result.submissions.submissionsDeleted >= 1);
    assert.ok(result.submissions.networkRowsRedacted >= 1);
    assert.ok(result.submissions.publishedSubmissionRowsRedacted >= 1);
    assert.equal(result.rateLimitRowsPruned.submissions, 1);
    assert.equal(result.community.ratingAbuseHashesRedacted, 1);
    assert.equal(result.community.orphanProfilesDeleted, 1);
  } finally {
    cleanup(context);
  }
});

test("server-side submission service requires the current legal acknowledgement when enabled", () => {
  const context = createContext();
  const service = createSubmissionService({
    store: context.submissionStore,
    requireLegalAcknowledgement: true,
  });
  const baseBody = {
    intakeVersion: 2,
    submissionType: "show",
    showTitle: "Legally acknowledged show",
    officialSite: "https://example.com/show",
    website: "",
  };

  try {
    assert.throws(
      () => service.submit(baseBody, { sourceIp: "127.0.0.1", userAgent: "test-agent" }),
      /acknowledge the current Terms and Privacy notice/i,
    );

    const result = service.submit({
      ...baseBody,
      legalAcknowledged: true,
      legalVersion: "2026-08-20",
    }, { sourceIp: "127.0.0.1", userAgent: "test-agent" });

    assert.equal(result.accepted, true);
    assert.deepEqual(result.submission.provenance_json.legalAcknowledgement, {
      version: "2026-08-20",
      acknowledgedAt: result.submission.provenance_json.legalAcknowledgement.acknowledgedAt,
    });
    assert.match(result.submission.provenance_json.legalAcknowledgement.acknowledgedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    cleanup(context);
  }
});
