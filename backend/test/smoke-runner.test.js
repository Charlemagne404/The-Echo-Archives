const assert = require("node:assert/strict");
const test = require("node:test");

const { REQUIRED_BROWSER_FLAG, runSmokeTests } = require("../scripts/run-smoke-tests");

function createRunnerOptions(overrides = {}) {
  return {
    env: { SMOKE_BROWSER: "chromium" },
    availableBrowserTypes: {
      chromium: { executablePath: () => "/tmp/echo-archives-test-chromium" },
    },
    existsSync: () => true,
    readDir: () => ["contract.smoke.js"],
    ...overrides,
  };
}

test("required browser mode proceeds into the smoke batch when the browser is available", () => {
  const calls = [];
  const status = runSmokeTests(
    createRunnerOptions({
      args: [REQUIRED_BROWSER_FLAG],
      env: {
        SMOKE_BROWSER: "chromium",
        SMOKE_TEST_READ_ONLY_CONCURRENCY: "1",
        SMOKE_TEST_STATEFUL_CONCURRENCY: "1",
      },
      runBatchImpl: (files, concurrency) => {
        calls.push({ files, concurrency });
        return 0;
      },
    }),
  );

  assert.equal(status, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ concurrency }) => concurrency), [1, 1]);
  assert.ok(calls.every(({ files }) => files.length > 0));
});

test("optional browser mode reports an explicit skip and succeeds when the browser is missing", () => {
  const output = [];
  const status = runSmokeTests(
    createRunnerOptions({
      existsSync: () => false,
      log: (message) => output.push(message),
    }),
  );

  assert.equal(status, 0);
  assert.equal(output.length, 1);
  assert.match(output[0], /^\[smoke\] SKIP:/);
  assert.match(output[0], /Browser coverage did not run/);
});

test("required browser mode fails clearly when the browser is missing", () => {
  const output = [];
  const status = runSmokeTests(
    createRunnerOptions({
      args: [REQUIRED_BROWSER_FLAG],
      existsSync: () => false,
      error: (message) => output.push(message),
    }),
  );

  assert.equal(status, 1);
  assert.equal(output.length, 1);
  assert.match(output[0], /Required browser verification could not run/);
  assert.match(output[0], /not installed/);
});

test("required browser mode preserves a non-zero smoke batch result", () => {
  const status = runSmokeTests(
    createRunnerOptions({
      args: [REQUIRED_BROWSER_FLAG, "--serial"],
      runBatchImpl: () => 1,
    }),
  );

  assert.equal(status, 1);
});
