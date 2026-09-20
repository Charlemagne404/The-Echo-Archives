const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const archiveSearch = require("../../shared/archive-search");

const searchIndexPath = path.resolve(__dirname, "../../data/search-index.json");

function loadSearchCatalog() {
  const records = JSON.parse(fs.readFileSync(searchIndexPath, "utf8"));
  return archiveSearch.hydrateCatalogSearch(records);
}

function createSearchRecord(overrides = {}) {
  return {
    id: "fixture-show",
    title: "Fixture Show",
    description: "A source-backed fixture description.",
    status: "published",
    reviewStatus: "indexed-only",
    completionStatus: "finished",
    creators: [],
    aliases: [],
    genres: [],
    tones: [],
    formats: [],
    tags: [],
    themes: [],
    bestFor: [],
    contentNotes: [],
    languages: [],
    transcriptLanguages: [],
    similarTo: [],
    similarReasons: {},
    credits: {},
    facts: {},
    content: {},
    availability: {},
    ...overrides,
  };
}

test("public search keeps title identity ahead of weak metadata", () => {
  const catalog = archiveSearch.hydrateCatalogSearch([
    createSearchRecord({
      id: "metadata-signal",
      title: "Other Signal Show",
      description: "A story about signal and the night sky.",
      tags: ["Signal"],
    }),
    createSearchRecord({
      id: "direct-signal",
      title: "Signal",
    }),
  ]);

  const results = archiveSearch.scoreCatalog(catalog, "signal");
  assert.equal(results[0].id, "direct-signal");
  assert.equal(results[0].searchMatchTier, 5);
  assert.ok(results.find((result) => result.id === "metadata-signal").searchMatchTier < results[0].searchMatchTier);
});

test("title normalization covers Unicode, punctuation, apostrophes, and common prefixes", () => {
  const catalog = loadSearchCatalog();
  const cases = [
    ["Derelict", "derelict"],
    ["Dérélìct", "derelict"],
    ["D.E.R.E.L.I.C.T", "derelict"],
    ["Rosanna’s Secret", "rosannas-secret"],
    ["Rosannas Secret", "rosannas-secret"],
    ["Rosanna s Secret", "rosannas-secret"],
    ["Hindsight: The Fracture", "hindsight-the-fracture"],
    ["White Vault", "the-white-vault"],
  ];

  cases.forEach(([query, expectedId]) => {
    const [result] = archiveSearch.scoreCatalog(catalog, query);
    assert.equal(result?.id, expectedId, `${query} should resolve to ${expectedId}`);
  });

  assert.equal(archiveSearch.normalizeText("Beyoncé — 東京"), "beyonce 東京");
});

test("creator, production company, and network identity fields rank above title-adjacent metadata", () => {
  const catalog = loadSearchCatalog();

  const qcodeResults = archiveSearch.scoreCatalog(catalog, "QCODE");
  assert.equal(qcodeResults[0].id, "from-now");
  assert.match(qcodeResults[0].searchPresentation.metaText, /^Production company:\s*QCODE$/i);

  const curtcoResults = archiveSearch.scoreCatalog(catalog, "CurtCo Media");
  assert.equal(curtcoResults[0].id, "solar");
  assert.match(curtcoResults[0].searchPresentation.metaText, /^Production company:\s*CurtCo Media$/i);

  const bloodyResults = archiveSearch.scoreCatalog(catalog, "Bloody FM");
  assert.notEqual(bloodyResults[0]?.id, "blood-gold");
  assert.equal(bloodyResults[0]?.searchMatchTier, 4);
  assert.match(bloodyResults[0]?.searchPresentation.metaText || "", /^(?:Network|Production company):\s*Bloody FM$/i);
});

test("supported genre and tag metadata remains searchable below direct titles", () => {
  const catalog = archiveSearch.hydrateCatalogSearch([
    createSearchRecord({
      id: "genre-match",
      title: "The Quiet Archive",
      genres: ["Horror"],
      tags: ["Vampires"],
      themes: ["Isolation"],
    }),
    createSearchRecord({
      id: "direct-genre-title",
      title: "Horror",
    }),
  ]);

  const genreResults = archiveSearch.scoreCatalog(catalog, "horror");
  assert.equal(genreResults[0].id, "direct-genre-title");
  assert.equal(genreResults.find((result) => result.id === "genre-match")?.searchPresentation.metaText, "Genre: Horror");

  const tagResults = archiveSearch.scoreCatalog(catalog, "vampires");
  assert.equal(tagResults[0].id, "genre-match");
  assert.equal(tagResults[0].searchPresentation.metaText, "Tag: Vampires");
});

test("bounded typo tolerance remains useful for titles and tags", () => {
  const catalog = loadSearchCatalog();

  const titleResults = archiveSearch.scoreCatalog(catalog, "derelct");
  assert.equal(titleResults[0].id, "derelict");

  const tagResults = archiveSearch.scoreCatalog(catalog, "vampres");
  assert.equal(tagResults[0].searchPresentation.metaText, "Tag: Vampires");
});

test("empty and stop-word-only queries avoid body-text matches", () => {
  const bodyOnly = createSearchRecord({
    id: "body-only-the",
    title: "Signal Archive",
    description: "The signal is hidden in the archive.",
  });
  const titleMatch = createSearchRecord({
    id: "title-the",
    title: "The Signal",
  });
  const catalog = archiveSearch.hydrateCatalogSearch([bodyOnly, titleMatch]);

  assert.deepEqual(archiveSearch.scoreCatalog(catalog, ""), []);
  const results = archiveSearch.scoreCatalog(catalog, "the");
  assert.equal(results[0].id, "title-the");
  assert.equal(results.some((result) => result.id === "body-only-the"), false);
});

test("credit fallbacks make untyped production names searchable without a fuzzy dependency", () => {
  const catalog = archiveSearch.hydrateCatalogSearch([
    createSearchRecord({
      id: "network-hit",
      title: "Another Show",
      credits: { network: "Signal Network" },
    }),
    createSearchRecord({
      id: "weak-description-hit",
      title: "A Different Show",
      description: "Signal Network appears in the publisher description.",
    }),
  ]);

  const results = archiveSearch.scoreCatalog(catalog, "Signal Network");
  assert.equal(results[0].id, "network-hit");
  assert.equal(results[0].searchMatchTier, 4);
  assert.equal(results[0].searchPresentation.metaText, "Network: Signal Network");
  assert.equal(archiveSearch.scoreCatalog(catalog, "Signal Network unrelated").length, 0);
});

test("identity matches do not bypass structured query clauses", () => {
  const catalog = archiveSearch.hydrateCatalogSearch([
    createSearchRecord({
      id: "finished-network-show",
      title: "Finished Network Show",
      creators: ["Signal Network"],
      completionStatus: "finished",
    }),
    createSearchRecord({
      id: "ongoing-network-show",
      title: "Ongoing Network Show",
      creators: ["Signal Network"],
      completionStatus: "ongoing",
    }),
  ]);

  const results = archiveSearch.scoreCatalog(catalog, "Signal Network completed");
  assert.deepEqual(results.map((result) => result.id), ["finished-network-show"]);
});
