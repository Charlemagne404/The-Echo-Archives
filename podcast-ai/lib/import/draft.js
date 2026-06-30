const { buildResearchGaps, mapCategoryToGenre, mergeUniqueStrings, slugify, trimText } = require("./utils");

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

function buildLengthLabel(objective = {}) {
  const episodeCount = Number.isFinite(Number(objective.episodeCount)) ? Number(objective.episodeCount) : null;
  if (!episodeCount) {
    return "";
  }

  return `${episodeCount} feed episodes`;
}

function buildDraftShowRecord({ candidate, shows, today }) {
  const objective = candidate.objective || {};
  const title = trimText(objective.title || candidate.title, 240) || "Untitled import";
  const creatorName = trimText(objective.creatorName || candidate.creatorName, 240);
  const networkName = trimText(objective.networkName, 240);
  const categories = mergeUniqueStrings(objective.categories || [], objective.genreHints || []);
  const genres = mergeUniqueStrings(categories.map(mapCategoryToGenre).filter(Boolean));
  const tags = mergeUniqueStrings(categories);
  const researchGaps = buildResearchGaps(objective);
  const showId = candidate.draftedShowId || ensureUniqueShowId(shows, title);
  const sources = mergeUniqueStrings(
    Array.isArray(objective.objectiveSources) ? objective.objectiveSources : [],
    [objective.rssUrl, objective.appleUrl, objective.websiteUrl].filter(Boolean),
  );
  const language = trimText(objective.language, 40);

  return {
    id: showId,
    title,
    subtitle: "",
    description:
      trimText(objective.description, 1500) || "Imported metadata draft awaiting archive copy polish.",
    cover: "",
    coverAlt: `${title} cover art`,
    status: "draft",
    reviewStatus: "indexed-only",
    releaseStatus: objective.dead ? "inactive" : "unknown",
    completionStatus: "unclear",
    listenLinks: {
      spotify: "",
      apple: trimText(objective.appleUrl, 500),
      website: trimText(objective.websiteUrl, 500),
      rss: trimText(objective.rssUrl, 500),
    },
    genres,
    tones: [],
    formats: [],
    tags,
    aliases: [],
    themes: [],
    contentNotes: [],
    languages: language ? [language === "en" ? "English" : language] : [],
    transcriptLanguages: [],
    length: buildLengthLabel(objective)
      ? {
          label: buildLengthLabel(objective),
          episodes: Number.isFinite(Number(objective.episodeCount)) ? Number(objective.episodeCount) : undefined,
        }
      : {},
    releaseDates: {
      first: "",
      latest: trimText(objective.latestPublicationDate, 40).slice(0, 10),
    },
    ratings: {},
    facts: {},
    bestFor: [],
    similarTo: [],
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
      patreon: "",
      discord: "",
      youtube: "",
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
      importCandidateId: candidate.id,
      importStatus: "draft",
      importIdentifiers: {
        appleCollectionId: trimText(objective.appleCollectionId, 80),
        podcastIndexFeedId: trimText(objective.podcastIndexFeedId, 80),
        podcastIndexGuid: trimText(objective.podcastIndexGuid, 240),
      },
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
