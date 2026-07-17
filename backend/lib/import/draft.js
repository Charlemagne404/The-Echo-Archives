const { createHash } = require("node:crypto");

const {
  mapCategoryToGenre,
  mergeUniqueStrings,
  normalizeUrl,
  slugify,
  toDateStamp,
  trimText,
} = require("./utils");

const HUMAN_OWNED_FIELDS = [
  "ratings", "archiveTake", "spoilerFreeReview", "thoughts", "tones", "bestFor",
  "similarTo", "similarReasons", "featured", "accent", "content", "themes",
  "contentNotes", "collectionMembership",
];
const MANAGED_FIELDS = [
  "title", "subtitle", "description", "cover", "coverAlt", "releaseStatus", "completionStatus",
  "listenLinks", "officialLinks", "genres", "tags", "formats", "aliases", "languages", "transcriptLanguages",
  "length", "releaseDates", "credits", "creators", "cast", "availability", "verification",
];

function ensureUniqueShowId(shows = [], baseTitle = "show") {
  const base = slugify(baseTitle) || "imported-show";
  const seen = new Set((Array.isArray(shows) ? shows : []).map((show) => show.id));
  if (!seen.has(base)) return base;
  let suffix = 2;
  while (seen.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function getPath(record, fieldPath) {
  return fieldPath.split(".").reduce((value, key) => value?.[key], record);
}

function managedFingerprints(record) {
  return Object.fromEntries(MANAGED_FIELDS.map((field) => [field, fingerprint(getPath(record, field))]));
}

function releaseState(objective = {}) {
  if (objective.manualReleaseState === "finished") {
    return { releaseStatus: "completed", completionStatus: "finished", method: "maintainer-edit", confidence: 1 };
  }
  if (objective.manualReleaseState === "ongoing") {
    return { releaseStatus: "active", completionStatus: "ongoing", method: "maintainer-edit", confidence: 1 };
  }
  if (objective.complete === true) {
    return { releaseStatus: "completed", completionStatus: "finished", method: "explicit-completion", confidence: 0.95 };
  }
  const latest = Date.parse(objective.latestPublicationDate || "");
  if (Number.isFinite(latest) && Date.now() - latest <= 120 * 86_400_000) {
    return { releaseStatus: "active", completionStatus: "ongoing", method: "recent-full-episode", confidence: 0.70 };
  }
    return { releaseStatus: "unknown", completionStatus: "unclear", method: "unknown", confidence: 0 };
}

function formatLanguage(value = "") {
  const language = trimText(value, 40);
  if (!language) return "";
  if (/^en(?:-|$)|^english$/i.test(language)) return "English";
  return language;
}

function buildLengthData(objective = {}) {
  const counts = objective.episodeCounts || {};
  const episodes = Number(counts.full ?? objective.episodeCount);
  const seasons = Number(objective.seasonCount);
  const average = Number(objective.avgEpisodeMinutes);
  const median = Number(objective.medianEpisodeMinutes);
  const parts = [];
  if (Number.isFinite(seasons) && seasons > 0) parts.push(`${seasons} ${seasons === 1 ? "season" : "seasons"} observed`);
  if (Number.isFinite(episodes) && episodes > 0) parts.push(`${counts.exact || objective.episodeCountExact ? "" : "at least "}${episodes} full ${episodes === 1 ? "episode" : "episodes"}`);
  if (Number.isFinite(median) && median > 0) parts.push(`${median} min median`);
  else if (Number.isFinite(average) && average > 0) parts.push(`${average} min average`);
  return {
    ...(parts.length ? { label: parts.join(" • ") } : {}),
    ...(Number.isFinite(seasons) && seasons > 0 ? { seasons } : {}),
    ...(Number.isFinite(episodes) && episodes > 0 ? { episodes } : {}),
    ...(Number.isFinite(average) && average > 0 ? { avgEpisodeMinutes: average } : {}),
    ...(Number.isFinite(median) && median > 0 ? { medianEpisodeMinutes: median } : {}),
    ...(Number.isFinite(Number(objective.minEpisodeMinutes)) ? { minEpisodeMinutes: Number(objective.minEpisodeMinutes) } : {}),
    ...(Number.isFinite(Number(objective.maxEpisodeMinutes)) ? { maxEpisodeMinutes: Number(objective.maxEpisodeMinutes) } : {}),
    ...(Number.isFinite(Number(objective.totalObservedHours)) ? { totalObservedHours: Number(objective.totalObservedHours) } : {}),
    ...(Number.isFinite(Number(objective.durationCoverage)) ? { durationCoverage: Number(objective.durationCoverage) } : {}),
    ...(Array.isArray(objective.seasonsObserved) && objective.seasonsObserved.length ? { observedSeasons: objective.seasonsObserved } : {}),
    countQualifier: counts.exact || objective.episodeCountExact ? "exact" : "at-least",
    episodeCounts: {
      full: Number(counts.full) || 0,
      bonus: Number(counts.bonus) || 0,
      trailer: Number(counts.trailer) || 0,
    },
  };
}

function peopleByRole(objective = {}) {
  const people = Array.isArray(objective.people) ? objective.people : [];
  const names = (pattern) => mergeUniqueStrings(people.filter((person) => pattern.test(`${person.role || ""} ${person.group || ""}`)).map((person) => person.name));
  return {
    creators: mergeUniqueStrings([objective.creatorName], names(/creator|author|writer|host/i)),
    cast: names(/cast|actor|voice|guest/i),
    writers: names(/writer|author/i),
    directors: names(/director/i),
    producers: names(/producer/i),
    people,
  };
}

function aliasTitles(candidate, title) {
  return mergeUniqueStrings(
    [title],
    (candidate.fieldEvidence || []).filter((item) => item.fieldName === "title").map((item) => item.value),
  ).slice(0, 10);
}

function selectedSources(candidate) {
  return [...new Map((candidate.sources || []).filter((source) => source.fetchStatus !== "failed").map((source) => [
    `${source.sourceType}|${source.sourceUrl}`,
    { sourceType: source.sourceType, sourceUrl: source.sourceUrl, fetchedAt: source.fetchedAt, payloadHash: source.payloadHash },
  ])).values()];
}

function sourceTags(objective = {}) {
  return mergeUniqueStrings(
    objective.categories || [],
    objective.keywords || [],
  )
    .map((value) => trimText(value, 80))
    .filter((value) => value.length >= 2 && value.toLowerCase() !== "fiction")
    .slice(0, 12);
}

function sourceTagProvenance(candidate, tags) {
  if (tags.length === 0) return null;
  const sourceFields = ["categories", "keywords"]
    .map((field) => candidate.provenance?.fields?.[field])
    .filter(Boolean);

  return {
    confidence: sourceFields.length ? Math.max(...sourceFields.map((field) => Number(field.confidence) || 0)) : 0.7,
    method: "source-categories-and-keywords",
    sources: sourceFields.flatMap((field) => field.sources || []),
  };
}

function buildPreparedShowRecord({ candidate, shows = [], today = new Date().toISOString().slice(0, 10) }) {
  const objective = candidate.objective || {};
  const title = trimText(objective.title || candidate.title, 240);
  const showId = candidate.existingShowId || candidate.draftedShowId || ensureUniqueShowId(shows, title);
  const people = peopleByRole(objective);
  const state = releaseState(objective);
  const categories = mergeUniqueStrings(objective.categories || []);
  const genres = mergeUniqueStrings(categories.map(mapCategoryToGenre).filter(Boolean));
  const tags = sourceTags(objective);
  const tagProvenance = sourceTagProvenance(candidate, tags);
  const language = formatLanguage(objective.language);
  const transcriptLanguages = mergeUniqueStrings((objective.transcripts?.languages || []).map(formatLanguage).filter(Boolean));
  const formats = mergeUniqueStrings([
    objective.feedType === "serial" ? "serialized" : "",
    objective.feedType === "episodic" ? "episodic" : "",
  ].filter(Boolean));
  const listenLinks = {
    spotify: normalizeUrl(objective.spotifyUrl || ""),
    apple: normalizeUrl(objective.appleUrl || ""),
    website: normalizeUrl(objective.websiteUrl || ""),
    rss: normalizeUrl(objective.rssUrl || ""),
    youtubeMusic: normalizeUrl(objective.youtubeMusicUrl || ""),
    amazonMusic: normalizeUrl(objective.amazonMusicUrl || ""),
    pocketCasts: normalizeUrl(objective.pocketCastsUrl || ""),
  };
  const sourceReferences = selectedSources(candidate);
  const optionalGaps = [];
  if (!objective.people?.length) optionalGaps.push("Structured creator/cast/production credits were not exposed by the sources.");
  if (!objective.transcripts?.episodeCount) optionalGaps.push("No structured transcript links were exposed by the feed.");
  if (!objective.episodeCount) optionalGaps.push("No full-episode total was available.");
  if (state.releaseStatus === "unknown") optionalGaps.push("Release status remains unknown; old or dead feeds are not treated as cancelled or complete.");
  if (!listenLinks.spotify) optionalGaps.push("No exact Spotify show URL was found on the official site.");
  const record = {
    id: showId,
    title,
    subtitle: trimText(objective.subtitle, 240),
    description: trimText(objective.description, 4_000),
    cover: candidate.coverStage?.ready
      ? candidate.coverStage.existingRelativePath || `images/covers/${showId}${candidate.coverStage.extension}`
      : "",
    coverAlt: `${title} cover art`,
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: state.releaseStatus,
    completionStatus: state.completionStatus,
    listenLinks,
    genres,
    tones: [],
    formats,
    tags,
    aliases: aliasTitles(candidate, title),
    themes: [],
    contentNotes: [],
    languages: language ? [language] : [],
    transcriptLanguages,
    length: buildLengthData(objective),
    releaseDates: {
      first: toDateStamp(objective.firstPublicationDate),
      latest: toDateStamp(objective.latestPublicationDate),
      latestFeedItem: toDateStamp(objective.latestAnyPublicationDate),
      next: toDateStamp(objective.nextScheduledPublicationDate),
    },
    ratings: {},
    facts: {},
    bestFor: [],
    similarTo: [],
    similarReasons: {},
    archiveTake: "",
    spoilerFreeReview: "",
    thoughts: "",
    quote: { text: "", attribution: "" },
    officialLinks: {
      website: normalizeUrl(objective.websiteUrl || ""),
      patreon: normalizeUrl(objective.patreonUrl || ""),
      koFi: normalizeUrl(objective.koFiUrl || ""),
      discord: normalizeUrl(objective.discordUrl || ""),
      youtube: normalizeUrl(objective.youtubeUrl || ""),
      social: mergeUniqueStrings(objective.socialUrls || [])[0] || "",
      funding: mergeUniqueStrings((objective.funding || []).map((entry) => entry.url).filter(Boolean))[0] || "",
    },
    credits: {
      ...(objective.creatorName ? { creatorName: objective.creatorName } : {}),
      ...(objective.ownerName ? { ownerName: objective.ownerName } : {}),
      ...(objective.networkName ? { network: objective.networkName } : {}),
      ...(people.writers.length ? { writers: people.writers } : {}),
      ...(people.directors.length ? { directors: people.directors } : {}),
      ...(people.producers.length ? { producers: people.producers } : {}),
      ...(people.people.length ? { people: people.people } : {}),
    },
    creators: people.creators,
    cast: people.cast,
    verification: {
      status: optionalGaps.length > 0 ? "partially-source-reviewed" : "source-reviewed",
      verifiedAt: today,
      source: sourceReferences.map((source) => source.sourceUrl).filter(Boolean).join("; "),
      note: "A maintainer reviewed factual source metadata only. This does not verify or endorse ratings, reviews, or recommendations.",
    },
    availability: {
      transcripts: objective.transcripts?.episodeCount ? `${objective.transcripts.episodeCount} observed episodes` : "unknown",
      captions: objective.transcripts?.captions ? "available in structured transcript data" : "unknown",
      transcriptCoverage: Number(objective.transcripts?.coverage) || 0,
      transcriptFormats: mergeUniqueStrings(objective.transcripts?.formats || []),
      transcriptLanguages: transcriptLanguages,
    },
    content: {},
    metadata: {
      objectiveSources: sourceReferences.map((source) => source.sourceUrl).filter(Boolean),
      sourceCategories: categories,
      sourceKeywords: mergeUniqueStrings(objective.keywords || []),
      sourceTags: tags,
      importOfficialSummary: trimText(objective.description, 4_000),
      socialUrls: mergeUniqueStrings(objective.socialUrls || []),
      funding: Array.isArray(objective.funding) ? objective.funding : [],
      schedule: objective.cadence || { label: "unknown" },
      podcast: {
        medium: trimText(objective.medium, 80),
        copyright: trimText(objective.copyright, 500),
        explicit: objective.explicit ?? "",
        license: objective.license || {},
        productionLocation: trimText(objective.location, 240),
        country: trimText(objective.country, 80),
        sourceFormat: trimText(objective.sourceFormat, 40),
        contentType: trimText(objective.contentType, 120),
        directoryMarkedDead: objective.dead === true,
      },
      import: {
        pipelineVersion: candidate.pipelineVersion || "2",
        identifiers: {
          podcastGuid: trimText(objective.podcastGuid, 240),
          rssUrl: normalizeUrl(objective.rssUrl || ""),
          appleCollectionId: trimText(objective.appleCollectionId, 80),
          podcastIndexFeedId: trimText(objective.podcastIndexFeedId, 80),
          feedRedirects: mergeUniqueStrings(objective.feedRedirects || []),
        },
        selectedSources: sourceReferences,
        fields: {
          ...(candidate.provenance?.fields || {}),
          releaseStatus: { confidence: state.confidence, method: state.method, sources: [] },
          completionStatus: { confidence: state.confidence, method: state.method, sources: [] },
          ...(tagProvenance ? { tags: tagProvenance } : {}),
          ...(formats.length ? { formats: { confidence: candidate.provenance?.fields?.feedType?.confidence || 0.7, method: "deterministic-feed-type", sources: candidate.provenance?.fields?.feedType?.sources || [] } } : {}),
        },
        importedAt: new Date().toISOString(),
        humanOwnedFields: HUMAN_OWNED_FIELDS,
        managedFingerprints: {},
        optionalGaps,
      },
    },
    featured: false,
    createdAt: today,
    updatedAt: today,
    ...(people.creators[0] ? { creatorId: slugify(people.creators[0]) || undefined } : {}),
    ...(objective.networkName ? { networkId: slugify(objective.networkName) || undefined } : {}),
  };
  record.metadata.import.managedFingerprints = managedFingerprints(record);
  return record;
}

function validDateOrBlank(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
}

function evaluateReadiness({ candidate, preparedRecord }) {
  const blockers = [];
  const warnings = [...(preparedRecord.metadata?.import?.optionalGaps || [])];
  const fields = candidate.provenance?.fields || {};
  const objective = candidate.objective || {};
  const stableIdentity = Boolean(objective.podcastGuid || objective.rssUrl || objective.appleCollectionId || objective.podcastIndexFeedId);
  const listenValues = Object.values(preparedRecord.listenLinks || {}).filter((value) => normalizeUrl(value));
  const successfulSourceUrls = new Set((candidate.sources || []).filter((source) => ["fetched", "success", "not-modified", "cache-hit"].includes(source.fetchStatus)).map((source) => normalizeUrl(source.sourceUrl)));
  const workingListenLink = listenValues.some((url) => successfulSourceUrls.has(normalizeUrl(url))) || Boolean(objective.appleUrl && (candidate.sources || []).some((source) => source.sourceType === "apple" && source.fetchStatus !== "failed"));
  if (!stableIdentity) blockers.push({ code: "missing-identity", field: "identity", message: "No stable RSS, Podcast GUID, Apple, or Podcast Index identity was resolved." });
  if (!preparedRecord.title || (fields.title?.confidence || 0) < 0.75) blockers.push({ code: "weak-title", field: "title", message: "A title with at least 0.75 confidence is required." });
  if (!preparedRecord.description || (fields.description?.confidence || 0) < 0.75) blockers.push({ code: "weak-description", field: "description", message: "A trustworthy official description with at least 0.75 confidence is required." });
  if (!candidate.coverStage?.ready || !preparedRecord.cover) blockers.push({ code: "cover-not-ready", field: "cover", message: "A valid square local cover of at least 600px must be staged." });
  if (listenValues.length === 0) blockers.push({ code: "missing-listen-link", field: "listenLinks", message: "At least one listen link is required." });
  else if (!workingListenLink) blockers.push({ code: "unverified-listen-link", field: "listenLinks", message: "No listen link was confirmed by a successful source fetch." });
  if (![preparedRecord.releaseDates?.first, preparedRecord.releaseDates?.latest].every(validDateOrBlank)) blockers.push({ code: "invalid-date", field: "releaseDates", message: "Release dates are invalid." });
  if (candidate.scopeStatus !== "in-scope") blockers.push({ code: "scope-review", field: "scopeStatus", message: `Catalogue scope is ${candidate.scopeStatus}; a maintainer override is required.` });
  (candidate.conflicts || []).filter((conflict) => conflict.blocking).forEach((conflict) => blockers.push({ code: "source-conflict", field: conflict.fieldName, message: conflict.message }));
  if (candidate.hasDuplicateMatch && candidate.mode !== "update") blockers.push({ code: "duplicate-ambiguity", field: "identity", message: "A possible duplicate must be resolved before publication." });
  return {
    ready: blockers.length === 0,
    reviewAndPublish: blockers.length === 0,
    blockers,
    warnings,
    checks: {
      stableIdentity,
      title: Boolean(preparedRecord.title),
      description: Boolean(preparedRecord.description),
      cover: Boolean(candidate.coverStage?.ready),
      workingListenLink,
      scope: candidate.scopeStatus,
      conflicts: (candidate.conflicts || []).length,
    },
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = {
  HUMAN_OWNED_FIELDS,
  MANAGED_FIELDS,
  buildDraftShowRecord: buildPreparedShowRecord,
  buildPreparedShowRecord,
  ensureUniqueShowId,
  evaluateReadiness,
  managedFingerprints,
  sourceTags,
};
