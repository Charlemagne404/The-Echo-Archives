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

function runFailureFixture(failedUnit, { offsiteTimerEnabled = false } = {}) {
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
OFFSITE_TIMER_ENABLED="$OFFSITE_TIMER_ENABLED"
OFFSITE_BACKUP_TIMER="echo-archives-offsite-backup.timer"
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
  if [[ "$1" == is-enabled && "$2" == --quiet ]]; then
    [[ "$3" == "$OFFSITE_BACKUP_TIMER" && "$OFFSITE_TIMER_ENABLED" == true ]]
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
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        OFFSITE_TIMER_ENABLED: offsiteTimerEnabled ? "true" : "false",
      },
    },
  );
}

function runOffsiteFreshnessFixture({ timerEnabled, marker }) {
  const monitor = read("deploy/check-echo-archives-production.sh");
  const functionSource = monitor.match(
    /^check_offsite_backup_freshness\(\) \{\n[\s\S]*?^\}/m,
  );
  assert.ok(functionSource, "offsite freshness function was not found");

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "echo-offsite-monitor-"));
  const markerPath = path.join(fixture, "offsite-backup-success");
  if (marker !== "missing") {
    fs.writeFileSync(markerPath, "fixture\n");
    const ageHours = marker === "stale" ? 31 : 1;
    const timestamp = new Date(Date.now() - ageHours * 60 * 60 * 1000);
    fs.utimesSync(markerPath, timestamp, timestamp);
  }

  try {
    return spawnSync(
      "bash",
      [
        "-c",
        `set -Eeuo pipefail
OFFSITE_BACKUP_TIMER="echo-archives-offsite-backup.timer"
OFFSITE_SUCCESS_MARKER="$1"
MAX_BACKUP_AGE_HOURS=30
TIMER_ENABLED="$2"
log() { printf '%s\\n' "$*"; }
fail() {
  printf 'FAIL: %s\\n' "$*" >&2
  exit 42
}
systemctl() {
  if [[ "$1" == is-enabled && "$2" == --quiet ]]; then
    [[ "$3" == "$OFFSITE_BACKUP_TIMER" && "$TIMER_ENABLED" == true ]]
    return
  fi
  return 1
}
${functionSource[0]}
check_offsite_backup_freshness
printf 'PASS\\n'
`,
        "monitor-offsite-freshness-fixture",
        markerPath,
        timerEnabled ? "true" : "false",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
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

test("disabled offsite freshness is skipped even when its marker is stale or missing", () => {
  for (const marker of ["stale", "missing"]) {
    const result = runOffsiteFreshnessFixture({ timerEnabled: false, marker });
    assert.equal(result.status, 0, `${marker}: ${result.stderr}`);
    assert.match(result.stdout, /off-site backup freshness is not required/);
  }
});

test("enabled offsite freshness accepts a fresh marker and rejects stale or missing markers", () => {
  const fresh = runOffsiteFreshnessFixture({ timerEnabled: true, marker: "fresh" });
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /PASS/);

  for (const marker of ["stale", "missing"]) {
    const result = runOffsiteFreshnessFixture({ timerEnabled: true, marker });
    assert.equal(result.status, 42, `${marker}: ${result.stdout}`);
    assert.match(result.stderr, /Off-site backup success marker/);
  }
});

test("successful inactive oneshot backup and discovery services do not fail monitoring", () => {
  const result = runFailureFixture("");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS/);
});

test("an enabled offsite service failure remains visible", () => {
  const result = runFailureFixture("echo-archives-offsite-backup.service", {
    offsiteTimerEnabled: true,
  });
  assert.equal(result.status, 42, result.stdout);
  assert.match(
    result.stderr,
    /Required systemd units are failed: echo-archives-offsite-backup\.service/,
  );
});
