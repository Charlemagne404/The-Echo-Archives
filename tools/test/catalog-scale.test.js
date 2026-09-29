const assert = require("node:assert/strict");
const test = require("node:test");

const { createScaleDataset } = require("../lib/catalog-scale-fixtures");
const { percentile } = require("../benchmark-catalog-scale");
const { createSimilarityIndex } = require("../../shared/archive-similarity");
const archiveSearch = require("../../shared/archive-search");

test("scale benchmark percentiles use the nearest-rank estimator", () => {
  assert.equal(percentile([5, 1, 4, 2, 3], 0.95), 5);
  assert.equal(percentile([5, 1, 4, 2, 3], 0.5), 3);
  assert.equal(percentile([], 0.95), 0);
});

function expectedSimilarShows(index, sourceId, options = {}) {
  const minimumScore = Number(options.minimumScore ?? 8);
  const minimumMetadataDimensions = Number(options.minimumMetadataDimensions ?? 2);
  const minimumAnchorDimensions = Number(options.minimumAnchorDimensions ?? 1);
  const limit = Number(options.limit ?? 8);
  const source = index.shows.find((show) => show.id === sourceId);

  return index.shows
    .filter((candidate) => candidate.id !== sourceId)
    .map((show) => ({ show, similarity: index.compare(source, show) }))
    .filter(({ similarity }) => {
      const anchorCount = similarity.dimensions.filter((dimension) => dimension.anchor && dimension.matched).length;
      return similarity.curatedEvidence || (
        similarity.score >= minimumScore
        && similarity.metadataMatches.length >= minimumMetadataDimensions
        && anchorCount >= minimumAnchorDimensions
      );
    })
    .sort((left, right) => {
      const scoreDifference = right.similarity.score - left.similarity.score;
      if (scoreDifference !== 0) return scoreDifference;
      const coverageDifference = right.similarity.metadataCoverage - left.similarity.metadataCoverage;
      if (coverageDifference !== 0) return coverageDifference;
      return String(left.show.title || left.show.id).localeCompare(String(right.show.title || right.show.id), "en")
        || left.show.id.localeCompare(right.show.id, "en");
    })
    .slice(0, limit);
}

test("scale fixtures are deterministic, synthetic, and do not mutate the authored catalogue", () => {
  const first = createScaleDataset(45);
  const second = createScaleDataset(45);

  assert.equal(first.shows.length, 45);
  assert.equal(first.cohortCount, 3);
  assert.deepEqual(first.shows.map((show) => show.id), second.shows.map((show) => show.id));
  assert.ok(first.shows.every((show) => show.id.startsWith("synthetic-show-")));
  assert.ok(first.collections.every((collection) => collection.id.startsWith("synthetic-cohort-")));
  assert.ok(first.entities.every((entity) => entity.id.startsWith("synthetic-creator-")));
});

test("indexed similarity candidates preserve exhaustive ranking and evidence gates", () => {
  const dataset = createScaleDataset(60);
  dataset.shows.forEach((show, index) => {
    show.length = {
      avgEpisodeMinutes: [18, 28, 42, 75][index % 4],
      episodes: 6 + ((index * 7) % 35),
      seasons: 1 + (index % 5),
    };
    show.completionStatus = ["finished", "ongoing", "cancelled"][index % 3];
    show.releaseStatus = ["completed", "active", "hiatus"][index % 3];
  });
  const collections = [
    ...dataset.collections,
    {
      id: "synthetic-similarity-route",
      title: "Synthetic similarity route",
      kind: "similarity",
      anchorShowId: dataset.shows[0].id,
      showIds: [dataset.shows[1].id, dataset.shows[2].id],
      showReasons: {
        [dataset.shows[1].id]: "A synthetic editorial reason for deterministic scale coverage.",
        [dataset.shows[2].id]: "A second synthetic editorial reason for deterministic scale coverage.",
      },
    },
  ];
  const indexed = createSimilarityIndex({ shows: dataset.shows, collections });
  const options = {
    limit: 12,
    minimumScore: 8,
    minimumMetadataDimensions: 2,
    minimumAnchorDimensions: 1,
  };

  for (const show of dataset.shows) {
    const actual = indexed.getSimilarShows(show.id, options);
    const expected = expectedSimilarShows(indexed, show.id, options);
    assert.deepEqual(
      actual.map(({ show: match, similarity }) => [match.id, similarity.score, similarity.metadataMatches]),
      expected.map(({ show: match, similarity }) => [match.id, similarity.score, similarity.metadataMatches]),
      "indexed candidates changed similarity results for " + show.id,
    );
  }
});

test("public recommendation filtering produces the same results with exhaustive candidates", () => {
  const dataset = createScaleDataset(40);
  const indexed = createSimilarityIndex({ shows: dataset.shows, collections: dataset.collections });
  const exhaustive = createSimilarityIndex({ shows: dataset.shows, collections: dataset.collections });

  for (const show of dataset.shows) {
    const allCandidates = exhaustive.getSimilarShows(show.id, {
      limit: dataset.shows.length,
      minimumScore: 0,
      minimumMetadataDimensions: 0,
      minimumAnchorDimensions: 0,
    });
    const expected = exhaustive.getPublicSimilarityMatches(show.id, { precomputedCandidates: allCandidates });
    const actual = indexed.getPublicSimilarityMatches(show.id);
    assert.deepEqual(actual, expected, "public recommendation evidence changed for " + show.id);
  }
});

test("indexed catalogue search preserves exhaustive results across title, facet, text, and fuzzy queries", () => {
  const dataset = createScaleDataset(120);
  dataset.shows.slice(0, 20).forEach((show) => {
    show.genres = ["sci-fi"];
  });
  archiveSearch.hydrateCatalogSearch(dataset.shows);

  for (const query of [
    "Synthetic Signal 00000",
    "Synthetic Creator 00000",
    "sci-fi",
    "listening cohort 00002",
    "Synthetik Signl 00000",
    "synthetic",
    "a",
  ]) {
    const indexed = archiveSearch.scoreCatalog(dataset.shows, query);
    const exhaustive = archiveSearch.scoreCatalog(dataset.shows, query, { exhaustiveCandidates: true });
    assert.deepEqual(indexed, exhaustive, "indexed search changed results for " + query);
  }
});
