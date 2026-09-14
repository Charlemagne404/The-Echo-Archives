const assert = require("node:assert/strict");
const test = require("node:test");

const { buildSimilarityReport } = require("../report-similarity");

function record(id, overrides = {}) {
  return {
    id,
    title: id,
    status: "published",
    genres: ["mystery"],
    formats: ["serialized"],
    tones: [],
    themes: [],
    tags: [],
    bestFor: [],
    discovery: {},
    content: {},
    length: { episodes: 8, avgEpisodeMinutes: 30 },
    releaseStatus: "active",
    completionStatus: "ongoing",
    entityLinks: [],
    ratings: {},
    similarTo: [],
    similarReasons: {},
    ...overrides,
  };
}

test("similarity report summarizes candidate coverage, scores, reasons, and richness bands", () => {
  const shows = [
    record("sparse-a"),
    record("sparse-b"),
    record("medium", {
      tones: ["dark"],
      themes: ["isolation"],
      tags: ["Locked-room mystery"],
      bestFor: ["headphones-on"],
      content: { intensity: "high" },
      discovery: { intensity: "high", narrativeFocus: "balanced" },
    }),
    record("rich-a", {
      tones: ["dark"],
      themes: ["isolation"],
      tags: ["Locked-room mystery"],
      bestFor: ["headphones-on"],
      content: { intensity: "high" },
      discovery: { intensity: "high", narrativeFocus: "balanced" },
      entityLinks: [{ entityId: "archive-studio", role: "studio" }],
      length: { episodes: 20, avgEpisodeMinutes: 45 },
    }),
    record("rich-b", {
      tones: ["dark"],
      themes: ["isolation"],
      tags: ["Locked-room mystery"],
      bestFor: ["headphones-on"],
      content: { intensity: "high" },
      discovery: { intensity: "high", narrativeFocus: "balanced" },
      entityLinks: [{ entityId: "archive-studio", role: "studio" }],
      length: { episodes: 22, avgEpisodeMinutes: 48 },
    }),
  ];
  const collections = [{
    id: "finished-arcs",
    title: "Finished arcs",
    kind: "curated",
    showIds: ["rich-a", "rich-b"],
  }];

  const report = buildSimilarityReport({ shows, collections }, { candidateThresholds: [1, 2] });

  assert.equal(report.publishedShows, 5);
  assert.deepEqual(report.candidateCoverage.thresholds.map((entry) => entry.minimum), [1, 2]);
  assert.ok(report.candidateCoverage.thresholds[0].shows >= 2);
  assert.ok(report.scoreDistribution.count > 0);
  assert.equal(
    report.scoreDistribution.buckets.reduce((total, bucket) => total + bucket.count, 0),
    report.scoreDistribution.count,
  );
  assert.ok(report.commonReasons.some((reason) => reason.dimension === "format"));
  assert.ok(report.commonReasons.some((reason) => reason.dimension === "episodeLength"));
  assert.ok(report.commonReasonTexts.some((reason) => /Shared format/.test(reason.text)));
  assert.deepEqual(report.sparseVsEnriched.map((band) => band.id), ["sparse", "medium", "enriched"]);
  assert.equal(report.sparseVsEnriched.reduce((total, band) => total + band.showCount, 0), 5);
  assert.ok(report.sparseVsEnriched.find((band) => band.id === "enriched").averagePairwiseMetadataCoverage >= 0);
});

test("similarity report keeps factual signal coverage visible and does not mutate records", () => {
  const shows = [record("one"), record("two", { formats: [], tones: ["dark"] })];
  const collections = [{ id: "route", title: "Route", kind: "curated", showIds: ["one"] }];
  const before = JSON.stringify({ shows, collections });
  const report = buildSimilarityReport({ shows, collections }, { candidateThresholds: [1] });

  assert.ok(report.signalCoverage.some((signal) => signal.id === "entity"));
  assert.ok(report.signalCoverage.some((signal) => signal.id === "releaseProfile"));
  assert.ok(report.signalCoverage.some((signal) => signal.id === "episodeLength"));
  assert.ok(report.signalCoverage.some((signal) => signal.id === "catalogLength"));
  assert.ok(report.signalCoverage.some((signal) => signal.id === "sharedCollection"));
  assert.deepEqual(JSON.stringify({ shows, collections }), before);
});
