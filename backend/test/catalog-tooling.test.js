const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildCatalog } = require("../../tools/build-catalog");
const { scaffoldCatalogEntry } = require("../../tools/scaffold-catalog");
const { buildCatalogSnapshot, createRuntimeEvidenceRecord, createSearchIndexRecord, serializeRuntimeShow } = require("../../tools/lib/catalog-artifacts");
const { writeShowRecordsAtomically, writeCollectionRecordsAtomically } = require("../../tools/lib/catalog-source");
const { runWithCatalogPublication } = require("../../tools/lib/catalog-publication-transaction");
const { getRuntimeEvidence } = require("../../shared/discovery/runtime");
const {
  ensureSplitCatalogSource,
  readCatalogSource,
  readJsonFile,
} = require("../../tools/lib/catalog-source");

const siteRoot = path.resolve(__dirname, "../..");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempSiteRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-catalog-tools-"));
}

function createProductionLikeOverlay() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-production-overlay-"));
  const releaseId = "4819b8f832e3e851e0291f722ad2053445e017a2";
  const releaseRoot = path.join(base, "srv/echo-archives/releases", releaseId);
  const runtimeRoot = path.join(base, "srv/echo-archives/runtime/production", releaseId);
  const staticRoot = path.join(base, "srv/echo-archives/runtime/production/current");
  const releaseLink = path.join(base, "srv/echo-archives/current");
  fs.mkdirSync(releaseRoot, { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.cpSync(path.join(siteRoot, "catalog-src"), path.join(releaseRoot, "catalog-src"), { recursive: true });
  fs.cpSync(path.join(siteRoot, "data"), path.join(releaseRoot, "data"), { recursive: true });
  fs.mkdirSync(path.join(releaseRoot, "docs"), { recursive: true });
  fs.cpSync(path.join(siteRoot, "docs/generated"), path.join(releaseRoot, "docs/generated"), { recursive: true });
  fs.cpSync(path.join(releaseRoot, "catalog-src"), path.join(runtimeRoot, "catalog-src"), { recursive: true });
  fs.cpSync(path.join(releaseRoot, "data"), path.join(runtimeRoot, "data"), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, "docs"), { recursive: true });
  fs.cpSync(path.join(releaseRoot, "docs/generated"), path.join(runtimeRoot, "docs/generated"), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, "images/covers"), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, "images/generated/covers"), { recursive: true });
  for (const name of ["entities.json", "entity-graph.json", "runtime-evidence.json"]) {
    const runtimeFile = path.join(runtimeRoot, "data", name);
    const releaseFile = path.join(releaseRoot, "data", name);
    if (fs.existsSync(runtimeFile)) fs.rmSync(runtimeFile);
    fs.symlinkSync(releaseFile, runtimeFile);
  }
  for (const relative of ["catalog-src/shows", "catalog-src/collections", "catalog-src/reviews", "data", "data/reviews", "docs/generated", "images/covers", "images/generated/covers"]) {
    const directory = path.join(runtimeRoot, relative);
    if (fs.existsSync(directory)) fs.chmodSync(directory, 0o770);
  }
  fs.symlinkSync(releaseId, staticRoot);
  fs.symlinkSync(path.relative(path.dirname(releaseLink), releaseRoot), releaseLink);

  const makeReadOnly = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) makeReadOnly(target);
      else if (!entry.isSymbolicLink()) fs.chmodSync(target, 0o444);
    }
    fs.chmodSync(directory, 0o555);
  };
  makeReadOnly(releaseRoot);
  return { base, releaseRoot, runtimeRoot, staticRoot };
}

function disposeProductionLikeOverlay(fixture) {
  const makeWritable = (target) => {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      fs.chmodSync(target, 0o755);
      fs.readdirSync(target).forEach((name) => makeWritable(path.join(target, name)));
    } else fs.chmodSync(target, 0o644);
  };
  makeWritable(fixture.base);
  fs.rmSync(fixture.base, { recursive: true, force: true });
}

function createShowRecord(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    subtitle: "",
    description: "A source-backed demo description with enough detail to support trustworthy archive discovery and validation.",
    cover: "images/Circle-S-Logo.png",
    coverAlt: "Demo Show cover art",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "completed",
    completionStatus: "finished",
    listenLinks: {
      website: "https://example.com",
      rss: "",
    },
    genres: ["sci-fi"],
    tones: ["dark"],
    formats: ["full-cast"],
    tags: ["Time travel", "Sci-fi"],
    aliases: [],
    themes: [],
    contentNotes: [],
    languages: ["English"],
    transcriptLanguages: [],
    ratings: {
      archive: 8,
    },
    facts: {},
    bestFor: ["easy-entry"],
    similarTo: ["neighbor-show", "neighbor-two", "neighbor-three"],
    similarReasons: {
      "neighbor-show": "Reason one.",
      "neighbor-two": "Reason two.",
      "neighbor-three": "Reason three.",
    },
    archiveTake: "Worth indexing.",
    spoilerFreeReview: "",
    thoughts: "",
    quote: {
      text: "",
      attribution: "",
    },
    metadata: {
      objectiveSources: ["https://example.com"],
      researchGaps: [],
    },
    updatedAt: "2026-06-30",
    ...overrides,
  };
}

function createNeighborRecord(id, title) {
  return createShowRecord({
    id,
    title,
    status: "draft",
    ratings: {},
    archiveTake: "Neighbor record.",
    similarTo: ["demo-show", "neighbor-two", "neighbor-three"].filter((value) => value !== id),
    similarReasons: {
      "demo-show": "Reciprocal reason.",
      ...(id !== "neighbor-two" ? { "neighbor-two": "Shared lane." } : {}),
      ...(id !== "neighbor-three" ? { "neighbor-three": "Shared lane." } : {}),
    },
  });
}

test("public catalogue artifacts retain Imported trust state without maintainer identity", () => {
  const imported = createShowRecord({
    reviewStatus: "imported",
    metadata: {
      import: {
        pipelineVersion: "2",
        publication: { tier: "imported", publishedAt: "2026-08-13T10:00:00.000Z" },
        factualReview: { reviewedAt: "2026-08-13T11:00:00.000Z", reviewedBy: "Private Maintainer", inputRevision: 2 },
      },
    },
  });
  const runtime = serializeRuntimeShow(imported);
  const snapshot = buildCatalogSnapshot([imported], [], 0, {
    publishedShowsMissingSimilarReasons: [],
    publishedShowsWithOutOfRangeSimilarLinks: [],
    publishedShowsWithTooFewCollectionMemberships: [],
    anchorShowsWithTooFewCollectionMemberships: [],
    routeCollectionsMissingShowReasons: [],
  }, { creators: [], networks: [], changelog: [] });
  const curated = createShowRecord({
    discovery: {
      voiceStyle: "mixed",
      narrativeFocus: "plot-driven",
      intensity: "high",
      commitment: "medium",
    },
  });
  const curatedRuntime = serializeRuntimeShow(curated);

  assert.equal(runtime.reviewStatus, "imported");
  assert.equal(runtime.metadata.import.publication.tier, "imported");
  assert.equal(runtime.metadata.import.factualReview.reviewedBy, undefined);
  assert.deepEqual(curatedRuntime.discovery, curated.discovery);
  assert.deepEqual(createSearchIndexRecord(curated).discovery, curated.discovery);
  assert.equal(snapshot.metrics.imported, 1);
});

test("runtime evidence stays in its compact projection and keeps estimate qualifiers", () => {
  const show = createShowRecord({
    length: { episodes: 10, avgEpisodeMinutes: 30, totalHours: 5, durationCoverage: 0.4 },
    metadata: { objectiveSources: ["https://example.com"], researchGaps: ["Runtime estimate; exact duration unknown.", "Missing transcript sources."] },
  });
  const projection = createRuntimeEvidenceRecord(show);

  assert.deepEqual(projection, {
    id: "demo-show",
    length: { episodes: 10, avgEpisodeMinutes: 30, totalHours: 5, durationCoverage: 0.4 },
    runtimeGap: true,
  });
  assert.equal(Object.hasOwn(createSearchIndexRecord(show), "length"), false);
  assert.equal(Object.hasOwn(createSearchIndexRecord(show), "metadata"), false);
  assert.equal(getRuntimeEvidence({ ...show, ...projection }).kind, "derived-estimate");
});

test("buildCatalog bootstraps split catalog source and writes generated artifacts", async () => {
  const tempRoot = createTempSiteRoot();
  fs.mkdirSync(path.join(tempRoot, "images"), { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Circle-S-Logo.png"), path.join(tempRoot, "images", "Circle-S-Logo.png"));

  writeJson(path.join(tempRoot, "data", "shows.json"), [
    createShowRecord(),
    createNeighborRecord("neighbor-show", "Neighbor Show"),
    createNeighborRecord("neighbor-two", "Neighbor Two"),
    createNeighborRecord("neighbor-three", "Neighbor Three"),
  ]);
  writeJson(path.join(tempRoot, "data", "collections.json"), [
    {
      id: "demo-collection",
      title: "Demo Collection",
      description: "A collection for tooling tests.",
      showIds: ["demo-show", "neighbor-show"],
      showReasons: {
        "demo-show": "Route reason one.",
        "neighbor-show": "Route reason two.",
      },
      order: 10,
      updatedAt: "2026-06-30",
    },
    {
      id: "neighbor-collection",
      title: "Neighbor Collection",
      description: "A supporting collection for tooling tests.",
      showIds: ["demo-show", "neighbor-two", "neighbor-three"],
      showReasons: {
        "demo-show": "Route reason one.",
        "neighbor-two": "Route reason two.",
        "neighbor-three": "Route reason three.",
      },
      order: 20,
      updatedAt: "2026-06-30",
    },
  ]);

  const result = await buildCatalog(tempRoot);

  assert.equal(result.catalog.length, 4);
  assert.equal(ensureSplitCatalogSource(tempRoot), false);
  assert.ok(fs.existsSync(path.join(tempRoot, "catalog-src", "shows", "_order.json")));
  assert.ok(fs.existsSync(path.join(tempRoot, "data", "search-index.json")));
  assert.ok(fs.existsSync(path.join(tempRoot, "data", "runtime-evidence.json")));
  assert.ok(fs.existsSync(path.join(tempRoot, "data", "entity-graph.json")));
  assert.equal(JSON.parse(fs.readFileSync(path.join(tempRoot, "data", "entity-graph.json"), "utf8")).schema, "echo-archives/entity-graph/v1");
  assert.ok(fs.existsSync(path.join(tempRoot, "docs", "generated", "catalog-status.md")));
});

test("publication rebuilds through a read-only release and writable production overlay", async () => {
  const fixture = createProductionLikeOverlay();
  try {
    const before = readCatalogSource(fixture.staticRoot);
    const batch = before.shows.slice(0, 8);
    const polybius = before.shows.find((show) => show.id === "polybius-protocol");
    if (polybius && !batch.some((show) => show.id === polybius.id)) batch.push(polybius);
    const collection = before.collections[0];
    const updatedCollection = { ...collection, updatedAt: "2099-01-01" };
    const immutableCollection = path.join(fixture.releaseRoot, "catalog-src/collections", `${collection.id}.json`);
    const immutableCollectionBefore = fs.readFileSync(immutableCollection);
    const immutableGenerated = path.join(fixture.releaseRoot, "data/entities.json");
    const immutableGeneratedBefore = fs.readFileSync(immutableGenerated);

    const publication = writeShowRecordsAtomically(fixture.staticRoot, batch, {
      deferCommit: true,
      recoveryData: { schema: 1, candidates: [], identities: [] },
    });
    const rebuilt = await runWithCatalogPublication(publication.publicationToken, async () => {
      writeCollectionRecordsAtomically(fixture.staticRoot, [updatedCollection], { joinExisting: true });
      return buildCatalog(fixture.staticRoot, { recoverCovers: false });
    });
    publication.commit();

    const runtimeSource = readCatalogSource(fixture.staticRoot);
    assert.equal(runtimeSource.shows.length, before.shows.length);
    assert.ok(batch.every((record) => runtimeSource.shows.some((show) => show.id === record.id)));
    assert.equal(runtimeSource.collections.find((record) => record.id === collection.id).updatedAt, "2099-01-01");
    assert.equal(rebuilt.catalog.length, before.shows.filter((show) => show.status === "published").length);
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.staticRoot, "data/collections.json"), "utf8")).find((record) => record.id === collection.id).updatedAt, "2099-01-01");
    assert.equal(fs.readFileSync(immutableCollection, "utf8"), immutableCollectionBefore.toString("utf8"));
    assert.equal(fs.readFileSync(immutableGenerated, "utf8"), immutableGeneratedBefore.toString("utf8"));
    assert.equal(fs.lstatSync(path.join(fixture.staticRoot, "data/entities.json")).isSymbolicLink(), false, "generated output uses copy-on-write in the runtime overlay");
    assert.equal(fs.lstatSync(immutableGenerated).isFile(), true);
    assert.equal(fs.statSync(fixture.releaseRoot).mode & 0o222, 0, "release directory remains read-only");
  } finally { disposeProductionLikeOverlay(fixture); }
});

test("scaffoldCatalogEntry adds new split-source records and rebuilds generated outputs", async () => {
  const tempRoot = createTempSiteRoot();
  fs.mkdirSync(path.join(tempRoot, "images"), { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Circle-S-Logo.png"), path.join(tempRoot, "images", "Circle-S-Logo.png"));

  writeJson(path.join(tempRoot, "data", "shows.json"), [
    createShowRecord(),
    createNeighborRecord("neighbor-show", "Neighbor Show"),
    createNeighborRecord("neighbor-two", "Neighbor Two"),
    createNeighborRecord("neighbor-three", "Neighbor Three"),
  ]);
  writeJson(path.join(tempRoot, "data", "collections.json"), [
    {
      id: "demo-collection",
      title: "Demo Collection",
      description: "A collection for tooling tests.",
      showIds: ["demo-show", "neighbor-show"],
      showReasons: {
        "demo-show": "Route reason one.",
        "neighbor-show": "Route reason two.",
      },
      order: 10,
      updatedAt: "2026-06-30",
    },
    {
      id: "neighbor-collection",
      title: "Neighbor Collection",
      description: "A supporting collection for tooling tests.",
      showIds: ["demo-show", "neighbor-two", "neighbor-three"],
      showReasons: {
        "demo-show": "Route reason one.",
        "neighbor-two": "Route reason two.",
        "neighbor-three": "Route reason three.",
      },
      order: 20,
      updatedAt: "2026-06-30",
    },
  ]);

  await buildCatalog(tempRoot);
  await scaffoldCatalogEntry({ kind: "show", id: "future-show", title: "Future Show" }, tempRoot);

  const sourceData = readCatalogSource(tempRoot);
  const runtimeShows = readJsonFile(path.join(tempRoot, "data", "shows.json"));

  assert.ok(sourceData.shows.some((show) => show.id === "future-show" && show.status === "draft"));
  assert.ok(runtimeShows.every((show) => show.status === "published"));
});
