const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase } = require("../lib/store/database");
const { createSubmissionStore } = require("../lib/store/submission-store");
const { createPublishedListenerReviewStore } = require("../lib/store/published-listener-review-store");
const { createCommunityStore } = require("../lib/store/community-store");
const { createPublishedListenerReviewService, normalizeCategoryScores } = require("../lib/services/published-listener-review-service");

const categoryScores = {
  voiceActing: 9,
  soundDesign: 8,
  story: 7,
  characters: 8,
  ads: 6,
  length: 7,
};

test("published category normalization keeps sparse scores strict", () => {
  assert.equal(normalizeCategoryScores({ ads: 7 }).ads, 7);
  assert.equal(normalizeCategoryScores({ ads: 7 }).story, null);
  assert.throws(() => normalizeCategoryScores({ ads: 7.5 }), /whole number from 1 to 10/i);
  assert.throws(() => normalizeCategoryScores({ madeUp: 8 }), /unknown detailed rating category/i);
});

function createContext() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-public-review-"));
  const db = openDatabase(path.join(tempDir, "community.sqlite"));
  const submissionStore = createSubmissionStore({ db });
  const store = createPublishedListenerReviewStore({ db });
  const calls = [];
  const communityStore = createCommunityStore({
    db,
    catalog: [{ id: "impact-winter", title: "Impact Winter", href: "/shows/impact-winter", image: "", hasPage: true, finalRating: 10 }],
  });
  const recordAbuseEvent = communityStore.recordAbuseEvent.bind(communityStore);
  communityStore.recordAbuseEvent = (value) => {
    calls.push(value);
    return recordAbuseEvent(value);
  };
  const service = createPublishedListenerReviewService({
    store,
    submissionStore,
    communityStore,
    voterHashSecret: "listener-review-test-secret",
    knownShowIds: new Set(["impact-winter"]),
    minimumPublicRatings: 3,
  });
  return { db, service, store, submissionStore, calls, tempDir };
}

function createSubmission(context, { alias = "Listener42", title = "Great atmosphere", body = "A thoughtful listener review.", scores = categoryScores } = {}) {
  return context.submissionStore.createShowSubmission({
    status: "accepted", priority: "normal", submissionType: "listener-review", existingShowId: "impact-winter", showTitle: "Impact Winter",
    contactEmail: "listener@example.com", payload: {
      ratingStars: 4, spoilerLevel: "spoiler-free", reviewTitle: title, review: body,
      alias, bestFor: ["Long walks"], workedBest: ["Sound design"], categoryScores: scores,
    }, sourceIp: "127.0.0.1", userAgent: "test-agent",
  });
}

function cleanup(context) {
  context.db.close();
  fs.rmSync(context.tempDir, { recursive: true, force: true });
}

test("database migration adds nullable checked category columns and keeps legacy review scores absent", () => {
  const context = createContext();
  try {
    const columns = context.db.prepare("PRAGMA table_info(published_listener_reviews)").all().map((column) => column.name);
    for (const column of ["voice_acting_score", "sound_design_score", "story_score", "characters_score", "ads_score", "length_score"]) {
      assert.ok(columns.includes(column));
    }
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM listener_review_helpful_votes").get().count, 0);
  } finally {
    cleanup(context);
  }
});

test("public listener reviews require acceptance, allow sparse category scores, and never expose private submission data", () => {
  const context = createContext();
  try {
    const submission = createSubmission(context);
    const draft = context.service.saveForMaintainer(submission.id, { body: "Edited public copy." });
    assert.equal(draft.published, false);
    assert.deepEqual(context.service.listPublicForShow("impact-winter"), []);

    const published = context.service.publishForMaintainer(submission.id, { body: "Edited public copy." });
    assert.equal(published.published, true);
    const publicReviews = context.service.listPublicForShow("impact-winter");
    assert.deepEqual(publicReviews, [{
      id: published.id, showId: "impact-winter", authorName: "Listener42", title: "Great atmosphere", body: "Edited public copy.",
      ratingStars: 4, spoilerLevel: "spoiler-free", bestFor: ["Long walks"], workedBest: ["Sound design"], helpfulCount: 0,
      viewerMarkedHelpful: false, publishedAt: published.publishedAt,
    }]);
    assert.doesNotMatch(JSON.stringify(publicReviews), /listener@example.com|127\.0\.0\.1|test-agent/i);

    const legacySubmission = createSubmission(context, { alias: "Legacy listener", title: "Older score" });
    const legacy = context.store.upsert({
      submissionId: legacySubmission.id, showId: "impact-winter", authorName: "Legacy listener", title: "Older score", body: "Still useful text.",
      ratingStars: 3, categoryScores: {}, spoilerLevel: "spoiler-free", bestFor: [], workedBest: [], publish: true,
    });
    assert.deepEqual(legacy.categoryScores, {
      voiceActing: null, soundDesign: null, story: null, characters: null, ads: null, length: null,
    });
    const republishedLegacy = context.service.publishForMaintainer(legacySubmission.id, { body: "Re-published without genuine scores." });
    assert.deepEqual(republishedLegacy.categoryScores, {
      voiceActing: null, soundDesign: null, story: null, characters: null, ads: null, length: null,
    });

    const unpublished = context.service.unpublishForMaintainer(submission.id);
    assert.equal(unpublished.published, false);
    assert.equal(context.service.listPublicForShow("impact-winter").length, 1);
  } finally {
    cleanup(context);
  }
});

test("category summaries exclude legacy reviews and reveal their averages only after three published ratings", () => {
  const context = createContext();
  try {
    const first = createSubmission(context, { alias: "First", scores: { ...categoryScores, voiceActing: 8 } });
    const second = createSubmission(context, { alias: "Second", scores: { ...categoryScores, voiceActing: 10 } });
    const third = createSubmission(context, { alias: "Third", scores: { ...categoryScores, voiceActing: 9 } });
    context.service.publishForMaintainer(first.id, {});
    context.service.publishForMaintainer(second.id, {});

    let page = context.service.getPublicReviewPage("impact-winter");
    assert.equal(page.scoreSummary.voiceActing.ratingCount, 2);
    assert.equal(page.scoreSummary.voiceActing.averageRating, 9);
    assert.equal(page.scoreSummary.voiceActing.isPublic, false);

    const legacySubmission = createSubmission(context, { alias: "Legacy" });
    context.store.upsert({
      submissionId: legacySubmission.id, showId: "impact-winter", authorName: "Legacy", title: "Old review", body: "No categories were collected then.",
      ratingStars: 5, categoryScores: {}, spoilerLevel: "spoiler-free", bestFor: [], workedBest: [], publish: true,
    });
    page = context.service.getPublicReviewPage("impact-winter");
    assert.equal(page.scoreSummary.voiceActing.ratingCount, 2);

    context.service.publishForMaintainer(third.id, {});
    page = context.service.getPublicReviewPage("impact-winter");
    assert.deepEqual(page.scoreSummary.voiceActing, { averageRating: 9, ratingCount: 3, isPublic: true });
  } finally {
    cleanup(context);
  }
});

test("published listener reviews aggregate each supplied category independently", () => {
  const context = createContext();
  try {
    const submission = createSubmission(context, { scores: { voiceActing: 9, ads: 4 } });
    const published = context.service.publishForMaintainer(submission.id, {});
    assert.equal(published.categoryScores.voiceActing, 9);
    assert.equal(published.categoryScores.ads, 4);
    assert.equal(published.categoryScores.story, null);
    const summary = context.service.getPublicReviewPage("impact-winter").scoreSummary;
    assert.equal(summary.voiceActing.ratingCount, 1);
    assert.equal(summary.ads.ratingCount, 1);
    assert.equal(summary.story.ratingCount, 0);
  } finally {
    cleanup(context);
  }
});

test("listener reviews are paginated by helpful votes then publication date and helpful votes toggle once per device", async () => {
  const context = createContext();
  try {
    const older = createSubmission(context, { alias: "Older", title: "Older review" });
    const newer = createSubmission(context, { alias: "Newer", title: "Newer review" });
    const lower = createSubmission(context, { alias: "Lower", title: "Lower vote review" });
    const olderReview = context.service.publishForMaintainer(older.id, {});
    const newerReview = context.service.publishForMaintainer(newer.id, {});
    const lowerReview = context.service.publishForMaintainer(lower.id, {});
    context.db.prepare("UPDATE published_listener_reviews SET published_at = ? WHERE id = ?").run("2026-01-01T00:00:00.000Z", olderReview.id);
    context.db.prepare("UPDATE published_listener_reviews SET published_at = ? WHERE id = ?").run("2026-02-01T00:00:00.000Z", newerReview.id);
    context.db.prepare("UPDATE published_listener_reviews SET published_at = ? WHERE id = ?").run("2026-03-01T00:00:00.000Z", lowerReview.id);

    await context.service.updateHelpful({ reviewId: olderReview.id, helpful: true, voterSecret: "device-one", sourceIp: "127.0.0.1" });
    await context.service.updateHelpful({ reviewId: olderReview.id, helpful: true, voterSecret: "device-two", sourceIp: "127.0.0.2" });
    await context.service.updateHelpful({ reviewId: newerReview.id, helpful: true, voterSecret: "device-one", sourceIp: "127.0.0.1" });
    await context.service.updateHelpful({ reviewId: newerReview.id, helpful: true, voterSecret: "device-three", sourceIp: "127.0.0.3" });
    await context.service.updateHelpful({ reviewId: lowerReview.id, helpful: true, voterSecret: "device-one", sourceIp: "127.0.0.1" });

    const firstPage = context.service.getPublicReviewPage("impact-winter", { page: 1, voterSecret: "device-one" });
    assert.deepEqual(firstPage.pagination, { page: 1, pageSize: 1, totalPages: 3, totalReviews: 3 });
    assert.equal(firstPage.reviews[0].id, newerReview.id);
    assert.equal(firstPage.reviews[0].helpfulCount, 2);
    assert.equal(firstPage.reviews[0].viewerMarkedHelpful, true);
    const secondPage = context.service.getPublicReviewPage("impact-winter", { page: 2 });
    assert.equal(secondPage.reviews[0].id, olderReview.id);

    const repeatedVote = await context.service.updateHelpful({ reviewId: newerReview.id, helpful: true, voterSecret: "device-one", sourceIp: "127.0.0.1" });
    assert.equal(repeatedVote.helpfulCount, 2);
    const removedVote = await context.service.updateHelpful({ reviewId: newerReview.id, helpful: false, voterSecret: "device-one", sourceIp: "127.0.0.1" });
    assert.deepEqual(removedVote, { reviewId: newerReview.id, helpfulCount: 1, viewerMarkedHelpful: false });
    assert.ok(context.calls.length >= 6);
  } finally {
    cleanup(context);
  }
});

test("publishing is blocked until a listener submission is accepted", () => {
  const context = createContext();
  try {
    const submission = createSubmission(context);
    context.db.prepare("UPDATE show_submissions SET status = 'in-review' WHERE id = ?").run(submission.id);
    assert.throws(() => context.service.publishForMaintainer(submission.id, {}), /Accept the listener review/i);
  } finally {
    cleanup(context);
  }
});
