const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { gunzipSync, gzipSync } = require("node:zlib");

const { openDatabase } = require("../lib/store/database");
const Database = require("better-sqlite3");
const { createImportStore } = require("../lib/store/import-store");
const { createSubmissionStore } = require("../lib/store/submission-store");
const {
  buildSubmissionRedactionPreview,
  hasCredentialedSourceUrl,
} = require("../lib/privacy/submission-derived-data");

function createContext() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-submission-privacy-"));
  const dbPath = path.join(root, "community.sqlite");
  const db = openDatabase(dbPath);
  return { root, dbPath, db, submissions: createSubmissionStore({ db }), imports: createImportStore({ db }) };
}

function closeContext(context) {
  context.db.close();
  fs.rmSync(context.root, { recursive: true, force: true });
}

function createLinkedSubmission(context, { submittedAt = "2025-01-01T00:00:00.000Z" } = {}) {
  const submission = context.submissions.createShowSubmission({
    submissionType: "show",
    showTitle: "The Public Signal",
    creatorName: "Ava Author",
    contactEmail: "submitter@example.test",
    officialSite: "https://public.example/show",
    rssOrListenLink: "https://public.example/feed.xml",
    notes: "Private editorial note from submitter@example.test",
    payload: {
      listenLinks: [{ label: "RSS Feed", url: "https://public.example/feed.xml" }],
      verificationNotes: "Private source note, contact submitter@example.test",
      archiveFitNote: "Keep this private note out of importer records",
    },
    provenance: { sourceLinks: ["https://public.example/feed.xml"] },
    sourceIp: "203.0.113.44",
    userAgent: "EchoPrivateAgent/7.3",
  });
  context.db.prepare("UPDATE show_submissions SET submitted_at = ? WHERE id = ?").run(submittedAt, submission.id);
  const candidate = context.imports.createCandidate({
    title: "The Public Signal",
    creatorName: "Ava Author",
    primarySourceType: "submission",
    primarySourceKey: submission.id,
    primarySourceUrl: "https://public.example/feed.xml",
    objective: {
      title: "The Public Signal",
      creatorName: "Ava Author",
      rssUrl: "https://public.example/feed.xml",
      description: "A public show description.",
    },
    provenance: { submissionId: submission.id },
  });
  assert.equal(context.imports.linkSubmissionToCandidate(submission.id, candidate.id), true);
  return { submission, candidate };
}

function assertNoPrivateValues(value, privateValues) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const privateValue of privateValues) assert.equal(text.includes(privateValue), false, `unexpected private value: ${privateValue}`);
}

test("submission preparation keeps submitter data in submissions and preserves public show metadata", () => {
  const context = createContext();
  const privateValues = [
    "submitter@example.test",
    "203.0.113.44",
    "EchoPrivateAgent/7.3",
    "Private editorial note from submitter@example.test",
    "Private source note, contact submitter@example.test",
    "Keep this private note out of importer records",
  ];
  try {
    const { submission, candidate } = createLinkedSubmission(context);
    const run = context.imports.createRun({
      runType: "seed",
      input: {
        candidateIds: [candidate.id],
        searchResults: [{ sourceType: "submission", sourceKey: submission.id, contactEmail: "submitter@example.test" }],
      },
      summary: { candidateIds: [candidate.id], message: "submitter@example.test" },
    });
    context.imports.enqueueJob({
      candidateId: candidate.id,
      runId: run.id,
      payload: { sourceIp: "203.0.113.44", note: "Private editorial note from submitter@example.test" },
    });
    context.imports.recordEvent(candidate.id, "test-private-event", "submitter@example.test", { userAgent: "EchoPrivateAgent/7.3" });
    context.imports.appendCandidateSources(candidate.id, [{
      sourceType: "rss",
      sourceKey: "public-feed",
      sourceUrl: "https://public.example/feed.xml",
      rawBody: "<rss><description>Public show. submitter@example.test</description></rss>",
      payload: { creatorEmail: "submitter@example.test" },
      normalized: { description: "Public show. submitter@example.test", creatorEmail: "submitter@example.test" },
    }]);
    context.imports.appendFieldEvidence(candidate.id, [{
      fieldName: "description",
      value: "Public show. submitter@example.test",
      sourceType: "rss",
      sourceUrl: "https://public.example/feed.xml",
    }]);
    context.imports.putSourceCache({
      candidateId: candidate.id,
      sourceType: "rss",
      sourceKey: "public-feed",
      sourceUrl: "https://public.example/feed.xml",
      rawBody: "cached body: submitter@example.test",
      normalized: { creatorName: "Ava Author", creatorEmail: "submitter@example.test", note: "203.0.113.44" },
    });

    const importerTables = [
      "catalog_import_candidates", "catalog_import_events", "catalog_import_jobs", "catalog_import_runs",
    ];
    for (const table of importerTables) {
      for (const row of context.db.prepare(`SELECT * FROM ${table}`).all()) assertNoPrivateValues(row, privateValues);
    }
    const storedCandidate = context.imports.getCandidate(candidate.id);
    assert.equal(storedCandidate.title, "The Public Signal");
    assert.equal(storedCandidate.creatorName, "Ava Author");
    assert.equal(storedCandidate.objective.rssUrl, "https://public.example/feed.xml");
    const publicSource = context.imports.getCandidate(candidate.id, { includeRaw: true }).sources[0];
    assert.equal(publicSource.rawBody.includes("submitter@example.test"), true);
    assert.equal(publicSource.normalized.creatorEmail, "submitter@example.test");
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM catalog_import_field_evidence WHERE candidate_id = ? AND value_json LIKE '%submitter@example.test%' AND source_type = 'rss'").get(candidate.id).count, 1);
    const cached = context.imports.getSourceCache("rss", "public-feed");
    assert.equal(cached.rawBody.includes("submitter@example.test"), true);
    assert.equal(cached.normalized.creatorEmail, "submitter@example.test");
  } finally {
    closeContext(context);
  }
});

test("retention dry run is read only and redacts historical importer copies without losing public provenance", () => {
  const context = createContext();
  const privateValues = [
    "submitter@example.test", "203.0.113.44", "EchoPrivateAgent/7.3",
    "private-auth-token-value", "Private editorial note from submitter@example.test",
  ];
  const operationalPrivateValues = [
    "203.0.113.44", "EchoPrivateAgent/7.3", "private-auth-token-value",
    "Private editorial note from submitter@example.test",
  ];
  try {
    const { submission, candidate } = createLinkedSubmission(context, { submittedAt: "2024-01-01T00:00:00.000Z" });
    const run = context.imports.createRun({ runType: "seed", input: { candidateIds: [candidate.id] }, summary: { candidateIds: [candidate.id] } });
    const job = context.imports.enqueueJob({ candidateId: candidate.id, runId: run.id });
    const source = context.imports.appendCandidateSources(candidate.id, [{
      sourceType: "rss", sourceKey: "public-feed", sourceUrl: "https://public.example/feed.xml",
      rawBody: "public snapshot", normalized: { title: "The Public Signal" },
    }])[0];
    context.imports.appendFieldEvidence(candidate.id, [{ fieldName: "contactEmail", value: "initial", sourceType: "submission" }]);
    const evidenceId = context.db.prepare("SELECT id FROM catalog_import_field_evidence WHERE candidate_id = ? AND source_type = 'submission' LIMIT 1").get(candidate.id).id;
    context.imports.putSourceCache({ candidateId: candidate.id, sourceType: "rss", sourceKey: "public-feed", sourceUrl: "https://public.example/feed.xml", rawBody: "public cache" });

    context.db.prepare("UPDATE catalog_import_candidates SET objective_json = ?, provenance_json = ?, last_error = ? WHERE id = ?")
      .run(JSON.stringify({ description: "Public creator contact submitter@example.test", creatorEmail: "submitter@example.test", privateNote: "Private editorial note from submitter@example.test", rssUrl: "https://public.example/feed.xml?token=private-auth-token-value" }), JSON.stringify({ sourceIp: "203.0.113.44", userAgent: "EchoPrivateAgent/7.3" }), "submitter@example.test", candidate.id);
    context.db.prepare("UPDATE catalog_import_sources SET source_url = ?, payload_json = ?, normalized_json = ?, payload_gzip = ?, payload_hash = ? WHERE id = ?")
      .run("https://public.example/feed.xml?token=private-auth-token-value", JSON.stringify({ contactEmail: "submitter@example.test" }), JSON.stringify({ note: "EchoPrivateAgent/7.3" }), gzipSync(Buffer.from("cached submitter@example.test; 203.0.113.44")), "historical-hash", source.snapshotId);
    context.db.prepare("UPDATE catalog_import_field_evidence SET value_json = ?, normalized_value = ?, source_url = ? WHERE id = ?")
      .run(JSON.stringify("submitter@example.test"), "203.0.113.44", "https://public.example/feed.xml?token=private-auth-token-value", evidenceId);
    context.db.prepare("UPDATE catalog_import_jobs SET payload_json = ?, result_json = ?, error_text = ? WHERE id = ?")
      .run(JSON.stringify({ contactEmail: "submitter@example.test" }), JSON.stringify({ note: "Private editorial note from submitter@example.test" }), "EchoPrivateAgent/7.3", job.id);
    context.db.prepare("UPDATE catalog_import_runs SET input_json = ?, summary_json = ? WHERE id = ?")
      .run(JSON.stringify({ sourceIp: "203.0.113.44" }), JSON.stringify({ contactEmail: "submitter@example.test" }), run.id);
    context.db.prepare("INSERT INTO catalog_import_events (id, candidate_id, event_type, actor, payload_json) VALUES (?, ?, ?, ?, ?)")
      .run("historical-private-event", candidate.id, "prepare-failed", "submitter@example.test", JSON.stringify({ sourceUrl: "https://public.example/?token=private-auth-token-value" }));
    context.db.prepare("INSERT INTO catalog_import_identities (identity_type, identity_value, candidate_id) VALUES (?, ?, ?)")
      .run("submitter-email", "submitter@example.test", candidate.id);
    context.db.prepare("UPDATE catalog_import_source_cache SET source_url = ?, normalized_json = ?, payload_gzip = ?, payload_hash = ? WHERE source_type = 'rss' AND source_key = 'public-feed'")
      .run("https://public.example/feed.xml?token=private-auth-token-value", JSON.stringify({ sourceIp: "203.0.113.44", creatorEmail: "submitter@example.test" }), gzipSync(Buffer.from("cache submitter@example.test")), "historical-cache-hash");
    const cache = context.db.prepare("SELECT source_type, source_key FROM catalog_import_source_cache WHERE source_type = 'rss' AND source_key = 'public-feed'").get();
    assert.ok(cache);
    context.db.prepare("INSERT INTO catalog_discovery_sources (id, name, source_type) VALUES ('privacy-test-source', 'Privacy Test', 'podcast-index-search')").run();
    context.db.prepare("INSERT INTO catalog_discovery_runs (id, source_id, status) VALUES ('privacy-test-run', 'privacy-test-source', 'completed')").run();
    context.db.prepare("INSERT INTO catalog_discovery_items (source_id, source_item_key, candidate_id, identity_json, result_json) VALUES (?, ?, ?, ?, ?)")
      .run("privacy-test-source", "public-feed-key", candidate.id, JSON.stringify({ sourceIp: "203.0.113.44" }), JSON.stringify({ creatorEmail: "submitter@example.test" }));

    const preview = buildSubmissionRedactionPreview(context.db, {
      asOf: new Date("2026-11-25T12:00:00.000Z"),
      networkRetentionDays: 30,
      personalRetentionDays: 180,
    });
    const previewText = JSON.stringify(preview);
    assert.equal(preview.readOnly, true);
    assert.equal(preview.counts.personalContentDue, 1);
    assert.ok(preview.counts.derivedRowsToRedact > 0);
    assertNoPrivateValues(previewText, privateValues);

    const beforeHash = crypto.createHash("sha256").update(fs.readFileSync(context.dbPath)).digest("hex");
    const cli = execFileSync(process.execPath, [
      path.join(__dirname, "../scripts/submission-privacy-redaction-dry-run.js"),
      "--db", context.dbPath,
      "--network-retention-days", "30",
      "--personal-retention-days", "180",
      "--as-of", "2026-11-25T12:00:00.000Z",
    ], { encoding: "utf8", env: { ...process.env, NODE_PATH: process.env.NODE_PATH || path.join(__dirname, "../node_modules") } });
    assert.deepEqual(JSON.parse(cli).counts, preview.counts);
    const afterHash = crypto.createHash("sha256").update(fs.readFileSync(context.dbPath)).digest("hex");
    assert.equal(afterHash, beforeHash);

    const result = context.submissions.purgePersonalData({
      now: new Date("2026-11-25T12:00:00.000Z"),
      networkRetentionDays: 30,
      personalRetentionDays: 180,
    });
    assert.ok(result.derivedRedactions.totalRows > 0);
    assert.equal(context.submissions.getShowSubmission(submission.id).resolution_status, "open");
    assert.equal(context.imports.getCandidate(candidate.id).title, "The Public Signal");
    assert.equal(context.imports.getCandidate(candidate.id).creatorName, "Ava Author");
    assert.equal(context.imports.getCandidate(candidate.id).objective.rssUrl, "https://public.example/feed.xml?token=");
    for (const table of [
      "catalog_import_candidates", "catalog_import_events", "catalog_import_jobs", "catalog_import_runs",
    ]) {
      for (const row of context.db.prepare(`SELECT * FROM ${table}`).all()) assertNoPrivateValues(row, operationalPrivateValues);
    }
    assert.equal(context.imports.getCandidate(candidate.id).objective.creatorEmail, "submitter@example.test");
    assert.equal(context.db.prepare("SELECT payload_json FROM catalog_import_sources WHERE id = ?").get(source.snapshotId).payload_json.includes("submitter@example.test"), true);
    assert.equal(context.db.prepare("SELECT normalized_json FROM catalog_import_sources WHERE id = ?").get(source.snapshotId).normalized_json.includes("EchoPrivateAgent/7.3"), false);
    assert.equal(context.db.prepare("SELECT normalized_json FROM catalog_import_source_cache WHERE source_type = 'rss' AND source_key = 'public-feed'").get().normalized_json.includes("submitter@example.test"), true);
    assert.equal(context.db.prepare("SELECT identity_json FROM catalog_discovery_items WHERE candidate_id = ?").get(candidate.id).identity_json.includes("203.0.113.44"), false);
    assert.equal(context.db.prepare("SELECT result_json FROM catalog_discovery_items WHERE candidate_id = ?").get(candidate.id).result_json.includes("submitter@example.test"), true);
    const sourceRaw = gunzipSync(context.db.prepare("SELECT payload_gzip FROM catalog_import_sources WHERE id = ?").get(source.snapshotId).payload_gzip).toString("utf8");
    assert.equal(sourceRaw.includes("submitter@example.test"), true);
    const cacheRaw = gunzipSync(context.db.prepare("SELECT payload_gzip FROM catalog_import_source_cache WHERE source_type = 'rss' AND source_key = 'public-feed'").get().payload_gzip).toString("utf8");
    assert.equal(cacheRaw.includes("submitter@example.test"), true);
    assert.equal(context.db.prepare("SELECT value_json FROM catalog_import_field_evidence WHERE id = ?").get(evidenceId).value_json.includes("submitter@example.test"), false);
    assert.equal(context.db.prepare("SELECT COUNT(*) AS count FROM catalog_import_identities WHERE identity_value = 'submitter@example.test'").get().count, 0);
    assert.equal(context.db.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(context.db.pragma("foreign_key_check"), []);
  } finally {
    closeContext(context);
  }
});

test("URLs containing credentials or private query values require human review", () => {
  assert.equal(hasCredentialedSourceUrl({ rssOrListenLink: "https://user:pass@feeds.example/show.xml" }), true);
  assert.equal(hasCredentialedSourceUrl({ officialSite: "https://site.example/feed?access_token=abc123" }), true);
  assert.equal(hasCredentialedSourceUrl({ payload: { listenLinks: [{ url: "https://site.example/feed?email=submitter@example.test" }] } }), true);
  assert.equal(hasCredentialedSourceUrl({ rssOrListenLink: "https://feeds.example/show.xml" }), false);
});

test("manifest-guarded apply rejects stale review and is idempotent on an isolated database", () => {
  const context = createContext();
  const { candidate } = createLinkedSubmission(context);
  const tool = path.join(__dirname, "../scripts/submission-privacy-redaction-dry-run.js");
  const fixedArgs = [
    "--db", context.dbPath,
    "--network-retention-days", "30",
    "--personal-retention-days", "180",
    "--as-of", "2026-11-25T12:00:00.000Z",
  ];
  try {
    context.db.prepare("UPDATE catalog_import_candidates SET review_notes = ? WHERE id = ?")
      .run("submitter@example.test", candidate.id);
    const first = JSON.parse(execFileSync(process.execPath, [tool, ...fixedArgs], { encoding: "utf8" }));
    assert.equal(first.mode, "read-only-dry-run");
    assert.equal(first.writesPerformed, false);

    context.db.prepare("UPDATE catalog_import_candidates SET last_error = ? WHERE id = ?")
      .run("203.0.113.44", candidate.id);
    const beforeRejectedApply = context.db.prepare("SELECT review_notes,last_error FROM catalog_import_candidates WHERE id = ?").get(candidate.id);
    const rejected = spawnSync(process.execPath, [tool, ...fixedArgs, "--apply", "--expected-manifest-sha256", first.manifestSha256], {
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: process.env.NODE_PATH || path.join(__dirname, "../node_modules") },
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /no changes were applied/i);
    assert.deepEqual(context.db.prepare("SELECT review_notes,last_error FROM catalog_import_candidates WHERE id = ?").get(candidate.id), beforeRejectedApply);

    const reviewed = JSON.parse(execFileSync(process.execPath, [tool, ...fixedArgs], { encoding: "utf8" }));
    const dbPath = context.dbPath;
    const root = context.root;
    context.db.close();
    const applied = JSON.parse(execFileSync(process.execPath, [tool, ...fixedArgs, "--apply", "--expected-manifest-sha256", reviewed.manifestSha256], {
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: process.env.NODE_PATH || path.join(__dirname, "../node_modules") },
    }));
    assert.equal(applied.writesPerformed, true);
    assert.ok(applied.changedRows.totalRows > 0);
    assert.equal(applied.afterCounts.derivedRowsToRedact, 0);
    const check = new Database(dbPath, { readonly: true, fileMustExist: true });
    check.pragma("query_only=ON");
    const candidateRow = check.prepare("SELECT review_notes,last_error FROM catalog_import_candidates WHERE id = ?").get(candidate.id);
    assertNoPrivateValues(candidateRow, ["submitter@example.test", "203.0.113.44"]);
    check.close();

    const clean = JSON.parse(execFileSync(process.execPath, [tool, ...fixedArgs], {
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: process.env.NODE_PATH || path.join(__dirname, "../node_modules") },
    }));
    assert.equal(clean.counts.derivedRowsToRedact, 0);
    fs.rmSync(root, { recursive: true, force: true });
  } catch (error) {
    try { context.db.close(); } catch (_closeError) {}
    fs.rmSync(context.root, { recursive: true, force: true });
    throw error;
  }
});
