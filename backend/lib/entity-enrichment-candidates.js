const { normalizeEntityName } = require("../../shared/archive-entities");
const { EVIDENCE_FIELDS, extractEntityEvidence } = require("./entity-graph-report");

const DEFAULT_SHOW_STATUSES = ["published"];
const DEFAULT_ENTITY_PUBLICATIONS = ["public"];
const CORE_EVIDENCE_PATHS = new Set(EVIDENCE_FIELDS.map(({ path }) => path));
const LEGACY_ID_FIELDS = new Set(["creatorId", "networkId"]);
const PLACEHOLDER_EVIDENCE = /^(?:-|n\/a|na|none|not available|not verified|unknown|tbd)$/i;
const COMPOUND_EVIDENCE = /(?:[|/&,]|\band\b)/i;
const CREDIT_KEY = /(?:creator|author|cast|company|studio|network|writer|director|producer|owner|sound|publisher|distributor|composer|narrator|host|performer|adaptation|story|music|mixer|production|people)/i;

// These are source/platform labels, not creator-directory identities. Keep this
// list conservative and limited to labels already documented by the archive or
// unambiguous podcast infrastructure names present in the authored records.
const INFRASTRUCTURE_LABELS = new Set([
  "art19",
  "a cast",
  "acast",
  "audioboom",
  "ausha",
  "buzzsprout",
  "captivate",
  "libsyn",
  "megaphone",
  "omny",
  "patreon",
  "podbean",
  "pocket casts",
  "rss com",
  "simplecast",
  "spreaker",
  "spotify",
  "transistor",
  "youtube",
]);

const FIELD_PRIORITY = new Map([
  ["credits.productionCompany", 1],
  ["credits.studio", 2],
  ["credits.network", 3],
  ["credits.creatorName", 4],
  ["credits.creators", 5],
  ["creators", 6],
  ["creatorId", 7],
  ["networkId", 8],
  ["credits.ownerName", 9],
]);

const MATCH_PRIORITY = new Map([
  ["exact-legacy-id", 5],
  ["exact-normalized-name", 4],
  ["compound-normalized-component", 3],
  ["legacy-id-component", 2],
  ["exact-credit-only", 1],
]);

const CONFIDENCE_PRIORITY = new Map([
  ["high", 3],
  ["medium", 2],
  ["low", 1],
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function readPath(record, path) {
  return path.split(".").reduce((value, key) => (isRecord(value) ? value[key] : undefined), record);
}

function asTextValues(value) {
  if (Array.isArray(value)) return value.flatMap(asTextValues);
  if (value === undefined || value === null || typeof value === "object") return [];

  const text = String(value).trim();
  return text && !PLACEHOLDER_EVIDENCE.test(text) ? [text] : [];
}

function evidenceSourceKey(field) {
  if (field === "creatorId" || field === "creators" || field === "credits.creatorName" || field.startsWith("credits.creators")) return "creatorName";
  if (field === "credits.ownerName" || field === "metadata.podcast.ownerName") return "ownerName";
  if (field === "networkId" || field === "credits.network") return "networkName";
  return null;
}

function getStoredFieldProvenance(show, field) {
  const key = evidenceSourceKey(field);
  const stored = key ? show.metadata?.import?.fields?.[key] : undefined;
  if (!isRecord(stored)) return undefined;

  return {
    ...(Number.isFinite(stored.confidence) ? { confidence: stored.confidence } : {}),
    ...(stored.method ? { method: stored.method } : {}),
    ...(Array.isArray(stored.sources)
      ? {
        sources: stored.sources
          .filter(isRecord)
          .map(({ sourceType, sourceUrl }) => ({ sourceType, sourceUrl }))
          .filter(({ sourceType, sourceUrl }) => sourceType || sourceUrl),
      }
      : {}),
  };
}

function fieldBase(field) {
  return field.replace(/\[\d+\]\.name$/, "");
}

function roleSupportFor(field, contextRole = "") {
  const base = fieldBase(field);
  if (base === "credits.productionCompany") {
    return { role: "production-company", entityType: "production-company", clear: true, basis: "The source field is an explicit production-company credit." };
  }
  if (base === "credits.studio") {
    return { role: "studio", entityType: "studio", clear: true, basis: "The source field is an explicit studio credit." };
  }
  if (base === "credits.network") {
    return { role: "network", entityType: "network", clear: true, basis: "The source field is an explicit network credit." };
  }
  if (base === "credits.creatorName" || base === "credits.creators" || base === "creators") {
    return { role: "creator", entityType: null, clear: true, basis: "The source field is an explicit creator credit." };
  }
  if (base === "creatorId") {
    return { role: "creator", entityType: null, clear: false, basis: "The legacy field is named creatorId; confirm the identity and role before authoring a link." };
  }
  if (base === "networkId") {
    return { role: "network", entityType: "network", clear: false, basis: "The legacy field is named networkId; confirm that it is a meaningful network rather than a platform or show label." };
  }
  if (field.includes("credits.people[") && /^(?:author|creator|created by)$/i.test(contextRole.trim())) {
    return { role: "creator", entityType: "person", clear: true, basis: `The structured credit role is “${contextRole}”.` };
  }
  return { role: null, entityType: null, clear: false, basis: "This credit is outside the public entity relationship role model." };
}

function createEvidence(field, value, options = {}) {
  const base = fieldBase(field);
  const roleSupport = roleSupportFor(field, options.contextRole);
  return {
    field,
    baseField: base,
    category: options.category || (CORE_EVIDENCE_PATHS.has(base) ? "legacy-entity-evidence" : "explicit-credit"),
    value,
    normalizedValue: normalizeEntityName(value),
    compound: options.compound === undefined ? COMPOUND_EVIDENCE.test(value) : options.compound,
    sourceKind: options.sourceKind || (CORE_EVIDENCE_PATHS.has(base) ? "core-graph-evidence" : "extended-credit-evidence"),
    contextRole: options.contextRole || undefined,
    roleSupport,
    storedProvenance: options.storedProvenance,
  };
}

function extractExtendedCreditEvidence(show) {
  const evidence = [];
  const add = (field, value, contextRole = "") => {
    asTextValues(value).forEach((text) => evidence.push(createEvidence(field, text, {
      contextRole,
      storedProvenance: getStoredFieldProvenance(show, field),
    })));
  };

  add("cast", show.cast);
  add("metadata.podcast.ownerName", show.metadata?.podcast?.ownerName);

  if (!isRecord(show.credits)) return evidence;
  Object.entries(show.credits).forEach(([key, value]) => {
    if (!CREDIT_KEY.test(key)) return;
    const field = `credits.${key}`;
    if (key === "people" && Array.isArray(value)) {
      value.forEach((person, index) => {
        if (isRecord(person)) add(`${field}[${index}].name`, person.name, person.role || "");
      });
      return;
    }
    add(field, value);
  });

  return evidence;
}

function extractEnrichmentEvidence(show) {
  const core = extractEntityEvidence(show).map((entry) => createEvidence(entry.field, entry.value, {
    category: entry.category === "creator" ? "legacy-creator-evidence" : `legacy-${entry.category}-evidence`,
    compound: entry.compound,
    sourceKind: "core-graph-evidence",
    storedProvenance: getStoredFieldProvenance(show, entry.field),
  }));
  const seen = new Set(core.map((entry) => `${entry.field}\u0000${entry.value}`));
  const extended = extractExtendedCreditEvidence(show).filter((entry) => {
    const key = `${entry.field}\u0000${entry.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...core, ...extended];
}

function buildEntityIndexes(entities) {
  const byId = new Map();
  const names = [];
  const byName = new Map();

  entities.filter(isRecord).forEach((entity) => {
    if (typeof entity.id !== "string" || !entity.id.trim()) return;
    byId.set(entity.id, entity);
    [entity.name, ...(Array.isArray(entity.aliases) ? entity.aliases : [])].forEach((name) => {
      const key = normalizeEntityName(name);
      if (!key) return;
      const nameEntry = { entity, name, key, tokens: key.split(" ").filter(Boolean) };
      names.push(nameEntry);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(nameEntry);
    });
  });

  return { byId, names, byName };
}

function tokenSpan(tokens, needle) {
  if (!needle.length || needle.length > tokens.length) return null;
  for (let index = 0; index <= tokens.length - needle.length; index += 1) {
    if (needle.every((token, offset) => tokens[index + offset] === token)) {
      return { start: index, end: index + needle.length - 1 };
    }
  }
  return null;
}

function findEntityMatches(evidence, indexes) {
  const matches = new Map();
  const add = (entry, kind, span = null) => {
    const existing = matches.get(entry.entity.id);
    if (existing) {
      if (MATCH_PRIORITY.get(kind) > MATCH_PRIORITY.get(existing.kind)) existing.kind = kind;
      existing.matchedNames = unique([...existing.matchedNames, entry.name]);
      if (span) existing.spans.push(span);
      return;
    }
    matches.set(entry.entity.id, {
      entity: entry.entity,
      kind,
      matchedNames: [entry.name],
      spans: span ? [span] : [],
    });
  };

  if (LEGACY_ID_FIELDS.has(evidence.baseField)) {
    const direct = indexes.byId.get(evidence.value);
    if (direct) {
      const directName = [direct.name, ...(Array.isArray(direct.aliases) ? direct.aliases : [])]
        .find((name) => normalizeEntityName(name) === normalizeEntityName(direct.name)) || direct.name;
      add({ entity: direct, name: directName }, "exact-legacy-id");
    }
  }

  (indexes.byName.get(evidence.normalizedValue) || []).forEach((entry) => add(entry, "exact-normalized-name"));
  if (matches.size > 0) return [...matches.values()];

  const tokens = evidence.normalizedValue.split(" ").filter(Boolean);
  if (!evidence.compound && !LEGACY_ID_FIELDS.has(evidence.baseField)) return [];

  indexes.names.forEach((entry) => {
    // Single short tokens are too collision-prone to turn into a component
    // lead. Longer single-token names remain useful for explicit legacy slugs.
    if (entry.tokens.length === 1 && entry.tokens[0].length < 4) return;
    const span = tokenSpan(tokens, entry.tokens);
    if (!span || entry.key === evidence.normalizedValue) return;
    add(entry, LEGACY_ID_FIELDS.has(evidence.baseField) ? "legacy-id-component" : "compound-normalized-component", span);
  });

  return [...matches.values()];
}

function splitCompoundValue(value, field = "") {
  const text = String(value || "").trim();
  if (!text || !COMPOUND_EVIDENCE.test(text)) return [text].filter(Boolean);
  const legacy = LEGACY_ID_FIELDS.has(field);
  return text
    .split(legacy
      ? /\s*(?:-and-|-with-|-for-|,|\/|\||&|\band\b|\bwith\b)\s*/gi
      : /\s*(?:,|\/|\||&|\band\b|\bin collaboration with\b|\bwith\b)\s*/gi)
    .map((part) => part.trim().replace(/^[.:;\-]+|[.:;\-]+$/g, "").trim())
    .map((part) => legacy ? part.replace(/-/g, " ").replace(/\s+/g, " ").trim() : part)
    .filter((part) => part && !PLACEHOLDER_EVIDENCE.test(part));
}

function normalizeFilter(value, fallback) {
  if (value === null) return null;
  const values = Array.isArray(value) ? value : [value];
  const normalized = unique(values.map((entry) => String(entry || "").trim()).filter(Boolean));
  return normalized.length ? normalized : fallback;
}

function selectRecords(records, allowedValues, key) {
  const valid = Array.isArray(records) ? records.filter(isRecord) : [];
  if (allowedValues === null) return valid;
  const allowed = new Set(allowedValues);
  return valid.filter((record) => allowed.has(record[key]));
}

function sourcePathFor(show, sourceDirectory) {
  return show.sourcePath || `${sourceDirectory}/${show.id}.json`;
}

function showSummary(show, sourceDirectory) {
  return {
    id: show.id,
    title: show.title || show.id,
    status: show.status,
    sourcePath: sourcePathFor(show, sourceDirectory),
  };
}

function linkedEntityIds(show) {
  return new Set(Array.isArray(show.entityLinks)
    ? show.entityLinks.map((link) => String(link?.entityId || "").trim()).filter(Boolean)
    : []);
}

function isInfrastructureLabel(value) {
  return INFRASTRUCTURE_LABELS.has(normalizeEntityName(value));
}

function isShowLikeValue(show, value) {
  const normalized = normalizeEntityName(value);
  return [show.id, show.title, ...(Array.isArray(show.aliases) ? show.aliases : [])]
    .filter(Boolean)
    .some((candidate) => normalizeEntityName(candidate) === normalized);
}

function sourceFieldRank(field) {
  return FIELD_PRIORITY.get(fieldBase(field)) || 100;
}

function bestDisplayValue(observations) {
  return [...observations]
    .sort((left, right) => sourceFieldRank(left.field) - sourceFieldRank(right.field)
      || left.value.length - right.value.length
      || left.value.localeCompare(right.value, "en"))[0]?.value || "";
}

function strongestCategory(categories) {
  return [...categories].sort((left, right) => (MATCH_PRIORITY.get(right) || 0) - (MATCH_PRIORITY.get(left) || 0) || left.localeCompare(right, "en"))[0] || "";
}

function strongestConfidence(values) {
  return [...values].sort((left, right) => (CONFIDENCE_PRIORITY.get(right) || 0) - (CONFIDENCE_PRIORITY.get(left) || 0) || left.localeCompare(right, "en"))[0] || "low";
}

function candidateConfidence(matchKind, role, evidence, targetKind) {
  if (targetKind === "new-entity") {
    if (evidence.some((entry) => ["credits.productionCompany", "credits.studio", "credits.network"].includes(entry.baseField))) return "medium";
    return evidence.some((entry) => entry.showCount >= 2) ? "medium" : "low";
  }
  if (matchKind === "exact-legacy-id" && role && evidence.every((entry) => entry.roleSupport.clear || entry.baseField === "networkId")) return "high";
  if (matchKind === "exact-normalized-name" && role && evidence.some((entry) => entry.roleSupport.clear)) return "high";
  if (matchKind === "exact-normalized-name") return "medium";
  if (matchKind === "compound-normalized-component" && role) return "medium";
  return "low";
}

function relationshipRole(candidateEvidence) {
  const roles = unique(candidateEvidence.map((entry) => entry.role).filter(Boolean));
  if (roles.length !== 1) return { role: null, basis: roles.length > 1 ? "Source evidence supports more than one possible role; choose deliberately." : "No public relationship role is supported by this evidence alone." };
  const role = roles[0];
  const roleEntries = candidateEvidence.filter((entry) => entry.role === role);
  if (roleEntries.some((entry) => entry.compound && !["credits.productionCompany", "credits.studio", "credits.network"].includes(entry.baseField))) {
    return { role: null, basis: "The role-bearing source is compound; split and confirm each named person or organization before authoring a link." };
  }
  return { role, basis: unique(roleEntries.map((entry) => entry.roleBasis)).join(" ") };
}

function addEvidenceToCandidate(candidate, evidence, match, options = {}) {
  const roleSupport = evidence.roleSupport;
  const compoundRoleIsExplicit = ["credits.productionCompany", "credits.studio", "credits.network"].includes(evidence.baseField);
  const exactLegacyRoleIsSupported = match?.kind === "exact-legacy-id"
    && (evidence.baseField === "networkId" || (evidence.baseField === "creatorId" && match.entity.type === "person"));
  const role = (roleSupport.clear && (!evidence.compound || compoundRoleIsExplicit)) || exactLegacyRoleIsSupported ? roleSupport.role : null;
  const roleBasis = role ? roleSupport.basis : roleSupport.role ? `${roleSupport.basis} The compound/component form keeps the role for manual review only.` : roleSupport.basis;
  const category = options.category || (match?.kind === "exact-legacy-id"
    ? "exact-legacy-id"
    : match?.kind === "exact-normalized-name"
      ? (role ? "exact-normalized-name" : "exact-credit-only")
      : match?.kind || "explicit-credit");
  const confidence = options.confidence || candidateConfidence(match?.kind, role, [evidence], candidate.target.kind);
  candidate.evidence.push({
    field: evidence.field,
    value: evidence.value,
    normalizedValue: evidence.normalizedValue,
    compound: evidence.compound,
    sourceKind: evidence.sourceKind,
    matchKind: match?.kind || null,
    matchedNames: match?.matchedNames || [],
    componentSpans: match?.spans || [],
    ...(evidence.contextRole ? { contextRole: evidence.contextRole } : {}),
    ...(evidence.storedProvenance ? { storedProvenance: evidence.storedProvenance } : {}),
  });
  candidate._evidenceMeta.push({
    category,
    confidence,
    role,
    roleBasis,
    baseField: evidence.baseField,
    compound: evidence.compound,
    showCount: options.showCount || 1,
  });
}

function finalizeCandidate(candidate) {
  const meta = candidate._evidenceMeta;
  const roleEvidence = meta.map((entry) => ({ role: entry.role, roleBasis: entry.roleBasis, compound: entry.compound, baseField: entry.baseField }));
  const role = relationshipRole(roleEvidence);
  candidate.suggestedRole = role.role;
  candidate.roleBasis = role.basis;
  candidate.relationshipEligible = Boolean(role.role);
  candidate.candidateKind = candidate.relationshipEligible ? "relationship" : "credit-lead";
  candidate.evidenceCategory = strongestCategory(meta.map((entry) => entry.category));
  candidate.confidence = strongestConfidence(meta.map((entry) => entry.confidence));
  candidate.evidence = candidate.evidence
    .sort((left, right) => sourceFieldRank(left.field) - sourceFieldRank(right.field) || left.value.localeCompare(right.value, "en"));
  delete candidate._evidenceMeta;
  candidate.manualAction = candidate.relationshipEligible
    ? "Review the evidence, then author the explicit entityLinks entry manually."
    : "Keep as supporting credit evidence; do not create a public entity relationship from this lead alone.";
  return candidate;
}

function createExistingCandidate(show, target, sourceDirectory) {
  return {
    candidateId: `${show.id}:existing:${target.entity.id}`,
    batchId: `entity:${target.entity.id}`,
    candidateKind: "relationship",
    relationshipEligible: false,
    show: showSummary(show, sourceDirectory),
    target: {
      kind: "existing-entity",
      entityId: target.entity.id,
      name: target.entity.name,
      type: target.entity.type,
      publication: target.entity.publication,
    },
    suggestedRole: null,
    roleBasis: "",
    evidenceCategory: "",
    confidence: "low",
    evidence: [],
    currentRelationships: Array.isArray(show.entityLinks) ? show.entityLinks.map((link) => ({ entityId: link.entityId, role: link.role })) : [],
    manualAction: "",
    _evidenceMeta: [],
  };
}

function createNewCandidate(show, target, sourceDirectory) {
  return {
    candidateId: `${show.id}:new:${target.normalizedName}`,
    batchId: `new:${target.normalizedName}`,
    candidateKind: "relationship",
    relationshipEligible: false,
    show: showSummary(show, sourceDirectory),
    target: {
      kind: "new-entity",
      name: target.name,
      normalizedName: target.normalizedName,
      suggestedType: target.suggestedType || null,
      publication: "not-authored",
    },
    suggestedRole: null,
    roleBasis: "",
    evidenceCategory: "",
    confidence: "low",
    evidence: [],
    currentRelationships: Array.isArray(show.entityLinks) ? show.entityLinks.map((link) => ({ entityId: link.entityId, role: link.role })) : [],
    manualAction: "",
    _evidenceMeta: [],
  };
}

function buildCompoundReviews(showEntries, indexes, sourceDirectory) {
  const reviews = [];
  const batches = new Map();

  showEntries.forEach(({ show, evidence }) => {
    const compoundEvidence = evidence.filter((entry) => entry.compound);
    const coreCompoundEvidence = compoundEvidence.filter((entry) => CORE_EVIDENCE_PATHS.has(entry.baseField));
    if (!coreCompoundEvidence.length) return;

    const possibleComponents = new Map();
    const matchedEntities = new Map();
    compoundEvidence.forEach((entry) => {
      const matches = findEntityMatches(entry, indexes);
      matches.forEach((match) => {
        matchedEntities.set(match.entity.id, {
          entityId: match.entity.id,
          name: match.entity.name,
          type: match.entity.type,
          publication: match.entity.publication,
          matchKinds: unique([...(matchedEntities.get(match.entity.id)?.matchKinds || []), match.kind]),
        });
      });
      splitCompoundValue(entry.value, entry.baseField).forEach((part) => {
        const key = normalizeEntityName(part);
        if (!key) return;
        if (!possibleComponents.has(key)) possibleComponents.set(key, { name: part, normalizedName: key, fields: new Set() });
        possibleComponents.get(key).fields.add(entry.field);
      });
    });

    const review = {
      reviewId: `compound:${show.id}`,
      batchId: `compound-show:${show.id}`,
      show: showSummary(show, sourceDirectory),
      evidenceCategory: "compound-source-evidence",
      confidence: "low",
      evidence: compoundEvidence.map((entry) => ({
        field: entry.field,
        value: entry.value,
        normalizedValue: entry.normalizedValue,
        sourceKind: entry.sourceKind,
        ...(entry.storedProvenance ? { storedProvenance: entry.storedProvenance } : {}),
      })).sort((left, right) => sourceFieldRank(left.field) - sourceFieldRank(right.field) || left.value.localeCompare(right.value, "en")),
      matchedEntities: [...matchedEntities.values()].sort((left, right) => left.name.localeCompare(right.name, "en")),
      possibleComponents: [...possibleComponents.values()]
        .map((entry) => ({ ...entry, fields: [...entry.fields].sort() }))
        .sort((left, right) => left.name.localeCompare(right.name, "en")),
      manualAction: "Split the compound credit into deliberate entity decisions; do not link the combined string automatically.",
    };
    reviews.push(review);

    coreCompoundEvidence.forEach((entry) => {
      const key = `${entry.field}\u0000${entry.normalizedValue}`;
      if (!batches.has(key)) batches.set(key, {
        batchId: `compound:${entry.field}:${entry.normalizedValue}`,
        field: entry.field,
        rawValues: new Set(),
        showIds: new Set(),
        showTitles: new Map(),
        matchedEntities: new Map(),
        possibleComponents: new Map(),
      });
      const batch = batches.get(key);
      batch.rawValues.add(entry.value);
      batch.showIds.add(show.id);
      batch.showTitles.set(show.id, show.title || show.id);
      review.matchedEntities.forEach((match) => batch.matchedEntities.set(match.entityId, match));
      review.possibleComponents.forEach((component) => batch.possibleComponents.set(component.normalizedName, component));
    });
  });

  return {
    reviews: reviews.sort((left, right) => left.show.title.localeCompare(right.show.title, "en") || left.show.id.localeCompare(right.show.id, "en")),
    batches: [...batches.values()].map((batch) => ({
      batchId: batch.batchId,
      field: batch.field,
      rawValues: [...batch.rawValues].sort((left, right) => left.localeCompare(right, "en")),
      showIds: [...batch.showIds].sort(),
      showTitles: [...batch.showTitles.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, title]) => ({ id, title })),
      showCount: batch.showIds.size,
      matchedEntities: [...batch.matchedEntities.values()].sort((left, right) => left.name.localeCompare(right.name, "en")),
      possibleComponents: [...batch.possibleComponents.values()].sort((left, right) => left.name.localeCompare(right.name, "en")),
      manualAction: "Review the grouped compound evidence as a batch, then author only separately confirmed links.",
    })).sort((left, right) => right.showCount - left.showCount || left.field.localeCompare(right.field) || left.batchId.localeCompare(right.batchId)),
  };
}

function buildEntityEnrichmentCandidates(shows = [], entities = [], options = {}) {
  const showStatuses = normalizeFilter(options.showStatuses === undefined ? DEFAULT_SHOW_STATUSES : options.showStatuses, DEFAULT_SHOW_STATUSES);
  const entityPublications = normalizeFilter(options.entityPublications === undefined ? DEFAULT_ENTITY_PUBLICATIONS : options.entityPublications, DEFAULT_ENTITY_PUBLICATIONS);
  const sourceDirectory = options.sourceDirectory || "catalog-src/shows";
  const unlinkedOnly = options.unlinkedOnly === undefined ? true : Boolean(options.unlinkedOnly);
  const scopedShows = selectRecords(shows, showStatuses, "status");
  const scopedEntities = selectRecords(entities, entityPublications, "publication");
  const allEntities = Array.isArray(entities) ? entities.filter(isRecord) : [];
  const indexes = buildEntityIndexes(allEntities);
  const scopedEntityIds = new Set(scopedEntities.map((entity) => entity.id));
  const entries = scopedShows.map((show) => {
    const linkedIds = linkedEntityIds(show);
    return {
      show,
      linkedIds,
      scopedLinkedIds: new Set([...linkedIds].filter((entityId) => scopedEntityIds.has(entityId))),
      evidence: extractEnrichmentEvidence(show),
    };
  }).filter(({ scopedLinkedIds }) => !unlinkedOnly || scopedLinkedIds.size === 0);

  const repeatGroups = new Map();
  entries.forEach(({ show, evidence }) => evidence.forEach((entry) => {
    if (entry.compound || !["creatorId", "networkId", "creators", "credits.creatorName", "credits.creators", "credits.productionCompany", "credits.studio", "credits.network", "credits.people"].includes(entry.baseField)) return;
    const key = `${entry.normalizedValue}`;
    if (!key) return;
    if (!repeatGroups.has(key)) repeatGroups.set(key, { showIds: new Set(), observations: [] });
    const group = repeatGroups.get(key);
    group.showIds.add(show.id);
    group.observations.push({ ...entry, showCount: 0 });
  }));
  repeatGroups.forEach((group) => group.observations.forEach((entry) => { entry.showCount = group.showIds.size; }));

  const candidates = new Map();
  const addExisting = (show, entry, match, linkedIds = linkedEntityIds(show)) => {
    if (linkedIds.has(match.entity.id)) return;
    const key = `${show.id}\u0000${match.entity.id}`;
    if (!candidates.has(key)) candidates.set(key, createExistingCandidate(show, match, sourceDirectory));
    addEvidenceToCandidate(candidates.get(key), entry, match);
  };
  const addNew = (show, entry, repeatGroup) => {
    if (entry.compound || isInfrastructureLabel(entry.value)) return;
    const base = entry.baseField;
    const typedOrganization = ["credits.productionCompany", "credits.studio"].includes(base);
    const typedNetwork = base === "credits.network";
    const explicitCreator = ["creators", "credits.creatorName", "credits.creators"].includes(base)
      || (entry.field.includes("credits.people[") && /^(?:author|creator)$/i.test(entry.contextRole || ""));
    const legacyIdentifier = LEGACY_ID_FIELDS.has(base);
    const repeated = (repeatGroup?.showIds.size || 0) >= 2;
    if (!typedOrganization && !typedNetwork && !explicitCreator && !legacyIdentifier) return;
    if (!typedOrganization && !typedNetwork && !repeated) return;
    if (typedNetwork && (isShowLikeValue(show, entry.value) || (!repeated && isInfrastructureLabel(entry.value)))) return;
    if (legacyIdentifier && isShowLikeValue(show, entry.value) && !repeated) return;

    const key = `${show.id}\u0000${entry.normalizedValue}`;
    if (!candidates.has(key)) {
      const groupObservations = repeatGroup?.observations || [entry];
      const suggestedTypes = unique(groupObservations.map((observation) => observation.roleSupport.entityType).filter(Boolean));
      candidates.set(key, createNewCandidate(show, {
        name: bestDisplayValue(groupObservations),
        normalizedName: entry.normalizedValue,
        suggestedType: suggestedTypes.length === 1 ? suggestedTypes[0] : null,
      }, sourceDirectory));
    }
    addEvidenceToCandidate(candidates.get(key), entry, null, {
      category: typedOrganization || typedNetwork ? "typed-credit-new-entity" : repeated ? "repeated-explicit-name" : "legacy-evidence-new-entity",
      confidence: typedOrganization || typedNetwork ? "medium" : repeated ? "medium" : "low",
      showCount: repeatGroup?.showIds.size || 1,
    });
  };

  entries.forEach(({ show, linkedIds, evidence }) => evidence.forEach((entry) => {
    const matches = findEntityMatches(entry, indexes);
    matches.forEach((match) => addExisting(show, entry, match, linkedIds));
    if (matches.length === 0) addNew(show, entry, repeatGroups.get(entry.normalizedValue));
  }));

  const finalizedCandidates = [...candidates.values()].map(finalizeCandidate).sort((left, right) => {
    const targetRank = left.target.kind === "existing-entity" ? 0 : 1;
    const eligibleRank = left.relationshipEligible ? 0 : 1;
    return targetRank - (right.target.kind === "existing-entity" ? 0 : 1)
      || eligibleRank - (right.relationshipEligible ? 0 : 1)
      || (CONFIDENCE_PRIORITY.get(right.confidence) || 0) - (CONFIDENCE_PRIORITY.get(left.confidence) || 0)
      || left.show.title.localeCompare(right.show.title, "en")
      || left.candidateId.localeCompare(right.candidateId, "en");
  });

  const compound = buildCompoundReviews(entries, indexes, sourceDirectory);
  const relationshipCandidates = finalizedCandidates.filter((candidate) => candidate.relationshipEligible);
  const creditLeads = finalizedCandidates.filter((candidate) => !candidate.relationshipEligible);
  const batches = new Map();
  finalizedCandidates.forEach((candidate) => {
    if (!batches.has(candidate.batchId)) batches.set(candidate.batchId, {
      batchId: candidate.batchId,
      target: candidate.target,
      candidateIds: [],
      showIds: new Set(),
      showTitles: new Map(),
      evidenceCategories: new Set(),
      confidence: [],
      suggestedRoles: new Set(),
      sourceFields: new Set(),
      rawEvidence: new Set(),
      relationshipCandidateCount: 0,
      creditLeadCount: 0,
    });
    const batch = batches.get(candidate.batchId);
    batch.candidateIds.push(candidate.candidateId);
    batch.showIds.add(candidate.show.id);
    batch.showTitles.set(candidate.show.id, candidate.show.title);
    batch.evidenceCategories.add(candidate.evidenceCategory);
    batch.confidence.push(candidate.confidence);
    if (candidate.suggestedRole) batch.suggestedRoles.add(candidate.suggestedRole);
    candidate.evidence.forEach((entry) => {
      batch.sourceFields.add(entry.field);
      batch.rawEvidence.add(`${entry.field}=${entry.value}`);
    });
    if (candidate.relationshipEligible) batch.relationshipCandidateCount += 1;
    else batch.creditLeadCount += 1;
  });
  const batchRecords = [...batches.values()].map((batch) => ({
    batchId: batch.batchId,
    target: batch.target,
    candidateIds: batch.candidateIds.sort(),
    showIds: [...batch.showIds].sort(),
    showTitles: [...batch.showTitles.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, title]) => ({ id, title })),
    showCount: batch.showIds.size,
    relationshipCandidateCount: batch.relationshipCandidateCount,
    creditLeadCount: batch.creditLeadCount,
    evidenceCategories: [...batch.evidenceCategories].sort(),
    confidence: strongestConfidence(batch.confidence),
    suggestedRoles: [...batch.suggestedRoles].sort(),
    sourceFields: [...batch.sourceFields].sort(),
    rawEvidence: [...batch.rawEvidence].sort((left, right) => left.localeCompare(right, "en")),
    manualAction: batch.target.kind === "existing-entity"
      ? "Review all rows together, then author only confirmed show/entity/role links."
      : "Confirm whether this repeated or typed source name deserves a new authored entity before adding any links.",
  })).sort((left, right) => {
    const targetRank = left.target.kind === "existing-entity" ? 0 : 1;
    return targetRank - (right.target.kind === "existing-entity" ? 0 : 1)
      || (CONFIDENCE_PRIORITY.get(right.confidence) || 0) - (CONFIDENCE_PRIORITY.get(left.confidence) || 0)
      || right.showCount - left.showCount
      || left.batchId.localeCompare(right.batchId, "en");
  });

  const coreCompoundShowIds = new Set(entries.filter(({ evidence }) => evidence.some((entry) => entry.compound && CORE_EVIDENCE_PATHS.has(entry.baseField))).map(({ show }) => show.id));
  const coreCompoundEvidenceCount = entries.reduce((total, { evidence }) => total + evidence.filter((entry) => entry.compound && CORE_EVIDENCE_PATHS.has(entry.baseField)).length, 0);

  return {
    scope: {
      showStatuses,
      entityPublications,
      unlinkedOnly,
      sourceDirectory,
      sourceOnly: true,
      externalLookups: false,
      writesPerformed: false,
    },
    summary: {
      showCount: scopedShows.length,
      unlinkedShowCount: entries.length,
      entityCount: scopedEntities.length,
      candidateShowCount: new Set(finalizedCandidates.map((candidate) => candidate.show.id)).size,
      relationshipCandidateCount: relationshipCandidates.length,
      creditLeadCount: creditLeads.length,
      existingEntityCandidateCount: finalizedCandidates.filter((candidate) => candidate.target.kind === "existing-entity").length,
      newEntityCandidateCount: finalizedCandidates.filter((candidate) => candidate.target.kind === "new-entity").length,
      batchCount: batchRecords.length,
      newEntityBatchCount: batchRecords.filter((batch) => batch.target.kind === "new-entity").length,
      compoundEvidenceShowCount: coreCompoundShowIds.size,
      compoundEvidenceCount: coreCompoundEvidenceCount,
      compoundReviewCount: compound.reviews.length,
      compoundBatchCount: compound.batches.length,
    },
    candidates: finalizedCandidates,
    batches: batchRecords,
    compoundReviews: compound.reviews,
    compoundBatches: compound.batches,
  };
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function candidatesToCsv(candidates = []) {
  const headers = [
    "candidateId",
    "batchId",
    "candidateKind",
    "relationshipEligible",
    "showId",
    "showTitle",
    "sourcePath",
    "targetKind",
    "entityId",
    "targetName",
    "targetType",
    "targetPublication",
    "suggestedRole",
    "evidenceCategory",
    "confidence",
    "evidenceFields",
    "evidenceValues",
    "currentRelationships",
    "manualAction",
  ];
  const rows = candidates.map((candidate) => [
    candidate.candidateId,
    candidate.batchId,
    candidate.candidateKind,
    candidate.relationshipEligible,
    candidate.show.id,
    candidate.show.title,
    candidate.show.sourcePath,
    candidate.target.kind,
    candidate.target.entityId || "",
    candidate.target.name,
    candidate.target.type || candidate.target.suggestedType || "",
    candidate.target.publication,
    candidate.suggestedRole || "",
    candidate.evidenceCategory,
    candidate.confidence,
    unique(candidate.evidence.map((entry) => entry.field)).sort(),
    candidate.evidence.map((entry) => `${entry.field}=${entry.value}`),
    (candidate.currentRelationships || []).map((link) => `${link.entityId}:${link.role}`),
    candidate.manualAction,
  ].map(csvCell));
  return [headers, ...rows].map((row) => row.join(",")).join("\n");
}

module.exports = {
  DEFAULT_ENTITY_PUBLICATIONS,
  DEFAULT_SHOW_STATUSES,
  INFRASTRUCTURE_LABELS,
  candidatesToCsv,
  buildEntityEnrichmentCandidates,
  extractEnrichmentEvidence,
  splitCompoundValue,
};
