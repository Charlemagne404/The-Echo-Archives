const { normalizeEntityName } = require("../../shared/archive-entities");
const {
  buildEntityGraphReport,
  EVIDENCE_FIELDS,
} = require("./entity-graph-report");
const {
  extractEnrichmentEvidence,
  INFRASTRUCTURE_LABELS,
  splitCompoundValue,
} = require("./entity-enrichment-candidates");

const DEFAULT_SHOW_STATUSES = ["published"];
const DEFAULT_ENTITY_PUBLICATIONS = ["public"];
const LEGACY_ID_FIELDS = new Set(["creatorId", "networkId"]);
const CORE_EVIDENCE_FIELDS = new Set(EVIDENCE_FIELDS.map(({ path }) => path));
const ENTITY_ATTRIBUTION_INFRASTRUCTURE_LABELS = new Set([
  ...INFRASTRUCTURE_LABELS,
  "audible",
]);
const AUTOMATIC_MATCH_RULES = Object.freeze({
  "credits.productionCompany": Object.freeze({
    role: "production-company",
    entityType: "production-company",
    reason: "The source field is an explicit production-company credit and the exact entity type agrees.",
  }),
  "credits.studio": Object.freeze({
    role: "studio",
    entityType: "studio",
    reason: "The source field is an explicit studio credit and the exact entity type agrees.",
  }),
  "credits.network": Object.freeze({
    role: "network",
    entityType: "network",
    reason: "The source field is an explicit network credit and the exact entity type agrees.",
  }),
});

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

function sourceFieldRank(field) {
  return FIELD_PRIORITY.get(field) || 100;
}

function linkKey(entityId, role) {
  return `${entityId}:${role}`;
}

function sourcePathFor(show, sourceDirectory = "catalog-src/shows") {
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

function entitySummary(entity) {
  return {
    entityId: entity.id,
    name: entity.name,
    type: entity.type,
    publication: entity.publication,
  };
}

function collectHttpUrls(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectHttpUrls(entry, output));
    return output;
  }
  if (isRecord(value)) {
    Object.values(value).forEach((entry) => collectHttpUrls(entry, output));
    return output;
  }
  if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) output.push(value.trim());
  return output;
}

function sourceUrlsForShow(show) {
  return unique([
    ...collectHttpUrls(show.metadata?.objectiveSources),
    ...collectHttpUrls(show.metadata?.import?.selectedSources),
    ...collectHttpUrls(show.officialLinks),
    ...collectHttpUrls(show.listenLinks),
  ]);
}

function buildEntityIndexes(entities) {
  const byId = new Map();
  const byName = new Map();

  (Array.isArray(entities) ? entities : []).filter(isRecord).forEach((entity) => {
    if (typeof entity.id !== "string" || !entity.id.trim()) return;
    byId.set(entity.id, entity);
    [entity.name, ...(Array.isArray(entity.aliases) ? entity.aliases : [])].forEach((label) => {
      const key = normalizeEntityName(label);
      if (!key) return;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(entity);
    });
  });

  return { byId, byName };
}

function addMatch(matches, entity, kind, componentValue = null) {
  if (!entity) return;
  const existing = matches.get(entity.id);
  if (existing) {
    if (existing.matchKind !== "exact-legacy-id" && kind === "exact-legacy-id") existing.matchKind = kind;
    if (componentValue && !existing.componentValues.includes(componentValue)) existing.componentValues.push(componentValue);
    return;
  }
  matches.set(entity.id, {
    entity,
    matchKind: kind,
    componentValues: componentValue ? [componentValue] : [],
  });
}

function exactValueMatches(value, field, indexes) {
  const text = String(value || "").trim();
  const normalized = normalizeEntityName(text);
  const matches = new Map();
  if (!normalized) return [];

  if (LEGACY_ID_FIELDS.has(field)) addMatch(matches, indexes.byId.get(text), "exact-legacy-id");
  (indexes.byName.get(normalized) || []).forEach((entity) => addMatch(matches, entity, "exact-normalized-name"));
  return [...matches.values()];
}

function matchesForEvidence(evidence, indexes) {
  const exact = exactValueMatches(evidence.value, evidence.baseField, indexes);
  if (exact.length || !evidence.compound) return exact;

  const componentMatches = new Map();
  splitCompoundValue(evidence.value, evidence.baseField).forEach((component) => {
    exactValueMatches(component, evidence.baseField, indexes).forEach((match) => {
      addMatch(componentMatches, match.entity, "compound-normalized-component", component);
    });
  });
  return [...componentMatches.values()];
}

function evidenceRecord(show, evidence, extra = {}) {
  return {
    field: evidence.field,
    value: evidence.value,
    normalizedValue: evidence.normalizedValue,
    compound: evidence.compound,
    sourceKind: evidence.sourceKind,
    role: evidence.roleSupport?.role || null,
    ...(evidence.contextRole ? { contextRole: evidence.contextRole } : {}),
    sourceUrls: sourceUrlsForShow(show),
    ...(evidence.storedProvenance ? { storedProvenance: evidence.storedProvenance } : {}),
    ...extra,
  };
}

function proposedRoleForEvidence(evidence, entity = null) {
  const sourceRole = evidence.roleSupport?.role || null;
  const creatorFields = new Set(["creatorId", "creators", "credits.creatorName", "credits.creators"]);
  const structuredCreator = evidence.field.startsWith("credits.people[")
    && /^(?:author|creator|created by)$/i.test(evidence.contextRole || "");
  if (sourceRole === "creator" && entity && (creatorFields.has(evidence.baseField) || structuredCreator)) {
    return entity.type === "person" ? "creator" : entity.type;
  }
  return sourceRole;
}

function linkSet(show) {
  return new Set((Array.isArray(show.entityLinks) ? show.entityLinks : [])
    .map((link) => linkKey(link?.entityId, link?.role)));
}

function addPlanEvidence(planEntry, show, evidence, match) {
  const key = `${evidence.field}\u0000${evidence.value}`;
  if (planEntry._evidenceKeys.has(key)) return;
  planEntry._evidenceKeys.add(key);
  planEntry.evidence.push(evidenceRecord(show, evidence, {
    matchKind: match.matchKind,
    ...(match.componentValues.length ? { matchedComponents: match.componentValues } : {}),
  }));
}

function finalizePlanEntries(entries) {
  return [...entries.values()].map((entry) => {
    const { _evidenceKeys, ...result } = entry;
    result.evidence.sort((left, right) => sourceFieldRank(left.field) - sourceFieldRank(right.field) || left.value.localeCompare(right.value, "en"));
    return result;
  }).sort((left, right) => left.show.title.localeCompare(right.show.title, "en") || left.entity.name.localeCompare(right.entity.name, "en") || left.role.localeCompare(right.role, "en"));
}

function planDeterministicEntityLinks(shows = [], entities = [], options = {}) {
  const showStatuses = options.showStatuses === null ? null : options.showStatuses || DEFAULT_SHOW_STATUSES;
  const entityPublications = options.entityPublications === null ? null : options.entityPublications || DEFAULT_ENTITY_PUBLICATIONS;
  const sourceDirectory = options.sourceDirectory || "catalog-src/shows";
  const scopedShows = (Array.isArray(shows) ? shows : []).filter((show) => showStatuses === null || showStatuses.includes(show.status));
  const scopedEntities = (Array.isArray(entities) ? entities : []).filter((entity) => entityPublications === null || entityPublications.includes(entity.publication));
  const indexes = buildEntityIndexes(scopedEntities);
  const automatic = new Map();
  const conflicts = new Map();

  scopedShows.forEach((show) => {
    const links = linkSet(show);
    extractEnrichmentEvidence(show).forEach((evidence) => {
      const rule = AUTOMATIC_MATCH_RULES[evidence.baseField];
      if (!rule || evidence.compound) return;

      const matches = exactValueMatches(evidence.value, evidence.baseField, indexes);
      if (matches.length !== 1) return;
      const match = matches[0];
      const key = linkKey(match.entity.id, rule.role);
      if (links.has(key)) return;

      const entryKey = `${show.id}\u0000${match.entity.id}\u0000${rule.role}`;
      const target = match.entity.type === rule.entityType ? automatic : conflicts;
      if (!target.has(entryKey)) {
        target.set(entryKey, {
          reviewId: `${show.id}:${match.entity.id}:${rule.role}`,
          show: showSummary(show, sourceDirectory),
          entity: entitySummary(match.entity),
          role: rule.role,
          proposedRelationshipType: rule.role,
          evidence: [],
          confidence: match.matchKind === "exact-legacy-id" ? "high" : "high",
          reason: match.entity.type === rule.entityType
            ? rule.reason
            : `The exact source value matches this entity, but the registry type is "${match.entity.type}" rather than "${rule.entityType}". Review whether the field is being used as a second role or whether the entity classification needs correction.`,
          ...(match.entity.type === rule.entityType ? {} : { reviewKind: "entity-type-role-conflict" }),
          _evidenceKeys: new Set(),
        });
      }
      addPlanEvidence(target.get(entryKey), show, evidence, match);
    });
  });

  return {
    scope: {
      showStatuses,
      entityPublications,
      sourceDirectory,
      sourceOnly: true,
      externalLookups: false,
      writesPerformed: false,
    },
    scopedShows,
    scopedEntities,
    indexes,
    automaticLinks: finalizePlanEntries(automatic),
    roleConflicts: finalizePlanEntries(conflicts),
  };
}

function applyDeterministicEntityLinks(shows = [], automaticLinks = []) {
  const linksByShow = new Map();
  automaticLinks.forEach((entry) => {
    if (!linksByShow.has(entry.show.id)) linksByShow.set(entry.show.id, []);
    linksByShow.get(entry.show.id).push({ entityId: entry.entity.entityId, role: entry.role });
  });

  const changedShows = [];
  const nextShows = (Array.isArray(shows) ? shows : []).map((show) => {
    const additions = linksByShow.get(show.id) || [];
    if (!additions.length) return show;
    const existing = Array.isArray(show.entityLinks) ? show.entityLinks : [];
    const existingKeys = new Set(existing.map((link) => linkKey(link?.entityId, link?.role)));
    const nextLinks = additions.filter((link) => {
      const key = linkKey(link.entityId, link.role);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    if (!nextLinks.length) return show;
    const next = { ...show, entityLinks: [...existing, ...nextLinks] };
    changedShows.push(next);
    return next;
  });

  return { shows: nextShows, changedShows };
}

function rawValueKey(evidence) {
  return `${evidence.baseField}\u0000${evidence.normalizedValue}`;
}

function buildRepeatCounts(scopedShows) {
  const groups = new Map();
  scopedShows.forEach((show) => extractEnrichmentEvidence(show).forEach((evidence) => {
    if (!CORE_EVIDENCE_FIELDS.has(evidence.baseField) || !evidence.normalizedValue) return;
    const key = rawValueKey(evidence);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(show.id);
  }));
  return groups;
}

function reviewConfidence(evidence, repeatCount, matchKind = null) {
  if (matchKind === "exact-legacy-id" || matchKind === "exact-normalized-name") return "high";
  if (evidence.compound) return "low";
  if (repeatCount >= 2) return "medium";
  return "low";
}

function reviewScore(evidence, repeatCount, matchKind = null) {
  const exact = matchKind === "exact-legacy-id" || matchKind === "exact-normalized-name";
  const base = exact ? 900 : evidence.compound ? 650 : 500;
  const typed = ["credits.productionCompany", "credits.studio", "credits.network"].includes(evidence.baseField) ? 80 : 0;
  return base + typed + Math.min(repeatCount, 20) * 5 - sourceFieldRank(evidence.field);
}

function mergeReviewEvidence(entry, show, evidence, match = null) {
  const key = `${evidence.field}\u0000${evidence.value}\u0000${match?.entity?.id || ""}`;
  if (entry._evidenceKeys.has(key)) return;
  entry._evidenceKeys.add(key);
  entry.evidence.push(evidenceRecord(show, evidence, {
    ...(match?.matchKind ? { matchKind: match.matchKind } : {}),
    ...(match?.componentValues?.length ? { matchedComponents: match.componentValues } : {}),
  }));
}

function candidateReviewReason(evidence, match, show) {
  const rule = AUTOMATIC_MATCH_RULES[evidence.baseField];
  if (match.matchKind === "compound-normalized-component") {
    return "The source value contains multiple names; confirm the matched component and split the credit before authoring a link.";
  }
  if (rule && match.entity.type !== rule.entityType) {
    return `The exact source value matches an existing entity, but its registry type ("${match.entity.type}") conflicts with the proposed "${rule.role}" role.`;
  }
  if (evidence.baseField === "creatorId" || evidence.baseField === "networkId") {
    return evidence.baseField === "creatorId"
      ? "The legacy creator identifier matches an entity, but the identity and creator role should be confirmed against the stored source evidence."
      : "The legacy network identifier matches an entity, but networkId values can be providers, show slugs, or networks; confirm the intended role.";
  }
  if (!evidence.roleSupport?.role) {
    return "This owner, distributor, publisher, cast, or other credit is source evidence but is outside the current public relationship role model.";
  }
  if (Array.isArray(show.entityLinks) && show.entityLinks.some((link) => link.entityId === match.entity.id)) {
    return `The entity is already linked to this show under another role; confirm that the explicit "${evidence.roleSupport.role}" field represents a second relationship.`;
  }
  return "The exact entity identity is plausible, but the source field is not one of the narrowly auto-resolvable typed fields.";
}

function finalizeReviewEntry(entry) {
  const { _evidenceKeys, _rankEvidence, ...result } = entry;
  result.evidence.sort((left, right) => sourceFieldRank(left.field) - sourceFieldRank(right.field) || left.value.localeCompare(right.value, "en"));
  return result;
}

function addSpecificReview(reviews, show, evidence, match, sourceDirectory) {
  const proposedRole = proposedRoleForEvidence(evidence, match.entity);
  const rule = AUTOMATIC_MATCH_RULES[evidence.baseField];
  const compoundCandidate = match.matchKind === "compound-normalized-component";
  const typeConflict = Boolean(!compoundCandidate && rule && match.entity.type !== rule.entityType);
  const key = `${show.id}\u0000${match.entity.id}\u0000${proposedRole || "untyped"}`;
  if (!reviews.has(key)) {
    reviews.set(key, {
      reviewId: `${show.id}:review:${match.entity.id}:${proposedRole || "credit"}`,
      reviewKind: typeConflict ? "entity-type-role-conflict" : compoundCandidate ? "compound-candidate" : "existing-entity-candidate",
      show: showSummary(show, sourceDirectory),
      candidateEntity: entitySummary(match.entity),
      candidateName: match.entity.name,
      proposedRelationshipType: proposedRole,
      evidence: [],
      confidence: reviewConfidence(evidence, 1, match.matchKind),
      reason: candidateReviewReason(evidence, match, show),
      rankScore: typeConflict ? 880 : reviewScore(evidence, 1, match.matchKind),
      _evidenceKeys: new Set(),
    });
  }
  const review = reviews.get(key);
  if (typeConflict) {
    review.reviewKind = "entity-type-role-conflict";
    review.rankScore = Math.max(review.rankScore, 880);
    review.reason = candidateReviewReason(evidence, match, show);
  }
  const repeatCount = review._repeatCount || 1;
  review._repeatCount = Math.max(repeatCount, 1);
  review.confidence = reviewConfidence(evidence, review._repeatCount, match.matchKind);
  review.rankScore = Math.max(review.rankScore, reviewScore(evidence, review._repeatCount, match.matchKind));
  mergeReviewEvidence(review, show, evidence, match);
}

function addAmbiguousReview(reviews, show, evidence, matches, sourceDirectory) {
  const key = `${show.id}\u0000ambiguous\u0000${evidence.baseField}\u0000${evidence.normalizedValue}`;
  if (!reviews.has(key)) {
    reviews.set(key, {
      reviewId: `${show.id}:review:ambiguous:${evidence.baseField}:${evidence.normalizedValue}`,
      reviewKind: "ambiguous-registry-match",
      show: showSummary(show, sourceDirectory),
      candidateEntity: null,
      candidateName: evidence.value,
      candidateEntities: matches.map((match) => entitySummary(match.entity)),
      proposedRelationshipType: evidence.roleSupport?.role || null,
      evidence: [],
      confidence: "medium",
      reason: "The source value matches more than one registry identity; choose deliberately before authoring a relationship.",
      rankScore: reviewScore(evidence, 1, null) + 50,
      _evidenceKeys: new Set(),
    });
  }
  mergeReviewEvidence(reviews.get(key), show, evidence);
}

function addUnresolvedShowReview(reviews, show, evidence, indexes, repeatCounts, sourceDirectory) {
  const best = [...evidence].sort((left, right) => sourceFieldRank(left.field) - sourceFieldRank(right.field) || left.value.localeCompare(right.value, "en"))[0];
  if (!best) return;
  const matches = matchesForEvidence(best, indexes);
  const exactMatch = matches.length === 1 && matches[0].matchKind !== "compound-normalized-component" ? matches[0] : null;
  const repeatCount = repeatCounts.get(rawValueKey(best))?.size || 1;
  const candidateEntity = exactMatch ? entitySummary(exactMatch.entity) : null;
  const reason = best.compound
    ? "The primary attribution is a compound value; split and confirm each named entity before creating any link."
    : candidateEntity
      ? "The source value matches an existing entity, but the relationship is not covered by the automatic typed-field rules."
      : repeatCount >= 2
        ? `No public entity record matches this raw attribution. It recurs across ${repeatCount} published shows, so review it as a normalization batch before creating anything.`
        : "No public entity record matches this raw attribution in the repository. Confirm it from the stored catalogue/import sources before creating an entity or link.";
  const key = `${show.id}\u0000unresolved-primary`;
  reviews.set(key, {
    reviewId: `${show.id}:review:unresolved-primary`,
    reviewKind: "unresolved-show-attribution",
    show: showSummary(show, sourceDirectory),
    candidateEntity,
    candidateName: candidateEntity ? candidateEntity.name : best.value,
    proposedRelationshipType: best.roleSupport?.role || null,
    evidence: evidence.map((entry) => evidenceRecord(show, entry)).sort((left, right) => sourceFieldRank(left.field) - sourceFieldRank(right.field) || left.value.localeCompare(right.value, "en")),
    confidence: candidateEntity ? "high" : reviewConfidence(best, repeatCount),
    reason,
    rankScore: reviewScore(best, repeatCount, exactMatch?.matchKind || null),
    _evidenceKeys: new Set(),
  });
}

function buildReviewQueue(scopedShows, indexes, automaticLinks, roleConflicts, options = {}) {
  const sourceDirectory = options.sourceDirectory || "catalog-src/shows";
  const automaticKeys = new Set(automaticLinks.map((entry) => `${entry.show.id}\u0000${entry.entity.entityId}\u0000${entry.role}`));
  const repeatCounts = buildRepeatCounts(scopedShows);
  const reviews = new Map();
  const infrastructureOnly = [];
  const specificShowIds = new Set();

  scopedShows.forEach((show) => {
    const allEvidence = extractEnrichmentEvidence(show);
    allEvidence.forEach((evidence) => {
      const reviewRelevant = linkSet(show).size === 0
        || CORE_EVIDENCE_FIELDS.has(evidence.baseField)
        || ["credits.ownerName", "metadata.podcast.ownerName", "credits.publisher", "credits.distributor"].includes(evidence.baseField)
        || (evidence.field.startsWith("credits.people[") && /^(?:author|creator|created by)$/i.test(evidence.contextRole || ""));
      if (!reviewRelevant) return;
      const matches = matchesForEvidence(evidence, indexes);
      if (matches.length > 1 && matches.some((match) => match.matchKind !== "compound-normalized-component")) {
        addAmbiguousReview(reviews, show, evidence, matches.filter((match) => match.matchKind !== "compound-normalized-component"), sourceDirectory);
        specificShowIds.add(show.id);
        return;
      }
      matches.forEach((match) => {
        const proposedRole = proposedRoleForEvidence(evidence, match.entity);
        if (proposedRole && automaticKeys.has(`${show.id}\u0000${match.entity.id}\u0000${proposedRole}`)) return;
        if (proposedRole && linkSet(show).has(linkKey(match.entity.id, proposedRole))) return;
        if (!proposedRole && ["creator", "production-company", "studio", "network"]
          .some((role) => linkSet(show).has(linkKey(match.entity.id, role)))) return;
        addSpecificReview(reviews, show, evidence, match, sourceDirectory);
        specificShowIds.add(show.id);
      });
    });
  });

  scopedShows.filter((show) => linkSet(show).size === 0).forEach((show) => {
    const coreEvidence = extractEnrichmentEvidence(show).filter((entry) => CORE_EVIDENCE_FIELDS.has(entry.baseField));
    const nonInfrastructureEvidence = coreEvidence.filter((entry) => !ENTITY_ATTRIBUTION_INFRASTRUCTURE_LABELS.has(entry.normalizedValue));
    if (!nonInfrastructureEvidence.length) {
      infrastructureOnly.push({
        reviewId: `${show.id}:infrastructure-only`,
        show: showSummary(show, sourceDirectory),
        candidateEntity: null,
        candidateName: coreEvidence[0]?.value || null,
        proposedRelationshipType: null,
        evidence: coreEvidence.map((entry) => evidenceRecord(show, entry)),
        confidence: "high",
        reason: "The remaining core attribution is a known hosting or distribution label; do not create a creator/company entity from it.",
        rankScore: 100,
      });
      return;
    }
    addUnresolvedShowReview(reviews, show, nonInfrastructureEvidence, indexes, repeatCounts, sourceDirectory);
  });

  roleConflicts.forEach((entry) => {
    const key = `${entry.show.id}\u0000${entry.entity.entityId}\u0000${entry.role}`;
    if (reviews.has(key)) return;
    reviews.set(key, {
      ...entry,
      candidateEntity: entry.entity,
      candidateName: entry.entity.name,
      reviewKind: "entity-type-role-conflict",
      rankScore: 880,
      _evidenceKeys: new Set(),
    });
    const review = reviews.get(key);
    entry.evidence.forEach((evidence) => {
      review.evidence.push(evidence);
      review._evidenceKeys.add(`${evidence.field}\u0000${evidence.value}\u0000${entry.entity.entityId}`);
    });
  });

  const finalized = [...reviews.values()].map((entry) => {
    delete entry._repeatCount;
    return finalizeReviewEntry(entry);
  }).sort((left, right) => right.rankScore - left.rankScore
    || (CONFIDENCE_PRIORITY.get(right.confidence) || 0) - (CONFIDENCE_PRIORITY.get(left.confidence) || 0)
    || left.show.title.localeCompare(right.show.title, "en")
    || left.reviewId.localeCompare(right.reviewId, "en"));

  return {
    queue: finalized,
    infrastructureOnly,
    summary: {
      itemCount: finalized.length,
      showCount: new Set(finalized.map((entry) => entry.show.id)).size,
      unresolvedShowItemCount: finalized.filter((entry) => entry.reviewKind === "unresolved-show-attribution").length,
      existingEntityCandidateCount: finalized.filter((entry) => entry.reviewKind === "existing-entity-candidate").length,
      roleConflictItemCount: finalized.filter((entry) => entry.reviewKind === "entity-type-role-conflict").length,
      compoundCandidateCount: finalized.filter((entry) => entry.reviewKind === "compound-candidate").length,
      ambiguousMatchCount: finalized.filter((entry) => entry.reviewKind === "ambiguous-registry-match").length,
      highConfidenceCount: finalized.filter((entry) => entry.confidence === "high").length,
      mediumConfidenceCount: finalized.filter((entry) => entry.confidence === "medium").length,
      lowConfidenceCount: finalized.filter((entry) => entry.confidence === "low").length,
      infrastructureOnlyShowCount: infrastructureOnly.length,
    },
    specificShowIds,
  };
}

function buildPatternGroups(scopedShows, predicate) {
  const groups = new Map();
  scopedShows.filter((show) => linkSet(show).size === 0).forEach((show) => {
    extractEnrichmentEvidence(show).filter(predicate).forEach((evidence) => {
      const key = evidence.normalizedValue;
      if (!key) return;
      if (!groups.has(key)) groups.set(key, {
        normalizedValue: key,
        rawValues: new Set(),
        fields: new Set(),
        showIds: new Set(),
        showTitles: new Map(),
      });
      const group = groups.get(key);
      group.rawValues.add(evidence.value);
      group.fields.add(evidence.baseField);
      group.showIds.add(show.id);
      group.showTitles.set(show.id, show.title || show.id);
    });
  });
  return [...groups.values()]
    .filter((group) => group.showIds.size >= 2)
    .map((group) => ({
      normalizedValue: group.normalizedValue,
      rawValues: [...group.rawValues].sort((left, right) => left.localeCompare(right, "en")),
      fields: [...group.fields].sort(),
      showCount: group.showIds.size,
      sampleShows: [...group.showTitles.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .slice(0, 5)
        .map(([id, title]) => ({ id, title })),
    }))
    .sort((left, right) => right.showCount - left.showCount || left.normalizedValue.localeCompare(right.normalizedValue, "en"));
}

function buildSystemicCauses(scopedShows, review, roleConflicts) {
  const unlinked = scopedShows.filter((show) => linkSet(show).size === 0);
  const nonInfrastructureUnlinked = unlinked.filter((show) => !review.infrastructureOnly.some((entry) => entry.show.id === show.id));
  const countShows = (predicate, records = nonInfrastructureUnlinked) => new Set(records.filter(predicate).map((show) => show.id)).size;
  const evidenceFor = (show) => extractEnrichmentEvidence(show);
  const fieldBreakdown = {};
  EVIDENCE_FIELDS.forEach(({ path }) => {
    fieldBreakdown[path] = countShows((show) => evidenceFor(show).some((entry) => entry.baseField === path));
  });

  const causes = [
    {
      id: "legacy-creator-attribution",
      label: "Legacy creator/creatorName evidence has no resolved public entity link",
      affectedShowCount: countShows((show) => evidenceFor(show).some((entry) => ["creatorId", "creators", "credits.creatorName"].includes(entry.baseField))),
      action: "Normalize repeated creator strings against repository-held source evidence; do not create entities from names alone.",
    },
    {
      id: "legacy-network-identifiers",
      label: "networkId and network fields mix real networks with provider, show, and slug-like labels",
      affectedShowCount: countShows((show) => evidenceFor(show).some((entry) => ["networkId", "credits.network"].includes(entry.baseField))),
      action: "Review repeated network values in batches and keep known infrastructure out of the entity registry.",
    },
    {
      id: "compound-credits",
      label: "Compound credits combine multiple people or organizations in one value",
      affectedShowCount: countShows((show) => evidenceFor(show).some((entry) => entry.compound && CORE_EVIDENCE_FIELDS.has(entry.baseField))),
      action: "Split only when each component is independently supported by stored source evidence.",
    },
    {
      id: "structured-people-without-entities",
      label: "Structured author/creator people records do not have matching public person entities",
      affectedShowCount: countShows((show) => evidenceFor(show).some((entry) => entry.field.startsWith("credits.people[") && /^(?:author|creator|created by)$/i.test(entry.contextRole || ""))),
      action: "Review structured people records against the existing person registry; do not auto-create people.",
    },
    {
      id: "entity-type-role-conflicts",
      label: "Explicit typed credits match an entity identity but conflict with its registry type",
      affectedShowCount: new Set(roleConflicts.map((entry) => entry.show.id)).size,
      action: "Resolve whether the source field represents a second role or whether the entity classification needs correction.",
    },
    {
      id: "unsupported-credit-roles",
      label: "Owner, publisher, distributor, cast, and other import credits are evidence but not current public graph roles",
      affectedShowCount: countShows((show) => evidenceFor(show).some((entry) => entry.roleSupport?.role === null)),
      action: "Keep these as review evidence until a source-backed role decision or schema extension exists.",
    },
  ].filter((cause) => cause.affectedShowCount > 0)
    .sort((left, right) => right.affectedShowCount - left.affectedShowCount || left.id.localeCompare(right.id, "en"));

  const recurringUnresolvedValues = buildPatternGroups(scopedShows, (entry) => CORE_EVIDENCE_FIELDS.has(entry.baseField)
    && !ENTITY_ATTRIBUTION_INFRASTRUCTURE_LABELS.has(entry.normalizedValue));
  const recurringInfrastructureValues = buildPatternGroups(scopedShows, (entry) => ["networkId", "credits.network"].includes(entry.baseField)
    && ENTITY_ATTRIBUTION_INFRASTRUCTURE_LABELS.has(entry.normalizedValue));

  return {
    causes,
    fieldBreakdown,
    recurringPatterns: {
      unresolvedValues: recurringUnresolvedValues.slice(0, 20).map((entry) => ({
        ...entry,
        action: "Batch-review this normalized value against stored source evidence before adding any entity or link.",
      })),
      infrastructureValues: recurringInfrastructureValues.slice(0, 20).map((entry) => ({
        ...entry,
        action: "Keep this provider/hosting label out of the creator and organization registry.",
      })),
    },
  };
}

function graphSnapshot(report) {
  return {
    publishedShows: report.summary.showCount,
    publicEntities: report.summary.entityCount,
    relationships: report.summary.relationshipCount,
    typedLinkedShows: report.summary.connectedShowCount,
    zeroRelationshipShows: report.summary.zeroRelationshipShowCount,
    nonInfrastructureAttributionGaps: report.summary.creatorAttributionGapCount,
    infrastructureOnlyUnlinkedShows: report.summary.infrastructureOnlyUnlinkedShowCount,
  };
}

function buildEntityAttributionReport(shows = [], entities = [], options = {}) {
  const showStatuses = options.showStatuses === undefined ? DEFAULT_SHOW_STATUSES : options.showStatuses;
  const entityPublications = options.entityPublications === undefined ? DEFAULT_ENTITY_PUBLICATIONS : options.entityPublications;
  const graphOptions = {
    collections: options.collections || [],
    showStatuses,
    entityPublications,
  };
  const beforeGraph = buildEntityGraphReport(shows, entities, graphOptions);
  const plan = planDeterministicEntityLinks(shows, entities, {
    showStatuses,
    entityPublications,
    sourceDirectory: options.sourceDirectory,
  });
  const applied = applyDeterministicEntityLinks(shows, plan.automaticLinks);
  const afterGraph = buildEntityGraphReport(applied.shows, entities, graphOptions);
  const review = buildReviewQueue(plan.scopedShows, plan.indexes, plan.automaticLinks, plan.roleConflicts, {
    sourceDirectory: options.sourceDirectory,
  });
  const automaticPairs = new Set();
  plan.automaticLinks.forEach((entry) => {
    const show = plan.scopedShows.find((candidate) => candidate.id === entry.show.id);
    if (!show) return;
    const existing = new Set((show.entityLinks || []).map((link) => link.entityId));
    if (!existing.has(entry.entity.entityId)) automaticPairs.add(`${entry.show.id}\u0000${entry.entity.entityId}`);
  });

  return {
    scope: {
      showStatuses,
      entityPublications,
      sourceDirectory: options.sourceDirectory || "catalog-src/shows",
      sourceOnly: true,
      externalLookups: false,
      writesPerformed: false,
    },
    before: graphSnapshot(beforeGraph),
    after: graphSnapshot(afterGraph),
    automatic: {
      linkCount: plan.automaticLinks.length,
      showCount: new Set(plan.automaticLinks.map((entry) => entry.show.id)).size,
      newShowEntityPairCount: automaticPairs.size,
      roleCounts: plan.automaticLinks.reduce((counts, entry) => {
        counts[entry.role] = (counts[entry.role] || 0) + 1;
        return counts;
      }, {}),
      fieldCounts: plan.automaticLinks.reduce((counts, entry) => {
        entry.evidence.forEach((evidence) => { counts[evidence.field] = (counts[evidence.field] || 0) + 1; });
        return counts;
      }, {}),
      links: plan.automaticLinks,
    },
    roleConflicts: plan.roleConflicts,
    review: {
      ...review.summary,
      queue: review.queue,
      infrastructureOnly: review.infrastructureOnly,
    },
    systemicCauses: buildSystemicCauses(plan.scopedShows, review, plan.roleConflicts),
  };
}

module.exports = {
  AUTOMATIC_MATCH_RULES,
  buildEntityAttributionReport,
  applyDeterministicEntityLinks,
  buildEntityIndexes,
  matchesForEvidence,
  planDeterministicEntityLinks,
};
