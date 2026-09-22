export const SUBMISSION_DRAFT_STORAGE_KEY = "echo-archives:submission-drafts";
export const SUBMISSION_DRAFT_SCHEMA_VERSION = 1;

const MODE_FIELDS = Object.freeze({
  show: Object.freeze([
    "showTitle", "creatorName", "contactEmail", "listenLinks", "selectedTags", "suggestedDescriptors", "completionStatus", "shortDescription", "verificationNotes",
  ]),
  correction: Object.freeze([
    "existingShowId", "showSearch", "correctionType", "creatorPageId", "creatorPageName", "creatorPageIssue", "creatorPageProposedValue", "linkAction", "affectedUrl", "replacementUrl", "metadataField", "proposedMetadataValue",
    "proposedStatus", "statusContext", "creditAction", "creditName", "creditRole", "artworkUrl", "artworkCredit", "otherIssue", "otherProposedValue", "sourceLinks", "optionalNotes", "contactEmail",
  ]),
  "listener-review": Object.freeze([
    "existingShowId", "showSearch", "ratingStars", "categoryScores", "spoilerLevel", "reviewTitle", "reviewText", "whoWouldLikeThis", "bestFor", "workedBest", "similarShows", "alias", "contactEmail",
  ]),
  "creator-verification": Object.freeze([
    "existingShowId", "showSearch", "creatorName", "contactEmail", "role", "verificationMethod", "proofUrl", "evidenceDescription", "requestedUpdates", "preferredDescription", "officialLinks", "optionalNotes",
  ]),
});

const ARRAY_STRING_FIELDS = new Set([
  "selectedTags",
  "bestFor",
  "workedBest",
]);

const LINK_FIELDS = new Set(["listenLinks", "officialLinks"]);
const SOURCE_FIELDS = new Set(["sourceLinks"]);
const CONTEXT_FIELDS = new Set(["existingShowId", "showSearch", "creatorPageId"]);

const DEFAULT_SCALAR_VALUES = Object.freeze({
  completionStatus: "unknown",
  correctionType: "broken-link",
  creatorPageIssue: "missing-page",
  linkAction: "replace",
  metadataField: "creator",
  proposedStatus: "ongoing",
  creditAction: "add",
  ratingStars: 0,
  spoilerLevel: "spoiler-free",
  role: "creator",
  verificationMethod: "official-domain-email",
});

export function createDraftContext({ showId = "", entityId = "" } = {}) {
  return {
    showId: normalizeContextValue(showId),
    entityId: normalizeContextValue(entityId),
  };
}

export function getDraftContextKey(mode, context = {}) {
  if (!Object.prototype.hasOwnProperty.call(MODE_FIELDS, mode)) {
    return "";
  }

  const normalizedContext = createDraftContext(context);
  return JSON.stringify([mode, normalizedContext.showId, normalizedContext.entityId]);
}

export function hasDraftContent(mode, draft, context = {}) {
  const snapshot = serializeDraft(mode, draft);
  if (!snapshot) {
    return false;
  }

  const normalizedContext = createDraftContext(context);
  return MODE_FIELDS[mode].some((field) => {
    if (CONTEXT_FIELDS.has(field)) {
      if (field === "showSearch" && !normalizedContext.showId) {
        return Boolean(snapshot[field]);
      }
      if (field === "creatorPageId" && !normalizedContext.entityId) {
        return Boolean(snapshot[field]);
      }
      return false;
    }

    if (field === "sourceLinks") {
      return snapshot[field].some((row) => row.url);
    }
    if (Array.isArray(snapshot[field])) {
      return snapshot[field].length > 0;
    }
    if (isPlainObject(snapshot[field])) {
      return Object.keys(snapshot[field]).length > 0;
    }
    return snapshot[field] !== (DEFAULT_SCALAR_VALUES[field] ?? "");
  });
}

export function serializeDraft(mode, draft = {}) {
  if (!Object.prototype.hasOwnProperty.call(MODE_FIELDS, mode) || !isPlainObject(draft)) {
    return null;
  }

  const snapshot = {};
  for (const field of MODE_FIELDS[mode]) {
    snapshot[field] = cloneKnownValue(draft[field]);
  }
  return snapshot;
}

export function loadStoredDraft(mode, context, storage) {
  const storageState = readStorageState(storage);
  if (!storageState) {
    return null;
  }

  const key = getDraftContextKey(mode, context);
  const record = storageState.envelope.drafts[key];
  if (!record) {
    return null;
  }

  if (!isValidRecord(record, mode, context)) {
    delete storageState.envelope.drafts[key];
    writeStorageState(storageState.storage, storageState.envelope);
    return null;
  }

  return cloneKnownValue(record.fields);
}

export function saveStoredDraft(mode, context, draft, storage) {
  const storageState = readStorageState(storage);
  if (!storageState) {
    return false;
  }

  const snapshot = serializeDraft(mode, draft);
  const normalizedContext = createDraftContext(context);
  if (!snapshot || !isValidFields(mode, snapshot) || !hasDraftContent(mode, snapshot, normalizedContext)) {
    return clearStoredDraft(mode, normalizedContext, storage);
  }

  const key = getDraftContextKey(mode, normalizedContext);
  storageState.envelope.drafts[key] = {
    mode,
    context: normalizedContext,
    fields: snapshot,
  };
  return writeStorageState(storageState.storage, storageState.envelope);
}

export function clearStoredDraft(mode, context, storage) {
  const storageState = readStorageState(storage);
  if (!storageState) {
    return false;
  }

  const key = getDraftContextKey(mode, context);
  if (!Object.prototype.hasOwnProperty.call(storageState.envelope.drafts, key)) {
    return true;
  }

  delete storageState.envelope.drafts[key];
  if (Object.keys(storageState.envelope.drafts).length === 0) {
    try {
      storageState.storage.removeItem(SUBMISSION_DRAFT_STORAGE_KEY);
      return true;
    } catch (_error) {
      return false;
    }
  }

  return writeStorageState(storageState.storage, storageState.envelope);
}

function normalizeContextValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveStorage(storage) {
  if (storage !== undefined) {
    return storage;
  }

  try {
    return globalThis.sessionStorage || null;
  } catch (_error) {
    return null;
  }
}

function readStorageState(storage) {
  const target = resolveStorage(storage);
  if (!target) {
    return null;
  }

  let rawValue;
  try {
    rawValue = target.getItem(SUBMISSION_DRAFT_STORAGE_KEY);
  } catch (_error) {
    return null;
  }

  if (rawValue === null) {
    return { storage: target, envelope: createEmptyEnvelope() };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch (_error) {
    removeStoredEnvelope(target);
    return { storage: target, envelope: createEmptyEnvelope() };
  }

  if (!isPlainObject(parsed) || parsed.schemaVersion !== SUBMISSION_DRAFT_SCHEMA_VERSION || !isPlainObject(parsed.drafts)) {
    removeStoredEnvelope(target);
    return { storage: target, envelope: createEmptyEnvelope() };
  }

  return { storage: target, envelope: parsed };
}

function writeStorageState(storage, envelope) {
  try {
    storage.setItem(SUBMISSION_DRAFT_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch (_error) {
    return false;
  }
}

function removeStoredEnvelope(storage) {
  try {
    storage.removeItem(SUBMISSION_DRAFT_STORAGE_KEY);
  } catch (_error) {
    // Storage is optional. A failed cleanup must not affect submission.
  }
}

function createEmptyEnvelope() {
  return {
    schemaVersion: SUBMISSION_DRAFT_SCHEMA_VERSION,
    drafts: {},
  };
}

function isValidRecord(record, mode, context) {
  return isPlainObject(record) &&
    record.mode === mode &&
    isValidContext(record.context, context) &&
    isValidFields(mode, record.fields);
}

function isValidContext(value, expected) {
  if (!isPlainObject(value)) {
    return false;
  }

  const actual = createDraftContext(value);
  const normalizedExpected = createDraftContext(expected);
  return actual.showId === normalizedExpected.showId && actual.entityId === normalizedExpected.entityId &&
    typeof value.showId === "string" && typeof value.entityId === "string";
}

function isValidFields(mode, fields) {
  if (!isPlainObject(fields) || !Object.prototype.hasOwnProperty.call(MODE_FIELDS, mode)) {
    return false;
  }

  const expectedFields = MODE_FIELDS[mode];
  const actualFields = Object.keys(fields).sort();
  if (actualFields.length !== expectedFields.length || !expectedFields.every((field) => actualFields.includes(field))) {
    return false;
  }

  for (const field of expectedFields) {
    const value = fields[field];
    if (typeof value === "string") {
      continue;
    }
    if (ARRAY_STRING_FIELDS.has(field) && isStringArray(value)) {
      continue;
    }
    if (LINK_FIELDS.has(field) && isLinkArray(value, true)) {
      continue;
    }
    if (SOURCE_FIELDS.has(field) && isLinkArray(value, false)) {
      continue;
    }
    if (field === "categoryScores" && isCategoryScores(value)) {
      continue;
    }
    if (field === "ratingStars" && Number.isInteger(value) && value >= 0 && value <= 5) {
      continue;
    }
    return false;
  }

  return true;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isLinkArray(value, includesLabel) {
  return Array.isArray(value) && value.every((row) => {
    if (!isPlainObject(row) || typeof row.url !== "string") {
      return false;
    }
    if (includesLabel && typeof row.label !== "string") {
      return false;
    }
    return Object.keys(row).every((key) => key === "url" || (includesLabel && key === "label"));
  });
}

function isCategoryScores(value) {
  return isPlainObject(value) && Object.values(value).every((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 10);
}

function cloneKnownValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneKnownValue(entry));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneKnownValue(entry)]));
  }
  return value;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
