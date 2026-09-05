const { randomUUID } = require("node:crypto");

function createEmptyDistribution() {
  return Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), 0]));
}

function createCommunityStore({ db, catalog, minPublicRatings = 1 }) {
  let catalogIds = new Set(catalog.map((entry) => entry.id));

  const statements = {
    upsertPodcast: db.prepare(`
      INSERT INTO podcasts (id, title, href, image, has_page, staff_rating, metadata_json, updated_at)
      VALUES (@id, @title, @href, @image, @hasPage, @staffRating, @metadataJson, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        href = excluded.href,
        image = excluded.image,
        has_page = excluded.has_page,
        staff_rating = excluded.staff_rating,
        metadata_json = excluded.metadata_json,
        updated_at = CURRENT_TIMESTAMP
    `),
    getPodcast: db.prepare(`
      SELECT id, title, href, image, has_page, staff_rating, metadata_json
      FROM podcasts
      WHERE id = ?
    `),
    getProfile: db.prepare(`
      SELECT id
      FROM community_profiles
      WHERE id = ?
    `),
    getProfileByVoterHash: db.prepare(`
      SELECT id
      FROM community_profiles
      WHERE voter_hash = ?
    `),
    insertProfile: db.prepare(`
      INSERT INTO community_profiles (id, kind, last_user_agent)
      VALUES (@id, 'anonymous', @userAgent)
    `),
    insertDeviceProfile: db.prepare(`
      INSERT OR IGNORE INTO community_profiles (id, kind, voter_hash, last_user_agent, last_abuse_hash)
      VALUES (@id, 'device', @voterHash, @userAgent, @abuseHash)
    `),
    touchProfile: db.prepare(`
      UPDATE community_profiles
      SET last_user_agent = @userAgent,
          updated_at = CURRENT_TIMESTAMP,
          last_seen_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `),
    touchDeviceProfile: db.prepare(`
      UPDATE community_profiles
      SET last_user_agent = @userAgent,
          last_abuse_hash = @abuseHash,
          updated_at = CURRENT_TIMESTAMP,
          last_seen_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `),
    getSubmission: db.prepare(`
      SELECT id, podcast_id, profile_id, rating, source, status, created_at, updated_at
      FROM rating_submissions
      WHERE podcast_id = ? AND profile_id = ?
    `),
    insertSubmission: db.prepare(`
      INSERT INTO rating_submissions (id, podcast_id, profile_id, rating, source, verified_at, abuse_hash)
      VALUES (@id, @podcastId, @profileId, @rating, @source, CURRENT_TIMESTAMP, @abuseHash)
    `),
    updateSubmission: db.prepare(`
      UPDATE rating_submissions
      SET rating = @rating,
          source = @source,
          verified_at = CURRENT_TIMESTAMP,
          abuse_hash = @abuseHash,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `),
    insertEvent: db.prepare(`
      INSERT INTO rating_events (
        id,
        submission_id,
        podcast_id,
        profile_id,
        previous_rating,
        next_rating,
        event_type,
        source,
        abuse_hash
      ) VALUES (
        @id,
        @submissionId,
        @podcastId,
        @profileId,
        @previousRating,
        @nextRating,
        @eventType,
        @source,
        @abuseHash
      )
    `),
    deleteSubmission: db.prepare(`
      DELETE FROM rating_submissions
      WHERE podcast_id = ? AND profile_id = ?
    `),
    pruneAbuseEvents: db.prepare(`
      DELETE FROM community_abuse_events
      WHERE created_at_ms <= @cutoffMs
    `),
    insertAbuseEvent: db.prepare(`
      INSERT INTO community_abuse_events (scope, abuse_hash, created_at_ms)
      VALUES (@scope, @abuseHash, @createdAtMs)
    `),
    listAbuseEvents: db.prepare(`
      SELECT scope, abuse_hash, created_at_ms
      FROM community_abuse_events
      WHERE abuse_hash = ?
      ORDER BY created_at_ms ASC
    `),
    pruneRatingEvents: db.prepare(`
      DELETE FROM rating_events
      WHERE datetime(created_at) <= datetime(@cutoff)
    `),
    redactStaleRatingAbuseHashes: db.prepare(`
      UPDATE rating_submissions
      SET abuse_hash = ''
      WHERE abuse_hash <> ''
        AND datetime(updated_at) <= datetime(@cutoff)
    `),
    redactStaleProfileMetadata: db.prepare(`
      UPDATE community_profiles
      SET last_user_agent = '',
          last_abuse_hash = ''
      WHERE datetime(last_seen_at) <= datetime(@cutoff)
    `),
    deleteOrphanProfiles: db.prepare(`
      DELETE FROM community_profiles
      WHERE datetime(last_seen_at) <= datetime(@cutoff)
        AND NOT EXISTS (
          SELECT 1
          FROM rating_submissions
          WHERE rating_submissions.profile_id = community_profiles.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM listener_review_helpful_votes
          WHERE listener_review_helpful_votes.profile_id = community_profiles.id
        )
    `),
  };

  const syncCatalog = db.transaction((entries) => {
    catalogIds = new Set(entries.map((entry) => entry.id));
    entries.forEach((entry) => {
      statements.upsertPodcast.run({
        id: entry.id,
        title: entry.title,
        href: entry.href || "",
        image: entry.image || "",
        hasPage: entry.hasPage ? 1 : 0,
        staffRating: entry.finalRating ?? null,
        metadataJson: JSON.stringify({
          tags: entry.tags,
          summary: entry.summary,
          bestFor: entry.bestFor,
          similarTo: entry.similarTo,
        }),
      });
    });
  });

  syncCatalog(catalog);

  const upsertRating = db.transaction(({ podcastId, profileId, rating, source, abuseHash = "" }) => {
    const existing = statements.getSubmission.get(podcastId, profileId);

    if (!existing) {
      const submissionId = randomUUID();
      statements.insertSubmission.run({
        id: submissionId,
        podcastId,
        profileId,
        rating,
        source,
        abuseHash,
      });
      statements.insertEvent.run({
        id: randomUUID(),
        submissionId,
        podcastId,
        profileId,
        previousRating: null,
        nextRating: rating,
        eventType: "created",
        source,
        abuseHash,
      });
      return submissionId;
    }

    statements.updateSubmission.run({
      id: existing.id,
      rating,
      source,
      abuseHash,
    });
    statements.insertEvent.run({
      id: randomUUID(),
      submissionId: existing.id,
      podcastId,
      profileId,
      previousRating: existing.rating,
      nextRating: rating,
      eventType: "updated",
      source,
      abuseHash,
    });
    return existing.id;
  });

  const deleteRating = db.transaction(({ podcastId, profileId, source, abuseHash = "" }) => {
    const existing = statements.getSubmission.get(podcastId, profileId);
    if (!existing) {
      return false;
    }

    statements.insertEvent.run({
      id: randomUUID(),
      submissionId: existing.id,
      podcastId,
      profileId,
      previousRating: existing.rating,
      nextRating: existing.rating,
      eventType: "deleted",
      source,
      abuseHash,
    });
    statements.deleteSubmission.run(podcastId, profileId);
    return true;
  });

  function ensureProfile(profileId, userAgent = "") {
    if (profileId) {
      const existing = statements.getProfile.get(profileId);
      if (existing) {
        statements.touchProfile.run({ id: profileId, userAgent });
        return existing.id;
      }
    }

    const id = randomUUID();
    statements.insertProfile.run({ id, userAgent });
    return id;
  }

  function findProfileId(profileId) {
    return profileId ? statements.getProfile.get(profileId)?.id || null : null;
  }

  function ensureDeviceProfile({ voterHash, userAgent = "", abuseHash = "" }) {
    const existing = statements.getProfileByVoterHash.get(voterHash);
    if (existing) {
      statements.touchDeviceProfile.run({ id: existing.id, userAgent, abuseHash });
      return existing.id;
    }

    const id = randomUUID();
    statements.insertDeviceProfile.run({ id, voterHash, userAgent, abuseHash });
    const resolved = statements.getProfileByVoterHash.get(voterHash);
    if (!resolved) {
      throw new Error("Unable to create a device community profile.");
    }
    if (resolved.id !== id) {
      statements.touchDeviceProfile.run({ id: resolved.id, userAgent, abuseHash });
    }
    return resolved.id;
  }

  function findDeviceProfileId(voterHash) {
    return voterHash ? statements.getProfileByVoterHash.get(voterHash)?.id || null : null;
  }

  function recordAbuseEvent({ scope = "community", abuseHash, createdAtMs = Date.now(), retentionMs }) {
    if (!abuseHash) {
      return;
    }

    const cutoffMs = Number.isFinite(retentionMs) ? createdAtMs - retentionMs : 0;
    if (cutoffMs > 0) {
      statements.pruneAbuseEvents.run({ cutoffMs });
    }

    statements.insertAbuseEvent.run({
      scope,
      abuseHash,
      createdAtMs,
    });
  }

  function listAbuseEvents(abuseHash) {
    return statements.listAbuseEvents.all(abuseHash);
  }

  function purgePersonalData({
    now = new Date(),
    abuseRetentionDays = 30,
    profileMetadataRetentionDays = 30,
    orphanProfileRetentionDays = 90,
  } = {}) {
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    const abuseRetentionMs = Math.max(1, abuseRetentionDays) * 24 * 60 * 60 * 1000;
    const abuseCutoffMs = safeNowMs - abuseRetentionMs;
    const ratingEventCutoff = new Date(abuseCutoffMs).toISOString();
    const profileMetadataCutoff = new Date(
      safeNowMs - Math.max(1, profileMetadataRetentionDays) * 24 * 60 * 60 * 1000,
    ).toISOString();
    const orphanProfileCutoff = new Date(
      safeNowMs - Math.max(1, orphanProfileRetentionDays) * 24 * 60 * 60 * 1000,
    ).toISOString();

    return db.transaction(() => {
      const abuseRowsPruned = statements.pruneAbuseEvents.run({ cutoffMs: abuseCutoffMs }).changes;
      const ratingEventsPruned = statements.pruneRatingEvents.run({ cutoff: ratingEventCutoff }).changes;
      const ratingAbuseHashesRedacted = statements.redactStaleRatingAbuseHashes.run({ cutoff: ratingEventCutoff }).changes;
      const profileMetadataRedacted = statements.redactStaleProfileMetadata.run({ cutoff: profileMetadataCutoff }).changes;
      const orphanProfilesDeleted = statements.deleteOrphanProfiles.run({ cutoff: orphanProfileCutoff }).changes;
      return {
        abuseRowsPruned,
        ratingEventsPruned,
        ratingAbuseHashesRedacted,
        profileMetadataRedacted,
        orphanProfilesDeleted,
      };
    })();
  }

  function getPodcast(podcastId) {
    if (!catalogIds.has(podcastId)) {
      return null;
    }

    const row = statements.getPodcast.get(podcastId);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      href: row.href,
      image: row.image,
      hasPage: Boolean(row.has_page),
      staffRating: row.staff_rating,
      metadata: JSON.parse(row.metadata_json || "{}"),
    };
  }

  function listRatingSummaries(podcastIds, profileId) {
    const uniqueIds = Array.from(new Set(podcastIds)).filter((id) => catalogIds.has(id));
    if (uniqueIds.length === 0) {
      return {};
    }

    const distributionSql = [];
    for (let rating = 1; rating <= 10; rating += 1) {
      distributionSql.push(`SUM(CASE WHEN rs.rating = ${rating} THEN 1 ELSE 0 END) AS rating_${rating}`);
    }

    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = db
      .prepare(`
        SELECT
          p.id,
        CASE
          WHEN COUNT(rs.id) >= ?
          THEN ROUND(AVG(rs.rating), 2)
          ELSE NULL
        END AS average_rating,
          COUNT(rs.id) AS rating_count,
          my.rating AS my_rating,
          ${distributionSql.join(",\n          ")}
        FROM podcasts p
        LEFT JOIN rating_submissions rs
          ON rs.podcast_id = p.id
        LEFT JOIN rating_submissions my
          ON my.podcast_id = p.id
         AND my.profile_id = ?
        WHERE p.id IN (${placeholders})
        GROUP BY p.id, my.rating
      `)
      .all(Math.max(1, minPublicRatings), profileId || null, ...uniqueIds);

    const summaries = {};

    rows.forEach((row) => {
      const distribution = createEmptyDistribution();
      for (let rating = 1; rating <= 10; rating += 1) {
        distribution[String(rating)] = row[`rating_${rating}`] || 0;
      }

      summaries[row.id] = {
        podcastId: row.id,
        averageRating: row.average_rating === null ? null : Number(row.average_rating),
        ratingCount: row.rating_count || 0,
        minimumRatingCount: Math.max(1, minPublicRatings),
        myRating: row.my_rating || null,
        distribution,
      };
    });

    uniqueIds.forEach((podcastId) => {
      if (!summaries[podcastId]) {
        summaries[podcastId] = {
          podcastId,
          averageRating: null,
          ratingCount: 0,
          minimumRatingCount: Math.max(1, minPublicRatings),
          myRating: null,
          distribution: createEmptyDistribution(),
        };
      }
    });

    return summaries;
  }

  return {
    ensureProfile,
    ensureDeviceProfile,
    findProfileId,
    findDeviceProfileId,
    getPodcast,
    listRatingSummaries,
    listAbuseEvents,
    purgePersonalData,
    recordAbuseEvent,
    syncCatalog,
    upsertRating,
    deleteRating,
  };
}

module.exports = {
  createCommunityStore,
};
