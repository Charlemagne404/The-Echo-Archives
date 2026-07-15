const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const { createImportStore } = require("../lib/store/import-store");

function context() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-import-store-"));
  const db = openDatabase(path.join(root, "imports.sqlite"));
  return { root, db, store: createImportStore({ db }) };
}

function cleanup(value) {
  value.db.close();
  fs.rmSync(value.root, { recursive: true, force: true });
}

test("source history is append-only between fetches but compacts to two successes and the latest failure", () => {
  const value = context();
  try {
    const candidate = value.store.createCandidate({ title: "History Show" });
    for (let index = 0; index < 4; index += 1) {
      value.store.appendCandidateSources(candidate.id, [{
        sourceType: "rss", sourceKey: "feed", sourceUrl: "https://example.com/feed.xml",
        fetchStatus: "fetched", raw: { text: `body-${index}` }, normalized: { version: index },
        fetchedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      }]);
    }
    for (let index = 0; index < 2; index += 1) {
      value.store.appendCandidateSources(candidate.id, [{
        sourceType: "rss", sourceKey: "feed", sourceUrl: "https://example.com/feed.xml",
        fetchStatus: "failed", payload: { error: `failure-${index}` },
        fetchedAt: new Date(Date.UTC(2026, 1, index + 1)).toISOString(),
      }]);
    }
    const sources = value.store.getCandidate(candidate.id).sources;
    assert.equal(sources.filter((source) => source.fetchStatus === "fetched").length, 2);
    assert.equal(sources.filter((source) => source.fetchStatus === "failed").length, 1);
    assert.deepEqual(sources.filter((source) => source.fetchStatus === "fetched").map((source) => source.normalized.version), [3, 2]);
    const retainedHistory = value.db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN raw_compacted = 1 THEN 1 ELSE 0 END) AS compacted,
        SUM(CASE WHEN payload_hash != '' THEN 1 ELSE 0 END) AS hashed
      FROM catalog_import_sources WHERE candidate_id = ?
    `).get(candidate.id);
    assert.deepEqual(retainedHistory, { total: 6, compacted: 3, hashed: 6 });
  } finally {
    cleanup(value);
  }
});

test("leased jobs recover after interruption and exhaust bounded retries", () => {
  const value = context();
  try {
    const candidate = value.store.createCandidate({ title: "Lease Show" });
    const run = value.store.createRun({ runType: "seed" });
    const job = value.store.enqueueJob({ candidateId: candidate.id, runId: run.id, inputRevision: 1, maxAttempts: 2 });
    const firstClaim = value.store.claimNextJob({ workerId: "worker-one", leaseMs: 60_000 });
    assert.equal(firstClaim.id, job.id);
    assert.equal(firstClaim.attemptCount, 1);
    value.db.prepare("UPDATE catalog_import_jobs SET lease_expires_at = '2000-01-01T00:00:00Z' WHERE id = ?").run(job.id);
    const recovered = value.store.claimNextJob({ workerId: "worker-two", leaseMs: 60_000 });
    assert.equal(recovered.id, job.id);
    assert.equal(recovered.attemptCount, 2);
    const failed = value.store.failJob(job.id, new Error("still unavailable"), { retryable: true });
    assert.equal(failed.status, "failed");
    assert.equal(failed.nextAttemptAt, null);
  } finally {
    cleanup(value);
  }
});

test("cache payloads round-trip compressed and reviewer evidence selections lock fields", () => {
  const value = context();
  try {
    const cache = value.store.putSourceCache({
      sourceType: "rss", sourceKey: "feed", sourceUrl: "https://example.com/feed.xml",
      etag: '"v1"', lastModified: "Tue, 14 Jul 2026 10:00:00 GMT",
      rawBody: "<rss><channel><title>Cached</title></channel></rss>", normalized: { title: "Cached" },
    });
    assert.match(cache.rawBody, /<title>Cached<\/title>/);
    assert.equal(cache.etag, '"v1"');

    const candidate = value.store.createCandidate({ title: "Evidence Show" });
    value.store.appendFieldEvidence(candidate.id, [
      { fieldName: "title", value: "Evidence Show", sourceType: "rss", confidence: 0.95 },
      { fieldName: "title", value: "Evidence Programme", sourceType: "website", confidence: 0.95 },
    ]);
    const evidence = value.store.getCandidate(candidate.id).fieldEvidence;
    const selected = value.store.selectEvidence(candidate.id, "title", evidence[0].id, "CA");
    assert.ok(selected.lockedFields.includes("title"));
    assert.equal(selected.fieldEvidence.find((item) => item.id === evidence[0].id).confidence, 1);
    assert.equal(selected.fieldEvidence.find((item) => item.id === evidence[0].id).method, "reviewer-selected");
  } finally {
    cleanup(value);
  }
});

test("FTS queue search finds candidates without scanning objective JSON", () => {
  const value = context();
  try {
    for (let index = 0; index < 100; index += 1) value.store.createCandidate({ title: `Archive Signal ${index}`, creatorName: `Creator ${index}` });
    const result = value.store.listCandidates({ q: "Archive Signal 73", includeClosed: true, pageSize: 20 });
    assert.equal(result.total, 1);
    assert.equal(result.items[0].title, "Archive Signal 73");
  } finally {
    cleanup(value);
  }
});
