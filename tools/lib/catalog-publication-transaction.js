const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");

const JOURNAL = ".echo-catalog-transaction";
const RUNTIME_SNAPSHOT_KIND = "runtime-snapshot";
const LEGACY_SOURCE = "legacy-source.json";
const LEGACY_MARKER = JOURNAL + "-legacy.json";
const instance = randomUUID();
const activeManifests = new Map();
const activePublicationTokens = new Map();
const abandonedRoots = new Set();
const publicationContext = new AsyncLocalStorage();

// Runtime overlays link immutable generated files into a release. Resolve the
// active runtime layout before trusting either its current links or a prior
// release link recorded by a journal carried across deployment.
function releaseLayout(root) {
  const realRoot = fs.realpathSync(root);
  const activeReleaseId = path.basename(realRoot);
  const environmentRoot = path.dirname(realRoot);
  const runtimeRoot = path.dirname(environmentRoot);
  if (!/^[0-9a-f]{40}$/.test(activeReleaseId) || !["production", "staging"].includes(path.basename(environmentRoot)) || path.basename(runtimeRoot) !== "runtime") return null;
  const hostRoot = path.dirname(runtimeRoot);
  return { realRoot, activeReleaseId, releasesRoot: path.join(hostRoot, "releases") };
}

function releaseTarget(root, relative, releaseId) {
  const layout = releaseLayout(root);
  if (!layout || !/^[0-9a-f]{40}$/.test(releaseId)) return null;
  const releaseRoot = path.join(layout.releasesRoot, releaseId);
  try {
    if (fs.realpathSync(releaseRoot) !== releaseRoot) return null;
  } catch (_error) {
    return null;
  }
  const target = path.resolve(releaseRoot, relative);
  if (!target.startsWith(`${releaseRoot}${path.sep}`)) return null;
  return target;
}

function expectedReleaseTarget(root, relative) {
  const layout = releaseLayout(root);
  return layout ? releaseTarget(root, relative, layout.activeReleaseId) : null;
}

function isRegularReleaseFile(target) {
  const stat = optionalLstat(target);
  return Boolean(stat?.isFile() && !stat.isSymbolicLink() && fs.realpathSync(target) === target);
}

function isTrustedReleaseSymlink(root, relative, linkTarget) {
  const expectedTarget = expectedReleaseTarget(root, relative);
  if (!expectedTarget) return false;
  const destination = path.resolve(fs.realpathSync(path.dirname(path.resolve(root, relative))), linkTarget);
  return destination === expectedTarget && isRegularReleaseFile(expectedTarget);
}

function isTrustedReleaseSymlinkInArchive(root, relative, linkTarget) {
  const layout = releaseLayout(root);
  if (!layout) return false;
  const destination = path.resolve(fs.realpathSync(path.dirname(path.resolve(root, relative))), linkTarget);
  const archiveRelative = path.relative(layout.releasesRoot, destination);
  const [releaseId, ...relativeParts] = archiveRelative.split(path.sep);
  if (!releaseId || relativeParts.join(path.sep) !== relative) return false;
  const expectedTarget = releaseTarget(root, relative, releaseId);
  return Boolean(expectedTarget && destination === expectedTarget && isRegularReleaseFile(expectedTarget));
}

function containedPath(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) throw new Error("Invalid publication recovery path.");
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Publication recovery path escapes the catalogue.");
  let parent = path.dirname(target);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const realRoot = fs.realpathSync(root);
  const realParent = fs.realpathSync(parent);
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${path.sep}`)) throw new Error("Publication recovery follows an external directory symlink.");
  const targetStat = optionalLstat(target);
  if (targetStat?.isSymbolicLink() && !isTrustedReleaseSymlink(root, relative, fs.readlinkSync(target))) {
    throw new Error("Publication recovery requires a regular target.");
  }
  return target;
}

function journalPaths(root) {
  const realRoot = fs.realpathSync(root);
  const stagingRoot = path.join(realRoot, "import-staging");
  validateStagingRoot(stagingRoot);
  return {
    current: path.join(stagingRoot, JOURNAL),
    legacy: path.join(realRoot, JOURNAL),
    legacyMarker: path.join(stagingRoot, LEGACY_MARKER),
    stagingRoot,
  };
}

function validateStagingRoot(stagingRoot) {
  const stagingStat = optionalLstat(stagingRoot);
  if (!stagingStat) return false;
  if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink() || fs.realpathSync(stagingRoot) !== stagingRoot) {
    throw new Error("Catalogue publication requires a regular import-staging directory.");
  }
  return true;
}

function ensureStagingRoot(paths, { ownerUid, ownerGid } = {}) {
  if (!validateStagingRoot(paths.stagingRoot)) {
    try { fs.mkdirSync(paths.stagingRoot, { mode: 0o700 }); } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    if (ownerUid !== undefined && ownerGid !== undefined) {
      fs.chownSync(paths.stagingRoot, ownerUid, ownerGid);
      fs.chmodSync(paths.stagingRoot, 0o700);
    }
  }
  validateStagingRoot(paths.stagingRoot);
}

function optionalLstat(filePath) {
  try { return fs.lstatSync(filePath); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function assertJournalDirectory(directory) {
  const stat = optionalLstat(directory);
  if (!stat) return false;
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== path.resolve(directory)) {
    throw new Error("Catalogue publication journal must be a regular directory.");
  }
  return true;
}

function writePrivateFile(filePath, content) {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
}

function writePrivateJson(filePath, value) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    writePrivateFile(temporary, JSON.stringify(value));
    const existing = optionalLstat(filePath);
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error("Catalogue journal marker must be a regular file.");
    fs.renameSync(temporary, filePath);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function legacyFingerprint(directory, manifest) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(path.join(directory, "manifest.json")));
  manifest.files.forEach((file, index) => {
    const backupPath = path.join(directory, file.backup);
    const stat = optionalLstat(backupPath);
    hash.update(`\0${index}:${file.backup}\0`);
    if (!stat) {
      hash.update("missing");
      return;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Catalogue recovery requires a regular backup file.");
    hash.update(fs.readFileSync(backupPath));
  });
  return hash.digest("hex");
}

function readLegacyMarker(paths) {
  const stat = optionalLstat(paths.legacyMarker);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Catalogue legacy journal marker must be a regular file.");
  const marker = JSON.parse(fs.readFileSync(paths.legacyMarker, "utf8"));
  if (marker.schema !== 1 || !/^[0-9a-f]{64}$/.test(marker.fingerprint || "")) throw new Error("Malformed catalogue legacy journal marker.");
  return marker.fingerprint;
}

function legacyJournalIsRetired(root, paths, directory, manifest = readManifest(root, directory)) {
  return readLegacyMarker(paths) === legacyFingerprint(directory, manifest);
}

function migrateLegacyJournal(root, paths, legacyDirectory) {
  const manifest = readManifest(root, legacyDirectory);
  const fingerprint = legacyFingerprint(legacyDirectory, manifest);
  const temporary = path.join(paths.stagingRoot, `${JOURNAL}-migrate-${randomUUID()}`);
  fs.mkdirSync(temporary, { mode: 0o700 });
  try {
    for (const file of manifest.files) {
      const source = path.join(legacyDirectory, file.backup);
      const stat = optionalLstat(source);
      if (!stat) continue;
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Catalogue recovery requires a regular backup file.");
      writePrivateFile(path.join(temporary, file.backup), fs.readFileSync(source));
    }
    writePrivateFile(path.join(temporary, LEGACY_SOURCE), JSON.stringify({ schema: 1, fingerprint }));
    writeManifest(temporary, manifest);
    try {
      fs.renameSync(temporary, paths.current);
    } catch (error) {
      if (!new Set(["EEXIST", "ENOTEMPTY"]).has(error.code) || !assertJournalDirectory(paths.current)) throw error;
      fs.rmSync(temporary, { recursive: true, force: true });
    }
    return paths.current;
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function existingJournal(root) {
  const paths = journalPaths(root);
  if (assertJournalDirectory(paths.current)) return { ...paths, directory: paths.current };
  if (!assertJournalDirectory(paths.legacy)) return { ...paths, directory: null };
  const manifest = readManifest(root, paths.legacy);
  if (manifest.kind !== RUNTIME_SNAPSHOT_KIND && legacyJournalIsRetired(root, paths, paths.legacy, manifest)) return { ...paths, directory: null };
  return { ...paths, directory: paths.legacy };
}

function recoverableJournal(root) {
  const paths = journalPaths(root);
  if (assertJournalDirectory(paths.current)) return { ...paths, directory: paths.current };
  if (!assertJournalDirectory(paths.legacy)) return { ...paths, directory: null };
  const manifest = readManifest(root, paths.legacy);
  if (manifest.kind === RUNTIME_SNAPSHOT_KIND) return { ...paths, directory: paths.legacy };
  if (legacyJournalIsRetired(root, paths, paths.legacy, manifest)) return { ...paths, directory: null };
  ensureStagingRoot(paths);
  return { ...paths, directory: migrateLegacyJournal(root, paths, paths.legacy) };
}

function writeManifest(directory, manifest) {
  const temporary = path.join(directory, `manifest-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
    const descriptor = fs.openSync(temporary, "r");
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, path.join(directory, "manifest.json"));
  } finally { fs.rmSync(temporary, { force: true }); }
}

function readManifest(root, directory) {
  if (!assertJournalDirectory(directory)) throw new Error("Catalogue publication recovery journal is missing.");
  const manifestPath = path.join(directory, "manifest.json");
  const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("Catalogue publication recovery manifest must be a regular file.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schema !== 1 || !Number.isInteger(manifest.pid) || manifest.pid < 1 || typeof manifest.instance !== "string" ||
      !["preparing", "prepared", "restored", "committed"].includes(manifest.phase) || !Array.isArray(manifest.files) || !Array.isArray(manifest.absentDirectories)) {
    throw new Error("Malformed catalogue publication recovery journal.");
  }
  if (manifest.kind !== undefined && manifest.kind !== RUNTIME_SNAPSHOT_KIND) throw new Error("Malformed catalogue publication recovery journal.");
  if (manifest.kind === RUNTIME_SNAPSHOT_KIND &&
      (manifest.phase !== "prepared" || manifest.files.length !== 0 || manifest.absentDirectories.length !== 0 || manifest.recoveryData !== undefined)) {
    throw new Error("Malformed runtime snapshot journal.");
  }
  manifest.absentDirectories.forEach((relative) => containedPath(root, relative));
  manifest.files.forEach((file, index) => {
    containedPath(root, file.relative);
    if (typeof file.existed !== "boolean" || file.backup !== `${index}.bin` || !Number.isInteger(file.mode) || file.mode < 0 || file.mode > 0o777) throw new Error("Malformed catalogue publication backup.");
    const kind = file.kind || "file";
    if (!new Set(["file", "symlink"]).has(kind) || (kind === "symlink" &&
      (!file.existed || typeof file.symlinkTarget !== "string" || !isTrustedReleaseSymlinkInArchive(root, file.relative, file.symlinkTarget))) ||
      (kind === "file" && file.symlinkTarget !== undefined)) throw new Error("Malformed catalogue publication backup.");
    if (file.existed && ["prepared", "restored"].includes(manifest.phase) && !fs.lstatSync(path.join(directory, file.backup)).isFile()) throw new Error("Catalogue recovery requires a regular backup file.");
  });
  return manifest;
}

function matchesSnapshot(root, directory, file, target) {
  const current = optionalLstat(target);
  if (!file.existed) return !current;
  if (!current) return false;

  if ((file.kind || "file") === "symlink") {
    if (!current.isSymbolicLink()) return false;
    const currentTarget = fs.readlinkSync(target);
    if (currentTarget === file.symlinkTarget) return true;
    // A journal copied into a later runtime overlay must not restore generated
    // artifacts from its old release over the new release's immutable links.
    return isTrustedReleaseSymlink(root, file.relative, currentTarget) &&
      isTrustedReleaseSymlinkInArchive(root, file.relative, file.symlinkTarget);
  }
  if (!current.isFile() || current.isSymbolicLink() || (current.mode & 0o777) !== file.mode) return false;

  const backupPath = path.join(directory, file.backup);
  const backupStat = optionalLstat(backupPath);
  if (!backupStat?.isFile() || backupStat.isSymbolicLink()) throw new Error("Catalogue recovery requires a regular backup file.");
  return current.size === backupStat.size && fs.readFileSync(target).equals(fs.readFileSync(backupPath));
}

function restore(root, directory, manifest) {
  // Backups remain until every restore finishes, so recovery is repeatable
  // even if a second process interruption happens during rollback.
  for (const file of manifest.files) {
    const target = containedPath(root, file.relative);
    for (const name of fs.existsSync(path.dirname(target)) ? fs.readdirSync(path.dirname(target)) : []) {
      if (name.startsWith(`${path.basename(target)}.import-`) || name.startsWith(`${path.basename(target)}.recover-`)) {
        fs.rmSync(path.join(path.dirname(target), name), { force: true });
      }
    }
    if (matchesSnapshot(root, directory, file, target)) continue;
    if (!file.existed) { fs.rmSync(target, { force: true }); continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.recover-${randomUUID()}`;
    try {
      if ((file.kind || "file") === "symlink") {
        if (!isTrustedReleaseSymlink(root, file.relative, file.symlinkTarget)) throw new Error("Catalogue recovery symlink target is unsafe.");
        fs.symlinkSync(file.symlinkTarget, temporary);
      } else {
        fs.copyFileSync(path.join(directory, file.backup), temporary);
        fs.chmodSync(temporary, file.mode);
      }
      fs.renameSync(temporary, target);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  for (const relative of [...manifest.absentDirectories].sort((left, right) => right.length - left.length)) {
    const directoryPath = containedPath(root, relative);
    if (fs.existsSync(directoryPath) && fs.readdirSync(directoryPath).length === 0) fs.rmdirSync(directoryPath);
  }
}

function cleanupJournal(root, directory) {
  abandonedRoots.delete(path.resolve(root));
  activeManifests.delete(path.resolve(root));
  activePublicationTokens.delete(path.resolve(root));
  // Retire atomically before recursive deletion: interrupted cleanup must not
  // turn a committed journal into a malformed active one.
  const retired = path.join(path.dirname(directory), `${JOURNAL}-committed-${randomUUID()}`);
  try {
    const legacySourcePath = path.join(directory, LEGACY_SOURCE);
    const legacySourceStat = optionalLstat(legacySourcePath);
    if (legacySourceStat) {
      if (!legacySourceStat.isFile() || legacySourceStat.isSymbolicLink()) throw new Error("Catalogue legacy journal source must be a regular file.");
      const legacySource = JSON.parse(fs.readFileSync(legacySourcePath, "utf8"));
      if (legacySource.schema !== 1 || !/^[0-9a-f]{64}$/.test(legacySource.fingerprint || "")) throw new Error("Malformed catalogue legacy journal source.");
      const paths = journalPaths(root);
      writePrivateJson(paths.legacyMarker, { schema: 1, fingerprint: legacySource.fingerprint });
    }
    fs.renameSync(directory, retired);
    fs.rmSync(retired, { recursive: true });
  } catch (error) {
    console.warn(JSON.stringify({ event: "catalogue_journal_cleanup_failed", code: error.code }));
  }
}

function publicationInProgressError(message = "Catalogue publication is in progress in another process.") {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

function recoverRuntimeSnapshot(root, directory, manifest) {
  let processExists = true;
  try {
    process.kill(manifest.pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") processExists = false;
    else if (error.code !== "EPERM") throw error;
  }
  if (processExists) throw publicationInProgressError("A deployment runtime snapshot is in progress.");

  // Runtime snapshots hold the journal name only as a temporary exclusion gate.
  // They never edit catalogue files, so a dead owner needs only journal cleanup.
  cleanupJournal(root, directory);
  return false;
}

function recoverCatalogPublication(root) {
  const { directory } = recoverableJournal(root);
  if (!directory) { abandonedRoots.delete(path.resolve(root)); activeManifests.delete(path.resolve(root)); activePublicationTokens.delete(path.resolve(root)); return false; }
  const manifest = readManifest(root, directory);
  if (manifest.kind === RUNTIME_SNAPSHOT_KIND) return recoverRuntimeSnapshot(root, directory, manifest);
  if (manifest.phase === "committed") {
    cleanupJournal(root, directory);
    return false;
  }
  if (manifest.phase === "restored") return { pendingDatabaseRecovery: manifest.recoveryData };
  if (manifest.pid === process.pid && manifest.instance === instance && !abandonedRoots.has(path.resolve(root))) return false;
  if (manifest.pid !== process.pid) {
    try {
      process.kill(manifest.pid, 0);
      const error = new Error("Catalogue publication is in progress in another process.");
      error.statusCode = 503;
      throw error;
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  if (manifest.phase === "prepared") {
    restore(root, directory, manifest);
    if (manifest.recoveryData) {
      manifest.phase = "restored";
      writeManifest(directory, manifest);
      console.warn(JSON.stringify({ event: "catalogue_publication_recovered", files: manifest.files.length, databaseRecovery: "pending" }));
      return { pendingDatabaseRecovery: manifest.recoveryData };
    }
  }
  manifest.phase = "committed";
  writeManifest(directory, manifest);
  cleanupJournal(root, directory);
  console.warn(JSON.stringify({ event: "catalogue_publication_recovered", files: manifest.files.length }));
  return true;
}

function ownsCatalogPublication(root) {
  const { directory } = existingJournal(root);
  if (!directory) return false;
  const manifest = readManifest(root, directory);
  return manifest.kind !== RUNTIME_SNAPSHOT_KIND && manifest.phase === "prepared" && manifest.pid === process.pid && manifest.instance === instance && !abandonedRoots.has(path.resolve(root));
}

function assertCatalogPublicationReadable(root) {
  const { directory } = existingJournal(root);
  if (!directory) return;
  const manifest = readManifest(root, directory);
  if (manifest.kind === RUNTIME_SNAPSHOT_KIND) throw publicationInProgressError("A deployment runtime snapshot is in progress.");
  if (["committed", "restored"].includes(manifest.phase) || (manifest.pid === process.pid && manifest.instance === instance && !abandonedRoots.has(path.resolve(root)))) return;
  const error = new Error("Catalogue publication is incomplete; retry after the publisher finishes or startup recovery runs.");
  error.statusCode = 503;
  throw error;
}

function sourcePaths(root) {
  const files = [];
  function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Catalogue publication requires regular source paths.");
      if (entry.isDirectory()) walk(target);
      else if (entry.name.endsWith(".json")) files.push(target);
    }
  }
  walk(path.join(root, "catalog-src"));
  return files;
}

function generatedPaths(root) {
  const names = ["shows", "collections", "entities", "entity-graph", "runtime-evidence", "search-index", "archive-stats", "tag-taxonomy"];
  const files = names.map((name) => path.join(root, "data", `${name}.json`));
  files.push(path.join(root, "docs/generated/catalog-status.json"), path.join(root, "docs/generated/catalog-status.md"));
  const reviews = path.join(root, "data/reviews");
  if (fs.existsSync(reviews)) fs.readdirSync(reviews).filter((name) => name.endsWith(".json")).forEach((name) => files.push(path.join(reviews, name)));
  return files;
}

function extendSnapshots(root, directory, manifest, targets, { includeGenerated, includeSource }) {
  const next = { ...manifest, files: [...manifest.files], absentDirectories: [...manifest.absentDirectories] };
  const planned = typeof targets === "function" ? targets() : targets;
  const paths = [...planned, ...(includeGenerated ? generatedPaths(root) : []), ...(includeSource ? sourcePaths(root) : [])];
  const seen = new Set(next.files.map((file) => file.relative));
  for (const targetPath of paths) {
    const relative = path.relative(root, targetPath);
    if (seen.has(relative)) continue;
    seen.add(relative);
    const target = containedPath(root, relative);
    let parent = path.dirname(target);
    while (!fs.existsSync(parent)) {
      const absent = path.relative(root, parent);
      if (!next.absentDirectories.includes(absent)) next.absentDirectories.push(absent);
      parent = path.dirname(parent);
    }
    const stat = optionalLstat(target);
    const existed = Boolean(stat);
    const isSymlink = Boolean(stat?.isSymbolicLink());
    if (stat && !stat.isFile() && !isSymlink) throw new Error("Catalogue publication requires regular target files.");
    const symlinkTarget = isSymlink ? fs.readlinkSync(target) : undefined;
    if (isSymlink && !isTrustedReleaseSymlink(root, relative, symlinkTarget)) throw new Error("Catalogue publication requires regular target files.");
    const backup = `${next.files.length}.bin`;
    if (existed) fs.copyFileSync(target, path.join(directory, backup));
    next.files.push({
      relative,
      backup,
      existed,
      mode: stat ? (isSymlink ? 0o777 : stat.mode & 0o777) : 0o644,
      ...(isSymlink ? { kind: "symlink", symlinkTarget } : {}),
    });
  }
  next.phase = "prepared";
  writeManifest(directory, next);
  Object.assign(manifest, next);
}

function beginCatalogPublication(root, targets, { includeGenerated = false, includeSource = false, joinExisting = false, recoveryData = null } = {}) {
  const recovered = recoverCatalogPublication(root);
  if (recovered?.pendingDatabaseRecovery) {
    const error = new Error("Interrupted publication needs database recovery before another catalogue write.");
    error.statusCode = 503;
    throw error;
  }
  const paths = journalPaths(root);
  const directory = paths.current;
  const key = path.resolve(root);
  const activeToken = activePublicationTokens.get(key);
  // A live same-process journal alone cannot prove that a writer is nested;
  // require the async parent token so concurrent requests fail closed.
  if (joinExisting && activeToken && publicationContext.getStore() === activeToken && ownsCatalogPublication(root)) {
    const manifest = activeManifests.get(key);
    if (!manifest) throw new Error("The current publication owner is unavailable.");
    extendSnapshots(root, directory, manifest, targets, { includeGenerated, includeSource });
    return { joined: true, publicationToken: activeToken, commit() {}, rollback() {} };
  }
  ensureStagingRoot(paths);
  try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) {
    if (error.code === "EEXIST") error.statusCode = 503;
    throw error;
  }
  const manifest = { schema: 1, pid: process.pid, instance, phase: "preparing", files: [], absentDirectories: [], recoveryData };
  const publicationToken = Object.freeze({ root: key, id: randomUUID() });
  try {
    writeManifest(directory, manifest);
    activeManifests.set(key, manifest);
    activePublicationTokens.set(key, publicationToken);
    extendSnapshots(root, directory, manifest, targets, { includeGenerated, includeSource });
  } catch (error) {
    activeManifests.delete(key);
    activePublicationTokens.delete(key);
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  let finished = false;
  return {
    publicationToken,
    commit() {
      if (finished) return;
      manifest.phase = "committed";
      writeManifest(directory, manifest);
      finished = true;
      activeManifests.delete(key);
      cleanupJournal(root, directory);
    },
    rollback() {
      if (finished) return;
      try {
        restore(root, directory, manifest);
        manifest.phase = manifest.recoveryData ? "restored" : "committed";
        writeManifest(directory, manifest);
        if (!manifest.recoveryData) cleanupJournal(root, directory);
        finished = true;
        activeManifests.delete(key);
        activePublicationTokens.delete(key);
      } catch (error) {
        abandonedRoots.add(key);
        throw error;
      }
    },
  };
}

function runWithCatalogPublication(publicationToken, operation) {
  if (!publicationToken || typeof operation !== "function") throw new Error("A catalogue publication token and operation are required.");
  return publicationContext.run(publicationToken, operation);
}

function completeCatalogPublicationRecovery(root) {
  const { directory } = recoverableJournal(root);
  if (!directory) return;
  const manifest = readManifest(root, directory);
  if (manifest.phase !== "restored") throw new Error("Catalogue files must be restored before completing database recovery.");
  manifest.phase = "committed";
  writeManifest(directory, manifest);
  cleanupJournal(root, directory);
}

function beginCatalogRuntimeSnapshot(root, { ownerUid, ownerGid } = {}) {
  const hasOwner = ownerUid !== undefined || ownerGid !== undefined;
  if (hasOwner && (!Number.isInteger(ownerUid) || ownerUid < 0 || !Number.isInteger(ownerGid) || ownerGid < 0)) {
    throw new Error("Runtime snapshot owner must include valid numeric uid and gid values.");
  }
  const resolvedRoot = path.resolve(root);
  const recovery = recoverCatalogPublication(resolvedRoot);
  if (recovery?.pendingDatabaseRecovery) {
    throw publicationInProgressError("Interrupted publication needs database recovery before a runtime snapshot.");
  }
  const paths = journalPaths(resolvedRoot);
  ensureStagingRoot(paths, hasOwner ? { ownerUid, ownerGid } : {});
  const directory = paths.current;
  try {
    fs.mkdirSync(directory, { mode: 0o755 });
  } catch (error) {
    if (error.code === "EEXIST") throw publicationInProgressError("A catalogue publication or runtime snapshot already holds the journal.");
    throw error;
  }

  const snapshotInstance = `${instance}:runtime-snapshot:${randomUUID()}`;
  const manifest = {
    schema: 1,
    kind: RUNTIME_SNAPSHOT_KIND,
    pid: process.pid,
    instance: snapshotInstance,
    phase: "prepared",
    files: [],
    absentDirectories: [],
  };
  try {
    // The helper runs as root, while the application account must be able to
    // read this metadata to reject writes. It contains no catalogue data.
    fs.chmodSync(directory, 0o755);
    writeManifest(directory, manifest);
    fs.chmodSync(path.join(directory, "manifest.json"), 0o644);
    if (hasOwner) {
      // Let normal journal recovery remove an abandoned snapshot reservation
      // using the same account that owns publication journals.
      fs.chownSync(directory, ownerUid, ownerGid);
      fs.chmodSync(directory, 0o700);
    }
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }

  let released = false;
  return {
    release() {
      if (released) return;
      const current = readManifest(resolvedRoot, directory);
      if (current.kind !== RUNTIME_SNAPSHOT_KIND || current.pid !== process.pid || current.instance !== snapshotInstance) {
        throw new Error("Runtime snapshot journal ownership changed before release.");
      }
      cleanupJournal(resolvedRoot, directory);
      released = true;
    },
  };
}

module.exports = { beginCatalogPublication, beginCatalogRuntimeSnapshot, recoverCatalogPublication, ownsCatalogPublication, assertCatalogPublicationReadable, runWithCatalogPublication, sourcePaths, completeCatalogPublicationRecovery };
