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

test("deployment shell scripts parse and preserve the required safety order", () => {
  for (const relativePath of [
    "deploy/check-echo-archives-production.sh",
    "deploy/complete-local-launch-readiness.sh",
    "deploy/echo-archives-offsite-backup.sh",
    "deploy/final-production-launch-maintenance.sh",
    "deploy/install-echo-archives-system.sh",
    "deploy/migrate-echoarchives-domain.sh",
    "deploy/production-host-maintenance.sh",
    "deploy/update-echo-archives.sh",
  ]) {
    const result = spawnSync("bash", ["-n", path.join(ROOT, relativePath)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${relativePath}: ${result.stderr}`);
  }

  const updateScript = read("deploy/update-echo-archives.sh");
  assertOrdered(updateScript, [
    "git status --porcelain",
    "git pull --ff-only",
    "npm --prefix backend ci --omit=dev",
    "NODE_ENV=production npm run check:config",
    "npm run test:tools",
    "npm run backup:database",
    'sudo systemctl restart "${SERVICE_NAME}"',
    'curl --fail --silent --show-error --max-time 5 "${HEALTH_URL}"',
  ]);

  const installScript = read("deploy/install-echo-archives-system.sh");
  assertOrdered(installScript, [
    'caddy validate --config "${TMP_CADDYFILE}" --adapter caddyfile',
    'install -m 0644 "${TMP_CADDYFILE}" "${CADDYFILE}"',
    'install -m 0644 "${BACKUP_SERVICE_SOURCE}" "${BACKUP_SERVICE_DEST}"',
    'install -m 0644 "${BACKUP_TIMER_SOURCE}" "${BACKUP_TIMER_DEST}"',
    "systemctl restart echo-archives.service",
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
  assert.doesNotMatch(localMonitor, /curl[^]*\|[ \t]*grep -q/);

  const offsiteBackup = read("deploy/echo-archives-offsite-backup.sh");
  assert.match(offsiteBackup, /check-database-backup\.js/);
  assert.match(offsiteBackup, /restic backup --json --tag echo-archives/);
  assert.match(offsiteBackup, /--keep-daily 7/);
  assert.match(offsiteBackup, /RESTIC_PASSWORD_FILE must have mode 0600/);
  assert.doesNotMatch(offsiteBackup, /community\.sqlite(?:["' \n]|$)/);

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
    "Environment=NODE_ENV=production",
    "Environment=HOST=127.0.0.1",
    "Environment=COMMUNITY_RATING_WRITES_ENABLED=false",
    "ExecStartPre=/usr/bin/node /home/charlie/The-Echo-Archives/backend/scripts/check-config.js",
    "Restart=on-failure",
    "TimeoutStopSec=15",
    "UMask=0027",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
  ]) {
    assert.match(service, new RegExp(setting.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const caddy = read("deploy/Caddyfile.echo");
  assert.match(caddy, /^echoarchives\.net \{$/m);
  assert.match(caddy, /^www\.echoarchives\.net \{$/m);
  assert.match(caddy, /^echo\.continental-hub\.com \{$/m);
  assert.match(caddy, /redir https:\/\/echoarchives\.net\{uri\} permanent/);
  assert.match(caddy, /encode zstd gzip/);
  assert.match(caddy, /-Server/);
  assert.match(caddy, /Strict-Transport-Security "max-age=31536000; includeSubDomains"/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3010/);
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
  assert.match(localMonitorService, /User=charlie/);
  assert.match(localMonitorService, /NoNewPrivileges=true/);
  assert.match(offsiteService, /ConditionPathExists=\/etc\/echo-archives\/offsite-backup\.env/);
  assert.match(offsiteService, /ProtectSystem=strict/);
  assert.match(offsiteService, /EnvironmentFile=\/etc\/echo-archives\/offsite-backup\.env/);

  const rootPackage = JSON.parse(read("package.json"));
  assert.match(rootPackage.scripts.verify, /npm run test:tools/);
  assert.equal(rootPackage.scripts["check:backup"], "node tools/check-database-backup.js");
});
