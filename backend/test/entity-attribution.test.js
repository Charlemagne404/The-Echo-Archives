const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { loadEntities } = require("../lib/entities");
const {
  applyDeterministicEntityLinks,
  buildEntityAttributionReport,
  planDeterministicEntityLinks,
} = require("../lib/entity-attribution");
const { readCatalogSource } = require("../../tools/lib/catalog-source");

const ROOT = path.resolve(__dirname, "../..");

function entity(overrides = {}) {
  return {
    id: "sample-network",
    name: "Sample Network",
    type: "network",
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

test("deterministic attribution only projects exact typed credits with a matching entity type", () => {
  const shows = [show({
    credits: {
      network: "Sample Net",
      productionCompany: "Sample Company",
      creatorName: "Sample Company",
    },
    entityLinks: [{ entityId: "sample-company", role: "production-company" }],
  })];
  const entities = [
    entity({ id: "sample-network", name: "Sample Network", aliases: ["Sample Net"], type: "network" }),
    entity({ id: "sample-company", name: "Sample Company", type: "production-company" }),
  ];
  const snapshot = structuredClone(shows);

  const plan = planDeterministicEntityLinks(shows, entities);

  assert.deepEqual(shows, snapshot);
  assert.equal(plan.automaticLinks.length, 1);
  assert.equal(plan.automaticLinks[0].entity.entityId, "sample-network");
  assert.equal(plan.automaticLinks[0].role, "network");
  assert.equal(plan.roleConflicts.length, 0);

  const applied = applyDeterministicEntityLinks(shows, plan.automaticLinks);
  assert.equal(applied.changedShows.length, 1);
  assert.deepEqual(applied.shows[0].entityLinks, [
    { entityId: "sample-company", role: "production-company" },
    { entityId: "sample-network", role: "network" },
  ]);
  assert.deepEqual(shows, snapshot);
});

test("type conflicts, compound credits, and legacy/provider fields remain review-only", () => {
  const shows = [show({
    id: "review-show",
    title: "Review Show",
    creators: ["Sample Person"],
    creatorId: "sample-person",
    credits: {
      creatorName: "Sample Person",
      network: "Sample Network / Sample Company",
      ownerName: "Sample Person",
    },
    metadata: { podcast: { ownerName: "Sample Person" } },
  })];
  const entities = [
    entity({ id: "sample-person", name: "Sample Person", type: "person", directory: false }),
    entity({ id: "sample-company", name: "Sample Company", type: "production-company" }),
    entity({ id: "sample-network", name: "Sample Network", type: "network" }),
  ];
  const report = buildEntityAttributionReport(shows, entities);

  assert.equal(report.automatic.linkCount, 0);
  assert.equal(report.roleConflicts.length, 0);
  assert.ok(report.review.queue.some((entry) => entry.candidateEntity?.entityId === "sample-person" && entry.proposedRelationshipType === "creator"));
  assert.ok(report.review.queue.some((entry) => entry.reviewKind === "compound-candidate" && entry.candidateEntity?.entityId === "sample-network"));
  assert.ok(report.review.queue.some((entry) => entry.reviewKind === "unresolved-show-attribution"));
  assert.ok(report.review.queue.every((entry) => Object.hasOwn(entry, "candidateEntity")
    && Object.hasOwn(entry, "proposedRelationshipType")
    && Array.isArray(entry.evidence)
    && entry.confidence
    && entry.reason));
  assert.deepEqual(shows[0].entityLinks, []);
});

test("ambiguous registry names never become automatic links", () => {
  const entities = [
    entity({ id: "network-one", name: "Shared Label" }),
    entity({ id: "network-two", name: "Other Network", aliases: ["Shared Label"] }),
  ];
  const report = buildEntityAttributionReport([
    show({ credits: { network: "Shared Label" } }),
  ], entities);

  assert.equal(report.automatic.linkCount, 0);
  const review = report.review.queue.find((entry) => entry.reviewKind === "ambiguous-registry-match");
  assert.ok(review);
  assert.equal(review.candidateEntity, null);
  assert.deepEqual(review.candidateEntities.map((candidate) => candidate.entityId).sort(), ["network-one", "network-two"]);
});

test("the repository snapshot produces a source-only attribution plan and complete unlinked review queue", () => {
  const source = readCatalogSource(ROOT);
  const entities = loadEntities(ROOT, source.shows);
  const report = buildEntityAttributionReport(source.shows, entities, { collections: source.collections });

  assert.deepEqual(report.before, {
    publishedShows: 752,
    publicEntities: 132,
    relationships: 330,
    typedLinkedShows: 266,
    zeroRelationshipShows: 486,
    nonInfrastructureAttributionGaps: 484,
    infrastructureOnlyUnlinkedShows: 2,
  });
  assert.deepEqual(report.after, {
    publishedShows: 752,
    publicEntities: 132,
    relationships: 330,
    typedLinkedShows: 266,
    zeroRelationshipShows: 486,
    nonInfrastructureAttributionGaps: 484,
    infrastructureOnlyUnlinkedShows: 2,
  });
  assert.equal(report.automatic.linkCount, 0);
  assert.equal(report.automatic.newShowEntityPairCount, 0);
  assert.deepEqual(report.automatic.roleCounts, {});
  assert.equal(report.roleConflicts.length, 19);
  assert.equal(report.review.unresolvedShowItemCount, 484);
  assert.equal(report.review.infrastructureOnlyShowCount, 2);
  assert.equal(report.scope.externalLookups, false);
  assert.equal(report.scope.writesPerformed, false);
  assert.ok(report.systemicCauses.recurringPatterns.unresolvedValues.length > 0);
  assert.ok(report.systemicCauses.recurringPatterns.infrastructureValues.length > 0);
});
