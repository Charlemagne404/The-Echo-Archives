const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const BACKEND_ROOT = path.join(ROOT, "backend");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function getDatabaseConstructor() {
  return require(require.resolve("better-sqlite3", { paths: [BACKEND_ROOT] }));
}

function assertOrdered(contents, fragments) {
  let previousIndex = -1;
  fragments.forEach((fragment) => {
    const index = contents.indexOf(fragment);
    assert.notEqual(index, -1, `Missing expected fragment: ${fragment}`);
    assert.ok(index > previousIndex, `Expected fragment in a later position: ${fragment}`);
    previousIndex = index;
  });
}

test("database backup creates a private, integrity-checked copy and refuses overwrite", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-backup-test-"));
  const sourcePath = path.join(tempRoot, "source.sqlite");
  const destinationPath = path.join(tempRoot, "backup.sqlite");
  const Database = getDatabaseConstructor();

  try {
    const source = new Database(sourcePath);
    source.exec("CREATE TABLE launch_check (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
    source.prepare("INSERT INTO launch_check (value) VALUES (?)").run("ready");
    source.close();

    const firstRun = spawnSync(
      process.execPath,
      [path.join(ROOT, "tools", "backup-database.js"), "--source", sourcePath, "--destination", destinationPath],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, DB_PATH: "" } },
    );

    assert.equal(firstRun.status, 0, firstRun.stderr);
    assert.match(firstRun.stdout, /Database backup verified/);
    assert.equal(fs.statSync(destinationPath).mode & 0o777, 0o600);

    const backup = new Database(destinationPath, { readonly: true, fileMustExist: true });
    assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(backup.prepare("SELECT value FROM launch_check").pluck().get(), "ready");
    backup.close();

    const secondRun = spawnSync(
      process.execPath,
      [path.join(ROOT, "tools", "backup-database.js"), "--source", sourcePath, "--destination", destinationPath],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, DB_PATH: "" } },
    );

    assert.notEqual(secondRun.status, 0);
    assert.match(secondRun.stderr, /Refusing to overwrite an existing backup/);
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});

test("database backup checker enforces integrity, schema, privacy, and freshness", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-backup-check-"));
  const backupPath = path.join(tempRoot, "community-test.sqlite");
  const Database = getDatabaseConstructor();

  try {
    const database = new Database(backupPath);
    for (const table of [
      "catalog_discovery_sources",
      "catalog_import_candidates",
      "community_profiles",
      "podcasts",
    ]) {
      database.exec(`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY)`);
    }
    database.close();
    fs.chmodSync(backupPath, 0o600);

    const fresh = spawnSync(
      process.execPath,
      [path.join(ROOT, "tools", "check-database-backup.js"), "--file", backupPath, "--max-age-hours", "1"],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(fresh.status, 0, fresh.stderr);
    assert.equal(JSON.parse(fresh.stdout).ok, true);

    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(backupPath, staleTime, staleTime);
    const stale = spawnSync(
      process.execPath,
      [path.join(ROOT, "tools", "check-database-backup.js"), "--file", backupPath, "--max-age-hours", "1"],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /outside the allowed 1h window/);
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});

test("database backup checker reports a missing backup directory clearly", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-backup-missing-"));
  const missingDirectory = path.join(tempRoot, "backups");
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(ROOT, "tools", "check-database-backup.js"), "--directory", missingDirectory, "--max-age-hours", "1"],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`Backup directory does not exist: ${missingDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});

test("off-site backup handles optional recovery configurations safely", () => {
  const offsiteBackup = read("deploy/echo-archives-offsite-backup.sh");
  const functionSource = offsiteBackup.match(
    /^stage_private_configuration\(\) \{\n[\s\S]*?^\}/m,
  );
  assert.ok(functionSource, "stage_private_configuration function was not found");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-optional-config-test-"));
  try {
    const runFixture = (mode) => spawnSync(
      "bash",
      [
        "-c",
        `set -Eeuo pipefail
fixture_root="$1/$2"
recovery_root="$fixture_root/recovery"
mkdir -p "$recovery_root/configuration"
log() { :; }
fail() { exit 97; }
${functionSource[0]}
case "$2" in
  absent)
    stage_private_configuration "$fixture_root/absent.env" "absent.env"
    test ! -e "$recovery_root/configuration/absent.env"
    ;;
  regular)
    printf 'fixture\n' > "$fixture_root/source.env"
    stage_private_configuration "$fixture_root/source.env" "copied.env"
    cmp "$fixture_root/source.env" "$recovery_root/configuration/copied.env"
    if mode="$(stat -c %a "$recovery_root/configuration/copied.env" 2>/dev/null)"; then
      :
    else
      mode="$(stat -f %Lp "$recovery_root/configuration/copied.env")"
    fi
    test "$mode" = 600
    ;;
  symlink)
    ln -s "$fixture_root/missing-target" "$fixture_root/source.env"
    stage_private_configuration "$fixture_root/source.env" "copied.env"
    ;;
  directory)
    mkdir "$fixture_root/source.env"
    stage_private_configuration "$fixture_root/source.env" "copied.env"
    ;;
esac
`,
        "bash",
        tempRoot,
        mode,
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    for (const mode of ["absent", "regular"]) {
      const result = runFixture(mode);
      assert.equal(result.status, 0, `${mode}: ${result.stderr}`);
    }
    for (const mode of ["symlink", "directory"]) {
      const result = runFixture(mode);
      assert.equal(result.status, 97, `${mode}: ${result.stderr}`);
    }
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});

test("deployment shell scripts parse and preserve the required safety order", () => {
  for (const relativePath of [
    "deploy/check-echo-archives-production.sh",
    "deploy/check-cloudflare-proxy-ranges.sh",
    "deploy/bootstrap-echo-archives.sh",
    "deploy/complete-launch-maintenance.sh",
    "deploy/complete-local-launch-readiness.sh",
    "deploy/complete-pi-backup-setup.sh",
    "deploy/diagnose-restored-database-access.sh",
    "deploy/echo-archives-offsite-backup.sh",
    "deploy/final-production-launch-maintenance.sh",
    "deploy/install-echo-archives-system.sh",
    "deploy/migrate-echo-archives-runtime-account.sh",
    "deploy/migrate-echoarchives-domain.sh",
    "deploy/production-host-maintenance.sh",
    "deploy/staging-smoke.sh",
    "deploy/deep-validate.sh",
    "deploy/preflight.sh",
    "deploy/echo",
    "deploy/release-common.sh",
    "deploy/update-echo-archives.sh",
    "deploy/verify-deployment-rollback-invariants.sh",
    "deploy/verify-restored-application.sh",
    "update-echo-archives.sh",
  ]) {
    const result = spawnSync("bash", ["-n", path.join(ROOT, relativePath)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${relativePath}: ${result.stderr}`);
  }

  const updateScript = read("deploy/update-echo-archives.sh");
  assert.match(updateScript, /Direct production checkout updates are disabled/);
  assert.match(updateScript, /\.\/deploy\/echo staging <commit-or-ref>/);
  assert.doesNotMatch(updateScript, /git (?:fetch|merge|reset)|npm (?:install|ci)|systemctl (?:reload|restart|start|stop)/);

  const releaseWorkflow = read("deploy/echo");
  const stagingDeployment = releaseWorkflow.slice(releaseWorkflow.indexOf("deploy_staging() {"));
  assertOrdered(stagingDeployment, [
    "fetch_source",
    "build_release",
    "atomic_switch \"${STAGING_LINK}\" \"${commit}\"",
    "start_and_check_staging \"${commit}\"",
    "record_staging_test",
  ]);
  const stagingHealth = releaseWorkflow.slice(releaseWorkflow.indexOf("start_and_check_staging() {"));
  assertOrdered(stagingHealth, [
    "restart_service \"${STAGING_SERVICE}\"",
    "health_check \"staging\"",
    "staging-smoke.sh",
  ]);
  assert.match(releaseWorkflow, /health_check \"production\"/);
  const releaseCommon = read("deploy/release-common.sh");
  assert.match(releaseCommon, /verify_running_release \"\$\{expected_environment\}" \"\$\{expected_commit\}"/);
  assert.match(releaseWorkflow, /atomic_switch \"\$\{CURRENT_LINK\}\" \"\$\{staging_release\}\"/);
  assert.match(releaseWorkflow, /automatic-rollback/);
  assert.match(releaseWorkflow, /Production was not touched/);
  assert.match(releaseWorkflow, /adopt-current/);
  assert.match(releaseWorkflow, /preflight_legacy_worktree_status/);
  assert.match(releaseWorkflow, /legacy checkout was dirty during preflight/);
  const promotionWorkflow = releaseWorkflow.slice(releaseWorkflow.indexOf("promote_staging() {"), releaseWorkflow.indexOf("adopt_current() {"));
  assert.doesNotMatch(promotionWorkflow, /require_recent_preflight|preflight-latest/);
  assert.match(promotionWorkflow, /backup_production_database/);
  assert.match(releaseWorkflow, /npm --prefix "\$\{temporary_path\}\/backend" ci --include=dev/);
  assert.match(releaseWorkflow, /npm --prefix "\$\{temporary_path\}\/backend" prune --omit=dev/);
  assert.doesNotMatch(releaseWorkflow, /git merge|git reset --hard/);

  const testEnvironmentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-release-test-env-probe-"));
  const stagingEnvironment = {
    ...process.env,
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "staging",
    SITE_URL: "http://127.0.0.1:3011",
    STATIC_ROOT: "/srv/echo-archives/runtime/staging/current",
    DB_PATH: "/var/lib/echo-archives-staging/community.sqlite",
    IMPORT_STAGING_ROOT: "/srv/echo-archives/runtime/staging/current/import-staging",
    PORT: "3011",
    INTERNAL_HEALTH_PORT: "4011",
    SERVE_STATIC: "true",
    ECHO_ENV_FILE: "/srv/echo-archives/shared/env/staging.env",
    MAINTAINER_REVIEW_PASSPHRASE: "",
    MAINTAINER_REVIEW_COOKIE_SECRET: "",
  };

  try {
    const probe = spawnSync(
      "bash",
      [
        "-c",
        'set -Eeuo pipefail; source "$1"; run_in_test_environment "$2" /usr/bin/env',
        "release-test-environment-probe",
        path.join(ROOT, "deploy", "release-common.sh"),
        testEnvironmentRoot,
      ],
      { cwd: ROOT, env: stagingEnvironment, encoding: "utf8" },
    );

    assert.equal(probe.status, 0, probe.stderr);
    const isolatedEnvironment = Object.fromEntries(
      probe.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((entry) => {
          const separator = entry.indexOf("=");
          return [entry.slice(0, separator), entry.slice(separator + 1)];
        }),
    );

    assert.equal(isolatedEnvironment.NODE_ENV, "test");
    assert.equal(isolatedEnvironment.DEPLOYMENT_ENV, undefined);
    assert.equal(isolatedEnvironment.SITE_URL, "http://127.0.0.1");
    assert.equal(isolatedEnvironment.HOST, "127.0.0.1");
    assert.equal(isolatedEnvironment.STATIC_ROOT, testEnvironmentRoot);
    assert.match(isolatedEnvironment.DB_PATH, /^\/tmp\/echo-release-test-env\.[^/]+\/community\.sqlite$/);
    assert.notEqual(isolatedEnvironment.DB_PATH, stagingEnvironment.DB_PATH);
    assert.match(
      isolatedEnvironment.IMPORT_STAGING_ROOT,
      /^\/tmp\/echo-release-test-env\.[^/]+\/import-staging$/,
    );
    assert.equal(isolatedEnvironment.INTERNAL_HEALTH_PORT, "0");
    assert.equal(isolatedEnvironment.SERVE_STATIC, "true");
    assert.equal(isolatedEnvironment.IMPORT_AUTO_WORKER, "false");
    assert.equal(isolatedEnvironment.IMPORT_AUTO_DISCOVERY, "false");

    for (const key of [
      "PORT",
      "ECHO_ENV_FILE",
      "NODE_OPTIONS",
      "MAINTAINER_REVIEW_PASSPHRASE",
      "MAINTAINER_REVIEW_COOKIE_SECRET",
    ]) {
      assert.equal(isolatedEnvironment[key], undefined, `${key} leaked into release tests`);
    }
  } finally {
    fs.rmSync(testEnvironmentRoot, { recursive: true, force: true });
  }

  const realValidationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-real-release-validation-"));
  const releaseCommit = "0".repeat(40);
  try {
    const validation = spawnSync(
      "bash",
      [
        "-c",
        String.raw`
          set -Eeuo pipefail
          deploy_root="$2/deploy-root"
          export DEPLOY_ROOT="$deploy_root"
          source "$1" help >/dev/null
          ensure_layout
          release_root="$(create_temporary_release_path "$4")"
          tar -C "$3" --exclude='./.git' --exclude='./node_modules' --exclude='./backend/node_modules' -cf - . | tar -x -C "$release_root"
          printf 'RELEASE_ROOT=%s\n' "$release_root"
          test_port="$(/usr/bin/node -e 'const net = require("node:net"); const server = net.createServer(); server.listen(0, "127.0.0.1", () => { console.log(server.address().port); server.close(); });')"
          server_log="$2/server.log"
          run_in_test_environment "$release_root" bash -c '
            set -Eeuo pipefail
            server_log="$1"
            test_port="$2"
            server_script="$3"
            env PORT="$test_port" MAINTAINER_REVIEW_PASSPHRASE=archive-test-passphrase MAINTAINER_REVIEW_COOKIE_SECRET=archive-test-cookie-secret-0123456789 OLLAMA_URL=http://127.0.0.1:9/api/generate /usr/bin/node "$server_script" >"$server_log" 2>&1 &
            server_pid=$!
            cleanup() {
              if kill -0 "$server_pid" 2>/dev/null; then
                kill "$server_pid" 2>/dev/null || true
              fi
              wait "$server_pid" 2>/dev/null || true
            }
            trap cleanup EXIT
            ready=false
            for attempt in $(seq 1 100); do
              if curl --silent --show-error --fail --max-time 2 "http://127.0.0.1:$test_port/api/health" >/dev/null; then
                ready=true
                break
              fi
              sleep 0.1
            done
            [[ "$ready" == true ]] || { sed -n "1,120p" "$server_log" >&2; exit 1; }
            for route in /style.css /maintainer/submissions.html /maintainer/imports.html; do
              status="$(curl --silent --show-error --output /dev/null --write-out "%{http_code}" --max-time 5 "http://127.0.0.1:$test_port$route")"
              [[ "$status" == 200 ]] || { echo "$route returned $status" >&2; sed -n "1,120p" "$server_log" >&2; exit 1; }
            done
          ' _ "$server_log" "$test_port" "$5"
          printf 'TEST_ENV=isolated\n'
          printf 'STATIC_ROOT=%s\n' "$release_root"
          printf 'ROUTES=style.css,maintainer/submissions.html,maintainer/imports.html\n'
        `,
        "real-release-validation-regression",
        path.join(ROOT, "deploy", "echo"),
        realValidationRoot,
        ROOT,
        releaseCommit,
        path.join(ROOT, "backend", "server.js"),
      ],
      { cwd: ROOT, env: stagingEnvironment, encoding: "utf8" },
    );

    assert.equal(validation.status, 0, validation.stderr);
    const releaseRootLine = validation.stdout.split("\n").find((line) => line.startsWith("RELEASE_ROOT="));
    assert.ok(releaseRootLine, validation.stdout);
    const releaseRoot = releaseRootLine.slice("RELEASE_ROOT=".length);
    assert.equal(
      path.dirname(releaseRoot),
      path.join(realValidationRoot, "deploy-root", "releases"),
    );
    assert.match(path.basename(releaseRoot), new RegExp(`^release-${releaseCommit}\.[A-Za-z0-9]+$`));
    assert.notEqual(path.basename(releaseRoot).startsWith("."), true);
    assert.match(validation.stdout, /TEST_ENV=isolated/);
    assert.match(validation.stdout, /STATIC_ROOT=.*release-/);
    assert.match(validation.stdout, /ROUTES=style\.css,maintainer\/submissions\.html,maintainer\/imports\.html/);
  } finally {
    fs.rmSync(realValidationRoot, { recursive: true, force: true });
  }

  const readinessFixtureScript = String.raw`
set -Eeuo pipefail
source "$1" help >/dev/null
SCENARIO="$3"
NEW_COMMIT=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
OLD_COMMIT=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
STAGING_SERVICE=fixture-staging.service
STAGING_HEALTH_URL=http://127.0.0.1:4011/api/health
RUN_STAGING_SMOKE=false

ensure_layout

write_release() {
  local release_id="$1"
  local release_dir
  release_dir="$(release_path "$release_id")"
  mkdir -p "$release_dir/backend/node_modules"
  printf '{"releaseId":"%s","commit":"%s"}\n' "$release_id" "$release_id" > "$release_dir/release.json"
  : > "$release_dir/backend/server.js"
}

write_release "$NEW_COMMIT"
write_release "$OLD_COMMIT"
ln -s "releases/$OLD_COMMIT" "$STAGING_LINK"

require_deployment_user() { :; }
require_common_commands() { :; }
validate_environment_file() { :; }
assert_release_service() { :; }
fetch_source() { :; }
resolve_commit() { printf '%s\n' "$NEW_COMMIT"; }
build_release() { :; }
prepare_runtime_tree() { :; }
atomic_runtime_switch() { :; }
grant_active_runtime_write_paths() { :; }

RESTART_COUNT=0
PHASE_CALLS=0
HEALTH_PHASE=none
restart_service() {
  RESTART_COUNT=$((RESTART_COUNT + 1))
  PHASE_CALLS=0
  if [[ "$RESTART_COUNT" -eq 1 ]]; then
    HEALTH_PHASE=forward
    printf 'FIXTURE_FORWARD_RESTART_MS=%s\n' "$(date +%s%3N)"
  else
    HEALTH_PHASE=rollback
    printf 'FIXTURE_ROLLBACK_RESTART_MS=%s\n' "$(date +%s%3N)"
  fi
}

systemctl() {
  case "$1" in
    is-active) printf 'active\n' ;;
    show)
      if [[ "$*" == *MainPID* ]]; then
        printf '4242\n'
      elif [[ "$*" == *WorkingDirectory* ]]; then
        printf '%s/backend\n' "$STAGING_LINK"
      else
        printf 'active\n'
      fi
      ;;
    status) printf 'fixture status phase=%s\n' "$HEALTH_PHASE" ;;
    *) return 0 ;;
  esac
}

journalctl() {
  printf 'fixture journal phase=%s token=fixture-secret\n' "$HEALTH_PHASE"
}

curl() {
  local output=""
  while (($#)); do
    case "$1" in
      --output) output="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  PHASE_CALLS=$((PHASE_CALLS + 1))
  local response_mode=healthy
  local response_commit="$NEW_COMMIT"
  case "$SCENARIO" in
    forward-delayed)
      if [[ "$PHASE_CALLS" -eq 1 ]]; then response_mode=unavailable; fi
      ;;
    forward-fails-rollback-delayed)
      if [[ "$HEALTH_PHASE" == forward || "$PHASE_CALLS" -eq 1 ]]; then response_mode=unavailable; fi
      if [[ "$HEALTH_PHASE" == rollback ]]; then response_commit="$OLD_COMMIT"; fi
      ;;
    forward-fails-rollback-never)
      response_mode=unavailable
      ;;
    mismatch)
      response_mode=mismatch
      ;;
    *)
      printf 'unknown fixture scenario: %s\n' "$SCENARIO" >&2
      return 2
      ;;
  esac
  if [[ "$response_mode" == unavailable ]]; then return 7; fi
  if [[ "$response_mode" == mismatch ]]; then
    printf '{"ok":true,"status":"ok","environment":"production","release":{"id":"%s","commit":"%s"}}\n' "$OLD_COMMIT" "$OLD_COMMIT" > "$output"
  else
    printf '{"ok":true,"status":"ok","environment":"staging","release":{"id":"%s","commit":"%s"}}\n' "$response_commit" "$response_commit" > "$output"
  fi
}

if [[ "$SCENARIO" == mismatch ]]; then
  HEALTH_PHASE=forward
  if health_check mismatch "$STAGING_HEALTH_URL" staging "$NEW_COMMIT"; then
    printf 'RESULT=mismatch-accepted\n'
    exit 1
  fi
  [[ "$PHASE_CALLS" -gt 1 ]]
  printf 'RESULT=mismatch-rejected\n'
  exit 0
fi

deploy_staging "$NEW_COMMIT"
printf 'RESULT=forward-success\n'
printf 'FIXTURE_RESTART_COUNT=%s\n' "$RESTART_COUNT"
`;

  const runReadinessFixture = (scenario) => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-release-health-race-"));
    try {
      const result = spawnSync(
        "bash",
        [
          "-c",
          readinessFixtureScript,
          "release-health-readiness-fixture",
          path.join(ROOT, "deploy", "echo"),
          fixtureRoot,
          scenario,
        ],
        {
          cwd: ROOT,
          env: {
            ...stagingEnvironment,
            DEPLOY_ROOT: fixtureRoot,
            HEALTH_CHECK_TIMEOUT_SECONDS: "0.3",
            HEALTH_CHECK_INTERVAL_SECONDS: "0.02",
            HEALTH_CHECK_REQUEST_TIMEOUT_SECONDS: "0.05",
          },
          encoding: "utf8",
        },
      );
      return { ...result, combined: `${result.stdout}\n${result.stderr}` };
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  };

  const delayedReadiness = runReadinessFixture("forward-delayed");
  assert.equal(delayedReadiness.status, 0, delayedReadiness.combined);
  assert.match(delayedReadiness.combined, /RESULT=forward-success/);
  assert.match(delayedReadiness.combined, /health passed for a{40} after 2 attempt/);

  const rollbackReadiness = runReadinessFixture("forward-fails-rollback-delayed");
  assert.notEqual(rollbackReadiness.status, 0, rollbackReadiness.combined);
  assert.match(rollbackReadiness.combined, /staging health did not become ready within 0\.3s/);
  assert.match(rollbackReadiness.combined, /staging rollback health passed for b{40} after 2 attempt/);
  const forwardRestart = Number(rollbackReadiness.combined.match(/FIXTURE_FORWARD_RESTART_MS=(\d+)/)?.[1]);
  const rollbackRestart = Number(rollbackReadiness.combined.match(/FIXTURE_ROLLBACK_RESTART_MS=(\d+)/)?.[1]);
  assert.ok(Number.isFinite(forwardRestart) && Number.isFinite(rollbackRestart));
  assert.ok(rollbackRestart - forwardRestart >= 250, rollbackReadiness.combined);

  const failedRollback = runReadinessFixture("forward-fails-rollback-never");
  assert.notEqual(failedRollback.status, 0, failedRollback.combined);
  assert.match(failedRollback.combined, /staging health did not become ready within 0\.3s/);
  assert.match(failedRollback.combined, /staging rollback health did not become ready within 0\.3s/);
  assert.match(failedRollback.combined, /previous staging release could not be restored/);

  const mismatchedReadiness = runReadinessFixture("mismatch");
  assert.equal(mismatchedReadiness.status, 0, mismatchedReadiness.combined);
  assert.match(mismatchedReadiness.combined, /RESULT=mismatch-rejected/);
  assert.match(mismatchedReadiness.combined, /did not identify staging\/a{40}/);
  assert.doesNotMatch(mismatchedReadiness.combined, /fixture-secret/);
  assert.match(mismatchedReadiness.combined, /token=\[REDACTED\]/);

  const compatibilityUpdateScript = read("update-echo-archives.sh");
  assert.match(compatibilityUpdateScript, /CANONICAL_WORKFLOW=.*deploy\/echo/);
  assert.match(compatibilityUpdateScript, /exec "\$\{CANONICAL_WORKFLOW\}" "\$@"/);
  assert.doesNotMatch(compatibilityUpdateScript, /npm (?:install|ci)|systemctl (?:reload|restart)/);

  const releaseService = read("deploy/echo-archives.service");
  const stagingService = read("deploy/echo-archives-staging.service");
  const releaseBackupService = read("deploy/echo-archives-backup.service");
  const releaseBackupTimer = read("deploy/echo-archives-backup.timer");
  assert.match(releaseService, /WorkingDirectory=\/srv\/echo-archives\/current\/backend/);
  assert.match(releaseService, /ExecStart=\/usr\/bin\/node \/srv\/echo-archives\/current\/backend\/server\.js/);
  assert.match(releaseService, /Environment=PORT=3010/);
  assert.match(releaseService, /Environment=INTERNAL_HEALTH_PORT=4010/);
  assert.match(releaseService, /Environment=STATIC_ROOT=\/srv\/echo-archives\/runtime\/production\/current/);
  assert.match(releaseService, /Environment=IMPORT_STAGING_ROOT=\/srv\/echo-archives\/runtime\/production\/current\/import-staging/);
  assert.match(releaseService, /EnvironmentFile=\/srv\/echo-archives\/shared\/env\/production\.env/);
  assert.match(stagingService, /WorkingDirectory=\/srv\/echo-archives\/staging\/backend/);
  assert.match(stagingService, /ExecStart=\/usr\/bin\/node \/srv\/echo-archives\/staging\/backend\/server\.js/);
  assert.match(stagingService, /Environment=PORT=3011/);
  assert.match(stagingService, /Environment=INTERNAL_HEALTH_PORT=4011/);
  assert.match(stagingService, /Environment=STATIC_ROOT=\/srv\/echo-archives\/runtime\/staging\/current/);
  assert.match(stagingService, /Environment=IMPORT_STAGING_ROOT=\/srv\/echo-archives\/runtime\/staging\/current\/import-staging/);
  assert.match(stagingService, /EnvironmentFile=\/srv\/echo-archives\/shared\/env\/staging\.env/);
  assert.match(stagingService, /DB_PATH=\/var\/lib\/echo-archives-staging\/community\.sqlite/);
  assert.match(releaseBackupService, /--source \/var\/lib\/echo-archives\/community\.sqlite/);
  assert.match(releaseBackupService, /BACKUP_DIR=\/var\/backups\/echo-archives/);
  assert.match(releaseBackupService, /current\/tools\/backup-database\.js/);
  assert.match(releaseBackupTimer, /Unit=echo-archives-backup\.service/);

  const releaseDiscoveryService = read("deploy/echo-archives-discovery.service");
  assert.match(releaseDiscoveryService, /WorkingDirectory=\/srv\/echo-archives\/current\/backend/);
  assert.match(releaseDiscoveryService, /Environment=STATIC_ROOT=\/srv\/echo-archives\/runtime\/production\/current/);
  assert.match(releaseDiscoveryService, /Environment=IMPORT_STAGING_ROOT=\/srv\/echo-archives\/runtime\/production\/current\/import-staging/);

  const installScript = read("deploy/install-echo-archives-system.sh");
  assert.match(installScript, /bootstrap-echo-archives\.sh/);
  assert.doesNotMatch(installScript, /systemctl (?:start|restart|stop|reload|enable)/);
  assert.doesNotMatch(installScript, /Caddyfile/);
  const bootstrapScript = read("deploy/bootstrap-echo-archives.sh");
  assert.match(bootstrapScript, /\/srv\/echo-archives/);
  assert.match(bootstrapScript, /HOST_TOOLING_DIR="\/usr\/local\/lib\/echo-archives"/);
  assert.match(bootstrapScript, /install -d -o root -g "\$\{RUNTIME_GROUP\}" -m 0750 "\$\{HOST_TOOLING_DIR\}"/);
  assert.match(bootstrapScript, /install -o root -g "\$\{RUNTIME_GROUP\}" -m 0750/);
  assert.match(bootstrapScript, /check-echo-archives-production\.sh/);
  assert.match(bootstrapScript, /echo-archives-offsite-backup\.sh/);
  assert.match(bootstrapScript, /echo-archives-staging\.service/);
  assert.match(bootstrapScript, /systemd-analyze verify/);
  assert.match(bootstrapScript, /systemctl daemon-reload/);
  assert.match(bootstrapScript, /monitoring\.env\.example/);
  assert.match(bootstrapScript, /offsite-backup\.env\.example/);
  assert.match(bootstrapScript, /LEGACY_DISCOVERY_DROPIN/);
  assert.match(bootstrapScript, /refusing to remove an unrecognized discovery drop-in/);
  assert.match(bootstrapScript, /HOST_UNIT_BACKUP_DIR/);
  assert.match(bootstrapScript, /backup_host_unit/);
  assert.match(bootstrapScript, /systemctl disable --now echo-archives-offsite-backup\.timer/);
  assert.doesNotMatch(bootstrapScript, /systemctl (?:start|restart|stop|reload|enable)/);
  assert.doesNotMatch(bootstrapScript, /Caddyfile/);
  assert.doesNotMatch(bootstrapScript, /community\.sqlite/);

  const migrationScript = read("deploy/migrate-echoarchives-domain.sh");
  assert.match(migrationScript, /SITE_URL="https:\/\/echoarchives\.net"/);
  assert.match(migrationScript, /install-echo-archives-system\.sh/);
  assert.match(migrationScript, /echo\.continental-hub\.com:443:127\.0\.0\.1/);
  assert.match(migrationScript, /legacy host did not return HTTP 301/);
  assert.match(migrationScript, /grep -qiE '\^location:/);

  const maintenanceScript = read("deploy/production-host-maintenance.sh");
  const maintenanceMain = maintenanceScript.slice(
    maintenanceScript.indexOf('log "Beginning reviewed production-host maintenance."'),
  );
  assertOrdered(maintenanceMain, [
    "run_as_app env NODE_ENV=production",
    'caddy validate --config "${CADDY_CANDIDATE}"',
    "verify_certbot_is_obsolete",
    "apt-get --simulate dist-upgrade",
    "run backup:database",
    "apt-get -y dist-upgrade",
    "stage_production_dependencies",
    "apply_deployment",
    "systemctl disable --now certbot.timer",
    "post_deployment_checks",
    "report_host_state",
  ]);
  assert.match(maintenanceScript, /npm --prefix "\$\{DEPENDENCY_STAGE\}" ci --omit=dev/);
  assert.match(maintenanceScript, /ALLOWED_APT_REMOVAL="netdata-plugin-otel-signal-viewer"/);
  assert.match(maintenanceScript, /HOST-MAINTENANCE\/RECOVERY-ONLY/);
  assert.match(maintenanceScript, /nft list ruleset/);
  assert.match(maintenanceScript, /ufw status verbose/);
  assert.match(maintenanceScript, /REBOOT REQUIRED\. This script will not reboot automatically/);
  assert.doesNotMatch(maintenanceScript, /ufw (allow|delete|reset|disable)/);
  assert.doesNotMatch(maintenanceScript, /systemctl reboot|shutdown\s+-r/);

  const localMonitor = read("deploy/check-echo-archives-production.sh");
  assert.match(localMonitor, /--output "\$\{TEMP_DIR\}\/apex\.html"/);
  assert.match(localMonitor, /tools\/check-database-backup\.js/);
  assert.match(localMonitor, /APP_RELEASE_ROOT="\$\{APP_RELEASE_ROOT:-\$\{DEPLOY_ROOT\}\/current\}"/);
  assert.doesNotMatch(localMonitor, /\bREPO_ROOT\b/);
  assert.doesNotMatch(localMonitor, /\/home\/charlie\/The-Echo-Archives/);
  assert.match(localMonitor, /BACKUP_DIR="\$\{BACKUP_DIR:-\/var\/backups\/echo-archives\}"/);
  assert.match(localMonitor, /REQUIRE_OFFSITE_BACKUP/);
  assert.match(localMonitor, /EXPECTED_COMMUNITY_RATING_WRITES/);
  assert.match(localMonitor, /EXPECTED_MAINTAINER_REVIEW/);
  assert.match(localMonitor, /EXPECTED_ACCESS_LOGS/);
  assert.doesNotMatch(localMonitor, /curl[^]*\|[ \t]*grep -q/);

  const runtimeMigration = read("deploy/migrate-echo-archives-runtime-account.sh");
  assert.match(runtimeMigration, /useradd \\\n    --system \\\n    --user-group/);
  assert.match(runtimeMigration, /--shell \/usr\/sbin\/nologin/);
  assert.match(runtimeMigration, /NEW_DB="\$\{STATE_ROOT\}\/community\.sqlite"/);
  assert.match(runtimeMigration, /backup-database\.js/);
  assert.match(runtimeMigration, /check-database-backup\.js/);
  assert.match(runtimeMigration, /setfacl/);
  assert.match(runtimeMigration, /--repair-access/);
  assert.match(runtimeMigration, /d:u:\$\{APP_USER\}:rw-/);
  assert.match(runtimeMigration, /Dedicated runtime-account access controls were repaired and verified/);
  assert.match(runtimeMigration, /-path "\$\{REPO_ROOT\}\/\.git" -prune/);
  assert.match(runtimeMigration, /-path "\$\{REPO_ROOT\}\/backend\/data\/backups" -prune/);
  assert.match(runtimeMigration, /10-runtime-account\.conf/);
  assert.match(runtimeMigration, /echo-archives-journald\.conf/);
  assert.match(runtimeMigration, /MaxRetentionSec=14day/);
  assert.match(runtimeMigration, /health\?\.ok === true && health\?\.status === \"ok\"/);
  assert.match(runtimeMigration, /journalctl --namespace=echo-archives/);
  assert.match(runtimeMigration, /"event":"http_request"/);
  assert.match(
    runtimeMigration,
    /--output "\$\{health_output\}" "\$\{LOCAL_HOME_URL\}"/,
  );
  assert.doesNotMatch(
    runtimeMigration,
    /"\$\{LOCAL_HOME_URL\}"\s*\|\s*grep\s+-[A-Za-z]*q/,
  );
  assert.match(runtimeMigration, /rollback-current-\$\{TIMESTAMP\}\.sqlite/);
  assert.match(runtimeMigration, /pre-rollback-\$\{TIMESTAMP\}/);
  assert.match(runtimeMigration, /transfer_runtime_publication_ownership/);
  assert.doesNotMatch(runtimeMigration, /\buserdel\b/);
  assert.doesNotMatch(runtimeMigration, /chown\s+-R\b/);
  assert.doesNotMatch(runtimeMigration, /rm\s+-rf\b/);

  const offsiteBackup = read("deploy/echo-archives-offsite-backup.sh");
  assert.match(offsiteBackup, /APP_RELEASE_ROOT="\$\{APP_RELEASE_ROOT:-\$\{DEPLOY_ROOT\}\/current\}"/);
  assert.doesNotMatch(offsiteBackup, /\bREPO_ROOT\b/);
  assert.match(
    offsiteBackup,
    /Optional recovery configuration is absent: \$\{destination_name\}[\s\S]*return 0/,
  );
  assert.match(offsiteBackup, /trap 'on_error "\$\{LINENO\}"' ERR/);
  assertOrdered(offsiteBackup, [
    "Staging every runtime-writable publication path",
    'stage_private_configuration "/etc/echo-archives/better-stack.env" "better-stack.env"',
    "Sending the protected recovery inventory to the encrypted restic repository",
  ]);
  assert.match(offsiteBackup, /check-database-backup\.js/);
  assert.match(offsiteBackup, /cp --preserve=mode,timestamps/);
  assert.match(offsiteBackup, /cmp --silent/);
  assert.match(offsiteBackup, /MAX_LOCAL_BACKUP_AGE_HOURS/);
  assert.match(offsiteBackup, /\.retention-write-probe\.\*/);
  assert.match(offsiteBackup, /service sandbox can apply retention/);
  assert.match(offsiteBackup, /cp --archive --no-dereference/);
  assert.match(offsiteBackup, /PUBLICATION_ROOT/);
  assert.match(offsiteBackup, /IMPORT_STAGING_DIR=.*PUBLICATION_ROOT.*import-staging/);
  assert.doesNotMatch(offsiteBackup, /\/home\/charlie\/The-Echo-Archives/);
  assert.match(
    offsiteBackup,
    /Importer staging root must not be a symbolic link/,
  );
  assert.match(
    offsiteBackup,
    /Importer staging contains a symbolic link/,
  );
  assert.match(offsiteBackup, /stage_publication_directory/);
  assert.match(offsiteBackup, /catalog-src\/shows/);
  assert.match(offsiteBackup, /images\/generated\/covers/);
  assert.match(offsiteBackup, /data\/reviews/);
  assert.match(offsiteBackup, /docs\/generated\/catalog-status\.md/);
  assert.match(offsiteBackup, /REQUIRED_PATHS/);
  assert.match(offsiteBackup, /restic restore --verify --target "\$\{REMOTE_RESTORE_DIR\}\/recovery"/);
  assert.match(offsiteBackup, /"\$\{snapshot_id\}:\$\{recovery_root\}"/);
  assert.doesNotMatch(offsiteBackup, /\$\{REMOTE_RESTORE_DIR\}\$\{recovery_root\}/);
  assert.match(offsiteBackup, /total_files_processed/);
  assert.match(offsiteBackup, /total_bytes_processed/);
  assert.match(offsiteBackup, /verify-restic-recovery-inventory\.js/);
  assert.match(offsiteBackup, /snapshot_id=%s/);
  assert.match(offsiteBackup, /remove_remote_restore/);
  assert.doesNotMatch(offsiteBackup, /restic ls --json/);
  assert.doesNotMatch(offsiteBackup, /lastIndexOf\(marker\)/);
  assert.match(offsiteBackup, /remove_recovery_inventory/);
  assert.match(offsiteBackup, /Unencrypted recovery inventory remained/);
  assert.match(offsiteBackup, /STATE_DIR="\/var\/lib\/echo-archives-monitoring"/);
  assert.match(offsiteBackup, /recovery-staging\.XXXXXX/);
  assert.match(offsiteBackup, /Recovery staging and the Restic cache must be separate directory trees/);
  assert.match(offsiteBackup, /remote-restore\.XXXXXX/);
  assert.doesNotMatch(offsiteBackup, /mktemp -d "\$\{CACHE_DIR\}\/verify\.XXXXXX"/);
  assert.doesNotMatch(offsiteBackup, /mktemp -d "\$\{CACHE_DIR\}\/remote-restore\.XXXXXX"/);
  assert.match(offsiteBackup, /--one-file-system/);

  const restoredApplication = read("deploy/verify-restored-application.sh");
  assert.match(restoredApplication, /setsid runuser/);
  assert.match(restoredApplication, /kill -TERM -- "-\$\{APP_PGID\}"/);
  assert.match(restoredApplication, /not listening only on 127\.0\.0\.1/);
  assert.match(restoredApplication, /listener remained after shutdown/);
  assert.match(offsiteBackup, /stage_private_configuration "\$\{BACKEND_ENV\}" "backend\.env"/);
  assert.match(offsiteBackup, /stage_private_configuration "\/etc\/caddy\/Caddyfile" "Caddyfile"/);
  assert.match(offsiteBackup, /stage_private_configuration "\/etc\/echo-archives\/monitoring\.env" "monitoring\.env"/);
  assert.match(offsiteBackup, /"\/etc\/echo-archives\/better-stack\.env" "better-stack\.env"/);
  assert.match(offsiteBackup, /"\/etc\/echo-archives\/pi-restic\.env" "pi-restic\.env"/);
  assert.match(offsiteBackup, /"echo-archives-journald\.conf"/);
  assert.match(offsiteBackup, /"echo-archives-discovery-runtime-account\.conf"/);
  assert.match(offsiteBackup, /"echo-archives-offsite-backup-heartbeat\.conf"/);
  assert.match(offsiteBackup, /"echo-archives-runtime-account-readiness"/);
  assert.match(offsiteBackup, /"\/etc\/systemd\/system\/ollama\.service" "ollama\.service"/);
  assert.doesNotMatch(offsiteBackup, /configuration\/pi-restic-password/);
  assert.doesNotMatch(offsiteBackup, /configuration\/echo-archives-pi-backup/);
  assert.match(offsiteBackup, /restic backup --json --tag echo-archives/);
  assert.match(offsiteBackup, /--keep-daily 7/);
  assert.match(offsiteBackup, /--group-by host,tags/);
  assert.match(offsiteBackup, /restic check/);
  assert.match(offsiteBackup, /RESTIC_PASSWORD_FILE must have mode 0600/);
  assert.doesNotMatch(offsiteBackup, /community\.sqlite(?:["' \n]|$)/);

  const piBackupCompletion = read("deploy/complete-pi-backup-setup.sh");
  assert.match(piBackupCompletion, /DRILL_SNAPSHOT=""/);
  assert.match(piBackupCompletion, /DRILL_SNAPSHOT="\$\(last_successful_snapshot_id\)"/);
  assert.match(piBackupCompletion, /select-restic-success-snapshot\.js/);
  assert.match(piBackupCompletion, /--marker "\$\{OFFSITE_SUCCESS_MARKER\}"/);
  assert.match(offsiteBackup, /mv -Tf -- "\$\{MARKER_TEMP\}" "\$\{SUCCESS_MARKER\}"/);
  assert.doesNotMatch(offsiteBackup, /install .*MARKER_TEMP.*SUCCESS_MARKER/);
  assert.match(piBackupCompletion, /restic snapshots --json --tag echo-archives/);
  assert.match(piBackupCompletion, /restic restore --verify --target "\$\{RESTORE_DIR\}"/);
  assert.match(piBackupCompletion, /APPLICATION_CHECK/);
  assert.match(piBackupCompletion, /OPERATOR_USER="\$\{OPERATOR_USER:-\$\{SUDO_USER:-\$\(id -un\)\}\}"/);
  assert.match(piBackupCompletion, /APP_USER="echo-archives"/);
  assert.match(
    piBackupCompletion,
    /APP_USER="\$\{APP_USER\}" \\\s*"\$\{APPLICATION_CHECK\}"/,
  );
  assert.match(piBackupCompletion, /find "\$\{RESTORE_DIR\}" -xdev -depth -delete/);
  assert.match(piBackupCompletion, /systemctl start "\$\{SERVICE_NAME\}"/);
  assert.match(piBackupCompletion, /Pi backup service is already active; refusing concurrent Restic work/);
  assert.doesNotMatch(piBackupCompletion, /did not record a new invocation/);
  assert.match(piBackupCompletion, /--repair-automation/);
  assert.match(piBackupCompletion, /reset_failed_unit "\$\{SERVICE_NAME\}"/);
  assert.match(piBackupCompletion, /reset_failed_unit "\$\{MONITOR_SERVICE\}"/);
  assert.match(piBackupCompletion, /systemctl is-failed --quiet "\$\{unit\}"/);
  assert.match(piBackupCompletion, /systemctl start "\$\{MONITOR_SERVICE\}"/);
  assert.match(piBackupCompletion, /systemctl enable --now "\$\{TIMER_NAME\}"/);
  assert.doesNotMatch(piBackupCompletion, /restic init/);
  assert.doesNotMatch(piBackupCompletion, /systemctl (?:reboot|poweroff)|shutdown\s+-r/);

  const restoredApplicationCheck = read("deploy/verify-restored-application.sh");
  assert.match(restoredApplicationCheck, /HOST=127\.0\.0\.1/);
  assert.match(restoredApplicationCheck, /RESTORE_TEST_PORT:-3911/);
  assert.match(restoredApplicationCheck, /COMMUNITY_RATING_WRITES_ENABLED=false/);
  assert.match(restoredApplicationCheck, /IMPORT_AUTO_WORKER=false/);
  assert.match(restoredApplicationCheck, /\/api\/health/);
  assert.match(restoredApplicationCheck, /\/data\/shows\.json/);
  assert.match(restoredApplicationCheck, /\/shows\/\$\{first_show_id\}/);
  assert.match(restoredApplicationCheck, /runtime account cannot read the restored database/);
  assert.match(restoredApplicationCheck, /runtime account cannot write beside the restored database/);
  assert.match(restoredApplicationCheck, /restored SQLite sidecar is unsafe/);
  assert.match(restoredApplicationCheck, /\$\{DATABASE_PATH\}-shm/);
  assert.match(restoredApplicationCheck, /\$\{DATABASE_PATH\}-wal/);
  assert.match(restoredApplicationCheck, /VERIFY_ARCHIVIST_EXPECTED_SOURCE/);
  assert.match(restoredApplicationCheck, /What should I listen to next\?/);
  assert.doesNotMatch(
    restoredApplicationCheck,
    /Recommend one completed science-fiction audio drama/,
  );
  assert.match(restoredApplicationCheck, /Ask the Archivist behavior mismatch/);
  assert.match(restoredApplicationCheck, /health\.durability\?\.synchronous !== "FULL"/);

  const completeMaintenance = read("deploy/complete-launch-maintenance.sh");
  assert.match(completeMaintenance, /migrate-echo-archives-runtime-account\.sh" --repair-access/);
  assert.match(completeMaintenance, /ACL drift was repaired without rerunning/);

  const finalMaintenance = read("deploy/final-production-launch-maintenance.sh");
  assert.match(finalMaintenance, /ufw delete allow "\$\{target\}"/);
  assert.match(finalMaintenance, /ufw allow 8080\/tcp comment "Jarvis API and WebSocket"/);
  assert.match(finalMaintenance, /validate_ufw_command_grammar/);
  assert.match(finalMaintenance, /systemctl disable --now "\$\{ROOT_AUTH_SERVICE\}"/);
  assert.match(finalMaintenance, /systemctl enable --now echo-archives-local-monitor\.timer/);
  assert.match(finalMaintenance, /REBOOT REQUIRED\. This script never reboots automatically/);
  assert.match(finalMaintenance, /TCP 8080 remains deliberately retained for Jarvis; UDP 8080 is removed/);
  assert.doesNotMatch(finalMaintenance, /ufw --force (?:allow|delete)/);
  assert.doesNotMatch(finalMaintenance, /ufw (?:--force )?(?:delete|deny).*22/);
  assert.doesNotMatch(finalMaintenance, /systemctl (?:reboot|poweroff)|shutdown\s+-r/);

  const localReadiness = read("deploy/complete-local-launch-readiness.sh");
  assert.match(localReadiness, /nft -j list ruleset/);
  assert.match(localReadiness, /iptables-save/);
  assert.match(localReadiness, /ip6tables-save/);
  assert.match(localReadiness, /ufw6-user-input/);
  assert.match(localReadiness, /Obsolete .* rule remains/);
  assert.match(localReadiness, /10-mongodb-readiness\.conf/);
  assert.match(localReadiness, /mongosh --quiet --host 127\.0\.0\.1/);
  assert.match(localReadiness, /systemctl disable --now "\$\{ROOT_AUTH_SERVICE\}"/);
  assert.match(localReadiness, /capture_and_validate_firewall after/);
  assert.doesNotMatch(localReadiness, /ufw (?:allow|delete|reset|disable)/);
  assert.doesNotMatch(localReadiness, /nft (?:add|delete|flush)/);
  assert.doesNotMatch(localReadiness, /ip6?tables\s+-[AIDF]/);
  assert.doesNotMatch(localReadiness, /for \(index\s*=/);
  assert.doesNotMatch(localReadiness, /systemctl (?:reboot|poweroff)|shutdown\s+-r/);
});

test("checked-in service and proxy retain production hardening", () => {
  const service = read("deploy/echo-archives.service");
  const stagingService = read("deploy/echo-archives-staging.service");
  for (const setting of [
    "User=echo-archives",
    "Group=echo-archives",
    "Environment=NODE_ENV=production",
    "Environment=DEPLOYMENT_ENV=production",
    "Environment=HOST=127.0.0.1",
    "Environment=DB_PATH=/var/lib/echo-archives/community.sqlite",
    "WorkingDirectory=/srv/echo-archives/current/backend",
    "EnvironmentFile=/srv/echo-archives/shared/env/production.env",
    "Environment=STATIC_ROOT=/srv/echo-archives/runtime/production/current",
    "Environment=IMPORT_STAGING_ROOT=/srv/echo-archives/runtime/production/current/import-staging",
    "ExecStartPre=/usr/bin/node /srv/echo-archives/current/backend/scripts/check-config.js",
    "ExecStart=/usr/bin/node /srv/echo-archives/current/backend/server.js",
    "Restart=on-failure",
    "TimeoutStopSec=15",
    "UMask=0027",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "PrivateDevices=true",
    "ProtectHome=read-only",
    "ProtectSystem=strict",
    "ProtectClock=true",
    "ProtectControlGroups=true",
    "ProtectHostname=true",
    "ProtectKernelLogs=true",
    "ProtectKernelModules=true",
    "ProtectKernelTunables=true",
    "CapabilityBoundingSet=",
    "LockPersonality=true",
    "ProtectProc=invisible",
    "ProcSubset=pid",
    "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
    "RestrictNamespaces=true",
    "RestrictRealtime=true",
    "RestrictSUIDSGID=true",
    "SystemCallArchitectures=native",
    "StateDirectory=echo-archives",
    "StateDirectoryMode=0750",
    "ReadOnlyPaths=/srv/echo-archives/releases",
    "ReadWritePaths=/var/lib/echo-archives",
    "ReadWritePaths=/srv/echo-archives/runtime/production/current/data",
    "LogNamespace=echo-archives",
  ]) {
    assert.match(service, new RegExp(setting.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const path of [
    "import-staging",
    "catalog-src/shows",
    "images/covers",
    "images/generated/covers",
    "data",
    "data/reviews",
    "docs/generated",
  ]) {
    assert.match(service, new RegExp(`^ReadWritePaths=/srv/echo-archives/runtime/production/current/${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }
  assert.doesNotMatch(service, /\/home\/charlie\/The-Echo-Archives/);
  assert.doesNotMatch(service, /^EnvironmentFile=-/m);
  assert.doesNotMatch(service, /^Environment=COMMUNITY_RATING_WRITES_ENABLED=/m);

  const journalConfig = read("deploy/echo-archives-journald.conf");
  assert.match(journalConfig, /^Storage=persistent$/m);
  assert.match(journalConfig, /^Compress=yes$/m);
  assert.match(journalConfig, /^SystemMaxUse=256M$/m);
  assert.match(journalConfig, /^SystemKeepFree=1G$/m);
  assert.match(journalConfig, /^MaxFileSec=1day$/m);
  assert.match(journalConfig, /^MaxRetentionSec=14day$/m);

  const caddy = read("deploy/Caddyfile.echo");
  const caddyGlobal = read("deploy/Caddyfile.global.echo");
  const cloudflareRanges = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ];
  assert.match(caddy, /^echoarchives\.net \{$/m);
  assert.match(caddy, /^www\.echoarchives\.net \{$/m);
  assert.match(caddy, /^echo\.continental-hub\.com \{$/m);
  assert.match(caddy, /redir https:\/\/echoarchives\.net\{uri\} permanent/);
  assert.match(caddy, /encode zstd gzip/);
  assert.match(caddy, /-Server/);
  assert.match(caddy, /Strict-Transport-Security "max-age=31536000; includeSubDomains"/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3010/);
  assert.match(caddy, /not remote_ip/);
  assert.match(caddy, /abort @not_cloudflare/);
  assert.match(caddy, /header_up X-Forwarded-For \{http\.request\.header\.CF-Connecting-IP\}/);
  assert.match(caddyGlobal, /trusted_proxies_strict/);
  assert.match(caddyGlobal, /client_ip_headers CF-Connecting-IP/);
  assert.match(caddyGlobal, /strict_sni_host on/);
  for (const range of cloudflareRanges) {
    assert.match(caddy, new RegExp(range.replace(/[.:/]/g, "\\$&")));
    assert.match(caddyGlobal, new RegExp(range.replace(/[.:/]/g, "\\$&")));
  }
  const legacyBlock = caddy.slice(caddy.indexOf("echo.continental-hub.com"));
  assert.doesNotMatch(legacyBlock, /not remote_ip|abort @not_cloudflare/);
  assert.doesNotMatch(caddy, /Cache-Control/, "Express should own status-aware cache policy.");
  assert.match(service, /Environment=SITE_URL=https:\/\/echoarchives\.net/);

  const backupService = read("deploy/echo-archives-backup.service");
  const backupTimer = read("deploy/echo-archives-backup.timer");
  assert.match(backupService, /ExecStart=\/usr\/bin\/node .*tools\/backup-database\.js/);
  assert.match(backupService, /User=echo-archives/);
  assert.match(backupService, /--source \/var\/lib\/echo-archives\/community\.sqlite/);
  assert.match(backupService, /BACKUP_DIR=\/var\/backups\/echo-archives/);
  assert.match(backupService, /UMask=0077/);
  assert.match(backupTimer, /Persistent=true/);
  assert.match(backupTimer, /Unit=echo-archives-backup\.service/);

  const localMonitorService = read("deploy/echo-archives-local-monitor.service");
  const offsiteService = read("deploy/echo-archives-offsite-backup.service");
  const discoveryService = read("deploy/echo-archives-discovery.service");
  const offsiteScript = read("deploy/echo-archives-offsite-backup.sh");
  const offsiteTimer = read("deploy/echo-archives-offsite-backup.timer");
  assert.match(localMonitorService, /User=echo-archives/);
  assert.match(localMonitorService, /WorkingDirectory=\/usr\/local\/lib\/echo-archives/);
  assert.match(localMonitorService, /APP_RELEASE_ROOT=\/srv\/echo-archives\/current/);
  assert.match(
    localMonitorService,
    /ExecStart=\/bin\/bash \/usr\/local\/lib\/echo-archives\/check-echo-archives-production\.sh/,
  );
  assert.doesNotMatch(localMonitorService, /ExecStart=.*\/srv\/echo-archives\/current/);
  assert.doesNotMatch(localMonitorService, /ExecStart=.*\/home\/charlie/);
  assert.match(localMonitorService, /NoNewPrivileges=true/);
  assert.match(offsiteService, /After=network-online\.target tailscaled\.service echo-archives-backup\.service/);
  assert.match(offsiteService, /WorkingDirectory=\/usr\/local\/lib\/echo-archives/);
  assert.match(offsiteService, /APP_RELEASE_ROOT=\/srv\/echo-archives\/current/);
  assert.match(offsiteService, /ProtectSystem=strict/);
  assert.match(offsiteService, /ProtectHome=read-only/);
  assert.match(
    offsiteService,
    /^ReadWritePaths=\/var\/backups\/echo-archives$/m,
  );
  assert.doesNotMatch(
    offsiteService,
    /^ReadWritePaths=\/home\/charlie(?:\/The-Echo-Archives)?$/m,
  );
  assert.match(offsiteService, /EnvironmentFile=\/etc\/echo-archives\/pi-restic\.env/);
  assert.match(offsiteService, /Environment=MAX_LOCAL_BACKUP_AGE_HOURS=6/);
  assert.match(
    offsiteService,
    /ExecStart=\/bin\/bash \/usr\/local\/lib\/echo-archives\/echo-archives-offsite-backup\.sh/,
  );
  assert.doesNotMatch(offsiteService, /ExecStart=.*\/srv\/echo-archives\/current/);
  assert.doesNotMatch(offsiteService, /ExecStart=.*\/home\/charlie/);
  assert.match(offsiteService, /ExecStartPre=\/usr\/bin\/tailscale ping/);
  assert.match(offsiteService, /ExecStartPre=\/usr\/bin\/ssh .* echo-backup-pi/);
  for (const deploymentFile of [
    service,
    stagingService,
    backupService,
    discoveryService,
    localMonitorService,
    offsiteService,
    offsiteScript,
  ]) {
    assert.doesNotMatch(deploymentFile, /\/home\/charlie\/The-Echo-Archives/);
  }
  assert.match(offsiteTimer, /OnCalendar=\*-\*-\* 04:00:00/);
  assert.match(offsiteTimer, /Unit=echo-archives-offsite-backup\.service/);

  const rootPackage = JSON.parse(read("package.json"));
  assert.match(rootPackage.scripts.verify, /npm run test:tools/);
  assert.equal(rootPackage.scripts["check:backup"], "node tools/check-database-backup.js");
  assert.equal(rootPackage.engines.node, ">=22.12");

  const backendPackage = JSON.parse(read("backend/package.json"));
  assert.equal(backendPackage.engines.node, ">=22.12");

  const verifyWorkflow = read(".github/workflows/verify.yml");
  assert.match(verifyWorkflow, /node-version: "22\.23\.1"/);
  assert.doesNotMatch(verifyWorkflow, /node-version: "20"/);
});
