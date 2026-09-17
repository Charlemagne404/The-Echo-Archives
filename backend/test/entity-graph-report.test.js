const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { loadEntities } = require("../lib/entities");
const { buildEntityGraphReport, extractEntityEvidence } = require("../lib/entity-graph-report");
const { readCatalogSource } = require("../../tools/lib/catalog-source");

const ROOT = path.resolve(__dirname, "../..");

function entity(overrides = {}) {
  return {
    id: "sample-studio",
    name: "Sample Studio",
    type: "studio",
    aliases: [],
    publication: "public",
    indexable: true,
    ...overrides,
  };
}

function show(overrides = {}) {
  return {
    id: "sample-show",
    title: "Sample Show",
    status: "published",
    creators: [],
    credits: {},
    entityLinks: [],
    ...overrides,
  };
}

test("the current source snapshot reports graph coverage without loading generated or external data", () => {
  const source = readCatalogSource(ROOT);
  const entities = loadEntities(ROOT, source.shows);
  const report = buildEntityGraphReport(source.shows, entities, { collections: source.collections });

  assert.deepEqual(report.scope, {
    showStatuses: ["published"],
    entityPublications: ["public"],
    weakEntityMaxShowCount: 1,
    weakShowMaxRelationshipCount: 1,
    sourceOnly: true,
  });
  assert.deepEqual(report.summary, {
    showCount: 752,
    entityCount: 132,
    relationshipCount: 318,
    rawRelationshipCount: 318,
    uniqueShowEntityPairCount: 318,
    connectedShowCount: 266,
    connectedShowPercent: 35.37,
    zeroRelationshipShowCount: 486,
    weaklyLinkedShowCount: 707,
    unlinkedShowWithEvidenceCount: 486,
    unlinkedShowWithoutEvidenceCount: 0,
    collectionCount: 46,
    collectionMembershipCount: 1115,
    showsWithCollectionMembership: 371,
    showsWithoutCollectionMembership: 381,
    orphanEntityCount: 0,
    weakEntityCount: 61,
    duplicateRelationshipGroupCount: 0,
    sameEntityMultipleRoleCount: 0,
    roleTypeDivergenceCount: 43,
    linkedEvidenceConflictCount: 0,
  });
  assert.equal(report.coverage.creatorRelationship.showCount, 61);
  assert.equal(report.coverage.creatorEvidenceWithoutRelationship.showCount, 691);
  assert.deepEqual(report.relationshipTypeCounts.map(({ role, relationships, showCount }) => ({ role, relationships, showCount })), [
    { role: "creator", relationships: 67, showCount: 61 },
    { role: "production-company", relationships: 166, showCount: 165 },
    { role: "studio", relationships: 10, showCount: 10 },
    { role: "network", relationships: 75, showCount: 75 },
  ]);
  assert.equal(report.zeroRelationshipShows.length, 486);
  assert.equal(report.priorityQueues.researchSourceAndLink.length, 486);
  assert.equal(report.priorityQueues.reviewRegistryMatch.length, 0);
  assert.equal(report.priorityQueues.noKnownEvidence.length, 0);
  assert.equal(report.orphanEntities.length, 0);
  assert.deepEqual(report.collectionCoverage.summary, {
    collectionCount: 46,
    membershipCount: 1115,
    rawMembershipCount: 1115,
    showsWithMembership: 371,
    showsWithoutMembership: 381,
    showsWithMembershipPercent: 49.34,
    averageCollectionsPerShow: 1.48,
    collectionBipartitePercent: 3.22,
    orphanCollectionCount: 0,
    duplicateMembershipGroupCount: 0,
    unknownShowMembershipCount: 0,
    outOfScopeShowMembershipCount: 0,
    invalidCollectionRecordCount: 0,
  });
  assert.equal(report.topConnectedEntities[0].entityId, "realm");
  assert.equal(report.topConnectedEntities[0].showCount, 21);
  assert.equal(report.suspiciousRelationships.roleTypeDivergences.length, 43);
  assert.ok(report.entityCoverageByType.every((entry) => Object.hasOwn(entry, "linkedEntityPercent")));
  assert.ok(report.evidence.byField.every((entry) => Number.isInteger(entry.uniqueValueCount)));
});

test("graph report separates exact evidence candidates from unresolved research and suspicious links", () => {
  const entities = [
    entity({ id: "sample-studio", name: "Sample Studio", type: "studio" }),
    entity({ id: "sample-person", name: "Sam Person", type: "person", directory: false }),
    entity({ id: "sample-network", name: "Sample Network", type: "network" }),
    entity({ id: "draft-company", name: "Draft Company", type: "production-company", publication: "draft", indexable: false }),
    entity({ id: "orphan-company", name: "Orphan Company", type: "production-company" }),
  ];
  const shows = [
    show({
      id: "linked-show",
      title: "Linked Show",
      entityLinks: [
        { entityId: "sample-studio", role: "studio" },
        { entityId: "sample-studio", role: "studio" },
        { entityId: "sample-studio", role: "network" },
        { entityId: "missing-company", role: "production-company" },
      ],
      creators: ["Sam Person"],
    }),
    show({
      id: "candidate-show",
      title: "Candidate Show",
      creators: ["Sample Studio", "Unresolved Collective"],
      credits: { productionCompany: "Sample Studio", network: "Not verified" },
    }),
    show({
      id: "draft-link-show",
      title: "Draft Link Show",
      entityLinks: [{ entityId: "draft-company", role: "production-company" }],
    }),
    show({ id: "empty-show", title: "Empty Show" }),
  ];
  const sourceSnapshot = structuredClone({ shows, entities });

  const report = buildEntityGraphReport(shows, entities);

  assert.deepEqual({ shows, entities }, sourceSnapshot);
  assert.equal(report.summary.relationshipCount, 3);
  assert.equal(report.summary.rawRelationshipCount, 5);
  assert.equal(report.summary.uniqueShowEntityPairCount, 1);
  assert.equal(report.summary.connectedShowCount, 1);
  assert.deepEqual(report.zeroRelationshipShows.map((entry) => entry.id), ["candidate-show", "draft-link-show", "empty-show"]);
  assert.equal(report.priorityQueues.reviewRegistryMatch.length, 1);
  assert.deepEqual(report.priorityQueues.reviewNonPublicLink, ["draft-link-show"]);
  assert.deepEqual(report.priorityQueues.researchSourceAndLink, []);
  assert.deepEqual(report.priorityQueues.noKnownEvidence, ["empty-show"]);
  assert.deepEqual(report.evidence.unlinkedRegistryMatchCandidates.map((entry) => ({ entityId: entry.entityId, showCount: entry.showCount })), [
    { entityId: "sample-studio", showCount: 1 },
  ]);
  assert.ok(report.evidence.unresolvedLegacyValues.some((entry) => entry.value === "Unresolved Collective"));
  assert.equal(report.suspiciousRelationships.duplicateRelationshipGroups.length, 1);
  assert.equal(report.suspiciousRelationships.sameEntityMultipleRoleGroups.length, 1);
  assert.equal(report.suspiciousRelationships.roleTypeDivergences.length, 1);
  assert.equal(report.suspiciousRelationships.unknownEntityReferences.length, 1);
  assert.equal(report.suspiciousRelationships.nonPublicEntityReferences.length, 1);
  assert.equal(report.orphanEntities.some((entry) => entry.entityId === "orphan-company"), true);
  assert.equal(report.orphanEntities.some((entry) => entry.entityId === "draft-company"), false);
});

test("entity evidence extraction ignores placeholder values but preserves compound source strings", () => {
  assert.deepEqual(extractEntityEvidence({
    creatorId: "sample-person",
    creators: ["Sam Person", "Not verified"],
    credits: {
      creatorName: "Sam Person & Alex Example",
      network: "unknown",
    },
  }), [
    { field: "creatorId", category: "creator", value: "sample-person", compound: false },
    { field: "creators", category: "creator", value: "Sam Person", compound: false },
    { field: "credits.creatorName", category: "creator", value: "Sam Person & Alex Example", compound: true },
  ]);
});
