const test = require("node:test");
const assert = require("node:assert/strict");

const archiveSearch = require("../../shared/archive-search");
const discovery = require("../../shared/discovery");
const discoveryQuery = require("../../shared/discovery/query");
const runtime = require("../../shared/discovery/runtime");
const urlState = require("../../shared/discovery/url-state");

const shows = require("../../data/shows.json");
const searchCatalog = require("../../data/search-index.json");
const collections = require("../../data/collections.json");
const entities = require("../../catalog-src/entities.json");
const engine = discovery.createDiscoveryEngine({ shows, searchCatalog, collections, entities, catalogueRevision: "discovery-v2-tests" });

function hasValue(intent, group, key, value) {
  return intent[group][key].includes(value);
}

function everyReturnedHas(showResults, field, value) {
  return showResults.every((entry) => {
    const show = shows.find((candidate) => candidate.id === entry.id);
    const actual = Array.isArray(show?.[field]) ? show[field] : [show?.[field]];
    return actual.includes(value);
  });
}

test("exact title and alias identity precede taxonomy, while reviewed partial and typo matches stay bounded", () => {
  const title = engine.parse("The Horror of Dolores Roach");
  assert.equal(title.kind, "title-identity");
  assert.equal(title.identity.id, "the-horror-of-dolores-roach");
  assert.deepEqual(title.required.genreIds, []);

  const alias = engine.parse("We Open at Six");
  assert.equal(alias.kind, "title-alias");
  assert.equal(alias.identity.id, "midnight-burger");
  assert.equal(alias.identity.matchedText, "We Open at Six");

  assert.equal(engine.parse("We're Alive").identity.id, "were-alive");
  assert.equal(engine.parse("We’re Alive").identity.id, "were-alive");
  assert.equal(engine.parse("Rosannas Secret").identity.id, "rosannas-secret");
  assert.equal(engine.parse("Midnight Burg").identity.id, "midnight-burger");

  const typo = engine.retrieve("Midnight Buger");
  assert.equal(typo.intent.kind, "bounded-typo");
  assert.equal(typo.intent.identity.id, "midnight-burger");
  assert.equal(typo.intent.query, "Midnight Buger");
});

test("taxonomy collisions and aliases are typed without reinterpreting exact titles", () => {
  const horror = engine.parse("horror");
  assert.equal(horror.kind, "genre-query");
  assert.ok(hasValue(horror, "required", "genreIds", "horror"));
  assert.equal(horror.ambiguities[0].kind, "taxonomy-title-collision");

  const sciFi = engine.parse("sci fi");
  assert.equal(sciFi.kind, "genre-query");
  assert.deepEqual(sciFi.required.genreIds, ["sci-fi"]);
  assert.deepEqual(engine.parse("full cast").required.formatIds, ["full-cast"]);
});

test("genre, format, lifecycle, context, and commitment criteria are catalogue-backed", () => {
  const finishedScifi = engine.retrieve("finished sci-fi");
  assert.ok(hasValue(finishedScifi.intent, "required", "catalogueStatusIds", "finished"));
  assert.ok(hasValue(finishedScifi.intent, "required", "genreIds", "sci-fi"));
  assert.ok(everyReturnedHas(finishedScifi.sections.shows, "genres", "sci-fi"));
  assert.ok(finishedScifi.sections.shows.every((entry) => shows.find((show) => show.id === entry.id)?.completionStatus === "finished"));

  const mysteryCast = engine.retrieve("full cast mystery");
  assert.deepEqual(mysteryCast.intent.required.formatIds, ["full-cast"]);
  assert.deepEqual(mysteryCast.intent.required.genreIds, ["mystery"]);
  assert.ok(everyReturnedHas(mysteryCast.sections.shows, "formats", "full-cast"));

  const shortFinished = engine.parse("short finished show");
  assert.equal(shortFinished.kind, "facet-search");
  assert.ok(hasValue(shortFinished, "required", "catalogueStatusIds", "finished"));
  assert.ok(hasValue(shortFinished, "preferred", "commitmentIds", "short"));

  const coldHorror = engine.parse("cold isolation horror");
  assert.ok(hasValue(coldHorror, "required", "genreIds", "horror"));
  assert.ok(hasValue(coldHorror, "required", "bestForIds", "cold-isolation-horror"));

  const longWalk = engine.retrieve("shows for a long walk");
  assert.ok(hasValue(longWalk.intent, "preferred", "bestForIds", "long-walks"));
  assert.ok(longWalk.sections.shows.slice(0, 5).every((entry) => entry.evidence.some((item) => item.field === "bestFor" && item.value === "long-walks")));
});

test("explicit tag and theme vocabulary is accepted only through known catalogue tokens", () => {
  const maps = discoveryQuery.createFacetMaps(searchCatalog);
  const knownTag = [...maps.get("tagIds").keys()][0];
  const knownTheme = [...maps.get("themeIds").keys()][0];
  const knownTagIntent = engine.parse(`tag:${knownTag}`);
  assert.deepEqual(knownTagIntent.required.tagIds, [knownTag]);
  const knownThemeIntent = engine.parse(`theme:${knownTheme}`);
  assert.deepEqual(knownThemeIntent.required.themeIds, [knownTheme]);
  const unknown = engine.parse("tag:not-a-catalogue-tag");
  assert.deepEqual(unknown.required.tagIds, []);
  assert.ok(unknown.residual.unresolvedPhrases.length > 0);
});

test("hard conjunctions and explicit exclusions filter candidates instead of merely reducing rank", () => {
  const result = engine.retrieve("sci-fi but not comedy");
  assert.equal(result.intent.kind, "facet-search");
  assert.deepEqual(result.intent.required.genreIds, ["sci-fi"]);
  assert.deepEqual(result.intent.avoid.genreIds, ["comedy"]);
  assert.ok(everyReturnedHas(result.sections.shows, "genres", "sci-fi"));
  assert.ok(result.sections.shows.every((entry) => !shows.find((show) => show.id === entry.id)?.genres?.includes("comedy")));
  assert.ok(result.applied.exclusions.some((entry) => entry.key === "genreIds" && entry.value === "comedy"));
});

test("similarity seed plus hard modifier reuses both existing similarity pathways without weakening gates", () => {
  const result = engine.retrieve("something like The White Vault but sci-fi");
  assert.equal(result.intent.kind, "similarity");
  assert.equal(result.intent.identity.id, "the-white-vault");
  assert.deepEqual(result.intent.required.genreIds, ["sci-fi"]);
  assert.ok(!result.candidateIds.includes("the-white-vault"));
  assert.ok(!result.candidateIds.includes("the-harrowing"));
  assert.ok(everyReturnedHas([...result.sections.authoredSimilarity, ...result.sections.computedSimilarity], "genres", "sci-fi"));
  assert.ok(result.sections.authoredSimilarity.every((entry) => entry.provenance.kind === "authored" && entry.evidence[0].kind === "authored-similarity"));
  assert.ok(result.sections.computedSimilarity.every((entry) => entry.provenance.kind === "computed" && entry.evidence[0].kind === "computed-similarity"));

  const oldSimpleQuery = engine.retrieve("Midnight Burger");
  assert.equal(oldSimpleQuery.retrievalTrace.mode, "archive-search");
  assert.equal(oldSimpleQuery.retrievalTrace.usedSimilarity, false);
  assert.equal(oldSimpleQuery.candidateIds[0], "midnight-burger");
});

test("comparative subjective modifiers remain visible and do not become fabricated scales", () => {
  const darker = engine.retrieve("like Midnight Burger but darker");
  assert.equal(darker.intent.identity.id, "midnight-burger");
  assert.ok(darker.unresolvedPhrases.includes("darker"));
  assert.deepEqual(darker.intent.preferred.toneIds, []);

  const funny = engine.retrieve("funny like Midnight Burger but less chaotic");
  assert.equal(funny.intent.identity.id, "midnight-burger");
  assert.ok(funny.intent.preferred.toneIds.includes("funny"));
  assert.ok(funny.unresolvedPhrases.includes("less chaotic"));
});

test("typed entity relationships never substitute an organization for people", () => {
  const people = engine.retrieve("people behind The White Vault");
  assert.equal(people.intent.entityResolution.seedShowId, "the-white-vault");
  assert.deepEqual(people.intent.entityResolution.requestedRoles, ["creator"]);
  assert.deepEqual(people.sections.entities.map((entry) => entry.id).sort(), ["k-a-statz", "travis-vengroff"]);
  assert.ok(people.sections.entities.every((entry) => entry.role === "creator" && entry.provenance.source === "entityLinks"));
  assert.ok(people.sections.shows.every((entry) => entry.evidence[0].kind === "typed-relationship"));

  const mini = discovery.createDiscoveryEngine({
    catalogueRevision: "entity-role-fixture",
    shows: [
      { id: "org-only", title: "Org Only", status: "published", genres: [], entityLinks: [{ entityId: "studio-1", role: "studio" }] },
      { id: "co-mention", title: "Studio One Stories", status: "published", genres: [], description: "A show that mentions Studio One but has no typed relationship.", entityLinks: [] },
    ],
    searchCatalog: [
      { id: "org-only", title: "Org Only", status: "published", genres: [], entityLinks: [{ entityId: "studio-1", role: "studio" }] },
      { id: "co-mention", title: "Studio One Stories", status: "published", genres: [], description: "A show that mentions Studio One but has no typed relationship.", entityLinks: [] },
    ],
    entities: [{ id: "studio-1", name: "Studio One", type: "studio", publication: "public" }],
    collections: [],
  });
  const noPeople = mini.retrieve("people behind Org Only");
  assert.deepEqual(noPeople.sections.entities, []);
  assert.deepEqual(noPeople.intent.entityResolution.entityIds, []);
  assert.ok(noPeople.limitations.some((entry) => entry.code === "no-explicit-people-link"));
  const studio = mini.retrieve("Studio One");
  assert.deepEqual(studio.sections.shows.map((entry) => entry.id), ["org-only"]);
  assert.ok(studio.sections.shows[0].evidence.some((entry) => entry.kind === "typed-relationship" && entry.role === "studio"));
});

test("collections remain editorial routes, separate from show similarity candidates", () => {
  const exact = engine.retrieve("Best for long walks", { surface: "collections-search" });
  assert.equal(exact.intent.kind, "authored-collection-route");
  assert.deepEqual(exact.sections.collections.map((entry) => entry.id), ["best-for-long-walks"]);
  assert.equal(exact.sections.collections[0].provenance.kind, "authored-collection");
  assert.deepEqual(exact.sections.shows, []);

  const intent = engine.retrieve("long walks", { surface: "collections-search" });
  assert.equal(intent.intent.kind, "collection-intent");
  assert.ok(intent.sections.collections.some((entry) => entry.id === "best-for-long-walks"));
  assert.ok(intent.sections.collections.every((entry) => entry.evidence[0].kind === "collection-route"));

  const similarityCollection = engine.retrieve("Shows like The White Vault", { surface: "collections-search" });
  assert.equal(similarityCollection.sections.collections[0].collectionType, "similarity");
  assert.equal(similarityCollection.sections.collections[0].anchorShowId, "the-white-vault");
});

test("runtime evidence distinguishes observed scope, estimates, and unknown values", () => {
  const redValley = runtime.getRuntimeEvidence(shows.find((show) => show.id === "red-valley"));
  assert.equal(redValley.kind, "observed-exact");
  assert.equal(redValley.hours, 10.9);
  assert.match(redValley.scope, /completion is unclear/);

  const midnightBurger = runtime.getRuntimeEvidence(shows.find((show) => show.id === "midnight-burger"));
  assert.equal(midnightBurger.kind, "derived-estimate");
  assert.equal(midnightBurger.hours, 78.8);
  assert.deepEqual(midnightBurger.basis, { episodeCount: 105, averageEpisodeMinutes: 45 });
  assert.match(runtime.explainRuntime(midnightBurger).text, /Estimated runtime/);

  const case63 = runtime.getRuntimeEvidence(shows.find((show) => show.id === "case-63"));
  assert.equal(case63.kind, "unknown");
  assert.equal(case63.hours, null);
});

test("around-hour preferences sort comparable runtime first and keep estimates qualified", () => {
  const observed = engine.retrieve("around 10.9 hours");
  assert.equal(observed.intent.kind, "runtime-preference");
  assert.deepEqual(observed.intent.preferred.runtimeTargetHours, { hours: 10.9, mode: "around", strength: "soft" });
  assert.equal(observed.sections.shows[0].id, "red-valley");
  assert.equal(observed.sections.shows[0].runtime.kind, "observed-exact");

  const estimate = engine.retrieve("around 79 hours");
  assert.equal(estimate.sections.shows[0].id, "midnight-burger");
  assert.equal(estimate.sections.shows[0].runtime.kind, "derived-estimate");
  assert.match(estimate.sections.shows[0].runtime.scope, /Estimated/);

  const bounded = engine.retrieve("under 4 hours");
  assert.ok(bounded.sections.shows.length > 0);
  assert.ok(bounded.sections.shows.every((entry) => entry.runtime.kind !== "unknown" && entry.runtime.hours < 4));
});

test("unknown runtime and season-count ambiguity are explicit, never converted to hours", () => {
  const lookup = engine.retrieve("exact runtime for Case 63");
  assert.equal(lookup.sections.shows[0].runtime.kind, "unknown");
  assert.ok(lookup.unresolvedPhrases.includes("exact runtime"));

  const ambiguous = engine.retrieve("finished sci-fi about one season long");
  assert.equal(ambiguous.intent.kind, "ambiguous-runtime");
  assert.ok(ambiguous.ambiguities[0].alternatives.some((entry) => entry.kind === "catalogue-season-count"));
  assert.ok(ambiguous.ambiguities[0].alternatives.some((entry) => entry.kind === "runtime-preference"));
  assert.ok(ambiguous.unresolvedPhrases.includes("one season long"));
  assert.equal(ambiguous.intent.preferred.runtimeTargetHours, null);
});

test("unsupported compounds remain visible and strict no-match does not silently broaden", () => {
  const result = engine.retrieve("experimental lighthouse mystery with a silent cast");
  assert.equal(result.intent.kind, "unresolved-compound-request");
  assert.ok(result.unresolvedPhrases.includes("experimental lighthouse"));
  assert.ok(result.unresolvedPhrases.includes("silent cast"));
  assert.equal(result.outcome, "no-results");
  assert.ok(result.limitations.some((entry) => entry.code === "no-supported-results"));
  assert.ok(!result.candidateIds.length);
});

test("public URL state round-trips deterministically and strips Library-only state", () => {
  const intent = engine.parse("finished sci-fi around 10 hours");
  const firstUrl = urlState.serializePublicUrlState(intent);
  const parsed = urlState.parsePublicDiscoveryUrl(firstUrl);
  assert.equal(parsed.query, intent.query);
  assert.deepEqual(parsed.filters.genres, ["sci-fi"]);
  assert.deepEqual(parsed.filters.completionStatus, ["finished"]);
  assert.deepEqual(parsed.filters.runtimeTargetHours, { hours: 10, mode: "around", strength: "soft" });
  assert.equal(urlState.serializePublicUrlState(parsed), firstUrl);

  const seedUrl = urlState.serializePublicUrlState({
    pathname: "/",
    query: "something like The White Vault but sci-fi",
    identity: { kind: "show", id: "the-white-vault", match: "seed" },
    required: { genreIds: ["sci-fi"] },
    preferred: {}, avoid: {}, sort: "default",
  });
  assert.match(seedUrl, /seed=the-white-vault/);
  assert.match(seedUrl, /genre=sci-fi/);
  assert.equal(urlState.serializePublicUrlState(urlState.parsePublicDiscoveryUrl(seedUrl)), seedUrl);

  const collectionIntent = urlState.serializePublicUrlState(engine.parse("long walks", { surface: "collections-search" }));
  assert.match(collectionIntent, /^\/collections\?/);
  assert.match(collectionIntent, /intent=long-walks/);
  assert.equal(urlState.serializePublicUrlState(urlState.parsePublicDiscoveryUrl(collectionIntent)), collectionIntent);

  const entityIntent = urlState.serializePublicUrlState(engine.parse("QCODE", { surface: "entity-search" }));
  assert.match(entityIntent, /^\/creators\?/);
  assert.match(entityIntent, /entity=qcode/);
  assert.match(entityIntent, /type=production-company/);
  assert.equal(urlState.serializePublicUrlState(urlState.parsePublicDiscoveryUrl(entityIntent)), entityIntent);

  const privateUrl = urlState.serializePublicUrlState({ query: "shows I've finished", personalIntent: { kind: "library-status", status: "finished", scope: "local-only" }, url: { pathname: "/", params: [], hash: "" } });
  assert.equal(privateUrl, "/");
  const underRange = urlState.serializePublicUrlState(engine.parse("under 4 hours"));
  assert.match(underRange, /runtimeMaxExclusive=true/);
  assert.equal(urlState.parsePublicDiscoveryUrl(underRange).filters.runtimeHours.maxExclusive, true);
  assert.equal(urlState.serializePublicUrlState(urlState.parsePublicDiscoveryUrl(underRange)), underRange);
  const untrusted = urlState.parsePublicDiscoveryUrl("/?q=sci-fi&hidden=midnight-burger&rating=5&personalDiscovery=1&privateAnchor=midnight-burger");
  assert.deepEqual(untrusted.params.map((entry) => entry.name), ["q"]);
  assert.equal(JSON.stringify(untrusted).includes("privateAnchor"), false);
  assert.equal(JSON.stringify(untrusted).includes("personalDiscovery"), false);
});

test("public retrieval is unchanged without enabled, sanitized Personal Discovery context", () => {
  const baseline = engine.retrieve("finished sci-fi");
  const disabled = engine.retrieve("finished sci-fi", { personalContext: { enabled: false, entries: [{ showId: "midnight-burger", state: "hidden" }] } });
  const enabledWithoutLayer = engine.retrieve("finished sci-fi", { personalContext: { enabled: true, entries: [{ showId: "midnight-burger", state: "hidden" }] } });
  assert.deepEqual(disabled, baseline);
  assert.deepEqual(enabledWithoutLayer, baseline);

  let receivedContext = null;
  const withLayer = engine.retrieve("finished sci-fi", {
    personalContext: { enabled: true, entries: [{ showId: "midnight-burger", state: "finished", rating: 5 }, { showId: "missing", state: "hidden" }, { showId: "solar", state: "invalid" }] },
    personalize({ publicResult, personalContext }) {
      receivedContext = personalContext;
      return { ...publicResult, personalizationApplied: false };
    },
  });
  assert.deepEqual(receivedContext.entries, [{ showId: "midnight-burger", state: "finished", rating: 5 }]);
  assert.equal(withLayer.personalizationApplied, false);
  assert.deepEqual(withLayer.candidateIds, baseline.candidateIds);
});

test("cached public parsing, retrieval, and lazy similarity indexing are deterministic", () => {
  const query = "something like The White Vault but sci-fi";
  const first = engine.retrieve(query);
  const second = engine.retrieve(query);
  assert.deepEqual(second, first);
  assert.equal(engine.getSimilarityIndex(), engine.getSimilarityIndex());

  const otherRevision = discovery.createDiscoveryEngine({ shows, searchCatalog, collections, entities, catalogueRevision: "different-catalogue-revision" });
  assert.notEqual(engine.catalogueRevision, otherRevision.catalogueRevision);
  assert.deepEqual(otherRevision.parse(query), engine.parse(query));
});

test("plain archive-search identity behavior stays unchanged", () => {
  const baseline = archiveSearch.scoreCatalog(archiveSearch.hydrateCatalogSearch(searchCatalog), "Midnight Burger");
  const current = engine.retrieve("Midnight Burger");
  assert.equal(baseline[0].id, current.candidateIds[0]);
  assert.equal(current.intent.kind, "title-identity");
  assert.equal(current.retrievalTrace.usedSimilarity, false);
});
