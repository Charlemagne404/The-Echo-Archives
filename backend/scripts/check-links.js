const fs = require("node:fs");
const path = require("node:path");

const { loadCatalog, loadCollections } = require("../lib/catalog");

const siteRoot = path.resolve(__dirname, "../..");
const mainPages = [
  "index.html",
  "about.html",
  "for-creators.html",
  "creator-standards.html",
  "supporters.html",
  "help-center.html",
  "collections.html",
  "collection.html",
  "show.html",
  "submit.html",
];
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
  if (!withoutQuery || withoutQuery === "/") {
    return "index.html";
  }

  const normalized = withoutQuery.startsWith("/") ? withoutQuery.slice(1) : withoutQuery;
  if (!normalized) {
    return null;
  }

  const extensionlessRoute = !path.extname(normalized);
  if (extensionlessRoute) {
    return `${normalized}.html`;
  }

  return normalized;
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

async function main() {
  mainPages.forEach(scanHtmlFile);

  const catalog = await loadCatalog(siteRoot);
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
    return;
  }

  console.log(`Validated local links and assets for ${mainPages.length} primary pages, ${catalog.length} shows, and ${collections.length} collections.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
