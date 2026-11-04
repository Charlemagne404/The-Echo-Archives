const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { assertCatalogIntegrity } = require("../../backend/lib/catalog-integrity");
const { inspectCoverBuffer } = require("../../backend/lib/import/cover-stage");
const { PLACEHOLDER_COVER } = require("../../backend/lib/cover-sync");
const { buildCatalog } = require("../build-catalog");
const { readCatalogSource, writeShowRecordsAtomically } = require("./catalog-source");
const { recoverCatalogPublication, runWithCatalogPublication } = require("./catalog-publication-transaction");

const ARTWORK_REPAIRS = [
  {
    id: "dont-stop-me-now-an-audiobook-podcast",
    title: "Don't Stop Me Now - An Audiobook Podcast",
    feedUrl: "https://feeds.acast.com/public/shows/6a5cc087740ca41b5abe6ff6",
    artworkUrl: "https://assets.pippa.io/shows/6a5cc087740ca41b5abe6ff6/1786519514632-2f5a2ff1-041a-446d-b40e-5b1fa016e676.jpeg",
    cover: "images/covers/dont-stop-me-now-an-audiobook-podcast.jpg",
    sha256: "6e6e55016692bfcce65d1714ca7ec43fe2d151d10da6d581433bbc0b3eb9450c",
  },
  {
    id: "mina-an-audiobook-podcast-by-roo-bannister",
    title: "Mina - An Audiobook Podcast by Roo Bannister",
    feedUrl: "https://feeds.acast.com/public/shows/6a4264183fa89e333892b6ae",
    artworkUrl: "https://assets.pippa.io/shows/cover/1782735774335-c063ce06-8ea9-43ce-8b44-6c77d316bad7.jpeg",
    cover: "images/covers/mina-an-audiobook-podcast-by-roo-bannister.jpg",
    sha256: "1c18a3a21e9905802e5046345e44964b5f6ab13e1db6ad5249884d8b51e20b2b",
  },
  {
    id: "dyme-an-appalachian-horror-audio-drama",
    title: "Dyme: An Appalachian Horror Audio Drama",
    feedUrl: "https://media.rss.com/the-dyme-podcast/feed.xml",
    artworkUrl: "https://media.rss.com/the-dyme-podcast/podcast_cover_20261016_174310_6495cb2ab3294e4a59642eb249f52d3a.png",
    cover: "images/covers/dyme-an-appalachian-horror-audio-drama.png",
    sha256: "ca0cc6f391922e805751fb27a72a40a0e4b8f39d6ec24fd3672a87380f1570f6",
  },
  {
    id: "richian-presents-dracula",
    title: "Richian Presents: Dracula",
    feedUrl: "https://feeds.transistor.fm/richian-presents-dracula",
    artworkUrl: "https://img.transistorcdn.com/a3Rp96stTx7ph3N4XGZcDc1xdCBhye3bx2yTnMLMw3g/rs:fill:0:0:1/w:1400/h:1400/q:60/mb:500000/aHR0cHM6Ly9pbWct/dXBsb2FkLXByb2R1/Y3Rpb24udHJhbnNp/c3Rvci5mbS8yZjQy/N2VmZmZiYmQyMGUz/MjAxZjhkYTEwODNl/OWFhMi5qcGc.jpg",
    cover: "images/covers/richian-presents-dracula.jpg",
    sha256: "5c4f270147f1a7e20d0310934031f4696f108f840a6c7eeeee9bcbe0a76b8d92",
  },
  {
    id: "the-great-work-and-other-administrative-matters",
    title: "The Great Work and Other Administrative Matters",
    feedUrl: "https://anchor.fm/s/11625e9ac/podcast/rss",
    artworkUrl: "https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/46565507/46565507-1786962136925-b9603237bb399.jpg",
    cover: "images/covers/the-great-work-and-other-administrative-matters.jpg",
    sha256: "c9bd04c993eb4b1f45fab1a92f6c6ec870dcdea30c31536de73262f2af2c4c5c",
  },
  {
    id: "welcome-to-the-brass-eagle",
    title: "Welcome to the Brass Eagle",
    feedUrl: "https://anchor.fm/s/f84a2fec/podcast/rss",
    artworkUrl: "https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/41556115/41556115-1790607577808-59cad9b99d471.jpg",
    cover: "images/covers/welcome-to-the-brass-eagle.jpg",
    sha256: "d4b3e2a5e899bd7e9f147eb5b18f7ead106c09245bb7318b7ce72e8814c21133",
  },
  {
    id: "the-chronicles-of-oz",
    title: "The Chronicles of Oz",
    feedUrl: "https://rss.libsyn.com/shows/119246/destinations/691111.xml",
    artworkUrl: "https://static.libsyn.com/p/assets/e/f/f/b/effbd24b58a65f41d959afa2a1bf1c87/OzPodcastLogo.jpg",
    cover: "images/covers/the-chronicles-of-oz.jpg",
    sha256: "cf53029b54b9ac6bba08324c59dd367d6dda877d5467797cdab437aed0b2d391",
  },
  {
    id: "parsons-nose-radio-theater",
    title: "Parson’s Nose Radio Theater",
    feedUrl: "https://anchor.fm/s/1ff5a5f4/podcast/rss",
    artworkUrl: "https://d3t3ozftmdmh3i.cloudfront.net/production/podcast_uploaded_nologo/5261925/5261925-1678394854560-9322f99c308ab.jpg",
    cover: "images/covers/parsons-nose-radio-theater.jpg",
    sha256: "af21268752f9e00dbed5be5d5c16a5ebe7af1ac735fa2d3ef95d0722485b8854",
  },
];

const PLACEHOLDER_ALT = "Echo Archives placeholder artwork";

function assertRegularDirectory(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const rootPath = fs.realpathSync(root);
  if (!target.startsWith(`${rootPath}${path.sep}`)) throw new Error(`Unsafe directory path: ${relativePath}`);
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(target) !== target) {
    throw new Error(`Expected a regular directory at ${target}.`);
  }
  return target;
}

function readRegularReleaseFile(releaseRoot, relativePath) {
  const releasePath = fs.realpathSync(releaseRoot);
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  let current = releasePath;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || fs.realpathSync(current) !== current) {
      throw new Error(`Refusing an artwork path that follows a symlink: ${current}`);
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(`Artwork parent is not a directory: ${current}`);
    }
    if (index === segments.length - 1 && !stat.isFile()) {
      throw new Error(`Artwork source is not a regular file: ${current}`);
    }
  }
  return { path: current, bytes: fs.readFileSync(current) };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertShowIdentity(show, expected) {
  if (!show) throw new Error(`Expected published show "${expected.id}" is missing from production source.`);
  if (show.title !== expected.title || show.listenLinks?.rss !== expected.feedUrl) {
    throw new Error(`Production identity for "${expected.id}" no longer matches its verified RSS feed.`);
  }
  if (show.status !== "published" || show.reviewStatus !== "indexed-only") {
    throw new Error(`Production publication state for "${expected.id}" changed; refusing an artwork-only update.`);
  }
}

function assertSameNonArtworkFields(beforeShows, afterShows, targetIds) {
  const targets = new Set(targetIds);
  const beforeOther = beforeShows.filter((show) => !targets.has(show.id));
  const afterOther = afterShows.filter((show) => !targets.has(show.id));
  if (JSON.stringify(beforeOther) !== JSON.stringify(afterOther)) {
    throw new Error("The artwork repair changed a catalogue record outside its eight target shows.");
  }
  const beforeById = new Map(beforeShows.map((show) => [show.id, show]));
  for (const show of afterShows.filter((entry) => targets.has(entry.id))) {
    const prior = beforeById.get(show.id);
    const beforeCopy = structuredClone(prior);
    const afterCopy = structuredClone(show);
    delete beforeCopy.cover;
    delete beforeCopy.coverAlt;
    delete afterCopy.cover;
    delete afterCopy.coverAlt;
    if (JSON.stringify(beforeCopy) !== JSON.stringify(afterCopy)) {
      throw new Error(`The artwork repair changed non-artwork metadata for "${show.id}".`);
    }
  }
}

function inspectRuntimeCover(siteRoot, artwork) {
  assertRegularDirectory(siteRoot, "images/covers");
  const targetPath = path.resolve(siteRoot, artwork.cover);
  const coverDirectory = path.resolve(siteRoot, "images/covers");
  if (!targetPath.startsWith(`${coverDirectory}${path.sep}`)) throw new Error(`Unsafe managed cover path: ${artwork.cover}`);
  const stat = fs.existsSync(targetPath) ? fs.lstatSync(targetPath) : null;
  if (!stat) return { exists: false, path: targetPath };
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(targetPath) !== targetPath) {
    throw new Error(`Refusing an unsafe managed cover target: ${targetPath}`);
  }
  const actualHash = sha256(fs.readFileSync(targetPath));
  if (actualHash !== artwork.sha256) throw new Error(`A different local cover already exists at ${targetPath}.`);
  return { exists: true, path: targetPath, sha256: actualHash };
}

function installCoverAtomically(targetPath, bytes) {
  const tempPath = `${targetPath}.repair-${process.pid}-${randomUUID()}.tmp`;
  let descriptor = null;
  try {
    descriptor = fs.openSync(tempPath, "wx", 0o640);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(tempPath, targetPath);
    const directoryDescriptor = fs.openSync(path.dirname(targetPath), "r");
    try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    fs.rmSync(tempPath, { force: true });
  }
}

function writePersistentBackup(siteRoot, sourceData, descriptors) {
  const stagingRoot = assertRegularDirectory(siteRoot, "import-staging");
  const backupRoot = path.join(stagingRoot, "artwork-repair-backups");
  if (!fs.existsSync(backupRoot)) fs.mkdirSync(backupRoot, { mode: 0o700 });
  const backupStat = fs.lstatSync(backupRoot);
  if (!backupStat.isDirectory() || backupStat.isSymbolicLink() || fs.realpathSync(backupRoot) !== backupRoot) {
    throw new Error(`Refusing an unsafe artwork backup directory: ${backupRoot}`);
  }

  const backupId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const backupDirectory = path.join(backupRoot, backupId);
  fs.mkdirSync(backupDirectory, { mode: 0o700 });
  const showRecords = descriptors.map(({ id, show }) => {
    const relativeSourcePath = sourceData.mode === "split" ? `catalog-src/shows/${id}.json` : "data/shows.json";
    const sourcePath = path.join(siteRoot, relativeSourcePath);
    const stat = fs.lstatSync(sourcePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Cannot back up a non-regular catalogue source: ${sourcePath}`);
    const originalBytes = fs.readFileSync(sourcePath);
    return {
      id,
      relativeSourcePath,
      sourceSha256: sha256(originalBytes),
      sourceBase64: sourceData.mode === "split" ? originalBytes.toString("base64") : "",
      record: structuredClone(show),
    };
  });
  const manifest = {
    schema: 1,
    createdAt: new Date().toISOString(),
    operation: "published-show-cover-artwork-repair",
    showIds: descriptors.map(({ id }) => id),
    showRecords,
    priorCoverStates: descriptors.map(({ id, cover, runtime }) => ({
      id,
      cover,
      exists: runtime.exists,
      sha256: runtime.sha256 || "",
    })),
  };
  const targetPath = path.join(backupDirectory, "manifest.json");
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporaryPath, targetPath);
    const directoryDescriptor = fs.openSync(backupDirectory, "r");
    try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    fs.rmSync(temporaryPath, { force: true });
  }
  return path.relative(siteRoot, targetPath);
}

async function repairPublishedCoverArtwork(siteRoot, releaseRoot, options = {}) {
  const readSource = options.readCatalogSource || readCatalogSource;
  const writeShows = options.writeShowRecordsAtomically || writeShowRecordsAtomically;
  const recover = options.recoverCatalogPublication || recoverCatalogPublication;
  const build = options.buildCatalog || buildCatalog;
  const assertIntegrity = options.assertCatalogIntegrity || assertCatalogIntegrity;
  const inspect = options.inspectCoverBuffer || inspectCoverBuffer;
  const installCover = options.installCoverAtomically || installCoverAtomically;

  const recovery = recover(siteRoot);
  if (recovery?.pendingDatabaseRecovery) {
    throw new Error("The prior publisher transaction still needs its database recovery step; recover it before changing artwork.");
  }

  const before = readSource(siteRoot);
  const beforeById = new Map(before.shows.map((show) => [show.id, show]));
  const descriptors = [];
  for (const artwork of ARTWORK_REPAIRS) {
    const show = beforeById.get(artwork.id);
    assertShowIdentity(show, artwork);
    const releaseAsset = readRegularReleaseFile(releaseRoot, artwork.cover);
    const inspected = await inspect(releaseAsset.bytes, path.extname(artwork.cover) === ".png" ? "image/png" : "image/jpeg");
    if (!inspected.echoPublishable || inspected.sha256 !== artwork.sha256) {
      throw new Error(`Verified artwork bytes do not match the approved source for "${artwork.id}".`);
    }
    descriptors.push({ ...artwork, show, bytes: releaseAsset.bytes, runtime: inspectRuntimeCover(siteRoot, artwork) });
  }

  const coverStates = new Set(descriptors.map(({ show, cover }) => show.cover === PLACEHOLDER_COVER ? "placeholder" : show.cover === cover ? "corrected" : "unexpected"));
  if (coverStates.has("unexpected") || coverStates.size > 1) {
    throw new Error("Production cover state is mixed or unexpected; refusing a partial eight-show correction.");
  }
  const allAlreadyCorrected = coverStates.has("corrected");
  if (allAlreadyCorrected && descriptors.some(({ runtime }) => !runtime.exists)) {
    throw new Error("A corrected production record is missing its matching local artwork file.");
  }
  if (descriptors.some(({ runtime }) => runtime.exists && !runtime.sha256)) {
    throw new Error("A production artwork target could not be verified.");
  }

  const needsWrite = !allAlreadyCorrected || descriptors.some(({ show }) => show.coverAlt === PLACEHOLDER_ALT);
  if (!needsWrite) {
    const report = assertIntegrity(siteRoot);
    return {
      changed: false,
      changedShowIds: [],
      showIds: ARTWORK_REPAIRS.map(({ id }) => id),
      catalogueStats: report.stats,
      integrityErrors: report.errors.length,
      covers: descriptors.map(({ id, cover, sha256: hash }) => ({ id, cover, sha256: hash })),
    };
  }

  const backupPath = writePersistentBackup(siteRoot, before, descriptors);
  const nextRecords = descriptors.map(({ show, cover }) => ({
    ...structuredClone(show),
    cover,
    ...(show.coverAlt === PLACEHOLDER_ALT ? { coverAlt: `${show.title} cover art` } : {}),
  }));
  const targetPaths = descriptors.map(({ cover }) => path.resolve(siteRoot, cover));
  const transaction = writeShows(siteRoot, nextRecords, { deferCommit: true, additionalPaths: targetPaths });
  let report = null;
  try {
    for (const descriptor of descriptors) {
      if (!descriptor.runtime.exists) installCover(descriptor.runtime.path, descriptor.bytes);
    }
    await runWithCatalogPublication(transaction.publicationToken, async () => {
      await build(siteRoot, { recoverCovers: false });
      report = assertIntegrity(siteRoot);
      const after = readSource(siteRoot);
      const afterById = new Map(after.shows.map((show) => [show.id, show]));
      assertSameNonArtworkFields(before.shows, after.shows, ARTWORK_REPAIRS.map(({ id }) => id));
      if (JSON.stringify(before.collections) !== JSON.stringify(after.collections)
        || JSON.stringify(before.reviewsById) !== JSON.stringify(after.reviewsById)) {
        throw new Error("The artwork repair changed collections or review data.");
      }
      for (const descriptor of descriptors) {
        const show = afterById.get(descriptor.id);
        if (show?.cover !== descriptor.cover) throw new Error(`Production source did not retain the repaired cover for "${descriptor.id}".`);
        const runtime = inspectRuntimeCover(siteRoot, descriptor);
        if (!runtime.exists) throw new Error(`The local artwork for "${descriptor.id}" was not installed.`);
      }
      const generatedShowsPath = path.join(siteRoot, "data/shows.json");
      const generatedShows = JSON.parse(fs.readFileSync(generatedShowsPath, "utf8"));
      const generatedById = new Map(generatedShows.map((show) => [show.id, show]));
      for (const descriptor of descriptors) {
        if (generatedById.get(descriptor.id)?.cover !== descriptor.cover) {
          throw new Error(`The generated catalogue did not publish the repaired cover for "${descriptor.id}".`);
        }
      }
    });
    transaction.commit();
  } catch (error) {
    transaction.rollback();
    throw error;
  }

  return {
    changed: true,
    changedShowIds: ARTWORK_REPAIRS.map(({ id }) => id),
    backupPath,
    showIds: ARTWORK_REPAIRS.map(({ id }) => id),
    catalogueStats: report?.stats || {},
    integrityErrors: report?.errors?.length || 0,
    covers: descriptors.map(({ id, cover, sha256: hash }) => ({ id, cover, sha256: hash })),
  };
}

module.exports = { ARTWORK_REPAIRS, installCoverAtomically, repairPublishedCoverArtwork };
