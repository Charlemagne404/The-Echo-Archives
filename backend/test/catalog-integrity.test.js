const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  assertCatalogIntegrity,
  collectCatalogIntegrityIssues,
} = require("../lib/catalog-integrity");

const ROOT = path.resolve(__dirname, "../..");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function show(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    description: "A source-backed demo description with enough detail for deterministic catalog validation.",
    cover: "images/Circle-S-Logo.png",
    coverAlt: "Demo Show cover art",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "completed",
    completionStatus: "finished",
    listenLinks: { website: "https://example.com/show" },
    officialLinks: {},
    genres: ["sci-fi"],
    tags: ["Time travel", "Sci-fi"],
    tones: [],
    formats: ["serialized"],
    aliases: [],
    themes: [],
    contentNotes: [],
    languages: ["English"],
    transcriptLanguages: [],
    cast: [],
    creators: [],
    bestFor: [],
    similarTo: [],
    similarReasons: {},
    length: { episodes: 4, avgEpisodeMinutes: 30, minEpisodeMinutes: 28, medianEpisodeMinutes: 30, maxEpisodeMinutes: 32 },
    ratings: {},
    releaseDates: { first: "2024-01-01", latest: "2024-02-01" },
    verification: {},
    metadata: {},
    updatedAt: "2026-01-02",
    ...overrides,
  };
}

function collection(overrides = {}) {
  return {
    id: "demo-collection",
    title: "Demo collection",
    description: "A useful listening route.",
    kind: "curated",
    showIds: ["demo-show"],
    coverShowIds: [],
    showReasons: {},
    intentTags: [],
    order: 1,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
    ...overrides,
  };
}

test("the current split catalog passes the raw integrity checks", () => {
  const report = collectCatalogIntegrityIssues({ siteRoot: ROOT });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.equal(report.stats.shows, 752);
  assert.equal(report.stats.collections, 46);
  assert.equal(report.stats.entities, JSON.parse(fs.readFileSync(path.join(ROOT, "catalog-src/entities.json"), "utf8")).length);
  assert.equal(report.stats.reviews, 7);
});

test("integrity validation aggregates duplicate, reference, URL, date, and numeric failures", () => {
  const sourceData = {
    mode: "runtime",
    shows: [
      show({
        tags: ["Time travel", "time travel"],
        similarTo: ["missing-show", "demo-show"],
        similarReasons: { "missing-show": "A reason." },
        listenLinks: { website: "ftp://example.com/show" },
        releaseDates: { first: "2026-02-31", latest: "2026-01-01" },
        ratings: { archive: 11 },
        length: { durationCoverage: 2 },
        metadata: { objectiveSources: ["https://example.com/source", "https://example.com/source"] },
      }),
      show(),
    ],
    collections: [
      collection({
        showIds: ["demo-show", "demo-show", "missing-show"],
        coverShowIds: ["missing-show"],
        showReasons: { "missing-show": "A reason." },
      }),
    ],
    reviewsById: {},
  };

  const report = collectCatalogIntegrityIssues({ sourceData, entities: [], creators: [], networks: [], changelog: [] });

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /Duplicate show id "demo-show"/);
  assert.match(report.errors.join("\n"), /duplicate value "time travel"/);
  assert.match(report.errors.join("\n"), /unknown similarTo id "missing-show"/);
  assert.match(report.errors.join("\n"), /cannot reference itself/);
  assert.match(report.errors.join("\n"), /absolute HTTP\(S\) URL/);
  assert.match(report.errors.join("\n"), /not a valid date/);
  assert.match(report.errors.join("\n"), /ratings.archive must be a finite number between 0 and 10/);
  assert.match(report.errors.join("\n"), /durationCoverage must be a finite number between 0 and 1/);
  assert.match(report.errors.join("\n"), /objectiveSources contains duplicate URL/);
  assert.match(report.errors.join("\n"), /duplicate relationship "demo-show"/);
  assert.match(report.errors.join("\n"), /references unknown show "missing-show"/);
  assert.match(report.errors.join("\n"), /coverShowId "missing-show"/);
  assert.match(report.errors.join("\n"), /showReasons references unknown show "missing-show"/);
});

test("optional creator and network registries resolve show references", () => {
  const report = collectCatalogIntegrityIssues({
    sourceData: {
      mode: "runtime",
      shows: [show({ creatorId: "missing-creator", networkId: "missing-network" })],
      collections: [],
      reviewsById: {},
    },
    entities: [],
    creators: [{ id: "known-creator", name: "Known Creator", website: "https://example.com/creator" }],
    networks: [{ id: "known-network", name: "Known Network", website: "https://example.com/network" }],
    changelog: [],
  });

  assert.match(report.errors.join("\n"), /unknown creatorId "missing-creator"/);
  assert.match(report.errors.join("\n"), /unknown networkId "missing-network"/);
});

test("split source manifests keep filenames, order files, and record ids aligned", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-catalog-integrity-"));
  try {
    writeJson(path.join(tempRoot, "catalog-src/shows/_order.json"), ["wrong-show"]);
    writeJson(path.join(tempRoot, "catalog-src/shows/wrong-show.json"), show());
    writeJson(path.join(tempRoot, "catalog-src/collections/_order.json"), []);
    fs.mkdirSync(path.join(tempRoot, "catalog-src/reviews"), { recursive: true });

    const report = collectCatalogIntegrityIssues({
      siteRoot: tempRoot,
      sourceData: { mode: "split", shows: [show()], collections: [], reviewsById: {} },
      entities: [],
      creators: [],
      networks: [],
      changelog: [],
    });

    assert.match(report.errors.join("\n"), /catalog-src\/shows\/wrong-show\.json has internal id "demo-show"/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("assertCatalogIntegrity exposes the report on failure", () => {
  assert.throws(
    () => assertCatalogIntegrity(null, {
      sourceData: { mode: "runtime", shows: [{}], collections: [], reviewsById: {} },
      entities: [],
      creators: [],
      networks: [],
      changelog: [],
    }),
    (error) => {
      assert.match(error.message, /Catalog integrity validation failed/);
      assert.ok(error.report);
      assert.equal(error.report.ok, false);
      return true;
    },
  );
});
