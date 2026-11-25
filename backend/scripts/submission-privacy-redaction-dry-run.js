#!/usr/bin/env node

const Database = require("better-sqlite3");
const { createHash } = require("node:crypto");
const { buildSubmissionRedactionPreview } = require("../lib/privacy/submission-derived-data");
const { redactSubmissionDerivedData } = require("../lib/privacy/submission-derived-data");

function parseArguments(argv) {
  const values = {};
  const allowedKeys = new Set(["db", "network-retention-days", "personal-retention-days", "as-of", "expected-manifest-sha256"]);
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      apply = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (!allowedKeys.has(key)) throw new Error(`Unknown option: --${key}`);
    const value = inlineValue === undefined ? argv[++index] : inlineValue;
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value.`);
    values[key] = value;
  }
  for (const key of ["db", "network-retention-days", "personal-retention-days"]) {
    if (!values[key]) throw new Error(`Usage: node scripts/submission-privacy-redaction-dry-run.js --db <sqlite-path> --network-retention-days <days> --personal-retention-days <days> [--as-of <ISO timestamp>]`);
  }
  const networkRetentionDays = Number(values["network-retention-days"]);
  const personalRetentionDays = Number(values["personal-retention-days"]);
  if (!Number.isInteger(networkRetentionDays) || networkRetentionDays < 1 || !Number.isInteger(personalRetentionDays) || personalRetentionDays < 1) {
    throw new Error("Retention durations must be positive whole days.");
  }
  const expectedManifestSha256 = values["expected-manifest-sha256"] || "";
  if (apply && !/^[a-f0-9]{64}$/i.test(expectedManifestSha256)) {
    throw new Error("--apply requires --expected-manifest-sha256 from a reviewed dry-run.");
  }
  if (!apply && expectedManifestSha256) throw new Error("--expected-manifest-sha256 is only valid with --apply.");
  return {
    dbPath: values.db,
    networkRetentionDays,
    personalRetentionDays,
    asOf: values["as-of"] || new Date().toISOString(),
    apply,
    expectedManifestSha256: expectedManifestSha256.toLowerCase(),
  };
}

function manifestSha256(preview) {
  return createHash("sha256").update(JSON.stringify(preview)).digest("hex");
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const db = new Database(options.dbPath, { readonly: !options.apply, fileMustExist: true });
  try {
    db.pragma("foreign_keys = ON");
    if (!options.apply) db.pragma("query_only = ON");
    const execute = () => {
      const preview = buildSubmissionRedactionPreview(db, options);
      const beforeManifestSha256 = manifestSha256(preview);
      if (!options.apply) {
        return { ...preview, mode: "read-only-dry-run", writesPerformed: false, manifestSha256: beforeManifestSha256 };
      }
      if (beforeManifestSha256 !== options.expectedManifestSha256) {
        const error = new Error("The current queue no longer matches the reviewed redaction manifest; no changes were applied. Generate and review a fresh dry-run.");
        error.code = "redaction_manifest_changed";
        throw error;
      }
      const changes = { rowsByTable: {}, totalRows: 0 };
      for (const item of preview.items) {
        if (!item.linkedCandidateIds.length) continue;
        const result = redactSubmissionDerivedData(db, item.submissionId, { dryRun: false, scope: "content" });
        changes.totalRows += result.changedRows.totalRows;
        Object.entries(result.changedRows.rowsByTable).forEach(([table, count]) => {
          changes.rowsByTable[table] = (changes.rowsByTable[table] || 0) + count;
        });
      }
      const after = buildSubmissionRedactionPreview(db, options);
      return {
        mode: "manifest-guarded-apply",
        writesPerformed: true,
        beforeManifestSha256,
        afterManifestSha256: manifestSha256(after),
        changedRows: changes,
        afterCounts: after.counts,
      };
    };
    const result = options.apply ? db.transaction(execute).immediate() : execute();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${String(error?.message || "Privacy redaction preview failed.")}\n`);
  process.exitCode = 1;
}
