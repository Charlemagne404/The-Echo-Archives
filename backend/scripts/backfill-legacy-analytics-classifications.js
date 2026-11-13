#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { openDatabase } = require("../lib/store/database");
const { createAnalyticsStore } = require("../lib/store/analytics-store");

function parseArgs(argv) {
  const options = { db: "", apply: false };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === "--db" && argv[index + 1]) {
      options.db = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === "--apply") {
      options.apply = true;
    } else {
      throw new Error("Usage: node scripts/backfill-legacy-analytics-classifications.js --db PATH [--apply]");
    }
  }
  if (!options.db) throw new Error("--db is required.");
  return options;
}

function createStore(db) {
  const secret = String(process.env.ANALYTICS_HMAC_SECRET || "");
  if (secret.length < 32) throw new Error("ANALYTICS_HMAC_SECRET must be present in the environment and at least 32 characters.");
  return createAnalyticsStore({ db, secret, popularityEligibilityEnabled: false });
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.apply) {
    const db = openDatabase(options.db);
    try {
      const report = createStore(db).backfillLegacyEventClassifications({ apply: true });
      process.stdout.write(`${JSON.stringify({ mode: "apply", database: options.db, ...report })}\n`);
      if (!report.updated) process.exitCode = 1;
    } finally {
      db.close();
    }
    return;
  }

  const source = new Database(options.db, { readonly: true, fileMustExist: true });
  source.pragma("query_only = ON");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-legacy-classification-check-"));
  const snapshotPath = path.join(tempDir, "analytics-check.sqlite");
  let snapshot;
  try {
    await source.backup(snapshotPath);
    source.close();
    snapshot = openDatabase(snapshotPath);
    const report = createStore(snapshot).backfillLegacyEventClassifications();
    process.stdout.write(`${JSON.stringify({ mode: "check", database: options.db, sourceReadOnly: true, ...report })}\n`);
    if (!report.verified) process.exitCode = 1;
  } finally {
    try { source.close(); } catch (_error) { /* already closed */ }
    try { snapshot?.close(); } catch (_error) { /* close after error if opened */ }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
