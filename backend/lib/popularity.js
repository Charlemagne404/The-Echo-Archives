const POPULARITY_CONFIG = Object.freeze({
  modelVersion: 1,
  refreshIntervalMs: 15 * 60 * 1000,
  windows: Object.freeze({ lifetime: 0.45, days90: 0.35, days28: 0.20 }),
  positionClickPriors: Object.freeze({
    "1": 0.10,
    "2-4": 0.065,
    "5-9": 0.04,
    "10-24": 0.02,
    "25+": 0.01,
    unknown: 0.02,
  }),
  positionClickPriorImpressions: 250,
  targetClickLift: 4,
  pageViewPrior: 0.03,
  pageViewPriorCount: 100,
  targetListenRate: 0.20,
  savedStatePrior: 0.005,
  savedStatePriorCount: 200,
  targetSavedRate: 0.05,
  volumeWeights: Object.freeze({
    showOpen: 0.10,
    showPageView: 0.05,
    listenClick: 1.7,
    showSaved: 1.9,
    libraryListening: 1.6,
    libraryFinished: 1.1,
    ratingActivity: 0.8,
    reviewPublished: 1.1,
    helpfulVote: 0.25,
  }),
  volumeSaturationCount: 500,
  community: Object.freeze({
    ratingPriorMean: 7,
    ratingPriorCount: 20,
    ratingVolumeMax: 4,
    ratingVolumeScale: 40,
    ratingQualityMax: 2,
    ratingQualityCeiling: 9,
    reviewPriorMean: 3.5,
    reviewPriorCount: 10,
    reviewVolumeMax: 1.5,
    reviewVolumeScale: 8,
    reviewQualityMax: 0.75,
    reviewQualityCeiling: 5,
    helpfulMax: 0.75,
    helpfulSaturationCount: 25,
  }),
  coldStart: Object.freeze({
    archiveRatingMax: 1.5,
    collectionMembershipMax: 0.45,
    collectionMembershipStep: 0.15,
    freshnessMax: 1.2,
    freshnessHalfLifeDays: 90,
  }),
});

const POSITION_BUCKETS = Object.keys(POPULARITY_CONFIG.positionClickPriors);
const COMMUNITY_SCORE_MAX = POPULARITY_CONFIG.community.ratingVolumeMax +
  POPULARITY_CONFIG.community.ratingQualityMax +
  POPULARITY_CONFIG.community.reviewVolumeMax +
  POPULARITY_CONFIG.community.reviewQualityMax +
  POPULARITY_CONFIG.community.helpfulMax;
const COLD_START_SCORE_MAX = POPULARITY_CONFIG.coldStart.archiveRatingMax +
  POPULARITY_CONFIG.coldStart.collectionMembershipMax +
  POPULARITY_CONFIG.coldStart.freshnessMax;
const POPULARITY_SCORE_SEMANTICS = Object.freeze({
  behavioralMinimum: 0,
  behavioralMaximum: 100,
  communityMaximum: COMMUNITY_SCORE_MAX,
  coldStartMaximum: COLD_START_SCORE_MAX,
  compositeMaximum: 100 + COMMUNITY_SCORE_MAX + COLD_START_SCORE_MAX,
  unit: "internal ranking points, not a percentage",
});

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeNow(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || "");
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function finiteRating(value, minimum, maximum) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= minimum && rating <= maximum ? rating : null;
}

function clamp(value, minimum = 0, maximum = 1) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function getSignal(period, key) {
  return finiteCount(period?.[key]) + finiteCount(period?.[`legacy:${key}`]);
}

function getSurfacePositionSignal(period, name, surface, bucket) {
  return finiteCount(period?.[`${name}:${surface}:${bucket}`]);
}

function getPositionTotal(period, name, surface = "browse") {
  return POSITION_BUCKETS.reduce((sum, bucket) => sum + getSurfacePositionSignal(period, name, surface, bucket), 0);
}

function getOpenCount(period = {}) {
  return Object.entries(asRecord(period)).reduce((sum, [key, value]) => (
    key.startsWith("show_open:") || key.startsWith("legacy:show_open:")
      ? sum + finiteCount(value)
      : sum
  ), 0);
}

function smoothedRate(successes, opportunities, priorMean, priorCount) {
  const safeSuccesses = finiteCount(successes);
  const safeOpportunities = finiteCount(opportunities);
  return (safeSuccesses + priorMean * priorCount) / (safeOpportunities + priorCount);
}

function getClickRateEvidence(period, rawPeriod) {
  let weightedEvidence = 0;
  let observedImpressions = 0;
  const byPosition = {};

  for (const bucket of POSITION_BUCKETS) {
    const impressions = getSurfacePositionSignal(period, "impression", "browse", bucket);
    if (impressions <= 0) continue;
    const opens = getSurfacePositionSignal(period, "show_open", "browse", bucket);
    const rawImpressions = getSurfacePositionSignal(rawPeriod, "impression", "browse", bucket);
    const rawOpens = getSurfacePositionSignal(rawPeriod, "show_open", "browse", bucket);
    const baseline = POPULARITY_CONFIG.positionClickPriors[bucket];
    const posteriorRate = smoothedRate(
      opens,
      impressions,
      baseline,
      POPULARITY_CONFIG.positionClickPriorImpressions,
    );
    const lift = clamp(
      (posteriorRate / baseline - 1) / (POPULARITY_CONFIG.targetClickLift - 1),
    );
    const sampleConfidence = impressions / (impressions + POPULARITY_CONFIG.positionClickPriorImpressions);
    weightedEvidence += lift * sampleConfidence * impressions;
    observedImpressions += impressions;
    byPosition[bucket] = {
      impressions,
      opens,
      rawImpressions,
      rawOpens,
      deduplicatedImpressions: Math.max(0, rawImpressions - impressions),
      deduplicatedOpens: Math.max(0, rawOpens - opens),
      baselineRate: baseline,
      posteriorRate,
      liftEvidence: lift,
      sampleConfidence,
      adjustedEvidence: lift * sampleConfidence,
    };
  }

  return {
    evidence: observedImpressions > 0 ? weightedEvidence / observedImpressions : 0,
    observedImpressions,
    byPosition,
  };
}

function getSurfaceBreakdown(period = {}, rawPeriod = {}) {
  const surfaces = ["browse", "search", "filtered", "search_and_filtered", "collection", "other", "editorial", "unknown"];
  return Object.fromEntries(surfaces.map((surface) => {
    const impressions = getPositionTotal(period, "impression", surface);
    const opens = getPositionTotal(period, "show_open", surface);
    const rawImpressions = getPositionTotal(rawPeriod, "impression", surface);
    const rawOpens = getPositionTotal(rawPeriod, "show_open", surface);
    return [surface, {
      impressions,
      opens,
      rawImpressions,
      rawOpens,
      openRate: impressions > 0 ? rounded(opens / impressions) : null,
    }];
  }));
}

function getEventCountSummary(period = {}) {
  const surfaces = ["browse", "search", "filtered", "search_and_filtered", "collection", "other", "editorial", "unknown"];
  const impressions = surfaces.reduce((sum, surface) => sum + getPositionTotal(period, "impression", surface), 0);
  const browseImpressions = getPositionTotal(period, "impression", "browse");
  const browseOpens = getPositionTotal(period, "show_open", "browse");
  const saves = getSignal(period, "show_saved");
  const listeningStates = getSignal(period, "library_listening");
  const finishedStates = getSignal(period, "library_finished");
  return {
    impressions,
    browseImpressions,
    showOpens: getOpenCount(period),
    browseOpens,
    showPageViews: getSignal(period, "show_page_view"),
    listenClicks: getSignal(period, "listen_click"),
    saves,
    libraryIntent: saves + listeningStates * 0.75 + finishedStates * 0.5,
    ratingActivity: getSignal(period, "rating_submitted") + getSignal(period, "rating_changed"),
    reviewsPublished: getSignal(period, "review_published"),
    helpfulVotes: getSignal(period, "helpful_vote"),
  };
}

function getVolumeEvidence(period) {
  const weights = POPULARITY_CONFIG.volumeWeights;
  const weightedEvents =
    getOpenCount(period) * weights.showOpen +
    getSignal(period, "show_page_view") * weights.showPageView +
    getSignal(period, "listen_click") * weights.listenClick +
    getSignal(period, "show_saved") * weights.showSaved +
    getSignal(period, "library_listening") * weights.libraryListening +
    getSignal(period, "library_finished") * weights.libraryFinished +
    (getSignal(period, "rating_submitted") + getSignal(period, "rating_changed")) * weights.ratingActivity +
    getSignal(period, "review_published") * weights.reviewPublished +
    getSignal(period, "helpful_vote") * weights.helpfulVote;
  return {
    normalized: clamp(Math.log1p(weightedEvents) / Math.log1p(POPULARITY_CONFIG.volumeSaturationCount)),
    weightedEvents,
  };
}

function scorePeriod(period = {}, rawPeriod = {}) {
  const click = getClickRateEvidence(period, rawPeriod);
  const clickRate = click.evidence;
  const pageViews = getSignal(period, "show_page_view");
  const listens = getSignal(period, "listen_click");
  const saves = getSignal(period, "show_saved");
  const listeningStates = getSignal(period, "library_listening");
  const finishedStates = getSignal(period, "library_finished");
  const meaningfulIntent = saves + listeningStates * 0.75 + finishedStates * 0.5;
  const effectiveCounts = getEventCountSummary(period);
  const rawCounts = getEventCountSummary(rawPeriod);
  const listenRate = clamp(
    (smoothedRate(
      listens,
      pageViews,
      POPULARITY_CONFIG.pageViewPrior,
      POPULARITY_CONFIG.pageViewPriorCount,
    ) - POPULARITY_CONFIG.pageViewPrior) /
      (POPULARITY_CONFIG.targetListenRate - POPULARITY_CONFIG.pageViewPrior),
  );
  const saveRate = clamp(
    (smoothedRate(
      meaningfulIntent,
      pageViews,
      POPULARITY_CONFIG.savedStatePrior,
      POPULARITY_CONFIG.savedStatePriorCount,
    ) - POPULARITY_CONFIG.savedStatePrior) /
      (POPULARITY_CONFIG.targetSavedRate - POPULARITY_CONFIG.savedStatePrior),
  );
  const volumeEvidence = getVolumeEvidence(period);
  const volume = volumeEvidence.normalized;
  const normalized = 0.20 * clickRate + 0.30 * listenRate + 0.20 * saveRate + 0.30 * volume;

  return {
    normalized,
    points: 100 * normalized,
    clickRate,
    clickPositionBreakdown: Object.fromEntries(
      Object.entries(click.byPosition).map(([bucket, values]) => [
        bucket,
        Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === "number" ? rounded(value) : value])),
      ]),
    ),
    listenRate,
    saveRate,
    volume,
    weightedEngagementEvents: rounded(volumeEvidence.weightedEvents),
    observedImpressions: click.observedImpressions,
    impressionCount: click.observedImpressions,
    adjustedOpenEvidence: rounded(clickRate),
    showOpens: getOpenCount(period),
    showPageViews: pageViews,
    listenClicks: listens,
    saves,
    listeningStateChanges: listeningStates,
    finishedStateChanges: finishedStates,
    ratingSubmissions: getSignal(period, "rating_submitted"),
    ratingChanges: getSignal(period, "rating_changed"),
    reviewsPublished: getSignal(period, "review_published"),
    helpfulVotes: getSignal(period, "helpful_vote"),
    surfaceBreakdown: getSurfaceBreakdown(period, rawPeriod),
    rawEventCounts: rawCounts,
    rankingEffectiveEventCounts: effectiveCounts,
    deduplicationReductions: Object.fromEntries(Object.entries(rawCounts).map(([key, raw]) => [
      key,
      Math.max(0, raw - (effectiveCounts[key] || 0)),
    ])),
  };
}

function scoreCommunity(community = {}) {
  community = asRecord(community);
  const config = POPULARITY_CONFIG.community;
  const ratingCount = finiteCount(community.ratingCount);
  const ratingSum = finiteCount(community.ratingSum);
  const reviewCount = finiteCount(community.reviewCount);
  const reviewRatingSum = finiteCount(community.reviewRatingSum);
  const helpfulVoteCount = finiteCount(community.helpfulVoteCount);
  const meanRating = ratingCount > 0 ? ratingSum / ratingCount : null;
  const bayesianRating =
    (ratingSum + config.ratingPriorMean * config.ratingPriorCount) /
    (ratingCount + config.ratingPriorCount);
  const meanReviewStars = reviewCount > 0 ? reviewRatingSum / reviewCount : null;
  const bayesianReviewStars =
    (reviewRatingSum + config.reviewPriorMean * config.reviewPriorCount) /
    (reviewCount + config.reviewPriorCount);

  const ratingVolumePoints = config.ratingVolumeMax * (1 - Math.exp(-ratingCount / config.ratingVolumeScale));
  const ratingQualityPoints =
    config.ratingQualityMax * clamp(
      (bayesianRating - config.ratingPriorMean) /
        (config.ratingQualityCeiling - config.ratingPriorMean),
    );
  const reviewVolumePoints = config.reviewVolumeMax * (1 - Math.exp(-reviewCount / config.reviewVolumeScale));
  const reviewQualityPoints =
    config.reviewQualityMax * clamp(
      (bayesianReviewStars - config.reviewPriorMean) /
        (config.reviewQualityCeiling - config.reviewPriorMean),
    );
  const helpfulPoints = config.helpfulMax * clamp(
    Math.log1p(helpfulVoteCount) / Math.log1p(config.helpfulSaturationCount),
  );

  return {
    points: ratingVolumePoints + ratingQualityPoints + reviewVolumePoints + reviewQualityPoints + helpfulPoints,
    ratingCount,
    meanRating,
    bayesianRating,
    ratingVolumePoints,
    ratingQualityPoints,
    reviewCount,
    meanReviewStars,
    bayesianReviewStars,
    reviewVolumePoints,
    reviewQualityPoints,
    helpfulVoteCount,
    helpfulPoints,
  };
}

function scoreColdStart(show = {}, now = new Date()) {
  show = asRecord(show);
  const config = POPULARITY_CONFIG.coldStart;
  const archiveRating = finiteRating(show.finalRating, 0, 10);
  const archiveRatingPoints = archiveRating === null ? 0 : config.archiveRatingMax * archiveRating / 10;
  const collectionCount = Array.isArray(show.collectionIds)
    ? new Set(show.collectionIds.filter((id) => typeof id === "string" && id)).size
    : 0;
  const collectionPoints = Math.min(
    config.collectionMembershipMax,
    Math.min(collectionCount, config.collectionMembershipMax / config.collectionMembershipStep) * config.collectionMembershipStep,
  );
  const catalogTimestamp = Date.parse(String(show.createdAt || ""));
  const nowTimestamp = now instanceof Date ? now.getTime() : Date.parse(String(now || ""));
  const ageDays = Number.isFinite(catalogTimestamp) && Number.isFinite(nowTimestamp)
    ? Math.max(0, (nowTimestamp - catalogTimestamp) / 86_400_000)
    : null;
  const freshnessPoints = ageDays === null
    ? 0
    : config.freshnessMax * Math.pow(0.5, ageDays / config.freshnessHalfLifeDays);

  return {
    points: archiveRatingPoints + collectionPoints + freshnessPoints,
    archiveRating,
    archiveRatingPoints,
    collectionCount,
    collectionPoints,
    freshnessPoints,
    ageDays,
  };
}

function scoreShowPopularity(show, signals = {}, now = new Date()) {
  show = asRecord(show);
  signals = asRecord(signals);
  const periods = asRecord(signals.periods);
  const rawPeriods = asRecord(signals.rawPeriods);
  const lifetime = scorePeriod(periods.lifetime, rawPeriods.lifetime);
  const days90 = scorePeriod(periods.days90, rawPeriods.days90);
  const days28 = scorePeriod(periods.days28, rawPeriods.days28);
  const temporal = POPULARITY_CONFIG.windows.lifetime * lifetime.points +
    POPULARITY_CONFIG.windows.days90 * days90.points +
    POPULARITY_CONFIG.windows.days28 * days28.points;
  const community = scoreCommunity(signals.community);
  const coldStart = scoreColdStart(show, now);
  const score = temporal + community.points + coldStart.points;

  return {
    score: rounded(score),
    modelVersion: POPULARITY_CONFIG.modelVersion,
    scoreSemantics: POPULARITY_SCORE_SEMANTICS,
    components: {
      behavioralPoints: rounded(temporal),
      temporalPoints: rounded(temporal),
      windows: {
        lifetime: { weight: POPULARITY_CONFIG.windows.lifetime, ...lifetime },
        days90: { weight: POPULARITY_CONFIG.windows.days90, ...days90 },
        days28: { weight: POPULARITY_CONFIG.windows.days28, ...days28 },
      },
      community: Object.fromEntries(
        Object.entries(community).map(([key, value]) => [key, typeof value === "number" ? rounded(value) : value]),
      ),
      coldStart: Object.fromEntries(
        Object.entries(coldStart).map(([key, value]) => [key, typeof value === "number" ? rounded(value) : value]),
      ),
      exposureConfidence: lifetime.observedImpressions >= POPULARITY_CONFIG.positionClickPriorImpressions
        ? "established"
        : lifetime.observedImpressions > 0 ? "low" : "none",
    },
  };
}

function compareShowsByScore(left, right, scores) {
  return scores[right.id] - scores[left.id] ||
    String(left.title || "Untitled show").localeCompare(String(right.title || "Untitled show"), "en", { sensitivity: "base" }) ||
    left.id.localeCompare(right.id);
}

function rankScores(catalog, scores) {
  return Object.fromEntries(catalog.slice().sort((left, right) => compareShowsByScore(left, right, scores))
    .map((show, index) => [show.id, index + 1]));
}

function getPercentile(sortedValues, percentile) {
  if (!sortedValues.length) return null;
  const index = Math.max(0, Math.ceil(percentile * sortedValues.length) - 1);
  return sortedValues[index];
}

function createRankingHealth(catalog, diagnostics, signalsByShowId) {
  const scoreValues = Object.values(diagnostics).map(({ score }) => score).sort((left, right) => left - right);
  const positionBuckets = Object.fromEntries(POSITION_BUCKETS.map((bucket) => [bucket, {
    rawImpressions: 0,
    rankingEffectiveImpressions: 0,
    rawOpens: 0,
    rankingEffectiveOpens: 0,
  }]));
  const rawCounts = {};
  const rankingEffectiveCounts = {};
  let showsWithoutBehavior = 0;
  let primarilyColdStartRanked = 0;
  let listenClicks = 0;
  let showPageViews = 0;
  let rawListenClicks = 0;
  let rawShowPageViews = 0;
  let libraryIntent = 0;
  let libraryIntentPageViews = 0;
  let rawLibraryIntent = 0;

  for (const show of catalog) {
    const signals = asRecord(signalsByShowId[show.id]);
    const effectiveLifetime = asRecord(asRecord(signals.periods).lifetime);
    const meaningful = getOpenCount(effectiveLifetime) + getSignal(effectiveLifetime, "listen_click") +
      getSignal(effectiveLifetime, "show_saved") + getSignal(effectiveLifetime, "library_listening") +
      getSignal(effectiveLifetime, "library_finished");
    if (meaningful <= 0) showsWithoutBehavior += 1;

    const component = diagnostics[show.id].components;
    if (component.coldStart.points >= component.behavioralPoints + component.community.points) {
      primarilyColdStartRanked += 1;
    }
    const recent = component.windows.days28;
    for (const [key, values] of Object.entries(recent.rawEventCounts)) {
      rawCounts[key] = (rawCounts[key] || 0) + values;
    }
    for (const [key, values] of Object.entries(recent.rankingEffectiveEventCounts)) {
      rankingEffectiveCounts[key] = (rankingEffectiveCounts[key] || 0) + values;
    }
    listenClicks += recent.listenClicks;
    showPageViews += recent.showPageViews;
    rawListenClicks += recent.rawEventCounts.listenClicks;
    rawShowPageViews += recent.rawEventCounts.showPageViews;
    libraryIntent += recent.libraryIntent;
    libraryIntentPageViews += recent.showPageViews;
    rawLibraryIntent += recent.rawEventCounts.libraryIntent;

    for (const bucket of POSITION_BUCKETS) {
      const click = recent.clickPositionBreakdown[bucket];
      const counts = positionBuckets[bucket];
      if (!click) continue;
      counts.rawImpressions += click.rawImpressions;
      counts.rankingEffectiveImpressions += click.impressions;
      counts.rawOpens += click.rawOpens;
      counts.rankingEffectiveOpens += click.opens;
    }
  }

  for (const counts of Object.values(positionBuckets)) {
    counts.openRate = counts.rankingEffectiveImpressions > 0
      ? rounded(counts.rankingEffectiveOpens / counts.rankingEffectiveImpressions)
      : null;
  }

  const rankMovement = { lifetime: { meanAbsolute: 0, maximum: 0 }, days90: { meanAbsolute: 0, maximum: 0 }, days28: { meanAbsolute: 0, maximum: 0 } };
  for (const windowName of Object.keys(rankMovement)) {
    const windowScores = Object.fromEntries(catalog.map((show) => {
      const component = diagnostics[show.id].components;
      return [show.id, component.windows[windowName].points + component.community.points + component.coldStart.points];
    }));
    const windowRanks = rankScores(catalog, windowScores);
    let totalMovement = 0;
    for (const show of catalog) {
      const movement = Math.abs(windowRanks[show.id] - diagnostics[show.id].rank);
      totalMovement += movement;
      rankMovement[windowName].maximum = Math.max(rankMovement[windowName].maximum, movement);
      diagnostics[show.id].windowRanks[windowName] = windowRanks[show.id];
      diagnostics[show.id].rankMovement[windowName] = windowRanks[show.id] - diagnostics[show.id].rank;
    }
    rankMovement[windowName].meanAbsolute = catalog.length ? rounded(totalMovement / catalog.length) : 0;
  }

  return {
    timeWindow: "days28 for event-rate and surface aggregates; lifetime for catalog behavior coverage",
    catalogShows: catalog.length,
    zeroMeaningfulBehaviorShows: showsWithoutBehavior,
    zeroMeaningfulBehaviorPercent: catalog.length ? rounded(100 * showsWithoutBehavior / catalog.length) : 0,
    primarilyColdStartRankedShows: primarilyColdStartRanked,
    scoreDistribution: {
      minimum: scoreValues.length ? scoreValues[0] : null,
      p25: getPercentile(scoreValues, 0.25),
      median: getPercentile(scoreValues, 0.5),
      p75: getPercentile(scoreValues, 0.75),
      maximum: scoreValues.length ? scoreValues[scoreValues.length - 1] : null,
    },
    recentEventCounts: {
      raw: rawCounts,
      rankingEffective: rankingEffectiveCounts,
      reductions: Object.fromEntries(Object.entries(rawCounts).map(([key, raw]) => [
        key,
        Math.max(0, raw - (rankingEffectiveCounts[key] || 0)),
      ])),
    },
    browsePositionBuckets: positionBuckets,
    recentListenRate: showPageViews > 0 ? rounded(listenClicks / showPageViews) : null,
    recentRawListenRate: rawShowPageViews > 0 ? rounded(rawListenClicks / rawShowPageViews) : null,
    recentLibraryIntentRate: libraryIntentPageViews > 0 ? rounded(libraryIntent / libraryIntentPageViews) : null,
    recentRawLibraryIntentRate: rawShowPageViews > 0 ? rounded(rawLibraryIntent / rawShowPageViews) : null,
    rankMovement,
  };
}

function scoreCatalogPopularity(shows, signalsByShowId = {}, now = new Date()) {
  signalsByShowId = asRecord(signalsByShowId);
  now = normalizeNow(now);
  const catalog = (Array.isArray(shows) ? shows : [])
    .filter((show) => show && typeof show.id === "string" && show.id);
  const diagnostics = Object.fromEntries(catalog.map((show) => [
    show.id,
    scoreShowPopularity(show, signalsByShowId[show.id], now),
  ]));
  const scores = Object.fromEntries(Object.entries(diagnostics).map(([showId, item]) => [showId, item.score]));
  const ranks = rankScores(catalog, scores);
  for (const show of catalog) {
    diagnostics[show.id].rank = ranks[show.id];
    diagnostics[show.id].windowRanks = {};
    diagnostics[show.id].rankMovement = {};
  }
  const rankingHealth = createRankingHealth(catalog, diagnostics, signalsByShowId);
  return {
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    modelVersion: POPULARITY_CONFIG.modelVersion,
    scoreSemantics: POPULARITY_SCORE_SEMANTICS,
    scores,
    diagnostics,
    rankingHealth,
  };
}

function createPopularityService({ analyticsStore, getCatalog, ttlMs = POPULARITY_CONFIG.refreshIntervalMs, clock = () => new Date() }) {
  let cached = null;
  let cacheExpiresAt = 0;

  function getSnapshot({ forceRefresh = false } = {}) {
    const now = normalizeNow(clock());
    const nowMs = now.getTime();
    if (!forceRefresh && cached && nowMs < cacheExpiresAt) return cached;
    const catalog = typeof getCatalog === "function" ? getCatalog() : [];
    const signals = analyticsStore?.getPopularitySignals({ now }) || {};
    cached = scoreCatalogPopularity(catalog, signals, now);
    cacheExpiresAt = nowMs + Math.max(0, Number(ttlMs) || 0);
    return cached;
  }

  return {
    getSnapshot,
    getScores(options) {
      const snapshot = getSnapshot(options);
      return { generatedAt: snapshot.generatedAt, modelVersion: snapshot.modelVersion, scores: snapshot.scores };
    },
    invalidate() {
      cached = null;
      cacheExpiresAt = 0;
    },
  };
}

module.exports = {
  POPULARITY_CONFIG,
  POPULARITY_SCORE_SEMANTICS,
  createPopularityService,
  scoreCatalogPopularity,
  scoreCommunity,
  scorePeriod,
  scoreShowPopularity,
};
