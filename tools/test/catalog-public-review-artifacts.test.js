const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { selectPublicReviewRecords, writeCatalogArtifacts } = require("../lib/catalog-artifacts");

test("only dated complete companions for published full reviews enter public review artifacts", () => {
  const catalog = [
    { id: "published", status: "published", reviewStatus: "full-review" },
    { id: "planned", status: "published", reviewStatus: "planned" },
    { id: "draft-show", status: "draft", reviewStatus: "full-review" },
    { id: "indexed", status: "published", reviewStatus: "indexed-only" },
  ];
  const completeReview = {
    archiveTake: "A published archive take.",
    publishedAt: "2026-10-04T15:45:51.148Z",
    spoilerFreeReview: ["A published spoiler-safe review."],
  };
  const reviewsById = {
    published: completeReview,
    planned: completeReview,
    "draft-show": completeReview,
    indexed: completeReview,
    "undated-full-review": {
      archiveTake: "A draft archive take.",
      spoilerFreeReview: ["A draft review."],
    },
    "incomplete-full-review": {
      archiveTake: "An incomplete archive take.",
      publishedAt: "2026-10-04T15:45:51.148Z",
      spoilerFreeReview: [],
    },
  };

  const publicReviews = selectPublicReviewRecords(catalog, reviewsById);

  assert.deepEqual(Object.keys(publicReviews), ["published"]);
  assert.strictEqual(publicReviews.published, completeReview);
  assert.equal(Object.hasOwn(reviewsById, "undated-full-review"), true, "source drafts remain available to maintainers");
});

test("catalog artifact generation removes private drafts from runtime review output without deleting source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-review-artifacts-"));
  const publicReview = {
    archiveTake: "Published take.",
    publishedAt: "2026-10-04T15:45:51.148Z",
    spoilerFreeReview: ["Published review paragraph."],
    thoughts: [],
    quote: { text: "", attribution: "" },
  };
  const draftReview = {
    archiveTake: "Private draft take.",
    spoilerFreeReview: ["Private draft paragraph."],
    thoughts: [],
    quote: { text: "", attribution: "" },
  };

  try {
    fs.mkdirSync(path.join(root, "catalog-src"), { recursive: true });
    fs.writeFileSync(path.join(root, "catalog-src", "entities.json"), "[]");
    fs.mkdirSync(path.join(root, "catalog-src", "reviews"), { recursive: true });
    fs.writeFileSync(path.join(root, "catalog-src", "reviews", "draft-show.json"), JSON.stringify(draftReview));
    fs.writeFileSync(path.join(root, "catalog-src", "reviews", "published-show.json"), JSON.stringify(publicReview));
    fs.mkdirSync(path.join(root, "data", "reviews"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "reviews", "draft-show.json"), JSON.stringify(draftReview));
    fs.writeFileSync(path.join(root, "data", "reviews", "published-show.json"), JSON.stringify(publicReview));

    const createShow = (id, reviewStatus, review) => ({
      id,
      status: "published",
      reviewStatus,
      archiveTake: review?.archiveTake || "",
      spoilerFreeReviewParagraphs: review?.spoilerFreeReview || [],
      thoughtsParagraphs: review?.thoughts || [],
      quote: review?.quote || { text: "", attribution: "" },
      creators: [],
    });
    const gapReport = {
      publishedShowsMissingSimilarReasons: [],
      publishedShowsWithOutOfRangeSimilarLinks: [],
      publishedShowsWithTooFewCollectionMemberships: [],
      anchorShowsWithTooFewCollectionMemberships: [],
      routeCollectionsMissingShowReasons: [],
    };
    const archiveContext = { entities: [], creators: [], networks: [], changelog: [] };

    const result = writeCatalogArtifacts(root, {
      catalog: [createShow("published-show", "full-review", publicReview), createShow("draft-show", "planned", null)],
      collections: [],
      reviewsById: { "published-show": publicReview, "draft-show": draftReview },
      gapReport,
      archiveContext,
      tagTaxonomy: {},
    });

    assert.equal(fs.existsSync(path.join(root, "data", "reviews", "published-show.json")), true);
    assert.equal(fs.existsSync(path.join(root, "data", "reviews", "draft-show.json")), false);
    assert.equal(fs.existsSync(path.join(root, "catalog-src", "reviews", "draft-show.json")), true);
    assert.equal(result.snapshot.metrics.reviewCompanions, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
