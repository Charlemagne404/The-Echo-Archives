const MAX_PERSONAL_SIMILARITY_MATCHES = 50;
const MAX_POSITION_ADJUSTMENT = 3;
const MAX_PUBLIC_SIMILARITY_PAIR_CACHE_SIZE = 2000;
// A 500-entry Library can contain several hundred weighted anchors. Keep one
// bounded entry per anchor for the current candidate set so repeated searches
// do not churn through the cache and recompute the same similarity matches.
const MAX_CANDIDATE_MATCH_CACHE_SIZE = 512;

const SIGNAL_WEIGHT = Object.freeze({
  saved: 1,
  listening: 1,
  1: -3,
  2: -2,
  3: 0,
  4: 2,
  5: 3,
});

const DIRECT_SHOW_IDENTITY_KINDS = new Set([
  "title-identity",
  "title-alias",
  "partial-title",
  "bounded-typo",
  "bounded-typo-or-prefix",
]);

const ENTITY_INTENT_KINDS = new Set([
  "people-behind",
  "creator-lookup",
  "entity-lookup",
  "entity-alias",
]);

const DIMENSION_PRIORITY = Object.freeze([
  "tone",
  "theme",
  "tag",
  "bestFor",
  "voiceStyle",
  "narrativeFocus",
  "intensity",
  "commitment",
  "format",
  "genre",
]);

const DIMENSION_LABELS = Object.freeze({
  tone: "tone",
  theme: "themes",
  tag: "tags",
  bestFor: "listening context",
  voiceStyle: "voice style",
  narrativeFocus: "narrative focus",
  intensity: "intensity",
  commitment: "listening commitment",
  format: "format",
  genre: "genre",
});

const PERSONAL_RANKING_SECTIONS = Object.freeze(["shows", "computedSimilarity"]);
const PERSONAL_SHOW_SECTIONS = Object.freeze(["shows", "authoredSimilarity", "computedSimilarity"]);
const RECOMMENDATION_SCOPES = new Set(["recommendations", "try-next", "shows-like", "new-to-you"]);

function isDirectShowIdentity(intent) {
  return Boolean(
    intent?.identity?.kind === "show"
      && DIRECT_SHOW_IDENTITY_KINDS.has(intent.kind),
  );
}

function getAnchorWeight(entry) {
  if (Number.isInteger(entry?.rating) && entry.rating >= 1 && entry.rating <= 5) {
    return SIGNAL_WEIGHT[entry.rating];
  }
  if (entry?.state === "saved" || entry?.state === "listening") return SIGNAL_WEIGHT[entry.state];
  return 0;
}

function getMeaningfulDimensions(similarity) {
  const dimensions = Array.isArray(similarity?.dimensions) ? similarity.dimensions : [];
  return dimensions
    .filter((dimension) => dimension?.matched && DIMENSION_LABELS[dimension.id])
    .sort((left, right) => DIMENSION_PRIORITY.indexOf(left.id) - DIMENSION_PRIORITY.indexOf(right.id))
    .slice(0, 2);
}

function getDimensionDescription(dimension) {
  const values = [...new Set((Array.isArray(dimension.reasons) ? dimension.reasons : [])
    .flatMap((reason) => Array.isArray(reason.values) ? reason.values : [])
    .map((value) => String(value).trim())
    .filter(Boolean))]
    .slice(0, 2);
  const label = DIMENSION_LABELS[dimension.id];
  if (!values.length) return label;
  const valueText = values.join(", ");
  if (dimension.id === "tone" || dimension.id === "tag") {
    return `${values.join("/")} ${label}`;
  }
  return `${label} (${valueText.length > 48 ? `${valueText.slice(0, 45).trimEnd()}…` : valueText})`;
}

function getAnchorDescription(entry, show) {
  if (Number.isInteger(entry.rating) && entry.rating >= 1 && entry.rating <= 5) {
    return `${show.title} (rated ${entry.rating}/5)`;
  }
  if (entry.state === "saved") return `${show.title} (saved)`;
  if (entry.state === "listening") return `${show.title} (listening)`;
  return "";
}

function makeReason(dimensions, entry, show, score) {
  const description = getAnchorDescription(entry, show);
  if (!description || !dimensions.length) return "";
  const shared = dimensions.map(getDimensionDescription).join(" and ");
  return score < 0
    ? `Placed lower because it shares ${shared} with ${description}.`
    : `Shares ${shared} with ${description}.`;
}

function uniqueCandidateIds(sections) {
  return [...new Set([
    ...(sections.shows || []).map((entry) => entry.id),
    ...(sections.authoredSimilarity || []).map((entry) => entry.id),
    ...(sections.computedSimilarity || []).map((entry) => entry.id),
    ...(sections.collections || []).map((entry) => entry.id),
    ...(sections.entities || []).map((entry) => entry.id),
  ])];
}

function getPersonalSuppressions(entries, scope) {
  const suppressed = new Set();
  const recommendationContext = RECOMMENDATION_SCOPES.has(scope);
  for (const entry of entries) {
    if (entry.state === "hidden") suppressed.add(entry.showId);
    else if (recommendationContext && entry.state === "dropped") suppressed.add(entry.showId);
    else if (scope === "new-to-you" && entry.state === "finished") suppressed.add(entry.showId);
  }
  return suppressed;
}

function shouldSkipPersonalization(intent, scope) {
  return isDirectShowIdentity(intent)
    || ENTITY_INTENT_KINDS.has(intent?.kind)
    || intent?.surface === "collections-search"
    || intent?.kind === "personal-library-status"
    || scope === "collections"
    || scope === "creator-entity";
}

function buildCandidateAdjustments({ candidateIds, entries, showsById, similarityIndex }) {
  const candidateIdSet = new Set(candidateIds);
  const adjustments = new Map();
  if (!candidateIdSet.size) return adjustments;
  const seenAnchors = new Set();

  for (const entry of entries) {
    if (seenAnchors.has(entry.showId)) continue;
    seenAnchors.add(entry.showId);
    const weight = getAnchorWeight(entry);
    const anchor = showsById.get(entry.showId);
    if (!weight || !anchor) continue;

    const matches = similarityIndex.getPublicSimilarityMatches(entry.showId);
    for (const match of matches) {
      const candidateId = match?.show?.id;
      if (!candidateId || candidateId === entry.showId || !candidateIdSet.has(candidateId)) continue;
      const dimensions = getMeaningfulDimensions(match.similarity);
      if (dimensions.length < 2) continue;
      const contribution = weight * Math.min(dimensions.length, 3) / 2;
      const current = adjustments.get(candidateId) || { score: 0, signals: [] };
      current.score += contribution;
      current.signals.push({ contribution, reason: makeReason(dimensions, entry, anchor, contribution) });
      adjustments.set(candidateId, current);
    }
  }

  for (const adjustment of adjustments.values()) {
    adjustment.score = Math.max(-MAX_POSITION_ADJUSTMENT, Math.min(MAX_POSITION_ADJUSTMENT, adjustment.score));
    const direction = Math.sign(adjustment.score);
    adjustment.reason = adjustment.signals
      .filter((signal) => Math.sign(signal.contribution) === direction && signal.reason)
      .sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution) || left.reason.localeCompare(right.reason, "en"))[0]?.reason || "";
    delete adjustment.signals;
  }
  return adjustments;
}

function cachePublicValue(cache, key, value, maximumSize) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > maximumSize) cache.delete(cache.keys().next().value);
  return value;
}

function reorderCandidates(entries, adjustments) {
  if (entries.length < 2 || !adjustments.size) return { entries, changed: false };
  const ranked = entries.map((entry, index) => ({ entry, index, adjustment: adjustments.get(entry.id) || { score: 0, reason: "" } }));
  ranked.sort((left, right) => {
    const leftRank = left.index - left.adjustment.score;
    const rightRank = right.index - right.adjustment.score;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.adjustment.score !== right.adjustment.score) return right.adjustment.score - left.adjustment.score;
    return left.index - right.index;
  });

  let changed = false;
  const nextEntries = ranked.map(({ entry, index, adjustment }, nextIndex) => {
    if (nextIndex === index) {
      if (!Object.hasOwn(entry, "personalizationReason")) return entry;
      changed = true;
      const clean = { ...entry };
      delete clean.personalizationReason;
      return clean;
    }
    changed = true;
    const nextEntry = { ...entry };
    if ((nextIndex < index && adjustment.score > 0) || (nextIndex > index && adjustment.score < 0)) {
      if (adjustment.reason) nextEntry.personalizationReason = adjustment.reason;
      else delete nextEntry.personalizationReason;
    } else {
      delete nextEntry.personalizationReason;
    }
    return nextEntry;
  });
  return { entries: nextEntries, changed };
}

export function createPersonalDiscoveryPersonalizer({ shows = [], similarityIndex = null, scope = "search" } = {}) {
  const showsById = new Map(shows
    .filter((show) => show && (show.status === undefined || show.status === "published"))
    .map((show) => [show.id, show]));
  const publicSimilarityPairCache = new Map();
  const candidateMatchCache = new Map();

  function getPublicMatchesForCandidates(anchorId, candidateShows) {
    const relevantCandidates = candidateShows.filter((show) => show.id !== anchorId);
    const cacheKey = JSON.stringify([anchorId, relevantCandidates.map((show) => show.id).sort()]);
    if (candidateMatchCache.has(cacheKey)) {
      const cached = candidateMatchCache.get(cacheKey);
      candidateMatchCache.delete(cacheKey);
      candidateMatchCache.set(cacheKey, cached);
      return cached;
    }

    const precomputedCandidates = typeof similarityIndex.compare === "function"
      ? relevantCandidates.map((show) => {
        const pairKey = JSON.stringify([anchorId, show.id]);
        let similarity = publicSimilarityPairCache.get(pairKey);
        if (similarity === undefined) {
          similarity = similarityIndex.compare(anchorId, show.id);
          cachePublicValue(publicSimilarityPairCache, pairKey, similarity, MAX_PUBLIC_SIMILARITY_PAIR_CACHE_SIZE);
        } else {
          publicSimilarityPairCache.delete(pairKey);
          publicSimilarityPairCache.set(pairKey, similarity);
        }
        return { show, similarity };
      })
      : null;
    const matches = similarityIndex.getPublicSimilarityMatches(anchorId, {
      limit: MAX_PERSONAL_SIMILARITY_MATCHES,
      maximumResults: MAX_PERSONAL_SIMILARITY_MATCHES,
      diversify: false,
      ...(precomputedCandidates ? { precomputedCandidates } : {}),
    });
    return cachePublicValue(candidateMatchCache, cacheKey, matches, MAX_CANDIDATE_MATCH_CACHE_SIZE);
  }

  return function personalizeDiscovery({ publicResult, personalContext, intent } = {}) {
    if (
      !publicResult?.sections
        || personalContext?.enabled !== true
        || !Array.isArray(personalContext.entries)
        || !personalContext.entries.length
        || !similarityIndex
        || typeof similarityIndex.getPublicSimilarityMatches !== "function"
        || shouldSkipPersonalization(intent, scope)
    ) return publicResult;

    const effectiveScope = intent?.kind === "similarity" && scope === "search" ? "try-next" : scope;
    const suppressed = getPersonalSuppressions(personalContext.entries, effectiveScope);
    const nextSections = { ...publicResult.sections };
    let sectionsChanged = false;

    for (const sectionName of PERSONAL_SHOW_SECTIONS) {
      const sectionEntries = publicResult.sections[sectionName];
      if (!Array.isArray(sectionEntries)) continue;
      const filtered = sectionEntries.filter((entry) => !suppressed.has(entry.id));
      if (filtered.length !== sectionEntries.length) {
        nextSections[sectionName] = filtered;
        sectionsChanged = true;
      }
    }

    const rankingCandidateIds = PERSONAL_RANKING_SECTIONS
      .flatMap((sectionName) => nextSections[sectionName] || [])
      .map((entry) => entry.id);
    const rankingCandidateShows = [...new Set(rankingCandidateIds)]
      .map((candidateId) => showsById.get(candidateId))
      .filter(Boolean);
    const adjustments = buildCandidateAdjustments({
      candidateIds: rankingCandidateIds,
      entries: personalContext.entries,
      showsById,
      similarityIndex: {
        getPublicSimilarityMatches: (anchorId) => getPublicMatchesForCandidates(anchorId, rankingCandidateShows),
      },
    });

    for (const sectionName of PERSONAL_RANKING_SECTIONS) {
      const sectionEntries = nextSections[sectionName];
      if (!Array.isArray(sectionEntries)) continue;
      const reordered = reorderCandidates(sectionEntries, adjustments);
      if (reordered.changed) {
        nextSections[sectionName] = reordered.entries;
        sectionsChanged = true;
      }
    }

    if (!sectionsChanged) return publicResult;
    const candidateIds = uniqueCandidateIds(nextSections);
    return {
      ...publicResult,
      sections: nextSections,
      candidateIds,
      outcome: candidateIds.length ? publicResult.outcome : "no-results",
    };
  };
}
