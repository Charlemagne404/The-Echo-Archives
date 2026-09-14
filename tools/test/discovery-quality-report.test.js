const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDiscoveryQualityReport,
  METRIC_DEFINITIONS,
  RICHNESS_DIMENSIONS,
} = require("../lib/discovery-quality-report");

function createShow(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    status: "published",
    reviewStatus: "indexed-only",
    description: "A source-backed description long enough to be useful for discovery and to pass the published catalog quality floor.",
    genres: ["sci-fi"],
    formats: ["full-cast"],
    tones: ["dark"],
    tags: ["Spacecraft disaster"],
    bestFor: ["headphones-on"],
    similarTo: ["other-show"],
    length: { episodes: 8 },
    listenLinks: { website: "https://example.com/demo" },
    officialLinks: { website: "https://example.com/demo" },
    credits: { creatorName: "Demo Creator" },
    metadata: { objectiveSources: ["https://example.com/demo"], researchGaps: [] },
    ratings: { archive: 8 },
    entityLinks: [{ entityId: "demo-creator", role: "creator" }],
    ...overrides,
  };
}

function getMetric(report, id) {
  return report.metrics.find((metric) => metric.id === id);
}

test("discovery quality report calculates coverage by explicit relationship and policy scope", () => {
  const shows = [
    createShow(),
    createShow({
      id: "imported-show",
      title: "Imported Show",
      reviewStatus: "imported",
      tones: [],
      tags: [],
      bestFor: [],
      similarTo: [],
      ratings: {},
      entityLinks: [],
    }),
    createShow({
      id: "unlinked-show",
      title: "Unlinked Show",
      tones: [],
      tags: ["Spacecraft disaster"],
      bestFor: [],
      similarTo: [],
      entityLinks: [],
    }),
    createShow({ id: "draft-show", status: "draft" }),
  ];
  const collections = [
    { id: "demo-collection", title: "Demo collection", showIds: ["demo-show", "imported-show"] },
  ];
  const entities = [
    { id: "demo-creator", name: "Demo Creator", type: "person", publication: "public" },
    { id: "orphan-entity", name: "Orphan Entity", type: "network", publication: "public" },
  ];
  const taxonomy = {
    tags: [
      { id: "spacecraft-disaster", label: "Spacecraft disaster", status: "approved" },
      { id: "unused", label: "Unused route", status: "approved" },
    ],
  };

  const report = buildDiscoveryQualityReport({ shows, collections, entities, taxonomy }, { sampleLimit: 2 });

  assert.equal(report.scope.publishedShows, 3);
  assert.equal(report.scope.importedShows, 1);
  assert.equal(report.scope.enrichmentEligibleShows, 2);
  assert.equal(getMetric(report, "entity-linked-show-coverage").numerator, 1);
  assert.equal(getMetric(report, "entity-linked-show-coverage").denominator, 3);
  assert.equal(getMetric(report, "entity-linked-show-coverage").percentage, 33.3);
  assert.equal(getMetric(report, "average-relationships-per-linked-show").value, 1);
  assert.deepEqual(getMetric(report, "collection-show-coverage"), {
    id: "collection-show-coverage",
    label: "Shows with at least one collection",
    description: "Published shows appearing in one or more materialized collections.",
    numerator: 2,
    denominator: 3,
    percentage: 66.7,
    scope: "all published shows",
  });
  assert.equal(getMetric(report, "archive-rating-coverage").numerator, 2);
  assert.equal(getMetric(report, "archive-rating-coverage").denominator, 2);
  assert.equal(getMetric(report, "useful-discovery-facet-coverage").numerator, 2);
  assert.equal(report.entityGraph.publicEntityCount, 2);
  assert.equal(report.entityGraph.linkedEntityCount, 1);
  assert.equal(report.entityGraph.unlinkedEntities.length, 1);
  assert.equal(report.collectionCoverage.membershipEdges, 2);
  assert.equal(report.collectionCoverage.collectionsWithReasons, 0);
  assert.equal(report.taxonomy.unusedApprovedTags.length, 1);
  assert.equal(report.blindSpots.find((entry) => entry.id === "imported-policy-sparse").count, 1);
});

test("quality bands and enrichment priorities exclude imported records from editorial work queues", () => {
  const shows = [
    createShow({ id: "rich-show", title: "Rich Show" }),
    createShow({
      id: "sparse-eligible",
      title: "Sparse Eligible",
      tones: [],
      bestFor: [],
      similarTo: [],
      entityLinks: [],
    }),
    createShow({
      id: "imported-show",
      title: "Imported Show",
      reviewStatus: "imported",
      tones: [],
      tags: [],
      bestFor: [],
      similarTo: [],
      ratings: {},
      entityLinks: [],
    }),
  ];
  const report = buildDiscoveryQualityReport({
    shows,
    collections: [],
    entities: [{ id: "demo-creator", name: "Demo Creator", type: "person", publication: "public" }],
    taxonomy: { tags: [] },
  }, { sampleLimit: 10 });

  assert.equal(report.qualityBands.policySparse.count, 1);
  assert.equal(report.qualityBands.unusuallySparse.scope, "published shows eligible for editorial enrichment (reviewStatus is not imported)");
  assert.ok(report.qualityBands.unusuallySparse.sample.every((show) => show.id !== "imported-show"));
  assert.ok(report.enrichmentPriorities.sample.some((candidate) => candidate.id === "sparse-eligible"));
  assert.equal(report.enrichmentPriorities.sample.some((candidate) => candidate.id === "imported-show"), false);
  assert.equal(report.qualityBands.scoreDefinition.maxScore, RICHNESS_DIMENSIONS.length);
});

test("metric registry stays data-driven for future discovery quality metrics", () => {
  assert.ok(METRIC_DEFINITIONS.length >= 10);
  assert.ok(METRIC_DEFINITIONS.every((definition) => definition.id && definition.label && typeof definition.calculate === "function"));
});

test("unresolved relationship references remain visible as catalog blind spots", () => {
  const report = buildDiscoveryQualityReport({
    shows: [createShow({ entityLinks: [{ entityId: "missing-entity", role: "creator" }] })],
    collections: [{ id: "broken-collection", title: "Broken collection", showIds: ["missing-show"] }],
    entities: [],
    taxonomy: { tags: [] },
  });

  assert.equal(report.entityGraph.invalidLinks.length, 1);
  assert.equal(report.collectionCoverage.invalidReferences.length, 1);
  assert.equal(report.blindSpots.some((entry) => entry.id === "invalid-entity-references"), true);
  assert.equal(report.blindSpots.some((entry) => entry.id === "invalid-collection-references"), true);
});

test("report generation does not mutate input records", () => {
  const shows = [createShow(), createShow({ id: "second-show", entityLinks: [] })];
  const collections = [{ id: "collection", title: "Collection", showIds: ["second-show", "demo-show"] }];
  const entities = [{ id: "demo-creator", name: "Demo Creator", type: "person", publication: "public" }];
  const before = JSON.stringify({ shows, collections, entities });

  buildDiscoveryQualityReport({ shows, collections, entities, taxonomy: { tags: [] } });

  assert.equal(JSON.stringify({ shows, collections, entities }), before);
});
