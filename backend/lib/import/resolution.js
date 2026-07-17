const { cleanDescription, mergeUniqueStrings, normalizeUrl, trimText } = require("./utils");

const SOURCE_BASE_CONFIDENCE = {
  rss: 0.95,
  website: 0.95,
  apple: 0.75,
  "podcast-index": 0.75,
  inferred: 0.70,
  unstructured: 0.60,
};
const IDENTITY_FIELDS = new Set(["appleCollectionId", "appleUrl", "podcastIndexFeedId", "podcastGuid", "rssUrl"]);
const WEBSITE_OFFICIAL_FIELDS = new Set([
  "websiteUrl", "appleUrl", "spotifyUrl", "youtubeMusicUrl", "amazonMusicUrl", "pocketCastsUrl",
  "patreonUrl", "koFiUrl", "discordUrl", "youtubeUrl", "socialUrls", "people", "funding", "supportUrl",
]);
const MATERIAL_FIELDS = new Set(["title", "creatorName", "podcastGuid", "complete"]);

const SIMPLE_FIELDS = [
  "title", "subtitle", "creatorName", "ownerName", "networkName", "description",
  "rssUrl", "previousRssUrl", "appleUrl", "appleCollectionId", "websiteUrl", "artworkUrl",
  "spotifyUrl", "youtubeMusicUrl", "amazonMusicUrl", "pocketCastsUrl", "patreonUrl", "koFiUrl",
  "discordUrl", "youtubeUrl", "socialUrls", "language", "explicit", "copyright", "categories", "keywords",
  "feedType", "medium", "complete", "podcastGuid", "podcastGuidIsValid", "podcastIndexFeedId",
  "podcastIndexGuid", "episodeCount", "episodeCountObserved", "episodeCountExact", "episodeCounts",
  "scheduledReleaseCount", "firstPublicationDate", "latestPublicationDate", "latestAnyPublicationDate", "nextScheduledPublicationDate",
  "seasonCount", "seasonsObserved", "avgEpisodeMinutes", "medianEpisodeMinutes", "minEpisodeMinutes",
  "maxEpisodeMinutes", "totalObservedHours", "durationCoverage", "cadence", "people", "channelPeople",
  "transcripts", "funding", "supportUrl", "license", "location", "country", "dead", "sourceFormat",
];

function isPresent(value) {
  return value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0) && (typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 0);
}

function stableValue(value) {
  if (typeof value === "string") {
    const url = normalizeUrl(value);
    return (url || trimText(value, 10_000)).toLowerCase().replace(/\s+/g, " ");
  }
  if (Array.isArray(value)) return JSON.stringify(value.map(stableValue).sort());
  if (value && typeof value === "object") return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])));
  return JSON.stringify(value);
}

function sourceConfidence(source, fieldName) {
  if (source.sourceType === "website" && source.normalized?.isSecondaryPage && ["title", "subtitle", "description", "creatorName", "rssUrl", "websiteUrl", "artworkUrl"].includes(fieldName)) return 0.60;
  if (source.sourceType === "website" && source.normalized?.structured === false && !WEBSITE_OFFICIAL_FIELDS.has(fieldName)) return 0.60;
  if (source.sourceType === "apple" && ["appleCollectionId", "appleUrl"].includes(fieldName) && source.normalized?.identityExact !== false) return 0.90;
  if (source.sourceType === "podcast-index" && IDENTITY_FIELDS.has(fieldName)) return 0.90;
  return SOURCE_BASE_CONFIDENCE[source.sourceType] || 0.60;
}

function sourceRank(fieldName, sourceType) {
  const primary = WEBSITE_OFFICIAL_FIELDS.has(fieldName)
    ? ["website", "rss", "apple", "podcast-index"]
    : fieldName === "artworkUrl"
      ? ["rss", "website", "apple", "podcast-index"]
      : ["rss", "podcast-index", "apple", "website"];
  const index = primary.indexOf(sourceType);
  return index < 0 ? primary.length : index;
}

function buildEvidence(sources = [], existingEvidence = []) {
  const values = [];
  sources.forEach((source) => {
    SIMPLE_FIELDS.forEach((fieldName) => {
      let value = source.normalized?.[fieldName];
      if (fieldName === "podcastGuid" && !value) value = source.normalized?.podcastIndexGuid;
      if (!isPresent(value)) return;
      values.push({
        fieldName,
        value,
        normalizedValue: stableValue(value),
        sourceSnapshotId: source.snapshotId || null,
        sourceType: source.sourceType,
        sourceUrl: source.sourceUrl,
        confidence: sourceConfidence(source, fieldName),
        method: source.sourceType === "website" && source.normalized?.structured === false ? "unstructured" : "direct",
        status: "candidate",
        selected: false,
      });
    });
  });
  existingEvidence.filter((item) => item.selected).forEach((item) => values.push({ ...item, confidence: 1, method: "reviewer-selected", status: "selected" }));
  return values;
}

function resolveEvidence(evidence = []) {
  const byField = new Map();
  evidence.forEach((item) => {
    const list = byField.get(item.fieldName) || [];
    list.push(item);
    byField.set(item.fieldName, list);
  });
  const objective = {};
  const conflicts = [];
  const fieldSummary = {};

  byField.forEach((items, fieldName) => {
    const groups = new Map();
    items.forEach((item) => {
      const group = groups.get(item.normalizedValue) || [];
      group.push(item);
      groups.set(item.normalizedValue, group);
    });
    const scored = [...groups.values()].map((group) => {
      const reviewer = group.find((item) => item.selected || item.confidence >= 1);
      const independentSources = new Set(group.map((item) => `${item.sourceType}|${item.sourceUrl}`));
      const base = Math.max(...group.map((item) => item.confidence));
      return {
        value: reviewer?.value ?? group[0].value,
        confidence: reviewer ? 1 : Math.min(0.99, Number((base + (Math.max(0, independentSources.size - 1) * 0.03)).toFixed(2))),
        rank: reviewer ? -1 : Math.min(...group.map((item) => sourceRank(fieldName, item.sourceType))),
        evidence: group,
        method: reviewer ? "reviewer-selected" : independentSources.size > 1 ? "source-agreement" : group[0].method,
      };
    }).sort((left, right) => left.rank - right.rank || right.confidence - left.confidence);
    const selected = scored[0];
    objective[fieldName] = selected.value;
    fieldSummary[fieldName] = {
      confidence: selected.confidence,
      method: selected.method,
      sources: selected.evidence.map((item) => ({ sourceType: item.sourceType, sourceUrl: item.sourceUrl })),
    };
    const highConfidenceAlternatives = scored.filter((item) => item.confidence >= 0.90);
    if (MATERIAL_FIELDS.has(fieldName) && !selected.evidence.some((item) => item.selected) && highConfidenceAlternatives.length > 1) {
      conflicts.push({
        fieldName,
        blocking: true,
        message: `High-confidence sources disagree about ${fieldName}.`,
        options: highConfidenceAlternatives.map((item) => ({ value: item.value, confidence: item.confidence, sources: item.evidence.map((entry) => entry.sourceType) })),
      });
    }
  });

  if (objective.description) objective.description = cleanDescription(objective.description, 4_000);
  objective.categories = mergeUniqueStrings(objective.categories || []);
  objective.keywords = mergeUniqueStrings(objective.keywords || []);
  objective.objectiveSources = mergeUniqueStrings(evidence.map((item) => item.sourceUrl).filter(Boolean));
  return { objective, conflicts, fieldSummary };
}

function resolveSourceFacts(sources = [], existingEvidence = []) {
  const evidence = buildEvidence(sources, existingEvidence);
  const resolved = resolveEvidence(evidence);
  return { ...resolved, evidence };
}

module.exports = { SOURCE_BASE_CONFIDENCE, resolveSourceFacts, stableValue };
