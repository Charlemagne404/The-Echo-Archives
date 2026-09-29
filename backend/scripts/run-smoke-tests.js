const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { chromium, firefox, webkit } = require("playwright");

const testRoot = path.resolve(__dirname, "..");
const smokeTestDirectory = path.join(testRoot, "test");
// Keep mutating flows isolated while overlapping the slower read-only browser smoke files.
const readOnlySmokeFiles = [
  "test/accessibility.smoke.js",
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
  "test/discovery-analytics.handler.smoke.js",
];
const statefulSmokeFiles = [
  "test/chat-submit-flow.smoke.js",
  "test/community-rating-flow.smoke.js",
  "test/discovery-analytics.smoke.js",
  "test/listener-library-product.smoke.js",
];

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

function discoverSmokeFiles(readDir = fs.readdirSync) {
  return readDir(smokeTestDirectory)
    .filter((fileName) => fileName.endsWith(".smoke.js"))
    .sort()
    .map((fileName) => path.join("test", fileName));
}

function getSmokeInventoryProblems(discoveredFiles) {
  const configuredFiles = [...readOnlySmokeFiles, ...statefulSmokeFiles];
  const configuredSet = new Set(configuredFiles);
  const discoveredSet = new Set(discoveredFiles);
  const duplicateFiles = configuredFiles.filter((file, index) => configuredFiles.indexOf(file) !== index);
  const unassignedFiles = discoveredFiles.filter((file) => !configuredSet.has(file));
  const staleFiles = configuredFiles.filter((file) => !discoveredSet.has(file));
  return { duplicateFiles, unassignedFiles, staleFiles };
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
    const allSmokeFiles = discoverSmokeFiles(readDir);
    if (allSmokeFiles.length === 0) {
      error(`[smoke] ERROR: No browser smoke files found in ${smokeTestDirectory}.`);
      return 1;
    }
    return runBatchImpl(allSmokeFiles, 1);
  }

  const inventoryProblems = getSmokeInventoryProblems(discoverSmokeFiles(readDir));
  if (
    inventoryProblems.duplicateFiles.length > 0 ||
    inventoryProblems.unassignedFiles.length > 0 ||
    inventoryProblems.staleFiles.length > 0
  ) {
    error(
      `[smoke] ERROR: Browser smoke inventory is incomplete. ` +
      `Unassigned: ${inventoryProblems.unassignedFiles.join(", ") || "none"}; ` +
      `stale: ${inventoryProblems.staleFiles.join(", ") || "none"}; ` +
      `duplicated: ${inventoryProblems.duplicateFiles.join(", ") || "none"}.`,
    );
    return 1;
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
