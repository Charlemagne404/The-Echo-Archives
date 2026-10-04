const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");

const JOURNAL = ".echo-catalog-transaction";
const instance = randomUUID();
const activeManifests = new Map();
const activePublicationTokens = new Map();
const abandonedRoots = new Set();
const publicationContext = new AsyncLocalStorage();

function containedPath(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) throw new Error("Invalid publication recovery path.");
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Publication recovery path escapes the catalogue.");
  let parent = path.dirname(target);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const realRoot = fs.realpathSync(root);
  const realParent = fs.realpathSync(parent);
  if (realParent !== realRoot && !realParent.startsWith(`${realRoot}${path.sep}`)) throw new Error("Publication recovery follows an external directory symlink.");
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error("Publication recovery requires a regular target.");
  return target;
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
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  if (manifest.schema !== 1 || !Number.isInteger(manifest.pid) || manifest.pid < 1 || typeof manifest.instance !== "string" ||
      !["preparing", "prepared", "restored", "committed"].includes(manifest.phase) || !Array.isArray(manifest.files) || !Array.isArray(manifest.absentDirectories)) {
    throw new Error("Malformed catalogue publication recovery journal.");
  }
  manifest.absentDirectories.forEach((relative) => containedPath(root, relative));
  manifest.files.forEach((file, index) => {
    containedPath(root, file.relative);
    if (typeof file.existed !== "boolean" || file.backup !== `${index}.bin` || !Number.isInteger(file.mode) || file.mode < 0 || file.mode > 0o777) throw new Error("Malformed catalogue publication backup.");
    if (file.existed && ["prepared", "restored"].includes(manifest.phase) && !fs.lstatSync(path.join(directory, file.backup)).isFile()) throw new Error("Catalogue recovery requires a regular backup file.");
  });
  return manifest;
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
    if (!file.existed) { fs.rmSync(target, { force: true }); continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.recover-${randomUUID()}`;
    try {
      fs.copyFileSync(path.join(directory, file.backup), temporary);
      fs.chmodSync(temporary, file.mode);
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
  const retired = path.join(root, `${JOURNAL}-committed-${randomUUID()}`);
  try {
    fs.renameSync(directory, retired);
    fs.rmSync(retired, { recursive: true });
  } catch (error) {
    console.warn(JSON.stringify({ event: "catalogue_journal_cleanup_failed", code: error.code }));
  }
}

function recoverCatalogPublication(root) {
  const directory = path.join(root, JOURNAL);
  if (!fs.existsSync(directory)) { abandonedRoots.delete(path.resolve(root)); activeManifests.delete(path.resolve(root)); activePublicationTokens.delete(path.resolve(root)); return false; }
  const manifest = readManifest(root, directory);
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
  const directory = path.join(root, JOURNAL);
  if (!fs.existsSync(directory)) return false;
  const manifest = readManifest(root, directory);
  return manifest.phase === "prepared" && manifest.pid === process.pid && manifest.instance === instance && !abandonedRoots.has(path.resolve(root));
}

function assertCatalogPublicationReadable(root) {
  const directory = path.join(root, JOURNAL);
  if (!fs.existsSync(directory)) return;
  const manifest = readManifest(root, directory);
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
    const existed = fs.existsSync(target);
    const stat = existed ? fs.lstatSync(target) : null;
    if (stat && !stat.isFile()) throw new Error("Catalogue publication requires regular target files.");
    const backup = `${next.files.length}.bin`;
    if (existed) fs.copyFileSync(target, path.join(directory, backup));
    next.files.push({ relative, backup, existed, mode: stat ? stat.mode & 0o777 : 0o644 });
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
  const directory = path.join(root, JOURNAL);
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
  const directory = path.join(root, JOURNAL);
  if (!fs.existsSync(directory)) return;
  const manifest = readManifest(root, directory);
  if (manifest.phase !== "restored") throw new Error("Catalogue files must be restored before completing database recovery.");
  manifest.phase = "committed";
  writeManifest(directory, manifest);
  cleanupJournal(root, directory);
}

module.exports = { beginCatalogPublication, recoverCatalogPublication, ownsCatalogPublication, assertCatalogPublicationReadable, runWithCatalogPublication, sourcePaths, completeCatalogPublicationRecovery };
