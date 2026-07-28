const path = require("node:path");

const { loadCatalog } = require("../lib/catalog");
const { HEALTH_CLASSIFICATIONS, checkCatalogExternalLinks } = require("../lib/external-link-health");

const siteRoot = path.resolve(__dirname, "../..");
const DEFAULTS = Object.freeze({
  concurrency: 4,
  maxRedirects: 8,
  retries: 2,
  retryDelayMs: 750,
  timeoutMs: 12_000,
});

function readIntegerOption(args, name, fallback, { min, max }) {
  const prefix = `--${name}=`;
  const rawValue = args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (rawValue === undefined) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`--${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function parseArgs(args) {
  const knownFlags = new Set(["--confirm-network", "--help", "--json"]);
  args.forEach((argument) => {
    if (knownFlags.has(argument) || /^--(?:concurrency|max-redirects|retries|retry-delay-ms|timeout-ms)=/.test(argument)) {
      return;
    }
    throw new Error(`Unknown option: ${argument}`);
  });

  return {
    confirmNetwork: args.includes("--confirm-network"),
    help: args.includes("--help"),
    json: args.includes("--json"),
    concurrency: readIntegerOption(args, "concurrency", DEFAULTS.concurrency, { min: 1, max: 8 }),
    maxRedirects: readIntegerOption(args, "max-redirects", DEFAULTS.maxRedirects, { min: 0, max: 10 }),
    retries: readIntegerOption(args, "retries", DEFAULTS.retries, { min: 0, max: 3 }),
    retryDelayMs: readIntegerOption(args, "retry-delay-ms", DEFAULTS.retryDelayMs, { min: 0, max: 10_000 }),
    timeoutMs: readIntegerOption(args, "timeout-ms", DEFAULTS.timeoutMs, { min: 1_000, max: 60_000 }),
  };
}

function printHelp() {
  console.log(`External link health (opt-in; intended for low-frequency scheduled or manual use)

Usage:
  npm run check:external-links -- --confirm-network [options]

Options:
  --json                 Emit machine-readable JSON.
  --concurrency=1..8     Bound simultaneous destinations (default: ${DEFAULTS.concurrency}).
  --retries=0..3         Retry non-successful checks (default: ${DEFAULTS.retries}).
  --retry-delay-ms=N     Wait 0..10000 ms between retries (default: ${DEFAULTS.retryDelayMs}).
  --timeout-ms=N         Bound each attempt to 1000..60000 ms (default: ${DEFAULTS.timeoutMs}).
  --max-redirects=0..10  Follow bounded HTTP redirects (default: ${DEFAULTS.maxRedirects}).

This command uses GET requests against published catalog listen/official destinations.
It is deliberately excluded from normal verify. No network request is made unless
--confirm-network is present.

Exit codes:
  0  Every destination returned a successful HTTP response.
  1  One or more destinations produced a confirmed HTTP failure after retries.
  2  No confirmed failure, but DNS/TLS/timeout/bot-block/inconclusive results need review.`);
}

function formatReferences(references) {
  return references
    .map((reference) => `${reference.showId}:${reference.field}`)
    .join(", ");
}

function printTextReport(report) {
  console.log(`Checked ${report.total} deduplicated published catalog destinations with GET.`);
  HEALTH_CLASSIFICATIONS.forEach((classification) => {
    console.log(`${classification}: ${report.summary[classification] || 0}`);
  });

  report.results
    .filter((result) => result.classification !== "healthy")
    .forEach((result) => {
      const status = result.status === null ? "" : ` HTTP ${result.status}`;
      console.log(
        `[${result.classification}]${status} ${result.url} (${result.reason}; ${result.attemptCount} attempt${result.attemptCount === 1 ? "" : "s"}; ${formatReferences(result.references)})`,
      );
    });
}

function getExitCode(report) {
  if ((report.summary["confirmed-http-failure"] || 0) > 0) {
    return 1;
  }

  const uncertainCount = ["dns-error", "tls-error", "timeout", "bot-block", "inconclusive"]
    .reduce((total, classification) => total + (report.summary[classification] || 0), 0);
  return uncertainCount > 0 ? 2 : 0;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return 0;
  }
  if (!options.confirmNetwork) {
    printHelp();
    console.error("\nRefusing to make external requests without --confirm-network.");
    return 2;
  }

  const catalog = await loadCatalog(siteRoot);
  const report = await checkCatalogExternalLinks(catalog, options);
  if (options.json) {
    console.log(JSON.stringify({
      checkedAt: new Date().toISOString(),
      ...report,
    }, null, 2));
  } else {
    printTextReport(report);
  }
  return getExitCode(report);
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 2;
    });
}

module.exports = {
  DEFAULTS,
  getExitCode,
  main,
  parseArgs,
};
