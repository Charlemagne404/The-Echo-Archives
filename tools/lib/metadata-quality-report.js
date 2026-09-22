const fs = require("node:fs");
const path = require("node:path");

const {
  CANONICAL_GENRES,
  comparableText,
  isNonWebsiteUrl,
} = require("../../shared/archive-quality");
const {
  canonicalizeDiscoveryTag,
  getDiscoveryTaxonomy,
  isDeprecatedDiscoveryTag,
  isRedundantDiscoveryTag,
  normalizeDiscoveryTagKey,
} = require("../../shared/archive-tags");
const { normalizeEntityName } = require("../../shared/archive-entities");
const {
  SHARED_PROVIDER_IDENTITIES_PATH,
  auditProviderIdentityDispositions,
} = require("./provider-identity-dispositions");

const REPORT_VERSION = 2;
const IMPORTED_REVIEW_STATUS = "imported";
const DEFAULT_SAMPLE_LIMIT = 12;
const MIN_USEFUL_COLLECTION_DESCRIPTION_LENGTH = 20;
const SEVERITY_ORDER = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1, info: 0 });
const SEVERITY_SCORE = Object.freeze({ critical: 96, high: 78, medium: 54, low: 30, info: 10 });

const QUALITY_FIELDS = Object.freeze([
  {
    id: "genres",
    label: "genres",
    policy: "factual",
    sparseScope: "enrichmentEligible",
    sparseDescription: "fewer genres than the lower quartile of enrichment-eligible shows",
  },
  {
    id: "themes",
    label: "themes",
    policy: "editorial",
    sparseScope: "enrichmentEligible",
    sparseDescription: "fewer themes than the lower quartile of enrichment-eligible shows",
  },
  {
    id: "tones",
    label: "tones",
    policy: "editorial",
    sparseScope: "enrichmentEligible",
    sparseDescription: "fewer tones than the lower quartile of enrichment-eligible shows",
  },
  {
    id: "formats",
    label: "formats",
    policy: "factual",
    sparseScope: "enrichmentEligible",
    sparseDescription: "fewer formats than the lower quartile of enrichment-eligible shows",
  },
  {
    id: "tags",
    label: "discovery tags",
    policy: "editorial",
    sparseScope: "enrichmentEligible",
    sparseDescription: "fewer tags than the lower quartile of enrichment-eligible shows",
  },
  {
    id: "bestFor",
    label: "best-for routes",
    policy: "editorial",
    sparseScope: "enrichmentEligible",
    sparseDescription: "fewer best-for routes than the lower quartile of enrichment-eligible shows",
  },
  {
    id: "similarTo",
    label: "similar-show links",
    policy: "editorial",
    sparseScope: "enrichmentEligible",
    sparseDescription: "fewer similar-show links than the lower quartile of enrichment-eligible shows",
  },
  {
    id: "entityLinks",
    label: "creator/entity relationships",
    policy: "relationship",
    sparseScope: "selected",
    sparseDescription: "no typed relationship to the entity registry",
  },
]);

const CONTROLLED_ARRAY_FIELDS = Object.freeze({
  genres: [...CANONICAL_GENRES],
  tones: ["dark", "bleak", "tense", "warm", "funny", "chaotic", "hopeful", "cinematic", "weird", "melancholic"],
  formats: ["full-cast", "narrated", "serialized", "episodic", "anthology", "limited-series", "long-running"],
  bestFor: [
    "long-walks",
    "binge-listening",
    "late-night",
    "headphones-on",
    "worldbuilding",
    "easy-entry",
    "serious-sci-fi",
    "funny-space-disasters",
    "cold-isolation-horror",
    "short-under-five-hours",
  ],
});

const GENERIC_TAG_KEYS = new Set([
  "audio",
  "audio drama",
  "audio dramas",
  "audio fiction",
  "arts",
  "drama",
  "fiction",
  "fiction podcast",
  "fiction podcasts",
  "performing arts",
  "podcast",
  "podcasts",
  "scripted fiction",
  "scripted podcast",
  "scripted podcasts",
  "series",
  "show",
  "story",
  "stories",
]);

const BROAD_GENRE_TAG_KEYS = new Set([
  "adventure",
  "comedy",
  "drama",
  "fantasy",
  "horror",
  "mystery",
  "science",
  "sci-fi",
  "supernatural",
  "thriller",
]);

const TAG_GENRE_EXPECTATIONS = Object.freeze({
  adventure: ["adventure"],
  comedy: ["comedy"],
  drama: ["drama"],
  fantasy: ["fantasy"],
  horror: ["horror", "supernatural"],
  mystery: ["mystery"],
  science: ["science", "sci-fi"],
  "sci-fi": ["science", "sci-fi"],
  supernatural: ["horror", "supernatural"],
  thriller: ["thriller"],
});

const SOURCE_CATEGORY_GENRE_ALIASES = Object.freeze({
  adventure: "adventure",
  "adventure fiction": "adventure",
  comedy: "comedy",
  "comedy fiction": "comedy",
  drama: "drama",
  "drama fiction": "drama",
  fantasy: "fantasy",
  "fantasy fiction": "fantasy",
  horror: "horror",
  "horror fiction": "horror",
  mystery: "mystery",
  "mystery fiction": "mystery",
  science: "science",
  "science fiction": "sci-fi",
  "science-fiction": "sci-fi",
  scifi: "sci-fi",
  "sci fi": "sci-fi",
  "sci-fi": "sci-fi",
  supernatural: "supernatural",
  thriller: "thriller",
  "thriller fiction": "thriller",
});

const ENTITY_EVIDENCE_FIELDS = Object.freeze([
  ["creatorId", "creator"],
  ["networkId", "network"],
  ["creators", "creator"],
  ["credits.creatorName", "creator"],
  ["credits.ownerName", "creator"],
  ["credits.productionCompany", "production-company"],
  ["credits.studio", "studio"],
  ["credits.network", "network"],
]);

const PLACEHOLDER_VALUES = new Set([
  "",
  "-",
  "n/a",
  "na",
  "none",
  "not applicable",
  "not available",
  "not verified",
  "tbd",
  "unknown",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

function isMeaningful(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(isMeaningful);
  if (isObject(value)) return Object.values(value).some(isMeaningful);
  return !PLACEHOLDER_VALUES.has(text(value).toLowerCase());
}

function meaningfulArray(value) {
  return Array.isArray(value) ? value.map(text).filter(isMeaningful) : [];
}

function comparableKey(value) {
  return comparableText(String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, ""));
}

function displayKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(numerator, denominator) {
  return denominator > 0 ? round((numerator / denominator) * 100, 1) : null;
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && text(value)))].sort((left, right) => text(left).localeCompare(text(right), "en"));
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function normalizeUrl(value) {
  try {
    const parsed = new URL(text(value));
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch (_error) {
    return text(value).toLowerCase().replace(/\/$/, "");
  }
}

function isValidHttpUrl(value) {
  const candidate = text(value);
  if (!candidate || /\s/.test(candidate)) return false;
  try {
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol) && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch (_error) {
    return false;
  }
}

function safePath(root, relativePath) {
  if (!root || !relativePath || path.isAbsolute(relativePath)) return null;
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(root, relativePath);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`) ? resolvedPath : null;
}

function getArrayCount(record, fieldName) {
  return meaningfulArray(record?.[fieldName]).length;
}

function getValueAtPath(record, pathValue) {
  return String(pathValue || "").split(".").reduce((value, key) => (isObject(value) ? value[key] : undefined), record);
}

function getShowLabel(show = {}) {
  return text(show.title) || text(show.id) || "Untitled show";
}

function getRecordSummary(record, recordType = "show") {
  const id = text(record?.id);
  return {
    id,
    title: recordType === "show" ? getShowLabel(record) : text(record?.title) || id || `Untitled ${recordType}`,
    ...(recordType === "show" ? { status: text(record?.status) || "unknown", reviewStatus: text(record?.reviewStatus) || "unknown" } : {}),
  };
}

function severityScore(severity) {
  return SEVERITY_SCORE[severity] ?? SEVERITY_SCORE.info;
}

function scopeLabel(scope) {
  return {
    selected: "selected shows",
    published: "published shows",
    enrichmentEligible: "published shows eligible for editorial enrichment",
    imported: "published imported shows",
    entities: "selected entities",
    collections: "selected collections",
    taxonomy: "approved discovery taxonomy",
  }[scope] || scope || "selected catalogue";
}

function getTaxonomyEntries(taxonomy) {
  if (Array.isArray(taxonomy)) return taxonomy;
  if (Array.isArray(taxonomy?.tags)) return taxonomy.tags;
  return getDiscoveryTaxonomy().tags;
}

function getTaxonomyMaps(taxonomy) {
  const entries = getTaxonomyEntries(taxonomy);
  const byKey = new Map(entries.map((entry) => [normalizeDiscoveryTagKey(entry?.label), entry]));
  return {
    entries,
    byKey,
    approved: entries.filter((entry) => entry?.status === "approved"),
  };
}

function getScopeSets(shows, includeDrafts) {
  const records = Array.isArray(shows) ? shows.filter(isObject) : [];
  const selected = includeDrafts ? records : records.filter((show) => show.status === "published");
  const published = records.filter((show) => show.status === "published");
  const enrichmentEligible = selected.filter((show) => show.reviewStatus !== IMPORTED_REVIEW_STATUS);
  const imported = selected.filter((show) => show.reviewStatus === IMPORTED_REVIEW_STATUS);
  return { records, selected, published, enrichmentEligible, imported };
}

function buildFieldCoverage(scopes, fieldDefinition) {
  const result = {};
  Object.entries(scopes).forEach(([scopeId, shows]) => {
    const counts = shows.map((show) => getArrayCount(show, fieldDefinition.id));
    const present = counts.filter((count) => count > 0).length;
    result[scopeId] = {
      present,
      missing: shows.length - present,
      percentage: percent(present, shows.length),
      averageCount: shows.length ? round(counts.reduce((sum, count) => sum + count, 0) / shows.length, 2) : 0,
      distribution: Object.fromEntries(
        [...counts.reduce((map, count) => map.set(count, (map.get(count) || 0) + 1), new Map())]
          .sort(([left], [right]) => left - right),
      ),
      lowerQuartile: percentile(counts, 0.25),
    };
  });
  return result;
}

function buildUsageStats(shows, fieldName, taxonomyMaps) {
  const values = new Map();
  shows.forEach((show) => {
    const seenOnShow = new Set();
    meaningfulArray(show[fieldName]).forEach((rawValue) => {
      const canonicalValue = fieldName === "tags" ? canonicalizeDiscoveryTag(rawValue) : rawValue;
      const key = fieldName === "tags" ? normalizeDiscoveryTagKey(canonicalValue) : comparableKey(canonicalValue);
      if (!key || seenOnShow.has(key)) return;
      seenOnShow.add(key);
      if (!values.has(key)) values.set(key, { key, value: canonicalValue, rawValues: new Map(), showIds: new Set() });
      const entry = values.get(key);
      entry.rawValues.set(rawValue, (entry.rawValues.get(rawValue) || 0) + 1);
      entry.showIds.add(show.id);
    });
  });

  const entries = [...values.values()].map((entry) => ({
    key: entry.key,
    value: entry.value,
    count: entry.showIds.size,
    percentage: percent(entry.showIds.size, shows.length),
    affectedIds: [...entry.showIds].sort((left, right) => left.localeCompare(right, "en")),
    rawVariants: [...entry.rawValues.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([rawValue, count]) => ({ value: rawValue, count })),
    taxonomyStatus: fieldName === "tags" ? taxonomyMaps.byKey.get(entry.key)?.status || "unknown" : undefined,
    taxonomyFacet: fieldName === "tags" ? taxonomyMaps.byKey.get(entry.key)?.facet || null : undefined,
  })).sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "en"));

  const overuseThreshold = {
    genres: 0.8,
    formats: 0.6,
    tones: 0.4,
    tags: 0.25,
    themes: 0.15,
    bestFor: 0.5,
    similarTo: 0.2,
  }[fieldName] || 0.5;
  const eligibleForUnderuse = fieldName === "tags" || Object.hasOwn(CONTROLLED_ARRAY_FIELDS, fieldName);

  return {
    field: fieldName,
    showCount: shows.length,
    uniqueValueCount: entries.length,
    topValues: entries.slice(0, 12),
    overusedValues: entries.filter((entry) => shows.length > 0 && entry.count / shows.length >= overuseThreshold),
    underusedValues: eligibleForUnderuse ? entries.filter((entry) => entry.count === 1) : [],
    entries,
    overuseThreshold: round(overuseThreshold * 100, 1),
  };
}

function getLengthQuality(show) {
  const length = isObject(show?.length) ? show.length : {};
  const episodes = Number(length.episodes);
  const fullEpisodes = Number(length.episodeCounts?.full);
  const avgMinutes = Number(length.avgEpisodeMinutes || length.medianEpisodeMinutes);
  const totalHours = Number(length.totalHours || length.totalObservedHours);
  const issues = [];

  ["seasons", "episodes", "avgEpisodeMinutes", "medianEpisodeMinutes", "minEpisodeMinutes", "maxEpisodeMinutes", "totalHours", "totalObservedHours", "durationCoverage"].forEach((fieldName) => {
    if (length[fieldName] === undefined || length[fieldName] === "") return;
    const value = Number(length[fieldName]);
    if (!Number.isFinite(value) || value < 0) issues.push({ code: "invalid-number", field: `length.${fieldName}`, value: length[fieldName] });
  });

  if (episodes > 0 && fullEpisodes > 0 && episodes !== fullEpisodes && !/at-least/i.test(text(length.countQualifier))) {
    issues.push({
      code: "episode-count-discrepancy",
      field: "length.episodes / length.episodeCounts.full",
      values: { episodes, fullEpisodes, countQualifier: text(length.countQualifier) || null },
    });
  }

  if (episodes > 0 && avgMinutes > 0 && totalHours > 0) {
    const expectedHours = (episodes * avgMinutes) / 60;
    const ratio = totalHours / expectedHours;
    if (ratio < 0.5 || ratio > 1.5) {
      issues.push({
        code: "runtime-discrepancy",
        field: "length",
        values: { episodes, avgMinutes, totalHours, expectedHours: round(expectedHours, 2) },
      });
    }
  }

  return issues;
}

function extractEntityEvidence(show) {
  return ENTITY_EVIDENCE_FIELDS.flatMap(([fieldPath, category]) => {
    const raw = getValueAtPath(show, fieldPath);
    const values = Array.isArray(raw) ? raw : [raw];
    return values
      .flatMap((value) => (isObject(value) ? [] : [text(value)]))
      .filter((value) => isMeaningful(value) && !/[|/&,]|\band\b/i.test(value))
      .map((value) => ({ field: fieldPath, category, value }));
  });
}

function extractEntityEvidenceAll(show) {
  return ENTITY_EVIDENCE_FIELDS.flatMap(([fieldPath, category]) => {
    const raw = getValueAtPath(show, fieldPath);
    const values = Array.isArray(raw) ? raw : [raw];
    return values
      .flatMap((value) => (isObject(value) ? [] : [text(value)]))
      .filter((value) => isMeaningful(value))
      .map((value) => ({ field: fieldPath, category, value, compound: /[|/&,]|\band\b/i.test(value) }));
  });
}

function buildEntityIndexes(entities) {
  const byId = new Map();
  const byName = new Map();
  (Array.isArray(entities) ? entities : []).forEach((entity) => {
    if (!isObject(entity) || !text(entity.id)) return;
    byId.set(entity.id, entity);
    [entity.name, ...meaningfulArray(entity.aliases)].forEach((name) => {
      const key = normalizeEntityName(name);
      if (!key) return;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(entity);
    });
  });
  return { byId, byName };
}

function findEntityMatches(value, indexes) {
  const matches = new Map();
  const direct = indexes.byId.get(value);
  if (direct) matches.set(direct.id, direct);
  (indexes.byName.get(normalizeEntityName(value)) || []).forEach((entity) => matches.set(entity.id, entity));
  return [...matches.values()];
}

function buildCollectionIndexes(collections, allShowIds, selectedShowIds) {
  const membershipByShowId = new Map([...selectedShowIds].map((showId) => [showId, new Set()]));
  const records = [];
  (Array.isArray(collections) ? collections : []).forEach((collection) => {
    const rawShowIds = Array.isArray(collection?.showIds) ? collection.showIds.map(text) : [];
    const uniqueShowIds = new Set();
    const validShowIds = [];
    const unknownShowIds = [];
    const outOfScopeShowIds = [];
    const duplicateShowIds = [];

    rawShowIds.forEach((showId) => {
      if (uniqueShowIds.has(showId)) duplicateShowIds.push(showId);
      uniqueShowIds.add(showId);
      if (!allShowIds.has(showId)) unknownShowIds.push(showId);
      else if (!selectedShowIds.has(showId)) outOfScopeShowIds.push(showId);
      else {
        validShowIds.push(showId);
        membershipByShowId.get(showId)?.add(collection.id);
      }
    });

    const reasons = isObject(collection?.showReasons) ? collection.showReasons : {};
    const missingReasonIds = validShowIds.filter((showId) => !isMeaningful(reasons[showId]));
    const reasonKeysOutsideMembership = Object.keys(reasons).filter((showId) => !uniqueShowIds.has(showId));
    const coverShowIds = Array.isArray(collection?.coverShowIds) ? collection.coverShowIds.map(text) : [];
    const invalidCoverShowIds = coverShowIds.filter((showId) => !allShowIds.has(showId) || !uniqueShowIds.has(showId));

    records.push({
      collection,
      rawShowIds,
      validShowIds: sortedUnique(validShowIds),
      unknownShowIds: sortedUnique(unknownShowIds),
      outOfScopeShowIds: sortedUnique(outOfScopeShowIds),
      duplicateShowIds: sortedUnique(duplicateShowIds),
      missingReasonIds: sortedUnique(missingReasonIds),
      reasonKeysOutsideMembership: sortedUnique(reasonKeysOutsideMembership),
      invalidCoverShowIds: sortedUnique(invalidCoverShowIds),
    });
  });

  return { membershipByShowId, records };
}

function getRecommendationProfile(show, membershipCount) {
  const similarTo = meaningfulArray(show.similarTo);
  const similarReasons = isObject(show.similarReasons) ? show.similarReasons : {};
  const signals = [
    { id: "similarShows", label: "at least two similar-show links", value: similarTo.length >= 2 ? 2 : similarTo.length === 1 ? 1 : 0, max: 2 },
    { id: "collectionRoutes", label: "at least one collection route", value: membershipCount > 0 ? 2 : 0, max: 2 },
    { id: "listenerIntent", label: "at least one best-for route", value: getArrayCount(show, "bestFor") > 0 ? 1 : 0, max: 1 },
    {
      id: "distinctiveFacets",
      label: "at least two distinctive discovery facet groups",
      value: ["tags", "themes", "tones"].filter((fieldName) => getArrayCount(show, fieldName) > 0).length >= 2 ? 1 : 0,
      max: 1,
    },
    {
      id: "reasonedLinks",
      label: "every similar-show link has an explanation",
      value: similarTo.length > 0 && similarTo.every((showId) => isMeaningful(similarReasons[showId])) ? 1 : 0,
      max: 1,
    },
  ];
  const score = signals.reduce((sum, signal) => sum + signal.value, 0);
  const maxScore = signals.reduce((sum, signal) => sum + signal.max, 0);
  return {
    id: show.id,
    title: getShowLabel(show),
    score,
    maxScore,
    percentage: percent(score, maxScore),
    level: score === 0 ? "none" : score < 4 ? "thin" : "covered",
    membershipCount,
    similarCount: similarTo.length,
    missingReasonIds: similarTo.filter((showId) => !isMeaningful(similarReasons[showId])),
    signals,
  };
}

function collectUrlCandidates(record, rootPath, candidates = []) {
  if (Array.isArray(record)) {
    record.forEach((value, index) => collectUrlCandidates(value, `${rootPath}[${index}]`, candidates));
    return candidates;
  }
  if (!isObject(record)) return candidates;

  Object.entries(record).forEach(([key, value]) => {
    const currentPath = rootPath ? `${rootPath}.${key}` : key;
    const keyLooksLikeUrl = /(?:url|urls|website|rss|apple|spotify|youtube|discord|patreon|kofi|social|funding|sources)$/i.test(key);
    if (keyLooksLikeUrl) {
      const values = Array.isArray(value) ? value : [value];
      values.forEach((candidate) => {
        if (typeof candidate === "string" && candidate.trim()) candidates.push({ path: currentPath, value: candidate });
      });
      return;
    }
    collectUrlCandidates(value, currentPath, candidates);
  });
  return candidates;
}

function addUrlCandidatesForShow(show, onCandidate) {
  collectUrlCandidates(show.listenLinks, "listenLinks").forEach((candidate) => onCandidate(candidate));
  collectUrlCandidates(show.officialLinks, "officialLinks").forEach((candidate) => onCandidate(candidate));
  collectUrlCandidates(show.officialDescription, "officialDescription").forEach((candidate) => onCandidate(candidate));
  collectUrlCandidates(show.metadata, "metadata").forEach((candidate) => onCandidate(candidate));
  collectUrlCandidates(show.provenance, "provenance").forEach((candidate) => onCandidate(candidate));

  const verificationSource = text(show.verification?.source);
  if (verificationSource.includes("http")) {
    verificationSource.split(/\s*;\s*/).filter(Boolean).forEach((value, index) => onCandidate({ path: `verification.source[${index}]`, value }));
  }
}

function addEntityUrlCandidates(entity, onCandidate) {
  if (text(entity?.website)) onCandidate({ path: "website", value: entity.website });
  meaningfulArray(entity?.sources).forEach((value, index) => onCandidate({ path: `sources[${index}]`, value }));
}

function getFormatEvidence(show) {
  const evidence = [];
  const content = show.content || {};
  const textSources = [
    ["content.framing", content.framing],
    ["content.pov", content.pov],
    ["content.structure", content.structure],
    ["description", show.description],
    ["metadata.importOfficialSummary", show.metadata?.importOfficialSummary],
  ].filter(([, value]) => isMeaningful(value));
  const sourceText = textSources.map(([, value]) => text(value).toLowerCase()).join(" ");
  const candidates = new Map();
  const add = (format, strength, pathValue, marker) => {
    if (!candidates.has(format)) candidates.set(format, []);
    candidates.get(format).push({ path: pathValue, marker, strength });
  };

  textSources.forEach(([pathValue, value]) => {
    const lower = text(value).toLowerCase();
    if (/full[ -]?cast|ensemble|audio theatrical/.test(lower)) add("full-cast", /full[ -]?cast|audio theatrical/.test(lower) ? "strong" : "supporting", pathValue, lower.match(/full[ -]?cast|audio theatrical|ensemble/)?.[0]);
    if (/primarily narrated|narrated|narrator|audio diary|audio journal|first-person (?:audio )?diary/.test(lower)) add("narrated", "supporting", pathValue, lower.match(/primarily narrated|narrated|narrator|audio diary|audio journal|first-person (?:audio )?diary/)?.[0]);
    if (/serialized|serial|limited series|mini-series|season/.test(lower)) add("serialized", "supporting", pathValue, lower.match(/serialized|serial\b|limited series|mini-series|season/)?.[0]);
    if (/anthology|self-contained stories|changing narrators/.test(lower)) add("anthology", "supporting", pathValue, lower.match(/anthology|self-contained stories|changing narrators/)?.[0]);
    if (/episodic|episode-by-episode|case-driven/.test(lower)) add("episodic", "supporting", pathValue, lower.match(/episodic|episode-by-episode|case-driven/)?.[0]);
  });

  if (show.discovery?.voiceStyle === "primarily-acted") add("full-cast", "supporting", "discovery.voiceStyle", "primarily-acted");
  if (show.discovery?.voiceStyle === "primarily-narrated") add("narrated", "supporting", "discovery.voiceStyle", "primarily-narrated");
  if (/full[ -]?cast/.test(sourceText)) evidence.push({ path: "catalogue text", value: "full-cast" });

  return [...candidates.entries()].map(([format, entries]) => ({
    format,
    confidence: entries.some((entry) => entry.strength === "strong") || entries.length >= 2 ? "strong" : "review",
    evidence: entries,
  }));
}

function getGenreEvidence(show, taxonomyMaps) {
  const evidence = [];
  const genres = new Set(meaningfulArray(show.genres).map(displayKey));
  const sourceValues = [
    ...meaningfulArray(show.metadata?.sourceCategories).map((value) => ({ path: "metadata.sourceCategories", value })),
    ...meaningfulArray(show.metadata?.sourceTags).map((value) => ({ path: "metadata.sourceTags", value })),
  ];
  sourceValues.forEach(({ path: sourcePath, value }) => {
    const candidate = SOURCE_CATEGORY_GENRE_ALIASES[displayKey(value)];
    if (candidate && !genres.has(displayKey(candidate))) evidence.push({ path: sourcePath, value, candidate });
  });

  meaningfulArray(show.tags).forEach((tag) => {
    const canonicalTag = canonicalizeDiscoveryTag(tag);
    const candidate = SOURCE_CATEGORY_GENRE_ALIASES[displayKey(canonicalTag)] || SOURCE_CATEGORY_GENRE_ALIASES[displayKey(tag)];
    if (candidate && !genres.has(displayKey(candidate))) evidence.push({ path: "tags", value: tag, candidate });
  });

  const taxonomyGenreTags = meaningfulArray(show.tags)
    .map((tag) => taxonomyMaps.byKey.get(normalizeDiscoveryTagKey(canonicalizeDiscoveryTag(tag))))
    .filter((entry) => entry?.facet === "genre")
    .map((entry) => entry.label);
  taxonomyGenreTags.forEach((value) => {
    const candidate = SOURCE_CATEGORY_GENRE_ALIASES[displayKey(value)];
    if (candidate && !genres.has(displayKey(candidate))) evidence.push({ path: "tags.taxonomyFacet=genre", value, candidate });
  });

  const byCandidate = new Map();
  evidence.forEach((entry) => {
    if (!byCandidate.has(entry.candidate)) byCandidate.set(entry.candidate, []);
    byCandidate.get(entry.candidate).push(entry);
  });
  return [...byCandidate.entries()].map(([candidate, entries]) => ({ candidate, evidence: entries }));
}

function findFieldInference(show, fieldName, taxonomyMaps) {
  const count = getArrayCount(show, fieldName);
  const candidates = [];
  if (fieldName === "genres") return getGenreEvidence(show, taxonomyMaps).map((entry) => ({ candidate: entry.candidate, evidence: entry.evidence }));
  if (fieldName === "formats") return getFormatEvidence(show).map((entry) => ({ candidate: entry.format, confidence: entry.confidence, evidence: entry.evidence }));

  if (fieldName === "themes" && count === 0) {
    const tags = meaningfulArray(show.tags);
    if (tags.length >= 2 && isMeaningful(show.content?.setting || show.content?.sourceMaterial)) {
      candidates.push({
        candidate: "manual theme review",
        confidence: "review",
        evidence: [
          { path: "tags", values: tags },
          { path: "content.setting/sourceMaterial", values: [show.content?.setting, show.content?.sourceMaterial].filter(isMeaningful) },
        ],
      });
    }
  }

  if (fieldName === "tones" && count === 0) {
    const toneTags = meaningfulArray(show.tags).filter((tag) => ["dark", "bleak", "tense", "warm", "funny", "chaotic", "hopeful", "cinematic", "weird", "melancholic"].includes(displayKey(tag)));
    if (toneTags.length > 0) candidates.push({ candidate: "manual tone review", confidence: "review", evidence: [{ path: "tags", values: toneTags }] });
  }

  if (fieldName === "tags" && count === 0 && meaningfulArray(show.metadata?.sourceTags).length > 0) {
    const approvedSourceTags = meaningfulArray(show.metadata.sourceTags).filter((tag) => taxonomyMaps.byKey.get(normalizeDiscoveryTagKey(canonicalizeDiscoveryTag(tag)))?.status === "approved");
    if (approvedSourceTags.length > 0) candidates.push({ candidate: "approved source-tag review", confidence: "review", evidence: [{ path: "metadata.sourceTags", values: approvedSourceTags }] });
  }

  return candidates;
}

function checkRecordArrayDuplicates(show, fieldName) {
  const values = Array.isArray(show?.[fieldName]) ? show[fieldName] : [];
  const seen = new Map();
  values.forEach((value, index) => {
    const key = fieldName === "entityLinks" && isObject(value)
      ? `${text(value.entityId)}:${text(value.role)}`
      : comparableKey(value);
    if (!key) return;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push({ value, index });
  });
  return [...seen.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({ key, entries }));
}

function buildMetadataQualityReport(inputs = {}, options = {}) {
  const includeDrafts = options.includeDrafts === true;
  const sampleLimit = Number.isInteger(options.sampleLimit) && options.sampleLimit > 0 ? options.sampleLimit : DEFAULT_SAMPLE_LIMIT;
  const scopeSets = getScopeSets(inputs.shows, includeDrafts);
  const selectedShows = scopeSets.selected;
  const selectedShowIds = new Set(selectedShows.map((show) => text(show.id)).filter(Boolean));
  const allShowIds = new Set(scopeSets.records.map((show) => text(show.id)).filter(Boolean));
  const entities = Array.isArray(inputs.entities) ? inputs.entities.filter(isObject) : [];
  const collections = Array.isArray(inputs.collections) ? inputs.collections.filter(isObject) : [];
  const taxonomyMaps = getTaxonomyMaps(inputs.taxonomy);
  const entityIndexes = buildEntityIndexes(entities);
  const collectionIndexes = buildCollectionIndexes(collections, allShowIds, selectedShowIds);
  const collectionMembershipCounts = new Map([...selectedShowIds].map((showId) => [showId, collectionIndexes.membershipByShowId.get(showId)?.size || 0]));
  const scopes = {
    selected: selectedShows,
    enrichmentEligible: scopeSets.enrichmentEligible,
    imported: scopeSets.imported,
  };
  const coverage = QUALITY_FIELDS.map((fieldDefinition) => ({
    ...fieldDefinition,
    scopes: buildFieldCoverage(scopes, fieldDefinition),
  }));

  const collector = createIssueCollector({ selectedShows, entities, collections, sampleLimit });
  const issue = collector.add;
  const aggregate = collector.addAggregate;

  const missingFieldCounts = {};
  const sparseThresholds = {};
  coverage.forEach((field) => {
    sparseThresholds[field.id] = field.scopes[field.sparseScope]?.lowerQuartile || 0;
    missingFieldCounts[field.id] = {
      selected: field.scopes.selected.missing,
      enrichmentEligible: field.scopes.enrichmentEligible.missing,
      imported: field.scopes.imported.missing,
    };
  });

  selectedShows.forEach((show) => {
    const isImported = show.reviewStatus === IMPORTED_REVIEW_STATUS;
    QUALITY_FIELDS.forEach((fieldDefinition) => {
      if (fieldDefinition.id === "entityLinks") return;
      const count = getArrayCount(show, fieldDefinition.id);
      const isEditorialPolicyField = fieldDefinition.policy === "editorial";
      const shouldAuditMissing = !isEditorialPolicyField || !isImported;
      if (count === 0 && shouldAuditMissing) {
        const severity = ["genres", "formats"].includes(fieldDefinition.id) ? "high" : fieldDefinition.id === "similarTo" ? "high" : "medium";
        issue({
          groupId: `missing-${fieldDefinition.id}`,
          category: "coverage",
          label: `Shows missing ${fieldDefinition.label}`,
          severity,
          scope: isImported && isEditorialPolicyField ? "imported" : fieldDefinition.policy === "relationship" ? "selected" : "enrichmentEligible",
          denominator: isImported && isEditorialPolicyField ? scopeSets.imported.length : fieldDefinition.policy === "relationship" ? selectedShows.length : scopeSets.enrichmentEligible.length,
          recordType: "show",
          record: show,
          field: fieldDefinition.id,
          evidence: { count: 0, reviewStatus: show.reviewStatus || "unknown" },
          suggestedNextAction: fieldDefinition.id === "similarTo"
            ? "Create a small, evidence-backed recommendation set and require a reason for every link."
            : `Review the show against authoritative catalogue sources and add ${fieldDefinition.label} only when the evidence supports it.`,
          priorityBoost: fieldDefinition.policy === "factual" ? 6 : 0,
        });
      }

      const threshold = sparseThresholds[fieldDefinition.id] || 0;
      if (!isImported && count > 0 && threshold > 0 && count < threshold && fieldDefinition.id !== "entityLinks") {
        issue({
          groupId: `sparse-${fieldDefinition.id}`,
          category: "coverage",
          label: `Shows with unusually sparse ${fieldDefinition.label}`,
          severity: ["genres", "formats"].includes(fieldDefinition.id) ? "medium" : "low",
          scope: "enrichmentEligible",
          denominator: scopeSets.enrichmentEligible.length,
          recordType: "show",
          record: show,
          field: fieldDefinition.id,
          evidence: { count, threshold, thresholdDescription: fieldDefinition.sparseDescription },
          suggestedNextAction: `Review whether ${fieldDefinition.label} is incomplete; preserve a deliberately narrow value set when the source does not support more.`,
        });
      }
    });

    const fieldInferenceTargets = ["themes", "tones", "tags"];
    fieldInferenceTargets.forEach((fieldName) => {
      const count = getArrayCount(show, fieldName);
      if (fieldName === "genres" && count >= (sparseThresholds.genres || 0)) return;
      if (fieldName !== "genres" && count > 0) return;
      const candidates = findFieldInference(show, fieldName, taxonomyMaps);
      candidates.forEach((candidate) => {
        issue({
          groupId: `inferred-${fieldName}-candidate`,
          category: "inference",
          label: `Shows where ${fieldName} may be incomplete despite internal evidence`,
          severity: fieldName === "genres" || fieldName === "formats" ? "high" : "medium",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: fieldName,
          evidence: {
            candidate: candidate.candidate,
            confidence: candidate.confidence || "review",
            sources: candidate.evidence,
          },
          suggestedNextAction: `Manually verify the ${fieldName} against the cited catalogue fields; do not copy raw source keywords without editorial review.`,
          priorityBoost: candidate.confidence === "strong" ? 7 : 0,
          dedupeKey: `${fieldName}:${candidate.candidate}`,
        });
      });
    });

    meaningfulArray(show.tags).forEach((tag) => {
      const canonicalTag = canonicalizeDiscoveryTag(tag);
      const taxonomyEntry = taxonomyMaps.byKey.get(normalizeDiscoveryTagKey(canonicalTag));
      if (canonicalTag !== tag) {
        issue({
          groupId: "noncanonical-discovery-tags",
          category: "taxonomy",
          label: "Discovery tags that do not use canonical naming",
          severity: "high",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "tags",
          evidence: { value: tag, canonicalValue: canonicalTag },
          suggestedNextAction: "Normalize the tag to the approved taxonomy label after confirming the intended meaning.",
        });
      }
      if (!taxonomyEntry) {
        issue({
          groupId: "unapproved-discovery-tags",
          category: "taxonomy",
          label: "Discovery tags outside the approved taxonomy",
          severity: "high",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "tags",
          evidence: { value: tag },
          suggestedNextAction: "Review the tag against the taxonomy; add it to the taxonomy only if it represents a reusable, source-backed discovery concept.",
        });
      } else if (isDeprecatedDiscoveryTag(tag)) {
        issue({
          groupId: "deprecated-discovery-tags",
          category: "taxonomy",
          label: "Discovery tags marked deprecated in the taxonomy",
          severity: "medium",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "tags",
          evidence: { value: tag, taxonomyStatus: taxonomyEntry.status },
          suggestedNextAction: "Choose an approved replacement or explicitly retain the deprecated label with a documented reason.",
        });
      }
      if (isRedundantDiscoveryTag(tag) || GENERIC_TAG_KEYS.has(displayKey(tag))) {
        issue({
          groupId: "generic-discovery-tags",
          category: "taxonomy",
          label: "Suspiciously generic or directory-level discovery tags",
          severity: "medium",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "tags",
          evidence: { value: tag, reason: isRedundantDiscoveryTag(tag) ? "redundant-show-type-tag" : "generic-tag" },
          suggestedNextAction: "Replace with a specific story, setting, hook, framing, or tone tag, or remove it if the broader genre field already carries the meaning.",
        });
      }
    });

    const broadTags = meaningfulArray(show.tags).filter((tag) => BROAD_GENRE_TAG_KEYS.has(displayKey(canonicalizeDiscoveryTag(tag))));
    if (broadTags.length > 0 && broadTags.length === meaningfulArray(show.tags).length && broadTags.length <= 2) {
      issue({
        groupId: "broad-only-discovery-tags",
        category: "taxonomy",
        label: "Shows whose discovery tags are only broad genre labels",
        severity: "low",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "tags",
        evidence: { values: broadTags },
        suggestedNextAction: "Add one or two specific, source-backed discovery signals rather than repeating broad genre labels.",
      });
    }

    Object.keys(CONTROLLED_ARRAY_FIELDS).forEach((fieldName) => {
      const allowed = new Set(CONTROLLED_ARRAY_FIELDS[fieldName]);
      meaningfulArray(show[fieldName]).forEach((value) => {
        const expected = [...allowed].find((candidate) => displayKey(candidate) === displayKey(value));
        if (expected && expected !== value) {
          issue({
            groupId: `inconsistent-${fieldName}-naming`,
            category: "consistency",
            label: `Inconsistent ${fieldName} naming or capitalization`,
            severity: "medium",
            scope: "selected",
            denominator: selectedShows.length,
            recordType: "show",
            record: show,
            field: fieldName,
            evidence: { value, canonicalValue: expected },
            suggestedNextAction: `Normalize ${fieldName} to the controlled value "${expected}" without changing the record's meaning.`,
          });
        }
      });
    });

    ["genres", "tones", "formats", "tags", "bestFor", "similarTo", "aliases", "themes", "contentNotes", "languages", "transcriptLanguages", "entityLinks"].forEach((fieldName) => {
      checkRecordArrayDuplicates(show, fieldName).forEach((duplicate) => {
        issue({
          groupId: `duplicate-${fieldName}-values`,
          category: "redundancy",
          label: `Duplicate values inside ${fieldName}`,
          severity: "high",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: fieldName,
          evidence: { normalizedValue: duplicate.key, entries: duplicate.entries.map((entry) => entry.value) },
          suggestedNextAction: `Remove the duplicate ${fieldName} value after preserving any source or relationship distinction that matters.`,
        });
      });
    });

    const tagGenreOverlap = meaningfulArray(show.tags)
      .map((tag) => normalizeDiscoveryTagKey(canonicalizeDiscoveryTag(tag)))
      .filter((tag) => Object.hasOwn(TAG_GENRE_EXPECTATIONS, tag) && meaningfulArray(show.genres).some((genre) => TAG_GENRE_EXPECTATIONS[tag].map(normalizeDiscoveryTagKey).includes(normalizeDiscoveryTagKey(genre))));
    if (tagGenreOverlap.length > 0) {
      issue({
        groupId: "tag-genre-overlap",
        category: "redundancy",
        label: "Discovery tags that repeat the show's genre metadata",
        severity: "low",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "tags / genres",
        evidence: { values: sortedUnique(tagGenreOverlap) },
        suggestedNextAction: "Keep the overlap only when it serves a deliberate facet; otherwise favor a more specific discovery tag.",
      });
    }

    const similarTo = meaningfulArray(show.similarTo);
    const similarReasons = isObject(show.similarReasons) ? show.similarReasons : {};
    if (similarTo.includes(show.id)) {
      issue({
        groupId: "self-similarity-links",
        category: "consistency",
        label: "Shows that recommend themselves",
        severity: "high",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "similarTo",
        evidence: { showId: show.id },
        suggestedNextAction: "Remove the self-reference and replace it with a distinct, reasoned recommendation if coverage is needed.",
      });
    }
    similarTo.filter((showId) => !allShowIds.has(showId)).forEach((showId) => {
      issue({
        groupId: "unknown-similar-show-links",
        category: "consistency",
        label: "Similarity links that point to unknown shows",
        severity: "high",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "similarTo",
        evidence: { showId },
        suggestedNextAction: "Resolve the show ID or remove the stale relationship; do not leave a broken recommendation route.",
      });
    });
    similarTo.forEach((showId) => {
      if (!isMeaningful(similarReasons[showId])) {
        issue({
          groupId: "similar-links-without-reasons",
          category: "recommendations",
          label: "Similarity links without explanation",
          severity: "high",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "similarReasons",
          evidence: { showId },
          suggestedNextAction: "Write a concise factual/editorial reason for the recommendation or remove the link.",
        });
      }
    });
    Object.keys(similarReasons).filter((showId) => !similarTo.includes(showId)).forEach((showId) => {
      issue({
        groupId: "orphaned-similar-reasons",
        category: "redundancy",
        label: "Similarity reasons without a matching link",
        severity: "high",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "similarReasons",
        evidence: { showId },
        suggestedNextAction: "Remove the orphaned reason or restore the matching similarity link after review.",
      });
    });

    getLengthQuality(show).forEach((lengthIssue) => {
      issue({
        groupId: lengthIssue.code === "episode-count-discrepancy" ? "episode-count-discrepancies" : "runtime-discrepancies",
        category: "consistency",
        label: lengthIssue.code === "episode-count-discrepancy" ? "Shows with conflicting episode counts" : "Shows with internally inconsistent runtime values",
        severity: "high",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: lengthIssue.field,
        evidence: lengthIssue.values || { value: lengthIssue.value },
        suggestedNextAction: "Reconcile the count or runtime against the retained source evidence and preserve the qualifier when the value is only observed.",
      });
    });

    const genreEvidence = getGenreEvidence(show, taxonomyMaps);
    genreEvidence.forEach((candidate) => {
      issue({
        groupId: "genre-evidence-not-in-genres",
        category: "consistency",
        label: "Shows whose own metadata points to an unrepresented genre",
        severity: "high",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "genres",
        evidence: { candidate: candidate.candidate, sources: candidate.evidence },
        suggestedNextAction: "Manually verify the genre signal against the source fields, then add or reject the candidate deliberately.",
        dedupeKey: candidate.candidate,
      });
    });

    const inferredFormats = getFormatEvidence(show).filter((candidate) => !meaningfulArray(show.formats).some((format) => displayKey(format) === displayKey(candidate.format)));
    if (getArrayCount(show, "formats") === 0) {
      inferredFormats.forEach((candidate) => {
        issue({
          groupId: "format-evidence-not-in-formats",
          category: "inference",
          label: "Shows whose own metadata points to a missing format",
          severity: "high",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "formats",
          evidence: { candidate: candidate.format, confidence: candidate.confidence, sources: candidate.evidence },
          suggestedNextAction: "Verify the format from the cited internal fields before adding it; this is a review lead, not an automatic edit.",
          dedupeKey: candidate.format,
          priorityBoost: candidate.confidence === "strong" ? 7 : 0,
        });
      });
    }

    const contentIntensity = displayKey(show.content?.intensity);
    const discoveryIntensity = displayKey(show.discovery?.intensity);
    if (contentIntensity && discoveryIntensity && contentIntensity !== discoveryIntensity && !contentIntensity.includes(discoveryIntensity) && !discoveryIntensity.includes(contentIntensity)) {
      issue({
        groupId: "intensity-field-conflicts",
        category: "consistency",
        label: "Shows with conflicting intensity values",
        severity: "medium",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "content.intensity / discovery.intensity",
        evidence: { contentIntensity: show.content.intensity, discoveryIntensity: show.discovery.intensity },
        suggestedNextAction: "Decide which field is authoritative for the listener-facing intensity signal and document the distinction if both are intentionally retained.",
      });
    }

    const releaseStatus = displayKey(show.releaseStatus);
    const completionStatus = displayKey(show.completionStatus);
    if ((completionStatus === "finished" && releaseStatus === "active") || (completionStatus === "ongoing" && releaseStatus === "completed") || (completionStatus === "ongoing" && releaseStatus === "inactive")) {
      issue({
        groupId: "release-completion-conflicts",
        category: "consistency",
        label: "Shows with conflicting release and completion statuses",
        severity: "medium",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "releaseStatus / completionStatus",
        evidence: { releaseStatus: show.releaseStatus, completionStatus: show.completionStatus },
        suggestedNextAction: "Check the latest source evidence and reconcile lifecycle fields without guessing beyond what the source supports.",
      });
    }
    if (isMeaningful(show.releaseDates?.next) && ["finished", "cancelled"].includes(completionStatus)) {
      issue({
        groupId: "closed-show-next-release-conflicts",
        category: "consistency",
        label: "Closed shows that still have a next-release date",
        severity: "medium",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "releaseDates.next / completionStatus",
        evidence: { next: show.releaseDates.next, completionStatus: show.completionStatus },
        suggestedNextAction: "Verify whether the next date is stale or whether the completion status needs to remain open.",
      });
    }

    const recommendationProfile = getRecommendationProfile(show, collectionMembershipCounts.get(show.id) || 0);
    if (!isImported && recommendationProfile.score < 4) {
      issue({
        groupId: "poor-recommendation-coverage",
        category: "recommendations",
        label: "Enrichment-eligible shows with poor recommendation coverage",
        severity: recommendationProfile.score === 0 ? "high" : "medium",
        scope: "enrichmentEligible",
        denominator: scopeSets.enrichmentEligible.length,
        recordType: "show",
        record: show,
        field: "recommendation coverage",
        evidence: recommendationProfile,
        suggestedNextAction: "Prioritize one or two evidence-backed recommendation routes, a collection membership, or a listener-intent signal; do not pad the graph with weak links.",
        priorityBoost: recommendationProfile.score === 0 ? 8 : 0,
      });
    }

    const entityLinks = Array.isArray(show.entityLinks) ? show.entityLinks : [];
    const evidence = extractEntityEvidenceAll(show);
    const linkedEntityIds = new Set(entityLinks.map((link) => text(link?.entityId)).filter(Boolean));
    const registryMatches = extractEntityEvidence(show).flatMap((entry) => findEntityMatches(entry.value, entityIndexes).map((entity) => ({ ...entry, entityId: entity.id, entityName: entity.name })));
    if (entityLinks.length === 0 && evidence.length > 0) {
      const exact = registryMatches.filter((entry) => !entry.compound);
      issue({
        groupId: exact.length > 0 ? "unlinked-registry-entity-evidence" : "unlinked-legacy-creator-evidence",
        category: "relationships",
        label: exact.length > 0 ? "Shows with legacy creator evidence matching an existing entity" : "Shows with creator or network evidence but no typed entity relationship",
        severity: exact.length > 0 ? "high" : "medium",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "entityLinks",
        evidence: { legacyEvidence: evidence, registryMatches: exact },
        suggestedNextAction: exact.length > 0
          ? "Review the exact registry match and add the deliberate typed relationship if the source identity is confirmed."
          : "Research the retained creator/network evidence and add a typed relationship only after exact identity is verified.",
          priorityBoost: exact.length > 0 ? 8 : 0,
      });
    } else if (entityLinks.length === 0 && !isImported) {
      issue({
        groupId: "unlinked-shows-without-entity-evidence",
        category: "relationships",
        label: "Enrichment-eligible shows with no creator/entity evidence",
        severity: "low",
        scope: "enrichmentEligible",
        denominator: scopeSets.enrichmentEligible.length,
        recordType: "show",
        record: show,
        field: "entityLinks / creator evidence",
        evidence: { legacyEvidence: [] },
        suggestedNextAction: "Treat this as a research lead only; do not create a relationship until an exact source-backed identity is available.",
      });
    }
    if (entityLinks.length > 0) {
      registryMatches.filter((entry) => !linkedEntityIds.has(entry.entityId) && !entry.compound).forEach((entry) => {
        issue({
          groupId: "linked-evidence-conflicts",
          category: "relationships",
          label: "Shows whose legacy creator evidence is not represented by linked entities",
          severity: "medium",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "entityLinks",
          evidence: entry,
          suggestedNextAction: "Check whether the unlinked registry match is a real additional relationship or an intentional legacy display-only value.",
        });
      });
    }

    const importedEditorialFields = [
      "tones",
      "themes",
      "bestFor",
      "similarTo",
      "similarReasons",
      "archiveTake",
      "spoilerFreeReview",
      "thoughts",
      "discovery",
      "ratings.archive",
      "featured",
      "accent",
      "verification.status",
    ];
    if (isImported) {
      const populated = importedEditorialFields.filter((fieldName) => {
        const value = getValueAtPath(show, fieldName);
        if (fieldName === "featured") return value === true;
        if (fieldName === "verification.status") return !["", "automated-source-checked"].includes(text(value).toLowerCase());
        return isMeaningful(value);
      });
      if (populated.length > 0) {
        issue({
          groupId: "imported-editorial-contamination",
          category: "policy",
          label: "Imported factual-only shows carrying editorial fields",
          severity: "high",
          scope: "imported",
          denominator: scopeSets.imported.length,
          recordType: "show",
          record: show,
          field: populated.join(", "),
          evidence: { fields: populated },
          suggestedNextAction: "Route the record through the maintainer/editorial promotion workflow; do not silently treat imported fields as reviewed archive opinion.",
          actionable: false,
        });
      }
    }

    addUrlCandidatesForShow(show, (candidate) => {
      const parts = String(candidate.value || "").split(/\s*;\s*/).filter(Boolean);
      parts.forEach((value, index) => {
        const candidatePath = parts.length > 1 ? `${candidate.path}[${index}]` : candidate.path;
        if (!isValidHttpUrl(value)) {
          issue({
            groupId: "malformed-show-urls",
            category: "assets",
            label: "Shows with malformed or unsafe URLs",
            severity: "high",
            scope: "selected",
            denominator: selectedShows.length,
            recordType: "show",
            record: show,
            field: candidatePath,
            evidence: { value },
            suggestedNextAction: "Verify the URL from the retained source evidence and replace or remove the malformed value.",
          });
        } else if (/(?:^|\.)website(?:Url)?$/i.test(candidatePath) && isNonWebsiteUrl(value)) {
          issue({
            groupId: "non-website-show-urls",
            category: "assets",
            label: "Shows using social or support profiles as website URLs",
            severity: "medium",
            scope: "selected",
            denominator: selectedShows.length,
            recordType: "show",
            record: show,
            field: candidatePath,
            evidence: { value },
            suggestedNextAction: "Move the profile to its appropriate official-link field and retain a real show or publisher website in the website field.",
          });
        }
      });
    });

    if (!text(show.cover)) {
      issue({
        groupId: "missing-cover-assets",
        category: "assets",
        label: "Shows without a cover asset path",
        severity: "high",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "cover",
        evidence: {},
        suggestedNextAction: "Resolve a local cover asset from an approved source and keep the source/provenance record attached.",
      });
    } else if (/^https?:\/\//i.test(text(show.cover))) {
      issue({
        groupId: "external-cover-assets",
        category: "assets",
        label: "Shows whose cover field is still an external URL",
        severity: "medium",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "cover",
        evidence: { value: show.cover },
        suggestedNextAction: "Resolve the cover into the catalogue's local asset path and retain the source URL in provenance.",
      });
    } else if (inputs.siteRoot) {
      const resolvedCover = safePath(inputs.siteRoot, text(show.cover));
      if (!resolvedCover || !fs.existsSync(resolvedCover)) {
        issue({
          groupId: "missing-cover-assets",
          category: "assets",
          label: "Shows whose cover path does not resolve to a local asset",
          severity: "high",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "cover",
          evidence: { value: show.cover, resolvedPath: resolvedCover ? path.relative(inputs.siteRoot, resolvedCover) : null },
          suggestedNextAction: "Repair the local cover path or restore the asset before publishing the record.",
        });
      }
    }
    if (!isMeaningful(show.coverAlt)) {
      issue({
        groupId: "missing-cover-alt-text",
        category: "assets",
        label: "Shows missing cover alt text",
        severity: "medium",
        scope: "selected",
        denominator: selectedShows.length,
        recordType: "show",
        record: show,
        field: "coverAlt",
        evidence: {},
        suggestedNextAction: "Add concise, factual alt text that identifies the cover without inventing visual details.",
      });
    }
  });

  const duplicateCoverGroups = [...selectedShows.reduce((map, show) => {
    const cover = text(show.cover);
    if (!cover) return map;
    if (!map.has(cover)) map.set(cover, []);
    map.get(cover).push(show.id);
    return map;
  }, new Map())].filter(([, ids]) => ids.length > 1);
  duplicateCoverGroups.forEach(([cover, ids]) => {
    aggregate({
      groupId: "duplicate-cover-assets",
      category: "assets",
      label: "Cover assets reused by multiple shows",
      severity: "medium",
      scope: "selected",
      denominator: selectedShows.length,
      recordType: "asset",
      recordId: cover,
      value: cover,
      affectedIds: ids,
      evidence: { cover, showIds: ids },
      suggestedNextAction: "Confirm that the shared asset is intentional; otherwise restore distinct show artwork and update provenance.",
    });
  });

  const providerIdentityAudit = auditProviderIdentityDispositions(scopeSets.records, { selectedShows });
  providerIdentityAudit.invalidDispositions.forEach((entry) => {
    issue({
      groupId: "invalid-provider-identity-dispositions",
      category: "identity",
      label: "Malformed intentional provider-sharing dispositions",
      severity: "critical",
      scope: "selected",
      denominator: selectedShows.length,
      recordType: "provider-disposition",
      recordId: `${entry.owner.id}:${entry.index}`,
      value: entry.identity || entry.provider || entry.declaration,
      affectedIds: [entry.owner.id, ...entry.showIds],
      evidence: {
        path: `${SHARED_PROVIDER_IDENTITIES_PATH}[${entry.index}]`,
        showId: entry.owner.id,
        provider: entry.provider || null,
        identity: entry.identity || null,
        showIds: entry.showIds,
        errors: entry.errors,
      },
      suggestedNextAction: "Repair the reviewed provider-sharing declaration so its provider, identity, reciprocal participants, and current source records all agree; do not use a broad collision exemption.",
    });
  });
  providerIdentityAudit.unresolvedCollisions.forEach((entry) => {
    aggregate({
      groupId: "duplicate-provider-identities",
      category: "identity",
      label: "Provider identities shared by multiple shows",
      severity: "critical",
      scope: "selected",
      denominator: selectedShows.length,
      recordType: "provider-identity",
      recordId: `${entry.field}:${entry.value}`,
      value: entry.value,
      affectedIds: sortedUnique(entry.showIds),
      evidence: { ...entry, dispositionStatus: "unresolved" },
      suggestedNextAction: "Resolve the provider collision before enrichment or publication, or add a reciprocal exact disposition only when the complete current identity group is intentionally shared.",
    });
  });
  providerIdentityAudit.acknowledged.forEach((entry) => {
    aggregate({
      groupId: "documented-shared-provider-identities",
      category: "identity",
      label: "Documented intentional provider identities shared by multiple shows",
      severity: "info",
      scope: "selected",
      denominator: selectedShows.length,
      recordType: "provider-identity",
      recordId: `${entry.field}:${entry.value}`,
      value: entry.value,
      affectedIds: sortedUnique(entry.showIds),
      evidence: {
        ...entry,
        dispositionStatus: "documented-intentional-sharing",
        declarationPath: SHARED_PROVIDER_IDENTITIES_PATH,
      },
      suggestedNextAction: "Keep the reciprocal reviewed disposition and the provider-specific source evidence synchronized when either show or identity changes.",
      actionable: false,
    });
  });

  const duplicateTitleGroups = [...selectedShows.reduce((map, show) => {
    const key = comparableKey(show.title);
    if (!key) return map;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(show.id);
    return map;
  }, new Map())].filter(([, ids]) => ids.length > 1);
  duplicateTitleGroups.forEach(([key, ids]) => {
    aggregate({
      groupId: "duplicate-show-titles",
      category: "identity",
      label: "Shows with duplicate normalized titles",
      severity: "high",
      scope: "selected",
      denominator: selectedShows.length,
      recordType: "title",
      recordId: key,
      value: key,
      affectedIds: ids,
      evidence: { normalizedTitle: key, showIds: ids },
      suggestedNextAction: "Confirm whether the records are distinct works with intentionally shared names; add disambiguating aliases or merge only after editorial review.",
    });
  });

  const usage = {
    selected: Object.fromEntries(QUALITY_FIELDS.filter((field) => !["entityLinks"].includes(field.id)).map((field) => [field.id, buildUsageStats(selectedShows, field.id, taxonomyMaps)])),
    enrichmentEligible: Object.fromEntries(QUALITY_FIELDS.filter((field) => !["entityLinks"].includes(field.id)).map((field) => [field.id, buildUsageStats(scopeSets.enrichmentEligible, field.id, taxonomyMaps)])),
  };
  Object.values(usage.enrichmentEligible).forEach((fieldUsage) => {
    fieldUsage.overusedValues.forEach((entry) => {
      aggregate({
        groupId: `overused-${fieldUsage.field}-values`,
        category: "distribution",
        label: `Extremely overused ${fieldUsage.field} values`,
        severity: "medium",
        scope: "enrichmentEligible",
        denominator: scopeSets.enrichmentEligible.length,
        recordType: "metadata-value",
        recordId: `${fieldUsage.field}:${entry.key}`,
        value: entry.value,
        affectedIds: entry.affectedIds,
        evidence: { field: fieldUsage.field, value: entry.value, count: entry.count, percentage: entry.percentage, threshold: fieldUsage.overuseThreshold },
        suggestedNextAction: `Review whether "${entry.value}" is being used as a catch-all; preserve it when accurate, but improve the field's discriminating values before adding more records.`,
      });
    });
    fieldUsage.underusedValues.forEach((entry) => {
      aggregate({
        groupId: `underused-${fieldUsage.field}-values`,
        category: "distribution",
        label: `Singleton ${fieldUsage.field} values`,
        severity: "low",
        scope: "enrichmentEligible",
        denominator: scopeSets.enrichmentEligible.length,
        recordType: "metadata-value",
        recordId: `${fieldUsage.field}:${entry.key}`,
        value: entry.value,
        affectedIds: entry.affectedIds,
        evidence: { field: fieldUsage.field, value: entry.value, count: entry.count, taxonomyStatus: entry.taxonomyStatus || undefined },
        suggestedNextAction: "Check whether this value is a deliberate one-off signal, a naming variant, or a candidate for a reusable taxonomy term.",
      });
    });
  });

  const taxonomyUsage = usage.selected.tags?.entries || [];
  const usedTaxonomyKeys = new Set(taxonomyUsage.map((entry) => entry.key));
  const unusedApprovedTags = taxonomyMaps.approved.filter((entry) => !usedTaxonomyKeys.has(normalizeDiscoveryTagKey(entry.label))).map((entry) => entry.label).sort((left, right) => left.localeCompare(right, "en"));
  const singletonApprovedTags = taxonomyUsage.filter((entry) => entry.taxonomyStatus === "approved" && entry.count === 1);
  if (unusedApprovedTags.length > 0) {
    aggregate({
      groupId: "unused-approved-tags",
      category: "distribution",
      label: "Approved discovery tags unused by the selected catalogue",
      severity: "low",
      scope: "taxonomy",
      denominator: taxonomyMaps.approved.length,
      recordType: "taxonomy",
      recordId: "approved-tags",
      value: unusedApprovedTags,
      affectedIds: [],
      evidence: { values: unusedApprovedTags, count: unusedApprovedTags.length },
      suggestedNextAction: "Review whether unused terms are still useful vocabulary; do not force them onto shows merely to improve distribution.",
      actionable: false,
    });
  }

  const variantFields = ["genres", "tones", "formats", "tags", "bestFor", "themes", "contentNotes", "languages", "transcriptLanguages"];
  const namingVariants = {};
  variantFields.forEach((fieldName) => {
    const variants = new Map();
    selectedShows.forEach((show) => {
      meaningfulArray(show[fieldName]).forEach((value) => {
        const key = comparableKey(fieldName === "tags" ? canonicalizeDiscoveryTag(value) : value);
        if (!key) return;
        if (!variants.has(key)) variants.set(key, new Map());
        const entry = variants.get(key);
        if (!entry.has(value)) entry.set(value, new Set());
        entry.get(value).add(show.id);
      });
    });
    namingVariants[fieldName] = [...variants.entries()]
      .filter(([, values]) => values.size > 1)
      .map(([key, values]) => {
        const affectedIds = sortedUnique([...values.values()].flatMap((ids) => [...ids]));
        const rawVariants = [...values.entries()].map(([value, ids]) => ({ value, showIds: sortedUnique([...ids]) })).sort((left, right) => left.value.localeCompare(right.value, "en"));
        aggregate({
          groupId: `naming-variants-${fieldName}`,
          category: "consistency",
          label: `Inconsistent naming variants in ${fieldName}`,
          severity: fieldName === "tags" ? "medium" : "low",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "metadata-value",
          recordId: `${fieldName}:${key}`,
          value: rawVariants.map((entry) => entry.value),
          affectedIds,
          evidence: { field: fieldName, normalizedValue: key, variants: rawVariants },
          suggestedNextAction: `Choose one canonical spelling for the ${fieldName} value and update the affected records together.`,
        });
        return { key, variants: rawVariants, affectedIds };
      });
  });

  const importedMissingFields = Object.fromEntries(QUALITY_FIELDS.filter((field) => field.policy === "editorial").map((field) => [field.id, scopeSets.imported.filter((show) => getArrayCount(show, field.id) === 0).map((show) => show.id).sort((left, right) => left.localeCompare(right, "en"))]));
  const importedRecommendationProfiles = scopeSets.imported.map((show) => getRecommendationProfile(show, collectionMembershipCounts.get(show.id) || 0));
  const importedPoorRecommendationIds = importedRecommendationProfiles.filter((profile) => profile.score < 4).map((profile) => profile.id).sort((left, right) => left.localeCompare(right, "en"));
  if (importedPoorRecommendationIds.length > 0) {
    aggregate({
      groupId: "imported-recommendation-policy-gap",
      category: "policy",
      label: "Imported shows with intentionally limited recommendation coverage",
      severity: "medium",
      scope: "imported",
      denominator: scopeSets.imported.length,
      recordType: "show",
      recordId: "imported-recommendation-coverage",
      affectedIds: importedPoorRecommendationIds,
      evidence: {
        policy: "Imported records are factual-only until editorial promotion.",
        profiles: importedRecommendationProfiles.filter((profile) => profile.score < 4).slice(0, sampleLimit),
      },
      suggestedNextAction: "Use this as a promotion/enrichment queue; do not auto-create recommendations or editorial facets for imported records.",
      actionable: false,
    });
  }

  const entityUsage = new Map(entities.map((entity) => [entity.id, { id: entity.id, name: text(entity.name) || entity.id, type: text(entity.type) || "unknown", showIds: new Set(), relationshipCount: 0 }]));
  const invalidEntityLinks = [];
  const linkedShowIds = new Set();
  selectedShows.forEach((show) => {
    const links = Array.isArray(show.entityLinks) ? show.entityLinks : [];
    const seenLinks = new Set();
    links.forEach((link) => {
      const entityId = text(link?.entityId);
      const role = text(link?.role);
      const relationKey = `${entityId}:${role}`;
      if (seenLinks.has(relationKey)) return;
      seenLinks.add(relationKey);
      const entity = entityIndexes.byId.get(entityId);
      if (!entity) {
        invalidEntityLinks.push({ showId: show.id, entityId, role, reason: "unknown-entity" });
        issue({
          groupId: "unknown-entity-links",
          category: "relationships",
          label: "Show relationships pointing to unknown entities",
          severity: "high",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "entityLinks",
          evidence: { entityId, role },
          suggestedNextAction: "Resolve the stable entity ID or remove the stale link after checking the canonical registry.",
        });
        return;
      }
      const usage = entityUsage.get(entityId);
      if (usage) {
        usage.showIds.add(show.id);
        usage.relationshipCount += 1;
        linkedShowIds.add(show.id);
      }
      if (entity.publication !== "public" && show.status === "published") {
        issue({
          groupId: "published-links-to-nonpublic-entities",
          category: "relationships",
          label: "Published shows linked to non-public entities",
          severity: "high",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "entityLinks",
          evidence: { entityId, role, publication: entity.publication },
          suggestedNextAction: "Publish the entity only after its required review/source gate is complete, or remove the public show relationship.",
        });
      }
      if (entity.type === "person" && role !== "creator") {
        issue({
          groupId: "entity-role-type-conflicts",
          category: "relationships",
          label: "Entity relationships whose role conflicts with entity type",
          severity: "high",
          scope: "selected",
          denominator: selectedShows.length,
          recordType: "show",
          record: show,
          field: "entityLinks",
          evidence: { entityId, entityName: entity.name, type: entity.type, role },
          suggestedNextAction: "Confirm the entity type and relationship role; people should use the creator role unless the schema is intentionally extended.",
        });
      }
    });
  });

  const entityRecords = [...entityUsage.values()].map((entry) => ({
    ...entry,
    showIds: [...entry.showIds].sort((left, right) => left.localeCompare(right, "en")),
    showCount: entry.showIds.size,
  })).sort((left, right) => right.showCount - left.showCount || left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id, "en"));
  const orphanEntityIds = entityRecords.filter((entity) => entity.showCount === 0).map((entity) => entity.id);
  orphanEntityIds.forEach((entityId) => {
    const entity = entityRecords.find((record) => record.id === entityId);
    issue({
      groupId: "orphan-entities",
      category: "relationships",
      label: "Public entities with no relationship to a selected show",
      severity: "medium",
      scope: "entities",
      denominator: entities.length,
      recordType: "entity",
      record: entity,
      field: "entityLinks",
      evidence: { entityId, type: entity?.type || "unknown" },
      suggestedNextAction: "Confirm whether the entity is a future catalogue lead; otherwise remove it from the public registry or link it deliberately.",
    });
  });

  const entityNameGroups = new Map();
  entities.forEach((entity) => {
    [entity.name, ...meaningfulArray(entity.aliases)].forEach((name) => {
      const key = normalizeEntityName(name);
      if (!key) return;
      if (!entityNameGroups.has(key)) entityNameGroups.set(key, []);
      entityNameGroups.get(key).push({ entityId: entity.id, name });
    });
  });
  [...entityNameGroups.entries()].filter(([, entries]) => new Set(entries.map((entry) => entry.entityId)).size > 1).forEach(([key, entries]) => {
    aggregate({
      groupId: "duplicate-entity-names",
      category: "relationships",
      label: "Entities sharing a normalized name or alias",
      severity: "high",
      scope: "entities",
      denominator: entities.length,
      recordType: "entity",
      recordId: key,
      value: key,
      affectedIds: sortedUnique(entries.map((entry) => entry.entityId)),
      evidence: { normalizedName: key, entries },
      suggestedNextAction: "Disambiguate the entities or merge them only after confirming they represent the same real-world entity.",
    });
  });

  entities.forEach((entity) => {
    const aliases = meaningfulArray(entity.aliases);
    const normalizedAliases = new Set();
    aliases.forEach((alias) => {
      const key = normalizeEntityName(alias);
      if (normalizedAliases.has(key) || key === normalizeEntityName(entity.name)) {
        issue({
          groupId: "redundant-entity-aliases",
          category: "redundancy",
          label: "Entities with redundant aliases",
          severity: "low",
          scope: "entities",
          denominator: entities.length,
          recordType: "entity",
          record: entity,
          field: "aliases",
          evidence: { alias, entityName: entity.name },
          suggestedNextAction: "Keep aliases only when they improve identity resolution or search; remove exact duplicates of the canonical name.",
        });
      }
      normalizedAliases.add(key);
    });
    addEntityUrlCandidates(entity, (candidate) => {
      if (!isValidHttpUrl(candidate.value)) {
        issue({
          groupId: "malformed-entity-urls",
          category: "assets",
          label: "Entities with malformed or unsafe URLs",
          severity: "high",
          scope: "entities",
          denominator: entities.length,
          recordType: "entity",
          record: entity,
          field: candidate.path,
          evidence: { value: candidate.value },
          suggestedNextAction: "Verify the entity URL from a first-party or approved source and replace or remove the malformed value.",
        });
      }
    });
    if (entity.publication === "public" && (!text(entity.reviewedAt) || !meaningfulArray(entity.sources).length)) {
      issue({
        groupId: "public-entities-without-review-source",
        category: "relationships",
        label: "Public entities without a complete review/source trail",
        severity: "high",
        scope: "entities",
        denominator: entities.length,
        recordType: "entity",
        record: entity,
        field: "reviewedAt / sources",
        evidence: { reviewedAt: entity.reviewedAt || "", sourceCount: meaningfulArray(entity.sources).length },
        suggestedNextAction: "Complete the entity review/source record before exposing the entity as public.",
      });
    }
  });

  collectionIndexes.records.forEach((entry) => {
    const collection = entry.collection;
    const kind = text(collection.kind) || "unknown";
    const validCount = entry.validShowIds.length;
    const reasonCoverage = validCount > 0 ? percent(validCount - entry.missingReasonIds.length, validCount) : 0;
    const isRuleBased = kind === "rule-based";
    const isSimilarity = kind === "similarity";
    const hasUsefulDescription = text(collection.description).length >= MIN_USEFUL_COLLECTION_DESCRIPTION_LENGTH && !/^draft collection summary/i.test(text(collection.description));
    const qualitySignals = {
      description: hasUsefulDescription,
      members: validCount >= 3,
      reasons: validCount > 0 && entry.missingReasonIds.length === 0,
      intent: isRuleBased || meaningfulArray(collection.intentTags).length > 0,
      cover: isRuleBased || meaningfulArray(collection.coverShowIds).length > 0,
      automation: !isRuleBased || isObject(collection.automation),
      anchor: !isSimilarity || (text(collection.anchorShowId) && allShowIds.has(text(collection.anchorShowId)) && !entry.validShowIds.includes(text(collection.anchorShowId))),
    };
    const qualityScore = Object.values(qualitySignals).filter(Boolean).length;
    const addCollectionIssue = (groupId, label, severity, field, evidence, suggestedNextAction, priorityBoost = 0) => issue({
      groupId,
      category: "collections",
      label,
      severity,
      scope: "collections",
      denominator: collections.length,
      recordType: "collection",
      record: collection,
      field,
      evidence,
      suggestedNextAction,
      priorityBoost,
    });

    if (!Array.isArray(collection.showIds) || validCount === 0) addCollectionIssue("weak-collections", "Collections with no valid selected-show membership", "high", "showIds", { validCount, unknownShowIds: entry.unknownShowIds, outOfScopeShowIds: entry.outOfScopeShowIds }, "Repair or republish the collection membership snapshot before relying on this route for discovery.", 8);
    else if (validCount < 3) addCollectionIssue("weak-collections", "Collections with unusually small membership", "medium", "showIds", { validCount, qualityScore }, "Confirm the route has enough distinct shows to be useful; otherwise merge it into a stronger route or mark it as intentionally narrow.");
    if (entry.unknownShowIds.length > 0) addCollectionIssue("invalid-collection-references", "Collections with unknown show references", "high", "showIds", { showIds: entry.unknownShowIds }, "Resolve or remove unknown show IDs and rerun the catalogue audit before publication.");
    if (entry.outOfScopeShowIds.length > 0) addCollectionIssue("out-of-scope-collection-references", "Collections referencing shows outside the selected scope", "medium", "showIds", { showIds: entry.outOfScopeShowIds }, "Confirm whether the collection should include those records or whether the report scope is hiding drafts intentionally.");
    if (entry.duplicateShowIds.length > 0) addCollectionIssue("duplicate-collection-memberships", "Collections with duplicate show memberships", "high", "showIds", { showIds: entry.duplicateShowIds }, "Remove duplicate membership entries while preserving the intended editorial order.");
    if (entry.invalidCoverShowIds.length > 0) addCollectionIssue("invalid-collection-cover-references", "Collections with cover shows outside their membership", "high", "coverShowIds", { showIds: entry.invalidCoverShowIds }, "Choose cover shows from the collection membership snapshot or update the membership source first.");
    if (entry.reasonKeysOutsideMembership.length > 0) addCollectionIssue("orphaned-collection-reasons", "Collections with reasons for non-members", "high", "showReasons", { showIds: entry.reasonKeysOutsideMembership }, "Remove orphaned reasons or restore their matching membership after editorial review.");
    if (entry.missingReasonIds.length > 0 && validCount > 0) addCollectionIssue("weak-collection-reasons", "Collections with incomplete show reasons", isSimilarity ? "high" : "medium", "showReasons", { missingShowIds: entry.missingReasonIds, coverage: reasonCoverage }, "Add a concise reason for each member, especially for similarity and recommendation routes.");
    if (!hasUsefulDescription) addCollectionIssue("weak-collection-source-data", "Collections with weak descriptions", "medium", "description", { length: text(collection.description).length }, "Write a specific listener-facing route description that explains why the collection exists.");
    if (!qualitySignals.intent) addCollectionIssue("weak-collection-source-data", "Collections without intent metadata", "low", "intentTags", { kind }, "Add intent tags when the route should participate in discovery filtering; keep automated criteria as the source of truth for rule-based routes.");
    if (!qualitySignals.cover) addCollectionIssue("weak-collection-source-data", "Collections without cover-show metadata", "low", "coverShowIds", { kind }, "Choose a small, intentional cover-art set for the collection when its visual presentation depends on curated artwork.");
    if (isSimilarity && !qualitySignals.anchor) addCollectionIssue("invalid-similarity-anchors", "Similarity collections with invalid anchors", "high", "anchorShowId", { anchorShowId: collection.anchorShowId || "", valid: allShowIds.has(text(collection.anchorShowId)), includedInMembers: entry.validShowIds.includes(text(collection.anchorShowId)) }, "Resolve the anchor show and keep it outside the membership list as required by the similarity collection contract.");
    if (kind === "semantic" && (!isObject(collection.automation) || text(collection.automation.mode) !== "semantic" || !text(collection.automation.query))) addCollectionIssue("invalid-collection-automation", "Semantic collections without a usable automation query", "high", "automation", { automation: collection.automation || null }, "Restore the bounded semantic query or convert the collection to a deliberate editorial source.");
    if (kind === "rule-based" && (!isObject(collection.automation) || text(collection.automation.mode) !== "rule")) addCollectionIssue("invalid-collection-automation", "Rule-based collections without bounded rule criteria", "high", "automation", { automation: collection.automation || null }, "Restore the bounded rule definition before trusting the materialized membership list.");
    if (collection.featured === true && (validCount === 0 || !hasUsefulDescription)) addCollectionIssue("featured-collection-quality", "Featured collections with weak source data", "high", "featured / source data", { validCount, hasUsefulDescription, qualityScore }, "Fix the collection source before keeping it in a featured discovery surface.", 8);

    entry.quality = { kind, validShowCount: validCount, reasonCoverage, qualitySignals, qualityScore };
  });

  const usageSummary = Object.fromEntries(Object.entries(usage).map(([scopeId, fields]) => [scopeId, Object.fromEntries(Object.entries(fields).map(([fieldName, value]) => [fieldName, {
    field: value.field,
    showCount: value.showCount,
    uniqueValueCount: value.uniqueValueCount,
    overuseThreshold: value.overuseThreshold,
    topValues: value.topValues,
    overusedValues: value.overusedValues,
    underusedValues: value.underusedValues,
  }]))]));

  const recommendationProfiles = selectedShows.map((show) => getRecommendationProfile(show, collectionMembershipCounts.get(show.id) || 0));
  const recommendationSummary = {
    maxScore: 7,
    levelCounts: Object.fromEntries(["none", "thin", "covered"].map((level) => [level, recommendationProfiles.filter((profile) => profile.level === level).length])),
    coveredPercentage: percent(recommendationProfiles.filter((profile) => profile.level === "covered").length, recommendationProfiles.length),
    weakEligibleIds: recommendationProfiles.filter((profile) => !scopeSets.imported.some((show) => show.id === profile.id) && profile.score < 4).map((profile) => profile.id).sort((left, right) => left.localeCompare(right, "en")),
    policyLimitedImportedIds: importedPoorRecommendationIds,
    profiles: recommendationProfiles.filter((profile) => profile.score < 4).sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, "en") || left.id.localeCompare(right.id, "en")),
  };

  const entitySummary = {
    entityCount: entities.length,
    linkedEntityCount: entityRecords.filter((entity) => entity.showCount > 0).length,
    orphanEntityIds,
    relationshipCount: entityRecords.reduce((sum, entity) => sum + entity.relationshipCount, 0),
    linkedShowCount: linkedShowIds.size,
    showIdsWithoutEntityLinks: selectedShows.filter((show) => !Array.isArray(show.entityLinks) || show.entityLinks.length === 0).map((show) => show.id).sort((left, right) => left.localeCompare(right, "en")),
    showIdsWithoutEntityLinksWithEvidence: selectedShows.filter((show) => (!Array.isArray(show.entityLinks) || show.entityLinks.length === 0) && extractEntityEvidenceAll(show).length > 0).map((show) => show.id).sort((left, right) => left.localeCompare(right, "en")),
    usage: entityRecords,
    invalidLinks: invalidEntityLinks,
  };

  const collectionSummary = {
    collectionCount: collections.length,
    membershipCount: [...collectionMembershipCounts.values()].reduce((sum, count) => sum + count, 0),
    showsWithMembership: [...collectionMembershipCounts.values()].filter((count) => count > 0).length,
    showsWithoutMembership: selectedShows.filter((show) => (collectionMembershipCounts.get(show.id) || 0) === 0).map((show) => show.id).sort((left, right) => left.localeCompare(right, "en")),
    records: collectionIndexes.records.map((entry) => ({
      id: entry.collection.id,
      title: text(entry.collection.title) || entry.collection.id,
      kind: text(entry.collection.kind) || "unknown",
      validShowIds: entry.validShowIds,
      unknownShowIds: entry.unknownShowIds,
      outOfScopeShowIds: entry.outOfScopeShowIds,
      duplicateShowIds: entry.duplicateShowIds,
      missingReasonIds: entry.missingReasonIds,
      reasonKeysOutsideMembership: entry.reasonKeysOutsideMembership,
      invalidCoverShowIds: entry.invalidCoverShowIds,
      quality: entry.quality,
    })),
  };

  const policySignals = {
    importedShowCount: scopeSets.imported.length,
    importedEditorialFieldsAreIntentionallyBlank: ["tones", "themes", "bestFor", "similarTo", "discovery", "archive ratings"],
    importedMissingFields,
    importedPoorRecommendationCoverage: importedPoorRecommendationIds,
    importedShowsWithoutEntityLinks: scopeSets.imported.filter((show) => !Array.isArray(show.entityLinks) || show.entityLinks.length === 0).map((show) => show.id).sort((left, right) => left.localeCompare(right, "en")),
    note: "Imported records are factual-only and remain manual promotion/enrichment candidates. Their missing editorial facets are reported as policy signals, not automatic defects.",
  };

  const providerIdentitySummary = {
    dispositionPath: SHARED_PROVIDER_IDENTITIES_PATH,
    providerTypes: providerIdentityAudit.providerTypes,
    documentedSharedIdentities: providerIdentityAudit.acknowledged.map((entry) => ({
      provider: entry.provider,
      field: entry.field,
      value: entry.value,
      showIds: entry.showIds,
    })),
    unresolvedCollisions: providerIdentityAudit.unresolvedCollisions.map((entry) => ({
      provider: entry.provider,
      field: entry.field,
      value: entry.value,
      showIds: entry.showIds,
    })),
    invalidDispositions: providerIdentityAudit.invalidDispositions.map((entry) => ({
      showId: entry.owner.id,
      index: entry.index,
      provider: entry.provider || null,
      identity: entry.identity || null,
      showIds: entry.showIds,
      errors: entry.errors,
    })),
  };

  const finalized = collector.finalize();
  const summary = {
    selectedShowCount: selectedShows.length,
    enrichmentEligibleShowCount: scopeSets.enrichmentEligible.length,
    importedShowCount: scopeSets.imported.length,
    entityCount: entities.length,
    collectionCount: collections.length,
    findingCount: finalized.findings.length,
    actionableFindingCount: finalized.findings.filter((finding) => finding.actionable).length,
    policyFindingCount: finalized.findings.filter((finding) => !finding.actionable).length,
    issueGroupCount: finalized.issueGroups.length,
    actionableIssueGroupCount: finalized.issueGroups.filter((group) => group.actionable).length,
    bySeverity: Object.fromEntries(Object.keys(SEVERITY_ORDER).map((severity) => [severity, finalized.findings.filter((finding) => finding.severity === severity).length])),
    byCategory: Object.fromEntries([...finalized.findings.reduce((map, finding) => map.set(finding.category, (map.get(finding.category) || 0) + 1), new Map())].sort(([left], [right]) => left.localeCompare(right, "en"))),
  };

  return {
    version: REPORT_VERSION,
    readOnly: true,
    inputs: inputs.inputSummary || {
      shows: "catalog-src/shows",
      collections: "catalog-src/collections",
      entities: "catalog-src/entities.json",
      taxonomy: "catalog-src/tag-taxonomy.json",
    },
    scope: {
      mode: includeDrafts ? "all-authored-statuses" : "published",
      selectedShowCount: selectedShows.length,
      publishedShowCount: scopeSets.published.length,
      draftShowCount: scopeSets.records.filter((show) => show.status !== "published").length,
      enrichmentEligibleShowCount: scopeSets.enrichmentEligible.length,
      importedShowCount: scopeSets.imported.length,
      latestUpdatedAt: [...selectedShows, ...collections].map((record) => text(record.updatedAt)).filter(Boolean).sort().at(-1) || null,
    },
    summary,
    coverage,
    usage: usageSummary,
    taxonomy: {
      controlledTagCount: taxonomyMaps.entries.length,
      approvedTagCount: taxonomyMaps.approved.length,
      unusedApprovedTags,
      singletonApprovedTags,
      unknownTagUses: finalized.findings.filter((finding) => finding.groupId === "unapproved-discovery-tags").map((finding) => ({ showId: finding.recordId, value: finding.evidence.value })),
    },
    recommendationCoverage: recommendationSummary,
    entityGraph: entitySummary,
    collections: collectionSummary,
    policySignals,
    providerIdentities: providerIdentitySummary,
    namingVariants,
    priorityQueue: finalized.issueGroups,
    findings: finalized.findings,
  };
}

function createIssueCollector({ selectedShows, entities, collections, sampleLimit }) {
  const findings = [];
  const groups = new Map();
  const seenFindingIds = new Set();

  function ensureGroup(definition) {
    if (!groups.has(definition.groupId)) {
      groups.set(definition.groupId, {
        id: definition.groupId,
        category: definition.category,
        label: definition.label,
        severity: definition.severity,
        scope: definition.scope,
        denominator: definition.denominator,
        suggestedNextAction: definition.suggestedNextAction,
        actionable: definition.actionable !== false,
        affectedIds: new Set(),
        affectedRecords: new Map(),
        findings: [],
        values: [],
      });
    }
    const group = groups.get(definition.groupId);
    if (SEVERITY_ORDER[definition.severity] > SEVERITY_ORDER[group.severity]) group.severity = definition.severity;
    if (definition.actionable === false) group.actionable = false;
    if (definition.suggestedNextAction && !group.suggestedNextAction) group.suggestedNextAction = definition.suggestedNextAction;
    return group;
  }

  function add(definition) {
    const recordType = definition.recordType || "record";
    const recordId = definition.record?.id || definition.recordId || "unknown";
    const stableSuffix = definition.dedupeKey || definition.field || "record";
    const findingId = definition.id || `${definition.groupId}:${recordType}:${recordId}:${stableSuffix}`;
    if (seenFindingIds.has(findingId)) return null;
    seenFindingIds.add(findingId);

    const group = ensureGroup(definition);
    const recordSummary = definition.record ? getRecordSummary(definition.record, recordType) : null;
    const priorityScore = Math.min(100, severityScore(definition.severity) + (Number(definition.priorityBoost) || 0) + (definition.record?.reviewStatus !== IMPORTED_REVIEW_STATUS ? 3 : 0));
    const finding = {
      id: findingId,
      groupId: definition.groupId,
      category: definition.category,
      severity: definition.severity,
      priorityScore,
      actionable: definition.actionable !== false,
      scope: definition.scope,
      recordType,
      recordId: text(recordId),
      ...(recordSummary ? { title: recordSummary.title, status: recordSummary.status, reviewStatus: recordSummary.reviewStatus } : {}),
      ...(definition.field ? { field: definition.field } : {}),
      ...(definition.value !== undefined ? { value: definition.value } : {}),
      evidence: definition.evidence || {},
      suggestedNextAction: definition.suggestedNextAction,
    };
    if (definition.affectedIds) finding.affectedIds = sortedUnique(definition.affectedIds);
    findings.push(finding);
    group.findings.push(finding);
    const affectedIds = definition.affectedIds || (recordType === "show" || recordType === "collection" || recordType === "entity" ? [recordId] : []);
    affectedIds.forEach((id) => group.affectedIds.add(text(id)));
    if (recordSummary && !group.affectedRecords.has(recordSummary.id)) group.affectedRecords.set(recordSummary.id, recordSummary);
    if (definition.value !== undefined) group.values.push({ value: definition.value, recordId: text(recordId), affectedIds: sortedUnique(definition.affectedIds || []) });
    return finding;
  }

  function addAggregate(definition) {
    return add({
      ...definition,
      id: definition.id || `${definition.groupId}:${definition.recordType || "aggregate"}:${definition.recordId || "value"}`,
      actionable: definition.actionable !== false,
    });
  }

  function finalize() {
    const sortedFindings = [...findings].sort((left, right) => right.priorityScore - left.priorityScore
      || SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity]
      || left.category.localeCompare(right.category, "en")
      || left.recordId.localeCompare(right.recordId, "en")
      || left.id.localeCompare(right.id, "en"));
    const issueGroups = [...groups.values()].map((group) => {
      const affectedIds = [...group.affectedIds].filter(Boolean).sort((left, right) => left.localeCompare(right, "en"));
      const groupFindings = [...group.findings].sort((left, right) => right.priorityScore - left.priorityScore || left.recordId.localeCompare(right.recordId, "en") || left.id.localeCompare(right.id));
      const groupBaseScore = Math.max(...groupFindings.map((finding) => finding.priorityScore), severityScore(group.severity));
      const proportionBoost = group.denominator > 0 ? Math.min(15, Math.round((affectedIds.length / group.denominator) * 15)) : 0;
      return {
        id: group.id,
        category: group.category,
        label: group.label,
        severity: group.severity,
        priorityScore: Math.min(100, groupBaseScore + proportionBoost),
        actionable: group.actionable,
        scope: scopeLabel(group.scope),
        denominator: group.denominator,
        count: affectedIds.length || groupFindings.length,
        percentage: group.denominator > 0 ? percent(affectedIds.length || groupFindings.length, group.denominator) : null,
        affectedIds,
        affectedRecords: [...group.affectedRecords.values()].sort((left, right) => left.title.localeCompare(right.title, "en")).slice(0, sampleLimit),
        values: group.values.slice(0, sampleLimit),
        topFindings: groupFindings.slice(0, sampleLimit),
        suggestedNextAction: group.suggestedNextAction,
      };
    }).sort((left, right) => Number(right.actionable) - Number(left.actionable)
      || right.priorityScore - left.priorityScore
      || SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity]
      || right.count - left.count
      || left.label.localeCompare(right.label, "en")
      || left.id.localeCompare(right.id, "en"));
    return { findings: sortedFindings, issueGroups };
  }

  return { add, addAggregate, finalize };
}

function formatCoverage(value) {
  if (!value) return "n/a";
  return `${value.present}/${value.total ?? (value.present + value.missing)} (${value.percentage ?? "n/a"}%)`;
}

function formatMetadataQualityReport(report, options = {}) {
  const sampleLimit = Number.isInteger(options.sampleLimit) && options.sampleLimit > 0 ? options.sampleLimit : DEFAULT_SAMPLE_LIMIT;
  const lines = [
    "Catalogue metadata quality audit",
    "Read-only, deterministic report from authoritative catalogue source files; this command does not edit or regenerate catalogue data.",
    `Scope: ${report.scope.mode}; ${report.scope.selectedShowCount} shows (${report.scope.enrichmentEligibleShowCount} enrichment-eligible, ${report.scope.importedShowCount} imported), ${report.scope.collectionCount || report.collections.collectionCount} collections, ${report.scope.entityCount || report.entityGraph.entityCount} entities.`,
    `Issues: ${report.summary.actionableFindingCount} actionable findings in ${report.summary.actionableIssueGroupCount} queues; ${report.summary.policyFindingCount} policy signals.`,
    `Severity: ${Object.entries(report.summary.bySeverity).map(([severity, count]) => `${severity}=${count}`).join(", ")}.`,
    "",
    "## Highest-value cleanup queues",
    "",
  ];

  if (report.priorityQueue.length === 0) {
    lines.push("No findings for this scope.");
  } else {
    const actionableQueue = report.priorityQueue.filter((group) => group.actionable);
    const policyQueue = report.priorityQueue.filter((group) => !group.actionable);
    actionableQueue.slice(0, sampleLimit).forEach((group, index) => {
      const countLabel = group.denominator ? `${group.count}/${group.denominator} (${group.percentage}%)` : `${group.count}`;
      lines.push(`${index + 1}. [${group.severity.toUpperCase()} ${group.priorityScore}] ${group.label} — ${countLabel}`);
      if (group.affectedIds.length > 0) lines.push(`   Records: ${group.affectedIds.slice(0, 8).join(", ")}${group.affectedIds.length > 8 ? ` … +${group.affectedIds.length - 8}; use --json for all` : ""}`);
      if (group.values.length > 0) lines.push(`   Values: ${group.values.slice(0, 4).map((entry) => text(entry.value)).join("; ")}`);
      lines.push(`   Next: ${group.suggestedNextAction}`);
    });
    if (policyQueue.length > 0) {
      lines.push("", "Policy signals (not automatic defects):");
      policyQueue.slice(0, Math.min(sampleLimit, 4)).forEach((group) => {
        const countLabel = group.denominator ? `${group.count}/${group.denominator} (${group.percentage}%)` : `${group.count}`;
        lines.push(`- [${group.severity.toUpperCase()}] ${group.label} — ${countLabel}`);
        if (group.affectedIds.length > 0) lines.push(`  Records: ${group.affectedIds.slice(0, 8).join(", ")}${group.affectedIds.length > 8 ? ` … +${group.affectedIds.length - 8}; use --json for all` : ""}`);
        lines.push(`  Next: ${group.suggestedNextAction}`);
      });
    }
  }

  const providerIdentities = report.providerIdentities || {};
  const documentedProviderIdentities = providerIdentities.documentedSharedIdentities || [];
  const unresolvedProviderCollisions = providerIdentities.unresolvedCollisions || [];
  const invalidProviderDispositions = providerIdentities.invalidDispositions || [];
  lines.push(
    "",
    "## Provider identity review",
    "",
    `- Documented intentional sharing: ${documentedProviderIdentities.length}; unresolved collisions: ${unresolvedProviderCollisions.length}; invalid dispositions: ${invalidProviderDispositions.length}.`,
    documentedProviderIdentities.length > 0
      ? `- Auditable shared identities: ${documentedProviderIdentities.map((entry) => `${entry.provider}=${entry.value} (${entry.showIds.join(", ")})`).join("; ")}.`
      : "- Auditable shared identities: none.",
    unresolvedProviderCollisions.length > 0
      ? `- Unresolved identities remain critical: ${unresolvedProviderCollisions.map((entry) => `${entry.provider}=${entry.value} (${entry.showIds.join(", ")})`).join("; ")}.`
      : "- Unresolved identities remain critical: none.",
  );

  lines.push("", "## Coverage by field", "", "| Field | Selected | Enrichment-eligible | Imported |", "| --- | ---: | ---: | ---: | ");
  report.coverage.forEach((field) => {
    const selected = report.coverage.find((entry) => entry.id === field.id)?.scopes.selected;
    const eligible = field.scopes.enrichmentEligible;
    const imported = field.scopes.imported;
    lines.push(`| ${field.label} | ${selected.present}/${report.scope.selectedShowCount} (${selected.percentage}%) | ${eligible.present}/${report.scope.enrichmentEligibleShowCount} (${eligible.percentage}%) | ${imported.present}/${report.scope.importedShowCount} (${imported.percentage}%) |`);
  });

  lines.push(
    "",
    "## Recommendation and relationship coverage",
    "",
    `- Recommendation levels: ${Object.entries(report.recommendationCoverage.levelCounts).map(([level, count]) => `${level}=${count}`).join(", ")}; covered=${report.recommendationCoverage.coveredPercentage}%.`,
    `- Shows without any selected collection route: ${report.collections.showsWithoutMembership.length}.`,
    `- Shows without entity relationships: ${report.entityGraph.showIdsWithoutEntityLinks.length}; with retained legacy creator/network evidence: ${report.entityGraph.showIdsWithoutEntityLinksWithEvidence.length}.`,
    `- Public/or selected entities without a relationship: ${report.entityGraph.orphanEntityIds.length}.`,
    "Imported recommendation gaps are policy signals until those records are promoted through editorial review.",
  );

  lines.push("", "## Distribution signals", "", "| Field | Most-used values | Overuse threshold |", "| --- | --- | ---: | ");
  Object.values(report.usage.enrichmentEligible).forEach((field) => {
    const top = field.topValues.slice(0, 4).map((entry) => `${entry.value} (${entry.count})`).join(", ") || "none";
    lines.push(`| ${field.field} | ${top} | ${field.overuseThreshold}% |`);
  });
  lines.push(`- Approved taxonomy tags unused by the selected catalogue: ${report.taxonomy.unusedApprovedTags.length}.`);
  lines.push(`- Naming-variant groups: ${Object.values(report.namingVariants).reduce((sum, entries) => sum + entries.length, 0)}.`);

  lines.push("", "## Collection source quality", "", "| Collection | Kind | Members | Reason coverage | Quality |", "| --- | --- | ---: | ---: | ---: | ");
  report.collections.records.filter((collection) => collection.quality?.qualityScore < 6 || collection.unknownShowIds.length > 0 || collection.missingReasonIds.length > 0).slice(0, sampleLimit).forEach((collection) => {
    lines.push(`| ${collection.title} (${collection.id}) | ${collection.kind} | ${collection.validShowIds.length} | ${collection.quality?.reasonCoverage ?? "n/a"}% | ${collection.quality?.qualityScore ?? "n/a"}/7 |`);
  });
  if (!report.collections.records.some((collection) => collection.quality?.qualityScore < 6 || collection.unknownShowIds.length > 0 || collection.missingReasonIds.length > 0)) lines.push("| none | — | — | — | all current collection sources pass the audit signals | ");

  lines.push("", `Use --json for complete affected ID lists, evidence, sparse thresholds, and the full ranked queue. Report version ${report.version}.`);
  return lines.join("\n");
}

module.exports = {
  CONTROLLED_ARRAY_FIELDS,
  DEFAULT_SAMPLE_LIMIT,
  QUALITY_FIELDS,
  buildMetadataQualityReport,
  formatMetadataQualityReport,
  getRecommendationProfile,
  isValidHttpUrl,
  normalizeUrl,
  percentile,
};
