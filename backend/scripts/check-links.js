const fs = require("node:fs");
const path = require("node:path");

const { loadCatalog, loadCollections } = require("../lib/catalog");

const siteRoot = path.resolve(__dirname, "../..");
const { loadEntities, publicEntityRecords } = require("../lib/entities");
const mainPages = [
  "creators.html",
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
  "privacy.html",
  "terms.html",
  "cookies.html",
  "copyright.html",
  "404.html",
  "500.html",
  "offline.html",
];
const failures = [];
const htmlCache = new Map();
const publishedShowIds = new Set();
const collectionIds = new Set();
const entityIds = new Set();

function getHtmlContents(relativePath) {
  if (!htmlCache.has(relativePath)) {
    htmlCache.set(relativePath, fs.readFileSync(path.join(siteRoot, relativePath), "utf8"));
  }

  return htmlCache.get(relativePath);
}

function normalizeLocalTarget(reference = "") {
  const trimmed = String(reference || "").trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return {
      file: null,
      hash: trimmed.slice(1),
    };
  }

  if (/^(?:https?:|mailto:|tel:)/i.test(trimmed)) {
    return null;
  }

  const [withoutHash, hash = ""] = trimmed.split("#", 2);
  const [withoutQuery] = withoutHash.split("?", 1);
  if (!withoutQuery || withoutQuery === "/") {
    return {
      file: "index.html",
      hash,
    };
  }

  const normalized = withoutQuery.startsWith("/") ? withoutQuery.slice(1) : withoutQuery;
  if (!normalized) {
    return null;
  }

  const dynamicRoute = normalized.match(/^(shows|collections|creators)\/([^/]+)$/);
  if (dynamicRoute) {
    let routeId = "";
    try {
      routeId = decodeURIComponent(dynamicRoute[2]);
    } catch (_error) {
      routeId = "";
    }
    const isKnownRoute = dynamicRoute[1] === "shows" ? publishedShowIds.has(routeId) : dynamicRoute[1] === "creators" ? entityIds.has(routeId) : collectionIds.has(routeId);
    if (isKnownRoute) {
      return {
        file: dynamicRoute[1] === "shows" ? "show.html" : dynamicRoute[1] === "creators" ? `creators/${routeId}/index.html` : "collection.html",
        hash,
      };
    }
  }

  const extensionlessRoute = !path.extname(normalized);
  if (extensionlessRoute) {
    return {
      file: `${normalized}.html`,
      hash,
    };
  }

  return {
    file: normalized,
    hash,
  };
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    failures.push(`${label} -> missing ${filePath}`);
  }
}

function assertAnchorExists(relativePath, hash, label) {
  if (!hash) {
    return;
  }

  const contents = getHtmlContents(relativePath);
  const anchorPattern = new RegExp(`\\bid="${hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
  if (!anchorPattern.test(contents)) {
    failures.push(`${label} -> missing anchor #${hash} in ${relativePath}`);
  }
}

function scanHtmlFile(relativePath) {
  const contents = getHtmlContents(relativePath);
  const assetPattern = /\b(?:href|src)="([^"]+)"/g;

  for (const match of contents.matchAll(assetPattern)) {
    const target = normalizeLocalTarget(match[1]);
    if (!target) {
      continue;
    }

    if (target.file) {
      assertFileExists(path.join(siteRoot, target.file), `${relativePath} references ${match[1]}`);
      if (target.file.endsWith(".html")) {
        assertAnchorExists(target.file, target.hash, `${relativePath} references ${match[1]}`);
      }
      continue;
    }

    assertAnchorExists(relativePath, target.hash, `${relativePath} references ${match[1]}`);
  }
}

function scanManifestIcons() {
  const manifestPath = path.join(siteRoot, "site.webmanifest");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];

  icons.forEach((icon) => {
    const target = normalizeLocalTarget(icon?.src || "");
    if (!target?.file) {
      failures.push(`site.webmanifest icon is missing a valid src: ${JSON.stringify(icon)}`);
      return;
    }

    assertFileExists(path.join(siteRoot, target.file), `site.webmanifest references ${icon.src}`);
  });
}

async function main() {
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  catalog.filter((show) => show.status === "published").forEach((show) => publishedShowIds.add(show.id));
  collections.forEach((collection) => collectionIds.add(collection.id));

  const entities = publicEntityRecords(loadEntities(siteRoot, catalog), catalog);
  entities.forEach((entity) => entityIds.add(entity.id));
  mainPages.forEach(scanHtmlFile);
  entities.forEach((entity) => scanHtmlFile(`creators/${entity.id}/index.html`));
  scanManifestIcons();

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

  console.log(`Validated local links, anchors, and assets for ${mainPages.length} public pages, ${catalog.length} shows, and ${collections.length} collections.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
