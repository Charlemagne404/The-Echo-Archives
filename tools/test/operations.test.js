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

test("deployment shell scripts parse and preserve the required safety order", () => {
  for (const relativePath of ["deploy/install-echo-archives-system.sh", "deploy/update-echo-archives.sh"]) {
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
    "systemctl restart echo-archives.service",
    "systemctl reload caddy",
  ]);
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
  assert.match(caddy, /^echo\.continental-hub\.com \{$/m);
  assert.match(caddy, /redir https:\/\/echoarchives\.net\{uri\} permanent/);
  assert.match(caddy, /encode zstd gzip/);
  assert.match(caddy, /-Server/);
  assert.match(caddy, /Strict-Transport-Security "max-age=31536000; includeSubDomains"/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3010/);
  assert.doesNotMatch(caddy, /Cache-Control/, "Express should own status-aware cache policy.");
  assert.match(service, /Environment=SITE_URL=https:\/\/echoarchives\.net/);

  const rootPackage = JSON.parse(read("package.json"));
  assert.match(rootPackage.scripts.verify, /npm run test:tools/);
});
