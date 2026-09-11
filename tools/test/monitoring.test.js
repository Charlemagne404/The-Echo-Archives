const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function runFailureFixture(failedUnit) {
  const monitor = read("deploy/check-echo-archives-production.sh");
  const units = monitor.match(/^MONITORED_SYSTEMD_UNITS=\([\s\S]*?^\)/m);
  const functionSource = monitor.match(
    /^check_required_systemd_failures\(\) \{\n[\s\S]*?^\}/m,
  );
  assert.ok(units, "monitor unit allowlist was not found");
  assert.ok(functionSource, "monitor failure-check function was not found");

  return spawnSync(
    "bash",
    [
      "-c",
      `set -Eeuo pipefail
FAILED_UNIT="$1"
fail() {
  printf 'FAIL: %s\\n' "$*" >&2
  exit 42
}
${units[0]}
${functionSource[0]}
systemctl() {
  if [[ "$1" == is-failed && "$2" == --quiet ]]; then
    [[ "$3" == "$FAILED_UNIT" ]]
    return
  fi
  return 1
}
check_required_systemd_failures
printf 'PASS\\n'
`,
      "monitor-failure-fixture",
      failedUnit,
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
}

test("host tooling units invoke stable copies and preserve executable Git metadata", () => {
  const monitorUnit = read("deploy/echo-archives-local-monitor.service");
  const offsiteUnit = read("deploy/echo-archives-offsite-backup.service");
  const bootstrap = read("deploy/bootstrap-echo-archives.sh");

  assert.match(
    monitorUnit,
    /WorkingDirectory=\/usr\/local\/lib\/echo-archives/,
  );
  assert.match(
    monitorUnit,
    /Environment=APP_RELEASE_ROOT=\/srv\/echo-archives\/current/,
  );
  assert.match(
    monitorUnit,
    /ExecStart=\/bin\/bash \/usr\/local\/lib\/echo-archives\/check-echo-archives-production\.sh/,
  );
  assert.match(
    offsiteUnit,
    /WorkingDirectory=\/usr\/local\/lib\/echo-archives/,
  );
  assert.match(
    offsiteUnit,
    /Environment=APP_RELEASE_ROOT=\/srv\/echo-archives\/current/,
  );
  assert.match(
    offsiteUnit,
    /ExecStart=\/bin\/bash \/usr\/local\/lib\/echo-archives\/echo-archives-offsite-backup\.sh/,
  );
  for (const unit of [monitorUnit, offsiteUnit]) {
    assert.doesNotMatch(unit, /ExecStart=.*\/srv\/echo-archives\/current/);
    assert.doesNotMatch(unit, /ExecStart=.*\/home\/charlie/);
    assert.doesNotMatch(unit, /The-Echo-Archives/);
  }
  assert.match(bootstrap, /HOST_TOOLING_DIR="\/usr\/local\/lib\/echo-archives"/);
  assert.match(bootstrap, /install -d -o root -g "\$\{RUNTIME_GROUP\}" -m 0750/);
  assert.match(bootstrap, /install -o root -g "\$\{RUNTIME_GROUP\}" -m 0750/);

  for (const relativePath of [
    "deploy/check-echo-archives-production.sh",
    "deploy/echo-archives-offsite-backup.sh",
  ]) {
    const result = spawnSync("git", ["ls-files", "--stage", relativePath], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^100755 /, `${relativePath} lost its executable Git mode`);
  }
});

test("host tooling installation is idempotent and runtime-readable", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-host-tooling-"));
  const targetRoot = path.join(tempRoot, "usr", "local", "lib", "echo-archives");
  fs.mkdirSync(targetRoot, { recursive: true, mode: 0o750 });

  try {
    for (const relativePath of [
      "deploy/check-echo-archives-production.sh",
      "deploy/echo-archives-offsite-backup.sh",
    ]) {
      const source = path.join(ROOT, relativePath);
      const target = path.join(targetRoot, path.basename(source));
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = spawnSync("install", ["-m", "0750", source, target], {
          encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
      }
      assert.equal(fs.statSync(target).mode & 0o777, 0o750);
      assert.doesNotThrow(() => fs.accessSync(target, fs.constants.R_OK | fs.constants.X_OK));
      assert.equal(fs.readFileSync(target, "utf8"), fs.readFileSync(source, "utf8"));
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("a previous local-monitor failure and disabled offsite service do not poison monitoring", () => {
  for (const failedUnit of [
    "echo-archives-local-monitor.service",
    "echo-archives-offsite-backup.service",
  ]) {
    const result = runFailureFixture(failedUnit);
    assert.equal(result.status, 0, `${failedUnit}: ${result.stderr}`);
    assert.match(result.stdout, /PASS/);
  }
});

test("a failed required production unit still fails monitoring", () => {
  const result = runFailureFixture("echo-archives-backup.service");
  assert.equal(result.status, 42, result.stdout);
  assert.match(result.stderr, /Required systemd units are failed: echo-archives-backup\.service/);
});
