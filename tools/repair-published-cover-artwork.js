#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEPLOY_ROOT = "/srv/echo-archives";
const RUNTIME_CURRENT = path.join(DEPLOY_ROOT, "runtime/production/current");
const RELEASE_CURRENT = path.join(DEPLOY_ROOT, "current");

function productionRoots() {
  if (os.userInfo().username !== "echo-archives") {
    throw new Error("Run this artwork maintenance command as the echo-archives service account.");
  }
  for (const linkPath of [RUNTIME_CURRENT, RELEASE_CURRENT]) {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) throw new Error(`Refusing a production pointer that is not a symlink: ${linkPath}`);
  }

  const runtimeRoot = fs.realpathSync(RUNTIME_CURRENT);
  const releaseRoot = fs.realpathSync(RELEASE_CURRENT);
  const runtimeMatch = /^\/srv\/echo-archives\/runtime\/production\/([0-9a-f]{40})$/.exec(runtimeRoot);
  const releaseMatch = /^\/srv\/echo-archives\/releases\/([0-9a-f]{40})$/.exec(releaseRoot);
  if (!runtimeMatch || !releaseMatch || runtimeMatch[1] !== releaseMatch[1]) {
    throw new Error("The active production release and writable runtime overlay do not match.");
  }
  return { runtimeRoot, releaseRoot };
}

function main() {
  const { runtimeRoot, releaseRoot } = productionRoots();
  const stagingRoot = path.join(runtimeRoot, "import-staging");
  const stagingStat = fs.lstatSync(stagingRoot);
  if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink() || fs.realpathSync(stagingRoot) !== stagingRoot) {
    throw new Error(`Refusing an unsafe publication staging directory: ${stagingRoot}`);
  }
  const lockPath = path.join(stagingRoot, "publish.lock");
  if (fs.existsSync(lockPath) && !fs.lstatSync(lockPath).isFile()) {
    throw new Error(`Refusing an unsafe publication lock path: ${lockPath}`);
  }

  const libraryPath = path.join(releaseRoot, "tools/lib/published-cover-artwork-repair.js");
  const worker = `
    require(${JSON.stringify(libraryPath)}).repairPublishedCoverArtwork(${JSON.stringify(runtimeRoot)}, ${JSON.stringify(releaseRoot)})
      .then((result) => process.stdout.write(JSON.stringify(result, null, 2) + "\\n"))
      .catch((error) => { process.stderr.write((error.message || String(error)) + "\\n"); process.exitCode = 1; });
  `;
  const child = spawnSync("/usr/bin/flock", [
    "--exclusive",
    "--nonblock",
    "--no-fork",
    lockPath,
    process.execPath,
    "-e",
    worker,
  ], {
    env: { PATH: "/usr/bin:/bin", NODE_ENV: "production", STATIC_ROOT: runtimeRoot },
    stdio: "inherit",
  });
  if (child.error) throw new Error(`Could not start the publication lock: ${child.error.message}`);
  if (child.status !== 0) process.exitCode = child.status || 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exitCode = 1;
}
