const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { loadCatalog } = require("../catalog");
const { PLACEHOLDER_COVER } = require("../cover-sync");
const { validateSiteData, readShowsFile } = require("../../scripts/review-helpers");
const { serializeRuntimeShow } = require("../../../tools/lib/catalog-artifacts");
const { normalizeUrl, extractAppleCollectionId, normalizeTitleCreatorKey, slugify, trimText } = require("../import/utils");
const { candidateContentHash, factualReviewState, hashValue, stableStringify } = require("../import/publisher-hash");

const PLAN_SCHEMA_VERSION = 1;
const OPERATION_POLICY = "all-ready-candidates-atomic";
const PRODUCTION_TARGET = Object.freeze({
  deploymentEnv: "production",
  dbPath: "/var/lib/echo-archives/community.sqlite",
  staticRoot: "/srv/echo-archives/runtime/production/current",
  importStagingRoot: "/srv/echo-archives/runtime/production/current/import-staging",
  siteUrl: "https://echoarchives.net",
});

function publisherError(message, statusCode = 400, code = "ECHO_PUBLISHER_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function ensureDirectory(directory, mode = 0o700) {
  let stat;
  try {
    stat = fs.lstatSync(directory);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    fs.mkdirSync(directory, { mode });
    stat = fs.lstatSync(directory);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw publisherError(`Publisher state directory is unsafe: ${directory}`, 500, "ECHO_PUBLISHER_UNSAFE_STATE");
  }
  fs.chmodSync(directory, mode);
}

function writeImmutableJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertProductionTarget({ config = {}, staticRoot = "", codeRoot = "" } = {}) {
  const actual = {
    deploymentEnv: String(config.DEPLOYMENT_ENV || ""),
    dbPath: path.resolve(config.DB_PATH || ""),
    staticRoot: path.resolve(staticRoot || config.STATIC_ROOT || ""),
    importStagingRoot: path.resolve(config.IMPORT_STAGING_ROOT || ""),
    siteUrl: String(config.SITE_URL || "").replace(/\/+$/, ""),
  };
  const expected = {
    ...PRODUCTION_TARGET,
    dbPath: path.resolve(PRODUCTION_TARGET.dbPath),
    staticRoot: path.resolve(PRODUCTION_TARGET.staticRoot),
    importStagingRoot: path.resolve(PRODUCTION_TARGET.importStagingRoot),
  };
  if (Object.keys(expected).some((key) => actual[key] !== expected[key])) {
    throw publisherError(
      `Publisher target rejected. Expected active production (${JSON.stringify(expected)}); received ${JSON.stringify(actual)}.`,
      403,
      "ECHO_PUBLISHER_WRONG_TARGET",
    );
  }
  let realRoot;
  try {
    realRoot = fs.realpathSync(actual.staticRoot);
  } catch (_error) {
    throw publisherError("The production runtime overlay is not available.", 503, "ECHO_PUBLISHER_PRODUCTION_OVERLAY_MISSING");
  }
  const overlayPrefix = `${path.dirname(actual.staticRoot)}/`;
  if (!realRoot.startsWith(overlayPrefix) || realRoot === actual.staticRoot) {
    throw publisherError("The production static root does not resolve to a release-specific runtime overlay.", 403, "ECHO_PUBLISHER_WRONG_OVERLAY");
  }
  if (path.resolve(actual.importStagingRoot) !== path.resolve(actual.staticRoot, "import-staging")) {
    throw publisherError("The production importer state path is not inside the active runtime overlay.", 403, "ECHO_PUBLISHER_WRONG_OVERLAY");
  }
  try {
    const importerState = fs.lstatSync(actual.importStagingRoot);
    if (!importerState.isDirectory() || importerState.isSymbolicLink() || fs.realpathSync(actual.importStagingRoot) !== path.join(realRoot, "import-staging")) {
      throw publisherError("The production importer state directory is not a regular directory inside the active runtime overlay.", 403, "ECHO_PUBLISHER_WRONG_OVERLAY");
    }
  } catch (error) {
    if (error.code === "ECHO_PUBLISHER_WRONG_OVERLAY") throw error;
    throw publisherError("The production importer state directory is unavailable.", 503, "ECHO_PUBLISHER_PRODUCTION_OVERLAY_MISSING");
  }
  let release;
  try {
    release = readJson(path.join(actual.staticRoot, "release.json"));
  } catch (_error) {
    throw publisherError("The active production runtime overlay has no valid release marker.", 503, "ECHO_PUBLISHER_RELEASE_MARKER_MISSING");
  }
  const releaseId = String(release.releaseId || "");
  if (!/^[0-9a-f]{40}$/.test(releaseId) || path.basename(realRoot) !== releaseId) {
    throw publisherError("The production runtime overlay does not match its release marker.", 403, "ECHO_PUBLISHER_RELEASE_MISMATCH");
  }
  if (codeRoot) {
    let realCodeRoot;
    try {
      realCodeRoot = fs.realpathSync(codeRoot);
    } catch (_error) {
      throw publisherError("The running application release cannot be identified.", 503, "ECHO_PUBLISHER_APPLICATION_RELEASE_MISSING");
    }
    if (realCodeRoot !== path.join("/srv/echo-archives/releases", releaseId)) {
      throw publisherError("The running application release does not match the active production release.", 409, "ECHO_PUBLISHER_APPLICATION_RELEASE_MISMATCH");
    }
  }
  return { environment: "production", releaseId, staticRoot: actual.staticRoot, realRoot };
}

function packageProjection(packageData) {
  return {
    packageVersion: packageData.packageVersion,
    sourceArchiveSha256: packageData.sourceArchiveSha256 || "",
    publicationPolicy: packageData.publicationPolicy || {},
    noOpExcluded: packageData.noOpExcluded || null,
    existingUpdates: packageData.existingUpdates || [],
    searchResults: packageData.searchResults || [],
  };
}

function validatePackage(packageData) {
  if (!packageData || typeof packageData !== "object" || packageData.packageVersion !== 1) {
    throw publisherError("Unsupported Echo publication package. Expected packageVersion 1.", 400, "ECHO_PUBLISHER_INVALID_PACKAGE");
  }
  if (!Array.isArray(packageData.searchResults) || packageData.searchResults.length === 0 || packageData.searchResults.length > 100) {
    throw publisherError("The publication package must contain between 1 and 100 searchResults.", 400, "ECHO_PUBLISHER_INVALID_PACKAGE");
  }
  const seenSubmissionIds = new Set();
  const seenIdentityTokens = new Map();
  packageData.searchResults.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || !entry.title || !entry.objective || typeof entry.objective !== "object") {
      throw publisherError(`Package searchResults[${index}] is missing title or objective metadata.`, 400, "ECHO_PUBLISHER_INVALID_PACKAGE");
    }
    const ids = submissionIdsForEntry(entry);
    if (ids.length === 0) {
      throw publisherError(`Package entry "${entry.title}" has no stable source submission identity.`, 400, "ECHO_PUBLISHER_MISSING_SUBMISSION_ID");
    }
    ids.forEach((id) => {
      if (seenSubmissionIds.has(id)) {
        throw publisherError(`Submission identity ${id} appears more than once in the package.`, 409, "ECHO_PUBLISHER_DUPLICATE_PACKAGE_ID");
      }
      seenSubmissionIds.add(id);
    });
    for (const token of catalogueIdentityTokens(entry.objective)) {
      if (seenIdentityTokens.has(token)) {
        throw publisherError(`Package entries share provider identity ${token} (${seenIdentityTokens.get(token)} and ${entry.title}).`, 409, "ECHO_PUBLISHER_DUPLICATE_PACKAGE_ID");
      }
      seenIdentityTokens.set(token, entry.title);
    }
  });
  if (packageData.noOpExcluded?.title) {
    const excludedTitle = slugify(packageData.noOpExcluded.title);
    if (packageData.searchResults.some((entry) => slugify(entry.title) === excludedTitle)) {
      throw publisherError(`The no-op excluded show "${packageData.noOpExcluded.title}" must not be in searchResults.`, 409, "ECHO_PUBLISHER_NOOP_INCLUDED");
    }
  }
  return true;
}

function submissionIdsForEntry(entry = {}) {
  const objective = entry.objective || {};
  const ids = Array.isArray(objective.sourceSubmissionIds) ? objective.sourceSubmissionIds : [];
  return [...new Set([...ids, entry.sourceType === "submission" ? entry.sourceKey : ""]
    .map((value) => trimText(value, 160))
    .filter((value) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)))];
}

function identityTokens(objective = {}) {
  const identifiers = objective.metadata?.import?.identifiers || objective.metadata?.importIdentifiers || objective.identifiers || {};
  const pairs = [
    ["podcast-guid", objective.podcastGuid || identifiers.podcastGuid || identifiers.podcastIndexGuid || ""],
    ["rss-url", objective.rssUrl || objective.listenLinks?.rss || identifiers.rssUrl || ""],
    ["apple-id", objective.appleCollectionId || extractAppleCollectionId(objective.appleUrl || objective.listenLinks?.apple || "") || identifiers.appleCollectionId || ""],
    ["podcast-index-id", objective.podcastIndexFeedId || identifiers.podcastIndexFeedId || ""],
    ["podcast-index-guid", objective.podcastIndexGuid || identifiers.podcastIndexGuid || ""],
    ["website-url", objective.websiteUrl || objective.officialLinks?.website || objective.listenLinks?.website || identifiers.websiteUrl || ""],
  ];
  if (objective.externalIdentity?.verified === true && objective.externalIdentity.id) {
    pairs.push(["amazon-music-id", objective.externalIdentity.id]);
  }
  return pairs.filter(([, value]) => value).map(([type, value]) => {
    const normalized = type.endsWith("url") ? normalizeUrl(value) : String(value).trim().toLowerCase();
    return normalized ? `${type}:${normalized}` : "";
  }).filter(Boolean);
}

function catalogueIdentityTokens(objective = {}) {
  const proposal = objective.externalIdentityProposal || {};
  const proposedExternal = proposal.provider === "amazon-music" && /^[0-9a-f-]{36}$/i.test(String(proposal.id || ""))
    ? [`amazon-music-id:${String(proposal.id).toLowerCase()}`]
    : [];
  return [...new Set([...identityTokens(objective), ...proposedExternal])];
}

function catalogObjective(show = {}) {
  const identifiers = show.metadata?.import?.identifiers || show.metadata?.importIdentifiers || {};
  return {
    ...identifiers,
    podcastGuid: identifiers.podcastGuid || identifiers.podcastIndexGuid || "",
    rssUrl: identifiers.rssUrl || show.listenLinks?.rss || "",
    appleCollectionId: identifiers.appleCollectionId || extractAppleCollectionId(show.listenLinks?.apple || ""),
    podcastIndexFeedId: identifiers.podcastIndexFeedId || "",
    podcastIndexGuid: identifiers.podcastIndexGuid || "",
    websiteUrl: identifiers.websiteUrl || show.officialLinks?.website || show.listenLinks?.website || "",
    externalIdentity: identifiers.amazonMusicId
      ? { verified: true, id: identifiers.amazonMusicId }
      : {},
  };
}

function candidateMatchesSubmission(candidate = {}, ids = []) {
  const candidateIds = new Set([
    ...(Array.isArray(candidate.objective?.sourceSubmissionIds) ? candidate.objective.sourceSubmissionIds : []),
    ...(candidate.primarySourceType === "submission" && candidate.primarySourceKey ? [candidate.primarySourceKey] : []),
  ].map((value) => String(value || "").trim()));
  return ids.some((id) => candidateIds.has(id));
}

function matchingByTokens(items, tokensFor) {
  const matches = new Map();
  for (const item of items) {
    const tokens = new Set(tokensFor(item));
    if (tokens.size === 0) continue;
    for (const token of tokens) {
      if (!token) continue;
      if (!matches.has(token)) matches.set(token, []);
      matches.get(token).push(item);
    }
  }
  return matches;
}

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current == null ? undefined : current[key], value);
}

function isKnown(value) {
  if (value === undefined || value === null || value === "" || value === "unknown" || value === "unclear") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

const FIELD_PATHS = [
  "title", "subtitle", "creators", "credits", "networkName", "description", "genres", "formats", "tags",
  "language", "explicitStatus", "releaseStatus", "completionStatus", "length.episodes", "length.seasons",
  "length.averageEpisodeMinutes", "releaseDates.first", "releaseDates.latest", "listenLinks.rss",
  "listenLinks.apple", "listenLinks.spotify", "listenLinks.website", "officialLinks.website", "cover",
];

function summarizeFields(record = {}) {
  const known = {};
  const unknown = [];
  FIELD_PATHS.forEach((field) => {
    const value = getPath(record, field);
    if (isKnown(value)) known[field] = value;
    else unknown.push(field);
  });
  return { known, unknown };
}

function sourceSummary(candidate = {}) {
  return (candidate.sources || []).map((source) => ({
    id: source.id,
    sourceType: source.sourceType,
    sourceKey: source.sourceKey,
    sourceUrl: source.sourceUrl,
    fetchStatus: source.fetchStatus,
    fetchedAt: source.fetchedAt,
    error: source.error || "",
    fieldNames: [...new Set((candidate.fieldEvidence || [])
      .filter((evidence) => evidence.sourceSnapshotId === source.id)
      .map((evidence) => evidence.fieldName))],
  }));
}

function evidenceSummary(candidate = {}) {
  return (candidate.fieldEvidence || []).map((evidence) => ({
    id: evidence.id,
    fieldName: evidence.fieldName,
    value: evidence.value,
    normalizedValue: evidence.normalizedValue,
    sourceSnapshotId: evidence.sourceSnapshotId,
    sourceType: evidence.sourceType,
    sourceUrl: evidence.sourceUrl,
    confidence: evidence.confidence,
    method: evidence.method,
    status: evidence.status,
    selected: Boolean(evidence.selected),
    observedAt: evidence.observedAt,
  }));
}

function factsReviewIsCurrent(candidate = {}) {
  return Boolean(candidate.factsReviewedBy && candidate.factsReviewedAt &&
    Number(candidate.factsReviewedRevision) === Number(candidate.inputRevision));
}

function blockerList(candidate = {}, { publicationTier = "indexed-only" } = {}) {
  const blockers = [...(candidate.readiness?.blockers || [])];
  if (candidate.status !== "published" && (candidate.status !== "ready" || !candidate.readiness?.ready || !candidate.preparedRecord?.id)) {
    blockers.push({ code: `candidate-${candidate.status || "missing"}`, field: "status", message: `Candidate is ${candidate.status || "missing"}, not ready for publication.` });
  }
  const eligibility = candidate.readiness?.publicationEligibility?.[publicationTier === "indexed-only" ? "indexedOnly" : publicationTier];
  for (const blocker of eligibility?.blockers || []) {
    if (blocker.code === "facts-not-reviewed") continue;
    if (!blockers.some((item) => item.code === blocker.code && item.field === blocker.field)) blockers.push(blocker);
  }
  if (candidate.hasDuplicateMatch && !(candidate.readiness?.blockers || []).some((item) => item.code === "duplicate-ambiguity")) {
    blockers.push({ code: "duplicate-ambiguity", field: "identity", message: "A possible duplicate must be resolved before publication." });
  }
  return blockers;
}

function distinctById(items = []) {
  return [...new Map(items.filter(Boolean).map((item) => [item.id, item])).values()];
}

function isCurrentReview(candidate) {
  return factsReviewIsCurrent(candidate);
}

function parseReviewDecision(decision = {}) {
  const type = String(decision.type || "");
  if (type === "select-evidence") {
    const fieldName = trimText(decision.fieldName, 200);
    const sourceType = trimText(decision.sourceType, 80);
    const sourceUrl = normalizeUrl(decision.sourceUrl || "");
    if (!fieldName || !sourceType || !sourceUrl || decision.value === undefined) {
      throw publisherError("Evidence decisions require fieldName, sourceType, sourceUrl, and exact value.", 400, "ECHO_PUBLISHER_INVALID_REVIEW_DECISION");
    }
    return { type, fieldName, sourceType, sourceUrl, value: decision.value };
  }
  if (type === "confirm-external-identity") {
    const provider = trimText(decision.provider, 80);
    const url = normalizeUrl(decision.url || "");
    const confirmedTitle = trimText(decision.confirmedTitle, 240);
    const confirmedCreator = trimText(decision.confirmedCreator, 240);
    if (provider !== "amazon-music" || !url || !confirmedTitle || !confirmedCreator || decision.confirmedMatch !== true) {
      throw publisherError("External identity decisions must explicitly confirm the Amazon listing, title, creator, and exact URL.", 400, "ECHO_PUBLISHER_INVALID_REVIEW_DECISION");
    }
    return {
      type,
      provider,
      url,
      confirmedTitle,
      confirmedCreator,
      confirmedMatch: true,
      confirmedDescriptionMatch: decision.confirmedDescriptionMatch === true,
    };
  }
  throw publisherError(`Unsupported factual review decision: ${type || "missing type"}.`, 400, "ECHO_PUBLISHER_INVALID_REVIEW_DECISION");
}

function createEchoPublisher({
  service,
  store,
  staticRoot,
  config = {},
  getLiveCatalog = null,
  enforceProductionTarget = true,
}) {
  if (!service || !store) throw new TypeError("Echo Publisher requires the existing import service and store.");
  const resolvedStaticRoot = path.resolve(staticRoot || config.STATIC_ROOT || "");
  const configuredStagingRoot = path.resolve(config.IMPORT_STAGING_ROOT || path.join(resolvedStaticRoot, "import-staging"));
  const resolvedRuntimeRoot = fs.realpathSync(resolvedStaticRoot);
  const stagingRoot = path.join(resolvedRuntimeRoot, "import-staging");
  const publisherRoot = path.join(stagingRoot, "echo-publisher");
  const plansRoot = path.join(publisherRoot, "plans");
  const approvalsRoot = path.join(publisherRoot, "approvals");
  const receiptsRoot = path.join(publisherRoot, "receipts");
  const reviewsRoot = path.join(publisherRoot, "reviews");

  function assertTarget() {
    if (!enforceProductionTarget) {
      return {
        environment: config.DEPLOYMENT_ENV || "test",
        releaseId: "test-release",
        staticRoot: resolvedStaticRoot,
        realRoot: resolvedStaticRoot,
      };
    }
    return assertProductionTarget({ config, staticRoot: resolvedStaticRoot, codeRoot: path.resolve(__dirname, "../../..") });
  }

  function ensureRoots() {
    if (configuredStagingRoot !== path.resolve(resolvedStaticRoot, "import-staging")) {
      throw publisherError("Publisher state path is not the active runtime overlay import-staging directory.", 403, "ECHO_PUBLISHER_WRONG_OVERLAY");
    }
    let stagingStat;
    try {
      stagingStat = fs.lstatSync(stagingRoot);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw publisherError("The deployment-owned importer state directory is unavailable.", 503, "ECHO_PUBLISHER_PRODUCTION_OVERLAY_MISSING");
      }
      throw error;
    }
    if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink()) {
      throw publisherError(`Publisher state directory is unsafe: ${stagingRoot}`, 500, "ECHO_PUBLISHER_UNSAFE_STATE");
    }
    if (fs.realpathSync(configuredStagingRoot) !== stagingRoot) {
      throw publisherError("Publisher state path follows an external directory or symbolic link.", 403, "ECHO_PUBLISHER_WRONG_OVERLAY");
    }
    [publisherRoot, plansRoot, approvalsRoot, receiptsRoot, reviewsRoot].forEach((directory) => ensureDirectory(directory));
  }

  function planPath(planId) {
    if (!/^[a-z0-9-]{16,100}$/i.test(String(planId || ""))) throw publisherError("Invalid plan ID.", 400, "ECHO_PUBLISHER_INVALID_PLAN_ID");
    return path.join(plansRoot, `${planId}.json`);
  }

  function approvalPath(planId) {
    return path.join(approvalsRoot, `${planId}.json`);
  }

  function loadPlan(planId) {
    let plan;
    try {
      plan = readJson(planPath(planId));
    } catch (error) {
      if (error.code === "ENOENT") throw publisherError("Publication plan not found.", 404, "ECHO_PUBLISHER_PLAN_NOT_FOUND");
      throw error;
    }
    if (plan.schemaVersion !== PLAN_SCHEMA_VERSION || plan.operationPolicy !== OPERATION_POLICY) {
      throw publisherError("Unsupported publication plan version or transaction policy.", 409, "ECHO_PUBLISHER_PLAN_VERSION_MISMATCH");
    }
    return plan;
  }

  function readShows() {
    return readShowsFile(resolvedStaticRoot);
  }

  function allCandidateBasics() {
    return store.listCandidateBasics().map((basic) => ({ ...basic, candidate: service.getForMaintainer(basic.id) }));
  }

  function resolveEntryCandidate(entry, candidates) {
    const ids = submissionIdsForEntry(entry);
    const bySubmission = candidates.filter(({ candidate }) => candidateMatchesSubmission(candidate, ids));
    const tokens = new Set(identityTokens(entry.objective));
    const byIdentity = candidates.filter(({ candidate }) => identityTokens(candidate.objective).some((token) => tokens.has(token)));
    const resolved = distinctById([...bySubmission, ...byIdentity].map(({ candidate }) => candidate));
    return {
      candidates: resolved,
      matchType: bySubmission.length > 0 ? "submission-id" : "provider-identity",
    };
  }

  function entryCatalogMatches(entry, shows) {
    const tokens = new Set(catalogueIdentityTokens(entry.objective));
    return shows.filter((show) => catalogueIdentityTokens(catalogObjective(show)).some((token) => tokens.has(token)));
  }

  function buildEntryPlan(entry, candidate, shows, expectedUpdate) {
    const submissionIds = submissionIdsForEntry(entry);
    const title = candidate?.title || entry.title;
    const creatorName = candidate?.creatorName || entry.creatorName || "";
    const targetShowId = candidate?.existingShowId || candidate?.publishedShowId || expectedUpdate?.showId || "";
    const candidateHash = candidate ? candidateContentHash(candidate) : "";
    const catalogMatches = candidate ? entryCatalogMatches(entry, shows) : [];
    const exactCatalogMatchIds = catalogMatches.map((show) => show.id);
    const expectedTargetMismatch = Boolean(expectedUpdate?.showId && candidate?.existingShowId && candidate.existingShowId !== expectedUpdate.showId);
    const catalogDuplicate = !targetShowId && catalogMatches.length > 0;
    const titleMatches = shows.filter((show) => slugify(show.title) === slugify(title) &&
      normalizeTitleCreatorKey(show.title, show.credits?.creatorName || show.creators?.[0] || "") === normalizeTitleCreatorKey(title, creatorName));
    const blockers = candidate ? blockerList(candidate) : [{ code: "candidate-not-found", field: "candidate", message: "The target environment did not resolve a candidate for this stable submission identity." }];
    if (expectedTargetMismatch) blockers.push({ code: "update-target-mismatch", field: "identity", message: `The package expects ${expectedUpdate.showId}, but the resolved candidate targets ${candidate.existingShowId}.` });
    if (expectedUpdate?.showId && !shows.some((show) => show.id === expectedUpdate.showId)) blockers.push({ code: "update-target-missing", field: "identity", message: `Expected existing catalogue record ${expectedUpdate.showId} is absent from the active production catalogue.` });
    if (catalogDuplicate) blockers.push({ code: "catalogue-identity-collision", field: "identity", message: `Stable provider identity already appears on catalogue record(s): ${exactCatalogMatchIds.join(", ")}. Resolve the existing record before publishing a new listing.` });
    if (!targetShowId && titleMatches.length > 0 && catalogMatches.length === 0) blockers.push({ code: "weak-title-duplicate", field: "identity", message: `Title and creator match existing catalogue record(s) ${titleMatches.map((show) => show.id).join(", ")}, but no stable provider identity matches. Confirm whether this is an update or a duplicate.` });

    const mode = candidate?.mode === "update" || targetShowId ? "update" : "create";
    const proposedAction = candidate?.status === "published"
      ? "already-published"
      : mode === "update" ? "update" : "new-listing";
    if (candidate?.status === "published" && candidate.publishedShowId && candidate.publishedShowId !== (targetShowId || candidate.preparedRecord?.id)) {
      blockers.push({ code: "published-target-mismatch", field: "identity", message: "The published candidate points at a different catalogue record than this package entry." });
    }
    if (candidate?.mode !== "update" && candidate?.status !== "published" && candidate?.objective?.artworkPermissionStatus !== "established" && candidate?.preparedRecord?.cover && candidate.preparedRecord.cover !== PLACEHOLDER_COVER) {
      blockers.push({ code: "artwork-rights-missing", field: "cover", message: "External artwork lacks established publication permission and the prepared record does not use Echo placeholder artwork." });
    }

    const existingRecord = targetShowId ? shows.find((show) => show.id === targetShowId) || null : null;
    const preparedRecord = candidate?.preparedRecord || null;
    const updateDiff = candidate?.readiness?.updateDiff || [];
    const factsCurrent = candidate ? isCurrentReview(candidate) : false;
    const eligible = Boolean(candidate && blockers.length === 0 && candidate.status === "ready" && candidate.readiness?.ready && preparedRecord?.id);
    const action = blockers.length > 0 || (!eligible && candidate?.status !== "published") ? "blocked" : proposedAction;
    const existingReviewState = candidate ? factualReviewState(candidate) : null;

    return {
      entryId: submissionIds[0],
      submissionIds,
      title,
      creatorName,
      action: eligible ? action : candidate?.status === "published" ? "already-published" : "blocked",
      mode,
      targetShowId: targetShowId || "",
      proposedShowId: preparedRecord?.id || "",
      publicationTier: mode === "update" ? (existingRecord?.reviewStatus || preparedRecord?.reviewStatus || "preserve-existing") : "indexed-only",
      candidate: candidate ? {
        id: candidate.id,
        status: candidate.status,
        inputRevision: Number(candidate.inputRevision),
        contentHash: candidateHash,
        factsReview: { ...existingReviewState, current: factsCurrent },
      } : null,
      package: {
        sourceType: entry.sourceType || "",
        sourceKey: entry.sourceKey || "",
        sourceUrl: entry.sourceUrl || "",
        stableIdentities: identityTokens(entry.objective),
        catalogueIdentityTokens: catalogueIdentityTokens(entry.objective),
        identityProposal: entry.objective.externalIdentityProposal ? {
          provider: entry.objective.externalIdentityProposal.provider || "",
          id: entry.objective.externalIdentityProposal.id || "",
          title: entry.objective.externalIdentityProposal.title || "",
          creatorName: entry.objective.externalIdentityProposal.creatorName || "",
          url: entry.objective.externalIdentityProposal.url || "",
          status: entry.objective.externalIdentityProposal.status || "",
          description: entry.objective.externalIdentityProposal.description || "",
          verificationRequired: entry.objective.externalIdentityProposal.verificationRequired || "",
        } : null,
        supplementalSources: [...new Set([
          ...(Array.isArray(entry.objective.objectiveSources) ? entry.objective.objectiveSources : []),
          ...(Array.isArray(entry.objective.externalResearch?.sourceUrls) ? entry.objective.externalResearch.sourceUrls : []),
        ].map((source) => trimText(source, 2_000)).filter(Boolean))],
        reviewerNeeds: entry.objective.reviewerNeeds || [],
        deferredFields: entry.objective.deferredFields || {},
        artworkUse: entry.objective.artworkUse || "unknown",
        artworkPermissionStatus: entry.objective.artworkPermissionStatus || "unknown",
      },
      fields: {
        known: summarizeFields(preparedRecord || {}).known,
        unknownOptional: summarizeFields(preparedRecord || {}).unknown,
        record: preparedRecord,
      },
      sources: candidate ? sourceSummary(candidate) : [],
      fieldEvidence: candidate ? evidenceSummary(candidate) : [],
      conflicts: candidate?.conflicts || [],
      readiness: candidate?.readiness || null,
      blockers,
      requiresFactualReview: Boolean(eligible && !factsCurrent),
      titleCreatorCandidates: titleMatches.map((show) => ({ id: show.id, title: show.title })),
      stableCatalogueMatches: catalogMatches.map((show) => ({ id: show.id, title: show.title })),
      update: mode === "update" ? {
        existingRecordHash: existingRecord ? hashValue(existingRecord) : "",
        changedManagedFields: updateDiff.map((item) => item.field),
        managedDiff: updateDiff,
        preservedHumanFields: candidate?.lockedFields || [],
        preserveExistingEditorialFields: mode === "update",
      } : null,
      verification: { expectedShowId: preparedRecord?.id || targetShowId || "" },
    };
  }

  async function createPlan({ packageData, packageSha256 = "", actor = "" } = {}) {
    const target = assertTarget();
    validatePackage(packageData);
    ensureRoots();
    const sourceHash = /^[0-9a-f]{64}$/i.test(packageSha256) ? packageSha256.toLowerCase() : hashValue(packageData);
    const input = packageProjection(packageData);
    const shows = readShows();
    const candidatesBeforeSeed = allCandidateBasics();
    const expectedUpdates = new Map((packageData.existingUpdates || []).map((item) => [item.showId, item]));
    const unresolvedEntries = [];
    for (const entry of packageData.searchResults) {
      const resolution = resolveEntryCandidate(entry, candidatesBeforeSeed);
      if (resolution.candidates.length === 0 ||
        !resolution.candidates.some((candidate) => candidateMatchesSubmission(candidate, submissionIdsForEntry(entry)))) {
        unresolvedEntries.push(entry);
      }
    }

    let seedRunId = "";
    if (unresolvedEntries.length > 0) {
      const seeded = await service.seedCandidates({
        searchResults: unresolvedEntries.map((entry) => ({
          ...entry,
          objective: {
            ...entry.objective,
            sourceSubmissionIds: submissionIdsForEntry(entry),
          },
        })),
        actor: actor || "echo-publisher:plan",
        origin: "manual",
      });
      seedRunId = seeded.runId;
      if (seeded.candidateIds.length > 0) {
        await service.processPendingJobs({ limit: Math.max(4, seeded.candidateIds.length) });
        await service.waitForRun(seeded.runId, 5 * 60 * 1000);
      }
    }

    const candidatesAfterSeed = allCandidateBasics();
    const currentShows = readShows();
    const plannedEntries = packageData.searchResults.map((entry) => {
      const resolution = resolveEntryCandidate(entry, candidatesAfterSeed);
      const expectedUpdate = [...expectedUpdates.values()].find((update) => slugify(update.title) === slugify(entry.title)) || null;
      const candidate = resolution.candidates.length === 1 ? resolution.candidates[0] : null;
      const planEntry = buildEntryPlan(entry, candidate, currentShows, expectedUpdate);
      if (resolution.candidates.length > 1) {
        planEntry.action = "blocked";
        planEntry.blockers.push({
          code: "multiple-target-candidates",
          field: "identity",
          message: `Stable submission/provider identity resolves to multiple target candidates: ${resolution.candidates.map((item) => item.id).join(", ")}.`,
        });
      }
      if (candidate && expectedUpdate && candidate.mode !== "update") {
        planEntry.action = "blocked";
        planEntry.blockers.push({ code: "update-not-resolved", field: "identity", message: `Expected update ${expectedUpdate.showId} did not resolve as an importer update candidate.` });
      }
      return planEntry;
    });
    const id = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
    const plan = {
      schemaVersion: PLAN_SCHEMA_VERSION,
      planId: id,
      createdAt: new Date().toISOString(),
      createdBy: trimText(actor, 160) || "echo-publisher:operator",
      operationPolicy: OPERATION_POLICY,
      target: {
        environment: target.environment,
        databasePath: path.resolve(config.DB_PATH || ""),
        runtimeOverlay: target.realRoot,
        plannedReleaseId: target.releaseId,
        siteUrl: String(config.SITE_URL || ""),
      },
      packageSha256: sourceHash,
      sourceArchiveSha256: String(packageData.sourceArchiveSha256 || ""),
      noOpExcluded: packageData.noOpExcluded || null,
      seedRunId,
      packageInput: input,
      counts: plannedEntries.reduce((counts, entry) => {
        counts[entry.action] = (counts[entry.action] || 0) + 1;
        if (entry.requiresFactualReview) counts.factualReviewRequired = (counts.factualReviewRequired || 0) + 1;
        return counts;
      }, {}),
      entries: plannedEntries,
    };
    plan.approvalSha256 = hashValue(plan);
    writeImmutableJson(planPath(id), plan);
    return { plan, approvalSha256: plan.approvalSha256 };
  }

  function planHash(plan) {
    const { approvalSha256, ...content } = plan;
    return hashValue(content);
  }

  function listReceipts(planId) {
    const directory = path.join(receiptsRoot, planId);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory).filter((name) => name.endsWith(".json") && name.startsWith("attempt-")).sort()
      .map((name) => readJson(path.join(directory, name)))
      .sort((left, right) => String(left.completedAt || "").localeCompare(String(right.completedAt || "")) || left.attemptId.localeCompare(right.attemptId));
  }

  function listPublicVerifications(receiptId) {
    const directory = path.join(receiptsRoot, "public-verification");
    if (!fs.existsSync(directory)) return [];
    const prefix = `${receiptId}--`;
    return fs.readdirSync(directory).filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
      .sort().map((name) => readJson(path.join(directory, name)));
  }

  function latestReceipt(planId) {
    const attempts = listReceipts(planId);
    return attempts[attempts.length - 1] || null;
  }

  function comparePlanCurrent(plan, { approval = null, allowCompleted = false } = {}) {
    const currentShows = readShows();
    const candidates = allCandidateBasics();
    const mismatches = [];
    const reviewedByPlan = new Map((approval?.reviewStamps || []).map((stamp) => [stamp.candidateId, stamp]));
    for (const entry of plan.entries) {
      if (!entry.candidate) continue;
      const candidate = service.getForMaintainer(entry.candidate.id);
      const completedByThisPlan = allowCompleted && candidate.status === "published" &&
        candidate.events?.some((event) => event.eventType === "published" && event.payload?.planId === plan.planId && event.payload?.planHash === plan.approvalSha256);
      if (completedByThisPlan) continue;
      if (Number(candidate.inputRevision) !== Number(entry.candidate.inputRevision) ||
        candidateContentHash(candidate) !== entry.candidate.contentHash ||
        candidate.status !== entry.candidate.status) {
        mismatches.push({ submissionId: entry.entryId, candidateId: candidate.id, reason: "candidate revision or content changed" });
        continue;
      }
      const currentReview = factualReviewState(candidate);
      const plannedReview = entry.candidate.factsReview;
      const authorizedStamp = reviewedByPlan.get(candidate.id);
      const reviewStateMatchesPlan = currentReview.factsReviewedBy === plannedReview.factsReviewedBy &&
        currentReview.factsReviewedAt === plannedReview.factsReviewedAt &&
        Number(currentReview.factsReviewedRevision) === Number(plannedReview.factsReviewedRevision);
      const reviewStateMatchesApproval = Boolean(authorizedStamp &&
        currentReview.factsReviewedBy === (approval?.factualReviewer || approval?.actor) &&
        currentReview.factsReviewedAt === authorizedStamp.reviewedAt &&
        Number(currentReview.factsReviewedRevision) === Number(entry.candidate.inputRevision));
      if (!reviewStateMatchesPlan && !reviewStateMatchesApproval) {
        mismatches.push({ submissionId: entry.entryId, candidateId: candidate.id, reason: "factual review state changed" });
        continue;
      }
      if (entry.targetShowId) {
        const currentShow = currentShows.find((show) => show.id === entry.targetShowId);
        if (!currentShow || hashValue(currentShow) !== entry.update?.existingRecordHash) {
          mismatches.push({ submissionId: entry.entryId, candidateId: candidate.id, reason: "existing catalogue record changed" });
          continue;
        }
      } else {
        const expectedCatalogueIdentities = entry.package?.catalogueIdentityTokens || entry.package?.stableIdentities || [];
        const newMatches = expectedCatalogueIdentities.length
          ? currentShows.filter((show) => catalogueIdentityTokens(catalogObjective(show)).some((token) => expectedCatalogueIdentities.includes(token)))
          : [];
        if (newMatches.length > 0) {
          mismatches.push({ submissionId: entry.entryId, candidateId: candidate.id, reason: `new catalogue identity appeared (${newMatches.map((show) => show.id).join(", ")})` });
          continue;
        }
      }
      const sourceEntry = plan.packageInput.searchResults.find((item) => submissionIdsForEntry(item).includes(entry.entryId));
      const candidateResolutions = sourceEntry ? resolveEntryCandidate(sourceEntry, candidates) : { candidates: [] };
      if (candidateResolutions.candidates.length !== 1 || candidateResolutions.candidates[0].id !== candidate.id) {
        mismatches.push({ submissionId: entry.entryId, candidateId: candidate.id, reason: "stable submission identity resolves to a different candidate set" });
      }
    }
    return mismatches;
  }

  function loadApproval(planId) {
    const filePath = approvalPath(planId);
    if (!fs.existsSync(filePath)) return null;
    return readJson(filePath);
  }

  function createApproval(plan, { actor, approveSha256, reviewFacts, factualReviewer = "" }) {
    const expectedHash = planHash(plan);
    if (String(approveSha256 || "").toLowerCase() !== expectedHash) {
      throw publisherError("Approval digest does not match this immutable publication plan.", 403, "ECHO_PUBLISHER_APPROVAL_HASH_MISMATCH");
    }
    const existing = loadApproval(plan.planId);
    if (existing) {
      if (existing.planHash !== expectedHash) throw publisherError("The stored authorization does not match this plan.", 409, "ECHO_PUBLISHER_APPROVAL_CONFLICT");
      return existing;
    }
    const eligible = plan.entries.filter((entry) => entry.action === "new-listing" || entry.action === "update");
    const missingReview = eligible.filter((entry) => entry.requiresFactualReview);
    if (missingReview.length > 0 && reviewFacts !== true) {
      throw publisherError("This batch contains unreviewed factual candidates. Include --review-facts in the single batch authorization after reviewing the plan and evidence.", 409, "ECHO_PUBLISHER_FACTS_REVIEW_REQUIRED");
    }
    if (factualReviewer && factualReviewer !== "delegate:codex") {
      throw publisherError("The factual reviewer must be the authorized local operator or the configured Codex delegate.", 400, "ECHO_PUBLISHER_INVALID_FACTUAL_REVIEWER");
    }
    const authorization = {
      planId: plan.planId,
      planHash: expectedHash,
      actor: trimText(actor, 160),
      authorizedAt: new Date().toISOString(),
      reviewFacts: reviewFacts === true,
      factualReviewer: reviewFacts === true ? factualReviewer || trimText(actor, 160) : "",
      reviewStamps: missingReview.map((entry) => ({
        candidateId: entry.candidate.id,
        reviewedAt: "",
        inputRevision: entry.candidate.inputRevision,
      })),
    };
    if (!authorization.actor) throw publisherError("The local operator identity was not supplied by the authorized host runner.", 401, "ECHO_PUBLISHER_OPERATOR_REQUIRED");
    authorization.reviewStamps.forEach((stamp) => { stamp.reviewedAt = authorization.authorizedAt; });
    try {
      writeImmutableJson(approvalPath(plan.planId), authorization);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const racedApproval = loadApproval(plan.planId);
      if (racedApproval?.planHash !== expectedHash) {
        throw publisherError("A concurrent authorization conflicts with this publication plan.", 409, "ECHO_PUBLISHER_APPROVAL_CONFLICT");
      }
      return racedApproval;
    }
    return authorization;
  }

  function ensureReviewStamps(approval, plan) {
    const factualReviewer = approval.factualReviewer || approval.actor;
    const candidatesToMark = approval.reviewStamps.filter((stamp) => {
      const candidate = service.getForMaintainer(stamp.candidateId);
      return candidate.factsReviewedBy !== factualReviewer || candidate.factsReviewedAt !== stamp.reviewedAt ||
        Number(candidate.factsReviewedRevision) !== Number(stamp.inputRevision);
    });
    if (candidatesToMark.length > 0) {
      service.markFactsReviewedBatchForMaintainer(
        candidatesToMark.map((stamp) => stamp.candidateId),
        approval.actor,
        {
          reviewer: factualReviewer,
          expectedRevisions: Object.fromEntries(candidatesToMark.map((stamp) => [stamp.candidateId, stamp.inputRevision])),
          expectedContentHashes: Object.fromEntries(candidatesToMark.map((stamp) => [
            stamp.candidateId,
            plan.entries.find((entry) => entry.candidate?.id === stamp.candidateId)?.candidate?.contentHash || "",
          ])),
          reviewedAt: approval.authorizedAt,
          planId: plan.planId,
        },
      );
    }
  }

  function appendReceipt(receipt) {
    const directory = path.join(receiptsRoot, receipt.planId);
    ensureDirectory(directory);
    const name = `attempt-${receipt.attemptId}.json`;
    writeImmutableJson(path.join(directory, name), receipt);
    return receipt;
  }

  async function verifyCatalogueWrite(showIds = []) {
    const result = { status: "verified", checkedAt: new Date().toISOString(), showIds: [...showIds] };
    try {
      await validateSiteData(resolvedStaticRoot, { recoverCovers: false, buildArtifacts: false });
      const sourceShows = readShows();
      const builtShows = await loadCatalog(resolvedStaticRoot);
      const liveShows = typeof getLiveCatalog === "function" ? getLiveCatalog() : null;
      const missingSource = showIds.filter((id) => !sourceShows.some((show) => show.id === id));
      const missingBuilt = showIds.filter((id) => !builtShows.some((show) => show.id === id));
      const missingLive = liveShows ? showIds.filter((id) => !liveShows.some((show) => show.id === id)) : [];
      if (!liveShows || missingSource.length || missingBuilt.length || missingLive.length) {
        return {
          ...result,
          status: "failed",
          errors: [
            ...(missingSource.length ? [`Runtime catalogue source is missing ${missingSource.join(", ")}.`] : []),
            ...(missingBuilt.length ? [`Built catalogue is missing ${missingBuilt.join(", ")}.`] : []),
            ...(missingLive.length ? [`Running application state is missing ${missingLive.join(", ")}.`] : []),
            ...(!liveShows ? ["Running application state was not available for verification."] : []),
          ],
        };
      }
      const publicRecordHashes = Object.fromEntries(showIds.map((id) => {
        const show = liveShows?.find((item) => item.id === id) || builtShows.find((item) => item.id === id) || sourceShows.find((item) => item.id === id);
        return [id, hashValue(serializeRuntimeShow(show))];
      }));
      const builtRecordHashes = Object.fromEntries(showIds.map((id) => [id, hashValue(serializeRuntimeShow(builtShows.find((show) => show.id === id)))]));
      const liveRecordHashes = liveShows
        ? Object.fromEntries(showIds.map((id) => [id, hashValue(serializeRuntimeShow(liveShows.find((show) => show.id === id)))]))
        : {};
      const contentMismatchIds = showIds.filter((id) => liveShows && builtRecordHashes[id] !== liveRecordHashes[id]);
      if (contentMismatchIds.length > 0) {
        return {
          ...result,
          status: "failed",
          publicRecordHashes,
          errors: [`Generated catalog and running process differ for ${contentMismatchIds.join(", ")}.`],
        };
      }
      return {
        ...result,
        runtimeSource: "verified",
        generatedArtifacts: "verified",
        liveProcessCatalog: liveShows ? "verified" : "unavailable",
        publicRecordHashes,
      };
    } catch (error) {
      return { ...result, status: "failed", errors: [error.message || String(error)] };
    }
  }

  function createCandidateReceipt(entry, status, details = {}) {
    return {
      entryId: entry.entryId,
      submissionIds: entry.submissionIds,
      title: entry.title,
      candidateId: entry.candidate?.id || "",
      expectedRevision: entry.candidate?.inputRevision || null,
      action: entry.action,
      status,
      targetShowId: entry.targetShowId || entry.proposedShowId || "",
      blockers: entry.blockers || [],
      ...details,
    };
  }

  async function applyPlan({ planId, approveSha256, reviewFacts = false, factualReviewer = "", actor = "" } = {}) {
    const target = assertTarget();
    ensureRoots();
    const plan = loadPlan(planId);
    const expectedHash = planHash(plan);
    if (String(approveSha256 || "").toLowerCase() !== expectedHash) {
      throw publisherError("Approval digest does not match this immutable publication plan.", 403, "ECHO_PUBLISHER_APPROVAL_HASH_MISMATCH");
    }

    const priorReceipts = listReceipts(plan.planId);
    const priorSuccess = [...priorReceipts].reverse().find((receipt) => receipt.catalogueWrite?.status === "complete");
    if (priorSuccess) {
      const verification = await verifyCatalogueWrite(priorSuccess.catalogueWrite.showIds || []);
      const recovered = {
        ...priorSuccess,
        retry: "idempotent-verification-only",
        verification,
      };
      return { receipt: recovered, idempotent: true };
    }

    let approval = loadApproval(plan.planId);
    const publicationEntries = plan.entries.filter((entry) => entry.action === "new-listing" || entry.action === "update");
    const committedByThisPlan = publicationEntries.map((entry) => {
      const candidate = service.getForMaintainer(entry.candidate.id);
      const event = candidate.events?.find((item) => item.eventType === "published" &&
        item.payload?.planId === plan.planId && item.payload?.planHash === expectedHash);
      return event ? { entry, candidate, showId: event.payload.showId || candidate.publishedShowId || "" } : null;
    });
    if (publicationEntries.length > 0 && committedByThisPlan.every(Boolean)) {
      const showIds = committedByThisPlan.map((item) => item.showId);
      const verification = await verifyCatalogueWrite(showIds);
      const recovered = {
        receiptId: `${plan.planId}--recovery-${crypto.randomUUID()}`,
        attemptId: `recovery-${crypto.randomUUID()}`,
        planId: plan.planId,
        planSha256: expectedHash,
        packageSha256: plan.packageSha256,
        environment: target.environment,
        plannedReleaseId: plan.target.plannedReleaseId,
        appliedReleaseId: target.releaseId,
        transactionPolicy: OPERATION_POLICY,
        authorizedBy: approval?.actor || "",
        factualReviewer: approval?.factualReviewer || "",
        authorizedAt: approval?.authorizedAt || "",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        recoveredFromPublicationEvents: true,
        catalogueWrite: { status: "complete", showIds, buildCount: 1 },
        verification,
        candidates: committedByThisPlan.map(({ entry, showId }) => createCandidateReceipt(entry, "published", {
          targetShowId: showId,
          recoveredFromPublicationEvent: true,
          publicationTier: entry.mode === "update" ? "preserved-existing-tier" : "indexed-only",
        })),
        publicSiteVerification: { status: "pending" },
      };
      appendReceipt(recovered);
      return { receipt: recovered, idempotent: true, recovered: true };
    }

    const mismatches = comparePlanCurrent(plan, { approval });
    if (mismatches.length > 0) {
      throw publisherError(
        `Publication plan is stale; no catalogue content was written. ${mismatches.map((item) => `${item.submissionId}: ${item.reason}`).join("; ")}`,
        409,
        "ECHO_PUBLISHER_STALE_PLAN",
      );
    }
    if (!approval) approval = createApproval(plan, { actor, approveSha256, reviewFacts, factualReviewer });
    else if (approval.planHash !== expectedHash) throw publisherError("The stored authorization does not match this plan.", 409, "ECHO_PUBLISHER_APPROVAL_CONFLICT");

    ensureReviewStamps(approval, plan);
    const blockedReceipts = plan.entries.filter((entry) => entry.action === "blocked")
      .map((entry) => createCandidateReceipt(entry, "blocked"));
    const skippedReceipts = plan.entries.filter((entry) => entry.action === "already-published")
      .map((entry) => createCandidateReceipt(entry, "skipped", { reason: "candidate was already published when the plan was created" }));
    const attemptId = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
    let catalogueWrite = { status: "not-attempted", showIds: [], buildCount: 0 };
    let publishedReceipts = [];
    let errorText = "";
    if (publicationEntries.length > 0) {
      const ids = publicationEntries.map((entry) => entry.candidate.id);
      try {
        const expectedRevisions = Object.fromEntries(publicationEntries.map((entry) => [entry.candidate.id, entry.candidate.inputRevision]));
        const expectedCandidateHashes = Object.fromEntries(publicationEntries.map((entry) => [
          entry.candidate.id,
          entry.candidate.contentHash,
        ]));
        const published = await service.batchPublishForMaintainer(ids, approval.actor, "indexed-only", {
          expectedRevisions,
          expectedCandidateHashes,
          requireCurrentFactsReview: true,
          publicationContext: { planId: plan.planId, planHash: expectedHash },
          prePublicationCheck: () => {
            const currentMismatches = comparePlanCurrent(plan, { approval });
            if (currentMismatches.length > 0) {
              throw publisherError(
                `Publication plan became stale before the batch write. ${currentMismatches.map((item) => `${item.submissionId}: ${item.reason}`).join("; ")}`,
                409,
                "ECHO_PUBLISHER_STALE_PLAN",
              );
            }
          },
        });
        catalogueWrite = { status: "complete", showIds: published.showIds, buildCount: published.buildCount };
        publishedReceipts = publicationEntries.map((entry) => createCandidateReceipt(entry, "published", {
          targetShowId: published.showIds[ids.indexOf(entry.candidate.id)] || entry.proposedShowId,
          publicationTier: entry.mode === "update" ? "preserved-existing-tier" : "indexed-only",
        }));
      } catch (error) {
        errorText = error.message || String(error);
        catalogueWrite = { status: "failed-rolled-back", showIds: [], buildCount: 0, error: errorText };
        publishedReceipts = publicationEntries.map((entry) => createCandidateReceipt(entry, "failed", { error: errorText }));
      }
    }

    const verification = catalogueWrite.status === "complete"
      ? await verifyCatalogueWrite(catalogueWrite.showIds)
      : { status: catalogueWrite.status === "not-attempted" ? "not-applicable" : "not-run", checkedAt: new Date().toISOString() };
    const receipt = {
      receiptId: `${plan.planId}--${attemptId}`,
      attemptId,
      planId: plan.planId,
      planSha256: expectedHash,
      packageSha256: plan.packageSha256,
      environment: target.environment,
      plannedReleaseId: plan.target.plannedReleaseId,
      appliedReleaseId: target.releaseId,
      transactionPolicy: OPERATION_POLICY,
      authorizedBy: approval.actor,
      factualReviewer: approval.factualReviewer || "",
      authorizedAt: approval.authorizedAt,
      reviewedCandidateIds: approval.reviewStamps.map((stamp) => stamp.candidateId),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      catalogueWrite,
      verification,
      candidates: [...publishedReceipts, ...blockedReceipts, ...skippedReceipts],
      error: errorText,
      publicSiteVerification: { status: catalogueWrite.status === "complete" ? "pending" : "not-applicable" },
    };
    appendReceipt(receipt);
    return { receipt, idempotent: false };
  }

  function checkPlanFresh(plan) {
    const mismatches = comparePlanCurrent(plan, { approval: loadApproval(plan.planId) });
    if (mismatches.length > 0) {
      throw publisherError(`Review plan is stale: ${mismatches.map((item) => `${item.submissionId}: ${item.reason}`).join("; ")}`, 409, "ECHO_PUBLISHER_STALE_PLAN");
    }
  }

  async function resolveReviews({ planId, approveSha256, decisions = [], actor = "", reviewer = "" } = {}) {
    assertTarget();
    ensureRoots();
    const plan = loadPlan(planId);
    if (String(approveSha256 || "").toLowerCase() !== planHash(plan)) {
      throw publisherError("Review authorization digest does not match this immutable plan.", 403, "ECHO_PUBLISHER_APPROVAL_HASH_MISMATCH");
    }
    if (!Array.isArray(decisions) || decisions.length === 0 || decisions.length > 100) {
      throw publisherError("Provide 1 to 100 explicit evidence or external-identity review decisions.", 400, "ECHO_PUBLISHER_INVALID_REVIEW_DECISION");
    }
    const effectiveReviewer = reviewer || actor;
    if (reviewer && reviewer !== "delegate:codex") {
      throw publisherError("Delegated review attribution must identify Codex explicitly.", 400, "ECHO_PUBLISHER_INVALID_REVIEWER");
    }
    checkPlanFresh(plan);
    const outcomes = [];
    for (const rawDecision of decisions) {
      const submissionId = trimText(rawDecision.submissionId, 160);
      const entry = plan.entries.find((item) => item.submissionIds.includes(submissionId));
      if (!entry?.candidate) {
        outcomes.push({ submissionId, status: "blocked", error: "Stable submission identity is not part of this plan." });
        continue;
      }
      const decision = parseReviewDecision(rawDecision);
      let candidate = service.getForMaintainer(entry.candidate.id);
      try {
        if (decision.type === "select-evidence") {
          const matches = candidate.fieldEvidence.filter((evidence) => evidence.fieldName === decision.fieldName &&
            evidence.sourceType === decision.sourceType && normalizeUrl(evidence.sourceUrl) === decision.sourceUrl &&
            stableStringify(evidence.value) === stableStringify(decision.value));
          if (matches.length !== 1) throw publisherError(`Expected exactly one current target-environment evidence row for ${decision.fieldName}; found ${matches.length}.`, 409, "ECHO_PUBLISHER_EVIDENCE_NOT_UNIQUE");
          if (matches[0].selected) {
            outcomes.push({ submissionId, candidateId: candidate.id, status: "already-selected", evidenceId: matches[0].id, fieldName: decision.fieldName });
            continue;
          }
          const run = service.selectEvidenceForMaintainer(candidate.id, decision.fieldName, matches[0].id, effectiveReviewer);
          await service.processPendingJobs({ limit: 4 });
          await service.waitForRun(run.runId, 5 * 60 * 1000);
          candidate = service.getForMaintainer(candidate.id);
          outcomes.push({ submissionId, candidateId: candidate.id, status: candidate.status === "ready" ? "reviewed" : "blocked", revision: candidate.inputRevision, fieldName: decision.fieldName, evidenceId: matches[0].id });
        } else {
          const currentIdentity = candidate.objective?.externalIdentity;
          if (currentIdentity?.verified === true && currentIdentity.url === decision.url &&
            currentIdentity.confirmedTitle === decision.confirmedTitle && currentIdentity.confirmedCreator === decision.confirmedCreator) {
            outcomes.push({ submissionId, candidateId: candidate.id, status: "already-confirmed", revision: candidate.inputRevision });
            continue;
          }
          const run = await service.verifyExternalIdentityForMaintainer(candidate.id, decision, effectiveReviewer);
          await service.processPendingJobs({ limit: 4 });
          await service.waitForRun(run.runId, 5 * 60 * 1000);
          candidate = service.getForMaintainer(candidate.id);
          outcomes.push({ submissionId, candidateId: candidate.id, status: candidate.status === "ready" ? "reviewed" : "blocked", revision: candidate.inputRevision, externalIdentity: candidate.objective?.externalIdentity || null });
        }
      } catch (error) {
        outcomes.push({ submissionId, candidateId: candidate.id, status: "failed", error: error.message || String(error), code: error.code || "" });
      }
    }
    const reviewId = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
    const reviewRecord = {
      reviewId,
      priorPlanId: plan.planId,
      priorPlanSha256: planHash(plan),
      reviewedBy: trimText(effectiveReviewer, 160),
      authorizedBy: trimText(actor, 160),
      reviewedAt: new Date().toISOString(),
      decisions: outcomes,
    };
    writeImmutableJson(path.join(reviewsRoot, `${reviewId}.json`), reviewRecord);
    let replacementPlan = null;
    if (outcomes.some((outcome) => ["reviewed", "already-selected", "already-confirmed"].includes(outcome.status))) {
      const inputPackage = {
        ...plan.packageInput,
        searchResults: plan.packageInput.searchResults,
      };
      replacementPlan = await createPlan({ packageData: inputPackage, packageSha256: plan.packageSha256, actor });
    }
    return { review: reviewRecord, replacementPlan };
  }

  function status(planId) {
    assertTarget();
    ensureRoots();
    const plan = loadPlan(planId);
    const receipt = latestReceipt(plan.planId);
    const publicVerificationEvents = receipt ? listPublicVerifications(receipt.receiptId) : [];
    const latestPublicVerification = publicVerificationEvents.at(-1) || receipt?.publicSiteVerification || null;
    return {
      planId: plan.planId,
      approvalSha256: planHash(plan),
      planCounts: plan.counts,
      target: plan.target,
      approval: loadApproval(plan.planId),
      latestReceipt: receipt ? { ...receipt, publicSiteVerification: latestPublicVerification } : null,
      candidates: plan.entries.map((entry) => {
        let current = null;
        if (entry.candidate) {
          try { current = service.getForMaintainer(entry.candidate.id); } catch (_error) { current = null; }
        }
        const status = current?.status === "published" ? "published" :
          receipt?.candidates?.find((item) => item.entryId === entry.entryId)?.status ||
          (entry.action === "blocked" ? "blocked" : "pending");
        return {
          entryId: entry.entryId,
          title: entry.title,
          candidateId: entry.candidate?.id || "",
          plannedAction: entry.action,
          currentStatus: current?.status || "missing",
          status,
          currentRevision: current?.inputRevision ?? null,
          plannedRevision: entry.candidate?.inputRevision ?? null,
          blockers: entry.blockers,
        };
      }),
      attempts: listReceipts(plan.planId).length,
    };
  }

  function inspect(planId) {
    assertTarget();
    ensureRoots();
    const plan = loadPlan(planId);
    return { plan, approvalSha256: planHash(plan), status: status(planId) };
  }

  function findReceipt(receiptId) {
    if (!/^[a-z0-9-]{16,100}--[a-z0-9-]{16,100}$/i.test(String(receiptId || ""))) {
      throw publisherError("Invalid publication receipt ID.", 400, "ECHO_PUBLISHER_INVALID_RECEIPT_ID");
    }
    const planId = receiptId.split("--")[0];
    return listReceipts(planId).find((receipt) => receipt.receiptId === receiptId) || null;
  }

  async function verifyReceipt(receiptId) {
    assertTarget();
    ensureRoots();
    const receipt = findReceipt(receiptId);
    if (!receipt) throw publisherError("Publication receipt not found.", 404, "ECHO_PUBLISHER_RECEIPT_NOT_FOUND");
    const verification = await verifyCatalogueWrite(receipt.catalogueWrite?.showIds || []);
    return { receipt, verification, publicVerifications: listPublicVerifications(receiptId) };
  }

  function recordPublicVerification(receiptId, observation = {}) {
    assertTarget();
    ensureRoots();
    const receipt = findReceipt(receiptId);
    if (!receipt) throw publisherError("Publication receipt not found.", 404, "ECHO_PUBLISHER_RECEIPT_NOT_FOUND");
    if (receipt.catalogueWrite?.status !== "complete") throw publisherError("A public-site check requires a completed catalogue write.", 409, "ECHO_PUBLISHER_WRITE_NOT_COMPLETE");
    if (!new Set(["verified", "failed"]).has(observation.status)) throw publisherError("Public verification status must be verified or failed.", 400, "ECHO_PUBLISHER_INVALID_PUBLIC_VERIFICATION");
    const verificationId = `${receiptId}--${Date.now().toString(36)}-${crypto.randomUUID()}`;
    const event = {
      verificationId,
      receiptId,
      checkedAt: trimText(observation.checkedAt, 60) || new Date().toISOString(),
      status: observation.status,
      endpoint: "https://echoarchives.net/data/shows.json",
      httpStatus: Number(observation.httpStatus) || 0,
      bodySha256: /^[0-9a-f]{64}$/i.test(String(observation.bodySha256 || "")) ? String(observation.bodySha256).toLowerCase() : "",
      expectedShowIds: receipt.catalogueWrite.showIds,
      foundShowIds: Array.isArray(observation.foundShowIds) ? observation.foundShowIds.filter((id) => receipt.catalogueWrite.showIds.includes(id)) : [],
      contentMismatches: Array.isArray(observation.contentMismatches) ? observation.contentMismatches.filter((id) => receipt.catalogueWrite.showIds.includes(id)) : [],
      expectedRecordHashes: Object.fromEntries(receipt.catalogueWrite.showIds
        .filter((id) => /^[0-9a-f]{64}$/i.test(String(observation.expectedRecordHashes?.[id] || "")))
        .map((id) => [id, String(observation.expectedRecordHashes[id]).toLowerCase()])),
      error: trimText(observation.error, 1_000),
    };
    ensureDirectory(path.join(receiptsRoot, "public-verification"));
    writeImmutableJson(path.join(receiptsRoot, "public-verification", `${verificationId}.json`), event);
    return event;
  }

  return {
    applyPlan,
    createPlan,
    inspect,
    recordPublicVerification,
    resolveReviews,
    status,
    verifyReceipt,
  };
}

module.exports = {
  OPERATION_POLICY,
  PLAN_SCHEMA_VERSION,
  PRODUCTION_TARGET,
  assertProductionTarget,
  candidateMatchesSubmission,
  createEchoPublisher,
  identityTokens,
  packageProjection,
  validatePackage,
};
