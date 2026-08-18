const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findAnchorShowsWithTooFewCollectionMemberships,
  findPublishedShowsMissingSimilarReasons,
  findPublishedShowsWithOutOfRangeSimilarLinks,
  findPublishedShowsWithTooFewCollectionMemberships,
  buildPhase2Readiness,
  getGateBCriticalValidationErrors,
} = require("../lib/discovery-gaps");

function createShowRecord(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    status: "published",
    reviewStatus: "indexed-only",
    tones: ["dark"],
    formats: ["full-cast"],
    bestFor: ["late-night"],
    similarTo: ["neighbor-a", "neighbor-b", "neighbor-c"],
    similarReasons: {
      "neighbor-a": "Reason A",
      "neighbor-b": "Reason B",
      "neighbor-c": "Reason C",
    },
    ...overrides,
  };
}

test("findPublishedShowsWithOutOfRangeSimilarLinks flags counts outside the new 3-to-5 range", () => {
  const results = findPublishedShowsWithOutOfRangeSimilarLinks([
    createShowRecord({ id: "too-few", similarTo: ["neighbor-a", "neighbor-b"] }),
    createShowRecord({ id: "valid", title: "Valid Show" }),
    createShowRecord({
      id: "too-many",
      similarTo: ["neighbor-a", "neighbor-b", "neighbor-c", "neighbor-d", "neighbor-e", "neighbor-f"],
    }),
  ]);

  assert.deepEqual(
    results.map((entry) => ({ id: entry.id, count: entry.count })),
    [
      { id: "too-few", count: 2 },
      { id: "too-many", count: 6 },
    ],
  );
});

test("findPublishedShowsMissingSimilarReasons flags every published show with incomplete reason coverage", () => {
  const results = findPublishedShowsMissingSimilarReasons([
    createShowRecord({
      id: "missing-reason-show",
      similarReasons: {
        "neighbor-a": "Reason A",
        "neighbor-c": "Reason C",
      },
    }),
    createShowRecord({ id: "complete-show" }),
  ]);

  assert.deepEqual(results, [
    {
      id: "missing-reason-show",
      title: "Demo Show",
      missingFor: ["neighbor-b"],
    },
  ]);
});

test("collection-membership checks enforce both the published-show and anchor minimums", () => {
  const catalog = [
    createShowRecord({ id: "midnight-burger", title: "Midnight Burger" }),
    createShowRecord({ id: "plain-show", title: "Plain Show" }),
    createShowRecord({ id: "well-covered-show", title: "Well Covered Show" }),
  ];
  const collections = [
    { id: "one", showIds: ["midnight-burger", "plain-show", "well-covered-show"] },
    { id: "two", showIds: ["well-covered-show"] },
  ];

  assert.deepEqual(findPublishedShowsWithTooFewCollectionMemberships(catalog, collections), [
    { id: "midnight-burger", title: "Midnight Burger", count: 1 },
    { id: "plain-show", title: "Plain Show", count: 1 },
  ]);
  assert.deepEqual(findAnchorShowsWithTooFewCollectionMemberships(catalog, collections), [
    { id: "midnight-burger", title: "Midnight Burger", count: 1, missing: false },
  ]);
});

test("getGateBCriticalValidationErrors aggregates the new similarity and collection rules", () => {
  const catalog = [
    createShowRecord({
      id: "midnight-burger",
      title: "Midnight Burger",
      reviewStatus: "full-review",
      similarTo: ["neighbor-a", "neighbor-b"],
      similarReasons: {
        "neighbor-a": "Reason A",
      },
    }),
  ];
  const collections = [
    {
      id: "shows-like-midnight-burger",
      title: "Shows like Midnight Burger",
      showIds: ["midnight-burger"],
      showReasons: {},
    },
  ];

  const errors = getGateBCriticalValidationErrors(catalog, collections);

  assert.ok(errors.some((message) => /3 to 5 similar links/.test(message)));
  assert.ok(errors.some((message) => /missing similarReasons/.test(message)));
  assert.ok(errors.some((message) => /at least 2 collections/.test(message)));
  assert.ok(errors.some((message) => /at least 3 collections/.test(message)));
  assert.ok(errors.some((message) => /missing showReasons/.test(message)));
});

test("Phase 2 readiness keeps sparse indexed-only discovery gaps informational", () => {
  const sparse = createShowRecord({
    id: "sparse-show",
    similarTo: [],
    similarReasons: {},
    tones: [],
    formats: [],
    bestFor: [],
  });
  const readiness = buildPhase2Readiness([sparse], [], {
    tagTaxonomy: { tags: Array.from({ length: 165 }, (_, index) => ({ label: `Tag ${index}`, status: "approved" })) },
  });

  assert.deepEqual(readiness.editorial.gaps, []);
  assert.deepEqual(readiness.sparseIndexedOnly, {
    count: 1,
    outOfRangeSimilarLinks: 1,
    fewerThanTwoCollections: 1,
    editorialViolations: [],
    informationalOnly: true,
  });
  assert.equal(readiness.blockingErrors.some((message) => /similar links|collection memberships/.test(message)), false);
});

test("taxonomy readiness warns when an approved term has not demonstrated reusable discovery value", () => {
  const readiness = buildPhase2Readiness([
    createShowRecord({ tags: ["Solo route"] }),
  ], [], {
    tagTaxonomy: { tags: [{ label: "Solo route", status: "approved" }] },
  });

  assert.deepEqual(readiness.taxonomy.singletonApprovedTags, [{ label: "Solo route", count: 1 }]);
  assert.match(readiness.taxonomy.warnings[0], /Solo route.*one published show/i);
});
