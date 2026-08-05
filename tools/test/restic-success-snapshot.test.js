const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const SELECTOR = path.join(ROOT, "tools", "select-restic-success-snapshot.js");
const HOST = "charlie-Legion-T530-28ICB";

function snapshot(idCharacter, time, source, overrides = {}) {
  return {
    id: idCharacter.repeat(64),
    time,
    hostname: HOST,
    tags: ["echo-archives"],
    paths: [source],
    ...overrides,
  };
}

function writeFixture(tempRoot, snapshots, markerText, markerTime) {
  const snapshotsPath = path.join(tempRoot, "snapshots.json");
  const markerPath = path.join(tempRoot, "success-marker");
  fs.writeFileSync(snapshotsPath, JSON.stringify(snapshots));
  fs.writeFileSync(markerPath, markerText);
  fs.utimesSync(markerPath, markerTime, markerTime);
  return { snapshotsPath, markerPath };
}

function runSelector(fixture) {
  return spawnSync(
    process.execPath,
    [SELECTOR, "--snapshots", fixture.snapshotsPath, "--marker", fixture.markerPath, "--host", HOST],
    { cwd: ROOT, encoding: "utf8" },
  );
}

test("legacy marker selects the last successful snapshot before newer orphans", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restic-select-legacy-"));
  const completed = new Date(Date.now() - 60 * 60 * 1000);
  try {
    const verified = snapshot(
      "a",
      new Date(completed.getTime() - 10_000).toISOString(),
      "/home/charlie/The-Echo-Archives/backend/data/backups/community-verified.sqlite",
    );
    const orphan = snapshot(
      "b",
      new Date(completed.getTime() + 30 * 60 * 1000).toISOString(),
      "/var/cache/echo-archives-pi-restic/verify.orphan/recovery",
    );
    const fixture = writeFixture(
      tempRoot,
      [verified, orphan],
      `${completed.toISOString()}\n`,
      completed,
    );
    const result = runSelector(fixture);
    assert.equal(result.status, 0, result.stderr);
    const selected = JSON.parse(result.stdout);
    assert.equal(selected.snapshotId, verified.id);
    assert.equal(selected.markerFormat, "legacy");
    assert.equal(selected.inventoryFormat, "legacy-database");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned marker selects only its exact expanded snapshot", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restic-select-pinned-"));
  const completed = new Date(Date.now() - 30 * 60 * 1000);
  try {
    const pinned = snapshot(
      "c",
      new Date(completed.getTime() - 10_000).toISOString(),
      "/var/lib/echo-archives-monitoring/recovery-staging.fixture/recovery",
    );
    const fixture = writeFixture(
      tempRoot,
      [pinned],
      `completed_at=${completed.toISOString()}\nsnapshot_id=${pinned.id}\n`,
      completed,
    );
    const result = runSelector(fixture);
    assert.equal(result.status, 0, result.stderr);
    const selected = JSON.parse(result.stdout);
    assert.equal(selected.snapshotId, pinned.id);
    assert.equal(selected.markerFormat, "pinned");
    assert.equal(selected.inventoryFormat, "expanded");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned marker rejects the obsolete cache-nested expanded source", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restic-select-cache-source-"));
  const completed = new Date(Date.now() - 30 * 60 * 1000);
  try {
    const excluded = snapshot(
      "9",
      new Date(completed.getTime() - 10_000).toISOString(),
      "/var/cache/echo-archives-pi-restic/verify.excluded/recovery",
    );
    const fixture = writeFixture(
      tempRoot,
      [excluded],
      `completed_at=${completed.toISOString()}\nsnapshot_id=${excluded.id}\n`,
      completed,
    );
    const result = runSelector(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not a reviewed recovery format/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("selector rejects wrong-host, future, malformed, and unpinned successful evidence", () => {
  const completed = new Date(Date.now() - 20 * 60 * 1000);
  const cases = [
    {
      snapshots: [snapshot("d", completed.toISOString(), "/tmp/recovery", { hostname: "other" })],
      marker: `${completed.toISOString()}\n`,
    },
    {
      snapshots: [],
      marker: `${new Date(Date.now() + 60_000).toISOString()}\n`,
    },
    { snapshots: [], marker: "not-a-time\n" },
    {
      snapshots: [snapshot("e", completed.toISOString(), "/var/cache/echo-archives-pi-restic/verify.x/recovery")],
      marker: `completed_at=${completed.toISOString()}\nsnapshot_id=${"f".repeat(64)}\n`,
    },
  ];
  for (const [index, fixtureCase] of cases.entries()) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `echo-restic-select-bad-${index}-`));
    try {
      const fixture = writeFixture(tempRoot, fixtureCase.snapshots, fixtureCase.marker, completed);
      const result = runSelector(fixture);
      assert.notEqual(result.status, 0);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("selector consumes real tagged Restic 0.16 snapshot metadata", (context) => {
  const version = spawnSync("restic", ["version"], { encoding: "utf8" });
  if (version.status !== 0) {
    context.skip("restic is not installed in this test environment");
    return;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restic-select-real-"));
  const repository = path.join(tempRoot, "repository");
  const recoveryRoot = path.join(tempRoot, "input", "recovery");
  const environment = { ...process.env, RESTIC_PASSWORD: "disposable-test-password" };
  try {
    fs.mkdirSync(recoveryRoot, { recursive: true });
    fs.writeFileSync(path.join(recoveryRoot, "REQUIRED_PATHS"), "REQUIRED_PATHS\n");
    const initialize = spawnSync("restic", ["init", "--repo", repository], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(initialize.status, 0, initialize.stderr);
    const backup = spawnSync(
      "restic",
      ["backup", "--json", "--tag", "echo-archives", "--repo", repository, recoveryRoot],
      { encoding: "utf8", env: environment },
    );
    assert.equal(backup.status, 0, backup.stderr);
    const summary = backup.stdout
      .trim()
      .split(/\n+/)
      .map((line) => JSON.parse(line))
      .findLast((entry) => entry.message_type === "summary");
    const snapshots = spawnSync(
      "restic",
      ["snapshots", "--json", "--tag", "echo-archives", "--repo", repository],
      { encoding: "utf8", env: environment },
    );
    assert.equal(snapshots.status, 0, snapshots.stderr);
    const completed = new Date();
    const actualSnapshots = JSON.parse(snapshots.stdout).map((entry) => ({
      ...entry,
      paths: ["/var/lib/echo-archives-monitoring/recovery-staging.realfixture/recovery"],
    }));
    const fixture = writeFixture(
      tempRoot,
      actualSnapshots,
      `completed_at=${completed.toISOString()}\nsnapshot_id=${summary.snapshot_id}\n`,
      completed,
    );
    const selected = runSelector(fixture);
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(JSON.parse(selected.stdout).snapshotId, summary.snapshot_id);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("recovery staging remains outside the active Restic cache and restores files", (context) => {
  const version = spawnSync("restic", ["version"], { encoding: "utf8" });
  if (version.status !== 0) {
    context.skip("restic is not installed in this test environment");
    return;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restic-staging-"));
  const repository = path.join(tempRoot, "repository");
  const cacheRoot = path.join(tempRoot, "restic-cache");
  const stateRoot = path.join(tempRoot, "service-state");
  const recoveryRoot = path.join(stateRoot, "recovery-staging.fixture", "recovery");
  const restored = path.join(stateRoot, "remote-restore.fixture");
  const restoredRecovery = path.join(restored, "recovery");
  const environment = {
    ...process.env,
    RESTIC_PASSWORD: "disposable-test-password",
    RESTIC_CACHE_DIR: cacheRoot,
  };
  try {
    fs.mkdirSync(path.join(recoveryRoot, "database"), { recursive: true });
    fs.writeFileSync(path.join(recoveryRoot, "database", "community.sqlite"), "fixture database");
    fs.writeFileSync(
      path.join(recoveryRoot, "REQUIRED_PATHS"),
      "database\ndatabase/community.sqlite\nREQUIRED_PATHS\n",
    );
    const initialize = spawnSync("restic", ["init", "--repo", repository], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(initialize.status, 0, initialize.stderr);
    const backup = spawnSync(
      "restic",
      ["backup", "--json", "--tag", "echo-archives", "--repo", repository, recoveryRoot],
      { encoding: "utf8", env: environment },
    );
    assert.equal(backup.status, 0, backup.stderr);
    const summary = backup.stdout
      .trim()
      .split(/\n+/)
      .map((line) => JSON.parse(line))
      .findLast((entry) => entry.message_type === "summary");
    assert.equal(summary.total_files_processed, 2);
    assert.ok(summary.total_bytes_processed > 0);
    const restore = spawnSync(
      "restic",
      [
        "restore",
        "--verify",
        "--target",
        restoredRecovery,
        "--repo",
        repository,
        `${summary.snapshot_id}:${recoveryRoot}`,
      ],
      { encoding: "utf8", env: environment },
    );
    assert.equal(restore.status, 0, restore.stderr);
    assert.equal(
      fs.readFileSync(path.join(restoredRecovery, "database", "community.sqlite"), "utf8"),
      "fixture database",
    );
    const verification = spawnSync(
      process.execPath,
      [path.join(ROOT, "tools", "verify-restic-recovery-inventory.js"), "--recovery-root", restoredRecovery],
      { encoding: "utf8" },
    );
    assert.equal(verification.status, 0, verification.stderr);

    const rejectedRoot = path.join(cacheRoot, "verify.rejected", "recovery");
    fs.mkdirSync(rejectedRoot, { recursive: true });
    fs.writeFileSync(path.join(rejectedRoot, "REQUIRED_PATHS"), "REQUIRED_PATHS\n");
    const rejectedBackup = spawnSync(
      "restic",
      ["backup", "--json", "--tag", "echo-archives", "--repo", repository, rejectedRoot],
      { encoding: "utf8", env: environment },
    );
    assert.equal(rejectedBackup.status, 0, rejectedBackup.stderr);
    const rejectedSummary = rejectedBackup.stdout
      .trim()
      .split(/\n+/)
      .map((line) => JSON.parse(line))
      .findLast((entry) => entry.message_type === "summary");
    assert.equal(rejectedSummary.total_files_processed, 0);
    assert.equal(rejectedSummary.total_bytes_processed, 0);
    const rejectedRestore = spawnSync(
      "restic",
      [
        "restore",
        "--verify",
        "--target",
        path.join(stateRoot, "rejected-restore", "recovery"),
        "--repo",
        repository,
        `${rejectedSummary.snapshot_id}:${rejectedRoot}`,
      ],
      { encoding: "utf8", env: environment },
    );
    assert.notEqual(rejectedRestore.status, 0);
    assert.match(rejectedRestore.stderr, /path .* not found/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
