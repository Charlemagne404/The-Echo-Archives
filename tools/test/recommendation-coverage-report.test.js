const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRecommendationCoverageReport,
} = require("../lib/recommendation-coverage-report");
const {
  formatRecommendationCoverageReport,
} = require("../report-recommendation-coverage");

function importedShow(id, overrides = {}) {
  return {
    id,
    title: id,
    status: "published",
    reviewStatus: "imported",
    genres: ["drama"],
    formats: ["serialized"],
    tones: [],
    themes: [],
    tags: [],
    bestFor: [],
    discovery: {},
    content: {},
    length: { episodes: 10, avgEpisodeMinutes: 30 },
    releaseStatus: "active",
    completionStatus: "ongoing",
    entityLinks: [],
    ratings: {},
    similarTo: [],
    similarReasons: {},
    ...overrides,
  };
}

function enrichedShow(id, overrides = {}) {
  return importedShow(id, {
    reviewStatus: "indexed-only",
    tones: ["dark"],
    themes: ["isolation"],
    tags: ["found audio"],
    bestFor: ["headphones-on"],
    discovery: {
      voiceStyle: "primarily-acted",
      narrativeFocus: "balanced",
      intensity: "high",
      commitment: "medium",
    },
    content: { intensity: "high" },
    ...overrides,
  });
}

function findRecord(report, id) {
  const record = report.records.find((entry) => entry.id === id);
  assert.ok(record, `missing report record ${id}`);
  return record;
}

test("surface-aware coverage separates authored, computed, collection-only, and policy gaps", () => {
  const incoming = importedShow("incoming", { genres: ["mystery"], formats: ["episodic"] });
  const author = importedShow("author", {
    genres: ["mystery"],
    formats: ["episodic"],
    similarTo: ["incoming"],
    similarReasons: { incoming: "A reviewed incoming relationship for the coverage test." },
  });
  const thin = importedShow("thin", { genres: ["comedy"], formats: ["episodic"] });
  const policy = importedShow("policy");
  const isolated = importedShow("isolated", {
    genres: ["rare-genre"],
    formats: ["rare-format"],
    length: {},
    releaseStatus: "unknown",
    completionStatus: "unclear",
  });
  const broken = importedShow("broken", { similarTo: ["missing-show"] });
  const report = buildRecommendationCoverageReport({
    shows: [incoming, author, thin, policy, isolated, broken],
    collections: [{
      id: "rule-route",
      title: "Rule route",
      kind: "rule-based",
      showIds: ["thin"],
    }],
  });

  assert.equal(report.beforeAfter.legacyProxy.levelCounts.thin, 3);
  assert.equal(findRecord(report, "incoming").level, "covered");
  assert.equal(findRecord(report, "incoming").authoredCount, 1);
  assert.equal(findRecord(report, "incoming").legacyLevel, "none");
  assert.equal(findRecord(report, "thin").level, "thin");
  assert.equal(findRecord(report, "policy").causeId, "imported-policy-limited");
  assert.equal(findRecord(report, "policy").diagnosticCandidateCount > 0, true);
  assert.equal(findRecord(report, "isolated").causeId, "catalogue-isolation");
  assert.equal(findRecord(report, "broken").causeId, "schema-or-reference-issue");
  assert.deepEqual(report.coverage.levelCounts, { none: 3, thin: 1, covered: 2 });
  assert.equal(report.blockers.find((group) => group.id === "imported-policy-limited").count, 2);
  assert.equal(report.structuralIssues.showCount, 1);
});

test("computed Try Next coverage is reported separately from authored evidence", () => {
  const left = enrichedShow("left");
  const right = enrichedShow("right");
  const report = buildRecommendationCoverageReport({ shows: [left, right], collections: [] });
  const leftRecord = findRecord(report, "left");

  assert.equal(leftRecord.authoredCount, 0);
  assert.equal(leftRecord.computedCount, 1);
  assert.equal(leftRecord.computedOnly, true);
  assert.equal(leftRecord.level, "covered");
  assert.equal(report.coverage.computedOnlySources, 2);
});

test("coverage report formatting explains the before/after contract and enrichment blockers", () => {
  const report = buildRecommendationCoverageReport({ shows: [importedShow("one"), importedShow("two")], collections: [] });
  const formatted = formatRecommendationCoverageReport(report, { sampleLimit: 3 });

  assert.match(formatted, /Before \/ after definition/);
  assert.match(formatted, /Remaining blockers/);
  assert.match(formatted, /Remaining blockers/);
  assert.match(formatted, /No recommendation thresholds were lowered/);
});
