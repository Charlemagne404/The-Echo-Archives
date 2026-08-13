const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildCatalog } = require("../../tools/build-catalog");
const { scaffoldCatalogEntry } = require("../../tools/scaffold-catalog");
const { buildCatalogSnapshot, serializeRuntimeShow } = require("../../tools/lib/catalog-artifacts");
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

function createShowRecord(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    subtitle: "",
    description: "A source-backed demo description with enough detail to support trustworthy archive discovery and validation.",
    cover: "images/Logo.png",
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

  assert.equal(runtime.reviewStatus, "imported");
  assert.equal(runtime.metadata.import.publication.tier, "imported");
  assert.equal(runtime.metadata.import.factualReview.reviewedBy, undefined);
  assert.equal(snapshot.metrics.imported, 1);
});

test("buildCatalog bootstraps split catalog source and writes generated artifacts", async () => {
  const tempRoot = createTempSiteRoot();
  fs.mkdirSync(path.join(tempRoot, "images"), { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Logo.png"), path.join(tempRoot, "images", "Logo.png"));

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
  assert.ok(fs.existsSync(path.join(tempRoot, "docs", "generated", "catalog-status.md")));
});

test("scaffoldCatalogEntry adds new split-source records and rebuilds generated outputs", async () => {
  const tempRoot = createTempSiteRoot();
  fs.mkdirSync(path.join(tempRoot, "images"), { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Logo.png"), path.join(tempRoot, "images", "Logo.png"));

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
