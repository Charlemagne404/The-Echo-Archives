const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildPublicSimilarityExplanation,
  createSimilarityIndex,
  DIMENSION_DEFINITIONS,
  MATCH_POLICY,
  PUBLIC_MATCH_POLICY,
  PUBLIC_SPECIFIC_DIMENSION_IDS,
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

function recommendationShow(id, overrides = {}) {
  const base = {
    genres: ["drama", "sci-fi"],
    formats: ["full-cast", "serialized"],
    tones: ["dark", "tense"],
    tags: ["Horror", "Found media"],
    themes: ["survival", "mystery"],
    bestFor: ["headphones-on", "late-night"],
    discovery: {
      voiceStyle: "primarily-acted",
      narrativeFocus: "plot-driven",
      intensity: "high",
      commitment: "short",
    },
    content: {
      setting: "remote research outpost",
      sourceMaterial: "original fiction",
      intensity: "high",
    },
    length: { episodes: 10, avgEpisodeMinutes: 24, totalHours: 4 },
    releaseStatus: "completed",
    completionStatus: "finished",
    listenLinks: {},
    entityLinks: [],
    resolvedEntities: [],
  };

  return show(id, {
    ...base,
    ...overrides,
    discovery: { ...base.discovery, ...overrides.discovery },
    content: { ...base.content, ...overrides.content },
    length: { ...base.length, ...overrides.length },
    listenLinks: { ...base.listenLinks, ...overrides.listenLinks },
  });
}

function recommendationPadding(count, { popularGenre = "drama", entity = null } = {}) {
  return Array.from({ length: count }, (_, index) => recommendationShow(`padding-${index}`, {
    genres: [popularGenre, `padding-genre-${index}`],
    formats: ["narrated", "episodic"],
    tones: [`padding-tone-${index}`],
    tags: [`padding-tag-${index}`],
    themes: [`padding-theme-${index}`],
    bestFor: [`padding-intent-${index}`],
    discovery: {
      voiceStyle: `padding-voice-${index}`,
      narrativeFocus: `padding-focus-${index}`,
      intensity: "variable",
      commitment: "medium",
    },
    content: {
      setting: `padding setting ${index}`,
      sourceMaterial: "original fiction",
    },
    entityLinks: entity ? [{ entityId: entity.id, role: entity.role }] : [],
    resolvedEntities: entity ? [{ id: entity.id, name: entity.name, role: entity.role }] : [],
    length: { episodes: 90 + index, avgEpisodeMinutes: 55 + index, totalHours: 80 + index },
  }));
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

test("public computed matches require enriched factual overlap and explain themselves without scores", () => {
  const left = show("left", {
    title: "Left Show",
    entityLinks: [{ entityId: "night-rocket", role: "production-company" }],
    resolvedEntities: [{ id: "night-rocket", name: "Night Rocket Productions", role: "production-company" }],
  });
  const right = show("right", {
    title: "Right Show",
    entityLinks: [{ entityId: "night-rocket", role: "production-company" }],
    resolvedEntities: [{ id: "night-rocket", name: "Night Rocket Productions", role: "production-company" }],
  });
  const index = createSimilarityIndex({ shows: [left, right] });
  const [match] = index.getPublicSimilarityMatches("left");

  assert.equal(match.show.id, "right");
  assert.ok(match.similarity.metadataCoverage >= PUBLIC_MATCH_POLICY.minimumMetadataCoverage);
  assert.ok(
    match.similarity.metadataMatches.filter((id) => PUBLIC_SPECIFIC_DIMENSION_IDS.includes(id)).length >= PUBLIC_MATCH_POLICY.minimumSpecificDimensions,
  );
  assert.match(match.explanation, /Shared tone: Dark/);
  assert.match(buildPublicSimilarityExplanation(match.similarity, { limit: 12 }), /Shared production company: Night Rocket Productions/);
  assert.doesNotMatch(match.explanation, /score|\/100/i);
  assert.equal(match.explanation, buildPublicSimilarityExplanation(match.similarity));
});

test("public computed matches reject sparse and broad genre-format-runtime neighbors", () => {
  const enriched = show("enriched", { title: "Enriched" });
  const sparse = sparseShow("sparse", { title: "Sparse" });
  const broad = show("broad", {
    title: "Broad Neighbor",
    tones: [],
    themes: [],
    tags: [],
    bestFor: [],
    content: {},
    discovery: {},
  });
  const index = createSimilarityIndex({ shows: [enriched, sparse, broad] });

  assert.deepEqual(index.getPublicSimilarityMatches("sparse"), []);
  assert.equal(index.getPublicSimilarityMatches("enriched").some((entry) => entry.show.id === "broad"), false);
});

test("public computed matches do not duplicate authored targets and keep authored evidence stronger", () => {
  const source = show("source", {
    title: "Source",
    similarTo: ["authored"],
    similarReasons: { authored: "The archive chose this relationship." },
    entityLinks: [{ entityId: "shared-studio", role: "studio" }],
    resolvedEntities: [{ id: "shared-studio", name: "Shared Studio", role: "studio" }],
  });
  const authored = show("authored", {
    title: "Authored",
    entityLinks: [{ entityId: "shared-studio", role: "studio" }],
    resolvedEntities: [{ id: "shared-studio", name: "Shared Studio", role: "studio" }],
  });
  const computed = show("computed", {
    title: "Computed",
    entityLinks: [{ entityId: "shared-studio", role: "studio" }],
    resolvedEntities: [{ id: "shared-studio", name: "Shared Studio", role: "studio" }],
  });
  const index = createSimilarityIndex({ shows: [source, authored, computed] });
  const ranked = index.getSimilarShows("source", { limit: 2 });
  const publicMatches = index.getPublicSimilarityMatches("source");

  assert.equal(ranked[0].show.id, "authored");
  assert.equal(ranked[0].similarity.curatedEvidence, true);
  assert.deepEqual(publicMatches.map((entry) => entry.show.id), ["computed"]);
  assert.equal(publicMatches.some((entry) => entry.show.id === "authored"), false);
});

test("public computed matches return nothing when the confidence floor is not met", () => {
  const source = sparseShow("source", { title: "Source" });
  const target = sparseShow("target", { title: "Target", genres: ["mystery"] });
  const index = createSimilarityIndex({ shows: [source, target] });

  assert.deepEqual(index.getPublicSimilarityMatches("source"), []);
});

test("editorial recommendations merge outgoing, incoming, and similarity-route evidence once", () => {
  const source = show("source", {
    title: "Source",
    similarTo: ["outgoing"],
    similarReasons: { outgoing: "Written outgoing route." },
  });
  const outgoing = show("outgoing", { title: "Outgoing" });
  const incoming = show("incoming", {
    title: "Incoming",
    similarTo: ["source"],
    similarReasons: { source: "Written incoming route." },
  });
  const route = show("route-member", { title: "Route Member" });
  const index = createSimilarityIndex({
    shows: [source, outgoing, incoming, route],
    collections: [{
      id: "shows-like-source",
      title: "Shows like Source",
      kind: "similarity",
      anchorShowId: "source",
      showIds: ["outgoing", "route-member"],
      showReasons: { "route-member": "A route-specific reason." },
    }],
  });

  const matches = index.getEditorialSimilarityMatches("source", { limit: 10 });
  assert.deepEqual(matches.map((entry) => entry.show.id), ["outgoing", "route-member", "incoming"]);
  assert.equal(matches[0].reason, "Written outgoing route.");
  assert.equal(matches[1].reason, "A route-specific reason.");
  assert.equal(matches[2].reason, "Written incoming route.");
  assert.deepEqual(index.getEditorialSimilarityMatches("source", { limit: 10 }), matches);
});

test("recommendation coverage keeps authored and computed surfaces separate", () => {
  const source = show("source", { title: "Source" });
  const incoming = show("incoming", {
    title: "Incoming",
    similarTo: ["source"],
    similarReasons: { source: "An authored incoming route for the coverage surface." },
  });
  const index = createSimilarityIndex({ shows: [source, incoming] });
  const coverage = index.getRecommendationCoverage("source");

  assert.equal(coverage.authoredCount, 1);
  assert.equal(coverage.authored[0].direction, "target-to-source");
  assert.equal(coverage.computedCount, 0);
  assert.equal(coverage.similarityRouteCount, 0);
});

test("recommendation coverage can reuse diagnostic candidates without changing public results", () => {
  const source = show("source");
  const target = show("target");
  const directIndex = createSimilarityIndex({ shows: [source, target] });
  const reusedIndex = createSimilarityIndex({ shows: [source, target] });
  const directCoverage = directIndex.getRecommendationCoverage("source");
  const diagnosticCandidates = reusedIndex.getSimilarShows("source", { limit: reusedIndex.shows.length });

  assert.deepEqual(
    reusedIndex.getRecommendationCoverage("source", { precomputedCandidates: diagnosticCandidates }),
    directCoverage,
  );
});

test("frequency-aware discovery weighting prefers distinctive combinations over common tags", () => {
  const source = show("source", {
    themes: ["isolation", "unknown-signal"],
    tags: ["common-tag", "signal-in-the-ice"],
    bestFor: ["headphones-on", "remote-station"],
    releaseStatus: "active",
    completionStatus: "ongoing",
  });
  const generic = show("generic", {
    tags: ["common-tag"],
    releaseStatus: "active",
    completionStatus: "ongoing",
  });
  const distinctive = show("distinctive", {
    themes: ["unknown-signal"],
    tags: ["signal-in-the-ice"],
    bestFor: ["remote-station"],
    releaseStatus: "active",
    completionStatus: "ongoing",
  });
  const commonRecords = Array.from({ length: 10 }, (_, index) => show(`common-${index}`, {
    tags: ["common-tag"],
    releaseStatus: "active",
    completionStatus: "ongoing",
  }));
  const index = createSimilarityIndex({ shows: [source, generic, distinctive, ...commonRecords] });
  const genericSimilarity = index.compare("source", "generic");
  const distinctiveSimilarity = index.compare("source", "distinctive");
  const genericTag = genericSimilarity.dimensions.find((dimension) => dimension.id === "tag");
  const distinctiveTag = distinctiveSimilarity.dimensions.find((dimension) => dimension.id === "tag");

  assert.ok(distinctiveSimilarity.score > genericSimilarity.score);
  assert.ok(distinctiveSimilarity.discoveryCohesion > genericSimilarity.discoveryCohesion);
  assert.ok(distinctiveTag.distinctiveness > genericTag.distinctiveness);
  assert.deepEqual(index.getPublicSimilarityMatches("source").map((entry) => entry.show.id), ["distinctive"]);
});

test("public computed matches resist broad, popular, rare, and entity-only evidence", () => {
  const sharedEntity = { id: "catalogue-hub", name: "Catalogue Hub", role: "production-company" };
  const source = recommendationShow("source", {
    title: "Source",
    genres: ["drama", "sci-fi", "space-opera"],
    entityLinks: [{ entityId: sharedEntity.id, role: sharedEntity.role }],
    resolvedEntities: [sharedEntity],
    listenLinks: { rss: "https://feeds.example.test/source.xml" },
  });
  const experienceWide = recommendationShow("experience-wide", {
    title: "Experience Wide",
    genres: ["drama", "sci-fi", "space-opera"],
    entityLinks: [{ entityId: sharedEntity.id, role: sharedEntity.role }],
    resolvedEntities: [sharedEntity],
  });
  const entityHeavy = recommendationShow("entity-heavy", {
    title: "Entity Heavy",
    genres: ["drama"],
    formats: ["full-cast", "serialized"],
    tones: ["tense"],
    tags: ["Horror"],
    themes: ["friendship"],
    bestFor: ["long-walks"],
    discovery: {
      voiceStyle: "primarily-acted",
      narrativeFocus: "character-driven",
      intensity: "medium",
      commitment: "medium",
    },
    entityLinks: [{ entityId: sharedEntity.id, role: sharedEntity.role }],
    resolvedEntities: [sharedEntity],
  });
  const entityOnly = recommendationShow("entity-only", {
    title: "Entity Only",
    genres: ["drama"],
    tones: ["tense"],
    tags: ["General audio"],
    themes: ["friendship"],
    bestFor: ["long-walks"],
    discovery: {
      voiceStyle: "primarily-narrated",
      narrativeFocus: "character-driven",
      intensity: "low",
      commitment: "deep-dive",
    },
    entityLinks: [{ entityId: sharedEntity.id, role: sharedEntity.role }],
    resolvedEntities: [sharedEntity],
  });
  const oneBroadTag = recommendationShow("one-broad-tag", {
    genres: ["drama"],
    tones: ["funny"],
    tags: ["Horror"],
    themes: ["friendship"],
    bestFor: ["long-walks"],
    discovery: {
      voiceStyle: "primarily-narrated",
      narrativeFocus: "character-driven",
      intensity: "low",
      commitment: "deep-dive",
    },
  });
  const popularGenreOnly = recommendationShow("popular-genre-only", {
    genres: ["drama"],
    tones: ["funny"],
    tags: ["General audio"],
    themes: ["friendship"],
    bestFor: ["long-walks"],
    discovery: {
      voiceStyle: "primarily-narrated",
      narrativeFocus: "character-driven",
      intensity: "low",
      commitment: "deep-dive",
    },
  });
  const rareGenreOnly = recommendationShow("rare-genre-only", {
    genres: ["space-opera"],
    tones: ["funny"],
    tags: ["General audio"],
    themes: ["friendship"],
    bestFor: ["long-walks"],
    discovery: {
      voiceStyle: "primarily-narrated",
      narrativeFocus: "character-driven",
      intensity: "low",
      commitment: "deep-dive",
    },
  });
  const nearDuplicate = recommendationShow("near-duplicate", {
    title: "Source feed mirror",
    listenLinks: { rss: "https://feeds.example.test/source.xml" },
  });
  const explicitNonfiction = recommendationShow("explicit-nonfiction", {
    title: "Explicit Nonfiction",
    content: { sourceMaterial: "non-fiction documentary" },
  });
  const shows = [
    source,
    experienceWide,
    entityHeavy,
    entityOnly,
    oneBroadTag,
    popularGenreOnly,
    rareGenreOnly,
    nearDuplicate,
    explicitNonfiction,
    ...recommendationPadding(12, { entity: sharedEntity }),
  ];
  const index = createSimilarityIndex({ shows });
  const matches = index.getPublicSimilarityMatches("source", {
    limit: 20,
    maximumResults: 20,
    diversify: false,
  });
  const matchIds = matches.map((entry) => entry.show.id);

  assert.equal(index.compare("source", "rare-genre-only").dimensions.find((dimension) => dimension.id === "genre").contribution
    > index.compare("source", "popular-genre-only").dimensions.find((dimension) => dimension.id === "genre").contribution, true);
  assert.deepEqual(matchIds.slice(0, 2), ["experience-wide", "entity-heavy"]);
  assert.equal(matchIds.includes("entity-only"), false);
  assert.equal(matchIds.includes("one-broad-tag"), false);
  assert.equal(matchIds.includes("popular-genre-only"), false);
  assert.equal(matchIds.includes("rare-genre-only"), false);
  assert.equal(matchIds.includes("near-duplicate"), false);
  assert.equal(matchIds.includes("explicit-nonfiction"), false);
  assert.equal(matches[0].reasons[0].dimension, "tone");
  assert.ok(matches[0].rankingScore > matches[1].rankingScore);
});

test("recommendation fit downranks tone, performance, structure, and commitment conflicts", () => {
  const source = recommendationShow("source");
  const sameExperience = recommendationShow("same-experience");
  const sameSettingDifferentTone = recommendationShow("same-setting-different-tone", {
    tones: ["warm", "hopeful"],
    themes: ["friendship"],
    tags: ["community"],
    bestFor: ["long-walks"],
    discovery: {
      voiceStyle: "primarily-acted",
      narrativeFocus: "plot-driven",
      intensity: "high",
      commitment: "short",
    },
  });
  const sameToneDifferentFormat = recommendationShow("same-tone-different-format", {
    formats: ["narrated", "episodic"],
    discovery: {
      voiceStyle: "primarily-narrated",
      narrativeFocus: "plot-driven",
      intensity: "high",
      commitment: "short",
    },
  });
  const anthology = recommendationShow("anthology-vs-serial", {
    formats: ["anthology"],
  });
  const largeCommitment = recommendationShow("large-commitment", {
    discovery: {
      voiceStyle: "primarily-acted",
      narrativeFocus: "plot-driven",
      intensity: "high",
      commitment: "deep-dive",
    },
    length: { episodes: 300, avgEpisodeMinutes: 45, totalHours: 240 },
  });
  const explicitNonfiction = recommendationShow("explicit-nonfiction", {
    content: { sourceMaterial: "non-fiction documentary" },
  });
  const authoredRoute = {
    id: "shows-like-source",
    title: "Shows like Source",
    kind: "similarity",
    anchorShowId: "source",
    showIds: [
      sameSettingDifferentTone.id,
      sameToneDifferentFormat.id,
      anthology.id,
      largeCommitment.id,
      explicitNonfiction.id,
      sameExperience.id,
    ],
    showReasons: Object.fromEntries([
      sameSettingDifferentTone,
      sameToneDifferentFormat,
      anthology,
      largeCommitment,
      explicitNonfiction,
      sameExperience,
    ].map((candidate) => [candidate.id, `The archive wrote a specific route to ${candidate.title} for this listener.`])),
  };
  const shows = [source, sameExperience, sameSettingDifferentTone, sameToneDifferentFormat, anthology, largeCommitment, explicitNonfiction,
    ...recommendationPadding(12)];
  const index = createSimilarityIndex({ shows });
  const comparisons = [
    [sameSettingDifferentTone, "tone"],
    [sameToneDifferentFormat, "performance"],
    [sameToneDifferentFormat, "narrativeStructure"],
    [anthology, "narrativeStructure"],
    [largeCommitment, "commitment"],
  ];

  for (const [candidate, dimension] of comparisons) {
    assert.ok(index.compare("source", candidate.id).recommendationFit.conflicts.some((conflict) => conflict.dimension === dimension));
  }
  assert.ok(index.compare("source", sameSettingDifferentTone.id).collectionSignals.some((signal) => signal.id === "setting"));
  const runtimeOnlyShort = recommendationShow("runtime-only-short", {
    discovery: { commitment: "" },
    length: { totalObservedHours: 4 },
  });
  const runtimeOnlyLong = recommendationShow("runtime-only-long", {
    discovery: { commitment: "" },
    length: { totalHours: "", totalObservedHours: 120 },
  });
  assert.ok(index.compare(runtimeOnlyShort, runtimeOnlyLong).recommendationFit.conflicts.some((conflict) => conflict.dimension === "commitment"));
  assert.equal(index.compare("source", explicitNonfiction.id).recommendationFit.blocked, true);
  const ambiguousDocudrama = recommendationShow("ambiguous-docudrama", {
    content: { sourceMaterial: "documentary/docudrama" },
  });
  assert.equal(index.compare("source", ambiguousDocudrama).recommendationFit.blocked, false);
  const publicMatches = index.getPublicSimilarityMatches("source", { limit: 20, maximumResults: 20, diversify: false });
  const publicIds = publicMatches.map((entry) => entry.show.id);
  assert.equal(publicIds.includes(explicitNonfiction.id), false);
  assert.ok(publicIds.includes(sameToneDifferentFormat.id));
  assert.ok(publicIds.includes(anthology.id));
  assert.ok(publicIds.includes(largeCommitment.id));
  assert.ok(publicIds.indexOf("same-experience") < publicIds.indexOf(sameToneDifferentFormat.id));
  assert.ok(publicIds.indexOf("same-experience") < publicIds.indexOf(anthology.id));
  assert.ok(publicIds.indexOf("same-experience") < publicIds.indexOf(largeCommitment.id));

  const authoredSource = recommendationShow("authored-source", {
    similarTo: [explicitNonfiction.id],
    similarReasons: { [explicitNonfiction.id]: "An explicit editorial route despite the different source material." },
  });
  const authoredIndex = createSimilarityIndex({ shows: [authoredSource, explicitNonfiction, sameExperience] });
  assert.equal(authoredIndex.getEditorialSimilarityMatches(authoredSource.id)[0].show.id, explicitNonfiction.id);
  assert.equal(authoredIndex.getPublicSimilarityMatches(authoredSource.id).some((entry) => entry.show.id === explicitNonfiction.id), false);

  const view = index.getShowsLikeCollectionView("source", authoredRoute);
  const recommendationById = new Map(view.recommendations.map((entry) => [entry.show.id, entry]));
  assert.ok(recommendationById.get(sameExperience.id).rankingScore > recommendationById.get(sameSettingDifferentTone.id).rankingScore);
  assert.ok(recommendationById.get(sameExperience.id).rankingScore > recommendationById.get(sameToneDifferentFormat.id).rankingScore);
  assert.ok(recommendationById.get(sameExperience.id).rankingScore > recommendationById.get(anthology.id).rankingScore);
  assert.ok(recommendationById.get(sameExperience.id).rankingScore > recommendationById.get(largeCommitment.id).rankingScore);
  assert.equal(recommendationById.has(explicitNonfiction.id), true);
  assert.equal(recommendationById.get(explicitNonfiction.id).source, "authored");
  assert.equal(view.recommendations.some((entry) => entry.source === "computed" && entry.show.id === explicitNonfiction.id), false);
});

test("public recommendations exclude exact feed duplicates and keep a varied second route", () => {
  const source = show("source", {
    listenLinks: {
      rss: "https://feeds.example.test/source.xml",
      apple: "https://podcasts.example.test/source",
      spotify: "https://open.spotify.com/show/source",
    },
  });
  const duplicate = show("duplicate", {
    listenLinks: {
      rss: "https://feeds.example.test/source.xml",
      apple: "https://podcasts.example.test/source",
      spotify: "https://open.spotify.com/show/source",
    },
  });
  const focused = show("focused", { title: "Focused Route" });
  const alternate = show("alternate", {
    title: "Alternate Route",
    tones: ["dark"],
    themes: ["conspiracy"],
    tags: ["found-media"],
    bestFor: ["late-night"],
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "mystery", intensity: "high", commitment: "medium" },
  });
  const index = createSimilarityIndex({ shows: [source, duplicate, focused, alternate] });

  assert.equal(index.compare("source", "duplicate").nearDuplicate, true);
  const matches = index.getPublicSimilarityMatches("source", { limit: 4 });
  assert.deepEqual(matches.map((entry) => entry.show.id), ["focused", "alternate"]);
  assert.equal(matches.some((entry) => entry.show.id === "duplicate"), false);
  assert.notEqual(matches[0].explanation, matches[1].explanation);
  assert.deepEqual(matches, index.getPublicSimilarityMatches("source", { limit: 4 }));
});

test("sparse but meaningful records receive limited-metadata matches without pretending to be fully enriched", () => {
  const source = sparseShow("source", {
    tones: ["tense"],
    tags: ["sci-fi"],
    bestFor: ["headphones-on"],
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "balanced", intensity: "high" },
  });
  const target = sparseShow("target", {
    tones: ["tense"],
    tags: ["sci-fi"],
    bestFor: ["headphones-on"],
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "balanced", intensity: "high" },
  });
  const enriched = show("enriched", {
    themes: ["isolation"],
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "balanced", intensity: "high", commitment: "medium" },
    entityLinks: [{ entityId: "archive-studio", role: "studio" }],
    resolvedEntities: [{ id: "archive-studio", name: "Archive Studio", role: "studio" }],
  });
  const index = createSimilarityIndex({
    shows: [source, target, enriched],
    collections: [{ id: "enriched-route", title: "Enriched route", kind: "curated", showIds: ["enriched"] }],
  });

  assert.ok(index.getMetadataProfile("source").metadataCoverage < PUBLIC_MATCH_POLICY.sparseCoverageThreshold);
  const match = index.getPublicSimilarityMatches("source").find((entry) => entry.show.id === "target");
  assert.ok(match);
  assert.equal(match.confidence, "limited-metadata");
  assert.match(match.explanation, /Shared tone|Shared discovery tag/);
});

test("public reasons group entity roles and keep explanations compact", () => {
  const sharedEntities = [
    { entityId: "creator", role: "creator" },
    { entityId: "studio", role: "production-company" },
  ];
  const resolvedEntities = [
    { id: "creator", name: "A. Creator", role: "creator" },
    { id: "studio", name: "A Studio", role: "production-company" },
  ];
  const left = show("left", { entityLinks: sharedEntities, resolvedEntities });
  const right = show("right", { entityLinks: sharedEntities, resolvedEntities });
  const index = createSimilarityIndex({ shows: [left, right] });
  const [match] = index.getPublicSimilarityMatches("left");

  const detailedExplanation = buildPublicSimilarityExplanation(match.similarity, { limit: 12 });
  assert.match(detailedExplanation, /Shared creator: A\. Creator/);
  assert.match(detailedExplanation, /Shared production company: A Studio/);
  assert.doesNotMatch(detailedExplanation, /Shared archive entities/);
  assert.ok(match.reasons.length <= PUBLIC_MATCH_POLICY.explanationReasons);
});

test("Shows Like collection views preserve authored picks and build useful sections", () => {
  const source = show("source", {
    title: "Source Show",
    tones: ["warm"],
    listenLinks: { rss: "https://feeds.example.test/source.xml" },
  });
  const authoredOne = show("authored-one", { title: "Authored One" });
  const authoredTwo = show("authored-two", { title: "Authored Two" });
  const authoredThree = show("authored-three", { title: "Authored Three" });
  const atmosphereOne = show("atmosphere-one", {
    title: "Atmosphere One",
    tones: ["warm"],
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "mystery", commitment: "medium", intensity: "high" },
  });
  const atmosphereTwo = show("atmosphere-two", {
    title: "Atmosphere Two",
    tones: ["warm"],
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "mystery", commitment: "medium", intensity: "high" },
  });
  const draft = show("draft", { status: "draft" });
  const nearDuplicate = show("near-duplicate", {
    listenLinks: { rss: "https://feeds.example.test/source.xml" },
    title: "Source Show feed mirror",
  });
  const collection = {
    id: "shows-like-source",
    title: "Shows like Source Show",
    kind: "similarity",
    anchorShowId: "source",
    showIds: [
      "authored-one",
      "authored-two",
      "authored-three",
      "atmosphere-one",
      "atmosphere-two",
      "draft",
      "near-duplicate",
      "source",
    ],
    showReasons: {
      "authored-one": "A specific authored route through the same intimate mystery appetite.",
      "authored-two": "A second authored route with a strong ensemble and relationship focus.",
      "authored-three": "A third authored route that keeps the source's measured narrative pace.",
      "atmosphere-one": "A warm route for the source's emotional atmosphere.",
      "atmosphere-two": "Another warm route with the same emotional atmosphere.",
      draft: "This should not be visible because the record is unpublished.",
      "near-duplicate": "This should not be visible because it is the source feed mirror.",
      source: "This should not be visible because a collection cannot recommend itself.",
    },
  };
  const index = createSimilarityIndex({
    shows: [source, authoredOne, authoredTwo, authoredThree, atmosphereOne, atmosphereTwo, draft, nearDuplicate],
    collections: [collection],
  });

  const view = index.getShowsLikeCollectionView("source", collection);

  assert.equal(view.authoredCount, 5);
  assert.equal(view.computedCount, 0);
  assert.deepEqual(view.recommendations.map((entry) => entry.show.id), [
    "atmosphere-one",
    "atmosphere-two",
    "authored-one",
    "authored-two",
    "authored-three",
  ]);
  assert.equal(view.recommendations.every((entry) => entry.source === "authored"), true);
  assert.ok(view.recommendations[0].rankingScore > view.recommendations.at(-1).rankingScore);
  assert.deepEqual(
    view.recommendations.map((entry) => entry.show.id),
    index.getShowsLikeCollectionView("source", collection).recommendations.map((entry) => entry.show.id),
  );
  assert.ok(view.sections.some((section) => section.id === "closest"));
  assert.ok(view.sections.find((section) => section.id === "closest").recommendations.length >= 3);
  assert.equal(view.recommendations.some((entry) => entry.show.id === "source"), false);
  assert.equal(view.recommendations.some((entry) => entry.show.id === "draft"), false);
  assert.equal(view.recommendations.some((entry) => entry.show.id === "near-duplicate"), false);
});

test("Shows Like ranking favors multi-signal listening matches and discloses sparse authored routes", () => {
  const source = sparseShow("source", {
    title: "Remote Source",
    genres: ["horror", "mystery"],
    tones: ["tense"],
    themes: ["survival"],
    tags: ["Arctic horror"],
    bestFor: ["headphones-on"],
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "plot-driven", intensity: "high" },
    content: { setting: "remote arctic outpost", pov: "found footage / collected records" },
  });
  const metadataThin = sparseShow("metadata-thin", {
    title: "Metadata Thin",
    tones: [],
    themes: [],
    tags: [],
    bestFor: [],
    discovery: {},
    content: {},
  });
  const experienceMatch = sparseShow("experience-match", {
    title: "Experience Match",
    genres: ["horror", "mystery"],
    tones: ["tense"],
    themes: ["survival"],
    tags: ["Arctic horror"],
    bestFor: ["headphones-on"],
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "plot-driven", intensity: "high" },
    content: { setting: "remote arctic outpost / global horror sites", pov: "found footage / collected records" },
  });
  const alternateMatch = sparseShow("alternate-match", {
    title: "Alternate Match",
    genres: ["horror", "mystery"],
    tones: ["dark"],
    themes: ["survival"],
    tags: ["Isolation"],
    bestFor: ["late-night"],
    discovery: { voiceStyle: "primarily-acted", narrativeFocus: "plot-driven", intensity: "high" },
    content: { setting: "remote research facility", pov: "found recordings" },
  });
  const collection = {
    id: "shows-like-source",
    title: "Shows like Remote Source",
    kind: "similarity",
    anchorShowId: source.id,
    showIds: [metadataThin.id, experienceMatch.id, alternateMatch.id],
    showReasons: {
      [metadataThin.id]: "A route retained for the premise, although this entry has limited archive metadata.",
      [experienceMatch.id]: "A strong route for the source's cold setting, survival pressure, and found-recording structure.",
      [alternateMatch.id]: "A darker route that keeps the investigation shape while changing the facility setting.",
    },
  };
  const index = createSimilarityIndex({ shows: [source, metadataThin, experienceMatch, alternateMatch], collections: [collection] });
  const view = index.getShowsLikeCollectionView(source.id, collection);

  assert.deepEqual(view.recommendations.map((entry) => entry.show.id), ["experience-match", "alternate-match", "metadata-thin"]);
  assert.ok(view.recommendations[0].rankingScore > view.recommendations.at(-1).rankingScore);
  assert.equal(view.recommendations.at(-1).metadataConfidence, "limited-metadata");
  assert.ok(view.recommendations[0].similarity.collectionSignals.some((signal) => signal.id === "setting"));
  assert.equal(view.recommendations.every((entry) => entry.source === "authored"), true);
});

test("computed Shows Like fallbacks use collection-specific experience reasons without scores", () => {
  const source = show("source", {
    title: "Remote Source",
    listenLinks: { rss: "https://feeds.example.test/source.xml" },
    tones: ["dark"],
    themes: ["isolation"],
    tags: ["Remote outpost"],
    bestFor: ["headphones-on"],
    discovery: {},
    releaseStatus: "active",
    completionStatus: "ongoing",
    content: { setting: "remote arctic outpost", pov: "found footage / collected records" },
  });
  const target = show("target", {
    title: "Remote Target",
    tones: ["dark"],
    themes: ["isolation"],
    tags: ["Remote outpost"],
    bestFor: ["headphones-on"],
    discovery: {},
    releaseStatus: "active",
    completionStatus: "ongoing",
    content: { setting: "remote arctic outpost / global horror sites", pov: "found footage / collected records" },
  });
  const nearDuplicate = show("near-duplicate", {
    title: "Source feed mirror",
    listenLinks: { rss: "https://feeds.example.test/source.xml" },
    tags: ["Remote outpost"],
    bestFor: ["headphones-on"],
    content: { setting: "remote arctic outpost", pov: "found footage / collected records" },
  });
  const collection = {
    id: "shows-like-source",
    title: "Shows like Remote Source",
    kind: "similarity",
    anchorShowId: source.id,
    showIds: [],
    showReasons: {},
  };
  const index = createSimilarityIndex({ shows: [source, target, nearDuplicate], collections: [collection] });
  const view = index.getShowsLikeCollectionView(source.id, collection);

  assert.equal(view.authoredCount, 0);
  assert.equal(view.computedCount, 1);
  assert.equal(view.recommendations[0].source, "computed");
  assert.equal(view.recommendations.some((entry) => entry.show.id === nearDuplicate.id), false);
  assert.match(view.recommendations[0].reason, /dark atmosphere/i);
  assert.ok(view.recommendations[0].similarity.collectionSignals.some((signal) => signal.id === "setting"));
  assert.doesNotMatch(view.recommendations[0].reason, /score|\/100/i);
});

test("similarity weights remain explicit and sum to the public score budget", () => {
  assert.equal(DIMENSION_DEFINITIONS.reduce((total, definition) => total + definition.weight, 0), SCORE_MAX);
  assert.ok(DIMENSION_DEFINITIONS.some((definition) => definition.id === "releaseProfile" && definition.weight > 0));
  assert.ok(DIMENSION_DEFINITIONS.some((definition) => definition.id === "catalogLength" && definition.weight > 0));
  assert.equal(typeof MATCH_POLICY.minimumScore, "number");
});
