const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const storageSource = fs.readFileSync(
  path.resolve(__dirname, "../../shared/app/submit/draft-storage.js"),
  "utf8",
);

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createThrowingStorage() {
  return {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
    removeItem() {
      throw new Error("storage blocked");
    },
  };
}

function createShowDraft(overrides = {}) {
  return {
    showTitle: "The Drafted Signal",
    creatorName: "Example Studio",
    contactEmail: "listener@example.com",
    listenLinks: [{ label: "RSS Feed", url: "https://example.com/feed" }],
    selectedTags: ["Mystery"],
    suggestedDescriptors: "Remote station mystery",
    completionStatus: "ongoing",
    shortDescription: "A short factual description.",
    verificationNotes: "Official source available.",
    legalAcknowledged: true,
    helpfulDetailsOpen: true,
    ...overrides,
  };
}

function createCorrectionDraft(overrides = {}) {
  return {
    existingShowId: "impact-winter",
    showSearch: "Impact Winter",
    correctionType: "broken-link",
    creatorPageId: "",
    creatorPageName: "",
    creatorPageIssue: "missing-page",
    creatorPageProposedValue: "",
    linkAction: "replace",
    affectedUrl: "https://old.example/show",
    replacementUrl: "https://new.example/show",
    metadataField: "creator",
    proposedMetadataValue: "",
    proposedStatus: "ongoing",
    statusContext: "",
    creditAction: "add",
    creditName: "",
    creditRole: "",
    artworkUrl: "",
    artworkCredit: "",
    otherIssue: "",
    otherProposedValue: "",
    sourceLinks: [{ url: "https://official.example/source" }],
    optionalNotes: "The old URL redirects incorrectly.",
    contactEmail: "",
    legalAcknowledged: true,
    ...overrides,
  };
}

async function loadStorageModule() {
  const encodedSource = Buffer.from(storageSource, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encodedSource}`);
}

test("submission drafts use a versioned safe snapshot and restore structured fields", async () => {
  const storageModule = await loadStorageModule();
  const storage = createMemoryStorage();
  const context = storageModule.createDraftContext();

  assert.equal(storageModule.saveStoredDraft("show", context, createShowDraft(), storage), true);

  const stored = JSON.parse(storage.getItem(storageModule.SUBMISSION_DRAFT_STORAGE_KEY));
  assert.equal(stored.schemaVersion, storageModule.SUBMISSION_DRAFT_SCHEMA_VERSION);
  assert.equal(stored.drafts[storageModule.getDraftContextKey("show", context)].fields.showTitle, "The Drafted Signal");
  assert.equal("legalAcknowledged" in stored.drafts[storageModule.getDraftContextKey("show", context)].fields, false);
  assert.equal("helpfulDetailsOpen" in stored.drafts[storageModule.getDraftContextKey("show", context)].fields, false);

  assert.deepEqual(
    storageModule.loadStoredDraft("show", context, storage),
    {
      showTitle: "The Drafted Signal",
      creatorName: "Example Studio",
      contactEmail: "listener@example.com",
      listenLinks: [{ label: "RSS Feed", url: "https://example.com/feed" }],
      selectedTags: ["Mystery"],
      suggestedDescriptors: "Remote station mystery",
      completionStatus: "ongoing",
      shortDescription: "A short factual description.",
      verificationNotes: "Official source available.",
    },
  );
});

test("submission draft identities isolate modes and show contexts", async () => {
  const storageModule = await loadStorageModule();
  const storage = createMemoryStorage();
  const impactContext = storageModule.createDraftContext({ showId: "impact-winter" });
  const solarContext = storageModule.createDraftContext({ showId: "solar" });

  storageModule.saveStoredDraft("correction", impactContext, createCorrectionDraft(), storage);
  storageModule.saveStoredDraft(
    "correction",
    solarContext,
    createCorrectionDraft({ existingShowId: "solar", showSearch: "Solar", affectedUrl: "https://solar.example/old" }),
    storage,
  );
  storageModule.saveStoredDraft(
    "listener-review",
    impactContext,
    {
      existingShowId: "impact-winter",
      showSearch: "Impact Winter",
      ratingStars: 4,
      categoryScores: { ads: 8 },
      spoilerLevel: "spoiler-free",
      reviewTitle: "A strong signal",
      reviewText: "The atmosphere holds.",
      whoWouldLikeThis: "Listeners who like isolation horror.",
      bestFor: ["Long walks"],
      workedBest: ["Sound design"],
      similarShows: "The White Vault",
      alias: "Archive listener",
      contactEmail: "",
    },
    storage,
  );

  assert.equal(storageModule.loadStoredDraft("correction", impactContext, storage).affectedUrl, "https://old.example/show");
  assert.equal(storageModule.loadStoredDraft("correction", solarContext, storage).affectedUrl, "https://solar.example/old");
  assert.equal(storageModule.loadStoredDraft("listener-review", impactContext, storage).reviewText, "The atmosphere holds.");
  assert.equal(storageModule.loadStoredDraft("correction", storageModule.createDraftContext({ showId: "vast-horizon" }), storage), null);
  assert.equal(storageModule.loadStoredDraft("show", storageModule.createDraftContext(), storage), null);
});

test("clearing a draft removes only the requested context and keeps failed drafts available", async () => {
  const storageModule = await loadStorageModule();
  const storage = createMemoryStorage();
  const impactContext = storageModule.createDraftContext({ showId: "impact-winter" });
  const solarContext = storageModule.createDraftContext({ showId: "solar" });

  storageModule.saveStoredDraft("correction", impactContext, createCorrectionDraft(), storage);
  storageModule.saveStoredDraft("correction", solarContext, createCorrectionDraft({ existingShowId: "solar" }), storage);
  assert.equal(storageModule.clearStoredDraft("correction", impactContext, storage), true);
  assert.equal(storageModule.loadStoredDraft("correction", impactContext, storage), null);
  assert.notEqual(storageModule.loadStoredDraft("correction", solarContext, storage), null);
});

test("malformed, unsupported, and invalid stored drafts fail closed", async () => {
  const storageModule = await loadStorageModule();
  const storage = createMemoryStorage();
  const context = storageModule.createDraftContext();

  storage.setItem(storageModule.SUBMISSION_DRAFT_STORAGE_KEY, "not-json");
  assert.doesNotThrow(() => storageModule.loadStoredDraft("show", context, storage));
  assert.equal(storage.getItem(storageModule.SUBMISSION_DRAFT_STORAGE_KEY), null);

  storage.setItem(storageModule.SUBMISSION_DRAFT_STORAGE_KEY, JSON.stringify({ schemaVersion: 0, drafts: {} }));
  assert.equal(storageModule.loadStoredDraft("show", context, storage), null);
  assert.equal(storage.getItem(storageModule.SUBMISSION_DRAFT_STORAGE_KEY), null);

  storage.setItem(storageModule.SUBMISSION_DRAFT_STORAGE_KEY, JSON.stringify({
    schemaVersion: storageModule.SUBMISSION_DRAFT_SCHEMA_VERSION,
    drafts: {
      [storageModule.getDraftContextKey("show", context)]: {
        mode: "show",
        context,
        fields: { showTitle: 42 },
      },
    },
  }));
  assert.equal(storageModule.loadStoredDraft("show", context, storage), null);
  const remaining = JSON.parse(storage.getItem(storageModule.SUBMISSION_DRAFT_STORAGE_KEY));
  assert.deepEqual(remaining.drafts, {});
});

test("storage exceptions never become submission-flow exceptions", async () => {
  const storageModule = await loadStorageModule();
  const storage = createThrowingStorage();
  const context = storageModule.createDraftContext();

  assert.doesNotThrow(() => storageModule.loadStoredDraft("show", context, storage));
  assert.doesNotThrow(() => storageModule.saveStoredDraft("show", context, createShowDraft(), storage));
  assert.doesNotThrow(() => storageModule.clearStoredDraft("show", context, storage));
  assert.equal(storageModule.loadStoredDraft("show", context, storage), null);
});
