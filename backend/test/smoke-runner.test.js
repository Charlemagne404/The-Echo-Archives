const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { REQUIRED_BROWSER_FLAG, runSmokeTests } = require("../scripts/run-smoke-tests");

function createRunnerOptions(overrides = {}) {
  return {
    env: { SMOKE_BROWSER: "chromium" },
    availableBrowserTypes: {
      chromium: { executablePath: () => "/tmp/echo-archives-test-chromium" },
    },
    existsSync: () => true,
    readDir: fs.readdirSync,
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

  const expectedFiles = fs.readdirSync(path.join(__dirname))
    .filter((fileName) => fileName.endsWith(".smoke.js"))
    .sort()
    .map((fileName) => path.join("test", fileName));
  const scheduledFiles = calls.flatMap(({ files }) => files).sort();
  assert.deepEqual(scheduledFiles, expectedFiles, "the required browser gate schedules every smoke file exactly once");
  assert.equal(new Set(scheduledFiles).size, scheduledFiles.length, "smoke files are not scheduled more than once");
});

test("serial smoke mode discovers files from backend/test and runs the complete inventory", () => {
  const smokeDirectory = path.join(__dirname);
  const expectedFiles = fs.readdirSync(smokeDirectory)
    .filter((fileName) => fileName.endsWith(".smoke.js"))
    .sort()
    .map((fileName) => path.join("test", fileName));
  const calls = [];
  const status = runSmokeTests(
    createRunnerOptions({
      args: ["--serial"],
      readDir: (directory) => {
        assert.equal(directory, smokeDirectory);
        return fs.readdirSync(directory);
      },
      runBatchImpl: (files, concurrency) => {
        calls.push({ files, concurrency });
        return 0;
      },
    }),
  );

  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { files: expectedFiles, concurrency: 1 });
});

test("required browser mode fails closed when a discovered smoke file is unassigned", () => {
  const errors = [];
  let batchStarted = false;
  const status = runSmokeTests(
    createRunnerOptions({
      args: [REQUIRED_BROWSER_FLAG],
      readDir: (directory) => [...fs.readdirSync(directory), "future.smoke.js"],
      runBatchImpl: () => {
        batchStarted = true;
        return 0;
      },
      error: (message) => errors.push(message),
    }),
  );

  assert.equal(status, 1);
  assert.equal(batchStarted, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Unassigned: test\/future\.smoke\.js/);
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
