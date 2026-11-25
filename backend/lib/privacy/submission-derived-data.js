const { isIP } = require("node:net");

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const SENSITIVE_KEY_PATTERN = /(?:contact|e-?mail|source.?ip|user.?agent|phone|mobile|address)/i;
const PRIVATE_TEXT_KEY_PATTERN = /(?:notes?|message|comment|requestedupdates|provenancenotes)/i;
const SENSITIVE_URL_PARAMETER_PATTERN = /(?:email|contact|token|auth|api[_-]?key|secret|password|signature|access[_-]?token|session|credential)/i;

const CANDIDATE_STORAGE = [
  {
    table: "catalog_import_candidates",
    key: "id",
    candidateWhere: "id",
    columns: [
      "primary_source_url", "objective_json", "ai_suggestions_json", "provenance_json",
      "dedupe_json", "prepared_record_json", "readiness_json", "conflicts_json",
      "source_health_json", "cover_stage_json", "last_error", "review_notes",
    ],
  },
  { table: "catalog_import_events", key: "id", columns: ["actor", "payload_json"] },
  {
    table: "catalog_import_sources",
    key: "id",
    // Provider snapshots contain public metadata. Keep it intact and clean only
    // the URL that was supplied to the fetcher.
    columns: ["source_url"],
  },
  {
    table: "catalog_import_field_evidence",
    key: "id",
    // Evidence values may be public creator metadata, so retain them verbatim.
    columns: ["source_url"],
  },
  {
    table: "catalog_import_jobs",
    key: "id",
    columns: ["payload_json", "result_json", "error_text"],
  },
];

function parseJson(value, fallback = {}) {
  if (typeof value !== "string" || !value) return fallback;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}

function collectEmailAndIpTokens(text, values) {
  const source = String(text || "");
  for (const match of source.matchAll(EMAIL_PATTERN)) values.add(match[0]);
  for (const match of source.matchAll(IPV4_PATTERN)) {
    if (isIP(match[0])) values.add(match[0]);
  }
}

function collectSensitiveJsonValues(value, values, { collectKeyedValues = false } = {}) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSensitiveJsonValues(entry, values, { collectKeyedValues }));
  } else if (typeof value === "string") {
    if (/^https?:\/\//i.test(value.trim())) collectSensitiveUrlValues(value, values);
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      if (collectKeyedValues && (SENSITIVE_KEY_PATTERN.test(key) || PRIVATE_TEXT_KEY_PATTERN.test(key)) && typeof entry === "string" && entry.trim()) {
        values.add(entry.trim());
      }
      if (typeof entry === "string" && /url|link|site|feed/i.test(key)) {
        collectSensitiveUrlValues(entry, values);
      }
      collectSensitiveJsonValues(entry, values, { collectKeyedValues });
    });
  }
}

function collectSensitiveUrlValues(value, values) {
  try {
    const url = new URL(String(value || ""));
    if (url.username) values.add(decodeURIComponent(url.username));
    if (url.password) values.add(decodeURIComponent(url.password));
    for (const [key, entry] of url.searchParams.entries()) {
      if (SENSITIVE_KEY_PATTERN.test(key) || /(?:token|auth|api[_-]?key|secret|password|signature|session|credential)/i.test(key)) {
        if (entry.trim()) values.add(entry.trim());
      }
    }
  } catch (_error) {
    // Invalid links are reviewed in the submission queue; do not guess at their contents.
  }
}

function submissionPrivateValues(submission, { includeContent = true } = {}) {
  const values = new Set();
  [submission?.source_ip, submission?.user_agent, ...(includeContent ? [submission?.contact_email] : [])].forEach((value) => {
    if (typeof value === "string" && value.trim()) values.add(value.trim());
  });
  if (includeContent) {
    const payload = parseJson(submission?.payload_json, {});
    const provenance = parseJson(submission?.provenance_json, {});
    collectSensitiveJsonValues(payload, values, { collectKeyedValues: true });
    collectSensitiveJsonValues(provenance, values, { collectKeyedValues: true });
    [submission?.notes, submission?.review_notes].forEach((value) => {
      if (typeof value === "string" && value.trim()) values.add(value.trim());
    });
    [submission?.notes, submission?.review_notes].forEach((value) => collectEmailAndIpTokens(value, values));
    collectEmailAndIpTokens(submission?.payload_json, values);
    collectEmailAndIpTokens(submission?.provenance_json, values);
  }
  return [...values].filter((value) => value.length >= 4).sort((left, right) => right.length - left.length);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSensitiveText(value, sensitiveValues = []) {
  if (typeof value !== "string" || !value) return value;
  let output = value;
  sensitiveValues.forEach((sensitive) => {
    const token = String(sensitive || "");
    if (token.length < 4) return;
    output = output.replace(new RegExp(escapeRegExp(token), "gi"), "[redacted]");
  });
  return output;
}

function redactSensitiveUrls(value) {
  if (typeof value !== "string" || !value) return value;
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
    const trailing = match.match(/[),.;!?]+$/)?.[0] || "";
    const rawUrl = trailing ? match.slice(0, -trailing.length) : match;
    try {
      const url = new URL(rawUrl);
      let changed = false;
      if (url.username || url.password) {
        url.username = "";
        url.password = "";
        changed = true;
      }
      for (const key of [...url.searchParams.keys()]) {
        if (SENSITIVE_URL_PARAMETER_PATTERN.test(key) && url.searchParams.get(key)) {
          url.searchParams.set(key, "");
          changed = true;
        }
      }
      return `${changed ? url.href : rawUrl}${trailing}`;
    } catch (_error) {
      return match;
    }
  });
}

function redactPrivateText(value, sensitiveValues = []) {
  return redactSensitiveUrls(redactSensitiveText(value, sensitiveValues));
}

function isPrivateOperationalKey(key = "") {
  return /^(?:actor|contact_email|contactEmail|submitter_email|submitterEmail|source_ip|sourceIp|user_agent|userAgent|private_note|privateNote|editorial_note|editorialNote|verificationNotes|archiveFitNote|review_notes|reviewNotes|notes?|message|comment|error|error_text|last_error)$/i.test(String(key));
}

function isUrlKey(key = "") {
  return /(?:url|uri|link|feed|site|source)$/i.test(String(key));
}

function redactPrivateUrl(value, sensitiveValues = []) {
  return redactSensitiveUrls(redactSensitiveText(value, sensitiveValues));
}

// Provider metadata is public evidence. Redact explicitly private fields and
// submitted URL credentials, but keep a matching email as public creator data.
function redactStructuredValue(value, sensitiveValues = [], parentKey = "") {
  if (typeof value === "string") {
    if (isUrlKey(parentKey)) return redactPrivateUrl(value, sensitiveValues);
    if (isPrivateOperationalKey(parentKey)) return redactPrivateText(value, sensitiveValues);
    if (!parentKey) return redactPrivateText(value, sensitiveValues);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => redactStructuredValue(entry, sensitiveValues, parentKey));
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactStructuredValue(entry, sensitiveValues, key)]));
  }
  return value;
}

function redactStoredColumn(column, value, sensitiveValues = []) {
  if (typeof value !== "string" || !value) return value;
  if (column.endsWith("_json")) {
    try {
      return JSON.stringify(redactStructuredValue(JSON.parse(value), sensitiveValues));
    } catch (_error) {
      return redactPrivateText(value, sensitiveValues);
    }
  }
  return isUrlKey(column) ? redactPrivateUrl(value, sensitiveValues) : redactPrivateText(value, sensitiveValues);
}

function sanitizeUserProvidedText(value = "") {
  return String(value || "")
    .replace(EMAIL_PATTERN, "")
    .replace(IPV4_PATTERN, (candidate) => isIP(candidate) ? "" : candidate)
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hasCredentialedSourceUrl(submission = {}) {
  if (submission.requiresManualSourceReview) return true;
  const payload = submission.payload || parseJson(submission.payload_json, {});
  const urls = [
    submission.officialSite,
    submission.official_site,
    submission.rssOrListenLink,
    submission.rss_or_listen_link,
    ...(Array.isArray(payload.listenLinks) ? payload.listenLinks.map((link) => link?.url) : []),
  ].filter((value) => typeof value === "string" && value.trim());
  const sensitiveParameter = /(?:email|contact|token|auth|api[_-]?key|secret|password|signature|access[_-]?token|session|credential)/i;
  const privateUrlTokens = [submission.contactEmail, submission.contact_email, submission.sourceIp, submission.source_ip]
    .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  return urls.some((value) => {
    try {
      const url = new URL(value);
      if (url.username || url.password) return true;
      if ([...url.searchParams.keys()].some((key) => sensitiveParameter.test(key))) return true;
      if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) return true;
      return privateUrlTokens.some((token) => token.length >= 4 && url.href.toLowerCase().includes(token));
    } catch (_error) {
      return false;
    }
  });
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function candidateIdsForSubmission(db, submissionId) {
  const legacy = db.prepare("SELECT import_candidate_id FROM show_submissions WHERE id = ?").get(submissionId);
  const linked = tableExists(db, "submission_candidate_links")
    ? db.prepare("SELECT candidate_id AS id FROM submission_candidate_links WHERE submission_id = ?").all(submissionId).map((row) => row.id)
    : [];
  return [...new Set([
    ...db.prepare(`
      SELECT id FROM catalog_import_candidates
      WHERE primary_source_type = 'submission' AND primary_source_key = ?
    `).all(submissionId).map((row) => row.id),
    ...linked,
    legacy?.import_candidate_id || "",
  ])].filter(Boolean).sort();
}

function privateValuesForCandidate(db, candidateId, fallback = {}, { includeContent = true } = {}) {
  const candidate = db.prepare("SELECT primary_source_type, primary_source_key FROM catalog_import_candidates WHERE id = ?").get(candidateId);
  const submissionIds = new Set();
  if (candidate?.primary_source_type === "submission" && candidate.primary_source_key) submissionIds.add(candidate.primary_source_key);
  if (tableExists(db, "submission_candidate_links")) {
    db.prepare("SELECT submission_id FROM submission_candidate_links WHERE candidate_id = ?").all(candidateId)
      .forEach((row) => submissionIds.add(row.submission_id));
  }
  if (fallback.primarySourceType === "submission" && fallback.primarySourceKey) submissionIds.add(fallback.primarySourceKey);
  const rows = [...submissionIds].map((id) => db.prepare("SELECT contact_email, source_ip, user_agent, notes, review_notes, payload_json, provenance_json FROM show_submissions WHERE id = ?").get(id)).filter(Boolean);
  const tokens = new Set();
  rows.forEach((row) => submissionPrivateValues(row, { includeContent }).forEach((value) => tokens.add(value)));
  return [...tokens].sort((left, right) => right.length - left.length);
}

function sanitizeCandidateValue(db, candidateId, value, fallback = {}) {
  const tokens = privateValuesForCandidate(db, candidateId, fallback);
  return redactStructuredValue(value, tokens);
}

function sanitizeProviderSourceValue(db, candidateId, value) {
  const networkTokens = privateValuesForCandidate(db, candidateId, {}, { includeContent: false });
  return redactStructuredValue(value, networkTokens);
}

function sanitizeSubmissionDerivedValue(db, submissionId, value, { includeContent = true } = {}) {
  const row = db.prepare(`
    SELECT contact_email, source_ip, user_agent, notes, review_notes, payload_json, provenance_json
    FROM show_submissions WHERE id = ?
  `).get(submissionId);
  const tokens = submissionPrivateValues(row, { includeContent });
  return redactStructuredValue(value, tokens);
}

function sanitizeRunInput(db, input = {}) {
  const sourceRows = Array.isArray(input.searchResults) ? input.searchResults : [];
  const sensitiveTokens = new Set();
  sourceRows.filter((row) => row?.sourceType === "submission" && row?.sourceKey).forEach((row) => {
    const submission = db.prepare("SELECT contact_email, source_ip, user_agent, notes, review_notes, payload_json, provenance_json FROM show_submissions WHERE id = ?").get(row.sourceKey);
    submissionPrivateValues(submission).forEach((value) => sensitiveTokens.add(value));
  });
  const candidateIds = Array.isArray(input.candidateIds) ? input.candidateIds : [];
  candidateIds.forEach((candidateId) => privateValuesForCandidate(db, candidateId).forEach((value) => sensitiveTokens.add(value)));
  const tokens = [...sensitiveTokens];
  return redactStructuredValue(input, [...sensitiveTokens]);
}

function sanitizeRunSummary(db, input = {}, summary = {}) {
  return sanitizeRunInput(db, { ...input, summary }).summary;
}

function redactTextFields(row, columns, sensitiveValues) {
  const next = {};
  columns.forEach((column) => {
    const previous = row[column];
    const updated = redactStoredColumn(column, previous, sensitiveValues);
    if (updated !== previous) next[column] = updated;
  });
  return next;
}

function applyRowRedaction(db, { table, key, rows, columns, sensitiveValues, compressed = "", whereColumns = [key] }, { dryRun = true } = {}) {
  const changes = [];
  for (const row of rows) {
    const updates = redactTextFields(row, columns, sensitiveValues);
    const fields = Object.keys(updates);
    if (!fields.length) continue;
    changes.push({ table, rowKey: `${table}:${whereColumns.map((field) => row[field]).join(":")}`, fields });
    if (!dryRun) {
      const setClause = fields.map((field) => `"${field}" = @${field}`).join(", ");
      const whereClause = whereColumns.map((field) => `"${field}" = @where_${field}`).join(" AND ");
      const whereParameters = Object.fromEntries(whereColumns.map((field) => [`where_${field}`, row[field]]));
      db.prepare(`UPDATE "${table}" SET ${setClause} WHERE ${whereClause}`)
        .run({ ...updates, ...whereParameters });
    }
  }
  return changes;
}

function redactDirectSubmissionEvidence(db, candidateId, sensitiveValues, { dryRun = true } = {}) {
  const rows = db.prepare(`
    SELECT id, value_json, normalized_value, source_url
    FROM catalog_import_field_evidence
    WHERE candidate_id = ? AND lower(source_type) = 'submission'
  `).all(candidateId);
  const changes = [];
  for (const row of rows) {
    let value;
    try { value = JSON.parse(row.value_json); } catch (_error) { value = row.value_json; }
    const sanitizedValue = typeof value === "string"
      ? redactPrivateText(value, sensitiveValues)
      : redactStructuredValue(value, sensitiveValues);
    const updates = {
      value_json: JSON.stringify(sanitizedValue),
      normalized_value: redactPrivateText(row.normalized_value, sensitiveValues),
      source_url: redactPrivateUrl(row.source_url, sensitiveValues),
    };
    const changed = Object.keys(updates).filter((key) => updates[key] !== row[key]);
    if (!changed.length) continue;
    changes.push({ table: "catalog_import_field_evidence", rowKey: `catalog_import_field_evidence:${row.id}`, fields: changed });
    if (!dryRun) {
      const setClause = changed.map((key) => `"${key}" = @${key}`).join(", ");
      db.prepare(`UPDATE catalog_import_field_evidence SET ${setClause} WHERE id = @id`)
        .run({ ...updates, id: row.id });
    }
  }
  return changes;
}

function redactProviderMetadata(db, candidateId, networkValues, { dryRun = true } = {}) {
  const changes = [];
  const snapshots = db.prepare(`
    SELECT id, payload_json, normalized_json
    FROM catalog_import_sources WHERE candidate_id = ?
  `).all(candidateId);
  changes.push(...applyRowRedaction(db, {
    table: "catalog_import_sources", key: "id", rows: snapshots,
    columns: ["payload_json", "normalized_json"], sensitiveValues: networkValues,
  }, { dryRun }));

  const sourcePairs = db.prepare(`
    SELECT DISTINCT source_type, source_key FROM catalog_import_sources
    WHERE candidate_id = ? AND source_type <> '' AND source_key <> ''
  `).all(candidateId);
  sourcePairs.forEach(({ source_type: sourceType, source_key: sourceKey }) => {
    const cached = db.prepare(`
      SELECT source_type, source_key, normalized_json, error_text
      FROM catalog_import_source_cache WHERE source_type = ? AND source_key = ?
    `).get(sourceType, sourceKey);
    if (!cached) return;
    changes.push(...applyRowRedaction(db, {
      table: "catalog_import_source_cache", key: "source_key", rows: [cached],
      columns: ["normalized_json", "error_text"], sensitiveValues: networkValues,
      whereColumns: ["source_type", "source_key"],
    }, { dryRun }));
  });
  const discovery = db.prepare(`
    SELECT id, identity_json, result_json FROM catalog_discovery_items WHERE candidate_id = ?
  `).all(candidateId);
  changes.push(...applyRowRedaction(db, {
    table: "catalog_discovery_items", key: "id", rows: discovery,
    columns: ["identity_json", "result_json"], sensitiveValues: networkValues,
  }, { dryRun }));
  return changes;
}

function redactSubmitterIdentityRows(db, candidateId, sensitiveValues, { dryRun = true } = {}) {
  const rows = db.prepare(`
    SELECT identity_type, identity_value FROM catalog_import_identities WHERE candidate_id = ?
  `).all(candidateId);
  const changes = [];
  rows.forEach((row) => {
    if (!/(?:submitter|contact)/i.test(row.identity_type)) return;
    if (!sensitiveValues.some((value) => String(row.identity_value).toLowerCase() === String(value).toLowerCase())) return;
    changes.push({ table: "catalog_import_identities", rowKey: `catalog_import_identities:${row.identity_type}`, fields: ["identity_value"] });
    if (!dryRun) db.prepare("DELETE FROM catalog_import_identities WHERE identity_type = ? AND identity_value = ? AND candidate_id = ?")
      .run(row.identity_type, row.identity_value, candidateId);
  });
  return changes;
}

function collectDerivedRedactionPlan(db, submissionId, { scope = "content" } = {}) {
  const submission = db.prepare(`
    SELECT id, contact_email, source_ip, user_agent, notes, review_notes, payload_json, provenance_json
    FROM show_submissions WHERE id = ?
  `).get(submissionId);
  if (!submission) return { submissionId, candidateIds: [], tokens: [], changes: [], invalidCompressedRows: 0 };
  const sensitiveValues = submissionPrivateValues(submission, { includeContent: scope !== "network" });
  const networkValues = submissionPrivateValues(submission, { includeContent: false });
  const candidateIds = candidateIdsForSubmission(db, submissionId);
  const changes = [];
  const sourcePairsByCandidate = {};

  const allTokens = new Set(sensitiveValues);
  candidateIds.forEach((candidateId) => privateValuesForCandidate(db, candidateId, {}, { includeContent: scope !== "network" })
    .forEach((value) => allTokens.add(value)));
  const derivedValues = [...allTokens].sort((left, right) => right.length - left.length);
  const allNetworkTokens = new Set(networkValues);
  candidateIds.forEach((candidateId) => privateValuesForCandidate(db, candidateId, {}, { includeContent: false })
    .forEach((value) => allNetworkTokens.add(value)));
  const networkTokens = [...allNetworkTokens].sort((left, right) => right.length - left.length);
  for (const candidateId of candidateIds) {
    sourcePairsByCandidate[candidateId] = db.prepare(`
      SELECT DISTINCT source_type, source_key FROM catalog_import_sources
      WHERE candidate_id = ? AND source_type <> '' AND source_key <> ''
    `).all(candidateId);
    for (const descriptor of CANDIDATE_STORAGE) {
      const candidateWhere = descriptor.candidateWhere || "candidate_id";
      const rows = db.prepare(`SELECT "${descriptor.key}", ${descriptor.columns.map((column) => `"${column}"`).join(", ")}${descriptor.compressed ? `, "${descriptor.compressed}"` : ""} FROM "${descriptor.table}" WHERE "${candidateWhere}" = ?`).all(candidateId);
      changes.push(...applyRowRedaction(db, {
        ...descriptor,
        rows,
        sensitiveValues: derivedValues,
      }));
    }
    changes.push(...redactProviderMetadata(db, candidateId, networkTokens));
    changes.push(...redactDirectSubmissionEvidence(db, candidateId, derivedValues));
    changes.push(...redactSubmitterIdentityRows(db, candidateId, derivedValues));

    const runIds = [...new Set([
      ...db.prepare("SELECT run_id AS id FROM catalog_import_jobs WHERE candidate_id = ? AND run_id IS NOT NULL").all(candidateId).map((row) => row.id),
      ...db.prepare("SELECT last_run_id AS id FROM catalog_import_candidates WHERE id = ? AND last_run_id <> ''").all(candidateId).map((row) => row.id),
    ])];
    runIds.forEach((runId) => {
      const run = db.prepare("SELECT id, input_json, summary_json FROM catalog_import_runs WHERE id = ?").get(runId);
      if (!run) return;
      changes.push(...applyRowRedaction(db, {
        table: "catalog_import_runs", key: "id", rows: [run],
        columns: ["input_json", "summary_json"], sensitiveValues: derivedValues,
      }));
    });

    const sourcePairs = db.prepare(`
      SELECT DISTINCT source_type, source_key FROM catalog_import_sources
      WHERE candidate_id = ? AND source_type <> '' AND source_key <> ''
    `).all(candidateId);
    sourcePairs.forEach(({ source_type: sourceType, source_key: sourceKey }) => {
      const cached = db.prepare(`
        SELECT source_type, source_key, source_url, etag, last_modified, normalized_json, error_text,
          payload_gzip, payload_hash
        FROM catalog_import_source_cache WHERE source_type = ? AND source_key = ?
      `).get(sourceType, sourceKey);
      if (!cached) return;
      changes.push(...applyRowRedaction(db, {
        table: "catalog_import_source_cache", key: "source_key", rows: [cached],
        columns: ["source_url"], sensitiveValues: derivedValues, whereColumns: ["source_type", "source_key"],
      }));
    });
  }
  return { submissionId, candidateIds, tokens: derivedValues, sourcePairsByCandidate, changes };
}

function redactSubmissionDerivedData(db, submissionId, { dryRun = true, scope = "content" } = {}) {
  const plan = collectDerivedRedactionPlan(db, submissionId, { scope });
  if (dryRun || plan.candidateIds.length === 0) {
    return { submissionId, candidateIds: plan.candidateIds, changedRows: summarizeChanges(plan.changes), invalidCompressedRows: plan.changes.filter((entry) => entry.invalidCompressedData).length };
  }
  const sensitiveValues = plan.tokens;
  const submission = db.prepare("SELECT source_ip, user_agent FROM show_submissions WHERE id = ?").get(submissionId) || {};
  const networkTokens = submissionPrivateValues(submission, { includeContent: false });
  const candidateIds = plan.candidateIds;
  const actualChanges = [];
  for (const candidateId of candidateIds) {
    for (const descriptor of CANDIDATE_STORAGE) {
      const candidateWhere = descriptor.candidateWhere || "candidate_id";
      const rows = db.prepare(`SELECT "${descriptor.key}", ${descriptor.columns.map((column) => `"${column}"`).join(", ")}${descriptor.compressed ? `, "${descriptor.compressed}"` : ""} FROM "${descriptor.table}" WHERE "${candidateWhere}" = ?`).all(candidateId);
      actualChanges.push(...applyRowRedaction(db, { ...descriptor, rows, sensitiveValues }, { dryRun: false }));
    }
    actualChanges.push(...redactProviderMetadata(db, candidateId, networkTokens, { dryRun: false }));
    actualChanges.push(...redactDirectSubmissionEvidence(db, candidateId, sensitiveValues, { dryRun: false }));
    actualChanges.push(...redactSubmitterIdentityRows(db, candidateId, sensitiveValues, { dryRun: false }));
    const runIds = [...new Set([
      ...db.prepare("SELECT run_id AS id FROM catalog_import_jobs WHERE candidate_id = ? AND run_id IS NOT NULL").all(candidateId).map((row) => row.id),
      ...db.prepare("SELECT last_run_id AS id FROM catalog_import_candidates WHERE id = ? AND last_run_id <> ''").all(candidateId).map((row) => row.id),
    ])];
    runIds.forEach((runId) => {
      const run = db.prepare("SELECT id, input_json, summary_json FROM catalog_import_runs WHERE id = ?").get(runId);
      if (run) actualChanges.push(...applyRowRedaction(db, { table: "catalog_import_runs", key: "id", rows: [run], columns: ["input_json", "summary_json"], sensitiveValues }, { dryRun: false }));
    });
    const sourcePairs = plan.sourcePairsByCandidate[candidateId] || [];
    sourcePairs.forEach(({ source_type: sourceType, source_key: sourceKey }) => {
      const cached = db.prepare("SELECT source_type, source_key, source_url, etag, last_modified, normalized_json, error_text, payload_gzip, payload_hash FROM catalog_import_source_cache WHERE source_type = ? AND source_key = ?").get(sourceType, sourceKey);
      if (!cached) return;
      actualChanges.push(...applyRowRedaction(db, { table: "catalog_import_source_cache", key: "source_key", rows: [cached], columns: ["source_url"], sensitiveValues, whereColumns: ["source_type", "source_key"] }, { dryRun: false }));
    });
  }
  return { submissionId, candidateIds, changedRows: summarizeChanges(actualChanges), invalidCompressedRows: actualChanges.filter((entry) => entry.invalidCompressedData).length };
}

function summarizeChanges(changes = []) {
  const byTable = {};
  const changedFields = {};
  changes.forEach((change) => {
    byTable[change.table] = (byTable[change.table] || 0) + 1;
    changedFields[change.table] = (changedFields[change.table] || 0) + (change.fields?.length || 0);
  });
  return { rowsByTable: byTable, fieldsByTable: changedFields, totalRows: changes.length };
}

function buildSubmissionRedactionPreview(db, { asOf = new Date(), networkRetentionDays, personalRetentionDays } = {}) {
  const now = asOf instanceof Date ? asOf : new Date(asOf);
  if (!Number.isFinite(now.getTime())) throw new Error("A valid as-of timestamp is required.");
  if (!Number.isInteger(networkRetentionDays) || !Number.isInteger(personalRetentionDays)) throw new Error("Both effective retention durations are required.");
  const networkCutoff = new Date(now.getTime() - Math.max(1, networkRetentionDays) * 86_400_000).toISOString();
  const personalCutoff = new Date(now.getTime() - Math.max(1, personalRetentionDays) * 86_400_000).toISOString();
  const submissionColumns = new Set(db.pragma("table_info(show_submissions)").map((column) => column.name));
  const redactedAtColumn = submissionColumns.has("content_redacted_at") ? "content_redacted_at" : "NULL AS content_redacted_at";
  const rows = db.prepare(`
    SELECT id, submission_type, submitted_at, reviewed_at, ${redactedAtColumn},
      contact_email, source_ip, user_agent, notes, review_notes, payload_json, provenance_json
    FROM show_submissions ORDER BY datetime(submitted_at), id
  `).all();
  const items = rows.map((row) => {
    const networkDue = (Boolean(row.source_ip || row.user_agent) && Date.parse(row.submitted_at) <= Date.parse(networkCutoff));
    const contentDue = !row.content_redacted_at && Date.parse(row.reviewed_at || row.submitted_at) <= Date.parse(personalCutoff);
    const empty = { candidateIds: [], changedRows: { rowsByTable: {}, fieldsByTable: {}, totalRows: 0 }, invalidCompressedRows: 0 };
    const existingDerivedPlan = collectDerivedRedactionPlan(db, row.id, { scope: "content" });
    const networkPlan = networkDue ? redactSubmissionDerivedData(db, row.id, { dryRun: true, scope: "network" }) : empty;
    const contentPlan = contentDue ? redactSubmissionDerivedData(db, row.id, { dryRun: true, scope: "content" }) : empty;
    return {
      submissionId: row.id,
      submissionType: row.submission_type,
      submittedAt: row.submitted_at,
      networkDue,
      contentDue,
      linkedCandidateIds: existingDerivedPlan.candidateIds,
      existingDerivedCopies: summarizeChanges(existingDerivedPlan.changes),
      networkDerivedRedactions: networkPlan.changedRows,
      proposedDerivedRedactions: summarizeChanges(existingDerivedPlan.changes),
      unreadableCompressedRows: Math.max(existingDerivedPlan.changes.filter((entry) => entry.invalidCompressedData).length, networkPlan.invalidCompressedRows, contentPlan.invalidCompressedRows),
    };
  });
  const uniqueDerivedChanges = new Set();
  items.forEach((item) => {
    const rawPlan = collectDerivedRedactionPlan(db, item.submissionId, { scope: "content" });
    rawPlan.changes.forEach((change) => uniqueDerivedChanges.add(change.rowKey || `${change.table}:${change.fields?.join(",")}`));
  });
  return {
    version: 1,
    asOf: now.toISOString(),
    effectiveRetentionDays: { network: networkRetentionDays, personalContent: personalRetentionDays },
    readOnly: true,
    counts: {
      submissions: rows.length,
      networkDue: items.filter((item) => item.networkDue).length,
      personalContentDue: items.filter((item) => item.contentDue).length,
      submissionsWithDerivedCopies: items.filter((item) => item.linkedCandidateIds.length > 0).length,
      derivedRowsToRedact: uniqueDerivedChanges.size,
      unreadableCompressedRows: items.reduce((sum, item) => sum + item.unreadableCompressedRows, 0),
    },
    items,
  };
}

module.exports = {
  buildSubmissionRedactionPreview,
  candidateIdsForSubmission,
  hasCredentialedSourceUrl,
  privateValuesForCandidate,
  redactSensitiveText,
  redactSubmissionDerivedData,
  sanitizeCandidateValue,
  sanitizeProviderSourceValue,
  sanitizeSubmissionDerivedValue,
  sanitizeRunInput,
  sanitizeRunSummary,
  sanitizeUserProvidedText,
  submissionPrivateValues,
};
