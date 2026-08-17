const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadArchiveContext } = require("../lib/ai/archive-context");
const { loadCatalog } = require("../lib/catalog");

const siteRoot = path.resolve(__dirname, "../..");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function createTempSiteRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-context-"));
}

function createShowRecord(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    description: "A source-backed demo description with enough detail to support trustworthy archive discovery and validation.",
    cover: "images/Circle-S-Logo.png",
    coverAlt: "Demo Show cover art",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "completed",
    completionStatus: "finished",
    listenLinks: {
      website: "https://example.com",
    },
    genres: ["sci-fi"],
    tones: ["dark"],
    formats: ["full-cast"],
    tags: ["Time travel", "Sci-fi"],
    ratings: {
      archive: 8,
    },
    bestFor: ["easy-entry"],
    similarTo: [],
    archiveTake: "Worth indexing.",
    updatedAt: "2026-06-02",
    ...overrides,
  };
}

test("loadArchiveContext returns empty optional datasets when they are absent", async () => {
  const catalog = await loadCatalog(siteRoot);
  const archiveContext = await loadArchiveContext(siteRoot, catalog);

  assert.deepEqual(archiveContext.creators, []);
  assert.deepEqual(archiveContext.networks, []);
  assert.deepEqual(archiveContext.changelog, []);
  assert.equal(archiveContext.featureAvailability.hasPublicChangelog, false);
  assert.equal(archiveContext.featureAvailability.hasCreatorPages, false);
  assert.equal(archiveContext.featureAvailability.hasNetworkPages, false);
});

test("loadArchiveContext enables hidden feature availability when optional datasets and references exist", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  const imagesRoot = path.join(tempRoot, "images");

  fs.mkdirSync(imagesRoot, { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Circle-S-Logo.png"), path.join(imagesRoot, "Circle-S-Logo.png"));

  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      id: "demo-show",
      creatorId: "demo-creator",
      networkId: "demo-network",
      createdAt: "2026-06-01",
    }),
  ]);
  writeJson(path.join(dataRoot, "collections.json"), [
    {
      id: "demo-collection",
      title: "Demo collection",
      description: "A useful collection.",
      showIds: ["demo-show"],
      featured: true,
      updatedAt: "2026-06-02",
    },
  ]);
  writeJson(path.join(dataRoot, "creators.json"), [
    {
      id: "demo-creator",
      name: "Demo Creator",
      website: "https://creator.example.com",
    },
  ]);
  writeJson(path.join(dataRoot, "networks.json"), [
    {
      id: "demo-network",
      name: "Demo Network",
      website: "https://network.example.com",
    },
  ]);
  writeJson(path.join(dataRoot, "changelog.json"), [
    {
      id: "demo-update",
      title: "Demo update",
      summary: "Added a technical capability.",
      status: "published",
      publishedAt: "2026-06-03",
      showIds: ["demo-show"],
    },
  ]);

  const catalog = await loadCatalog(tempRoot);
  const archiveContext = await loadArchiveContext(tempRoot, catalog);

  assert.equal(archiveContext.featureAvailability.hasPublicChangelog, true);
  assert.equal(archiveContext.featureAvailability.hasCreatorPages, true);
  assert.equal(archiveContext.featureAvailability.hasNetworkPages, true);
  assert.equal(archiveContext.featureAvailability.hasRecentlyAdded, true);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("loadCatalog rejects similarReasons that are not backed by similarTo", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  const imagesRoot = path.join(tempRoot, "images");

  fs.mkdirSync(imagesRoot, { recursive: true });
  fs.copyFileSync(path.join(siteRoot, "images", "Circle-S-Logo.png"), path.join(imagesRoot, "Circle-S-Logo.png"));

  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      id: "demo-show",
      similarReasons: {
        "second-show": "Good for the same late-night tension.",
      },
    }),
    createShowRecord({
      id: "second-show",
      title: "Second Show",
      updatedAt: "2026-06-03",
    }),
  ]);

  await assert.rejects(
    async () => {
      await loadCatalog(tempRoot);
    },
    {
      message: /similarreason/i,
    },
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
