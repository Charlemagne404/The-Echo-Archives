const fs = require("node:fs");
const path = require("node:path");

const { loadEntities, publicEntityRecords } = require("../../backend/lib/entities");
const { resolveCleanRouteAlias } = require("../build-pages");

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function normalizeRelativePath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function expectedGeneratedPagePaths(root) {
  const manifest = readJson(root, "site-src/page-manifest.json");
  if (!Array.isArray(manifest)) {
    throw new Error("site-src/page-manifest.json must contain an array.");
  }

  const expected = new Set();
  manifest.forEach((entry) => {
    if (!entry || typeof entry.output !== "string" || !entry.output) {
      throw new Error("Every page manifest entry must define an output path.");
    }

    expected.add(entry.output);
    const cleanRouteAlias = resolveCleanRouteAlias(entry);
    if (cleanRouteAlias) {
      expected.add(path.posix.join(cleanRouteAlias, "index.html"));
    }
  });

  const catalog = readJson(root, "data/shows.json");
  const entities = publicEntityRecords(loadEntities(root, catalog), catalog);
  entities.forEach((entity) => {
    expected.add(path.posix.join("creators", entity.id, "index.html"));
  });

  return expected;
}

function listGeneratedHtmlPaths(root) {
  const expected = expectedGeneratedPagePaths(root);
  const generated = new Set([...expected].filter((relativePath) => fs.existsSync(path.join(root, relativePath))));
  const creatorRoot = path.join(root, "creators");

  if (fs.existsSync(creatorRoot)) {
    fs.readdirSync(creatorRoot, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isDirectory()) return;
      const pagePath = path.join(creatorRoot, entry.name, "index.html");
      if (fs.existsSync(pagePath)) generated.add(normalizeRelativePath(root, pagePath));
    });
  }

  return generated;
}

function validateGeneratedPages(root) {
  const expected = expectedGeneratedPagePaths(root);
  const actual = listGeneratedHtmlPaths(root);
  const missing = [...expected].filter((relativePath) => !actual.has(relativePath)).sort();
  const unexpected = [...actual].filter((relativePath) => !expected.has(relativePath)).sort();

  if (missing.length || unexpected.length) {
    const details = [
      missing.length ? `missing: ${missing.join(", ")}` : "",
      unexpected.length ? `unexpected: ${unexpected.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    throw new Error(`Generated HTML output does not match the page manifest/catalog (${details}).`);
  }

  return { expected, actual };
}

module.exports = {
  expectedGeneratedPagePaths,
  listGeneratedHtmlPaths,
  validateGeneratedPages,
};
