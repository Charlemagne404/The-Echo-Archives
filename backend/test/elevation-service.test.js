const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createElevationService, rankEntry } = require("../lib/services/elevation-service");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function makeShow(overrides = {}) {
  return {
    id: "signal-show",
    title: "Signal Show",
    description: "A source-backed fictional transmission from a distant station with a complete archive of episodes.",
    cover: "images/Circle-S-Logo.png",
    coverAlt: "Signal Show cover",
    status: "published",
    reviewStatus: "imported",
    releaseStatus: "completed",
    completionStatus: "finished",
    genres: ["sci-fi"],
    tags: ["Space", "Survival"],
    formats: ["serialized"],
    listenLinks: { rss: "https://example.test/feed.xml" },
    officialLinks: { website: "https://example.test/" },
    length: { label: "1 season observed", episodes: 8, avgEpisodeMinutes: 30 },
    metadata: { import: { factualReview: { reviewedAt: "2026-08-16", reviewedBy: "tester", inputRevision: 1 } } },
    updatedAt: "2026-08-01",
    ...overrides,
  };
}

function setup({ factualCurrent = true, reviewStatus = "imported", review = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-elevation-"));
  const show = makeShow({ reviewStatus });
  if (!factualCurrent) delete show.metadata.import.factualReview;
  writeJson(path.join(root, "data/shows.json"), [
    show,
    makeShow({ id: "neighbor-a", title: "Neighbor A", status: "draft", reviewStatus: "planned" }),
    makeShow({ id: "neighbor-b", title: "Neighbor B", status: "draft", reviewStatus: "planned" }),
    makeShow({ id: "neighbor-c", title: "Neighbor C", status: "draft", reviewStatus: "planned" }),
  ]);
  writeJson(path.join(root, "data/collections.json"), [
    { id: "route-one", title: "Route one", description: "A valid listening route for testing.", showIds: [], showReasons: {}, updatedAt: "2026-08-16" },
    { id: "route-two", title: "Route two", description: "Another valid listening route for testing.", showIds: [], showReasons: {}, updatedAt: "2026-08-16" },
  ]);
  if (review) writeJson(path.join(root, "data/reviews/signal-show.json"), review);
  const candidate = {
    id: "candidate-1", status: "published", inputRevision: 1, factsReviewedAt: factualCurrent ? "2026-08-16" : null, factsReviewedRevision: factualCurrent ? 1 : null,
    scopeStatus: "in-scope", hasDuplicateMatch: false, conflicts: [], createdAt: "2026-08-01",
    sources: [{ sourceType: "rss", sourceUrl: "https://example.test/feed.xml", fetchStatus: "fetched" }],
  };
  const importService = { getPublishedCandidateForShow: (showId) => showId === "signal-show" ? candidate : null };
  return { root, service: createElevationService({ staticRoot: root, importService }), candidate };
}

test("elevation ranking is deterministic and explains its score without popularity", () => {
  const show = makeShow();
  const candidate = { scopeStatus: "in-scope", hasDuplicateMatch: false, conflicts: [], sources: [{ fetchStatus: "fetched" }], createdAt: "2026-08-01" };
  const entry = rankEntry(show, candidate, [], [], "indexed-only");
  assert.equal(entry.eligible, true);
  assert.ok(entry.factors.includes("Clear in-scope identity"));
  assert.equal(entry.factors.some((factor) => /popular/i.test(factor)), false);
});

test("saving an elevation review draft keeps Imported records out of the full-review tier", async () => {
  const { root, service } = setup();
  try {
    const detail = await service.saveReviewDraft("signal-show", {
      archiveRating: "8.5", archiveTake: "A disciplined, suspenseful sci-fi listen.", spoilerFreeReview: "The first paragraph.",
      tones: "Tense, Atmospheric", formats: "Serialized", bestFor: "Long walks",
      similarTo: ["neighbor-a", "neighbor-b", "neighbor-c"],
      similarReasons: { "neighbor-a": "Reason A", "neighbor-b": "Reason B", "neighbor-c": "Reason C" },
      collections: [{ id: "route-one", reason: "Reason one" }, { id: "route-two", reason: "Reason two" }],
    });
    assert.equal(detail.show.reviewStatus, "planned");
    const shows = JSON.parse(fs.readFileSync(path.join(root, "data/shows.json"), "utf8"));
    assert.equal(shows[0].reviewStatus, "planned");
    assert.ok(fs.existsSync(path.join(root, "data/reviews/signal-show.json")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("full-review publication promotes a complete fact-checked elevation draft", async () => {
  const { root, service } = setup();
  try {
    await service.saveReviewDraft("signal-show", {
      archiveRating: "8.5", archiveTake: "A disciplined, suspenseful sci-fi listen.", spoilerFreeReview: "The first paragraph.",
      tones: "Tense, Atmospheric", formats: "Serialized", bestFor: "Long walks",
      similarTo: ["neighbor-a", "neighbor-b", "neighbor-c"],
      similarReasons: { "neighbor-a": "Reason A", "neighbor-b": "Reason B", "neighbor-c": "Reason C" },
      collections: [{ id: "route-one", reason: "Reason one" }, { id: "route-two", reason: "Reason two" }],
    });
    const result = await service.publishReview("signal-show", "tester");
    assert.equal(result.reviewStatus, "full-review");
    const shows = JSON.parse(fs.readFileSync(path.join(root, "data/shows.json"), "utf8"));
    assert.equal(shows[0].reviewStatus, "full-review");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("full-review publication stays blocked until the factual review is current", async () => {
  const { root, service } = setup({ factualCurrent: false });
  try {
    await service.saveReviewDraft("signal-show", {
      archiveRating: "8.5", archiveTake: "A disciplined, suspenseful sci-fi listen.", spoilerFreeReview: "The first paragraph.",
      tones: "Tense, Atmospheric", formats: "Serialized", bestFor: "Long walks",
      similarTo: ["neighbor-a", "neighbor-b", "neighbor-c"],
      similarReasons: { "neighbor-a": "Reason A", "neighbor-b": "Reason B", "neighbor-c": "Reason C" },
      collections: [{ id: "route-one", reason: "Reason one" }, { id: "route-two", reason: "Reason two" }],
    });
    await assert.rejects(service.publishReview("signal-show", "tester"), /current factual review/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("published reviews are listed for editing and save changes in place", async () => {
  const { root, service } = setup({
    reviewStatus: "full-review",
    review: {
      archiveTake: "The original verdict.",
      spoilerFreeReview: ["The original review paragraph."],
      thoughts: ["The original thought."],
      quote: { text: "The original quote.", attribution: "Archive note" },
    },
  });
  try {
    const list = service.listForMaintainer("published");
    assert.deepEqual(list.items.map((item) => item.showId), ["signal-show"]);
    assert.equal(list.items[0].target, "published");

    const detail = await service.saveReviewDraft("signal-show", {
      archiveRating: "9",
      archiveTake: "The updated verdict.",
      spoilerFreeReview: "The updated review paragraph.",
      thoughts: "",
      quoteText: "",
      quoteAttribution: "",
      tones: "Tense",
      formats: "Serialized",
      bestFor: "Night listening",
      similarTo: ["neighbor-a", "neighbor-b", "neighbor-c"],
      similarReasons: {
        "neighbor-a": "A useful adjacent recommendation.",
        "neighbor-b": "A second useful adjacent recommendation.",
        "neighbor-c": "A third useful adjacent recommendation.",
      },
      collections: [
        { id: "route-one", reason: "Keep the updated show on route one." },
        { id: "route-two", reason: "Keep the updated show on route two." },
      ],
    });

    assert.equal(detail.show.reviewStatus, "full-review");
    assert.equal(detail.review.archiveTake, "The updated verdict.");
    assert.deepEqual(detail.review.spoilerFreeReview, ["The updated review paragraph."]);
    assert.deepEqual(detail.review.thoughts, []);
    assert.equal(detail.review.quote.text, "");
    const shows = JSON.parse(fs.readFileSync(path.join(root, "data/shows.json"), "utf8"));
    assert.equal(shows[0].ratings.archive, 9);
    assert.deepEqual(shows[0].similarTo, ["neighbor-a", "neighbor-b", "neighbor-c"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
