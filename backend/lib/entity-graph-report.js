const {
  ROLES,
  TYPES,
  normalizeEntityIdentityKey,
  normalizeEntityName,
} = require("../../shared/archive-entities");
const { buildEntityGraphData } = require("./entity-graph");

const DEFAULT_SHOW_STATUSES = ["published"];
const DEFAULT_ENTITY_PUBLICATIONS = ["public"];
const DEFAULT_WEAK_ENTITY_MAX_SHOW_COUNT = 1;
const DEFAULT_WEAK_SHOW_MAX_RELATIONSHIP_COUNT = 1;
const DEFAULT_THIN_ENTITY_MIN_SHOW_COUNT = 3;

const EVIDENCE_FIELDS = [
  { path: "creatorId", category: "creator" },
  { path: "networkId", category: "network" },
  { path: "creators", category: "creator" },
  { path: "credits.creatorName", category: "creator" },
  { path: "credits.productionCompany", category: "production-company" },
  { path: "credits.studio", category: "studio" },
  { path: "credits.network", category: "network" },
];

const PLACEHOLDER_EVIDENCE = /^(?:-|n\/a|na|none|not available|not verified|unknown|tbd)$/i;
const COMPOUND_EVIDENCE = /(?:[|/&,]|\band\b)/i;
const INFRASTRUCTURE_EVIDENCE = new Set([
  "art19",
  "audible",
  "buzzsprout",
  "patreon",
  "rss com",
  "spreaker",
  "spotify",
].map(normalizeEntityName));

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asValues(value) {
  if (Array.isArray(value)) return value.flatMap(asValues);
  if (value === undefined || value === null || typeof value === "object") return [];

  const text = String(value).trim();
  return text && !PLACEHOLDER_EVIDENCE.test(text) ? [text] : [];
}

function readPath(record, path) {
  return path.split(".").reduce((value, key) => (isRecord(value) ? value[key] : undefined), record);
}

function extractEntityEvidence(show) {
  return EVIDENCE_FIELDS.flatMap(({ path, category }) =>
    asValues(readPath(show, path)).map((value) => ({
      field: path,
      category,
      value,
      compound: COMPOUND_EVIDENCE.test(value),
    })),
  );
}

function isInfrastructureEvidence(entry) {
  return INFRASTRUCTURE_EVIDENCE.has(normalizeEntityName(entry?.value));
}

function findPotentialDuplicateEntities(entities) {
  const byIdentityKey = new Map();
  (Array.isArray(entities) ? entities : []).forEach((entity) => {
    if (!isRecord(entity) || typeof entity.id !== "string") return;
    [entity.name, ...(Array.isArray(entity.aliases) ? entity.aliases : [])].forEach((label) => {
      const identityKey = normalizeEntityIdentityKey(label);
      if (!identityKey || identityKey.length < 3) return;
      if (!byIdentityKey.has(identityKey)) byIdentityKey.set(identityKey, []);
      byIdentityKey.get(identityKey).push({
        entityId: entity.id,
        name: entity.name,
        label,
        type: entity.type,
        normalizedName: normalizeEntityName(label),
      });
    });
  });

  const candidates = new Map();
  byIdentityKey.forEach((entries, identityKey) => {
    const byEntity = new Map();
    entries.forEach((entry) => {
      if (!byEntity.has(entry.entityId)) byEntity.set(entry.entityId, []);
      byEntity.get(entry.entityId).push(entry);
    });
    const entityIds = [...byEntity.keys()].sort();
    entityIds.forEach((leftId, index) => {
      entityIds.slice(index + 1).forEach((rightId) => {
        const left = byEntity.get(leftId);
        const right = byEntity.get(rightId);
        const exact = left.some((leftEntry) => right.some((rightEntry) => leftEntry.normalizedName === rightEntry.normalizedName));
        const key = `${leftId}\u0000${rightId}`;
        candidates.set(key, {
          entityIds: [leftId, rightId],
          names: [...new Set([...left, ...right].map((entry) => entry.label))].sort((a, b) => a.localeCompare(b, "en")),
          types: [...new Set([...left, ...right].map((entry) => entry.type).filter(Boolean))].sort(),
          identityKey,
          matchType: exact ? "exact-normalized-name" : "identity-variant",
          confidence: exact ? "high" : "review",
        });
      });
    });
  });

  return [...candidates.values()].sort((left, right) => left.matchType.localeCompare(right.matchType) || left.identityKey.localeCompare(right.identityKey, "en") || left.entityIds.join("\u0000").localeCompare(right.entityIds.join("\u0000"), "en"));
}

function unique(values) {
  return [...new Set(values)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function percent(numerator, denominator) {
  return denominator > 0 ? round((numerator / denominator) * 100) : 0;
}

function normalizeFilter(value, fallback) {
  if (value === null) return null;
  const values = Array.isArray(value) ? value : [value];
  return unique(values.map((entry) => String(entry || "").trim()).filter(Boolean));
}

function selectShows(shows, showStatuses) {
  const records = Array.isArray(shows) ? shows.filter(isRecord) : [];
  if (showStatuses === null) return records;
  const allowed = new Set(showStatuses);
  return records.filter((show) => allowed.has(show.status));
}

function selectEntities(entities, entityPublications) {
  const records = Array.isArray(entities) ? entities.filter(isRecord) : [];
  if (entityPublications === null) return records;
  const allowed = new Set(entityPublications);
  return records.filter((entity) => allowed.has(entity.publication));
}

function buildEntityIndexes(entities) {
  const byId = new Map();
  const byName = new Map();

  entities.forEach((entity) => {
    if (typeof entity.id !== "string" || !entity.id.trim()) return;
    byId.set(entity.id, entity);
    [entity.name, ...(Array.isArray(entity.aliases) ? entity.aliases : [])].forEach((name) => {
      const key = normalizeEntityName(name);
      if (!key) return;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(entity);
    });
  });

  return { byId, byName };
}

function findRegistryMatches(value, indexes) {
  const matches = new Map();
  const direct = indexes.byId.get(value);
  if (direct) matches.set(direct.id, { entity: direct, matchKinds: ["id"] });

  (indexes.byName.get(normalizeEntityName(value)) || []).forEach((entity) => {
    const existing = matches.get(entity.id);
    if (existing) existing.matchKinds.push("name");
    else matches.set(entity.id, { entity, matchKinds: ["name"] });
  });

  return [...matches.values()];
}

function formatEntity(entity) {
  return {
    entityId: entity.id,
    name: entity.name,
    type: entity.type,
    publication: entity.publication,
  };
}

function compareCountThenId(left, right, countKey = "showCount") {
  return right[countKey] - left[countKey] || String(left.entityId || left.id).localeCompare(String(right.entityId || right.id), "en");
}

function getEntityPageMissingFields(entity) {
  const missing = [];
  if (typeof entity?.description !== "string" || !entity.description.trim()) missing.push("description");
  if (typeof entity?.website !== "string" || !entity.website.trim()) missing.push("website");
  if (!Array.isArray(entity?.aliases) || entity.aliases.length === 0) missing.push("aliases");
  return missing;
}

function aggregateEvidenceValues(showEntries) {
  const values = new Map();

  showEntries.forEach(({ show, evidence }) => {
    evidence.forEach((entry) => {
      const key = `${entry.field}\u0000${normalizeEntityName(entry.value)}`;
      if (!values.has(key)) {
        values.set(key, {
          field: entry.field,
          category: entry.category,
          value: entry.value,
          compound: entry.compound,
          showIds: new Set(),
        });
      }
      values.get(key).showIds.add(show.id);
    });
  });

  return [...values.values()]
    .map((entry) => ({ ...entry, showIds: [...entry.showIds].sort(), showCount: entry.showIds.size }))
    .sort((left, right) => right.showCount - left.showCount || left.field.localeCompare(right.field) || left.value.localeCompare(right.value, "en"));
}

function buildMetric(showIds, denominator) {
  return { showCount: showIds.size, percent: percent(showIds.size, denominator) };
}

function buildCollectionCoverage(collections, scopedShows, allShows) {
  const records = Array.isArray(collections) ? collections.filter(isRecord) : [];
  const allShowIds = new Set(allShows.map((show) => show.id));
  const scopedShowIds = new Set(scopedShows.map((show) => show.id));
  const membershipCounts = new Map(scopedShows.map((show) => [show.id, 0]));
  const coverage = [];
  const duplicateMembershipGroups = [];
  const unknownShowMemberships = [];
  const outOfScopeShowMemberships = [];
  const invalidCollectionRecords = [];

  records.forEach((collection) => {
    if (Object.hasOwn(collection, "showIds") && !Array.isArray(collection.showIds)) {
      invalidCollectionRecords.push({ collectionId: collection.id, reason: "showIds must be an array" });
    }

    const rawShowIds = Array.isArray(collection.showIds) ? collection.showIds : [];
    const seen = new Map();
    const showIds = [];
    const unknownShowIds = [];
    const outOfScopeShowIds = [];

    rawShowIds.forEach((value) => {
      const showId = String(value || "").trim();
      const count = (seen.get(showId) || 0) + 1;
      seen.set(showId, count);
      if (count > 1) {
        duplicateMembershipGroups.push({ collectionId: collection.id, showId, count });
        return;
      }

      if (!allShowIds.has(showId)) {
        unknownShowMemberships.push({ collectionId: collection.id, showId });
        unknownShowIds.push(showId);
        return;
      }
      if (!scopedShowIds.has(showId)) {
        outOfScopeShowMemberships.push({ collectionId: collection.id, showId });
        outOfScopeShowIds.push(showId);
        return;
      }

      showIds.push(showId);
      membershipCounts.set(showId, membershipCounts.get(showId) + 1);
    });

    coverage.push({
      id: collection.id,
      title: collection.title || collection.id,
      kind: collection.kind,
      rawMembershipCount: rawShowIds.length,
      showCount: showIds.length,
      showIds,
      unknownShowIds,
      outOfScopeShowIds,
    });
  });

  coverage.sort((left, right) => right.showCount - left.showCount || String(left.id).localeCompare(String(right.id), "en"));
  const membershipCount = [...membershipCounts.values()].reduce((total, count) => total + count, 0);
  const showsWithMembership = [...membershipCounts.values()].filter((count) => count > 0).length;

  return {
    summary: {
      collectionCount: coverage.length,
      membershipCount,
      rawMembershipCount: coverage.reduce((total, collection) => total + collection.rawMembershipCount, 0),
      showsWithMembership,
      showsWithoutMembership: scopedShows.length - showsWithMembership,
      showsWithMembershipPercent: percent(showsWithMembership, scopedShows.length),
      averageCollectionsPerShow: scopedShows.length ? round(membershipCount / scopedShows.length) : 0,
      collectionBipartitePercent: percent(membershipCount, coverage.length * scopedShows.length),
      orphanCollectionCount: coverage.filter((collection) => collection.showCount === 0).length,
      duplicateMembershipGroupCount: duplicateMembershipGroups.length,
      unknownShowMembershipCount: unknownShowMemberships.length,
      outOfScopeShowMembershipCount: outOfScopeShowMemberships.length,
      invalidCollectionRecordCount: invalidCollectionRecords.length,
    },
    collections: coverage,
    topCollections: coverage.slice(0, 20),
    orphanCollections: coverage.filter((collection) => collection.showCount === 0),
    showsWithoutMembership: scopedShows
      .filter((show) => membershipCounts.get(show.id) === 0)
      .map((show) => ({ id: show.id, title: show.title || show.id, status: show.status })),
    suspiciousMemberships: {
      duplicateMembershipGroups,
      unknownShowMemberships,
      outOfScopeShowMemberships,
      invalidCollectionRecords,
    },
  };
}

function buildEntityGraphReport(shows = [], entities = [], options = {}) {
  const showStatuses = normalizeFilter(options.showStatuses === undefined ? DEFAULT_SHOW_STATUSES : options.showStatuses, DEFAULT_SHOW_STATUSES);
  const entityPublications = normalizeFilter(
    options.entityPublications === undefined ? DEFAULT_ENTITY_PUBLICATIONS : options.entityPublications,
    DEFAULT_ENTITY_PUBLICATIONS,
  );
  const weakEntityMaxShowCount = Number.isInteger(options.weakEntityMaxShowCount)
    ? Math.max(0, options.weakEntityMaxShowCount)
    : DEFAULT_WEAK_ENTITY_MAX_SHOW_COUNT;
  const weakShowMaxRelationshipCount = Number.isInteger(options.weakShowMaxRelationshipCount)
    ? Math.max(0, options.weakShowMaxRelationshipCount)
    : DEFAULT_WEAK_SHOW_MAX_RELATIONSHIP_COUNT;
  const thinEntityMinShowCount = Number.isInteger(options.thinEntityMinShowCount)
    ? Math.max(1, options.thinEntityMinShowCount)
    : DEFAULT_THIN_ENTITY_MIN_SHOW_COUNT;
  const scopedShows = selectShows(shows, showStatuses);
  const allEntities = Array.isArray(entities) ? entities.filter(isRecord) : [];
  const scopedEntities = selectEntities(allEntities, entityPublications);
  const collectionCoverage = buildCollectionCoverage(options.collections || [], scopedShows, Array.isArray(shows) ? shows.filter(isRecord) : []);
  const scopedEntityIds = new Set(scopedEntities.map((entity) => entity.id));
  const indexes = buildEntityIndexes(allEntities);
  const potentialDuplicateEntities = findPotentialDuplicateEntities(allEntities);

  const showCoverage = [];
  const zeroRelationshipShows = [];
  const unlinkedShowEntries = [];
  const duplicateRelationshipGroups = [];
  const sameEntityMultipleRoleGroups = [];
  const roleTypeDivergences = [];
  const personRoleViolations = [];
  const unknownEntityReferences = [];
  const nonPublicEntityReferences = [];
  const invalidRelationshipRecords = [];
  const linkedEvidenceConflicts = [];
  const attributionGapEntries = [];
  const entityState = new Map(scopedEntities.map((entity) => [entity.id, {
    entity,
    relationshipCount: 0,
    showIds: new Set(),
    roleCounts: new Map(),
  }]));
  const roleState = new Map(ROLES.map((role) => [role, { relationships: 0, showIds: new Set(), entityIds: new Set() }]));

  scopedShows.forEach((show) => {
    const hasEntityLinksField = Object.hasOwn(show, "entityLinks");
    const rawLinks = Array.isArray(show.entityLinks) ? show.entityLinks : [];
    const evidence = extractEntityEvidence(show);
    const attributionEvidence = evidence.filter((entry) => !isInfrastructureEvidence(entry));
    const infrastructureEvidence = evidence.filter(isInfrastructureEvidence);
    const duplicateGroups = new Map();
    const rolesByEntity = new Map();
    const linkedIds = new Set();
    const validScopedLinks = [];
    const nonPublicLinks = [];
    const unknownLinks = [];

    if (hasEntityLinksField && !Array.isArray(show.entityLinks)) {
      invalidRelationshipRecords.push({ showId: show.id, reason: "entityLinks must be an array" });
    }

    rawLinks.forEach((link, index) => {
      if (!isRecord(link)) {
        invalidRelationshipRecords.push({ showId: show.id, index, reason: "relationship is not an object" });
        return;
      }

      const entityId = String(link.entityId || "").trim();
      const role = String(link.role || "").trim();
      if (!entityId || !ROLES.includes(role)) {
        invalidRelationshipRecords.push({ showId: show.id, index, entityId, role, reason: "entityId and role are required" });
        return;
      }

      const key = `${entityId}:${role}`;
      if (!duplicateGroups.has(key)) duplicateGroups.set(key, { entityId, role, count: 0 });
      duplicateGroups.get(key).count += 1;

      if (!rolesByEntity.has(entityId)) rolesByEntity.set(entityId, new Set());
      rolesByEntity.get(entityId).add(role);

      const entity = indexes.byId.get(entityId);
      if (!entity) {
        const reference = { showId: show.id, entityId, role };
        unknownEntityReferences.push(reference);
        unknownLinks.push(reference);
        return;
      }

      if (!scopedEntityIds.has(entityId)) {
        const reference = { showId: show.id, entity: formatEntity(entity), role };
        nonPublicEntityReferences.push(reference);
        nonPublicLinks.push(reference);
        return;
      }

      const expectedRole = entity.type === "person" ? "creator" : entity.type;
      if (expectedRole !== role) {
        const divergence = { showId: show.id, ...formatEntity(entity), role, expectedTypeRole: expectedRole };
        roleTypeDivergences.push(divergence);
        if (entity.type === "person") personRoleViolations.push(divergence);
      }

      validScopedLinks.push({ entity, entityId, role });
      linkedIds.add(entityId);
      const state = entityState.get(entityId);
      state.relationshipCount += 1;
      state.showIds.add(show.id);
      state.roleCounts.set(role, (state.roleCounts.get(role) || 0) + 1);
      const roleSummary = roleState.get(role);
      roleSummary.relationships += 1;
      roleSummary.showIds.add(show.id);
      roleSummary.entityIds.add(entityId);
    });

    duplicateGroups.forEach((group) => {
      if (group.count > 1) duplicateRelationshipGroups.push({ showId: show.id, ...group });
    });
    rolesByEntity.forEach((roles, entityId) => {
      if (roles.size > 1) {
        sameEntityMultipleRoleGroups.push({
          showId: show.id,
          ...formatEntity(indexes.byId.get(entityId) || { id: entityId }),
          roles: [...roles].sort(),
        });
      }
    });

    const roleCounts = Object.fromEntries(ROLES.map((role) => [role, 0]));
    validScopedLinks.forEach(({ role }) => { roleCounts[role] += 1; });
    const coverageEntry = {
      id: show.id,
      title: show.title || show.id,
      status: show.status,
      rawRelationshipCount: rawLinks.length,
      relationshipCount: validScopedLinks.length,
      distinctEntityCount: linkedIds.size,
      roleCounts,
      roles: ROLES.filter((role) => roleCounts[role] > 0),
      hasCreatorRelationship: roleCounts.creator > 0,
      evidenceFields: unique(evidence.map((entry) => entry.field)),
      evidenceValueCount: evidence.length,
      hasCreatorEvidence: evidence.some((entry) => entry.category === "creator"),
      hasCreatorAttributionEvidence: attributionEvidence.some((entry) => entry.category === "creator"),
      hasOrganizationEvidence: evidence.some((entry) => entry.category !== "creator"),
      hasInfrastructureOnlyEvidence: evidence.length > 0 && attributionEvidence.length === 0,
      attributionEvidenceCount: attributionEvidence.length,
      infrastructureEvidenceCount: infrastructureEvidence.length,
    };

    if (validScopedLinks.length > 0) {
      const linkedEvidence = new Map();
      evidence.forEach((entry) => {
        findRegistryMatches(entry.value, indexes).forEach(({ entity, matchKinds }) => {
          if (!scopedEntityIds.has(entity.id) || linkedIds.has(entity.id)) return;
          const key = `${entry.field}\u0000${entry.value}\u0000${entity.id}`;
          if (!linkedEvidence.has(key)) linkedEvidence.set(key, {
            showId: show.id,
            field: entry.field,
            value: entry.value,
            entity: formatEntity(entity),
            matchKinds,
          });
        });
      });
      linkedEvidenceConflicts.push(...linkedEvidence.values());
    }

    if (validScopedLinks.length === 0) {
      const candidates = new Map();
      const unresolvedEvidence = [];
      evidence.forEach((entry) => {
        const matches = findRegistryMatches(entry.value, indexes);
        if (matches.length === 0) {
          unresolvedEvidence.push({ ...entry });
          return;
        }

        matches.forEach(({ entity, matchKinds }) => {
          if (!candidates.has(entity.id)) {
            candidates.set(entity.id, { ...formatEntity(entity), matchKinds: [], matchedEvidence: [] });
          }
          const candidate = candidates.get(entity.id);
          candidate.matchKinds = unique([...candidate.matchKinds, ...matchKinds]);
          candidate.matchedEvidence.push({ field: entry.field, category: entry.category, value: entry.value });
        });
      });

      const queue = candidates.size > 0
        ? "review-registry-match"
        : unknownLinks.length > 0
          ? "review-unknown-link"
          : nonPublicLinks.length > 0
            ? "review-non-public-link"
            : evidence.length > 0 && attributionEvidence.length === 0
              ? "infrastructure-only"
              : evidence.length > 0
                ? "research-source-and-link"
                : "no-known-evidence";
      const unlinkedEntry = {
        id: show.id,
        title: show.title || show.id,
        status: show.status,
        evidence,
        evidenceFields: unique(evidence.map((entry) => entry.field)),
        hasCreatorEvidence: evidence.some((entry) => entry.category === "creator"),
        hasCreatorAttributionEvidence: attributionEvidence.some((entry) => entry.category === "creator"),
        hasOrganizationEvidence: evidence.some((entry) => entry.category !== "creator"),
        attributionEvidence,
        infrastructureEvidence,
        hasInfrastructureOnlyEvidence: evidence.length > 0 && attributionEvidence.length === 0,
        registryMatchCandidates: [...candidates.values()].sort((left, right) => left.name.localeCompare(right.name, "en")),
        unresolvedEvidence,
        compoundEvidence: evidence.filter((entry) => entry.compound),
        nonPublicRelationships: nonPublicLinks,
        unknownRelationships: unknownLinks,
        queue,
      };
      unlinkedShowEntries.push(unlinkedEntry);
      zeroRelationshipShows.push(unlinkedEntry);
      if (attributionEvidence.length > 0) {
        attributionGapEntries.push({
          ...unlinkedEntry,
          evidence: attributionEvidence,
          evidenceFields: unique(attributionEvidence.map((entry) => entry.field)),
          compoundEvidence: attributionEvidence.filter((entry) => entry.compound),
          priority: candidates.size > 0
            ? "review-registry-match"
            : attributionEvidence.some((entry) => entry.category === "creator")
              ? "research-creator-attribution"
              : "research-organization-attribution",
        });
      }
    }

    showCoverage.push(coverageEntry);
  });

  const entityCoverage = [...entityState.values()].map(({ entity, relationshipCount, showIds, roleCounts }) => {
    const missingPageFields = getEntityPageMissingFields(entity);
    return {
      ...formatEntity(entity),
      indexable: entity.indexable,
      relationshipCount,
      showCount: showIds.size,
      showCoveragePercent: percent(showIds.size, scopedShows.length),
      showIds: [...showIds].sort(),
      roleCounts: Object.fromEntries(ROLES.map((role) => [role, roleCounts.get(role) || 0])),
      hasDescription: missingPageFields.includes("description") === false,
      hasWebsite: missingPageFields.includes("website") === false,
      aliasCount: Array.isArray(entity.aliases) ? entity.aliases.length : 0,
      sourceCount: Array.isArray(entity.sources) ? entity.sources.length : 0,
      missingPageFields,
    };
  }).sort(compareCountThenId);

  const topConnectedEntities = entityCoverage.slice(0, 20);
  const weaklyConnectedEntities = entityCoverage.filter((entity) => entity.showCount <= weakEntityMaxShowCount);
  const orphanEntities = entityCoverage.filter((entity) => entity.showCount === 0);
  const thinHighValueEntities = entityCoverage
    .filter((entity) => entity.showCount >= thinEntityMinShowCount && entity.missingPageFields.includes("description") && entity.missingPageFields.includes("website"))
    .sort(compareCountThenId);
  const roleCounts = ROLES.map((role) => {
    const state = roleState.get(role);
    return {
      role,
      relationships: state.relationships,
      showCount: state.showIds.size,
      entityCount: state.entityIds.size,
      showPercent: percent(state.showIds.size, scopedShows.length),
    };
  });

  const showIdsByRole = new Map(ROLES.map((role) => [role, new Set()]));
  showCoverage.forEach((show) => show.roles.forEach((role) => showIdsByRole.get(role).add(show.id)));
  const graphData = buildEntityGraphData({ shows: scopedShows, entities: scopedEntities });
  const forwardPublicPairs = new Set(graphData.edges.map((edge) => `${edge.showId}\u0000${edge.entityId}`));
  const reversePublicPairs = new Set(graphData.entities.flatMap((entity) => entity.showIds.map((showId) => `${showId}\u0000${entity.id}`)));
  const missingReverseEdges = [...forwardPublicPairs].filter((pair) => !reversePublicPairs.has(pair)).sort();
  const unexpectedReverseEdges = [...reversePublicPairs].filter((pair) => !forwardPublicPairs.has(pair)).sort();
  const evidenceShowEntries = scopedShows.map((show) => ({ show, evidence: extractEntityEvidence(show) }));
  const unlinkedShowIds = new Set(unlinkedShowEntries.map((entry) => entry.id));
  const unlinkedEvidenceEntries = evidenceShowEntries.filter(({ show }) => unlinkedShowIds.has(show.id));
  const evidenceByField = EVIDENCE_FIELDS.map(({ path, category }) => {
    const values = evidenceShowEntries.flatMap(({ show, evidence }) => evidence.filter((entry) => entry.field === path).map((entry) => ({ show, entry })));
    const unlinkedValues = unlinkedEvidenceEntries.flatMap(({ show, evidence }) => evidence.filter((entry) => entry.field === path).map((entry) => ({ show, entry })));
    return {
      field: path,
      category,
      showCount: new Set(values.map(({ show }) => show.id)).size,
      unlinkedShowCount: new Set(unlinkedValues.map(({ show }) => show.id)).size,
      valueCount: values.length,
      uniqueValueCount: new Set(values.map(({ entry }) => normalizeEntityName(entry.value))).size,
    };
  });

  const registryCandidates = new Map();
  unlinkedShowEntries.forEach((show) => show.registryMatchCandidates.forEach((candidate) => {
    if (!registryCandidates.has(candidate.entityId)) {
      registryCandidates.set(candidate.entityId, {
        entityId: candidate.entityId,
        name: candidate.name,
        type: candidate.type,
        publication: candidate.publication,
        showIds: new Set(),
        matchedFields: new Set(),
      });
    }
    const aggregate = registryCandidates.get(candidate.entityId);
    aggregate.showIds.add(show.id);
    candidate.matchedEvidence.forEach((entry) => aggregate.matchedFields.add(entry.field));
  }));

  const unlinkedRegistryMatchCandidates = [...registryCandidates.values()]
    .map((candidate) => ({ ...candidate, showIds: [...candidate.showIds].sort(), matchedFields: [...candidate.matchedFields].sort(), showCount: candidate.showIds.size }))
    .sort(compareCountThenId);
  const unresolvedLegacyValues = aggregateEvidenceValues(
    unlinkedShowEntries.flatMap((show) => [{ show, evidence: show.unresolvedEvidence }]),
  );

  const connectedShowCount = showCoverage.filter((show) => show.relationshipCount > 0).length;
  const weaklyLinkedShows = showCoverage.filter((show) => show.relationshipCount <= weakShowMaxRelationshipCount);
  const relationshipCount = showCoverage.reduce((total, show) => total + show.relationshipCount, 0);
  const uniqueShowEntityPairs = new Set();
  entityCoverage.forEach((entity) => entity.showIds.forEach((showId) => uniqueShowEntityPairs.add(`${showId}\u0000${entity.entityId}`)));

  const showsWithoutCreator = new Set(showCoverage.filter((show) => !show.hasCreatorRelationship).map((show) => show.id));
  const creatorEvidenceWithoutRelationship = new Set(showCoverage.filter((show) => show.hasCreatorEvidence && !show.hasCreatorRelationship).map((show) => show.id));
  const creatorAttributionEvidenceWithoutRelationship = new Set(showCoverage.filter((show) => show.hasCreatorAttributionEvidence && !show.hasCreatorRelationship).map((show) => show.id));
  const infrastructureOnlyUnlinkedShowIds = new Set(showCoverage.filter((show) => show.hasInfrastructureOnlyEvidence && show.relationshipCount === 0).map((show) => show.id));
  const onlyOrganizationRelationships = new Set(showCoverage.filter((show) => show.relationshipCount > 0 && !show.hasCreatorRelationship && show.roles.some((role) => role !== "creator")).map((show) => show.id));

  return {
    summary: {
      showCount: scopedShows.length,
      entityCount: scopedEntities.length,
      relationshipCount,
      rawRelationshipCount: scopedShows.reduce((total, show) => total + (Array.isArray(show.entityLinks) ? show.entityLinks.length : 0), 0),
      uniqueShowEntityPairCount: uniqueShowEntityPairs.size,
      connectedShowCount,
      connectedShowPercent: percent(connectedShowCount, scopedShows.length),
      zeroRelationshipShowCount: zeroRelationshipShows.length,
      weaklyLinkedShowCount: weaklyLinkedShows.length,
      unlinkedShowWithEvidenceCount: unlinkedShowEntries.filter((show) => show.evidence.length > 0).length,
      unlinkedShowWithoutEvidenceCount: unlinkedShowEntries.filter((show) => show.evidence.length === 0).length,
      collectionCount: collectionCoverage.summary.collectionCount,
      collectionMembershipCount: collectionCoverage.summary.membershipCount,
      showsWithCollectionMembership: collectionCoverage.summary.showsWithMembership,
      showsWithoutCollectionMembership: collectionCoverage.summary.showsWithoutMembership,
      orphanEntityCount: orphanEntities.length,
      weakEntityCount: weaklyConnectedEntities.length,
      duplicateRelationshipGroupCount: duplicateRelationshipGroups.length,
      sameEntityMultipleRoleCount: sameEntityMultipleRoleGroups.length,
      roleTypeDivergenceCount: roleTypeDivergences.length,
      linkedEvidenceConflictCount: linkedEvidenceConflicts.length,
      creatorAttributionGapCount: attributionGapEntries.length,
      infrastructureOnlyUnlinkedShowCount: infrastructureOnlyUnlinkedShowIds.size,
      potentialDuplicateEntityCount: potentialDuplicateEntities.length,
      thinHighValueEntityCount: thinHighValueEntities.length,
      derivedEntityConnectionCount: graphData.entityConnections.length,
      missingReverseEdgeCount: missingReverseEdges.length,
      unexpectedReverseEdgeCount: unexpectedReverseEdges.length,
    },
    scope: {
      showStatuses,
      entityPublications,
      weakEntityMaxShowCount,
      weakShowMaxRelationshipCount,
      thinEntityMinShowCount,
      sourceOnly: true,
    },
    coverage: {
      anyRelationship: buildMetric(new Set(showCoverage.filter((show) => show.relationshipCount > 0).map((show) => show.id)), scopedShows.length),
      creatorRelationship: buildMetric(showIdsByRole.get("creator"), scopedShows.length),
      productionCompanyRelationship: buildMetric(showIdsByRole.get("production-company"), scopedShows.length),
      studioRelationship: buildMetric(showIdsByRole.get("studio"), scopedShows.length),
      networkRelationship: buildMetric(showIdsByRole.get("network"), scopedShows.length),
      creatorEvidence: buildMetric(new Set(showCoverage.filter((show) => show.hasCreatorEvidence).map((show) => show.id)), scopedShows.length),
      creatorEvidenceWithoutRelationship: buildMetric(creatorEvidenceWithoutRelationship, scopedShows.length),
      creatorAttributionEvidenceWithoutRelationship: buildMetric(creatorAttributionEvidenceWithoutRelationship, scopedShows.length),
      withoutCreatorRelationship: buildMetric(showsWithoutCreator, scopedShows.length),
      onlyOrganizationRelationships: buildMetric(onlyOrganizationRelationships, scopedShows.length),
    },
    relationshipDensity: {
      relationshipCount,
      uniqueShowEntityPairCount: uniqueShowEntityPairs.size,
      possibleShowEntityPairs: scopedShows.length * scopedEntities.length,
      bipartitePercent: percent(uniqueShowEntityPairs.size, scopedShows.length * scopedEntities.length),
      averageRelationshipsPerShow: scopedShows.length ? round(relationshipCount / scopedShows.length) : 0,
      averageRelationshipsPerConnectedShow: connectedShowCount ? round(relationshipCount / connectedShowCount) : 0,
      averageShowsPerConnectedEntity: entityCoverage.filter((entity) => entity.showCount > 0).length
        ? round(uniqueShowEntityPairs.size / entityCoverage.filter((entity) => entity.showCount > 0).length)
        : 0,
      relationshipMultiplicityPercent: relationshipCount ? percent(relationshipCount - uniqueShowEntityPairs.size, relationshipCount) : 0,
    },
    relationshipTypeCounts: roleCounts,
    relationshipDistribution: {
      zero: showCoverage.filter((show) => show.relationshipCount === 0).length,
      one: showCoverage.filter((show) => show.relationshipCount === 1).length,
      twoToFour: showCoverage.filter((show) => show.relationshipCount >= 2 && show.relationshipCount <= 4).length,
      fivePlus: showCoverage.filter((show) => show.relationshipCount >= 5).length,
    },
    collectionCoverage,
    showCoverage,
    zeroRelationshipShows,
    weaklyLinkedShows,
    priorityQueues: {
      reviewRegistryMatch: unlinkedShowEntries.filter((show) => show.queue === "review-registry-match").map((show) => show.id),
      reviewUnknownLink: unlinkedShowEntries.filter((show) => show.queue === "review-unknown-link").map((show) => show.id),
      reviewNonPublicLink: unlinkedShowEntries.filter((show) => show.queue === "review-non-public-link").map((show) => show.id),
      researchSourceAndLink: unlinkedShowEntries.filter((show) => show.queue === "research-source-and-link").map((show) => show.id),
      noKnownEvidence: unlinkedShowEntries.filter((show) => show.queue === "no-known-evidence").map((show) => show.id),
      compoundEvidence: unlinkedShowEntries.filter((show) => show.compoundEvidence.length > 0).map((show) => show.id),
      researchCreatorAttribution: attributionGapEntries.filter((show) => show.priority === "research-creator-attribution").map((show) => show.id),
      researchOrganizationAttribution: attributionGapEntries.filter((show) => show.priority === "research-organization-attribution").map((show) => show.id),
      infrastructureOnly: [...infrastructureOnlyUnlinkedShowIds].sort(),
    },
    evidence: {
      byField: evidenceByField,
      unlinkedRegistryMatchCandidates,
      unresolvedLegacyValues,
      unresolvedLegacyValueCount: unresolvedLegacyValues.length,
      attributionGaps: attributionGapEntries,
      infrastructureOnlyShows: unlinkedShowEntries.filter((show) => show.hasInfrastructureOnlyEvidence),
    },
    entityCoverage,
    topConnectedEntities,
    weaklyConnectedEntities,
    orphanEntities,
    thinHighValueEntities,
    navigationReciprocity: {
      authoredPublicEdgeCount: graphData.edges.length,
      reverseEntityShowPairCount: reversePublicPairs.size,
      missingReverseEdges,
      unexpectedReverseEdges,
      ok: missingReverseEdges.length === 0 && unexpectedReverseEdges.length === 0,
    },
    entityEntityRelationships: {
      authored: false,
      derivedSharedShowConnections: graphData.entityConnections,
    },
    entityCoverageByType: TYPES.map((type) => {
      const typed = entityCoverage.filter((entity) => entity.type === type);
      const linked = typed.filter((entity) => entity.showCount > 0);
      return {
        type,
        entityCount: typed.length,
        linkedEntityCount: linked.length,
        orphanEntityCount: typed.length - linked.length,
        relationshipCount: typed.reduce((total, entity) => total + entity.relationshipCount, 0),
        linkedEntityPercent: percent(linked.length, typed.length),
      };
    }),
    suspiciousRelationships: {
      duplicateRelationshipGroups,
      sameEntityMultipleRoleGroups,
      roleTypeDivergences,
      personRoleViolations,
      unknownEntityReferences,
      nonPublicEntityReferences,
      invalidRelationshipRecords,
      linkedEvidenceConflicts,
      potentialDuplicateEntities,
    },
  };
}

module.exports = {
  DEFAULT_ENTITY_PUBLICATIONS,
  DEFAULT_SHOW_STATUSES,
  DEFAULT_THIN_ENTITY_MIN_SHOW_COUNT,
  DEFAULT_WEAK_SHOW_MAX_RELATIONSHIP_COUNT,
  EVIDENCE_FIELDS,
  buildEntityGraphReport,
  extractEntityEvidence,
  findPotentialDuplicateEntities,
};
