const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

function applyMigrationOnce(db, id, callback) {
  const existing = db.prepare("SELECT id FROM app_migrations WHERE id = ?").get(id);
  if (existing) {
    return;
  }

  const runMigration = db.transaction(() => {
    callback();
    db.prepare("INSERT INTO app_migrations (id) VALUES (?)").run(id);
  });

  runMigration();
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS podcasts (
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

    CREATE TABLE IF NOT EXISTS community_profiles (
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

    CREATE TABLE IF NOT EXISTS rating_submissions (
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

    CREATE TABLE IF NOT EXISTS rating_events (
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

    CREATE TABLE IF NOT EXISTS community_abuse_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      abuse_hash TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS show_submissions (
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

    CREATE TABLE IF NOT EXISTS published_listener_reviews (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL UNIQUE REFERENCES show_submissions(id) ON DELETE CASCADE,
      show_id TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT 'Anonymous listener',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      rating_stars INTEGER NOT NULL CHECK (rating_stars BETWEEN 1 AND 5),
      voice_acting_score INTEGER CHECK (voice_acting_score IS NULL OR voice_acting_score BETWEEN 1 AND 10),
      sound_design_score INTEGER CHECK (sound_design_score IS NULL OR sound_design_score BETWEEN 1 AND 10),
      story_score INTEGER CHECK (story_score IS NULL OR story_score BETWEEN 1 AND 10),
      characters_score INTEGER CHECK (characters_score IS NULL OR characters_score BETWEEN 1 AND 10),
      ads_score INTEGER CHECK (ads_score IS NULL OR ads_score BETWEEN 1 AND 10),
      length_score INTEGER CHECK (length_score IS NULL OR length_score BETWEEN 1 AND 10),
      spoiler_level TEXT NOT NULL DEFAULT 'spoiler-free',
      best_for_json TEXT NOT NULL DEFAULT '[]',
      worked_best_json TEXT NOT NULL DEFAULT '[]',
      is_published INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS listener_review_helpful_votes (
      review_id TEXT NOT NULL REFERENCES published_listener_reviews(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (review_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS catalog_import_candidates (
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

    CREATE TABLE IF NOT EXISTS catalog_import_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES catalog_import_candidates(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_key TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      fetch_status TEXT NOT NULL DEFAULT 'fetched',
      payload_json TEXT NOT NULL DEFAULT '{}',
      normalized_json TEXT NOT NULL DEFAULT '{}',
      raw_compacted INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS catalog_import_events (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES catalog_import_candidates(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS catalog_import_runs (
      id TEXT PRIMARY KEY,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      input_json TEXT NOT NULL DEFAULT '{}',
      summary_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS catalog_import_identities (
      identity_type TEXT NOT NULL,
      identity_value TEXT NOT NULL,
      candidate_id TEXT REFERENCES catalog_import_candidates(id) ON DELETE CASCADE,
      existing_show_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (identity_type, identity_value)
    );

    CREATE TABLE IF NOT EXISTS catalog_import_field_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES catalog_import_candidates(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      value_json TEXT NOT NULL DEFAULT 'null',
      normalized_value TEXT NOT NULL DEFAULT '',
      source_snapshot_id INTEGER REFERENCES catalog_import_sources(id) ON DELETE SET NULL,
      source_type TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL DEFAULT 'direct',
      evidence_status TEXT NOT NULL DEFAULT 'candidate',
      selected INTEGER NOT NULL DEFAULT 0,
      observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS catalog_import_jobs (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES catalog_import_candidates(id) ON DELETE CASCADE,
      run_id TEXT REFERENCES catalog_import_runs(id) ON DELETE SET NULL,
      job_type TEXT NOT NULL DEFAULT 'prepare',
      status TEXT NOT NULL DEFAULT 'queued',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 4,
      next_attempt_at TEXT,
      lease_owner TEXT NOT NULL DEFAULT '',
      lease_expires_at TEXT,
      input_revision INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      error_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      completed_at TEXT,
      UNIQUE (candidate_id, job_type, input_revision)
    );

    CREATE TABLE IF NOT EXISTS catalog_import_source_cache (
      source_type TEXT NOT NULL,
      source_key TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      fetch_status TEXT NOT NULL DEFAULT 'fetched',
      http_status INTEGER,
      etag TEXT NOT NULL DEFAULT '',
      last_modified TEXT NOT NULL DEFAULT '',
      payload_gzip BLOB,
      payload_hash TEXT NOT NULL DEFAULT '',
      raw_truncated INTEGER NOT NULL DEFAULT 0,
      normalized_json TEXT NOT NULL DEFAULT '{}',
      error_text TEXT NOT NULL DEFAULT '',
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      PRIMARY KEY (source_type, source_key)
    );

    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      client_ip TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rating_submissions_podcast
      ON rating_submissions (podcast_id);

    CREATE INDEX IF NOT EXISTS idx_rating_submissions_profile
      ON rating_submissions (profile_id);

    CREATE INDEX IF NOT EXISTS idx_rating_events_podcast
      ON rating_events (podcast_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_community_abuse_hash_created
      ON community_abuse_events (abuse_hash, created_at_ms);

    CREATE INDEX IF NOT EXISTS idx_show_submissions_status
      ON show_submissions (status, submitted_at DESC);

    CREATE INDEX IF NOT EXISTS idx_published_listener_reviews_show
      ON published_listener_reviews (show_id, is_published, published_at DESC);

    CREATE INDEX IF NOT EXISTS idx_listener_review_helpful_votes_review
      ON listener_review_helpful_votes (review_id);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_candidates_status
      ON catalog_import_candidates (status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_candidates_scope
      ON catalog_import_candidates (scope_status, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_candidates_source
      ON catalog_import_candidates (primary_source_type, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_sources_candidate
      ON catalog_import_sources (candidate_id, fetched_at DESC);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_events_candidate
      ON catalog_import_events (candidate_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_identities_candidate
      ON catalog_import_identities (candidate_id);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_identities_show
      ON catalog_import_identities (existing_show_id);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_evidence_candidate_field
      ON catalog_import_field_evidence (candidate_id, field_name, confidence DESC);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_jobs_claim
      ON catalog_import_jobs (status, next_attempt_at, lease_expires_at, created_at);

    CREATE INDEX IF NOT EXISTS idx_catalog_import_jobs_candidate
      ON catalog_import_jobs (candidate_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_rate_limit_scope_ip_created
      ON rate_limit_events (scope, client_ip, created_at_ms);
  `);

  ensureColumn(db, "show_submissions", "submission_type", "submission_type TEXT NOT NULL DEFAULT 'show'");
  ensureColumn(db, "show_submissions", "priority", "priority TEXT NOT NULL DEFAULT 'normal'");
  ensureColumn(db, "show_submissions", "existing_show_id", "existing_show_id TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "show_submissions", "payload_json", "payload_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "show_submissions", "provenance_json", "provenance_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "show_submissions", "review_notes", "review_notes TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "show_submissions", "reviewed_by", "reviewed_by TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "show_submissions", "reviewed_at", "reviewed_at TEXT");
  ensureColumn(
    db,
    "catalog_import_candidates",
    "scope_status",
    "scope_status TEXT NOT NULL DEFAULT 'in-scope'",
  );
  ensureColumn(
    db,
    "catalog_import_candidates",
    "has_duplicate_match",
    "has_duplicate_match INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(db, "catalog_import_candidates", "title", "title TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_candidates", "creator_name", "creator_name TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_candidates", "canonical_id", "canonical_id TEXT NOT NULL DEFAULT ''");
  ensureColumn(
    db,
    "catalog_import_candidates",
    "primary_source_type",
    "primary_source_type TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    db,
    "catalog_import_candidates",
    "primary_source_key",
    "primary_source_key TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    db,
    "catalog_import_candidates",
    "primary_source_url",
    "primary_source_url TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(db, "catalog_import_candidates", "seed_query", "seed_query TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_candidates", "objective_json", "objective_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(
    db,
    "catalog_import_candidates",
    "ai_suggestions_json",
    "ai_suggestions_json TEXT NOT NULL DEFAULT '{}'",
  );
  ensureColumn(
    db,
    "catalog_import_candidates",
    "provenance_json",
    "provenance_json TEXT NOT NULL DEFAULT '{}'",
  );
  ensureColumn(db, "catalog_import_candidates", "dedupe_json", "dedupe_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "catalog_import_candidates", "review_notes", "review_notes TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_candidates", "reviewed_by", "reviewed_by TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_candidates", "reviewed_at", "reviewed_at TEXT");
  ensureColumn(
    db,
    "catalog_import_candidates",
    "drafted_show_id",
    "drafted_show_id TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    db,
    "catalog_import_candidates",
    "published_show_id",
    "published_show_id TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    db,
    "catalog_import_candidates",
    "duplicate_of_show_id",
    "duplicate_of_show_id TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(
    db,
    "catalog_import_candidates",
    "duplicate_of_candidate_id",
    "duplicate_of_candidate_id TEXT NOT NULL DEFAULT ''",
  );
  ensureColumn(db, "catalog_import_candidates", "mode", "mode TEXT NOT NULL DEFAULT 'create'");
  ensureColumn(db, "catalog_import_candidates", "existing_show_id", "existing_show_id TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_candidates", "prepared_record_json", "prepared_record_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "catalog_import_candidates", "readiness_json", "readiness_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "catalog_import_candidates", "conflicts_json", "conflicts_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "catalog_import_candidates", "source_health_json", "source_health_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "catalog_import_candidates", "locked_fields_json", "locked_fields_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "catalog_import_candidates", "cover_stage_json", "cover_stage_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "catalog_import_candidates", "pipeline_version", "pipeline_version TEXT NOT NULL DEFAULT '2'");
  ensureColumn(db, "catalog_import_candidates", "input_revision", "input_revision INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "catalog_import_candidates", "last_run_id", "last_run_id TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_candidates", "last_error", "last_error TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_sources", "http_status", "http_status INTEGER");
  ensureColumn(db, "catalog_import_sources", "etag", "etag TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_sources", "last_modified", "last_modified TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_sources", "payload_hash", "payload_hash TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "catalog_import_sources", "payload_gzip", "payload_gzip BLOB");
  ensureColumn(db, "catalog_import_sources", "raw_truncated", "raw_truncated INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "catalog_import_sources", "raw_compacted", "raw_compacted INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "catalog_import_runs", "updated_at", "updated_at TEXT");
  ensureColumn(db, "catalog_import_runs", "started_at", "started_at TEXT");
  ensureColumn(db, "catalog_import_runs", "completed_at", "completed_at TEXT");
  ensureColumn(db, "community_profiles", "voter_hash", "voter_hash TEXT");
  ensureColumn(db, "community_profiles", "last_abuse_hash", "last_abuse_hash TEXT");
  ensureColumn(db, "rating_submissions", "verified_at", "verified_at TEXT");
  ensureColumn(db, "rating_submissions", "abuse_hash", "abuse_hash TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "rating_events", "abuse_hash", "abuse_hash TEXT NOT NULL DEFAULT ''");
  ensureColumn(
    db,
    "published_listener_reviews",
    "voice_acting_score",
    "voice_acting_score INTEGER CHECK (voice_acting_score IS NULL OR voice_acting_score BETWEEN 1 AND 10)",
  );
  ensureColumn(
    db,
    "published_listener_reviews",
    "sound_design_score",
    "sound_design_score INTEGER CHECK (sound_design_score IS NULL OR sound_design_score BETWEEN 1 AND 10)",
  );
  ensureColumn(
    db,
    "published_listener_reviews",
    "story_score",
    "story_score INTEGER CHECK (story_score IS NULL OR story_score BETWEEN 1 AND 10)",
  );
  ensureColumn(
    db,
    "published_listener_reviews",
    "characters_score",
    "characters_score INTEGER CHECK (characters_score IS NULL OR characters_score BETWEEN 1 AND 10)",
  );
  ensureColumn(
    db,
    "published_listener_reviews",
    "ads_score",
    "ads_score INTEGER CHECK (ads_score IS NULL OR ads_score BETWEEN 1 AND 10)",
  );
  ensureColumn(
    db,
    "published_listener_reviews",
    "length_score",
    "length_score INTEGER CHECK (length_score IS NULL OR length_score BETWEEN 1 AND 10)",
  );

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_community_profiles_voter_hash
      ON community_profiles (voter_hash)
      WHERE voter_hash IS NOT NULL;
  `);

  applyMigrationOnce(db, "community-device-voting-reset-2026-06-21", () => {
    db.prepare("DELETE FROM rating_events").run();
    db.prepare("DELETE FROM rating_submissions").run();
  });

  applyMigrationOnce(db, "catalog-import-v2-statuses-2026-07-14", () => {
    db.exec(`
      UPDATE catalog_import_candidates SET status = 'queued' WHERE status = 'discovered';
      UPDATE catalog_import_candidates SET status = 'needs-review' WHERE status IN ('hydrated', 'drafted');
    `);
  });

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS catalog_import_candidates_fts USING fts5(
      title,
      creator_name,
      seed_query,
      review_notes,
      content='catalog_import_candidates',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS catalog_import_candidates_fts_insert AFTER INSERT ON catalog_import_candidates BEGIN
      INSERT INTO catalog_import_candidates_fts(rowid, title, creator_name, seed_query, review_notes)
      VALUES (new.rowid, new.title, new.creator_name, new.seed_query, new.review_notes);
    END;

    CREATE TRIGGER IF NOT EXISTS catalog_import_candidates_fts_delete AFTER DELETE ON catalog_import_candidates BEGIN
      INSERT INTO catalog_import_candidates_fts(catalog_import_candidates_fts, rowid, title, creator_name, seed_query, review_notes)
      VALUES ('delete', old.rowid, old.title, old.creator_name, old.seed_query, old.review_notes);
    END;

    CREATE TRIGGER IF NOT EXISTS catalog_import_candidates_fts_update AFTER UPDATE ON catalog_import_candidates BEGIN
      INSERT INTO catalog_import_candidates_fts(catalog_import_candidates_fts, rowid, title, creator_name, seed_query, review_notes)
      VALUES ('delete', old.rowid, old.title, old.creator_name, old.seed_query, old.review_notes);
      INSERT INTO catalog_import_candidates_fts(rowid, title, creator_name, seed_query, review_notes)
      VALUES (new.rowid, new.title, new.creator_name, new.seed_query, new.review_notes);
    END;
  `);

  applyMigrationOnce(db, "catalog-import-v2-fts-backfill-2026-07-14", () => {
    db.prepare("INSERT INTO catalog_import_candidates_fts(catalog_import_candidates_fts) VALUES ('rebuild')").run();
  });
}

function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

module.exports = {
  openDatabase,
};
