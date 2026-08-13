const { createAbuseHash, hashValue } = require("./community-service");

const SPOILER_LEVELS = new Set(["spoiler-free", "light-spoilers", "full-spoilers"]);
const CATEGORY_SCORE_KEYS = ["voiceActing", "soundDesign", "story", "characters", "ads", "length"];

function trim(value, limit = 0) {
  const text = String(value || "").trim();
  return limit ? text.slice(0, limit) : text;
}

function trimList(value, limit = 12) {
  const entries = Array.isArray(value) ? value : [];
  return [...new Set(entries.map((item) => trim(item, 80)).filter(Boolean))].slice(0, limit);
}

function sanitizeShowIds(value = "") {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeCategoryScores(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = {};

  const unknownKeys = Object.keys(source).filter((key) => !CATEGORY_SCORE_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    throw createValidationError("Unknown detailed rating category.");
  }

  for (const key of CATEGORY_SCORE_KEYS) {
    const rawValue = source[key];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      normalized[key] = null;
      continue;
    }
    const normalizedValue = String(rawValue).trim();
    const score = /^\d+$/.test(normalizedValue) ? Number(normalizedValue) : Number.NaN;
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      throw createValidationError(`${toCategoryLabel(key)} must be a whole number from 1 to 10.`);
    }
    normalized[key] = score;
  }

  return normalized;
}

function toCategoryLabel(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}

function toPublicReview(review) {
  const {
    id,
    showId,
    authorName,
    title,
    body,
    ratingStars,
    spoilerLevel,
    bestFor,
    workedBest,
    helpfulCount,
    viewerMarkedHelpful,
    publishedAt,
  } = review;
  return {
    id,
    showId,
    authorName,
    title,
    body,
    ratingStars,
    spoilerLevel,
    bestFor,
    workedBest,
    helpfulCount,
    viewerMarkedHelpful,
    publishedAt,
  };
}

function createPublishedListenerReviewService({
  store,
  submissionStore,
  communityStore = null,
  rateLimiter = null,
  voterHashSecret = "",
  abuseRetentionDays = 30,
  knownShowIds = new Set(),
  minimumPublicRatings = 3,
  maxSummaryIds = 100,
}) {
  let knownIds = new Set(knownShowIds);
  const abuseRetentionMs = Math.max(1, abuseRetentionDays) * 24 * 60 * 60 * 1000;

  function setKnownShowIds(showIds) {
    knownIds = new Set(showIds || []);
  }

  function getSubmission(id) {
    const submission = submissionStore.getShowSubmission(id);
    if (!submission || submission.submission_type !== "listener-review") {
      const error = new Error("Listener review submission not found.");
      error.statusCode = 404;
      throw error;
    }
    if (!submission.existing_show_id || !knownIds.has(submission.existing_show_id)) {
      throw createValidationError("Listener review is not linked to a published show.");
    }
    return submission;
  }

  function buildValues(submission, edits = {}, existing = null) {
    const payload = submission.payload_json || {};
    const ratingStars = Number(String(edits.ratingStars ?? payload.ratingStars).trim());
    const spoilerLevel = trim(edits.spoilerLevel ?? payload.spoilerLevel ?? "spoiler-free", 40);
    const title = trim(edits.title ?? payload.reviewTitle, 80) || "Listener review";
    const body = trim(edits.body ?? payload.reviewText ?? payload.review, 4000);
    const authorName = trim(edits.authorName ?? payload.alias, 120) || "Anonymous listener";
    const categorySource = Object.hasOwn(edits, "categoryScores")
      ? edits.categoryScores
      : existing?.categoryScores ?? payload.categoryScores ?? {};
    if (!Number.isInteger(ratingStars) || ratingStars < 1 || ratingStars > 5) throw createValidationError("A public listener review needs a rating between 1 and 5 stars.");
    if (!SPOILER_LEVELS.has(spoilerLevel)) throw createValidationError("Choose a valid spoiler level.");
    if (!title || !body) throw createValidationError("A public listener review needs a title and review text.");
    return {
      submissionId: submission.id,
      showId: submission.existing_show_id,
      authorName,
      title,
      body,
      ratingStars,
      categoryScores: normalizeCategoryScores(categorySource),
      spoilerLevel,
      bestFor: trimList(edits.bestFor ?? payload.bestFor),
      workedBest: trimList(edits.workedBest ?? payload.workedBest),
    };
  }

  function getForMaintainer(submissionId) {
    getSubmission(submissionId);
    return store.getBySubmissionId(submissionId);
  }

  function saveForMaintainer(submissionId, edits) {
    const submission = getSubmission(submissionId);
    const existing = store.getBySubmissionId(submissionId);
    return store.upsert({ ...buildValues(submission, edits, existing), publish: false });
  }

  function publishForMaintainer(submissionId, edits) {
    const submission = getSubmission(submissionId);
    if (submission.status !== "accepted") throw createValidationError("Accept the listener review before publishing it.");
    const existing = store.getBySubmissionId(submissionId);
    const values = buildValues(submission, edits, existing);
    return store.upsert({ ...values, publish: true });
  }

  function unpublishForMaintainer(submissionId) {
    getSubmission(submissionId);
    return store.unpublish(submissionId);
  }

  function ensureKnownShow(showId) {
    if (!knownIds.has(showId)) {
      const error = new Error("Show not found.");
      error.statusCode = 404;
      throw error;
    }
  }

  function getViewerProfileId(voterSecret) {
    if (!voterSecret || !communityStore) return null;
    return communityStore.findDeviceProfileId(hashValue(voterHashSecret, voterSecret));
  }

  function getPublicReviewPage(showId, { page = 1, pageSize = 1, voterSecret = "" } = {}) {
    ensureKnownShow(showId);
    const viewerProfileId = getViewerProfileId(voterSecret);
    const reviewPage = store.getPublishedPageForShow(showId, { page, pageSize, viewerProfileId });
    const scoreSummary = Object.fromEntries(Object.entries(store.getCategorySummaryForShow(showId)).map(([key, summary]) => [key, {
      ...summary,
      isPublic: summary.ratingCount >= minimumPublicRatings,
    }]));
    return {
      reviews: reviewPage.reviews.map(toPublicReview),
      pagination: reviewPage.pagination,
      scoreSummary,
      listenerReviewScore: store.getListenerReviewScoreForShow(showId),
    };
  }

  function getListenerReviewScoreSummaries(showIds) {
    const ids = Array.from(new Set(Array.isArray(showIds) ? showIds : sanitizeShowIds(showIds)))
      .filter((showId) => knownIds.has(showId))
      .slice(0, Math.max(1, maxSummaryIds));
    return { summaries: store.listListenerReviewScoreSummaries(ids) };
  }

  function listPublicForShow(showId) {
    ensureKnownShow(showId);
    return store.listPublishedForShow(showId).map(toPublicReview);
  }

  async function updateHelpful({ reviewId, voterSecret, userAgent = "", sourceIp = "", helpful }) {
    if (!communityStore) throw new Error("Community profiles are unavailable.");
    const review = store.getPublishedById(reviewId);
    if (!review) {
      const error = new Error("Published listener review not found.");
      error.statusCode = 404;
      throw error;
    }

    const abuseHash = createAbuseHash({ secret: voterHashSecret, sourceIp, userAgent });
    rateLimiter?.check("community", abuseHash);
    const profileId = communityStore.ensureDeviceProfile({
      voterHash: hashValue(voterHashSecret, voterSecret),
      userAgent,
      abuseHash,
    });
    communityStore.recordAbuseEvent({ scope: "community-review-helpful", abuseHash, retentionMs: abuseRetentionMs });
    const state = helpful ? store.markHelpful(reviewId, profileId) : store.removeHelpful(reviewId, profileId);
    return {
      reviewId,
      helpfulCount: Number(state?.helpful_count || 0),
      viewerMarkedHelpful: Boolean(state?.viewer_marked_helpful),
    };
  }

  return {
    getForMaintainer,
    getListenerReviewScoreSummaries,
    getPublicReviewPage,
    listPublicForShow,
    publishForMaintainer,
    saveForMaintainer,
    setKnownShowIds,
    unpublishForMaintainer,
    updateHelpful,
  };
}

module.exports = { CATEGORY_SCORE_KEYS, createPublishedListenerReviewService, normalizeCategoryScores };
