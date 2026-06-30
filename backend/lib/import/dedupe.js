const { normalizeTitleCreatorKey, normalizeUrl } = require("./utils");

function buildIdentifierSetFromObjective(objective = {}) {
  const identifiers = {
    rssUrl: normalizeUrl(objective.rssUrl || objective.listenLinks?.rss || ""),
    appleCollectionId: String(
      objective.appleCollectionId ||
        objective.ids?.appleCollectionId ||
        "",
    ).trim(),
    podcastIndexFeedId: String(
      objective.podcastIndexFeedId ||
        objective.ids?.podcastIndexFeedId ||
        "",
    ).trim(),
    podcastIndexGuid: String(
      objective.podcastIndexGuid ||
        objective.ids?.podcastIndexGuid ||
        "",
    ).trim(),
    titleCreatorKey: normalizeTitleCreatorKey(objective.title, objective.creatorName),
  };

  return identifiers;
}

function buildIdentifierSetFromShow(show = {}) {
  const importIdentifiers = show?.metadata?.importIdentifiers || {};

  return {
    rssUrl: normalizeUrl(show?.listenLinks?.rss || ""),
    appleCollectionId: String(importIdentifiers.appleCollectionId || "").trim(),
    podcastIndexFeedId: String(importIdentifiers.podcastIndexFeedId || "").trim(),
    podcastIndexGuid: String(importIdentifiers.podcastIndexGuid || "").trim(),
    titleCreatorKey: normalizeTitleCreatorKey(
      show.title,
      show.credits?.creatorName || show.creatorName || show.creators?.[0] || "",
    ),
  };
}

function createMatch({ kind, id, title, matchType, confidence }) {
  return {
    kind,
    id,
    title,
    matchType,
    confidence,
  };
}

function compareIdentifiers(target, candidate, kind, id, title) {
  if (!candidate || !target) {
    return [];
  }

  const matches = [];

  if (target.rssUrl && candidate.rssUrl && target.rssUrl === candidate.rssUrl) {
    matches.push(createMatch({ kind, id, title, matchType: "rss-url", confidence: 1 }));
  }

  if (target.appleCollectionId && candidate.appleCollectionId && target.appleCollectionId === candidate.appleCollectionId) {
    matches.push(createMatch({ kind, id, title, matchType: "apple-collection-id", confidence: 0.98 }));
  }

  if (target.podcastIndexFeedId && candidate.podcastIndexFeedId && target.podcastIndexFeedId === candidate.podcastIndexFeedId) {
    matches.push(createMatch({ kind, id, title, matchType: "podcast-index-feed-id", confidence: 0.98 }));
  }

  if (target.podcastIndexGuid && candidate.podcastIndexGuid && target.podcastIndexGuid === candidate.podcastIndexGuid) {
    matches.push(createMatch({ kind, id, title, matchType: "podcast-index-guid", confidence: 0.98 }));
  }

  if (target.titleCreatorKey && candidate.titleCreatorKey && target.titleCreatorKey === candidate.titleCreatorKey) {
    matches.push(createMatch({ kind, id, title, matchType: "title-creator", confidence: 0.9 }));
  }

  return matches;
}

function buildDedupeMatches({ objective = {}, shows = [], candidates = [], currentCandidateId = "" }) {
  const target = buildIdentifierSetFromObjective(objective);
  const existingShows = [];
  const existingCandidates = [];

  (Array.isArray(shows) ? shows : []).forEach((show) => {
    existingShows.push(...compareIdentifiers(target, buildIdentifierSetFromShow(show), "existing-show", show.id, show.title));
  });

  (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate.id !== currentCandidateId)
    .forEach((candidate) => {
      existingCandidates.push(
        ...compareIdentifiers(
          target,
          buildIdentifierSetFromObjective(candidate.objective || {}),
          "candidate",
          candidate.id,
          candidate.title || candidate.objective?.title || candidate.id,
        ),
      );
    });

  const allMatches = [...existingShows, ...existingCandidates].sort((left, right) => right.confidence - left.confidence);

  return {
    hasDuplicateMatch: allMatches.length > 0,
    hasExactMatch: allMatches.some((match) => match.confidence >= 0.98),
    existingShows,
    existingCandidates,
    allMatches,
  };
}

module.exports = {
  buildDedupeMatches,
  buildIdentifierSetFromObjective,
  buildIdentifierSetFromShow,
};
