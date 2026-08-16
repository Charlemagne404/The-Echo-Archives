const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const { createCollectionStore } = require("../lib/store/collection-store");
const { createCollectionService } = require("../lib/services/collection-service");
const { readCatalogSource } = require("../../tools/lib/catalog-source");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function show(id, { completionStatus = "finished", genres = ["sci-fi"], formats = ["full-cast"] } = {}) {
  return {
    id,
    title: id.replace(/-/g, " "),
    description: `A verified test description for ${id}.`,
    cover: "images/TEA-Logo-S.png",
    coverAlt: `${id} cover`,
    status: "published",
    reviewStatus: "indexed-only",
    completionStatus,
    releaseStatus: completionStatus === "finished" ? "completed" : "active",
    genres,
    formats,
    tags: ["Survival", "Technology"],
    themes: [],
    tones: [],
    languages: ["English"],
    facts: {},
    content: {},
    updatedAt: "2026-08-16",
  };
}

function createContext({ collections = [], semantic = false } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-collections-"));
  const siteRoot = path.join(tempDir, "site");
  const shows = [
    show("finished-signal"),
    show("finished-station"),
    show("ongoing-signal", { completionStatus: "ongoing" }),
    show("horror-station", { genres: ["horror"] }),
  ];
  writeJson(path.join(siteRoot, "data", "shows.json"), shows);
  writeJson(path.join(siteRoot, "data", "collections.json"), collections);
  const db = openDatabase(path.join(tempDir, "community.sqlite"));
  const store = createCollectionStore({ db });
  const fetchImpl = semantic
    ? async (_url, init) => {
      const prompt = JSON.parse(init.body || "{}").prompt || "";
      const approvalRescore = prompt.includes("Collection concept: Remote research stations\n");
      return new Response(JSON.stringify({ response: JSON.stringify({
      matches: [
        { showId: "finished-station", confidence: 0.92, reason: "Remote station setting is central." },
        { showId: "horror-station", confidence: approvalRescore ? 0.87 : 0.7, reason: "Station detail is present but less certain." },
        { showId: "ongoing-signal", confidence: 0.3, reason: "Not a match." },
      ],
      }) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    : undefined;
  const service = createCollectionService({
    store,
    staticRoot: siteRoot,
    config: {
      COLLECTION_MIN_MATCHES: 2,
      COLLECTION_SEMANTIC_CONFIDENCE: 0.8,
      COLLECTION_SEMANTIC_BORDERLINE_CONFIDENCE: 0.65,
      COLLECTION_SUGGESTION_PROVIDER: semantic ? "ollama" : "",
      COLLECTION_SUGGESTION_MODEL: semantic ? "test-model" : "",
      OLLAMA_URL: "http://collection-test.invalid/api/generate",
      IMPORT_FETCH_TIMEOUT_MS: 2_000,
      IMPORT_DOCUMENT_MAX_BYTES: 1_000_000,
    },
    fetchImpl,
    loadCatalogImpl: async () => shows,
    buildCatalogImpl: async () => {},
  });
  return { tempDir, siteRoot, db, store, service };
}

function cleanup(context) {
  context.db.close();
  fs.rmSync(context.tempDir, { recursive: true, force: true });
}

test("rule membership recalculation preserves manual removals and pins", async () => {
  const context = createContext({
    collections: [{
      id: "completed-sci-fi",
      title: "Completed Sci-Fi",
      description: "Finished science fiction.",
      kind: "rule-based",
      automation: {
        mode: "rule",
        criteria: { all: [
          { field: "completionStatus", operator: "equals", value: "finished" },
          { field: "genres", operator: "includes", value: "sci-fi" },
        ], any: [], not: [] },
      },
      showIds: ["finished-signal", "finished-station"],
      showReasons: {},
      coverShowIds: [],
      intentTags: [],
      updatedAt: "2026-08-16",
    }],
  });
  try {
    await context.service.recalculate({ collectionIds: ["completed-sci-fi"], build: false });
    await context.service.setMembershipOverride("completed-sci-fi", "finished-signal", { decision: "remove", actor: "CA" });
    await context.service.setMembershipOverride("completed-sci-fi", "ongoing-signal", { decision: "pin", actor: "CA", reason: "Editorial exception." });
    await context.service.recalculate({ collectionIds: ["completed-sci-fi"], build: false });

    const collection = readCatalogSource(context.siteRoot).collections[0];
    assert.deepEqual(collection.showIds, ["ongoing-signal", "finished-station"]);
    assert.equal(context.store.listOverrides("completed-sci-fi").find((entry) => entry.showId === "finished-signal").decision, "remove");
    const memberships = context.store.listMemberships("completed-sci-fi", { includeInactive: false });
    assert.equal(memberships.find((entry) => entry.showId === "ongoing-signal").sourceType, "manual-pin");
  } finally {
    cleanup(context);
  }
});

test("semantic memberships retain confidence and keep borderline matches out of the public snapshot", async () => {
  const context = createContext({
    semantic: true,
    collections: [{
      id: "remote-research-stations",
      title: "Remote Research Stations",
      description: "Stations under pressure.",
      kind: "semantic",
      automation: { mode: "semantic", query: "Remote research stations and isolated facilities" },
      showIds: ["finished-station"],
      showReasons: {},
      coverShowIds: [],
      intentTags: [],
      updatedAt: "2026-08-16",
    }],
  });
  try {
    await context.service.recalculate({ collectionIds: ["remote-research-stations"], forceSemantic: true, build: false });
    const memberships = context.store.listMemberships("remote-research-stations");
    assert.equal(memberships.find((entry) => entry.showId === "finished-station").state, "active");
    assert.equal(memberships.find((entry) => entry.showId === "finished-station").confidence, 0.92);
    assert.equal(memberships.find((entry) => entry.showId === "horror-station").state, "borderline");
    assert.deepEqual(readCatalogSource(context.siteRoot).collections[0].showIds, ["finished-station"]);
  } finally {
    cleanup(context);
  }
});

test("rule candidate generation enters review and approval creates a publishable automated definition", async () => {
  const context = createContext();
  try {
    const generated = await context.service.generateCandidates({ actor: "CA", includeSemantic: false });
    const candidate = generated.proposed.find((entry) => entry.title === "Completed Sci-Fi");
    assert.ok(candidate, "expected a completed sci-fi rule proposal");
    const approved = await context.service.approveCandidate(candidate.id, { actor: "CA" });
    const collection = readCatalogSource(context.siteRoot).collections.find((entry) => entry.id === "completed-sci-fi");
    assert.equal(approved.collectionId, "completed-sci-fi");
    assert.equal(collection.kind, "rule-based");
    assert.equal(collection.automation.mode, "rule");
    assert.deepEqual(collection.showIds, ["finished-signal", "finished-station"]);
  } finally {
    cleanup(context);
  }
});

test("semantic approval re-scores current matches and records the editor approval rationale", async () => {
  const context = createContext({ semantic: true });
  try {
    const candidate = context.store.createCandidate({
      collectionType: "semantic",
      title: "Remote Research Stations",
      description: "Remote stations under pressure.",
      definition: { automation: { mode: "semantic", query: "Remote research stations" } },
      matchingShowIds: ["finished-station"],
      confidence: 0.9,
      evidence: { strategy: "semantic-llm" },
    });
    await context.service.approveCandidate(candidate.id, { actor: "CA" });
    const collection = readCatalogSource(context.siteRoot).collections.find((entry) => entry.id === "remote-research-stations");
    const membership = context.store.listMemberships(collection.id).find((entry) => entry.showId === "finished-station");
    assert.equal(collection.automation.approvedCandidateId, candidate.id);
    assert.equal(membership.sourceType, "ai-suggestion");
    assert.equal(membership.reason.approval, "editor-approved");
  } finally {
    cleanup(context);
  }
});
