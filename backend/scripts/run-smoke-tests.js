const path = require("node:path");
const { spawnSync } = require("node:child_process");

const testRoot = path.resolve(__dirname, "..");
// Keep mutating flows isolated while overlapping the slower read-only browser smoke files.
const readOnlySmokeFiles = [
  "test/home-browse.smoke.js",
  "test/home-card-interactions.smoke.js",
  "test/show-detail-navigation.smoke.js",
  "test/creator-flow.smoke.js",
  "test/browser.smoke.js",
  "test/discovery-stability.smoke.js",
];
const statefulSmokeFiles = ["test/chat-submit-flow.smoke.js", "test/community-rating-flow.smoke.js"];

function resolveConcurrency(envVarName, fallback) {
  const configuredValue = Number.parseInt(process.env[envVarName] || "", 10);
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

const readOnlyStatus = runBatch(readOnlySmokeFiles, resolveConcurrency("SMOKE_TEST_READ_ONLY_CONCURRENCY", 1));
const statefulStatus = runBatch(statefulSmokeFiles, resolveConcurrency("SMOKE_TEST_STATEFUL_CONCURRENCY", 1));

process.exit(readOnlyStatus || statefulStatus);
