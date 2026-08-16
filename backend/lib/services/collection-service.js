const { buildCatalog } = require("../../../tools/build-catalog");
const { readCatalogSource, writeCollectionRecordsAtomically } = require("../../../tools/lib/catalog-source");
const { loadCatalog } = require("../catalog");
const { createSemanticCollectionService } = require("../collections/semantic-service");

const AUTOMATED_KINDS = new Set(["rule-based", "semantic"]);
const EDITORIAL_KINDS = new Set(["curated", "editorial", "similarity"]);
const ALLOWED_FIELDS = new Set([
  "genres", "tones", "formats", "tags", "themes", "languages",
  "completionStatus", "releaseStatus", "reviewStatus", "content.setting", "facts.structure", "facts.narrator",
]);
const ALLOWED_OPERATORS = new Set(["equals", "includes", "contains"]);
const MAX_RULE_CLAUSES = 3;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, limit = 240) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function normalizeValue(value) {
  return cleanText(value, 240).toLowerCase().replace(/[\s_]+/g, "-");
}

function slugify(value) {
  return normalizeValue(value)
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleize(value) {
  const labels = { "sci-fi": "Sci-Fi", "full-cast": "Full-Cast" };
  const normalized = String(value || "").trim();
  return labels[normalized] || normalized.split(/[\s-]+/).filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function valueAtPath(show, field) {
  return String(field || "").split(".").reduce((value, key) => value && typeof value === "object" ? value[key] : undefined, show);
}

function validateClause(clause) {
  const field = cleanText(clause?.field, 80);
  const operator = cleanText(clause?.operator || "includes", 32).toLowerCase();
  const value = cleanText(clause?.value, 160);
  if (!ALLOWED_FIELDS.has(field) || !ALLOWED_OPERATORS.has(operator) || !value) {
    throw new Error("Collection rules may only use supported factual catalogue fields and simple operators.");
  }
  return { field, operator, value };
}

function normalizeCriteria(value = {}) {
  const criteria = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalizeGroup = (items) => asArray(items).map(validateClause);
  const normalized = {
    all: normalizeGroup(criteria.all),
    any: normalizeGroup(criteria.any),
    not: normalizeGroup(criteria.not),
  };
  const count = normalized.all.length + normalized.any.length + normalized.not.length;
  if (!count || count > MAX_RULE_CLAUSES) {
    throw new Error(`Collection rules need between 1 and ${MAX_RULE_CLAUSES} simple criteria.`);
  }
  return normalized;
}

function normalizeAutomation(value = {}, kind = "") {
  const automation = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const mode = cleanText(automation.mode || (kind === "semantic" ? "semantic" : "rule"), 32).toLowerCase();
  if (mode === "rule") {
    return { mode, criteria: normalizeCriteria(automation.criteria), minMatches: Number(automation.minMatches) || undefined };
  }
  if (mode === "semantic") {
    const query = cleanText(automation.query, 240);
    if (!query) throw new Error("Semantic collections need a plain-language collection concept.");
    return { mode, query, minMatches: Number(automation.minMatches) || undefined };
  }
  throw new Error("Collection automation mode must be rule or semantic.");
}

function clauseMatches(show, clause) {
  const target = normalizeValue(clause.value);
  const raw = valueAtPath(show, clause.field);
  const values = Array.isArray(raw) ? raw : [raw];
  return values.filter((value) => value !== undefined && value !== null).some((value) => {
    const normalized = normalizeValue(value);
    if (clause.operator === "equals") return normalized === target;
    if (clause.operator === "contains") return normalized.includes(target);
    return normalized === target || normalized.includes(target);
  });
}

function ruleMatches(show, criteria) {
  if (!show || show.status !== "published") return false;
  const all = criteria.all.every((clause) => clauseMatches(show, clause));
  const any = criteria.any.length === 0 || criteria.any.some((clause) => clauseMatches(show, clause));
  const excluded = criteria.not.some((clause) => clauseMatches(show, clause));
  return all && any && !excluded;
}

function criterionLabel(clause) {
  if (clause.field === "completionStatus") return clause.value === "finished" ? "completed" : clause.value;
  if (clause.field === "releaseStatus") return clause.value;
  return titleize(clause.value);
}

function ruleReason(criteria) {
  const positive = [...criteria.all, ...criteria.any].map(criterionLabel).filter(Boolean);
  return `Rule match: ${positive.join(" + ") || "catalogue criteria"}.`;
}

function stableCriteriaKey(criteria) {
  const groups = ["all", "any", "not"].map((key) => asArray(criteria[key])
    .map((clause) => `${clause.field}:${clause.operator}:${normalizeValue(clause.value)}`).sort().join(","));
  return groups.join("|");
}

function wordSet(value) {
  return new Set(normalizeValue(value).split("-").filter((word) => word.length > 2));
}

function jaccard(left, right) {
  const a = left instanceof Set ? left : new Set(left || []);
  const b = right instanceof Set ? right : new Set(right || []);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  a.forEach((item) => { if (b.has(item)) overlap += 1; });
  return overlap / (a.size + b.size - overlap);
}

function sameMembers(left, right) {
  return jaccard(new Set(left || []), new Set(right || []));
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mapsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectionSourceKind(collection) {
  const kind = cleanText(collection?.kind, 40).toLowerCase();
  if (kind === "rule-based" || collection?.automation?.mode === "rule") return "rule";
  if (kind === "semantic" || collection?.automation?.mode === "semantic") return "semantic";
  return "editorial";
}

function ensureCollectionId(value) {
  const id = slugify(value);
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("Collection id must be a lowercase slug.");
  return id;
}

function collectionReasonForMembership(membership) {
  return cleanText(membership?.reason?.summary || membership?.reason?.text || "", 420);
}

function createCollectionService({
  store,
  staticRoot,
  config = {},
  fetchImpl = globalThis.fetch,
  onPublished = null,
  loadCatalogImpl = loadCatalog,
  buildCatalogImpl = buildCatalog,
} = {}) {
  if (!store || !staticRoot) throw new Error("Collection service requires a store and static root.");
  const semantic = createSemanticCollectionService({ config, fetchImpl });
  const minMatches = Math.max(2, Number(config.COLLECTION_MIN_MATCHES) || 4);
  const publishThreshold = Number(config.COLLECTION_SEMANTIC_CONFIDENCE) || 0.78;
  const borderlineThreshold = Number(config.COLLECTION_SEMANTIC_BORDERLINE_CONFIDENCE) || 0.65;

  async function catalog() {
    const records = await loadCatalogImpl(staticRoot);
    return records.filter((show) => show.status === "published");
  }

  function sourceCollections() {
    return readCatalogSource(staticRoot).collections;
  }

  function knownCollection(collectionId) {
    const collection = sourceCollections().find((entry) => entry.id === collectionId);
    if (!collection) {
      const error = new Error(`Unknown collection "${collectionId}".`);
      error.statusCode = 404;
      throw error;
    }
    return collection;
  }

  function detailForCollection(collection, catalogRecords) {
    const showsById = new Map(catalogRecords.map((show) => [show.id, show]));
    const memberships = store.listMemberships(collection.id);
    const fallbackMemberships = memberships.length > 0 ? memberships : asArray(collection.showIds).map((showId, rank) => ({
      collectionId: collection.id,
      showId,
      state: "active",
      sourceType: "editorial",
      confidence: null,
      reason: { summary: collection.showReasons?.[showId] || "Editorial inclusion." },
      rank,
    }));
    return {
      collection,
      memberships: fallbackMemberships.map((membership) => ({ ...membership, show: showsById.get(membership.showId) || null })),
      overrides: store.listOverrides(collection.id),
      events: store.listEvents({ collectionId: collection.id, limit: 100 }),
    };
  }

  function candidateConflicts(candidate, collections, candidates) {
    const candidateTitle = wordSet(candidate.title);
    const candidateShowIds = candidate.matchingShowIds || [];
    const candidateKey = candidate.definition?.automation?.mode === "rule"
      ? stableCriteriaKey(candidate.definition.automation.criteria)
      : "";
    const records = [
      ...collections.map((collection) => ({
        id: collection.id,
        title: collection.title,
        showIds: collection.showIds || [],
        key: collection.automation?.mode === "rule" ? stableCriteriaKey(collection.automation.criteria || {}) : "",
      })),
      ...candidates.filter((entry) => entry.status !== "rejected").map((entry) => ({
        id: entry.id,
        title: entry.title,
        showIds: entry.matchingShowIds || [],
        key: entry.definition?.automation?.mode === "rule" ? stableCriteriaKey(entry.definition.automation.criteria || {}) : "",
      })),
    ];
    return records.find((record) => (
      (candidateKey && record.key && candidateKey === record.key) ||
      jaccard(candidateTitle, wordSet(record.title)) >= 0.82 ||
      (candidateShowIds.length >= minMatches && sameMembers(candidateShowIds, record.showIds) >= 0.86)
    )) || null;
  }

  function ruleCandidate({ title, description, criteria, matchingShowIds, evidence }) {
    return {
      collectionType: "rule",
      title,
      description,
      definition: { automation: { mode: "rule", criteria, minMatches } },
      matchingShowIds,
      confidence: 1,
      evidence,
    };
  }

  function createRuleCandidates(catalogRecords) {
    const records = catalogRecords.filter((show) => show.status === "published");
    const candidates = [];
    const add = (title, description, criteria, evidence) => {
      const matchingShowIds = records.filter((show) => ruleMatches(show, criteria)).map((show) => show.id);
      if (matchingShowIds.length < minMatches) return;
      candidates.push(ruleCandidate({ title, description, criteria, matchingShowIds, evidence }));
    };

    const genres = [...new Set(records.flatMap((show) => asArray(show.genres)))].sort();
    genres.forEach((genre) => {
      add(
        `Completed ${titleize(genre)}`,
        `Finished ${titleize(genre)} audio dramas with a clear end point, generated from catalogue status and genre metadata.`,
        { all: [
          { field: "completionStatus", operator: "equals", value: "finished" },
          { field: "genres", operator: "includes", value: genre },
        ], any: [], not: [] },
        { strategy: "completion-plus-genre", fields: ["completionStatus", "genres"] },
      );
      add(
        `Ongoing ${titleize(genre)}`,
        `Active ${titleize(genre)} audio dramas for listeners who want a living story to follow.`,
        { all: [
          { field: "completionStatus", operator: "equals", value: "ongoing" },
          { field: "genres", operator: "includes", value: genre },
        ], any: [], not: [] },
        { strategy: "completion-plus-genre", fields: ["completionStatus", "genres"] },
      );
    });

    const formats = [...new Set(records.flatMap((show) => asArray(show.formats)))].sort();
    genres.forEach((genre) => formats.forEach((format) => {
      add(
        `${titleize(format)} ${titleize(genre)}`,
        `${titleize(format)} ${titleize(genre)} productions, generated from durable catalogue metadata rather than a loose genre rename.`,
        { all: [
          { field: "genres", operator: "includes", value: genre },
          { field: "formats", operator: "includes", value: format },
        ], any: [], not: [] },
        { strategy: "format-plus-genre", fields: ["formats", "genres"] },
      );
    }));

    return candidates
      .sort((left, right) => right.matchingShowIds.length - left.matchingShowIds.length || left.title.localeCompare(right.title))
      .slice(0, 40);
  }

  async function createSemanticCandidates(catalogRecords) {
    if (!semantic.enabled) return [];
    const concepts = await semantic.suggestConcepts({ shows: catalogRecords, existingCollections: sourceCollections() });
    return concepts.map((concept) => {
      const matches = concept.matches.filter((match) => match.confidence >= publishThreshold);
      return {
        collectionType: "semantic",
        title: concept.title,
        description: concept.description,
        definition: { automation: { mode: "semantic", query: concept.query, minMatches } },
        matchingShowIds: matches.map((match) => match.showId),
        confidence: concept.confidence,
        evidence: {
          strategy: "semantic-llm",
          rationale: concept.rationale,
          semanticMatches: concept.matches,
          provider: "ollama",
        },
      };
    }).filter((candidate) => candidate.matchingShowIds.length >= minMatches && candidate.confidence >= publishThreshold);
  }

  async function generateCandidates({ actor = "", includeSemantic = true } = {}) {
    const runId = store.createRun({ runType: "candidate-generation", input: { includeSemantic, actor } });
    try {
      const catalogRecords = await catalog();
      const collections = sourceCollections();
      const existingCandidates = store.listCandidates({ pageSize: 100 }).items;
      const candidates = [
        ...createRuleCandidates(catalogRecords),
        ...(includeSemantic ? await createSemanticCandidates(catalogRecords) : []),
      ];
      const proposed = [];
      const skipped = [];
      candidates.forEach((candidate) => {
        const conflict = candidateConflicts(candidate, collections, [...existingCandidates, ...proposed]);
        if (conflict) {
          skipped.push({ title: candidate.title, reason: `Near duplicate of ${conflict.title || conflict.id}.` });
          return;
        }
        const created = store.createCandidate({ ...candidate, createdBy: actor, status: "proposed" });
        store.recordEvent({ candidateId: created.id, eventType: "candidate-proposed", actor, payload: { evidence: candidate.evidence, matchingShowIds: candidate.matchingShowIds } });
        proposed.push(created);
      });
      const result = { runId, proposed, skipped, semanticEnabled: semantic.enabled };
      store.completeRun(runId, { summary: { proposed: proposed.length, skipped: skipped.length, semanticEnabled: semantic.enabled } });
      return result;
    } catch (error) {
      store.completeRun(runId, { status: "failed", errorText: cleanText(error.message || error, 2_000) });
      throw error;
    }
  }

  function updateCandidate(candidateId, updates = {}, actor = "") {
    const current = store.getCandidate(candidateId);
    if (!current) {
      const error = new Error("Collection candidate not found.");
      error.statusCode = 404;
      throw error;
    }
    if (current.status !== "proposed") {
      const error = new Error("Only proposed collection candidates can be edited.");
      error.statusCode = 409;
      throw error;
    }
    const collectionType = updates.collectionType ? cleanText(updates.collectionType, 32).toLowerCase() : current.collectionType;
    if (!new Set(["rule", "semantic"]).has(collectionType)) {
      const error = new Error("Collection candidate type must be rule or semantic.");
      error.statusCode = 400;
      throw error;
    }
    const definition = updates.definition ? {
      automation: normalizeAutomation(updates.definition.automation, collectionType === "semantic" ? "semantic" : "rule-based"),
    } : current.definition;
    const next = store.updateCandidate(candidateId, {
      collectionType,
      title: updates.title === undefined ? current.title : cleanText(updates.title, 100),
      description: updates.description === undefined ? current.description : cleanText(updates.description, 320),
      definition,
      reviewNotes: updates.reviewNotes === undefined ? current.reviewNotes : cleanText(updates.reviewNotes, 2_000),
    });
    store.recordEvent({ candidateId, eventType: "candidate-edited", actor, payload: { updates: Object.keys(updates) } });
    return next;
  }

  async function resolveSemanticRows(collection, catalogRecords, options = {}) {
    const existing = store.listMemberships(collection.id).filter((membership) => membership.sourceType === "semantic-match" || membership.sourceType === "ai-suggestion");
    const existingByShowId = new Map(existing.map((membership) => [membership.showId, membership]));
    const seedMatches = asArray(options.seedSemanticMatches?.[collection.id]);
    const targetIds = new Set(asArray(options.showIds));
    const shouldScore = options.forceSemantic || seedMatches.length > 0 || targetIds.size > 0;
    let scores = seedMatches;
    if (shouldScore && seedMatches.length === 0 && semantic.enabled) {
      const targetShows = options.forceSemantic || targetIds.size === 0
        ? catalogRecords
        : catalogRecords.filter((show) => targetIds.has(show.id));
      scores = await semantic.scoreMemberships({ query: collection.automation.query, shows: targetShows });
    }
    if (shouldScore && seedMatches.length === 0 && !semantic.enabled) {
      return { rows: existing, skipped: true };
    }

    const scoreById = new Map(scores.map((score) => [score.showId, score]));
    const keepExisting = options.forceSemantic || seedMatches.length > 0
      ? new Map()
      : new Map(existingByShowId);
    if (options.forceSemantic || seedMatches.length > 0) keepExisting.clear();
    targetIds.forEach((showId) => keepExisting.delete(showId));
    scores.forEach((score) => {
      if (score.confidence < borderlineThreshold) return;
      keepExisting.set(score.showId, {
        showId: score.showId,
        state: score.confidence >= publishThreshold ? "active" : "borderline",
        sourceType: seedMatches.length > 0 ? "ai-suggestion" : "semantic-match",
        confidence: score.confidence,
        reason: { summary: cleanText(score.reason || `Semantic match for ${collection.title}.`, 420), query: collection.automation.query },
      });
    });
    return { rows: [...keepExisting.values()], skipped: false, scored: scoreById.size };
  }

  async function calculateCollection(collection, catalogRecords, options = {}) {
    const kind = collectionSourceKind(collection);
    const catalogById = new Map(catalogRecords.map((show) => [show.id, show]));
    let generated = [];
    let semanticSkipped = false;
    if (kind === "rule") {
      const automation = normalizeAutomation(collection.automation, "rule-based");
      generated = catalogRecords.filter((show) => ruleMatches(show, automation.criteria)).map((show) => ({
        showId: show.id,
        state: "active",
        sourceType: "rule-match",
        confidence: 1,
        reason: { summary: ruleReason(automation.criteria), criteria: automation.criteria },
      }));
    } else if (kind === "semantic") {
      const semanticResult = await resolveSemanticRows(collection, catalogRecords, options);
      generated = semanticResult.rows;
      semanticSkipped = semanticResult.skipped;
    } else {
      generated = asArray(collection.showIds).filter((showId) => catalogById.has(showId)).map((showId) => ({
        showId,
        state: "active",
        sourceType: "editorial",
        confidence: null,
        reason: { summary: cleanText(collection.showReasons?.[showId] || "Editorial inclusion.", 420) },
      }));
    }

    if (collection.automation?.approvedCandidateId) {
      generated = generated.map((entry) => ({
        ...entry,
        reason: {
          ...(entry.reason || {}),
          approval: "editor-approved",
          approvedCandidateId: collection.automation.approvedCandidateId,
        },
      }));
    }

    const activeByShowId = new Map(generated.filter((entry) => entry.state === "active").map((entry) => [entry.showId, entry]));
    const borderlines = generated.filter((entry) => entry.state === "borderline");
    const overrides = store.listOverrides(collection.id);
    const pinIds = [];
    overrides.forEach((override) => {
      if (!catalogById.has(override.showId)) return;
      if (override.decision === "remove") {
        activeByShowId.delete(override.showId);
        return;
      }
      const sourceType = override.decision === "pin" ? "manual-pin" : "manual-addition";
      activeByShowId.set(override.showId, {
        showId: override.showId,
        state: "active",
        sourceType,
        confidence: null,
        reason: { summary: cleanText(override.reason || (override.decision === "pin" ? "Pinned by maintainer." : "Added by maintainer."), 420) },
      });
      if (override.decision === "pin") pinIds.push(override.showId);
    });

    const originalOrder = new Map(asArray(collection.showIds).map((showId, index) => [showId, index]));
    const orderedActive = [...activeByShowId.values()].sort((left, right) => {
      const leftPin = pinIds.includes(left.showId) ? 0 : 1;
      const rightPin = pinIds.includes(right.showId) ? 0 : 1;
      if (leftPin !== rightPin) return leftPin - rightPin;
      return (originalOrder.get(left.showId) ?? Number.MAX_SAFE_INTEGER) - (originalOrder.get(right.showId) ?? Number.MAX_SAFE_INTEGER)
        || left.showId.localeCompare(right.showId);
    }).map((entry, rank) => ({ ...entry, rank }));
    const membershipRows = [
      ...orderedActive,
      ...borderlines.filter((entry) => !activeByShowId.has(entry.showId)).map((entry, index) => ({ ...entry, rank: orderedActive.length + index })),
    ];
    const nextShowIds = orderedActive.map((entry) => entry.showId);
    const nextReasons = {};
    orderedActive.forEach((entry) => {
      const existingReason = cleanText(collection.showReasons?.[entry.showId], 420);
      nextReasons[entry.showId] = existingReason || collectionReasonForMembership(entry) || "Collection match.";
    });
    return { membershipRows, nextShowIds, nextReasons, semanticSkipped };
  }

  function captureSourceSnapshotOverrides(collection, catalogRecords, actor = "") {
    if (collectionSourceKind(collection) === "editorial") return;
    const stored = store.listMemberships(collection.id, { includeInactive: false });
    if (stored.length === 0) return;
    const knownShowIds = new Set(catalogRecords.map((show) => show.id));
    const sourceIds = new Set(asArray(collection.showIds).filter((showId) => knownShowIds.has(showId)));
    const activeIds = new Set(stored.map((membership) => membership.showId));
    const overrides = new Map(store.listOverrides(collection.id).map((override) => [override.showId, override]));
    const generatedSources = new Set(["rule-match", "semantic-match", "ai-suggestion"]);
    let changed = 0;

    stored.filter((membership) => generatedSources.has(membership.sourceType) && !sourceIds.has(membership.showId)).forEach((membership) => {
      if (overrides.has(membership.showId)) return;
      store.setOverride({
        collectionId: collection.id,
        showId: membership.showId,
        decision: "remove",
        reason: "Manual source removal reconciled into collection automation.",
        actor: actor || "source-reconciliation",
      });
      changed += 1;
    });
    sourceIds.forEach((showId) => {
      if (activeIds.has(showId) || overrides.has(showId)) return;
      store.setOverride({
        collectionId: collection.id,
        showId,
        decision: "add",
        reason: "Manual source addition reconciled into collection automation.",
        actor: actor || "source-reconciliation",
      });
      changed += 1;
    });
    if (changed) {
      store.recordEvent({ collectionId: collection.id, eventType: "source-membership-reconciled", actor, payload: { changes: changed } });
    }
  }

  async function recalculate({ collectionIds = [], showIds = [], actor = "", forceSemantic = false, seedSemanticMatches = {}, build = true, reason = "manual", skipSourceDeltaCapture = false } = {}) {
    const runId = store.createRun({ runType: "membership-recalculation", input: { collectionIds, showIds, actor, forceSemantic, reason } });
    try {
      const catalogRecords = await catalog();
      const selectedIds = new Set(asArray(collectionIds).filter(Boolean));
      const definitions = sourceCollections().filter((collection) => selectedIds.size === 0
        ? collectionSourceKind(collection) !== "editorial" || store.listOverrides(collection.id).length > 0
        : selectedIds.has(collection.id));
      const changedDefinitions = [];
      const results = [];
      for (const collection of definitions) {
        if (!skipSourceDeltaCapture) captureSourceSnapshotOverrides(collection, catalogRecords, actor);
        const calculation = await calculateCollection(collection, catalogRecords, { showIds, forceSemantic, seedSemanticMatches });
        store.replaceMemberships(collection.id, calculation.membershipRows);
        const kind = collectionSourceKind(collection);
        const next = { ...collection };
        if (kind !== "editorial" || store.listOverrides(collection.id).length > 0) {
          next.showIds = calculation.nextShowIds;
          next.showReasons = calculation.nextReasons;
          next.coverShowIds = asArray(collection.coverShowIds).filter((showId) => next.showIds.includes(showId));
          if (!arraysEqual(next.showIds, asArray(collection.showIds)) || !mapsEqual(next.showReasons, collection.showReasons || {}) || !arraysEqual(next.coverShowIds, asArray(collection.coverShowIds))) {
            next.updatedAt = today();
            changedDefinitions.push(next);
          }
        }
        store.recordEvent({
          collectionId: collection.id,
          eventType: "memberships-recalculated",
          actor,
          payload: { reason, active: calculation.nextShowIds.length, borderline: calculation.membershipRows.filter((row) => row.state === "borderline").length, semanticSkipped: calculation.semanticSkipped },
        });
        results.push({ collectionId: collection.id, members: calculation.nextShowIds.length, semanticSkipped: calculation.semanticSkipped });
      }
      if (changedDefinitions.length > 0) writeCollectionRecordsAtomically(staticRoot, changedDefinitions);
      if (build && changedDefinitions.length > 0) {
        await buildCatalogImpl(staticRoot);
        if (typeof onPublished === "function") await onPublished();
      }
      const summary = { refreshed: definitions.length, changed: changedDefinitions.length, results };
      store.completeRun(runId, { summary });
      return { runId, ...summary };
    } catch (error) {
      store.completeRun(runId, { status: "failed", errorText: cleanText(error.message || error, 2_000) });
      throw error;
    }
  }

  async function approveCandidate(candidateId, { actor = "", edits = {} } = {}) {
    let candidate = store.getCandidate(candidateId);
    if (!candidate) {
      const error = new Error("Collection candidate not found.");
      error.statusCode = 404;
      throw error;
    }
    if (candidate.status !== "proposed") {
      const error = new Error("Only proposed collection candidates can be approved.");
      error.statusCode = 409;
      throw error;
    }
    if (Object.keys(edits).length > 0) candidate = updateCandidate(candidateId, edits, actor);
    const catalogRecords = await catalog();
    const existingIds = new Set(sourceCollections().map((collection) => collection.id));
    const id = ensureCollectionId(edits.id || candidate.title);
    if (existingIds.has(id)) {
      const error = new Error(`Collection id "${id}" already exists.`);
      error.statusCode = 409;
      throw error;
    }
    const automation = {
      ...normalizeAutomation(candidate.definition?.automation, candidate.collectionType === "semantic" ? "semantic" : "rule-based"),
      approvedCandidateId: candidateId,
    };
    let semanticMatches = [];
    const proposedIds = candidate.collectionType === "rule"
      ? catalogRecords.filter((show) => ruleMatches(show, automation.criteria)).map((show) => show.id)
      : await (async () => {
        if (!semantic.enabled) {
          const error = new Error("Semantic collection approval requires the configured semantic model to verify current matches.");
          error.statusCode = 503;
          throw error;
        }
        semanticMatches = await semantic.scoreMemberships({ query: automation.query, shows: catalogRecords });
        return semanticMatches.filter((match) => match.confidence >= publishThreshold).map((match) => match.showId);
      })();
    if (proposedIds.length < minMatches) {
      const error = new Error(`Collection candidates need at least ${minMatches} matching published shows before approval.`);
      error.statusCode = 400;
      throw error;
    }
    const nextOrder = sourceCollections().reduce((highest, collection) => Math.max(highest, Number(collection.order) || 0), 0) + 10;
    const definition = {
      id,
      title: cleanText(candidate.title, 100),
      description: cleanText(candidate.description, 320),
      descriptionProvenance: "generated",
      label: candidate.collectionType === "semantic" ? "Semantic route" : "Automatic route",
      kind: candidate.collectionType === "semantic" ? "semantic" : "rule-based",
      intentTags: [],
      commitment: "",
      coverShowIds: [],
      showIds: proposedIds,
      showReasons: {},
      automation,
      featured: false,
      order: nextOrder,
      createdAt: today(),
      updatedAt: today(),
    };
    writeCollectionRecordsAtomically(staticRoot, [definition]);
    const seedSemanticMatches = candidate.collectionType === "semantic" ? { [id]: semanticMatches } : {};
    const refreshed = await recalculate({
      collectionIds: [id],
      actor,
      forceSemantic: false,
      seedSemanticMatches,
      reason: "candidate-approved",
      skipSourceDeltaCapture: true,
    });
    const approved = store.updateCandidate(candidateId, {
      status: "approved",
      reviewedBy: actor,
      reviewedAt: new Date().toISOString(),
    });
    store.recordEvent({ collectionId: id, candidateId, eventType: "candidate-approved", actor, payload: { collectionId: id } });
    return { candidate: approved, collectionId: id, refreshed };
  }

  function rejectCandidate(candidateId, { actor = "", reviewNotes = "" } = {}) {
    const candidate = store.getCandidate(candidateId);
    if (!candidate) {
      const error = new Error("Collection candidate not found.");
      error.statusCode = 404;
      throw error;
    }
    const updated = store.updateCandidate(candidateId, {
      status: "rejected",
      reviewNotes: cleanText(reviewNotes || candidate.reviewNotes, 2_000),
      reviewedBy: actor,
      reviewedAt: new Date().toISOString(),
    });
    store.recordEvent({ candidateId, eventType: "candidate-rejected", actor, payload: { reviewNotes: updated.reviewNotes } });
    return updated;
  }

  async function setMembershipOverride(collectionId, showId, { decision, reason = "", actor = "" } = {}) {
    const collection = knownCollection(collectionId);
    const catalogRecords = await catalog();
    if (!catalogRecords.some((show) => show.id === showId)) {
      const error = new Error("Collection overrides can only reference published shows.");
      error.statusCode = 400;
      throw error;
    }
    if (!new Set(["add", "pin", "remove"]).has(decision)) {
      const error = new Error("Membership decision must be add, pin, or remove.");
      error.statusCode = 400;
      throw error;
    }
    const override = store.setOverride({ collectionId: collection.id, showId, decision, reason: cleanText(reason, 420), actor: cleanText(actor, 160) });
    store.recordEvent({ collectionId: collection.id, showId, eventType: `membership-manual-${decision}`, actor, payload: { reason: override.reason } });
    const refreshed = await recalculate({ collectionIds: [collection.id], actor, reason: `manual-${decision}` });
    return { override, refreshed };
  }

  async function clearMembershipOverride(collectionId, showId, { actor = "" } = {}) {
    const collection = knownCollection(collectionId);
    const cleared = store.clearOverride({ collectionId: collection.id, showId });
    if (cleared) store.recordEvent({ collectionId: collection.id, showId, eventType: "membership-override-cleared", actor, payload: {} });
    const refreshed = await recalculate({ collectionIds: [collection.id], actor, reason: "manual-override-cleared" });
    return { cleared, refreshed };
  }

  async function editCollection(collectionId, updates = {}, { actor = "" } = {}) {
    const collection = knownCollection(collectionId);
    const next = { ...collection };
    ["title", "label", "commitment"].forEach((key) => {
      if (updates[key] !== undefined) next[key] = cleanText(updates[key], key === "title" ? 100 : 100);
    });
    if (updates.description !== undefined) {
      next.description = cleanText(updates.description, 320);
      next.descriptionProvenance = "manual";
    }
    if (updates.intentTags !== undefined) next.intentTags = asArray(updates.intentTags).map((tag) => slugify(tag)).filter(Boolean).slice(0, 6);
    if (updates.automation !== undefined) {
      const sourceKind = collectionSourceKind(collection);
      if (sourceKind === "editorial") {
        const error = new Error("Editorial collections do not have automation criteria to edit.");
        error.statusCode = 400;
        throw error;
      }
      next.automation = normalizeAutomation(updates.automation, sourceKind === "semantic" ? "semantic" : "rule-based");
    }
    next.updatedAt = today();
    writeCollectionRecordsAtomically(staticRoot, [next]);
    store.recordEvent({ collectionId, eventType: "collection-edited", actor, payload: { fields: Object.keys(updates) } });
    const refreshed = await recalculate({ collectionIds: [collectionId], actor, forceSemantic: updates.automation?.mode === "semantic", reason: "collection-edited", skipSourceDeltaCapture: true });
    return { collection: next, refreshed };
  }

  async function listForMaintainer() {
    const catalogRecords = await catalog();
    const collectionItems = sourceCollections().map((collection) => {
      const memberships = store.listMemberships(collection.id);
      return {
        id: collection.id,
        title: collection.title,
        kind: collectionSourceKind(collection),
        description: collection.description,
        memberCount: memberships.filter((entry) => entry.state === "active").length || asArray(collection.showIds).length,
        borderlineCount: memberships.filter((entry) => entry.state === "borderline").length,
        overrideCount: store.listOverrides(collection.id).length,
        automation: collection.automation || null,
      };
    });
    return {
      collections: collectionItems,
      candidates: store.listCandidates({ status: "proposed", pageSize: 100 }),
      semantic: { enabled: semantic.enabled, publishThreshold, borderlineThreshold },
      catalogCount: catalogRecords.length,
    };
  }

  async function getForMaintainer(collectionId) {
    const collection = knownCollection(collectionId);
    const catalogRecords = await catalog();
    const kind = collectionSourceKind(collection);
    const automation = kind === "editorial" ? null : normalizeAutomation(collection.automation, kind);
    const storedMemberships = store.listMemberships(collection.id);

    // Import/update hooks normally populate the operational membership table.
    // Populate it lazily as well so a freshly deployed catalogue can explain
    // automated memberships accurately before its first catalogue update.
    if (automation && storedMemberships.length === 0) {
      const calculation = await calculateCollection(collection, catalogRecords);
      store.replaceMemberships(collection.id, calculation.membershipRows, { runId: null });
    }

    return detailForCollection(collection, catalogRecords);
  }

  return {
    approveCandidate,
    clearMembershipOverride,
    editCollection,
    generateCandidates,
    getForMaintainer,
    listForMaintainer,
    recalculate,
    refreshForShows: (showIds, actor = "") => recalculate({ showIds, actor, reason: "catalogue-updated" }),
    rejectCandidate,
    setMembershipOverride,
    updateCandidate,
  };
}

module.exports = {
  createCollectionService,
  normalizeAutomation,
  ruleMatches,
};
