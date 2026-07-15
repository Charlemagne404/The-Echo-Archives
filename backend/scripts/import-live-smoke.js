const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const config = require("../lib/config");
const { openDatabase } = require("../lib/store/database");
const { createImportStore } = require("../lib/store/import-store");
const { createImportService } = require("../lib/services/import-service");

const DEFAULT_SEEDS = [
  "Midnight Burger",
  "Spectre",
  "Welcome to Night Vale",
  "The Magnus Archives",
  "Case 63",
  "King Falls AM",
  "De dödas röster",
];
const SOURCE_RICH_TITLES = new Set(["Midnight Burger", "Welcome to Night Vale", "The Magnus Archives"]);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

async function main() {
  const seeds = process.argv.slice(2).map((value) => String(value || "").trim()).filter(Boolean);
  const requestedSeeds = seeds.length ? seeds : DEFAULT_SEEDS;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-import-live-"));
  const siteRoot = path.join(tempRoot, "site");
  const dbPath = path.join(tempRoot, "imports.sqlite");
  writeJson(path.join(siteRoot, "data/shows.json"), []);
  writeJson(path.join(siteRoot, "data/collections.json"), []);
  const db = openDatabase(dbPath);
  const store = createImportStore({ db });
  const service = createImportService({
    store,
    staticRoot: siteRoot,
    config: {
      ...config,
      DB_PATH: dbPath,
      DATA_ROOT: tempRoot,
      IMPORT_AUTO_WORKER: false,
    },
  });
  try {
    const seeded = await service.seedCandidates({ entries: requestedSeeds, actor: "live-smoke" });
    await service.processPendingJobs({ limit: 4 });
    const run = await service.waitForRun(seeded.runId, 240_000);
    const results = seeded.candidateIds.map((id, index) => {
      const candidate = service.getForMaintainer(id);
      return {
        seed: requestedSeeds[index],
        resolvedTitle: candidate.title,
        status: candidate.status,
        scopeStatus: candidate.scopeStatus,
        mode: candidate.mode,
        sourceTypes: mergeUnique((candidate.sources || []).filter((source) => source.fetchStatus !== "failed").map((source) => source.sourceType)),
        sourceErrors: candidate.sourceHealth?.errors || [],
        blockers: candidate.readiness?.blockers || [],
        warnings: candidate.readiness?.warnings || [],
        episodeCounts: candidate.objective?.episodeCounts || {},
        cover: candidate.coverStage?.ready ? {
          width: candidate.coverStage.width,
          height: candidate.coverStage.height,
          contentType: candidate.coverStage.contentType,
          appleQuality: candidate.coverStage.appleQuality,
        } : null,
      };
    });
    const richResults = results.filter((result) => SOURCE_RICH_TITLES.has(result.seed));
    const richReady = richResults.filter((result) => result.status === "ready").length;
    console.log(JSON.stringify({ run: { id: run.id, status: run.status, progress: run.progress }, results }, null, 2));
    if (richReady < 2) {
      throw new Error(`Only ${richReady}/${richResults.length} source-rich reference shows reached ready; expected at least 2.`);
    }
    const unusualResults = results.filter((result) => !SOURCE_RICH_TITLES.has(result.seed));
    if (unusualResults.some((result) => result.status !== "ready" && result.blockers.length === 0)) {
      throw new Error("A non-ready unusual show did not expose an actionable blocker.");
    }
  } finally {
    service.stop();
    db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function mergeUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
