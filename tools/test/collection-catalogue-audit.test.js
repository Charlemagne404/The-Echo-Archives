const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCollectionCatalogueAudit,
  formatCollectionCatalogueAudit,
} = require("../lib/collection-catalogue-audit");

function show(id, overrides = {}) {
  return {
    id,
    title: id,
    status: "published",
    reviewStatus: "indexed-only",
    completionStatus: "ongoing",
    genres: ["mystery"],
    formats: ["serialized"],
    tones: ["dark"],
    tags: ["Investigation"],
    themes: ["mystery"],
    bestFor: ["late-night"],
    discovery: {
      voiceStyle: "primarily-acted",
      narrativeFocus: "plot-driven",
      intensity: "high",
      commitment: "long",
    },
    ...overrides,
  };
}

test("catalogue audit is deterministic and exposes the full collection inventory", () => {
  const shows = [show("one"), show("two", { genres: ["sci-fi"] })];
  const collections = [{
    id: "route",
    title: "Route",
    kind: "curated",
    intentTags: ["late-night"],
    showIds: ["one"],
    showReasons: { one: "Route member." },
  }];
  const first = buildCollectionCatalogueAudit({ shows, collections });
  const second = buildCollectionCatalogueAudit({ shows, collections });
  assert.deepEqual(first, second);
  assert.equal(first.scope.publishedShows, 2);
  assert.equal(first.scope.sourceCollections, 1);
  assert.equal(first.collections[0].id, "route");
  assert.equal(first.readOnly, true);
  assert.equal(first.showsLikeRankingChanged, false);
});

test("membership validation catches duplicate, unknown, cover, anchor, and rule-drift errors", () => {
  const shows = [
    show("one"),
    show("two"),
    show("three", { genres: ["horror"] }),
  ];
  const collections = [
    {
      id: "bad-curated",
      title: "Bad curated",
      kind: "curated",
      showIds: ["one", "one", "missing"],
      coverShowIds: ["missing"],
      showReasons: { one: "Only one reason." },
    },
    {
      id: "bad-similarity",
      title: "Bad similarity",
      kind: "similarity",
      anchorShowId: "one",
      showIds: ["one", "two"],
    },
    {
      id: "drifted-rule",
      title: "Horror route",
      kind: "rule-based",
      automation: {
        mode: "rule",
        criteria: {
          all: [{ field: "genres", operator: "includes", value: "horror" }],
          any: [],
          not: [],
        },
      },
      showIds: ["one"],
    },
  ];
  const report = buildCollectionCatalogueAudit({ shows, collections });
  const types = report.membershipQuality.errors.map((error) => error.type);
  assert.ok(types.includes("unknown-member"));
  assert.ok(types.includes("duplicate-member"));
  assert.ok(types.includes("unknown-cover"));
  assert.ok(types.includes("anchor-in-members"));
  assert.ok(types.includes("rule-membership-drift"));
  assert.equal(report.membershipQuality.valid, false);
  assert.ok(report.membershipQuality.warnings.some((warning) => warning.type === "missing-member-reason"));
});

test("audit flags sparse and broad collections and reports bounded missing opportunities", () => {
  const shows = [
    ...Array.from({ length: 12 }, (_, index) => show("mystery-" + index)),
    ...Array.from({ length: 52 }, (_, index) => show("horror-" + index, { genres: ["horror"] })),
  ];
  const collections = [
    {
      id: "small-route",
      title: "Small route",
      kind: "curated",
      intentTags: ["late-night"],
      showIds: ["mystery-0"],
      showReasons: { "mystery-0": "Member." },
    },
    {
      id: "large-route",
      title: "Large route",
      kind: "curated",
      intentTags: ["late-night"],
      showIds: shows.filter((entry) => entry.id.startsWith("horror-")).map((entry) => entry.id),
      showReasons: Object.fromEntries(shows.filter((entry) => entry.id.startsWith("horror-")).map((entry) => [entry.id, "Member."])),
    },
  ];
  const report = buildCollectionCatalogueAudit({ shows, collections });
  assert.ok(report.reviewQueues.sparse.some((row) => row.id === "small-route"));
  assert.ok(report.reviewQueues.broad.some((row) => row.id === "large-route"));
  assert.ok(report.opportunities.shortlist.some((candidate) => candidate.id === "status-genre-ongoing-mystery"));
});

test("formatted report includes catalogue inventory, coverage, and validation sections", () => {
  const report = buildCollectionCatalogueAudit({
    shows: [show("one"), show("two")],
    collections: [],
  });
  const formatted = formatCollectionCatalogueAudit(report);
  assert.match(formatted, /## Catalogue inventory/);
  assert.match(formatted, /## Facet coverage/);
  assert.match(formatted, /## Membership validation/);
});
