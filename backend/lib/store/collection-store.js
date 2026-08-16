const { randomUUID } = require("node:crypto");

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch (_error) {
    return fallback;
  }
}

function stringify(value, fallback) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function normalizeCandidate(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    collectionType: row.collection_type,
    title: row.title,
    description: row.description,
    definition: parseJson(row.definition_json, {}),
    matchingShowIds: parseJson(row.matching_show_ids_json, []),
    evidence: parseJson(row.evidence_json, {}),
    confidence: Number(row.confidence || 0),
    reviewNotes: row.review_notes,
    createdBy: row.created_by,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeMembership(row) {
  if (!row) return null;
  return {
    collectionId: row.collection_id,
    showId: row.show_id,
    state: row.membership_state,
    sourceType: row.source_type,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    reason: parseJson(row.reason_json, {}),
    rank: Number(row.rank || 0),
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
  };
}

function normalizeOverride(row) {
  if (!row) return null;
  return {
    collectionId: row.collection_id,
    showId: row.show_id,
    decision: row.decision,
    reason: row.reason,
    actor: row.actor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    collectionId: row.collection_id,
    candidateId: row.candidate_id,
    showId: row.show_id,
    eventType: row.event_type,
    actor: row.actor,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at,
  };
}

function createCollectionStore({ db }) {
  function createCandidate(input = {}) {
    const id = input.id || randomUUID();
    db.prepare(`
      INSERT INTO collection_candidates (
        id, status, collection_type, title, description, definition_json,
        matching_show_ids_json, evidence_json, confidence, review_notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.status || "proposed",
      input.collectionType || "rule",
      input.title || "Untitled collection",
      input.description || "",
      stringify(input.definition, {}),
      stringify(input.matchingShowIds, []),
      stringify(input.evidence, {}),
      Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0,
      input.reviewNotes || "",
      input.createdBy || "",
    );
    return getCandidate(id);
  }

  function getCandidate(id) {
    return normalizeCandidate(db.prepare("SELECT * FROM collection_candidates WHERE id = ?").get(id));
  }

  function listCandidates({ status = "", page = 1, pageSize = 50 } = {}) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 50));
    const where = status ? "WHERE status = ?" : "";
    const args = status ? [status] : [];
    const total = db.prepare(`SELECT COUNT(*) AS count FROM collection_candidates ${where}`).get(...args).count;
    const rows = db.prepare(`
      SELECT * FROM collection_candidates ${where}
      ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...args, safePageSize, (safePage - 1) * safePageSize);
    return { items: rows.map(normalizeCandidate), total, page: safePage, pageSize: safePageSize };
  }

  function updateCandidate(id, updates = {}) {
    const current = getCandidate(id);
    if (!current) return null;
    const next = { ...current, ...updates };
    db.prepare(`
      UPDATE collection_candidates SET
        status = ?, collection_type = ?, title = ?, description = ?, definition_json = ?,
        matching_show_ids_json = ?, evidence_json = ?, confidence = ?, review_notes = ?,
        created_by = ?, reviewed_by = ?, reviewed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      next.status,
      next.collectionType,
      next.title,
      next.description,
      stringify(next.definition, {}),
      stringify(next.matchingShowIds, []),
      stringify(next.evidence, {}),
      Number(next.confidence || 0),
      next.reviewNotes || "",
      next.createdBy || "",
      next.reviewedBy || "",
      next.reviewedAt || null,
      id,
    );
    return getCandidate(id);
  }

  function listMemberships(collectionId, { includeInactive = true } = {}) {
    const rows = db.prepare(`
      SELECT * FROM collection_memberships
      WHERE collection_id = ? ${includeInactive ? "" : "AND membership_state = 'active'"}
      ORDER BY CASE membership_state WHEN 'active' THEN 0 WHEN 'borderline' THEN 1 ELSE 2 END, rank ASC, show_id ASC
    `).all(collectionId);
    return rows.map(normalizeMembership);
  }

  function replaceMemberships(collectionId, rows = []) {
    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM collection_memberships WHERE collection_id = ?").run(collectionId);
      const insert = db.prepare(`
        INSERT INTO collection_memberships (
          collection_id, show_id, membership_state, source_type, confidence, reason_json, rank, generated_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      rows.forEach((row, index) => {
        insert.run(
          collectionId,
          row.showId,
          row.state || "active",
          row.sourceType || "rule-match",
          row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
          stringify(row.reason, {}),
          Number.isInteger(row.rank) ? row.rank : index,
        );
      });
    });
    transaction();
    return listMemberships(collectionId);
  }

  function listOverrides(collectionId) {
    return db.prepare(`
      SELECT * FROM collection_membership_overrides WHERE collection_id = ? ORDER BY updated_at DESC, show_id ASC
    `).all(collectionId).map(normalizeOverride);
  }

  function setOverride({ collectionId, showId, decision, reason = "", actor = "" }) {
    db.prepare(`
      INSERT INTO collection_membership_overrides (collection_id, show_id, decision, reason, actor)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(collection_id, show_id) DO UPDATE SET
        decision = excluded.decision,
        reason = excluded.reason,
        actor = excluded.actor,
        updated_at = CURRENT_TIMESTAMP
    `).run(collectionId, showId, decision, reason, actor);
    return listOverrides(collectionId).find((entry) => entry.showId === showId) || null;
  }

  function clearOverride({ collectionId, showId }) {
    return db.prepare("DELETE FROM collection_membership_overrides WHERE collection_id = ? AND show_id = ?").run(collectionId, showId).changes > 0;
  }

  function recordEvent({ collectionId = "", candidateId = "", showId = "", eventType, actor = "", payload = {} }) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO collection_events (id, collection_id, candidate_id, show_id, event_type, actor, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, collectionId, candidateId, showId, eventType, actor, stringify(payload, {}));
    return id;
  }

  function listEvents({ collectionId = "", candidateId = "", limit = 100 } = {}) {
    const clauses = [];
    const args = [];
    if (collectionId) {
      clauses.push("collection_id = ?");
      args.push(collectionId);
    }
    if (candidateId) {
      clauses.push("candidate_id = ?");
      args.push(candidateId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return db.prepare(`SELECT * FROM collection_events ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...args, Math.min(250, Math.max(1, Number(limit) || 100)))
      .map(normalizeEvent);
  }

  function createRun({ runType, input = {} }) {
    const id = randomUUID();
    db.prepare("INSERT INTO collection_runs (id, run_type, status, input_json) VALUES (?, ?, 'running', ?)")
      .run(id, runType, stringify(input, {}));
    return id;
  }

  function completeRun(id, { status = "completed", summary = {}, errorText = "" } = {}) {
    db.prepare(`
      UPDATE collection_runs SET status = ?, summary_json = ?, error_text = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, stringify(summary, {}), errorText, id);
    const row = db.prepare("SELECT * FROM collection_runs WHERE id = ?").get(id);
    return row ? {
      id: row.id,
      runType: row.run_type,
      status: row.status,
      input: parseJson(row.input_json, {}),
      summary: parseJson(row.summary_json, {}),
      errorText: row.error_text,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    } : null;
  }

  return {
    clearOverride,
    completeRun,
    createCandidate,
    createRun,
    getCandidate,
    listCandidates,
    listEvents,
    listMemberships,
    listOverrides,
    recordEvent,
    replaceMemberships,
    setOverride,
    updateCandidate,
  };
}

module.exports = {
  createCollectionStore,
};
