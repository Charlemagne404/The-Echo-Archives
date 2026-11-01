const { createHash } = require("node:crypto");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function hashValue(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function candidateContentProjection(candidate = {}) {
  const readiness = candidate.readiness || {};
  return {
    id: candidate.id || "",
    status: candidate.status || "",
    mode: candidate.mode || "",
    existingShowId: candidate.existingShowId || "",
    title: candidate.title || "",
    creatorName: candidate.creatorName || "",
    inputRevision: Number(candidate.inputRevision) || 0,
    scopeStatus: candidate.scopeStatus || "",
    objective: candidate.objective || {},
    provenance: candidate.provenance || {},
    dedupe: candidate.dedupe || {},
    preparedRecord: candidate.preparedRecord || {},
    readiness: {
      ready: Boolean(readiness.ready),
      blockers: readiness.blockers || [],
      warnings: readiness.warnings || [],
      updateDiff: readiness.updateDiff || [],
    },
    conflicts: candidate.conflicts || [],
    sourceHealth: candidate.sourceHealth || {},
    lockedFields: candidate.lockedFields || [],
    coverStage: candidate.coverStage || {},
    sources: (candidate.sources || []).map((source) => ({
      id: source.id,
      sourceType: source.sourceType,
      sourceKey: source.sourceKey,
      sourceUrl: source.sourceUrl,
      fetchStatus: source.fetchStatus,
      normalized: source.normalized || {},
      error: source.error || "",
      fetchedAt: source.fetchedAt || "",
    })),
    fieldEvidence: (candidate.fieldEvidence || []).map((evidence) => ({
      id: evidence.id,
      fieldName: evidence.fieldName,
      value: evidence.value,
      normalizedValue: evidence.normalizedValue,
      sourceSnapshotId: evidence.sourceSnapshotId,
      sourceType: evidence.sourceType,
      sourceUrl: evidence.sourceUrl,
      confidence: evidence.confidence,
      method: evidence.method,
      status: evidence.status,
      selected: Boolean(evidence.selected),
      observedAt: evidence.observedAt || "",
    })),
  };
}

function candidateContentHash(candidate) {
  return hashValue(candidateContentProjection(candidate));
}

function factualReviewState(candidate = {}) {
  return {
    factsReviewedBy: candidate.factsReviewedBy || "",
    factsReviewedAt: candidate.factsReviewedAt || "",
    factsReviewedRevision: Number(candidate.factsReviewedRevision) || 0,
  };
}

module.exports = {
  candidateContentHash,
  candidateContentProjection,
  factualReviewState,
  hashValue,
  stableStringify,
};
