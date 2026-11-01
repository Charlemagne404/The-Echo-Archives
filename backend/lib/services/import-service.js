const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");

const { createAppleAdapter } = require("../import/adapters/apple");
const { createAmazonMusicAdapter, isVerifiedAmazonMusicIdentity, parseAmazonMusicIdentityUrl } = require("../import/adapters/amazon-music");
const { createPodcastIndexAdapter } = require("../import/adapters/podcast-index");
const { createRssAdapter } = require("../import/adapters/rss");
const { createWebsiteAdapter } = require("../import/adapters/website");
const { inspectCoverBuffer, promoteStagedCover, stageCover } = require("../import/cover-stage");
const { buildDedupeMatches } = require("../import/dedupe");
const { buildPreparedShowRecord, evaluateReadiness } = require("../import/draft");
const { mergePreparedWithExisting } = require("../import/managed-fields");
const { candidateContentHash } = require("../import/publisher-hash");
const { PLACEHOLDER_COVER } = require("../cover-sync");
const { resolveSourceFacts } = require("../import/resolution");
const {
  DEFAULT_IMPORT_USER_AGENT,
  IMPORT_CANDIDATE_STATUSES,
  IMPORT_OPEN_STATUSES,
  IMPORT_SCOPE_STATUSES,
  cleanDescription,
  detectSeedEntry,
  extractAppleCollectionId,
  mergeUniqueStrings,
  normalizeTitleCreatorKey,
  normalizeUrl,
  slugify,
  trimText,
} = require("../import/utils");
const { readShowsFile, validateSiteData } = require("../../scripts/review-helpers");
const { buildCatalog } = require("../../../tools/build-catalog");
const { writeShowRecordsAtomically } = require("../../../tools/lib/catalog-source");
const { completeCatalogPublicationRecovery, runWithCatalogPublication } = require("../../../tools/lib/catalog-publication-transaction");

const PIPELINE_VERSION = "2.0";
const IDENTITY_FIELDS = [
  ["podcast-guid", "podcastGuid"],
  ["rss-url", "rssUrl"],
  ["apple-id", "appleCollectionId"],
  ["podcast-index-id", "podcastIndexFeedId"],
  ["website-url", "websiteUrl"],
];
const DISCOVERY_SOURCE_TYPES = new Set(["apple-search", "podcast-index-search"]);
const SUPPRESSED_CANDIDATE_STATUSES = new Set(["duplicate", "rejected"]);
const BATCH_PREPARATION_STATUSES = ["ready", "needs-review", "failed"];
const PUBLICATION_TIERS = new Set(["imported", "indexed-only"]);

function ensurePublicationTier(value = "") {
  const tier = trimText(value, 80);
  if (!PUBLICATION_TIERS.has(tier)) {
    const error = new Error("publicationTier must be imported or indexed-only.");
    error.statusCode = 400;
    throw error;
  }
  return tier;
}

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

function inferScopeStatus(objective = {}) {
  const language = trimText(objective.language, 40).toLowerCase();
  const text = [objective.title, objective.description, objective.primaryGenre, ...(objective.categories || []), ...(objective.keywords || [])].join(" ").toLowerCase();
  if (language && language !== "english" && !/^en(?:-[a-z0-9]{2,8})*$/.test(language)) return "out-of-scope";
  if (/(actual play|roleplaying|role-playing|ttrpg|tabletop)/i.test(text)) return "out-of-scope";
  if (/(fiction|audio drama|comedy fiction|drama|science fiction|horror|mystery|fantasy|thriller)/i.test(text)) return "in-scope";
  return "borderline";
}

function pickBestSearchResult(results = [], { title = "", creatorName = "" } = {}) {
  const wantedTitle = slugify(title);
  const wantedCreator = slugify(creatorName);
  return [...results].map((result) => {
    const resultTitle = slugify(result.normalized?.title || "");
    const resultCreator = slugify(result.normalized?.creatorName || "");
    let score = resultTitle === wantedTitle ? 100 : resultTitle.includes(wantedTitle) ? 40 : 0;
    if (wantedCreator) score += resultCreator === wantedCreator ? 60 : resultCreator.includes(wantedCreator) ? 20 : 0;
    return { result, score };
  }).sort((left, right) => right.score - left.score)[0]?.result || null;
}

function buildSearchResultPayload(result = {}) {
  return {
    sourceType: result.sourceType || "",
    sourceKey: result.sourceKey || "",
    sourceUrl: result.sourceUrl || "",
    title: trimText(result.normalized?.title, 240),
    creatorName: trimText(result.normalized?.creatorName, 240),
    objective: { ...(result.normalized || {}), objectiveSources: [result.sourceUrl].filter(Boolean) },
  };
}

function buildInitialCandidatePayload(seed = {}) {
  const input = seed.objective && typeof seed.objective === "object" ? seed.objective : {};
  const objective = {
    ...input,
    title: trimText(input.title || seed.title || "", 240),
    creatorName: trimText(input.creatorName || seed.creatorName || "", 240),
    rssUrl: normalizeUrl(input.rssUrl || seed.rssUrl || ""),
    appleUrl: normalizeUrl(input.appleUrl || seed.appleUrl || ""),
    appleCollectionId: trimText(input.appleCollectionId || seed.appleCollectionId || "", 80),
    websiteUrl: normalizeUrl(input.websiteUrl || seed.websiteUrl || ""),
    description: cleanDescription(input.description || seed.description || "", 4_000),
    artworkUrl: normalizeUrl(input.artworkUrl || seed.artworkUrl || ""),
    categories: mergeUniqueStrings(input.categories || [], input.genreHints || []),
    objectiveSources: mergeUniqueStrings(input.objectiveSources || [], [seed.sourceUrl, seed.rssUrl, seed.appleUrl, seed.websiteUrl].filter(Boolean)),
  };
  const title = objective.title || trimText(seed.titleQuery || seed.seedQuery || seed.rawValue || "", 240);
  return {
    status: "queued",
    mode: "create",
    scopeStatus: "borderline",
    title,
    creatorName: objective.creatorName || "",
    canonicalId: normalizeTitleCreatorKey(title, objective.creatorName),
    primarySourceType: seed.sourceType || seed.seedType || "",
    primarySourceKey: trimText(seed.sourceKey || seed.appleCollectionId || "", 1_000),
    primarySourceUrl: normalizeUrl(seed.sourceUrl || seed.rssUrl || seed.appleUrl || seed.websiteUrl || ""),
    seedQuery: trimText(seed.seedQuery || seed.titleQuery || seed.rawValue || "", 500),
    objective,
    provenance: { fields: {}, sourceErrors: [] },
    dedupe: {},
    pipelineVersion: PIPELINE_VERSION,
  };
}

function discoveryItemKey(result = {}) {
  const objective = result.objective || {};
  return trimText(
    result.sourceKey || objective.appleCollectionId || objective.podcastIndexFeedId || objective.podcastIndexGuid || objective.rssUrl || result.sourceUrl || normalizeTitleCreatorKey(result.title || objective.title, result.creatorName || objective.creatorName),
    1_000,
  ).toLowerCase();
}

function discoveryIdentity(result = {}) {
  const objective = result.objective || {};
  return {
    sourceType: result.sourceType || "",
    sourceKey: result.sourceKey || "",
    sourceUrl: result.sourceUrl || "",
    rssUrl: objective.rssUrl || "",
    appleCollectionId: objective.appleCollectionId || "",
    podcastIndexFeedId: objective.podcastIndexFeedId || "",
    podcastIndexGuid: objective.podcastIndexGuid || "",
    titleCreatorKey: normalizeTitleCreatorKey(result.title || objective.title, result.creatorName || objective.creatorName),
  };
}

function identityPairs(objective = {}) {
  const externalPairs = isVerifiedAmazonMusicIdentity(objective)
    ? [["amazon-music-id", objective.externalIdentity.id]]
    : [];
  return [
    ...IDENTITY_FIELDS.map(([type, field]) => [type, objective[field]]),
    ...externalPairs,
    ...(objective.feedRedirects || []).map((value) => ["rss-url", value]),
    ...(objective.previousRssUrl ? [["rss-url", objective.previousRssUrl]] : []),
  ].filter(([, value]) => value);
}

function showIdentityPairs(show = {}) {
  const identifiers = show.metadata?.import?.identifiers || show.metadata?.importIdentifiers || {};
  return [
    ["podcast-guid", identifiers.podcastGuid || identifiers.podcastIndexGuid],
    ["rss-url", identifiers.rssUrl || show.listenLinks?.rss],
    ["apple-id", identifiers.appleCollectionId || extractAppleCollectionId(show.listenLinks?.apple)],
    ["podcast-index-id", identifiers.podcastIndexFeedId],
    ["amazon-music-id", identifiers.amazonMusicId],
    ["website-url", show.officialLinks?.website || show.listenLinks?.website],
    ...(identifiers.feedRedirects || []).map((value) => ["rss-url", value]),
  ].filter(([, value]) => value);
}

function normalizeReviewUpdates(raw = {}) {
  const updates = {};
  if (raw.status !== undefined) updates.status = ensureValidStatus(raw.status);
  if (raw.scopeStatus !== undefined) updates.scopeStatus = ensureValidScopeStatus(raw.scopeStatus);
  if (raw.reviewNotes !== undefined) updates.reviewNotes = trimText(raw.reviewNotes, 4_000);
  if (raw.reviewedBy !== undefined) updates.reviewedBy = trimText(raw.reviewedBy, 160);
  if (raw.duplicateOfShowId !== undefined) updates.duplicateOfShowId = trimText(raw.duplicateOfShowId, 160);
  if (raw.duplicateOfCandidateId !== undefined) updates.duplicateOfCandidateId = trimText(raw.duplicateOfCandidateId, 160);
  if (Object.keys(updates).length === 0) {
    const error = new Error("No import review fields were provided.");
    error.statusCode = 400;
    throw error;
  }
  return updates;
}

function splitTags(value = "") {
  return mergeUniqueStrings(String(value || "").split(/[\n,]/).map((item) => trimText(item, 80)).filter(Boolean));
}

function splitEditorList(value = "", limit = 8) {
  return splitTags(value).slice(0, limit);
}

function normalizeCredits(value = "") {
  return String(value || "").split(/\r?\n/).map((line) => {
    const [name, ...roleParts] = line.split(/\s*(?:—|–|-)\s*/);
    const normalizedName = trimText(name, 240);
    const role = trimText(roleParts.join(" "), 100).toLowerCase();
    return normalizedName && role ? { name: normalizedName, role } : null;
  }).filter(Boolean).slice(0, 20);
}

function parseExternalVerification(value = "") {
  const input = trimText(value, 20_000);
  if (!input) return null;
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (_error) {
    const error = new Error("External verification metadata must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const urls = (items) => mergeUniqueStrings(Array.isArray(items) ? items : [])
    .map((item) => normalizeUrl(item)).filter(Boolean).slice(0, 12);
  const fieldSources = Object.fromEntries(Object.entries(parsed.fieldSources || {})
    .map(([field, sourceUrls]) => [trimText(field, 80), urls(sourceUrls)])
    .filter(([field, sourceUrls]) => field && sourceUrls.length));
  return {
    sourceUrls: urls(parsed.sourceUrls),
    fieldSources,
    notes: trimText(parsed.notes, 1_200),
    uncertainFields: splitEditorList(Array.isArray(parsed.uncertainFields) ? parsed.uncertainFields.join(",") : "", 20),
    reviewedAt: new Date().toISOString(),
  };
}

function normalizeEditedUrl(value, label) {
  const input = trimText(value, 2_000);
  if (!input) return "";
  const normalized = normalizeUrl(input);
  if (!normalized) {
    const error = new Error(`${label} must be a complete http or https URL.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function normalizeEditedNumber(value, label) {
  const input = trimText(value, 40);
  if (!input) return undefined;
  const number = Number(input);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`${label} must be a positive number.`);
    error.statusCode = 400;
    throw error;
  }
  return Math.round(number * 10) / 10;
}

function normalizeEditedDate(value, label) {
  const input = trimText(value, 20);
  if (!input) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || !Number.isFinite(Date.parse(input))) {
    const error = new Error(`${label} must use YYYY-MM-DD.`);
    error.statusCode = 400;
    throw error;
  }
  return input;
}

function normalizeEditableDetails(raw = {}) {
  const title = trimText(raw.title, 240);
  if (!title) {
    const error = new Error("A show title is required.");
    error.statusCode = 400;
    throw error;
  }
  const completionStatus = ["unknown", "ongoing", "finished"].includes(raw.completionStatus) ? raw.completionStatus : "unknown";
  const externalResearch = parseExternalVerification(raw.externalVerification);
  return {
    title,
    subtitle: trimText(raw.subtitle, 240),
    creatorName: trimText(raw.creatorName, 240),
    networkName: trimText(raw.networkName, 240),
    description: cleanDescription(raw.description, 4_000),
    categories: splitTags(raw.categories),
    tags: splitTags(raw.tags),
    taxonomyExceptionRationale: trimText(raw.taxonomyExceptionRationale, 800),
    language: trimText(raw.language, 80),
    rssUrl: normalizeEditedUrl(raw.rssUrl, "RSS feed URL"),
    websiteUrl: normalizeEditedUrl(raw.websiteUrl, "Official website URL"),
    appleUrl: normalizeEditedUrl(raw.appleUrl, "Apple URL"),
    spotifyUrl: normalizeEditedUrl(raw.spotifyUrl, "Spotify URL"),
    startUrl: normalizeEditedUrl(raw.startUrl, "Start-listening URL"),
    episodeCount: normalizeEditedNumber(raw.episodeCount, "Episode count"),
    seasonCount: normalizeEditedNumber(raw.seasonCount, "Season count"),
    avgEpisodeMinutes: normalizeEditedNumber(raw.avgEpisodeMinutes, "Average runtime"),
    firstPublicationDate: normalizeEditedDate(raw.firstPublicationDate, "First release date"),
    latestPublicationDate: normalizeEditedDate(raw.latestPublicationDate, "Latest release date"),
    manualReleaseState: completionStatus,
    manualEnrichment: {
      formats: splitEditorList(raw.formats),
      tones: splitEditorList(raw.tones),
      themes: splitEditorList(raw.themes),
      contentNotes: splitEditorList(raw.contentNotes),
      people: normalizeCredits(raw.credits),
      officialLinks: {
        patreonUrl: normalizeEditedUrl(raw.patreonUrl, "Patreon URL"),
        koFiUrl: normalizeEditedUrl(raw.koFiUrl, "Ko-fi URL"),
        discordUrl: normalizeEditedUrl(raw.discordUrl, "Discord URL"),
        youtubeUrl: normalizeEditedUrl(raw.youtubeUrl, "YouTube URL"),
      },
      socialUrls: splitEditorList(raw.socialUrls, 12).map((url) => normalizeEditedUrl(url, "Official social URL")).filter(Boolean),
      cadenceLabel: trimText(raw.cadenceLabel, 160),
    },
    ...(externalResearch ? { externalResearch } : {}),
  };
}

function createLimitedFetch(fetchImpl, { perHost = 2, applePerMinute = 15 } = {}) {
  const active = new Map();
  const waiters = new Map();
  const appleRequests = [];
  async function acquire(host) {
    if ((active.get(host) || 0) >= perHost) await new Promise((resolve) => {
      const queue = waiters.get(host) || [];
      queue.push(resolve);
      waiters.set(host, queue);
    });
    active.set(host, (active.get(host) || 0) + 1);
  }
  function release(host) {
    active.set(host, Math.max(0, (active.get(host) || 1) - 1));
    const next = waiters.get(host)?.shift();
    if (next) next();
  }
  const withHostLimit = async (url, performRequest) => {
    const host = new URL(String(url)).hostname.toLowerCase();
    await acquire(host);
    try {
      if (host === "itunes.apple.com") {
        const now = Date.now();
        while (appleRequests.length && appleRequests[0] <= now - 60_000) appleRequests.shift();
        if (appleRequests.length >= applePerMinute) {
          await new Promise((resolve) => setTimeout(resolve, Math.max(1, appleRequests[0] + 60_000 - now)));
        }
        appleRequests.push(Date.now());
      }
      return await performRequest();
    } finally {
      release(host);
    }
  };
  const limitedFetch = (url, init) => withHostLimit(url, () => fetchImpl(url, init));
  limitedFetch.isNetworkFetch = fetchImpl === globalThis.fetch || fetchImpl.isNetworkFetch === true;
  limitedFetch.withNetworkRequest = (url, performRequest) => withHostLimit(url, performRequest);
  return limitedFetch;
}

function createImportService({ store, staticRoot, config = {}, fetchImpl = globalThis.fetch, onPublished = null }) {
  const userAgent = trimText(config.PODCAST_INDEX_USER_AGENT || DEFAULT_IMPORT_USER_AGENT, 240) || DEFAULT_IMPORT_USER_AGENT;
  const workerConcurrency = Math.min(16, Math.max(1, Number(config.IMPORT_WORKER_CONCURRENCY) || 4));
  const limitedFetch = createLimitedFetch(fetchImpl, {
    perHost: Math.min(8, Math.max(1, Number(config.IMPORT_HOST_CONCURRENCY) || 2)),
    applePerMinute: Math.min(20, Math.max(1, Number(config.IMPORT_APPLE_REQUESTS_PER_MINUTE) || 15)),
  });
  const limits = { timeoutMs: config.IMPORT_FETCH_TIMEOUT_MS, maxBytes: config.IMPORT_DOCUMENT_MAX_BYTES };
  const apple = createAppleAdapter({ fetchImpl: limitedFetch, userAgent, ...limits });
  const amazonMusic = createAmazonMusicAdapter({ fetchImpl: limitedFetch, userAgent, ...limits });
  const rss = createRssAdapter({ fetchImpl: limitedFetch, userAgent, ...limits });
  const website = createWebsiteAdapter({ fetchImpl: limitedFetch, userAgent, ...limits });
  const podcastIndex = createPodcastIndexAdapter({
    fetchImpl: limitedFetch,
    apiKey: config.PODCAST_INDEX_API_KEY,
    apiSecret: config.PODCAST_INDEX_API_SECRET,
    userAgent,
    ...limits,
  });
  const stagingRoot = config.IMPORT_STAGING_ROOT || path.join(config.DATA_ROOT || path.dirname(config.DB_PATH || path.join(staticRoot, "backend-data", "imports.sqlite")), "import-staging");
  const workerId = `${process.pid}-${randomUUID()}`;
  let catalogCache = null;
  let workTimer = null;
  let processing = false;
  let discoveryTimer = null;
  let discoveryProcessing = false;
  const discoveryConcurrency = Math.min(8, Math.max(1, Number(config.IMPORT_DISCOVERY_CONCURRENCY) || 2));
  store.compactPublishedSnapshots?.(90);

  function readCatalogRecords(force = false) {
    if (!catalogCache || force) catalogCache = readShowsFile(staticRoot);
    return catalogCache;
  }

  function registerCatalogIdentities() {
    readCatalogRecords().forEach((show) => showIdentityPairs(show).forEach(([type, value]) => {
      store.claimIdentity(type, value, { existingShowId: show.id });
    }));
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

  function findExactMapping(objective = {}) {
    for (const [type, value] of identityPairs(objective)) {
      const mapping = store.findIdentity(type, value);
      if (mapping) return mapping;
    }
    return null;
  }

  function findSuppressedTitleCandidate(objective = {}) {
    const canonicalId = normalizeTitleCreatorKey(objective.title, objective.creatorName);
    if (!canonicalId) return null;
    return store.listCandidates({
      q: objective.title,
      includeClosed: true,
      openStatuses: [],
      pageSize: 50,
    }).items.find((candidate) => (
      SUPPRESSED_CANDIDATE_STATUSES.has(candidate.status) && candidate.canonicalId === canonicalId
    )) || null;
  }

  function buildDedupe(candidate) {
    const title = candidate.objective?.title || candidate.title;
    const creatorName = candidate.objective?.creatorName || candidate.creatorName;
    const titleKey = slugify(title);
    const creatorKey = slugify(creatorName);
    const shows = readCatalogRecords().filter((show) => {
      if (candidate.existingShowId && show.id === candidate.existingShowId) return false;
      return slugify(show.title) === titleKey;
    });
    const candidatePage = title ? store.listCandidates({ q: title, includeClosed: true, openStatuses: [], pageSize: 25 }) : { items: [] };
    const candidates = candidatePage.items.filter((entry) => entry.id !== candidate.id && slugify(entry.title) === titleKey && (!creatorKey || !entry.creatorName || slugify(entry.creatorName) === creatorKey));
    return buildDedupeMatches({ objective: { ...candidate.objective, title, creatorName }, shows, candidates, currentCandidateId: candidate.id });
  }

  function listForMaintainer(filters = {}) {
    return store.listCandidates({ ...filters, openStatuses: IMPORT_OPEN_STATUSES });
  }

  function getPublishedCandidateForShow(showId) {
    const candidate = store.getLatestPublishedCandidateForShow(showId);
    return candidate ? getCandidate(candidate.id) : null;
  }

  async function searchExternalSources({ q, source = "all", limit = 10 }) {
    const selected = ["apple", "podcast-index", "all"].includes(String(source).toLowerCase()) ? String(source).toLowerCase() : "all";
    const results = [];
    if (["apple", "all"].includes(selected)) results.push(...(await apple.searchByTerm(q, limit)).map(buildSearchResultPayload));
    if (["podcast-index", "all"].includes(selected) && podcastIndex.enabled) results.push(...(await podcastIndex.searchByTerm(q, limit)).map(buildSearchResultPayload));
    return { source: selected, podcastIndexEnabled: podcastIndex.enabled, results };
  }

  function normalizeDiscoverySourceInput(raw = {}, current = null) {
    const sourceType = trimText(raw.sourceType ?? current?.sourceType, 80);
    if (!DISCOVERY_SOURCE_TYPES.has(sourceType)) {
      const error = new Error("Discovery sources must use Apple search or Podcast Index search.");
      error.statusCode = 400;
      throw error;
    }
    const query = trimText(raw.query ?? current?.query, 500);
    if (!query) {
      const error = new Error("A discovery search query is required.");
      error.statusCode = 400;
      throw error;
    }
    const name = trimText(raw.name ?? current?.name, 160) || `${sourceType === "apple-search" ? "Apple" : "Podcast Index"}: ${query}`;
    const currentConfig = current?.config || {};
    const configValue = raw.config && typeof raw.config === "object" ? raw.config : {};
    return {
      name,
      sourceType,
      query,
      enabled: raw.enabled === undefined ? current?.enabled !== false : Boolean(raw.enabled),
      intervalMinutes: Math.min(43_200, Math.max(15, Number(raw.intervalMinutes ?? current?.intervalMinutes) || 1_440)),
      config: {
        ...currentConfig,
        ...configValue,
        limit: Math.min(20, Math.max(1, Number(configValue.limit ?? currentConfig.limit) || 10)),
        includeBorderline: configValue.includeBorderline === undefined
          ? Boolean(currentConfig.includeBorderline)
          : Boolean(configValue.includeBorderline),
      },
    };
  }

  function listDiscoveryForMaintainer() {
    return {
      sources: store.listDiscoverySources({ includeDisabled: true }),
      runs: store.listDiscoveryRuns({ limit: 20 }),
      podcastIndexEnabled: podcastIndex.enabled,
    };
  }

  function createDiscoverySourceForMaintainer(raw = {}) {
    const source = store.createDiscoverySource(normalizeDiscoverySourceInput(raw));
    return source;
  }

  function updateDiscoverySourceForMaintainer(id, raw = {}) {
    const current = store.getDiscoverySource(id);
    if (!current) {
      const error = new Error("Discovery source not found.");
      error.statusCode = 404;
      throw error;
    }
    const source = store.updateDiscoverySource(id, normalizeDiscoverySourceInput(raw, current));
    if (source.enabled && raw.enabled !== false && raw.runSoon === true) {
      store.updateDiscoverySource(id, { ...source, nextRunAt: new Date().toISOString() });
    }
    return store.getDiscoverySource(id);
  }

  function scheduleDiscoveryWork(delayMs = 0, { periodic = false } = {}) {
    if ((periodic && config.IMPORT_AUTO_DISCOVERY === false) || discoveryTimer) return;
    discoveryTimer = setTimeout(() => {
      discoveryTimer = null;
      if (periodic) runDueDiscovery().catch(() => {});
      else processPendingDiscoveryJobs().catch(() => {});
    }, Math.max(0, delayMs));
    discoveryTimer.unref?.();
  }

  function refreshDiscoveryRun(runId) {
    if (!runId) return null;
    const run = store.getDiscoveryRun(runId);
    if (!run) return null;
    const done = run.progress.completed + run.progress.failed;
    const status = run.progress.total === 0
      ? "completed"
      : done === run.progress.total
        ? run.progress.failed > 0 ? "failed" : "completed"
        : run.progress.processing > 0 || done > 0 ? "processing" : "queued";
    return store.updateDiscoveryRun(runId, {
      status,
      summary: { ...run.summary, ...run.progress },
    });
  }

  function enqueueDiscoverySource(sourceId, { actor = "", force = false } = {}) {
    const source = store.getDiscoverySource(sourceId);
    if (!source) {
      const error = new Error("Discovery source not found.");
      error.statusCode = 404;
      throw error;
    }
    if (!source.enabled && !force) {
      const error = new Error("Enable this discovery source before scheduling it.");
      error.statusCode = 409;
      throw error;
    }
    const run = store.createDiscoveryRun({ sourceId, status: "queued", summary: { sourceName: source.name, actor } });
    store.enqueueDiscoveryJob({ sourceId, runId: run.id, payload: { actor, force } });
    store.updateDiscoverySource(sourceId, { ...source, lastStatus: "queued", lastError: "" });
    scheduleDiscoveryWork();
    return { runId: run.id, source: store.getDiscoverySource(sourceId) };
  }

  async function discoveryResultsForSource(source) {
    const limit = Math.min(20, Math.max(1, Number(source.config?.limit) || 10));
    if (source.sourceType === "apple-search") {
      return (await apple.searchByTerm(source.query, limit)).map(buildSearchResultPayload);
    }
    if (source.sourceType === "podcast-index-search") {
      if (!podcastIndex.enabled) {
        const error = new Error("Podcast Index credentials are not configured.");
        error.retryable = false;
        throw error;
      }
      return (await podcastIndex.searchByTerm(source.query, limit)).map(buildSearchResultPayload);
    }
    const error = new Error("Unsupported discovery source type.");
    error.retryable = false;
    throw error;
  }

  async function ingestDiscoveryResult({ source, runId, result }) {
    const sourceItemKey = discoveryItemKey(result);
    if (!sourceItemKey) return { disposition: "invalid" };
    const identity = discoveryIdentity(result);
    const itemPayload = {
      sourceId: source.id,
      sourceItemKey,
      identity,
      result: { title: result.title, creatorName: result.creatorName, sourceUrl: result.sourceUrl, sourceType: result.sourceType },
      lastRunId: runId,
    };
    const prior = store.getDiscoveryItem(source.id, sourceItemKey);
    if (prior) {
      store.upsertDiscoveryItem({ ...itemPayload, candidateId: prior.candidateId, existingShowId: prior.existingShowId, disposition: prior.disposition });
      return { disposition: "seen", candidateId: prior.candidateId, existingShowId: prior.existingShowId };
    }
    const scopeStatus = inferScopeStatus(result.objective || {});
    if (scopeStatus !== "in-scope" && !(scopeStatus === "borderline" && source.config?.includeBorderline)) {
      store.upsertDiscoveryItem({ ...itemPayload, disposition: scopeStatus });
      return { disposition: scopeStatus };
    }
    const seeded = await seedCandidates({
      searchResults: [result],
      actor: "discovery-worker",
      origin: "discovery",
      discoveryContext: { sourceId: source.id, runId },
    });
    const candidate = seeded.candidates[0];
    const suppressed = seeded.suppressed[0];
    const disposition = candidate ? "queued" : suppressed?.reason || "seen";
    store.upsertDiscoveryItem({
      ...itemPayload,
      candidateId: candidate?.id || suppressed?.candidateId || "",
      existingShowId: suppressed?.existingShowId || "",
      disposition,
    });
    return { disposition, candidateId: candidate?.id || suppressed?.candidateId || "", existingShowId: suppressed?.existingShowId || "" };
  }

  async function processDiscoveryJob(job) {
    const source = store.getDiscoverySource(job.sourceId);
    if (!source) {
      const error = new Error("Discovery source no longer exists.");
      error.retryable = false;
      throw error;
    }
    store.updateDiscoveryRun(job.runId, { status: "processing" });
    try {
      const results = await discoveryResultsForSource(source);
      const outcomes = [];
      for (const result of results) outcomes.push(await ingestDiscoveryResult({ source, runId: job.runId, result }));
      const dispositionCounts = outcomes.reduce((counts, outcome) => {
        counts[outcome.disposition] = (counts[outcome.disposition] || 0) + 1;
        return counts;
      }, {});
      const summary = {
        found: results.length,
        dispositions: dispositionCounts,
        candidateIds: outcomes.map((outcome) => outcome.candidateId).filter(Boolean),
      };
      const currentRun = store.getDiscoveryRun(job.runId);
      store.updateDiscoveryRun(job.runId, { status: "processing", summary: { ...currentRun?.summary, ...summary } });
      store.completeDiscoveryJob(job.id, summary);
      const nextRunAt = new Date(Date.now() + (source.intervalMinutes * 60_000)).toISOString();
      store.updateDiscoverySource(source.id, {
        ...source,
        lastCheckedAt: new Date().toISOString(),
        nextRunAt,
        lastStatus: "completed",
        lastError: "",
      });
      return summary;
    } catch (error) {
      const failed = store.failDiscoveryJob(job.id, error, { retryable: error.retryable !== false, retryAfterMs: error.retryAfterMs || 0 });
      store.updateDiscoverySource(source.id, {
        ...source,
        lastCheckedAt: new Date().toISOString(),
        nextRunAt: failed.nextAttemptAt || new Date(Date.now() + (source.intervalMinutes * 60_000)).toISOString(),
        lastStatus: failed.status,
        lastError: trimText(error.message || error, 4_000),
      });
      throw error;
    } finally {
      refreshDiscoveryRun(job.runId);
    }
  }

  async function processPendingDiscoveryJobs({ limit = discoveryConcurrency } = {}) {
    if (discoveryProcessing) return { claimed: 0 };
    discoveryProcessing = true;
    try {
      const jobs = [];
      for (let index = 0; index < Math.min(discoveryConcurrency, Math.max(1, limit)); index += 1) {
        const job = store.claimNextDiscoveryJob({ workerId, leaseMs: 120_000 });
        if (!job) break;
        jobs.push(job);
      }
      await Promise.all(jobs.map(async (job) => {
        try {
          await processDiscoveryJob(job);
        } catch (_error) {
          // The failed job and source state are recorded in processDiscoveryJob.
        }
      }));
      if (config.IMPORT_AUTO_DISCOVERY === true) scheduleDiscoveryWork(60_000, { periodic: true });
      return { claimed: jobs.length, jobIds: jobs.map((job) => job.id) };
    } finally {
      discoveryProcessing = false;
    }
  }

  async function runDueDiscovery({ force = false, actor = "scheduler" } = {}) {
    const sources = force
      ? store.listDiscoverySources({ includeDisabled: false })
      : store.listDueDiscoverySources(20);
    const scheduled = sources.map((source) => enqueueDiscoverySource(source.id, { actor, force: true }));
    await processPendingDiscoveryJobs({ limit: discoveryConcurrency });
    return { runIds: scheduled.map((entry) => entry.runId), sourceIds: sources.map((source) => source.id) };
  }

  async function waitForDiscoveryRun(runId, timeoutMs = 30_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const run = store.getDiscoveryRun(runId);
      if (run && ["completed", "failed"].includes(run.status)) return run;
      await processPendingDiscoveryJobs({ limit: discoveryConcurrency });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const error = new Error(`Discovery run ${runId} did not finish within ${timeoutMs}ms.`);
    error.statusCode = 504;
    throw error;
  }

  function scheduleWork(delayMs = 0) {
    if (config.IMPORT_AUTO_WORKER === false || workTimer) return;
    workTimer = setTimeout(() => {
      workTimer = null;
      processPendingJobs().catch(() => {});
    }, Math.max(0, delayMs));
    workTimer.unref?.();
  }

  function refreshRun(runId) {
    if (!runId) return null;
    const run = store.getRun(runId);
    if (!run) return null;
    const done = run.progress.completed + run.progress.failed;
    const status = run.progress.total === 0
      ? "completed"
      : done === run.progress.total
        ? run.progress.failed > 0 ? "failed" : "completed"
        : run.progress.processing > 0 || done > 0 ? "processing" : "queued";
    return store.updateRun(runId, {
      status,
      summary: { ...run.summary, ...run.progress, candidateIds: run.jobs.map((job) => job.candidateId) },
    });
  }

  function enqueueCandidate(candidateId, { actor = "", runType = "prepare", incrementRevision = true, reopen = false } = {}) {
    const candidate = getCandidate(candidateId);
    if (SUPPRESSED_CANDIDATE_STATUSES.has(candidate.status) && !reopen) {
      const error = new Error("This closed import candidate must be explicitly reopened before it can be prepared again.");
      error.statusCode = 409;
      throw error;
    }
    const revision = incrementRevision ? candidate.inputRevision + 1 : candidate.inputRevision;
    const run = store.createRun({ runType, status: "queued", input: { candidateIds: [candidateId], actor }, summary: { candidateCount: 1 } });
    store.updateCandidate(candidateId, { status: "queued", inputRevision: revision, lastRunId: run.id, lastError: "" });
    store.enqueueJob({ candidateId, runId: run.id, inputRevision: revision, payload: { actor } });
    store.recordEvent(candidateId, "prepare-enqueued", actor, { runId: run.id, inputRevision: revision });
    scheduleWork();
    return { runId: run.id, candidateIds: [candidateId], candidate: getCandidate(candidateId) };
  }

  async function seedCandidates({ entries = [], searchResults = [], actor = "", autoHydrate = false, origin = "manual", discoveryContext = null } = {}) {
    registerCatalogIdentities();
    const seeds = [
      ...(Array.isArray(entries) ? entries.map(detectSeedEntry).filter(Boolean) : []),
      ...(Array.isArray(searchResults) ? searchResults.map((entry) => ({ ...entry, sourceType: trimText(entry.sourceType, 80) })) : []),
    ];
    const run = store.createRun({ runType: "seed", status: "queued", input: { entries, searchResults }, summary: { candidateCount: seeds.length } });
    const candidates = [];
    const suppressed = [];
    for (const seed of seeds) {
      const payload = buildInitialCandidatePayload(seed);
      const mapping = findExactMapping(payload.objective);
      let candidate = mapping?.candidateId ? store.getCandidate(mapping.candidateId) : null;
      if (!candidate) candidate = findSuppressedTitleCandidate(payload.objective);
      if (candidate && SUPPRESSED_CANDIDATE_STATUSES.has(candidate.status)) {
        suppressed.push({ candidateId: candidate.id, reason: candidate.status, existingShowId: candidate.existingShowId || "" });
        continue;
      }
      if (origin === "discovery" && candidate) {
        suppressed.push({ candidateId: candidate.id, reason: candidate.status === "published" ? "published" : "already-open", existingShowId: candidate.existingShowId || "" });
        continue;
      }
      if (origin === "discovery" && mapping?.existingShowId) {
        suppressed.push({ candidateId: "", reason: "existing-show", existingShowId: mapping.existingShowId });
        continue;
      }
      if (candidate?.status === "published") {
        const sourceSubmissionIds = mergeUniqueStrings(
          candidate.objective?.sourceSubmissionIds || [],
          payload.objective?.sourceSubmissionIds || [],
        );
        if (sourceSubmissionIds.length !== (candidate.objective?.sourceSubmissionIds || []).length) {
          store.updateCandidate(candidate.id, {
            objective: { ...candidate.objective, sourceSubmissionIds },
          });
          store.recordEvent(candidate.id, "submission-identities-reconciled", actor, { sourceSubmissionIds });
        }
        suppressed.push({ candidateId: candidate.id, reason: "published", existingShowId: candidate.publishedShowId || candidate.existingShowId || "" });
        continue;
      }
      if (!candidate) {
        if (mapping?.existingShowId) {
          payload.mode = "update";
          payload.existingShowId = mapping.existingShowId;
        }
        payload.lastRunId = run.id;
        if (discoveryContext) {
          payload.discoverySourceId = discoveryContext.sourceId || "";
          payload.discoveryRunId = discoveryContext.runId || "";
        }
        candidate = store.createCandidate(payload);
        identityPairs(payload.objective).forEach(([type, value]) => store.claimIdentity(type, value, { candidateId: candidate.id, existingShowId: payload.existingShowId || "" }));
      } else {
        const sourceSubmissionIds = mergeUniqueStrings(
          candidate.objective?.sourceSubmissionIds || [],
          payload.objective?.sourceSubmissionIds || [],
        );
        candidate = store.updateCandidate(candidate.id, {
          status: "queued",
          inputRevision: candidate.inputRevision + 1,
          lastRunId: run.id,
          lastError: "",
          objective: { ...candidate.objective, sourceSubmissionIds },
        });
      }
      const dedupe = buildDedupe(candidate);
      candidate = store.updateCandidate(candidate.id, { hasDuplicateMatch: dedupe.hasDuplicateMatch, dedupe });
      if (origin === "discovery" && dedupe.hasDuplicateMatch) {
        candidate = store.updateCandidate(candidate.id, {
          status: "duplicate",
          reviewedAt: new Date().toISOString(),
          reviewedBy: "discovery-worker",
          reviewNotes: candidate.reviewNotes || "Automatically held because discovery matched an existing show or candidate.",
        });
        store.recordEvent(candidate.id, "discovery-suppressed", actor || "discovery-worker", { reason: "duplicate-match", discoveryContext });
        suppressed.push({ candidateId: candidate.id, reason: "duplicate-match", existingShowId: candidate.existingShowId || "" });
        continue;
      }
      store.enqueueJob({ candidateId: candidate.id, runId: run.id, inputRevision: candidate.inputRevision, payload: { actor } });
      store.recordEvent(candidate.id, mapping?.candidateId ? "reseeded" : "seeded", actor, { runId: run.id, reused: Boolean(mapping?.candidateId), mode: candidate.mode });
      candidates.push(candidate);
    }
    refreshRun(run.id);
    scheduleWork();
    if (autoHydrate) {
      await processPendingJobs({ limit: 4 });
      await waitForRun(run.id, 30_000);
    }
    return {
      runId: run.id,
      candidateIds: candidates.map((candidate) => candidate.id),
      candidates: candidates.map((candidate) => getCandidate(candidate.id)),
      suppressed,
      hydratedCount: autoHydrate ? candidates.length : 0,
    };
  }

  function cachedResult(sourceType, sourceKey, ttlMs) {
    const cache = store.getSourceCache(sourceType, sourceKey);
    if (!cache || !cache.fetchedAt || Date.now() - Date.parse(cache.fetchedAt) > ttlMs || !cache.normalized || Object.keys(cache.normalized).length === 0) return null;
    return {
      sourceType, sourceKey, sourceUrl: cache.sourceUrl, fetchStatus: "cache-hit", httpStatus: cache.httpStatus,
      etag: cache.etag, lastModified: cache.lastModified, raw: { text: cache.rawBody }, normalized: cache.normalized,
    };
  }

  async function prepareCandidate(candidateId) {
    let candidate = getCandidate(candidateId);
    const sources = [];
    const failures = [];
    const seen = new Set();
    const addResult = (result, cacheIdentity = {}) => {
      if (!result) return;
      const key = `${result.sourceType}|${result.sourceUrl || result.sourceKey}`;
      if (seen.has(key)) return;
      seen.add(key);
      sources.push({ ...result, fetchStatus: result.fetchStatus || "fetched", fetchedAt: new Date().toISOString() });
      const rawBody = typeof result.raw === "string" ? result.raw : result.raw?.text || JSON.stringify(result.raw || {});
      store.putSourceCache({
        sourceType: cacheIdentity.sourceType || result.sourceType,
        sourceKey: cacheIdentity.sourceKey || result.sourceKey || result.sourceUrl,
        sourceUrl: result.sourceUrl,
        fetchStatus: result.fetchStatus || "fetched", httpStatus: result.httpStatus,
        etag: result.etag, lastModified: result.lastModified, rawBody, normalized: result.normalized,
      });
    };
    const capture = async (sourceType, sourceKey, loader, ttlMs = 0, resultSourceType = sourceType) => {
      try {
        const cached = ttlMs > 0 ? cachedResult(sourceType, sourceKey, ttlMs) : null;
        const result = cached || await loader(store.getSourceCache(sourceType, sourceKey));
        addResult(result ? { ...result, sourceType: resultSourceType } : result, { sourceType, sourceKey });
      } catch (error) {
        failures.push({ sourceType, sourceKey, code: error.code || "", error: trimText(error.message || error, 1_000), retryable: error.retryable !== false, retryAfterMs: error.retryAfterMs || 0 });
      }
    };

    const original = candidate.objective || {};
    const title = original.title || candidate.title || candidate.seedQuery;
    const creatorName = original.creatorName || candidate.creatorName;
    const appleId = original.appleCollectionId || (candidate.primarySourceType === "apple" ? candidate.primarySourceKey : "");
    const initialRss = original.rssUrl || (candidate.primarySourceType === "rss" ? candidate.primarySourceUrl : "");
    const initialWebsite = original.websiteUrl || (candidate.primarySourceType === "website" ? candidate.primarySourceUrl : "");

    if (appleId) await capture("apple", appleId, () => apple.lookupByCollectionId(appleId), 24 * 60 * 60 * 1_000);
    if (initialRss) await capture("rss", normalizeUrl(initialRss), (cache) => rss.fetchByUrl(initialRss, cache));
    if (!sources.some((source) => source.sourceType === "apple") && title) {
      await capture("apple-search", slugify(`${title}-${creatorName}`), async () => {
        const result = pickBestSearchResult(await apple.searchByTerm(creatorName ? `${title} ${creatorName}` : title, 5), { title, creatorName });
        if (result) {
          result.normalized.discoveryTitleQuery = title;
          result.normalized.discoveryTitleExact = slugify(result.normalized.title) === slugify(title);
        }
        return result;
      }, 24 * 60 * 60 * 1_000, "apple");
    }
    let appleSource = sources.find((source) => source.sourceType === "apple");
    if (appleSource?.normalized?.identityExact === false && appleSource.normalized.discoveryTitleExact && appleSource.normalized.appleCollectionId) {
      try {
        const confirmed = cachedResult("apple", appleSource.normalized.appleCollectionId, 24 * 60 * 60 * 1_000)
          || await apple.lookupByCollectionId(appleSource.normalized.appleCollectionId);
        const discoveryIndex = sources.indexOf(appleSource);
        if (discoveryIndex >= 0) sources.splice(discoveryIndex, 1);
        seen.delete(`${appleSource.sourceType}|${appleSource.sourceUrl || appleSource.sourceKey}`);
        addResult({ ...confirmed, sourceType: "apple" }, { sourceType: "apple", sourceKey: appleSource.normalized.appleCollectionId });
        appleSource = sources.find((source) => source.sourceType === "apple");
      } catch (error) {
        failures.push({
          sourceType: "apple",
          sourceKey: appleSource.normalized.appleCollectionId,
          error: trimText(error.message || error, 1_000),
          retryable: error.retryable !== false,
          retryAfterMs: error.retryAfterMs || 0,
        });
      }
    }
    let effectiveRss = initialRss || appleSource?.normalized?.rssUrl || "";
    if (effectiveRss && !sources.some((source) => source.sourceType === "rss" && source.fetchStatus !== "failed") && !failures.some((failure) => failure.sourceType === "rss" && normalizeUrl(failure.sourceKey) === normalizeUrl(effectiveRss))) {
      await capture("rss", normalizeUrl(effectiveRss), (cache) => rss.fetchByUrl(effectiveRss, cache));
    }
    let rssSource = sources.find((source) => source.sourceType === "rss" && source.fetchStatus !== "failed");
    if (!rssSource && appleSource?.normalized?.rssUrl && normalizeUrl(appleSource.normalized.rssUrl) !== normalizeUrl(effectiveRss)) {
      effectiveRss = appleSource.normalized.rssUrl;
      await capture("rss", normalizeUrl(effectiveRss), (cache) => rss.fetchByUrl(effectiveRss, cache));
      rssSource = sources.find((source) => source.sourceType === "rss" && source.fetchStatus !== "failed");
    }
    const effectiveWebsite = initialWebsite || rssSource?.normalized?.websiteUrl || appleSource?.normalized?.websiteUrl || "";
    if (effectiveWebsite) {
      try {
        const crawl = await website.crawlByUrl(effectiveWebsite);
        crawl.results.forEach(addResult);
      } catch (error) {
        failures.push({ sourceType: "website", sourceKey: effectiveWebsite, error: trimText(error.message || error, 1_000), retryable: error.retryable !== false, retryAfterMs: error.retryAfterMs || 0 });
      }
    }
    if (!sources.some((source) => source.sourceType === "rss" && source.fetchStatus !== "failed")) {
      const websiteFeedUrl = sources.map((source) => source.normalized?.websiteFeedUrl).find(Boolean) || "";
      if (websiteFeedUrl && normalizeUrl(websiteFeedUrl) !== normalizeUrl(effectiveRss)) {
        await capture("rss", normalizeUrl(websiteFeedUrl), (cache) => rss.fetchByUrl(websiteFeedUrl, cache));
        rssSource = sources.find((source) => source.sourceType === "rss" && source.fetchStatus !== "failed") || rssSource;
        if (rssSource) effectiveRss = websiteFeedUrl;
      }
    }
    if (isVerifiedAmazonMusicIdentity(original)) {
      await capture("amazon-music", original.externalIdentity.id, () => amazonMusic.fetchByUrl(original.externalIdentity.url), 24 * 60 * 60 * 1_000);
    }
    if (podcastIndex.enabled) {
      if (effectiveRss && rssSource) await capture("podcast-index", normalizeUrl(effectiveRss), () => podcastIndex.lookupByFeedUrl(effectiveRss), 12 * 60 * 60 * 1_000);
      else if (appleId) await capture("podcast-index", appleId, () => podcastIndex.lookupByItunesId(appleId), 12 * 60 * 60 * 1_000);
    }

    if (sources.length === 0 && failures.some((failure) => failure.retryable)) {
      const first = failures.find((failure) => failure.retryable);
      const error = new Error(first.error);
      error.retryable = true;
      error.retryAfterMs = first.retryAfterMs;
      throw error;
    }
    const failureSources = failures.map((failure) => ({
      sourceType: failure.sourceType, sourceKey: failure.sourceKey, sourceUrl: normalizeUrl(failure.sourceKey),
      fetchStatus: "failed", payload: { code: failure.code, error: failure.error, retryable: failure.retryable }, normalized: {}, fetchedAt: new Date().toISOString(),
    }));
    const appended = store.appendCandidateSources(candidateId, [...sources, ...failureSources]);
    const successful = appended.filter((source) => source.fetchStatus !== "failed");
    const resolved = resolveSourceFacts(successful, candidate.fieldEvidence || []);
    store.appendFieldEvidence(candidateId, resolved.evidence.filter((item) => !item.selected));
    const objective = {
      ...original,
      ...resolved.objective,
      objectiveSources: mergeUniqueStrings(original.objectiveSources || [], resolved.objective.objectiveSources || []),
      feedRedirects: mergeUniqueStrings(
        original.feedRedirects || [],
        [
          initialRss,
          resolved.objective.previousRssUrl,
          ...successful.filter((source) => source.sourceType === "rss").map((source) => source.sourceUrl),
          ...successful.map((source) => source.normalized?.rssUrl).filter(Boolean),
        ].filter(Boolean),
      ).filter((value) => normalizeUrl(value) !== normalizeUrl(resolved.objective.rssUrl || "")),
    };
    const rejectedFeedUrls = new Set(failures
      .filter((failure) => failure.sourceType === "rss" && failure.code === "IMPORT_NOT_PODCAST_FEED")
      .map((failure) => normalizeUrl(failure.sourceKey))
      .filter(Boolean));
    objective.feedRedirects = (objective.feedRedirects || []).filter((value) => !rejectedFeedUrls.has(normalizeUrl(value)));
    const explicitHold = original.deferredFields?.explicit;
    if (explicitHold) {
      objective.explicit = "";
      resolved.fieldSummary.explicit = {
        confidence: 0,
        method: "preparation-deferred-unknown",
        sources: (explicitHold.sourceUrls || []).map((sourceUrl) => ({ sourceType: "review-note", sourceUrl })),
      };
    }
    const rejectedPodcastFeed = failures.find((failure) => failure.sourceType === "rss" && failure.code === "IMPORT_NOT_PODCAST_FEED");
    if (rejectedPodcastFeed) {
      const rejectedUrl = normalizeUrl(rejectedPodcastFeed.sourceKey);
      objective.unverifiedRssUrl = rejectedUrl;
      if (normalizeUrl(objective.rssUrl) === rejectedUrl) objective.rssUrl = "";
    }
    const identityConflicts = successful
      .filter((source) => source.sourceType === "apple" && source.normalized?.identityExact === false && source.normalized?.discoveryTitleExact === false)
      .map((source) => ({
        fieldName: "sourceIdentity",
        blocking: true,
        message: `Title-only discovery for "${source.normalized.discoveryTitleQuery}" resolved to materially different show "${source.normalized.title}".`,
        options: [{ sourceType: "apple", title: source.normalized.title, sourceUrl: source.sourceUrl }],
      }));
    let mode = candidate.mode;
    let existingShowId = candidate.existingShowId;
    identityPairs(objective).forEach(([type, value]) => {
      const mapping = store.claimIdentity(type, value, { candidateId, existingShowId });
      if (mapping?.collision) identityConflicts.push({ fieldName: type, blocking: true, message: `Identity ${type} is already assigned to another import candidate.`, options: [mapping] });
      if (mapping?.existingShowId && !existingShowId) {
        existingShowId = mapping.existingShowId;
        mode = "update";
      }
    });
    const conflicts = [...resolved.conflicts, ...identityConflicts];
    const inferredScope = candidate.lockedFields.includes("scopeStatus") ? candidate.scopeStatus : inferScopeStatus(objective);
    candidate = store.updateCandidate(candidateId, {
      mode,
      existingShowId,
      scopeStatus: inferredScope,
      title: objective.title || candidate.title,
      creatorName: objective.creatorName || candidate.creatorName,
      canonicalId: normalizeTitleCreatorKey(objective.title || candidate.title, objective.creatorName || candidate.creatorName),
      objective,
      conflicts,
      sourceHealth: {
        healthy: successful.length,
        failed: failures.length,
        lastSuccessfulFetch: successful.length ? new Date().toISOString() : candidate.sourceHealth?.lastSuccessfulFetch || "",
        sources: successful.map((source) => ({ sourceType: source.sourceType, sourceUrl: source.sourceUrl, status: source.fetchStatus })),
        errors: failures,
      },
      provenance: { fields: resolved.fieldSummary, sourceErrors: failures },
    });
    const dedupe = buildDedupe(candidate);
    candidate = store.updateCandidate(candidateId, { hasDuplicateMatch: dedupe.hasDuplicateMatch, dedupe });

    let coverStage = null;
    const existing = existingShowId ? readCatalogRecords().find((show) => show.id === existingShowId) : null;
    const existingCoverPath = existing?.cover && !/^https?:/i.test(existing.cover) ? path.join(staticRoot, String(existing.cover).replace(/^\/+/, "")) : "";
    if (!existing && objective.artworkUse === "echo-placeholder") {
      const artworkSource = successful.find((source) => source.normalized?.artworkUrl);
      coverStage = {
        ready: false,
        omittedForRights: true,
        status: "permission-not-established",
        sourceUrl: normalizeUrl(objective.artworkUrl || artworkSource?.normalized?.artworkUrl || ""),
        sourceType: artworkSource?.sourceType || "",
        placeholder: PLACEHOLDER_COVER,
      };
    } else if (existingCoverPath && fs.existsSync(existingCoverPath)) {
      try {
        const inspection = await inspectCoverBuffer(fs.readFileSync(existingCoverPath), "");
        if (inspection.echoPublishable) coverStage = { ready: true, existing: true, existingRelativePath: existing.cover, stagedPath: existingCoverPath, ...inspection };
      } catch (_error) {
        coverStage = null;
      }
    }
    if (!coverStage) {
      const priority = { rss: 0, website: 1, apple: 2, "podcast-index": 3 };
      const coverSources = successful.filter((source) => source.normalized?.artworkUrl).sort((left, right) => (priority[left.sourceType] ?? 9) - (priority[right.sourceType] ?? 9)).map((source) => ({ url: source.normalized.artworkUrl, sourceType: source.sourceType }));
      coverStage = await stageCover({
        candidateId, coverSources, stagingRoot, fetchImpl: limitedFetch, userAgent,
        timeoutMs: config.IMPORT_FETCH_TIMEOUT_MS, maxBytes: config.IMPORT_COVER_MAX_BYTES,
      });
    }
    candidate = store.updateCandidate(candidateId, { coverStage });
    let preparedRecord = buildPreparedShowRecord({ candidate, shows: readCatalogRecords() });
    let updateDiff = [];
    if (existing) {
      const explicitPreservationLocks = (Array.isArray(objective.preserveExistingFields) ? objective.preserveExistingFields : [])
        .filter((field) => ["credits", "creators"].includes(field));
      if (explicitPreservationLocks.length) {
        candidate = store.updateCandidate(candidateId, {
          lockedFields: mergeUniqueStrings(candidate.lockedFields || [], explicitPreservationLocks),
        });
      }
      const merged = mergePreparedWithExisting(preparedRecord, existing, { reviewerLocks: candidate.lockedFields });
      preparedRecord = merged.record;
      updateDiff = merged.diff;
      candidate = store.updateCandidate(candidateId, { lockedFields: merged.lockedFields });
    }
    const readiness = evaluateReadiness({ candidate: { ...candidate, coverStage, conflicts }, preparedRecord });
    readiness.updateDiff = updateDiff;
    const status = readiness.ready ? "ready" : "needs-review";
    candidate = store.updateCandidate(candidateId, { status, preparedRecord, readiness, lastError: "" });
    store.recordEvent(candidateId, "prepared", "worker", { status, blockers: readiness.blockers, warnings: readiness.warnings, sourceTypes: successful.map((source) => source.sourceType) });
    return candidate;
  }

  async function processJob(job) {
    store.updateCandidate(job.candidateId, { status: "processing", lastRunId: job.runId });
    try {
      const candidate = await prepareCandidate(job.candidateId);
      store.completeJob(job.id, { status: candidate.status, readiness: candidate.readiness });
    } catch (error) {
      const failedJob = store.failJob(job.id, error, { retryable: error.retryable !== false, retryAfterMs: error.retryAfterMs || 0 });
      store.updateCandidate(job.candidateId, { status: failedJob.status === "failed" ? "failed" : "queued", lastError: trimText(error.message || error, 4_000) });
      store.recordEvent(job.candidateId, failedJob.status === "failed" ? "prepare-failed" : "prepare-retry-scheduled", "worker", { error: error.message || String(error), nextAttemptAt: failedJob.nextAttemptAt });
      if (failedJob.nextAttemptAt) scheduleWork(Math.min(60_000, Math.max(1, Date.parse(failedJob.nextAttemptAt) - Date.now())));
    } finally {
      refreshRun(job.runId);
    }
  }

  async function processPendingJobs({ limit = 4 } = {}) {
    if (processing) return { claimed: 0 };
    processing = true;
    try {
      const jobs = [];
      for (let index = 0; index < Math.min(workerConcurrency, Math.max(1, limit)); index += 1) {
        const job = store.claimNextJob({ workerId, leaseMs: 120_000, jobType: "prepare" });
        if (!job) break;
        jobs.push(job);
      }
      await Promise.all(jobs.map(processJob));
      scheduleWork(jobs.length > 0 ? 0 : 30_000);
      return { claimed: jobs.length, jobIds: jobs.map((job) => job.id) };
    } finally {
      processing = false;
    }
  }

  async function waitForRun(runId, timeoutMs = 30_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const run = store.getRun(runId);
      if (run && ["completed", "failed"].includes(run.status)) return run;
      await processPendingJobs({ limit: 4 });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const error = new Error(`Import run ${runId} did not finish within ${timeoutMs}ms.`);
    error.statusCode = 504;
    throw error;
  }

  async function hydrateForMaintainer(id, actor = "") {
    const queued = enqueueCandidate(id, { actor, runType: "hydrate", incrementRevision: true });
    await processPendingJobs({ limit: 4 });
    await waitForRun(queued.runId);
    return getCandidate(id);
  }

  async function draftForMaintainer(id, actor = "") {
    const queued = enqueueCandidate(id, { actor, runType: "prepare", incrementRevision: true });
    await processPendingJobs({ limit: 4 });
    await waitForRun(queued.runId);
    const candidate = getCandidate(id);
    return { ...queued, candidate, showId: candidate.preparedRecord?.id || "" };
  }

  function retryForMaintainer(id, actor = "") {
    return enqueueCandidate(id, { actor, runType: "retry", incrementRevision: true });
  }

  function rerunAllForMaintainer(actor = "") {
    const candidateIds = store.listCandidateIdsByStatuses(BATCH_PREPARATION_STATUSES);
    if (candidateIds.length === 0) {
      const error = new Error("There are no ready, needs-review, or failed candidates to prepare again.");
      error.statusCode = 400;
      throw error;
    }

    const run = store.createRun({
      runType: "batch-prepare",
      status: "queued",
      input: { candidateIds, actor },
      summary: { candidateCount: candidateIds.length },
    });
    candidateIds.forEach((candidateId) => {
      const candidate = getCandidate(candidateId);
      const revision = candidate.inputRevision + 1;
      store.updateCandidate(candidateId, { status: "queued", inputRevision: revision, lastRunId: run.id, lastError: "" });
      store.enqueueJob({ candidateId, runId: run.id, inputRevision: revision, payload: { actor, batch: true } });
      store.recordEvent(candidateId, "batch-prepare-enqueued", actor, { runId: run.id, inputRevision: revision });
    });
    scheduleWork();
    return { runId: run.id, candidateIds };
  }

  function reopenForMaintainer(id, actor = "") {
    const candidate = getCandidate(id);
    if (!SUPPRESSED_CANDIDATE_STATUSES.has(candidate.status)) {
      const error = new Error("Only rejected or duplicate candidates need to be reopened.");
      error.statusCode = 400;
      throw error;
    }
    store.recordEvent(id, "reopened", actor || "authenticated-maintainer", { previousStatus: candidate.status });
    return enqueueCandidate(id, { actor, runType: "reopen", incrementRevision: true, reopen: true });
  }

  async function seedSubmissionForMaintainer(submission = {}, actor = "") {
    if (submission.submissionType !== "show") {
      const error = new Error("Only new-show submissions can enter the import preparation lane.");
      error.statusCode = 400;
      throw error;
    }
    if (submission.status === "rejected") {
      const error = new Error("A rejected submission cannot be handed to the import lane.");
      error.statusCode = 409;
      throw error;
    }
    const payload = submission.payload || {};
    const result = await seedCandidates({
      actor: actor || "authenticated-maintainer",
      origin: "submission",
      searchResults: [{
        sourceType: "submission",
        sourceKey: submission.id,
        sourceUrl: submission.rssOrListenLink || submission.officialSite || "",
        title: submission.showTitle,
        creatorName: submission.creatorName,
        objective: {
          title: submission.showTitle,
          creatorName: submission.creatorName,
          description: payload.shortDescription || "",
          rssUrl: submission.rssOrListenLink || "",
          websiteUrl: submission.officialSite || "",
          tagHints: payload.selectedTags || [],
          suggestedDescriptors: payload.suggestedDescriptors || "",
          objectiveSources: [submission.rssOrListenLink, submission.officialSite].filter(Boolean),
        },
      }],
    });
    result.candidateIds.forEach((candidateId) => store.recordEvent(candidateId, "submission-handed-off", actor || "authenticated-maintainer", { submissionId: submission.id }));
    return result;
  }

  function retryRunForMaintainer(runId, actor = "") {
    const prior = store.getRun(runId);
    if (!prior) {
      const error = new Error("Import run not found.");
      error.statusCode = 404;
      throw error;
    }
    const candidateIds = mergeUniqueStrings(prior.jobs.filter((job) => job.status === "failed").map((job) => job.candidateId));
    if (candidateIds.length === 0) {
      const error = new Error("This run has no exhausted failed jobs to retry.");
      error.statusCode = 400;
      throw error;
    }
    const run = store.createRun({ runType: "retry-run", status: "queued", input: { priorRunId: runId, candidateIds, actor }, summary: { candidateCount: candidateIds.length } });
    candidateIds.forEach((candidateId) => {
      const candidate = getCandidate(candidateId);
      const revision = candidate.inputRevision + 1;
      store.updateCandidate(candidateId, { status: "queued", inputRevision: revision, lastRunId: run.id, lastError: "" });
      store.enqueueJob({ candidateId, runId: run.id, inputRevision: revision, payload: { actor, priorRunId: runId } });
    });
    scheduleWork();
    return { runId: run.id, candidateIds };
  }

  function reviewForMaintainer(id, rawUpdates = {}, actor = "") {
    const candidate = getCandidate(id);
    const updates = normalizeReviewUpdates(rawUpdates);
    const nextInputRevision = rawUpdates.details ? candidate.inputRevision + 1 : candidate.inputRevision;
    const locks = new Set(candidate.lockedFields || []);
    if (updates.scopeStatus) locks.add("scopeStatus");
    let updated = store.updateCandidate(id, {
      ...updates,
      inputRevision: nextInputRevision,
      lockedFields: [...locks],
      reviewedAt: new Date().toISOString(),
      reviewedBy: updates.reviewedBy || actor || candidate.reviewedBy,
    });
    if (rawUpdates.details) {
      if (candidate.status === "published") {
        const error = new Error("Published shows must be updated through a new import candidate.");
        error.statusCode = 409;
        throw error;
      }
      const details = normalizeEditableDetails(rawUpdates.details);
      const { tags, subtitle, manualEnrichment, externalResearch, ...objectiveDetails } = details;
      const objective = {
        ...candidate.objective,
        ...objectiveDetails,
        manualSubtitle: subtitle,
        manualTags: tags,
        manualEnrichment,
        ...(externalResearch ? { externalResearch } : {}),
      };
      const appleCollectionId = extractAppleCollectionId(objective.appleUrl);
      if (appleCollectionId) objective.appleCollectionId = appleCollectionId;
      delete objective.complete;
      ["episodeCount", "seasonCount", "avgEpisodeMinutes"].forEach((field) => {
        if (details[field] === undefined) delete objective[field];
      });
      const provenance = { ...(candidate.provenance || {}), fields: { ...(candidate.provenance?.fields || {}) } };
      const editedFields = {
        title: "title", creatorName: "creatorName", networkName: "networkName", description: "description",
        categories: "genres", tags: "tags", language: "languages", rssUrl: "listenLinks", websiteUrl: "officialLinks",
        appleUrl: "listenLinks", spotifyUrl: "listenLinks", startUrl: "listenLinks", episodeCount: "length", seasonCount: "length",
        avgEpisodeMinutes: "length", firstPublicationDate: "releaseDates", latestPublicationDate: "releaseDates",
        manualReleaseState: "releaseStatus", subtitle: "subtitle", manualEnrichment: "catalogEnrichment",
      };
      Object.entries(editedFields).forEach(([field, recordField]) => {
        provenance.fields[field] = { confidence: 1, method: "maintainer-edit", sources: [] };
        if (recordField === "genres") {
          provenance.fields.genres = { confidence: 1, method: "maintainer-edit", sources: [] };
        }
        locks.add(recordField);
      });
      const nextCandidate = {
        ...candidate,
        ...updates,
        title: details.title,
        creatorName: details.creatorName,
        canonicalId: normalizeTitleCreatorKey(details.title, details.creatorName),
        objective,
        provenance,
        lockedFields: [...locks],
        inputRevision: nextInputRevision,
      };
      let preparedRecord = buildPreparedShowRecord({ candidate: nextCandidate, shows: readCatalogRecords() });
      let updateDiff = [];
      const existing = candidate.existingShowId ? readCatalogRecords().find((show) => show.id === candidate.existingShowId) : null;
      if (existing) {
        const merged = mergePreparedWithExisting(preparedRecord, existing, { reviewerLocks: nextCandidate.lockedFields });
        preparedRecord = merged.record;
        updateDiff = merged.diff;
        nextCandidate.lockedFields = merged.lockedFields;
      }
      const readiness = evaluateReadiness({ candidate: nextCandidate, preparedRecord });
      readiness.updateDiff = updateDiff;
      updated = store.updateCandidate(id, {
        ...updates,
        title: nextCandidate.title,
        creatorName: nextCandidate.creatorName,
        canonicalId: nextCandidate.canonicalId,
        objective,
        provenance,
        lockedFields: nextCandidate.lockedFields,
        inputRevision: nextInputRevision,
        preparedRecord,
        readiness,
        status: readiness.ready ? "ready" : "needs-review",
        reviewedAt: new Date().toISOString(),
        reviewedBy: updates.reviewedBy || actor || candidate.reviewedBy,
      });
    }
    store.recordEvent(id, rawUpdates.details ? "details-edited" : "reviewed", actor || updates.reviewedBy || "", updates);
    return updated;
  }

  function markFactsReviewedForMaintainer(id, actor = "") {
    const candidate = getCandidate(id);
    if (!["ready", "published"].includes(candidate.status)) {
      const error = new Error("Factual review can only be confirmed for a ready or published candidate.");
      error.statusCode = 409;
      throw error;
    }
    const reviewer = trimText(actor, 160) || "authenticated-maintainer";
    const reviewedAt = new Date().toISOString();
    const reviewed = {
      ...candidate,
      factsReviewedBy: reviewer,
      factsReviewedAt: reviewedAt,
      factsReviewedRevision: candidate.inputRevision,
    };
    const readiness = candidate.preparedRecord?.id
      ? evaluateReadiness({ candidate: reviewed, preparedRecord: candidate.preparedRecord })
      : candidate.readiness;
    readiness.updateDiff = candidate.readiness?.updateDiff || [];
    const updated = store.updateCandidate(id, {
      factsReviewedBy: reviewer,
      factsReviewedAt: reviewedAt,
      factsReviewedRevision: candidate.inputRevision,
      readiness,
    });
    store.recordEvent(id, "facts-reviewed", reviewer, { inputRevision: candidate.inputRevision });
    return updated;
  }

  function markFactsReviewedBatchForMaintainer(ids, actor = "", {
    reviewer: requestedReviewer = "",
    expectedRevisions = {},
    expectedContentHashes = {},
    reviewedAt = "",
    planId = "",
  } = {}) {
    const candidateIds = mergeUniqueStrings(ids);
    if (candidateIds.length === 0) {
      const error = new Error("At least one ready import candidate is required for batch factual review.");
      error.statusCode = 400;
      throw error;
    }
    const authorizedBy = trimText(actor, 160);
    const reviewer = trimText(requestedReviewer, 160) || authorizedBy;
    if (!authorizedBy || !reviewer) {
      const error = new Error("An authorized factual reviewer is required.");
      error.statusCode = 401;
      throw error;
    }
    const timestamp = trimText(reviewedAt, 60) || new Date().toISOString();
    const candidates = candidateIds.map(getCandidate);
    candidates.forEach((candidate) => {
      const expectedRevision = Number(expectedRevisions[candidate.id]);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(candidate.inputRevision) ||
        (expectedContentHashes[candidate.id] && candidateContentHash(candidate) !== expectedContentHashes[candidate.id])) {
        const error = new Error(`Import candidate ${candidate.id} changed after the approved review plan.`);
        error.statusCode = 409;
        error.code = "IMPORT_PUBLISHER_STALE_CANDIDATE";
        throw error;
      }
      if (!['ready', 'published'].includes(candidate.status) || !candidate.readiness?.ready) {
        const error = new Error(`Import candidate ${candidate.id} is not ready for factual review.`);
        error.statusCode = 409;
        throw error;
      }
    });

    (store.withImmediateTransaction || store.withTransaction)(() => {
      candidates.forEach((plannedCandidate) => {
        const candidate = getCandidate(plannedCandidate.id);
        const expectedRevision = Number(expectedRevisions[candidate.id]);
        if (expectedRevision !== Number(candidate.inputRevision) ||
          (expectedContentHashes[candidate.id] && candidateContentHash(candidate) !== expectedContentHashes[candidate.id])) {
          const error = new Error(`Import candidate ${candidate.id} changed while its batch factual review was being recorded.`);
          error.statusCode = 409;
          error.code = "IMPORT_PUBLISHER_STALE_CANDIDATE";
          throw error;
        }
        const reviewed = {
          ...candidate,
          factsReviewedBy: reviewer,
          factsReviewedAt: timestamp,
          factsReviewedRevision: candidate.inputRevision,
        };
        const readiness = reviewed.preparedRecord?.id
          ? evaluateReadiness({ candidate: reviewed, preparedRecord: reviewed.preparedRecord })
          : reviewed.readiness;
        readiness.updateDiff = candidate.readiness?.updateDiff || [];
        store.updateCandidate(candidate.id, {
          factsReviewedBy: reviewer,
          factsReviewedAt: timestamp,
          factsReviewedRevision: candidate.inputRevision,
          readiness,
        });
        store.recordEvent(candidate.id, "facts-reviewed", authorizedBy, {
          inputRevision: candidate.inputRevision,
          method: "echo-publisher-batch-review",
          reviewedBy: reviewer,
          planId: trimText(planId, 120),
        });
      });
    });
    return candidateIds.map(getCandidate);
  }

  function selectEvidenceForMaintainer(id, fieldName, evidenceId, actor = "") {
    const candidate = getCandidate(id);
    const selected = store.selectEvidence(candidate.id, trimText(fieldName, 200), Number(evidenceId), actor);
    if (!selected) {
      const error = new Error("Field evidence was not found.");
      error.statusCode = 404;
      throw error;
    }
    return enqueueCandidate(id, { actor, runType: "resolve-conflict", incrementRevision: true });
  }

  async function verifyExternalIdentityForMaintainer(id, raw = {}, actor = "") {
    const candidate = getCandidate(id);
    const reviewer = trimText(actor, 160);
    if (!reviewer) {
      const error = new Error("An authenticated maintainer is required to verify an external identity.");
      error.statusCode = 401;
      throw error;
    }
    if (["published", "duplicate", "rejected"].includes(candidate.status)) {
      const error = new Error("Reopen or replace this closed candidate before verifying another identity.");
      error.statusCode = 409;
      throw error;
    }
    const objective = candidate.objective || {};
    const proposedUrl = objective.amazonMusicUrl || objective.externalIdentityProposal?.url || "";
    const expected = parseAmazonMusicIdentityUrl(proposedUrl);
    const requested = parseAmazonMusicIdentityUrl(raw.url || "");
    if (requested.id !== expected.id || raw.provider !== "amazon-music") {
      const error = new Error("The external identity must match the submitted Amazon Music show listing.");
      error.statusCode = 409;
      error.code = "IMPORT_EXTERNAL_IDENTITY_MISMATCH";
      throw error;
    }
    const confirmedTitle = trimText(raw.confirmedTitle, 240);
    const confirmedCreator = trimText(raw.confirmedCreator, 240);
    const proposedDescription = trimText(objective.externalIdentityProposal?.description || "", 4_000);
    const proposedTitle = trimText(objective.externalIdentityProposal?.title || objective.title || candidate.title, 240);
    const proposedCreator = trimText(objective.externalIdentityProposal?.creatorName || objective.creatorName || candidate.creatorName, 240);
    if (
      raw.confirmedMatch !== true ||
      (proposedDescription && raw.confirmedDescriptionMatch !== true) ||
      !confirmedTitle || !confirmedCreator ||
      normalizeTitleCreatorKey(confirmedTitle, confirmedCreator) !== normalizeTitleCreatorKey(proposedTitle, proposedCreator)
    ) {
      const error = new Error("Confirm the exact candidate title and creator shown by the official listing before verifying this identity; confirm its proposed description when one is provided.");
      error.statusCode = 400;
      error.code = "IMPORT_EXTERNAL_IDENTITY_CONFIRMATION_REQUIRED";
      throw error;
    }
    const conflictingLocks = [
      ["title", confirmedTitle],
      ["creatorName", confirmedCreator],
      ...(proposedDescription ? [["description", proposedDescription]] : []),
    ].filter(([field, value]) => (candidate.lockedFields || []).includes(field) && objective[field] !== value);
    if (conflictingLocks.length) {
      const error = new Error("Resolve the existing title or creator review lock before confirming this external identity.");
      error.statusCode = 409;
      error.code = "IMPORT_EXTERNAL_IDENTITY_FIELD_LOCKED";
      throw error;
    }
    const listing = await amazonMusic.fetchByUrl(requested.url);
    if (listing.normalized?.amazonMusicId !== expected.id) {
      const error = new Error("The official listing did not confirm the submitted Amazon Music identity.");
      error.statusCode = 409;
      error.code = "IMPORT_EXTERNAL_IDENTITY_MISMATCH";
      throw error;
    }
    const existingMapping = store.findIdentity("amazon-music-id", expected.id);
    const sameShow = Boolean(candidate.existingShowId && existingMapping?.existingShowId === candidate.existingShowId);
    if (existingMapping && existingMapping.candidateId !== candidate.id && !sameShow) {
      const error = new Error("This Amazon Music identity is already assigned to another show or import candidate.");
      error.statusCode = 409;
      error.code = "IMPORT_EXTERNAL_IDENTITY_COLLISION";
      throw error;
    }
    const verifiedAt = new Date().toISOString();
    const externalIdentity = {
      provider: "amazon-music",
      id: expected.id,
      url: requested.url,
      verified: true,
      verifiedAt,
      verifiedBy: reviewer,
      confirmedTitle,
      confirmedCreator,
    };
    const evidenceFields = [
      ["title", confirmedTitle],
      ["creatorName", confirmedCreator],
      ...(proposedDescription ? [["description", proposedDescription]] : []),
    ].filter(([field, value]) => {
      if ((candidate.lockedFields || []).includes(field)) return false;
      const hasMatchingEvidence = (candidate.fieldEvidence || []).some((item) =>
        item.fieldName === field && String(item.value || "").trim().toLowerCase() === value.toLowerCase(),
      );
      return objective[field] !== value || !hasMatchingEvidence;
    });
    if (evidenceFields.length) {
      store.appendFieldEvidence(id, evidenceFields.map(([fieldName, value]) => ({
        fieldName,
        value,
        normalizedValue: value,
        sourceType: "amazon-music",
        sourceUrl: requested.url,
        confidence: 0.9,
        method: "maintainer-external-identity-confirmation",
        status: "candidate",
        selected: false,
      })));
      const refreshed = getCandidate(id);
      evidenceFields.forEach(([fieldName, value]) => {
        const evidence = refreshed.fieldEvidence.find((item) => item.fieldName === fieldName && item.sourceType === "amazon-music" && item.sourceUrl === requested.url && item.value === value);
        if (evidence) store.selectEvidence(id, fieldName, evidence.id, reviewer);
      });
    }
    store.updateCandidate(id, {
      title: confirmedTitle,
      creatorName: confirmedCreator,
      canonicalId: normalizeTitleCreatorKey(confirmedTitle, confirmedCreator),
      objective: { ...objective, title: confirmedTitle, creatorName: confirmedCreator, ...(proposedDescription ? { description: proposedDescription } : {}), externalIdentity },
      factsReviewedBy: "",
      factsReviewedAt: "",
      factsReviewedRevision: 0,
    });
    store.claimIdentity("amazon-music-id", expected.id, { candidateId: id, existingShowId: candidate.existingShowId || "" });
    store.recordEvent(id, "external-identity-verified", reviewer, {
      provider: "amazon-music",
      identityId: expected.id,
      sourceUrl: requested.url,
      confirmedTitle,
      confirmedCreator,
      listingFetched: true,
    });
    return enqueueCandidate(id, { actor: reviewer, runType: "prepare", incrementRevision: true });
  }

  function acquirePublishLock() {
    fs.mkdirSync(stagingRoot, { recursive: true });
    const lockPath = path.join(stagingRoot, "publish.lock");
    try {
      const descriptor = fs.openSync(lockPath, "wx", 0o600);
      fs.closeSync(descriptor);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const stat = fs.lstatSync(lockPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        const unsafe = new Error("The import publication lock path is unsafe.");
        unsafe.statusCode = 503;
        throw unsafe;
      }
    }
    const readyMessage = "ECHO_PUBLISH_LOCK_READY\n";
    let child;
    try {
      child = spawn("/usr/bin/flock", [
        "--exclusive",
        "--nonblock",
        "--no-fork",
        lockPath,
        process.execPath,
        "-e",
        `process.stdout.write(${JSON.stringify(readyMessage)}); process.stdin.resume();`,
      ], {
        env: { PATH: "/usr/bin:/bin" },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (_error) {
      const error = new Error("Could not start the crash-safe import publication lock.");
      error.statusCode = 503;
      throw error;
    }
    return new Promise((resolve, reject) => {
      let output = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        child.kill();
        const error = new Error("Timed out acquiring the import publication lock.");
        error.statusCode = 503;
        settled = true;
        reject(error);
      }, 10_000);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (!settled && output.includes(readyMessage)) {
          settled = true;
          clearTimeout(timer);
          let releasePromise = null;
          resolve(async () => {
            if (releasePromise) return releasePromise;
            releasePromise = new Promise((finish) => {
              if (child.exitCode !== null || child.signalCode !== null) {
                finish();
                return;
              }
              child.once("close", finish);
              child.stdin.end();
            });
            await releasePromise;
          });
        }
      });
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-1_000); });
      child.once("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const error = new Error("Could not start the crash-safe import publication lock.");
        error.statusCode = 503;
        reject(error);
      });
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const error = new Error(code === 1
          ? "Another import publication is already running."
          : `The import publication lock exited before acquisition.${stderr ? ` ${stderr.trim()}` : ""}`);
        error.statusCode = code === 1 ? 409 : 503;
        reject(error);
      });
    });
  }

  async function publishCandidates(ids, actor = "", {
    batch = false,
    publicationTier = "",
    expectedRevisions = {},
    expectedCandidateHashes = {},
    requireCurrentFactsReview = false,
    publicationContext = {},
    prePublicationCheck = null,
  } = {}) {
    const requestedTier = ensurePublicationTier(publicationTier);
    const candidateIds = mergeUniqueStrings(ids);
    if (candidateIds.length === 0) {
      const error = new Error("At least one ready import candidate is required.");
      error.statusCode = 400;
      throw error;
    }
    const releaseLock = await acquirePublishLock();
    let candidates = [];
    const hadSplitCatalog = fs.existsSync(path.join(staticRoot, "catalog-src"));
    const coverBackups = [];
    const stagedCoverChanges = [];
    let catalogTransaction = null;
    let publicationStarted = false;
    let databasePublicationCommitted = false;
    let publicationSnapshot = null;
    try {
      candidates = candidateIds.map(getCandidate);
      candidates.forEach((candidate) => {
        const expectedRevision = Number(expectedRevisions[candidate.id]);
        if (Object.keys(expectedRevisions).length && (!Number.isInteger(expectedRevision) || expectedRevision !== Number(candidate.inputRevision))) {
          const error = new Error(`Import candidate ${candidate.id} changed after the approved publication plan.`);
          error.statusCode = 409;
          error.code = "IMPORT_PUBLISHER_STALE_CANDIDATE";
          throw error;
        }
        const expectedHash = expectedCandidateHashes[candidate.id];
        if (expectedHash && candidateContentHash(candidate) !== expectedHash) {
          const error = new Error(`Import candidate ${candidate.id} content changed after the approved publication plan.`);
          error.statusCode = 409;
          error.code = "IMPORT_PUBLISHER_STALE_CANDIDATE";
          throw error;
        }
        if (requireCurrentFactsReview && (!candidate.factsReviewedAt || Number(candidate.factsReviewedRevision) !== Number(candidate.inputRevision))) {
          const error = new Error(`Import candidate ${candidate.id} needs a current factual review before publication.`);
          error.statusCode = 409;
          error.code = "IMPORT_PUBLISHER_FACTS_REVIEW_REQUIRED";
          throw error;
        }
      if (candidate.status !== "ready" || !candidate.readiness?.ready || !candidate.preparedRecord?.id) {
        const error = new Error(`Import candidate ${candidate.id} is not ready to publish: ${(candidate.readiness?.blockers || []).map((blocker) => blocker.message).join("; ") || "preparation is incomplete"}.`);
        error.statusCode = 400;
        throw error;
      }
      const eligibilityTier = candidate.mode === "update"
        ? candidate.preparedRecord.reviewStatus === "imported" ? "imported" : ""
        : requestedTier;
      const eligibilityKey = eligibilityTier === "indexed-only" ? "indexedOnly" : eligibilityTier;
      const eligibility = eligibilityKey ? candidate.readiness?.publicationEligibility?.[eligibilityKey] : null;
      if (eligibilityKey && !eligibility?.eligible) {
        const messages = (eligibility?.blockers || []).map((blocker) => blocker.message).filter(Boolean);
        const error = new Error(`Import candidate ${candidate.id} is not eligible for ${eligibilityTier} publication: ${messages.join("; ") || "tier checks are incomplete"}.`);
        error.statusCode = 400;
        throw error;
      }
      });
      if (typeof prePublicationCheck === "function") await prePublicationCheck();
      publicationStarted = true;
      const records = candidates.map((candidate) => {
        const record = JSON.parse(JSON.stringify(candidate.preparedRecord));
        const effectiveTier = candidate.mode === "update" ? record.reviewStatus : requestedTier;
        const factualReviewer = candidate.factsReviewedBy || actor || "authenticated-maintainer";
        const hasCurrentFactualReview = Boolean(candidate.factsReviewedAt &&
          Number(candidate.factsReviewedRevision) === Number(candidate.inputRevision));
        const delegatedFactualReview = factualReviewer === "delegate:codex";
        const sourceReviewStatus = delegatedFactualReview ? "delegated-source-reviewed" : "maintainer-source-reviewed";
        const sourceReviewNote = delegatedFactualReview
          ? "An authorized delegated AI reviewer checked factual source metadata only. This does not verify or endorse ratings, reviews, or recommendations."
          : "A maintainer reviewed factual source metadata only. This does not verify or endorse ratings, reviews, or recommendations.";
        record.reviewStatus = effectiveTier;
        if (candidate.mode !== "update") {
          record.verification = {
            ...record.verification,
            status: effectiveTier === "imported" ? "automated-source-checked" : sourceReviewStatus,
            verifiedAt: new Date().toISOString().slice(0, 10),
            note: effectiveTier === "imported"
              ? "Automated checks assembled factual metadata from publisher feeds and directories. This entry has not yet received an individual maintainer review."
              : sourceReviewNote,
          };
        } else if (effectiveTier !== "imported" && hasCurrentFactualReview &&
          ["maintainer-source-reviewed", "delegated-source-reviewed", "partially-source-reviewed"].includes(record.verification?.status)) {
          record.verification = {
            ...record.verification,
            status: sourceReviewStatus,
            verifiedAt: new Date().toISOString().slice(0, 10),
            note: sourceReviewNote,
          };
        }
        record.metadata = {
          ...(record.metadata || {}),
          import: {
            ...(record.metadata?.import || {}),
            publication: {
              ...(record.metadata?.import?.publication || {}),
              tier: effectiveTier,
              publishedAt: new Date().toISOString(),
              ...(candidate.mode !== "update" && effectiveTier === "indexed-only" ? { provisional: true } : {}),
            },
            ...(effectiveTier !== "imported" && hasCurrentFactualReview && (candidate.mode === "update" || effectiveTier === "indexed-only") ? {
              factualReview: {
                reviewedAt: candidate.factsReviewedAt,
                reviewedBy: factualReviewer,
                inputRevision: candidate.factsReviewedRevision,
              },
              scopeReview: {
                status: candidate.scopeStatus,
                reviewedAt: candidate.factsReviewedAt,
                reviewedBy: factualReviewer,
                inputRevision: candidate.factsReviewedRevision,
                evidenceSources: mergeUniqueStrings((candidate.sources || []).filter((source) => source.fetchStatus !== "failed").map((source) => source.sourceUrl)),
              },
            } : {}),
          },
        };
        if (candidate.coverStage?.ready && !candidate.coverStage.existing && record.cover === candidate.preparedRecord.cover) {
          const targetPath = path.join(staticRoot, record.cover);
          coverBackups.push({ targetPath, content: fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null });
          stagedCoverChanges.push({ stage: candidate.coverStage, record });
        }
        return record;
      });
      publicationSnapshot = store.publicationSnapshot(candidates);
      catalogTransaction = writeShowRecordsAtomically(staticRoot, records, {
        deferCommit: true,
        recoveryData: publicationSnapshot,
        additionalPaths: stagedCoverChanges.map(({ stage, record }) => path.join(staticRoot, "images/covers", `${record.id}${stage.extension}`)),
        beforeWrite: () => stagedCoverChanges.forEach(({ stage, record }) => { record.cover = promoteStagedCover(stage, staticRoot, record.id).relativePath; }),
      });
      await runWithCatalogPublication(catalogTransaction.publicationToken, async () => {
        await validateSiteData(staticRoot, { recoverCovers: true });
        catalogCache = null;
        if (typeof onPublished === "function") await onPublished({ showIds: records.map((record) => record.id) });
      });
      const published = (store.withImmediateTransaction || store.withTransaction)(() => {
        candidates.forEach((candidate) => {
          const current = getCandidate(candidate.id);
          const expectedRevision = Number(expectedRevisions[candidate.id]);
          if ((Object.keys(expectedRevisions).length && (!Number.isInteger(expectedRevision) || Number(current.inputRevision) !== expectedRevision)) ||
            (expectedCandidateHashes[candidate.id] && candidateContentHash(current) !== expectedCandidateHashes[candidate.id]) ||
            (requireCurrentFactsReview && (!current.factsReviewedAt || Number(current.factsReviewedRevision) !== Number(current.inputRevision)))) {
            const error = new Error(`Import candidate ${candidate.id} changed while its publication transaction was being committed.`);
            error.statusCode = 409;
            error.code = "IMPORT_PUBLISHER_STALE_CANDIDATE";
            throw error;
          }
        });
        return candidates.map((candidate) => {
          const showId = candidate.preparedRecord.id;
          store.bindIdentitiesToShow(candidate.id, showId);
          const updated = store.updateCandidate(candidate.id, {
            status: "published", publishedShowId: showId, reviewedAt: new Date().toISOString(),
            reviewedBy: actor || candidate.reviewedBy || "authenticated-maintainer", lastError: "",
            preparedRecord: records.find((record) => record.id === showId) || candidate.preparedRecord,
          });
          store.recordEvent(candidate.id, "published", actor || "authenticated-maintainer", {
            showId,
            batch,
            publicationTier: requestedTier,
            ...(trimText(publicationContext.planId, 120) ? { planId: trimText(publicationContext.planId, 120) } : {}),
            ...(trimText(publicationContext.planHash, 64) ? { planHash: trimText(publicationContext.planHash, 64) } : {}),
          });
          return updated;
        });
      });
      databasePublicationCommitted = true;
      catalogTransaction.commit();
      return { candidates: published, showIds: records.map((record) => record.id), candidate: published[0], showId: records[0]?.id || "", buildCount: 1 };
    } catch (error) {
      if (!catalogTransaction) throw error;
      catalogTransaction.rollback();
      if (databasePublicationCommitted) store.restorePublicationSnapshot(publicationSnapshot);
      if (catalogTransaction) completeCatalogPublicationRecovery(staticRoot);
      if (!hadSplitCatalog) fs.rmSync(path.join(staticRoot, "catalog-src"), { recursive: true, force: true });
      coverBackups.reverse().forEach(({ targetPath, content }) => {
        if (content === null) fs.rmSync(targetPath, { force: true });
        else {
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.writeFileSync(targetPath, content);
        }
      });
      await buildCatalog(staticRoot).catch(() => {});
      if (publicationStarted) {
        candidates.forEach((candidate) => {
          const current = getCandidate(candidate.id);
          if (current.status === "ready" && Number(current.inputRevision) === Number(candidate.inputRevision)) {
            store.updateCandidate(candidate.id, { lastError: trimText(error.message || error, 4_000) });
          }
        });
      }
      throw error;
    } finally {
      await releaseLock();
    }
  }

  function publishForMaintainer(id, actor = "", publicationTier = "", options = {}) {
    return publishCandidates([id], actor, { ...options, batch: false, publicationTier });
  }

  function batchPublishForMaintainer(ids, actor = "", publicationTier = "", options = {}) {
    if (publicationTier && typeof publicationTier === "object") {
      options = publicationTier;
      publicationTier = options.publicationTier || "";
    }
    return publishCandidates(ids, actor, { ...options, batch: true, publicationTier });
  }

  async function promoteForMaintainer(id, actor = "") {
    const candidate = getCandidate(id);
    if (candidate.status !== "published" || !candidate.publishedShowId) {
      const error = new Error("Only a published import candidate can be promoted.");
      error.statusCode = 409;
      throw error;
    }
    if (!candidate.factsReviewedAt || Number(candidate.factsReviewedRevision) !== Number(candidate.inputRevision)) {
      const error = new Error("A current factual review is required before promotion.");
      error.statusCode = 409;
      throw error;
    }
    const existing = readCatalogRecords(true).find((show) => show.id === candidate.publishedShowId);
    if (!existing) {
      const error = new Error("The published catalogue record could not be found.");
      error.statusCode = 404;
      throw error;
    }
    if (existing.reviewStatus !== "imported") {
      const error = new Error("Only Imported entries can be promoted to indexed-only through this action.");
      error.statusCode = 409;
      throw error;
    }
    const reviewer = trimText(actor, 160) || candidate.factsReviewedBy || "authenticated-maintainer";
    const promotedAt = new Date().toISOString();
    const promoted = JSON.parse(JSON.stringify(existing));
    promoted.reviewStatus = "indexed-only";
    promoted.updatedAt = promotedAt.slice(0, 10);
    promoted.verification = {
      ...(promoted.verification || {}),
      status: "maintainer-source-reviewed",
      verifiedAt: promotedAt.slice(0, 10),
      note: "A maintainer reviewed factual source metadata only. This does not verify or endorse ratings, reviews, or recommendations.",
    };
    promoted.metadata = {
      ...(promoted.metadata || {}),
      import: {
        ...(promoted.metadata?.import || {}),
        publication: { ...(promoted.metadata?.import?.publication || {}), tier: "indexed-only" },
        factualReview: {
          reviewedAt: candidate.factsReviewedAt,
          reviewedBy: reviewer,
          inputRevision: candidate.factsReviewedRevision,
        },
      },
    };
    let catalogTransaction = null;
    let databasePublicationCommitted = false;
    let publicationSnapshot = null;
    try {
      publicationSnapshot = store.publicationSnapshot([candidate]);
      catalogTransaction = writeShowRecordsAtomically(staticRoot, [promoted], { deferCommit: true, recoveryData: publicationSnapshot });
      await runWithCatalogPublication(catalogTransaction.publicationToken, async () => {
        await validateSiteData(staticRoot, { recoverCovers: true });
        catalogCache = null;
        if (typeof onPublished === "function") await onPublished({ showIds: [promoted.id] });
      });
      const updated = store.withTransaction(() => {
        const result = store.updateCandidate(id, { preparedRecord: promoted, lastError: "" });
        store.recordEvent(id, "promoted", reviewer, { showId: promoted.id, reviewStatus: "indexed-only" });
        return result;
      });
      databasePublicationCommitted = true;
      catalogTransaction.commit();
      return { candidate: updated, showId: promoted.id, reviewStatus: promoted.reviewStatus };
    } catch (error) {
      if (!catalogTransaction) throw error;
      catalogTransaction.rollback();
      if (databasePublicationCommitted) store.restorePublicationSnapshot(publicationSnapshot);
      if (catalogTransaction) completeCatalogPublicationRecovery(staticRoot);
      await buildCatalog(staticRoot).catch(() => {});
      store.updateCandidate(id, { lastError: trimText(error.message || error, 4_000) });
      throw error;
    }
  }

  function createElevationUpdateForMaintainer(showId, actor = "") {
    const existing = readCatalogRecords(true).find((show) => show.id === showId);
    if (!existing) {
      const error = new Error("The published catalogue record could not be found.");
      error.statusCode = 404;
      throw error;
    }
    if (!["imported", "indexed-only", "planned"].includes(existing.reviewStatus)) {
      const error = new Error("Only Imported, indexed-only, or planned-review entries can use a factual elevation draft.");
      error.statusCode = 409;
      throw error;
    }

    const sourceCandidate = store.getLatestPublishedCandidateForShow(showId);
    const sourceObjective = sourceCandidate?.objective || {};
    const objective = {
      ...sourceObjective,
      title: existing.title,
      creatorName: existing.credits?.creatorName || existing.creators?.[0] || sourceObjective.creatorName || "",
      description: existing.description,
      rssUrl: existing.listenLinks?.rss || sourceObjective.rssUrl || "",
      appleUrl: existing.listenLinks?.apple || sourceObjective.appleUrl || "",
      appleCollectionId: extractAppleCollectionId(existing.listenLinks?.apple) || sourceObjective.appleCollectionId || "",
      websiteUrl: existing.officialLinks?.website || existing.listenLinks?.website || sourceObjective.websiteUrl || "",
      objectiveSources: mergeUniqueStrings(sourceObjective.objectiveSources || [], [
        existing.listenLinks?.rss,
        existing.listenLinks?.apple,
        existing.officialLinks?.website,
        existing.listenLinks?.website,
      ].filter(Boolean)),
    };
    const payload = buildInitialCandidatePayload({
      sourceType: sourceCandidate?.primarySourceType || (objective.rssUrl ? "rss" : objective.appleUrl ? "apple" : "website"),
      sourceKey: sourceCandidate?.primarySourceKey || objective.rssUrl || objective.appleCollectionId || objective.websiteUrl,
      sourceUrl: sourceCandidate?.primarySourceUrl || objective.rssUrl || objective.appleUrl || objective.websiteUrl,
      seedQuery: existing.title,
      objective,
    });
    payload.mode = "update";
    payload.existingShowId = showId;
    payload.scopeStatus = "in-scope";
    payload.reviewNotes = `Factual elevation draft created from the published ${existing.reviewStatus} record.`;
    const candidate = store.createCandidate(payload);
    const dedupe = buildDedupe(candidate);
    store.updateCandidate(candidate.id, { hasDuplicateMatch: dedupe.hasDuplicateMatch, dedupe });
    store.recordEvent(candidate.id, "elevation-draft-created", actor || "authenticated-maintainer", { showId });
    return enqueueCandidate(candidate.id, { actor, runType: "elevation-factual", incrementRevision: false });
  }

  async function promoteElevationForMaintainer(id, actor = "") {
    const candidate = getCandidate(id);
    if (candidate.mode !== "update" || !candidate.existingShowId) {
      const error = new Error("This candidate is not a factual elevation draft.");
      error.statusCode = 409;
      throw error;
    }
    if (candidate.status !== "ready" || !candidate.readiness?.ready || !candidate.preparedRecord?.id) {
      const error = new Error("The factual elevation draft must be ready before promotion.");
      error.statusCode = 409;
      throw error;
    }
    if (!candidate.factsReviewedAt || Number(candidate.factsReviewedRevision) !== Number(candidate.inputRevision)) {
      const error = new Error("A current factual review is required before promotion.");
      error.statusCode = 409;
      throw error;
    }
    const existing = readCatalogRecords(true).find((show) => show.id === candidate.existingShowId);
    if (!existing || !["imported", "indexed-only", "planned"].includes(existing.reviewStatus)) {
      const error = new Error("Only current Imported, indexed-only, or planned-review records can be updated through a factual elevation draft.");
      error.statusCode = 409;
      throw error;
    }
    const eligibility = candidate.readiness?.publicationEligibility?.indexedOnly;
    if (!eligibility?.eligible) {
      const error = new Error(`The factual elevation draft is not publication-ready: ${(eligibility?.blockers || []).map((blocker) => blocker.message).join("; ") || "readiness checks are incomplete"}.`);
      error.statusCode = 400;
      throw error;
    }

    const reviewer = trimText(actor, 160) || candidate.factsReviewedBy || "authenticated-maintainer";
    const promotedAt = new Date().toISOString();
    const promoted = JSON.parse(JSON.stringify(candidate.preparedRecord));
    const nextReviewStatus = existing.reviewStatus === "imported" ? "indexed-only" : existing.reviewStatus;
    promoted.reviewStatus = nextReviewStatus;
    promoted.updatedAt = promotedAt.slice(0, 10);
    promoted.verification = {
      ...(promoted.verification || {}),
      status: "maintainer-source-reviewed",
      verifiedAt: promotedAt.slice(0, 10),
      note: "A maintainer reviewed factual source metadata only. This does not verify or endorse ratings, reviews, or recommendations.",
    };
    promoted.metadata = {
      ...(promoted.metadata || {}),
      import: {
        ...(promoted.metadata?.import || {}),
        publication: { ...(promoted.metadata?.import?.publication || {}), tier: nextReviewStatus === "indexed-only" ? "indexed-only" : existing.metadata?.import?.publication?.tier || "imported" },
        factualReview: {
          reviewedAt: candidate.factsReviewedAt,
          reviewedBy: reviewer,
          inputRevision: candidate.factsReviewedRevision,
        },
      },
    };
    let catalogTransaction = null;
    let databasePublicationCommitted = false;
    let publicationSnapshot = null;
    try {
      publicationSnapshot = store.publicationSnapshot([candidate]);
      catalogTransaction = writeShowRecordsAtomically(staticRoot, [promoted], { deferCommit: true, recoveryData: publicationSnapshot });
      await runWithCatalogPublication(catalogTransaction.publicationToken, async () => {
        await validateSiteData(staticRoot, { recoverCovers: true });
        catalogCache = null;
        if (typeof onPublished === "function") await onPublished({ showIds: [promoted.id] });
      });
      const updated = store.withTransaction(() => {
        const result = store.updateCandidate(id, { status: "published", publishedShowId: promoted.id, preparedRecord: promoted, lastError: "" });
        store.recordEvent(id, "elevation-promoted", reviewer, { showId: promoted.id, reviewStatus: promoted.reviewStatus });
        return result;
      });
      databasePublicationCommitted = true;
      catalogTransaction.commit();
      return { candidate: updated, showId: promoted.id, reviewStatus: promoted.reviewStatus };
    } catch (error) {
      if (!catalogTransaction) throw error;
      catalogTransaction.rollback();
      if (databasePublicationCommitted) store.restorePublicationSnapshot(publicationSnapshot);
      if (catalogTransaction) completeCatalogPublicationRecovery(staticRoot);
      await buildCatalog(staticRoot).catch(() => {});
      store.updateCandidate(id, { status: "ready", lastError: trimText(error.message || error, 4_000) });
      throw error;
    }
  }

  async function auditCatalog({ actor = "" } = {}) {
    const searchResults = readCatalogRecords().map((show) => ({
      sourceType: show.listenLinks?.rss ? "rss" : show.listenLinks?.apple ? "apple" : "website",
      sourceKey: show.listenLinks?.rss || extractAppleCollectionId(show.listenLinks?.apple) || show.officialLinks?.website || "",
      sourceUrl: show.listenLinks?.rss || show.listenLinks?.apple || show.officialLinks?.website || "",
      title: show.title,
      creatorName: show.credits?.creatorName || show.creators?.[0] || "",
      objective: {
        title: show.title,
        creatorName: show.credits?.creatorName || show.creators?.[0] || "",
        rssUrl: show.listenLinks?.rss || "",
        appleUrl: show.listenLinks?.apple || "",
        appleCollectionId: extractAppleCollectionId(show.listenLinks?.apple),
        websiteUrl: show.officialLinks?.website || show.listenLinks?.website || "",
        ...show.metadata?.import?.identifiers,
      },
    })).filter((entry) => entry.sourceKey);
    return seedCandidates({ searchResults, actor, autoHydrate: false });
  }

  function buildReport(filters = {}) {
    return listForMaintainer({ ...filters, includeClosed: true, page: 1, pageSize: 200 });
  }

  function stop() {
    if (workTimer) clearTimeout(workTimer);
    workTimer = null;
    if (discoveryTimer) clearTimeout(discoveryTimer);
    discoveryTimer = null;
  }

  scheduleWork();
  if (config.IMPORT_AUTO_DISCOVERY === true) scheduleDiscoveryWork(0, { periodic: true });

  return {
    auditCatalog,
    batchPublishForMaintainer,
    buildReport,
    createDiscoverySourceForMaintainer,
    createElevationUpdateForMaintainer,
    draftForMaintainer,
    enqueueForMaintainer: enqueueCandidate,
    enqueueDiscoverySource,
    getForMaintainer: getCandidate,
    getPublishedCandidateForShow,
    getDiscoveryRun: (id) => store.getDiscoveryRun(id),
    getRun: (id) => store.getRun(id),
    hydrateForMaintainer,
    listDiscoveryForMaintainer,
    listForMaintainer,
    markFactsReviewedForMaintainer,
    markFactsReviewedBatchForMaintainer,
    processPendingDiscoveryJobs,
    processPendingJobs,
    publishForMaintainer,
    promoteForMaintainer,
    promoteElevationForMaintainer,
    reopenForMaintainer,
    retryForMaintainer,
    retryRunForMaintainer,
    rerunAllForMaintainer,
    reviewForMaintainer,
    runDueDiscovery,
    searchExternalSources,
    seedCandidates,
    seedSubmissionForMaintainer,
    selectEvidenceForMaintainer,
    stop,
    updateDiscoverySourceForMaintainer,
    verifyExternalIdentityForMaintainer,
    waitForDiscoveryRun,
    waitForRun,
  };
}

module.exports = { PIPELINE_VERSION, createImportService, inferScopeStatus };
