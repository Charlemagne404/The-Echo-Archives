const {
  DIMENSION_DEFINITIONS,
  PUBLIC_MATCH_POLICY,
  PUBLIC_SPECIFIC_DIMENSION_IDS,
  createSimilarityIndex,
} = require("../../shared/archive-similarity");

const IMPORTED_REVIEW_STATUS = "imported";
const PUBLIC_SPECIFIC_DIMENSION_SET = new Set(PUBLIC_SPECIFIC_DIMENSION_IDS);
const REPORT_VERSION = 1;
const CAUSE_DEFINITIONS = Object.freeze([
  { id: "imported-policy-limited", label: "Imported record requires reviewed enrichment" },
  { id: "insufficient-metadata", label: "Insufficient specific metadata" },
  { id: "public-gates-rejected", label: "Similarity candidates rejected by public gates" },
  { id: "catalogue-isolation", label: "Catalogue isolation or unusually niche metadata" },
  { id: "schema-or-reference-issue", label: "Schema or recommendation reference issue" },
  { id: "unclassified", label: "Unclassified recommendation gap" },
]);

function text(value) {
  return String(value || "").trim();
}

function meaningfulArray(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function percent(value, denominator) {
  return denominator > 0 ? Math.round((value / denominator) * 1000) / 10 : 0;
}

function isImported(show) {
  return text(show?.reviewStatus) === IMPORTED_REVIEW_STATUS;
}

function getLegacyRecommendationProfile(show, collectionMembershipCount) {
  const similarTo = meaningfulArray(show.similarTo);
  const similarReasons = show.similarReasons && typeof show.similarReasons === "object" && !Array.isArray(show.similarReasons)
    ? show.similarReasons
    : {};
  const distinctiveFacetCount = ["tags", "themes", "tones"]
    .filter((field) => meaningfulArray(show[field]).length > 0)
    .length;
  const signals = [
    {
      id: "similarShows",
      value: similarTo.length >= 2 ? 2 : similarTo.length === 1 ? 1 : 0,
      max: 2,
    },
    {
      id: "collectionRoutes",
      value: collectionMembershipCount > 0 ? 2 : 0,
      max: 2,
    },
    {
      id: "listenerIntent",
      value: meaningfulArray(show.bestFor).length > 0 ? 1 : 0,
      max: 1,
    },
    {
      id: "distinctiveFacets",
      value: distinctiveFacetCount >= 2 ? 1 : 0,
      max: 1,
    },
    {
      id: "reasonedLinks",
      value: similarTo.length > 0 && similarTo.every((id) => Boolean(text(similarReasons[id]))) ? 1 : 0,
      max: 1,
    },
  ];
  const score = signals.reduce((total, signal) => total + signal.value, 0);
  return {
    score,
    maxScore: 7,
    level: score === 0 ? "none" : score < 4 ? "thin" : "covered",
    signals,
  };
}

function getStructuralIssues(shows, collections) {
  const showIds = new Set(shows.map((show) => text(show.id)).filter(Boolean));
  const issuesByShow = new Map(shows.map((show) => [text(show.id), []]));
  const collectionIssues = [];
  const addShowIssue = (showId, issue) => {
    if (!issuesByShow.has(showId)) return;
    issuesByShow.get(showId).push(issue);
  };

  shows.forEach((show) => {
    const showId = text(show.id);
    meaningfulArray(show.similarTo).filter((targetId) => !showIds.has(targetId)).forEach((targetId) => {
      addShowIssue(showId, { type: "unknown-similarTo-target", targetId });
    });
    const similarTo = new Set(meaningfulArray(show.similarTo));
    const reasons = show.similarReasons && typeof show.similarReasons === "object" && !Array.isArray(show.similarReasons)
      ? Object.keys(show.similarReasons).map(text).filter(Boolean)
      : [];
    reasons.filter((targetId) => !similarTo.has(targetId)).forEach((targetId) => {
      addShowIssue(showId, { type: "orphaned-similarReason", targetId });
    });
  });

  collections.forEach((collection) => {
    const collectionId = text(collection.id) || "unknown-collection";
    const memberIds = meaningfulArray(collection.showIds);
    const unknownMemberIds = memberIds.filter((showId) => !showIds.has(showId));
    const anchorId = text(collection.anchorShowId);
    const issues = [];
    if (unknownMemberIds.length > 0) issues.push({ type: "unknown-collection-member", showIds: unknownMemberIds });
    if (collection.kind === "similarity") {
      if (!anchorId || !showIds.has(anchorId)) issues.push({ type: "unknown-similarity-anchor", anchorShowId: anchorId });
      if (anchorId && memberIds.includes(anchorId)) issues.push({ type: "similarity-anchor-in-members", anchorShowId: anchorId });
    }
    const reasonKeys = collection.showReasons && typeof collection.showReasons === "object" && !Array.isArray(collection.showReasons)
      ? Object.keys(collection.showReasons).map(text).filter(Boolean)
      : [];
    const memberSet = new Set(memberIds);
    const orphanedReasonIds = reasonKeys.filter((showId) => !memberSet.has(showId));
    if (orphanedReasonIds.length > 0) issues.push({ type: "orphaned-collection-reason", showIds: orphanedReasonIds });
    if (issues.length > 0) collectionIssues.push({ collectionId, issues });
  });

  return { issuesByShow, collectionIssues };
}

function getGapCause({ show, authoredCount, computedCount, diagnosticCandidateCount, metadataCoverage, availableSpecificDimensions, structuralIssues }) {
  if (structuralIssues.length > 0) {
    return {
      id: "schema-or-reference-issue",
      label: "Schema or recommendation reference issue",
      detail: "A recommendation or route reference is malformed or points outside the published catalogue.",
    };
  }

  if (diagnosticCandidateCount === 0) {
    return {
      id: "catalogue-isolation",
      label: "Catalogue isolation or unusually niche metadata",
      detail: "No non-authored candidate met even the broad diagnostic similarity gate.",
    };
  }

  if (isImported(show)) {
    return {
      id: "imported-policy-limited",
      label: "Imported record requires reviewed enrichment",
      detail: "Broad factual candidates exist, but the imported record lacks the reviewed specific evidence required for a public recommendation.",
    };
  }

  if (availableSpecificDimensions.length < PUBLIC_MATCH_POLICY.minimumSpecificDimensions
    || metadataCoverage < PUBLIC_MATCH_POLICY.sparseMinimumMetadataCoverage) {
    return {
      id: "insufficient-metadata",
      label: "Insufficient specific metadata",
      detail: "Candidates exist, but this record does not expose enough specific, comparable metadata for the public gate.",
    };
  }

  if (authoredCount === 0 && computedCount === 0) {
    return {
      id: "public-gates-rejected",
      label: "Similarity candidates rejected by public gates",
      detail: "Diagnostic candidates exist, but none satisfy the public score, coverage, anchor, specificity, and distinctiveness checks together.",
    };
  }

  return {
    id: "unclassified",
    label: "Unclassified recommendation gap",
    detail: "The record needs a closer review of its recommendation evidence.",
  };
}

function buildMetadataLeverage(records) {
  const gapRecords = records.filter((record) => record.level !== "covered");
  const importedGapRecords = gapRecords.filter((record) => record.reviewStatus === IMPORTED_REVIEW_STATUS);
  const targetRecords = importedGapRecords.length > 0 ? importedGapRecords : gapRecords;
  const denominator = targetRecords.length;
  const profilesById = new Map(targetRecords.map((record) => [record.id, record.metadataProfile]));

  return DIMENSION_DEFINITIONS
    .filter((definition) => definition.coverageEligible)
    .map((definition) => {
      const missingCount = targetRecords.filter((record) => (
        profilesById.get(record.id)?.metadataMissingDimensions?.includes(definition.id)
      )).length;
      const role = PUBLIC_SPECIFIC_DIMENSION_SET.has(definition.id)
        ? "specific-public-evidence"
        : definition.anchor ? "factual-anchor" : "supporting-evidence";
      return {
        id: definition.id,
        label: definition.label,
        weight: definition.weight,
        role,
        missingCount,
        denominator,
        missingPercentage: percent(missingCount, denominator),
        availableCount: denominator - missingCount,
        priorityScore: (missingCount * definition.weight) + (PUBLIC_SPECIFIC_DIMENSION_SET.has(definition.id) ? denominator : 0),
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore || left.id.localeCompare(right.id, "en"));
}

function buildRecommendationCoverageReport({ shows = [], collections = [], legacyCollections = collections } = {}) {
  const index = createSimilarityIndex({ shows, collections });
  const publishedShows = index.shows;
  const structural = getStructuralIssues(publishedShows, collections);
  const legacyMembershipCounts = new Map(publishedShows.map((show) => [show.id, 0]));
  const runtimeMembershipsByShow = new Map(publishedShows.map((show) => [show.id, []]));
  legacyCollections.forEach((collection) => {
    meaningfulArray(collection.showIds).forEach((showId) => {
      if (legacyMembershipCounts.has(showId)) legacyMembershipCounts.set(showId, legacyMembershipCounts.get(showId) + 1);
    });
  });
  collections.forEach((collection) => {
    meaningfulArray(collection.showIds).forEach((showId) => {
      if (runtimeMembershipsByShow.has(showId)) runtimeMembershipsByShow.get(showId).push(collection);
    });
  });

  const records = publishedShows.map((show) => {
    const coverage = index.getRecommendationCoverage(show.id);
    const metadataProfile = index.getMetadataProfile(show.id);
    const runtimeMemberships = runtimeMembershipsByShow.get(show.id) || [];
    const similarityMemberships = runtimeMemberships.filter((collection) => collection.kind === "similarity");
    const genericMemberships = runtimeMemberships.filter((collection) => collection.kind !== "similarity");
    const diagnosticCandidates = index.getSimilarShows(show.id, { limit: publishedShows.length })
      .filter((entry) => entry.similarity?.curatedEvidence !== true);
    const availableSpecificDimensions = (metadataProfile.metadataAvailableDimensions || [])
      .filter((id) => PUBLIC_SPECIFIC_DIMENSION_SET.has(id));
    const structuralIssues = structural.issuesByShow.get(show.id) || [];
    const legacy = getLegacyRecommendationProfile(show, legacyMembershipCounts.get(show.id) || 0);
    const level = coverage.authoredCount > 0 || coverage.computedCount > 0
      ? "covered"
      : runtimeMemberships.length > 0
        ? "thin"
        : "none";
    const cause = level === "covered"
      ? null
      : getGapCause({
        show,
        authoredCount: coverage.authoredCount,
        computedCount: coverage.computedCount,
        diagnosticCandidateCount: diagnosticCandidates.length,
        metadataCoverage: metadataProfile.metadataCoverage,
        availableSpecificDimensions,
        structuralIssues,
      });

    return {
      id: show.id,
      title: text(show.title) || show.id,
      reviewStatus: text(show.reviewStatus) || "unknown",
      level,
      legacyLevel: legacy.level,
      legacyScore: legacy.score,
      legacySignals: legacy.signals,
      authoredCount: coverage.authoredCount,
      computedCount: coverage.computedCount,
      computedOnly: coverage.authoredCount === 0 && coverage.computedCount > 0,
      collectionMembershipCount: runtimeMemberships.length,
      genericCollectionMembershipCount: genericMemberships.length,
      similarityRouteCount: coverage.similarityRouteCount,
      showsLikeRouteMemberCount: similarityMemberships.length,
      diagnosticCandidateCount: diagnosticCandidates.length,
      metadataCoverage: metadataProfile.metadataCoverage,
      metadataMissingDimensions: metadataProfile.metadataMissingDimensions,
      availableSpecificDimensions,
      structuralIssues,
      causeId: cause?.id || null,
      causeLabel: cause?.label || null,
      causeDetail: cause?.detail || null,
      metadataProfile,
    };
  });

  const countLevels = (field) => Object.fromEntries(["none", "thin", "covered"].map((level) => [
    level,
    records.filter((record) => record[field] === level).length,
  ]));
  const gapRecords = records.filter((record) => record.level !== "covered");
  const causeGroups = new Map();
  gapRecords.forEach((record) => {
    if (!record.causeId) return;
    const group = causeGroups.get(record.causeId) || {
      id: record.causeId,
      label: record.causeLabel,
      count: 0,
      percentageOfGaps: 0,
      levelCounts: { none: 0, thin: 0, covered: 0 },
      affectedIds: [],
      examples: [],
    };
    group.count += 1;
    group.levelCounts[record.level] = (group.levelCounts[record.level] || 0) + 1;
    group.affectedIds.push(record.id);
    if (group.examples.length < 5) group.examples.push({ id: record.id, title: record.title, detail: record.causeDetail });
    causeGroups.set(record.causeId, group);
  });
  const causeSummary = CAUSE_DEFINITIONS.map((definition) => {
    const group = causeGroups.get(definition.id) || {
      id: definition.id,
      label: definition.label,
      count: 0,
      affectedIds: [],
      examples: [],
      levelCounts: { none: 0, thin: 0, covered: 0 },
    };
    return {
      ...group,
      percentageOfGaps: percent(group.count, gapRecords.length),
      affectedIds: group.affectedIds.sort((left, right) => left.localeCompare(right, "en")),
    };
  });

  const authoredSources = records.filter((record) => record.authoredCount > 0);
  const computedSources = records.filter((record) => record.computedCount > 0);
  const showsLikeAnchors = records.filter((record) => record.similarityRouteCount > 0);
  const generatedRouteCount = collections.filter((collection) => text(collection.generatedFrom) === "authored-similarTo").length;
  const legacyLevelCounts = countLevels("legacyLevel");
  const surfaceLevelCounts = countLevels("level");

  return {
    version: REPORT_VERSION,
    readOnly: true,
    method: {
      coverage: "covered = at least one authored Try Next relationship or public computed Try Next match; thin = no direct match but at least one published collection discovery route; none = no recommendation route",
      authored: "Outgoing and incoming similarTo links plus authored similarity-collection routes, kept separate from computed evidence.",
      computed: "The same public getPublicSimilarityMatches adapter used by Try Next, including its score, metadata coverage, anchor, specific-dimension, and distinctiveness gates.",
      showsLike: "Dedicated similarity collections are reported separately; generated routes are included in runtime collections but do not change their minimum-member or authored-reason policy.",
      legacyProxy: "The previous seven-point metadata-quality proxy: similarTo count, any collection membership, bestFor, distinctive facets, and reasoned links.",
    },
    scope: {
      publishedShows: publishedShows.length,
      importedShows: records.filter((record) => record.reviewStatus === IMPORTED_REVIEW_STATUS).length,
      enrichmentEligibleShows: records.filter((record) => record.reviewStatus !== IMPORTED_REVIEW_STATUS).length,
      sourceCollections: legacyCollections.length,
      runtimeCollections: collections.length,
    },
    beforeAfter: {
      legacyProxy: {
        levelCounts: legacyLevelCounts,
        coveredPercentage: percent(legacyLevelCounts.covered, records.length),
      },
      surfaceAware: {
        levelCounts: surfaceLevelCounts,
        coveredPercentage: percent(surfaceLevelCounts.covered, records.length),
      },
    },
    coverage: {
      levelCounts: surfaceLevelCounts,
      coveredPercentage: percent(surfaceLevelCounts.covered, records.length),
      authoredSources: authoredSources.length,
      computedSources: computedSources.length,
      computedOnlySources: records.filter((record) => record.computedOnly).length,
      showsLikeAnchors: showsLikeAnchors.length,
      similarityRouteCount: collections.filter((collection) => collection.kind === "similarity").length,
      generatedSimilarityRouteCount: generatedRouteCount,
      genericCollectionOnlySources: records.filter((record) => record.level === "thin").length,
      diagnosticCandidateSources: records.filter((record) => record.diagnosticCandidateCount > 0).length,
      diagnosticCandidateFreeSources: records.filter((record) => record.diagnosticCandidateCount === 0).length,
    },
    blockers: causeSummary,
    metadataLeverage: buildMetadataLeverage(records),
    structuralIssues: {
      showCount: records.filter((record) => record.structuralIssues.length > 0).length,
      collectionCount: structural.collectionIssues.length,
      collections: structural.collectionIssues,
    },
    records,
  };
}

module.exports = {
  buildRecommendationCoverageReport,
  getLegacyRecommendationProfile,
  getStructuralIssues,
  REPORT_VERSION,
};
