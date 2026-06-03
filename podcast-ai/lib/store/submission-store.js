const { randomUUID } = require("node:crypto");

function createSubmissionStore({ db }) {
  const statements = {
    insertShowSubmission: db.prepare(`
      INSERT INTO show_submissions (
        id,
        status,
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
  };

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

  return {
    createShowSubmission,
  };
}

module.exports = {
  createSubmissionStore,
};
