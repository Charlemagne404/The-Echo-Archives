const test = require("node:test");
const assert = require("node:assert/strict");

const discovery = require("../../shared/discovery");
const shows = require("../../data/shows.json");
const searchCatalog = require("../../data/search-index.json");
const collections = require("../../data/collections.json");
const entities = require("../../catalog-src/entities.json");

const engine = discovery.createDiscoveryEngine({
  shows,
  searchCatalog,
  collections,
  entities,
  catalogueRevision: "discovery-personalization-tests",
});
const similarityIndex = engine.getSimilarityIndex();
const showById = new Map(shows.map((show) => [show.id, show]));
const personalizationModule = import("../../shared/app/discovery-personalization.js");

function makeResult(query, ids) {
  const result = engine.retrieve(query);
  const byId = new Map(result.sections.shows.map((entry) => [entry.id, entry]));
  assert.ok(ids.every((id) => byId.has(id)), "fixtures must come from the ordinary eligible retrieval result");
  const sections = { ...result.sections, shows: ids.map((id) => byId.get(id)) };
  return { ...result, sections, candidateIds: ids.slice() };
}

function makePersonalContext(state, rating) {
  const entry = { showId: "ars-paradoxica", state };
  if (rating !== undefined) entry.rating = rating;
  return { enabled: true, entries: [entry] };
}

async function getSearchPersonalizer(scope = "search") {
  const { createPersonalDiscoveryPersonalizer: create } = await personalizationModule;
  return create({ shows, similarityIndex, scope });
}

function getReorderFixture() {
  const result = engine.retrieve("sci-fi");
  const matches = similarityIndex.getPublicSimilarityMatches("ars-paradoxica", {
    limit: 50,
    maximumResults: 50,
    diversify: false,
  });
  const eligibleIds = new Set(matches.map((entry) => entry.show.id));
  const matched = result.sections.shows.find((entry) => eligibleIds.has(entry.id));
  assert.ok(matched, "the anchor should have at least one public-similarity match among eligible sci-fi results");
  const unmatched = result.sections.shows.filter((entry) => !eligibleIds.has(entry.id)).slice(0, 2);
  assert.equal(unmatched.length, 2);
  return { matched: matched.id, unmatched: unmatched.map((entry) => entry.id) };
}

test("Saved and Listening weakly prefer only candidates passing public similarity evidence", async () => {
  const personalize = await getSearchPersonalizer();
  const fixture = getReorderFixture();
  const order = [...fixture.unmatched, fixture.matched];
  const baseline = makeResult("sci-fi", order);

  for (const state of ["saved", "listening"]) {
    const result = personalize({ publicResult: baseline, personalContext: makePersonalContext(state), intent: baseline.intent });
    assert.deepEqual(result.sections.shows.map((entry) => entry.id), [fixture.unmatched[0], fixture.matched, fixture.unmatched[1]]);
    const reason = result.sections.shows.find((entry) => entry.id === fixture.matched).personalizationReason;
    assert.match(reason, /shares .+ with Ars Paradoxica \((?:saved|listening)\)\./i);
    assert.equal(result.candidateIds.length, baseline.candidateIds.length);
  }
});

test("explicit private ratings use 5/4 positive, 3 neutral, and 1/2 negative signals", async () => {
  const personalize = await getSearchPersonalizer();
  const fixture = getReorderFixture();
  const positiveOrder = [...fixture.unmatched, fixture.matched];
  const positiveBase = makeResult("sci-fi", positiveOrder);

  for (const rating of [4, 5]) {
    const result = personalize({ publicResult: positiveBase, personalContext: makePersonalContext("finished", rating), intent: positiveBase.intent });
    assert.equal(result.sections.shows[0].id, fixture.matched, `rating ${rating} should bring a qualified match forward`);
    assert.match(result.sections.shows[0].personalizationReason, new RegExp(`Ars Paradoxica \\(rated ${rating}/5\\)`));
  }

  const neutral = personalize({ publicResult: positiveBase, personalContext: makePersonalContext("saved", 3), intent: positiveBase.intent });
  assert.strictEqual(neutral, positiveBase, "a private rating of 3 is neutral, including on a Saved entry");

  const negativeOrder = [fixture.matched, ...fixture.unmatched];
  const negativeBase = makeResult("sci-fi", negativeOrder);
  for (const rating of [1, 2]) {
    const result = personalize({ publicResult: negativeBase, personalContext: makePersonalContext("finished", rating), intent: negativeBase.intent });
    assert.equal(result.sections.shows.at(-1).id, fixture.matched, `rating ${rating} should lower a qualified match`);
    assert.match(result.sections.shows.at(-1).personalizationReason, new RegExp(`Placed lower because it shares .+ with Ars Paradoxica \\(rated ${rating}/5\\)`));
  }

  const droppedWithExplicitLowRating = personalize({
    publicResult: negativeBase,
    personalContext: makePersonalContext("dropped", 1),
    intent: negativeBase.intent,
  });
  assert.equal(droppedWithExplicitLowRating.sections.shows.at(-1).id, fixture.matched, "an explicit low rating can be a negative anchor even when the show was dropped");
});

test("Finished has no positive signal and only excludes the exact show in new-to-you context", async () => {
  const searchPersonalize = await getSearchPersonalizer("search");
  const fixture = getReorderFixture();
  const baseline = makeResult("sci-fi", [fixture.unmatched[0], fixture.matched]);
  const finishedOnly = { enabled: true, entries: [{ showId: "ars-paradoxica", state: "finished" }] };
  assert.strictEqual(searchPersonalize({ publicResult: baseline, personalContext: finishedOnly, intent: baseline.intent }), baseline);

  const newToYouPersonalize = await getSearchPersonalizer("new-to-you");
  const withAnchor = makeResult("sci-fi", ["ars-paradoxica", fixture.matched]);
  const filtered = newToYouPersonalize({ publicResult: withAnchor, personalContext: finishedOnly, intent: withAnchor.intent });
  assert.deepEqual(filtered.sections.shows.map((entry) => entry.id), [fixture.matched]);
  assert.deepEqual(filtered.candidateIds, [fixture.matched]);
});

test("Dropped suppresses only its exact show in recommendation contexts and is not a negative anchor", async () => {
  const searchPersonalize = await getSearchPersonalizer("search");
  const recommendationPersonalize = await getSearchPersonalizer("recommendations");
  const fixture = getReorderFixture();
  const baseline = makeResult("sci-fi", ["ars-paradoxica", fixture.matched, fixture.unmatched[0]]);
  const dropped = { enabled: true, entries: [{ showId: "ars-paradoxica", state: "dropped" }] };

  assert.strictEqual(searchPersonalize({ publicResult: baseline, personalContext: dropped, intent: baseline.intent }), baseline);
  const result = recommendationPersonalize({ publicResult: baseline, personalContext: dropped, intent: baseline.intent });
  assert.deepEqual(result.sections.shows.map((entry) => entry.id), [fixture.matched, fixture.unmatched[0]]);
  assert.deepEqual(result.candidateIds, [fixture.matched, fixture.unmatched[0]]);
  assert.equal(result.sections.shows.some((entry) => entry.personalizationReason), false);
});

test("Hidden suppresses only the exact show while enabled; explicit title identity remains findable", async () => {
  const personalize = await getSearchPersonalizer();
  const hidden = { enabled: true, entries: [{ showId: "ars-paradoxica", state: "hidden" }] };
  const broad = makeResult("sci-fi", ["ars-paradoxica", "vast-horizon", "the-far-meridian"]);
  const filtered = personalize({ publicResult: broad, personalContext: hidden, intent: broad.intent });
  assert.deepEqual(filtered.sections.shows.map((entry) => entry.id), ["vast-horizon", "the-far-meridian"]);

  const direct = engine.retrieve("Ars Paradoxica");
  const exact = personalize({ publicResult: direct, personalContext: hidden, intent: direct.intent });
  assert.ok(exact.sections.shows.some((entry) => entry.id === "ars-paradoxica"));
});

test("Disabled and cleared context preserve exact public results and order", async () => {
  const personalize = await getSearchPersonalizer();
  const baseline = engine.retrieve("sci-fi");
  const disabled = personalize({
    publicResult: baseline,
    personalContext: { enabled: false, entries: [{ showId: "ars-paradoxica", state: "hidden" }] },
    intent: baseline.intent,
  });
  const cleared = personalize({ publicResult: baseline, personalContext: { enabled: true, entries: [] }, intent: baseline.intent });
  assert.strictEqual(disabled, baseline);
  assert.strictEqual(cleared, baseline);

  const engineDisabled = engine.retrieve("sci-fi", {
    personalContext: { enabled: false, entries: [{ showId: "ars-paradoxica", state: "hidden" }] },
    personalize,
  });
  assert.deepEqual(engineDisabled, baseline);
});

test("repeated Personal Discovery with hundreds of anchors reuses bounded candidate matches", async () => {
  const { createPersonalDiscoveryPersonalizer: create } = await personalizationModule;
  const libraryShows = Array.from({ length: 102 }, (_, index) => ({
    id: `library-anchor-${index}`,
    title: `Library anchor ${index}`,
  }));
  const showsForCandidates = [
    { id: "candidate-a", title: "Candidate A" },
    { id: "candidate-b", title: "Candidate B" },
  ];
  let similarityLookups = 0;
  const personalized = create({
    shows: [...libraryShows, ...showsForCandidates],
    scope: "search",
    similarityIndex: {
      compare: () => ({ dimensions: [] }),
      getPublicSimilarityMatches: () => {
        similarityLookups += 1;
        return [];
      },
    },
  });
  const baseline = {
    candidateIds: ["candidate-a", "candidate-b"],
    intent: { kind: "facet-search", surface: "search" },
    outcome: "results",
    sections: {
      shows: [{ id: "candidate-a" }, { id: "candidate-b" }],
      authoredSimilarity: [],
      computedSimilarity: [],
      collections: [],
      entities: [],
    },
  };
  const personalContext = {
    enabled: true,
    entries: libraryShows.map((show, index) => ({
      showId: show.id,
      state: index % 2 === 0 ? "saved" : "listening",
    })),
  };

  const first = personalized({ publicResult: baseline, personalContext, intent: baseline.intent });
  const lookupsAfterWarmup = similarityLookups;
  const repeated = personalized({ publicResult: baseline, personalContext, intent: baseline.intent });

  assert.deepEqual(first.candidateIds, baseline.candidateIds);
  assert.deepEqual(repeated.candidateIds, baseline.candidateIds);
  assert.equal(lookupsAfterWarmup, personalContext.entries.length);
  assert.equal(similarityLookups, lookupsAfterWarmup, "a repeated query should reuse each anchor's cached public matches");
});

test("hard requirements and exclusions remain authoritative; personalization never adds candidates", async () => {
  const personalize = await getSearchPersonalizer();
  const baseline = engine.retrieve("sci-fi but not comedy");
  const result = engine.retrieve("sci-fi but not comedy", {
    personalContext: { enabled: true, entries: [{ showId: "midnight-burger", state: "saved", rating: 5 }] },
    personalize,
  });
  const originalIds = new Set(baseline.candidateIds);
  assert.ok(result.candidateIds.every((id) => originalIds.has(id)));
  for (const entry of result.sections.shows) {
    const show = showById.get(entry.id);
    assert.ok(show.genres.includes("sci-fi"));
    assert.equal(show.genres.includes("comedy"), false);
  }
});

test("authored similarity identity and order stay editorial; personal reasons expose evidence, not scores", async () => {
  const personalize = await getSearchPersonalizer("try-next");
  const baseline = engine.retrieve("something like The White Vault");
  assert.ok(baseline.sections.authoredSimilarity.length > 0);
  assert.ok(baseline.sections.computedSimilarity.length > 0);
  const hiddenAuthoredId = baseline.sections.authoredSimilarity[0].id;
  const entries = [
    { showId: hiddenAuthoredId, state: "hidden" },
    { showId: "ars-paradoxica", state: "listening", rating: 5 },
  ];
  const result = personalize({ publicResult: baseline, personalContext: { enabled: true, entries }, intent: baseline.intent });
  assert.deepEqual(result.sections.authoredSimilarity.map((entry) => entry.id), baseline.sections.authoredSimilarity.slice(1).map((entry) => entry.id));
  assert.ok(result.sections.computedSimilarity.every((entry) => entry.provenance.kind === "computed"));
  const explained = [...result.sections.shows, ...result.sections.computedSimilarity].find((entry) => entry.personalizationReason);
  if (explained) {
    assert.match(explained.personalizationReason, /(?:tone|themes|tags|listening context|voice style|narrative focus|intensity|commitment)/i);
    assert.match(explained.personalizationReason, /Ars Paradoxica \(rated 5\/5\)/i);
    assert.doesNotMatch(explained.personalizationReason, /score|weight|confidence/i);
  }
});

test("creator/entity and collection results are not personalized", async () => {
  const personalize = await getSearchPersonalizer();
  const entityResult = engine.retrieve("QCODE");
  const hidden = { enabled: true, entries: [{ showId: entityResult.sections.shows[0]?.id || "midnight-burger", state: "hidden" }] };
  assert.strictEqual(personalize({ publicResult: entityResult, personalContext: hidden, intent: entityResult.intent }), entityResult);

  const collectionResult = engine.retrieve("Best for long walks", { surface: "collections-search" });
  assert.strictEqual(personalize({ publicResult: collectionResult, personalContext: hidden, intent: collectionResult.intent }), collectionResult);
});

test("candidate-scoped public similarity keeps the public gates and does not poison the full-result cache", () => {
  const scopedIndex = discovery.createDiscoveryEngine({
    shows,
    searchCatalog,
    collections,
    entities,
    catalogueRevision: "discovery-personalization-scoped-similarity",
  }).getSimilarityIndex();
  const options = { limit: 20, maximumResults: 20, diversify: false };
  const ordinaryMatches = scopedIndex.getPublicSimilarityMatches("ars-paradoxica", options);
  assert.ok(ordinaryMatches.length > 1, "fixture anchor needs multiple eligible public matches");

  const scopedMatch = ordinaryMatches[0];
  const scopedMatches = scopedIndex.getPublicSimilarityMatches("ars-paradoxica", {
    ...options,
    precomputedCandidates: [{
      show: scopedMatch.show,
      similarity: scopedIndex.compare("ars-paradoxica", scopedMatch.show.id),
    }],
  });
  assert.deepEqual(scopedMatches.map((entry) => entry.show.id), [scopedMatch.show.id]);

  const ordinaryMatchesAfterScopedCall = scopedIndex.getPublicSimilarityMatches("ars-paradoxica", options);
  assert.deepEqual(
    ordinaryMatchesAfterScopedCall.map((entry) => entry.show.id),
    ordinaryMatches.map((entry) => entry.show.id),
  );
});
