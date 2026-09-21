const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Database = require("better-sqlite3");
const { openDatabase } = require("../lib/store/database");
const { createAnalyticsStore } = require("../lib/store/analytics-store");
const { createCommunityStore } = require("../lib/store/community-store");
const { createImportStore } = require("../lib/store/import-store");
const { createSubmissionStore } = require("../lib/store/submission-store");

const ROOT = path.resolve(__dirname, "../..");
const BACKUP_SCRIPT = path.join(ROOT, "tools", "backup-database.js");
const BACKUP_CHECK_SCRIPT = path.join(ROOT, "tools", "check-database-backup.js");
const RESET_MIGRATION = "community-device-voting-reset-2026-06-21";
const STATUS_MIGRATION = "catalog-import-v2-statuses-2026-07-14";
const FTS_MIGRATION = "catalog-import-v2-fts-backfill-2026-07-14";
const ANALYTICS_MIGRATION = "first-party-analytics-2026-09-15";

const REQUIRED_TABLES = [
  "app_migrations",
  "podcasts",
  "community_profiles",
  "rating_submissions",
  "rating_events",
  "community_abuse_events",
  "show_submissions",
  "published_listener_reviews",
  "listener_review_helpful_votes",
  "catalog_import_candidates",
  "catalog_import_sources",
  "catalog_import_events",
  "catalog_import_runs",
  "catalog_import_identities",
  "catalog_import_field_evidence",
  "catalog_import_jobs",
  "catalog_import_source_cache",
  "catalog_discovery_sources",
  "catalog_discovery_runs",
  "catalog_discovery_items",
  "catalog_discovery_jobs",
  "collection_candidates",
  "collection_memberships",
  "collection_membership_overrides",
  "collection_events",
  "collection_runs",
  "rate_limit_events",
  "analytics_meta",
  "analytics_events",
  "analytics_visitors",
  "catalog_import_candidates_fts",
];

const REQUIRED_INDEXES = [
  "idx_analytics_events_dedupe",
  "idx_analytics_events_time_name",
  "idx_analytics_events_show_time",
  "idx_analytics_events_path_time",
  "idx_analytics_visitors_last_seen",
  "idx_community_profiles_voter_hash",
  "idx_rating_submissions_podcast",
  "idx_rating_submissions_profile",
  "idx_rating_events_podcast",
  "idx_show_submissions_status",
  "idx_catalog_import_candidates_status",
  "idx_catalog_import_candidates_scope",
  "idx_catalog_import_candidates_source",
  "idx_catalog_import_sources_candidate",
  "idx_catalog_import_jobs_claim",
  "idx_catalog_discovery_sources_due",
  "idx_catalog_discovery_jobs_claim",
  "idx_collection_memberships_collection",
  "idx_collection_memberships_show",
];

const REQUIRED_FTS_TRIGGERS = [
  "catalog_import_candidates_fts_insert",
  "catalog_import_candidates_fts_delete",
  "catalog_import_candidates_fts_update",
];

// Snapshot of the real 9f17ec21 state: device voting exists, but import-v2,
// discovery, collections, listener reviews, analytics, and FTS do not yet.
const LEGACY_PRE_IMPORT_V2_SCHEMA = `
  CREATE TABLE app_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE podcasts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    href TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    has_page INTEGER NOT NULL DEFAULT 0,
    staff_rating REAL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE community_profiles (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'anonymous',
    voter_hash TEXT,
    display_name TEXT,
    last_user_agent TEXT,
    last_abuse_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE rating_submissions (
    id TEXT PRIMARY KEY,
    podcast_id TEXT NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
    source TEXT NOT NULL DEFAULT 'web',
    verified_at TEXT,
    abuse_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (podcast_id, profile_id)
  );

  CREATE TABLE rating_events (
    id TEXT PRIMARY KEY,
    submission_id TEXT REFERENCES rating_submissions(id) ON DELETE SET NULL,
    podcast_id TEXT NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
    previous_rating INTEGER,
    next_rating INTEGER NOT NULL CHECK (next_rating BETWEEN 1 AND 10),
    event_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'web',
    abuse_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE community_abuse_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    abuse_hash TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  );

  CREATE TABLE show_submissions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'new',
    priority TEXT NOT NULL DEFAULT 'normal',
    submission_type TEXT NOT NULL DEFAULT 'show',
    existing_show_id TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    show_title TEXT NOT NULL,
    creator_name TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL,
    official_site TEXT NOT NULL DEFAULT '',
    rss_or_listen_link TEXT NOT NULL DEFAULT '',
    genres TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    provenance_json TEXT NOT NULL DEFAULT '{}',
    review_notes TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    source_ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE catalog_import_candidates (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'discovered',
    scope_status TEXT NOT NULL DEFAULT 'in-scope',
    has_duplicate_match INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    creator_name TEXT NOT NULL DEFAULT '',
    canonical_id TEXT NOT NULL DEFAULT '',
    primary_source_type TEXT NOT NULL DEFAULT '',
    primary_source_key TEXT NOT NULL DEFAULT '',
    primary_source_url TEXT NOT NULL DEFAULT '',
    seed_query TEXT NOT NULL DEFAULT '',
    objective_json TEXT NOT NULL DEFAULT '{}',
    ai_suggestions_json TEXT NOT NULL DEFAULT '{}',
    provenance_json TEXT NOT NULL DEFAULT '{}',
    dedupe_json TEXT NOT NULL DEFAULT '{}',
    review_notes TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    drafted_show_id TEXT NOT NULL DEFAULT '',
    published_show_id TEXT NOT NULL DEFAULT '',
    duplicate_of_show_id TEXT NOT NULL DEFAULT '',
    duplicate_of_candidate_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE catalog_import_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id TEXT NOT NULL REFERENCES catalog_import_candidates(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_key TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    fetch_status TEXT NOT NULL DEFAULT 'fetched',
    payload_json TEXT NOT NULL DEFAULT '{}',
    normalized_json TEXT NOT NULL DEFAULT '{}',
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE catalog_import_events (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES catalog_import_candidates(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE catalog_import_runs (
    id TEXT PRIMARY KEY,
    run_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    input_json TEXT NOT NULL DEFAULT '{}',
    summary_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE rate_limit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    client_ip TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  );

  CREATE INDEX idx_rating_submissions_podcast ON rating_submissions (podcast_id);
  CREATE INDEX idx_rating_submissions_profile ON rating_submissions (profile_id);
  CREATE INDEX idx_rating_events_podcast ON rating_events (podcast_id, created_at DESC);
  CREATE INDEX idx_community_abuse_hash_created ON community_abuse_events (abuse_hash, created_at_ms);
  CREATE INDEX idx_show_submissions_status ON show_submissions (status, submitted_at DESC);
  CREATE INDEX idx_catalog_import_candidates_status ON catalog_import_candidates (status, updated_at DESC);
  CREATE INDEX idx_catalog_import_candidates_scope ON catalog_import_candidates (scope_status, updated_at DESC);
  CREATE INDEX idx_catalog_import_candidates_source ON catalog_import_candidates (primary_source_type, updated_at DESC);
  CREATE INDEX idx_catalog_import_sources_candidate ON catalog_import_sources (candidate_id, fetched_at DESC);
  CREATE INDEX idx_catalog_import_events_candidate ON catalog_import_events (candidate_id, created_at DESC);
  CREATE INDEX idx_rate_limit_scope_ip_created ON rate_limit_events (scope, client_ip, created_at_ms);
`;

// Snapshot of the real 2361301b state immediately before 3a2ad9cb introduced
// device-scoped voting and its intentional one-time legacy-rating reset.
const LEGACY_PRE_DEVICE_SCHEMA = `
  CREATE TABLE podcasts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    href TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    has_page INTEGER NOT NULL DEFAULT 0,
    staff_rating REAL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE community_profiles (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'anonymous',
    display_name TEXT,
    last_user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE rating_submissions (
    id TEXT PRIMARY KEY,
    podcast_id TEXT NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
    source TEXT NOT NULL DEFAULT 'web',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (podcast_id, profile_id)
  );

  CREATE TABLE rating_events (
    id TEXT PRIMARY KEY,
    submission_id TEXT REFERENCES rating_submissions(id) ON DELETE SET NULL,
    podcast_id TEXT NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
    previous_rating INTEGER,
    next_rating INTEGER NOT NULL CHECK (next_rating BETWEEN 1 AND 10),
    event_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'web',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE show_submissions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'new',
    submission_type TEXT NOT NULL DEFAULT 'show',
    existing_show_id TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    show_title TEXT NOT NULL,
    creator_name TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL,
    official_site TEXT NOT NULL DEFAULT '',
    rss_or_listen_link TEXT NOT NULL DEFAULT '',
    genres TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    provenance_json TEXT NOT NULL DEFAULT '{}',
    review_notes TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    source_ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE rate_limit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    client_ip TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL
  );

  CREATE INDEX idx_rating_submissions_podcast ON rating_submissions (podcast_id);
  CREATE INDEX idx_rating_submissions_profile ON rating_submissions (profile_id);
  CREATE INDEX idx_rating_events_podcast ON rating_events (podcast_id, created_at DESC);
  CREATE INDEX idx_show_submissions_status ON show_submissions (status, submitted_at DESC);
`;

function createTempRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `echo-archives-db-contract-${label}-`));
}

function cleanupRoot(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function assertDatabaseIntegrity(db) {
  const integrity = db.pragma("integrity_check");
  assert.equal(integrity.length, 1);
  assert.equal(String(integrity[0].integrity_check).toLowerCase(), "ok");
  assert.deepEqual(db.pragma("foreign_key_check"), []);
}

function sqliteNames(db, type) {
  return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = ?").pluck().all(type));
}

function columnNames(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
}

function assertCurrentSchema(db) {
  assert.equal(String(db.pragma("journal_mode", { simple: true })).toLowerCase(), "wal");
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);

  const tables = sqliteNames(db, "table");
  for (const table of REQUIRED_TABLES) assert.ok(tables.has(table), `missing table ${table}`);

  for (const [table, columns] of Object.entries({
    show_submissions: ["priority", "submission_type", "payload_json", "reviewed_at"],
    community_profiles: ["voter_hash", "last_abuse_hash"],
    rating_submissions: ["verified_at", "abuse_hash"],
    rating_events: ["abuse_hash"],
    catalog_import_candidates: [
      "mode", "existing_show_id", "prepared_record_json", "readiness_json", "conflicts_json",
      "source_health_json", "locked_fields_json", "cover_stage_json", "pipeline_version",
      "input_revision", "last_run_id", "last_error", "facts_reviewed_by", "facts_reviewed_at",
      "facts_reviewed_revision", "discovery_source_id", "discovery_run_id",
    ],
    catalog_import_sources: ["http_status", "etag", "last_modified", "payload_hash", "payload_gzip", "raw_truncated", "raw_compacted"],
    catalog_import_runs: ["updated_at", "started_at", "completed_at"],
    published_listener_reviews: ["voice_acting_score", "sound_design_score", "story_score", "characters_score", "ads_score", "length_score"],
  })) {
    const actual = columnNames(db, table);
    for (const column of columns) assert.ok(actual.has(column), `missing ${table}.${column}`);
  }

  const indexes = sqliteNames(db, "index");
  for (const index of REQUIRED_INDEXES) assert.ok(indexes.has(index), `missing index ${index}`);
  const triggers = sqliteNames(db, "trigger");
  for (const trigger of REQUIRED_FTS_TRIGGERS) assert.ok(triggers.has(trigger), `missing trigger ${trigger}`);
  assertDatabaseIntegrity(db);
}

function searchCandidateIds(db, query) {
  return db.prepare(`
    SELECT c.id
    FROM catalog_import_candidates AS c
    WHERE c.rowid IN (
      SELECT rowid
      FROM catalog_import_candidates_fts
      WHERE catalog_import_candidates_fts MATCH ?
    )
    ORDER BY c.id
  `).pluck().all(query);
}

function seedLegacyPreImportV2(dbPath, { incompatibleFts = false } = {}) {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(LEGACY_PRE_IMPORT_V2_SCHEMA);
  db.prepare("INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)").run(
    RESET_MIGRATION,
    "2026-06-21T20:00:00.000Z",
  );
  db.prepare(`
    INSERT INTO podcasts (id, title, href, has_page, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `).run(
    "legacy-signal",
    "Legacy Signal",
    "/shows/legacy-signal",
    JSON.stringify({ source: "historical-fixture" }),
    "2026-06-30T09:00:00.000Z",
    "2026-06-30T09:05:00.000Z",
  );
  db.prepare(`
    INSERT INTO community_profiles (id, kind, voter_hash, display_name, last_user_agent, last_abuse_hash, created_at, updated_at, last_seen_at)
    VALUES (?, 'device', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "legacy-profile",
    "legacy-voter-hash",
    "Legacy Listener",
    "legacy-agent",
    "legacy-abuse-hash",
    "2026-06-30T09:01:00.000Z",
    "2026-06-30T09:02:00.000Z",
    "2026-06-30T09:03:00.000Z",
  );
  db.prepare(`
    INSERT INTO rating_submissions (id, podcast_id, profile_id, rating, source, verified_at, abuse_hash, created_at, updated_at)
    VALUES (?, ?, ?, 8, 'legacy-import', ?, ?, ?, ?)
  `).run(
    "legacy-rating",
    "legacy-signal",
    "legacy-profile",
    "2026-06-30T09:04:00.000Z",
    "legacy-abuse-hash",
    "2026-06-30T09:04:00.000Z",
    "2026-06-30T09:05:00.000Z",
  );
  db.prepare(`
    INSERT INTO rating_events (id, submission_id, podcast_id, profile_id, previous_rating, next_rating, event_type, source, abuse_hash, created_at)
    VALUES (?, ?, ?, ?, NULL, 8, 'created', 'legacy-import', ?, ?)
  `).run(
    "legacy-rating-event",
    "legacy-rating",
    "legacy-signal",
    "legacy-profile",
    "legacy-abuse-hash",
    "2026-06-30T09:04:00.000Z",
  );
  db.prepare(`
    INSERT INTO show_submissions (id, status, show_title, creator_name, contact_email, notes, payload_json, provenance_json, submitted_at)
    VALUES (?, 'accepted', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "legacy-submission",
    "Legacy Signal",
    "Historical Creator",
    "legacy@example.test",
    "Preserve this moderation record.",
    JSON.stringify({ source: "legacy" }),
    JSON.stringify({ importedAt: "2026-06-30" }),
    "2026-06-30T09:06:00.000Z",
  );
  db.prepare(`
    INSERT INTO catalog_import_candidates (
      id, status, title, creator_name, primary_source_type, primary_source_key,
      primary_source_url, seed_query, objective_json, provenance_json, review_notes,
      created_at, updated_at
    ) VALUES (?, 'discovered', ?, ?, 'rss', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "legacy-candidate",
    "Legacy Signal Import Candidate",
    "Historical Creator",
    "legacy-feed",
    "https://example.test/legacy.xml",
    "legacy signal",
    JSON.stringify({ feedTitle: "Legacy Signal" }),
    JSON.stringify({ source: "rss" }),
    "Keep the historical candidate.",
    "2026-06-30T09:07:00.000Z",
    "2026-06-30T09:08:00.000Z",
  );
  db.prepare(`
    INSERT INTO catalog_import_sources (candidate_id, source_type, source_key, source_url, payload_json, normalized_json, fetched_at)
    VALUES (?, 'rss', 'legacy-feed', ?, ?, ?, ?)
  `).run(
    "legacy-candidate",
    "https://example.test/legacy.xml",
    JSON.stringify({ title: "Legacy Signal" }),
    JSON.stringify({ title: "Legacy Signal" }),
    "2026-06-30T09:08:00.000Z",
  );
  db.prepare(`
    INSERT INTO catalog_import_events (id, candidate_id, event_type, actor, payload_json, created_at)
    VALUES (?, ?, 'seeded', 'fixture', ?, ?)
  `).run(
    "legacy-candidate-event",
    "legacy-candidate",
    JSON.stringify({ historical: true }),
    "2026-06-30T09:08:00.000Z",
  );
  db.prepare(`
    INSERT INTO catalog_import_runs (id, run_type, status, input_json, summary_json, created_at)
    VALUES (?, 'seed', 'completed', ?, ?, ?)
  `).run(
    "legacy-run",
    JSON.stringify({ source: "fixture" }),
    JSON.stringify({ candidates: 1 }),
    "2026-06-30T09:08:00.000Z",
  );
  if (incompatibleFts) {
    db.exec(`
      CREATE TABLE catalog_import_candidates_fts (
        title TEXT,
        creator_name TEXT,
        seed_query TEXT,
        review_notes TEXT
      );
    `);
  }
  db.close();
}

function seedLegacyPreDevice(dbPath) {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(LEGACY_PRE_DEVICE_SCHEMA);
  db.prepare(`
    INSERT INTO podcasts (id, title, href, has_page, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(
    "pre-device-show",
    "Pre-device Show",
    "/shows/pre-device-show",
    "2026-06-17T10:00:00.000Z",
    "2026-06-17T10:05:00.000Z",
  );
  db.prepare(`
    INSERT INTO community_profiles (id, kind, display_name, last_user_agent, created_at, updated_at, last_seen_at)
    VALUES (?, 'anonymous', ?, ?, ?, ?, ?)
  `).run(
    "pre-device-profile",
    "Older Listener",
    "old-agent",
    "2026-06-17T10:01:00.000Z",
    "2026-06-17T10:02:00.000Z",
    "2026-06-17T10:03:00.000Z",
  );
  db.prepare(`
    INSERT INTO rating_submissions (id, podcast_id, profile_id, rating, source, created_at, updated_at)
    VALUES (?, ?, ?, 7, 'legacy', ?, ?)
  `).run(
    "pre-device-rating",
    "pre-device-show",
    "pre-device-profile",
    "2026-06-17T10:04:00.000Z",
    "2026-06-17T10:05:00.000Z",
  );
  db.prepare(`
    INSERT INTO rating_events (id, submission_id, podcast_id, profile_id, previous_rating, next_rating, event_type, source, created_at)
    VALUES (?, ?, ?, ?, NULL, 7, 'created', 'legacy', ?)
  `).run(
    "pre-device-event",
    "pre-device-rating",
    "pre-device-show",
    "pre-device-profile",
    "2026-06-17T10:04:00.000Z",
  );
  db.prepare(`
    INSERT INTO show_submissions (id, status, show_title, creator_name, contact_email, notes, submitted_at)
    VALUES (?, 'accepted', ?, ?, ?, ?, ?)
  `).run(
    "pre-device-submission",
    "Pre-device Show",
    "Older Creator",
    "older@example.test",
    "Non-rating data should survive the device-voting migration.",
    "2026-06-17T10:06:00.000Z",
  );
  db.close();
}

function assertMigrationMarkers(db, expected) {
  const markers = new Set(db.prepare("SELECT id FROM app_migrations").pluck().all());
  for (const marker of expected) assert.ok(markers.has(marker), `missing migration marker ${marker}`);
}

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env },
  });
}

function seedCurrentApplicationData(db) {
  const catalog = [{
    id: "restore-show",
    title: "Restore Show",
    href: "/shows/restore-show",
    image: "",
    hasPage: true,
    finalRating: 9,
    tags: ["science fiction"],
    summary: "A restore contract fixture.",
    bestFor: ["Recovery testing"],
    similarTo: [],
  }];
  const communityStore = createCommunityStore({ db, catalog, minPublicRatings: 1 });
  const profileId = communityStore.ensureDeviceProfile({
    voterHash: "restore-voter-hash",
    userAgent: "restore-test-agent",
    abuseHash: "restore-abuse-hash",
  });
  communityStore.upsertRating({
    podcastId: "restore-show",
    profileId,
    rating: 9,
    source: "restore-test",
    abuseHash: "restore-abuse-hash",
  });

  const submissionStore = createSubmissionStore({ db });
  const submission = submissionStore.createShowSubmission({
    showTitle: "Restore Submission",
    creatorName: "Restore Creator",
    contactEmail: "restore@example.test",
    officialSite: "https://example.test/restore",
    notes: "Representative persisted submission.",
    payload: { fixture: true },
    provenance: { source: "recovery-test" },
    sourceIp: "198.51.100.20",
    userAgent: "restore-test-agent",
  });

  const importStore = createImportStore({ db });
  const candidate = importStore.createCandidate({
    id: "restore-candidate",
    title: "Restore Candidate",
    creatorName: "Restore Creator",
    primarySourceType: "rss",
    primarySourceKey: "restore-feed",
    primarySourceUrl: "https://example.test/restore.xml",
    seedQuery: "restore candidate",
  });
  const analyticsStore = createAnalyticsStore({
    db,
    secret: "restore-test-analytics-secret-1234567890",
    validateClientEvent: () => ({}),
  });
  const analyticsResult = analyticsStore.recordServerInteraction({
    eventName: "Rating Submitted",
    eventId: "restore-analytics-event-123456789",
    occurredAt: new Date("2026-09-21T08:00:00.000Z"),
    visitorId: "restore-visitor-123456789",
    sessionId: "restore-session-123456789",
    pagePath: "/shows/restore-show",
    properties: { show_id: "restore-show" },
    userAgent: "restore-test-agent",
  });

  return { catalog, profileId, submission, candidate, analyticsResult };
}

test("historical pre-import-v2 schema migrates, preserves records, and rebuilds current structures", () => {
  const root = createTempRoot("legacy-import-v2");
  const dbPath = path.join(root, "community.sqlite");
  seedLegacyPreImportV2(dbPath);
  let db;

  try {
    db = openDatabase(dbPath);
    assertCurrentSchema(db);
    assertMigrationMarkers(db, [RESET_MIGRATION, STATUS_MIGRATION, FTS_MIGRATION, ANALYTICS_MIGRATION]);

    assert.deepEqual(db.prepare(`
      SELECT id, title, created_at, updated_at, metadata_json
      FROM podcasts WHERE id = ?
    `).get("legacy-signal"), {
      id: "legacy-signal",
      title: "Legacy Signal",
      created_at: "2026-06-30T09:00:00.000Z",
      updated_at: "2026-06-30T09:05:00.000Z",
      metadata_json: JSON.stringify({ source: "historical-fixture" }),
    });
    assert.deepEqual(db.prepare(`
      SELECT id, rating, created_at, updated_at
      FROM rating_submissions WHERE id = ?
    `).get("legacy-rating"), {
      id: "legacy-rating",
      rating: 8,
      created_at: "2026-06-30T09:04:00.000Z",
      updated_at: "2026-06-30T09:05:00.000Z",
    });
    assert.equal(db.prepare("SELECT status FROM catalog_import_candidates WHERE id = ?").get("legacy-candidate").status, "queued");
    assert.equal(db.prepare("SELECT notes FROM show_submissions WHERE id = ?").get("legacy-submission").notes, "Preserve this moderation record.");

    assert.deepEqual(db.prepare(`
      SELECT mode, pipeline_version, input_revision
      FROM catalog_import_candidates WHERE id = ?
    `).get("legacy-candidate"), {
      mode: "create",
      pipeline_version: "2",
      input_revision: 1,
    });
    assert.equal(db.prepare("SELECT raw_compacted FROM catalog_import_sources WHERE candidate_id = ?").get("legacy-candidate").raw_compacted, 0);
    assert.deepEqual(searchCandidateIds(db, "Legacy Signal"), ["legacy-candidate"]);

    assert.throws(
      () => db.prepare(`
        INSERT INTO rating_submissions (id, podcast_id, profile_id, rating)
        VALUES ('bad-rating', 'legacy-signal', 'legacy-profile', 11)
      `).run(),
      /constraint/i,
    );
    assert.throws(
      () => db.prepare(`
        INSERT INTO rating_submissions (id, podcast_id, profile_id, rating)
        VALUES ('duplicate-rating', 'legacy-signal', 'legacy-profile', 6)
      `).run(),
      /constraint/i,
    );
    assert.throws(
      () => db.prepare(`
        INSERT INTO rating_events (id, podcast_id, profile_id, next_rating, event_type)
        VALUES ('bad-event', 'missing-show', 'legacy-profile', 5, 'created')
      `).run(),
      /constraint/i,
    );

    const communityStore = createCommunityStore({
      db,
      catalog: [{ id: "legacy-signal", title: "Legacy Signal", href: "/shows/legacy-signal", image: "", hasPage: true, finalRating: null }],
      minPublicRatings: 1,
    });
    assert.equal(communityStore.listRatingSummaries(["legacy-signal"], "legacy-profile")["legacy-signal"].averageRating, 8);

    const importStore = createImportStore({ db });
    importStore.createCandidate({ id: "post-migration-candidate", title: "Post Migration Signal", creatorName: "Current Creator" });
    assert.deepEqual(searchCandidateIds(db, "Post Migration Signal"), ["post-migration-candidate"]);
    assertDatabaseIntegrity(db);

    db.close();
    db = openDatabase(dbPath);
    assertCurrentSchema(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM catalog_import_candidates_fts").get().count, 2);
  } finally {
    db?.close();
    cleanupRoot(root);
  }
});

test("pre-device-voting historical state migrates with its explicit rating reset boundary", () => {
  const root = createTempRoot("legacy-pre-device");
  const dbPath = path.join(root, "community.sqlite");
  seedLegacyPreDevice(dbPath);
  let db;

  try {
    db = openDatabase(dbPath);
    assertCurrentSchema(db);
    assertMigrationMarkers(db, [RESET_MIGRATION, STATUS_MIGRATION, FTS_MIGRATION, ANALYTICS_MIGRATION]);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM rating_submissions").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM rating_events").get().count, 0);
    assert.equal(db.prepare("SELECT title FROM podcasts WHERE id = ?").get("pre-device-show").title, "Pre-device Show");
    assert.equal(db.prepare("SELECT notes FROM show_submissions WHERE id = ?").get("pre-device-submission").notes, "Non-rating data should survive the device-voting migration.");
    assert.equal(db.prepare("SELECT priority FROM show_submissions WHERE id = ?").get("pre-device-submission").priority, "normal");
  } finally {
    db?.close();
    cleanupRoot(root);
  }
});

test("migration failure rolls back structural work and migration markers", () => {
  const root = createTempRoot("migration-atomicity");
  const dbPath = path.join(root, "community.sqlite");
  seedLegacyPreImportV2(dbPath, { incompatibleFts: true });

  try {
    assert.throws(() => openDatabase(dbPath), /catalog_import_candidates_fts|virtual table|column/i);
    const db = new Database(dbPath);
    try {
      assertDatabaseIntegrity(db);
      assert.deepEqual(db.prepare("SELECT id FROM app_migrations ORDER BY id").pluck().all(), [RESET_MIGRATION]);
      assert.equal(db.prepare("SELECT status FROM catalog_import_candidates WHERE id = ?").get("legacy-candidate").status, "discovered");
      assert.equal(columnNames(db, "catalog_import_candidates").has("mode"), false);
      assert.equal(sqliteNames(db, "table").has("analytics_meta"), false);
      assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").pluck().all(), []);
    } finally {
      db.close();
    }
  } finally {
    cleanupRoot(root);
  }
});

test("repository online backup restores into a clean application database and remains usable", () => {
  const root = createTempRoot("backup-restore");
  const sourcePath = path.join(root, "source", "community.sqlite");
  const backupPath = path.join(root, "backups", "community-verified.sqlite");
  const restoredPath = path.join(root, "restored", "community.sqlite");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  let sourceDb = openDatabase(sourcePath);
  const expected = seedCurrentApplicationData(sourceDb);
  sourceDb.pragma("wal_checkpoint(TRUNCATE)");
  sourceDb.close();
  sourceDb = null;

  try {
    const backup = runNode(BACKUP_SCRIPT, ["--source", sourcePath, "--destination", backupPath]);
    assert.equal(backup.status, 0, backup.stderr || backup.stdout);
    assert.match(backup.stdout, /Database backup verified/);
    assert.equal(fs.statSync(backupPath).mode & 0o077, 0);

    const checked = runNode(BACKUP_CHECK_SCRIPT, ["--file", backupPath, "--max-age-hours", "1"]);
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    assert.match(checked.stdout, /"integrity":"ok"/);
    assert.match(checked.stdout, /"foreignKeyViolations":0/);

    fs.mkdirSync(path.dirname(restoredPath), { recursive: true });
    fs.copyFileSync(backupPath, restoredPath);
    fs.chmodSync(restoredPath, 0o600);
    let restoredDb = openDatabase(restoredPath);
    try {
      assertCurrentSchema(restoredDb);
      assert.equal(restoredDb.prepare("SELECT title FROM podcasts WHERE id = ?").get("restore-show").title, "Restore Show");
      assert.equal(restoredDb.prepare("SELECT COUNT(*) AS count FROM rating_submissions WHERE podcast_id = ?").get("restore-show").count, 1);
      assert.equal(restoredDb.prepare("SELECT show_title FROM show_submissions WHERE id = ?").get(expected.submission.id).show_title, "Restore Submission");
      assert.equal(restoredDb.prepare("SELECT title FROM catalog_import_candidates WHERE id = ?").get(expected.candidate.id).title, "Restore Candidate");
      assert.equal(restoredDb.prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE event_id = ?").get("restore-analytics-event-123456789").count, 1);
      assert.deepEqual(searchCandidateIds(restoredDb, "Restore Candidate"), [expected.candidate.id]);

      const restoredCommunity = createCommunityStore({
        db: restoredDb,
        catalog: expected.catalog,
        minPublicRatings: 1,
      });
      const summary = restoredCommunity.listRatingSummaries(["restore-show"], expected.profileId)["restore-show"];
      assert.equal(summary.averageRating, 9);
      restoredCommunity.syncCatalog([{
        ...expected.catalog[0],
        id: "restored-write-show",
        title: "Restored Write Show",
        href: "/shows/restored-write-show",
      }]);
      const restoredProfileId = restoredCommunity.ensureDeviceProfile({ voterHash: "restored-write-voter", userAgent: "restore-write-agent" });
      restoredCommunity.upsertRating({ podcastId: "restored-write-show", profileId: restoredProfileId, rating: 6, source: "restore-write" });
      assert.equal(restoredCommunity.listRatingSummaries(["restored-write-show"], restoredProfileId)["restored-write-show"].averageRating, 6);

      const restoredSubmission = createSubmissionStore({ db: restoredDb }).createShowSubmission({
        showTitle: "Post-restore Submission",
        creatorName: "Post-restore Creator",
        contactEmail: "post-restore@example.test",
      });
      assert.equal(restoredSubmission.show_title, "Post-restore Submission");

      const restoredImportStore = createImportStore({ db: restoredDb });
      const restoredCandidate = restoredImportStore.createCandidate({ id: "post-restore-candidate", title: "Post Restore Candidate" });
      assert.equal(restoredImportStore.getCandidate(restoredCandidate.id).title, "Post Restore Candidate");
      assert.deepEqual(searchCandidateIds(restoredDb, "Post Restore Candidate"), [restoredCandidate.id]);

      const restoredAnalytics = createAnalyticsStore({
        db: restoredDb,
        secret: "restore-test-analytics-secret-1234567890",
        validateClientEvent: () => ({}),
      });
      assert.equal(restoredAnalytics.recordServerInteraction({
        eventName: "Catalogue Submission",
        eventId: "post-restore-analytics-123456789",
        occurredAt: new Date("2026-09-21T08:05:00.000Z"),
        visitorId: "post-restore-visitor-123456789",
        sessionId: "post-restore-session-123456789",
        pagePath: "/submit",
        properties: { submission_type: "show" },
        userAgent: "restore-write-agent",
      }).recorded, true);
      assertDatabaseIntegrity(restoredDb);
    } finally {
      restoredDb.close();
      restoredDb = null;
    }
  } finally {
    sourceDb?.close();
    cleanupRoot(root);
  }
});

test("online backup refuses a source with foreign-key violations", () => {
  const root = createTempRoot("backup-fk-rejection");
  const sourcePath = path.join(root, "source.sqlite");
  const backupPath = path.join(root, "rejected.sqlite");
  let db = openDatabase(sourcePath);

  try {
    db.pragma("foreign_keys = OFF");
    db.prepare(`
      INSERT INTO rating_submissions (id, podcast_id, profile_id, rating)
      VALUES ('orphan-rating', 'missing-podcast', 'missing-profile', 5)
    `).run();
    db.close();
    db = null;

    const backup = runNode(BACKUP_SCRIPT, ["--source", sourcePath, "--destination", backupPath]);
    assert.notEqual(backup.status, 0);
    assert.match(backup.stderr, /foreign_key_check/i);
    assert.equal(fs.existsSync(backupPath), false);
  } finally {
    db?.close();
    cleanupRoot(root);
  }
});
