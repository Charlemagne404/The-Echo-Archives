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
        processing_status,
        resolution_status,
        intake_key_hash,
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
        @processingStatus,
        'open',
        @intakeKeyHash,
        @sourceIp,
        @userAgent
      )
      ON CONFLICT(intake_key_hash) WHERE intake_key_hash <> '' DO NOTHING
    `),
    getByIntakeKeyHash: db.prepare("SELECT * FROM show_submissions WHERE intake_key_hash = ? AND intake_key_hash <> ''"),
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
        import_candidate_id,
        import_handoff_started_at,
        import_resolved_show_id,
        processing_status,
        resolution_status,
        resolution_reason,
        resolution_evidence_json,
        resolved_at,
        processing_error,
        processing_attempts,
        processing_started_at,
        processing_next_attempt_at,
        content_redacted_at,
        (SELECT status FROM catalog_import_candidates WHERE id = show_submissions.import_candidate_id) AS import_candidate_status,
        (SELECT published_show_id FROM catalog_import_candidates WHERE id = show_submissions.import_candidate_id) AS import_published_show_id,
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
    redactExpiredSubmissionContent: db.prepare(`
      UPDATE show_submissions
      SET contact_email = '',
          show_title = '',
          creator_name = '',
          official_site = '',
          rss_or_listen_link = '',
          genres = '',
          notes = '',
          payload_json = '{}',
          provenance_json = '{}',
          review_notes = '',
          reviewed_by = '',
          source_ip = '',
          user_agent = '',
          content_redacted_at = @redactedAt,
          processing_status = CASE WHEN resolution_status = 'open' AND submission_type = 'show' THEN 'needs-investigation' ELSE processing_status END,
          processing_error = CASE WHEN resolution_status = 'open' AND submission_type = 'show' THEN 'Submission details were redacted under the configured retention policy.' ELSE '' END
      WHERE datetime(COALESCE(reviewed_at, submitted_at)) <= datetime(@cutoff)
        AND content_redacted_at IS NULL
    `),
    redactSubmissionResolutionEvidence: db.prepare(`
      UPDATE show_submissions SET resolution_evidence_json = '{"retentionRedacted":true}'
      WHERE id = ? AND content_redacted_at IS NOT NULL
    `),
    redactSubmissionLifecycleEvidence: db.prepare(`
      UPDATE submission_lifecycle_events
      SET actor = CASE
            WHEN actor IN ('system', 'migration', 'submission-worker', 'submission-intake', 'retention-policy') THEN actor
            ELSE 'historical-actor-redacted'
          END,
          evidence_json = '{"retentionRedacted":true}'
      WHERE submission_id = ?
    `),
    redactSubmissionRelationEvidence: db.prepare(`
      UPDATE submission_relations
      SET evidence_json = '{"retentionRedacted":true}'
      WHERE submission_id = ? OR related_submission_id = ?
    `),
    insertLifecycleEvent: db.prepare(`
      INSERT OR IGNORE INTO submission_lifecycle_events (
        id, submission_id, event_type, event_key, actor, reason, evidence_json, created_at
      ) VALUES (@id, @submissionId, @eventType, @eventKey, @actor, @reason, @evidenceJson, @createdAt)
    `),
    getLifecycleEvents: db.prepare(`
      SELECT id, event_type, event_key, actor, reason, evidence_json, created_at
      FROM submission_lifecycle_events
      WHERE submission_id = ?
      ORDER BY datetime(created_at) ASC, id ASC
    `),
    getSubmissionRelations: db.prepare(`
      SELECT r.relationship_type, r.evidence_json, r.created_at,
        s.id AS related_submission_id, s.show_title AS related_show_title,
        s.submission_type AS related_submission_type, s.resolution_status AS related_resolution_status
      FROM submission_relations r
      JOIN show_submissions s ON s.id = r.related_submission_id
      WHERE r.submission_id = ?
      UNION ALL
      SELECT r.relationship_type, r.evidence_json, r.created_at,
        s.id AS related_submission_id, s.show_title AS related_show_title,
        s.submission_type AS related_submission_type, s.resolution_status AS related_resolution_status
      FROM submission_relations r
      JOIN show_submissions s ON s.id = r.submission_id
      WHERE r.related_submission_id = ?
      ORDER BY created_at, related_submission_id
    `),
    getPotentialSubmissionDuplicates: db.prepare(`
      SELECT other.id, other.show_title, other.creator_name, other.submitted_at,
        other.processing_status, other.resolution_status
      FROM show_submissions current
      JOIN show_submissions other
        ON lower(trim(other.show_title)) = lower(trim(current.show_title))
       AND other.id <> current.id
       AND other.submission_type = 'show'
      WHERE current.id = ? AND current.submission_type = 'show'
        AND current.show_title <> '' AND other.content_redacted_at IS NULL
      ORDER BY datetime(other.submitted_at), other.id
      LIMIT 10
    `),
    getSubmissionCandidates: db.prepare(`
      SELECT l.candidate_id, l.relationship_type, l.evidence_json, l.created_at,
        c.status, c.title, c.creator_name, c.published_show_id, c.last_error,
        c.prepared_record_json, c.readiness_json, c.last_run_id
      FROM submission_candidate_links l
      JOIN catalog_import_candidates c ON c.id = l.candidate_id
      WHERE l.submission_id = ?
      ORDER BY datetime(l.created_at), l.candidate_id
    `),
    listDueProcessing: db.prepare(`
      SELECT id FROM show_submissions
      WHERE submission_type = 'show' AND resolution_status = 'open' AND status <> 'rejected'
        AND (
          (processing_status IN ('received', 'retry-wait') AND
            (processing_next_attempt_at IS NULL OR datetime(processing_next_attempt_at) <= datetime(@now)))
          OR (processing_status = 'processing' AND processing_started_at IS NOT NULL
            AND datetime(processing_started_at) <= datetime(@staleBefore))
        )
      ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
        datetime(submitted_at), id
      LIMIT @limit
    `),
    claimProcessing: db.prepare(`
      UPDATE show_submissions
      SET processing_status = 'processing', processing_started_at = @startedAt,
          processing_attempts = processing_attempts + 1, processing_error = '', processing_next_attempt_at = NULL
      WHERE id = @id AND submission_type = 'show' AND resolution_status = 'open' AND status <> 'rejected'
        AND (
          (processing_status IN ('received', 'retry-wait') AND
            (processing_next_attempt_at IS NULL OR datetime(processing_next_attempt_at) <= datetime(@startedAt)))
          OR (processing_status = 'processing' AND processing_started_at IS NOT NULL
            AND datetime(processing_started_at) <= datetime(@staleBefore))
        )
    `),
    updateProcessing: db.prepare(`
      UPDATE show_submissions SET processing_status = @status, processing_error = @error,
        processing_started_at = @startedAt, processing_next_attempt_at = @nextAttemptAt
      WHERE id = @id AND resolution_status = 'open'
    `),
    resolveSubmission: db.prepare(`
      UPDATE show_submissions SET resolution_status = @status, resolution_reason = @reason,
        resolution_evidence_json = @evidenceJson, import_resolved_show_id = @showId,
        resolved_at = @resolvedAt, processing_status = 'completed', processing_error = '',
        processing_started_at = NULL, processing_next_attempt_at = NULL
      WHERE id = @id AND resolution_status = 'open'
        AND (status <> 'rejected' OR @status = 'rejected')
    `),
    insertSubmissionRelation: db.prepare(`
      INSERT OR IGNORE INTO submission_relations
        (submission_id, related_submission_id, relationship_type, evidence_json, created_at)
      VALUES (@submissionId, @relatedSubmissionId, @relationshipType, @evidenceJson, @createdAt)
    `),
    listLifecycleSubmissions: db.prepare(`
      SELECT id, status, submission_type, submitted_at, show_title, creator_name,
        official_site, rss_or_listen_link, payload_json, import_candidate_id,
        import_resolved_show_id, processing_status, resolution_status, resolution_reason,
        processing_error, processing_attempts, processing_started_at, content_redacted_at,
        (SELECT status FROM catalog_import_candidates WHERE id = show_submissions.import_candidate_id) AS import_candidate_status,
        (SELECT published_show_id FROM catalog_import_candidates WHERE id = show_submissions.import_candidate_id) AS import_published_show_id,
        (SELECT last_error FROM catalog_import_candidates WHERE id = show_submissions.import_candidate_id) AS import_candidate_error,
        (SELECT input_revision FROM catalog_import_candidates WHERE id = show_submissions.import_candidate_id) AS import_candidate_revision
      FROM show_submissions WHERE submission_type = 'show'
      ORDER BY datetime(submitted_at), id
    `),
    queueHealth: db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN resolution_status = 'open' THEN 1 ELSE 0 END) AS unresolved,
        SUM(CASE WHEN processing_status IN ('received', 'processing', 'retry-wait') THEN 1 ELSE 0 END) AS processing,
        SUM(CASE WHEN processing_status IN ('needs-investigation', 'failed') AND resolution_status = 'open' THEN 1 ELSE 0 END) AS needsAttention,
        SUM(CASE WHEN processing_status = 'failed' AND resolution_status = 'open' THEN 1 ELSE 0 END) AS failedProcessing,
        SUM(CASE WHEN resolution_status <> 'open' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN resolution_status = 'open' AND julianday('now') - julianday(submitted_at) >= 30 THEN 1 ELSE 0 END) AS stale30Days,
        SUM(CASE WHEN resolution_status = 'open' AND julianday('now') - julianday(submitted_at) >= 60 THEN 1 ELSE 0 END) AS stale60Days,
        SUM(CASE WHEN content_redacted_at IS NOT NULL THEN 1 ELSE 0 END) AS contentRedacted,
        MIN(CASE WHEN resolution_status = 'open' THEN submitted_at END) AS oldestUnresolvedAt,
        MAX(CASE WHEN resolution_status = 'open' THEN CAST(julianday('now') - julianday(submitted_at) AS INTEGER) ELSE 0 END) AS maxUnresolvedAgeDays
      FROM show_submissions WHERE submission_type = 'show'
    `),
    retentionApproaching: db.prepare(`
      SELECT
        SUM(CASE WHEN content_redacted_at IS NULL
          AND datetime(COALESCE(reviewed_at, submitted_at)) <= datetime(@personalWarningStart)
          THEN 1 ELSE 0 END) AS personalDataDueOrApproaching,
        SUM(CASE WHEN (source_ip <> '' OR user_agent <> '')
          AND datetime(submitted_at) <= datetime(@networkWarningStart)
          THEN 1 ELSE 0 END) AS networkDataDueOrApproaching
      FROM show_submissions
    `),
    getLifecycleConsistency: db.prepare(`
      SELECT
        SUM(CASE WHEN s.import_candidate_id <> '' AND NOT EXISTS (
          SELECT 1 FROM submission_candidate_links l WHERE l.submission_id = s.id AND l.candidate_id = s.import_candidate_id
        ) THEN 1 ELSE 0 END) AS missingCandidateLinks,
        SUM(CASE WHEN s.import_candidate_id = '' AND EXISTS (
          SELECT 1 FROM submission_candidate_links l WHERE l.submission_id = s.id
        ) THEN 1 ELSE 0 END) AS legacyLinkMismatches,
        SUM(CASE WHEN s.resolution_status = 'open' AND EXISTS (
          SELECT 1 FROM submission_candidate_links l JOIN catalog_import_candidates c ON c.id = l.candidate_id
          WHERE l.submission_id = s.id AND c.status = 'published' AND c.published_show_id <> ''
        ) THEN 1 ELSE 0 END) AS publishedCandidateOpenSubmissions,
        SUM(CASE WHEN s.resolution_status = 'published' AND NOT EXISTS (
          SELECT 1 FROM submission_candidate_links l JOIN catalog_import_candidates c ON c.id = l.candidate_id
          WHERE l.submission_id = s.id AND c.status = 'published' AND c.published_show_id <> ''
        ) THEN 1 ELSE 0 END) AS publishedResolutionCandidateMismatch
      FROM show_submissions s
      WHERE s.submission_type = 'show'
    `),
    listContentRedactedAt: db.prepare("SELECT id FROM show_submissions WHERE content_redacted_at = ?"),
  };

  function buildListFilters(filters = {}) {
    const clauses = [];
    const params = [];
    const trimmedStatus = String(filters.status || "").trim();
    const trimmedType = String(filters.submissionType || "").trim();
    const trimmedPriority = String(filters.priority || "").trim();
    const trimmedQuery = String(filters.q || "").trim().toLowerCase();
    const lane = String(filters.lane || "").trim();
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

    if (lane === "processing") {
      clauses.push("processing_status IN ('received', 'processing', 'retry-wait') AND resolution_status = 'open'");
    } else if (lane === "investigation") {
      clauses.push("processing_status IN ('needs-investigation', 'failed') AND resolution_status = 'open'");
    } else if (lane === "resolved") {
      clauses.push("resolution_status <> 'open'");
    } else if (lane === "actionable") {
      clauses.push("resolution_status = 'open' AND (submission_type <> 'show' OR processing_status IN ('ready-for-review', 'needs-investigation', 'failed') OR (processing_status = 'received' AND ? = 1))");
      params.push(filters.includeReceived === true ? 1 : 0);
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
      resolution_evidence_json: JSON.parse(row.resolution_evidence_json || "{}"),
    };
  }

  function recordLifecycleEvent({
    submissionId,
    eventType,
    eventKey = "",
    actor = "system",
    reason = "",
    evidence = {},
    createdAt = new Date().toISOString(),
  } = {}) {
    const key = String(eventKey || `${eventType}:${randomUUID()}`).slice(0, 240);
    const result = statements.insertLifecycleEvent.run({
      id: randomUUID(),
      submissionId: String(submissionId || "").slice(0, 80),
      eventType: String(eventType || "event").slice(0, 80),
      eventKey: key,
      actor: String(actor || "system").slice(0, 160),
      reason: String(reason || "").slice(0, 240),
      evidenceJson: JSON.stringify(evidence && typeof evidence === "object" ? evidence : {}),
      createdAt: String(createdAt || new Date().toISOString()),
    });
    return result.changes === 1;
  }

  function listDueProcessing({ now = new Date(), staleBefore = new Date(Date.now() - 2 * 60_000), limit = 8 } = {}) {
    return statements.listDueProcessing.all({
      now: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
      staleBefore: staleBefore instanceof Date ? staleBefore.toISOString() : new Date(staleBefore).toISOString(),
      limit: Math.min(100, Math.max(1, Number(limit) || 8)),
    }).map((row) => row.id);
  }

  function claimProcessing(id, { startedAt = new Date(), staleBefore = new Date(Date.now() - 2 * 60_000) } = {}) {
    const startedAtIso = startedAt instanceof Date ? startedAt.toISOString() : new Date(startedAt).toISOString();
    const staleBeforeIso = staleBefore instanceof Date ? staleBefore.toISOString() : new Date(staleBefore).toISOString();
    const result = statements.claimProcessing.run({ id, startedAt: startedAtIso, staleBefore: staleBeforeIso });
    if (result.changes === 1) {
      recordLifecycleEvent({
        submissionId: id,
        eventType: "processing-started",
        eventKey: `processing-attempt:${getShowSubmission(id)?.processing_attempts || 0}`,
        actor: "submission-worker",
        reason: "automatic-preparation-started",
        createdAt: startedAtIso,
      });
    }
    return result.changes === 1;
  }

  function updateProcessingState(id, { status, error = "", startedAt = null, nextAttemptAt = null, eventType = "", eventKey = "", reason = "", evidence = {} } = {}) {
    const allowed = new Set(["received", "processing", "retry-wait", "ready-for-review", "needs-investigation", "failed", "completed", "not-required"]);
    if (!allowed.has(status)) throw new Error("Unknown submission processing state.");
    const result = statements.updateProcessing.run({
      id,
      status,
      error: String(error || "").slice(0, 1_000),
      startedAt: startedAt instanceof Date ? startedAt.toISOString() : startedAt,
      nextAttemptAt: nextAttemptAt instanceof Date ? nextAttemptAt.toISOString() : nextAttemptAt,
    });
    const eventAdded = result.changes === 1 && eventType
      ? recordLifecycleEvent({ submissionId: id, eventType, eventKey, reason, evidence, actor: "submission-worker" })
      : false;
    return { changed: result.changes === 1, eventAdded };
  }

  function resolveSubmission(id, { status, reason = "", evidence = {}, showId = "", actor = "system", eventKey = "" } = {}) {
    const allowed = new Set(["published", "already-listed", "duplicate", "rejected"]);
    if (!allowed.has(status)) throw new Error("Unknown submission resolution state.");
    const now = new Date().toISOString();
    return db.transaction(() => {
      const result = statements.resolveSubmission.run({
        id,
        status,
        reason: String(reason || "").slice(0, 240),
        evidenceJson: JSON.stringify(evidence && typeof evidence === "object" ? evidence : {}),
        showId: String(showId || "").slice(0, 160),
        resolvedAt: now,
      });
      if (result.changes !== 1) return false;
      return recordLifecycleEvent({
        submissionId: id,
        eventType: status,
        eventKey: eventKey || `resolution:${status}`,
        actor,
        reason,
        evidence,
        createdAt: now,
      });
    })();
  }

  function resolveDuplicateSubmission(id, relatedSubmissionId, { reason = "", evidence = {}, actor = "system", eventKey = "" } = {}) {
    const now = new Date().toISOString();
    return db.transaction(() => {
      const result = statements.resolveSubmission.run({
        id,
        status: "duplicate",
        reason: String(reason || "").slice(0, 240),
        evidenceJson: JSON.stringify(evidence && typeof evidence === "object" ? evidence : {}),
        showId: "",
        resolvedAt: now,
      });
      if (result.changes !== 1) return false;
      statements.insertSubmissionRelation.run({
        submissionId: id,
        relatedSubmissionId,
        relationshipType: "duplicate-of",
        evidenceJson: JSON.stringify(evidence && typeof evidence === "object" ? evidence : {}),
        createdAt: now,
      });
      return recordLifecycleEvent({
        submissionId: id,
        eventType: "duplicate",
        eventKey: eventKey || `resolution:duplicate:${relatedSubmissionId}`,
        actor,
        reason,
        evidence,
        createdAt: now,
      });
    })();
  }

  function relateSubmissions(submissionId, relatedSubmissionId, { relationshipType = "related-to", evidence = {}, createdAt = new Date().toISOString() } = {}) {
    const result = statements.insertSubmissionRelation.run({
      submissionId,
      relatedSubmissionId,
      relationshipType,
      evidenceJson: JSON.stringify(evidence && typeof evidence === "object" ? evidence : {}),
      createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    });
    return result.changes === 1;
  }

  function getLifecycleDetails(id) {
    return {
      events: statements.getLifecycleEvents.all(id).map((row) => ({
        id: row.id,
        eventType: row.event_type,
        eventKey: row.event_key,
        actor: row.actor,
        reason: row.reason,
        evidence: JSON.parse(row.evidence_json || "{}"),
        createdAt: row.created_at,
      })),
      relations: statements.getSubmissionRelations.all(id, id).map((row) => ({
        relationshipType: row.relationship_type,
        evidence: JSON.parse(row.evidence_json || "{}"),
        createdAt: row.created_at,
        submissionId: row.related_submission_id,
        showTitle: row.related_show_title,
        submissionType: row.related_submission_type,
        resolutionStatus: row.related_resolution_status,
      })),
      potentialDuplicates: statements.getPotentialSubmissionDuplicates.all(id).map((row) => ({
        id: row.id,
        showTitle: row.show_title,
        creatorName: row.creator_name,
        submittedAt: row.submitted_at,
        processingStatus: row.processing_status,
        resolutionStatus: row.resolution_status,
      })),
      candidates: statements.getSubmissionCandidates.all(id).map((row) => ({
        id: row.candidate_id,
        relationshipType: row.relationship_type,
        evidence: JSON.parse(row.evidence_json || "{}"),
        createdAt: row.created_at,
        status: row.status,
        title: row.title,
        creatorName: row.creator_name,
        publishedShowId: row.published_show_id,
        lastError: row.last_error,
        preparedRecord: JSON.parse(row.prepared_record_json || "{}"),
        readiness: JSON.parse(row.readiness_json || "{}"),
        lastRunId: row.last_run_id,
      })),
    };
  }

  function listForLifecycleReconciliation() {
    return statements.listLifecycleSubmissions.all().map((row) => ({
      ...row,
      payload_json: JSON.parse(row.payload_json || "{}"),
    }));
  }

  function getQueueHealth({
    now = new Date(),
    personalRetentionDays = 180,
    networkRetentionDays = 30,
    warningDays = 30,
  } = {}) {
    const row = statements.queueHealth.get();
    const consistency = statements.getLifecycleConsistency.get();
    const nowDate = now instanceof Date ? now : new Date(now);
    const nowMs = Number.isFinite(nowDate.getTime()) ? nowDate.getTime() : Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const personalThreshold = Math.max(1, Number(personalRetentionDays) || 180) * dayMs;
    const networkThreshold = Math.max(1, Number(networkRetentionDays) || 30) * dayMs;
    const warningThreshold = Math.max(1, Number(warningDays) || 30) * dayMs;
    const retention = statements.retentionApproaching.get({
      personalWarningStart: new Date(nowMs - personalThreshold + warningThreshold).toISOString(),
      networkWarningStart: new Date(nowMs - networkThreshold + warningThreshold).toISOString(),
    });
    const { oldestUnresolvedAt, ...counts } = row;
    return {
      ...Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value || 0)])),
      oldestUnresolvedAt: oldestUnresolvedAt || "",
      oldestUnresolvedAgeDays: Number(counts.maxUnresolvedAgeDays || 0),
      missingCandidateLinks: Number(consistency?.missingCandidateLinks || 0),
      legacyLinkMismatches: Number(consistency?.legacyLinkMismatches || 0),
      publishedCandidateOpenSubmissions: Number(consistency?.publishedCandidateOpenSubmissions || 0),
      publishedResolutionCandidateMismatch: Number(consistency?.publishedResolutionCandidateMismatch || 0),
      personalDataDueOrApproachingRetention: Number(retention?.personalDataDueOrApproaching || 0),
      networkDataDueOrApproachingRetention: Number(retention?.networkDataDueOrApproaching || 0),
      retentionWarningDays: Math.max(1, Number(warningDays) || 30),
    };
  }

  function createShowSubmission(payload) {
    const id = randomUUID();

    const result = statements.insertShowSubmission.run({
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
      processingStatus: payload.processingStatus || (payload.submissionType === "show" || !payload.submissionType ? "received" : "not-required"),
      intakeKeyHash: payload.intakeKeyHash || "",
      sourceIp: payload.sourceIp || "",
      userAgent: payload.userAgent || "",
    });

    if (result.changes === 0 && payload.intakeKeyHash) {
      const existing = statements.getByIntakeKeyHash.get(payload.intakeKeyHash);
      if (existing) return { ...hydrateSubmission(existing), idempotent: true };
    }

    if (payload.submissionType === "show" || !payload.submissionType) {
      recordLifecycleEvent({
        submissionId: id,
        eventType: "received",
        eventKey: "received",
        actor: "system",
        reason: "submission-accepted",
        createdAt: payload.submittedAt || new Date().toISOString(),
      });
    }

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
        import_candidate_id,
        import_handoff_started_at,
        import_resolved_show_id,
        processing_status,
        resolution_status,
        resolution_reason,
        resolution_evidence_json,
        resolved_at,
        processing_error,
        processing_attempts,
        processing_started_at,
        processing_next_attempt_at,
        content_redacted_at,
        (SELECT status FROM catalog_import_candidates WHERE id = show_submissions.import_candidate_id) AS import_candidate_status,
        (SELECT published_show_id FROM catalog_import_candidates WHERE id = show_submissions.import_candidate_id) AS import_published_show_id,
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

    return db.transaction(() => {
      const networkRowsRedacted = statements.redactSubmissionNetworkData.run({ cutoff: networkCutoff }).changes;
      const redactedAt = new Date(safeNowMs).toISOString();
      const submissionContentRedacted = statements.redactExpiredSubmissionContent.run({
        cutoff: personalCutoff,
        redactedAt,
      }).changes;
      statements.listContentRedactedAt.all(redactedAt).forEach(({ id }) => {
        statements.redactSubmissionResolutionEvidence.run(id);
        statements.redactSubmissionLifecycleEvidence.run(id);
        statements.redactSubmissionRelationEvidence.run(id, id);
        recordLifecycleEvent({
          submissionId: id,
          eventType: "content-redacted",
          eventKey: "retention:content-redacted",
          actor: "retention-policy",
          reason: "configured-submission-retention-period-reached",
          createdAt: redactedAt,
        });
      });
      return { networkRowsRedacted, submissionContentRedacted, submissionsDeleted: 0 };
    })();
  }

  return {
    claimProcessing,
    createShowSubmission,
    getLifecycleDetails,
    getQueueHealth,
    getShowSubmission,
    listDueProcessing,
    listForLifecycleReconciliation,
    listShowSubmissions,
    purgePersonalData,
    recordLifecycleEvent,
    relateSubmissions,
    resolveDuplicateSubmission,
    resolveSubmission,
    updateProcessingState,
    updateShowSubmissionReview,
  };
}

module.exports = {
  createSubmissionStore,
};
