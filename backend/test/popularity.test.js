const test = require("node:test");
const assert = require("node:assert/strict");

const {
  POPULARITY_CONFIG,
  POPULARITY_SCORE_SEMANTICS,
  createPopularityService,
  scoreCatalogPopularity,
  scoreCommunity,
  scoreShowPopularity,
} = require("../lib/popularity");

const NOW = new Date("2026-10-03T00:00:00.000Z");

function show(id, overrides = {}) {
  return {
    id,
    title: id,
    createdAt: "2026-10-03T00:00:00.000Z",
    finalRating: null,
    collectionIds: [],
    ...overrides,
  };
}

function signals({ lifetime = {}, days90 = {}, days28 = {}, community = {} } = {}) {
  return { periods: { lifetime, days90, days28 }, community };
}

test("zero engagement produces a deterministic cold-start order with a weak editorial prior", () => {
  const catalog = [
    show("old-unrated", { title: "Old Unrated", createdAt: "2020-01-01T00:00:00.000Z" }),
    show("new-unrated", { title: "New Unrated" }),
    show("old-editorial", { title: "Old Editorial", createdAt: "2020-01-01T00:00:00.000Z", finalRating: 10, collectionIds: ["one", "two", "three", "four"] }),
  ];
  const empty = Object.fromEntries(catalog.map((entry) => [entry.id, signals()]));
  const first = scoreCatalogPopularity(catalog, empty, NOW);
  const second = scoreCatalogPopularity(catalog, empty, NOW);

  assert.deepEqual(first.scores, second.scores);
  assert.ok(first.scores["new-unrated"] > first.scores["old-unrated"]);
  assert.ok(first.scores["old-editorial"] - first.scores["old-unrated"] <= 1.95);
  assert.equal(first.diagnostics["old-editorial"].components.coldStart.collectionPoints, 0.45);
  assert.equal(POPULARITY_CONFIG.coldStart.archiveRatingMax, 1.5);
  assert.equal(
    scoreShowPopularity(show("featured", { isFeatured: true, isArchivePick: true, editorialStatus: "Archive Pick" }), signals(), NOW).score,
    scoreShowPopularity(show("plain"), signals(), NOW).score,
  );
});

test("large listener interest with exposure and listening intent outranks a cold-start show", () => {
  const active = signals({
    lifetime: {
      "impression:browse:10-24": 10_000,
      "show_open:browse:10-24": 4_000,
      show_page_view: 3_000,
      listen_click: 1_800,
      show_saved: 900,
      library_listening: 400,
      rating_submitted: 150,
      review_published: 25,
      helpful_vote: 50,
    },
    days90: {
      "impression:browse:10-24": 5_000,
      "show_open:browse:10-24": 2_000,
      show_page_view: 1_500,
      listen_click: 900,
      show_saved: 450,
      library_listening: 200,
    },
    days28: {
      "impression:browse:10-24": 2_000,
      "show_open:browse:10-24": 800,
      show_page_view: 600,
      listen_click: 360,
      show_saved: 180,
      library_listening: 80,
    },
    community: { ratingCount: 150, ratingSum: 1_350, reviewCount: 25, reviewRatingSum: 125, helpfulVoteCount: 50 },
  });
  const popular = scoreShowPopularity(show("active"), active, NOW);
  const cold = scoreShowPopularity(show("cold"), signals(), NOW);

  assert.ok(popular.score > cold.score + 40);
  assert.equal(popular.components.exposureConfidence, "established");
  assert.ok(popular.components.windows.days28.points > 0);
});

test("position-aware smoothing prevents one impression and one open from beating real scale", () => {
  const tiny = scoreShowPopularity(show("tiny"), signals({
    lifetime: { "impression:browse:1": 1, "show_open:browse:1": 1 },
    days90: { "impression:browse:1": 1, "show_open:browse:1": 1 },
    days28: { "impression:browse:1": 1, "show_open:browse:1": 1 },
  }), NOW);
  const scaled = scoreShowPopularity(show("scaled"), signals({
    lifetime: { "impression:browse:10-24": 10_000, "show_open:browse:10-24": 4_000 },
    days90: { "impression:browse:10-24": 8_000, "show_open:browse:10-24": 3_000 },
    days28: { "impression:browse:10-24": 4_000, "show_open:browse:10-24": 1_500 },
  }), NOW);
  const cold = scoreShowPopularity(show("cold"), signals(), NOW);

  assert.ok(tiny.score - cold.score < 0.6);
  assert.ok(scaled.score > tiny.score + 20);
  assert.ok(tiny.components.windows.lifetime.clickRate < scaled.components.windows.lifetime.clickRate);
  assert.ok(tiny.components.windows.lifetime.clickPositionBreakdown["1"].sampleConfidence < 0.01);
});

test("search and collection opens add broad engagement without changing Browse exposure evidence", () => {
  const browseOnly = scoreShowPopularity(show("browse-only"), signals({
    lifetime: { "impression:browse:5-9": 100, "show_open:browse:5-9": 1 },
    days90: { "impression:browse:5-9": 100, "show_open:browse:5-9": 1 },
    days28: { "impression:browse:5-9": 100, "show_open:browse:5-9": 1 },
  }), NOW);
  const mixedSurfaces = scoreShowPopularity(show("mixed"), signals({
    lifetime: {
      "impression:browse:5-9": 100,
      "show_open:browse:5-9": 1,
      "show_open:search:1": 40,
      "show_open:collection:1": 40,
    },
    days90: {
      "impression:browse:5-9": 100,
      "show_open:browse:5-9": 1,
      "show_open:search:1": 40,
      "show_open:collection:1": 40,
    },
    days28: {
      "impression:browse:5-9": 100,
      "show_open:browse:5-9": 1,
      "show_open:search:1": 40,
      "show_open:collection:1": 40,
    },
  }), NOW);

  assert.equal(
    mixedSurfaces.components.windows.days28.clickRate,
    browseOnly.components.windows.days28.clickRate,
  );
  assert.ok(mixedSurfaces.components.windows.days28.showOpens > browseOnly.components.windows.days28.showOpens);
  assert.ok(mixedSurfaces.score > browseOnly.score);
  assert.equal(mixedSurfaces.components.windows.days28.surfaceBreakdown.search.opens, 40);
  assert.equal(mixedSurfaces.components.windows.days28.surfaceBreakdown.collection.opens, 40);
});

test("repeated long-term activity stays visible while stronger recent interest can rise", () => {
  const oldPopular = scoreShowPopularity(show("old"), signals({
    lifetime: {
      "impression:browse:5-9": 18_000,
      "show_open:browse:5-9": 1_200,
      show_page_view: 2_000,
      listen_click: 400,
      show_saved: 250,
    },
  }), NOW);
  const newlyActive = scoreShowPopularity(show("active"), signals({
    lifetime: {
      "impression:browse:5-9": 6_000,
      "show_open:browse:5-9": 900,
      show_page_view: 1_000,
      listen_click: 500,
      show_saved: 400,
    },
    days90: {
      "impression:browse:5-9": 6_000,
      "show_open:browse:5-9": 900,
      show_page_view: 1_000,
      listen_click: 500,
      show_saved: 400,
    },
    days28: {
      "impression:browse:5-9": 3_000,
      "show_open:browse:5-9": 600,
      show_page_view: 600,
      listen_click: 350,
      show_saved: 300,
    },
  }), NOW);

  assert.ok(oldPopular.score > 0);
  assert.ok(newlyActive.score > oldPopular.score);
  assert.equal(oldPopular.components.windows.days90.points, 0);
});

test("rating volume and Bayesian confidence outweigh a lone 10/10 without making quality the main score", () => {
  const onePerfectRating = scoreCommunity({ ratingCount: 1, ratingSum: 10 });
  const manyStrongRatings = scoreCommunity({ ratingCount: 400, ratingSum: 3_600 });

  assert.ok(manyStrongRatings.ratingVolumePoints > onePerfectRating.ratingVolumePoints);
  assert.ok(manyStrongRatings.points > onePerfectRating.points * 10);
  assert.ok(onePerfectRating.bayesianRating < 7.2);
  assert.ok(manyStrongRatings.points < 7);
});

test("malformed and absent analytics safely fall back to finite cold-start scores", () => {
  const result = scoreShowPopularity(show("malformed", { finalRating: "unknown", createdAt: "broken" }), {
    periods: { lifetime: { "impression:browse:1": "bad", "show_open:browse:1": -4, listen_click: null }, days90: null, days28: {} },
    community: { ratingCount: "many", ratingSum: "not a score", reviewCount: -2, helpfulVoteCount: null },
  }, NOW);

  assert.ok(Number.isFinite(result.score));
  assert.equal(result.score, 0);
  assert.equal(result.components.exposureConfidence, "none");
  assert.equal(scoreCommunity(null).points, 0);
  assert.ok(Number.isFinite(scoreShowPopularity(null, null, "bad-clock").score));
  const malformedSnapshot = scoreCatalogPopularity([show("safe")], null, "bad-clock");
  assert.equal(malformedSnapshot.generatedAt, "1970-01-01T00:00:00.000Z");
  assert.ok(Number.isFinite(malformedSnapshot.scores.safe));
});

test("equal popularity scores rank deterministically by title and stable id", () => {
  const catalog = [
    show("show-z", { title: "Same Title", createdAt: "2020-01-01T00:00:00.000Z" }),
    show("show-a", { title: "Same Title", createdAt: "2020-01-01T00:00:00.000Z" }),
  ];
  const result = scoreCatalogPopularity(catalog, {}, NOW);

  assert.equal(result.scores["show-a"], result.scores["show-z"]);
  assert.equal(result.diagnostics["show-a"].rank, 1);
  assert.equal(result.diagnostics["show-z"].rank, 2);
  assert.equal(result.diagnostics["show-a"].windowRanks.days28, 1);
  assert.equal(result.rankingHealth.zeroMeaningfulBehaviorPercent, 100);
  assert.equal(result.rankingHealth.primarilyColdStartRankedShows, 2);
});

test("composite ranking points can exceed 100 and are explicitly not a percentage", () => {
  const hugePeriod = {
    "impression:browse:1": 1_000_000_000,
    "show_open:browse:1": 1_000_000_000,
    show_page_view: 1_000_000_000,
    listen_click: 1_000_000_000,
    show_saved: 1_000_000_000,
    library_listening: 1_000_000_000,
    library_finished: 1_000_000_000,
    rating_submitted: 1_000_000_000,
    review_published: 1_000_000_000,
    helpful_vote: 1_000_000_000,
  };
  const result = scoreShowPopularity(show("upper-range", {
    finalRating: 10,
    createdAt: NOW.toISOString(),
    collectionIds: ["one", "two", "three"],
  }), signals({
    lifetime: hugePeriod,
    days90: hugePeriod,
    days28: hugePeriod,
    community: {
      ratingCount: 1_000_000_000,
      ratingSum: 10_000_000_000,
      reviewCount: 1_000_000_000,
      reviewRatingSum: 5_000_000_000,
      helpfulVoteCount: 1_000_000_000,
    },
  }), NOW);

  assert.ok(result.score > 100);
  assert.ok(result.score <= POPULARITY_SCORE_SEMANTICS.compositeMaximum);
  assert.ok(result.score > POPULARITY_SCORE_SEMANTICS.compositeMaximum - 0.001);
  assert.equal(POPULARITY_SCORE_SEMANTICS.behavioralMaximum, 100);
  assert.equal(POPULARITY_SCORE_SEMANTICS.communityMaximum, 9);
  assert.equal(POPULARITY_SCORE_SEMANTICS.coldStartMaximum, 3.15);
  assert.match(POPULARITY_SCORE_SEMANTICS.unit, /not a percentage/);
});

test("score snapshots are cached for the configured refresh interval and can be invalidated", () => {
  let now = new Date(NOW);
  let readCount = 0;
  const catalog = [show("cached")];
  const service = createPopularityService({
    analyticsStore: { getPopularitySignals: () => { readCount += 1; return { cached: signals() }; } },
    getCatalog: () => catalog,
    clock: () => now,
  });

  const first = service.getSnapshot();
  now = new Date(now.getTime() + POPULARITY_CONFIG.refreshIntervalMs - 1);
  assert.equal(service.getSnapshot(), first);
  assert.equal(readCount, 1);
  now = new Date(now.getTime() + 2);
  assert.notEqual(service.getSnapshot(), first);
  assert.equal(readCount, 2);
  service.invalidate();
  service.getSnapshot();
  assert.equal(readCount, 3);
});
