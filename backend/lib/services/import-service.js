const {
  createAppleAdapter,
} = require("../import/adapters/apple");
const {
  createPodcastIndexAdapter,
} = require("../import/adapters/podcast-index");
const {
  createRssAdapter,
} = require("../import/adapters/rss");
const {
  createWebsiteAdapter,
} = require("../import/adapters/website");
const { buildDedupeMatches } = require("../import/dedupe");
const { buildDraftShowRecord } = require("../import/draft");
const { createSuggestionService } = require("../import/suggestion-service");
const {
  DEFAULT_IMPORT_USER_AGENT,
  IMPORT_CANDIDATE_STATUSES,
  IMPORT_OPEN_STATUSES,
  IMPORT_SCOPE_STATUSES,
  buildResearchGaps,
  cleanDescription,
  detectSeedEntry,
  firstNonEmpty,
  mapCategoryToGenre,
  mergeUniqueStrings,
  normalizeTitleCreatorKey,
  normalizeUrl,
  parseDateValue,
  slugify,
  toDateStamp,
  trimText,
} = require("../import/utils");
const { readShowsFile, validateSiteData, writeShowsFile } = require("../../scripts/review-helpers");
const { buildCatalog } = require("../../../tools/build-catalog");

function ensureValidStatus(value = "") {
  const status = trimText(value, 80);
  if (!IMPORT_CANDIDATE_STATUSES.has(status)) {
    const error = new Error("Unknown import candidate status.");
    error.statusCode = 400;
    throw error;
  }

  return status;
}

function ensureValidScopeStatus(value = "") {
  const scopeStatus = trimText(value, 80);
  if (!IMPORT_SCOPE_STATUSES.has(scopeStatus)) {
    const error = new Error("Unknown import scope status.");
    error.statusCode = 400;
    throw error;
  }

  return scopeStatus;
}

function normalizeSearchSource(value = "") {
  const source = trimText(value, 80).toLowerCase();
  return ["apple", "podcast-index", "all"].includes(source) ? source : "all";
}

function pickBestAppleSearchResult(results = [], { title = "", creatorName = "" } = {}) {
  const normalizedTitle = slugify(title);
  const normalizedCreator = slugify(creatorName);

  return [...results]
    .map((result) => {
      let score = 0;
      const resultTitle = slugify(result.normalized?.title || "");
      const resultCreator = slugify(result.normalized?.creatorName || "");

      if (normalizedTitle && resultTitle === normalizedTitle) {
        score += 100;
      } else if (normalizedTitle && resultTitle.includes(normalizedTitle)) {
        score += 50;
      }

      if (normalizedCreator && resultCreator === normalizedCreator) {
        score += 60;
      } else if (normalizedCreator && resultCreator.includes(normalizedCreator)) {
        score += 30;
      }

      if (!normalizedCreator && result.normalized?.creatorName) {
        score += 10;
      }

      return {
        score,
        result,
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.result || results[0] || null;
}

function buildSearchResultPayload(sourceResult = {}) {
  return {
    sourceType: sourceResult.sourceType || "",
    sourceKey: sourceResult.sourceKey || "",
    sourceUrl: sourceResult.sourceUrl || "",
    title: trimText(sourceResult.normalized?.title || "", 240),
    creatorName: trimText(sourceResult.normalized?.creatorName || "", 240),
    objective: {
      ...sourceResult.normalized,
      objectiveSources: mergeUniqueStrings([sourceResult.sourceUrl || ""]),
      categories: mergeUniqueStrings(
        sourceResult.normalized?.categories || [],
        sourceResult.normalized?.genreHints || [],
      ),
    },
  };
}

function buildInitialCandidatePayload(seed = {}) {
  const objectiveSeed = seed.objective && typeof seed.objective === "object" ? seed.objective : {};
  const objective = {
    title: trimText(objectiveSeed.title || seed.title || "", 240),
    subtitle: trimText(objectiveSeed.subtitle || seed.subtitle || "", 240),
    creatorName: trimText(objectiveSeed.creatorName || seed.creatorName || "", 240),
    rssUrl: trimText(objectiveSeed.rssUrl || seed.rssUrl || "", 500),
    appleUrl: trimText(objectiveSeed.appleUrl || seed.appleUrl || "", 500),
    appleCollectionId: trimText(objectiveSeed.appleCollectionId || seed.appleCollectionId || "", 80),
    websiteUrl: trimText(objectiveSeed.websiteUrl || seed.websiteUrl || "", 500),
    description: cleanDescription(objectiveSeed.description || seed.description || "", 1200),
    artworkUrl: trimText(objectiveSeed.artworkUrl || seed.artworkUrl || "", 500),
    genreHints: mergeUniqueStrings(objectiveSeed.genreHints || seed.genreHints || []),
    categories: mergeUniqueStrings(objectiveSeed.categories || seed.categories || []),
    spotifyUrl: trimText(objectiveSeed.spotifyUrl || seed.spotifyUrl || "", 500),
    patreonUrl: trimText(objectiveSeed.patreonUrl || seed.patreonUrl || "", 500),
    discordUrl: trimText(objectiveSeed.discordUrl || seed.discordUrl || "", 500),
    youtubeUrl: trimText(objectiveSeed.youtubeUrl || seed.youtubeUrl || "", 500),
    networkName: trimText(objectiveSeed.networkName || seed.networkName || "", 240),
    objectiveSources: mergeUniqueStrings(
      [
        objectiveSeed.rssUrl,
        objectiveSeed.appleUrl,
        objectiveSeed.websiteUrl,
        seed.rssUrl,
        seed.appleUrl,
        seed.websiteUrl,
        seed.sourceUrl,
      ].filter(Boolean),
    ),
  };

  return {
    status: "discovered",
    scopeStatus: "in-scope",
    title: objective.title || trimText(seed.titleQuery || seed.seedQuery || seed.rawValue || "", 240),
    creatorName: objective.creatorName,
    canonicalId: slugify(objective.title || seed.titleQuery || ""),
    primarySourceType: seed.sourceType || seed.seedType || "",
    primarySourceKey: trimText(seed.sourceKey || seed.appleCollectionId || "", 240),
    primarySourceUrl: trimText(seed.sourceUrl || seed.rssUrl || seed.appleUrl || seed.websiteUrl || "", 500),
    seedQuery: trimText(seed.seedQuery || seed.titleQuery || seed.rawValue || "", 500),
    objective,
    provenance: {
      fields: {},
      sourceErrors: [],
    },
    aiSuggestions: {},
    dedupe: {},
  };
}

function addFieldProvenance(provenance, fieldName, source, value) {
  const normalizedValue = typeof value === "string" ? trimText(value, 500) : value;
  if (
    normalizedValue === "" ||
    normalizedValue === null ||
    normalizedValue === undefined ||
    (Array.isArray(normalizedValue) && normalizedValue.length === 0)
  ) {
    return;
  }

  if (!provenance.fields[fieldName]) {
    provenance.fields[fieldName] = [];
  }

  provenance.fields[fieldName].push({
    sourceType: source.sourceType,
    sourceKey: source.sourceKey,
    sourceUrl: source.sourceUrl,
    value: normalizedValue,
  });
}

function mergeObjectiveField(target, fieldName, source, sourceValue, options = {}) {
  if (
    sourceValue === "" ||
    sourceValue === null ||
    sourceValue === undefined ||
    (Array.isArray(sourceValue) && sourceValue.length === 0)
  ) {
    return;
  }

  if (Array.isArray(sourceValue)) {
    target[fieldName] = mergeUniqueStrings(target[fieldName] || [], sourceValue);
  } else if (
    options.replace ||
    !target[fieldName] ||
    (typeof target[fieldName] === "string" && !trimText(target[fieldName]))
  ) {
    target[fieldName] = sourceValue;
  }

  addFieldProvenance(target.__provenance, fieldName, source, sourceValue);
}

function mergeObjectiveData(baseObjective = {}, sources = []) {
  const target = {
    ...baseObjective,
    __provenance: {
      fields: {},
      sourceErrors: Array.isArray(baseObjective.__sourceErrors) ? baseObjective.__sourceErrors : [],
    },
  };

  const order = ["apple", "website", "podcast-index", "rss"];
  const orderedSources = [...sources].sort(
    (left, right) => order.indexOf(left.sourceType) - order.indexOf(right.sourceType),
  );

  orderedSources.forEach((source) => {
    const normalized = source.normalized || {};
    mergeObjectiveField(target, "title", source, trimText(normalized.title, 240), {
      replace: source.sourceType === "rss",
    });
    mergeObjectiveField(target, "subtitle", source, trimText(normalized.subtitle, 240), {
      replace: source.sourceType === "rss",
    });
    mergeObjectiveField(target, "creatorName", source, trimText(normalized.creatorName, 240), {
      replace: source.sourceType === "rss",
    });
    mergeObjectiveField(target, "description", source, cleanDescription(normalized.description || "", 1200), {
      replace: source.sourceType === "rss",
    });
    mergeObjectiveField(target, "rssUrl", source, normalizeUrl(normalized.rssUrl || ""), {
      replace: source.sourceType === "rss",
    });
    mergeObjectiveField(target, "appleUrl", source, normalizeUrl(normalized.appleUrl || ""));
    mergeObjectiveField(target, "appleCollectionId", source, trimText(normalized.appleCollectionId, 80));
    mergeObjectiveField(target, "websiteUrl", source, normalizeUrl(normalized.websiteUrl || ""), {
      replace: source.sourceType === "website",
    });
    mergeObjectiveField(target, "artworkUrl", source, normalizeUrl(normalized.artworkUrl || ""), {
      replace: source.sourceType === "rss",
    });
    mergeObjectiveField(target, "language", source, trimText(normalized.language, 40), {
      replace: source.sourceType === "rss",
    });
    mergeObjectiveField(target, "firstPublicationDate", source, parseDateValue(normalized.firstPublicationDate || ""));
    mergeObjectiveField(target, "categories", source, mergeUniqueStrings(normalized.categories || []));
    mergeObjectiveField(target, "genreHints", source, mergeUniqueStrings(normalized.genreHints || []));
    mergeObjectiveField(target, "primaryGenre", source, trimText(normalized.primaryGenre, 120));
    mergeObjectiveField(target, "explicit", source, trimText(normalized.explicit, 60));
    mergeObjectiveField(target, "podcastIndexFeedId", source, trimText(normalized.podcastIndexFeedId, 80));
    mergeObjectiveField(target, "podcastIndexGuid", source, trimText(normalized.podcastIndexGuid, 240));
    mergeObjectiveField(target, "networkName", source, trimText(normalized.networkName, 240));
    mergeObjectiveField(target, "spotifyUrl", source, normalizeUrl(normalized.spotifyUrl || ""));
    mergeObjectiveField(target, "patreonUrl", source, normalizeUrl(normalized.patreonUrl || ""));
    mergeObjectiveField(target, "discordUrl", source, normalizeUrl(normalized.discordUrl || ""));
    mergeObjectiveField(target, "youtubeUrl", source, normalizeUrl(normalized.youtubeUrl || ""));
    mergeObjectiveField(target, "feedType", source, trimText(normalized.feedType, 80).toLowerCase());
    mergeObjectiveField(target, "country", source, trimText(normalized.country, 40));

    if (Number.isFinite(Number(normalized.episodeCount))) {
      const current = Number.isFinite(Number(target.episodeCount)) ? Number(target.episodeCount) : 0;
      target.episodeCount = Math.max(current, Number(normalized.episodeCount));
      addFieldProvenance(target.__provenance, "episodeCount", source, target.episodeCount);
    }

    if (Number.isFinite(Number(normalized.avgEpisodeMinutes))) {
      const current = Number.isFinite(Number(target.avgEpisodeMinutes)) ? Number(target.avgEpisodeMinutes) : 0;
      const nextValue = Number(normalized.avgEpisodeMinutes);
      target.avgEpisodeMinutes = current > 0 ? Math.round((current + nextValue) / 2) : nextValue;
      addFieldProvenance(target.__provenance, "avgEpisodeMinutes", source, target.avgEpisodeMinutes);
    }

    if (Number.isFinite(Number(normalized.seasonCount))) {
      const current = Number.isFinite(Number(target.seasonCount)) ? Number(target.seasonCount) : 0;
      target.seasonCount = Math.max(current, Number(normalized.seasonCount));
      addFieldProvenance(target.__provenance, "seasonCount", source, target.seasonCount);
    }

    const normalizedDate = parseDateValue(normalized.latestPublicationDate || "");
    if (normalizedDate) {
      const currentDate = parseDateValue(target.latestPublicationDate || "");
      if (!currentDate || Date.parse(normalizedDate) > Date.parse(currentDate)) {
        target.latestPublicationDate = normalizedDate;
      }
      addFieldProvenance(target.__provenance, "latestPublicationDate", source, normalizedDate);
    }

    if (normalized.dead === true) {
      target.dead = true;
      addFieldProvenance(target.__provenance, "dead", source, true);
    }

    if (normalized.complete === true) {
      target.complete = true;
      addFieldProvenance(target.__provenance, "complete", source, true);
    }
  });

  target.objectiveSources = mergeUniqueStrings(
    baseObjective.objectiveSources || [],
    orderedSources.map((source) => source.sourceUrl || ""),
  );
  delete target.__sourceErrors;

  return {
    objective: target,
    provenance: target.__provenance,
  };
}

function inferScopeStatus(objective = {}) {
  const language = trimText(objective.language, 40).toLowerCase();
  const haystack = [
    ...(Array.isArray(objective.categories) ? objective.categories : []),
    ...(Array.isArray(objective.genreHints) ? objective.genreHints : []),
    objective.title,
    objective.description,
    objective.primaryGenre,
  ]
    .join(" ")
    .toLowerCase();

  if (language && !["en", "english", "en-us", "en-gb"].includes(language)) {
    return "out-of-scope";
  }

  if (/(actual play|roleplaying|role-playing|ttrpg|tabletop)/i.test(haystack)) {
    return "out-of-scope";
  }

  if (/(fiction|audio drama|comedy fiction|drama|science fiction|horror|mystery|fantasy|thriller)/i.test(haystack)) {
    return "in-scope";
  }

  return "borderline";
}

function buildObjectiveForDedupe(candidate) {
  return {
    ...candidate.objective,
    title: candidate.objective?.title || candidate.title,
    creatorName: candidate.objective?.creatorName || candidate.creatorName,
  };
}

function normalizeReviewUpdates(rawUpdates = {}) {
  const updates = {};

  if (Object.hasOwn(rawUpdates, "status")) {
    updates.status = ensureValidStatus(rawUpdates.status);
  }

  if (Object.hasOwn(rawUpdates, "scopeStatus")) {
    updates.scopeStatus = ensureValidScopeStatus(rawUpdates.scopeStatus);
  }

  if (Object.hasOwn(rawUpdates, "reviewNotes")) {
    updates.reviewNotes = trimText(rawUpdates.reviewNotes, 4000);
  }

  if (Object.hasOwn(rawUpdates, "reviewedBy")) {
    updates.reviewedBy = trimText(rawUpdates.reviewedBy, 160);
  }

  if (Object.hasOwn(rawUpdates, "duplicateOfShowId")) {
    updates.duplicateOfShowId = trimText(rawUpdates.duplicateOfShowId, 160);
  }

  if (Object.hasOwn(rawUpdates, "duplicateOfCandidateId")) {
    updates.duplicateOfCandidateId = trimText(rawUpdates.duplicateOfCandidateId, 160);
  }

  if (Object.keys(updates).length === 0) {
    const error = new Error("No import review fields were provided.");
    error.statusCode = 400;
    throw error;
  }

  return updates;
}

function createImportService({
  store,
  staticRoot,
  config,
  fetchImpl = globalThis.fetch,
  onPublished = null,
}) {
  const userAgent = trimText(config.PODCAST_INDEX_USER_AGENT || DEFAULT_IMPORT_USER_AGENT, 240) || DEFAULT_IMPORT_USER_AGENT;
  const fetchLimits = {
    timeoutMs: config.IMPORT_FETCH_TIMEOUT_MS,
    maxBytes: config.IMPORT_DOCUMENT_MAX_BYTES,
  };
  const apple = createAppleAdapter({ fetchImpl, userAgent, ...fetchLimits });
  const rss = createRssAdapter({ fetchImpl, userAgent, ...fetchLimits });
  const podcastIndex = createPodcastIndexAdapter({
    fetchImpl,
    apiKey: config.PODCAST_INDEX_API_KEY,
    apiSecret: config.PODCAST_INDEX_API_SECRET,
    userAgent,
    ...fetchLimits,
  });
  const website = createWebsiteAdapter({ fetchImpl, userAgent, ...fetchLimits });
  const suggestionService = createSuggestionService({ config, fetchImpl });

  function readCatalogRecords() {
    return readShowsFile(staticRoot);
  }

  function getCandidate(id) {
    const candidate = store.getCandidate(id);
    if (!candidate) {
      const error = new Error("Import candidate not found.");
      error.statusCode = 404;
      throw error;
    }

    return candidate;
  }

  function buildDedupeForCandidate(candidate) {
    return buildDedupeMatches({
      objective: buildObjectiveForDedupe(candidate),
      shows: readCatalogRecords(),
      candidates: store.listCandidateBasics(),
      currentCandidateId: candidate.id,
    });
  }

  async function searchExternalSources({ q, source = "all", limit = 10 }) {
    const results = [];
    const normalizedSource = normalizeSearchSource(source);

    if (normalizedSource === "all" || normalizedSource === "apple") {
      const appleResults = await apple.searchByTerm(q, limit);
      results.push(...appleResults.map(buildSearchResultPayload));
    }

    if ((normalizedSource === "all" || normalizedSource === "podcast-index") && podcastIndex.enabled) {
      const podcastIndexResults = await podcastIndex.searchByTerm(q, limit);
      results.push(...podcastIndexResults.map(buildSearchResultPayload));
    }

    return {
      source: normalizedSource,
      podcastIndexEnabled: podcastIndex.enabled,
      results,
    };
  }

  function listForMaintainer(filters = {}) {
    return store.listCandidates({
      ...filters,
      openStatuses: IMPORT_OPEN_STATUSES,
    });
  }

  async function seedCandidates({ entries = [], searchResults = [], actor = "", autoHydrate = false } = {}) {
    const created = [];
    const normalizedEntries = [
      ...(Array.isArray(entries) ? entries : []).map((entry) => detectSeedEntry(entry)).filter(Boolean),
      ...(Array.isArray(searchResults) ? searchResults : []).map((result) => ({
        ...result,
        sourceType: trimText(result.sourceType, 80),
      })),
    ];

    const runId = store.createRun({
      runType: "seed",
      input: {
        entries,
        searchResults,
      },
      summary: {
        candidateCount: normalizedEntries.length,
      },
    });

    normalizedEntries.forEach((seed) => {
      const payload = buildInitialCandidatePayload(seed);
      payload.canonicalId = payload.canonicalId || slugify(payload.title || payload.seedQuery || "");
      const candidate = store.createCandidate(payload);
      const dedupe = buildDedupeForCandidate(candidate);
      const updated = store.updateCandidate(candidate.id, {
        hasDuplicateMatch: dedupe.hasDuplicateMatch,
        dedupe,
      });
      store.recordEvent(updated.id, "seeded", actor, {
        runId,
        seedQuery: updated.seedQuery,
        primarySourceType: updated.primarySourceType,
      });
      created.push(updated);
    });

    const finalCandidates = [];
    if (autoHydrate) {
      for (const candidate of created) {
        finalCandidates.push(await hydrateForMaintainer(candidate.id, actor));
      }
    } else {
      finalCandidates.push(...created);
    }

    return {
      runId,
      candidates: finalCandidates,
      hydratedCount: autoHydrate ? finalCandidates.length : 0,
    };
  }

  async function hydrateForMaintainer(id, actor = "") {
    const candidate = getCandidate(id);
    const sourceSnapshots = [];
    const sourceErrors = [];

    async function capture(sourceType, loader) {
      try {
        const result = await loader();
        if (result) {
          sourceSnapshots.push({
            sourceType: result.sourceType,
            sourceKey: result.sourceKey,
            sourceUrl: result.sourceUrl,
            fetchStatus: "fetched",
            payload: result.raw,
            normalized: result.normalized,
            fetchedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        sourceErrors.push({
          sourceType,
          error: error.message || String(error),
        });
      }
    }

    const title = candidate.objective?.title || candidate.title || candidate.seedQuery;
    const creatorName = candidate.objective?.creatorName || candidate.creatorName || "";
    const primarySourceType = candidate.primarySourceType;
    const primarySourceUrl = candidate.primarySourceUrl;
    const appleCollectionId = candidate.objective?.appleCollectionId || candidate.primarySourceKey;
    const rssUrl = candidate.objective?.rssUrl || (primarySourceType === "rss" ? primarySourceUrl : "");
    const websiteUrl = candidate.objective?.websiteUrl || (primarySourceType === "website" ? primarySourceUrl : "");

    if (primarySourceType === "apple" && appleCollectionId) {
      await capture("apple", () => apple.lookupByCollectionId(appleCollectionId));
    } else if (primarySourceType === "rss" && rssUrl) {
      await capture("rss", () => rss.fetchByUrl(rssUrl));
    } else if (primarySourceType === "website" && websiteUrl) {
      await capture("website", () => website.fetchByUrl(websiteUrl));
    }

    if (!sourceSnapshots.some((source) => source.sourceType === "apple") && title) {
      await capture("apple", async () => {
        const results = await apple.searchByTerm(
          creatorName ? `${title} ${creatorName}` : title,
          5,
        );
        return pickBestAppleSearchResult(results, { title, creatorName });
      });
    }

    const appleSnapshot = sourceSnapshots.find((source) => source.sourceType === "apple");
    const effectiveRssUrl = rssUrl || appleSnapshot?.normalized?.rssUrl || "";
    if (!sourceSnapshots.some((source) => source.sourceType === "rss") && effectiveRssUrl) {
      await capture("rss", () => rss.fetchByUrl(effectiveRssUrl));
    }

    const rssSnapshot = sourceSnapshots.find((source) => source.sourceType === "rss");
    const effectiveWebsiteUrl =
      websiteUrl ||
      rssSnapshot?.normalized?.websiteUrl ||
      appleSnapshot?.normalized?.websiteUrl ||
      "";
    if (!sourceSnapshots.some((source) => source.sourceType === "website") && effectiveWebsiteUrl) {
      await capture("website", () => website.fetchByUrl(effectiveWebsiteUrl));
    }

    if (podcastIndex.enabled) {
      const podcastIndexRssUrl = rssSnapshot?.normalized?.rssUrl || appleSnapshot?.normalized?.rssUrl || rssUrl;
      if (podcastIndexRssUrl) {
        await capture("podcast-index", () => podcastIndex.lookupByFeedUrl(podcastIndexRssUrl));
      } else if (appleCollectionId) {
        await capture("podcast-index", () => podcastIndex.lookupByItunesId(appleCollectionId));
      }
    }

    const merged = mergeObjectiveData(candidate.objective || {}, sourceSnapshots);
    const objective = {
      ...merged.objective,
      categories: mergeUniqueStrings(
        merged.objective.categories || [],
        merged.objective.genreHints || [],
      ),
      researchGaps: buildResearchGaps(merged.objective),
      languageDisplay:
        trimText(merged.objective.language, 40).toLowerCase() === "en" ? "English" : trimText(merged.objective.language, 40),
    };
    const dedupe = buildDedupeMatches({
      objective: {
        ...objective,
        title: objective.title || candidate.title,
        creatorName: objective.creatorName || candidate.creatorName,
      },
      shows: readCatalogRecords(),
      candidates: store.listCandidateBasics(),
      currentCandidateId: candidate.id,
    });

    let aiSuggestions = {};
    if (suggestionService.enabled) {
      try {
        aiSuggestions = await suggestionService.suggest({
          objective,
          sources: sourceSnapshots,
          existingCatalog: readCatalogRecords().filter((show) => show.status === "published"),
        });
      } catch (error) {
        sourceErrors.push({
          sourceType: "suggestions",
          error: error.message || String(error),
        });
      }
    }

    store.replaceCandidateSources(
      candidate.id,
      sourceSnapshots,
    );

    const updated = store.updateCandidate(candidate.id, {
      status: ["drafted", "published", "duplicate", "rejected"].includes(candidate.status) ? candidate.status : "hydrated",
      scopeStatus: inferScopeStatus(objective),
      hasDuplicateMatch: dedupe.hasDuplicateMatch,
      title: objective.title || candidate.title,
      creatorName: objective.creatorName || candidate.creatorName,
      canonicalId: normalizeTitleCreatorKey(objective.title || candidate.title, objective.creatorName || candidate.creatorName),
      primarySourceType: candidate.primarySourceType || sourceSnapshots[0]?.sourceType || "",
      primarySourceKey: candidate.primarySourceKey || sourceSnapshots[0]?.sourceKey || "",
      primarySourceUrl: candidate.primarySourceUrl || sourceSnapshots[0]?.sourceUrl || "",
      objective: {
        ...objective,
        objectiveSources: mergeUniqueStrings(objective.objectiveSources || []),
      },
      aiSuggestions,
      provenance: {
        ...merged.provenance,
        sourceErrors,
      },
      dedupe,
      reviewedAt: actor ? new Date().toISOString() : candidate.reviewedAt,
      reviewedBy: actor || candidate.reviewedBy,
    });

    store.recordEvent(candidate.id, "hydrated", actor, {
      sourceTypes: sourceSnapshots.map((source) => source.sourceType),
      sourceErrors,
    });

    return updated;
  }

  function reviewForMaintainer(id, rawUpdates = {}, actor = "") {
    const candidate = getCandidate(id);
    const updates = normalizeReviewUpdates(rawUpdates);
    const reviewedAt = new Date().toISOString();

    const updated = store.updateCandidate(candidate.id, {
      ...updates,
      reviewedAt,
      reviewedBy: updates.reviewedBy ?? actor ?? candidate.reviewedBy,
    });
    store.recordEvent(candidate.id, "reviewed", actor || updates.reviewedBy || "", updates);
    return updated;
  }

  async function draftForMaintainer(id, actor = "") {
    const candidate = getCandidate(id);
    if (["duplicate", "rejected", "published"].includes(candidate.status)) {
      const error = new Error(`Cannot write a draft from a ${candidate.status} candidate.`);
      error.statusCode = 400;
      throw error;
    }

    const shows = readCatalogRecords();
    const existingDraft = candidate.draftedShowId ? shows.find((show) => show.id === candidate.draftedShowId) : null;
    const draftedShowId = existingDraft?.id || candidate.draftedShowId || "";

    if (existingDraft) {
      const updated = store.updateCandidate(candidate.id, {
        status: "drafted",
        draftedShowId,
        reviewedAt: new Date().toISOString(),
        reviewedBy: actor || candidate.reviewedBy,
      });
      store.recordEvent(candidate.id, "drafted", actor, {
        showId: draftedShowId,
        reusedExistingDraft: true,
      });
      return {
        candidate: updated,
        showId: draftedShowId,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const nextShow = buildDraftShowRecord({
      candidate,
      shows,
      today,
    });

    shows.push(nextShow);
    writeShowsFile(staticRoot, shows);

    try {
      await validateSiteData(staticRoot);
    } catch (error) {
      writeShowsFile(
        staticRoot,
        shows.filter((show) => show.id !== nextShow.id),
      );
      await buildCatalog(staticRoot);
      throw error;
    }

    const updated = store.updateCandidate(candidate.id, {
      status: "drafted",
      draftedShowId: nextShow.id,
      reviewedAt: new Date().toISOString(),
      reviewedBy: actor || candidate.reviewedBy,
    });
    store.recordEvent(candidate.id, "drafted", actor, {
      showId: nextShow.id,
      reusedExistingDraft: false,
    });

    return {
      candidate: updated,
      showId: nextShow.id,
    };
  }

  async function publishForMaintainer(id, actor = "") {
    const candidate = getCandidate(id);
    const showId = candidate.publishedShowId || candidate.draftedShowId;
    if (!showId) {
      const error = new Error("Write a draft show before publishing.");
      error.statusCode = 400;
      throw error;
    }

    const shows = readCatalogRecords();
    const show = shows.find((record) => record.id === showId);
    if (!show) {
      const error = new Error(`Draft show "${showId}" is missing from the authored catalog source.`);
      error.statusCode = 404;
      throw error;
    }

    const previousStatus = show.status;
    const previousUpdatedAt = show.updatedAt;
    const today = new Date().toISOString().slice(0, 10);
    show.status = "published";
    show.updatedAt = today;
    show.createdAt = show.createdAt || today;
    writeShowsFile(staticRoot, shows);

    try {
      await validateSiteData(staticRoot);
    } catch (error) {
      show.status = previousStatus;
      show.updatedAt = previousUpdatedAt;
      writeShowsFile(staticRoot, shows);
      await buildCatalog(staticRoot);
      throw error;
    }

    const updated = store.updateCandidate(candidate.id, {
      status: "published",
      publishedShowId: showId,
      reviewedAt: new Date().toISOString(),
      reviewedBy: actor || candidate.reviewedBy,
    });
    store.recordEvent(candidate.id, "published", actor, {
      showId,
    });

    if (typeof onPublished === "function") {
      await onPublished();
    }

    return {
      candidate: updated,
      showId,
    };
  }

  function getForMaintainer(id) {
    return getCandidate(id);
  }

  function buildReport(filters = {}) {
    return listForMaintainer({
      ...filters,
      includeClosed: true,
      page: 1,
      pageSize: 200,
    });
  }

  return {
    buildReport,
    draftForMaintainer,
    getForMaintainer,
    hydrateForMaintainer,
    listForMaintainer,
    publishForMaintainer,
    reviewForMaintainer,
    searchExternalSources,
    seedCandidates,
  };
}

module.exports = {
  createImportService,
};
