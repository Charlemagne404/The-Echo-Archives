const { createHash } = require("node:crypto");

const {
  mapCategoryToGenre,
  mapSourceFormats,
  mergeUniqueStrings,
  normalizeUrl,
  slugify,
  toDateStamp,
  trimText,
} = require("./utils");
const {
  MAX_PUBLISHED_DISCOVERY_TAGS,
  MIN_PUBLISHED_DISCOVERY_SIGNALS,
  discoveryTagStatus,
  isApprovedDiscoveryTag,
  normalizeDiscoveryTags,
} = require("../../../shared/archive-tags");
const {
  appleCollectionIdFromUrl,
  CANONICAL_GENRES,
  isNonWebsiteUrl,
  isPlaceholderDescription,
} = require("../../../shared/archive-quality");
const { buildImportedProvenance } = require("../../../tools/lib/catalog-provenance");
const { isVerifiedAmazonMusicIdentity } = require("./adapters/amazon-music");
const { PLACEHOLDER_COVER } = require("../cover-sync");

const HUMAN_OWNED_FIELDS = [
  "ratings", "archiveTake", "spoilerFreeReview", "thoughts", "tones", "bestFor",
  "similarTo", "similarReasons", "featured", "accent", "content", "themes",
  "contentNotes", "collectionMembership",
];
const MANAGED_FIELDS = [
  "title", "subtitle", "description", "cover", "coverAlt", "releaseStatus", "completionStatus",
  "listenLinks", "officialLinks", "genres", "tags", "formats", "aliases", "languages", "transcriptLanguages",
  "length", "releaseDates", "credits", "creators", "cast", "availability", "verification", "provenance",
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
  if (objective.manualReleaseState === "unknown") {
    return { releaseStatus: "unknown", completionStatus: "unclear", method: "maintainer-unknown", confidence: 0 };
  }
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
  const hasEpisodeCounts = objective.episodeCounts && ["full", "bonus", "trailer"].some((key) => {
    const value = objective.episodeCounts[key];
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  });
  const hasEpisodeTotal = objective.episodeCount !== null && objective.episodeCount !== undefined && objective.episodeCount !== "" && Number.isFinite(Number(objective.episodeCount));
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
    countQualifier: !hasEpisodeCounts && !hasEpisodeTotal
      ? "unknown"
      : counts.exact || objective.episodeCountExact ? "exact" : "at-least",
    ...(hasEpisodeCounts ? {
      episodeCounts: {
        full: Number(counts.full) || 0,
        bonus: Number(counts.bonus) || 0,
        trailer: Number(counts.trailer) || 0,
      },
    } : {}),
  };
}

function peopleByRole(objective = {}) {
  const manualPeople = Array.isArray(objective.manualEnrichment?.people) ? objective.manualEnrichment.people : [];
  const seen = new Set();
  const people = [...(Array.isArray(objective.people) ? objective.people : []), ...manualPeople]
    .filter((person) => person?.name && person?.role)
    .filter((person) => {
      const key = `${person.name}`.trim().toLowerCase() + `|${person.role}`.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
  const canonicalTitle = slugify(title);
  const aliases = mergeUniqueStrings(
    [title],
    (candidate.fieldEvidence || [])
      .filter((item) => item.fieldName === "title")
      .map((item) => item.value)
      .filter((value) => {
        const normalized = slugify(value);
        return normalized && (normalized === canonicalTitle || normalized.startsWith(`${canonicalTitle}-`));
      }),
  );
  const seenNormalized = new Set();
  return aliases.filter((alias) => {
    const normalized = slugify(alias);
    if (!normalized || seenNormalized.has(normalized)) return false;
    seenNormalized.add(normalized);
    return true;
  }).slice(0, 10);
}

function selectedSources(candidate) {
  return [...new Map((candidate.sources || []).filter((source) => source.fetchStatus !== "failed").map((source) => [
    `${source.sourceType}|${source.sourceUrl}`,
    { sourceType: source.sourceType, sourceUrl: source.sourceUrl, fetchedAt: source.fetchedAt, payloadHash: source.payloadHash },
  ])).values()];
}

function reviewedDiscoveryTagSelection(objective = {}) {
  const selected = normalizeDiscoveryTags(objective.manualTags || [])
    .map((value) => trimText(value, 80))
    .filter((value) => value.length >= 2)
    .slice(0, MAX_PUBLISHED_DISCOVERY_TAGS);

  return {
    approved: selected.filter(isApprovedDiscoveryTag),
    proposals: selected
      .filter((value) => !isApprovedDiscoveryTag(value))
      .map((label) => ({
        label,
        status: discoveryTagStatus(label) || "proposed",
        rationale: trimText(objective.taxonomyExceptionRationale, 800),
        evidence: mergeUniqueStrings(objective.externalResearch?.fieldSources?.tags || []),
      })),
  };
}

function normalizeEditorialRecommendations(objective = {}) {
  const input = objective.editorialRecommendations;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const fieldSources = Object.fromEntries(["genres", "formats", "tags", "releaseStatus", "completionStatus"].map((fieldName) => [
    fieldName,
    mergeUniqueStrings(input.fieldSources?.[fieldName] || []),
  ]));
  const genres = mergeUniqueStrings(input.genres || []).map((value) => value.toLowerCase()).filter((value) => CANONICAL_GENRES.has(value));
  const formats = mergeUniqueStrings(input.formats || []);
  const tags = normalizeDiscoveryTags(input.tags || []);
  return {
    status: "pending-maintainer-review",
    genres,
    formats,
    tags,
    releaseStatus: objective.manualReleaseState === "unknown" ? "" : ["active", "completed", "cancelled", "unknown"].includes(input.releaseStatus) ? input.releaseStatus : "",
    completionStatus: objective.manualReleaseState === "unknown" ? "" : ["ongoing", "finished", "cancelled", "unclear"].includes(input.completionStatus) ? input.completionStatus : "",
    rationale: trimText(input.rationale, 2_000),
    fieldSources,
    sources: mergeUniqueStrings(input.sources || [], ...Object.values(fieldSources)),
  };
}

function reviewedDiscoveryTags(objective = {}) {
  return reviewedDiscoveryTagSelection(objective).approved;
}

function sourceGenreProvenance(candidate, genres) {
  if (genres.length === 0) return null;

  const categoryEvidence = candidate.provenance?.fields?.categories || {};
  const reviewedSources = Array.isArray(candidate.objective?.externalResearch?.fieldSources?.genres)
    ? candidate.objective.externalResearch.fieldSources.genres
    : [];
  const categoryMethod = String(categoryEvidence.method || "");
  const humanMethod = /maintainer|reviewed|reviewer|manual|suggestion|unstructured/i.test(categoryMethod);

  return {
    confidence: reviewedSources.length ? 0.95 : Number(categoryEvidence.confidence) || 0.7,
    method: reviewedSources.length
      ? "reviewed-genre-selection"
      : humanMethod
        ? categoryMethod
        : "deterministic-category-mapping",
    sources: reviewedSources.length
      ? reviewedSources.map((sourceUrl) => ({ sourceType: "external-research", sourceUrl }))
      : categoryEvidence.sources || [],
  };
}

function sourceTagProvenance(candidate, tags) {
  if (tags.length === 0) return null;
  const sourceFields = ["categories", "keywords"]
    .map((field) => candidate.provenance?.fields?.[field])
    .filter(Boolean);
  const reviewedSources = candidate.objective?.externalResearch?.fieldSources?.tags || [];

  return {
    confidence: reviewedSources.length ? 0.95 : sourceFields.length ? Math.max(...sourceFields.map((field) => Number(field.confidence) || 0)) : 0.7,
    method: reviewedSources.length ? "reviewed-taxonomy-selection" : "maintainer-taxonomy-selection",
    sources: reviewedSources.length ? reviewedSources.map((sourceUrl) => ({ sourceType: "external-research", sourceUrl })) : sourceFields.flatMap((field) => field.sources || []),
  };
}

function buildPreparedShowRecord({ candidate, shows = [], today = new Date().toISOString().slice(0, 10) }) {
  const objective = candidate.objective || {};
  const enrichment = objective.manualEnrichment || {};
  const title = trimText(objective.title || candidate.title, 240);
  const showId = candidate.existingShowId || candidate.draftedShowId || ensureUniqueShowId(shows, title);
  const people = peopleByRole(objective);
  const state = releaseState(objective);
  const editorial = normalizeEditorialRecommendations(objective);
  const editorialReleaseStatus = editorial?.releaseStatus || "";
  const editorialCompletionStatus = editorial?.completionStatus || "";
  const preparedReleaseStatus = editorialReleaseStatus || state.releaseStatus;
  const preparedCompletionStatus = editorialCompletionStatus || state.completionStatus;
  const categories = mergeUniqueStrings(objective.categories || []);
  const sourceGenres = mergeUniqueStrings(categories.map(mapCategoryToGenre).filter(Boolean));
  const genres = sourceGenres;
  const tagSelection = reviewedDiscoveryTagSelection(objective);
  const tags = tagSelection.approved;
  const tagProvenance = sourceTagProvenance(candidate, tags);
  const genreProvenance = sourceGenreProvenance(candidate, genres);
  const language = formatLanguage(objective.language);
  const transcriptLanguages = mergeUniqueStrings((objective.transcripts?.languages || []).map(formatLanguage).filter(Boolean));
  const sourceFormats = mapSourceFormats({ categories, keywords: objective.keywords || [] });
  const formats = mergeUniqueStrings(enrichment.formats || [], sourceFormats);
  const unsupportedRssNarrativeFormat = !formats.length && ["episodic", "serial"].includes(String(objective.feedType || "").toLowerCase());
  const listenLinks = {
    start: normalizeUrl(objective.startUrl || ""),
    spotify: normalizeUrl(objective.spotifyUrl || ""),
    apple: normalizeUrl(objective.appleUrl || ""),
    website: normalizeUrl(objective.websiteUrl || ""),
    rss: normalizeUrl(objective.rssUrl || ""),
    youtubeMusic: normalizeUrl(objective.youtubeMusicUrl || ""),
    amazonMusic: normalizeUrl(objective.amazonMusicUrl || ""),
    pocketCasts: normalizeUrl(objective.pocketCastsUrl || ""),
  };
  const sourceReferences = selectedSources(candidate);
  const sourceFormatField = ["categories", "keywords"].find((fieldName) =>
    mapSourceFormats({
      categories: fieldName === "categories" ? categories : [],
      keywords: fieldName === "keywords" ? objective.keywords || [] : [],
    }).length > 0,
  );
  const sourceFormatEvidence = sourceFormatField ? candidate.provenance?.fields?.[sourceFormatField] : null;
  const externalSources = mergeUniqueStrings(
    objective.externalResearch?.sourceUrls || [],
    Object.values(objective.externalResearch?.fieldSources || {}).flat(),
  );
  const optionalGaps = [];
  if (!people.people.length) optionalGaps.push("Structured creator/cast/production credits were not exposed by the sources.");
  if (!objective.transcripts?.episodeCount) optionalGaps.push("No structured transcript links were exposed by the feed.");
  if (!objective.episodeCount) optionalGaps.push("No full-episode total was available.");
  if (state.releaseStatus === "unknown" && !editorialReleaseStatus) optionalGaps.push("Release status remains unknown; old or dead feeds are not treated as cancelled or complete.");
  if (state.completionStatus === "unclear" && !editorialCompletionStatus) optionalGaps.push("Completion status remains unclear until an authoritative source confirms the show's ending.");
  if (objective.deferredFields?.explicit) optionalGaps.push(`Explicit status remains unknown pending review: ${trimText(objective.deferredFields.explicit.reason || "conflicting sources", 600)}`);
  if (editorial) optionalGaps.push("Editorial discovery recommendations are staged for maintainer review; they are not verified facts or signed approvals.");
  if (!listenLinks.spotify) optionalGaps.push("No exact Spotify show URL was found on the official site.");
  const researchGaps = mergeUniqueStrings(
    Array.isArray(objective.researchGaps) ? objective.researchGaps : [],
    objective.externalResearch?.uncertainFields || [],
  );
  const record = {
    id: showId,
    title,
    subtitle: trimText(objective.manualSubtitle || objective.subtitle, 240),
    description: trimText(objective.description, 4_000),
    cover: candidate.coverStage?.omittedForRights
      ? PLACEHOLDER_COVER
      : candidate.coverStage?.ready
        ? candidate.coverStage.existingRelativePath || `images/covers/${showId}${candidate.coverStage.extension}`
        : "",
    coverAlt: candidate.coverStage?.omittedForRights ? "Echo Archives placeholder artwork" : `${title} cover art`,
    status: "published",
    reviewStatus: "imported",
    releaseStatus: preparedReleaseStatus,
    completionStatus: preparedCompletionStatus,
    listenLinks,
    genres,
    tones: mergeUniqueStrings(enrichment.tones || []),
    formats,
    tags,
    aliases: aliasTitles(candidate, title),
    themes: mergeUniqueStrings(enrichment.themes || []),
    contentNotes: mergeUniqueStrings(enrichment.contentNotes || []),
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
      patreon: normalizeUrl(enrichment.officialLinks?.patreonUrl || objective.patreonUrl || ""),
      koFi: normalizeUrl(enrichment.officialLinks?.koFiUrl || objective.koFiUrl || ""),
      discord: normalizeUrl(enrichment.officialLinks?.discordUrl || objective.discordUrl || ""),
      youtube: normalizeUrl(enrichment.officialLinks?.youtubeUrl || objective.youtubeUrl || ""),
      social: mergeUniqueStrings(enrichment.socialUrls || objective.socialUrls || [])[0] || "",
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
      status: "automated-source-checked",
      verifiedAt: today,
      source: mergeUniqueStrings(sourceReferences.map((source) => source.sourceUrl).filter(Boolean), externalSources).join("; "),
      note: "Automated checks assembled factual metadata from publisher feeds and directories. This entry has not yet received an individual maintainer review.",
    },
    provenance: buildImportedProvenance({
      candidate,
      objective,
      sourceReferences,
      externalSources,
    }),
    availability: {
      transcripts: objective.transcripts?.episodeCount ? `${objective.transcripts.episodeCount} observed episodes` : "unknown",
      captions: objective.transcripts?.captions ? "available in structured transcript data" : "unknown",
      transcriptCoverage: Number(objective.transcripts?.coverage) || 0,
      transcriptFormats: mergeUniqueStrings(objective.transcripts?.formats || []),
      transcriptLanguages: transcriptLanguages,
    },
    content: {},
    metadata: {
      ...(researchGaps.length ? { researchGaps } : {}),
      objectiveSources: mergeUniqueStrings(sourceReferences.map((source) => source.sourceUrl).filter(Boolean), externalSources),
      sourceCategories: categories,
      sourceKeywords: mergeUniqueStrings(objective.keywords || []),
      sourceTags: tags,
      importOfficialSummary: trimText(objective.description, 4_000),
      socialUrls: mergeUniqueStrings(enrichment.socialUrls || objective.socialUrls || []),
      funding: Array.isArray(objective.funding) ? objective.funding : [],
      schedule: enrichment.cadenceLabel ? { label: enrichment.cadenceLabel, method: "maintainer-verified" } : objective.cadence || { label: "unknown" },
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
          amazonMusicId: trimText(objective.amazonMusicId || (isVerifiedAmazonMusicIdentity(objective) ? objective.externalIdentity.id : ""), 100),
          podcastGuid: trimText(objective.podcastGuid, 240),
          rssUrl: normalizeUrl(objective.rssUrl || ""),
          appleCollectionId: trimText(objective.appleCollectionId, 80),
          podcastIndexFeedId: trimText(objective.podcastIndexFeedId, 80),
          feedRedirects: mergeUniqueStrings(objective.feedRedirects || []),
        },
        selectedSources: sourceReferences,
        ...(candidate.coverStage?.omittedForRights ? {
          artworkDisposition: {
            status: "omitted-rights-not-established",
            sourceType: candidate.coverStage.sourceType || "",
            sourceUrl: candidate.coverStage.sourceUrl || "",
            publishedCover: PLACEHOLDER_COVER,
          },
        } : {}),
        ...(isVerifiedAmazonMusicIdentity(objective) ? {
          externalIdentity: {
            provider: "amazon-music",
            id: objective.externalIdentity.id,
            url: objective.externalIdentity.url,
            verified: true,
            verifiedAt: objective.externalIdentity.verifiedAt,
          },
        } : {}),
        ...(tagSelection.proposals.length ? { taxonomyProposals: tagSelection.proposals } : {}),
        ...(objective.externalResearch ? { externalResearch: objective.externalResearch } : {}),
        ...(objective.deferredFields ? { deferredFields: objective.deferredFields } : {}),
        ...(editorial ? { editorialRecommendations: editorial } : {}),
        fields: {
          ...(candidate.provenance?.fields || {}),
          releaseStatus: objective.manualReleaseState === "unknown"
            ? { confidence: 0, method: "maintainer-unknown", sources: [] }
            : editorialReleaseStatus
            ? { confidence: 0.7, method: "editorial-recommendation", sources: editorial.fieldSources.releaseStatus.map((sourceUrl) => ({ sourceType: "editorial-recommendation", sourceUrl })) }
            : { confidence: state.confidence, method: state.method, sources: [] },
          completionStatus: objective.manualReleaseState === "unknown"
            ? { confidence: 0, method: "maintainer-unknown", sources: [] }
            : editorialCompletionStatus
            ? { confidence: 0.7, method: "editorial-recommendation", sources: editorial.fieldSources.completionStatus.map((sourceUrl) => ({ sourceType: "editorial-recommendation", sourceUrl })) }
            : { confidence: state.confidence, method: state.method, sources: [] },
          ...(genreProvenance ? { genres: genreProvenance } : {}),
          ...(tagProvenance ? { tags: tagProvenance } : {}),
          ...(formats.length ? { formats: {
            confidence: enrichment.formats?.length ? 1 : sourceFormatEvidence?.confidence || 0.7,
            method: enrichment.formats?.length ? "maintainer-verified-research" : "deterministic-source-format",
            sources: enrichment.formats?.length ? objective.externalResearch?.fieldSources?.formats || [] : sourceFormatEvidence?.sources || [],
          } } : unsupportedRssNarrativeFormat ? { formats: {
            confidence: 0,
            method: "removed-rss-feed-type",
            sources: candidate.provenance?.fields?.feedType?.sources || [],
          } } : {}),
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
  const stableIdentity = Boolean(objective.podcastGuid || objective.rssUrl || objective.appleCollectionId || objective.podcastIndexFeedId || isVerifiedAmazonMusicIdentity(objective));
  const listenValues = Object.values(preparedRecord.listenLinks || {}).filter((value) => normalizeUrl(value));
  const successfulSourceUrls = new Set((candidate.sources || []).filter((source) => ["fetched", "success", "not-modified", "cache-hit"].includes(source.fetchStatus)).map((source) => normalizeUrl(source.sourceUrl)));
  const workingListenLink = listenValues.some((url) => successfulSourceUrls.has(normalizeUrl(url))) || Boolean(objective.appleUrl && (candidate.sources || []).some((source) => source.sourceType === "apple" && source.fetchStatus !== "failed"));
  if (!stableIdentity) blockers.push({ code: "missing-identity", field: "identity", message: "No stable RSS, Podcast GUID, Apple, or Podcast Index identity was resolved." });
  if (!preparedRecord.title || (fields.title?.confidence || 0) < 0.75) blockers.push({ code: "weak-title", field: "title", message: "A title with at least 0.75 confidence is required." });
  const descriptionNeedsReview = !preparedRecord.description || (fields.description?.confidence || 0) < 0.75 || isPlaceholderDescription(preparedRecord.title, preparedRecord.description);
  if (descriptionNeedsReview) warnings.push({
    code: "description-incomplete",
    field: "description",
    message: "Description is missing, short, or weakly sourced; provisional publication can proceed with it blank, while Imported publication still requires a source-backed description.",
  });
  const taxonomyProposals = preparedRecord.metadata?.import?.taxonomyProposals || [];
  if (taxonomyProposals.length) {
    warnings.push({
      code: "taxonomy-proposals",
      field: "tags",
      message: `These tags are kept as taxonomy proposals and excluded from public discovery until approved: ${taxonomyProposals.map((proposal) => proposal.label).join(", ")}.`,
    });
  }
  const editorial = preparedRecord.metadata?.import?.editorialRecommendations;
  if (editorial?.status === "pending-maintainer-review") {
    warnings.push({
      code: "editorial-recommendation-review",
      field: "genres/formats/tags/releaseStatus/completionStatus",
      message: "Editorial recommendations are staged in the draft and need maintainer review; they do not mark factual review or approval.",
    });
  }
  const discoverySignals = new Set([
    ...(preparedRecord.genres || []).map((value) => `genre:${value}`),
    ...(preparedRecord.formats || []).map((value) => `format:${value}`),
    ...(preparedRecord.tags || []).filter(isApprovedDiscoveryTag).map((value) => `tag:${value}`),
  ]);
  // itunes:type remains objective feed metadata, but it is not a public
  // discovery signal. A source-complete RSS candidate may therefore proceed
  // with its remaining source-backed genre while the public format stays
  // explicitly unclassified.
  const unsupportedRssNarrativeFormat = !preparedRecord.formats?.length
    && ["episodic", "serial"].includes(String(objective.feedType || "").toLowerCase());
  const sparseDiscovery = discoverySignals.size < MIN_PUBLISHED_DISCOVERY_SIGNALS && !unsupportedRssNarrativeFormat;
  if (sparseDiscovery || (preparedRecord.genres || []).length === 0) warnings.push({
    code: "discovery-metadata-incomplete",
    field: "genres/formats/tags",
    message: "Provisional publication can proceed without a genre, format, or discovery tag; these fields remain empty until verified or editorially approved.",
  });
  if ([preparedRecord.listenLinks?.website, preparedRecord.officialLinks?.website].filter(Boolean).some(isNonWebsiteUrl)) blockers.push({ code: "invalid-website", field: "websiteUrl", message: "A social or support profile cannot be used as the official website." });
  const expectedAppleId = String(objective.appleCollectionId || "").trim();
  const linkedAppleId = appleCollectionIdFromUrl(preparedRecord.listenLinks?.apple);
  if (expectedAppleId && preparedRecord.listenLinks?.apple && linkedAppleId !== expectedAppleId) {
    blockers.push({ code: "invalid-apple-link", field: "appleUrl", message: `The Apple listen link does not match imported collection id "${expectedAppleId}".` });
  }
  const usesRightsSafePlaceholder = candidate.coverStage?.omittedForRights === true && preparedRecord.cover === PLACEHOLDER_COVER;
  if ((!candidate.coverStage?.ready && !usesRightsSafePlaceholder) || !preparedRecord.cover) blockers.push({ code: "cover-not-ready", field: "cover", message: "A valid square local cover or the explicit Echo placeholder decision is required." });
  if (listenValues.length === 0) blockers.push({ code: "missing-listen-link", field: "listenLinks", message: "At least one listen link is required." });
  else if (!workingListenLink) blockers.push({ code: "unverified-listen-link", field: "listenLinks", message: "No listen link was confirmed by a successful source fetch." });
  if (![preparedRecord.releaseDates?.first, preparedRecord.releaseDates?.latest].every(validDateOrBlank)) blockers.push({ code: "invalid-date", field: "releaseDates", message: "Release dates are invalid." });
  if (candidate.scopeStatus !== "in-scope") blockers.push({ code: "scope-review", field: "scopeStatus", message: `Catalogue scope is ${candidate.scopeStatus}; a maintainer override is required.` });
  (candidate.conflicts || []).filter((conflict) => conflict.blocking).forEach((conflict) => blockers.push({ code: "source-conflict", field: conflict.fieldName, message: conflict.message }));
  if (candidate.hasDuplicateMatch && candidate.mode !== "update") blockers.push({ code: "duplicate-ambiguity", field: "identity", message: "A possible duplicate must be resolved before publication." });
  const importedBlockers = [...blockers];
  if (descriptionNeedsReview) importedBlockers.push({ code: "import-description", field: "description", message: "Imported publication requires a complete source-backed description." });
  if (sparseDiscovery) importedBlockers.push({ code: "import-discovery-metadata", field: "genres/formats/tags", message: `Imported publication requires at least ${MIN_PUBLISHED_DISCOVERY_SIGNALS} approved discovery signals.` });
  if ((preparedRecord.genres || []).length === 0) importedBlockers.push({ code: "import-genre", field: "genres", message: "Imported publication requires at least one source-backed canonical genre." });
  const trustedCoreFields = ["title", "description"];
  trustedCoreFields.forEach((fieldName) => {
    const evidence = fields[fieldName] || {};
    if ((Number(evidence.confidence) || 0) < 0.9) {
      importedBlockers.push({ code: "import-confidence", field: fieldName, message: `${fieldName} needs at least 0.90 structured-source confidence for Imported publication.` });
    }
    if (/unstructured|maintainer|reviewer|suggestion/i.test(String(evidence.method || ""))) {
      importedBlockers.push({ code: "import-human-source", field: fieldName, message: `${fieldName} uses human or unstructured evidence and should be published as indexed-only after factual review.` });
    }
  });
  ["genres", "tags", "formats"].forEach((fieldName) => {
    const evidence = preparedRecord.metadata?.import?.fields?.[fieldName];
    if ((preparedRecord[fieldName] || []).length > 0 && /maintainer|reviewed|manual|suggestion|unstructured|recommendation/i.test(String(evidence?.method || ""))) {
      importedBlockers.push({
        code: "import-curated-discovery",
        field: fieldName,
        message: `${fieldName} include a human-curated mapping and require indexed-only factual review.`,
      });
    }
  });
  ["releaseStatus", "completionStatus"].forEach((fieldName) => {
    const evidence = preparedRecord.metadata?.import?.fields?.[fieldName];
    if (evidence?.method === "editorial-recommendation") {
      importedBlockers.push({
        code: "import-curated-release-state",
        field: fieldName,
        message: `${fieldName} is an editorial recommendation and needs maintainer review before Imported publication.`,
      });
    }
  });
  const exactIdentityFields = ["rssUrl", "podcastGuid", "appleCollectionId", "podcastIndexFeedId", "amazonMusicId"];
  const exactIdentity = exactIdentityFields.some((fieldName) => {
    if (!objective[fieldName]) return false;
    const evidence = fields[fieldName] || {};
    return (Number(evidence.confidence) || 0) >= 0.9 && !/unstructured|maintainer|reviewer|suggestion/i.test(String(evidence.method || ""));
  });
  if (!exactIdentity) {
    importedBlockers.push({ code: "import-exact-identity", field: "identity", message: "Imported publication requires an exact identity supported by structured evidence at 0.90 confidence or higher." });
  }
  if ((candidate.lockedFields || []).includes("scopeStatus")) {
    importedBlockers.push({ code: "import-scope-override", field: "scopeStatus", message: "A manually overridden scope decision requires indexed-only factual review." });
  }
  const humanOwnedContent = [
    ...(preparedRecord.tones || []), ...(preparedRecord.themes || []), ...(preparedRecord.contentNotes || []),
    ...(preparedRecord.bestFor || []), ...(preparedRecord.similarTo || []),
  ];
  if (humanOwnedContent.length > 0 || Object.keys(preparedRecord.similarReasons || {}).length > 0) {
    importedBlockers.push({ code: "import-editorial-content", field: "reviewStatus", message: "Human-owned discovery or editorial fields require indexed-only factual review." });
  }
  const factualReviewCurrent = Boolean(
    candidate.factsReviewedAt &&
    Number(candidate.factsReviewedRevision) === Number(candidate.inputRevision),
  );
  const indexedOnlyBlockers = [...blockers];
  if (!factualReviewCurrent) {
    indexedOnlyBlockers.push({ code: "facts-not-reviewed", field: "reviewStatus", message: "A current factual review is required for indexed-only publication." });
  }

  return {
    ready: blockers.length === 0,
    reviewAndPublish: blockers.length === 0,
    blockers,
    warnings,
    publicationEligibility: {
      imported: { eligible: importedBlockers.length === 0, blockers: importedBlockers },
      indexedOnly: { eligible: indexedOnlyBlockers.length === 0, blockers: indexedOnlyBlockers },
    },
    checks: {
      stableIdentity,
      title: Boolean(preparedRecord.title),
      description: Boolean(preparedRecord.description),
      cover: Boolean(candidate.coverStage?.ready || usesRightsSafePlaceholder),
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
  normalizeEditorialRecommendations,
  reviewedDiscoveryTags,
  reviewedDiscoveryTagSelection,
};
