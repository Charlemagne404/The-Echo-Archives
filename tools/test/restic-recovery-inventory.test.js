const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const VERIFIER = path.join(ROOT, "tools", "verify-restic-recovery-inventory.js");
const SNAPSHOT_ID = "a".repeat(64);

function runVerifier(manifestPath, listingPath, snapshotId = SNAPSHOT_ID) {
  return spawnSync(
    process.execPath,
    [
      VERIFIER,
      "--manifest",
      manifestPath,
      "--listing",
      listingPath,
      "--snapshot-id",
      snapshotId,
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
}

function writeFixture(tempRoot, nodePaths, manifest = ["database", "database/archive.sqlite", "REQUIRED_PATHS"]) {
  const manifestPath = path.join(tempRoot, "REQUIRED_PATHS");
  const listingPath = path.join(tempRoot, "listing.jsonl");
  fs.writeFileSync(manifestPath, `${manifest.join("\n")}\n`);
  const entries = [
    {
      id: SNAPSHOT_ID,
      paths: ["/var/cache/echo-archives-pi-restic/verify.fixture/recovery"],
      struct_type: "snapshot",
    },
    ...nodePaths.map((nodePath) => ({
      path: nodePath,
      type: nodePath.endsWith(".sqlite") || nodePath.endsWith("REQUIRED_PATHS") ? "file" : "dir",
      struct_type: "node",
    })),
  ];
  fs.writeFileSync(listingPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  return { manifestPath, listingPath };
}

test("Restic inventory verifier accepts absolute and root-relative listing formats", () => {
  const variants = [
    [
      "/var/cache/echo-archives-pi-restic/verify.fixture/recovery/database",
      "/var/cache/echo-archives-pi-restic/verify.fixture/recovery/database/archive.sqlite",
      "/var/cache/echo-archives-pi-restic/verify.fixture/recovery/REQUIRED_PATHS",
    ],
    ["recovery/database", "recovery/database/archive.sqlite", "recovery/REQUIRED_PATHS"],
    ["database", "database/archive.sqlite", "REQUIRED_PATHS"],
    ["/database", "/database/archive.sqlite", "/REQUIRED_PATHS"],
    ["/recovery/database", "/recovery/database/archive.sqlite", "/recovery/REQUIRED_PATHS"],
  ];

  for (const [index, nodePaths] of variants.entries()) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `echo-restic-format-${index}-`));
    try {
      const fixture = writeFixture(tempRoot, nodePaths);
      const result = runVerifier(fixture.manifestPath, fixture.listingPath);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /contains all 3 staged paths/);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("Restic inventory verifier rejects missing paths and same-name root collisions", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restic-missing-"));
  try {
    const fixture = writeFixture(tempRoot, [
      "/different/tree/recovery/database",
      "/different/tree/recovery/database/archive.sqlite",
      "/different/tree/recovery/REQUIRED_PATHS",
    ]);
    const result = runVerifier(fixture.manifestPath, fixture.listingPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing 3 of 3 staged paths/);
    assert.doesNotMatch(result.stderr, /archive\.sqlite/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Restic inventory verifier rejects unsafe or inconsistent metadata", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restic-unsafe-"));
  try {
    const fixture = writeFixture(
      tempRoot,
      ["database", "database/archive.sqlite", "REQUIRED_PATHS"],
      ["database", "../private.env", "REQUIRED_PATHS"],
    );
    const unsafe = runVerifier(fixture.manifestPath, fixture.listingPath);
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /unsafe path/);

    const listing = fs
      .readFileSync(fixture.listingPath, "utf8")
      .replace(SNAPSHOT_ID, "b".repeat(64));
    fs.writeFileSync(fixture.listingPath, listing);
    fs.writeFileSync(fixture.manifestPath, "database\nREQUIRED_PATHS\n");
    const wrongSnapshot = runVerifier(fixture.manifestPath, fixture.listingPath);
    assert.notEqual(wrongSnapshot.status, 0);
    assert.match(wrongSnapshot.stderr, /expected snapshot/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Restic inventory verifier consumes a real disposable Restic listing", (context) => {
  const version = spawnSync("restic", ["version"], { encoding: "utf8" });
  if (version.status !== 0) {
    context.skip("restic is not installed in this test environment");
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restic-integration-"));
  const repository = path.join(tempRoot, "repository");
  const recoveryRoot = path.join(tempRoot, "input", "recovery");
  const manifestPath = path.join(recoveryRoot, "REQUIRED_PATHS");
  const listingPath = path.join(tempRoot, "listing.jsonl");
  const environment = { ...process.env, RESTIC_PASSWORD: "disposable-test-password" };
  try {
    fs.mkdirSync(path.join(recoveryRoot, "database"), { recursive: true });
    fs.writeFileSync(path.join(recoveryRoot, "database", "archive.sqlite"), "fixture");
    fs.writeFileSync(manifestPath, "database\ndatabase/archive.sqlite\nREQUIRED_PATHS\n");

    const initialize = spawnSync("restic", ["init", "--repo", repository], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(initialize.status, 0, initialize.stderr);
    const backup = spawnSync(
      "restic",
      ["backup", "--json", "--repo", repository, recoveryRoot],
      { encoding: "utf8", env: environment },
    );
    assert.equal(backup.status, 0, backup.stderr);
    const summary = backup.stdout
      .trim()
      .split(/\n+/)
      .map((line) => JSON.parse(line))
      .findLast((entry) => entry.message_type === "summary");
    assert.match(summary?.snapshot_id, /^[0-9a-f]{64}$/);

    const listing = spawnSync(
      "restic",
      ["ls", "--json", "--repo", repository, summary.snapshot_id],
      { encoding: "utf8", env: environment },
    );
    assert.equal(listing.status, 0, listing.stderr);
    fs.writeFileSync(listingPath, listing.stdout);

    const result = runVerifier(manifestPath, listingPath, summary.snapshot_id);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /contains all 3 staged paths/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
