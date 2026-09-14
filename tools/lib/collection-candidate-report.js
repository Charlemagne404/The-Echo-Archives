const {
  buildMetricContext,
  getPublishedShows,
  RICHNESS_DIMENSIONS,
} = require("./discovery-quality-report");
const { ruleMatches } = require("../../backend/lib/services/collection-service");
const {
  createSimilarityIndex,
  displayValue,
  MATCH_POLICY,
  normalizeValue,
} = require("../../shared/archive-similarity");
const {
  normalizeCollectionRecord,
  normalizeShowRecord,
} = require("../../shared/archive-record");

const CURATED_COLLECTION_KINDS = new Set(["curated", "editorial", "similarity"]);
const DEFAULT_CANDIDATE_LIMIT = 8;
const DEFAULT_HIGHLIGHT_LIMIT = 30;
const DEFAULT_POOR_AREA_LIMIT = 30;
const DEFAULT_NEAR_DUPLICATE_LIMIT = 20;
const EVIDENCE_DISPLAY_LIMITS = Object.freeze({ strong: 5, supporting: 8, weak: 4 });
const DEFAULT_LOW_MEMBERSHIP_QUANTILE = 0.25;
const DEFAULT_POOR_AREA_COVERAGE = 50;
const DEFAULT_MIN_AREA_SHOWS = 3;
const SIMILARITY_MINIMUM_SCORE = Number(MATCH_POLICY?.minimumScore) || 12;
const SIMILARITY_MINIMUM_DIMENSIONS = Number(MATCH_POLICY?.minimumMetadataDimensions) || 2;
const SIMILARITY_MINIMUM_ANCHOR_DIMENSIONS = Number(MATCH_POLICY?.minimumAnchorDimensions) || 0;
const COLLECTION_RELEVANT_SIMILARITY_DIMENSIONS = new Set([
  "entity",
  "format",
  "tone",
  "theme",
  "tag",
  "bestFor",
  "voiceStyle",
  "narrativeFocus",
  "intensity",
  "commitment",
]);
const COLLECTION_SPECIFIC_SIMILARITY_DIMENSIONS = new Set(["entity", "theme", "tag", "bestFor"]);
const NON_INFORMATIONAL_VALUES = new Set([
  "n/a",
  "na",
  "none",
  "unknown",
  "unclear",
  "not verified",
  "not applicable",
]);

const DISCOVERY_PROFILE_FIELDS = [
  { id: "voiceStyle", label: "voice style" },
  { id: "narrativeFocus", label: "narrative focus" },
  { id: "intensity", label: "intensity" },
  { id: "commitment", label: "listening commitment" },
];

const COVERAGE_AREA_DEFINITIONS = [
  { id: "genres", label: "Genres", values: (show) => show.genres },
  { id: "formats", label: "Formats", values: (show) => show.formats },
  { id: "tones", label: "Tones", values: (show) => show.tones },
  { id: "tags", label: "Discovery tags", values: (show) => show.tags },
  { id: "themes", label: "Themes", values: (show) => show.themes },
  { id: "bestFor", label: "Best-for routes", values: (show) => show.bestFor },
  ...DISCOVERY_PROFILE_FIELDS.map((field) => ({
    id: `discovery.${field.id}`,
    label: `Discovery ${field.label}`,
    values: (show) => show.discovery?.[field.id],
  })),
  { id: "completionStatus", label: "Completion status", values: (show) => show.completionStatus },
  { id: "releaseStatus", label: "Release status", values: (show) => show.releaseStatus },
];

const RICHNESS_LABELS = new Map(RICHNESS_DIMENSIONS.map((dimension) => [dimension.id, dimension.label]));

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, limit = 420) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function isMeaningful(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  const text = String(value).trim();
  return Boolean(text) && !NON_INFORMATIONAL_VALUES.has(text.toLowerCase());
}

function normalizeCriteria(criteria = {}) {
  const source = criteria && typeof criteria === "object" && !Array.isArray(criteria) ? criteria : {};
  return {
    all: asArray(source.all),
    any: asArray(source.any),
    not: asArray(source.not),
  };
}

function normalizeSet(values) {
  return new Set(asArray(values).map((value) => normalizeValue(value)).filter(Boolean));
}

function jaccard(leftValues, rightValues) {
  const left = leftValues instanceof Set ? leftValues : new Set(leftValues || []);
  const right = rightValues instanceof Set ? rightValues : new Set(rightValues || []);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((value) => {
    if (right.has(value)) intersection += 1;
  });
  return intersection / (left.size + right.size - intersection);
}

function quantile(sortedValues, fraction) {
  if (!sortedValues.length) return null;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1));
  return sortedValues[index];
}

function titleForShow(show) {
  return cleanText(show?.title) || cleanText(show?.id) || "Untitled show";
}

function titleForCollection(collection) {
  return cleanText(collection?.title) || cleanText(collection?.id) || "Untitled collection";
}

function collectionKind(collection) {
  const kind = cleanText(collection?.kind, 40).toLowerCase();
  if (kind) return kind;
  if (collection?.automation?.mode === "rule") return "rule-based";
  if (collection?.automation?.mode === "semantic") return "semantic";
  return "editorial";
}

function isRuleCollection(collection) {
  return collectionKind(collection) === "rule-based" || collection?.automation?.mode === "rule";
}

function isSimilarityCollection(collection) {
  return collectionKind(collection) === "similarity";
}

function isCuratedCollection(collection) {
  return CURATED_COLLECTION_KINDS.has(collectionKind(collection));
}

function validMemberIds(collection, publishedShowIds) {
  const seen = new Set();
  return asArray(collection?.showIds)
    .map((showId) => cleanText(showId, 160))
    .filter((showId) => {
      if (!showId || !publishedShowIds.has(showId) || seen.has(showId)) return false;
      seen.add(showId);
      return true;
    });
}

function buildMembershipIndex(collections, publishedShows) {
  const publishedShowIds = new Set(publishedShows.map((show) => show.id));
  const byShowId = new Map(publishedShows.map((show) => [show.id, []]));
  const curatedByShowId = new Map(publishedShows.map((show) => [show.id, []]));
  const details = collections.map((collection) => {
    const memberIds = validMemberIds(collection, publishedShowIds);
    const invalidReferenceCount = asArray(collection?.showIds)
      .map((showId) => cleanText(showId, 160))
      .filter((showId) => showId && !publishedShowIds.has(showId)).length;
    const detail = {
      collection,
      id: cleanText(collection?.id, 160),
      title: titleForCollection(collection),
      kind: collectionKind(collection),
      memberIds,
      memberCount: memberIds.length,
      invalidReferenceCount,
    };
    memberIds.forEach((showId) => {
      byShowId.get(showId).push(detail);
      if (isCuratedCollection(collection)) curatedByShowId.get(showId).push(detail);
    });
    return detail;
  });

  return { byShowId, curatedByShowId, details };
}

function collectionReferenceIds(detail, showById) {
  const references = [];
  if (isSimilarityCollection(detail.collection)) {
    const anchorId = cleanText(detail.collection.anchorShowId, 160);
    if (showById.has(anchorId)) references.push(anchorId);
  }
  detail.memberIds.forEach((showId) => {
    if (!references.includes(showId)) references.push(showId);
  });
  return references;
}

function formatClause(clause = {}) {
  const field = cleanText(clause.field, 100) || "unknown field";
  const operator = cleanText(clause.operator || "includes", 40) || "includes";
  const value = cleanText(clause.value, 160) || "unknown value";
  return `${field} ${operator} ${value}`;
}

function formatCriteria(criteria) {
  const groups = [];
  const normalized = normalizeCriteria(criteria);
  if (normalized.all.length) groups.push(normalized.all.map(formatClause).join(" and "));
  if (normalized.any.length) groups.push(`one of (${normalized.any.map(formatClause).join(" or ")})`);
  if (normalized.not.length) groups.push(`not (${normalized.not.map(formatClause).join(" or ")})`);
  return groups.join("; ") || "no usable criteria";
}

function isBroadGenreOnlyCriteria(criteria) {
  const normalized = normalizeCriteria(criteria);
  const positive = [...normalized.all, ...normalized.any];
  return positive.length > 0
    && positive.every((clause) => cleanText(clause?.field, 100) === "genres")
    && normalized.not.length === 0;
}

function getCollectionIntentMatches(collection, show) {
  const intentTags = asArray(collection?.intentTags).map((value) => cleanText(value, 160)).filter(Boolean);
  const fields = [
    { id: "bestFor", label: "best-for route", values: show.bestFor, strength: "strong" },
    { id: "completionStatus", label: "completion status", values: show.completionStatus, strength: "strong" },
    { id: "releaseStatus", label: "release status", values: show.releaseStatus, strength: "strong" },
    { id: "tags", label: "discovery tag", values: show.tags, strength: "supporting" },
    { id: "themes", label: "theme", values: show.themes, strength: "supporting" },
    { id: "tones", label: "tone", values: show.tones, strength: "supporting" },
    { id: "formats", label: "format", values: show.formats, strength: "supporting" },
    ...DISCOVERY_PROFILE_FIELDS.map((field) => ({
      id: `discovery.${field.id}`,
      label: `discovery ${field.label}`,
      values: show.discovery?.[field.id],
      strength: "supporting",
    })),
  ];
  const matches = [];
  fields.forEach((field) => {
    const values = Array.isArray(field.values) ? field.values : [field.values];
    const valueMap = new Map(values.filter(isMeaningful).map((value) => [normalizeValue(value), value]));
    intentTags.forEach((tag) => {
      const value = valueMap.get(normalizeValue(tag));
      if (!value) return;
      matches.push({
        tag,
        field: field.id,
        label: field.label,
        value: cleanText(value, 160),
        strength: field.strength,
        text: `Collection intent ${displayValue(tag)} matches show ${field.label}: ${displayValue(value)}.`,
      });
    });
  });

  const collectionCommitment = normalizeValue(collection?.commitment);
  const showCommitment = normalizeValue(show?.discovery?.commitment);
  if (collectionCommitment && showCommitment && collectionCommitment === showCommitment) {
    matches.push({
      tag: collection.commitment,
      field: "discovery.commitment",
      label: "discovery listening commitment",
      value: show.discovery.commitment,
      strength: "supporting",
      text: `Collection commitment ${displayValue(collection.commitment)} matches show discovery commitment: ${displayValue(show.discovery.commitment)}.`,
    });
  }

  return matches;
}

function addReferenceToEvidence(entry, reference) {
  if (!reference?.id) return entry;
  const references = Array.isArray(entry.referenceShows) ? entry.referenceShows : [];
  if (!references.some((item) => item.id === reference.id)) {
    references.push({ id: reference.id, title: titleForShow(reference) });
  }
  entry.referenceShows = references.slice(0, 5);
  return entry;
}

function addEvidence(evidenceMaps, bucket, item, reference = null) {
  const text = cleanText(item?.text, 520);
  if (!text) return;
  const dimension = cleanText(item?.dimension || item?.code, 80) || "metadata";
  const source = cleanText(item?.source, 160) || "catalog metadata";
  const code = cleanText(item?.code || dimension, 100) || dimension;
  const key = `${code}|${dimension}|${source}|${text}`;
  const map = evidenceMaps[bucket];
  const existing = map.get(key);
  if (existing) {
    existing.occurrences += 1;
    addReferenceToEvidence(existing, reference);
    return;
  }
  const entry = {
    code,
    dimension,
    source,
    text,
    occurrences: 1,
  };
  const values = asArray(item?.values).filter(isMeaningful).map((value) => cleanText(value, 160));
  if (values.length) entry.values = [...new Set(values)];
  if (Number.isFinite(item?.contribution)) entry.contribution = item.contribution;
  addReferenceToEvidence(entry, reference);
  map.set(key, entry);
}

function classifyComparisonReason(reason) {
  if (reason?.dimension === "editorial") return "strong";
  if (reason?.dimension === "genre" || reason?.dimension === "ratingProfile") return "weak";
  return "supporting";
}

function serializeEvidence(evidenceMaps) {
  const sortEvidence = (left, right) => right.occurrences - left.occurrences
    || (Number(right.contribution) || 0) - (Number(left.contribution) || 0)
    || left.dimension.localeCompare(right.dimension, "en")
    || left.text.localeCompare(right.text, "en");
  return Object.fromEntries(Object.entries(evidenceMaps).map(([bucket, map]) => [
    bucket,
    [...map.values()].sort(sortEvidence),
  ]));
}

function limitDisplayedEvidence(evidence) {
  return Object.fromEntries(Object.entries(EVIDENCE_DISPLAY_LIMITS).map(([bucket, limit]) => [
    bucket,
    evidence[bucket].slice(0, limit),
  ]));
}

function similarityPasses(comparison) {
  if (!comparison) return false;
  if (comparison.curatedEvidence) return true;
  const anchorMatches = comparison.dimensions.filter((dimension) => dimension.anchor && dimension.matched).length;
  const relevantMatches = comparison.metadataMatches.filter((dimension) => COLLECTION_RELEVANT_SIMILARITY_DIMENSIONS.has(dimension));
  const specificMatches = relevantMatches.filter((dimension) => COLLECTION_SPECIFIC_SIMILARITY_DIMENSIONS.has(dimension));
  return comparison.score >= SIMILARITY_MINIMUM_SCORE
    && comparison.metadataMatches.length >= SIMILARITY_MINIMUM_DIMENSIONS
    && relevantMatches.length >= 2
    && specificMatches.length >= 1
    && anchorMatches >= SIMILARITY_MINIMUM_ANCHOR_DIMENSIONS;
}

function compareReferences(candidate, referenceIds, showById, similarityIndex) {
  return referenceIds
    .map((referenceId) => {
      const reference = showById.get(referenceId);
      const comparison = reference ? similarityIndex.compare(reference, candidate) : null;
      return comparison ? { reference, comparison } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.comparison.score - left.comparison.score
      || right.comparison.metadataCoverage - left.comparison.metadataCoverage
      || titleForShow(left.reference).localeCompare(titleForShow(right.reference), "en")
      || left.reference.id.localeCompare(right.reference.id, "en"));
}

function relatedCollectionPatterns(candidate, memberIds, membershipIndex, targetCollectionId) {
  const candidateCollections = new Map(
    (membershipIndex.curatedByShowId.get(candidate.id) || []).map((collection) => [collection.id, collection]),
  );
  const patterns = new Map();
  memberIds.forEach((memberId) => {
    const memberCollections = membershipIndex.curatedByShowId.get(memberId) || [];
    memberCollections.forEach((collection) => {
      if (collection.id === targetCollectionId || !candidateCollections.has(collection.id)) return;
      const current = patterns.get(collection.id) || {
        collection,
        memberIds: new Set(),
      };
      current.memberIds.add(memberId);
      patterns.set(collection.id, current);
    });
  });
  return [...patterns.values()]
    .map((pattern) => ({
      collection: pattern.collection,
      memberCount: pattern.memberIds.size,
    }))
    .sort((left, right) => right.memberCount - left.memberCount
      || left.collection.title.localeCompare(right.collection.title, "en")
      || left.collection.id.localeCompare(right.collection.id, "en"));
}

function createEvidenceMaps() {
  return {
    strong: new Map(),
    supporting: new Map(),
    weak: new Map(),
  };
}

function candidateAssessment({ candidate, detail, showById, similarityIndex, membershipIndex }) {
  const collection = detail.collection;
  const evidenceMaps = createEvidenceMaps();
  const criteria = normalizeCriteria(collection.automation?.criteria);
  const broadGenreOnlyRule = isRuleCollection(collection) && isBroadGenreOnlyCriteria(criteria);
  let directRuleMatch = false;
  let hasRuleCriteria = false;
  if (isRuleCollection(collection)) {
    hasRuleCriteria = [...criteria.all, ...criteria.any, ...criteria.not].length > 0;
    directRuleMatch = hasRuleCriteria && ruleMatches(candidate, criteria);
    if (directRuleMatch) {
      addEvidence(evidenceMaps, broadGenreOnlyRule ? "weak" : "strong", {
        code: "rule-match",
        dimension: "automation",
        source: "collection.automation.criteria",
        values: [...criteria.all, ...criteria.any].map((clause) => formatClause(clause)),
        text: `Matches existing collection rule: ${formatCriteria(criteria)}.`,
      });
    }
  }

  if (isRuleCollection(collection) && !hasRuleCriteria) {
    return {
      qualifies: false,
      exclusion: "invalidRule",
      evidence: serializeEvidence(evidenceMaps),
    };
  }
  if (isRuleCollection(collection) && !directRuleMatch) {
    return {
      qualifies: false,
      exclusion: "ruleNotMatched",
      evidence: serializeEvidence(evidenceMaps),
    };
  }

  const intentMatches = getCollectionIntentMatches(collection, candidate);
  intentMatches.forEach((match) => {
    addEvidence(evidenceMaps, match.strength, {
      code: "collection-intent",
      dimension: match.field,
      source: `collection.intentTags -> show.${match.field}`,
      values: [match.tag, match.value],
      text: match.text,
    });
  });

  const referenceIds = collectionReferenceIds(detail, showById).filter((showId) => showId !== candidate.id);
  const comparisons = compareReferences(candidate, referenceIds, showById, similarityIndex);
  const eligibleComparisons = comparisons.filter(({ comparison }) => similarityPasses(comparison));
  const evidenceComparisons = (eligibleComparisons.length ? eligibleComparisons : comparisons.slice(0, 2)).slice(0, 4);

  evidenceComparisons.forEach(({ reference, comparison }) => {
    comparison.reasons.forEach((reason) => {
      addEvidence(evidenceMaps, classifyComparisonReason(reason), {
        ...reason,
        code: reason.code || reason.dimension,
        dimension: reason.dimension,
        source: reason.source || "shared/archive-similarity.js",
        contribution: reason.contribution,
      }, reference);
    });
  });

  relatedCollectionPatterns(candidate, detail.memberIds, membershipIndex, detail.id).forEach((pattern) => {
    addEvidence(evidenceMaps, pattern.memberCount >= 2 ? "supporting" : "weak", {
      code: "related-collection",
      dimension: "sharedCollection",
      source: "curated collection membership",
      values: [pattern.collection.title, `${pattern.memberCount} target members`],
      text: `The show also appears in ${pattern.collection.title}, shared by ${pattern.memberCount} current member${pattern.memberCount === 1 ? "" : "s"} of this collection.`,
    });
  });

  const completeEvidence = serializeEvidence(evidenceMaps);
  const evidence = limitDisplayedEvidence(completeEvidence);
  const allNonWeak = [...completeEvidence.strong, ...completeEvidence.supporting];
  const independentDimensions = [...new Set(allNonWeak
    .map((entry) => entry.dimension)
    .filter((dimension) => !new Set(["genre", "ratingProfile", "editorial", "sharedCollection"]).has(dimension)))];
  const explicitEditorial = completeEvidence.strong.some((entry) => entry.dimension === "editorial");
  const directRouteMatch = intentMatches.some((match) => match.strength === "strong");
  const usableSimilarity = eligibleComparisons.length > 0;
  const broadGenreOnly = completeEvidence.weak.some((entry) => entry.dimension === "genre") && independentDimensions.length === 0;
  const qualifies = !broadGenreOnlyRule && (
    (directRuleMatch && !broadGenreOnly)
    || explicitEditorial
    || directRouteMatch
    || usableSimilarity
  );

  const bestSimilarity = eligibleComparisons[0] || comparisons[0] || null;
  if (!qualifies) {
    return {
      qualifies: false,
      exclusion: broadGenreOnly || broadGenreOnlyRule ? "broadGenreOnly" : "insufficientEvidence",
      evidence,
    };
  }

  const confidenceLevel = directRuleMatch || explicitEditorial || directRouteMatch ? "high" : "medium";
  const basis = [];
  if (directRuleMatch && !broadGenreOnlyRule) basis.push("existing collection rule match");
  if (explicitEditorial) basis.push("existing curated similarity relationship");
  if (directRouteMatch) basis.push("exact collection intent metadata");
  if (usableSimilarity) basis.push("shared archive-similarity threshold");
  if (independentDimensions.length) basis.push(`${independentDimensions.length} non-genre metadata dimension${independentDimensions.length === 1 ? "" : "s"}`);
  const leadEvidence = completeEvidence.strong[0]?.text || completeEvidence.supporting[0]?.text || "supported catalogue metadata";
  const confidenceSummary = `${confidenceLevel === "high" ? "High" : "Medium"} confidence: ${leadEvidence}`;

  return {
    qualifies: true,
    candidate: {
      showId: candidate.id,
      title: titleForShow(candidate),
      confidence: {
        level: confidenceLevel,
        summary: confidenceSummary,
        basis,
      },
      evidence,
      evidenceSummary: {
        strongSignals: completeEvidence.strong.length,
        supportingSignals: completeEvidence.supporting.length,
        weakSignals: completeEvidence.weak.length,
        shownStrongSignals: evidence.strong.length,
        shownSupportingSignals: evidence.supporting.length,
        shownWeakSignals: evidence.weak.length,
        evidenceTruncated: completeEvidence.strong.length > evidence.strong.length
          || completeEvidence.supporting.length > evidence.supporting.length
          || completeEvidence.weak.length > evidence.weak.length,
        independentDimensions,
        similarityComparisonsMeetingThreshold: eligibleComparisons.length,
      },
      similarity: bestSimilarity ? {
        score: bestSimilarity.comparison.score,
        maxScore: bestSimilarity.comparison.maxScore,
        metadataCoverage: bestSimilarity.comparison.metadataCoverage,
        metadataMatches: bestSimilarity.comparison.metadataMatches,
        curatedEvidence: bestSimilarity.comparison.curatedEvidence,
        referenceShow: {
          id: bestSimilarity.reference.id,
          title: titleForShow(bestSimilarity.reference),
        },
      } : null,
      currentCollections: (membershipIndex.byShowId.get(candidate.id) || []).map((membership) => ({
        id: membership.id,
        title: membership.title,
        kind: membership.kind,
      })),
    },
  };
}

function buildCollectionReport(detail, publishedShows, showById, similarityIndex, membershipIndex, candidateLimit) {
  const candidates = [];
  const exclusions = {
    alreadyMember: 0,
    anchorShow: 0,
    ruleNotMatched: 0,
    invalidRule: 0,
    broadGenreOnly: 0,
    insufficientEvidence: 0,
    samples: {
      alreadyMember: [],
      anchorShow: [],
      ruleNotMatched: [],
      invalidRule: [],
      broadGenreOnly: [],
      insufficientEvidence: [],
    },
  };
  const addExclusion = (kind, show) => {
    exclusions[kind] += 1;
    if (exclusions.samples[kind].length < 12) exclusions.samples[kind].push({ id: show.id, title: titleForShow(show) });
  };
  const memberIds = new Set(detail.memberIds);
  const anchorId = isSimilarityCollection(detail.collection) ? cleanText(detail.collection.anchorShowId, 160) : "";

  publishedShows.forEach((show) => {
    if (memberIds.has(show.id)) {
      addExclusion("alreadyMember", show);
      return;
    }
    if (anchorId && show.id === anchorId) {
      addExclusion("anchorShow", show);
      return;
    }
    const assessment = candidateAssessment({
      candidate: show,
      detail,
      showById,
      similarityIndex,
      membershipIndex,
    });
    if (!assessment.qualifies) {
      addExclusion(assessment.exclusion, show);
      return;
    }
    candidates.push(assessment.candidate);
  });

  candidates.sort((left, right) => {
    const levelDifference = (left.confidence.level === "high" ? 0 : 1) - (right.confidence.level === "high" ? 0 : 1);
    if (levelDifference) return levelDifference;
    const scoreDifference = (right.similarity?.score ?? -1) - (left.similarity?.score ?? -1);
    if (scoreDifference) return scoreDifference;
    const dimensionDifference = right.evidenceSummary.independentDimensions.length - left.evidenceSummary.independentDimensions.length;
    if (dimensionDifference) return dimensionDifference;
    return left.title.localeCompare(right.title, "en") || left.showId.localeCompare(right.showId, "en");
  });

  const candidateIds = candidates.map((candidate) => candidate.showId);
  return {
    id: detail.id,
    title: detail.title,
    kind: detail.kind,
    memberCount: detail.memberCount,
    invalidReferenceCount: detail.invalidReferenceCount,
    profile: {
      intentTags: asArray(detail.collection.intentTags),
      commitment: cleanText(detail.collection.commitment, 120),
      anchorShow: detail.collection.anchorShowId && showById.has(detail.collection.anchorShowId)
        ? { id: detail.collection.anchorShowId, title: titleForShow(showById.get(detail.collection.anchorShowId)) }
        : null,
      referenceShowCount: collectionReferenceIds(detail, showById).length,
      automation: detail.collection.automation?.mode ? {
        mode: detail.collection.automation.mode,
        ...(detail.collection.automation.criteria ? { criteria: normalizeCriteria(detail.collection.automation.criteria) } : {}),
      } : null,
    },
    candidateCount: candidates.length,
    candidateIds,
    candidates: candidates.slice(0, candidateLimit),
    truncated: candidates.length > candidateLimit,
    exclusions,
  };
}

function getCoverageValues(show, definition) {
  const raw = definition.values(show);
  return (Array.isArray(raw) ? raw : [raw]).filter(isMeaningful);
}

function buildCoverageGaps(publishedShows, membershipIndex, options = {}) {
  const coverageThreshold = Number.isFinite(options.coverageThreshold)
    ? options.coverageThreshold
    : DEFAULT_POOR_AREA_COVERAGE;
  const minimumShowCount = Number.isInteger(options.minimumAreaShows) && options.minimumAreaShows > 0
    ? options.minimumAreaShows
    : DEFAULT_MIN_AREA_SHOWS;
  const areaLimit = Number.isInteger(options.poorAreaLimit) && options.poorAreaLimit > 0
    ? options.poorAreaLimit
    : DEFAULT_POOR_AREA_LIMIT;
  const coveredShowIds = new Set([...membershipIndex.byShowId.entries()]
    .filter(([, memberships]) => memberships.length > 0)
    .map(([showId]) => showId));
  const showById = new Map(publishedShows.map((show) => [show.id, show]));
  const byDefinition = COVERAGE_AREA_DEFINITIONS.map((definition) => {
    const areas = new Map();
    publishedShows.forEach((show) => {
      getCoverageValues(show, definition).forEach((value) => {
        const key = normalizeValue(value);
        if (!key) return;
        const area = areas.get(key) || {
          key,
          label: cleanText(value, 160),
          showIds: new Set(),
          collectionIds: new Set(),
        };
        area.showIds.add(show.id);
        (membershipIndex.byShowId.get(show.id) || []).forEach((collection) => area.collectionIds.add(collection.id));
        areas.set(key, area);
      });
    });

    const poorAreas = [...areas.values()]
      .map((area) => {
        const showCount = area.showIds.size;
        const coveredCount = [...area.showIds].filter((showId) => coveredShowIds.has(showId)).length;
        const coveragePercentage = showCount ? Math.round((coveredCount / showCount) * 1000) / 10 : null;
        const uncoveredShowIds = [...area.showIds].filter((showId) => !coveredShowIds.has(showId));
        return {
          id: `${definition.id}:${area.key}`,
          value: area.label,
          showCount,
          coveredShowCount: coveredCount,
          uncoveredShowCount: uncoveredShowIds.length,
          coveragePercentage,
          collectionCount: area.collectionIds.size,
          uncoveredShows: uncoveredShowIds
            .map((showId) => ({ id: showId, title: titleForShow(showById.get(showId)) }))
            .sort((left, right) => left.title.localeCompare(right.title, "en") || left.id.localeCompare(right.id, "en"))
            .slice(0, 12),
        };
      })
      .filter((area) => area.showCount >= minimumShowCount && area.coveragePercentage < coverageThreshold)
      .sort((left, right) => left.coveragePercentage - right.coveragePercentage
        || right.uncoveredShowCount - left.uncoveredShowCount
        || right.showCount - left.showCount
        || left.value.localeCompare(right.value, "en"));

    return {
      id: definition.id,
      label: definition.label,
      populatedAreaCount: areas.size,
      poorlyRepresentedAreaCount: poorAreas.length,
      completeBlindSpotCount: poorAreas.filter((area) => area.coveredShowCount === 0).length,
      areas: poorAreas.slice(0, areaLimit),
    };
  });

  const areas = byDefinition.flatMap((definition) => definition.areas.map((area) => ({
    facet: definition.id,
    facetLabel: definition.label,
    ...area,
  }))).sort((left, right) => left.coveragePercentage - right.coveragePercentage
    || right.uncoveredShowCount - left.uncoveredShowCount
    || left.facetLabel.localeCompare(right.facetLabel, "en")
    || left.value.localeCompare(right.value, "en"));

  return {
    method: `Areas with at least ${minimumShowCount} published shows and less than ${coverageThreshold}% collection coverage; coverage uses materialized published-show memberships.`,
    coverageThreshold,
    minimumShowCount,
    poorlyRepresentedAreaCount: byDefinition.reduce((total, definition) => total + definition.poorlyRepresentedAreaCount, 0),
    completeBlindSpotCount: byDefinition.reduce((total, definition) => total + definition.completeBlindSpotCount, 0),
    areas: areas.slice(0, areaLimit),
    byFacet: byDefinition,
  };
}

function buildRichUncollectedShows(publishedShows, context, membershipIndex, options = {}) {
  const limit = Number.isInteger(options.highlightLimit) && options.highlightLimit > 0
    ? options.highlightLimit
    : DEFAULT_HIGHLIGHT_LIMIT;
  const profileById = new Map(context.profiles.map((profile) => [profile.id, profile]));
  const showById = new Map(publishedShows.map((show) => [show.id, show]));
  const outgoingSimilar = new Map(publishedShows.map((show) => [show.id, 0]));
  const incomingSimilar = new Map(publishedShows.map((show) => [show.id, 0]));
  publishedShows.forEach((show) => {
    asArray(show.similarTo).forEach((targetId) => {
      if (!showById.has(targetId) || targetId === show.id) return;
      outgoingSimilar.set(show.id, outgoingSimilar.get(show.id) + 1);
      incomingSimilar.set(targetId, incomingSimilar.get(targetId) + 1);
    });
  });

  const rows = publishedShows
    .filter((show) => (membershipIndex.byShowId.get(show.id) || []).length === 0)
    .map((show) => {
      const profile = profileById.get(show.id);
      const presentDimensions = asArray(profile?.presentDimensions).filter((dimension) => dimension !== "collections");
      const missingDimensions = asArray(profile?.missingDimensions);
      const richnessMaxScore = Math.max(0, RICHNESS_DIMENSIONS.length - 1);
      const outgoingSimilarityLinks = outgoingSimilar.get(show.id) || 0;
      const incomingSimilarityLinks = incomingSimilar.get(show.id) || 0;
      const entityRelationships = asArray(profile?.entityRelationships).length;
      const connectednessScore = outgoingSimilarityLinks + incomingSimilarityLinks + entityRelationships;
      return {
        showId: show.id,
        title: titleForShow(show),
        richnessScore: presentDimensions.length,
        richnessMaxScore,
        presentDimensions,
        presentLabels: presentDimensions.map((dimension) => RICHNESS_LABELS.get(dimension) || dimension),
        missingDimensions,
        outgoingSimilarityLinks,
        incomingSimilarityLinks,
        entityRelationships,
        connectednessScore,
      };
    });

  const richnessValues = publishedShows.map((show) => {
    const profile = profileById.get(show.id);
    return asArray(profile?.presentDimensions).filter((dimension) => dimension !== "collections").length;
  }).sort((left, right) => right - left);
  const connectionValues = publishedShows.map((show) => {
    const outgoing = outgoingSimilar.get(show.id) || 0;
    const incoming = incomingSimilar.get(show.id) || 0;
    const relationships = asArray(profileById.get(show.id)?.entityRelationships).length;
    return outgoing + incoming + relationships;
  }).sort((left, right) => right - left);
  const topCount = Math.max(1, Math.ceil(publishedShows.length * 0.1));
  const richnessThreshold = Math.max(1, richnessValues[Math.min(richnessValues.length - 1, topCount - 1)] || 0);
  const connectednessThreshold = Math.max(2, connectionValues[Math.min(connectionValues.length - 1, topCount - 1)] || 0);

  const selected = rows.filter((row) => row.richnessScore >= richnessThreshold || row.connectednessScore >= connectednessThreshold);
  selected.sort((left, right) => Math.max(right.richnessScore / Math.max(right.richnessMaxScore, 1), right.connectednessScore / Math.max(connectednessThreshold, 1))
    - Math.max(left.richnessScore / Math.max(left.richnessMaxScore, 1), left.connectednessScore / Math.max(connectednessThreshold, 1))
    || right.richnessScore - left.richnessScore
    || right.connectednessScore - left.connectednessScore
    || left.title.localeCompare(right.title, "en")
    || left.showId.localeCompare(right.showId, "en"));
  selected.forEach((row) => {
    row.selectedBy = [
      ...(row.richnessScore >= richnessThreshold ? ["richness"] : []),
      ...(row.connectednessScore >= connectednessThreshold ? ["connectedness"] : []),
    ];
    row.evidenceSummary = [
      `${row.richnessScore}/${row.richnessMaxScore} catalog evidence dimensions populated`,
      `${row.outgoingSimilarityLinks} outgoing and ${row.incomingSimilarityLinks} incoming explicit similarity links`,
      `${row.entityRelationships} resolved typed entity relationship${row.entityRelationships === 1 ? "" : "s"}`,
    ].join("; ");
  });

  return {
    method: `Uncollected published shows in the top 10% richness or connectedness band; richness excludes the missing collection-membership dimension, and connectedness counts resolved similarTo links in both directions plus typed entity relationships.`,
    richnessThreshold,
    richnessMaxScore: Math.max(0, RICHNESS_DIMENSIONS.length - 1),
    connectednessThreshold,
    showCount: selected.length,
    showIds: selected.map((show) => show.showId),
    shows: selected.slice(0, limit),
  };
}

function ruleCriteriaKey(collection) {
  if (!isRuleCollection(collection)) return "";
  const criteria = normalizeCriteria(collection.automation?.criteria);
  return ["all", "any", "not"].map((group) => criteria[group]
    .map((clause) => `${cleanText(clause.field, 100)}:${cleanText(clause.operator || "includes", 40)}:${normalizeValue(clause.value)}`)
    .sort()
    .join(",")).join("|");
}

function buildNearDuplicateCollections(details, options = {}) {
  const limit = Number.isInteger(options.nearDuplicateLimit) && options.nearDuplicateLimit > 0
    ? options.nearDuplicateLimit
    : DEFAULT_NEAR_DUPLICATE_LIMIT;
  const pairs = [];
  for (let leftIndex = 0; leftIndex < details.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < details.length; rightIndex += 1) {
      const left = details[leftIndex];
      const right = details[rightIndex];
      const leftSet = new Set(left.memberIds);
      const rightSet = new Set(right.memberIds);
      const sharedCount = [...leftSet].filter((showId) => rightSet.has(showId)).length;
      const unionCount = new Set([...leftSet, ...rightSet]).size;
      const membershipJaccard = jaccard(leftSet, rightSet);
      const evidence = [];
      const leftRuleKey = ruleCriteriaKey(left.collection);
      const rightRuleKey = ruleCriteriaKey(right.collection);
      if (leftRuleKey && leftRuleKey === rightRuleKey) evidence.push("same rule criteria");
      if (isSimilarityCollection(left.collection)
        && isSimilarityCollection(right.collection)
        && cleanText(left.collection.anchorShowId, 160)
        && cleanText(left.collection.anchorShowId, 160) === cleanText(right.collection.anchorShowId, 160)) {
        evidence.push("same similarity anchor");
      }
      if (sharedCount >= 4 && membershipJaccard >= 0.86) evidence.push("near-identical published membership set");
      if (!evidence.length) continue;
      pairs.push({
        first: { id: left.id, title: left.title, kind: left.kind },
        second: { id: right.id, title: right.title, kind: right.kind },
        sharedMemberCount: sharedCount,
        unionMemberCount: unionCount,
        membershipJaccard: Math.round(membershipJaccard * 1000) / 1000,
        evidence,
        action: "Review only; this report does not merge or edit collections.",
      });
    }
  }
  return pairs
    .sort((left, right) => right.membershipJaccard - left.membershipJaccard
      || right.sharedMemberCount - left.sharedMemberCount
      || left.first.title.localeCompare(right.first.title, "en"))
    .slice(0, limit);
}

function buildCollectionCandidateReport(inputs = {}, options = {}) {
  const shows = asArray(inputs.shows).map((show) => normalizeShowRecord(show));
  const collections = asArray(inputs.collections).map((collection) => normalizeCollectionRecord(collection));
  const publishedShows = getPublishedShows(shows);
  const publishedShowIds = new Set(publishedShows.map((show) => show.id));
  const showById = new Map(publishedShows.map((show) => [show.id, show]));
  const context = buildMetricContext({ shows, collections, entities: asArray(inputs.entities), taxonomy: inputs.taxonomy });
  const membershipIndex = buildMembershipIndex(collections, publishedShows);
  const similarityIndex = createSimilarityIndex({ shows: publishedShows, collections });
  const candidateLimit = Number.isInteger(options.candidateLimit) && options.candidateLimit > 0
    ? options.candidateLimit
    : DEFAULT_CANDIDATE_LIMIT;
  const collectionReports = membershipIndex.details.map((detail) => buildCollectionReport(
    detail,
    publishedShows,
    showById,
    similarityIndex,
    membershipIndex,
    candidateLimit,
  ));
  const coveredShowIds = new Set([...membershipIndex.byShowId.entries()]
    .filter(([, memberships]) => memberships.length > 0)
    .map(([showId]) => showId));
  const candidateShowIds = new Set(collectionReports.flatMap((collection) => collection.candidateIds));
  const countsByKind = collectionReports.reduce((counts, collection) => {
    counts[collection.kind] = (counts[collection.kind] || 0) + 1;
    return counts;
  }, {});
  const lowMembershipThreshold = quantile(
    collectionReports.map((collection) => collection.memberCount).sort((left, right) => left - right),
    Number.isFinite(options.lowMembershipQuantile) ? options.lowMembershipQuantile : DEFAULT_LOW_MEMBERSHIP_QUANTILE,
  );
  const lowMembershipCollections = collectionReports
    .filter((collection) => collection.memberCount <= lowMembershipThreshold)
    .map(({ id, title, kind, memberCount, candidateCount, invalidReferenceCount }) => ({
      id,
      title,
      kind,
      memberCount,
      candidateCount,
      invalidReferenceCount,
    }));

  return {
    version: 1,
    readOnly: true,
    source: inputs.sourceSummary || null,
    methodology: {
      similarityUtility: "shared/archive-similarity.js",
      discoveryUtility: "tools/lib/discovery-quality-report.js",
      ruleUtility: "backend/lib/services/collection-service.js#ruleMatches",
      similarityThreshold: {
        minimumScore: SIMILARITY_MINIMUM_SCORE,
        minimumMetadataDimensions: SIMILARITY_MINIMUM_DIMENSIONS,
        minimumAnchorDimensions: SIMILARITY_MINIMUM_ANCHOR_DIMENSIONS,
        requiresNonGenreEvidence: true,
        requiresCollectionSpecificEvidence: true,
      },
      candidatePolicy: "Surface direct rule or route matches, explicit curated relationships, or archive-similarity matches with at least two collection-relevant dimensions including one specific dimension. Do not surface broad-genre-only matches.",
      ratingPolicy: "Archive ratings are not used to recommend membership; rating-profile matches remain weak evidence only.",
      mutationPolicy: "Read source metadata and print a report only; do not write collection membership, candidates, events, or generated catalog output.",
    },
    scope: {
      publishedShows: publishedShows.length,
      collections: collections.length,
      membershipEdges: context.collectionCoverage.membershipEdges,
      showsWithCollectionMembership: coveredShowIds.size,
      showsWithoutCollectionMembership: publishedShowIds.size - coveredShowIds.size,
      invalidCollectionReferences: context.collectionCoverage.invalidReferences,
      collectionsByKind: countsByKind,
      candidateEdges: collectionReports.reduce((total, collection) => total + collection.candidateCount, 0),
      candidateShows: candidateShowIds.size,
    },
    collections: collectionReports,
    lowMembership: {
      method: `Unusually low means at or below the ${(Number.isFinite(options.lowMembershipQuantile) ? options.lowMembershipQuantile : DEFAULT_LOW_MEMBERSHIP_QUANTILE) * 100}% lower quartile of current published member counts.`,
      threshold: lowMembershipThreshold,
      collections: lowMembershipCollections,
    },
    richlyConnectedUncollected: buildRichUncollectedShows(publishedShows, context, membershipIndex, options),
    coverageGaps: buildCoverageGaps(publishedShows, membershipIndex, options),
    nearDuplicateCollections: buildNearDuplicateCollections(membershipIndex.details, options),
  };
}

function formatEvidenceList(entries) {
  if (!entries.length) return "none";
  return entries.map((entry) => {
    const occurrence = entry.occurrences > 1 ? ` [${entry.occurrences} references]` : "";
    return `${entry.text}${occurrence}`;
  }).join("; ");
}

function formatCollectionCandidateReport(report) {
  const lines = [
    "Collection candidate report",
    "Read-only developer snapshot. No collection membership, source record, operational candidate, or generated catalog file is changed.",
    `Published shows: ${report.scope.publishedShows}; collections: ${report.scope.collections}; membership edges: ${report.scope.membershipEdges}.`,
    `Shows with collection membership: ${report.scope.showsWithCollectionMembership}; without membership: ${report.scope.showsWithoutCollectionMembership}.`,
    `Candidate edges: ${report.scope.candidateEdges} across ${report.scope.candidateShows} unique shows.`,
    "",
    "## Method",
    "",
    `- Similarity: ${report.methodology.similarityUtility}; minimum ${report.methodology.similarityThreshold.minimumScore} score, ${report.methodology.similarityThreshold.minimumMetadataDimensions} metadata dimensions, and collection-relevant evidence including a specific dimension unless direct curated evidence applies.`,
    `- Rules: ${report.methodology.ruleUtility}; ratings are weak evidence only and broad-genre-only matches are excluded.`,
    "",
    "## Collection candidates",
  ];

  report.collections.forEach((collection) => {
    lines.push(
      "",
      `### ${collection.title} [${collection.id}]`,
      `${collection.kind}; ${collection.memberCount} published members; ${collection.candidateCount} plausible candidates${collection.truncated ? ` (showing ${collection.candidates.length})` : ""}.`,
    );
    if (collection.profile.anchorShow) lines.push(`Anchor: ${collection.profile.anchorShow.title} [${collection.profile.anchorShow.id}].`);
    if (collection.profile.intentTags.length) lines.push(`Intent tags: ${collection.profile.intentTags.join(", ")}.`);
    if (collection.profile.automation?.mode) lines.push(`Automation: ${collection.profile.automation.mode}${collection.profile.automation.criteria ? ` (${formatCriteria(collection.profile.automation.criteria)})` : ""}.`);
    if (!collection.candidates.length) lines.push("- No candidate met the evidence policy.");
    collection.candidates.forEach((candidate) => {
      const similarity = candidate.similarity ? `; similarity ${candidate.similarity.score}/${candidate.similarity.maxScore} against ${candidate.similarity.referenceShow.title}` : "";
      lines.push(
        `- ${candidate.title} [${candidate.showId}] — ${candidate.confidence.level} confidence${similarity}.`,
        `  - Strong evidence: ${formatEvidenceList(candidate.evidence.strong)}.`,
        `  - Supporting evidence: ${formatEvidenceList(candidate.evidence.supporting)}.`,
        `  - Weak/context evidence: ${formatEvidenceList(candidate.evidence.weak)}.`,
      );
    });
    const excluded = collection.exclusions;
    lines.push(`Excluded: ${excluded.alreadyMember} already members; ${excluded.anchorShow} anchor shows; ${excluded.ruleNotMatched} do not match the existing rule; ${excluded.invalidRule} invalid rule definitions; ${excluded.broadGenreOnly} broad-genre-only; ${excluded.insufficientEvidence} insufficient evidence.`);
  });

  lines.push(
    "",
    "## Low-membership collections",
    "",
    `${report.lowMembership.method} Threshold: ${report.lowMembership.threshold} members.`,
  );
  if (!report.lowMembership.collections.length) lines.push("- None.");
  report.lowMembership.collections.forEach((collection) => lines.push(`- ${collection.title} [${collection.id}] — ${collection.memberCount} members; ${collection.candidateCount} candidates.`));

  lines.push(
    "",
    "## Richly described or highly connected shows without collection membership",
    "",
    report.richlyConnectedUncollected.method,
  );
  if (!report.richlyConnectedUncollected.shows.length) lines.push("- None in the selected band.");
  report.richlyConnectedUncollected.shows.forEach((show) => lines.push(`- ${show.title} [${show.showId}] — ${show.evidenceSummary}.`));

  lines.push(
    "",
    "## Poorly represented catalog areas",
    "",
    report.coverageGaps.method,
    "",
    "| Facet | Area | Shows | Covered | Coverage | Collections |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
  );
  if (!report.coverageGaps.areas.length) lines.push("| — | None under the configured threshold | — | — | — | — |");
  report.coverageGaps.areas.forEach((area) => lines.push(`| ${area.facetLabel} | ${area.value} | ${area.showCount} | ${area.coveredShowCount} | ${area.coveragePercentage}% | ${area.collectionCount} |`));

  lines.push("", "## Near-duplicate collections", "");
  if (!report.nearDuplicateCollections.length) lines.push("- No pairs met the strong overlap/definition checks.");
  report.nearDuplicateCollections.forEach((pair) => lines.push(`- ${pair.first.title} [${pair.first.id}] ↔ ${pair.second.title} [${pair.second.id}] — ${pair.evidence.join(", ")}; Jaccard ${pair.membershipJaccard}. Review only; nothing was merged.`));

  return lines.join("\n");
}

module.exports = {
  COVERAGE_AREA_DEFINITIONS,
  CURATED_COLLECTION_KINDS,
  DEFAULT_CANDIDATE_LIMIT,
  buildCollectionCandidateReport,
  buildCoverageGaps,
  buildNearDuplicateCollections,
  buildRichUncollectedShows,
  formatCollectionCandidateReport,
  isBroadGenreOnlyCriteria,
  similarityPasses,
};
