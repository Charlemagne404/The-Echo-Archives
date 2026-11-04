#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEPLOY_ROOT = "/srv/echo-archives";
const RUNTIME_CURRENT = path.join(DEPLOY_ROOT, "runtime/production/current");
const RELEASE_CURRENT = path.join(DEPLOY_ROOT, "current");

function requireRegularPath(filePath, { directory = false } = {}) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || fs.realpathSync(filePath) !== filePath) {
    throw new Error(`Refusing an unsafe maintenance path: ${filePath}`);
  }
}

function productionRoots() {
  if (os.userInfo().username !== "echo-archives") {
    throw new Error("Run this maintenance command as the echo-archives service account.");
  }

  for (const linkPath of [RUNTIME_CURRENT, RELEASE_CURRENT]) {
    if (!fs.lstatSync(linkPath).isSymbolicLink()) {
      throw new Error(`Refusing a production pointer that is not a symlink: ${linkPath}`);
    }
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
  const lockPath = path.join(stagingRoot, "publish.lock");
  requireRegularPath(stagingRoot, { directory: true });
  requireRegularPath(lockPath);

  const worker = `
    const { repairMagnusProviderSharing } = require(${JSON.stringify(path.join(releaseRoot, "tools/lib/magnus-provider-sharing-repair.js"))});
    repairMagnusProviderSharing(${JSON.stringify(runtimeRoot)}, ${JSON.stringify(releaseRoot)})
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
  if (child.error) throw new Error(`Could not start the catalogue publication lock: ${child.error.message}`);
  if (child.status !== 0) process.exitCode = child.status || 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exitCode = 1;
}
