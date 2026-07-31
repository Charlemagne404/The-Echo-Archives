#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  console.error(`Restic recovery inventory verification failed: ${message}`);
  process.exit(1);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || values.has(name)) {
      fail("use --manifest FILE --listing FILE --snapshot-id ID");
    }
    values.set(name, value);
  }
  for (const name of ["--manifest", "--listing", "--snapshot-id"]) {
    if (!values.has(name)) fail(`missing required argument ${name}`);
  }
  if (values.size !== 3) fail("an unsupported argument was provided");
  return {
    manifestPath: values.get("--manifest"),
    listingPath: values.get("--listing"),
    snapshotId: values.get("--snapshot-id"),
  };
}

function readLines(filePath, description) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch {
    fail(`${description} could not be read`);
  }
  const lines = contents.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) fail(`${description} is empty`);
  return lines;
}

function validateRelativePath(value, description) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail(`${description} contains an unsafe path`);
  }
  return value;
}

function normalizeSnapshotRoot(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) {
    fail("snapshot metadata contains an invalid source root");
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized === "." ||
    normalized === "/" ||
    normalized.split("/").includes("..") ||
    path.posix.basename(normalized) !== "recovery"
  ) {
    fail("snapshot metadata does not identify the guarded recovery root");
  }
  return normalized.replace(/\/$/, "");
}

function parseListing(lines, expectedSnapshotId) {
  const entries = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      fail("restic listing contains invalid JSON");
    }
  });
  const snapshots = entries.filter((entry) => entry?.struct_type === "snapshot");
  if (snapshots.length !== 1 || snapshots[0].id !== expectedSnapshotId) {
    fail("restic listing does not describe exactly the expected snapshot");
  }
  if (!Array.isArray(snapshots[0].paths) || snapshots[0].paths.length !== 1) {
    fail("snapshot metadata does not contain exactly one recovery source root");
  }
  return {
    root: normalizeSnapshotRoot(snapshots[0].paths[0]),
    nodePaths: entries
      .filter((entry) => entry?.struct_type === "node" && typeof entry.path === "string")
      .map((entry) => entry.path),
  };
}

function relativeNodePath(nodePath, snapshotRoot) {
  if (nodePath.includes("\\") || nodePath.split("/").includes("..")) {
    fail("restic listing contains an unsafe node path");
  }
  const normalized = path.posix.normalize(nodePath);
  const rootWithoutSlash = snapshotRoot.replace(/^\//, "");
  const rootName = path.posix.basename(snapshotRoot);
  const prefixes = [snapshotRoot, rootWithoutSlash, rootName, `/${rootName}`];

  for (const prefix of prefixes) {
    if (normalized === prefix) return "";
    if (normalized.startsWith(`${prefix}/`)) {
      return normalized.slice(prefix.length + 1);
    }
  }

  // Restic versions differ here: paths can be root-relative with or without
  // the leading slash. The snapshot metadata above proves there is one source
  // root, so an unmatched leading slash is the snapshot root, not a second
  // filesystem root.
  return normalized.replace(/^\/?\.\//, "").replace(/^\//, "");
}

function main() {
  const { manifestPath, listingPath, snapshotId } = parseArguments(process.argv.slice(2));
  if (!/^[0-9a-f]{64}$/.test(snapshotId)) fail("snapshot ID is not a full Restic ID");

  const required = readLines(manifestPath, "recovery manifest").map((entry) =>
    validateRelativePath(entry, "recovery manifest"),
  );
  if (new Set(required).size !== required.length) {
    fail("recovery manifest contains duplicate paths");
  }

  const listing = parseListing(readLines(listingPath, "restic listing"), snapshotId);
  const remote = new Set();
  for (const nodePath of listing.nodePaths) {
    const relativePath = relativeNodePath(nodePath, listing.root);
    if (relativePath) remote.add(relativePath);
  }

  const missingCount = required.reduce(
    (count, relativePath) => count + (remote.has(relativePath) ? 0 : 1),
    0,
  );
  if (missingCount > 0) {
    fail(
      `remote snapshot is missing ${missingCount} of ${required.length} staged paths ` +
        `(recognized ${remote.size} recovery-relative nodes)`,
    );
  }

  process.stdout.write(
    `Remote recovery inventory contains all ${required.length} staged paths.\n`,
  );
}

main();
