const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const { createImportStore } = require("../lib/store/import-store");
const { validateSiteData } = require("./review-helpers");

const CANDIDATE_COUNT = 5_000;
const SNAPSHOT_COUNT = 20_000;
const EVIDENCE_COUNT = 250_000;

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function elapsed(startedAt) {
  return Number((Number(process.hrtime.bigint() - startedAt) / 1e9).toFixed(3));
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-import-benchmark-"));
  const db = openDatabase(path.join(tempRoot, "imports.sqlite"));
  const store = createImportStore({ db });
  try {
    let startedAt = process.hrtime.bigint();
    const candidateIds = [];
    for (let index = 0; index < CANDIDATE_COUNT; index += 1) {
      const rssUrl = `https://feeds.example.com/show-${index}.xml`;
      const candidate = store.createCandidate({
        title: `Synthetic Show ${index}`,
        creatorName: `Creator ${index % 500}`,
        primarySourceType: "rss",
        primarySourceUrl: rssUrl,
        objective: { title: `Synthetic Show ${index}`, creatorName: `Creator ${index % 500}`, rssUrl },
      });
      store.claimIdentity("rss-url", rssUrl, { candidateId: candidate.id });
      store.claimIdentity("rss-url", rssUrl, { candidateId: candidate.id });
      candidateIds.push(candidate.id);
    }
    const seedSeconds = elapsed(startedAt);
    if (seedSeconds >= 30) throw new Error(`5,000-candidate seed/idempotent dedupe took ${seedSeconds}s (limit 30s).`);

    startedAt = process.hrtime.bigint();
    candidateIds.forEach((candidateId, index) => {
      store.appendCandidateSources(candidateId, Array.from({ length: 4 }, (_value, sourceIndex) => ({
        sourceType: ["rss", "website", "apple", "podcast-index"][sourceIndex],
        sourceKey: `${index}-${sourceIndex}`,
        sourceUrl: `https://sources.example.com/${index}/${sourceIndex}`,
        raw: { text: `source-${index}-${sourceIndex}` },
        normalized: { title: `Synthetic Show ${index}` },
      })));
    });
    const snapshotSeconds = elapsed(startedAt);

    startedAt = process.hrtime.bigint();
    candidateIds.forEach((candidateId, index) => {
      store.appendFieldEvidence(candidateId, Array.from({ length: 50 }, (_value, evidenceIndex) => ({
        fieldName: `field-${evidenceIndex % 25}`,
        value: `${index}-${evidenceIndex}`,
        sourceType: evidenceIndex % 2 ? "rss" : "website",
        sourceUrl: `https://evidence.example.com/${index}/${evidenceIndex % 4}`,
        confidence: evidenceIndex % 2 ? 0.95 : 0.90,
      })));
    });
    const evidenceSeconds = elapsed(startedAt);

    startedAt = process.hrtime.bigint();
    const page = store.listCandidates({ q: "Synthetic Show 4999", includeClosed: true, page: 1, pageSize: 20 });
    const queueMilliseconds = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (page.total < 1 || queueMilliseconds >= 250) throw new Error(`Indexed queue lookup took ${queueMilliseconds.toFixed(1)}ms (limit 250ms).`);

    const siteRoot = path.join(tempRoot, "site");
    fs.mkdirSync(path.join(siteRoot, "images/covers"), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, "../../images/covers/archive-81.jpg"), path.join(siteRoot, "images/covers/shared.jpg"));
    const shows = candidateIds.map((_candidateId, index) => ({
      id: `synthetic-show-${index}`,
      title: `Synthetic Show ${index}`,
      description: `Official description for synthetic show ${index}.`,
      cover: "images/covers/shared.jpg",
      coverAlt: `Synthetic Show ${index} cover art`,
      status: "published",
      reviewStatus: "indexed-only",
      releaseStatus: "unknown",
      completionStatus: "unclear",
      listenLinks: { rss: `https://feeds.example.com/show-${index}.xml` },
      genres: ["drama"], tones: [], formats: ["serialized"], tags: [], ratings: {}, bestFor: [], similarTo: [], similarReasons: {},
      archiveTake: "", spoilerFreeReview: "", thoughts: "", quote: { text: "", attribution: "" },
      updatedAt: "2026-07-14",
    }));
    writeJson(path.join(siteRoot, "data/shows.json"), shows);
    writeJson(path.join(siteRoot, "data/collections.json"), []);
    startedAt = process.hrtime.bigint();
    await validateSiteData(siteRoot);
    const catalogSeconds = elapsed(startedAt);
    if (catalogSeconds >= 60) throw new Error(`5,000-show catalog validation took ${catalogSeconds}s (limit 60s).`);

    const rssMegabytes = Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1));
    if (rssMegabytes >= 512) throw new Error(`Benchmark RSS memory reached ${rssMegabytes}MB (limit 512MB).`);
    console.log(JSON.stringify({
      candidates: CANDIDATE_COUNT,
      sourceSnapshots: SNAPSHOT_COUNT,
      evidenceRows: EVIDENCE_COUNT,
      seedSeconds,
      snapshotSeconds,
      evidenceSeconds,
      queueMilliseconds: Number(queueMilliseconds.toFixed(1)),
      catalogSeconds,
      rssMegabytes,
    }, null, 2));
  } finally {
    db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
