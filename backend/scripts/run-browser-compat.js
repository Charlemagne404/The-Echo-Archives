const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { chromium, firefox, webkit } = require("playwright");

const backendRoot = path.resolve(__dirname, "..");
const browserTypes = { chromium, firefox, webkit };
const runnerArgs = process.argv.slice(2);
const browserArgument = runnerArgs.find((argument) => argument.startsWith("--browser="));
const suiteArgument = runnerArgs.find((argument) => argument.startsWith("--suite="));
const timeoutArgument = runnerArgs.find((argument) => argument.startsWith("--timeout-ms="));
const requestedBrowser = browserArgument?.slice("--browser=".length).trim().toLowerCase() || "";
const requestedSuite = suiteArgument?.slice("--suite=".length).trim().toLowerCase() || "";
const requestedTimeout = Number.parseInt(timeoutArgument?.slice("--timeout-ms=".length) || "", 10);
const suiteTimeoutMs = Number.isInteger(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : 180_000;
const suites = [
  { label: "IndexedDB service behavior", files: ["test/listener-library.test.js"] },
  { label: "Library controls and Personal Discovery", files: ["test/listener-library-product.smoke.js"] },
  { label: "Fetch abort, slow-response timeout, and malformed JSON", files: ["test/browser-api-compat.smoke.js"] },
  { label: "Discovery, URL state, and navigation history", files: ["test/discovery-stability.smoke.js"] },
  {
    label: "Structured filters and mobile filter sheet",
    files: ["test/home-browse.smoke.js"],
    namePattern: "homepage supports structured filtering|homepage mobile filter uses a non-scrolling launcher sheet",
  },
  {
    label: "Service worker, mobile menu, and narrow public layout",
    files: ["test/browser.smoke.js"],
    namePattern: "static delivery files expose intentional HTTP statuses|service worker supports cached public pages offline|service worker update replaces a stale worker|mobile header menu opens, closes, and routes|public mobile route families preserve compact layouts",
  },
  {
    label: "Focus, correction, Library, and form accessibility",
    files: ["test/accessibility.smoke.js"],
    namePattern: "mobile navigation and filter sheet support keyboard focus|submission mode, tag-picker, and correction-result states|compact Library controls on cards and show pages|form validation exposes a field error",
  },
  {
    label: "Submit and show-correction flows",
    files: ["test/chat-submit-flow.smoke.js"],
    namePattern: "Ask the Archivist and the remade submit page interactions work across modes|submit drafts stay isolated across modes and show-specific correction contexts",
  },
  {
    label: "Maintainer file-import and review flow",
    files: ["test/maintainer-import.smoke.js"],
    namePattern: "maintainer import workspace handles progress, batch preparation, blockers, evidence, retry, review, and approval",
  },
  {
    label: "Narrow and touch viewport behavior",
    files: ["test/mobile-launch.smoke.js"],
    namePattern: "mobile launch viewport matrix keeps discovery and creator layouts inside the root viewport|mobile discovery, collection, and submit controls meet input and touch sizing floors",
  },
  { label: "Creators and entity routes", files: ["test/entity-directory.smoke.js", "test/creator-flow.smoke.js"] },
];

function runSuite(browserName, suite) {
  const args = ["--test", "--test-concurrency=1"];
  if (suite.namePattern) {
    args.push(`--test-name-pattern=${suite.namePattern}`);
  }
  args.push(...suite.files);

  console.log(`\n[compat] ${browserName}: ${suite.label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: backendRoot,
    env: { ...process.env, SMOKE_BROWSER: browserName },
    stdio: "inherit",
    timeout: suiteTimeoutMs,
  });

  if (result.error) {
    const description = result.error.code === "ETIMEDOUT"
      ? `timed out after ${suiteTimeoutMs}ms`
      : `could not start: ${result.error.message}`;
    console.error(`[compat] ${browserName}: ${suite.label} ${description}`);
    return result.error.code === "ETIMEDOUT" ? 124 : 1;
  }
  return typeof result.status === "number" ? result.status : 1;
}

async function runBrowserCompat() {
  const failures = [];
  const selectedBrowsers = requestedBrowser ? [requestedBrowser] : Object.keys(browserTypes);
  const selectedSuites = requestedSuite
    ? suites.filter((suite) => suite.label.toLowerCase().includes(requestedSuite))
    : suites;

  if (selectedBrowsers.some((name) => !Object.hasOwn(browserTypes, name))) {
    throw new Error(`Unsupported browser "${requestedBrowser}". Use chromium, firefox, or webkit.`);
  }
  if (selectedSuites.length === 0) {
    throw new Error(`No browser compatibility suite matches "${requestedSuite}".`);
  }

  for (const browserName of selectedBrowsers) {
    const browserType = browserTypes[browserName];
    const executable = browserType.executablePath();
    if (!fs.existsSync(executable)) {
      failures.push(`${browserName}: Playwright runtime missing at ${executable}`);
      console.error(`[compat] ERROR: ${failures.at(-1)}`);
      continue;
    }

    let browser;
    try {
      browser = await browserType.launch();
      console.log(`[compat] ${browserName}: ${browser.version()} (${executable})`);
    } catch (error) {
      failures.push(`${browserName}: could not launch Playwright runtime: ${error.message}`);
      console.error(`[compat] ERROR: ${failures.at(-1)}`);
      continue;
    } finally {
      await browser?.close();
    }

    for (const suite of selectedSuites) {
      const status = runSuite(browserName, suite);
      if (status !== 0) failures.push(`${browserName}: ${suite.label} exited with status ${status}`);
    }
  }

  if (failures.length) {
    console.error("\n[compat] Browser compatibility failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log(`\n[compat] Focused ${selectedBrowsers.join(", ")} compatibility suites passed (${selectedSuites.map((suite) => suite.label).join("; ")}).`);
}

runBrowserCompat().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
