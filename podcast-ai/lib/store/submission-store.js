const { randomUUID } = require("node:crypto");

function createSubmissionStore({ db }) {
  const statements = {
    insertShowSubmission: db.prepare(`
      INSERT INTO show_submissions (
        id,
        status,
        show_title,
        creator_name,
        contact_email,
        official_site,
        rss_or_listen_link,
        genres,
        notes,
        source_ip,
        user_agent
      ) VALUES (
        @id,
        @status,
        @showTitle,
        @creatorName,
        @contactEmail,
        @officialSite,
        @rssOrListenLink,
        @genres,
        @notes,
        @sourceIp,
        @userAgent
      )
    `),
    getShowSubmission: db.prepare(`
      SELECT
        id,
        status,
        submitted_at,
        show_title,
        creator_name,
        contact_email,
        official_site,
        rss_or_listen_link,
        genres,
        notes,
        source_ip,
        user_agent
      FROM show_submissions
      WHERE id = ?
    `),
  };

  function createShowSubmission(payload) {
    const id = randomUUID();

    statements.insertShowSubmission.run({
      id,
      status: payload.status || "new",
      showTitle: payload.showTitle,
      creatorName: payload.creatorName || "",
      contactEmail: payload.contactEmail,
      officialSite: payload.officialSite || "",
      rssOrListenLink: payload.rssOrListenLink || "",
      genres: payload.genres || "",
      notes: payload.notes || "",
      sourceIp: payload.sourceIp || "",
      userAgent: payload.userAgent || "",
    });

    return statements.getShowSubmission.get(id);
  }

  return {
    createShowSubmission,
  };
}

module.exports = {
  createSubmissionStore,
};
