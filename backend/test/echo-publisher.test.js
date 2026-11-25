const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { loadCatalog } = require("../lib/catalog");
const { createEchoPublisher, assertProductionTarget, validatePackage } = require("../lib/services/echo-publisher");
const { handlePublisherRequest } = require("../lib/services/echo-publisher-control");
const { createRequest, formatResponse, runnerExitCode } = require("../scripts/echo-publisher");
const { createImportService } = require("../lib/services/import-service");
const { createImportStore } = require("../lib/store/import-store");
const { openDatabase } = require("../lib/store/database");
const { readShowsFile } = require("../scripts/review-helpers");
const { hashValue } = require("../lib/import/publisher-hash");
const {
  assertOperatorMembership,
  assertNoExtraCliArgs,
  assertRootRunner,
  dispatchExitStatus,
  validateClientRequest,
  validateProductionHost,
  verifyPublicSite,
} = require("../../deploy/echo-publisher-runner");

const REPO_ROOT = path.resolve(__dirname, "../..");
const BATCH_SOURCE_IDS = [
  "3184620d-551e-40dd-bdd4-ee36be3236e2",
  "336e8b27-a795-42e0-a3e6-cef6f933b642",
  "4d31d2c6-b1f0-4614-99e4-2d0ba2b0dd2a",
  "50d2cc64-df29-484a-a3f1-ef1a5257c315",
  "586ef814-4e9b-47bf-8bcb-72ea9ef7e2f8",
  "7d61d053-41f2-4c91-861b-accce6f7e5b2",
  "b51fff09-12d1-4b26-9e1d-ec386169ce78",
  "d41c7e2b-71ef-46c5-aeff-95e438492ffe",
  "dbd8a87e-9c09-4afa-aeb2-5745aaddbaaa",
  "efb35049-e89f-4bda-98e4-d2e75724f6f7",
];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createTempContext({ shows = [], failFirstRefresh = false } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-publisher-test-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const siteRoot = path.join(tempDir, "site");
  const importStagingRoot = path.join(siteRoot, "import-staging");
  fs.mkdirSync(importStagingRoot, { recursive: true, mode: 0o770 });
  writeJson(path.join(siteRoot, "data/shows.json"), shows);
  writeJson(path.join(siteRoot, "data/collections.json"), []);
  fs.mkdirSync(path.join(siteRoot, "images"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "images/Circle2-Logo-S.png"), path.join(siteRoot, "images/Circle2-Logo-S.png"));
  fs.mkdirSync(path.join(siteRoot, "images/covers"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "images/covers/archive-81.jpg"), path.join(siteRoot, "images/covers/archive-81.jpg"));
  const db = openDatabase(dbPath);
  const store = createImportStore({ db });
  let liveCatalog = [...shows];
  let failNextRefresh = failFirstRefresh;
  const config = {
    DB_PATH: dbPath,
    DATA_ROOT: tempDir,
    DEPLOYMENT_ENV: "test",
    SITE_URL: "https://echo.test",
    IMPORT_STAGING_ROOT: importStagingRoot,
    PODCAST_INDEX_API_KEY: "",
    PODCAST_INDEX_API_SECRET: "",
    PODCAST_INDEX_USER_AGENT: "Echo Publisher Tests",
    IMPORT_AUTO_WORKER: false,
    IMPORT_FETCH_TIMEOUT_MS: 2_000,
    IMPORT_DOCUMENT_MAX_BYTES: 2 * 1024 * 1024,
    IMPORT_COVER_MAX_BYTES: 2 * 1024 * 1024,
  };
  const service = createImportService({
    store,
    staticRoot: siteRoot,
    config,
    fetchImpl: fakeFetch,
    onPublished: async () => {
      if (failNextRefresh) {
        failNextRefresh = false;
        throw new Error("simulated live catalog refresh failure");
      }
      liveCatalog = await loadCatalog(siteRoot);
    },
  });
  const publisher = createEchoPublisher({
    service,
    store,
    staticRoot: siteRoot,
    config,
    getLiveCatalog: () => liveCatalog,
    enforceProductionTarget: false,
  });
  return {
    db, store, service, publisher, siteRoot, tempDir, config,
    cleanup() {
      service.stop();
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function fakeFetch(url) {
  const value = String(url);
  if (value.startsWith("https://itunes.apple.com/search")) {
    return Promise.resolve(new Response(JSON.stringify({ resultCount: 0, results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  }
  const match = value.match(/^https:\/\/([a-z0-9-]+)\.example\.test\/(feed\.xml)?\/?$/i);
  if (match && match[2]) {
    const host = match[1];
    const facts = {
      "signal-alpha": { title: "Signal Alpha", creator: "Alpha Studio" },
      "signal-beta": { title: "Signal Beta", creator: "Beta Studio" },
      polybius: { title: "Polybius Protocol", creator: "Children of the Neon God" },
    }[host] || {
      title: host.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
      creator: "Studio",
    };
    const title = facts.title;
    const guid = crypto.createHash("sha256").update(host).digest("hex").slice(0, 36).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>${title}</title><link>https://${host}.example.test/</link><description>A serialized fiction audio drama about a distant signal.</description><itunes:author>${facts.creator}</itunes:author><itunes:summary>A serialized fiction audio drama about a distant signal.</itunes:summary><language>en</language><itunes:category text="Fiction"><itunes:category text="Drama" /></itunes:category><itunes:type>serial</itunes:type><itunes:keywords>mystery, science fiction, audio drama</itunes:keywords><podcast:guid>${guid}</podcast:guid><item><guid>episode-1</guid><title>Episode One</title><pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
    return Promise.resolve(new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml" } }));
  }
  if (match) {
    return Promise.resolve(new Response(`<!doctype html><html lang="en"><head><title>${match[1]}</title></head><body></body></html>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
  }
  throw new Error(`Unexpected test fetch URL: ${value}`);
}

function packageEntry({ title, creatorName, submissionId, feedUrl, artworkUse = "echo-placeholder", externalArtwork = false, preserveExistingFields = [] }) {
  const host = new URL(feedUrl).hostname.split(".")[0];
  return {
    sourceType: "submission",
    sourceKey: submissionId,
    sourceUrl: feedUrl,
    title,
    creatorName,
    objective: {
      title,
      creatorName,
      rssUrl: feedUrl,
      websiteUrl: `https://${host}.example.test/`,
      podcastGuid: "",
      sourceSubmissionIds: [submissionId],
      artworkUse,
      artworkPermissionStatus: "not-established",
      ...(externalArtwork ? { artworkUrl: `https://${host}.example.test/external-cover.jpg` } : {}),
      manualReleaseState: "unknown",
      ...(preserveExistingFields.length ? { preserveExistingFields } : {}),
    },
  };
}

function makePackage(entries, existingUpdates = []) {
  return {
    packageVersion: 1,
    sourceArchiveSha256: "a".repeat(64),
    searchResults: entries,
    existingUpdates,
    noOpExcluded: { title: "A no-op title", decision: "no-op-existing-record" },
  };
}

async function seedPrepared(context, entries) {
  const seeded = await context.service.seedCandidates({ searchResults: entries, autoHydrate: true, actor: "test-importer" });
  const candidates = seeded.candidateIds.map((id) => context.service.getForMaintainer(id));
  return { seeded, candidates };
}

function existingShow({ title, id, feedUrl }) {
  const host = new URL(feedUrl).hostname.split(".")[0];
  const show = {
    id,
    title,
    description: "Human edited archive description kept during the feed refresh.",
    cover: "images/covers/archive-81.jpg",
    coverAlt: "Human chosen cover alt text.",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "unknown",
    completionStatus: "unclear",
    listenLinks: { rss: feedUrl, website: `https://${host}.example.test/` },
    officialLinks: { website: `https://${host}.example.test/` },
    genres: ["sci-fi"],
    formats: ["serialized"],
    tags: ["Sci-fi"],
    ratings: { archive: 8.7 },
    archiveTake: "Human editorial take.",
    spoilerFreeReview: ["Human written review."],
    thoughts: ["Editorial note."],
    tones: ["Tense"],
    themes: ["Memory"],
    similarTo: [],
    similarReasons: {},
    featured: true,
    accent: { hex: "#775577", rgb: "119, 85, 119" },
    content: { framing: "Human content note." },
    contentNotes: ["Human content note."],
    collectionMembership: [],
    credits: { creatorName: "Human credited creator", writers: ["Human writer"] },
    creators: ["The Children of the Neon God (DTY)"],
    metadata: { import: { identifiers: { rssUrl: feedUrl }, managedFingerprints: {} } },
  };
  const { managedFingerprints } = require("../lib/import/draft");
  show.metadata.import.managedFingerprints = managedFingerprints(show);
  return show;
}

async function createPlan(context, packageData, actor = "operator:test-user") {
  return context.publisher.createPlan({ packageData, actor });
}

test("Echo Publisher validates the existing importer staging directory without chmodding it", () => {
  const context = createTempContext();
  const importStagingRoot = path.join(context.siteRoot, "import-staging");
  try {
    fs.chmodSync(importStagingRoot, 0o770);
    assert.throws(() => context.publisher.inspect("missing-plan-000000"), { code: "ECHO_PUBLISHER_PLAN_NOT_FOUND" });
    assert.equal(fs.statSync(importStagingRoot).mode & 0o777, 0o770);
  } finally {
    context.cleanup();
  }
});

test("Echo Publisher plans and atomically publishes a reviewed new-show batch with unknown fields and placeholder art", async () => {
  const context = createTempContext();
  try {
    const entries = [
      packageEntry({ title: "Signal Alpha", creatorName: "Alpha Studio", submissionId: "0a201001-1001-4001-8001-000000000001", feedUrl: "https://signal-alpha.example.test/feed.xml", externalArtwork: true }),
      packageEntry({ title: "Signal Beta", creatorName: "Beta Studio", submissionId: "0b201001-1001-4001-8001-000000000002", feedUrl: "https://signal-beta.example.test/feed.xml" }),
    ];
    const { candidates } = await seedPrepared(context, entries);
    assert.ok(candidates.every((candidate) => candidate.status === "ready"), JSON.stringify(candidates.map((candidate) => candidate.readiness.blockers)));
    const before = readShowsFile(context.siteRoot);
    const { plan, approvalSha256 } = await createPlan(context, makePackage(entries));
    assert.equal(plan.target.environment, "test");
    assert.equal(plan.counts["new-listing"], 2);
    assert.equal(plan.counts.factualReviewRequired, 2);
    assert.deepEqual(readShowsFile(context.siteRoot), before, "planning must not write public catalogue content");
    assert.ok(plan.entries.every((entry) => entry.action === "new-listing"));
    assert.ok(plan.entries.every((entry) => entry.fields.unknownOptional.includes("releaseStatus")));
    assert.ok(plan.entries.every((entry) => entry.fields.record.cover === "images/Circle2-Logo-S.png"));
    assert.ok(plan.entries.every((entry) => !entry.blockers.some((blocker) => blocker.code === "artwork-rights-missing")));
    await assert.rejects(context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, actor: "operator:test-user" }), { code: "ECHO_PUBLISHER_FACTS_REVIEW_REQUIRED" });
    await assert.rejects(context.publisher.applyPlan({ planId: plan.planId, approveSha256: "0".repeat(64), reviewFacts: true, actor: "operator:test-user" }), { code: "ECHO_PUBLISHER_APPROVAL_HASH_MISMATCH" });
    assert.deepEqual(readShowsFile(context.siteRoot), before);

    const result = await context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, reviewFacts: true, factualReviewer: "delegate:codex", actor: "operator:test-user" });
    assert.equal(result.receipt.catalogueWrite.status, "complete", result.receipt.catalogueWrite.error || "");
    assert.equal(result.receipt.catalogueWrite.buildCount, 1);
    assert.equal(result.receipt.environment, "test");
    assert.equal(result.receipt.catalogueWrite.showIds.length, 2);
    assert.equal(result.receipt.verification.status, "verified", JSON.stringify(result.receipt.verification));
    assert.deepEqual(Object.keys(result.receipt.verification.publicRecordHashes).sort(), result.receipt.catalogueWrite.showIds.slice().sort());
    assert.equal(result.receipt.publicSiteVerification.status, "pending");
    assert.equal(result.receipt.authorizedBy, "operator:test-user");
    assert.equal(result.receipt.factualReviewer, "delegate:codex");
    assert.equal(readShowsFile(context.siteRoot).length, 2);
    for (const show of readShowsFile(context.siteRoot)) {
      assert.equal(show.verification.status, "delegated-source-reviewed");
      assert.match(show.verification.note, /delegated AI reviewer/);
      assert.equal(show.metadata.import.factualReview.reviewedBy, "delegate:codex");
    }
    for (const entry of plan.entries) {
      const candidate = context.service.getForMaintainer(entry.candidate.id);
      assert.equal(candidate.status, "published");
      assert.equal(candidate.factsReviewedBy, "delegate:codex");
      assert.ok(candidate.events.some((event) => event.eventType === "facts-reviewed" && event.actor === "operator:test-user" && event.payload?.method === "echo-publisher-batch-review" && event.payload?.reviewedBy === "delegate:codex" && event.payload.planId === plan.planId));
    }
  } finally {
    context.cleanup();
  }
});

test("Echo Publisher updates an existing show and preserves human-owned editorial fields and publication tier", async () => {
  const feedUrl = "https://polybius.example.test/feed.xml";
  const existing = existingShow({ title: "Polybius Protocol", id: "polybius-protocol", feedUrl });
  const context = createTempContext({ shows: [existing] });
  try {
    const entry = packageEntry({
      title: existing.title,
      creatorName: "Children of the Neon God",
      submissionId: "7d61d053-41f2-4c91-861b-accce6f7e5b2",
      feedUrl,
      preserveExistingFields: ["credits", "creators"],
    });
    await seedPrepared(context, [entry]);
    const pkg = makePackage([entry], [{ title: existing.title, showId: existing.id, objectiveUpdate: "Reconcile official-feed full-episode count." }]);
    const { plan, approvalSha256 } = await createPlan(context, pkg);
    assert.equal(plan.entries[0].action, "update", JSON.stringify(plan.entries[0].blockers));
    assert.equal(plan.entries[0].targetShowId, existing.id);
    assert.equal(plan.entries[0].update.preserveExistingEditorialFields, true);
    assert.ok(plan.entries[0].update.preservedHumanFields.includes("credits"));
    const result = await context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, reviewFacts: true, actor: "operator:test-user" });
    assert.equal(result.receipt.catalogueWrite.status, "complete", result.receipt.catalogueWrite.error || "");
    const updated = readShowsFile(context.siteRoot).find((show) => show.id === existing.id);
    for (const field of ["ratings", "archiveTake", "spoilerFreeReview", "thoughts", "tones", "themes", "similarTo", "similarReasons", "featured", "accent", "content", "contentNotes", "collectionMembership", "credits", "creators"]) {
      assert.deepEqual(updated[field], existing[field], `${field} must remain human-owned`);
    }
    assert.equal(updated.reviewStatus, "indexed-only");
    assert.equal(updated.metadata.import.factualReview.reviewedBy, "operator:test-user");
  } finally {
    context.cleanup();
  }
});

test("Echo Publisher reconciles provider identity to stable submission identity and targets existing catalogue entries", async () => {
  const context = createTempContext();
  try {
    const oldEntry = packageEntry({ title: "Signal Alpha", creatorName: "Alpha Studio", submissionId: "0c201001-1001-4001-8001-000000000003", feedUrl: "https://signal-alpha.example.test/feed.xml" });
    const seeded = await seedPrepared(context, [oldEntry]);
    const productionCandidateId = seeded.candidates[0].id;
    const newEntry = { ...oldEntry, sourceKey: "0d201001-1001-4001-8001-000000000004", objective: { ...oldEntry.objective, sourceSubmissionIds: ["0d201001-1001-4001-8001-000000000004"] } };
    const { plan } = await createPlan(context, makePackage([newEntry]));
    assert.equal(plan.entries[0].candidate.id, productionCandidateId, "provider identity should resolve to the target candidate, not a package scratch ID");
    assert.ok(context.service.getForMaintainer(productionCandidateId).objective.sourceSubmissionIds.includes(newEntry.sourceKey));

    const duplicateCatalogEntry = { ...newEntry, sourceKey: "0e201001-1001-4001-8001-000000000005", objective: { ...newEntry.objective, sourceSubmissionIds: ["0e201001-1001-4001-8001-000000000005"] } };
      const duplicateContext = createTempContext({ shows: [{ id: "signal-alpha", title: "Signal Alpha", cover: "images/covers/archive-81.jpg", status: "published", reviewStatus: "indexed-only", listenLinks: { rss: oldEntry.objective.rssUrl }, metadata: { import: { identifiers: { rssUrl: oldEntry.objective.rssUrl } } } }] });
    try {
      const duplicatePlan = await createPlan(duplicateContext, makePackage([duplicateCatalogEntry]));
      assert.equal(duplicatePlan.plan.entries[0].action, "update", JSON.stringify(duplicatePlan.plan.entries[0].blockers));
      assert.equal(duplicatePlan.plan.entries[0].targetShowId, "signal-alpha");
    } finally {
      duplicateContext.cleanup();
    }
  } finally {
    context.cleanup();
  }
});

test("Echo Publisher rejects duplicate package identities and excludes declared no-op records", () => {
  const entry = packageEntry({ title: "Signal", creatorName: "Studio", submissionId: "0f201001-1001-4001-8001-000000000006", feedUrl: "https://signal.example.test/feed.xml" });
  assert.throws(() => validatePackage(makePackage([entry, { ...entry, sourceKey: "10201001-1001-4001-8001-000000000007", objective: { ...entry.objective, sourceSubmissionIds: ["10201001-1001-4001-8001-000000000007"] } }])), { code: "ECHO_PUBLISHER_DUPLICATE_PACKAGE_ID" });
  assert.throws(() => validatePackage({ ...makePackage([entry]), noOpExcluded: { title: "Signal" } }), { code: "ECHO_PUBLISHER_NOOP_INCLUDED" });
});

test("Echo Publisher rejects stale candidate plans before any catalogue write", async () => {
  const context = createTempContext();
  try {
    const entry = packageEntry({ title: "Signal Stale", creatorName: "Studio", submissionId: "11201001-1001-4001-8001-000000000008", feedUrl: "https://signal-stale.example.test/feed.xml" });
    const { candidates } = await seedPrepared(context, [entry]);
    const { plan, approvalSha256 } = await createPlan(context, makePackage([entry]));
    context.store.updateCandidate(candidates[0].id, { inputRevision: candidates[0].inputRevision + 1, objective: { ...candidates[0].objective, description: "A changed target revision." } });
    await assert.rejects(context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, reviewFacts: true, actor: "operator:test-user" }), { code: "ECHO_PUBLISHER_STALE_PLAN" });
    assert.equal(readShowsFile(context.siteRoot).length, 0);
    assert.equal(context.service.getForMaintainer(candidates[0].id).status, "ready", "stale rejection must not reset or mutate candidate status");
  } finally {
    context.cleanup();
  }
});

test("Echo Publisher batch factual review selects only current target evidence and creates a replacement plan", async () => {
  const context = createTempContext();
  try {
    const entry = packageEntry({ title: "Signal Review", creatorName: "Studio", submissionId: "14201001-1001-4001-8001-000000000011", feedUrl: "https://signal-review.example.test/feed.xml" });
    const { candidates } = await seedPrepared(context, [entry]);
    const evidence = candidates[0].fieldEvidence.find((item) => item.fieldName === "title" && item.sourceType === "rss");
    assert.ok(evidence, "the importer should retain the RSS title evidence row");
    const { plan, approvalSha256 } = await createPlan(context, makePackage([entry]));
    const result = await context.publisher.resolveReviews({
      planId: plan.planId,
      approveSha256: approvalSha256,
      actor: "operator:test-reviewer",
      reviewer: "delegate:codex",
      decisions: [{
        submissionId: entry.sourceKey,
        type: "select-evidence",
        fieldName: "title",
        sourceType: evidence.sourceType,
        sourceUrl: evidence.sourceUrl,
        value: evidence.value,
      }],
    });
    assert.equal(result.review.reviewedBy, "delegate:codex");
    assert.equal(result.review.authorizedBy, "operator:test-reviewer");
    assert.equal(result.review.decisions[0].status, "reviewed");
    assert.ok(result.replacementPlan);
    const updated = context.service.getForMaintainer(candidates[0].id);
    assert.ok(updated.fieldEvidence.some((item) => item.id === evidence.id && item.selected));
    assert.ok(updated.events.some((event) => event.eventType === "field-evidence-selected" && event.actor === "delegate:codex"));
    assert.equal(updated.factsReviewedAt || "", "", "evidence selection must not automatically stamp a factual review");
    assert.notEqual(result.replacementPlan.plan.entries[0].candidate.inputRevision, plan.entries[0].candidate.inputRevision);
    await assert.rejects(context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, reviewFacts: true, actor: "operator:test-reviewer" }), { code: "ECHO_PUBLISHER_STALE_PLAN" });
  } finally {
    context.cleanup();
  }
});

test("Echo Publisher records failed atomic writes, rolls them back, and safely retries", async () => {
  const context = createTempContext({ failFirstRefresh: true });
  try {
    const entry = packageEntry({ title: "Signal Retry", creatorName: "Studio", submissionId: "12201001-1001-4001-8001-000000000009", feedUrl: "https://signal-retry.example.test/feed.xml" });
    const { candidates } = await seedPrepared(context, [entry]);
    const { plan, approvalSha256 } = await createPlan(context, makePackage([entry]));
    const first = await context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, reviewFacts: true, actor: "operator:test-user" });
    assert.equal(first.receipt.catalogueWrite.status, "failed-rolled-back");
    assert.equal(readShowsFile(context.siteRoot).length, 0);
    assert.equal(context.service.getForMaintainer(candidates[0].id).status, "ready");
    const retry = await context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, actor: "operator:test-user" });
    assert.equal(retry.receipt.catalogueWrite.status, "complete");
    assert.equal(readShowsFile(context.siteRoot).length, 1);
    const duplicateRetry = await context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, actor: "operator:test-user" });
    assert.equal(duplicateRetry.idempotent, true);
    assert.equal(duplicateRetry.receipt.catalogueWrite.status, "complete");
    assert.equal(readShowsFile(context.siteRoot).length, 1);
  } finally {
    context.cleanup();
  }
});

test("Echo Publisher serializes concurrent batch writes and retries idempotently", async () => {
  const context = createTempContext();
  try {
    const entry = packageEntry({ title: "Signal Concurrent", creatorName: "Studio", submissionId: "13201001-1001-4001-8001-000000000010", feedUrl: "https://signal-concurrent.example.test/feed.xml" });
    await seedPrepared(context, [entry]);
    const { plan, approvalSha256 } = await createPlan(context, makePackage([entry]));
    const results = await Promise.allSettled([
      context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, reviewFacts: true, actor: "operator:test-user" }),
      context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, reviewFacts: true, actor: "operator:test-user" }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled" && result.value.receipt.catalogueWrite.status === "complete").length, 1);
    assert.ok(results.every((result) => result.status === "fulfilled" && ["complete", "failed-rolled-back"].includes(result.value.receipt.catalogueWrite.status)));
    assert.equal(readShowsFile(context.siteRoot).filter((show) => show.title === "Signal Concurrent").length, 1);
    const retry = await context.publisher.applyPlan({ planId: plan.planId, approveSha256: approvalSha256, actor: "operator:test-user" });
    assert.equal(retry.idempotent, true);
  } finally {
    context.cleanup();
  }
});

test("Echo Publisher target, CLI protocol, and socket authorization fail closed", async () => {
  assert.throws(() => assertProductionTarget({ config: { DEPLOYMENT_ENV: "staging", DB_PATH: "/tmp/community.sqlite", SITE_URL: "https://staging.test", IMPORT_STAGING_ROOT: "/tmp/import-staging" }, staticRoot: "/tmp/site" }), { code: "ECHO_PUBLISHER_WRONG_TARGET" });
  assert.throws(() => validateClientRequest({ command: "apply", planId: "a".repeat(20), approveSha256: "b".repeat(64), actor: "operator:someone" }), { code: "ECHO_PUBLISHER_INVALID_REQUEST" });
  assert.equal(validateClientRequest({ command: "apply", planId: "a".repeat(20), approveSha256: "b".repeat(64), reviewFacts: true, factualReviewer: "delegate:codex" }).factualReviewer, "delegate:codex");
  assert.throws(() => validateClientRequest({ command: "apply", planId: "a".repeat(20), approveSha256: "b".repeat(64), reviewFacts: true, factualReviewer: "someone-else" }), { code: "ECHO_PUBLISHER_INVALID_REQUEST" });
  assert.throws(() => validateClientRequest({ command: "apply", planId: "a".repeat(20), approveSha256: "b".repeat(64), factualReviewer: "delegate:codex" }), { code: "ECHO_PUBLISHER_INVALID_REQUEST" });
  assert.deepEqual(createRequest("apply", ["a".repeat(20), "--approve", "b".repeat(64), "--review-facts", "--reviewer", "codex"]), {
    command: "apply",
    planId: "a".repeat(20),
    approveSha256: "b".repeat(64),
    reviewFacts: true,
    factualReviewer: "delegate:codex",
  });
  assert.throws(() => createRequest("apply", ["a".repeat(20), "--approve", "b".repeat(64), "--reviewer", "codex"]), /--review-facts/);
  assert.throws(() => createRequest("apply", ["a".repeat(20), "--approve", "b".repeat(64), "--review-facts", "--reviewer", "someone-else"]), /reviewer codex/);
  assert.equal(validateClientRequest({ command: "resolve", planId: "a".repeat(20), approveSha256: "b".repeat(64), decisions: [], reviewer: "delegate:codex" }).reviewer, "delegate:codex");
  assert.throws(() => validateClientRequest({ command: "resolve", planId: "a".repeat(20), approveSha256: "b".repeat(64), decisions: [], reviewer: "operator:forged" }), { code: "ECHO_PUBLISHER_INVALID_REQUEST" });
  assert.equal(runnerExitCode({ ok: true }, 2), 2, "the client preserves incomplete public-verification status");
  assert.equal(runnerExitCode({ ok: false }, 2), 1, "server errors remain failed operations");
  const formattedReview = formatResponse({ ok: true, data: { review: { reviewedBy: "delegate:codex", authorizedBy: "operator:echo", reviewedAt: "2026-11-01T12:00:00Z", decisions: [] } } }, "resolve");
  assert.match(formattedReview, /Reviewed by: delegate:codex/);
  assert.match(formattedReview, /Authorized by: operator:echo/);
  assert.throws(() => validateClientRequest({ command: "exec", commandLine: "sqlite3" }), { code: "ECHO_PUBLISHER_UNKNOWN_COMMAND" });
  const context = createTempContext();
  try {
    await assert.rejects(handlePublisherRequest(context.publisher, { command: "status", planId: "a".repeat(20), actor: "human-without-operator" }), { code: "ECHO_PUBLISHER_OPERATOR_REQUIRED" });
    await assert.rejects(context.publisher.applyPlan({ planId: "a".repeat(20), approveSha256: "b".repeat(64), actor: "" }), { code: "ECHO_PUBLISHER_PLAN_NOT_FOUND" });
  } finally {
    context.cleanup();
  }
});

test("restricted host runner verifies active production pointers, lock, database, service, and private socket", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-publisher-host-test-"));
  const hostRoot = path.join(tempDir, "echo");
  const stateRoot = path.join(tempDir, "state");
  const socketDirectory = path.join(stateRoot, "private");
  const releaseId = "0123456789abcdef0123456789abcdef01234567";
  const releaseRoot = path.join(hostRoot, "releases", releaseId);
  const overlayRoot = path.join(hostRoot, "runtime", "production", releaseId);
  const socketPath = path.join(socketDirectory, "publisher.sock");
  fs.mkdirSync(releaseRoot, { recursive: true });
  fs.mkdirSync(overlayRoot, { recursive: true });
  fs.mkdirSync(path.join(hostRoot, "shared", "state"), { recursive: true });
  fs.mkdirSync(socketDirectory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(stateRoot, { recursive: true });
  const overlayMarkerPath = path.join(overlayRoot, "release.json");
  const releaseMarkerPath = path.join(releaseRoot, "release.json");
  writeJson(releaseMarkerPath, { releaseId });
  fs.symlinkSync(releaseMarkerPath, overlayMarkerPath);
  fs.writeFileSync(path.join(hostRoot, "shared", "state", "deployment.lock"), "");
  fs.writeFileSync(path.join(stateRoot, "community.sqlite"), "sqlite-test");
  fs.symlinkSync(releaseRoot, path.join(hostRoot, "current"));
  fs.symlinkSync(overlayRoot, path.join(hostRoot, "runtime", "production", "current"));

  const socketServer = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      socketServer.once("error", reject);
      socketServer.listen(socketPath, resolve);
    });
    fs.chmodSync(socketPath, 0o600);
    const options = {
      root: hostRoot,
      stateRoot,
      socketPath,
      systemctl: () => ({ status: 0 }),
      userLookup: () => ({ status: 0, stdout: `${process.getuid()}\n` }),
    };
    assert.equal(validateProductionHost(options).releaseId, releaseId);

    fs.unlinkSync(overlayMarkerPath);
    writeJson(overlayMarkerPath, { releaseId });
    assert.equal(validateProductionHost(options).releaseId, releaseId, "a regular marker in the exact active overlay remains supported");

    const replaceMarker = (createMarker) => {
      fs.rmSync(overlayMarkerPath, { recursive: true, force: true });
      createMarker();
    };
    const outsideMarkerPath = path.join(tempDir, "outside-release.json");
    writeJson(outsideMarkerPath, { releaseId });
    replaceMarker(() => fs.symlinkSync(outsideMarkerPath, overlayMarkerPath));
    assert.throws(() => validateProductionHost(options), { code: "ECHO_PUBLISHER_RELEASE_MARKER_INVALID" });

    replaceMarker(() => fs.symlinkSync(path.join(tempDir, "missing-release.json"), overlayMarkerPath));
    assert.throws(() => validateProductionHost(options), { code: "ECHO_PUBLISHER_RELEASE_MARKER_INVALID" });

    const otherReleaseId = "fedcba9876543210fedcba9876543210fedcba98";
    const otherReleaseRoot = path.join(hostRoot, "releases", otherReleaseId);
    fs.mkdirSync(otherReleaseRoot, { recursive: true });
    writeJson(path.join(otherReleaseRoot, "release.json"), { releaseId: otherReleaseId });
    replaceMarker(() => fs.symlinkSync(path.join(otherReleaseRoot, "release.json"), overlayMarkerPath));
    assert.throws(() => validateProductionHost(options), { code: "ECHO_PUBLISHER_RELEASE_MARKER_INVALID" });

    replaceMarker(() => fs.mkdirSync(overlayMarkerPath));
    assert.throws(() => validateProductionHost(options), { code: "ECHO_PUBLISHER_RELEASE_MARKER_INVALID" });

    replaceMarker(() => writeJson(overlayMarkerPath, { releaseId: otherReleaseId }));
    assert.throws(() => validateProductionHost(options), { code: "ECHO_PUBLISHER_RELEASE_MISMATCH" });

    replaceMarker(() => fs.symlinkSync(releaseMarkerPath, overlayMarkerPath));

    fs.chmodSync(socketDirectory, 0o777);
    assert.throws(() => validateProductionHost(options), { code: "ECHO_PUBLISHER_SOCKET_INVALID" });
    fs.chmodSync(socketDirectory, 0o700);

    assert.throws(() => validateProductionHost({ ...options, systemctl: () => ({ status: 3 }) }), { code: "ECHO_PUBLISHER_SERVICE_INACTIVE" });
    assert.throws(() => validateProductionHost({ ...options, userLookup: () => ({ status: 0, stdout: "4294967294\n" }) }), { code: "ECHO_PUBLISHER_SOCKET_OWNER_INVALID" });
    fs.chmodSync(socketPath, 0o666);
    assert.throws(() => validateProductionHost(options), { code: "ECHO_PUBLISHER_SOCKET_INVALID" });
    fs.chmodSync(socketPath, 0o600);

    fs.unlinkSync(path.join(hostRoot, "runtime", "production", "current"));
    const stagingOverlay = path.join(hostRoot, "runtime", "staging", releaseId);
    fs.mkdirSync(stagingOverlay, { recursive: true });
    fs.symlinkSync(stagingOverlay, path.join(hostRoot, "runtime", "production", "current"));
    assert.throws(() => validateProductionHost(options), { code: "ECHO_PUBLISHER_PRODUCTION_POINTER_MISMATCH" });
    fs.unlinkSync(path.join(hostRoot, "runtime", "production", "current"));
    fs.symlinkSync(overlayRoot, path.join(hostRoot, "runtime", "production", "current"));

    fs.unlinkSync(path.join(stateRoot, "community.sqlite"));
    fs.symlinkSync(path.join(tempDir, "outside.sqlite"), path.join(stateRoot, "community.sqlite"));
    assert.throws(() => validateProductionHost(options), { code: "ECHO_PUBLISHER_DATABASE_INVALID" });
  } finally {
    await new Promise((resolve) => socketServer.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("restricted runner authenticates the local operator and rejects direct or unsuccessful privileged dispatch", () => {
  assert.throws(() => assertRootRunner(1000), { code: "ECHO_PUBLISHER_SUDO_REQUIRED" });
  assert.throws(() => assertNoExtraCliArgs(["--dispatch"]), { code: "ECHO_PUBLISHER_ARGUMENTS_REJECTED" });
  assert.throws(() => assertOperatorMembership("--help"), { code: "ECHO_PUBLISHER_OPERATOR_REQUIRED" });
  assert.throws(() => assertOperatorMembership("echo-user", {
    spawnImpl: (command, args) => {
      assert.equal(command, "/usr/bin/id");
      assert.deepEqual(args, ["-nG", "echo-user"]);
      return { status: 0, stdout: "echo-user users\n" };
    },
  }), { code: "ECHO_PUBLISHER_OPERATOR_UNAUTHORIZED" });
  assert.doesNotThrow(() => assertOperatorMembership("echo-user", {
    spawnImpl: () => ({ status: 0, stdout: "echo-publisher-operators users\n" }),
  }));
  assert.equal(dispatchExitStatus({ ok: true, data: { receipt: { catalogueWrite: { status: "complete" }, verification: { status: "verified" }, publicSiteVerification: { status: "verified" } } } }, "apply"), 0);
  assert.equal(dispatchExitStatus({ ok: true, data: { receipt: { catalogueWrite: { status: "failed-rolled-back" } } } }, "apply"), 1);
  assert.equal(dispatchExitStatus({ ok: true, data: { receipt: { catalogueWrite: { status: "complete" }, verification: { status: "failed" }, publicSiteVerification: { status: "verified" } } } }, "apply"), 2);
  const installer = fs.readFileSync(path.join(REPO_ROOT, "deploy/install-echo-publisher.sh"), "utf8");
  assert.match(installer, /NOPASSWD:\s+\$\{RUNNER_INSTALL\}\s+""/);
  assert.doesNotMatch(installer, /NOPASSWD:\s+ALL/);
  assert.match(installer, /OPERATOR_GROUP_RECORD=.*getent group/);
  assert.match(installer, /unexpected account/);
});

test("public-site verification checks exact serialized show content", async () => {
  const show = { id: "signal-public", title: "Signal Public" };
  const expected = hashValue(show);
  const fetchImpl = async () => new Response(JSON.stringify([show]), { status: 200, headers: { "content-type": "application/json" } });
  const verified = await verifyPublicSite([show.id], { [show.id]: expected }, fetchImpl);
  assert.equal(verified.status, "verified");
  const mismatch = await verifyPublicSite([show.id], { [show.id]: "0".repeat(64) }, fetchImpl);
  assert.equal(mismatch.status, "failed");
  assert.deepEqual(mismatch.contentMismatches, [show.id]);
});

test("Nov. 1 submission package rehearsal uses an isolated scratch database copy", { skip: !fs.existsSync(path.join(REPO_ROOT, "tmp/submission-preparation-2026-11-01/publication-package.json")) }, async () => {
  const packagePath = path.join(REPO_ROOT, "tmp/submission-preparation-2026-11-01/publication-package.json");
  const sourceDbPath = path.join(REPO_ROOT, "tmp/submission-preparation-2026-11-01/local-runs/final-local-importer-20261101T122307Z/candidate-preparation.sqlite");
  assert.ok(fs.existsSync(sourceDbPath), "the dated importer dry-run SQLite snapshot is available for this local rehearsal");
  const packageData = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-publisher-nov1-rehearsal-"));
  const dbPath = path.join(tempDir, "candidate-preparation.sqlite");
  fs.copyFileSync(sourceDbPath, dbPath);
  const siteRoot = path.join(tempDir, "site");
  fs.mkdirSync(path.join(siteRoot, "import-staging"), { recursive: true, mode: 0o770 });
  fs.mkdirSync(path.join(siteRoot, "data"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "data/shows.json"), path.join(siteRoot, "data/shows.json"));
  fs.copyFileSync(path.join(REPO_ROOT, "data/collections.json"), path.join(siteRoot, "data/collections.json"));
  fs.mkdirSync(path.join(siteRoot, "images"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "images/Circle2-Logo-S.png"), path.join(siteRoot, "images/Circle2-Logo-S.png"));
  const before = fs.readFileSync(path.join(siteRoot, "data/shows.json"));
  const db = openDatabase(dbPath);
  const store = createImportStore({ db });
  const config = {
    DB_PATH: dbPath,
    DATA_ROOT: tempDir,
    DEPLOYMENT_ENV: "isolated-local-rehearsal",
    SITE_URL: "https://isolated.invalid",
    IMPORT_STAGING_ROOT: path.join(siteRoot, "import-staging"),
    PODCAST_INDEX_API_KEY: "",
    PODCAST_INDEX_API_SECRET: "",
    IMPORT_AUTO_WORKER: false,
  };
  const service = createImportService({ store, staticRoot: siteRoot, config, fetchImpl: fakeFetch });
  const publisher = createEchoPublisher({ service, store, staticRoot: siteRoot, config, enforceProductionTarget: false });
  try {
    assert.equal(packageData.searchResults.length, 10);
    assert.equal(packageData.searchResults.some((entry) => entry.title === packageData.noOpExcluded.title), false);
    assert.equal(packageData.searchResults.length - 1, 9);
    const { plan } = await publisher.createPlan({ packageData, actor: "operator:rehearsal" });
    assert.equal(plan.target.environment, "isolated-local-rehearsal");
    assert.equal(plan.entries.length, 10);
    assert.equal(plan.entries.filter((entry) => entry.action === "new-listing").length, 8);
    assert.equal(plan.entries.filter((entry) => entry.action === "update").length, 1);
    assert.equal(plan.entries.filter((entry) => entry.action === "blocked").length, 1);
    const optog = plan.entries.find((entry) => entry.title === "OPTOg");
    assert.ok(optog.blockers.some((blocker) => /identity|review|ready/i.test(`${blocker.code} ${blocker.message}`)));
    const polybius = plan.entries.find((entry) => entry.title === "Polybius Protocol");
    assert.equal(polybius.action, "update");
    assert.equal(polybius.targetShowId, "polybius-protocol");
    assert.equal(plan.noOpExcluded.title, "Rosanna's Secret");
    assert.deepEqual(fs.readFileSync(path.join(siteRoot, "data/shows.json")), before, "the rehearsal plan must not modify public content");
  } finally {
    service.stop();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
