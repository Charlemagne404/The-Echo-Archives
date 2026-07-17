const { createHash, randomUUID } = require("node:crypto");
const { gunzipSync, gzipSync } = require("node:zlib");

const {
  IMPORT_OPEN_STATUSES,
  normalizeUrl,
  safeJsonParse,
  trimText,
} = require("../import/utils");

const MAX_RAW_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const SUCCESS_SOURCE_STATUSES = new Set(["fetched", "success", "not-modified", "cache-hit"]);

function json(value, fallback) {
  return safeJsonParse(value, fallback);
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function packRawBody(value = "") {
  const original = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ""));
  const truncated = original.length > MAX_RAW_SNAPSHOT_BYTES;
  const retained = truncated ? original.subarray(0, MAX_RAW_SNAPSHOT_BYTES) : original;
  return {
    byteSize: original.length,
    hash: stableHash(original),
    gzip: retained.length > 0 ? gzipSync(retained) : null,
    truncated,
  };
}

function unpackRawBody(value) {
  if (!value) {
    return "";
  }

  try {
    return gunzipSync(value).toString("utf8");
  } catch (_error) {
    return "";
  }
}

function normalizeIdentity(identityType = "", identityValue = "") {
  const type = trimText(identityType, 80).toLowerCase();
  let value = trimText(identityValue, 1000);
  if (!type || !value) {
    return null;
  }

  if (type.includes("url") || type === "rss") {
    value = normalizeUrl(value);
  } else {
    value = value.toLowerCase();
  }

  return value ? { type, value } : null;
}

function hydrateCandidate(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    mode: row.mode || "create",
    existingShowId: row.existing_show_id || "",
    scopeStatus: row.scope_status,
    hasDuplicateMatch: Boolean(row.has_duplicate_match),
    title: row.title,
    creatorName: row.creator_name,
    canonicalId: row.canonical_id,
    primarySourceType: row.primary_source_type,
    primarySourceKey: row.primary_source_key,
    primarySourceUrl: row.primary_source_url,
    seedQuery: row.seed_query,
    objective: json(row.objective_json, {}),
    aiSuggestions: json(row.ai_suggestions_json, {}),
    provenance: json(row.provenance_json, {}),
    dedupe: json(row.dedupe_json, {}),
    preparedRecord: json(row.prepared_record_json, {}),
    readiness: json(row.readiness_json, {}),
    conflicts: json(row.conflicts_json, []),
    sourceHealth: json(row.source_health_json, {}),
    lockedFields: json(row.locked_fields_json, []),
    coverStage: json(row.cover_stage_json, {}),
    pipelineVersion: row.pipeline_version || "2",
    inputRevision: Number(row.input_revision) || 1,
    lastRunId: row.last_run_id || "",
    lastError: row.last_error || "",
    reviewNotes: row.review_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    draftedShowId: row.drafted_show_id,
    publishedShowId: row.published_show_id,
    duplicateOfShowId: row.duplicate_of_show_id,
    duplicateOfCandidateId: row.duplicate_of_candidate_id,
    discoverySourceId: row.discovery_source_id || "",
    discoveryRunId: row.discovery_run_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateSource(row, { includeRaw = false } = {}) {
  if (!row) {
    return null;
  }

  const value = {
    id: row.id,
    candidateId: row.candidate_id,
    sourceType: row.source_type,
    sourceKey: row.source_key,
    sourceUrl: row.source_url,
    fetchStatus: row.fetch_status,
    httpStatus: row.http_status,
    etag: row.etag || "",
    lastModified: row.last_modified || "",
    payloadHash: row.payload_hash || "",
    rawTruncated: Boolean(row.raw_truncated),
    rawCompacted: Boolean(row.raw_compacted),
    payload: json(row.payload_json, {}),
    normalized: json(row.normalized_json, {}),
    fetchedAt: row.fetched_at,
  };

  if (includeRaw) {
    value.rawBody = unpackRawBody(row.payload_gzip);
  }

  return value;
}

function hydrateEvidence(row) {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    fieldName: row.field_name,
    value: json(row.value_json, null),
    normalizedValue: row.normalized_value,
    sourceSnapshotId: row.source_snapshot_id,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    confidence: Number(row.confidence) || 0,
    method: row.method,
    status: row.evidence_status,
    selected: Boolean(row.selected),
    observedAt: row.observed_at,
  };
}

function hydrateJob(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    candidateId: row.candidate_id,
    runId: row.run_id || "",
    jobType: row.job_type,
    status: row.status,
    attemptCount: Number(row.attempt_count) || 0,
    maxAttempts: Number(row.max_attempts) || 4,
    nextAttemptAt: row.next_attempt_at,
    leaseOwner: row.lease_owner || "",
    leaseExpiresAt: row.lease_expires_at,
    inputRevision: Number(row.input_revision) || 1,
    payload: json(row.payload_json, {}),
    result: json(row.result_json, {}),
    error: row.error_text || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function hydrateRun(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    runType: row.run_type,
    status: row.status,
    input: json(row.input_json, {}),
    summary: json(row.summary_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function hydrateDiscoverySource(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    query: row.query_text || "",
    config: json(row.config_json, {}),
    enabled: Boolean(row.enabled),
    intervalMinutes: Number(row.interval_minutes) || 1440,
    lastCheckedAt: row.last_checked_at,
    nextRunAt: row.next_run_at,
    lastStatus: row.last_status || "idle",
    lastError: row.last_error || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateDiscoveryRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    summary: json(row.summary_json, {}),
    error: row.error_text || "",
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function hydrateDiscoveryItem(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    sourceId: row.source_id,
    sourceItemKey: row.source_item_key,
    candidateId: row.candidate_id || "",
    existingShowId: row.existing_show_id || "",
    disposition: row.disposition || "new",
    identity: json(row.identity_json, {}),
    result: json(row.result_json, {}),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastRunId: row.last_run_id || "",
  };
}

function hydrateDiscoveryJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    runId: row.run_id,
    jobType: row.job_type,
    status: row.status,
    attemptCount: Number(row.attempt_count) || 0,
    maxAttempts: Number(row.max_attempts) || 4,
    nextAttemptAt: row.next_attempt_at,
    leaseOwner: row.lease_owner || "",
    leaseExpiresAt: row.lease_expires_at,
    payload: json(row.payload_json, {}),
    result: json(row.result_json, {}),
    error: row.error_text || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function buildFtsQuery(value = "") {
  return trimText(value, 200)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((part) => `"${part.replace(/"/g, "\"\"")}"*`)
    .join(" AND ");
}

function createImportStore({ db }) {
  const getCandidateRow = db.prepare("SELECT * FROM catalog_import_candidates WHERE id = ?");
  const getCandidateSources = db.prepare(`
    SELECT * FROM catalog_import_sources
    WHERE candidate_id = ? AND raw_compacted = 0
    ORDER BY datetime(fetched_at) DESC, id DESC
  `);
  const getCandidateEvents = db.prepare(`
    SELECT * FROM catalog_import_events
    WHERE candidate_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
  `);
  const getCandidateEvidence = db.prepare(`
    SELECT * FROM catalog_import_field_evidence
    WHERE candidate_id = ?
    ORDER BY field_name, selected DESC, confidence DESC, id DESC
  `);
  const getCandidateJobs = db.prepare(`
    SELECT * FROM catalog_import_jobs
    WHERE candidate_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
  `);

  function buildListFilters(filters = {}) {
    const clauses = [];
    const params = [];
    const status = trimText(filters.status, 80);
    const scopeStatus = trimText(filters.scopeStatus, 80);
    const sourceType = trimText(filters.sourceType, 80);
    const duplicateState = trimText(filters.duplicateState, 40);
    const q = trimText(filters.q, 200);
    const openStatuses = Array.isArray(filters.openStatuses) ? filters.openStatuses.filter(Boolean) : IMPORT_OPEN_STATUSES;

    if (status) {
      clauses.push("c.status = ?");
      params.push(status);
    } else if (filters.includeClosed !== true && openStatuses.length > 0) {
      clauses.push(`c.status IN (${openStatuses.map(() => "?").join(", ")})`);
      params.push(...openStatuses);
    }
    if (scopeStatus) {
      clauses.push("c.scope_status = ?");
      params.push(scopeStatus);
    }
    if (sourceType) {
      clauses.push("c.primary_source_type = ?");
      params.push(sourceType);
    }
    if (duplicateState === "duplicates") {
      clauses.push("(c.has_duplicate_match = 1 OR c.status = 'duplicate')");
    } else if (duplicateState === "clear") {
      clauses.push("c.has_duplicate_match = 0");
    }
    if (q) {
      clauses.push(`(
        c.id = ? OR c.rowid IN (
          SELECT rowid FROM catalog_import_candidates_fts
          WHERE catalog_import_candidates_fts MATCH ?
        )
      )`);
      params.push(q, buildFtsQuery(q));
    }

    return {
      whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
      params,
    };
  }

  function createCandidate(payload = {}) {
    const id = payload.id || randomUUID();
    db.prepare(`
      INSERT INTO catalog_import_candidates (
        id, status, mode, existing_show_id, scope_status, has_duplicate_match,
        title, creator_name, canonical_id, primary_source_type, primary_source_key,
        primary_source_url, seed_query, objective_json, ai_suggestions_json,
        provenance_json, dedupe_json, prepared_record_json, readiness_json,
        conflicts_json, source_health_json, locked_fields_json, cover_stage_json,
        pipeline_version, input_revision, last_run_id, last_error, review_notes,
        reviewed_by, reviewed_at, drafted_show_id, published_show_id,
        duplicate_of_show_id, duplicate_of_candidate_id, discovery_source_id, discovery_run_id
      ) VALUES (
        @id, @status, @mode, @existingShowId, @scopeStatus, @hasDuplicateMatch,
        @title, @creatorName, @canonicalId, @primarySourceType, @primarySourceKey,
        @primarySourceUrl, @seedQuery, @objectiveJson, @aiSuggestionsJson,
        @provenanceJson, @dedupeJson, @preparedRecordJson, @readinessJson,
        @conflictsJson, @sourceHealthJson, @lockedFieldsJson, @coverStageJson,
        @pipelineVersion, @inputRevision, @lastRunId, @lastError, @reviewNotes,
        @reviewedBy, @reviewedAt, @draftedShowId, @publishedShowId,
        @duplicateOfShowId, @duplicateOfCandidateId, @discoverySourceId, @discoveryRunId
      )
    `).run({
      id,
      status: payload.status || "queued",
      mode: payload.mode || "create",
      existingShowId: payload.existingShowId || "",
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
      preparedRecordJson: JSON.stringify(payload.preparedRecord || {}),
      readinessJson: JSON.stringify(payload.readiness || {}),
      conflictsJson: JSON.stringify(payload.conflicts || []),
      sourceHealthJson: JSON.stringify(payload.sourceHealth || {}),
      lockedFieldsJson: JSON.stringify(payload.lockedFields || []),
      coverStageJson: JSON.stringify(payload.coverStage || {}),
      pipelineVersion: payload.pipelineVersion || "2",
      inputRevision: Number(payload.inputRevision) || 1,
      lastRunId: payload.lastRunId || "",
      lastError: payload.lastError || "",
      reviewNotes: payload.reviewNotes || "",
      reviewedBy: payload.reviewedBy || "",
      reviewedAt: payload.reviewedAt || null,
      draftedShowId: payload.draftedShowId || "",
      publishedShowId: payload.publishedShowId || "",
      duplicateOfShowId: payload.duplicateOfShowId || "",
      duplicateOfCandidateId: payload.duplicateOfCandidateId || "",
      discoverySourceId: payload.discoverySourceId || "",
      discoveryRunId: payload.discoveryRunId || "",
    });
    return getCandidate(id);
  }

  function getCandidate(id, options = {}) {
    const candidate = hydrateCandidate(getCandidateRow.get(id));
    if (!candidate) {
      return null;
    }

    return {
      ...candidate,
      sources: getCandidateSources.all(id).map((row) => hydrateSource(row, options)),
      fieldEvidence: getCandidateEvidence.all(id).map(hydrateEvidence),
      jobs: getCandidateJobs.all(id).map(hydrateJob),
      events: getCandidateEvents.all(id).map((row) => ({
        id: row.id,
        candidateId: row.candidate_id,
        eventType: row.event_type,
        actor: row.actor,
        payload: json(row.payload_json, {}),
        createdAt: row.created_at,
      })),
    };
  }

  function listCandidates(filters = {}) {
    const page = Math.max(1, Number.parseInt(String(filters.page || "1"), 10) || 1);
    const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(filters.pageSize || "20"), 10) || 20));
    const offset = (page - 1) * pageSize;
    const { whereSql, params } = buildListFilters(filters);
    const base = `FROM catalog_import_candidates c ${whereSql}`;
    const items = db.prepare(`
      SELECT c.* ${base}
      ORDER BY datetime(c.updated_at) DESC, c.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset).map(hydrateCandidate);
    const total = db.prepare(`SELECT COUNT(*) AS count ${base}`).get(...params)?.count || 0;

    function counts(column, expression = column) {
      return Object.fromEntries(db.prepare(`
        SELECT ${expression} AS key, COUNT(*) AS count ${base} GROUP BY key
      `).all(...params).map((row) => [row.key || "unknown", row.count]));
    }

    return {
      items,
      total,
      page,
      pageSize,
      counts: {
        status: counts("c.status"),
        scopeStatus: counts("c.scope_status"),
        sourceType: counts("c.primary_source_type"),
        duplicateState: counts("c.has_duplicate_match", "CASE WHEN c.has_duplicate_match = 1 OR c.status = 'duplicate' THEN 'duplicates' ELSE 'clear' END"),
      },
    };
  }

  function listCandidateIdsByStatuses(statuses = []) {
    const normalizedStatuses = [...new Set((Array.isArray(statuses) ? statuses : [])
      .map((status) => trimText(status, 80))
      .filter(Boolean))];
    if (normalizedStatuses.length === 0) {
      return [];
    }

    return db.prepare(`
      SELECT id FROM catalog_import_candidates
      WHERE status IN (${normalizedStatuses.map(() => "?").join(", ")})
      ORDER BY datetime(updated_at) DESC, id DESC
    `).all(...normalizedStatuses).map((row) => row.id);
  }

  function pruneSourceHistory(candidateId) {
    const rows = getCandidateSources.all(candidateId);
    const groups = new Map();
    rows.forEach((row) => {
      const key = `${row.source_type}\u0000${row.source_key}\u0000${row.source_url}`;
      const group = groups.get(key) || { success: [], failure: [] };
      (SUCCESS_SOURCE_STATUSES.has(row.fetch_status) ? group.success : group.failure).push(row.id);
      groups.set(key, group);
    });
    const remove = [];
    groups.forEach((group) => {
      remove.push(...group.success.slice(2), ...group.failure.slice(1));
    });
    const compactStatement = db.prepare(`
      UPDATE catalog_import_sources
      SET payload_gzip = NULL, payload_json = '{"compacted":true}', raw_compacted = 1
      WHERE id = ?
    `);
    remove.forEach((id) => compactStatement.run(id));
  }

  const appendCandidateSources = db.transaction((candidateId, sources = []) => {
    const insert = db.prepare(`
      INSERT INTO catalog_import_sources (
        candidate_id, source_type, source_key, source_url, fetch_status,
        http_status, etag, last_modified, payload_hash, payload_gzip,
        raw_truncated, payload_json, normalized_json, fetched_at
      ) VALUES (
        @candidateId, @sourceType, @sourceKey, @sourceUrl, @fetchStatus,
        @httpStatus, @etag, @lastModified, @payloadHash, @payloadGzip,
        @rawTruncated, @payloadJson, @normalizedJson, @fetchedAt
      )
    `);
    const inserted = [];
    (Array.isArray(sources) ? sources : []).forEach((source) => {
      const rawBody = source.rawBody ?? source.raw?.text ?? source.raw?.body ?? "";
      const packed = packRawBody(rawBody);
      const info = insert.run({
        candidateId,
        sourceType: source.sourceType || "",
        sourceKey: source.sourceKey || "",
        sourceUrl: source.sourceUrl || "",
        fetchStatus: source.fetchStatus || "fetched",
        httpStatus: source.httpStatus ?? source.raw?.httpStatus ?? null,
        etag: source.etag || source.raw?.etag || "",
        lastModified: source.lastModified || source.raw?.lastModified || "",
        payloadHash: source.payloadHash || packed.hash,
        payloadGzip: packed.gzip,
        rawTruncated: source.rawTruncated || packed.truncated ? 1 : 0,
        payloadJson: JSON.stringify(source.payload || source.rawMetadata || {
          contentType: source.raw?.contentType || "",
          byteSize: packed.byteSize,
        }),
        normalizedJson: JSON.stringify(source.normalized || {}),
        fetchedAt: source.fetchedAt || new Date().toISOString(),
      });
      inserted.push({ ...source, snapshotId: Number(info.lastInsertRowid) });
    });
    pruneSourceHistory(candidateId);
    return inserted;
  });

  const appendFieldEvidence = db.transaction((candidateId, evidence = []) => {
    const insert = db.prepare(`
      INSERT INTO catalog_import_field_evidence (
        candidate_id, field_name, value_json, normalized_value,
        source_snapshot_id, source_type, source_url, confidence, method,
        evidence_status, selected, observed_at
      ) VALUES (
        @candidateId, @fieldName, @valueJson, @normalizedValue,
        @sourceSnapshotId, @sourceType, @sourceUrl, @confidence, @method,
        @evidenceStatus, @selected, @observedAt
      )
    `);
    (Array.isArray(evidence) ? evidence : []).forEach((item) => {
      insert.run({
        candidateId,
        fieldName: trimText(item.fieldName, 200),
        valueJson: JSON.stringify(item.value ?? null),
        normalizedValue: trimText(item.normalizedValue ?? (typeof item.value === "string" ? item.value : JSON.stringify(item.value ?? null)), 2000),
        sourceSnapshotId: item.sourceSnapshotId || null,
        sourceType: item.sourceType || "",
        sourceUrl: item.sourceUrl || "",
        confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
        method: item.method || "direct",
        evidenceStatus: item.status || "candidate",
        selected: item.selected ? 1 : 0,
        observedAt: item.observedAt || new Date().toISOString(),
      });
    });
  });

  function selectEvidence(candidateId, fieldName, evidenceId, actor = "") {
    return db.transaction(() => {
      db.prepare("UPDATE catalog_import_field_evidence SET selected = 0 WHERE candidate_id = ? AND field_name = ?").run(candidateId, fieldName);
      const selected = db.prepare(`
        UPDATE catalog_import_field_evidence
        SET selected = 1, confidence = 1, method = 'reviewer-selected', evidence_status = 'selected'
        WHERE id = ? AND candidate_id = ? AND field_name = ?
      `).run(evidenceId, candidateId, fieldName);
      if (selected.changes === 0) {
        return null;
      }
      const locks = new Set(hydrateCandidate(getCandidateRow.get(candidateId))?.lockedFields || []);
      locks.add(fieldName);
      updateCandidate(candidateId, { lockedFields: [...locks] });
      recordEvent(candidateId, "field-evidence-selected", actor, { fieldName, evidenceId });
      return getCandidate(candidateId);
    })();
  }

  function updateCandidate(id, updates = {}) {
    const current = hydrateCandidate(getCandidateRow.get(id));
    if (!current) {
      return null;
    }
    const next = { ...current, ...updates };
    db.prepare(`
      UPDATE catalog_import_candidates SET
        status=@status, mode=@mode, existing_show_id=@existingShowId,
        scope_status=@scopeStatus, has_duplicate_match=@hasDuplicateMatch,
        title=@title, creator_name=@creatorName, canonical_id=@canonicalId,
        primary_source_type=@primarySourceType, primary_source_key=@primarySourceKey,
        primary_source_url=@primarySourceUrl, seed_query=@seedQuery,
        objective_json=@objectiveJson, ai_suggestions_json=@aiSuggestionsJson,
        provenance_json=@provenanceJson, dedupe_json=@dedupeJson,
        prepared_record_json=@preparedRecordJson, readiness_json=@readinessJson,
        conflicts_json=@conflictsJson, source_health_json=@sourceHealthJson,
        locked_fields_json=@lockedFieldsJson, cover_stage_json=@coverStageJson,
        pipeline_version=@pipelineVersion, input_revision=@inputRevision,
        last_run_id=@lastRunId, last_error=@lastError,
        review_notes=@reviewNotes, reviewed_by=@reviewedBy, reviewed_at=@reviewedAt,
        drafted_show_id=@draftedShowId, published_show_id=@publishedShowId,
        duplicate_of_show_id=@duplicateOfShowId,
        duplicate_of_candidate_id=@duplicateOfCandidateId,
        discovery_source_id=@discoverySourceId,
        discovery_run_id=@discoveryRunId,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=@id
    `).run({
      id,
      status: next.status,
      mode: next.mode || "create",
      existingShowId: next.existingShowId || "",
      scopeStatus: next.scopeStatus,
      hasDuplicateMatch: next.hasDuplicateMatch ? 1 : 0,
      title: next.title || "",
      creatorName: next.creatorName || "",
      canonicalId: next.canonicalId || "",
      primarySourceType: next.primarySourceType || "",
      primarySourceKey: next.primarySourceKey || "",
      primarySourceUrl: next.primarySourceUrl || "",
      seedQuery: next.seedQuery || "",
      objectiveJson: JSON.stringify(next.objective || {}),
      aiSuggestionsJson: JSON.stringify(next.aiSuggestions || {}),
      provenanceJson: JSON.stringify(next.provenance || {}),
      dedupeJson: JSON.stringify(next.dedupe || {}),
      preparedRecordJson: JSON.stringify(next.preparedRecord || {}),
      readinessJson: JSON.stringify(next.readiness || {}),
      conflictsJson: JSON.stringify(next.conflicts || []),
      sourceHealthJson: JSON.stringify(next.sourceHealth || {}),
      lockedFieldsJson: JSON.stringify(next.lockedFields || []),
      coverStageJson: JSON.stringify(next.coverStage || {}),
      pipelineVersion: next.pipelineVersion || "2",
      inputRevision: Number(next.inputRevision) || 1,
      lastRunId: next.lastRunId || "",
      lastError: next.lastError || "",
      reviewNotes: next.reviewNotes || "",
      reviewedBy: next.reviewedBy || "",
      reviewedAt: next.reviewedAt || null,
      draftedShowId: next.draftedShowId || "",
      publishedShowId: next.publishedShowId || "",
      duplicateOfShowId: next.duplicateOfShowId || "",
      duplicateOfCandidateId: next.duplicateOfCandidateId || "",
      discoverySourceId: next.discoverySourceId || "",
      discoveryRunId: next.discoveryRunId || "",
    });
    return getCandidate(id);
  }

  function recordEvent(candidateId, eventType, actor = "", payload = {}) {
    db.prepare(`
      INSERT INTO catalog_import_events (id, candidate_id, event_type, actor, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), candidateId, eventType, actor || "", JSON.stringify(payload || {}));
  }

  function claimIdentity(identityType, identityValue, mapping = {}) {
    const identity = normalizeIdentity(identityType, identityValue);
    if (!identity) {
      return null;
    }
    const existing = db.prepare(`
      SELECT * FROM catalog_import_identities WHERE identity_type = ? AND identity_value = ?
    `).get(identity.type, identity.value);
    if (existing) {
      const candidateId = existing.candidate_id || mapping.candidateId || null;
      const existingShowId = existing.existing_show_id || mapping.existingShowId || "";
      if (candidateId !== existing.candidate_id || existingShowId !== existing.existing_show_id) {
        db.prepare(`
          UPDATE catalog_import_identities
          SET candidate_id = ?, existing_show_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE identity_type = ? AND identity_value = ?
        `).run(candidateId, existingShowId, identity.type, identity.value);
      }
      return {
        identityType: existing.identity_type,
        identityValue: existing.identity_value,
        candidateId: candidateId || "",
        existingShowId,
        collision: Boolean(mapping.candidateId && candidateId && mapping.candidateId !== candidateId),
      };
    }
    db.prepare(`
      INSERT INTO catalog_import_identities (identity_type, identity_value, candidate_id, existing_show_id)
      VALUES (?, ?, ?, ?)
    `).run(identity.type, identity.value, mapping.candidateId || null, mapping.existingShowId || "");
    return { identityType: identity.type, identityValue: identity.value, ...mapping, collision: false };
  }

  function findIdentity(identityType, identityValue) {
    const identity = normalizeIdentity(identityType, identityValue);
    if (!identity) {
      return null;
    }
    const row = db.prepare(`
      SELECT * FROM catalog_import_identities WHERE identity_type = ? AND identity_value = ?
    `).get(identity.type, identity.value);
    return row ? {
      identityType: row.identity_type,
      identityValue: row.identity_value,
      candidateId: row.candidate_id || "",
      existingShowId: row.existing_show_id || "",
    } : null;
  }

  function listIdentities(candidateId) {
    return db.prepare(`
      SELECT * FROM catalog_import_identities WHERE candidate_id = ? ORDER BY identity_type, identity_value
    `).all(candidateId).map((row) => ({
      identityType: row.identity_type,
      identityValue: row.identity_value,
      candidateId: row.candidate_id || "",
      existingShowId: row.existing_show_id || "",
    }));
  }

  function bindIdentitiesToShow(candidateId, showId) {
    db.prepare(`
      UPDATE catalog_import_identities
      SET existing_show_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE candidate_id = ?
    `).run(showId, candidateId);
  }

  function createRun({ runType, status = "queued", input = {}, summary = {} }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO catalog_import_runs (
        id, run_type, status, input_json, summary_json, updated_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, runType, status, JSON.stringify(input || {}), JSON.stringify(summary || {}), now, status === "processing" ? now : null, status === "completed" ? now : null);
    return getRun(id);
  }

  function getRun(id) {
    const run = hydrateRun(db.prepare("SELECT * FROM catalog_import_runs WHERE id = ?").get(id));
    if (!run) {
      return null;
    }
    const jobs = db.prepare("SELECT * FROM catalog_import_jobs WHERE run_id = ? ORDER BY created_at, id").all(id).map(hydrateJob);
    return {
      ...run,
      jobs,
      progress: {
        total: jobs.length,
        queued: jobs.filter((job) => ["queued", "retry"].includes(job.status)).length,
        processing: jobs.filter((job) => job.status === "processing").length,
        completed: jobs.filter((job) => job.status === "completed").length,
        failed: jobs.filter((job) => job.status === "failed").length,
      },
    };
  }

  function updateRun(id, updates = {}) {
    const current = getRun(id);
    if (!current) {
      return null;
    }
    const status = updates.status || current.status;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE catalog_import_runs SET
        status = ?, summary_json = ?, updated_at = ?,
        started_at = COALESCE(started_at, ?),
        completed_at = ?
      WHERE id = ?
    `).run(
      status,
      JSON.stringify(updates.summary ?? current.summary ?? {}),
      now,
      status === "processing" ? now : null,
      ["completed", "failed"].includes(status) ? now : null,
      id,
    );
    return getRun(id);
  }

  function enqueueJob({ candidateId, runId = "", jobType = "prepare", inputRevision = 1, payload = {}, maxAttempts = 4 }) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO catalog_import_jobs (
        id, candidate_id, run_id, job_type, status, max_attempts,
        input_revision, payload_json, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(candidate_id, job_type, input_revision) DO UPDATE SET
        run_id = excluded.run_id,
        status = CASE WHEN catalog_import_jobs.status = 'processing' THEN 'processing' ELSE 'queued' END,
        attempt_count = CASE WHEN catalog_import_jobs.status = 'processing' THEN catalog_import_jobs.attempt_count ELSE 0 END,
        payload_json = excluded.payload_json,
        error_text = '', next_attempt_at = NULL, completed_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).run(id, candidateId, runId || null, jobType, maxAttempts, inputRevision, JSON.stringify(payload || {}));
    return hydrateJob(db.prepare(`
      SELECT * FROM catalog_import_jobs WHERE candidate_id = ? AND job_type = ? AND input_revision = ?
    `).get(candidateId, jobType, inputRevision));
  }

  const claimNextJob = db.transaction(({ workerId, leaseMs = 120_000, jobType = "" }) => {
    const typeClause = jobType ? "AND job_type = ?" : "";
    const params = jobType ? [jobType] : [];
    const row = db.prepare(`
      SELECT * FROM catalog_import_jobs
      WHERE (
        (status IN ('queued', 'retry') AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now')))
        OR (status = 'processing' AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at) <= datetime('now'))
      )
      ${typeClause}
      ORDER BY datetime(COALESCE(next_attempt_at, created_at)), id
      LIMIT 1
    `).get(...params);
    if (!row) {
      return null;
    }
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    db.prepare(`
      UPDATE catalog_import_jobs SET
        status='processing', attempt_count=attempt_count + 1,
        lease_owner=?, lease_expires_at=?, started_at=COALESCE(started_at, ?),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(workerId, leaseExpiresAt, now.toISOString(), row.id);
    return hydrateJob(db.prepare("SELECT * FROM catalog_import_jobs WHERE id = ?").get(row.id));
  });

  function completeJob(id, result = {}) {
    db.prepare(`
      UPDATE catalog_import_jobs SET status='completed', result_json=?, error_text='',
        lease_owner='', lease_expires_at=NULL, completed_at=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(JSON.stringify(result || {}), new Date().toISOString(), id);
    return hydrateJob(db.prepare("SELECT * FROM catalog_import_jobs WHERE id = ?").get(id));
  }

  function failJob(id, error, { retryable = true, retryAfterMs = 0 } = {}) {
    const current = hydrateJob(db.prepare("SELECT * FROM catalog_import_jobs WHERE id = ?").get(id));
    if (!current) {
      return null;
    }
    const exhausted = !retryable || current.attemptCount >= current.maxAttempts;
    const delays = [30_000, 120_000, 600_000, 600_000];
    const delay = Math.max(retryAfterMs, delays[Math.max(0, current.attemptCount - 1)] || 600_000);
    const nextAttemptAt = exhausted ? null : new Date(Date.now() + delay + Math.floor(Math.random() * 1_000)).toISOString();
    db.prepare(`
      UPDATE catalog_import_jobs SET status=?, error_text=?, next_attempt_at=?,
        lease_owner='', lease_expires_at=NULL, completed_at=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(exhausted ? "failed" : "retry", trimText(error?.message || error, 4000), nextAttemptAt, exhausted ? new Date().toISOString() : null, id);
    return hydrateJob(db.prepare("SELECT * FROM catalog_import_jobs WHERE id = ?").get(id));
  }

  function putSourceCache(entry = {}) {
    const packed = packRawBody(entry.rawBody || "");
    db.prepare(`
      INSERT INTO catalog_import_source_cache (
        source_type, source_key, source_url, fetch_status, http_status,
        etag, last_modified, payload_gzip, payload_hash, raw_truncated,
        normalized_json, error_text, fetched_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_type, source_key) DO UPDATE SET
        source_url=excluded.source_url, fetch_status=excluded.fetch_status,
        http_status=excluded.http_status, etag=excluded.etag,
        last_modified=excluded.last_modified, payload_gzip=excluded.payload_gzip,
        payload_hash=excluded.payload_hash, raw_truncated=excluded.raw_truncated,
        normalized_json=excluded.normalized_json, error_text=excluded.error_text,
        fetched_at=excluded.fetched_at, expires_at=excluded.expires_at
    `).run(
      entry.sourceType || "", entry.sourceKey || "", entry.sourceUrl || "",
      entry.fetchStatus || "fetched", entry.httpStatus ?? null, entry.etag || "",
      entry.lastModified || "", packed.gzip, entry.payloadHash || packed.hash,
      entry.rawTruncated || packed.truncated ? 1 : 0,
      JSON.stringify(entry.normalized || {}), entry.error || "",
      entry.fetchedAt || new Date().toISOString(), entry.expiresAt || null,
    );
    return getSourceCache(entry.sourceType, entry.sourceKey);
  }

  function getSourceCache(sourceType, sourceKey) {
    const row = db.prepare(`
      SELECT * FROM catalog_import_source_cache WHERE source_type = ? AND source_key = ?
    `).get(sourceType, sourceKey);
    return row ? {
      sourceType: row.source_type,
      sourceKey: row.source_key,
      sourceUrl: row.source_url,
      fetchStatus: row.fetch_status,
      httpStatus: row.http_status,
      etag: row.etag,
      lastModified: row.last_modified,
      rawBody: unpackRawBody(row.payload_gzip),
      payloadHash: row.payload_hash,
      rawTruncated: Boolean(row.raw_truncated),
      normalized: json(row.normalized_json, {}),
      error: row.error_text,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
    } : null;
  }

  function listCandidateBasics() {
    return db.prepare(`
      SELECT id, title, creator_name, objective_json
      FROM catalog_import_candidates ORDER BY datetime(updated_at) DESC, id DESC
    `).all().map((row) => ({
      id: row.id,
      title: row.title,
      creatorName: row.creator_name,
      objective: json(row.objective_json, {}),
    }));
  }

  function createDiscoverySource(payload = {}) {
    const id = payload.id || randomUUID();
    const intervalMinutes = Math.min(43_200, Math.max(15, Number(payload.intervalMinutes) || 1_440));
    db.prepare(`
      INSERT INTO catalog_discovery_sources (
        id, name, source_type, query_text, config_json, enabled, interval_minutes,
        next_run_at, last_status, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle', '')
    `).run(
      id,
      trimText(payload.name, 160),
      trimText(payload.sourceType, 80),
      trimText(payload.query, 500),
      JSON.stringify(payload.config || {}),
      payload.enabled === false ? 0 : 1,
      intervalMinutes,
      payload.nextRunAt || new Date().toISOString(),
    );
    return getDiscoverySource(id);
  }

  function getDiscoverySource(id) {
    return hydrateDiscoverySource(db.prepare("SELECT * FROM catalog_discovery_sources WHERE id = ?").get(id));
  }

  function listDiscoverySources({ includeDisabled = true } = {}) {
    const rows = db.prepare(`
      SELECT s.*, (
        SELECT COUNT(*) FROM catalog_discovery_items i WHERE i.source_id = s.id
      ) AS item_count
      FROM catalog_discovery_sources s
      ${includeDisabled ? "" : "WHERE s.enabled = 1"}
      ORDER BY s.enabled DESC, datetime(COALESCE(s.next_run_at, s.created_at)), s.name COLLATE NOCASE
    `).all();
    return rows.map((row) => ({ ...hydrateDiscoverySource(row), itemCount: Number(row.item_count) || 0 }));
  }

  function listDueDiscoverySources(limit = 20) {
    return db.prepare(`
      SELECT * FROM catalog_discovery_sources
      WHERE enabled = 1 AND (next_run_at IS NULL OR datetime(next_run_at) <= datetime('now'))
      ORDER BY datetime(COALESCE(next_run_at, created_at)), id
      LIMIT ?
    `).all(Math.max(1, Math.min(100, Number(limit) || 20))).map(hydrateDiscoverySource);
  }

  function updateDiscoverySource(id, updates = {}) {
    const current = getDiscoverySource(id);
    if (!current) return null;
    const next = { ...current, ...updates };
    const intervalMinutes = Math.min(43_200, Math.max(15, Number(next.intervalMinutes) || 1_440));
    db.prepare(`
      UPDATE catalog_discovery_sources SET
        name=?, source_type=?, query_text=?, config_json=?, enabled=?, interval_minutes=?,
        next_run_at=?, last_checked_at=?, last_status=?, last_error=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      trimText(next.name, 160), trimText(next.sourceType, 80), trimText(next.query, 500),
      JSON.stringify(next.config || {}), next.enabled ? 1 : 0, intervalMinutes,
      next.nextRunAt || null, next.lastCheckedAt || null, trimText(next.lastStatus, 80) || "idle",
      trimText(next.lastError, 4_000), id,
    );
    return getDiscoverySource(id);
  }

  function createDiscoveryRun({ sourceId, status = "queued", summary = {} }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO catalog_discovery_runs (id, source_id, status, summary_json, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, sourceId, status, JSON.stringify(summary || {}), status === "processing" ? now : null, status === "completed" ? now : null);
    return getDiscoveryRun(id);
  }

  function getDiscoveryRun(id) {
    const run = hydrateDiscoveryRun(db.prepare("SELECT * FROM catalog_discovery_runs WHERE id = ?").get(id));
    if (!run) return null;
    const jobs = db.prepare("SELECT * FROM catalog_discovery_jobs WHERE run_id = ? ORDER BY created_at, id").all(id).map(hydrateDiscoveryJob);
    return {
      ...run,
      jobs,
      progress: {
        total: jobs.length,
        queued: jobs.filter((job) => ["queued", "retry"].includes(job.status)).length,
        processing: jobs.filter((job) => job.status === "processing").length,
        completed: jobs.filter((job) => job.status === "completed").length,
        failed: jobs.filter((job) => job.status === "failed").length,
      },
    };
  }

  function listDiscoveryRuns({ limit = 20, sourceId = "" } = {}) {
    const rows = db.prepare(`
      SELECT r.*, s.name AS source_name
      FROM catalog_discovery_runs r
      JOIN catalog_discovery_sources s ON s.id = r.source_id
      ${sourceId ? "WHERE r.source_id = ?" : ""}
      ORDER BY datetime(r.created_at) DESC, r.id DESC
      LIMIT ?
    `).all(...(sourceId ? [sourceId] : []), Math.max(1, Math.min(100, Number(limit) || 20)));
    return rows.map((row) => ({ ...hydrateDiscoveryRun(row), sourceName: row.source_name }));
  }

  function updateDiscoveryRun(id, updates = {}) {
    const current = getDiscoveryRun(id);
    if (!current) return null;
    const status = updates.status || current.status;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE catalog_discovery_runs SET status=?, summary_json=?, error_text=?,
        started_at=COALESCE(started_at, ?), completed_at=?
      WHERE id=?
    `).run(
      status,
      JSON.stringify(updates.summary ?? current.summary ?? {}),
      trimText(updates.error ?? current.error, 4_000),
      status === "processing" ? now : null,
      ["completed", "failed"].includes(status) ? now : null,
      id,
    );
    return getDiscoveryRun(id);
  }

  function getDiscoveryItem(sourceId, sourceItemKey) {
    return hydrateDiscoveryItem(db.prepare(`
      SELECT * FROM catalog_discovery_items WHERE source_id = ? AND source_item_key = ?
    `).get(sourceId, trimText(sourceItemKey, 1_000)));
  }

  function upsertDiscoveryItem(entry = {}) {
    const sourceItemKey = trimText(entry.sourceItemKey, 1_000);
    if (!entry.sourceId || !sourceItemKey) return null;
    db.prepare(`
      INSERT INTO catalog_discovery_items (
        source_id, source_item_key, candidate_id, existing_show_id, disposition,
        identity_json, result_json, last_seen_at, last_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(source_id, source_item_key) DO UPDATE SET
        candidate_id=COALESCE(excluded.candidate_id, catalog_discovery_items.candidate_id),
        existing_show_id=CASE WHEN excluded.existing_show_id <> '' THEN excluded.existing_show_id ELSE catalog_discovery_items.existing_show_id END,
        disposition=excluded.disposition,
        identity_json=excluded.identity_json,
        result_json=excluded.result_json,
        last_seen_at=CURRENT_TIMESTAMP,
        last_run_id=excluded.last_run_id
    `).run(
      entry.sourceId, sourceItemKey, entry.candidateId || null, entry.existingShowId || "",
      trimText(entry.disposition, 80) || "new", JSON.stringify(entry.identity || {}),
      JSON.stringify(entry.result || {}), entry.lastRunId || null,
    );
    return getDiscoveryItem(entry.sourceId, sourceItemKey);
  }

  function enqueueDiscoveryJob({ sourceId, runId, payload = {}, maxAttempts = 4 }) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO catalog_discovery_jobs (
        id, source_id, run_id, job_type, status, max_attempts, payload_json, updated_at
      ) VALUES (?, ?, ?, 'discover', 'queued', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source_id, run_id, job_type) DO UPDATE SET
        status=CASE WHEN catalog_discovery_jobs.status = 'processing' THEN 'processing' ELSE 'queued' END,
        attempt_count=CASE WHEN catalog_discovery_jobs.status = 'processing' THEN catalog_discovery_jobs.attempt_count ELSE 0 END,
        payload_json=excluded.payload_json, error_text='', next_attempt_at=NULL,
        completed_at=NULL, updated_at=CURRENT_TIMESTAMP
    `).run(id, sourceId, runId, Math.max(1, Number(maxAttempts) || 4), JSON.stringify(payload || {}));
    return hydrateDiscoveryJob(db.prepare(`
      SELECT * FROM catalog_discovery_jobs WHERE source_id = ? AND run_id = ? AND job_type = 'discover'
    `).get(sourceId, runId));
  }

  const claimNextDiscoveryJob = db.transaction(({ workerId, leaseMs = 120_000 }) => {
    const row = db.prepare(`
      SELECT * FROM catalog_discovery_jobs
      WHERE (status IN ('queued', 'retry') AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now')))
        OR (status = 'processing' AND lease_expires_at IS NOT NULL AND datetime(lease_expires_at) <= datetime('now'))
      ORDER BY datetime(COALESCE(next_attempt_at, created_at)), id
      LIMIT 1
    `).get();
    if (!row) return null;
    const now = new Date();
    db.prepare(`
      UPDATE catalog_discovery_jobs SET status='processing', attempt_count=attempt_count + 1,
        lease_owner=?, lease_expires_at=?, started_at=COALESCE(started_at, ?), updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(workerId, new Date(now.getTime() + leaseMs).toISOString(), now.toISOString(), row.id);
    return hydrateDiscoveryJob(db.prepare("SELECT * FROM catalog_discovery_jobs WHERE id = ?").get(row.id));
  });

  function completeDiscoveryJob(id, result = {}) {
    db.prepare(`
      UPDATE catalog_discovery_jobs SET status='completed', result_json=?, error_text='', lease_owner='',
        lease_expires_at=NULL, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(JSON.stringify(result || {}), new Date().toISOString(), id);
    return hydrateDiscoveryJob(db.prepare("SELECT * FROM catalog_discovery_jobs WHERE id = ?").get(id));
  }

  function failDiscoveryJob(id, error, { retryable = true, retryAfterMs = 0 } = {}) {
    const current = hydrateDiscoveryJob(db.prepare("SELECT * FROM catalog_discovery_jobs WHERE id = ?").get(id));
    if (!current) return null;
    const exhausted = !retryable || current.attemptCount >= current.maxAttempts;
    const delays = [300_000, 1_800_000, 7_200_000, 7_200_000];
    const delay = Math.max(retryAfterMs, delays[Math.max(0, current.attemptCount - 1)] || 7_200_000);
    const nextAttemptAt = exhausted ? null : new Date(Date.now() + delay + Math.floor(Math.random() * 1_000)).toISOString();
    db.prepare(`
      UPDATE catalog_discovery_jobs SET status=?, error_text=?, next_attempt_at=?, lease_owner='',
        lease_expires_at=NULL, completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(exhausted ? "failed" : "retry", trimText(error?.message || error, 4_000), nextAttemptAt, exhausted ? new Date().toISOString() : null, id);
    return hydrateDiscoveryJob(db.prepare("SELECT * FROM catalog_discovery_jobs WHERE id = ?").get(id));
  }

  function compactPublishedSnapshots(olderThanDays = 90) {
    const days = Math.max(1, Number(olderThanDays) || 90);
    return db.prepare(`
      UPDATE catalog_import_sources
      SET payload_gzip = NULL, payload_json = '{"compacted":true}', raw_compacted = 1
      WHERE payload_gzip IS NOT NULL
        AND datetime(fetched_at) < datetime('now', ?)
        AND candidate_id IN (
          SELECT id FROM catalog_import_candidates WHERE status = 'published'
        )
    `).run(`-${days} days`).changes;
  }

  function withTransaction(callback) {
    return db.transaction(callback)();
  }

  return {
    appendCandidateSources,
    appendFieldEvidence,
    bindIdentitiesToShow,
    claimIdentity,
    claimNextDiscoveryJob,
    claimNextJob,
    completeDiscoveryJob,
    completeJob,
    compactPublishedSnapshots,
    createCandidate,
    createDiscoveryRun,
    createDiscoverySource,
    createRun,
    enqueueDiscoveryJob,
    enqueueJob,
    failDiscoveryJob,
    failJob,
    findIdentity,
    getCandidate,
    getDiscoveryItem,
    getDiscoveryRun,
    getDiscoverySource,
    getRun,
    getSourceCache,
    listCandidateBasics,
    listCandidates,
    listCandidateIdsByStatuses,
    listDiscoveryRuns,
    listDiscoverySources,
    listDueDiscoverySources,
    listIdentities,
    putSourceCache,
    recordEvent,
    replaceCandidateSources: appendCandidateSources,
    selectEvidence,
    updateDiscoveryRun,
    updateDiscoverySource,
    updateCandidate,
    updateRun,
    upsertDiscoveryItem,
    withTransaction,
  };
}

module.exports = {
  createImportStore,
};
