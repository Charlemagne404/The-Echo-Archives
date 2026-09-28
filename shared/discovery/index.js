(function (root, factory) {
  const dependencies = typeof module === "object" && module.exports
    ? {
        archiveSearch: require("../archive-search"),
        archiveSimilarity: require("../archive-similarity"),
        archiveEntities: require("../archive-entities"),
        query: require("./query"),
        runtime: require("./runtime"),
        urlState: require("./url-state"),
      }
    : {
        archiveSearch: root.EchoArchiveSearch,
        archiveSimilarity: root.EchoArchiveSimilarity,
        archiveEntities: root.EchoArchiveEntities,
        query: root.EchoDiscoveryQuery,
        runtime: root.EchoDiscoveryRuntime,
        urlState: root.EchoDiscoveryUrlState,
      };
  const api = factory(dependencies);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EchoDiscovery = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  const ENGINE_VERSION = "2.0.0";
  const MAX_SHOW_RESULTS = 50;
  const MAX_QUERY_CACHE_ENTRIES = 128;
  const FACET_FIELDS = Object.freeze({
    genreIds: "genres",
    formatIds: "formats",
    toneIds: "tones",
    catalogueStatusIds: "completionStatus",
    releaseStatusIds: "releaseStatus",
    bestForIds: "bestFor",
    tagIds: "tags",
    themeIds: "themes",
    commitmentIds: "discovery.commitment",
  });
  const SEARCH_FIELD_MAP = Object.freeze({
    genreIds: "genres",
    formatIds: "formats",
    toneIds: "tones",
    catalogueStatusIds: "completionStatus",
    releaseStatusIds: "releaseStatus",
    bestForIds: "bestFor",
    tagIds: "tags",
    themeIds: "themes",
  });
  const PERSONAL_STATUSES = new Set(["saved", "listening", "finished", "dropped", "hidden"]);

  const normalizeCriterion = (value) => deps.query.toId(value);
  const asArray = (value) => Array.isArray(value) ? value : [];
  const unique = (values) => [...new Set(values)];

  function getField(record, field) {
    return String(field).split(".").reduce((value, part) => value?.[part], record);
  }
  function getValues(record, field) {
    const value = getField(record, field);
    return (Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value])
      .map(normalizeCriterion);
  }
  function arraysFromIntent(intent, group) {
    return Object.entries(intent[group] || {}).filter(([, value]) => Array.isArray(value) && value.length);
  }
  function criteriaEvidence(show, intent) {
    const evidence = [];
    for (const group of ["required", "preferred"]) {
      for (const [key, values] of arraysFromIntent(intent, group)) {
        const field = FACET_FIELDS[key];
        if (!field) continue;
        const present = getValues(show, field);
        for (const value of values) {
          if (present.includes(normalizeCriterion(value))) {
            evidence.push({ kind: "catalogue-field", field, value: normalizeCriterion(value), criterion: group, source: "show-record" });
          }
        }
      }
    }
    for (const [key, values] of arraysFromIntent(intent, "avoid")) {
      const field = FACET_FIELDS[key];
      if (!field) continue;
      const present = getValues(show, field);
      if (present.length && values.every((value) => !present.includes(normalizeCriterion(value)))) {
        evidence.push({ kind: "exclusion-check", field, values: values.map(normalizeCriterion), criterion: "avoid", source: "show-record", state: "checked-no-prohibited-value" });
      }
    }
    if (intent.required.runtimeHours) {
      const runtime = deps.runtime.getRuntimeEvidence(show);
      if (deps.runtime.isComparableRuntime(runtime)) evidence.push({ kind: "runtime-range", field: "length.totalHours", hours: runtime.hours, runtimeKind: runtime.kind, source: "show-record" });
    }
    return evidence;
  }

  function matchesHardConstraints(show, intent, limitationCounts) {
    for (const [key, values] of arraysFromIntent(intent, "required")) {
      const field = FACET_FIELDS[key];
      if (!field) continue;
      const present = getValues(show, field);
      if (!values.every((value) => present.includes(normalizeCriterion(value)))) return false;
    }
    for (const [key, values] of arraysFromIntent(intent, "avoid")) {
      const field = FACET_FIELDS[key];
      if (!field) continue;
      const present = getValues(show, field);
      if (!present.length) {
        limitationCounts.set("uncheckable-exclusion:" + field, (limitationCounts.get("uncheckable-exclusion:" + field) || 0) + 1);
        return false;
      }
      if (values.some((value) => present.includes(normalizeCriterion(value)))) return false;
    }
    if (intent.required.runtimeHours) {
      const runtime = deps.runtime.getRuntimeEvidence(show);
      if (!deps.runtime.isComparableRuntime(runtime)) {
        limitationCounts.set("unknown-runtime", (limitationCounts.get("unknown-runtime") || 0) + 1);
        return false;
      }
      const { min, max } = intent.required.runtimeHours;
      if (min !== null && min !== undefined && (intent.required.runtimeHours.minExclusive ? runtime.hours <= min : runtime.hours < min)) return false;
      if (max !== null && max !== undefined && (intent.required.runtimeHours.maxExclusive ? runtime.hours >= max : runtime.hours > max)) return false;
    }
    return true;
  }

  function preferenceRank(show, intent) {
    let matches = 0;
    for (const [key, values] of arraysFromIntent(intent, "preferred")) {
      const field = FACET_FIELDS[key];
      if (!field) continue;
      const actual = getValues(show, field);
      matches += values.filter((value) => actual.includes(normalizeCriterion(value))).length;
    }
    const target = intent.preferred?.runtimeTargetHours?.hours;
    const runtime = target === undefined ? null : deps.runtime.getRuntimeEvidence(show);
    const distance = runtime && deps.runtime.isComparableRuntime(runtime) ? Math.abs(runtime.hours - Number(target)) : Number.POSITIVE_INFINITY;
    return { matches, distance, runtime: runtime || null };
  }

  function createSearchCandidate(result, intent, provenance = "archive-search", runtimeShow = result) {
    const evidence = criteriaEvidence(result, intent);
    const reasons = asArray(result.reasons).map(String);
    if (result.searchMatchTier >= 4) {
      const alias = asArray(result.aliases).find((value) => deps.query.normalize(value) === deps.query.normalize(intent.query));
      evidence.unshift({ kind: alias ? "title-alias" : "title-identity", field: alias ? "aliases" : "title", value: alias || result.title, source: "archive-search", matchTier: result.searchMatchTier });
    }
    if (result.searchPresentation?.metaText) evidence.push({ kind: "search-presentation", text: String(result.searchPresentation.metaText), source: "archive-search" });
    return {
      id: result.id,
      section: "shows",
      provenance: { kind: provenance, engine: "archive-search", matchTier: Number(result.searchMatchTier || 0) },
      reasons,
      evidence,
      runtime: deps.runtime.getRuntimeEvidence(runtimeShow),
    };
  }

  function createSimilarityCandidate(entry, section, seedId, intent) {
    const show = entry.show;
    const evidence = criteriaEvidence(show, intent);
    if (section === "authoredSimilarity") {
      evidence.unshift({
        kind: "authored-similarity",
        seedShowId: seedId,
        source: entry.direction === "similarity-collection" ? "similarity-collection" : "similarTo",
        direction: entry.direction,
        reason: String(entry.reason || ""),
      });
      return {
        id: show.id,
        section,
        provenance: { kind: "authored", relation: entry.direction, seedShowId: seedId },
        reasons: [String(entry.reason || "Explicit authored similarity relationship.")],
        evidence,
        runtime: deps.runtime.getRuntimeEvidence(show),
      };
    }
    const similarity = entry.similarity || {};
    evidence.unshift({
      kind: "computed-similarity",
      seedShowId: seedId,
      evidenceSource: "archive-similarity",
      explanation: String(entry.explanation || ""),
      dimensions: asArray(similarity.dimensions)
        .filter((dimension) => dimension?.matched)
        .map((dimension) => ({
          id: String(dimension.id || ""),
          label: String(dimension.label || dimension.id || ""),
          values: asArray(dimension.values).map(String),
          reasons: asArray(dimension.reasons).map((reason) => String(reason.text || "")),
        })),
      confidence: String(entry.confidence || "limited-metadata"),
    });
    return {
      id: show.id,
      section,
      provenance: { kind: "computed", engine: "archive-similarity", seedShowId: seedId, confidence: String(entry.confidence || "limited-metadata") },
      reasons: asArray(entry.reasons).map(String),
      evidence,
      runtime: deps.runtime.getRuntimeEvidence(show),
    };
  }

  function compareCandidateOrder(left, right) {
    const leftHasRuntime = Number.isFinite(left._preference.distance);
    const rightHasRuntime = Number.isFinite(right._preference.distance);
    if (leftHasRuntime !== rightHasRuntime) return leftHasRuntime ? -1 : 1;
    if (right._preference.matches !== left._preference.matches) return right._preference.matches - left._preference.matches;
    if (right._preference.distance !== left._preference.distance) return left._preference.distance - right._preference.distance;
    return left._index - right._index;
  }

  function cleanRanked(entries, intent, limitationCounts, limit = MAX_SHOW_RESULTS, showsById = null) {
    const filtered = [];
    entries.forEach((entry, index) => {
      const show = entry.show || entry;
      if (!show || show.status && show.status !== "published") return;
      if (!matchesHardConstraints(show, intent, limitationCounts)) return;
      const preferenceShow = showsById?.get(show.id) || show;
      filtered.push({ show, result: entry, _index: index, _preference: preferenceRank(preferenceShow, intent) });
    });
    return filtered.sort(compareCandidateOrder).slice(0, limit);
  }

  function collectLimitations(intent, limitationCounts, sections) {
    const limitations = [];
    for (const phrase of asArray(intent.residual?.unresolvedPhrases)) {
      limitations.push({ code: "unresolved-phrase", phrase, message: "This phrase is preserved because current catalogue fields do not represent it safely." });
    }
    for (const ambiguity of asArray(intent.ambiguities)) {
      limitations.push({ code: "ambiguous-phrase", phrase: ambiguity.phrase, alternatives: ambiguity.alternatives });
    }
    for (const [key, count] of limitationCounts) {
      const [code, field] = key.split(":");
      limitations.push({ code, field: field || null, count, message: code === "unknown-runtime" ? "Some candidates have no comparable runtime evidence." : "Some records lack explicit evidence needed to evaluate an exclusion." });
    }
    if (intent.kind === "similarity" && !sections.authoredSimilarity.length && !sections.computedSimilarity.length) {
      limitations.push({ code: "limited-similarity-evidence", message: "No candidate passed the existing authored or computed similarity eligibility gates." });
    }
    if (intent.kind === "people-behind" && !intent.entityResolution?.entityIds?.length) {
      limitations.push({ code: "no-explicit-people-link", message: "No public person relationship with the requested role is linked to this show; organizations were not substituted." });
    }
    if (!sections.shows.length && !sections.authoredSimilarity.length && !sections.computedSimilarity.length && !sections.collections.length && !sections.entities.length && intent.kind !== "personal-library-status") {
      limitations.push({ code: "no-supported-results", message: "The current catalogue has no result supported by all applied requirements." });
    }
    return limitations;
  }

  function makeAppliedSummary(intent) {
    const list = (group) => Object.entries(intent[group] || {}).flatMap(([key, values]) => (
      Array.isArray(values) ? values.map((value) => ({ key, value })) : values ? [{ key, value: values }] : []
    ));
    return {
      required: list("required"),
      preferences: list("preferred"),
      exclusions: list("avoid"),
      provenance: intent.provenance,
    };
  }

  function criteriaQuery(intent) {
    const parts = [];
    for (const key of ["catalogueStatusIds", "releaseStatusIds", "genreIds", "formatIds", "toneIds", "bestForIds", "tagIds", "themeIds", "commitmentIds"]) {
      for (const value of intent.required?.[key] || []) parts.push(String(value).replace(/-/g, " "));
    }
    for (const key of ["genreIds", "formatIds", "toneIds", "bestForIds", "tagIds", "themeIds", "commitmentIds"]) {
      for (const value of intent.preferred?.[key] || []) parts.push(String(value).replace(/-/g, " "));
    }
    return unique(parts).join(" ");
  }

  function searchQuery(intent) {
    if (intent.identity?.kind === "show" && ["title-identity", "title-alias", "partial-title", "typo-title"].includes(intent.kind)) return intent.query;
    if (intent.identity?.kind === "entity" || ["entity-lookup", "entity-alias"].includes(intent.kind)) return intent.query;
    const residual = String(intent.residual?.text || "").trim();
    const criteria = criteriaQuery(intent);
    if (residual && criteria) return residual + " " + criteria;
    if (residual) return residual;
    if (criteria) return criteria;
    return String(intent.query || "");
  }

  function isCloseTypoMatch(result) {
    return asArray(result?.reasons).some((reason) => /(?:title|alias) survives a close spelling/i.test(String(reason)));
  }

  function isSingleCharacterTitlePrefix(query, show) {
    const normalizedQuery = deps.query.normalize(query).split(" ").filter(Boolean);
    const title = String(show?.title || "").replace(/^(?:the|a|an)\s+/i, "");
    const normalizedTitle = deps.query.normalize(title).split(" ").filter(Boolean);
    if (!normalizedQuery.length || normalizedQuery.length !== normalizedTitle.length) return false;
    for (let index = 0; index < normalizedQuery.length - 1; index += 1) {
      if (normalizedQuery[index] !== normalizedTitle[index]) return false;
    }
    const queryTail = normalizedQuery.at(-1);
    const titleTail = normalizedTitle.at(-1);
    return titleTail.startsWith(queryTail) && titleTail.length - queryTail.length === 1;
  }

  function hasRuntimeOnlyCriteria(intent) {
    const hasRuntime = Boolean(intent.required?.runtimeHours || intent.preferred?.runtimeTargetHours);
    if (!hasRuntime) return false;
    const hasTaxonomy = ["required", "preferred", "avoid"].some((group) => (
      Object.entries(intent[group] || {}).some(([key, value]) => (
        key === "runtimeHours" || key === "runtimeTargetHours"
          ? false
          : Array.isArray(value) && value.length > 0
      ))
    ));
    const unresolved = String(intent.residual?.text || "").trim();
    return !hasTaxonomy && !unresolved;
  }

  function createDiscoveryEngine(options = {}) {
    const sourceShows = asArray(options.shows);
    const shows = sourceShows.filter((show) => show && (show.status === undefined || show.status === "published"));
    const searchRecords = asArray(options.searchCatalog || options.searchRecords || options.shows);
    const searchCatalog = deps.archiveSearch.hydrateCatalogSearch(searchRecords.map((record) => ({ ...record })));
    const entities = asArray(options.entities).filter((entity) => entity?.publication === "public");
    const collections = asArray(options.collections);
    const showsById = new Map(shows.map((show) => [show.id, show]));
    const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
    const collectionsById = new Map(collections.map((collection) => [collection.id, collection]));
    const queryIndex = {
      ...deps.query.createIdentityIndex(searchCatalog, entities, collections),
      facetMaps: deps.query.createFacetMaps(searchCatalog),
      collections,
      collectionsById,
    };
    const showsByEntity = new Map();
    for (const show of shows) {
      for (const link of asArray(show.entityLinks)) {
        if (!entitiesById.has(link.entityId)) continue;
        const entries = showsByEntity.get(link.entityId) || [];
        entries.push({ show, role: link.role });
        showsByEntity.set(link.entityId, entries);
      }
    }
    const queryCache = new Map();
    const catalogueRevision = String(options.catalogueRevision || options.revision || "unversioned");
    let similarityIndex = options.similarityIndex || null;
    function getSimilarityIndex() {
      if (!similarityIndex) similarityIndex = deps.archiveSimilarity.createSimilarityIndex({ shows, collections });
      return similarityIndex;
    }
    function parse(query, parseOptions = {}) {
      const surface = parseOptions.surface || "show-search";
      const cacheKey = catalogueRevision + "|" + surface + "|" + String(query || "").trim();
      if (queryCache.has(cacheKey)) {
        const cached = queryCache.get(cacheKey);
        queryCache.delete(cacheKey);
        queryCache.set(cacheKey, cached);
        return JSON.parse(JSON.stringify(cached));
      }
      const parsed = deps.query.parseQuery(queryIndex, query, { ...parseOptions, surface });
      if (!parsed.personalIntent) {
        queryCache.set(cacheKey, parsed);
        if (queryCache.size > MAX_QUERY_CACHE_ENTRIES) queryCache.delete(queryCache.keys().next().value);
      }
      return JSON.parse(JSON.stringify(parsed));
    }

    function retrieve(input, retrieveOptions = {}) {
      const inputIntent = typeof input === "string"
        ? parse(input, { surface: retrieveOptions.surface || "show-search" })
        : JSON.parse(JSON.stringify(input || parse("")));
      const intent = inputIntent;
      const limitationCounts = new Map();
      const sections = { shows: [], authoredSimilarity: [], computedSimilarity: [], collections: [], entities: [] };
      const retrievalTrace = { engineVersion: ENGINE_VERSION, catalogueRevision, mode: "archive-search", usedArchiveSearch: false, usedSimilarity: false, usedEntityLinks: false, usedCollections: false };

      if (intent.surface === "collections-search") {
        retrievalTrace.mode = "collections";
        retrievalTrace.usedCollections = true;
        let matches = [];
        if (intent.collectionResolution?.id) {
          const collection = collectionsById.get(intent.collectionResolution.id);
          if (collection) matches = [collection];
        } else if (intent.collectionResolution?.collectionIds) {
          const ids = new Set(intent.collectionResolution.collectionIds);
          matches = collections.filter((collection) => ids.has(collection.id));
        } else {
          const query = deps.query.normalize(intent.query);
          matches = collections.filter((collection) => {
            const showText = asArray(collection.showIds).map((id) => showsById.get(id)).filter(Boolean).flatMap((show) => [show.title, ...asArray(show.genres), ...asArray(show.tones), ...asArray(show.tags)]);
            const haystack = deps.query.normalize([collection.title, collection.description, collection.label, collection.commitment, collection.kind, ...asArray(collection.intentTags), ...showText].join(" "));
            return query && haystack.includes(query);
          });
          matches.sort((left, right) => (Number(left.order ?? Number.MAX_SAFE_INTEGER) - Number(right.order ?? Number.MAX_SAFE_INTEGER)) || String(left.title).localeCompare(String(right.title), "en") || left.id.localeCompare(right.id, "en"));
        }
        sections.collections = matches.map((collection) => ({
          id: collection.id,
          section: "collections",
          provenance: { kind: collection.kind === "similarity" ? "authored-similarity-collection" : collection.kind === "rule-based" ? "rule-based-collection" : "authored-collection", source: "collections.json" },
          reasons: [intent.collectionResolution?.evidenceSource === "collection.intentTags" ? "Matches collection listening-intent tag." : "Matches collection title or collection search text."],
          evidence: [{ kind: "collection-route", collectionId: collection.id, collectionKind: collection.kind, source: collection.kind === "rule-based" ? "rule-based-membership" : "authored-collection" }],
          collectionType: collection.kind,
          anchorShowId: collection.anchorShowId || null,
          intentTags: asArray(collection.intentTags).map(String),
        }));
      } else if (intent.kind === "personal-library-status") {
        retrievalTrace.mode = "local-library-intent";
      } else if (intent.kind === "similarity" && intent.identity?.kind === "show") {
        retrievalTrace.mode = "similarity";
        retrievalTrace.usedSimilarity = true;
        const seedId = intent.identity.id;
        const authoredEntries = getSimilarityIndex().getEditorialSimilarityMatches(seedId, { limit: shows.length || 1 });
        const computedEntries = getSimilarityIndex().getPublicSimilarityMatches(seedId, { limit: shows.length || 1, maximumResults: shows.length || 1, diversify: false });
        const authored = cleanRanked(authoredEntries, intent, limitationCounts, MAX_SHOW_RESULTS, showsById);
        const computed = cleanRanked(computedEntries, intent, limitationCounts, MAX_SHOW_RESULTS, showsById);
        sections.authoredSimilarity = authored.map(({ result }) => createSimilarityCandidate(result, "authoredSimilarity", seedId, intent));
        sections.computedSimilarity = computed.map(({ result }) => createSimilarityCandidate(result, "computedSimilarity", seedId, intent));
      } else if (["people-behind", "creator-lookup"].includes(intent.kind) && intent.entityResolution?.seedShowId) {
        retrievalTrace.mode = "typed-entity-relationship";
        retrievalTrace.usedEntityLinks = true;
        const seed = showsById.get(intent.entityResolution.seedShowId);
        const links = seed ? deps.archiveEntities.resolveShowEntities(seed, entities) : [];
        const requestedRoles = new Set(intent.entityResolution.requestedRoles || []);
        const related = links.filter((entity) => requestedRoles.has(entity.role) && entitiesById.has(entity.id));
        intent.entityResolution.entityIds = related.map((entity) => entity.id).sort();
        intent.entityResolution.relationships = related.map((entity) => ({ entityId: entity.id, entityName: entity.name, entityType: entity.type, role: entity.role, evidenceSource: "explicit-entityLinks" }));
        intent.entityResolution.availableRoles = links.map((entity) => entity.role).sort();
        sections.entities = related.map((entity) => ({
          id: entity.id,
          section: "entities",
          provenance: { kind: "typed-entity-link", source: "entityLinks", role: entity.role },
          reasons: [entity.role === "creator" ? "Explicit creator relationship on the resolved show." : "Explicit typed relationship on the resolved show."],
          evidence: [{ kind: "typed-relationship", entityId: entity.id, role: entity.role, source: "entityLinks", seedShowId: seed.id }],
          role: entity.role,
          entityType: entity.type,
        }));
        const otherShows = related.flatMap((entity) => (showsByEntity.get(entity.id) || [])
          .filter((entry) => entry.role === entity.role && entry.show.id !== seed?.id)
          .map((entry) => ({ show: entry.show, role: entry.role, entity })));
        const seen = new Set();
        sections.shows = otherShows.filter((entry) => !seen.has(entry.show.id) && seen.add(entry.show.id)).map((entry) => ({
          id: entry.show.id,
          section: "shows",
          provenance: { kind: "explicit-entity-relationship", entityId: entry.entity.id, role: entry.role, seedShowId: seed?.id },
          reasons: ["Shares an explicitly linked " + entry.role + " relationship."],
          evidence: [{ kind: "typed-relationship", entityId: entry.entity.id, role: entry.role, source: "entityLinks", relatedShowId: entry.show.id }],
          runtime: deps.runtime.getRuntimeEvidence(entry.show),
        }));
      } else if (intent.kind === "runtime-lookup" && intent.runtimeRequest?.showId) {
        const show = showsById.get(intent.runtimeRequest.showId);
        if (show) {
          sections.shows.push({ id: show.id, section: "shows", provenance: { kind: "resolved-show-identity", source: "title" }, reasons: ["Resolved the exact show requested for runtime lookup."], evidence: [{ kind: "title-identity", field: "title", value: show.title, source: "catalogue" }], runtime: deps.runtime.getRuntimeEvidence(show) });
          const evidence = deps.runtime.getRuntimeEvidence(show);
          if (evidence.kind === "unknown") limitationCounts.set("unknown-runtime", 1);
        }
      } else if (intent.kind === "entity-lookup" || intent.kind === "entity-alias") {
        retrievalTrace.mode = "typed-entity-lookup";
        retrievalTrace.usedEntityLinks = true;
        const entityId = intent.identity?.id;
        const entity = entitiesById.get(entityId);
        if (entity) {
          const role = intent.identity.role;
          sections.entities.push({ id: entity.id, section: "entities", provenance: { kind: "public-entity-identity", source: intent.identity.match }, reasons: ["Resolved public entity " + entity.name + " by " + intent.identity.match + "."], evidence: [{ kind: "entity-identity", entityId: entity.id, entityType: entity.type, role, source: "entity name or reviewed alias" }], role, entityType: entity.type });
          const linkedShows = deps.archiveEntities.getEntityShows(entityId, shows)
            .flatMap((show) => asArray(show.entityLinks)
              .filter((link) => link.entityId === entityId && (!role || link.role === role))
              .map((link) => ({ show, role: link.role })))
            .sort((left, right) => String(left.show.title || "").localeCompare(String(right.show.title || ""), "en") || left.show.id.localeCompare(right.show.id, "en"));
          sections.shows = linkedShows.slice(0, MAX_SHOW_RESULTS).map(({ show, role: linkRole }) => ({
            id: show.id, section: "shows",
            provenance: { kind: "explicit-entity-relationship", entityId, role: linkRole, source: "entityLinks" },
            reasons: ["Explicit " + linkRole + " relationship to " + entity.name + "."],
            evidence: [{ kind: "typed-relationship", entityId, role: linkRole, source: "entityLinks" }],
            runtime: deps.runtime.getRuntimeEvidence(show),
          }));
        }
      } else {
        retrievalTrace.usedArchiveSearch = true;
        const criteriaOnlyRuntime = hasRuntimeOnlyCriteria(intent);
        let rawResults = [];
        if (criteriaOnlyRuntime) rawResults = shows;
        else {
          const requiredFields = {};
          for (const [key, field] of Object.entries(SEARCH_FIELD_MAP)) {
            const values = intent.required?.[key];
            if (Array.isArray(values) && values.length) requiredFields[field] = values;
          }
          rawResults = deps.archiveSearch.scoreCatalog(searchCatalog, searchQuery(intent), { requiredFields });
        }
        // Exact/partial identity uses the original fast search behavior. All
        // semantic filters are then rechecked against catalogue evidence.
        const ranked = cleanRanked(rawResults, intent, limitationCounts, MAX_SHOW_RESULTS, showsById);
        sections.shows = ranked.map(({ show, result }) => {
          const canonicalShow = showsById.get(show.id) || show;
          return createSearchCandidate(result || show, intent, intent.identity ? "archive-search-identity" : "archive-search", canonicalShow);
        });
        if (intent.preferred?.runtimeTargetHours) {
          const unknownCount = shows.filter((show) => !deps.runtime.isComparableRuntime(deps.runtime.getRuntimeEvidence(show))).length;
          if (unknownCount) limitationCounts.set("unknown-runtime", unknownCount);
        }
      }

      // An existing search result can confidently resolve a reviewed typo
      // after normal search has run. Keep the listener's original query intact.
      if (intent.identity?.match === "partial-title" && sections.shows[0]?.id === intent.identity.id) {
        const matchedShow = showsById.get(intent.identity.id);
        if (isSingleCharacterTitlePrefix(intent.query, matchedShow)) {
          intent.kind = "bounded-typo-or-prefix";
          intent.identity.match = "bounded-prefix";
          sections.shows[0].provenance = { kind: "bounded-prefix-title", engine: "archive-search", matchTier: sections.shows[0].provenance.matchTier };
          sections.shows[0].evidence.unshift({ kind: "bounded-prefix", originalText: intent.query, resolvedShowId: matchedShow.id, source: "archive-search" });
        }
      }
      if (!intent.identity && sections.shows.length) {
        const first = sections.shows[0];
        const searchMatch = searchCatalog.find((show) => show.id === first.id);
        const rawMatch = searchMatch && deps.archiveSearch.scoreCatalog([searchMatch], intent.query)[0];
        if (rawMatch && Number(rawMatch.searchMatchTier) >= 2 && rawMatch.searchMatchTier < 5 && isCloseTypoMatch(rawMatch)) {
          const match = { kind: "show", id: rawMatch.id, match: "bounded-typo", matchedText: intent.query, evidence: asArray(rawMatch.reasons).slice(0, 2) };
          intent.identity = match;
          intent.kind = "bounded-typo";
          first.provenance = { kind: "bounded-typo-title", engine: "archive-search", matchTier: rawMatch.searchMatchTier };
          first.evidence.unshift({ kind: "bounded-typo", originalText: intent.query, resolvedShowId: rawMatch.id, source: "archive-search" });
        }
      }

      const personalContext = sanitizePersonalContext(retrieveOptions.personalContext, showsById);
      let result = {
        version: 1,
        intent,
        sections,
        candidateIds: unique([
          ...sections.shows.map((entry) => entry.id),
          ...sections.authoredSimilarity.map((entry) => entry.id),
          ...sections.computedSimilarity.map((entry) => entry.id),
          ...sections.collections.map((entry) => entry.id),
          ...sections.entities.map((entry) => entry.id),
        ]),
        applied: makeAppliedSummary(intent),
        unresolvedPhrases: asArray(intent.residual?.unresolvedPhrases),
        ambiguities: asArray(intent.ambiguities),
        limitations: [],
        outcome: "results",
        retrievalTrace,
      };
      result.limitations = collectLimitations(intent, limitationCounts, sections);
      if (intent.kind === "personal-library-status") {
        result.outcome = personalContext?.enabled ? "personal-context-available" : "requires-personal-context";
        result.limitations.push({ code: "local-library-context-required", message: "This intent is local-only. The public catalogue result set was not filtered by Library state." });
      } else if (!result.candidateIds.length && intent.ambiguities.length) result.outcome = "needs-clarification";
      else if (!result.candidateIds.length) result.outcome = "no-results";

      // Personal Discovery stays an injected, optional layer over this fully
      // eligible public result. No storage module or browser global is read.
      if (personalContext?.enabled && typeof retrieveOptions.personalize === "function") {
        result = retrieveOptions.personalize({ publicResult: result, personalContext, intent });
      }
      return result;
    }

    return {
      version: ENGINE_VERSION,
      catalogueRevision,
      shows,
      collections,
      entities,
      parse,
      retrieve,
      getSimilarityIndex,
    };
  }

  function sanitizePersonalContext(context, showsById) {
    if (!context || typeof context !== "object" || typeof context.enabled !== "boolean") return null;
    if (!context.enabled) return { enabled: false, entries: [] };
    const entries = [];
    for (const entry of asArray(context.entries)) {
      if (!entry || typeof entry.showId !== "string" || !showsById.has(entry.showId) || !PERSONAL_STATUSES.has(entry.state)) continue;
      const sanitized = { showId: entry.showId, state: entry.state };
      if (Number.isInteger(entry.rating) && entry.rating >= 1 && entry.rating <= 5) sanitized.rating = entry.rating;
      entries.push(sanitized);
    }
    entries.sort((left, right) => left.showId.localeCompare(right.showId, "en"));
    return { enabled: true, entries };
  }

  return {
    ENGINE_VERSION,
    createDiscoveryEngine,
    sanitizePersonalContext,
    getRuntimeEvidence: deps.runtime.getRuntimeEvidence,
    serializePublicUrlState: deps.urlState.serializePublicUrlState,
    parsePublicDiscoveryUrl: deps.urlState.parsePublicDiscoveryUrl,
  };
});
