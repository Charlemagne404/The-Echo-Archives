const { createHash } = require("node:crypto");

const { HUMAN_OWNED_FIELDS, MANAGED_FIELDS, managedFingerprints } = require("./draft");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function isNonEmpty(value) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function mergePreparedWithExisting(preparedRecord, existingRecord, { adoptedFields = [], reviewerLocks = [] } = {}) {
  if (!existingRecord) return { record: preparedRecord, lockedFields: [], diff: [] };
  const next = clone(existingRecord);
  const previousFingerprints = existingRecord.metadata?.import?.managedFingerprints || {};
  const adopted = new Set(adoptedFields);
  const locks = new Set(reviewerLocks);
  const diff = [];

  MANAGED_FIELDS.forEach((field) => {
    const existingValue = existingRecord[field];
    const preparedValue = preparedRecord[field];
    const wasManaged = Boolean(previousFingerprints[field]);
    const humanChanged = wasManaged && fingerprint(existingValue) !== previousFingerprints[field];
    const legacyOwned = !wasManaged && isNonEmpty(existingValue) && !adopted.has(field);
    if (locks.has(field) || humanChanged || legacyOwned) {
      locks.add(field);
      return;
    }
    if (fingerprint(existingValue) !== fingerprint(preparedValue)) {
      diff.push({ field, before: existingValue, after: preparedValue });
    }
    next[field] = clone(preparedValue);
  });

  HUMAN_OWNED_FIELDS.forEach((field) => {
    if (Object.hasOwn(existingRecord, field)) next[field] = clone(existingRecord[field]);
  });
  next.id = existingRecord.id;
  next.status = existingRecord.status || preparedRecord.status;
  next.reviewStatus = existingRecord.reviewStatus || preparedRecord.reviewStatus;
  next.createdAt = existingRecord.createdAt || preparedRecord.createdAt;
  next.updatedAt = preparedRecord.updatedAt;
  next.metadata = {
    ...(existingRecord.metadata || {}),
    ...(preparedRecord.metadata || {}),
    import: {
      ...(preparedRecord.metadata?.import || {}),
      managedFingerprints: {},
      automaticallyLockedFields: [...locks],
    },
  };
  next.metadata.import.managedFingerprints = managedFingerprints(next);
  return { record: next, lockedFields: [...locks], diff };
}

module.exports = { mergePreparedWithExisting };
