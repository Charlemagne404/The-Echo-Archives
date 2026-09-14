const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createSimilarityIndex,
  DIMENSION_DEFINITIONS,
  MATCH_POLICY,
  SCORE_MAX,
} = require("../../shared/archive-similarity");

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

function sparseShow(id, overrides = {}) {
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

test("sparse records use core facts without making genre-only matches eligible", () => {
  const anchor = sparseShow("anchor", { title: "Sparse Anchor" });
  const companion = sparseShow("companion", { title: "Sparse Companion" });
  const genreOnly = sparseShow("genre-only", {
    title: "Genre Only",
    formats: [],
    length: {},
    releaseStatus: "unknown",
    completionStatus: "unclear",
  });
  const enriched = show("enriched", {
    title: "Enriched Reference",
    entityLinks: [{ entityId: "reference-studio", role: "studio" }],
    resolvedEntities: [{ id: "reference-studio", name: "Reference Studio", role: "studio" }],
    releaseStatus: "active",
    completionStatus: "ongoing",
    length: { episodes: 12, avgEpisodeMinutes: 42 },
  });
  const index = createSimilarityIndex({ shows: [anchor, companion, genreOnly, enriched] });

  const comparison = index.compare("anchor", "companion");
  assert.equal(comparison.curatedEvidence, false);
  assert.ok(comparison.score >= MATCH_POLICY.minimumScore);
  assert.ok(comparison.metadataMatches.includes("format"));
  assert.ok(comparison.metadataMatches.includes("episodeLength"));
  assert.ok(comparison.metadataMatches.includes("catalogLength"));
  assert.ok(comparison.metadataMatches.includes("releaseProfile"));
  assert.ok(comparison.metadataCoverage < 1);
  assert.ok(comparison.sourceMetadataCoverage < comparison.metadataCoverage + 0.001);
  assert.ok(comparison.metadataCoverageByDimension.some((entry) => entry.id === "tone" && !entry.sourceAvailable && !entry.targetAvailable));

  const candidates = index.getSimilarShows("anchor", { limit: 10 });
  assert.ok(candidates.some((entry) => entry.show.id === "companion"));
  assert.equal(candidates.some((entry) => entry.show.id === "genre-only"), false);
  assert.equal(index.getMetadataProfile("anchor").metadataCoverage < index.getMetadataProfile("enriched").metadataCoverage, true);
});

test("optional discovery metadata improves an enriched match without penalizing its sparse neighbor", () => {
  const source = sparseShow("source", {
    tones: ["dark"],
    themes: ["isolation"],
    tags: ["Locked-room mystery"],
    bestFor: ["headphones-on"],
    content: { intensity: "high" },
    discovery: { intensity: "high", narrativeFocus: "balanced" },
  });
  const sparseTarget = sparseShow("sparse-target");
  const enrichedTarget = sparseShow("enriched-target", {
    tones: ["dark"],
    themes: ["isolation"],
    tags: ["Locked-room mystery"],
    bestFor: ["headphones-on"],
    content: { intensity: "high" },
    discovery: { intensity: "high", narrativeFocus: "balanced" },
  });
  const index = createSimilarityIndex({ shows: [source, sparseTarget, enrichedTarget] });

  const sparseComparison = index.compare("source", "sparse-target");
  const enrichedComparison = index.compare("source", "enriched-target");
  assert.ok(enrichedComparison.score > sparseComparison.score);
  assert.ok(enrichedComparison.metadataCoverage > sparseComparison.metadataCoverage);
  assert.equal(sparseComparison.metadataMatches.includes("tone"), false);
  assert.equal(enrichedComparison.metadataMatches.includes("tone"), true);
  assert.equal(enrichedComparison.metadataMatches.includes("tag"), true);
  assert.ok(enrichedComparison.reasons.every((reason) => reason.contribution > 0 || reason.includedInScore === false));
});

test("rich records combine typed entities, collections, runtime, catalogue size, and release facts", () => {
  const left = show("rich-left", {
    title: "Rich Left",
    releaseStatus: "completed",
    completionStatus: "finished",
    length: { episodes: 20, avgEpisodeMinutes: 45 },
    entityLinks: [{ entityId: "night-rocket", role: "production-company" }],
    resolvedEntities: [{ id: "night-rocket", name: "Night Rocket Productions", role: "production-company" }],
  });
  const right = show("rich-right", {
    title: "Rich Right",
    releaseStatus: "completed",
    completionStatus: "finished",
    length: { episodes: 22, avgEpisodeMinutes: 48 },
    entityLinks: [{ entityId: "night-rocket", role: "production-company" }],
    resolvedEntities: [{ id: "night-rocket", name: "Night Rocket Productions", role: "production-company" }],
  });
  const index = createSimilarityIndex({
    shows: [left, right],
    collections: [{ id: "finished-arcs", title: "Finished arcs", kind: "curated", showIds: ["rich-left", "rich-right"] }],
  });

  const comparison = index.compare("rich-left", "rich-right");
  assert.ok(comparison.score > 0);
  for (const id of ["entity", "releaseProfile", "episodeLength", "catalogLength", "sharedCollection"]) {
    const dimension = comparison.dimensions.find((entry) => entry.id === id);
    assert.equal(dimension.matched, true, id);
    assert.ok(dimension.contribution > 0, id);
    assert.ok(dimension.reasons.length > 0, id);
  }
  assert.ok(comparison.reasons.some((reason) => reason.text === "Shared release or completion state: Finished."));
  assert.ok(comparison.reasons.some((reason) => reason.text === "Similar catalogue size: 20 vs 22 episodes."));
  assert.ok(comparison.reasons.some((reason) => /Night Rocket Productions/.test(reason.text)));
  assert.ok(comparison.reasons.some((reason) => /Finished arcs/.test(reason.text)));
  assert.deepEqual(comparison, index.compare("rich-left", "rich-right"));
});

test("similarity weights remain explicit and sum to the public score budget", () => {
  assert.equal(DIMENSION_DEFINITIONS.reduce((total, definition) => total + definition.weight, 0), SCORE_MAX);
  assert.ok(DIMENSION_DEFINITIONS.some((definition) => definition.id === "releaseProfile" && definition.weight > 0));
  assert.ok(DIMENSION_DEFINITIONS.some((definition) => definition.id === "catalogLength" && definition.weight > 0));
  assert.equal(typeof MATCH_POLICY.minimumScore, "number");
});
