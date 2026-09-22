const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { chromium, firefox, webkit } = require("playwright");

const testRoot = path.resolve(__dirname, "..");
// Keep mutating flows isolated while overlapping the slower read-only browser smoke files.
const readOnlySmokeFiles = [
  "test/mobile-launch.smoke.js",
  "test/home-browse.smoke.js",
  "test/home-card-interactions.smoke.js",
  "test/show-detail-navigation.smoke.js",
  "test/creator-flow.smoke.js",
  "test/entity-directory.smoke.js",
  "test/browser.smoke.js",
  "test/discovery-stability.smoke.js",
  "test/maintainer-queue.smoke.js",
  "test/maintainer-import.smoke.js",
];
const statefulSmokeFiles = ["test/chat-submit-flow.smoke.js", "test/community-rating-flow.smoke.js"];

const browserTypes = { chromium, firefox, webkit };
const REQUIRED_BROWSER_FLAG = "--require-browser";

function resolveConcurrency(envVarName, fallback, env = process.env) {
  const configuredValue = Number.parseInt(env[envVarName] || "", 10);
  return Number.isInteger(configuredValue) && configuredValue > 0 ? configuredValue : fallback;
}

function runBatch(files, concurrency) {
  if (files.length === 0) {
    return 0;
  }

  if (concurrency === 1) {
    return files.reduce((status, file) => {
      const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", file], {
        cwd: testRoot,
        stdio: "inherit",
      });

      if (result.error) {
        throw result.error;
      }

      const fileStatus = typeof result.status === "number" ? result.status : 1;
      return status || fileStatus;
    }, 0);
  }

  const result = spawnSync(process.execPath, ["--test", `--test-concurrency=${concurrency}`, ...files], {
    cwd: testRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === "number" ? result.status : 1;
}

function runSmokeTests({
  args = process.argv.slice(2),
  env = process.env,
  availableBrowserTypes = browserTypes,
  existsSync = fs.existsSync,
  readDir = fs.readdirSync,
  runBatchImpl = runBatch,
  log = console.log,
  error = console.error,
} = {}) {
  const smokeBrowserName = String(env.SMOKE_BROWSER || "chromium").trim().toLowerCase();
  const smokeBrowserType = availableBrowserTypes[smokeBrowserName];
  if (!smokeBrowserType) {
    error(`Unsupported SMOKE_BROWSER "${smokeBrowserName}". Use chromium, firefox, or webkit.`);
    return 1;
  }

  const smokeBrowserExecutable = smokeBrowserType.executablePath();
  if (!existsSync(smokeBrowserExecutable)) {
    const setupCommand = `npm --prefix backend run test:setup:browser -- ${smokeBrowserName}`;
    const missingBrowserMessage =
      `Playwright ${smokeBrowserName} is not installed at ${smokeBrowserExecutable}.`;

    if (args.includes(REQUIRED_BROWSER_FLAG)) {
      error(
        `[smoke] ERROR: Required browser verification could not run: ${missingBrowserMessage} ` +
        `Run ${setupCommand} before retrying.`,
      );
      return 1;
    }

    log(
      `[smoke] SKIP: Browser coverage did not run: ${missingBrowserMessage} ` +
      `Run ${setupCommand} before treating browser smoke as release evidence.`,
    );
    return 0;
  }

  if (args.includes("--serial")) {
    const allSmokeFiles = readDir(testRoot)
      .filter((fileName) => fileName.endsWith(".smoke.js"))
      .sort()
      .map((fileName) => path.join("test", fileName));
    return runBatchImpl(allSmokeFiles, 1);
  }

  const readOnlyStatus = runBatchImpl(
    readOnlySmokeFiles,
    resolveConcurrency("SMOKE_TEST_READ_ONLY_CONCURRENCY", 1, env),
  );
  const statefulStatus = runBatchImpl(
    statefulSmokeFiles,
    resolveConcurrency("SMOKE_TEST_STATEFUL_CONCURRENCY", 1, env),
  );

  return readOnlyStatus || statefulStatus;
}

if (require.main === module) {
  try {
    process.exitCode = runSmokeTests();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_BROWSER_FLAG,
  runSmokeTests,
};
