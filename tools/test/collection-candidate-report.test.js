const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCollectionCandidateReport,
  formatCollectionCandidateReport,
  isBroadGenreOnlyCriteria,
} = require("../lib/collection-candidate-report");

function show(id, overrides = {}) {
  return {
    id,
    title: id.replace(/-/g, " "),
    description: "A verified source-backed description with enough detail for a useful catalogue record.",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "active",
    completionStatus: "ongoing",
    genres: ["sci-fi"],
    formats: ["serialized"],
    tones: ["dark"],
    tags: ["Isolation"],
    themes: ["isolation"],
    bestFor: ["serious-sci-fi"],
    discovery: {
      voiceStyle: "primarily-acted",
      narrativeFocus: "plot-driven",
      intensity: "high",
      commitment: "long",
    },
    length: { avgEpisodeMinutes: 45 },
    similarTo: [],
    similarReasons: {},
    entityLinks: [],
    ratings: {},
    ...overrides,
  };
}

function getCollection(report, id) {
  return report.collections.find((collection) => collection.id === id);
}

test("candidate report excludes broad-genre-only matches and exposes strong/supporting/weak evidence", () => {
  const shows = [
    show("anchor", { title: "Anchor", bestFor: ["serious-sci-fi"] }),
    show("strong-candidate", {
      title: "Strong Candidate",
      tones: ["dark"],
      tags: ["Corporate secrecy"],
      themes: ["corporate research"],
      bestFor: ["serious-sci-fi"],
      similarTo: ["anchor"],
      similarReasons: { anchor: "Existing archive relationship." },
    }),
    show("genre-only", {
      title: "Genre Only",
      releaseStatus: "",
      completionStatus: "",
      formats: [],
      tones: [],
      tags: [],
      themes: [],
      bestFor: [],
      discovery: {},
      length: {},
    }),
  ];
  const collections = [{
    id: "serious-route",
    title: "Serious sci-fi",
    kind: "curated",
    intentTags: ["serious-sci-fi"],
    showIds: ["anchor"],
    showReasons: { anchor: "Route member." },
  }];

  const report = buildCollectionCandidateReport({ shows, collections });
  const collection = getCollection(report, "serious-route");
  const strong = collection.candidates.find((candidate) => candidate.showId === "strong-candidate");

  assert.ok(strong);
  assert.equal(strong.confidence.level, "high");
  assert.ok(strong.evidence.strong.some((entry) => entry.dimension === "editorial"));
  assert.ok(strong.evidence.supporting.length > 0);
  assert.ok(collection.exclusions.samples.broadGenreOnly.some((entry) => entry.id === "genre-only"));
  assert.equal(collection.candidateIds.includes("genre-only"), false);
  assert.equal(report.readOnly, true);
});

test("rule matches are strong evidence, while a genre-only rule remains excluded", () => {
  assert.equal(isBroadGenreOnlyCriteria({ all: [{ field: "genres", operator: "includes", value: "horror" }] }), true);
  assert.equal(isBroadGenreOnlyCriteria({ all: [
    { field: "genres", operator: "includes", value: "horror" },
    { field: "formats", operator: "includes", value: "anthology" },
  ] }), false);

  const shows = [
    show("rule-match", { genres: ["horror"], formats: ["anthology"], tones: ["bleak"] }),
    show("rule-no-match", { genres: ["sci-fi"], formats: ["serialized"] }),
  ];
  const collections = [{
    id: "anthology-horror",
    title: "Anthology Horror",
    kind: "rule-based",
    automation: {
      mode: "rule",
      criteria: {
        all: [
          { field: "genres", operator: "includes", value: "horror" },
          { field: "formats", operator: "includes", value: "anthology" },
        ],
        any: [],
        not: [],
      },
    },
    showIds: [],
  }];

  const report = buildCollectionCandidateReport({ shows, collections });
  const candidate = getCollection(report, "anthology-horror").candidates.find((entry) => entry.showId === "rule-match");
  assert.ok(candidate);
  assert.equal(candidate.confidence.level, "high");
  assert.ok(candidate.evidence.strong.some((entry) => entry.code === "rule-match"));
  assert.equal(getCollection(report, "anthology-horror").candidateIds.includes("rule-no-match"), false);
});

test("report identifies low coverage, rich uncollected shows, coverage gaps, and strong duplicates without mutating inputs", () => {
  const shows = [
    show("member-one", { entityLinks: [{ entityId: "studio", role: "production-company" }] }),
    show("member-two", { entityLinks: [{ entityId: "studio", role: "production-company" }] }),
    show("member-three"),
    show("member-four"),
    show("rich-uncollected", {
      tones: ["cinematic"],
      tags: ["Remote colony"],
      themes: ["colonization"],
      bestFor: ["serious-sci-fi"],
      formats: ["full-cast", "serialized"],
      similarTo: ["member-one", "member-two"],
      entityLinks: [{ entityId: "studio", role: "production-company" }],
    }),
    show("genre-only", { formats: [], tones: [], tags: [], themes: [], bestFor: [], discovery: {}, length: {} }),
  ];
  const collections = [
    { id: "route-one", title: "Route One", kind: "curated", intentTags: ["serious-sci-fi"], showIds: ["member-one", "member-two", "member-three", "member-four"] },
    { id: "route-one-copy", title: "Route One Copy", kind: "curated", intentTags: ["serious-sci-fi"], showIds: ["member-one", "member-two", "member-three", "member-four"] },
  ];
  const entities = [{
    id: "studio",
    name: "Test Studio",
    type: "production-company",
    publication: "public",
    indexable: true,
    aliases: [],
    reviewedAt: "2026-08-01",
    sources: ["https://example.com/studio"],
  }];
  const before = JSON.stringify({ shows, collections, entities });

  const report = buildCollectionCandidateReport({ shows, collections, entities }, {
    candidateLimit: 10,
    highlightLimit: 10,
    minimumAreaShows: 2,
    coverageThreshold: 75,
    poorAreaLimit: 20,
  });

  assert.equal(report.scope.showsWithoutCollectionMembership, 2);
  assert.ok(report.lowMembership.collections.some((collection) => collection.id === "route-one"));
  assert.ok(report.richlyConnectedUncollected.shows.some((entry) => entry.showId === "rich-uncollected"));
  assert.ok(report.coverageGaps.areas.some((area) => area.value === "sci-fi"));
  assert.ok(report.nearDuplicateCollections.some((pair) => pair.evidence.includes("near-identical published membership set")));
  assert.equal(JSON.stringify({ shows, collections, entities }), before);

  const formatted = formatCollectionCandidateReport(report);
  assert.match(formatted, /Strong evidence:/);
  assert.match(formatted, /Weak\/context evidence:/);
  assert.match(formatted, /Near-duplicate collections/);
});
