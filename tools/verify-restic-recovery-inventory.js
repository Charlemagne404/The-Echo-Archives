#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 1_000_000;
const MAX_PATH_BYTES = 4096;
const utf8 = new TextDecoder("utf-8", { fatal: true });

function fail(message) {
  console.error(`Restic recovery inventory verification failed: ${message}`);
  process.exit(1);
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--recovery-root" || !argv[1]) {
    fail("use --recovery-root DIRECTORY");
  }
  return argv[1];
}

function decodeUtf8(buffer, description) {
  try {
    return utf8.decode(buffer);
  } catch {
    fail(`${description} is not valid UTF-8`);
  }
}

function validateRelativePath(value, description) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value) > MAX_PATH_BYTES ||
    value.startsWith("/") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail(`${description} contains an unsafe path`);
  }
  return value;
}

function readManifest(manifestPath) {
  const stat = fs.lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("root manifest is not a safe regular file");
  if (stat.size <= 0 || stat.size > MAX_MANIFEST_BYTES) {
    fail("root manifest size is outside the reviewed bounds");
  }
  const contents = decodeUtf8(fs.readFileSync(manifestPath), "root manifest");
  if (!contents.endsWith("\n") || contents.includes("\r")) {
    fail("root manifest must use newline-terminated LF records");
  }
  const entries = contents.slice(0, -1).split("\n").map((entry) =>
    validateRelativePath(entry, "root manifest"),
  );
  if (entries.length === 0 || entries.length > MAX_ENTRIES) {
    fail("root manifest entry count is outside the reviewed bounds");
  }
  if (new Set(entries).size !== entries.length) fail("root manifest contains duplicate paths");
  if (entries.filter((entry) => entry === "REQUIRED_PATHS").length !== 1) {
    fail("root manifest must contain its own path exactly once");
  }
  return new Set(entries);
}

function scanRestoredTree(root) {
  const entries = new Set();
  let manifestCount = 0;

  function walk(absoluteDirectory, relativeDirectory) {
    const names = fs.readdirSync(absoluteDirectory, { encoding: "buffer" });
    for (const nameBuffer of names) {
      const name = decodeUtf8(nameBuffer, "restored path name");
      const relativePath = validateRelativePath(
        relativeDirectory ? `${relativeDirectory}/${name}` : name,
        "restored inventory",
      );
      const absolutePath = path.join(absoluteDirectory, name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) fail("restored inventory contains a symbolic link");
      if (!stat.isDirectory() && !stat.isFile()) {
        fail("restored inventory contains an unsupported filesystem entry");
      }
      entries.add(relativePath);
      if (path.posix.basename(relativePath) === "REQUIRED_PATHS") manifestCount += 1;
      if (entries.size > MAX_ENTRIES) fail("restored inventory exceeds the reviewed entry bound");
      if (stat.isDirectory()) walk(absolutePath, relativePath);
    }
  }

  walk(root, "");
  if (manifestCount !== 1) {
    fail(`restored inventory contains ${manifestCount} manifest-named entries; expected one`);
  }
  return entries;
}

function main() {
  const requestedRoot = parseArguments(process.argv.slice(2));
  const resolvedRoot = path.resolve(requestedRoot);
  let canonicalRoot;
  let rootStat;
  try {
    canonicalRoot = fs.realpathSync(requestedRoot);
    rootStat = fs.lstatSync(requestedRoot);
  } catch {
    fail("restored recovery root is missing or unreadable");
  }
  if (
    canonicalRoot !== resolvedRoot ||
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    path.basename(canonicalRoot) !== "recovery"
  ) {
    fail("restored recovery root is not a canonical guarded directory");
  }

  const manifestPath = path.join(canonicalRoot, "REQUIRED_PATHS");
  const required = readManifest(manifestPath);
  const restored = scanRestoredTree(canonicalRoot);
  let missing = 0;
  let extra = 0;
  for (const entry of required) if (!restored.has(entry)) missing += 1;
  for (const entry of restored) if (!required.has(entry)) extra += 1;
  if (missing > 0 || extra > 0 || required.size !== restored.size) {
    fail(
      `restored inventory differs from its manifest ` +
        `(${missing} missing, ${extra} extra, ${required.size} required, ${restored.size} restored)`,
    );
  }

  process.stdout.write(
    `Restored recovery inventory exactly matches all ${required.size} staged paths.\n`,
  );
}

main();
