const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");

const { collectCatalogIntegrityIssues } = require("../../backend/lib/catalog-integrity");
const { resolveShowEntities } = require("../../shared/archive-entities");
const { createSimilarityIndex } = require("../../shared/archive-similarity");
const {
  DISCOVERY_PROFILE_VALUES,
  isValidDiscoveryProfileValue,
} = require("./catalog-schema");
const {
  buildDiscoveryQualityReport,
  getEnrichmentEligibleShows,
  getPublishedShows,
} = require("./discovery-quality-report");
const {
  readCatalogSource,
  readJsonFile,
  writeShowRecordsAtomically,
} = require("./catalog-source");

const PREFERRED_TONES = Object.freeze([
  "dark",
  "bleak",
  "tense",
  "warm",
  "funny",
  "chaotic",
  "hopeful",
  "cinematic",
  "weird",
  "melancholic",
]);

// `warm-weird` is already present in authored records. Keep it accepted while
// the schema's preferred list catches up, rather than making an existing
// curated value impossible to retain through this tool.
const PREFERRED_BEST_FOR = Object.freeze([
  "long-walks",
  "binge-listening",
  "late-night",
  "headphones-on",
  "worldbuilding",
  "easy-entry",
  "serious-sci-fi",
  "funny-space-disasters",
  "cold-isolation-horror",
  "short-under-five-hours",
  "warm-weird",
]);

const EDITABLE_FIELDS = Object.freeze([
  "discovery.voiceStyle",
  "discovery.narrativeFocus",
  "discovery.intensity",
  "discovery.commitment",
  "tones",
  "themes",
  "bestFor",
  "similarTo",
]);

const FIELD_ALIASES = Object.freeze({
  "voice-style": "discovery.voiceStyle",
  voiceStyle: "discovery.voiceStyle",
  "narrative-focus": "discovery.narrativeFocus",
  narrativeFocus: "discovery.narrativeFocus",
  intensity: "discovery.intensity",
  commitment: "discovery.commitment",
  tones: "tones",
  themes: "themes",
  "best-for": "bestFor",
  bestFor: "bestFor",
  "similar-to": "similarTo",
  similarTo: "similarTo",
});

const SHORT_OPTION_FIELDS = Object.freeze({
  "voice-style": "discovery.voiceStyle",
  "narrative-focus": "discovery.narrativeFocus",
  intensity: "discovery.intensity",
  commitment: "discovery.commitment",
  tones: "tones",
  themes: "themes",
  "best-for": "bestFor",
});

const PROFILE_FIELDS = new Set(Object.keys(DISCOVERY_PROFILE_VALUES));

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLocaleLowerCase();
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return normalizeText(value).length > 0;
}

function getPathValue(record, fieldPath) {
  return fieldPath.split(".").reduce((current, key) => current?.[key], record);
}

function parseListValue(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
  const text = normalizeText(value);
  return text ? text.split(",").map(normalizeText).filter(Boolean) : [];
}

function assertUniqueValues(values, fieldName) {
  const seen = new Set();
  values.forEach((value) => {
    const key = normalizeKey(value);
    if (!key) throw new Error(`${fieldName} cannot contain blank values.`);
    if (seen.has(key)) throw new Error(`${fieldName} contains a duplicate value: "${value}".`);
    seen.add(key);
  });
}

function normalizeFieldName(fieldName) {
  const normalized = normalizeText(fieldName);
  if (FIELD_ALIASES[normalized]) return FIELD_ALIASES[normalized];
  if (normalized.startsWith("discovery.")) {
    const profileField = normalized.slice("discovery.".length);
    if (PROFILE_FIELDS.has(profileField)) return normalized;
  }
  if (normalized.startsWith("similarReasons.") && normalizeText(normalized.slice("similarReasons.".length))) {
    return normalized;
  }
  throw new Error(`Unsupported enrichment field "${fieldName}". Supported fields: ${EDITABLE_FIELDS.join(", ")}.`);
}

function parseAssignment(value) {
  const text = normalizeText(value);
  const separator = text.indexOf("=");
  if (separator <= 0) {
    throw new Error(`Expected FIELD=VALUE, received "${value}".`);
  }
  return {
    field: normalizeFieldName(text.slice(0, separator)),
    value: text.slice(separator + 1).trim(),
  };
}

function parseSimilarAssignment(value) {
  const text = normalizeText(value);
  const separator = text.indexOf("=");
  if (separator <= 0 || !text.slice(separator + 1).trim()) {
    throw new Error(`Expected SHOW_ID=REASON for --similar, received "${value}".`);
  }
  return {
    id: text.slice(0, separator).trim(),
    reason: text.slice(separator + 1).trim(),
  };
}

function validateControlledValue(fieldName, value) {
  if (!isValidDiscoveryProfileValue(fieldName, value)) {
    throw new Error(
      `discovery.${fieldName} must be one of: ${DISCOVERY_PROFILE_VALUES[fieldName].join(", ")}.`,
    );
  }
}

function validateArrayField(fieldName, values, { knownShowIds = new Set(), showId = "" } = {}) {
  if (!Array.isArray(values)) throw new Error(`${fieldName} must be a list.`);
  assertUniqueValues(values, fieldName);

  if (fieldName === "tones") {
    const allowed = new Set(PREFERRED_TONES);
    const invalid = values.filter((value) => !allowed.has(value));
    if (invalid.length) {
      throw new Error(`tones contains unsupported value(s): ${invalid.join(", ")}. Allowed values: ${PREFERRED_TONES.join(", ")}.`);
    }
  }

  if (fieldName === "bestFor") {
    const allowed = new Set(PREFERRED_BEST_FOR);
    const invalid = values.filter((value) => !allowed.has(value));
    if (invalid.length) {
      throw new Error(`bestFor contains unsupported value(s): ${invalid.join(", ")}. Allowed values: ${PREFERRED_BEST_FOR.join(", ")}.`);
    }
  }

  if (fieldName === "similarTo") {
    const invalid = values.filter((value) => !knownShowIds.has(value));
    if (invalid.length) throw new Error(`similarTo references unknown published show id(s): ${invalid.join(", ")}.`);
    if (showId && values.includes(showId)) throw new Error("A show cannot be similar to itself.");
  }
}

function createEmptyUpdates() {
  return {
    discovery: {},
    fields: {},
    similarReasons: {},
    replaceSimilarReasons: false,
  };
}

function addFieldUpdate(updates, fieldName, rawValue) {
  if (fieldName.startsWith("discovery.")) {
    updates.discovery[fieldName.slice("discovery.".length)] = normalizeText(rawValue);
    return;
  }

  if (fieldName.startsWith("similarReasons.")) {
    updates.similarReasons[fieldName.slice("similarReasons.".length)] = normalizeText(rawValue);
    return;
  }

  updates.fields[fieldName] = parseListValue(rawValue);
}

function buildEnrichmentUpdates({ assignments = [], clears = [], similar = [] } = {}, show, options = {}) {
  const currentShow = show || {};
  if (currentShow.reviewStatus === "imported") {
    throw new Error(`Show "${currentShow.id || "unknown"}" is imported/factual-only and cannot receive curated discovery values.`);
  }
  const knownShowIds = options.knownShowIds || new Set();
  const updates = createEmptyUpdates();

  assignments.forEach((assignment) => {
    const parsed = typeof assignment === "string" ? parseAssignment(assignment) : {
      field: normalizeFieldName(assignment.field),
      value: normalizeText(assignment.value),
    };
    addFieldUpdate(updates, parsed.field, parsed.value);
  });

  clears.forEach((fieldValue) => {
    const fieldName = normalizeFieldName(fieldValue);
    if (fieldName.startsWith("similarReasons.")) {
      throw new Error(`Do not clear an individual similarity reason; clear or replace similarTo instead.`);
    }
    addFieldUpdate(updates, fieldName, "");
  });

  const similarEntries = similar.map((entry) => typeof entry === "string" ? parseSimilarAssignment(entry) : entry);
  if (similarEntries.length) {
    const existingIds = parseListValue(currentShow.similarTo);
    const entryIds = similarEntries.map((entry) => normalizeText(entry.id));
    assertUniqueValues(entryIds, "similar");
    const ids = [...existingIds, ...entryIds.filter((id) => !existingIds.includes(id))];
    validateArrayField("similarTo", ids, { knownShowIds, showId: currentShow.id });
    const reasons = {};
    similarEntries.forEach((entry) => {
      const id = normalizeText(entry.id);
      const reason = normalizeText(entry.reason);
      if (!reason) throw new Error(`Similarity reason for "${id}" cannot be blank.`);
      reasons[id] = reason;
    });
    updates.fields.similarTo = ids;
    updates.similarReasons = reasons;
  }

  Object.entries(updates.discovery).forEach(([fieldName, value]) => {
    if (value) validateControlledValue(fieldName, value);
  });

  Object.entries(updates.fields).forEach(([fieldName, values]) => {
    validateArrayField(fieldName, values, { knownShowIds, showId: currentShow.id });
  });

  const finalSimilarTo = Object.hasOwn(updates.fields, "similarTo")
    ? updates.fields.similarTo
    : parseListValue(currentShow.similarTo);
  const proposedSimilarReasons = updates.replaceSimilarReasons
    ? { ...updates.similarReasons }
    : { ...(currentShow.similarReasons || {}), ...updates.similarReasons };
  const finalSimilarReasons = Object.hasOwn(updates.fields, "similarTo")
    ? Object.fromEntries(Object.entries(proposedSimilarReasons).filter(([id]) => finalSimilarTo.includes(id)))
    : proposedSimilarReasons;

  if (knownShowIds.size) {
    validateArrayField("similarTo", finalSimilarTo, { knownShowIds, showId: currentShow.id });
  }

  Object.entries(finalSimilarReasons).forEach(([id, reason]) => {
    if (!finalSimilarTo.includes(id)) {
      throw new Error(`Similarity reason for "${id}" has no matching similarTo relationship.`);
    }
    if (!normalizeText(reason)) throw new Error(`Similarity reason for "${id}" cannot be blank.`);
  });
  finalSimilarTo.forEach((id) => {
    if (!normalizeText(finalSimilarReasons[id])) {
      throw new Error(`similarTo relationship for "${id}" needs an explicit reason.`);
    }
  });

  const hasSimilarUpdate = Object.hasOwn(updates.fields, "similarTo") || Object.keys(updates.similarReasons).length > 0;
  if (hasSimilarUpdate) {
    updates.similarReasons = finalSimilarReasons;
    updates.replaceSimilarReasons = true;
  }

  return updates;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatDiffValue(value) {
  if (!hasValue(value)) return "(missing)";
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function applyEnrichmentUpdates(show, updates, { now = new Date().toISOString().slice(0, 10) } = {}) {
  const before = show || {};
  const next = { ...before };

  Object.entries(updates.fields || {}).forEach(([fieldName, values]) => {
    next[fieldName] = [...values];
  });

  if (Object.keys(updates.discovery || {}).length) {
    const discovery = { ...(before.discovery || {}) };
    Object.entries(updates.discovery).forEach(([fieldName, value]) => {
      if (value) discovery[fieldName] = value;
      else delete discovery[fieldName];
    });
    if (Object.keys(discovery).length) next.discovery = discovery;
    else delete next.discovery;
  }

  if (updates.replaceSimilarReasons) {
    next.similarReasons = { ...updates.similarReasons };
  }

  const changes = [];
  EDITABLE_FIELDS.forEach((fieldPath) => {
    const beforeValue = getPathValue(before, fieldPath);
    const afterValue = getPathValue(next, fieldPath);
    if (!valuesEqual(beforeValue, afterValue)) {
      changes.push({ path: fieldPath, before: beforeValue, after: afterValue });
    }
  });

  if (updates.replaceSimilarReasons && !valuesEqual(before.similarReasons, next.similarReasons)) {
    changes.push({ path: "similarReasons", before: before.similarReasons, after: next.similarReasons });
  }

  if (changes.length) {
    next.updatedAt = now;
    if (before.updatedAt !== next.updatedAt) {
      changes.push({ path: "updatedAt", before: before.updatedAt, after: next.updatedAt });
    }
  }

  return { record: next, changes };
}

function getMissingDiscoveryFields(show = {}) {
  return Object.keys(DISCOVERY_PROFILE_VALUES).filter((fieldName) => !hasValue(show.discovery?.[fieldName]));
}

function getMissingEditableFields(show = {}) {
  return [
    ...getMissingDiscoveryFields(show).map((fieldName) => `discovery.${fieldName}`),
    ...["tones", "themes", "bestFor", "similarTo"].filter((fieldName) => !hasValue(show[fieldName])),
  ];
}

function getCollectionsForShow(showId, collections = []) {
  return collections.filter((collection) => Array.isArray(collection?.showIds) && collection.showIds.includes(showId));
}

function getIncomingSimilarityLinks(showId, shows = []) {
  return shows
    .filter((show) => show?.id !== showId && Array.isArray(show?.similarTo) && show.similarTo.includes(showId))
    .map((show) => ({
      id: show.id,
      title: show.title || show.id,
      reason: normalizeText(show.similarReasons?.[showId]),
    }));
}

function getSimilarityCandidates(show, shows = [], collections = [], limit = 3) {
  // Similarity comparison is read-only here. Supplying an empty rating map
  // keeps the shared helper total for factual-only records that legitimately
  // omit ratings; missing ratings are not used as curation evidence.
  const similarityShows = shows.map((candidate) => ({
    ...candidate,
    ratings: candidate?.ratings && typeof candidate.ratings === "object" && !Array.isArray(candidate.ratings)
      ? candidate.ratings
      : {},
  }));
  const index = createSimilarityIndex({ shows: similarityShows, collections });
  const existing = new Set(parseListValue(show?.similarTo));
  return index.getSimilarShows(show?.id, { limit: Math.max(limit + existing.size, limit) })
    .filter(({ show: candidate }) => !existing.has(candidate.id))
    .slice(0, limit)
    .map(({ show: candidate, similarity }) => ({
      id: candidate.id,
      title: candidate.title || candidate.id,
      score: similarity.score,
      maxScore: similarity.maxScore,
      metadataCoverage: similarity.metadataCoverage,
      reasons: similarity.reasons.slice(0, 3).map((reason) => reason.text),
    }));
}

function getPriorityEntry(report, showId) {
  const candidateIndex = report.enrichmentPriorities.candidateIds.indexOf(showId);
  const candidate = report.enrichmentPriorities.sample.find((entry) => entry.id === showId) || null;
  return candidateIndex < 0 ? null : {
    ...candidate,
    position: candidateIndex + 1,
    total: report.enrichmentPriorities.candidateCount,
  };
}

function selectNextCandidate({ report, shows = [], showId = "", excludedIds = [] } = {}) {
  const showById = new Map(shows.map((show) => [show.id, show]));
  if (showId) {
    const show = showById.get(showId);
    if (!show) throw new Error(`No show found for id "${showId}".`);
    return { show, priority: getPriorityEntry(report, showId) };
  }

  const excluded = new Set(excludedIds);
  const nextId = report.enrichmentPriorities.candidateIds.find((id) => !excluded.has(id));
  if (!nextId) return null;
  return { show: showById.get(nextId), priority: getPriorityEntry(report, nextId) };
}

function buildShowContext({ show, priority = null, report, shows = [], collections = [], entities = [], similarityLimit = 3 } = {}) {
  const publicEntities = entities.filter((entity) => entity?.publication === "public");
  const entityById = new Map(publicEntities.map((entity) => [entity.id, entity]));
  const entityRelationships = (Array.isArray(show?.entityLinks) ? show.entityLinks : []).map((link) => ({
    id: link.entityId,
    name: entityById.get(link.entityId)?.name || link.entityId,
    type: entityById.get(link.entityId)?.type || "unknown",
    role: link.role || "unknown",
    resolved: entityById.has(link.entityId),
  }));
  const publishedShows = getPublishedShows(shows);

  return {
    show,
    priority,
    missingDiscoveryFields: getMissingDiscoveryFields(show),
    missingEditableFields: getMissingEditableFields(show),
    collections: getCollectionsForShow(show.id, collections),
    entityRelationships,
    outgoingSimilarity: parseListValue(show.similarTo).map((id) => {
      const target = publishedShows.find((candidate) => candidate.id === id);
      return { id, title: target?.title || id, reason: normalizeText(show.similarReasons?.[id]) };
    }),
    incomingSimilarity: getIncomingSimilarityLinks(show.id, publishedShows),
    similarityCandidates: getSimilarityCandidates(show, publishedShows, collections, similarityLimit),
    creators: Array.isArray(show.creators) ? show.creators : [],
    resolvedCreators: resolveShowEntities(show, publicEntities).filter((entity) => entity.role === "creator"),
    qualityMissing: priority?.missing || [],
    enrichmentEligible: getEnrichmentEligibleShows(publishedShows).some((candidate) => candidate.id === show.id),
    report,
  };
}

function loadEnrichmentData(siteRoot) {
  const resolvedRoot = path.resolve(siteRoot);
  const sourceData = readCatalogSource(resolvedRoot);
  if (sourceData.mode !== "split") {
    throw new Error("Canonical catalog-src/ is required; refusing to edit generated runtime data.");
  }
  const entitySourcePath = path.join(resolvedRoot, "catalog-src", "entities.json");
  const generatedEntityPath = path.join(resolvedRoot, "data", "entities.json");
  const entityPath = fs.existsSync(entitySourcePath) ? entitySourcePath : generatedEntityPath;
  const entities = fs.existsSync(entityPath) ? readJsonFile(entityPath) : [];
  if (!Array.isArray(entities)) throw new Error(`${path.relative(resolvedRoot, entityPath)} must contain an array.`);

  const taxonomyPath = path.join(resolvedRoot, "catalog-src", "tag-taxonomy.json");
  const generatedTaxonomyPath = path.join(resolvedRoot, "data", "tag-taxonomy.json");
  const resolvedTaxonomyPath = fs.existsSync(taxonomyPath) ? taxonomyPath : generatedTaxonomyPath;
  const taxonomy = fs.existsSync(resolvedTaxonomyPath) ? readJsonFile(resolvedTaxonomyPath) : { tags: [] };
  const report = buildDiscoveryQualityReport({
    shows: sourceData.shows,
    collections: sourceData.collections,
    entities,
    taxonomy,
  }, {
    inputSummary: {
      shows: sourceData.mode === "split" ? "catalog-src/shows" : "data/shows.json",
      collections: sourceData.mode === "split" ? "catalog-src/collections" : "data/collections.json",
      entities: path.relative(resolvedRoot, entityPath),
    },
    // The report's candidateIds is the authoritative order. Keep the sample
    // complete so an explicitly selected lower-ranked candidate still has its
    // exact report entry available for display.
    sampleLimit: Math.max(1, sourceData.shows.length),
  });

  return { siteRoot: resolvedRoot, sourceData, entities, taxonomy, report };
}

function writeEnrichedShow({ siteRoot, sourceData, entities = [], originalShow, updatedShow, validate = true } = {}) {
  if (!originalShow || !updatedShow || originalShow.id !== updatedShow.id) {
    throw new Error("The original and updated show records must refer to the same show.");
  }
  if (!sourceData || sourceData.mode !== "split") {
    throw new Error("Canonical catalog-src/ is required; refusing to edit generated runtime data.");
  }

  const currentSourceData = readCatalogSource(siteRoot);
  if (currentSourceData.mode !== "split") {
    throw new Error("Canonical catalog-src/ is required; refusing to edit generated runtime data.");
  }
  const currentShow = currentSourceData.shows.find((show) => show.id === originalShow.id);
  if (!currentShow) throw new Error(`Source record for "${originalShow.id}" no longer exists; reload the queue.`);
  if (!isDeepStrictEqual(currentShow, originalShow)) {
    throw new Error(`Source record for "${originalShow.id}" changed after selection; reload it before writing.`);
  }

  const nextSourceData = {
    ...currentSourceData,
    shows: currentSourceData.shows.map((show) => show.id === originalShow.id ? updatedShow : show),
  };

  if (validate) {
    const validation = collectCatalogIntegrityIssues({ sourceData: nextSourceData, entities });
    if (!validation.ok) {
      throw new Error(`Refusing to write invalid catalog data:\n- ${validation.errors.join("\n- ")}`);
    }
  }

  const result = writeShowRecordsAtomically(siteRoot, [updatedShow]);
  const expectedPath = path.join(siteRoot, "catalog-src", "shows", `${updatedShow.id}.json`);
  const unexpectedPaths = result.changedPaths.filter((changedPath) => path.resolve(changedPath) !== path.resolve(expectedPath));
  if (unexpectedPaths.length) {
    result.rollback();
    throw new Error(`Refusing to leave unrelated files changed: ${unexpectedPaths.join(", ")}`);
  }

  return result;
}

module.exports = {
  EDITABLE_FIELDS,
  FIELD_ALIASES,
  PREFERRED_BEST_FOR,
  PREFERRED_TONES,
  SHORT_OPTION_FIELDS,
  applyEnrichmentUpdates,
  buildEnrichmentUpdates,
  buildShowContext,
  formatDiffValue,
  getMissingDiscoveryFields,
  getMissingEditableFields,
  getPriorityEntry,
  loadEnrichmentData,
  normalizeFieldName,
  parseAssignment,
  parseListValue,
  parseSimilarAssignment,
  selectNextCandidate,
  writeEnrichedShow,
};
