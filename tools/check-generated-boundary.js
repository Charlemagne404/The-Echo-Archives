const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { expectedGeneratedPagePaths, validateGeneratedPages } = require("./lib/generated-pages");

const ROOT = path.resolve(__dirname, "..");

function runGit(args, options = {}) {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", ...options });
}

function isIgnored(relativePath) {
  try {
    runGit(["check-ignore", "--quiet", "--no-index", "--", relativePath]);
    return true;
  } catch (_error) {
    return false;
  }
}

function main() {
  const { expected } = validateGeneratedPages(ROOT);
  const expectedPaths = [...expected].sort();
  if (!fs.existsSync(path.join(ROOT, ".git"))) {
    console.log(`Generated HTML output is valid: ${expectedPaths.length} generated pages present; Git boundary checks skipped outside a checkout.`);
    return;
  }

  const tracked = runGit(["ls-files", "--", ...expectedPaths]).trim().split("\n").filter(Boolean);
  if (tracked.length) {
    throw new Error(`Generated HTML must not be tracked: ${tracked.join(", ")}`);
  }

  const notIgnored = expectedPaths.filter((relativePath) => !isIgnored(relativePath));
  if (notIgnored.length) {
    throw new Error(`Generated HTML must be ignored by .gitignore: ${notIgnored.join(", ")}`);
  }

  const authoredHtml = [];
  function walk(currentPath) {
    fs.readdirSync(currentPath, { withFileTypes: true }).forEach((entry) => {
      if (entry.name === ".git" || entry.name === "node_modules") return;
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        return;
      }
      if (!entry.name.endsWith(".html")) return;
      const relativePath = path.relative(ROOT, absolutePath).split(path.sep).join("/");
      if (!expected.has(relativePath)) authoredHtml.push(relativePath);
    });
  }
  walk(ROOT);

  const trackedAuthoredHtml = new Set(runGit(["ls-files", "--", ...authoredHtml]).trim().split("\n").filter(Boolean));
  const untrackedAuthored = authoredHtml.filter((relativePath) => !trackedAuthoredHtml.has(relativePath));
  if (untrackedAuthored.length) {
    throw new Error(`Hand-authored HTML must remain tracked: ${untrackedAuthored.join(", ")}`);
  }

  const authoredIgnored = authoredHtml.filter(isIgnored);
  if (authoredIgnored.length) {
    throw new Error(`Hand-authored HTML must remain trackable: ${authoredIgnored.join(", ")}`);
  }

  console.log(`Generated HTML boundary is valid: ${expectedPaths.length} generated pages ignored and untracked; ${authoredHtml.length} authored HTML files preserved.`);
}

main();
