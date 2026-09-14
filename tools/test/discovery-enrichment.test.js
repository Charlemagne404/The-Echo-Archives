const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyEnrichmentUpdates,
  buildEnrichmentUpdates,
  selectNextCandidate,
  writeEnrichedShow,
} = require("../lib/discovery-enrichment");
const { parseArguments } = require("../enrich-discovery");

function createShow(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    status: "published",
    reviewStatus: "indexed-only",
    description: "A source-backed description that provides enough factual context for a focused enrichment test.",
    genres: ["sci-fi"],
    formats: ["serialized"],
    tones: [],
    themes: [],
    bestFor: [],
    similarTo: [],
    similarReasons: {},
    discovery: {},
    ratings: { archive: 8 },
    updatedAt: "2026-09-01",
    ...overrides,
  };
}

function createReport(candidateIds, sample) {
  return {
    enrichmentPriorities: {
      candidateIds,
      candidateCount: candidateIds.length,
      sample,
    },
  };
}

test("next candidate follows the existing discovery-quality order", () => {
  const shows = [
    createShow({ id: "second-show", title: "Second Show" }),
    createShow({ id: "first-show", title: "First Show" }),
  ];
  const report = createReport(["first-show", "second-show"], [
    { id: "first-show", title: "First Show", opportunityScore: 9, score: 2, maxScore: 17, missing: ["tone"] },
    { id: "second-show", title: "Second Show", opportunityScore: 7, score: 3, maxScore: 17, missing: ["best-for route"] },
  ]);

  const selection = selectNextCandidate({ report, shows });
  assert.equal(selection.show.id, "first-show");
  assert.equal(selection.priority.position, 1);
  assert.equal(selectNextCandidate({ report, shows, excludedIds: ["first-show"] }).show.id, "second-show");
});

test("controlled profile and list values are validated before patching", () => {
  const show = createShow();
  const knownShowIds = new Set([show.id, "other-show"]);

  assert.throws(
    () => buildEnrichmentUpdates({ assignments: ["discovery.intensity=extreme"] }, show, { knownShowIds }),
    /discovery\.intensity must be one of/,
  );
  assert.throws(
    () => buildEnrichmentUpdates({ assignments: ["tones=dark,not-a-tone"] }, show, { knownShowIds }),
    /tones contains unsupported value/,
  );
  assert.throws(
    () => buildEnrichmentUpdates({ assignments: ["similarTo=other-show"] }, show, { knownShowIds }),
    /needs an explicit reason/,
  );
});

test("patching changes only requested discovery fields and records a date", () => {
  const show = createShow({
    description: "Keep this factual description byte-for-byte in the returned object.",
    ratings: { archive: 9 },
    metadata: { objectiveSources: ["https://example.com/source"] },
  });
  const updates = buildEnrichmentUpdates({
    assignments: [
      "discovery.voiceStyle=mixed",
      "discovery.narrativeFocus=character-driven",
      "discovery.intensity=medium",
      "discovery.commitment=short",
      "tones=dark,cinematic",
      "themes=survival,found-family",
      "bestFor=headphones-on",
    ],
  }, show, { knownShowIds: new Set([show.id]) });
  const result = applyEnrichmentUpdates(show, updates, { now: "2026-09-14" });

  assert.deepEqual(result.record.discovery, {
    voiceStyle: "mixed",
    narrativeFocus: "character-driven",
    intensity: "medium",
    commitment: "short",
  });
  assert.deepEqual(result.record.tones, ["dark", "cinematic"]);
  assert.deepEqual(result.record.themes, ["survival", "found-family"]);
  assert.deepEqual(result.record.bestFor, ["headphones-on"]);
  assert.equal(result.record.description, show.description);
  assert.deepEqual(result.record.ratings, show.ratings);
  assert.equal(result.record.updatedAt, "2026-09-14");
  assert.deepEqual(result.changes.map((change) => change.path), [
    "discovery.voiceStyle",
    "discovery.narrativeFocus",
    "discovery.intensity",
    "discovery.commitment",
    "tones",
    "themes",
    "bestFor",
    "updatedAt",
  ]);
});

test("similarity updates require explicit reasons and preserve the reason map", () => {
  const show = createShow({
    similarTo: ["existing-show"],
    similarReasons: { "existing-show": "Existing editorial route." },
  });
  const updates = buildEnrichmentUpdates({
    similar: ["other-show=Another deliberate route."],
  }, show, { knownShowIds: new Set([show.id, "existing-show", "other-show"]) });
  const result = applyEnrichmentUpdates(show, updates, { now: "2026-09-14" });

  assert.deepEqual(result.record.similarTo, ["existing-show", "other-show"]);
  assert.deepEqual(result.record.similarReasons, {
    "existing-show": "Existing editorial route.",
    "other-show": "Another deliberate route.",
  });
});

test("clearing a similarity list also clears its now-orphaned reasons", () => {
  const show = createShow({
    similarTo: ["other-show"],
    similarReasons: { "other-show": "Existing editorial route." },
  });
  const updates = buildEnrichmentUpdates({ clears: ["similarTo"] }, show, {
    knownShowIds: new Set([show.id, "other-show"]),
  });
  const result = applyEnrichmentUpdates(show, updates, { now: "2026-09-14" });

  assert.deepEqual(result.record.similarTo, []);
  assert.deepEqual(result.record.similarReasons, {});
  assert.ok(result.changes.some((change) => change.path === "similarReasons"));
});

test("argument parser exposes dry-run, write, and interactive controls", () => {
  const options = parseArguments([
    "--next",
    "--interactive",
    "--set",
    "discovery.intensity=medium",
    "--tones=dark,tense",
    "--write",
    "--yes",
  ]);

  assert.equal(options.interactive, true);
  assert.equal(options.write, true);
  assert.equal(options.yes, true);
  assert.deepEqual(options.assignments, ["discovery.intensity=medium", "tones=dark,tense"]);
});

test("source writer changes only the intended split show file", () => {
  const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-discovery-enrichment-"));
  try {
    const showsDirectory = path.join(siteRoot, "catalog-src", "shows");
    fs.mkdirSync(showsDirectory, { recursive: true });
    const show = createShow();
    const showPath = path.join(showsDirectory, `${show.id}.json`);
    const orderPath = path.join(showsDirectory, "_order.json");
    fs.writeFileSync(showPath, `${JSON.stringify(show, null, 2)}\n`);
    fs.writeFileSync(orderPath, `${JSON.stringify([show.id], null, 2)}\n`);

    const updatedShow = { ...show, tones: ["dark"] };
    const result = writeEnrichedShow({
      siteRoot,
      sourceData: { mode: "split", shows: [show], collections: [], reviewsById: {} },
      originalShow: show,
      updatedShow,
      validate: false,
    });

    assert.deepEqual(result.changedPaths, [showPath]);
    assert.deepEqual(JSON.parse(fs.readFileSync(showPath, "utf8")).tones, ["dark"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(orderPath, "utf8")), [show.id]);
    assert.equal(fs.existsSync(path.join(siteRoot, "data", "shows.json")), false);
  } finally {
    fs.rmSync(siteRoot, { recursive: true, force: true });
  }
});

test("source writer refuses a record that changed after selection", () => {
  const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-discovery-enrichment-stale-"));
  try {
    const showsDirectory = path.join(siteRoot, "catalog-src", "shows");
    fs.mkdirSync(showsDirectory, { recursive: true });
    const show = createShow();
    const showPath = path.join(showsDirectory, `${show.id}.json`);
    fs.writeFileSync(showPath, `${JSON.stringify(show, null, 2)}\n`);
    fs.writeFileSync(path.join(showsDirectory, "_order.json"), `${JSON.stringify([show.id], null, 2)}\n`);

    fs.writeFileSync(showPath, `${JSON.stringify({ ...show, description: "A newer source-backed description changed after selection." }, null, 2)}\n`);

    assert.throws(
      () => writeEnrichedShow({
        siteRoot,
        sourceData: { mode: "split", shows: [show], collections: [], reviewsById: {} },
        originalShow: show,
        updatedShow: { ...show, tones: ["dark"] },
        validate: false,
      }),
      /changed after selection/,
    );
  } finally {
    fs.rmSync(siteRoot, { recursive: true, force: true });
  }
});
