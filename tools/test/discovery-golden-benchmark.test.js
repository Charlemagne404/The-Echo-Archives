const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildBenchmarkReport,
  captureBaseline,
  computeCatalogueRevision,
  constraintMatches,
  evaluateEvidenceItem,
  evaluateTarget,
  readBenchmarkContext,
  validateCorpus,
  validateTargetContract,
} = require("../lib/discovery-golden-benchmark");
const { assertTargetContractAbsentForCapture } = require("../report-discovery-benchmark");

const siteRoot = path.resolve(__dirname, "../..");
const corpusPath = path.join(siteRoot, "docs/2.0/discovery-benchmark/golden-queries.v1.json");
const targetPath = path.join(siteRoot, "docs/2.0/discovery-benchmark/target-contract.v2.json");
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
const targetContract = JSON.parse(fs.readFileSync(targetPath, "utf8"));
const context = readBenchmarkContext(siteRoot);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getCase(id) {
  return corpus.cases.find((caseDefinition) => caseDefinition.id === id);
}

test("the reviewed corpus and separate target contract validate against current catalogue IDs", () => {
  assert.deepEqual(validateCorpus(corpus, context), []);
  assert.deepEqual(validateTargetContract(targetContract, corpus, context), []);
  assert.equal(corpus.baseline.implementationCommit, "55ca3969c850cabbc3c0159aae4e3c77da7e0410");
  assert.equal(corpus.baseline.counts.publishedShows, 752);
  assert.equal(corpus.cases.length, 57);
});

test("all formerly unsupported future assertions are reviewed into explicit product categories", () => {
  const review = targetContract.implementationReview;
  assert.equal(review.previouslyUnsupportedAssertions, 82);
  assert.equal(review.nowSupported.length, 64);
  assert.equal(review.intentionallyUnresolvedOrAmbiguous.length, 15);
  assert.equal(review.deferredForCatalogueEvidence.length, 3);
  assert.equal(review.additionalRegressionAssertions.length, 2);
  const report = buildBenchmarkReport(corpus, context, siteRoot, targetContract);
  assert.equal(report.summary.discoveryV2Assertions, 84);
  assert.equal(report.summary.supportedFailures, 0);
});

test("unknown IDs are rejected in observed results and target intent references", () => {
  const brokenCorpus = clone(corpus);
  brokenCorpus.cases[0].baselineV1.topIds[0] = "missing-show";
  assert.ok(validateCorpus(brokenCorpus, context).some((error) => error.includes("unknown result ID missing-show")));

  const brokenTarget = clone(targetContract);
  brokenTarget.cases["identity-midnight-burger-exact"].intent.expected.showId = "missing-show";
  assert.ok(validateTargetContract(brokenTarget, corpus, context).some((error) => error.includes("unknown show ID missing-show")));

  const unknownCollection = clone(targetContract);
  unknownCollection.cases["collection-best-for-long-walks"].acceptableTopK.ids = ["missing-collection"];
  assert.ok(validateTargetContract(unknownCollection, corpus, context).some((error) => error.includes("unknown collection ID missing-collection")));
});

test("acceptable-set assertions measure any allowed ID within top K", () => {
  const caseDefinition = { id: "set-check", surface: "show-search", target: {
    acceptableTopK: { support: "current-v1", ids: ["accepted-a", "accepted-b"], k: 3 },
  } };
  const passing = evaluateTarget(caseDefinition, { results: [{ id: "other" }, { id: "accepted-b" }], observation: { topIds: ["other", "accepted-b"] } }, {});
  assert.equal(passing[0].status, "pass");
  assert.deepEqual(passing[0].matchedIds, ["accepted-b"]);

  const failing = evaluateTarget({ ...caseDefinition, target: { acceptableTopK: { support: "current-v1", ids: ["accepted-b"], k: 1 } } }, {
    results: [{ id: "other" }, { id: "accepted-b" }], observation: { topIds: ["other", "accepted-b"] },
  }, {});
  assert.equal(failing[0].status, "fail");
});

test("prohibited IDs are checked only inside the declared top N", () => {
  const caseDefinition = { id: "prohibited-check", surface: "show-search", target: {
    prohibitedTopK: { support: "current-v1", ids: ["blocked"], k: 2 },
  } };
  const execution = { results: [{ id: "ok" }, { id: "blocked" }, { id: "outside-window" }], observation: { topIds: ["ok", "blocked", "outside-window"] } };
  const [assertion] = evaluateTarget(caseDefinition, execution, {});
  assert.equal(assertion.status, "fail");
  assert.deepEqual(assertion.prohibitedIds, ["blocked"]);

  const outsideWindow = evaluateTarget({ ...caseDefinition, target: { prohibitedTopK: { support: "current-v1", ids: ["outside-window"], k: 2 } } }, execution, {});
  assert.equal(outsideWindow[0].status, "pass");
});

test("Discovery 2 ambiguity and unresolved phrase assertions are evaluated", () => {
  const report = buildBenchmarkReport(corpus, context, siteRoot, targetContract);
  assert.equal(report.summary.futureUnsupported, 0);
  for (const [caseId, assertionKey] of [
    ["runtime-ambiguous-season-vs-hours", "ambiguity"],
    ["similarity-midnight-darker", "unresolvedPhrases"],
  ]) {
    const assertion = report.cases.find((entry) => entry.id === caseId).assertions.find((entry) => entry.key === assertionKey);
    assert.equal(assertion.status, "pass");
  }

  const malformed = clone(targetContract);
  malformed.cases["runtime-ambiguous-season-vs-hours"].ambiguity.acceptableInterpretations = [{ kind: "runtime" }];
  const errors = validateTargetContract(malformed, corpus, context);
  assert.ok(errors.some((error) => error.includes("at least two alternatives")));

  const missingPhrase = clone(targetContract);
  missingPhrase.cases["similarity-midnight-darker"].unresolvedPhrases.phrases = [];
  assert.ok(validateTargetContract(missingPhrase, corpus, context).some((error) => error.includes("phrases must be a non-empty array of non-empty strings")));
});

test("hard constraints require explicit matching evidence and catch missing or contradictory values", () => {
  const record = { completionStatus: "finished", genres: ["sci-fi", "drama"], formats: ["full-cast"] };
  assert.equal(constraintMatches(record, { field: "completionStatus", operator: "equals", value: "finished" }), true);
  assert.equal(constraintMatches(record, { field: "genres", operator: "includes", value: "sci-fi" }), true);
  assert.equal(constraintMatches(record, { field: "genres", operator: "excludes", value: "comedy" }), true);
  assert.equal(constraintMatches({ completionStatus: "finished" }, { field: "genres", operator: "includes", value: "sci-fi" }), false);
  assert.equal(constraintMatches({ genres: ["comedy"] }, { field: "genres", operator: "excludes", value: "comedy" }), false);

  const caseDefinition = { id: "hard-filter", surface: "show-search", target: {
    hardConstraints: { support: "current-v1", k: 2, all: [{ field: "genres", operator: "includes", value: "sci-fi" }] },
  } };
  const assertions = evaluateTarget(caseDefinition, {
    results: [{ id: "valid" }, { id: "missing-genre" }], observation: { topIds: ["valid", "missing-genre"] },
  }, { showsById: new Map([["valid", { genres: ["sci-fi"] }], ["missing-genre", { genres: [] }]]) });
  assert.equal(assertions[0].status, "fail");
  assert.deepEqual(assertions[0].violations, ["missing-genre"]);
});

test("evidence assertions verify the surfaced claim against actual typed catalogue data", () => {
  const caseDefinition = { query: "long walk" };
  const result = { id: "walk-show", title: "The Walk", searchMatchTier: 3, reasons: ["good for long walks"], searchPresentation: { metaText: "Also listed as The Walk" } };
  const execution = { results: [result] };
  const evidenceContext = {
    showsById: new Map([["walk-show", { id: "walk-show", bestFor: ["long-walks"] }]]),
    entitiesById: new Map([["qcode", { id: "qcode", name: "QCODE" }]]),
  };
  assert.equal(evaluateEvidenceItem({ kind: "catalogue_field", field: "bestFor", value: "long-walks" }, caseDefinition, execution, evidenceContext), true);

  const entityContext = {
    showsById: new Map([["company-show", { entityLinks: [{ entityId: "qcode", role: "production-company" }] }]]),
    entitiesById: new Map([["qcode", { id: "qcode", name: "QCODE" }]]),
  };
  const entityExecution = { results: [{ id: "company-show", reasons: ["created by qcode"], searchPresentation: { metaText: "Production company: QCODE" } }] };
  assert.equal(evaluateEvidenceItem({ kind: "typed_relationship", entityId: "qcode", role: "production-company" }, {}, entityExecution, entityContext), true);
  assert.equal(evaluateEvidenceItem({ kind: "typed_relationship", entityId: "qcode", role: "network" }, {}, entityExecution, entityContext), false);
});

test("catalogue fingerprints detect changes in authored and runtime catalogue inputs", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-discovery-benchmark-"));
  try {
    fs.mkdirSync(path.join(temporaryRoot, "catalog-src/shows"), { recursive: true });
    fs.writeFileSync(path.join(temporaryRoot, "catalog-src/shows/sample.json"), "{\"id\":\"sample\"}\n");
    const initial = computeCatalogueRevision(temporaryRoot).fingerprint;
    fs.writeFileSync(path.join(temporaryRoot, "catalog-src/shows/sample.json"), "{\"id\":\"changed\"}\n");
    const changed = computeCatalogueRevision(temporaryRoot).fingerprint;
    assert.notEqual(initial, changed);

    const driftedCorpus = clone(corpus);
    driftedCorpus.baseline.catalogueFingerprint = "0".repeat(64);
    const report = buildBenchmarkReport(driftedCorpus, context, siteRoot, targetContract);
    assert.equal(report.current.catalogueDrift, true);
    assert.equal(report.current.catalogueFingerprint, computeCatalogueRevision(siteRoot).fingerprint);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("baseline capture is one-time and refuses a separate target contract", () => {
  assert.throws(() => captureBaseline(corpus, context, path.join(os.tmpdir(), "should-not-write.json")), /baseline is already captured/);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-discovery-target-contract-"));
  const targetPath = path.join(temporaryRoot, "target.json");
  try {
    assert.doesNotThrow(() => assertTargetContractAbsentForCapture(targetPath));
    fs.writeFileSync(targetPath, JSON.stringify({ cases: {} }));
    assert.doesNotThrow(() => assertTargetContractAbsentForCapture(targetPath));
    fs.writeFileSync(targetPath, JSON.stringify({ cases: { "case-a": { intent: {} } } }));
    assert.throws(() => assertTargetContractAbsentForCapture(targetPath), /before adding assertions to the separate target contract/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("the benchmark is deterministic and reports catalogue drift accurately", () => {
  const first = buildBenchmarkReport(corpus, context, siteRoot, targetContract);
  const second = buildBenchmarkReport(corpus, context, siteRoot, targetContract);
  assert.deepEqual(first, second);
  assert.equal(
    first.current.catalogueDrift,
    first.current.catalogueFingerprint !== corpus.baseline.catalogueFingerprint,
  );
});

test("the frozen v1 White Vault defect remains visible and Discovery 2 removes it", () => {
  const report = buildBenchmarkReport(corpus, context, siteRoot, targetContract);
  const defect = report.legacyV1Defects.find((entry) => entry.caseId === "similarity-white-vault-sci-fi");
  assert.ok(defect);
  assert.ok(defect.v1TopIds.includes("the-harrowing"));
  assert.ok(defect.v1ViolationIds.includes("the-harrowing"));
  assert.ok(!defect.discoveryTopIds.includes("the-harrowing"));
  assert.deepEqual(defect.discoveryViolationIds, []);
  assert.equal(defect.fixedByDiscovery, true);
  const fixtureCase = getCase("similarity-white-vault-sci-fi");
  assert.ok(fixtureCase.baselineV1.topIds.includes("the-harrowing"));
  assert.equal(report.baselineChanges.length, 0);
});

test("malformed fixture shapes return actionable validation errors", () => {
  const malformed = clone(corpus);
  malformed.cases[0].query = "  ";
  malformed.cases[1].surface = "unknown-surface";
  malformed.cases[2].baselineV1.resultCount = -1;
  const errors = validateCorpus(malformed, context);
  assert.ok(errors.some((error) => error.includes("query must be a non-empty string")));
  assert.ok(errors.some((error) => error.includes("surface must be show-search or collections-search")));
  assert.ok(errors.some((error) => error.includes("resultCount must be a non-negative integer")));
  assert.throws(() => JSON.parse("{ malformed"), SyntaxError);
});
