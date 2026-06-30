const { randomUUID } = require("node:crypto");

const { IMPORT_OPEN_STATUSES, safeJsonParse, trimText } = require("../import/utils");

function escapeLikePattern(value = "") {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

function hydrateCandidate(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    scopeStatus: row.scope_status,
    hasDuplicateMatch: Boolean(row.has_duplicate_match),
    title: row.title,
    creatorName: row.creator_name,
    canonicalId: row.canonical_id,
    primarySourceType: row.primary_source_type,
    primarySourceKey: row.primary_source_key,
    primarySourceUrl: row.primary_source_url,
    seedQuery: row.seed_query,
    objective: safeJsonParse(row.objective_json, {}),
    aiSuggestions: safeJsonParse(row.ai_suggestions_json, {}),
    provenance: safeJsonParse(row.provenance_json, {}),
    dedupe: safeJsonParse(row.dedupe_json, {}),
    reviewNotes: row.review_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    draftedShowId: row.drafted_show_id,
    publishedShowId: row.published_show_id,
    duplicateOfShowId: row.duplicate_of_show_id,
    duplicateOfCandidateId: row.duplicate_of_candidate_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateSource(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    candidateId: row.candidate_id,
    sourceType: row.source_type,
    sourceKey: row.source_key,
    sourceUrl: row.source_url,
    fetchStatus: row.fetch_status,
    payload: safeJsonParse(row.payload_json, {}),
    normalized: safeJsonParse(row.normalized_json, {}),
    fetchedAt: row.fetched_at,
  };
}

function createImportStore({ db }) {
  const statements = {
    insertCandidate: db.prepare(`
      INSERT INTO catalog_import_candidates (
        id,
        status,
        scope_status,
        has_duplicate_match,
        title,
        creator_name,
        canonical_id,
        primary_source_type,
        primary_source_key,
        primary_source_url,
        seed_query,
        objective_json,
        ai_suggestions_json,
        provenance_json,
        dedupe_json,
        review_notes,
        reviewed_by,
        reviewed_at,
        drafted_show_id,
        published_show_id,
        duplicate_of_show_id,
        duplicate_of_candidate_id
      ) VALUES (
        @id,
        @status,
        @scopeStatus,
        @hasDuplicateMatch,
        @title,
        @creatorName,
        @canonicalId,
        @primarySourceType,
        @primarySourceKey,
        @primarySourceUrl,
        @seedQuery,
        @objectiveJson,
        @aiSuggestionsJson,
        @provenanceJson,
        @dedupeJson,
        @reviewNotes,
        @reviewedBy,
        @reviewedAt,
        @draftedShowId,
        @publishedShowId,
        @duplicateOfShowId,
        @duplicateOfCandidateId
      )
    `),
    getCandidate: db.prepare(`
      SELECT *
      FROM catalog_import_candidates
      WHERE id = ?
    `),
    getCandidateSources: db.prepare(`
      SELECT *
      FROM catalog_import_sources
      WHERE candidate_id = ?
      ORDER BY fetched_at DESC, id DESC
    `),
    getCandidateEvents: db.prepare(`
      SELECT *
      FROM catalog_import_events
      WHERE candidate_id = ?
      ORDER BY created_at DESC, id DESC
    `),
    deleteCandidateSources: db.prepare(`
      DELETE FROM catalog_import_sources
      WHERE candidate_id = ?
    `),
    insertCandidateSource: db.prepare(`
      INSERT INTO catalog_import_sources (
        candidate_id,
        source_type,
        source_key,
        source_url,
        fetch_status,
        payload_json,
        normalized_json,
        fetched_at
      ) VALUES (
        @candidateId,
        @sourceType,
        @sourceKey,
        @sourceUrl,
        @fetchStatus,
        @payloadJson,
        @normalizedJson,
        @fetchedAt
      )
    `),
    insertEvent: db.prepare(`
      INSERT INTO catalog_import_events (
        id,
        candidate_id,
        event_type,
        actor,
        payload_json
      ) VALUES (
        @id,
        @candidateId,
        @eventType,
        @actor,
        @payloadJson
      )
    `),
    insertRun: db.prepare(`
      INSERT INTO catalog_import_runs (
        id,
        run_type,
        status,
        input_json,
        summary_json
      ) VALUES (
        @id,
        @runType,
        @status,
        @inputJson,
        @summaryJson
      )
    `),
    listCandidateBasics: db.prepare(`
      SELECT id, title, creator_name, objective_json
      FROM catalog_import_candidates
      ORDER BY datetime(updated_at) DESC, id DESC
    `),
  };

  function buildListFilters(filters = {}) {
    const clauses = [];
    const params = [];
    const status = trimText(filters.status, 80);
    const scopeStatus = trimText(filters.scopeStatus, 80);
    const sourceType = trimText(filters.sourceType, 80);
    const duplicateState = trimText(filters.duplicateState, 40);
    const q = trimText(filters.q, 200).toLowerCase();
    const openStatuses = Array.isArray(filters.openStatuses) ? filters.openStatuses.filter(Boolean) : IMPORT_OPEN_STATUSES;

    if (status) {
      clauses.push("status = ?");
      params.push(status);
    } else if (filters.includeClosed !== true && openStatuses.length > 0) {
      clauses.push(`status IN (${openStatuses.map(() => "?").join(", ")})`);
      params.push(...openStatuses);
    }

    if (scopeStatus) {
      clauses.push("scope_status = ?");
      params.push(scopeStatus);
    }

    if (sourceType) {
      clauses.push("primary_source_type = ?");
      params.push(sourceType);
    }

    if (duplicateState === "duplicates") {
      clauses.push("(has_duplicate_match = 1 OR status = 'duplicate')");
    } else if (duplicateState === "clear") {
      clauses.push("has_duplicate_match = 0");
    }

    if (q) {
      const like = `%${escapeLikePattern(q)}%`;
      clauses.push(`
        (
          LOWER(id) LIKE ? ESCAPE '\\'
          OR LOWER(title) LIKE ? ESCAPE '\\'
          OR LOWER(creator_name) LIKE ? ESCAPE '\\'
          OR LOWER(seed_query) LIKE ? ESCAPE '\\'
          OR LOWER(review_notes) LIKE ? ESCAPE '\\'
          OR LOWER(objective_json) LIKE ? ESCAPE '\\'
        )
      `);
      params.push(like, like, like, like, like, like);
    }

    return {
      whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
      params,
    };
  }

  function createCandidate(payload = {}) {
    const id = payload.id || randomUUID();
    statements.insertCandidate.run({
      id,
      status: payload.status || "discovered",
      scopeStatus: payload.scopeStatus || "in-scope",
      hasDuplicateMatch: payload.hasDuplicateMatch ? 1 : 0,
      title: payload.title || "",
      creatorName: payload.creatorName || "",
      canonicalId: payload.canonicalId || "",
      primarySourceType: payload.primarySourceType || "",
      primarySourceKey: payload.primarySourceKey || "",
      primarySourceUrl: payload.primarySourceUrl || "",
      seedQuery: payload.seedQuery || "",
      objectiveJson: JSON.stringify(payload.objective || {}),
      aiSuggestionsJson: JSON.stringify(payload.aiSuggestions || {}),
      provenanceJson: JSON.stringify(payload.provenance || {}),
      dedupeJson: JSON.stringify(payload.dedupe || {}),
      reviewNotes: payload.reviewNotes || "",
      reviewedBy: payload.reviewedBy || "",
      reviewedAt: payload.reviewedAt || null,
      draftedShowId: payload.draftedShowId || "",
      publishedShowId: payload.publishedShowId || "",
      duplicateOfShowId: payload.duplicateOfShowId || "",
      duplicateOfCandidateId: payload.duplicateOfCandidateId || "",
    });

    return this.getCandidate(id);
  }

  function getCandidate(id) {
    const candidate = hydrateCandidate(statements.getCandidate.get(id));
    if (!candidate) {
      return null;
    }

    return {
      ...candidate,
      sources: statements.getCandidateSources.all(id).map(hydrateSource),
      events: statements.getCandidateEvents.all(id).map((row) => ({
        id: row.id,
        candidateId: row.candidate_id,
        eventType: row.event_type,
        actor: row.actor,
        payload: safeJsonParse(row.payload_json, {}),
        createdAt: row.created_at,
      })),
    };
  }

  function listCandidates(filters = {}) {
    const page = Math.max(1, Number.parseInt(String(filters.page || "1"), 10) || 1);
    const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(filters.pageSize || "20"), 10) || 20));
    const offset = (page - 1) * pageSize;
    const { whereSql, params } = buildListFilters(filters);

    const items = db
      .prepare(`
        SELECT *
        FROM catalog_import_candidates
        ${whereSql}
        ORDER BY datetime(updated_at) DESC, id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, pageSize, offset)
      .map(hydrateCandidate);

    const totalRow = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM catalog_import_candidates
        ${whereSql}
      `)
      .get(...params);

    const statusRows = db
      .prepare(`
        SELECT status AS key, COUNT(*) AS count
        FROM catalog_import_candidates
        ${whereSql}
        GROUP BY status
      `)
      .all(...params);

    const scopeRows = db
      .prepare(`
        SELECT scope_status AS key, COUNT(*) AS count
        FROM catalog_import_candidates
        ${whereSql}
        GROUP BY scope_status
      `)
      .all(...params);

    const sourceRows = db
      .prepare(`
        SELECT primary_source_type AS key, COUNT(*) AS count
        FROM catalog_import_candidates
        ${whereSql}
        GROUP BY primary_source_type
      `)
      .all(...params);

    const duplicateRows = db
      .prepare(`
        SELECT
          CASE WHEN has_duplicate_match = 1 OR status = 'duplicate' THEN 'duplicates' ELSE 'clear' END AS key,
          COUNT(*) AS count
        FROM catalog_import_candidates
        ${whereSql}
        GROUP BY key
      `)
      .all(...params);

    return {
      items,
      total: totalRow?.count || 0,
      page,
      pageSize,
      counts: {
        status: Object.fromEntries(statusRows.map((row) => [row.key, row.count])),
        scopeStatus: Object.fromEntries(scopeRows.map((row) => [row.key, row.count])),
        sourceType: Object.fromEntries(sourceRows.map((row) => [row.key || "unknown", row.count])),
        duplicateState: Object.fromEntries(duplicateRows.map((row) => [row.key, row.count])),
      },
    };
  }

  const replaceCandidateSources = db.transaction((candidateId, sources = []) => {
    statements.deleteCandidateSources.run(candidateId);
    (Array.isArray(sources) ? sources : []).forEach((source) => {
      statements.insertCandidateSource.run({
        candidateId,
        sourceType: source.sourceType || "",
        sourceKey: source.sourceKey || "",
        sourceUrl: source.sourceUrl || "",
        fetchStatus: source.fetchStatus || "fetched",
        payloadJson: JSON.stringify(source.payload || {}),
        normalizedJson: JSON.stringify(source.normalized || {}),
        fetchedAt: source.fetchedAt || new Date().toISOString(),
      });
    });
  });

  function updateCandidate(id, updates = {}) {
    const current = hydrateCandidate(statements.getCandidate.get(id));
    if (!current) {
      return null;
    }

    const next = {
      ...current,
      ...updates,
      scopeStatus: updates.scopeStatus ?? current.scopeStatus,
      hasDuplicateMatch: updates.hasDuplicateMatch ?? current.hasDuplicateMatch,
      title: updates.title ?? current.title,
      creatorName: updates.creatorName ?? current.creatorName,
      canonicalId: updates.canonicalId ?? current.canonicalId,
      primarySourceType: updates.primarySourceType ?? current.primarySourceType,
      primarySourceKey: updates.primarySourceKey ?? current.primarySourceKey,
      primarySourceUrl: updates.primarySourceUrl ?? current.primarySourceUrl,
      seedQuery: updates.seedQuery ?? current.seedQuery,
      objective: updates.objective ?? current.objective,
      aiSuggestions: updates.aiSuggestions ?? current.aiSuggestions,
      provenance: updates.provenance ?? current.provenance,
      dedupe: updates.dedupe ?? current.dedupe,
      reviewNotes: updates.reviewNotes ?? current.reviewNotes,
      reviewedBy: updates.reviewedBy ?? current.reviewedBy,
      reviewedAt: updates.reviewedAt ?? current.reviewedAt,
      draftedShowId: updates.draftedShowId ?? current.draftedShowId,
      publishedShowId: updates.publishedShowId ?? current.publishedShowId,
      duplicateOfShowId: updates.duplicateOfShowId ?? current.duplicateOfShowId,
      duplicateOfCandidateId: updates.duplicateOfCandidateId ?? current.duplicateOfCandidateId,
    };

    db.prepare(`
      UPDATE catalog_import_candidates
      SET
        status = @status,
        scope_status = @scopeStatus,
        has_duplicate_match = @hasDuplicateMatch,
        title = @title,
        creator_name = @creatorName,
        canonical_id = @canonicalId,
        primary_source_type = @primarySourceType,
        primary_source_key = @primarySourceKey,
        primary_source_url = @primarySourceUrl,
        seed_query = @seedQuery,
        objective_json = @objectiveJson,
        ai_suggestions_json = @aiSuggestionsJson,
        provenance_json = @provenanceJson,
        dedupe_json = @dedupeJson,
        review_notes = @reviewNotes,
        reviewed_by = @reviewedBy,
        reviewed_at = @reviewedAt,
        drafted_show_id = @draftedShowId,
        published_show_id = @publishedShowId,
        duplicate_of_show_id = @duplicateOfShowId,
        duplicate_of_candidate_id = @duplicateOfCandidateId,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      id,
      status: next.status,
      scopeStatus: next.scopeStatus,
      hasDuplicateMatch: next.hasDuplicateMatch ? 1 : 0,
      title: next.title,
      creatorName: next.creatorName,
      canonicalId: next.canonicalId,
      primarySourceType: next.primarySourceType,
      primarySourceKey: next.primarySourceKey,
      primarySourceUrl: next.primarySourceUrl,
      seedQuery: next.seedQuery,
      objectiveJson: JSON.stringify(next.objective || {}),
      aiSuggestionsJson: JSON.stringify(next.aiSuggestions || {}),
      provenanceJson: JSON.stringify(next.provenance || {}),
      dedupeJson: JSON.stringify(next.dedupe || {}),
      reviewNotes: next.reviewNotes || "",
      reviewedBy: next.reviewedBy || "",
      reviewedAt: next.reviewedAt || null,
      draftedShowId: next.draftedShowId || "",
      publishedShowId: next.publishedShowId || "",
      duplicateOfShowId: next.duplicateOfShowId || "",
      duplicateOfCandidateId: next.duplicateOfCandidateId || "",
    });

    return this.getCandidate(id);
  }

  function recordEvent(candidateId, eventType, actor = "", payload = {}) {
    statements.insertEvent.run({
      id: randomUUID(),
      candidateId,
      eventType,
      actor: actor || "",
      payloadJson: JSON.stringify(payload || {}),
    });
  }

  function createRun({ runType, status = "completed", input = {}, summary = {} }) {
    const id = randomUUID();
    statements.insertRun.run({
      id,
      runType,
      status,
      inputJson: JSON.stringify(input || {}),
      summaryJson: JSON.stringify(summary || {}),
    });
    return id;
  }

  function listCandidateBasics() {
    return statements.listCandidateBasics.all().map((row) => ({
      id: row.id,
      title: row.title,
      creatorName: row.creator_name,
      objective: safeJsonParse(row.objective_json, {}),
    }));
  }

  return {
    createCandidate,
    createRun,
    getCandidate,
    listCandidateBasics,
    listCandidates,
    recordEvent,
    replaceCandidateSources,
    updateCandidate,
  };
}

module.exports = {
  createImportStore,
};
