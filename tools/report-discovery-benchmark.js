const fs = require("node:fs");
const path = require("node:path");

const {
  buildBenchmarkReport,
  captureBaseline,
  formatDiscoveryBenchmarkReport,
  readBenchmarkContext,
} = require("./lib/discovery-golden-benchmark");

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function defaultFixturePath(siteRoot) {
  return path.join(siteRoot, "docs/2.0/discovery-benchmark/golden-queries.v1.json");
}

function parseArguments(argv) {
  const options = { json: false, strict: false, captureBaseline: false, fixturePath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--strict") options.strict = true;
    else if (argument === "--capture-baseline") options.captureBaseline = true;
    else if (argument === "--fixture") options.fixturePath = argv[++index] || "";
    else if (argument.startsWith("--fixture=")) options.fixturePath = argument.slice("--fixture=".length);
    else if (argument.startsWith("--target=")) options.targetPath = argument.slice("--target=".length);
    else if (argument === "--target") options.targetPath = argv[++index] || "";
    else throw new Error("Unknown argument. Use --json, --strict, --fixture PATH, --target PATH, or --capture-baseline.");
  }
  if (options.captureBaseline && (options.json || options.strict)) throw new Error("--capture-baseline cannot be combined with --json or --strict.");
  return options;
}

function assertTargetContractAbsentForCapture(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const targetContract = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  if (Object.keys(targetContract.cases || {}).length > 0) {
    throw new Error("Capture the immutable v1 observations before adding assertions to the separate target contract.");
  }
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const siteRoot = resolveSiteRoot();
  const fixturePath = options.fixturePath ? path.resolve(siteRoot, options.fixturePath) : defaultFixturePath(siteRoot);
  const corpus = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const context = readBenchmarkContext(siteRoot);
  const defaultTargetPath = path.join(siteRoot, "docs/2.0/discovery-benchmark/target-contract.v2.json");
  const targetPath = options.targetPath ? path.resolve(siteRoot, options.targetPath) : defaultTargetPath;

  if (options.captureBaseline) {
    assertTargetContractAbsentForCapture(targetPath);
    const captured = captureBaseline(corpus, context, fixturePath);
    process.stdout.write(`Captured immutable ${captured.baseline.label} observations for ${captured.cases.length} cases at ${captured.baseline.catalogueRevision}.\n`);
    process.stdout.write(`Baseline implementation: ${captured.baseline.implementationCommit || "unknown"}. Target expectations remain absent and must be reviewed separately.\n`);
    return captured;
  }

  const targetContract = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, "utf8")) : null;
  const report = buildBenchmarkReport(corpus, context, siteRoot, targetContract);
  process.stdout.write(options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatDiscoveryBenchmarkReport(report)}\n`);
  if (report.current.catalogueDrift) process.exitCode = 2;
  else if (options.strict && report.summary.supportedFailures > 0) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  assertTargetContractAbsentForCapture,
  defaultFixturePath,
  main,
  parseArguments,
  resolveSiteRoot,
};
