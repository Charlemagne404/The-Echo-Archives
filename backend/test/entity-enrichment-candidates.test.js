const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { loadEntities } = require("../lib/entities");
const {
  buildEntityEnrichmentCandidates,
  candidatesToCsv,
  splitCompoundValue,
} = require("../lib/entity-enrichment-candidates");
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
    ...overrides,
  };
}

test("enrichment candidates split explicit compound evidence without inventing a relationship", () => {
  const entities = [
    entity({ id: "seven-lamb", name: "7 Lamb Productions", type: "production-company" }),
    entity({ id: "bloody-fm", name: "Bloody FM", type: "network" }),
    entity({ id: "sam-person", name: "Sam Person", type: "person", directory: false }),
  ];
  const shows = [
    show({
      id: "compound-show",
      title: "Compound Show",
      creatorId: "7-lamb-productions-bloody-fm",
      creators: ["7 Lamb Productions | Bloody FM"],
      cast: ["Sam Person"],
      credits: {
        creatorName: "7 Lamb Productions | Bloody FM",
        productionCompany: "7 Lamb Productions / Bloody FM",
        network: "Bloody FM",
        people: [{ name: "Sam Person", role: "author" }],
      },
    }),
    show({
      id: "repeat-show-a",
      title: "Repeat Show A",
      creators: ["Open Signal Works"],
      credits: { creatorName: "Open Signal Works" },
    }),
    show({
      id: "repeat-show-b",
      title: "Repeat Show B",
      creators: ["Open Signal Works"],
      credits: { creatorName: "Open Signal Works" },
    }),
    show({
      id: "cast-only-show",
      title: "Cast Only Show",
      cast: ["Sam Person"],
    }),
    show({
      id: "already-linked",
      title: "Already Linked",
      entityLinks: [{ entityId: "seven-lamb", role: "production-company" }],
      credits: { productionCompany: "7 Lamb Productions" },
    }),
  ];
  const sourceSnapshot = structuredClone({ shows, entities });

  const report = buildEntityEnrichmentCandidates(shows, entities);

  assert.deepEqual({ shows, entities }, sourceSnapshot);
  assert.equal(report.scope.sourceOnly, true);
  assert.equal(report.scope.externalLookups, false);
  assert.equal(report.scope.writesPerformed, false);
  assert.equal(report.summary.unlinkedShowCount, 4);
  assert.equal(report.summary.compoundEvidenceShowCount, 1);
  assert.equal(report.compoundReviews.length, 1);
  assert.ok(report.compoundReviews[0].possibleComponents.some((component) => component.name === "7 Lamb Productions"));

  const lamb = report.candidates.find((candidate) => candidate.show.id === "compound-show" && candidate.target.entityId === "seven-lamb");
  assert.ok(lamb);
  assert.equal(lamb.suggestedRole, "production-company");
  assert.ok(lamb.evidence.some((entry) => entry.field === "credits.productionCompany" && entry.value === "7 Lamb Productions / Bloody FM"));

  const bloody = report.candidates.find((candidate) => candidate.show.id === "compound-show" && candidate.target.entityId === "bloody-fm");
  assert.ok(bloody);
  assert.equal(bloody.suggestedRole, null);
  assert.equal(bloody.relationshipEligible, false);
  assert.match(bloody.roleBasis, /more than one possible role|compound/i);

  const repeated = report.candidates.find((candidate) => candidate.target.kind === "new-entity" && candidate.show.id === "repeat-show-a");
  assert.ok(repeated);
  assert.equal(repeated.target.name, "Open Signal Works");
  assert.equal(repeated.suggestedRole, "creator");
  assert.equal(repeated.confidence, "medium");
  const repeatedBatch = report.batches.find((batch) => batch.batchId === repeated.batchId);
  assert.deepEqual(repeatedBatch.showIds, ["repeat-show-a", "repeat-show-b"]);

  const castOnly = report.candidates.find((candidate) => candidate.show.id === "cast-only-show");
  assert.ok(castOnly);
  assert.equal(castOnly.target.entityId, "sam-person");
  assert.equal(castOnly.suggestedRole, null);
  assert.equal(castOnly.candidateKind, "credit-lead");
  assert.match(castOnly.manualAction, /do not create/i);

  assert.equal(report.candidates.some((candidate) => candidate.show.id === "already-linked"), false);
});

test("real source candidate report preserves the graph scope and surfaces the current compound records", () => {
  const source = readCatalogSource(ROOT);
  const entities = loadEntities(ROOT, source.shows);
  const report = buildEntityEnrichmentCandidates(source.shows, entities);

  assert.deepEqual(report.scope.showStatuses, ["published"]);
  assert.deepEqual(report.scope.entityPublications, ["public"]);
  assert.equal(report.scope.unlinkedOnly, true);
  assert.equal(report.summary.showCount, 752);
  assert.equal(report.summary.unlinkedShowCount, 486);
  assert.equal(report.summary.compoundEvidenceShowCount, 84);
  assert.equal(report.summary.compoundReviewCount, 84);
  assert.ok(report.summary.relationshipCandidateCount > 0);
  assert.ok(report.summary.batchCount > 0);
  assert.ok(report.compoundBatches.length > 0);
  assert.ok(report.compoundReviews.every((review) => review.manualAction));
});

test("compound splitting and CSV output retain exact source evidence for manual batches", () => {
  assert.deepEqual(splitCompoundValue("A. Person, B. Person & Studio / Network"), [
    "A. Person",
    "B. Person",
    "Studio",
    "Network",
  ]);

  const report = buildEntityEnrichmentCandidates([
    show({
      id: "csv-show",
      title: "CSV Show",
      credits: { productionCompany: "New Company" },
    }),
  ], []);
  const csv = candidatesToCsv(report.candidates);
  assert.match(csv, /^candidateId,batchId,candidateKind/);
  assert.match(csv, /csv-show/);
  assert.match(csv, /credits\.productionCompany=New Company/);
});
