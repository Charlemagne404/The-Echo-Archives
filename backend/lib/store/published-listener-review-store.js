const { randomUUID } = require("node:crypto");

const CATEGORY_SCORE_COLUMNS = {
  voiceActing: "voice_acting_score",
  soundDesign: "sound_design_score",
  story: "story_score",
  characters: "characters_score",
  ads: "ads_score",
  length: "length_score",
};

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function normalizeScore(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 10 ? numeric : null;
}

function hydrateReview(row) {
  if (!row) return null;
  const categoryScores = Object.fromEntries(
    Object.entries(CATEGORY_SCORE_COLUMNS).map(([key, column]) => [key, normalizeScore(row[column])]),
  );
  return {
    id: row.id,
    submissionId: row.submission_id,
    showId: row.show_id,
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    ratingStars: row.rating_stars,
    categoryScores,
    spoilerLevel: row.spoiler_level,
    bestFor: parseJsonArray(row.best_for_json),
    workedBest: parseJsonArray(row.worked_best_json),
    helpfulCount: Number(row.helpful_count || 0),
    viewerMarkedHelpful: Boolean(row.viewer_marked_helpful),
    published: Boolean(row.is_published),
    publishedAt: row.published_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createPublishedListenerReviewStore({ db }) {
  const bySubmission = db.prepare("SELECT * FROM published_listener_reviews WHERE submission_id = ?");
  const byId = db.prepare("SELECT * FROM published_listener_reviews WHERE id = ?");
  const publishedById = db.prepare("SELECT * FROM published_listener_reviews WHERE id = ? AND is_published = 1");
  const publishedByShow = db.prepare(`
    SELECT reviews.*, COUNT(votes.review_id) AS helpful_count, 0 AS viewer_marked_helpful
    FROM published_listener_reviews AS reviews
    LEFT JOIN listener_review_helpful_votes AS votes ON votes.review_id = reviews.id
    WHERE reviews.show_id = ? AND reviews.is_published = 1
    GROUP BY reviews.id
    ORDER BY helpful_count DESC, datetime(reviews.published_at) DESC, reviews.id DESC
  `);
  const publishedPageByShow = db.prepare(`
    SELECT
      reviews.*,
      COUNT(votes.review_id) AS helpful_count,
      MAX(CASE WHEN votes.profile_id = @viewerProfileId THEN 1 ELSE 0 END) AS viewer_marked_helpful
    FROM published_listener_reviews AS reviews
    LEFT JOIN listener_review_helpful_votes AS votes ON votes.review_id = reviews.id
    WHERE reviews.show_id = @showId AND reviews.is_published = 1
    GROUP BY reviews.id
    ORDER BY helpful_count DESC, datetime(reviews.published_at) DESC, reviews.id DESC
    LIMIT @limit OFFSET @offset
  `);
  const publishedCountByShow = db.prepare(`
    SELECT COUNT(*) AS count FROM published_listener_reviews
    WHERE show_id = ? AND is_published = 1
  `);
  const categorySummaryByShow = db.prepare(`
    SELECT
      COUNT(voice_acting_score) AS voice_acting_count,
      AVG(voice_acting_score) AS voice_acting_average,
      COUNT(sound_design_score) AS sound_design_count,
      AVG(sound_design_score) AS sound_design_average,
      COUNT(story_score) AS story_count,
      AVG(story_score) AS story_average,
      COUNT(characters_score) AS characters_count,
      AVG(characters_score) AS characters_average,
      COUNT(ads_score) AS ads_count,
      AVG(ads_score) AS ads_average,
      COUNT(length_score) AS length_count,
      AVG(length_score) AS length_average
    FROM published_listener_reviews
    WHERE show_id = ? AND is_published = 1
  `);
  const addHelpfulVote = db.prepare(`
    INSERT OR IGNORE INTO listener_review_helpful_votes (review_id, profile_id)
    VALUES (@reviewId, @profileId)
  `);
  const removeHelpfulVote = db.prepare(`
    DELETE FROM listener_review_helpful_votes
    WHERE review_id = ? AND profile_id = ?
  `);
  const helpfulState = db.prepare(`
    SELECT
      COUNT(*) AS helpful_count,
      MAX(CASE WHEN profile_id = @profileId THEN 1 ELSE 0 END) AS viewer_marked_helpful
    FROM listener_review_helpful_votes
    WHERE review_id = @reviewId
  `);

  function getBySubmissionId(submissionId) {
    return hydrateReview(bySubmission.get(submissionId));
  }

  function getPublishedById(reviewId) {
    return hydrateReview(publishedById.get(reviewId));
  }

  function listPublishedForShow(showId) {
    return publishedByShow.all(showId).map(hydrateReview);
  }

  function getPublishedPageForShow(showId, { page = 1, pageSize = 1, viewerProfileId = null } = {}) {
    const safePage = Math.max(1, Math.trunc(Number(page) || 1));
    const safePageSize = Math.max(1, Math.min(20, Math.trunc(Number(pageSize) || 1)));
    const totalReviews = Number(publishedCountByShow.get(showId)?.count || 0);
    const totalPages = Math.max(1, Math.ceil(totalReviews / safePageSize));
    const resolvedPage = Math.min(safePage, totalPages);
    return {
      reviews: publishedPageByShow.all({
        showId,
        viewerProfileId,
        limit: safePageSize,
        offset: (resolvedPage - 1) * safePageSize,
      }).map(hydrateReview),
      pagination: {
        page: resolvedPage,
        pageSize: safePageSize,
        totalPages,
        totalReviews,
      },
    };
  }

  function getCategorySummaryForShow(showId) {
    const row = categorySummaryByShow.get(showId) || {};
    return Object.fromEntries(Object.entries(CATEGORY_SCORE_COLUMNS).map(([key, column]) => {
      const prefix = column.replace(/_score$/, "");
      const ratingCount = Number(row[`${prefix}_count`] || 0);
      const average = Number(row[`${prefix}_average`]);
      return [key, {
        ratingCount,
        averageRating: Number.isFinite(average) ? average : null,
      }];
    }));
  }

  function upsert({
    submissionId,
    showId,
    authorName,
    title,
    body,
    ratingStars,
    categoryScores = {},
    spoilerLevel,
    bestFor,
    workedBest,
    publish = false,
  }) {
    const existing = getBySubmissionId(submissionId);
    const now = new Date().toISOString();
    const publishedAt = publish ? existing?.published ? existing.publishedAt : now : existing?.publishedAt || null;
    const isPublished = publish || existing?.published ? 1 : 0;
    const scoreValues = Object.fromEntries(
      Object.entries(CATEGORY_SCORE_COLUMNS).map(([key, column]) => [
        column,
        normalizeScore(categoryScores[key]),
      ]),
    );
    const values = {
      id: existing?.id || randomUUID(),
      submissionId,
      showId,
      authorName,
      title,
      body,
      ratingStars,
      ...scoreValues,
      spoilerLevel,
      bestForJson: JSON.stringify(bestFor),
      workedBestJson: JSON.stringify(workedBest),
      isPublished,
      publishedAt,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO published_listener_reviews (
        id, submission_id, show_id, author_name, title, body, rating_stars,
        voice_acting_score, sound_design_score, story_score, characters_score, ads_score, length_score,
        spoiler_level, best_for_json, worked_best_json, is_published, published_at, updated_at
      ) VALUES (
        @id, @submissionId, @showId, @authorName, @title, @body, @ratingStars,
        @voice_acting_score, @sound_design_score, @story_score, @characters_score, @ads_score, @length_score,
        @spoilerLevel, @bestForJson, @workedBestJson, @isPublished, @publishedAt, @updatedAt
      )
      ON CONFLICT(submission_id) DO UPDATE SET
        show_id = excluded.show_id,
        author_name = excluded.author_name,
        title = excluded.title,
        body = excluded.body,
        rating_stars = excluded.rating_stars,
        voice_acting_score = excluded.voice_acting_score,
        sound_design_score = excluded.sound_design_score,
        story_score = excluded.story_score,
        characters_score = excluded.characters_score,
        ads_score = excluded.ads_score,
        length_score = excluded.length_score,
        spoiler_level = excluded.spoiler_level,
        best_for_json = excluded.best_for_json,
        worked_best_json = excluded.worked_best_json,
        is_published = excluded.is_published,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at
    `).run(values);

    return getBySubmissionId(submissionId);
  }

  function markHelpful(reviewId, profileId) {
    addHelpfulVote.run({ reviewId, profileId });
    return helpfulState.get({ reviewId, profileId });
  }

  function removeHelpful(reviewId, profileId) {
    removeHelpfulVote.run(reviewId, profileId);
    return helpfulState.get({ reviewId, profileId });
  }

  function unpublish(submissionId) {
    const result = db.prepare(`
      UPDATE published_listener_reviews
      SET is_published = 0, updated_at = ?
      WHERE submission_id = ?
    `).run(new Date().toISOString(), submissionId);
    return result.changes ? getBySubmissionId(submissionId) : null;
  }

  return {
    getBySubmissionId,
    getCategorySummaryForShow,
    getPublishedById,
    getPublishedPageForShow,
    listPublishedForShow,
    markHelpful,
    removeHelpful,
    unpublish,
    upsert,
  };
}

module.exports = { CATEGORY_SCORE_COLUMNS, createPublishedListenerReviewStore };
