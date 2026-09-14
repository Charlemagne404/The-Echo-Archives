const path = require("node:path");

const { loadEntities } = require("../backend/lib/entities");
const { resolveShowEntities } = require("../shared/archive-entities");
const { normalizeCollectionRecord, normalizeShowRecord } = require("../shared/archive-record");
const { createSimilarityIndex, DIMENSION_DEFINITIONS, MATCH_POLICY } = require("../shared/archive-similarity");
const { readCatalogSource } = require("./lib/catalog-source");

const DEFAULT_EXAMPLES = ["derelict", "midnight-burger", "the-white-vault"];
const DEFAULT_CANDIDATE_THRESHOLDS = Object.freeze([1, 3, 5, 8]);
const RICHNESS_BANDS = Object.freeze([
  { id: "sparse", label: "Sparse", minimum: 0, maximum: 0.35 },
  { id: "medium", label: "Medium", minimum: 0.35, maximum: 0.65 },
  { id: "enriched", label: "Enriched", minimum: 0.65, maximum: 1.01 },
]);
const SCORE_BUCKETS = Object.freeze([
  { id: "0-9", label: "0–9", minimum: 0, maximum: 10 },
  { id: "10-19", label: "10–19", minimum: 10, maximum: 20 },
  { id: "20-29", label: "20–29", minimum: 20, maximum: 30 },
  { id: "30-39", label: "30–39", minimum: 30, maximum: 40 },
  { id: "40-49", label: "40–49", minimum: 40, maximum: 50 },
  { id: "50-59", label: "50–59", minimum: 50, maximum: 60 },
  { id: "60-100", label: "60–100", minimum: 60, maximum: Number.POSITIVE_INFINITY },
]);

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function getArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : "";
}

function formatReasons(similarity, limit = 3) {
  return similarity.reasons
    .slice(0, limit)
    .map((reason) => reason.text)
    .join("; ");
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2, 2);
}

function getCandidateThresholds(value) {
  if (!value) return [...DEFAULT_CANDIDATE_THRESHOLDS];
  const thresholds = String(value)
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
  return thresholds.length > 0 ? [...new Set(thresholds)].sort((left, right) => left - right) : [...DEFAULT_CANDIDATE_THRESHOLDS];
}

function buildScoreDistribution(scores) {
  const numericScores = scores.filter(Number.isFinite).sort((left, right) => left - right);
  return {
    count: numericScores.length,
    minimum: numericScores.length ? numericScores[0] : null,
    maximum: numericScores.length ? numericScores[numericScores.length - 1] : null,
    average: numericScores.length ? round(numericScores.reduce((total, score) => total + score, 0) / numericScores.length, 2) : null,
    median: median(numericScores),
    buckets: SCORE_BUCKETS.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      count: numericScores.filter((score) => score >= bucket.minimum && score < bucket.maximum).length,
    })),
  };
}

function buildSimilarityReport({ shows = [], collections = [] }, options = {}) {
  const index = createSimilarityIndex({ shows, collections });
  const publishedShows = index.shows;
  const candidateLimit = Math.max(1, publishedShows.length);
  const candidateOptions = {
    limit: candidateLimit,
    ...(options.minimumScore !== undefined ? { minimumScore: options.minimumScore } : {}),
    ...(options.minimumMetadataDimensions !== undefined ? { minimumMetadataDimensions: options.minimumMetadataDimensions } : {}),
    ...(options.minimumAnchorDimensions !== undefined ? { minimumAnchorDimensions: options.minimumAnchorDimensions } : {}),
  };
  const candidatesByShow = new Map(publishedShows.map((show) => [
    show.id,
    index.getSimilarShows(show.id, candidateOptions),
  ]));
  const directionalResults = [...candidatesByShow.values()].flat();
  const candidateCounts = [...candidatesByShow.values()].map((candidates) => candidates.length);
  const thresholds = options.candidateThresholds || DEFAULT_CANDIDATE_THRESHOLDS;
  const metadataProfiles = new Map(publishedShows.map((show) => [show.id, index.getMetadataProfile(show.id)]));
  const signalDefinitions = DIMENSION_DEFINITIONS.filter((definition) => definition.coverageEligible);
  const signalCoverage = signalDefinitions.map((definition) => {
    const count = publishedShows.filter((show) => metadataProfiles.get(show.id)?.metadataCoverageByDimension
      ?.some((entry) => entry.id === definition.id && entry.available)).length;
    return {
      id: definition.id,
      label: definition.label,
      count,
      denominator: publishedShows.length,
      percentage: publishedShows.length ? round((count / publishedShows.length) * 100, 1) : 0,
      coverageGroup: definition.coverageGroup || "factual",
    };
  });
  const rated = publishedShows.filter((show) => Object.keys(show.ratings || {}).length > 0).length;
  const reasonGroups = new Map();
  const reasonTexts = new Map();
  directionalResults.forEach(({ similarity }) => {
    similarity.reasons
      .filter((reason) => reason.contribution > 0)
      .forEach((reason) => {
        const group = reasonGroups.get(reason.dimension) || {
          dimension: reason.dimension,
          label: reason.label,
          count: 0,
          examples: new Map(),
        };
        group.count += 1;
        group.examples.set(reason.text, (group.examples.get(reason.text) || 0) + 1);
        reasonGroups.set(reason.dimension, group);
        const text = reasonTexts.get(reason.text) || { text: reason.text, dimension: reason.dimension, count: 0 };
        text.count += 1;
        reasonTexts.set(reason.text, text);
      });
  });
  const commonReasons = [...reasonGroups.values()]
    .map((group) => ({
      dimension: group.dimension,
      label: group.label,
      count: group.count,
      examples: [...group.examples.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))
        .slice(0, 3)
        .map(([text, count]) => ({ text, count })),
    }))
    .sort((left, right) => right.count - left.count || left.dimension.localeCompare(right.dimension, "en"));
  const commonReasonTexts = [...reasonTexts.values()]
    .sort((left, right) => right.count - left.count || left.text.localeCompare(right.text, "en"))
    .slice(0, 12);
  const sparseVsEnriched = RICHNESS_BANDS.map((band) => {
    const bandShows = publishedShows.filter((show) => {
      const coverage = metadataProfiles.get(show.id)?.metadataCoverage || 0;
      return coverage >= band.minimum && coverage < band.maximum;
    });
    const bandResults = bandShows.flatMap((show) => candidatesByShow.get(show.id) || []);
    const scores = bandResults.map(({ similarity }) => similarity.score);
    const coverage = bandResults.map(({ similarity }) => similarity.metadataCoverage);
    return {
      id: band.id,
      label: band.label,
      metadataCoverageRange: `${Math.round(band.minimum * 100)}–${Math.min(100, Math.round(band.maximum * 100))}%`,
      showCount: bandShows.length,
      showsWithAtLeastOneCandidate: bandShows.filter((show) => (candidatesByShow.get(show.id) || []).length > 0).length,
      candidateCount: bandResults.length,
      averageCandidatesPerShow: bandShows.length ? round(bandResults.length / bandShows.length, 2) : 0,
      averageCandidateScore: scores.length ? round(scores.reduce((total, score) => total + score, 0) / scores.length, 2) : null,
      medianCandidateScore: median(scores),
      averagePairwiseMetadataCoverage: coverage.length ? round(coverage.reduce((total, value) => total + value, 0) / coverage.length, 3) : null,
    };
  });

  return {
    publishedShows: publishedShows.length,
    manualLinks: publishedShows.reduce((total, show) => total + (Array.isArray(show.similarTo) ? show.similarTo.length : 0), 0),
    manualReasons: publishedShows.reduce((total, show) => total + Object.keys(show.similarReasons || {}).length, 0),
    similarityCollections: collections.filter((collection) => collection.kind === "similarity").length,
    typedEntityShows: publishedShows.filter((show) => Array.isArray(show.entityLinks) && show.entityLinks.length > 0).length,
    signalCoverage,
    ratingCoverage: {
      count: rated,
      denominator: publishedShows.length,
      percentage: publishedShows.length ? round((rated / publishedShows.length) * 100, 1) : 0,
    },
    candidatePolicy: MATCH_POLICY,
    candidateCoverage: {
      thresholds: thresholds.map((threshold) => ({
        minimum: threshold,
        shows: candidateCounts.filter((count) => count >= threshold).length,
        denominator: publishedShows.length,
        percentage: publishedShows.length ? round((candidateCounts.filter((count) => count >= threshold).length / publishedShows.length) * 100, 1) : 0,
      })),
      countStats: {
        minimum: candidateCounts.length ? Math.min(...candidateCounts) : 0,
        median: median(candidateCounts),
        maximum: candidateCounts.length ? Math.max(...candidateCounts) : 0,
        average: candidateCounts.length ? round(candidateCounts.reduce((total, count) => total + count, 0) / candidateCounts.length, 2) : 0,
      },
    },
    scoreDistribution: buildScoreDistribution(directionalResults.map(({ similarity }) => similarity.score)),
    commonReasons,
    commonReasonTexts,
    sparseVsEnriched,
    candidatesByShow,
    index,
  };
}

function loadSimilarityData(siteRoot) {
  const sourceData = readCatalogSource(siteRoot);
  const sourceShows = sourceData.shows.filter((show) => show && show.status === "published");
  const entities = loadEntities(siteRoot, sourceData.shows);
  const shows = sourceShows.map((record) => {
    const show = normalizeShowRecord(record);
    const resolvedEntities = resolveShowEntities(show, entities);
    return resolvedEntities.length ? { ...show, resolvedEntities } : show;
  });
  const collections = sourceData.collections.map(normalizeCollectionRecord);

  return { shows, collections };
}

function printReport(data, selectedShowId, limit, options = {}) {
  const report = buildSimilarityReport(data, options);
  const { index } = report;

  console.log("Similarity foundation report");
  console.log(`Published shows: ${report.publishedShows}`);
  console.log(`Curated similar links: ${report.manualLinks} links / ${report.manualReasons} written reasons`);
  console.log(`Similarity collections: ${report.similarityCollections} routes`);
  console.log(`Shows with typed entity links: ${report.typedEntityShows}`);
  console.log("");
  console.log("Signal coverage:");
  report.signalCoverage.forEach((signal) => {
    console.log(`- ${signal.id}: ${signal.count}/${signal.denominator} (${signal.percentage}%; ${signal.coverageGroup})`);
  });
  console.log(`- ratingProfile: ${report.ratingCoverage.count}/${report.ratingCoverage.denominator} (${report.ratingCoverage.percentage}%; evidence-only)`);
  console.log("");
  console.log("Candidate coverage:");
  console.log(`- gate: score >= ${report.candidatePolicy.minimumScore} (sparse records >= ${report.candidatePolicy.sparseMinimumScore} below ${Math.round(report.candidatePolicy.sparseCoverageThreshold * 100)}% record coverage), at least ${report.candidatePolicy.minimumMetadataDimensions} dimensions and ${report.candidatePolicy.minimumAnchorDimensions} factual anchor`);
  report.candidateCoverage.thresholds.forEach((entry) => {
    console.log(`- at least ${entry.minimum}: ${entry.shows}/${entry.denominator} shows (${entry.percentage}%)`);
  });
  console.log(`- candidates per show: ${report.candidateCoverage.countStats.minimum} min / ${report.candidateCoverage.countStats.median} median / ${report.candidateCoverage.countStats.maximum} max / ${report.candidateCoverage.countStats.average} average`);
  console.log("");
  console.log("Score distribution:");
  const distribution = report.scoreDistribution;
  console.log(`- ${distribution.count} returned candidate results; ${distribution.minimum ?? "n/a"}–${distribution.maximum ?? "n/a"} score range; ${distribution.average ?? "n/a"} average; ${distribution.median ?? "n/a"} median`);
  distribution.buckets.filter((bucket) => bucket.count > 0).forEach((bucket) => console.log(`- ${bucket.label}: ${bucket.count}`));
  console.log("");
  console.log("Common scored reasons:");
  report.commonReasons.slice(0, 8).forEach((reason) => {
    const examples = reason.examples.map((example) => example.text).join(" | ");
    console.log(`- ${reason.label} (${reason.dimension}): ${reason.count}${examples ? ` — ${examples}` : ""}`);
  });
  console.log("");
  console.log("Sparse vs enriched records:");
  report.sparseVsEnriched.forEach((band) => {
    console.log(`- ${band.label}: ${band.showCount} shows; ${band.showsWithAtLeastOneCandidate} with candidates; ${band.averageCandidatesPerShow} candidates/show; average/median candidate score ${band.averageCandidateScore ?? "n/a"}/${band.medianCandidateScore ?? "n/a"}; average pair coverage ${band.averagePairwiseMetadataCoverage === null ? "n/a" : `${Math.round(band.averagePairwiseMetadataCoverage * 100)}%`}`);
  });
  console.log("");

  const ids = selectedShowId ? [selectedShowId] : DEFAULT_EXAMPLES;
  ids.forEach((showId) => {
    const show = index.shows.find((candidate) => candidate.id === showId);
    if (!show) {
      console.log(`No published show found for ${showId}.`);
      return;
    }

    console.log(`Shows like ${show.title} (${show.id}):`);
    const candidates = index.getSimilarShows(show.id, { limit });
    if (candidates.length === 0) {
      console.log("- No candidates met the conservative evidence threshold.");
      return;
    }
    candidates.forEach(({ show: candidate, similarity }) => {
      console.log(`- ${candidate.title} [${candidate.id}] — ${similarity.score}/${similarity.maxScore}; metadata coverage ${Math.round(similarity.metadataCoverage * 100)}% (${similarity.metadataAvailableWeight}/${similarity.metadataDenominatorWeight} weighted points; source ${Math.round(similarity.sourceMetadataCoverage * 100)}%, target ${Math.round(similarity.targetMetadataCoverage * 100)}%); ${formatReasons(similarity)}`);
    });
  });

  return report;
}

function main() {
  const siteRoot = resolveSiteRoot();
  const data = loadSimilarityData(siteRoot);
  const limit = Math.max(1, Number(getArg("limit")) || 5);
  printReport(data, getArg("show"), limit, { candidateThresholds: getCandidateThresholds(getArg("candidate-thresholds")) });
}

if (require.main === module) {
  main();
}

module.exports = {
  loadSimilarityData,
  buildSimilarityReport,
  printReport,
  resolveSiteRoot,
  DEFAULT_CANDIDATE_THRESHOLDS,
  RICHNESS_BANDS,
  SCORE_BUCKETS,
};
