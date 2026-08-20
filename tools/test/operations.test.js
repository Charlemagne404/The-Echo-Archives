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
    "deploy/update-echo-archives.sh",
    "deploy/verify-deployment-rollback-invariants.sh",
    "deploy/verify-restored-application.sh",
    "update-echo-archives.sh",
  ]) {
    const result = spawnSync("bash", ["-n", path.join(ROOT, relativePath)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${relativePath}: ${result.stderr}`);
  }

  const updateScript = read("deploy/update-echo-archives.sh");
  assertOrdered(updateScript, [
    "git status --porcelain",
    "git fetch --prune",
    'git worktree add --detach "${CANDIDATE_WORKTREE}" "${TARGET_REVISION}"',
    'npm --prefix "${CANDIDATE_WORKTREE}/backend" ci --omit=dev',
    'grant_runtime_dependency_read_access "${CANDIDATE_WORKTREE}/backend/node_modules"',
    "NODE_ENV=production npm run check:config",
    "npm run test:tools",
    "npm run backup:database",
    'git merge --ff-only "${TARGET_REVISION}"',
    'sudo systemctl restart "${SERVICE_NAME}"',
  ]);
  assert.match(
    updateScript,
    /wait_for_health\(\)[\s\S]*curl --fail --silent --show-error --max-time 5[\s\S]*"\$\{HEALTH_URL\}"/,
  );
  assert.match(
    updateScript,
    /sudo systemctl restart "\$\{SERVICE_NAME\}"[\s\S]*if ! wait_for_health/,
  );
  assert.match(updateScript, /journalctl --namespace=echo-archives/);
  assert.match(
    updateScript,
    /mv "\$\{CANDIDATE_WORKTREE\}\/backend\/node_modules" "\$\{REPO_ROOT\}\/backend\/node_modules"[\s\S]*verify_runtime_dependency_access[\s\S]*sudo systemctl restart/,
  );
  assert.match(
    updateScript,
    /PREVIOUS_DEPENDENCIES="\$\{CANDIDATE_PARENT\}\/node_modules\.previous"[\s\S]*git merge --ff-only "\$\{TARGET_REVISION\}"[\s\S]*DEPLOYMENT_APPLIED=true[\s\S]*mv "\$\{REPO_ROOT\}\/backend\/node_modules"/,
  );
  assert.match(
    updateScript,
    /HEALTH_SUMMARY="\$\([\s\S]*health\.service !== "echo-archives"[\s\S]*DEPLOYMENT_APPLIED=false[\s\S]*cleanup_tree "\$\{PREVIOUS_DEPENDENCIES\}"/,
  );
  assert.match(updateScript, /setfacl -m "u:\$\{RUNTIME_USER\}:r-x,d:u:\$\{RUNTIME_USER\}:r-x"/);
  assert.match(updateScript, /sudo -u "\$\{RUNTIME_USER\}" -- \/usr\/bin\/node/);

  const compatibilityUpdateScript = read("update-echo-archives.sh");
  assert.match(compatibilityUpdateScript, /CANONICAL_UPDATE=.*deploy\/update-echo-archives\.sh/);
  assert.match(compatibilityUpdateScript, /exec "\$\{CANONICAL_UPDATE\}" "\$@"/);
  assert.doesNotMatch(compatibilityUpdateScript, /npm (?:install|ci)|systemctl (?:reload|restart)/);

  const installScript = read("deploy/install-echo-archives-system.sh");
  assert.match(installScript, /Caddyfile\.global\.echo/);
  assert.match(installScript, /trusted_proxies_strict/);
  assert.match(installScript, /client_ip_headers CF-Connecting-IP/);
  assert.match(installScript, /strict_sni_host on/);
  assert.match(installScript, /RUNTIME_ACCOUNT_READINESS="\/var\/lib\/echo-archives-runtime-account\/readiness"/);
  assert.match(installScript, /migrate-echo-archives-runtime-account\.sh/);
  assert.match(installScript, /echo-archives-journald\.conf/);
  assert.match(installScript, /journalctl --namespace=echo-archives/);
  assertOrdered(installScript, [
    'caddy validate --config "${TMP_CADDYFILE}" --adapter caddyfile',
    'install -m 0644 "${TMP_CADDYFILE}" "${CADDYFILE}"',
    'install -m 0644 "${JOURNAL_CONFIG_SOURCE}" "${JOURNAL_CONFIG_DEST}"',
    'install -m 0644 "${BACKUP_SERVICE_SOURCE}" "${BACKUP_SERVICE_DEST}"',
    'install -m 0644 "${BACKUP_TIMER_SOURCE}" "${BACKUP_TIMER_DEST}"',
    "systemctl restart echo-archives.service",
    '"${RUNTIME_ACCOUNT_MIGRATION}" --check',
    "systemctl enable --now echo-archives-backup.timer",
    "systemctl reload caddy",
  ]);
  assert.match(installScript, /systemctl list-timers echo-archives-backup\.timer echo-archives-discovery\.timer/);

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
  assert.match(maintenanceScript, /nft list ruleset/);
  assert.match(maintenanceScript, /ufw status verbose/);
  assert.match(maintenanceScript, /REBOOT REQUIRED\. This script will not reboot automatically/);
  assert.doesNotMatch(maintenanceScript, /ufw (allow|delete|reset|disable)/);
  assert.doesNotMatch(maintenanceScript, /systemctl reboot|shutdown\s+-r/);

  const localMonitor = read("deploy/check-echo-archives-production.sh");
  assert.match(localMonitor, /--output "\$\{TEMP_DIR\}\/apex\.html"/);
  assert.match(localMonitor, /npm --prefix "\$\{REPO_ROOT\}" run check:backup/);
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
  assert.match(runtimeMigration, /health\?\.features\?\.accessLogs === true/);
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
  assert.match(offsiteBackup, /backend\/data\/import-staging/);
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
  assert.match(piBackupCompletion, /OPERATOR_USER="charlie"/);
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
  for (const setting of [
    "User=echo-archives",
    "Group=echo-archives",
    "Environment=NODE_ENV=production",
    "Environment=HOST=127.0.0.1",
    "Environment=DB_PATH=/var/lib/echo-archives/community.sqlite",
    "ExecStartPre=/usr/bin/node /home/charlie/The-Echo-Archives/backend/scripts/check-config.js",
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
    "ReadOnlyPaths=/home/charlie/The-Echo-Archives",
    "ReadWritePaths=/var/lib/echo-archives",
    "LogNamespace=echo-archives",
  ]) {
    assert.match(service, new RegExp(setting.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const path of [
    "backend/data/import-staging",
    "catalog-src/shows",
    "images/covers",
    "images/generated/covers",
    "data/reviews",
    "data/shows.json",
    "data/collections.json",
    "data/search-index.json",
    "data/archive-stats.json",
    "docs/generated/catalog-status.json",
    "docs/generated/catalog-status.md",
  ]) {
    assert.match(service, new RegExp(`^ReadWritePaths=/home/charlie/The-Echo-Archives/${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }
  assert.doesNotMatch(service, /^ReadWritePaths=\/home\/charlie(?:\/The-Echo-Archives)?$/m);
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
  assert.match(backupService, /UMask=0077/);
  assert.match(backupTimer, /Persistent=true/);
  assert.match(backupTimer, /Unit=echo-archives-backup\.service/);

  const localMonitorService = read("deploy/echo-archives-local-monitor.service");
  const offsiteService = read("deploy/echo-archives-offsite-backup.service");
  const offsiteTimer = read("deploy/echo-archives-offsite-backup.timer");
  assert.match(localMonitorService, /User=charlie/);
  assert.match(localMonitorService, /NoNewPrivileges=true/);
  assert.match(offsiteService, /After=network-online\.target tailscaled\.service echo-archives-backup\.service/);
  assert.match(offsiteService, /ProtectSystem=strict/);
  assert.match(offsiteService, /ProtectHome=read-only/);
  assert.match(
    offsiteService,
    /^ReadWritePaths=\/home\/charlie\/The-Echo-Archives\/backend\/data\/backups$/m,
  );
  assert.doesNotMatch(
    offsiteService,
    /^ReadWritePaths=\/home\/charlie(?:\/The-Echo-Archives)?$/m,
  );
  assert.match(offsiteService, /EnvironmentFile=\/etc\/echo-archives\/pi-restic\.env/);
  assert.match(offsiteService, /Environment=MAX_LOCAL_BACKUP_AGE_HOURS=6/);
  assert.match(offsiteService, /ExecStart=\/home\/charlie\/The-Echo-Archives\/deploy\/echo-archives-offsite-backup\.sh/);
  assert.match(offsiteService, /ExecStartPre=\/usr\/bin\/tailscale ping/);
  assert.match(offsiteService, /ExecStartPre=\/usr\/bin\/ssh .* echo-backup-pi/);
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
