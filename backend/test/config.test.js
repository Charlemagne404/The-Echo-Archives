const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backendRoot = path.resolve(__dirname, "..");

function runConfig(envOverrides = {}, source = "const c=require('./lib/config'); c.validateConfig(c);") {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    SITE_URL: "https://echo.example.com",
    DB_PATH: path.join(backendRoot, "data", "test.sqlite"),
    COMMUNITY_RATING_WRITES_ENABLED: "false",
    COMMUNITY_TURNSTILE_ENABLED: "false",
    COMMUNITY_TURNSTILE_SITE_KEY: "",
    COMMUNITY_TURNSTILE_SECRET_KEY: "",
    COMMUNITY_VOTER_HASH_SECRET: "",
    MAINTAINER_REVIEW_PASSPHRASE: "",
    MAINTAINER_REVIEW_COOKIE_SECRET: "",
    ACCESS_LOG_ENABLED: "false",
    ACCESS_LOG_HMAC_SECRET: "",
    ...envOverrides,
  };
  Object.keys(env).forEach((key) => {
    if (env[key] === undefined) delete env[key];
  });
  return spawnSync(process.execPath, ["-e", source], {
    cwd: backendRoot,
    env,
    encoding: "utf8",
  });
}

test("production defaults community rating writes to read-only", () => {
  const result = runConfig(
    { COMMUNITY_RATING_WRITES_ENABLED: undefined },
    "const c=require('./lib/config'); c.validateConfig(c); process.stdout.write(JSON.stringify({writes:c.COMMUNITY_RATING_WRITES_ENABLED,host:c.HOST}));",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { writes: false, host: "127.0.0.1" });
});

test("production configuration rejects non-origin SITE_URL and incomplete maintainer auth", () => {
  const invalidOrigin = runConfig({ SITE_URL: "https://echo.example.com/archive?preview=1" });
  assert.equal(invalidOrigin.status, 1);
  assert.match(invalidOrigin.stderr, /public origin/i);

  const incompleteAuth = runConfig({ MAINTAINER_REVIEW_PASSPHRASE: "long-enough-passphrase" });
  assert.equal(incompleteAuth.status, 1);
  assert.match(incompleteAuth.stderr, /must be configured together/i);
});

test("production rating writes require complete Turnstile and voter-secret configuration", () => {
  const incomplete = runConfig({ COMMUNITY_RATING_WRITES_ENABLED: "true" });
  assert.equal(incomplete.status, 1);
  assert.match(incomplete.stderr, /Turnstile/i);
  assert.match(incomplete.stderr, /VOTER_HASH_SECRET/i);

  const valid = runConfig({
    COMMUNITY_RATING_WRITES_ENABLED: "true",
    COMMUNITY_TURNSTILE_ENABLED: "true",
    COMMUNITY_TURNSTILE_SITE_KEY: "site-key",
    COMMUNITY_TURNSTILE_SECRET_KEY: "secret-key",
    COMMUNITY_VOTER_HASH_SECRET: "a-stable-production-voter-secret-123456789",
  });
  assert.equal(valid.status, 0, valid.stderr);
});

test("production config warnings identify a missing maintainer review path", () => {
  const result = runConfig(
    {},
    "const c=require('./lib/config'); c.validateConfig(c); process.stdout.write(c.getConfigWarnings(c).join('\\n'));",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /submissions cannot be reviewed/i);
});

test("access observability requires a private HMAC secret when enabled", () => {
  const missing = runConfig({ ACCESS_LOG_ENABLED: "true" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /ACCESS_LOG_HMAC_SECRET/);

  const valid = runConfig({
    ACCESS_LOG_ENABLED: "true",
    ACCESS_LOG_HMAC_SECRET: "test-production-log-secret-value-123456789",
  });
  assert.equal(valid.status, 0, valid.stderr);
});
