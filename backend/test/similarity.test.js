const assert = require("node:assert/strict");
const test = require("node:test");

const { createSimilarityIndex } = require("../../shared/archive-similarity");

function show(id, overrides = {}) {
  return {
    id,
    title: id,
    status: "published",
    genres: ["sci-fi"],
    formats: ["serialized", "full-cast"],
    tones: ["dark"],
    tags: ["Found audio"],
    themes: ["isolation"],
    bestFor: ["headphones-on"],
    content: { intensity: "high" },
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "balanced", commitment: "medium", intensity: "high" },
    length: { avgEpisodeMinutes: 30 },
    ratings: {},
    creators: [],
    entityLinks: [],
    similarTo: [],
    similarReasons: {},
    ...overrides,
  };
}

test("similarity returns deterministic dimension-level metadata reasons", () => {
  const left = show("left", {
    title: "Left Show",
    ratings: { archive: 9, story: 8 },
    entityLinks: [{ entityId: "night-rocket", role: "production-company" }],
    resolvedEntities: [{ id: "night-rocket", name: "Night Rocket Productions", type: "production-company", role: "production-company" }],
  });
  const right = show("right", {
    title: "Right Show",
    ratings: { archive: 9, story: 8 },
    entityLinks: [{ entityId: "night-rocket", role: "production-company" }],
    resolvedEntities: [{ id: "night-rocket", name: "Night Rocket Productions", type: "production-company", role: "production-company" }],
  });
  const index = createSimilarityIndex({ shows: [left, right] });

  const comparison = index.compare("left", "right");
  assert.equal(comparison.curatedEvidence, false);
  assert.ok(comparison.score > 0);
  assert.ok(comparison.metadataMatches.includes("genre"));
  assert.ok(comparison.metadataMatches.includes("entity"));
  assert.ok(comparison.metadataMatches.includes("voiceStyle"));
  assert.ok(comparison.reasons.some((reason) => reason.dimension === "genre" && reason.text === "Shared genre: Sci-fi"));
  assert.ok(comparison.reasons.some((reason) => reason.dimension === "entity" && /Night Rocket/.test(reason.text)));

  const ratingDimension = comparison.dimensions.find((dimension) => dimension.id === "ratingProfile");
  assert.equal(ratingDimension.matched, true);
  assert.equal(ratingDimension.contribution, 0);
  assert.equal(comparison.score, index.compare("left", "right").score);
});

test("similarity keeps authored links and similarity collection reasons as separate editorial evidence", () => {
  const left = show("left", {
    title: "Left Show",
    similarTo: ["right"],
    similarReasons: { right: "An authored reason from the archive." },
  });
  const right = show("right", { title: "Right Show" });
  const index = createSimilarityIndex({
    shows: [left, right],
    collections: [{
      id: "shows-like-left",
      title: "Shows like Left Show",
      kind: "similarity",
      anchorShowId: "left",
      showIds: ["right"],
      showReasons: { right: "A route-specific authored reason." },
    }],
  });

  const comparison = index.compare("left", "right");
  const editorial = comparison.dimensions.find((dimension) => dimension.id === "editorial");
  assert.equal(comparison.curatedEvidence, true);
  assert.equal(editorial.contribution, 30);
  assert.ok(editorial.reasons.some((reason) => reason.text === "An authored reason from the archive."));
  assert.ok(editorial.reasons.some((reason) => reason.text === "A route-specific authored reason."));
});

test("raw creator strings do not become entity similarity evidence", () => {
  const left = show("left", { creators: ["Same Display Name"] });
  const right = show("right", { creators: ["Same Display Name"] });
  const index = createSimilarityIndex({ shows: [left, right] });
  const entity = index.compare("left", "right").dimensions.find((dimension) => dimension.id === "entity");

  assert.equal(entity.available, false);
  assert.equal(entity.matched, false);
});

test("candidate selection is deterministic, excludes drafts, and keeps authored sparse links eligible", () => {
  const anchor = show("anchor", {
    title: "Anchor",
    similarTo: ["sparse"],
    similarReasons: { sparse: "The archive chose this relationship." },
  });
  const sparse = show("sparse", {
    title: "Sparse",
    genres: [],
    formats: [],
    tones: [],
    tags: [],
    themes: [],
    bestFor: [],
    content: {},
    length: {},
  });
  const draft = show("draft", { status: "draft", title: "Draft" });
  const index = createSimilarityIndex({ shows: [anchor, sparse, draft] });

  const first = index.getSimilarShows("anchor", { limit: 4 });
  const second = index.getSimilarShows("anchor", { limit: 4 });
  assert.deepEqual(first.map((entry) => entry.show.id), ["sparse"]);
  assert.deepEqual(first.map((entry) => entry.show.id), second.map((entry) => entry.show.id));
  assert.equal(first[0].similarity.curatedEvidence, true);
});
