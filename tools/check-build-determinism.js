const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const GENERATED_DIRECTORIES = ["creators", "data/reviews", "docs/generated", "images/generated"];
const GENERATED_DATA_FILES = [
  "data/archive-stats.json",
  "data/collections.json",
  "data/entities.json",
  "data/entity-graph.json",
  "data/search-index.json",
  "data/shows.json",
  "data/tag-taxonomy.json",
];
const { buildCatalog } = require("./build-catalog");
const { listBuildOutputs, main: buildPages } = require("./build-pages");

function walkFiles(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walkFiles(absolutePath, output);
      else if (entry.isFile()) output.push(absolutePath);
    });
  return output;
}

function fingerprintOutputs() {
  const outputPaths = new Set();
  GENERATED_DIRECTORIES.forEach((directory) => {
    walkFiles(path.join(ROOT, directory)).forEach((absolutePath) => outputPaths.add(absolutePath));
  });
  GENERATED_DATA_FILES.forEach((relativePath) => outputPaths.add(path.join(ROOT, relativePath)));
  listBuildOutputs().forEach((relativePath) => outputPaths.add(path.resolve(ROOT, relativePath)));

  const files = [...outputPaths]
    .sort((left, right) => left.localeCompare(right))
    .map((absolutePath) => {
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        throw new Error(`Expected build output is missing: ${path.relative(ROOT, absolutePath)}`);
      }
      const relativePath = path.relative(ROOT, absolutePath).split(path.sep).join("/");
      const digest = crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
      return [relativePath, digest];
    });
  return files;
}

function describeDifferences(before, after) {
  const previous = new Map(before);
  const current = new Map(after);
  const paths = [...new Set([...previous.keys(), ...current.keys()])].sort((left, right) => left.localeCompare(right));
  return paths.filter((relativePath) => previous.get(relativePath) !== current.get(relativePath)).map((relativePath) => {
    if (!previous.has(relativePath)) return `added: ${relativePath}`;
    if (!current.has(relativePath)) return `removed: ${relativePath}`;
    return `changed: ${relativePath}`;
  });
}

async function checkBuildDeterminism() {
  const snapshots = [];
  for (let pass = 1; pass <= 2; pass += 1) {
    await buildCatalog(ROOT, { recoverCovers: false });
    await buildPages();
    snapshots.push(fingerprintOutputs());
  }

  const differences = describeDifferences(snapshots[0], snapshots[1]);
  if (differences.length > 0) {
    throw new Error(`Generated outputs changed between identical local builds:\n- ${differences.join("\n- ")}`);
  }

  const combinedDigest = crypto.createHash("sha256").update(JSON.stringify(snapshots[1])).digest("hex");
  console.log(`Deterministic build check passed: ${snapshots[1].length} generated files, SHA-256 ${combinedDigest}.`);
}

if (require.main === module) {
  checkBuildDeterminism().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  checkBuildDeterminism,
  describeDifferences,
  fingerprintOutputs,
};
