const path = require("node:path");

const { buildCatalog } = require("./build-catalog");
const { createCollectionTemplate, createShowTemplate, slugToTitle } = require("./lib/catalog-schema");
const { ensureSplitCatalogSource, readCatalogSource, writeCatalogSource } = require("./lib/catalog-source");

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const [kind = "", ...rest] = argv;
  const args = { kind: String(kind || "").trim().toLowerCase(), showIds: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--id") {
      args.id = rest[index + 1] || "";
      index += 1;
      continue;
    }

    if (token === "--title") {
      args.title = rest[index + 1] || "";
      index += 1;
      continue;
    }

    if (token === "--show-id") {
      args.showIds.push(rest[index + 1] || "");
      index += 1;
    }
  }

  return args;
}

async function scaffoldCatalogEntry({ kind, id, title, showIds = [] }, siteRoot = resolveSiteRoot()) {
  if (!["show", "collection"].includes(kind)) {
    throw new Error("Usage: scaffold-catalog.js <show|collection> --id <slug> [--title \"Display Title\"] [--show-id <show-id>]");
  }

  const recordId = String(id || "").trim();
  if (!recordId) {
    throw new Error("An --id value is required.");
  }

  ensureSplitCatalogSource(siteRoot);
  const sourceData = readCatalogSource(siteRoot);
  const resolvedTitle = String(title || "").trim() || slugToTitle(recordId);

  if (kind === "show") {
    if (sourceData.shows.some((record) => record.id === recordId)) {
      throw new Error(`Show "${recordId}" already exists.`);
    }

    sourceData.shows.push(createShowTemplate({ id: recordId, title: resolvedTitle, today: todayStamp() }));
  } else {
    const validShowIds = showIds.map((value) => String(value || "").trim()).filter(Boolean);
    if (validShowIds.length === 0) {
      throw new Error("Collection scaffolds require at least one --show-id value.");
    }

    if (sourceData.collections.some((record) => record.id === recordId)) {
      throw new Error(`Collection "${recordId}" already exists.`);
    }

    const nextOrder = sourceData.collections.reduce(
      (max, record) => Math.max(max, Number.isFinite(Number(record.order)) ? Number(record.order) : 0),
      0,
    ) + 10;
    sourceData.collections.push(
      createCollectionTemplate({
        id: recordId,
        title: resolvedTitle,
        today: todayStamp(),
        order: nextOrder,
        showIds: validShowIds,
      }),
    );
  }

  writeCatalogSource(siteRoot, sourceData, { mode: "split" });
  await buildCatalog(siteRoot);

  return {
    id: recordId,
    kind,
    title: resolvedTitle,
  };
}

async function main() {
  const result = await scaffoldCatalogEntry(parseArgs(process.argv.slice(2)));
  console.log(`Scaffolded ${result.kind} "${result.id}" (${result.title}).`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  scaffoldCatalogEntry,
};
