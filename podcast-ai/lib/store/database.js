const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function migrate(db) {
  db.exec(`
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
      display_name TEXT,
      last_user_agent TEXT,
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_rating_submissions_podcast
      ON rating_submissions (podcast_id);

    CREATE INDEX IF NOT EXISTS idx_rating_submissions_profile
      ON rating_submissions (profile_id);

    CREATE INDEX IF NOT EXISTS idx_rating_events_podcast
      ON rating_events (podcast_id, created_at DESC);
  `);
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
