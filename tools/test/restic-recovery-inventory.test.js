const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const VERIFIER = path.join(ROOT, "tools", "verify-restic-recovery-inventory.js");

function writeRecoveryTree(parent) {
  const recoveryRoot = path.join(parent, "recovery");
  fs.mkdirSync(path.join(recoveryRoot, "database"), { recursive: true });
  fs.writeFileSync(path.join(recoveryRoot, "database", "archive.sqlite"), "fixture");
  fs.writeFileSync(
    path.join(recoveryRoot, "REQUIRED_PATHS"),
    "database\ndatabase/archive.sqlite\nREQUIRED_PATHS\n",
  );
  return recoveryRoot;
}

function runVerifier(recoveryRoot) {
  return spawnSync(process.execPath, [VERIFIER, "--recovery-root", recoveryRoot], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("restored recovery inventory accepts an exact safe tree", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restored-exact-"));
  try {
    const result = runVerifier(writeRecoveryTree(tempRoot));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /exactly matches all 3 staged paths/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("restored recovery inventory rejects missing, extra, and duplicate records", () => {
  for (const scenario of ["missing", "extra", "duplicate"]) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `echo-restored-${scenario}-`));
    try {
      const recoveryRoot = writeRecoveryTree(tempRoot);
      const manifestPath = path.join(recoveryRoot, "REQUIRED_PATHS");
      if (scenario === "missing") {
        fs.appendFileSync(manifestPath, "database/missing.sqlite\n");
      } else if (scenario === "extra") {
        fs.writeFileSync(manifestPath, "database\nREQUIRED_PATHS\n");
      } else {
        fs.appendFileSync(manifestPath, "database/archive.sqlite\n");
      }
      const result = runVerifier(recoveryRoot);
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stderr, /archive\.sqlite|missing\.sqlite/);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("restored recovery inventory rejects nested manifests and symlinks", () => {
  for (const scenario of ["nested-manifest", "symlink"]) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `echo-restored-${scenario}-`));
    try {
      const recoveryRoot = writeRecoveryTree(tempRoot);
      if (scenario === "nested-manifest") {
        fs.writeFileSync(path.join(recoveryRoot, "database", "REQUIRED_PATHS"), "fixture\n");
        fs.appendFileSync(
          path.join(recoveryRoot, "REQUIRED_PATHS"),
          "database/REQUIRED_PATHS\n",
        );
      } else {
        fs.symlinkSync("archive.sqlite", path.join(recoveryRoot, "database", "alias.sqlite"));
        fs.appendFileSync(path.join(recoveryRoot, "REQUIRED_PATHS"), "database/alias.sqlite\n");
      }
      const result = runVerifier(recoveryRoot);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /manifest-named|symbolic link/);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("restored recovery inventory rejects unsafe manifest paths and invalid UTF-8 names", () => {
  const unsafeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restored-unsafe-"));
  try {
    const recoveryRoot = writeRecoveryTree(unsafeRoot);
    fs.appendFileSync(path.join(recoveryRoot, "REQUIRED_PATHS"), "../private.env\n");
    const unsafe = runVerifier(recoveryRoot);
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /unsafe path/);
  } finally {
    fs.rmSync(unsafeRoot, { recursive: true, force: true });
  }

  const utf8Root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restored-utf8-"));
  try {
    const recoveryRoot = writeRecoveryTree(utf8Root);
    const invalidNamePath = Buffer.concat([Buffer.from(`${recoveryRoot}/`), Buffer.from([0xff])]);
    try {
      fs.writeFileSync(invalidNamePath, "x");
    } catch (error) {
      assert.ok(["EILSEQ", "EPERM", "EINVAL"].includes(error.code), `unexpected invalid-name fixture error: ${error.code}`);
      fs.appendFileSync(path.join(recoveryRoot, "REQUIRED_PATHS"), Buffer.from([0xff, 0x0a]));
    }
    const invalid = runVerifier(recoveryRoot);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /not valid UTF-8/);
  } finally {
    fs.rmSync(utf8Root, { recursive: true, force: true });
  }
});

test("restored recovery inventory consumes a real verified Restic restore", (context) => {
  const version = spawnSync("restic", ["version"], { encoding: "utf8" });
  if (version.status !== 0) {
    context.skip("restic is not installed in this test environment");
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-restored-integration-"));
  const repository = path.join(tempRoot, "repository");
  const recoveryRoot = writeRecoveryTree(path.join(tempRoot, "input"));
  const restoreTarget = path.join(tempRoot, "restored");
  const environment = { ...process.env, RESTIC_PASSWORD: "disposable-test-password" };
  try {
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
    const restore = spawnSync(
      "restic",
      ["restore", "--verify", "--target", restoreTarget, "--repo", repository, summary.snapshot_id],
      { encoding: "utf8", env: environment },
    );
    assert.equal(restore.status, 0, restore.stderr);
    const restoredRoot = path.join(restoreTarget, recoveryRoot);
    const verified = runVerifier(restoredRoot);
    assert.equal(verified.status, 0, verified.stderr);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
