const { ruleMatches } = require("../../backend/lib/services/collection-service");
const { normalizeValue } = require("../../shared/archive-similarity");

const REPORT_VERSION = 1;
const MIN_FACET_SHOWS = 8;
const OPPORTUNITY_MIN_MEMBERS = 8;
const OPPORTUNITY_MAX_MEMBERS = 30;
const NON_INFORMATIVE_VALUES = new Set(["", "n/a", "n-a", "na", "none", "unknown", "unclear", "not verified", "not-verified", "not applicable", "not-applicable"]);

const FACETS = [
  { id: "genres", label: "Genres", get: (show) => show.genres },
  { id: "formats", label: "Formats", get: (show) => show.formats },
  { id: "tones", label: "Tones", get: (show) => show.tones },
  { id: "themes", label: "Themes", get: (show) => show.themes },
  { id: "tags", label: "Discovery tags", get: (show) => show.tags },
  { id: "bestFor", label: "Listener intent", get: (show) => show.bestFor },
  { id: "discovery.voiceStyle", label: "Voice style", get: (show) => show.discovery && show.discovery.voiceStyle },
  { id: "discovery.narrativeFocus", label: "Narrative focus", get: (show) => show.discovery && show.discovery.narrativeFocus },
  { id: "discovery.intensity", label: "Intensity", get: (show) => show.discovery && show.discovery.intensity },
  { id: "discovery.commitment", label: "Listening commitment", get: (show) => show.discovery && show.discovery.commitment },
  { id: "completionStatus", label: "Completion status", get: (show) => show.completionStatus },
  { id: "releaseStatus", label: "Release status", get: (show) => show.releaseStatus },
  { id: "content.setting", label: "Setting", get: (show) => show.content && show.content.setting },
];

const FACET_BY_ID = new Map(FACETS.map((facet) => [facet.id, facet]));
const CURATED_KINDS = new Set(["curated", "editorial"]);
const ROUTE_ALIASES = new Map([
  ["easy-entry", new Set(["easy-entry", "easy-first-step", "start-here"])],
  ["quick-listens", new Set(["quick-listens", "short", "single-sitting", "short-under-five-hours"])],
  ["funny-space", new Set(["funny-space", "funny-space-disasters"])],
  ["cold-horror", new Set(["cold-horror", "cold-isolation-horror"])],
  ["finished", new Set(["finished", "completed", "finished-arcs"])],
  ["ongoing", new Set(["ongoing"])],
  ["time-bent", new Set(["time-bent", "time-travel", "time-traveling"])],
]);

function array(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function text(value) {
  return String(value || "").trim();
}

function key(value) {
  return normalizeValue(value || "").replace(/_/g, "-");
}

function unique(values) {
  return [...new Set(array(values).map(text).filter(Boolean))];
}

function facetValues(show, facetId) {
  const facet = FACET_BY_ID.get(facetId);
  if (!facet) return [];
  return unique(facet.get(show))
    .filter((value) => !NON_INFORMATIVE_VALUES.has(key(value)))
    .map((value) => ({ value, key: key(value) }));
}

function valuesForShow(show, facetId) {
  return new Set(facetValues(show, facetId).map((entry) => entry.key));
}

function collectionKind(collection) {
  const explicit = key(collection && collection.kind);
  if (explicit) return explicit;
  const mode = key(collection && collection.automation && collection.automation.mode);
  if (mode === "rule") return "rule-based";
  if (mode === "semantic") return "semantic";
  return "curated";
}

function isSimilarity(collection) {
  return collectionKind(collection) === "similarity";
}

function isRule(collection) {
  return collectionKind(collection) === "rule-based"
    || key(collection && collection.automation && collection.automation.mode) === "rule";
}

function isCurated(collection) {
  return CURATED_KINDS.has(collectionKind(collection));
}

function collectionTitle(collection) {
  return text(collection && (collection.title || collection.label || collection.id)) || "Untitled collection";
}

function showTitle(show) {
  return text(show && (show.title || show.id)) || "Untitled show";
}

function normalizeCriteria(criteria) {
  const source = criteria && typeof criteria === "object" && !Array.isArray(criteria) ? criteria : {};
  return {
    all: array(source.all),
    any: array(source.any),
    not: array(source.not),
  };
}

function criteriaClauses(collection) {
  const criteria = normalizeCriteria(collection && collection.automation && collection.automation.criteria);
  return [...criteria.all, ...criteria.any, ...criteria.not]
    .filter((clause) => clause && typeof clause === "object");
}

function clauseText(clause) {
  return [text(clause && clause.field), text(clause && clause.operator || "includes"), text(clause && clause.value)]
    .filter(Boolean)
    .join(" ");
}

function criteriaText(collection) {
  const criteria = normalizeCriteria(collection && collection.automation && collection.automation.criteria);
  const groups = [];
  if (criteria.all.length) groups.push(criteria.all.map(clauseText).join(" and "));
  if (criteria.any.length) groups.push("one of (" + criteria.any.map(clauseText).join(" or ") + ")");
  if (criteria.not.length) groups.push("not (" + criteria.not.map(clauseText).join(" or ") + ")");
  return groups.join("; ");
}

function memberIds(collection) {
  return array(collection && collection.showIds).map(text).filter(Boolean);
}

function overlap(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let shared = 0;
  leftSet.forEach((id) => {
    if (rightSet.has(id)) shared += 1;
  });
  const union = new Set([...leftSet, ...rightSet]).size;
  const smaller = Math.min(leftSet.size, rightSet.size);
  return {
    shared,
    jaccard: union ? shared / union : 1,
    overlapCoefficient: smaller ? shared / smaller : 1,
  };
}

function percent(value, denominator) {
  return denominator ? Math.round((value / denominator) * 1000) / 10 : 0;
}

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function hasFacetValue(show, facetId, value) {
  return valuesForShow(show, facetId).has(key(value));
}

function collectionIntentKeys(collection) {
  return unique(collection && collection.intentTags).map(key).filter(Boolean);
}

function aliasesFor(value) {
  const normalized = key(value);
  for (const aliases of ROUTE_ALIASES.values()) {
    if (aliases.has(normalized)) return aliases;
  }
  return new Set([normalized]);
}

function directCollectionSupports(collection, facetId, value) {
  if (isSimilarity(collection)) return false;
  const wanted = key(value);
  if (!wanted) return false;
  const aliases = aliasesFor(wanted);
  if (collectionIntentKeys(collection).some((intent) => aliases.has(intent) || intent === wanted)) return true;
  const commitment = key(collection && collection.commitment);
  if (facetId === "discovery.commitment" && aliases.has(commitment)) return true;

  return criteriaClauses(collection).some((clause) => {
    const field = key(clause.field);
    const operator = key(clause.operator || "includes");
    const clauseValue = key(clause.value);
    if (key(field) !== key(facetId) || !["includes", "equals", "contains"].includes(operator)) return false;
    return clauseValue === wanted || aliases.has(clauseValue);
  });
}

function buildMembershipIndex(collections, publishedShows) {
  const showIds = new Set(publishedShows.map((show) => text(show.id)).filter(Boolean));
  const showById = new Map(publishedShows.map((show) => [text(show.id), show]));
  const membershipsByShow = new Map([...showIds].map((id) => [id, []]));
  const details = [];
  const errors = [];
  const warnings = [];

  collections.forEach((collection) => {
    const id = text(collection.id);
    const rawIds = memberIds(collection);
    const seen = new Set();
    const duplicateIds = rawIds.filter((showId) => {
      if (seen.has(showId)) return true;
      seen.add(showId);
      return false;
    });
    const invalidIds = rawIds.filter((showId) => !showIds.has(showId));
    const ids = [...seen].filter((showId) => showIds.has(showId));
    const reasonMap = collection.showReasons && typeof collection.showReasons === "object" && !Array.isArray(collection.showReasons)
      ? collection.showReasons
      : {};
    const reasonKeys = Object.keys(reasonMap);
    const missingReasonIds = ids.filter((showId) => !text(reasonMap[showId]));
    const orphanReasonIds = reasonKeys.filter((showId) => !seen.has(showId));
    const coverIds = unique(collection.coverShowIds);
    const invalidCoverIds = coverIds.filter((showId) => !showIds.has(showId));
    const anchorId = text(collection.anchorShowId);
    const anchorInMembers = Boolean(anchorId && seen.has(anchorId));

    if (invalidIds.length) errors.push({ collectionId: id, type: "unknown-member", showIds: invalidIds });
    if (duplicateIds.length) errors.push({ collectionId: id, type: "duplicate-member", showIds: unique(duplicateIds) });
    if (invalidCoverIds.length) errors.push({ collectionId: id, type: "unknown-cover", showIds: invalidCoverIds });
    if (isSimilarity(collection) && (!anchorId || !showIds.has(anchorId))) {
      errors.push({ collectionId: id, type: "unknown-anchor", showId: anchorId });
    }
    if (isSimilarity(collection) && anchorInMembers) {
      errors.push({ collectionId: id, type: "anchor-in-members", showId: anchorId });
    }
    if (missingReasonIds.length) warnings.push({ collectionId: id, type: "missing-member-reason", showIds: missingReasonIds });
    if (orphanReasonIds.length) warnings.push({ collectionId: id, type: "orphaned-reason", showIds: orphanReasonIds });

    const detail = {
      id,
      title: collectionTitle(collection),
      kind: collectionKind(collection),
      collection,
      memberIds: ids,
      memberCount: ids.length,
      reasonCoverage: ids.length ? (ids.length - missingReasonIds.length) / ids.length : 1,
      invalidIds,
      duplicateIds: unique(duplicateIds),
      invalidCoverIds,
      missingReasonIds,
      orphanReasonIds,
      anchorId,
      anchorInMembers,
      showById,
    };
    details.push(detail);
    ids.forEach((showId) => {
      membershipsByShow.get(showId).push(detail);
    });
  });

  return { details, membershipsByShow, errors, warnings };
}

function ruleDrift(detail, publishedShows) {
  if (!isRule(detail.collection)) return null;
  const expected = new Set();
  publishedShows.forEach((show) => {
    try {
      if (ruleMatches(show, normalizeCriteria(detail.collection.automation && detail.collection.automation.criteria))) {
        expected.add(show.id);
      }
    } catch (error) {
      expected.add("__rule-error__");
    }
  });
  const actual = new Set(detail.memberIds);
  const missing = [...expected].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));
  return {
    criteria: criteriaText(detail.collection),
    expectedCount: expected.has("__rule-error__") ? null : expected.size,
    actualCount: actual.size,
    missing,
    extra,
    matches: !expected.has("__rule-error__") && missing.length === 0 && extra.length === 0,
  };
}

function purposeFit(detail, publishedShows) {
  if (isSimilarity(detail.collection)) {
    return { status: "not-evaluated", fitCount: null, fitShare: null, sampleMismatches: [] };
  }
  if (isRule(detail.collection)) {
    const drift = ruleDrift(detail, publishedShows);
    return {
      status: drift && drift.matches ? "rule-defined" : "rule-drift",
      fitCount: drift && drift.matches ? detail.memberCount : null,
      fitShare: drift && drift.matches ? 1 : null,
      sampleMismatches: [],
    };
  }
  const intents = collectionIntentKeys(detail.collection);
  if (!intents.length && !key(detail.collection.commitment)) {
    return { status: "manual-purpose", fitCount: null, fitShare: null, sampleMismatches: [] };
  }
  const fitIds = [];
  const mismatches = [];
  detail.memberIds.forEach((showId) => {
    const show = detail.showById.get(showId);
    const searchable = new Set([
      ...["genres", "formats", "tones", "themes", "tags", "bestFor"].flatMap((facetId) => [...valuesForShow(show, facetId)]),
      ...["completionStatus", "releaseStatus"].flatMap((facetId) => [...valuesForShow(show, facetId)]),
      ...["voiceStyle", "narrativeFocus", "intensity", "commitment"].flatMap((field) => [...valuesForShow(show, "discovery." + field)]),
    ]);
    const intentMatch = intents.some((intent) => [...aliasesFor(intent)].some((alias) => searchable.has(alias)));
    const commitmentMatch = key(detail.collection.commitment)
      && valuesForShow(show, "discovery.commitment").has(key(detail.collection.commitment));
    if (intentMatch || commitmentMatch) fitIds.push(showId);
    else if (mismatches.length < 5) mismatches.push({ id: showId, title: showTitle(show) });
  });
  return {
    status: "evaluated",
    fitCount: fitIds.length,
    fitShare: detail.memberCount ? fitIds.length / detail.memberCount : 1,
    sampleMismatches: mismatches,
  };
}

function collectionFlags(detail, publishedShows, membership) {
  const flags = [];
  const count = detail.memberCount;
  const kind = detail.kind;
  const sparseMinimum = kind === "similarity" ? 5 : kind === "rule-based" ? 4 : 8;
  if (count < sparseMinimum) flags.push("too-sparse");
  if (isCurated(detail.collection) && count >= 50) flags.push("large-collection-review");
  if (isCurated(detail.collection) && count >= Math.max(80, Math.ceil(publishedShows.length * 0.1))) {
    flags.push("too-broad-review");
  }
  const fit = purposeFit(detail, publishedShows);
  if (fit.status === "evaluated" && fit.fitShare < 0.5) flags.push("purpose-fit-review");
  if (fit.status === "evaluated" && fit.fitShare < 0.75 && fit.fitShare >= 0.5) flags.push("mixed-purpose-review");
  const drift = ruleDrift(detail, publishedShows);
  if (drift && !drift.matches) flags.push("rule-membership-drift");
  const minimum = Number(detail.collection.automation && detail.collection.automation.minMatches);
  if (Number.isFinite(minimum) && count < minimum) flags.push("below-declared-minimum");
  if (detail.reasonCoverage < 1) flags.push("missing-member-reasons");
  if (detail.invalidIds.length || detail.duplicateIds.length || detail.invalidCoverIds.length || detail.anchorInMembers) {
    flags.push("structural-reference-error");
  }
  if (!isSimilarity(detail.collection) && !isRule(detail.collection) && !text(detail.collection.description)) {
    flags.push("missing-purpose-description");
  }
  return { flags, fit, drift };
}

function buildCollectionRows(index, publishedShows, generatedCollectionIds = new Set()) {
  return index.details.map((detail) => {
    const assessment = collectionFlags(detail, publishedShows, index);
    return {
      id: detail.id,
      title: detail.title,
      kind: detail.kind,
      provenance: generatedCollectionIds.has(detail.id) ? "generated-runtime" : "authored-source",
      memberCount: detail.memberCount,
      memberShare: percent(detail.memberCount, publishedShows.length),
      reasonCoverage: round(detail.reasonCoverage, 3),
      anchorShowId: detail.anchorId || null,
      criteria: criteriaText(detail.collection) || null,
      intentTags: unique(detail.collection.intentTags),
      commitment: text(detail.collection.commitment) || null,
      flags: assessment.flags,
      purposeFit: {
        status: assessment.fit.status,
        fitCount: assessment.fit.fitCount,
        fitShare: assessment.fit.fitShare === null ? null : round(assessment.fit.fitShare, 3),
        sampleMismatches: assessment.fit.sampleMismatches,
      },
      ruleDrift: assessment.drift,
      memberIds: detail.memberIds,
    };
  }).sort((left, right) => right.memberCount - left.memberCount || left.title.localeCompare(right.title, "en"));
}

function buildOverlap(index) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < index.details.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < index.details.length; rightIndex += 1) {
      const left = index.details[leftIndex];
      const right = index.details[rightIndex];
      const metrics = overlap(left.memberIds, right.memberIds);
      if (metrics.shared < 3) continue;
      const flags = [];
      if (metrics.shared >= 4 && metrics.jaccard >= 0.75) flags.push("near-duplicate-review");
      else if (metrics.shared >= 5 && metrics.overlapCoefficient >= 0.8) flags.push("contained-core-review");
      else if (metrics.shared >= 15 && metrics.jaccard >= 0.3) flags.push("large-common-core-review");
      pairs.push({
        leftId: left.id,
        leftTitle: left.title,
        leftKind: left.kind,
        leftCount: left.memberCount,
        rightId: right.id,
        rightTitle: right.title,
        rightKind: right.kind,
        rightCount: right.memberCount,
        shared: metrics.shared,
        jaccard: round(metrics.jaccard),
        overlapCoefficient: round(metrics.overlapCoefficient),
        flags,
      });
    }
  }
  return pairs.sort((left, right) => right.shared - left.shared || right.jaccard - left.jaccard || left.leftTitle.localeCompare(right.leftTitle, "en"));
}

function buildFacetCoverage(publishedShows, index) {
  return FACETS.map((facet) => {
    const values = new Map();
    publishedShows.forEach((show) => {
      facetValues(show, facet.id).forEach((entry) => {
        const current = values.get(entry.key) || { key: entry.key, value: entry.value, showIds: new Set() };
        current.showIds.add(show.id);
        values.set(entry.key, current);
      });
    });

    const rows = [...values.values()]
      .filter((entry) => entry.showIds.size >= MIN_FACET_SHOWS)
      .map((entry) => {
        const anyIds = new Set();
        const directIds = new Set();
        const directCollectionIds = [];
        index.details.forEach((detail) => {
          const members = detail.memberIds.filter((showId) => entry.showIds.has(showId));
          if (members.length) members.forEach((showId) => anyIds.add(showId));
          if (members.length && directCollectionSupports(detail.collection, facet.id, entry.key)) {
            members.forEach((showId) => directIds.add(showId));
            directCollectionIds.push(detail.id);
          }
        });
        const anyCoverage = anyIds.size / entry.showIds.size;
        const directCoverage = directIds.size / entry.showIds.size;
        let surface = "gap";
        if (anyIds.size === 0) surface = "gap";
        else if (directIds.size === 0) surface = "indirect-only";
        else if (directCoverage >= 0.5) surface = "strong";
        else surface = "partial";
        return {
          key: entry.key,
          value: entry.value,
          showCount: entry.showIds.size,
          anyCount: anyIds.size,
          anyCoverage: round(anyCoverage, 3),
          directCount: directIds.size,
          directCoverage: round(directCoverage, 3),
          directCollectionIds,
          surface,
        };
      })
      .sort((left, right) => right.showCount - left.showCount || left.value.localeCompare(right.value, "en"));
    return {
      id: facet.id,
      label: facet.label,
      rawValueCount: values.size,
      suppressedLowFrequencyValueCount: [...values.values()].filter((entry) => entry.showIds.size < MIN_FACET_SHOWS).length,
      values: rows,
      strongValues: rows.filter((row) => row.surface === "strong").map((row) => row.value),
      partialValues: rows.filter((row) => row.surface === "partial").map((row) => row.value),
      indirectOnlyValues: rows.filter((row) => row.surface === "indirect-only").map((row) => row.value),
      gapValues: rows.filter((row) => row.surface === "gap").map((row) => row.value),
    };
  });
}

function exactRuleCombination(detail, clauses) {
  if (!isRule(detail.collection)) return false;
  const actual = criteriaClauses(detail.collection)
    .map((clause) => [key(clause.field), key(clause.operator || "includes"), key(clause.value)].join("|"));
  return clauses.every((clause) => actual.includes([key(clause.field), "includes", key(clause.value)].join("|"))
    || actual.includes([key(clause.field), "equals", key(clause.value)].join("|")));
}

function nearestCollection(memberIds, index) {
  let nearest = null;
  index.details.forEach((detail) => {
    const metrics = overlap(memberIds, detail.memberIds);
    if (!nearest || metrics.jaccard > nearest.jaccard || (metrics.jaccard === nearest.jaccard && metrics.shared > nearest.shared)) {
      nearest = { id: detail.id, title: detail.title, kind: detail.kind, ...metrics };
    }
  });
  return nearest;
}

function candidateConfidence(memberIds, showById) {
  const sourceComplete = memberIds.filter((id) => showById.has(id)).length;
  const reviewed = memberIds.filter((id) => showById.get(id) && key(showById.get(id).reviewStatus) !== "imported").length;
  const reviewedShare = memberIds.length ? reviewed / memberIds.length : 0;
  return {
    sourceFieldCoverage: memberIds.length ? sourceComplete / memberIds.length : 0,
    reviewedShare: round(reviewedShare),
    label: reviewedShare >= 0.5 ? "strong" : reviewedShare >= 0.25 ? "mixed" : "source-only",
  };
}

function buildOpportunity(memberIds, label, routeType, clauses, index, showById) {
  const existing = index.details.find((detail) => exactRuleCombination(detail, clauses));
  const nearest = nearestCollection(memberIds, index);
  const confidence = candidateConfidence(memberIds, showById);
  const maxJaccard = nearest ? nearest.jaccard : 0;
  const directDistinctness = maxJaccard < 0.75;
  const inSizeBand = memberIds.length >= OPPORTUNITY_MIN_MEMBERS && memberIds.length <= OPPORTUNITY_MAX_MEMBERS;
  const score = (inSizeBand ? 3 : 0)
    + (!existing ? 2 : 0)
    + (directDistinctness ? 2 : 0)
    + (confidence.reviewedShare >= 0.5 ? 1 : 0)
    + (memberIds.length >= 12 ? 1 : 0);
  return {
    id: routeType + "-" + clauses.map((clause) => key(clause.value)).join("-"),
    label,
    routeType,
    memberCount: memberIds.length,
    showIds: memberIds,
    clauses,
    existingCollectionId: existing ? existing.id : null,
    nearestCollection: nearest,
    metadataConfidence: confidence,
    userIntent: routeType === "status-genre"
      ? "I want a " + label.toLowerCase() + " story."
      : "I want a " + label.toLowerCase() + " listening route.",
    stabilityProxy: inSizeBand && confidence.sourceFieldCoverage === 1 ? "current-field-stable" : "needs-review",
    semanticDistinctness: directDistinctness ? "distinct-enough-for-review" : "high-overlap",
    score,
    shortlist: !existing && inSizeBand && directDistinctness,
  };
}

function buildOpportunities(publishedShows, index) {
  const showById = new Map(publishedShows.map((show) => [show.id, show]));
  const genres = new Map();
  const statuses = new Map();
  const formats = new Map();
  publishedShows.forEach((show) => {
    facetValues(show, "genres").forEach((entry) => genres.set(entry.key, entry.value));
    facetValues(show, "completionStatus").forEach((entry) => statuses.set(entry.key, entry.value));
    facetValues(show, "formats").forEach((entry) => formats.set(entry.key, entry.value));
  });
  const candidates = [];
  const rejected = { tooSparse: 0, tooBroad: 0, existing: 0, highOverlap: 0 };

  const addPattern = (routeType, firstFacet, firstValue, secondFacet, secondValue, label) => {
    const ids = publishedShows
      .filter((show) => hasFacetValue(show, firstFacet, firstValue) && hasFacetValue(show, secondFacet, secondValue))
      .map((show) => show.id);
    if (ids.length < OPPORTUNITY_MIN_MEMBERS) {
      rejected.tooSparse += 1;
      return;
    }
    if (ids.length > OPPORTUNITY_MAX_MEMBERS) {
      rejected.tooBroad += 1;
      return;
    }
    const clauses = [
      { field: firstFacet, operator: "includes", value: firstValue },
      { field: secondFacet, operator: "includes", value: secondValue },
    ];
    const opportunity = buildOpportunity(ids, label, routeType, clauses, index, showById);
    if (opportunity.existingCollectionId) {
      rejected.existing += 1;
      return;
    }
    if (opportunity.semanticDistinctness === "high-overlap") {
      rejected.highOverlap += 1;
      return;
    }
    candidates.push(opportunity);
  };

  [...statuses.entries()].forEach(([statusKey, statusValue]) => {
    [...genres.entries()].forEach(([genreKey, genreValue]) => {
      addPattern(
        "status-genre",
        "completionStatus",
        statusValue,
        "genres",
        genreValue,
        statusValue + " " + genreValue,
      );
    });
  });
  [...formats.entries()].forEach(([formatKey, formatValue]) => {
    [...genres.entries()].forEach(([genreKey, genreValue]) => {
      addPattern(
        "format-genre",
        "formats",
        formatValue,
        "genres",
        genreValue,
        formatValue + " " + genreValue,
      );
    });
  });

  candidates.sort((left, right) => right.score - left.score || right.memberCount - left.memberCount || left.label.localeCompare(right.label, "en"));
  return {
    minMembers: OPPORTUNITY_MIN_MEMBERS,
    maxMembers: OPPORTUNITY_MAX_MEMBERS,
    generatedDimensions: ["completionStatus + genres", "formats + genres"],
    deliberatelyExcludedDimensions: [
      "Shows Like similarity ranking",
      "free-text settings without a controlled taxonomy",
      "discovery.voiceStyle and discovery.narrativeFocus until the rule engine supports them",
    ],
    candidates,
    shortlist: candidates.filter((candidate) => candidate.shortlist).slice(0, 12),
    rejected,
  };
}

function buildMembershipQuality(index, rows) {
  const errors = [...index.errors];
  rows.filter((row) => row.ruleDrift && !row.ruleDrift.matches).forEach((row) => {
    errors.push({
      collectionId: row.id,
      type: "rule-membership-drift",
      missing: row.ruleDrift.missing,
      extra: row.ruleDrift.extra,
    });
  });
  return {
    errors,
    warnings: index.warnings,
    valid: errors.length === 0,
    errorCount: errors.length,
    warningCount: index.warnings.length,
  };
}

function buildCollectionCatalogueAudit({
  shows = [],
  collections = [],
  sourceCollectionCount = collections.length,
  generatedCollectionCount = 0,
  generatedCollectionIds = [],
} = {}) {
  const publishedShows = shows.filter((show) => !text(show.status) || key(show.status) === "published");
  const index = buildMembershipIndex(collections, publishedShows);
  const rows = buildCollectionRows(index, publishedShows, new Set(generatedCollectionIds));
  const overlaps = buildOverlap(index);
  const coverage = buildFacetCoverage(publishedShows, index);
  const opportunities = buildOpportunities(publishedShows, index);
  const membershipCounts = publishedShows.map((show) => ({
    id: show.id,
    title: showTitle(show),
    collectionCount: (index.membershipsByShow.get(show.id) || []).length,
    reviewStatus: text(show.reviewStatus) || null,
  }));
  const byKind = {};
  rows.forEach((row) => {
    byKind[row.kind] = (byKind[row.kind] || 0) + 1;
  });
  const reviewQueues = {
    structural: rows.filter((row) => row.flags.includes("structural-reference-error") || row.flags.includes("rule-membership-drift")),
    sparse: rows.filter((row) => row.flags.includes("too-sparse")),
    broad: rows.filter((row) => row.flags.includes("too-broad-review") || row.flags.includes("large-collection-review")),
    purposeFit: rows.filter((row) => row.flags.includes("purpose-fit-review") || row.flags.includes("mixed-purpose-review")),
    belowMinimum: rows.filter((row) => row.flags.includes("below-declared-minimum")),
    missingReasons: rows.filter((row) => row.flags.includes("missing-member-reasons")),
    overlap: overlaps.filter((pair) => pair.flags.length > 0),
  };

  return {
    version: REPORT_VERSION,
    readOnly: true,
    showsLikeRankingChanged: false,
    criteria: {
      sparse: {
        curated: "< 8 members",
        ruleBased: "< 4 members",
        similarity: "< 5 alternatives",
      },
      broad: "curated collection with at least 50 members is a large-scale review; at least 10% of the published catalogue is a too-broad review signal",
      purposeFit: "curated intent metadata matches fewer than half of its members",
      overlap: "near-duplicate review requires at least 4 shared members and Jaccard >= 0.75; contained-core review requires at least 5 shared members and overlap coefficient >= 0.8",
      opportunity: OPPORTUNITY_MIN_MEMBERS + "-" + OPPORTUNITY_MAX_MEMBERS + " members, a bounded factual pattern, no exact existing rule, and no high-overlap nearest collection",
    },
    scope: {
      publishedShows: publishedShows.length,
      sourceCollections: sourceCollectionCount,
      generatedCollections: generatedCollectionCount,
      publicCollections: collections.length,
      byKind,
      collectionMembershipEdges: rows.reduce((sum, row) => sum + row.memberCount, 0),
      showsWithAnyCollection: membershipCounts.filter((item) => item.collectionCount > 0).length,
      showsWithoutCollection: membershipCounts.filter((item) => item.collectionCount === 0).length,
      membershipDistribution: Object.fromEntries([...new Set(membershipCounts.map((item) => item.collectionCount))]
        .sort((left, right) => left - right)
        .map((count) => [String(count), membershipCounts.filter((item) => item.collectionCount === count).length])),
    },
    collections: rows,
    overlaps,
    coverage,
    opportunities,
    membershipQuality: buildMembershipQuality(index, rows),
    reviewQueues,
    membershipCounts: membershipCounts.sort((left, right) => left.collectionCount - right.collectionCount || left.title.localeCompare(right.title, "en")),
  };
}

function formatCollectionRow(row) {
  const flags = row.flags.length ? row.flags.join(", ") : "—";
  const purpose = row.purposeFit.fitShare === null ? "n/a" : Math.round(row.purposeFit.fitShare * 100) + "%";
  return "| " + row.title + " (" + row.id + ") | " + row.provenance + " | " + row.kind + " | " + row.memberCount + " | " + purpose + " | " + flags + " |";
}

function formatCollectionCatalogueAudit(report) {
  const lines = [
    "Collection catalogue audit",
    "Read-only, deterministic audit of the authoritative published catalogue.",
    "Scope: " + report.scope.publishedShows + " published shows, " + report.scope.publicCollections + " public collections (" + report.scope.sourceCollections + " authored, " + report.scope.generatedCollections + " generated companions), " + report.scope.collectionMembershipEdges + " membership edges.",
    "Shows Like ranking changed: no.",
    "",
    "## Decision criteria",
    "",
    "- Sparse: " + report.criteria.sparse.curated + "; " + report.criteria.sparse.ruleBased + "; " + report.criteria.sparse.similarity + ".",
    "- Broad: " + report.criteria.broad + ".",
    "- Purpose fit: " + report.criteria.purposeFit + ".",
    "- Overlap: " + report.criteria.overlap + ".",
    "- Generated opportunity: " + report.criteria.opportunity + ".",
    "",
    "## Catalogue inventory",
    "",
    "Kinds: " + Object.entries(report.scope.byKind).map((entry) => entry[0] + "=" + entry[1]).join(", ") + ".",
    "Membership: " + report.scope.showsWithAnyCollection + " shows have at least one collection; " + report.scope.showsWithoutCollection + " have none.",
    "",
    "| Collection | Provenance | Kind | Members | Purpose-fit | Review signals |",
    "| --- | --- | --- | ---: | ---: | --- |",
  ];
  report.collections.forEach((row) => lines.push(formatCollectionRow(row)));

  lines.push("", "## Review queues", "");
  const queue = (label, rows) => {
    lines.push("### " + label);
    if (!rows.length) {
      lines.push("None.");
      return;
    }
    rows.slice(0, 30).forEach((row) => {
      if (row.leftId) {
        lines.push("- " + row.leftTitle + " + " + row.rightTitle + ": shared " + row.shared + ", Jaccard " + row.jaccard + ", overlap coefficient " + row.overlapCoefficient + " (" + row.flags.join(", ") + ").");
      } else {
        lines.push("- " + row.title + " (" + row.id + "): " + row.flags.join(", ") + ".");
      }
    });
  };
  queue("Structural or rule validation", report.reviewQueues.structural);
  queue("Sparse collections", report.reviewQueues.sparse);
  queue("Broad collections", report.reviewQueues.broad);
  queue("Purpose-fit review", report.reviewQueues.purposeFit);
  queue("Below declared minimum", report.reviewQueues.belowMinimum);
  queue("Membership reasons", report.reviewQueues.missingReasons);
  queue("Overlap review", report.reviewQueues.overlap);

  lines.push("", "## Facet coverage", "", "| Facet | Value | Shows | Any collection | Direct route | Surface |", "| --- | --- | ---: | ---: | ---: | --- |");
  report.coverage.forEach((facet) => {
    if (!facet.values.length) {
      lines.push("| " + facet.label + " | — | — | — | — | no repeated value meets the " + MIN_FACET_SHOWS + "-show threshold |");
    }
    facet.values.forEach((row) => {
      lines.push("| " + facet.label + " | " + row.value + " | " + row.showCount + " | " + Math.round(row.anyCoverage * 100) + "% | " + Math.round(row.directCoverage * 100) + "% | " + row.surface + " |");
    });
  });

  lines.push("", "## Conservative missing-route shortlist", "");
  if (!report.opportunities.shortlist.length) lines.push("No bounded opportunity cleared the conservative shortlist criteria.");
  report.opportunities.shortlist.forEach((candidate) => {
    lines.push("- " + candidate.label + ": " + candidate.memberCount + " members; confidence " + candidate.metadataConfidence.label + "; nearest collection " + (candidate.nearestCollection ? candidate.nearestCollection.title : "none") + "; score " + candidate.score + ".");
  });
  lines.push("", "Generated dimensions: " + report.opportunities.generatedDimensions.join("; ") + ".");
  lines.push("Deliberately excluded: " + report.opportunities.deliberatelyExcludedDimensions.join("; ") + ".");

  lines.push("", "## Membership validation", "");
  lines.push("Valid: " + report.membershipQuality.valid + ". Errors: " + report.membershipQuality.errorCount + ". Warnings: " + report.membershipQuality.warningCount + ".");
  lines.push("Use --check for structural errors and rule-membership drift; strategic review flags do not fail the check.");
  lines.push("", "Report version " + report.version + ".");
  return lines.join("\n");
}

module.exports = {
  FACETS,
  MIN_FACET_SHOWS,
  OPPORTUNITY_MAX_MEMBERS,
  OPPORTUNITY_MIN_MEMBERS,
  buildCollectionCatalogueAudit,
  buildFacetCoverage,
  buildMembershipIndex,
  buildOpportunities,
  formatCollectionCatalogueAudit,
  overlap,
};
