const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT_PATH = path.join(ROOT, "deploy/complete-launch-maintenance.sh");
const script = fs.readFileSync(SCRIPT_PATH, "utf8");

function runBackupTransitionFixture({
  failedUnits = [],
  installedUnitIsReviewed = true,
  offsiteJournal = "",
  monitorJournal = "",
  marker = "file",
}) {
  const fixture = fs.mkdtempSync("/tmp/echo-maintenance-transition-test.");
  try {
    fs.writeFileSync(
      path.join(fixture, "failed-units"),
      failedUnits.map((unit) => `${unit} loaded failed failed fixture\n`).join(""),
    );
    fs.writeFileSync(
      path.join(fixture, "installed-unit"),
      installedUnitIsReviewed
        ? "ReadWritePaths=/home/charlie/The-Echo-Archives/backend/data/backups\n"
        : "ReadWritePaths=/unreviewed/path\n",
    );
    fs.writeFileSync(path.join(fixture, "offsite-journal"), offsiteJournal);
    fs.writeFileSync(path.join(fixture, "monitor-journal"), monitorJournal);
    fs.writeFileSync(
      path.join(fixture, "historical-monitor-journal"),
      "FAIL: Off-site backup success marker is 999h old.\n",
    );
    if (marker === "file") {
      fs.writeFileSync(path.join(fixture, "marker"), "fixture\n");
    } else if (marker === "symlink") {
      fs.symlinkSync(path.join(fixture, "historical-monitor-journal"), path.join(fixture, "marker"));
    }

    return spawnSync(
      "bash",
      [
        "-c",
        String.raw`
source "$SCRIPT_PATH"
OFFSITE_BACKUP_UNIT_CANDIDATE="$TEST_REPO_ROOT/deploy/echo-archives-offsite-backup.service"
TEMP_ROOT="$FIXTURE"
OFFSITE_SUCCESS_MARKER="$FIXTURE/marker"
systemctl() {
  case "$1" in
    --failed)
      cat "$FIXTURE/failed-units"
      ;;
    cat)
      cat "$FIXTURE/installed-unit"
      ;;
    show)
      case "$2" in
        echo-archives-offsite-backup.service)
          printf '%s\n' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
          ;;
        echo-archives-local-monitor.service)
          printf '%s\n' bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
          ;;
        *)
          return 1
          ;;
      esac
      ;;
    *)
      return 1
      ;;
  esac
}
journalctl() {
  case "$1" in
    _SYSTEMD_INVOCATION_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
      cat "$FIXTURE/offsite-journal"
      ;;
    _SYSTEMD_INVOCATION_ID=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)
      cat "$FIXTURE/monitor-journal"
      ;;
    *)
      return 1
      ;;
  esac
}
classify_backup_unit_transition
printf 'transition=%s deferred=%s install=%s\n' \
  "$BACKUP_UNIT_TRANSITION" \
  "$BACKUP_MONITOR_FRESHNESS_DEFERRED" \
  "$BACKUP_UNIT_NEEDS_INSTALL"
`,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          FIXTURE: fixture,
          SCRIPT_PATH,
          TEST_REPO_ROOT: ROOT,
        },
      },
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

test("complete launch maintenance exposes guarded check and apply modes", () => {
  const help = spawnSync("bash", [SCRIPT_PATH, "--help"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--repository-check/);
  assert.match(help.stdout, /--check/);
  assert.match(help.stdout, /--apply/);
  assert.match(help.stdout, /--expected-commit SHA/);

  const invalid = spawnSync(
    "bash",
    [SCRIPT_PATH, "--repository-check", "--expected-commit", "not-a-commit"],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(invalid.status, 2);
});

test("complete launch maintenance is fail-fast, locked, pinned, and staged", () => {
  assert.match(script, /^set -Eeuo pipefail$/m);
  assert.match(script, /^umask 0077$/m);
  assert.match(script, /EXPECTED_HOST="charlie-Legion-T530-28ICB"/);
  assert.match(script, /REPO_ROOT="\/home\/charlie\/The-Echo-Archives"/);
  assert.match(script, /EXPECTED_COMMIT.*\^\[0-9a-f\]\{40\}\$/);
  assert.match(script, /flock -n 9/);
  assert.match(script, /nft node npm openssl/);
  assert.match(script, /timeout touch tr ufw/);
  assert.match(script, /status --porcelain --untracked-files=normal/);
  assert.match(script, /refs\/remotes\/origin\/\$\{EXPECTED_BRANCH\}/);
  assert.match(script, /trap 'on_error "\$\{LINENO\}"' ERR/);
  assert.match(script, /CURRENT_ROLLBACK/);

  const orderedStages = [
    "run_stage preserve-baseline",
    "run_stage fresh-database-backup",
    "run_stage backup-unit-transition",
    "run_stage caddy-origin-gate",
    "run_stage caddy-upgrade",
    "run_stage runtime-account",
    "run_stage live-application",
    "run_stage better-stack-heartbeat",
    "run_stage offsite-restore-and-backup",
    "run_stage ollama-upgrade",
    "run_stage archivist-success-and-fallback",
    "run_stage firewall-evidence",
    "run_stage storage-evidence",
    "run_stage deployment-rollback-invariant",
    "run_stage final-verification",
  ];
  let previous = -1;
  for (const stage of orderedStages) {
    const index = script.indexOf(stage);
    assert.ok(index > previous, `${stage} must follow the previous stage`);
    previous = index;
  }
});

test("complete launch maintenance validates artifacts and preserves rollback sources", () => {
  for (const value of [
    "1c6f5404f3622e46d401d81f4af59677d46b886229c6694d60fd936b87c72d3bb5d1fcf42b55c8d555769fa75acf434ab618fc7e0df2c79cf8512ee580d38d06",
    "e3d6909253b12dc723393fb1f0ace74e2c9bd8d64273fca6727adcf7c7882ebcb9611b6ab42223b20e93fc702f7c0f25bff1c12a88223202a069bb770d95990d",
    "f7d6bdbcf71b83aa8670c4e7dc4b6936c0952fcf8b114eaf6a11cbadb9684214",
    "42b6bc1237c6932d36694606bf3d56d99fbd03b570b6002364773e00f56fa4cf",
  ]) {
    assert.match(script, new RegExp(value));
  }
  assert.match(script, /has_binary && has_library/);
  assert.doesNotMatch(
    script,
    /tar --zstd --list[\s\S]{0,120}\|\s*grep\s+-[A-Za-z]*q/,
  );
  assert.match(script, /cp -a -- \/usr\/local\/bin\/ollama/);
  assert.match(script, /cp -a -- \/usr\/local\/lib\/ollama/);
  assert.match(script, /ollama-lib\.pre-upgrade/);
  assert.match(script, /rollback_caddy_configuration/);
  assert.match(script, /rollback_caddy_upgrade/);
  assert.match(script, /validate-caddy-origin-semantics\.js/);
  assert.match(script, /rollback_backup_automation/);
  assert.match(
    script,
    /systemctl reset-failed[\s\S]*echo-archives-offsite-backup\.service[\s\S]*echo-archives-local-monitor\.service/,
  );
  assert.match(
    script,
    /systemctl start echo-archives-local-monitor\.service/,
  );
  assert.match(script, /rollback_ollama_upgrade/);
  assert.match(script, /Caddyfile\.before-upgrade/);
  assert.match(script, /classify_backup_unit_transition/);
  assert.match(script, /capture_current_unit_journal/);
  assert.match(script, /_SYSTEMD_INVOCATION_ID=\$\{invocation\}/);
  assert.match(script, /BACKUP_UNIT_NEEDS_INSTALL="yes"/);
  assert.match(script, /BACKUP_MONITOR_FRESHNESS_DEFERRED="yes"/);
  assert.match(
    script,
    /Off-site backup success marker is \[0-9\]\+h old/,
  );
  assert.match(script, /already reconciled; preserving it idempotently/);
  assert.match(
    script,
    /\$1 != "echo-archives-offsite-backup\.service" &&\s*\$1 != "echo-archives-local-monitor\.service"/,
  );
  assert.match(script, /\.retention-write-probe\./);
  assert.match(script, /failure does not match the reviewed sandbox transition/);
  assert.match(script, /rollback_backup_unit_transition/);
  assert.match(
    script,
    /run_stage backup-unit-transition stage_backup_unit_transition/,
  );
  assert.match(
    script,
    /systemctl reset-failed \\\s*echo-archives-offsite-backup\.service \\\s*echo-archives-local-monitor\.service/,
  );
  assert.match(
    script,
    /Deferring the systemd monitor freshness check until the off-site stage/,
  );
  assert.match(
    script,
    /REQUIRE_OFFSITE_BACKUP=false \\\s*"\$\{REPO_ROOT\}\/deploy\/check-echo-archives-production\.sh"/,
  );
  assert.match(script, /pause_local_monitor_timer/);
  assert.match(script, /resume_local_monitor_timer/);
  assert.match(script, /systemctl stop echo-archives-local-monitor\.timer/);
  assert.match(script, /systemctl start echo-archives-local-monitor\.timer/);
  assert.match(
    script,
    /if \[\[ "\$\{BACKUP_MONITOR_FRESHNESS_DEFERRED\}" == "yes" \]\]; then\s*BACKUP_MONITOR_FRESHNESS_RECOVERED="yes"/,
  );
  assert.match(
    script,
    /local monitor did not pass after the verified off-site backup/,
  );
  assert.match(
    script,
    /local monitor remains pending because this failed stage did not publish a fresh off-site success marker/,
  );
  assert.match(
    script,
    /--output "\$\{homepage\}" https:\/\/echoarchives\.net\//,
  );
  assert.doesNotMatch(
    script,
    /https:\/\/echoarchives\.net\/\s*\|\s*grep\s+-[A-Za-z]*q/,
  );
});

test("backup transition accepts only the current stale-marker invocation", () => {
  const accepted = runBackupTransitionFixture({
    failedUnits: ["echo-archives-local-monitor.service"],
    monitorJournal: "FAIL: Off-site backup success marker is 88h old.\n",
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /transition=yes deferred=yes install=no/);

  const historicalOnly = runBackupTransitionFixture({
    failedUnits: ["echo-archives-local-monitor.service"],
    monitorJournal: "current invocation failed for an unrelated reason\n",
  });
  assert.notEqual(historicalOnly.status, 0);
  assert.match(
    historicalOnly.stderr,
    /neither the reviewed backup cascade nor stale backup freshness/,
  );
});

test("backup transition rejects unsafe or inconsistent stale-marker states", () => {
  for (const marker of ["missing", "symlink"]) {
    const unsafeMarker = runBackupTransitionFixture({
      failedUnits: ["echo-archives-local-monitor.service"],
      monitorJournal: "FAIL: Off-site backup success marker is 88h old.\n",
      marker,
    });
    assert.notEqual(unsafeMarker.status, 0);
    assert.match(unsafeMarker.stderr, /marker is missing, unsafe, or not a regular file/);
  }

  const cascadeWithoutBackup = runBackupTransitionFixture({
    failedUnits: ["echo-archives-local-monitor.service"],
    monitorJournal: "FAIL: One or more systemd units are failed.\n",
  });
  assert.notEqual(cascadeWithoutBackup.status, 0);
  assert.match(cascadeWithoutBackup.stderr, /cascade without a failed backup unit/);

  const mixedFailures = runBackupTransitionFixture({
    failedUnits: [
      "echo-archives-offsite-backup.service",
      "echo-archives-local-monitor.service",
    ],
    offsiteJournal: ".retention-write-probe.fixture: Read-only file system\n",
    monitorJournal: "FAIL: Off-site backup success marker is 88h old.\n",
  });
  assert.notEqual(mixedFailures.status, 0);
  assert.match(mixedFailures.stderr, /freshness failure is mixed with a failed backup unit/);

  const unreviewedUnit = runBackupTransitionFixture({
    failedUnits: ["echo-archives-local-monitor.service"],
    installedUnitIsReviewed: false,
    monitorJournal: "FAIL: Off-site backup success marker is 88h old.\n",
  });
  assert.notEqual(unreviewedUnit.status, 0);
  assert.match(unreviewedUnit.stderr, /before the reviewed backup unit was installed/);
});

test("no current failed unit does not inherit stale service result state", () => {
  const clean = runBackupTransitionFixture({});
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /transition=no deferred=no install=no/);
});

test("complete launch maintenance does not mutate UFW or expose monitoring secrets", () => {
  assert.match(script, /ufw status verbose/);
  assert.match(script, /ufw status numbered/);
  assert.match(script, /nft -j list ruleset/);
  assert.match(script, /smartctl -H -A/);
  assert.doesNotMatch(script, /\bufw\s+(?:allow|delete|deny|disable|enable|reset)\b/);
  assert.doesNotMatch(script, /\bnft\s+(?:add|delete|flush)\b/);
  assert.doesNotMatch(script, /\biptables\s+-[AIDF]\b/);
  assert.doesNotMatch(script, /source \/etc\/echo-archives\/better-stack\.env/);
  assert.match(script, /parseHeartbeatUrl/);
  assert.match(script, /secret is absent; no drop-in was installed/);
  assert.match(script, /No DNS, Cloudflare account, TLS policy, UFW rule/);
});

test("rollback invariant drill stays disposable and never targets production data", () => {
  const rollbackScript = fs.readFileSync(
    path.join(ROOT, "deploy/verify-deployment-rollback-invariants.sh"),
    "utf8",
  );
  assert.match(rollbackScript, /\/tmp\/echo-deployment-rollback\./);
  assert.match(rollbackScript, /git -C "\$\{REPO_ROOT\}" worktree add --detach/);
  assert.match(rollbackScript, /process\.exit\(42\)/);
  assert.match(rollbackScript, /git -C "\$\{WORKTREE\}" reset --hard "\$\{previous_commit\}"/);
  assert.match(rollbackScript, /launch_rollback_probe/);
  assert.match(rollbackScript, /production checkout changed/);
  assert.doesNotMatch(rollbackScript, /community\.sqlite/);
  assert.doesNotMatch(rollbackScript, /systemctl/);
});
