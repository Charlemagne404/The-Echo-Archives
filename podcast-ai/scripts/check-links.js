const fs = require("node:fs");
const path = require("node:path");

const { loadCatalog, loadCollections } = require("../lib/catalog");

const siteRoot = path.resolve(__dirname, "../..");
const mainPages = ["index.html", "about.html", "supporters.html", "collections.html", "collection.html", "show.html", "submit.html"];
const failures = [];

function normalizeLocalTarget(reference = "") {
  const trimmed = String(reference || "").trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  if (/^(?:https?:|mailto:|tel:)/i.test(trimmed)) {
    return null;
  }

  const [withoutHash] = trimmed.split("#", 1);
  const [withoutQuery] = withoutHash.split("?", 1);
  if (!withoutQuery) {
    return null;
  }

  return withoutQuery.startsWith("/") ? withoutQuery.slice(1) : withoutQuery;
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    failures.push(`${label} -> missing ${filePath}`);
  }
}

function scanHtmlFile(relativePath) {
  const absolutePath = path.join(siteRoot, relativePath);
  const contents = fs.readFileSync(absolutePath, "utf8");
  const assetPattern = /\b(?:href|src)="([^"]+)"/g;

  for (const match of contents.matchAll(assetPattern)) {
    const target = normalizeLocalTarget(match[1]);
    if (!target) {
      continue;
    }

    assertFileExists(path.join(siteRoot, target), `${relativePath} references ${match[1]}`);
  }
}

mainPages.forEach(scanHtmlFile);

const catalog = loadCatalog(siteRoot);
const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));

catalog.forEach((show) => {
  assertFileExists(path.join(siteRoot, show.cover), `Show "${show.id}" cover`);
});

collections.forEach((collection) => {
  assertFileExists(path.join(siteRoot, "collection.html"), `Collection route for "${collection.id}"`);
});

catalog.forEach((show) => {
  assertFileExists(path.join(siteRoot, "show.html"), `Show route for "${show.id}"`);
});

if (failures.length > 0) {
  console.error("Link and asset validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Validated local links and assets for ${mainPages.length} primary pages, ${catalog.length} shows, and ${collections.length} collections.`);
}
