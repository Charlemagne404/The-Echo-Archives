const { randomUUID } = require("node:crypto");

const PRIORITY_ORDER_SQL = `
  CASE priority
    WHEN 'high' THEN 0
    WHEN 'normal' THEN 1
    WHEN 'low' THEN 2
    ELSE 3
  END
`;

function escapeLikePattern(value = "") {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

function createSubmissionStore({ db }) {
  const statements = {
    insertShowSubmission: db.prepare(`
      INSERT INTO show_submissions (
        id,
        status,
        priority,
        submission_type,
        existing_show_id,
        show_title,
        creator_name,
        contact_email,
        official_site,
        rss_or_listen_link,
        genres,
        notes,
        payload_json,
        provenance_json,
        review_notes,
        reviewed_by,
        reviewed_at,
        source_ip,
        user_agent
      ) VALUES (
        @id,
        @status,
        @priority,
        @submissionType,
        @existingShowId,
        @showTitle,
        @creatorName,
        @contactEmail,
        @officialSite,
        @rssOrListenLink,
        @genres,
        @notes,
        @payloadJson,
        @provenanceJson,
        @reviewNotes,
        @reviewedBy,
        @reviewedAt,
        @sourceIp,
        @userAgent
      )
    `),
    getShowSubmission: db.prepare(`
      SELECT
        id,
        status,
        priority,
        submission_type,
        existing_show_id,
        submitted_at,
        show_title,
        creator_name,
        contact_email,
        official_site,
        rss_or_listen_link,
        genres,
        notes,
        payload_json,
        provenance_json,
        review_notes,
        reviewed_by,
        reviewed_at,
        source_ip,
        user_agent
      FROM show_submissions
      WHERE id = ?
    `),
    redactSubmissionNetworkData: db.prepare(`
      UPDATE show_submissions
      SET source_ip = '',
          user_agent = ''
      WHERE (source_ip <> '' OR user_agent <> '')
        AND datetime(submitted_at) <= datetime(@cutoff)
    `),
    deleteExpiredSubmissions: db.prepare(`
      DELETE FROM show_submissions
      WHERE datetime(COALESCE(reviewed_at, submitted_at)) <= datetime(@cutoff)
        AND NOT EXISTS (
          SELECT 1
          FROM published_listener_reviews
          WHERE published_listener_reviews.submission_id = show_submissions.id
            AND published_listener_reviews.is_published = 1
        )
    `),
    redactExpiredPublishedSubmissions: db.prepare(`
      UPDATE show_submissions
      SET contact_email = '',
          creator_name = '',
          notes = '',
          payload_json = '{}',
          provenance_json = '{}',
          review_notes = '',
          reviewed_by = '',
          source_ip = '',
          user_agent = ''
      WHERE datetime(COALESCE(reviewed_at, submitted_at)) <= datetime(@cutoff)
        AND EXISTS (
          SELECT 1
          FROM published_listener_reviews
          WHERE published_listener_reviews.submission_id = show_submissions.id
            AND published_listener_reviews.is_published = 1
        )
    `),
  };

  function buildListFilters(filters = {}) {
    const clauses = [];
    const params = [];
    const trimmedStatus = String(filters.status || "").trim();
    const trimmedType = String(filters.submissionType || "").trim();
    const trimmedPriority = String(filters.priority || "").trim();
    const trimmedQuery = String(filters.q || "").trim().toLowerCase();
    const openStatuses = Array.isArray(filters.openStatuses) ? filters.openStatuses.filter(Boolean) : [];

    if (trimmedStatus) {
      clauses.push("status = ?");
      params.push(trimmedStatus);
    } else if (filters.includeClosed !== true && openStatuses.length > 0) {
      clauses.push(`status IN (${openStatuses.map(() => "?").join(", ")})`);
      params.push(...openStatuses);
    }

    if (trimmedType) {
      clauses.push("submission_type = ?");
      params.push(trimmedType);
    }

    if (trimmedPriority) {
      clauses.push("priority = ?");
      params.push(trimmedPriority);
    }

    if (trimmedQuery) {
      const likeValue = `%${escapeLikePattern(trimmedQuery)}%`;
      const searchClause = `
        (
          LOWER(id) LIKE ? ESCAPE '\\'
          OR LOWER(show_title) LIKE ? ESCAPE '\\'
          OR LOWER(existing_show_id) LIKE ? ESCAPE '\\'
          OR LOWER(creator_name) LIKE ? ESCAPE '\\'
          OR LOWER(contact_email) LIKE ? ESCAPE '\\'
          OR LOWER(notes) LIKE ? ESCAPE '\\'
          OR LOWER(review_notes) LIKE ? ESCAPE '\\'
          OR LOWER(payload_json) LIKE ? ESCAPE '\\'
          OR LOWER(provenance_json) LIKE ? ESCAPE '\\'
        )
      `;
      clauses.push(searchClause);
      params.push(
        likeValue,
        likeValue,
        likeValue,
        likeValue,
        likeValue,
        likeValue,
        likeValue,
        likeValue,
        likeValue,
      );
    }

    return {
      whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
      params,
    };
  }

  function hydrateSubmission(row) {
    if (!row) {
      return null;
    }

    return {
      ...row,
      payload_json: JSON.parse(row.payload_json || "{}"),
      provenance_json: JSON.parse(row.provenance_json || "{}"),
    };
  }

  function createShowSubmission(payload) {
    const id = randomUUID();

    statements.insertShowSubmission.run({
      id,
      status: payload.status || "new",
      priority: payload.priority || "normal",
      submissionType: payload.submissionType || "show",
      existingShowId: payload.existingShowId || "",
      showTitle: payload.showTitle,
      creatorName: payload.creatorName || "",
      contactEmail: payload.contactEmail,
      officialSite: payload.officialSite || "",
      rssOrListenLink: payload.rssOrListenLink || "",
      genres: payload.genres || "",
      notes: payload.notes || "",
      payloadJson: JSON.stringify(payload.payload || {}),
      provenanceJson: JSON.stringify(payload.provenance || {}),
      reviewNotes: payload.reviewNotes || "",
      reviewedBy: payload.reviewedBy || "",
      reviewedAt: payload.reviewedAt || null,
      sourceIp: payload.sourceIp || "",
      userAgent: payload.userAgent || "",
    });

    return hydrateSubmission(statements.getShowSubmission.get(id));
  }

  function getShowSubmission(id) {
    return hydrateSubmission(statements.getShowSubmission.get(id));
  }

  function listShowSubmissions(filters = {}) {
    const page = Math.max(1, Number.parseInt(String(filters.page || "1"), 10) || 1);
    const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(filters.pageSize || "20"), 10) || 20));
    const offset = (page - 1) * pageSize;
    const { whereSql, params } = buildListFilters(filters);

    const items = db.prepare(`
      SELECT
        id,
        status,
        priority,
        submission_type,
        existing_show_id,
        submitted_at,
        show_title,
        creator_name,
        contact_email,
        official_site,
        rss_or_listen_link,
        genres,
        notes,
        payload_json,
        provenance_json,
        review_notes,
        reviewed_by,
        reviewed_at,
        source_ip,
        user_agent
      FROM show_submissions
      ${whereSql}
      ORDER BY ${PRIORITY_ORDER_SQL}, datetime(submitted_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset).map(hydrateSubmission);

    const totalRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM show_submissions
      ${whereSql}
    `).get(...params);

    const statusRows = db.prepare(`
      SELECT status AS key, COUNT(*) AS count
      FROM show_submissions
      ${whereSql}
      GROUP BY status
    `).all(...params);

    const typeRows = db.prepare(`
      SELECT submission_type AS key, COUNT(*) AS count
      FROM show_submissions
      ${whereSql}
      GROUP BY submission_type
    `).all(...params);

    const priorityRows = db.prepare(`
      SELECT priority AS key, COUNT(*) AS count
      FROM show_submissions
      ${whereSql}
      GROUP BY priority
    `).all(...params);

    return {
      items,
      total: totalRow?.count || 0,
      page,
      pageSize,
      counts: {
        status: Object.fromEntries(statusRows.map((row) => [row.key, row.count])),
        submissionType: Object.fromEntries(typeRows.map((row) => [row.key, row.count])),
        priority: Object.fromEntries(priorityRows.map((row) => [row.key, row.count])),
      },
    };
  }

  function updateShowSubmissionReview(id, updates = {}) {
    const fields = [];
    const values = [];

    if (Object.hasOwn(updates, "status")) {
      fields.push("status = ?");
      values.push(updates.status || "new");
    }

    if (Object.hasOwn(updates, "priority")) {
      fields.push("priority = ?");
      values.push(updates.priority || "normal");
    }

    if (Object.hasOwn(updates, "reviewNotes")) {
      fields.push("review_notes = ?");
      values.push(updates.reviewNotes || "");
    }

    if (Object.hasOwn(updates, "reviewedBy")) {
      fields.push("reviewed_by = ?");
      values.push(updates.reviewedBy || "");
    }

    if (fields.length === 0) {
      return getShowSubmission(id);
    }

    fields.push("reviewed_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    const result = db.prepare(`
      UPDATE show_submissions
      SET ${fields.join(", ")}
      WHERE id = ?
    `).run(...values);

    if (result.changes === 0) {
      return null;
    }

    return getShowSubmission(id);
  }

  function purgePersonalData({
    now = new Date(),
    networkRetentionDays = 30,
    personalRetentionDays = 180,
  } = {}) {
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    const networkCutoff = new Date(safeNowMs - Math.max(1, networkRetentionDays) * 24 * 60 * 60 * 1000).toISOString();
    const personalCutoff = new Date(safeNowMs - Math.max(1, personalRetentionDays) * 24 * 60 * 60 * 1000).toISOString();

    return db.transaction(() => ({
      networkRowsRedacted: statements.redactSubmissionNetworkData.run({ cutoff: networkCutoff }).changes,
      submissionsDeleted: statements.deleteExpiredSubmissions.run({ cutoff: personalCutoff }).changes,
      publishedSubmissionRowsRedacted: statements.redactExpiredPublishedSubmissions.run({ cutoff: personalCutoff }).changes,
    }))();
  }

  return {
    createShowSubmission,
    getShowSubmission,
    listShowSubmissions,
    purgePersonalData,
    updateShowSubmissionReview,
  };
}

module.exports = {
  createSubmissionStore,
};
