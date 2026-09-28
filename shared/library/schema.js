export const LIBRARY_STATES = Object.freeze(["saved", "listening", "finished", "dropped", "hidden"]);
export const LIBRARY_STATE_ORDER = Object.freeze(Object.fromEntries(LIBRARY_STATES.map((state, index) => [state, index])));
export const LIBRARY_DATABASE_NAME = "echo-archives-listener-library";
export const LIBRARY_DATABASE_VERSION = 1;
export const LIBRARY_ENTRIES_STORE = "entries";
export const LIBRARY_SETTINGS_STORE = "settings";
export const PERSONAL_DISCOVERY_SETTING_KEY = "personalDiscoveryEnabled";
export const LIBRARY_BACKUP_FORMAT = "the-echo-archives.listener-library";
export const LIBRARY_BACKUP_SCHEMA_VERSION = 1;
export const LIBRARY_RECOVERY_FORMAT = "the-echo-archives.listener-library-recovery";

const SHOW_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ENTRY_FIELDS = new Set(["showId", "state", "rating", "createdAt", "updatedAt", "titleSnapshot"]);
const BACKUP_FIELDS = new Set(["format", "schemaVersion", "exportedAt", "entries"]);

export function isValidShowId(showId) {
  return typeof showId === "string" && SHOW_ID_PATTERN.test(showId);
}

export function isValidLibraryState(state) {
  return typeof state === "string" && Object.hasOwn(LIBRARY_STATE_ORDER, state);
}

export function isValidPrivateRating(rating) {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

export function isValidUtcTimestamp(value) {
  if (typeof value !== "string" || !UTC_TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === normalizeUtcTimestamp(value);
}

export function normalizeUtcTimestamp(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function normalizeTitleSnapshot(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= 160 ? normalized : null;
}

export function validateLibraryEntry(value, { timestampFallback = null } = {}) {
  const issues = [];
  if (!isPlainObject(value)) {
    return { ok: false, issues: [{ path: "$", code: "entry_not_object" }] };
  }

  for (const key of Object.keys(value)) {
    if (!ENTRY_FIELDS.has(key)) issues.push({ path: key, code: "unexpected_field" });
  }
  if (!isValidShowId(value.showId)) issues.push({ path: "showId", code: "invalid_show_id" });
  if (!isValidLibraryState(value.state)) issues.push({ path: "state", code: "invalid_state" });
  if (Object.hasOwn(value, "rating") && !isValidPrivateRating(value.rating)) {
    issues.push({ path: "rating", code: "invalid_rating" });
  }
  if (Object.hasOwn(value, "createdAt") && !isValidUtcTimestamp(value.createdAt)) {
    issues.push({ path: "createdAt", code: "invalid_timestamp" });
  }
  if (Object.hasOwn(value, "updatedAt") && !isValidUtcTimestamp(value.updatedAt)) {
    issues.push({ path: "updatedAt", code: "invalid_timestamp" });
  }
  if (Object.hasOwn(value, "titleSnapshot") && normalizeTitleSnapshot(value.titleSnapshot) !== value.titleSnapshot) {
    issues.push({ path: "titleSnapshot", code: "invalid_title_snapshot" });
  }

  const fallback = timestampFallback && isValidUtcTimestamp(timestampFallback) ? timestampFallback : null;
  const createdAt = isValidUtcTimestamp(value.createdAt) ? normalizeUtcTimestamp(value.createdAt) : fallback;
  const updatedAt = isValidUtcTimestamp(value.updatedAt) ? normalizeUtcTimestamp(value.updatedAt) : fallback;
  if (!createdAt) issues.push({ path: "createdAt", code: "missing_timestamp" });
  if (!updatedAt) issues.push({ path: "updatedAt", code: "missing_timestamp" });

  if (issues.length) return { ok: false, issues };

  const entry = {
    showId: value.showId,
    state: value.state,
    createdAt,
    updatedAt,
  };
  if (Object.hasOwn(value, "rating")) entry.rating = value.rating;
  if (Object.hasOwn(value, "titleSnapshot")) entry.titleSnapshot = value.titleSnapshot;
  return { ok: true, value: entry };
}

export function validatePersonalDiscoverySetting(value) {
  return typeof value === "boolean";
}

export function compareLibraryEntries(a, b) {
  const stateDifference = LIBRARY_STATE_ORDER[a.state] - LIBRARY_STATE_ORDER[b.state];
  if (stateDifference !== 0) return stateDifference;
  const timestampDifference = b.updatedAt.localeCompare(a.updatedAt);
  return timestampDifference || a.showId.localeCompare(b.showId);
}

export function validateBackupDocument(value) {
  const issues = [];
  if (!isPlainObject(value)) {
    return { ok: false, issues: [{ path: "$", code: "document_not_object" }] };
  }

  for (const key of Object.keys(value)) {
    if (!BACKUP_FIELDS.has(key)) issues.push({ path: key, code: "unexpected_field" });
  }
  if (value.format !== LIBRARY_BACKUP_FORMAT) issues.push({ path: "format", code: "unsupported_format" });
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    issues.push({ path: "schemaVersion", code: "invalid_schema_version" });
  } else if (value.schemaVersion > LIBRARY_BACKUP_SCHEMA_VERSION) {
    issues.push({ path: "schemaVersion", code: "unsupported_newer_schema" });
  } else if (value.schemaVersion < LIBRARY_BACKUP_SCHEMA_VERSION) {
    issues.push({ path: "schemaVersion", code: "unsupported_schema" });
  }
  if (!isValidUtcTimestamp(value.exportedAt)) issues.push({ path: "exportedAt", code: "invalid_timestamp" });
  if (!Array.isArray(value.entries)) issues.push({ path: "entries", code: "entries_not_array" });

  const exportedAt = isValidUtcTimestamp(value.exportedAt) ? normalizeUtcTimestamp(value.exportedAt) : null;
  const entries = [];
  const seenIds = new Set();
  if (Array.isArray(value.entries)) {
    value.entries.forEach((candidate, index) => {
      const result = validateLibraryEntry(candidate, { timestampFallback: exportedAt });
      if (!result.ok) {
        for (const issue of result.issues) {
          issues.push({ path: `entries[${index}]${issue.path === "$" ? "" : `.${issue.path}`}`, code: issue.code });
        }
        return;
      }
      if (seenIds.has(result.value.showId)) {
        issues.push({ path: `entries[${index}].showId`, code: "duplicate_show_id" });
        return;
      }
      seenIds.add(result.value.showId);
      entries.push(result.value);
    });
  }

  if (issues.length) {
    return {
      ok: false,
      issues,
      candidateEntryCount: Array.isArray(value.entries) ? value.entries.length : 0,
      candidateEntries: entries,
    };
  }
  return {
    ok: true,
    value: {
      exportedAt,
      entries,
    },
  };
}

export function createBackupDocument({ entries, exportedAt }) {
  return {
    format: LIBRARY_BACKUP_FORMAT,
    schemaVersion: LIBRARY_BACKUP_SCHEMA_VERSION,
    exportedAt,
    entries: entries.map((entry) => ({ ...entry })),
  };
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
