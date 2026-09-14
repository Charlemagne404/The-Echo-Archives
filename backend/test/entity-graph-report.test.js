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
    entityCount: 102,
    relationshipCount: 279,
    rawRelationshipCount: 279,
    uniqueShowEntityPairCount: 279,
    connectedShowCount: 229,
    connectedShowPercent: 30.45,
    zeroRelationshipShowCount: 523,
    weaklyLinkedShowCount: 708,
    unlinkedShowWithEvidenceCount: 523,
    unlinkedShowWithoutEvidenceCount: 0,
    collectionCount: 46,
    collectionMembershipCount: 620,
    showsWithCollectionMembership: 243,
    showsWithoutCollectionMembership: 509,
    orphanEntityCount: 0,
    weakEntityCount: 40,
    duplicateRelationshipGroupCount: 0,
    sameEntityMultipleRoleCount: 0,
    roleTypeDivergenceCount: 31,
    linkedEvidenceConflictCount: 0,
  });
  assert.equal(report.coverage.creatorRelationship.showCount, 45);
  assert.equal(report.coverage.creatorEvidenceWithoutRelationship.showCount, 705);
  assert.deepEqual(report.relationshipTypeCounts.map(({ role, relationships, showCount }) => ({ role, relationships, showCount })), [
    { role: "creator", relationships: 51, showCount: 45 },
    { role: "production-company", relationships: 155, showCount: 154 },
    { role: "studio", relationships: 9, showCount: 9 },
    { role: "network", relationships: 64, showCount: 64 },
  ]);
  assert.equal(report.zeroRelationshipShows.length, 523);
  assert.equal(report.priorityQueues.researchSourceAndLink.length, 523);
  assert.equal(report.priorityQueues.reviewRegistryMatch.length, 0);
  assert.equal(report.priorityQueues.noKnownEvidence.length, 0);
  assert.equal(report.orphanEntities.length, 0);
  assert.deepEqual(report.collectionCoverage.summary, {
    collectionCount: 46,
    membershipCount: 620,
    rawMembershipCount: 620,
    showsWithMembership: 243,
    showsWithoutMembership: 509,
    showsWithMembershipPercent: 32.31,
    averageCollectionsPerShow: 0.82,
    collectionBipartitePercent: 1.79,
    orphanCollectionCount: 0,
    duplicateMembershipGroupCount: 0,
    unknownShowMembershipCount: 0,
    outOfScopeShowMembershipCount: 0,
    invalidCollectionRecordCount: 0,
  });
  assert.equal(report.topConnectedEntities[0].entityId, "realm");
  assert.equal(report.topConnectedEntities[0].showCount, 21);
  assert.equal(report.suspiciousRelationships.roleTypeDivergences.length, 31);
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
