import {
  LIBRARY_BACKUP_FORMAT,
  LIBRARY_BACKUP_SCHEMA_VERSION,
  LIBRARY_RECOVERY_FORMAT,
  createBackupDocument,
  validateBackupDocument,
} from "./schema.js";

export function parseBackupInput(input) {
  if (typeof input !== "string") return { ok: true, value: input };
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch {
    return { ok: false, issues: [{ path: "$", code: "invalid_json" }], candidateEntryCount: 0 };
  }
}

export function validateBackupInput(input) {
  const parsed = parseBackupInput(input);
  if (!parsed.ok) return parsed;
  return validateBackupDocument(parsed.value);
}

export function buildBackup({ entries, exportedAt }) {
  return createBackupDocument({ entries, exportedAt });
}

export function serializeBackup(document) {
  return JSON.stringify(document, null, 2);
}

export function buildRecoverySnapshot({ exportedAt, entries, settings }) {
  return {
    format: LIBRARY_RECOVERY_FORMAT,
    schemaVersion: LIBRARY_BACKUP_SCHEMA_VERSION,
    exportedAt,
    warning: "Recovery snapshot of raw local Library rows. Do not import as a normal Library backup.",
    entries,
    settings,
  };
}

export { LIBRARY_BACKUP_FORMAT, LIBRARY_BACKUP_SCHEMA_VERSION, validateBackupDocument };
