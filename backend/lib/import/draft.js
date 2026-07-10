const { buildResearchGaps, mapCategoryToGenre, mergeUniqueStrings, slugify, trimText } = require("./utils");

const AUTO_APPLY_MIN_CONFIDENCE = 0.67;
const AUTO_APPLY_STRONG_CONFIDENCE = 0.8;
const VALID_COMPLETION_STATUSES = new Set(["ongoing", "finished", "cancelled", "unclear"]);
const ALLOWED_TONES = new Set([
  "dark",
  "bleak",
  "tense",
  "warm",
  "funny",
  "chaotic",
  "hopeful",
  "cinematic",
  "weird",
  "melancholic",
]);
const ALLOWED_FORMATS = new Set([
  "full-cast",
  "narrated",
  "serialized",
  "episodic",
  "anthology",
  "limited-series",
]);

function ensureUniqueShowId(shows = [], baseTitle = "show") {
  const base = slugify(baseTitle) || "imported-show";
  const seen = new Set((Array.isArray(shows) ? shows : []).map((show) => show.id));

  if (!seen.has(base)) {
    return base;
  }

  let suffix = 2;
  while (seen.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function normalizeAppliedSuggestions(
  values = [],
  {
    limit = 6,
    allowedValues = null,
    minConfidence = AUTO_APPLY_MIN_CONFIDENCE,
    normalizeValue = (value) => value.toLowerCase().replace(/\s+/g, "-"),
  } = {},
) {
  const normalized = [];
  const seen = new Set();

  (Array.isArray(values) ? values : []).forEach((entry) => {
    const rawValue = normalizeValue(trimText(entry?.value || entry, 120));
    const key = rawValue.toLowerCase();
    const confidence = Number(entry?.confidence);
    if (
      !rawValue ||
      seen.has(key) ||
      !Number.isFinite(confidence) ||
      confidence < minConfidence ||
      (allowedValues && !allowedValues.has(rawValue))
    ) {
      return;
    }

    seen.add(key);
    normalized.push(rawValue);
  });

  return normalized.slice(0, limit);
}

function collectAliasTitles(candidate, title) {
  const aliases = [];
  const seen = new Set([String(title || "").trim().toLowerCase()]);

  (candidate?.provenance?.fields?.title || []).forEach((entry) => {
    const value = trimText(entry?.value || "", 240);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) {
      return;
    }

    seen.add(key);
    aliases.push(value);
  });

  return aliases.slice(0, 8);
}

function inferObjectiveFormats(objective = {}) {
  const formats = [];
  const feedType = trimText(objective.feedType, 80).toLowerCase();

  if (feedType === "serial") {
    formats.push("serialized");
  }

  if (feedType === "episodic") {
    formats.push("episodic");
  }

  if (objective.complete === true && Number(objective.seasonCount) === 1) {
    formats.push("limited-series");
  }

  return formats;
}

function resolveCompletionStatus(candidate = {}, objective = {}) {
  const suggestedValue = trimText(candidate?.aiSuggestions?.completionStatus?.value || "", 80).toLowerCase();
  const suggestedConfidence = Number(candidate?.aiSuggestions?.completionStatus?.confidence);

  if (
    VALID_COMPLETION_STATUSES.has(suggestedValue) &&
    Number.isFinite(suggestedConfidence) &&
    suggestedConfidence >= AUTO_APPLY_STRONG_CONFIDENCE
  ) {
    return suggestedValue;
  }

  if (objective.complete === true) {
    return "finished";
  }

  return "unclear";
}

function buildLengthData(objective = {}) {
  const episodeCount = Number.isFinite(Number(objective.episodeCount)) ? Number(objective.episodeCount) : null;
  const seasonCount = Number.isFinite(Number(objective.seasonCount)) ? Number(objective.seasonCount) : null;
  const avgEpisodeMinutes = Number.isFinite(Number(objective.avgEpisodeMinutes)) ? Number(objective.avgEpisodeMinutes) : null;

  if (!episodeCount && !seasonCount && !avgEpisodeMinutes) {
    return {};
  }

  const parts = [];
  if (seasonCount) {
    parts.push(`${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}`);
  }
  if (episodeCount) {
    parts.push(`${episodeCount} ${episodeCount === 1 ? "episode" : "episodes"}`);
  }
  if (avgEpisodeMinutes) {
    parts.push(`~${avgEpisodeMinutes} min episodes`);
  }

  const totalHours =
    episodeCount && avgEpisodeMinutes
      ? Number(((episodeCount * avgEpisodeMinutes) / 60).toFixed(1))
      : undefined;

  return {
    label: parts.join(" • "),
    ...(seasonCount ? { seasons: seasonCount } : {}),
    ...(episodeCount ? { episodes: episodeCount } : {}),
    ...(avgEpisodeMinutes ? { avgEpisodeMinutes } : {}),
    ...(Number.isFinite(totalHours) ? { totalHours } : {}),
  };
}

function resolveSimilarShowIds(candidate = {}, shows = []) {
  const knownShowIds = new Set((Array.isArray(shows) ? shows : []).map((show) => show.id));
  const similarShowIds = [];

  (Array.isArray(candidate?.aiSuggestions?.similarShowIds) ? candidate.aiSuggestions.similarShowIds : []).forEach((entry) => {
    const value = trimText(entry?.value || "", 120);
    const confidence = Number(entry?.confidence);
    if (
      !value ||
      similarShowIds.includes(value) ||
      !knownShowIds.has(value) ||
      !Number.isFinite(confidence) ||
      confidence < AUTO_APPLY_MIN_CONFIDENCE
    ) {
      return;
    }

    similarShowIds.push(value);
  });

  return similarShowIds.slice(0, 3);
}

function normalizeImportedSummaryCandidate(value = "", title = "") {
  const text = trimText(value, 1500);
  const normalizedTitle = trimText(title, 240).toLowerCase();
  if (!text) {
    return "";
  }

  const normalizedText = text.toLowerCase();
  if (normalizedTitle && (normalizedText === normalizedTitle || normalizedText === `${normalizedTitle}.`)) {
    return "";
  }

  return text;
}

function resolveImportedOfficialSummary(candidate = {}, objective = {}) {
  const title = objective.title || candidate.title || "";
  const directObjectiveSummary = normalizeImportedSummaryCandidate(objective.description, title);
  if (directObjectiveSummary) {
    return directObjectiveSummary;
  }

  const sourcePriority = ["website", "rss", "podcast-index", "apple"];
  const sources = Array.isArray(candidate.sources) ? candidate.sources : [];
  const orderedSources = [...sources].sort(
    (left, right) => sourcePriority.indexOf(left.sourceType) - sourcePriority.indexOf(right.sourceType),
  );

  for (const source of orderedSources) {
    const summary = normalizeImportedSummaryCandidate(source?.normalized?.description || "", title);
    if (summary) {
      return summary;
    }
  }

  return "";
}

function buildDraftShowRecord({ candidate, shows, today }) {
  const objective = candidate.objective || {};
  const title = trimText(objective.title || candidate.title, 240) || "Untitled import";
  const creatorName = trimText(objective.creatorName || candidate.creatorName, 240);
  const networkName = trimText(objective.networkName, 240);
  const categories = mergeUniqueStrings(objective.categories || [], objective.genreHints || []);
  const genres = mergeUniqueStrings(categories.map(mapCategoryToGenre).filter(Boolean));
  const tags = mergeUniqueStrings(
    categories,
    normalizeAppliedSuggestions(candidate.aiSuggestions?.tags, {
      limit: 10,
      minConfidence: 0.63,
      normalizeValue: (value) => value,
    }),
  );
  const researchGaps = buildResearchGaps(objective);
  const showId = candidate.draftedShowId || ensureUniqueShowId(shows, title);
  const sources = mergeUniqueStrings(
    Array.isArray(objective.objectiveSources) ? objective.objectiveSources : [],
    [objective.rssUrl, objective.appleUrl, objective.websiteUrl].filter(Boolean),
  );
  const language = trimText(objective.language, 40);
  const length = buildLengthData(objective);
  const tones = normalizeAppliedSuggestions(candidate.aiSuggestions?.tones, {
    limit: 4,
    allowedValues: ALLOWED_TONES,
  });
  const formats = mergeUniqueStrings(
    inferObjectiveFormats(objective),
    normalizeAppliedSuggestions(candidate.aiSuggestions?.formats, {
      limit: 4,
      allowedValues: ALLOWED_FORMATS,
    }),
  );
  const similarTo = resolveSimilarShowIds(candidate, shows);
  const completionStatus = resolveCompletionStatus(candidate, objective);
  const importedOfficialSummary = resolveImportedOfficialSummary(candidate, objective);
  const aliases = collectAliasTitles(candidate, title);
  const autoAppliedSuggestions = {
    ...(tones.length > 0 ? { tones } : {}),
    ...(formats.length > 0 ? { formats } : {}),
    ...(similarTo.length > 0 ? { similarTo } : {}),
    ...(completionStatus !== "unclear" ? { completionStatus } : {}),
  };
  if (tags.length > categories.length) {
    autoAppliedSuggestions.tags = tags.filter((tag) => !categories.includes(tag));
  }

  return {
    id: showId,
    title,
    subtitle: trimText(objective.subtitle, 240),
    description:
      trimText(objective.description, 1500) || "Imported metadata draft awaiting archive copy polish.",
    cover: "",
    coverAlt: `${title} cover art`,
    status: "draft",
    reviewStatus: "indexed-only",
    releaseStatus: objective.dead ? "inactive" : "unknown",
    completionStatus,
    listenLinks: {
      spotify: trimText(objective.spotifyUrl, 500),
      apple: trimText(objective.appleUrl, 500),
      website: trimText(objective.websiteUrl, 500),
      rss: trimText(objective.rssUrl, 500),
    },
    genres,
    tones,
    formats,
    tags,
    aliases,
    themes: [],
    contentNotes: [],
    languages: language ? [language === "en" ? "English" : language] : [],
    transcriptLanguages: [],
    length,
    releaseDates: {
      first: trimText(objective.firstPublicationDate, 40).slice(0, 10),
      latest: trimText(objective.latestPublicationDate, 40).slice(0, 10),
    },
    ratings: {},
    facts: {},
    bestFor: [],
    similarTo,
    similarReasons: {},
    archiveTake: "",
    spoilerFreeReview: "",
    thoughts: "",
    quote: {
      text: "",
      attribution: "",
    },
    officialLinks: {
      website: trimText(objective.websiteUrl, 500),
      patreon: trimText(objective.patreonUrl, 500),
      discord: trimText(objective.discordUrl, 500),
      youtube: trimText(objective.youtubeUrl, 500),
    },
    credits: {
      ...(creatorName ? { creatorName } : {}),
      ...(networkName ? { network: networkName } : {}),
    },
    verification: {
      status: "source-import-draft",
      verifiedAt: today,
      source: sources.join("; "),
      note: "Imported from external sources. Verification covers factual metadata only and still needs archive review.",
    },
    availability: {},
    content: {},
    metadata: {
      objectiveSources: sources,
      researchGaps,
      importOfficialSummary: importedOfficialSummary,
      importCandidateId: candidate.id,
      importStatus: "draft",
      importIdentifiers: {
        appleCollectionId: trimText(objective.appleCollectionId, 80),
        podcastIndexFeedId: trimText(objective.podcastIndexFeedId, 80),
        podcastIndexGuid: trimText(objective.podcastIndexGuid, 240),
      },
      ...(Object.keys(autoAppliedSuggestions).length > 0
        ? {
            importAutomation: {
              autoAppliedSuggestions,
            },
          }
        : {}),
      objectiveImportedAt: new Date().toISOString(),
    },
    featured: false,
    createdAt: today,
    ...(creatorName ? { creatorId: slugify(creatorName) || undefined } : {}),
    ...(networkName ? { networkId: slugify(networkName) || undefined } : {}),
    updatedAt: today,
  };
}

module.exports = {
  buildDraftShowRecord,
  ensureUniqueShowId,
};
