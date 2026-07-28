const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildHeartbeatEndpoint,
  main,
  notifyBetterStackHeartbeat,
  parseHeartbeatUrl,
  resolveHeartbeatEvent,
} = require("../../deploy/notify-better-stack-heartbeat");

const ROOT = path.resolve(__dirname, "../..");
const SECRET_TOKEN = "test_token_123456789";
const HEARTBEAT_URL = `https://uptime.betterstack.com/api/v1/heartbeat/${SECRET_TOKEN}`;

function response(status) {
  return { status };
}

test("Better Stack heartbeat URLs are strict and failure uses the documented endpoint", () => {
  const baseUrl = parseHeartbeatUrl(HEARTBEAT_URL);
  assert.equal(baseUrl.toString(), HEARTBEAT_URL);
  assert.equal(buildHeartbeatEndpoint(baseUrl, "success"), HEARTBEAT_URL);
  assert.equal(buildHeartbeatEndpoint(baseUrl, "failure"), `${HEARTBEAT_URL}/fail`);

  for (const unsafeUrl of [
    "",
    "http://uptime.betterstack.com/api/v1/heartbeat/test_token_123456789",
    "https://example.com/api/v1/heartbeat/test_token_123456789",
    "https://user:pass@uptime.betterstack.com/api/v1/heartbeat/test_token_123456789",
    "https://uptime.betterstack.com/api/v1/heartbeat/test_token_123456789?leak=true",
    "https://uptime.betterstack.com/api/v1/heartbeat/test_token_123456789/fail",
  ]) {
    assert.throws(() => parseHeartbeatUrl(unsafeUrl), /Better Stack heartbeat URL|HTTPS heartbeat URL/);
  }
});

test("success and failure notifications use GET without redirects or secret logging", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response(204);
  };
  const env = { BETTER_STACK_BACKUP_HEARTBEAT_URL: HEARTBEAT_URL };

  const success = await notifyBetterStackHeartbeat("success", {
    env,
    fetchImpl,
    maxAttempts: 1,
  });
  const failure = await notifyBetterStackHeartbeat("failure", {
    env,
    fetchImpl,
    maxAttempts: 1,
  });

  assert.deepEqual(success, { attemptCount: 1, event: "success", status: 204 });
  assert.deepEqual(failure, { attemptCount: 1, event: "failure", status: 204 });
  assert.deepEqual(calls.map((call) => call.url), [HEARTBEAT_URL, `${HEARTBEAT_URL}/fail`]);
  calls.forEach(({ options }) => {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.match(options.headers["user-agent"], /Echo-Archives-Backup-Heartbeat/);
  });
});

test("heartbeat delivery retries bounded provider failures", async () => {
  const statuses = [503, 502, 200];
  const delays = [];
  const result = await notifyBetterStackHeartbeat("success", {
    env: { BETTER_STACK_BACKUP_HEARTBEAT_URL: HEARTBEAT_URL },
    fetchImpl: async () => response(statuses.shift()),
    maxAttempts: 3,
    retryDelayMs: 25,
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  assert.equal(result.attemptCount, 3);
  assert.deepEqual(delays, [25, 25]);
});

test("heartbeat timeout and provider errors stay sanitized", async () => {
  const env = { BETTER_STACK_BACKUP_HEARTBEAT_URL: HEARTBEAT_URL };
  const stalledFetch = async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("request included secret")), { once: true });
    });

  await assert.rejects(
    () => notifyBetterStackHeartbeat("failure", {
      env,
      fetchImpl: stalledFetch,
      maxAttempts: 1,
      timeoutMs: 5,
    }),
    (error) => {
      assert.match(error.message, /request timeout/);
      assert.doesNotMatch(error.message, new RegExp(SECRET_TOKEN));
      return true;
    },
  );

  await assert.rejects(
    () => notifyBetterStackHeartbeat("success", {
      env,
      fetchImpl: async () => response(500),
      maxAttempts: 1,
    }),
    (error) => {
      assert.match(error.message, /HTTP 500/);
      assert.doesNotMatch(error.message, new RegExp(SECRET_TOKEN));
      return true;
    },
  );
});

test("systemd result mode skips clean stops and maps every failure to fail", async () => {
  assert.deepEqual(resolveHeartbeatEvent("systemd-result", { SERVICE_RESULT: "success" }), {
    event: "success",
    skip: true,
  });
  assert.deepEqual(resolveHeartbeatEvent("systemd-result", { SERVICE_RESULT: "exit-code" }), {
    event: "failure",
    skip: false,
  });
  assert.throws(() => resolveHeartbeatEvent("systemd-result", {}), /SERVICE_RESULT/);

  const originalLog = console.log;
  let fetchCalled = false;
  console.log = () => {};
  try {
    const exitCode = await main(["systemd-result"], {
      env: {
        BETTER_STACK_BACKUP_HEARTBEAT_URL: HEARTBEAT_URL,
        SERVICE_RESULT: "success",
      },
      fetchImpl: async () => {
        fetchCalled = true;
        return response(200);
      },
    });
    assert.equal(exitCode, 0);
    assert.equal(fetchCalled, false);
  } finally {
    console.log = originalLog;
  }
});

test("prepared Better Stack files contain no credentials and preserve backup ordering", () => {
  const accountEnv = fs.readFileSync(path.join(ROOT, "deploy/better-stack-account.env.example"), "utf8");
  const heartbeatEnv = fs.readFileSync(path.join(ROOT, "deploy/better-stack-heartbeat.env.example"), "utf8");
  const dropIn = fs.readFileSync(path.join(ROOT, "deploy/echo-archives-offsite-backup-heartbeat.conf"), "utf8");
  const backupScript = fs.readFileSync(path.join(ROOT, "deploy/echo-archives-offsite-backup.sh"), "utf8");
  const plan = fs.readFileSync(path.join(ROOT, "deploy/MONITORING_PLAN.md"), "utf8");

  assert.match(accountEnv, /^BETTER_STACK_API_TOKEN=$/m);
  assert.match(heartbeatEnv, /^BETTER_STACK_BACKUP_HEARTBEAT_URL=$/m);
  assert.doesNotMatch(`${accountEnv}\n${heartbeatEnv}`, /api\/v1\/heartbeat\/[A-Za-z0-9_-]{8,}/);
  assert.match(dropIn, /ExecStartPost=.*notify-better-stack-heartbeat\.js success/);
  assert.match(dropIn, /ExecStopPost=.*notify-better-stack-heartbeat\.js systemd-result/);
  assert.ok(backupScript.indexOf("check-database-backup.js") < backupScript.indexOf("restic check"));
  assert.ok(
    backupScript.indexOf("restic check") <
      backupScript.indexOf('install -m 0644 -o root -g root "${MARKER_TEMP}" "${SUCCESS_MARKER}"'),
  );
  assert.match(plan, /alerts@echoarchives\.net/);
  assert.match(plan, /normal multi-location/i);
});
