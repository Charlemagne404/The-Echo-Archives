const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { assertCatalogIntegrity, collectCatalogIntegrityIssues } = require("../lib/catalog-integrity");
const { auditProviderIdentityDispositions } = require("../../tools/lib/provider-identity-dispositions");
const { repairMagnusProviderSharing } = require("../../tools/lib/magnus-provider-sharing-repair");
const { buildCatalog } = require("../../tools/build-catalog");
const {
  completeCatalogPublicationRecovery,
  recoverCatalogPublication,
  runWithCatalogPublication,
} = require("../../tools/lib/catalog-publication-transaction");
const { readCatalogSource, writeShowRecordsAtomically } = require("../../tools/lib/catalog-source");

const siteRoot = path.resolve(__dirname, "../..");
const deploymentScript = path.join(siteRoot, "deploy/release-common.sh");
const productionServiceUnit = path.join(siteRoot, "deploy/echo-archives.service");
const repairEntrypoint = path.join(siteRoot, "tools/repair-magnus-provider-sharing.js");
const RELEASE_ID = "a60adb77c2e6453df20088e2797495d27e49512a";
const NEXT_RELEASE_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.test-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function chmodTreeReadOnly(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) chmodTreeReadOnly(target);
    else if (!entry.isSymbolicLink()) fs.chmodSync(target, 0o440);
  }
  fs.chmodSync(directory, 0o550);
}

function chmodTreeWritable(directory) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.chmodSync(directory, 0o750);
    fs.readdirSync(directory).forEach((name) => chmodTreeWritable(path.join(directory, name)));
  } else fs.chmodSync(directory, 0o640);
}

function makeRuntimeOverlay(releaseRoot, runtimeRoot) {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  for (const relative of ["catalog-src", "data"]) {
    fs.cpSync(path.join(releaseRoot, relative), path.join(runtimeRoot, relative), { recursive: true });
  }
  fs.mkdirSync(path.join(runtimeRoot, "docs"), { recursive: true });
  fs.cpSync(path.join(releaseRoot, "docs/generated"), path.join(runtimeRoot, "docs/generated"), { recursive: true });
  for (const relative of ["images/covers", "images/generated/covers", "import-staging"]) {
    fs.mkdirSync(path.join(runtimeRoot, relative), { recursive: true });
  }
  fs.writeFileSync(path.join(runtimeRoot, "import-staging/publish.lock"), "");
  fs.chmodSync(path.join(runtimeRoot, "import-staging"), 0o700);
  fs.chmodSync(path.join(runtimeRoot, "import-staging/publish.lock"), 0o600);

  for (const name of ["entities.json", "entity-graph.json", "runtime-evidence.json"]) {
    const runtimeFile = path.join(runtimeRoot, "data", name);
    const releaseFile = path.join(releaseRoot, "data", name);
    if (fs.existsSync(runtimeFile)) fs.rmSync(runtimeFile);
    fs.symlinkSync(releaseFile, runtimeFile);
  }

  for (const relative of [
    "catalog-src/shows",
    "catalog-src/collections",
    "catalog-src/reviews",
    "data",
    "data/reviews",
    "docs/generated",
    "images/covers",
    "images/generated/covers",
  ]) {
    const directory = path.join(runtimeRoot, relative);
    if (fs.existsSync(directory)) fs.chmodSync(directory, 0o770);
  }
  for (const relative of ["catalog-src/shows", "catalog-src/collections", "catalog-src/reviews"]) {
    for (const name of fs.readdirSync(path.join(runtimeRoot, relative))) {
      const filePath = path.join(runtimeRoot, relative, name);
      if (fs.lstatSync(filePath).isFile()) fs.chmodSync(filePath, 0o440);
    }
  }
  for (const relative of ["data", "data/reviews", "docs/generated"]) {
    const directory = path.join(runtimeRoot, relative);
    for (const name of fs.readdirSync(directory)) {
      const filePath = path.join(directory, name);
      if (fs.lstatSync(filePath).isFile()) fs.chmodSync(filePath, 0o640);
    }
  }
}

function createProductionOverlay({ staleMagnus = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "echo-magnus-production-overlay-"));
  const releaseRoot = path.join(base, "srv/echo-archives/releases", RELEASE_ID);
  const runtimeRoot = path.join(base, "srv/echo-archives/runtime/production", RELEASE_ID);
  const staticRoot = path.join(base, "srv/echo-archives/runtime/production/current");
  const releaseLink = path.join(base, "srv/echo-archives/current");

  fs.mkdirSync(path.join(releaseRoot, "docs"), { recursive: true });
  fs.cpSync(path.join(siteRoot, "catalog-src"), path.join(releaseRoot, "catalog-src"), { recursive: true });
  fs.cpSync(path.join(siteRoot, "data"), path.join(releaseRoot, "data"), { recursive: true });
  fs.cpSync(path.join(siteRoot, "docs/generated"), path.join(releaseRoot, "docs/generated"), { recursive: true });
  makeRuntimeOverlay(releaseRoot, runtimeRoot);

  if (staleMagnus) {
    for (const showId of ["the-magnus-archives", "the-magnus-protocol"]) {
      const filePath = path.join(runtimeRoot, "catalog-src/shows", `${showId}.json`);
      const show = JSON.parse(fs.readFileSync(filePath, "utf8"));
      show.metadata.import.externalResearch.sourceUrls = [];
      delete show.metadata.import.externalResearch.sharedProviderIdentities;
      writeJson(filePath, show);
      fs.chmodSync(filePath, 0o440);
    }
  }

  chmodTreeReadOnly(releaseRoot);
  fs.symlinkSync(RELEASE_ID, staticRoot);
  fs.symlinkSync(path.relative(path.dirname(releaseLink), releaseRoot), releaseLink);
  return { base, releaseRoot, runtimeRoot, staticRoot, releaseLink };
}

function disposeProductionOverlay(fixture) {
  chmodTreeWritable(fixture.base);
  fs.rmSync(fixture.base, { recursive: true, force: true });
}

function removeRepairFields(show) {
  const copy = structuredClone(show);
  delete copy.metadata.import.externalResearch.sourceUrls;
  delete copy.metadata.import.externalResearch.sharedProviderIdentities;
  return copy;
}

function deploymentPreserve(sourceRuntime, targetRuntime) {
  const script = `
    sudo() { "$@"; }
    source ${JSON.stringify(deploymentScript)}
    preserve_runtime_mutable_state "$SOURCE_RUNTIME" "$TARGET_RUNTIME"
  `;
  const result = spawnSync("bash", ["-c", script], {
    env: { ...process.env, SOURCE_RUNTIME: sourceRuntime, TARGET_RUNTIME: targetRuntime },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function createInterruptedWrite(root) {
  const sourceModule = require.resolve("../../tools/lib/catalog-source");
  const script = `
    const fs = require('node:fs');
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      rename(from, to);
      if (to.endsWith('/catalog-src/shows/the-magnus-archives.json')) process.kill(process.pid, 'SIGKILL');
    };
    require(${JSON.stringify(sourceModule)}).writeShowRecordsAtomically(process.env.CATALOG_ROOT, [
      { id: 'the-magnus-archives', title: 'Interrupted test replacement' },
      { id: 'the-magnus-protocol', title: 'Interrupted test replacement' },
    ], { deferCommit: true, recoveryData: { schema: 1, candidates: [], identities: [] } });
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    env: { ...process.env, CATALOG_ROOT: root },
    timeout: 10_000,
  });
  assert.equal(result.signal, "SIGKILL", result.stderr.toString());
}

const NEW_SHOWS = [
  ["dont-stop-me-now-an-audiobook-podcast", "Don't Stop Me Now - An Audiobook Podcast", "https://feeds.acast.com/public/shows/6a5cc087740ca41b5abe6ff6"],
  ["mina-an-audiobook-podcast-by-roo-bannister", "Mina - An Audiobook Podcast by Roo Bannister", "https://feeds.acast.com/public/shows/6a4264183fa89e333892b6ae"],
  ["dyme-an-appalachian-horror-audio-drama", "Dyme: An Appalachian Horror Audio Drama", "https://media.rss.com/the-dyme-podcast/feed.xml"],
  ["richian-presents-dracula", "Richian Presents: Dracula", "https://feeds.example.test/richian-presents-dracula.xml"],
  ["the-great-work-and-other-administrative-matters", "The Great Work and Other Administrative Matters", "https://feeds.example.test/the-great-work.xml"],
  ["welcome-to-the-brass-eagle", "Welcome to the Brass Eagle", "https://feeds.example.test/welcome-to-the-brass-eagle.xml"],
  ["the-chronicles-of-oz", "The Chronicles of Oz", "https://feeds.example.test/the-chronicles-of-oz.xml"],
  ["parsons-nose-radio-theater", "Parson’s Nose Radio Theater", "https://feeds.example.test/parsons-nose-radio-theater.xml"],
];

function makePreparedShow(template, [id, title, rssUrl], index) {
  const show = structuredClone(template);
  const reviewedAt = "2026-11-04T19:00:00.000Z";
  show.id = id;
  show.title = title;
  show.description = `Production-shaped fixture record ${index + 1} for ${title}.`;
  show.status = "published";
  show.reviewStatus = "indexed-only";
  show.ratings = {};
  show.archiveTake = "";
  show.spoilerFreeReview = "";
  show.thoughts = "";
  show.similarTo = [];
  show.similarReasons = {};
  show.listenLinks = { ...show.listenLinks, rss: rssUrl, apple: "", website: `https://example.test/${id}/` };
  show.officialLinks = { ...show.officialLinks, website: `https://example.test/${id}/` };
  show.metadata.import = {
    ...show.metadata.import,
    identifiers: { podcastGuid: "", rssUrl, appleCollectionId: "", podcastIndexFeedId: "", feedRedirects: [] },
    selectedSources: [{ sourceType: "rss", sourceUrl: rssUrl, fetchedAt: reviewedAt, payloadHash: "a".repeat(64) }],
    externalResearch: { sourceUrls: [rssUrl, `https://example.test/${id}/`], fieldSources: {}, notes: "", uncertainFields: [], reviewedAt },
    publication: { tier: "indexed-only", publishedAt: reviewedAt, provisional: true },
    factualReview: { reviewedAt, reviewedBy: "operator:test", inputRevision: 1 },
    scopeReview: { status: "in-scope", reviewedAt, reviewedBy: "operator:test", inputRevision: 1, evidenceSources: [rssUrl] },
  };
  delete show.creatorId;
  delete show.networkId;
  show.entityLinks = [];
  return show;
}

test("strict provider identity validation rejects a one-sided Magnus disposition", () => {
  const source = readCatalogSource(siteRoot);
  const shows = structuredClone(source.shows);
  const protocol = shows.find((show) => show.id === "the-magnus-protocol");
  protocol.metadata.import.externalResearch.sharedProviderIdentities =
    protocol.metadata.import.externalResearch.sharedProviderIdentities.filter((entry) => entry.provider !== "apple");

  const audit = auditProviderIdentityDispositions(shows, { selectedShows: shows.filter((show) => show.status === "published") });
  assert.ok(audit.unresolvedCollisions.some((entry) => entry.provider === "apple" && entry.showIds.join(",") === "the-magnus-archives,the-magnus-protocol"));
  const report = collectCatalogIntegrityIssues({ siteRoot, sourceData: { ...source, shows } });
  assert.ok(report.errors.some((error) => error.includes('Provider identity Apple collection "1095138637"')));
});

test("production service keeps immutable releases read-only and grants the service account only runtime write paths", () => {
  const unit = fs.readFileSync(productionServiceUnit, "utf8");
  assert.match(unit, /^User=echo-archives$/m);
  assert.match(unit, /^Group=echo-archives$/m);
  assert.match(unit, /^NoNewPrivileges=true$/m);
  assert.match(unit, /^ProtectSystem=strict$/m);
  assert.match(unit, /^ReadOnlyPaths=\/srv\/echo-archives\/releases$/m);
  for (const relative of [
    "import-staging",
    "catalog-src/shows",
    "catalog-src/collections",
    "catalog-src/reviews",
    "data",
    "docs/generated",
  ]) {
    assert.match(unit, new RegExp(`^ReadWritePaths=/srv/echo-archives/runtime/production/current/${relative.replaceAll("/", "\\/")}$`, "m"));
  }
});

test("repair entrypoint refuses callers outside the Echo service account", () => {
  const result = spawnSync(process.execPath, [repairEntrypoint], { encoding: "utf8", timeout: 5_000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Run this maintenance command as the echo-archives service account/);
});

test("Magnus repair fails closed when full-catalogue validation finds any other conflict", async () => {
  const fixture = createProductionOverlay();
  try {
    const extra = structuredClone(readCatalogSource(fixture.staticRoot).shows.find((show) => show.id === "the-magnus-archives"));
    extra.id = "unexpected-magnus-identity-collision";
    extra.title = "Unexpected Magnus Identity Collision";
    const orderPath = path.join(fixture.runtimeRoot, "catalog-src/shows/_order.json");
    const order = JSON.parse(fs.readFileSync(orderPath, "utf8"));
    order.push(extra.id);
    writeJson(path.join(fixture.runtimeRoot, "catalog-src/shows", `${extra.id}.json`), extra);
    fs.chmodSync(path.join(fixture.runtimeRoot, "catalog-src/shows", `${extra.id}.json`), 0o440);
    writeJson(orderPath, order);
    fs.chmodSync(orderPath, 0o440);
    const beforeMagnus = ["the-magnus-archives", "the-magnus-protocol"].map((id) =>
      fs.readFileSync(path.join(fixture.runtimeRoot, "catalog-src/shows", `${id}.json`)));
    const beforeOrder = fs.readFileSync(orderPath);

    await assert.rejects(
      repairMagnusProviderSharing(fixture.staticRoot, fixture.releaseRoot),
      /unexpected error/,
    );
    assert.deepEqual(["the-magnus-archives", "the-magnus-protocol"].map((id) =>
      fs.readFileSync(path.join(fixture.runtimeRoot, "catalog-src/shows", `${id}.json`))), beforeMagnus);
    assert.deepEqual(fs.readFileSync(orderPath), beforeOrder);
  } finally {
    disposeProductionOverlay(fixture);
  }
});

test("production-shaped Magnus repair, deployment carry-forward, interrupted-write recovery, and atomic nine-show publication work on read-only releases", async () => {
  const fixture = createProductionOverlay();
  const previousUmask = process.umask(0o027);
  try {
    const before = readCatalogSource(fixture.staticRoot);
    const beforeMagnus = new Map(before.shows.filter((show) => ["the-magnus-archives", "the-magnus-protocol"].includes(show.id)).map((show) => [show.id, show]));
    const beforeOtherShows = before.shows.filter((show) => !beforeMagnus.has(show.id));
    const beforeCollections = structuredClone(before.collections);
    const beforeReviews = structuredClone(before.reviewsById);
    const optogBefore = before.shows.find((show) => show.id === "optog") || null;
    assert.equal(fs.statSync(path.join(fixture.runtimeRoot, "catalog-src/shows")).uid, process.getuid(), "the runtime overlay is owned by the test service principal");
    assert.equal(fs.statSync(path.join(fixture.runtimeRoot, "catalog-src/shows")).mode & 0o200, 0o200, "the service principal can replace records through the writable directory");
    assert.equal(fs.statSync(path.join(fixture.runtimeRoot, "catalog-src/shows/the-magnus-archives.json")).mode & 0o222, 0, "existing catalogue records are read-only files");
    const firstReport = collectCatalogIntegrityIssues({ siteRoot: fixture.staticRoot, sourceData: before });
    assert.equal(firstReport.stats.shows, 752);
    assert.deepEqual(firstReport.errors, [
      'Provider identity RSS feed "https://feeds.acast.com/public/shows/b6085bcd-3542-4a43-b6a8-021e3fd251b8" is shared by the-magnus-archives, the-magnus-protocol without a valid reciprocal intentional-sharing disposition.',
      'Provider identity Apple collection "1095138637" is shared by the-magnus-archives, the-magnus-protocol without a valid reciprocal intentional-sharing disposition.',
    ]);

    const repair = await repairMagnusProviderSharing(fixture.staticRoot, fixture.releaseRoot);
    assert.deepEqual(repair.changedShowIds, ["the-magnus-archives", "the-magnus-protocol"]);
    assert.equal(repair.integrityErrors, 0);
    assert.equal(repair.catalogueStats.shows, 752);
    const repaired = readCatalogSource(fixture.staticRoot);
    assert.deepEqual(repaired.shows.filter((show) => !beforeMagnus.has(show.id)), beforeOtherShows);
    assert.deepEqual(repaired.collections, beforeCollections);
    assert.deepEqual(repaired.reviewsById, beforeReviews);
    for (const showId of ["the-magnus-archives", "the-magnus-protocol"]) {
      const next = repaired.shows.find((show) => show.id === showId);
      const prior = beforeMagnus.get(showId);
      assert.deepEqual(removeRepairFields(next), removeRepairFields(prior));
      assert.ok(next.metadata.import.externalResearch.sourceUrls.includes("https://rustyquill.com/show/the-magnus-protocol/"));
      assert.equal(next.metadata.import.externalResearch.sharedProviderIdentities.length, 2);
      assert.equal(next.metadata.import.externalResearch.reviewedAt, prior.metadata.import.externalResearch.reviewedAt);
    }
    assert.equal(assertCatalogIntegrity(fixture.staticRoot).errors.length, 0);
    assert.equal(fs.statSync(fixture.releaseRoot).mode & 0o222, 0, "immutable release remains read-only");
    assert.equal(fs.lstatSync(path.join(fixture.staticRoot, "data/entities.json")).isSymbolicLink(), false, "the generated symlink is safely replaced in the runtime overlay");
    assert.equal(fs.statSync(path.join(fixture.releaseRoot, "data/entities.json")).mode & 0o222, 0);

    const nextReleaseRoot = path.join(fixture.base, "srv/echo-archives/releases", NEXT_RELEASE_ID);
    const nextRuntimeRoot = path.join(fixture.base, "srv/echo-archives/runtime/production", NEXT_RELEASE_ID);
    fs.cpSync(fixture.releaseRoot, nextReleaseRoot, { recursive: true });
    makeRuntimeOverlay(nextReleaseRoot, nextRuntimeRoot);
    chmodTreeReadOnly(nextReleaseRoot);
    deploymentPreserve(fixture.runtimeRoot, nextRuntimeRoot);
    const nextStaticRoot = path.join(fixture.base, "srv/echo-archives/runtime/production/current");
    fs.unlinkSync(nextStaticRoot);
    fs.symlinkSync(NEXT_RELEASE_ID, nextStaticRoot);
    fs.unlinkSync(fixture.releaseLink);
    fs.symlinkSync(path.relative(path.dirname(fixture.releaseLink), nextReleaseRoot), fixture.releaseLink);
    fixture.runtimeRoot = nextRuntimeRoot;
    fixture.releaseRoot = nextReleaseRoot;
    fixture.staticRoot = nextStaticRoot;

    const carried = readCatalogSource(fixture.staticRoot);
    assert.equal(assertCatalogIntegrity(fixture.staticRoot).errors.length, 0);
    for (const showId of ["the-magnus-archives", "the-magnus-protocol"]) {
      const show = carried.shows.find((entry) => entry.id === showId);
      assert.equal(show.metadata.import.externalResearch.sharedProviderIdentities.length, 2);
      assert.deepEqual(removeRepairFields(show), removeRepairFields(beforeMagnus.get(showId)));
    }

    const sourceBeforeInterruptedWrite = readCatalogSource(fixture.staticRoot);
    const generatedBeforeInterruptedWrite = fs.readFileSync(path.join(fixture.staticRoot, "data/shows.json"));
    createInterruptedWrite(fixture.staticRoot);
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.staticRoot, "catalog-src/shows/the-magnus-archives.json"), "utf8")).title, "Interrupted test replacement");
    const recovery = recoverCatalogPublication(fixture.staticRoot);
    assert.equal(recovery.pendingDatabaseRecovery.schema, 1);
    completeCatalogPublicationRecovery(fixture.staticRoot);
    assert.deepEqual(readCatalogSource(fixture.staticRoot), sourceBeforeInterruptedWrite);
    assert.deepEqual(fs.readFileSync(path.join(fixture.staticRoot, "data/shows.json")), generatedBeforeInterruptedWrite);
    assert.equal(recoverCatalogPublication(fixture.staticRoot), false);

    const polybiusBefore = readCatalogSource(fixture.staticRoot).shows.find((show) => show.id === "polybius-protocol");
    const polybius = structuredClone(polybiusBefore);
    polybius.length = {
      ...polybius.length,
      episodes: 11,
      label: String(polybius.length.label).replace("10", "11"),
      episodeCounts: { ...polybius.length.episodeCounts, full: 11 },
    };
    const template = carried.shows.find((show) => show.status === "published" && show.reviewStatus !== "indexed-only");
    const additions = NEW_SHOWS.map((item, index) => makePreparedShow(template, item, index));
    const expectedIds = additions.map((show) => show.id);
    const publication = writeShowRecordsAtomically(fixture.staticRoot, [...additions, polybius], {
      deferCommit: true,
      recoveryData: { schema: 1, candidates: [], identities: [] },
    });
    let buildResult;
    try {
      buildResult = await runWithCatalogPublication(publication.publicationToken, async () => {
        const result = await buildCatalog(fixture.staticRoot, { recoverCovers: false });
        assert.equal(assertCatalogIntegrity(fixture.staticRoot).errors.length, 0);
        return result;
      });
      publication.commit();
    } catch (error) {
      publication.rollback();
      completeCatalogPublicationRecovery(fixture.staticRoot);
      throw error;
    }

    const after = readCatalogSource(fixture.staticRoot);
    const publishedIds = new Set(after.shows.map((show) => show.id));
    assert.ok(expectedIds.every((id) => publishedIds.has(id)));
    assert.deepEqual(after.shows.find((show) => show.id === "optog") || null, optogBefore, "OPTOg remains untouched and blocked");
    const afterPolybius = after.shows.find((show) => show.id === "polybius-protocol");
    const expectedPolybius = structuredClone(polybiusBefore);
    expectedPolybius.length = {
      ...expectedPolybius.length,
      episodes: 11,
      label: String(expectedPolybius.length.label).replace("10", "11"),
      episodeCounts: { ...expectedPolybius.length.episodeCounts, full: 11 },
    };
    assert.deepEqual(afterPolybius, expectedPolybius, "Polybius retains all non-count data and editorial fields");
    const afterById = new Map(after.shows.map((show) => [show.id, show]));
    for (const existingShow of sourceBeforeInterruptedWrite.shows) {
      if (existingShow.id === "polybius-protocol") continue;
      assert.deepEqual(afterById.get(existingShow.id), existingShow, `existing show ${existingShow.id} is unchanged`);
    }
    assert.deepEqual(after.collections, beforeCollections);
    assert.deepEqual(after.reviewsById, beforeReviews);
    assert.equal(buildResult.catalog.length, after.shows.filter((show) => show.status === "published").length);
    const generatedShows = JSON.parse(fs.readFileSync(path.join(fixture.staticRoot, "data/shows.json"), "utf8"));
    const generatedIds = new Set(generatedShows.map((show) => show.id));
    assert.ok(expectedIds.every((id) => generatedIds.has(id)));
    assert.equal(generatedShows.find((show) => show.id === "polybius-protocol").length.episodes, 11);
    const searchIndex = JSON.parse(fs.readFileSync(path.join(fixture.staticRoot, "data/search-index.json"), "utf8"));
    const indexedIds = new Set(searchIndex.map((item) => item.id));
    assert.ok(expectedIds.every((id) => indexedIds.has(id)));
    assert.equal(assertCatalogIntegrity(fixture.staticRoot).errors.length, 0);
    assert.equal(fs.statSync(fixture.releaseRoot).mode & 0o222, 0, "publication and recovery leave the release immutable");
  } finally {
    process.umask(previousUmask);
    disposeProductionOverlay(fixture);
  }
});

test("Magnus repair rolls back both source records and generated artefacts when the build fails", async () => {
  const fixture = createProductionOverlay();
  const previousUmask = process.umask(0o027);
  try {
    const sourceBefore = readCatalogSource(fixture.staticRoot);
    const generatedBefore = fs.readFileSync(path.join(fixture.staticRoot, "data/shows.json"));
    await assert.rejects(repairMagnusProviderSharing(fixture.staticRoot, fixture.releaseRoot, {
      buildCatalog: async (root) => {
        fs.writeFileSync(path.join(root, "data/shows.json"), "interrupted generated catalogue");
        throw new Error("simulated post-write build failure");
      },
    }), /simulated post-write build failure/);
    assert.deepEqual(readCatalogSource(fixture.staticRoot), sourceBefore);
    assert.deepEqual(fs.readFileSync(path.join(fixture.staticRoot, "data/shows.json")), generatedBefore);
    assert.equal(recoverCatalogPublication(fixture.staticRoot), false);
    assert.equal(collectCatalogIntegrityIssues({ siteRoot: fixture.staticRoot }).errors.length, 2);
  } finally {
    process.umask(previousUmask);
    disposeProductionOverlay(fixture);
  }
});
