#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  console.error(`Restic successful-snapshot selection failed: ${message}`);
  process.exit(1);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || values.has(name)) fail("invalid arguments");
    values.set(name, value);
  }
  for (const name of ["--snapshots", "--marker", "--host"]) {
    if (!values.has(name)) fail(`missing ${name}`);
  }
  if (values.size !== 3) fail("unsupported argument");
  return {
    snapshotsPath: values.get("--snapshots"),
    markerPath: values.get("--marker"),
    expectedHost: values.get("--host"),
  };
}

function parseMarker(markerPath) {
  const stat = fs.lstatSync(markerPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("success marker is not a safe regular file");
  const raw = fs.readFileSync(markerPath, "utf8");
  if (Buffer.byteLength(raw) > 4096 || !raw.endsWith("\n") || raw.includes("\r")) {
    fail("success marker format is invalid");
  }
  const lines = raw.slice(0, -1).split("\n");
  let completedAt;
  let snapshotId = null;
  let format;
  if (lines.length === 1 && !lines[0].includes("=")) {
    completedAt = lines[0];
    format = "legacy";
  } else if (
    lines.length === 2 &&
    lines[0].startsWith("completed_at=") &&
    lines[1].startsWith("snapshot_id=")
  ) {
    completedAt = lines[0].slice("completed_at=".length);
    snapshotId = lines[1].slice("snapshot_id=".length);
    format = "pinned";
  } else {
    fail("success marker records are invalid");
  }
  const completedMs = Date.parse(completedAt);
  const now = Date.now();
  if (!Number.isFinite(completedMs) || completedMs > now) fail("success marker time is invalid or future");
  if (Math.abs(stat.mtimeMs - completedMs) > 5 * 60 * 1000) {
    fail("success marker content and filesystem time disagree");
  }
  if (snapshotId !== null && !/^[0-9a-f]{64}$/.test(snapshotId)) {
    fail("pinned snapshot ID is invalid");
  }
  return { completedAt, completedMs, format, snapshotId };
}

function classifySource(snapshot, markerFormat) {
  if (!Array.isArray(snapshot.paths) || snapshot.paths.length !== 1) {
    fail("selected snapshot does not contain exactly one source path");
  }
  const source = snapshot.paths[0];
  if (typeof source !== "string" || source.includes("\\") || /[\r\n\0]/.test(source)) {
    fail("selected snapshot source path is unsafe");
  }
  const normalized = path.posix.normalize(source);
  if (/^\/var\/cache\/echo-archives-pi-restic\/verify\.[A-Za-z0-9]+\/recovery$/.test(normalized)) {
    return { sourceRoot: normalized, inventoryFormat: "expanded" };
  }
  if (
    markerFormat === "legacy" &&
    /^\/home\/charlie\/The-Echo-Archives\/backend\/data\/backups\/community-[^/]+\.sqlite$/.test(normalized)
  ) {
    return { sourceRoot: normalized, inventoryFormat: "legacy-database" };
  }
  fail("selected snapshot source is not a reviewed recovery format");
}

function main() {
  const { snapshotsPath, markerPath, expectedHost } = parseArguments(process.argv.slice(2));
  const marker = parseMarker(markerPath);
  let snapshots;
  try {
    snapshots = JSON.parse(fs.readFileSync(snapshotsPath, "utf8"));
  } catch {
    fail("snapshot metadata is unreadable or invalid JSON");
  }
  if (!Array.isArray(snapshots)) fail("snapshot metadata is not an array");
  const eligible = snapshots.filter((snapshot) => {
    const timeMs = Date.parse(snapshot?.time);
    return (
      snapshot?.hostname === expectedHost &&
      Array.isArray(snapshot.tags) &&
      snapshot.tags.includes("echo-archives") &&
      /^[0-9a-f]{64}$/.test(snapshot.id ?? "") &&
      Number.isFinite(timeMs) &&
      timeMs <= marker.completedMs &&
      timeMs <= Date.now()
    );
  });
  let selected;
  if (marker.snapshotId) {
    const matches = eligible.filter((snapshot) => snapshot.id === marker.snapshotId);
    if (matches.length !== 1) fail("pinned successful snapshot is missing or inconsistent");
    selected = matches[0];
  } else {
    eligible.sort((left, right) => Date.parse(right.time) - Date.parse(left.time));
    if (eligible.length === 0) fail("legacy marker has no eligible preceding snapshot");
    selected = eligible[0];
  }
  const source = classifySource(selected, marker.format);
  process.stdout.write(JSON.stringify({
    snapshotId: selected.id,
    completedAt: marker.completedAt,
    markerFormat: marker.format,
    ...source,
  }));
}

main();
