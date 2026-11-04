const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { readCatalogSource } = require("../lib/catalog-source");
const {
  ARTWORK_REPAIRS,
  installCoverAtomically,
  repairPublishedCoverArtwork,
} = require("../lib/published-cover-artwork-repair");

const REPOSITORY_ROOT = path.resolve(__dirname, "../..");
const RELEASE_ID = "5883f5649c10013845c18651a6b7197f1524077b";

function writeJson(filePath, value, mode = 0o640) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode });
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function makeShow(artwork) {
  return {
    id: artwork.id,
    title: artwork.title,
    description: `Reviewed description for ${artwork.title}.`,
    cover: "images/Circle2-Logo-S.png",
    coverAlt: "Echo Archives placeholder artwork",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "unknown",
    completionStatus: "unclear",
    listenLinks: { rss: artwork.feedUrl },
    officialLinks: { website: "https://example.test/official" },
    genres: ["fantasy"],
    tags: ["Mystery"],
    ratings: { archive: 8.4 },
    archiveTake: "Preserved editorial text.",
    spoilerFreeReview: ["Preserved review."],
    metadata: { import: { factualReview: { reviewedAt: "2026-11-02T12:00:00.000Z" } } },
  };
}

function createFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "echo-cover-artwork-repair-"));
  const releaseRoot = path.join(base, "srv/echo-archives/releases", RELEASE_ID);
  const runtimeRoot = path.join(base, "srv/echo-archives/runtime/production", RELEASE_ID);
  const showIds = ARTWORK_REPAIRS.map(({ id }) => id);
  const shows = [...ARTWORK_REPAIRS.map(makeShow), {
    id: "unrelated-show",
    title: "Unrelated Show",
    cover: "images/covers/unrelated-show.jpg",
    status: "published",
    reviewStatus: "full-review",
    ratings: { archive: 9.1 },
  }];

  fs.mkdirSync(path.join(releaseRoot, "images/covers"), { recursive: true });
  for (const artwork of ARTWORK_REPAIRS) {
    const source = path.join(REPOSITORY_ROOT, artwork.cover);
    fs.copyFileSync(source, path.join(releaseRoot, artwork.cover));
  }

  fs.mkdirSync(path.join(runtimeRoot, "catalog-src/shows"), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, "catalog-src/collections"), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, "catalog-src/reviews"), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, "images/covers"), { recursive: true, mode: 0o770 });
  fs.mkdirSync(path.join(runtimeRoot, "import-staging"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(runtimeRoot, "data"), { recursive: true, mode: 0o770 });
  writeJson(path.join(runtimeRoot, "catalog-src/shows/_order.json"), shows.map((show) => show.id));
  for (const show of shows) writeJson(path.join(runtimeRoot, "catalog-src/shows", `${show.id}.json`), show);
  writeJson(path.join(runtimeRoot, "catalog-src/collections/_order.json"), []);
  writeJson(path.join(runtimeRoot, "catalog-src/reviews/unrelated-review.json"), { showId: "unrelated-show", review: "Keep this review." });
  writeJson(path.join(runtimeRoot, "data/shows.json"), shows);
  const unrelatedCover = Buffer.from("existing unrelated cover asset");
  fs.writeFileSync(path.join(runtimeRoot, "images/covers/unrelated-show.jpg"), unrelatedCover);
  fs.writeFileSync(path.join(runtimeRoot, "import-staging/operator-review.json"), "preserve-review-ledger\n");

  for (const directory of [releaseRoot, path.join(releaseRoot, "images"), path.join(releaseRoot, "images/covers")]) {
    fs.chmodSync(directory, 0o555);
  }
  for (const artwork of ARTWORK_REPAIRS) fs.chmodSync(path.join(releaseRoot, artwork.cover), 0o444);
  for (const show of shows) fs.chmodSync(path.join(runtimeRoot, "catalog-src/shows", `${show.id}.json`), 0o440);

  return {
    base,
    releaseRoot,
    runtimeRoot,
    shows,
    showIds,
    dispose() { makeWritableForCleanup(base); fs.rmSync(base, { recursive: true, force: true }); },
  };
}

function mockBuildAndIntegrity(calls = { builds: 0 }) {
  return {
    buildCatalog: async (root, options) => {
      calls.builds += 1;
      assert.equal(options.recoverCovers, false);
      const source = readCatalogSource(root);
      writeJson(path.join(root, "data/shows.json"), source.shows);
      return { catalog: source.shows };
    },
    assertCatalogIntegrity: (root) => {
      const source = readCatalogSource(root);
      return { stats: { shows: source.shows.length }, errors: [] };
    },
  };
}

function assertReadOnlyRelease(releaseRoot) {
  assert.equal(fs.statSync(releaseRoot).mode & 0o222, 0);
  for (const artwork of ARTWORK_REPAIRS) {
    const assetPath = path.join(releaseRoot, artwork.cover);
    assert.equal(fs.lstatSync(assetPath).isSymbolicLink(), false);
    assert.equal(fs.statSync(assetPath).mode & 0o222, 0);
    assert.equal(sha256(fs.readFileSync(assetPath)), artwork.sha256);
  }
}

function makeWritableForCleanup(root) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) makeWritableForCleanup(child);
    else fs.chmodSync(child, 0o600);
  }
  fs.chmodSync(root, 0o700);
}

test("production-shaped repair updates only artwork, validates, and carries covers through the next runtime deployment", async () => {
  const fixture = createFixture();
  const calls = { builds: 0 };
  const buildAndIntegrity = mockBuildAndIntegrity(calls);
  const before = readCatalogSource(fixture.runtimeRoot);
  const reviewsBefore = fs.readFileSync(path.join(fixture.runtimeRoot, "import-staging/operator-review.json"));
  const unrelatedCoverBefore = fs.readFileSync(path.join(fixture.runtimeRoot, "images/covers/unrelated-show.jpg"));
  try {
    assertReadOnlyRelease(fixture.releaseRoot);
    assert.equal(fs.statSync(path.join(fixture.runtimeRoot, "catalog-src/shows")).mode & 0o200, 0o200);
    assert.equal(fs.statSync(path.join(fixture.runtimeRoot, "catalog-src/shows/dont-stop-me-now-an-audiobook-podcast.json")).mode & 0o222, 0);

    const result = await repairPublishedCoverArtwork(fixture.runtimeRoot, fixture.releaseRoot, buildAndIntegrity);
    assert.equal(result.changed, true);
    assert.deepEqual(result.changedShowIds, fixture.showIds);
    assert.equal(result.integrityErrors, 0);
    assert.equal(result.catalogueStats.shows, fixture.shows.length);
    assert.equal(calls.builds, 1);
    assert.match(result.backupPath, /^import-staging\/artwork-repair-backups\/.+\/manifest\.json$/);
    const backupPath = path.join(fixture.runtimeRoot, result.backupPath);
    const backupManifest = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    assert.deepEqual(backupManifest.showIds, fixture.showIds);
    assert.deepEqual(backupManifest.showRecords.map((entry) => entry.id), fixture.showIds);
    assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);

    const after = readCatalogSource(fixture.runtimeRoot);
    const afterById = new Map(after.shows.map((show) => [show.id, show]));
    for (const artwork of ARTWORK_REPAIRS) {
      const prior = before.shows.find((show) => show.id === artwork.id);
      const repaired = afterById.get(artwork.id);
      assert.equal(repaired.cover, artwork.cover);
      assert.equal(repaired.coverAlt, `${artwork.title} cover art`);
      assert.equal(repaired.status, "published");
      assert.equal(repaired.reviewStatus, "indexed-only");
      for (const field of Object.keys(prior).filter((key) => !["cover", "coverAlt"].includes(key))) {
        assert.deepEqual(repaired[field], prior[field], `${artwork.id}.${field} is preserved`);
      }
      const localCover = path.join(fixture.runtimeRoot, artwork.cover);
      assert.equal(fs.lstatSync(localCover).isSymbolicLink(), false);
      assert.equal(sha256(fs.readFileSync(localCover)), artwork.sha256);
      assert.notEqual(artwork.sha256, sha256(fs.readFileSync(path.join(REPOSITORY_ROOT, "images/Circle2-Logo-S.png"))));
    }
    assert.deepEqual(after.shows.find((show) => show.id === "unrelated-show"), before.shows.find((show) => show.id === "unrelated-show"));
    assert.deepEqual(after.collections, before.collections);
    assert.deepEqual(after.reviewsById, before.reviewsById);
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtimeRoot, "images/covers/unrelated-show.jpg")), unrelatedCoverBefore);
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtimeRoot, "import-staging/operator-review.json")), reviewsBefore);
    const generated = JSON.parse(fs.readFileSync(path.join(fixture.runtimeRoot, "data/shows.json"), "utf8"));
    for (const artwork of ARTWORK_REPAIRS) assert.equal(generated.find((show) => show.id === artwork.id)?.cover, artwork.cover);

    const repeated = await repairPublishedCoverArtwork(fixture.runtimeRoot, fixture.releaseRoot, buildAndIntegrity);
    assert.equal(repeated.changed, false);
    assert.deepEqual(repeated.changedShowIds, []);
    assert.equal(calls.builds, 1, "a verified repeat does not rewrite or rebuild the catalogue");

    const nextRelease = path.join(fixture.base, "srv/echo-archives/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const nextRuntime = path.join(fixture.base, "srv/echo-archives/runtime/production/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    fs.cpSync(fixture.releaseRoot, nextRelease, { recursive: true, force: true });
    fs.mkdirSync(path.join(nextRuntime, "images"), { recursive: true });
    fs.cpSync(path.join(fixture.runtimeRoot, "images/covers"), path.join(nextRuntime, "images/covers"), { recursive: true });
    assert.deepEqual(fs.readFileSync(path.join(nextRuntime, "images/covers/unrelated-show.jpg")), unrelatedCoverBefore);
    for (const artwork of ARTWORK_REPAIRS) {
      const carried = path.join(nextRuntime, artwork.cover);
      assert.equal(sha256(fs.readFileSync(carried)), artwork.sha256);
    }
  } finally {
    fixture.dispose();
  }
});

test("failed catalogue validation rolls back all eight records and local artwork files", async () => {
  const fixture = createFixture();
  const before = readCatalogSource(fixture.runtimeRoot);
  const generatedBefore = fs.readFileSync(path.join(fixture.runtimeRoot, "data/shows.json"));
  const installs = [];
  try {
    const buildAndIntegrity = mockBuildAndIntegrity();
    const installAfterFirstRename = (targetPath, bytes) => {
      installCoverAtomically(targetPath, bytes);
      installs.push(targetPath);
      if (installs.length === 1) throw new Error("simulated interrupted artwork batch");
    };
    await assert.rejects(repairPublishedCoverArtwork(fixture.runtimeRoot, fixture.releaseRoot, {
      ...buildAndIntegrity,
      installCoverAtomically: installAfterFirstRename,
    }), /simulated interrupted artwork batch/);

    assert.deepEqual(readCatalogSource(fixture.runtimeRoot), before);
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtimeRoot, "data/shows.json")), generatedBefore);
    for (const artwork of ARTWORK_REPAIRS) {
      assert.equal(fs.existsSync(path.join(fixture.runtimeRoot, artwork.cover)), false, `${artwork.id} artwork is rolled back`);
    }
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtimeRoot, "import-staging/operator-review.json")), Buffer.from("preserve-review-ledger\n"));
  } finally {
    fixture.dispose();
  }
});

test("a catalogue build failure after image installation restores every prior file", async () => {
  const fixture = createFixture();
  const before = readCatalogSource(fixture.runtimeRoot);
  const generatedBefore = fs.readFileSync(path.join(fixture.runtimeRoot, "data/shows.json"));
  try {
    await assert.rejects(repairPublishedCoverArtwork(fixture.runtimeRoot, fixture.releaseRoot, {
      buildCatalog: async (root) => {
        writeJson(path.join(root, "data/shows.json"), [{ id: "interrupted" }]);
        throw new Error("simulated catalogue build failure");
      },
      assertCatalogIntegrity: () => ({ stats: { shows: 0 }, errors: [] }),
    }), /simulated catalogue build failure/);

    assert.deepEqual(readCatalogSource(fixture.runtimeRoot), before);
    assert.deepEqual(fs.readFileSync(path.join(fixture.runtimeRoot, "data/shows.json")), generatedBefore);
    for (const artwork of ARTWORK_REPAIRS) assert.equal(fs.existsSync(path.join(fixture.runtimeRoot, artwork.cover)), false);
  } finally {
    fixture.dispose();
  }
});
