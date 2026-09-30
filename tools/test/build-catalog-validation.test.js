const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildCatalog } = require("../build-catalog");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function publishedShow(id, rss) {
  return {
    id,
    title: `Integrity fixture ${id}`,
    description: "A source-backed synthetic show used to check that invalid evidence is stopped before generation.",
    cover: "images/TEA-Logo-S.png",
    coverAlt: `Integrity fixture ${id} cover art`,
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "active",
    completionStatus: "ongoing",
    listenLinks: { rss, website: "https://example.test/show" },
    officialLinks: {},
    genres: ["sci-fi"],
    tones: [],
    formats: ["serialized"],
    tags: ["Time travel", "Sci-fi"],
    aliases: [],
    themes: [],
    contentNotes: [],
    languages: [],
    transcriptLanguages: [],
    cast: [],
    creators: [],
    bestFor: [],
    similarTo: [],
    similarReasons: {},
    ratings: {},
    length: {},
    releaseDates: {},
    verification: {},
    metadata: {},
    entityLinks: [],
    updatedAt: "2026-09-01",
  };
}

test("catalog generation stops on cross-record source integrity errors before changing outputs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-build-integrity-"));
  const previousRuntimeShows = [{ id: "preserved-derived-record" }];
  const sharedRss = "https://feeds.example.test/shared.xml";

  try {
    writeJson(path.join(root, "catalog-src", "shows", "_order.json"), ["first-show", "second-show"]);
    writeJson(path.join(root, "catalog-src", "shows", "first-show.json"), publishedShow("first-show", sharedRss));
    writeJson(path.join(root, "catalog-src", "shows", "second-show.json"), publishedShow("second-show", sharedRss));
    writeJson(path.join(root, "catalog-src", "collections", "_order.json"), []);
    writeJson(path.join(root, "catalog-src", "entities.json"), []);
    fs.mkdirSync(path.join(root, "catalog-src", "reviews"), { recursive: true });
    writeJson(path.join(root, "data", "shows.json"), previousRuntimeShows);

    const previousBytes = fs.readFileSync(path.join(root, "data", "shows.json"));
    await assert.rejects(
      buildCatalog(root, { recoverCovers: false }),
      /Provider identity RSS feed .*shared by first-show, second-show/,
    );
    assert.deepEqual(fs.readFileSync(path.join(root, "data", "shows.json")), previousBytes);
    assert.equal(fs.existsSync(path.join(root, "data", "search-index.json")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
