const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const archiveSearch = require("../../shared/archive-search");
const discovery = require("../../shared/discovery");

const FIXTURE_VERSION = 1;
const SURFACES = new Set(["show-search", "collections-search"]);
const SUPPORT_STATES = new Set(["current-v1", "discovery-v2"]);
const RUNTIME_INPUTS = ["data/shows.json", "data/search-index.json", "data/collections.json"];
const CONSTRAINT_FIELDS = new Set([
  "genres",
  "formats",
  "tones",
  "tags",
  "bestFor",
  "completionStatus",
  "releaseStatus",
  "discovery.commitment",
  "length.totalHours",
]);
const ASSERTION_KEYS = [
  "identityFirst",
  "acceptableTopK",
  "prohibitedTopK",
  "hardConstraints",
  "queryShapeV1",
  "routeRecognition",
  "entityEvidenceV1",
  "explanationEvidenceV1",
  "intent",
  "seedResolution",
  "entityResolution",
  "ambiguity",
  "unresolvedPhrases",
  "sparseOutcome",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listFilesRecursively(directoryPath, rootPath = directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  return fs.readdirSync(directoryPath, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.name === ".DS_Store" || entry.name.startsWith("._")) return [];
      if (entry.isDirectory()) return listFilesRecursively(fullPath, rootPath);
      if (!entry.isFile()) return [];
      return [path.relative(rootPath, fullPath).split(path.sep).join("/")];
    });
}

function gitObjectId(siteRoot, ref) {
  try {
    return execFileSync("git", ["rev-parse", ref], {
      cwd: siteRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

function computeCatalogueRevision(siteRoot) {
  const sourceRoot = path.join(siteRoot, "catalog-src");
  const sourceFiles = listFilesRecursively(sourceRoot)
    .map((fileName) => `catalog-src/${fileName}`)
    .sort();
  const runtimeFiles = RUNTIME_INPUTS.filter((fileName) => fs.existsSync(path.join(siteRoot, fileName)));
  const files = [...sourceFiles, ...runtimeFiles].sort();
  const digest = crypto.createHash("sha256");

  files.forEach((relativePath) => {
    const bytes = fs.readFileSync(path.join(siteRoot, relativePath));
    const fileDigest = crypto.createHash("sha256").update(bytes).digest("hex");
    digest.update(`${relativePath}\0${fileDigest}\n`);
  });

  return {
    fingerprint: digest.digest("hex"),
    fileCount: files.length,
    sourceFileCount: sourceFiles.length,
    runtimeFiles,
    sourceFiles,
  };
}

function readBenchmarkContext(siteRoot) {
  const shows = readJson(path.join(siteRoot, "data/shows.json"));
  const searchRecords = readJson(path.join(siteRoot, "data/search-index.json"));
  const collections = readJson(path.join(siteRoot, "data/collections.json"));
  const entities = readJson(path.join(siteRoot, "catalog-src/entities.json"));
  if (!Array.isArray(shows) || !Array.isArray(searchRecords) || !Array.isArray(collections) || !Array.isArray(entities)) {
    throw new Error("Benchmark inputs must be JSON arrays: data/shows.json, data/search-index.json, data/collections.json, catalog-src/entities.json.");
  }

  const searchCatalog = archiveSearch.hydrateCatalogSearch(searchRecords);
  const showsById = new Map(shows.map((show) => [show.id, show]));
  const collectionsById = new Map(collections.map((collection) => [collection.id, collection]));
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const showsByCollection = new Map(collections.map((collection) => [
    collection.id,
    (Array.isArray(collection.showIds) ? collection.showIds : [])
      .map((showId) => showsById.get(showId))
      .filter(Boolean),
  ]));
  const catalogueRevision = computeCatalogueRevision(siteRoot).fingerprint;
  const discoveryEngine = discovery.createDiscoveryEngine({ shows, searchCatalog, collections, entities, catalogueRevision });

  return {
    siteRoot,
    shows,
    showsById,
    searchCatalog,
    searchShowsById: new Map(searchCatalog.map((show) => [show.id, show])),
    collections,
    collectionsById,
    showsByCollection,
    entities,
    entitiesById,
    discoveryEngine,
    showIds: new Set(shows.map((show) => show.id)),
    collectionIds: new Set(collections.map((collection) => collection.id)),
    entityIds: new Set(entities.map((entity) => entity.id)),
  };
}

function getCollectionSearchText(collection, shows) {
  const collectionShows = Array.isArray(shows) ? shows : [];
  return [
    collection.title,
    collection.description,
    collection.label,
    collection.commitment,
    collection.kind,
    ...(collection.intentTags || []),
    ...collectionShows.flatMap((show) => [show.title, ...(show.genres || []), ...(show.tones || []), ...(show.tags || [])]),
  ].join(" ").toLowerCase();
}

function sortCollectionsByDefaultEditorialOrder(collections) {
  return [...collections].sort((left, right) => {
    const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || String(left?.title || "Untitled collection").localeCompare(String(right?.title || "Untitled collection"));
  });
}

function executeCase(caseDefinition, context) {
  const discoveryResult = context.discoveryEngine.retrieve(caseDefinition.query, { surface: caseDefinition.surface });
  if (caseDefinition.surface === "collections-search") {
    const query = caseDefinition.query.trim().toLowerCase();
    const results = sortCollectionsByDefaultEditorialOrder(context.collections)
      .filter((collection) => getCollectionSearchText(collection, context.showsByCollection.get(collection.id)).includes(query));
    return {
      results,
      discovery: discoveryResult,
      observation: {
        resultCount: results.length,
        topIds: results.slice(0, 5).map((collection) => collection.id),
      },
    };
  }

  const results = archiveSearch.scoreCatalog(context.searchCatalog, caseDefinition.query);
  const shape = archiveSearch.classifyQueryShape(context.searchCatalog, caseDefinition.query);
  const first = results[0] || null;
  return {
    results,
    discovery: discoveryResult,
    observation: {
      resultCount: results.length,
      topIds: results.slice(0, 5).map((show) => show.id),
      queryShape: shape,
      topEvidence: first ? {
        id: first.id,
        matchTier: Number.isFinite(first.searchMatchTier) ? first.searchMatchTier : null,
        reasons: (Array.isArray(first.reasons) ? first.reasons : []).slice(0, 3),
        presentation: String(first.searchPresentation?.metaText || ""),
      } : null,
    },
  };
}

function currentGitEvidence(siteRoot) {
  return {
    repositoryCommit: gitObjectId(siteRoot, "HEAD"),
    sourceTree: gitObjectId(siteRoot, "HEAD:catalog-src"),
    showSourceTree: gitObjectId(siteRoot, "HEAD:catalog-src/shows"),
    collectionSourceTree: gitObjectId(siteRoot, "HEAD:catalog-src/collections"),
    entitySourceBlob: gitObjectId(siteRoot, "HEAD:catalog-src/entities.json"),
    runtimeBlobs: Object.fromEntries(RUNTIME_INPUTS.map((fileName) => [
      fileName,
      gitObjectId(siteRoot, `HEAD:${fileName}`),
    ])),
  };
}

function createBaselineMetadata(context, revision, capturedAt = new Date().toISOString()) {
  return {
    label: "baseline-v1",
    capturedAt,
    implementationCommit: gitObjectId(context.siteRoot, "HEAD"),
    catalogueFingerprint: revision.fingerprint,
    catalogueRevision: `sha256:${revision.fingerprint}`,
    catalogueFileCount: revision.fileCount,
    catalogueSourceFileCount: revision.sourceFileCount,
    sourceEvidence: ["catalog-src/**", ...RUNTIME_INPUTS],
    gitEvidence: currentGitEvidence(context.siteRoot),
    counts: {
      publishedShows: context.shows.length,
      searchRecords: context.searchCatalog.length,
      runtimeCollections: context.collections.length,
      entities: context.entities.length,
    },
    observationShape: "resultCount, top five IDs, v1 query shape, and concise top-result evidence; no full ranking snapshot",
  };
}

function captureBaseline(corpus, context, fixturePath, options = {}) {
  if (corpus.baseline) throw new Error("The v1 baseline is already captured. Create a new versioned corpus to establish another baseline.");
  if (corpus.cases.some((caseDefinition) => caseDefinition.target)) {
    throw new Error("Capture the immutable v1 observations before adding target expectations.");
  }
  validateCorpus(corpus, context, { requireBaseline: false, captureMode: true });
  const revision = computeCatalogueRevision(context.siteRoot);
  const nextCorpus = {
    ...corpus,
    baseline: createBaselineMetadata(context, revision, options.capturedAt),
    cases: corpus.cases.map((caseDefinition) => ({
      ...caseDefinition,
      baselineV1: executeCase(caseDefinition, context).observation,
    })),
  };
  fs.writeFileSync(fixturePath, `${JSON.stringify(nextCorpus, null, 2)}\n`);
  return nextCorpus;
}

function normalizeComparableValue(value) {
  return String(value ?? "").trim().toLocaleLowerCase().replace(/[._]+/g, "").replace(/[\s_]+/g, "-");
}

function getFieldValue(record, field) {
  return String(field).split(".").reduce((value, key) => value?.[key], record);
}

function constraintMatches(record, constraint) {
  const actual = getFieldValue(record, constraint.field);
  const expected = constraint.value;
  const normalize = normalizeComparableValue;
  switch (constraint.operator) {
    case "equals":
      return actual !== undefined && normalize(actual) === normalize(expected);
    case "includes":
      return Array.isArray(actual) && actual.some((value) => normalize(value) === normalize(expected));
    case "excludes":
      return Array.isArray(actual) && !actual.some((value) => normalize(value) === normalize(expected));
    case "atMost":
      return Number.isFinite(Number(actual)) && Number(actual) <= Number(expected);
    case "atLeast":
      return Number.isFinite(Number(actual)) && Number(actual) >= Number(expected);
    case "between":
      return Number.isFinite(Number(actual)) && Number(actual) >= Number(expected[0]) && Number(actual) <= Number(expected[1]);
    default:
      return false;
  }
}

function getExplicitLinks(show) {
  return Array.isArray(show?.entityLinks) ? show.entityLinks : [];
}

function evaluateEvidenceItem(item, caseDefinition, execution, context) {
  const first = execution.results[0];
  if (!first) return false;
  if (item.kind === "title_identity") {
    const titleMatch = normalizeComparableValue(archiveSearch.normalizeText(first.title)) === normalizeComparableValue(archiveSearch.normalizeText(caseDefinition.query));
    return titleMatch && first.searchMatchTier === 5;
  }
  if (item.kind === "alias_identity") {
    const aliases = Array.isArray(first.aliases) ? first.aliases : [];
    const query = archiveSearch.normalizeText(caseDefinition.query);
    return aliases.some((alias) => archiveSearch.normalizeText(alias) === query) && first.searchMatchTier >= 4;
  }
  if (item.kind === "catalogue_field") {
    const source = context.showsById.get(first.id) || first;
    const values = getFieldValue(source, item.field);
    const fieldValues = Array.isArray(values) ? values : [values];
    const fieldMatch = fieldValues.some((value) => normalizeComparableValue(value) === normalizeComparableValue(item.value));
    const explanation = normalizeComparableValue(`${(first.reasons || []).join(" ")} ${first.searchPresentation?.metaText || ""}`);
    return fieldMatch && explanation.includes(normalizeComparableValue(item.value));
  }
  if (item.kind === "typed_relationship") {
    const source = context.showsById.get(first.id);
    const entity = context.entitiesById.get(item.entityId);
    const linked = getExplicitLinks(source).some((link) => link.entityId === item.entityId && (!item.role || link.role === item.role));
    const explanation = `${(first.reasons || []).join(" ")} ${first.searchPresentation?.metaText || ""}`.toLocaleLowerCase();
    return Boolean(linked && entity && explanation.includes(String(entity.name || "").toLocaleLowerCase()));
  }
  if (item.kind === "authored_similarity") {
    const source = context.showsById.get(first.id) || first;
    const seed = context.showsById.get(item.seedShowId);
    const linked = Array.isArray(source.similarTo) && source.similarTo.includes(item.seedShowId);
    const reverseLinked = Array.isArray(seed?.similarTo) && seed.similarTo.includes(first.id);
    const explanation = `${(first.reasons || []).join(" ")} ${first.searchPresentation?.metaText || ""}`.toLocaleLowerCase();
    return Boolean((linked || reverseLinked) && seed && explanation.includes(String(seed.title).toLocaleLowerCase()));
  }
  return false;
}

function evaluateSupportedAssertion(key, spec, caseDefinition, execution, context) {
  const results = execution.results;
  const topIds = results.slice(0, spec.k || 5).map((result) => result.id);
  if (key === "identityFirst") {
    return { metric: "exactIdentityAt1", passed: execution.observation.topIds[0] === spec.showId, actual: execution.observation.topIds[0] || null, expected: spec.showId };
  }
  if (key === "acceptableTopK") {
    const matchedIds = topIds.filter((id) => spec.ids.includes(id));
    return { metric: "acceptableRecallAtK", passed: matchedIds.length > 0, matchedIds, expectedAnyOf: spec.ids, k: spec.k };
  }
  if (key === "prohibitedTopK") {
    const prohibited = topIds.filter((id) => spec.ids.includes(id));
    return { metric: "prohibitedResultsAtK", passed: prohibited.length === 0, prohibitedIds: prohibited, k: spec.k };
  }
  if (key === "hardConstraints") {
    const checked = results.slice(0, spec.k || 5);
    const violations = checked.filter((result) => !spec.all.every((constraint) => constraintMatches(context.showsById.get(result.id) || result, constraint))).map((result) => result.id);
    return { metric: "hardConstraintViolationsAtK", passed: violations.length === 0, checkedResults: checked.length, violations, k: spec.k };
  }
  if (key === "queryShapeV1") {
    const actual = execution.observation.queryShape;
    const passed = actual?.queryKind === spec.queryKind && actual?.structuredClauseGroup === spec.structuredClauseGroup;
    return { metric: "v1IntentRecognition", passed, actual, expected: { queryKind: spec.queryKind, structuredClauseGroup: spec.structuredClauseGroup } };
  }
  if (key === "routeRecognition") {
    const passed = caseDefinition.surface === spec.surface;
    return { metric: "routeRecognition", passed, actual: caseDefinition.surface, expected: spec.surface };
  }
  if (key === "entityEvidenceV1") {
    const candidateIds = results.slice(0, spec.k || 5).map((result) => result.id);
    const allowed = new Set(spec.acceptableShowIds);
    const matchedIds = candidateIds.filter((showId) => allowed.has(showId) && getExplicitLinks(context.showsById.get(showId)).some((link) => link.entityId === spec.entityId && (!spec.role || link.role === spec.role)));
    return { metric: "typedEntityEvidenceV1", passed: matchedIds.length > 0, matchedIds, entityId: spec.entityId, role: spec.role || null, k: spec.k };
  }
  if (key === "explanationEvidenceV1") {
    const checks = spec.required.map((item) => ({ kind: item.kind, passed: evaluateEvidenceItem(item, caseDefinition, execution, context) }));
    return { metric: "explanationEvidence", passed: checks.every((check) => check.passed), checks, resultId: results[0]?.id || null };
  }
  return { metric: key, passed: false, error: "No evaluator is registered for this assertion." };
}

function getDiscoveryIds(result, surface) {
  if (surface === "collections-search") return result.sections.collections.map((entry) => entry.id);
  return result.candidateIds;
}

function discoveryProjection(result) {
  return {
    version: result.version,
    kind: result.intent.kind,
    identity: result.intent.identity,
    required: result.intent.required,
    preferred: result.intent.preferred,
    avoid: result.intent.avoid,
    unresolvedPhrases: result.unresolvedPhrases,
    ambiguities: result.ambiguities,
    outcome: result.outcome,
    candidateIds: result.candidateIds.slice(0, 10),
    candidateSections: Object.fromEntries(Object.entries(result.sections).map(([name, entries]) => [name, entries.slice(0, 10).map((entry) => entry.id)])),
    applied: result.applied,
    limitations: result.limitations.map((entry) => ({ code: entry.code, field: entry.field || null, phrase: entry.phrase || null })),
    retrievalMode: result.retrievalTrace.mode,
  };
}

function expectedCriteriaMatch(intent, expected, group, checks) {
  const fieldMap = {
    genres: "genreIds", formats: "formatIds", tones: "toneIds", tags: "tagIds", themes: "themeIds",
    bestFor: "bestForIds", completionStatus: "catalogueStatusIds", releaseStatus: "releaseStatusIds", commitment: "commitmentIds",
  };
  for (const [field, values] of Object.entries(expected || {})) {
    if (field === "totalHoursTarget") {
      checks.push({ field: `${group}.runtimeTargetHours`, passed: stableJson(intent[group]?.runtimeTargetHours) === stableJson(values) });
      continue;
    }
    const actual = intent[group]?.[fieldMap[field]] || [];
    for (const value of values) checks.push({ field: `${group}.${field}`, value, passed: actual.includes(value) });
  }
}

function evaluateDiscoveryAssertion(key, spec, caseDefinition, execution, context) {
  const result = execution.discovery;
  const intent = result.intent;
  const ids = getDiscoveryIds(result, caseDefinition.surface);
  if (key === "intent") {
    const expected = spec.expected || {};
    const checks = [];
    const add = (field, passed, actual, wanted) => checks.push({ field, passed, actual, expected: wanted });
    const expectedKinds = expected.kind === "bounded-typo-or-prefix" ? ["bounded-typo-or-prefix", "bounded-typo"]
      : expected.kind === "bounded-typo" ? ["bounded-typo"]
        : [expected.kind];
    add("kind", expectedKinds.includes(intent.kind), intent.kind, expected.kind);
    const identityShowId = intent.identity?.kind === "show" ? intent.identity.id : intent.runtimeRequest?.showId || intent.entityResolution?.seedShowId || null;
    if (expected.showId !== undefined) add("showId", identityShowId === expected.showId, identityShowId, expected.showId);
    if (expected.seedShowId !== undefined) {
      const actual = intent.identity?.kind === "show" ? intent.identity.id : intent.entityResolution?.seedShowId || intent.collectionResolution?.anchorShowId;
      add("seedShowId", actual === expected.seedShowId, actual || null, expected.seedShowId);
    }
    if (expected.entityId !== undefined) add("entityId", intent.identity?.id === expected.entityId, intent.identity?.id || null, expected.entityId);
    if (expected.role !== undefined) add("role", intent.identity?.role === expected.role, intent.identity?.role || null, expected.role);
    if (expected.collectionId !== undefined) {
      const actual = intent.collectionResolution?.id || null;
      add("collectionId", actual === expected.collectionId, actual, expected.collectionId);
    }
    if (expected.matchedAlias !== undefined || expected.alias !== undefined) {
      const wanted = expected.matchedAlias || expected.alias;
      const actual = intent.identity?.match === "alias" ? intent.identity.matchedText : intent.identity?.matchedText;
      const phraseProvenance = (intent.provenance?.fields || []).some((entry) => archiveSearch.normalizeText(entry.phrase || "") === archiveSearch.normalizeText(wanted));
      add("alias", archiveSearch.normalizeText(actual || "") === archiveSearch.normalizeText(wanted) || phraseProvenance, actual || (phraseProvenance ? wanted : null), wanted);
    }
    if (expected.commonArticleOmitted !== undefined) add("commonArticleOmitted", Boolean(intent.identity?.commonArticleOmitted) === expected.commonArticleOmitted, Boolean(intent.identity?.commonArticleOmitted), expected.commonArticleOmitted);
    if (expected.required) expectedCriteriaMatch(intent, expected.required, "required", checks);
    if (expected.preferred) expectedCriteriaMatch(intent, expected.preferred, "preferred", checks);
    if (expected.avoid) expectedCriteriaMatch(intent, expected.avoid, "avoid", checks);
    if (expected.roles) {
      const actual = intent.entityResolution?.requestedRoles || [];
      checks.push(...expected.roles.map((role) => ({ field: "entityResolution.requestedRoles", value: role, passed: actual.includes(role) })));
    }
    if (expected.defaultInterpretation !== undefined) {
      const actual = intent.ambiguities.find((entry) => entry.phrase === "horror")?.defaultInterpretation || null;
      add("defaultInterpretation", actual === expected.defaultInterpretation, actual, expected.defaultInterpretation);
    }
    if (expected.fuzzyScope === "conservative") add("fuzzyScope", intent.identity?.match === "bounded-typo", intent.identity?.match || null, "bounded-typo");
    if (expected.seedExcluded) add("seedExcluded", !ids.includes(expected.seedShowId), ids.includes(expected.seedShowId), false);
    if (expected.unresolvedPhrases) checks.push(...expected.unresolvedPhrases.map((phrase) => ({ field: "unresolvedPhrases", value: phrase, passed: result.unresolvedPhrases.some((actual) => archiveSearch.normalizeText(actual).includes(archiveSearch.normalizeText(phrase))) })));
    if (expected.noOrdinalChaosClaim) add("noOrdinalChaosClaim", result.unresolvedPhrases.includes("less chaotic"), result.unresolvedPhrases, ["less chaotic"]);
    if (expected.noRelativeToneClaim) add("noRelativeToneClaim", result.unresolvedPhrases.includes("darker") && !intent.preferred.toneIds.includes("dark"), { unresolved: result.unresolvedPhrases, preferredTones: intent.preferred.toneIds }, "darker remains unresolved");
    if (expected.scope === "public-catalogue") add("publicScope", intent.surface === "show-search", intent.surface, "show-search");
    if (expected.scope === "local-only") add("localScope", intent.personalIntent?.scope === "local-only", intent.personalIntent?.scope || null, "local-only");
    if (expected.shareableUrl === false) add("privateIntentNotShareable", !(intent.url?.params || []).some((entry) => entry.name === "q"), intent.url?.params || [], "no query parameter");
    if (expected.serverRequest === false) add("noServerRequest", result.retrievalTrace.mode === "local-library-intent", result.retrievalTrace.mode, "local-library-intent");
    if (expected.requestedPrecision === "exact") add("requestedPrecision", intent.runtimeRequest?.precision === "exact", intent.runtimeRequest?.precision || null, "exact");
    if (expected.runtimeState === "unknown") {
      const runtime = result.sections.shows.find((entry) => entry.id === expected.showId)?.runtime;
      add("runtimeState", runtime?.kind === "unknown", runtime?.kind || null, "unknown");
    }
    if (expected.preserveObservedScope) {
      const runtime = result.sections.shows.find((entry) => entry.id === "red-valley")?.runtime;
      add("preserveObservedScope", runtime?.kind === "observed-exact" && /observed full-episode set/i.test(runtime.scope) && /completion is unclear/i.test(runtime.scope), runtime || null, "observed scope and completion qualification");
    }
    if (expected.preserveEstimateQualifier) {
      const runtime = result.sections.shows.find((entry) => entry.id === "midnight-burger")?.runtime;
      add("preserveEstimateQualifier", runtime?.kind === "derived-estimate" && /estimated/i.test(runtime.scope), runtime || null, "qualified derived estimate");
    }
    if (expected.unknownRuntime === "retain-qualified-after-known-values") {
      const runtimes = result.sections.shows.map((entry) => entry.runtime);
      const unknownIndex = runtimes.findIndex((runtime) => runtime?.kind === "unknown");
      const knownAfterUnknown = unknownIndex >= 0 && runtimes.slice(unknownIndex + 1).some((runtime) => runtime && runtime.kind !== "unknown");
      add("unknownRuntimeOrdering", !knownAfterUnknown, runtimes.map((runtime) => runtime?.kind), "known before unknown");
    }
    if (expected.evidencePolicy === "no-fabricated-precision") add("evidencePolicy", !result.sections.authoredSimilarity.some((entry) => entry.id === expected.seedShowId) && !result.sections.computedSimilarity.some((entry) => entry.id === expected.seedShowId), ids, "seed excluded from recommendations");
    if (expected.lexicalTitleMatchIsNotSufficient) add("contextEvidence", result.sections.shows.slice(0, 5).every((entry) => entry.evidence.some((item) => item.field === "bestFor" && item.value === "long-walks")), result.sections.shows.slice(0, 5).map((entry) => entry.evidence), "bestFor evidence in the preferred top results");
    if (expected.alternatives) {
      const ambiguity = intent.ambiguities.find((entry) => entry.phrase === expected.phrase);
      const actual = (ambiguity?.alternatives || []).map((entry) => entry.kind);
      const passed = expected.alternatives.every((entry) => actual.includes(entry.kind));
      checks.push({ field: "ambiguity.alternatives", passed, actual, expected: expected.alternatives.map((entry) => entry.kind) });
    }
    const failed = checks.filter((check) => !check.passed);
    return { metric: "discoveryIntent", passed: failed.length === 0, checks, failed: failed.length };
  }
  if (key === "seedResolution") {
    const actual = intent.identity?.kind === "show" ? intent.identity.id : intent.entityResolution?.seedShowId;
    return { metric: "seedResolutionV2", passed: actual === spec.showId, actual: actual || null, expected: spec.showId };
  }
  if (key === "entityResolution") {
    const resolution = intent.entityResolution || {};
    const actualIds = resolution.entityIds || [];
    const passed = resolution.kind === spec.kind && resolution.seedShowId === spec.seedShowId && stableJson([...actualIds].sort()) === stableJson([...spec.entityIds].sort()) && resolution.evidenceSource === spec.evidenceSource && (resolution.relationships || []).every((entry) => entry.role === spec.relationshipRole);
    return { metric: "typedEntityResolutionV2", passed, kind: resolution.kind || null, seedShowId: resolution.seedShowId || null, entityIds: actualIds, relationshipRoles: (resolution.relationships || []).map((entry) => entry.role), evidenceSource: resolution.evidenceSource || null };
  }
  if (key === "acceptableTopK") {
    const matchedIds = ids.slice(0, spec.k).filter((id) => spec.ids.includes(id));
    return { metric: "discoveryAcceptableRecallAtK", passed: matchedIds.length > 0, matchedIds, expectedAnyOf: spec.ids, k: spec.k };
  }
  if (key === "prohibitedTopK") {
    const prohibitedIds = ids.slice(0, spec.k).filter((id) => spec.ids.includes(id));
    return { metric: "discoveryProhibitedResultsAtK", passed: prohibitedIds.length === 0, prohibitedIds, k: spec.k };
  }
  if (key === "hardConstraints") {
    const checkedIds = ids.slice(0, spec.k);
    const violations = checkedIds.filter((id) => {
      const show = context.showsById.get(id);
      return !show || !spec.all.every((constraint) => constraintMatches(show, constraint));
    });
    return { metric: "discoveryHardConstraintViolationsAtK", passed: violations.length === 0, checkedResults: checkedIds.length, violations, k: spec.k };
  }
  if (key === "routeRecognition") {
    const actual = intent.kind === "personal-library-status" ? "local-library" : caseDefinition.surface;
    return { metric: "discoveryRouteRecognition", passed: actual === spec.surface, actual, expected: spec.surface };
  }
  if (key === "ambiguity") {
    const ambiguity = intent.ambiguities.find((entry) => entry.resolution === spec.resolution);
    const actualKinds = ambiguity?.alternatives.map((entry) => entry.kind) || [];
    const passed = Boolean(ambiguity) && spec.acceptableInterpretations.every((entry) => actualKinds.includes(entry.kind));
    return { metric: "discoveryAmbiguityHandling", passed, phrase: ambiguity?.phrase || null, actualKinds, expectedKinds: spec.acceptableInterpretations.map((entry) => entry.kind), resolution: ambiguity?.resolution || null };
  }
  if (key === "unresolvedPhrases") {
    const actual = result.unresolvedPhrases;
    const missing = spec.phrases.filter((phrase) => !actual.some((value) => archiveSearch.normalizeText(value).includes(archiveSearch.normalizeText(phrase))));
    return { metric: "discoveryUnresolvedPhrases", passed: missing.length === 0, actual, expected: spec.phrases, missing };
  }
  if (key === "sparseOutcome") {
    const runtimes = result.sections.shows.map((entry) => entry.runtime);
    const hasUnknownRuntime = runtimes.some((runtime) => runtime?.kind === "unknown");
    const hasKnownRuntime = runtimes.some((runtime) => runtime && runtime.kind !== "unknown");
    const states = new Set();
    if (intent.runtimeRequest && runtimes.some((runtime) => runtime?.kind === "unknown")) states.add("explicit-unknown");
    if (result.limitations.length) states.add("limited-evidence");
    if (result.outcome === "no-results") states.add("strict-empty");
    if (result.unresolvedPhrases.length) states.add("unresolved");
    if (result.unresolvedPhrases.includes("one season long")) states.add("unresolved-runtime-phrase");
    if (hasKnownRuntime && hasUnknownRuntime && runtimes.findIndex((runtime) => runtime?.kind === "unknown") > runtimes.findIndex((runtime) => runtime && runtime.kind !== "unknown")) states.add("unknown-after-known-with-label");
    if (hasKnownRuntime && !hasUnknownRuntime) states.add("known-ranked-with-qualifier");
    const matched = spec.allowed.filter((allowed) => states.has(allowed));
    return { metric: "discoverySparseOutcome", passed: matched.length > 0, outcome: result.outcome, matched, allowed: spec.allowed, limitations: result.limitations.map((entry) => entry.code) };
  }
  return { metric: key, passed: false, error: "No Discovery 2.0 evaluator is registered for this assertion." };
}

function evaluateTarget(caseDefinition, execution, context) {
  const target = caseDefinition.target || {};
  return ASSERTION_KEYS.flatMap((key) => {
    const spec = target[key];
    if (!spec) return [];
    if (!SUPPORT_STATES.has(spec.support)) {
      return [{ key, metric: key, status: "invalid-support", passed: false, error: `support must be one of ${[...SUPPORT_STATES].join(", ")}` }];
    }
    const evaluation = spec.support === "discovery-v2"
      ? evaluateDiscoveryAssertion(key, spec, caseDefinition, execution, context)
      : evaluateSupportedAssertion(key, spec, caseDefinition, execution, context);
    return [{ key, ...evaluation, status: evaluation.passed ? "pass" : "fail" }];
  });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateConstraint(constraint, label, errors) {
  if (!constraint || typeof constraint !== "object" || Array.isArray(constraint)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if (!CONSTRAINT_FIELDS.has(constraint.field)) errors.push(`${label}.field is unsupported: ${String(constraint.field)}.`);
  const validOperators = new Set(["equals", "includes", "excludes", "atMost", "atLeast", "between"]);
  if (!validOperators.has(constraint.operator)) errors.push(`${label}.operator is invalid.`);
  if (constraint.operator === "between") {
    if (!Array.isArray(constraint.value) || constraint.value.length !== 2 || constraint.value.some((value) => !Number.isFinite(Number(value)))) {
      errors.push(`${label}.value must be a numeric [minimum, maximum] pair.`);
    }
  } else if (constraint.value === undefined || constraint.value === null || (typeof constraint.value === "string" && !constraint.value.trim())) {
    errors.push(`${label}.value is required.`);
  }
}

function validateTarget(caseDefinition, context, errors) {
  const target = caseDefinition.target;
  if (target === undefined) return;
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    errors.push(`Case ${caseDefinition.id}: target must be an object.`);
    return;
  }
  Object.keys(target).forEach((key) => {
    if (!ASSERTION_KEYS.includes(key)) errors.push(`Case ${caseDefinition.id}: unknown target assertion ${key}.`);
  });
  for (const key of ASSERTION_KEYS) {
    const spec = target[key];
    if (!spec) continue;
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      errors.push(`Case ${caseDefinition.id}: target.${key} must be an object.`);
      continue;
    }
    if (!SUPPORT_STATES.has(spec.support)) errors.push(`Case ${caseDefinition.id}: target.${key}.support must be current-v1 or discovery-v2.`);
    if (["identityFirst", "seedResolution"].includes(key) && spec.showId && !context.showIds.has(spec.showId)) errors.push(`Case ${caseDefinition.id}: unknown show ID ${spec.showId} in target.${key}.`);
    if (key === "identityFirst" && !spec.showId) errors.push(`Case ${caseDefinition.id}: target.identityFirst.showId is required.`);
    if (key === "intent" && (!spec.expected || typeof spec.expected !== "object" || Array.isArray(spec.expected))) errors.push(`Case ${caseDefinition.id}: target.intent.expected must be a structured object.`);
    if (key === "intent" && spec.expected && typeof spec.expected === "object") validateIntentReferences(spec.expected, `Case ${caseDefinition.id}: target.intent.expected`, context, errors);
    if (["acceptableTopK", "prohibitedTopK"].includes(key)) {
      if (!Array.isArray(spec.ids) || spec.ids.length === 0) errors.push(`Case ${caseDefinition.id}: target.${key}.ids must be a non-empty array.`);
      else spec.ids.forEach((id) => {
        const valid = caseDefinition.surface === "collections-search" ? context.collectionIds.has(id) : context.showIds.has(id);
        if (!valid) errors.push(`Case ${caseDefinition.id}: unknown ${caseDefinition.surface === "collections-search" ? "collection" : "show"} ID ${id} in target.${key}.`);
      });
      if (!Number.isInteger(spec.k) || spec.k < 1) errors.push(`Case ${caseDefinition.id}: target.${key}.k must be a positive integer.`);
    }
    if (key === "hardConstraints") {
      if (!Array.isArray(spec.all) || spec.all.length === 0) errors.push(`Case ${caseDefinition.id}: target.hardConstraints.all must be a non-empty array.`);
      else spec.all.forEach((constraint, index) => validateConstraint(constraint, `Case ${caseDefinition.id}: target.hardConstraints.all[${index}]`, errors));
      if (!Number.isInteger(spec.k) || spec.k < 1) errors.push(`Case ${caseDefinition.id}: target.hardConstraints.k must be a positive integer.`);
    }
    if (key === "queryShapeV1" && (!spec.queryKind || !spec.structuredClauseGroup)) errors.push(`Case ${caseDefinition.id}: target.queryShapeV1 needs queryKind and structuredClauseGroup.`);
    if (key === "routeRecognition") {
      if (spec.support === "current-v1" && !SURFACES.has(spec.surface)) errors.push(`Case ${caseDefinition.id}: target.routeRecognition.surface is invalid for the current v1 evaluator.`);
      if (spec.support === "discovery-v2" && (typeof spec.surface !== "string" || !spec.surface.trim())) errors.push(`Case ${caseDefinition.id}: discovery-v2 target.routeRecognition.surface must be a non-empty string.`);
    }
    if (key === "entityEvidenceV1") {
      if (!context.entityIds.has(spec.entityId)) errors.push(`Case ${caseDefinition.id}: unknown entity ID ${spec.entityId} in target.entityEvidenceV1.`);
      if (!Array.isArray(spec.acceptableShowIds) || spec.acceptableShowIds.length === 0) errors.push(`Case ${caseDefinition.id}: target.entityEvidenceV1.acceptableShowIds must be non-empty.`);
      else spec.acceptableShowIds.forEach((id) => { if (!context.showIds.has(id)) errors.push(`Case ${caseDefinition.id}: unknown show ID ${id} in target.entityEvidenceV1.`); });
      if (!Number.isInteger(spec.k) || spec.k < 1) errors.push(`Case ${caseDefinition.id}: target.entityEvidenceV1.k must be a positive integer.`);
    }
    if (key === "explanationEvidenceV1") {
      if (!Array.isArray(spec.required) || spec.required.length === 0) errors.push(`Case ${caseDefinition.id}: target.explanationEvidenceV1.required must be non-empty.`);
      else spec.required.forEach((item, index) => {
        const label = `Case ${caseDefinition.id}: target.explanationEvidenceV1.required[${index}]`;
        if (!item || !["title_identity", "alias_identity", "catalogue_field", "typed_relationship", "authored_similarity"].includes(item.kind)) errors.push(`${label}.kind is invalid.`);
        if (item?.kind === "catalogue_field" && (!CONSTRAINT_FIELDS.has(item.field) || item.value === undefined)) errors.push(`${label} needs a supported field and value.`);
        if (item?.kind === "typed_relationship" && !context.entityIds.has(item.entityId)) errors.push(`${label} references unknown entity ID ${item.entityId}.`);
        if (item?.kind === "authored_similarity" && !context.showIds.has(item.seedShowId)) errors.push(`${label} references unknown seed show ID ${item.seedShowId}.`);
      });
    }
    if (key === "seedResolution" && spec.showId && !context.showIds.has(spec.showId)) errors.push(`Case ${caseDefinition.id}: unknown seed show ID ${spec.showId}.`);
    if (key === "entityResolution" && spec.entityId && !context.entityIds.has(spec.entityId)) errors.push(`Case ${caseDefinition.id}: unknown entity ID ${spec.entityId}.`);
    if (key === "entityResolution" && Array.isArray(spec.entityIds)) spec.entityIds.forEach((id) => { if (!context.entityIds.has(id)) errors.push(`Case ${caseDefinition.id}: unknown entity ID ${id}.`); });
    if (key === "entityResolution" && spec.seedShowId && !context.showIds.has(spec.seedShowId)) errors.push(`Case ${caseDefinition.id}: unknown seed show ID ${spec.seedShowId} in target.entityResolution.`);
    if (key === "ambiguity") {
      if (!Array.isArray(spec.acceptableInterpretations) || spec.acceptableInterpretations.length < 2) errors.push(`Case ${caseDefinition.id}: target.ambiguity.acceptableInterpretations must contain at least two alternatives.`);
      else spec.acceptableInterpretations.forEach((alternative, index) => {
        if (!alternative || typeof alternative !== "object" || typeof alternative.kind !== "string" || !alternative.kind.trim()) errors.push(`Case ${caseDefinition.id}: target.ambiguity.acceptableInterpretations[${index}] must identify an interpretation kind.`);
      });
    }
    if (key === "unresolvedPhrases" && (!Array.isArray(spec.phrases) || spec.phrases.length === 0 || spec.phrases.some((phrase) => typeof phrase !== "string" || !phrase.trim()))) errors.push(`Case ${caseDefinition.id}: target.unresolvedPhrases.phrases must be a non-empty array of non-empty strings.`);
    if (key === "sparseOutcome" && (!Array.isArray(spec.allowed) || spec.allowed.length === 0)) errors.push(`Case ${caseDefinition.id}: target.sparseOutcome.allowed must be non-empty.`);
  }
}

function validateIntentReferences(value, label, context, errors) {
  if (Array.isArray(value)) {
    value.forEach((entry) => validateIntentReferences(entry, label, context, errors));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, child]) => {
    if (["showId", "seedShowId", "identityId", "acceptableSiblingId"].includes(key) && typeof child === "string" && !context.showIds.has(child)) {
      errors.push(`${label} references unknown show ID ${child}.`);
    } else if (key === "collectionId" && typeof child === "string" && !context.collectionIds.has(child)) {
      errors.push(`${label} references unknown collection ID ${child}.`);
    } else if (key === "entityId" && typeof child === "string" && !context.entityIds.has(child)) {
      errors.push(`${label} references unknown entity ID ${child}.`);
    } else if (key === "entityIds" && Array.isArray(child)) {
      child.forEach((entityId) => { if (!context.entityIds.has(entityId)) errors.push(`${label} references unknown entity ID ${entityId}.`); });
    }
    validateIntentReferences(child, label, context, errors);
  });
}

function validateRuntimeEvidence(caseDefinition, context, errors) {
  const evidence = caseDefinition.runtimeEvidence;
  if (evidence === undefined) return;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push(`Case ${caseDefinition.id}: runtimeEvidence must be an object.`);
    return;
  }
  const allowedKinds = new Set(["known-exact", "observed-exact", "derived-estimate", "unsupported-ambiguity", "unknown"]);
  if (!allowedKinds.has(evidence.kind)) errors.push(`Case ${caseDefinition.id}: runtimeEvidence.kind is invalid.`);
  if (!String(evidence.rationale || "").trim()) errors.push(`Case ${caseDefinition.id}: runtimeEvidence.rationale is required.`);
  if (evidence.kind === "unsupported-ambiguity") {
    if (!String(evidence.queryPhrase || "").trim()) errors.push(`Case ${caseDefinition.id}: unsupported-ambiguity runtime evidence needs queryPhrase.`);
    else if (!caseDefinition.query.toLocaleLowerCase().includes(String(evidence.queryPhrase).toLocaleLowerCase())) errors.push(`Case ${caseDefinition.id}: runtimeEvidence.queryPhrase must occur in the case query.`);
    return;
  }
  if (!context.showIds.has(evidence.showId)) {
    errors.push(`Case ${caseDefinition.id}: runtimeEvidence must reference an existing show ID.`);
    return;
  }
  const show = context.showsById.get(evidence.showId);
  if ((evidence.kind === "known-exact" || evidence.kind === "observed-exact") && !Number.isFinite(show?.length?.totalHours)) {
    errors.push(`Case ${caseDefinition.id}: exact runtime evidence needs a numeric length.totalHours value.`);
  }
  if (evidence.kind === "known-exact" && show?.length?.durationCoverage !== 1) errors.push(`Case ${caseDefinition.id}: known-exact runtime requires complete duration coverage for its stated scope.`);
  if (evidence.kind === "known-exact" && !String(evidence.scope || "").toLocaleLowerCase().includes("observed")) errors.push(`Case ${caseDefinition.id}: known-exact runtime must state its observed scope.`);
  if (evidence.kind === "derived-estimate") {
    const calculated = Number(show?.length?.episodes) * Number(show?.length?.avgEpisodeMinutes) / 60;
    if (!Number.isFinite(show?.length?.totalHours) || !Number.isFinite(calculated) || Math.round(calculated * 10) / 10 !== Number(show?.length?.totalHours)) {
      errors.push(`Case ${caseDefinition.id}: derived-estimate does not match episode count × average episode minutes.`);
    }
    if (!(show?.metadata?.researchGaps || []).some((gap) => /runtime/i.test(gap))) errors.push(`Case ${caseDefinition.id}: derived-estimate needs a catalogue runtime research gap or qualifier.`);
  }
  if (evidence.kind === "unknown" && Number.isFinite(show?.length?.totalHours)) {
    errors.push(`Case ${caseDefinition.id}: runtime is marked unknown but the show has length.totalHours.`);
  }
  if (evidence.hours !== undefined && Number(evidence.hours) !== Number(show?.length?.totalHours)) errors.push(`Case ${caseDefinition.id}: runtimeEvidence.hours disagrees with the catalogue.`);
}

function validateCorpus(corpus, context, options = {}) {
  const errors = [];
  if (!corpus || typeof corpus !== "object" || Array.isArray(corpus)) return ["Corpus root must be an object."];
  if (corpus.schemaVersion !== FIXTURE_VERSION) errors.push(`schemaVersion must be ${FIXTURE_VERSION}.`);
  if (typeof corpus.corpusVersion !== "string" || !corpus.corpusVersion.trim()) errors.push("corpusVersion must be a non-empty string.");
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) errors.push("cases must be a non-empty array.");
  const ids = new Set();
  (Array.isArray(corpus.cases) ? corpus.cases : []).forEach((caseDefinition, index) => {
    const label = `Case ${index + 1}`;
    if (!caseDefinition || typeof caseDefinition !== "object" || Array.isArray(caseDefinition)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    if (typeof caseDefinition.id !== "string" || !caseDefinition.id.trim()) errors.push(`${label}.id is required.`);
    else if (ids.has(caseDefinition.id)) errors.push(`Duplicate case ID ${caseDefinition.id}.`);
    else ids.add(caseDefinition.id);
    if (typeof caseDefinition.family !== "string" || !caseDefinition.family.trim()) errors.push(`${label}.family is required.`);
    if (!SURFACES.has(caseDefinition.surface)) errors.push(`${label}.surface must be show-search or collections-search.`);
    if (typeof caseDefinition.query !== "string" || !caseDefinition.query.trim()) errors.push(`${label}.query must be a non-empty string.`);
    if (caseDefinition.catalogueRevision !== "baseline-v1") errors.push(`${label}.catalogueRevision must reference baseline-v1.`);
    if (typeof caseDefinition.rationale !== "string" || !caseDefinition.rationale.trim()) errors.push(`${label}.rationale is required.`);
    if (!options.captureMode && options.requireBaseline !== false) {
      const observation = caseDefinition.baselineV1;
      if (!observation || typeof observation !== "object") errors.push(`Case ${caseDefinition.id || index + 1} is missing baselineV1.`);
      else {
        if (!Number.isInteger(observation.resultCount) || observation.resultCount < 0) errors.push(`Case ${caseDefinition.id}: baselineV1.resultCount must be a non-negative integer.`);
        if (!Array.isArray(observation.topIds) || observation.topIds.length > 5) errors.push(`Case ${caseDefinition.id}: baselineV1.topIds must contain at most five IDs.`);
        else observation.topIds.forEach((id) => {
          const valid = caseDefinition.surface === "collections-search" ? context.collectionIds.has(id) : context.showIds.has(id);
          if (!valid) errors.push(`Case ${caseDefinition.id}: baselineV1 contains unknown result ID ${id}.`);
        });
        if (caseDefinition.surface === "show-search" && (!observation.queryShape || observation.topEvidence === undefined)) errors.push(`Case ${caseDefinition.id}: show-search baseline needs queryShape and topEvidence.`);
        if (caseDefinition.surface === "collections-search" && (observation.queryShape !== undefined || observation.topEvidence !== undefined)) errors.push(`Case ${caseDefinition.id}: collections-search baseline must not claim homepage search evidence.`);
      }
    }
    validateTarget(caseDefinition, context, errors);
    validateRuntimeEvidence(caseDefinition, context, errors);
  });
  if (options.requireBaseline !== false && !options.captureMode) {
    if (!corpus.baseline || typeof corpus.baseline !== "object") errors.push("baseline metadata is missing.");
    else if (!/^[a-f0-9]{64}$/.test(corpus.baseline.catalogueFingerprint || "")) errors.push("baseline.catalogueFingerprint must be a SHA-256 hex digest.");
  }
  return errors;
}

function baselineComparison(caseDefinition, currentObservation) {
  if (!caseDefinition.baselineV1) return { status: "not-captured", changedFields: [] };
  const expected = caseDefinition.baselineV1;
  const keys = ["resultCount", "topIds", "queryShape", "topEvidence"];
  const changedFields = keys.filter((key) => stableJson(expected[key]) !== stableJson(currentObservation[key]));
  return { status: changedFields.length ? "changed" : "match", changedFields };
}

function validateTargetContract(targetContract, corpus, context) {
  if (targetContract === null || targetContract === undefined) return [];
  const errors = [];
  if (!targetContract || typeof targetContract !== "object" || Array.isArray(targetContract)) return ["Target contract root must be an object."];
  if (targetContract.schemaVersion !== 1) errors.push("Target contract schemaVersion must be 1.");
  if (typeof targetContract.targetVersion !== "string" || !targetContract.targetVersion.trim()) errors.push("Target contract targetVersion is required.");
  if (!targetContract.cases || typeof targetContract.cases !== "object" || Array.isArray(targetContract.cases)) errors.push("Target contract cases must be an object keyed by corpus case ID.");
  const caseIds = new Set(corpus.cases.map((caseDefinition) => caseDefinition.id));
  Object.entries(targetContract.cases || {}).forEach(([caseId, target]) => {
    if (!caseIds.has(caseId)) errors.push(`Target contract references unknown case ID ${caseId}.`);
    const definition = corpus.cases.find((caseDefinition) => caseDefinition.id === caseId);
    if (definition) validateTarget({ ...definition, target }, context, errors);
  });
  if (targetContract.runtimeEvidence !== undefined && (!targetContract.runtimeEvidence || typeof targetContract.runtimeEvidence !== "object" || Array.isArray(targetContract.runtimeEvidence))) {
    errors.push("Target contract runtimeEvidence must be an object keyed by corpus case ID.");
  }
  Object.entries(targetContract.runtimeEvidence || {}).forEach(([caseId, runtimeEvidence]) => {
    const definition = corpus.cases.find((caseDefinition) => caseDefinition.id === caseId);
    if (!definition) errors.push(`Runtime evidence references unknown case ID ${caseId}.`);
    else validateRuntimeEvidence({ ...definition, runtimeEvidence }, context, errors);
  });
  if (targetContract.implementationReview !== undefined) {
    const review = targetContract.implementationReview;
    if (!review || typeof review !== "object" || Array.isArray(review)) errors.push("Target contract implementationReview must be an object.");
    else {
      const categories = ["nowSupported", "intentionallyUnresolvedOrAmbiguous", "deferredForCatalogueEvidence", "additionalRegressionAssertions"];
      categories.forEach((category) => {
        if (!Array.isArray(review[category]) || review[category].some((value) => typeof value !== "string" || !value.trim())) errors.push(`Target contract implementationReview.${category} must be an array of assertion references.`);
      });
      const discoveryAssertions = [];
      Object.entries(targetContract.cases || {}).forEach(([caseId, assertions]) => Object.entries(assertions || {}).forEach(([key, spec]) => {
        if (spec?.support === "discovery-v2") discoveryAssertions.push(`${caseId}:${key}`);
      }));
      const reviewed = categories.flatMap((category) => review[category] || []);
      const duplicates = reviewed.filter((value, index) => reviewed.indexOf(value) !== index);
      if (duplicates.length) errors.push(`Target contract implementationReview repeats assertion ${duplicates[0]}.`);
      const unknown = reviewed.filter((value) => !discoveryAssertions.includes(value));
      if (unknown.length) errors.push(`Target contract implementationReview references non-Discovery assertion ${unknown[0]}.`);
      const missing = discoveryAssertions.filter((value) => !reviewed.includes(value));
      if (missing.length) errors.push(`Target contract implementationReview does not classify ${missing[0]}.`);
      if (review.previouslyUnsupportedAssertions !== (review.nowSupported || []).length + (review.intentionallyUnresolvedOrAmbiguous || []).length + (review.deferredForCatalogueEvidence || []).length) {
        errors.push("Target contract implementationReview category counts do not match previouslyUnsupportedAssertions.");
      }
      if ((review.nowSupported || []).length + (review.intentionallyUnresolvedOrAmbiguous || []).length + (review.deferredForCatalogueEvidence || []).length !== review.previouslyUnsupportedAssertions) {
        errors.push("Target contract implementationReview must exclude additionalRegressionAssertions from the prior future-v2 total.");
      }
    }
  }
  return errors;
}

function buildBenchmarkReport(corpus, context, siteRoot, targetContract = null) {
  const targetErrors = validateTargetContract(targetContract, corpus, context);
  const targetCases = targetContract?.cases || {};
  const evaluatedCorpus = {
    ...corpus,
    cases: corpus.cases.map((caseDefinition) => ({
      ...caseDefinition,
      ...(targetCases[caseDefinition.id] ? { target: targetCases[caseDefinition.id] } : {}),
      ...(targetContract?.runtimeEvidence?.[caseDefinition.id] ? { runtimeEvidence: targetContract.runtimeEvidence[caseDefinition.id] } : {}),
    })),
  };
  const errors = [...validateCorpus(corpus, context), ...targetErrors];
  if (errors.length) throw new Error(`Invalid discovery benchmark fixture:\n- ${errors.join("\n- ")}`);
  const revision = computeCatalogueRevision(siteRoot);
  const catalogueDrift = revision.fingerprint !== corpus.baseline.catalogueFingerprint;
  const cases = evaluatedCorpus.cases.map((caseDefinition) => {
    const execution = executeCase(caseDefinition, context);
    return {
      id: caseDefinition.id,
      family: caseDefinition.family,
      surface: caseDefinition.surface,
      query: caseDefinition.query,
      current: execution.observation,
      discovery: discoveryProjection(execution.discovery),
      baseline: baselineComparison(caseDefinition, execution.observation),
      assertions: evaluateTarget(caseDefinition, execution, context),
      runtimeEvidence: caseDefinition.runtimeEvidence || null,
      rationale: caseDefinition.rationale,
    };
  });
  const assertions = cases.flatMap((entry) => entry.assertions.map((assertion) => ({ caseId: entry.id, ...assertion })));
  const metrics = {};
  assertions.forEach((assertion) => {
    const metric = assertion.metric || assertion.key;
    const entry = metrics[metric] || { checked: 0, passed: 0, failed: 0, unsupported: 0, violations: 0, checkedResults: 0 };
    if (assertion.status === "unsupported") entry.unsupported += 1;
    else if (assertion.status === "pass" || assertion.status === "fail") {
      entry.checked += 1;
      if (assertion.passed) entry.passed += 1;
      else entry.failed += 1;
      if (metric === "hardConstraintViolationsAtK") {
        entry.violations += assertion.violations.length;
        entry.checkedResults += assertion.checkedResults;
      }
    }
    metrics[metric] = entry;
  });
  const baselineChanges = cases.filter((entry) => entry.baseline.status === "changed");
  const legacyV1Defects = evaluatedCorpus.cases.flatMap((caseDefinition) => {
    if (caseDefinition.target?.hardConstraints?.support !== "discovery-v2") return [];
    const entry = cases.find((candidate) => candidate.id === caseDefinition.id);
    const spec = caseDefinition.target.hardConstraints;
    const v1Ids = entry.current.topIds.slice(0, spec.k);
    const v1Violations = v1Ids.filter((id) => !spec.all.every((constraint) => constraintMatches(context.showsById.get(id) || {}, constraint)));
    if (!v1Violations.length) return [];
    const discoveryIds = entry.discovery.candidateIds.slice(0, spec.k);
    const discoveryViolations = discoveryIds.filter((id) => !spec.all.every((constraint) => constraintMatches(context.showsById.get(id) || {}, constraint)));
    return [{ caseId: caseDefinition.id, v1TopIds: v1Ids, v1ViolationIds: v1Violations, discoveryTopIds: discoveryIds, discoveryViolationIds: discoveryViolations, fixedByDiscovery: discoveryViolations.length === 0 }];
  });
  const runtimeEvidenceClasses = {};
  cases.forEach((entry) => {
    const kind = entry.runtimeEvidence?.kind;
    if (kind) runtimeEvidenceClasses[kind] = (runtimeEvidenceClasses[kind] || 0) + 1;
  });
  const implementationReview = targetContract?.implementationReview ? {
    previouslyUnsupportedAssertions: targetContract.implementationReview.previouslyUnsupportedAssertions,
    nowSupported: targetContract.implementationReview.nowSupported.length,
    intentionallyUnresolvedOrAmbiguous: targetContract.implementationReview.intentionallyUnresolvedOrAmbiguous.length,
    deferredForCatalogueEvidence: targetContract.implementationReview.deferredForCatalogueEvidence.length,
    additionalRegressionAssertions: targetContract.implementationReview.additionalRegressionAssertions.length,
  } : null;
  return {
    reportVersion: 1,
    corpusVersion: corpus.corpusVersion,
    targetVersion: targetContract?.targetVersion || null,
    baseline: corpus.baseline,
    current: {
      implementationCommit: gitObjectId(siteRoot, "HEAD"),
      catalogueFingerprint: revision.fingerprint,
      catalogueDrift,
      counts: {
        publishedShows: context.shows.length,
        searchRecords: context.searchCatalog.length,
        runtimeCollections: context.collections.length,
        entities: context.entities.length,
      },
    },
    summary: {
      caseCount: cases.length,
      baselineUnchanged: cases.length - baselineChanges.length,
      baselineChanged: baselineChanges.length,
      supportedAssertions: assertions.filter((assertion) => assertion.status === "pass" || assertion.status === "fail").length,
      supportedFailures: assertions.filter((assertion) => assertion.status === "fail").length,
      futureUnsupported: assertions.filter((assertion) => assertion.status === "unsupported").length,
      legacyV1DefectsObserved: legacyV1Defects.length,
      discoveryV2Assertions: assertions.filter((assertion) => assertion.key && assertion.status !== "invalid-support" && (targetCases[assertion.caseId]?.[assertion.key]?.support === "discovery-v2")).length,
    },
    metrics,
    runtimeEvidenceClasses,
    implementationReview,
    legacyV1Defects,
    baselineChanges,
    cases,
  };
}

function formatDiscoveryBenchmarkReport(report) {
  const lines = [
    `Discovery golden-query benchmark ${report.corpusVersion}`,
    `Baseline implementation: ${report.baseline.implementationCommit || "unknown"}`,
    `Baseline catalogue: ${report.baseline.catalogueRevision}`,
    `Current catalogue: ${report.current.catalogueDrift ? "DRIFT — review fixture expectations" : "matches baseline"}`,
    `Catalogue scope: ${report.current.counts.publishedShows} shows, ${report.current.counts.runtimeCollections} runtime collections, ${report.current.counts.entities} entities.`,
    `Cases: ${report.summary.caseCount}; baseline observations unchanged=${report.summary.baselineUnchanged}, changed=${report.summary.baselineChanged}.`,
    `Target checks: supported=${report.summary.supportedAssertions}, failures=${report.summary.supportedFailures}, Discovery 2.0 assertions=${report.summary.discoveryV2Assertions}, unsupported=${report.summary.futureUnsupported}.`,
    `Legacy v1 defects retained as observations: ${report.summary.legacyV1DefectsObserved}; fixed by Discovery 2.0=${report.legacyV1Defects.filter((entry) => entry.fixedByDiscovery).length}.`,
    ...(report.implementationReview ? [`Review of ${report.implementationReview.previouslyUnsupportedAssertions} prior future assertions: now supported=${report.implementationReview.nowSupported}, intentionally unresolved/ambiguous=${report.implementationReview.intentionallyUnresolvedOrAmbiguous}, deferred for catalogue evidence=${report.implementationReview.deferredForCatalogueEvidence}; additional v1 regression checks=${report.implementationReview.additionalRegressionAssertions}.`] : []),
    "",
    "## Separate metrics",
  ];
  const metricLabels = [
    ["exactIdentityAt1", "Exact identity success@1"],
    ["acceptableRecallAtK", "Acceptable result recall@K"],
    ["prohibitedResultsAtK", "Prohibited IDs in top K"],
    ["prohibitedTopK", "v1 prohibited-ID assertion"],
    ["acceptableTopK", "v1 acceptable-result assertion"],
    ["hardConstraints", "v1 hard-constraint contract"],
    ["hardConstraintViolationsAtK", "Hard-constraint violations@K"],
    ["v1IntentRecognition", "v1 query-shape recognition"],
    ["routeRecognition", "Surface/route recognition"],
    ["typedEntityEvidenceV1", "Explicit typed entity retrieval"],
    ["explanationEvidence", "Explanation evidence correctness"],
    ["discoveryIntent", "Discovery 2.0 intent contract"],
    ["seedResolutionV2", "Discovery 2.0 seed resolution"],
    ["typedEntityResolutionV2", "Discovery 2.0 typed entity resolution"],
    ["discoveryRouteRecognition", "Discovery 2.0 route interpretation"],
    ["discoveryAcceptableRecallAtK", "Discovery 2.0 acceptable results@K"],
    ["discoveryProhibitedResultsAtK", "Discovery 2.0 prohibited results@K"],
    ["discoveryHardConstraintViolationsAtK", "Discovery 2.0 hard-constraint violations@K"],
    ["discoveryAmbiguityHandling", "Discovery 2.0 ambiguity representation"],
    ["discoveryUnresolvedPhrases", "Discovery 2.0 unresolved phrase preservation"],
    ["discoverySparseOutcome", "Discovery 2.0 sparse/no-match honesty"],
  ];
  metricLabels.forEach(([key, label]) => {
    const metric = report.metrics[key];
    if (!metric) return;
    if (key === "hardConstraintViolationsAtK") {
      lines.push(`- ${label}: ${metric.violations} violations among ${metric.checkedResults} returned results across ${metric.checked} checked cases (${metric.failed} failing cases).`);
    } else {
      lines.push(`- ${label}: ${metric.passed}/${metric.checked} pass; ${metric.failed} fail; ${metric.unsupported} unsupported.`);
    }
  });
  const failures = report.cases.flatMap((caseEntry) => caseEntry.assertions
    .filter((assertion) => assertion.status === "fail")
    .map((assertion) => {
      const offending = assertion.violations || assertion.prohibitedIds || [];
      return `- ${caseEntry.id}: ${assertion.key}${offending.length ? `; offending IDs=${offending.join(", ")}` : ""}`;
    }));
  if (failures.length) lines.push("", "## Supported assertion failures", ...failures.slice(0, 16));
  if (report.legacyV1Defects.length) {
    lines.push("", "## Frozen v1 constraint failures versus Discovery 2.0");
    report.legacyV1Defects.forEach((entry) => lines.push(`- ${entry.caseId}: v1 violating IDs=${entry.v1ViolationIds.join(", ") || "none"}; Discovery 2.0 top=${entry.discoveryTopIds.join(", ") || "(empty)"}; fixed=${entry.fixedByDiscovery}.`));
  }
  if (report.summary.futureUnsupported > 0) {
    lines.push("", "## Future 2.0 assertions not evaluated");
    const unsupported = report.cases.flatMap((caseEntry) => caseEntry.assertions
      .filter((assertion) => assertion.status === "unsupported")
      .map((assertion) => `- ${caseEntry.id}: ${assertion.key} — ${assertion.reason}`));
    lines.push(...unsupported.slice(0, 12));
    if (unsupported.length > 12) lines.push(`- ${unsupported.length - 12} additional unsupported assertions are listed with --json.`);
  }
  if (Object.keys(report.runtimeEvidenceClasses).length) {
    lines.push("", "## Runtime evidence classes");
    Object.entries(report.runtimeEvidenceClasses).sort(([left], [right]) => left.localeCompare(right)).forEach(([kind, count]) => lines.push(`- ${kind}: ${count}`));
    lines.push("- Exact and observed totals retain their stated scope; derived values remain estimates; unknown totals stay unknown.");
  }
  if (report.baselineChanges.length) {
    lines.push("", "## Differences from the frozen v1 observations");
    report.baselineChanges.slice(0, 16).forEach((entry) => lines.push(`- ${entry.id}: ${entry.baseline.changedFields.join(", ")}; current top=${entry.current.topIds.join(", ") || "(empty)"}`));
    if (report.baselineChanges.length > 16) lines.push(`- ${report.baselineChanges.length - 16} more changed cases are available with --json.`);
  }
  lines.push("", "Per case, the report shows no more than five result IDs. It preserves editorial, computed, collection, and typed-entity evidence as separate assertions.");
  return lines.join("\n");
}

module.exports = {
  ASSERTION_KEYS,
  buildBenchmarkReport,
  captureBaseline,
  computeCatalogueRevision,
  constraintMatches,
  evaluateEvidenceItem,
  evaluateTarget,
  executeCase,
  formatDiscoveryBenchmarkReport,
  getCollectionSearchText,
  readBenchmarkContext,
  validateTargetContract,
  validateCorpus,
};
