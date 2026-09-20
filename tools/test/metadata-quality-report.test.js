const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMetadataQualityReport,
  formatMetadataQualityReport,
} = require("../lib/metadata-quality-report");

function show(id, overrides = {}) {
  return {
    id,
    title: id.replace(/-/g, " "),
    status: "published",
    reviewStatus: "indexed-only",
    description: "A source-backed catalogue description with enough detail for a useful audit fixture.",
    cover: "images/covers/demo.jpg",
    coverAlt: "Demo cover art",
    genres: ["sci-fi"],
    tones: ["dark", "tense"],
    formats: ["serialized"],
    tags: ["Sci-fi", "Isolation"],
    themes: ["identity", "survival", "belonging"],
    bestFor: ["headphones-on", "late-night"],
    similarTo: ["other-show"],
    similarReasons: { "other-show": "A source-backed comparison for the fixture." },
    entityLinks: [],
    listenLinks: { rss: "https://feeds.example.test/demo.xml" },
    officialLinks: { website: "https://example.test/demo" },
    credits: { creatorName: "Demo Creator" },
    metadata: {
      objectiveSources: ["https://example.test/source"],
      sourceCategories: ["Science Fiction"],
      sourceTags: [],
      import: { identifiers: { rssUrl: "https://feeds.example.test/demo.xml" } },
    },
    content: { framing: "serialized audio drama", intensity: "high" },
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "plot-driven", intensity: "high", commitment: "long" },
    length: { episodes: 12, avgEpisodeMinutes: 30, totalObservedHours: 6 },
    releaseStatus: "active",
    completionStatus: "ongoing",
    verification: { status: "source-verified", source: "https://example.test/verification" },
    ...overrides,
  };
}

function entity(id, overrides = {}) {
  return {
    id,
    name: "Demo Creator",
    type: "person",
    aliases: [],
    publication: "public",
    indexable: true,
    reviewedAt: "2026-09-01",
    sources: ["https://example.test/entity"],
    ...overrides,
  };
}

function getGroup(report, id) {
  return report.priorityQueue.find((group) => group.id === id);
}

test("metadata audit ranks missing fields, internal evidence, policy scope, and recommendation gaps", () => {
  const shows = [
    show("sparse-show", {
      genres: ["sci-fi"],
      tones: ["dark"],
      formats: [],
      tags: [],
      themes: [],
      bestFor: [],
      similarTo: [],
      similarReasons: {},
      content: { framing: "full-cast serialized audio drama", setting: "a remote station" },
      discovery: {},
      length: { episodes: 12 },
      credits: {},
      metadata: { sourceCategories: ["Science Fiction"], sourceTags: [], objectiveSources: [] },
      listenLinks: {},
      officialLinks: {},
    }),
    show("other-show"),
    show("imported-show", {
      reviewStatus: "imported",
      tones: [],
      themes: [],
      tags: [],
      bestFor: [],
      similarTo: [],
      similarReasons: {},
      discovery: {},
      verification: { status: "automated-source-checked" },
      metadata: { sourceCategories: ["Drama"], sourceTags: [], objectiveSources: [] },
    }),
  ];

  const report = buildMetadataQualityReport({ shows, collections: [], entities: [], taxonomy: { tags: [] } });

  assert.equal(report.readOnly, true);
  assert.ok(getGroup(report, "missing-formats").affectedIds.includes("sparse-show"));
  assert.ok(getGroup(report, "format-evidence-not-in-formats").affectedIds.includes("sparse-show"));
  assert.ok(getGroup(report, "poor-recommendation-coverage").affectedIds.includes("sparse-show"));
  assert.equal(getGroup(report, "imported-editorial-contamination"), undefined);
  assert.ok(report.policySignals.importedMissingFields.themes.includes("imported-show"));
  assert.ok(report.policySignals.importedPoorRecommendationCoverage.includes("imported-show"));
  assert.equal(report.coverage.find((field) => field.id === "themes").scopes.imported.missing, 1);
});

test("metadata audit detects taxonomy, duplicate, casing, and usage signals", () => {
  const shows = [
    show("taxonomy-show", {
      tags: ["podcast", "sci fi", "Made-up tag"],
      themes: ["Identity", "identity"],
      genres: ["sci-fi"],
    }),
    show("peer-show"),
  ];
  const report = buildMetadataQualityReport({ shows, collections: [], entities: [], taxonomy: { tags: [{ label: "Sci-fi", facet: "genre", status: "approved" }] } });

  assert.ok(getGroup(report, "generic-discovery-tags").affectedIds.includes("taxonomy-show"));
  assert.ok(getGroup(report, "noncanonical-discovery-tags").affectedIds.includes("taxonomy-show"));
  assert.ok(getGroup(report, "unapproved-discovery-tags").affectedIds.includes("taxonomy-show"));
  assert.ok(getGroup(report, "duplicate-themes-values").affectedIds.includes("taxonomy-show"));
  assert.ok(getGroup(report, "tag-genre-overlap").affectedIds.includes("taxonomy-show"));
});

test("metadata audit detects provider collisions, malformed URLs, status/runtime conflicts, and collection weakness", () => {
  const first = show("first-show", {
    metadata: {
      sourceCategories: ["Science Fiction"],
      sourceTags: [],
      objectiveSources: ["not a url"],
      import: { identifiers: { rssUrl: "https://feeds.example.test/collision.xml", appleCollectionId: "123" } },
    },
    listenLinks: { rss: "https://feeds.example.test/collision.xml", apple: "https://podcasts.apple.com/us/podcast/demo/id999" },
    officialLinks: { website: "https://patreon.com/demo" },
    similarTo: ["first-show"],
    similarReasons: {},
    releaseStatus: "active",
    completionStatus: "finished",
    releaseDates: { next: "2026-10-01" },
    content: { intensity: "low" },
    discovery: { intensity: "high" },
    length: { episodes: 12, avgEpisodeMinutes: 30, totalHours: 1, episodeCounts: { full: 8 } },
  });
  const second = show("second-show", {
    metadata: { import: { identifiers: { rssUrl: "https://feeds.example.test/collision.xml" } } },
  });
  const collections = [{
    id: "weak-route",
    title: "Weak route",
    kind: "similarity",
    description: "",
    anchorShowId: "first-show",
    showIds: ["first-show", "first-show", "unknown-show"],
    coverShowIds: ["unknown-show"],
    showReasons: {},
  }];

  const report = buildMetadataQualityReport({
    shows: [first, second],
    collections,
    entities: [entity("orphan-entity")],
    taxonomy: { tags: [] },
  });

  assert.ok(getGroup(report, "duplicate-provider-identities").affectedIds.includes("first-show"));
  assert.ok(getGroup(report, "malformed-show-urls").affectedIds.includes("first-show"));
  assert.ok(getGroup(report, "non-website-show-urls").affectedIds.includes("first-show"));
  assert.ok(getGroup(report, "self-similarity-links").affectedIds.includes("first-show"));
  assert.ok(getGroup(report, "episode-count-discrepancies").affectedIds.includes("first-show"));
  assert.ok(getGroup(report, "runtime-discrepancies").affectedIds.includes("first-show"));
  assert.ok(getGroup(report, "release-completion-conflicts").affectedIds.includes("first-show"));
  assert.ok(getGroup(report, "closed-show-next-release-conflicts").affectedIds.includes("first-show"));
  assert.ok(getGroup(report, "weak-collections").affectedIds.includes("weak-route"));
  assert.ok(getGroup(report, "invalid-collection-references").affectedIds.includes("weak-route"));
  assert.ok(getGroup(report, "duplicate-collection-memberships").affectedIds.includes("weak-route"));
  assert.ok(getGroup(report, "invalid-collection-cover-references").affectedIds.includes("weak-route"));
  assert.ok(getGroup(report, "invalid-similarity-anchors").affectedIds.includes("weak-route"));
  assert.ok(getGroup(report, "orphan-entities").affectedIds.includes("orphan-entity"));
});

test("metadata audit is deterministic, report-only, and formats a useful human queue", () => {
  const inputs = {
    shows: [show("demo")],
    collections: [],
    entities: [],
    taxonomy: { tags: [] },
  };
  const before = JSON.stringify(inputs);
  const first = buildMetadataQualityReport(inputs);
  const second = buildMetadataQualityReport(inputs);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(inputs), before);
  assert.match(formatMetadataQualityReport(first, { sampleLimit: 3 }), /Highest-value cleanup queues/);
  assert.match(formatMetadataQualityReport(first, { sampleLimit: 3 }), /Coverage by field/);
  assert.match(formatMetadataQualityReport(first, { sampleLimit: 3 }), /--json/);
});
