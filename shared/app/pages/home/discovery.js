import "../../../archive-search.js";
import "../../../archive-similarity.js";
import "../../../archive-entities.js";
import "../../../discovery/query.js";
import "../../../discovery/runtime.js";
import "../../../discovery/url-state.js";
import "../../../discovery/index.js";

const RICH_QUERY_PATTERNS = [
  /\b(?:shows?\s+by\s+)?(?:the\s+)?people\s+behind\b/i,
  /\bwho\s+created\b/i,
  /\bexact\s+runtime\s+for\b/i,
  /\b(?:around|about|approximately|between|at\s+least|over|more\s+than|under|below|less\s+than|no\s+more\s+than|at\s+most)\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?|h)\b/i,
  /\b(?:not|without|except)\b/i,
  /\b(?:like|similar\s+to)\b/i,
  /\b(?:darker|brighter|less|more|one\s+season\s+long)\b/i,
  /\b(?:shows?\s+ive\s+finished|shows?\s+i\s+have\s+finished|my\s+finished\s+shows?)\b/i,
  /\b(?:tag|theme):[^\s,;]+/i,
];

function normalizeText(archiveSearch, value) {
  return String(archiveSearch.normalizeText(value) || "").trim();
}

function hasRecognizedCriteria(intent) {
  return ["required", "preferred", "avoid"].some((groupName) =>
    Object.entries(intent?.[groupName] || {}).some(([key, value]) =>
      key === "runtimeHours" || key === "runtimeTargetHours"
        ? value !== null && value !== undefined
        : Array.isArray(value) && value.length > 0,
    ),
  );
}

function collectPublicEntities(shows, normalize) {
  const entitiesById = new Map();
  for (const show of shows) {
    for (const resolved of Array.isArray(show?.resolvedEntities) ? show.resolvedEntities : []) {
      if (!resolved?.id || !resolved?.name) continue;
      const existing = entitiesById.get(resolved.id);
      const entity = existing || {
        id: resolved.id,
        name: resolved.name,
        type: resolved.type,
        aliases: [],
        publication: "public",
      };
      entity.aliases = [...new Set([...entity.aliases, ...(Array.isArray(resolved.aliases) ? resolved.aliases : [])])];
      entitiesById.set(entity.id, entity);
    }
  }

  const searchNames = new Set();
  for (const entity of entitiesById.values()) {
    [entity.name, ...entity.aliases].forEach((value) => searchNames.add(normalize(value)));
  }

  return { entities: [...entitiesById.values()], searchNames };
}

function collectExactShowNames(shows, normalize) {
  const names = new Set();
  for (const show of shows) {
    [show?.title, ...(Array.isArray(show?.aliases) ? show.aliases : [])]
      .filter(Boolean)
      .forEach((value) => names.add(normalize(value)));
  }
  return names;
}

function collectFacetNames(shows, normalize) {
  const values = new Set();
  for (const show of shows) {
    for (const field of ["genres", "tones", "formats", "completionStatus", "releaseStatus", "bestFor", "tags", "themes"]) {
      const entries = Array.isArray(show?.[field]) ? show[field] : show?.[field] ? [show[field]] : [];
      entries.forEach((value) => {
        const normalized = normalize(value);
        if (normalized) values.add(normalized);
      });
    }
    const commitment = normalize(show?.discovery?.commitment || "");
    if (commitment) values.add(commitment);
  }
  return values;
}

function collectCollectionNames(collections, normalize, toId) {
  const names = new Set();
  const intentTags = new Set();
  for (const collection of collections) {
    [collection?.title, collection?.label].filter(Boolean).forEach((value) => names.add(normalize(value)));
    for (const tag of Array.isArray(collection?.intentTags) ? collection.intentTags : []) {
      intentTags.add(normalize(tag));
      intentTags.add(normalize(toId(tag)));
    }
  }
  return { names, intentTags };
}

function getEntityRelationshipInput(query) {
  const match = String(query || "").match(/^\s*shows?\s+by\s+(?:the\s+)?people\s+behind\s+(.+?)\s*$/i);
  return match ? `people behind ${match[1].trim()}` : String(query || "").trim();
}

function hasTitleFragmentCollision(query, shows, normalize) {
  return shows.some((show) => [show?.title, ...(Array.isArray(show?.aliases) ? show.aliases : [])]
    .filter(Boolean)
    .some((value) => ` ${normalize(value)} `.includes(` ${query} `)));
}

export function createHomeDiscoveryAdapter({
  shows = [],
  runtimeEvidence = [],
  collections = [],
  archiveSearch = globalThis.EchoArchiveSearch,
  similarityIndex = null,
  catalogueRevision = "",
} = {}) {
  const normalize = (value) => normalizeText(archiveSearch, value);
  let runtimeEvidenceById = new Map();
  const discoveryShows = shows.map((show) => ({ ...show }));
  const { entities, searchNames: entityNames } = collectPublicEntities(discoveryShows, normalize);
  const exactShowNames = collectExactShowNames(discoveryShows, normalize);
  const facetNames = collectFacetNames(discoveryShows, normalize);
  const collectionNames = collectCollectionNames(
    collections,
    normalize,
    (value) => globalThis.EchoDiscoveryQuery.toId(value),
  );
  const queryResults = new Map();
  let engine = null;

  function setRuntimeEvidence(entries = []) {
    runtimeEvidenceById = new Map((Array.isArray(entries) ? entries : []).map((entry) => [entry.id, entry]));
    discoveryShows.forEach((show) => {
      const evidence = runtimeEvidenceById.get(show.id);
      if (evidence?.length) show.length = { ...evidence.length };
      if (evidence?.runtimeGap === true) show.runtimeGap = true;
      else delete show.runtimeGap;
    });
    queryResults.clear();
  }
  setRuntimeEvidence(runtimeEvidence);

  function isCollectionQuery(normalized) {
    const id = globalThis.EchoDiscoveryQuery.toId(normalized);
    const explicitCollectionPhrase = /\b(?:best for|collection)\b/i.test(normalized);
    if (explicitCollectionPhrase && (collectionNames.names.has(normalized) || collectionNames.intentTags.has(normalized) || collectionNames.intentTags.has(id))) {
      return true;
    }
    if (!collectionNames.names.has(normalized)) return false;
    const shape = archiveSearch.classifyQueryShape(discoveryShows, normalized);
    if (shape.structuredClauseGroup === "multiple" || shape.queryKind.startsWith("shows_like_")) return false;
    return !hasRecognizedCriteria(getEngine().parse(normalized, { surface: "show-search" }));
  }

  function needsDiscovery(query) {
    const normalized = normalize(query);
    if (!normalized || exactShowNames.has(normalized)) return false;
    if (isCollectionQuery(normalized) || entityNames.has(normalized)) return true;
    if (RICH_QUERY_PATTERNS.some((pattern) => pattern.test(query))) return true;

    const shape = archiveSearch.classifyQueryShape(discoveryShows, query);
    if (shape.structuredClauseGroup === "multiple" || shape.queryKind.startsWith("shows_like_")) return true;
    if (facetNames.has(normalized)) {
      return hasTitleFragmentCollision(normalized, discoveryShows, normalize);
    }
    return false;
  }

  function getEngine() {
    if (!engine) {
      engine = globalThis.EchoDiscovery.createDiscoveryEngine({
        shows: discoveryShows,
        searchCatalog: discoveryShows,
        collections,
        entities,
        similarityIndex,
        catalogueRevision: catalogueRevision || "home-page-lifecycle",
      });
    }
    return engine;
  }

  function getIntent(query) {
    const originalQuery = String(query || "").trim();
    if (!originalQuery) return null;

    const normalized = normalize(originalQuery);
    const collectionSearch = isCollectionQuery(normalized);
    const queryForParser = getEntityRelationshipInput(originalQuery);
    const intent = getEngine().parse(queryForParser, {
      surface: collectionSearch ? "collections-search" : "show-search",
    });
    if (queryForParser !== originalQuery) {
      intent.query = originalQuery;
      intent.normalizedQuery = normalized;
      intent.url = {
        pathname: "/",
        params: [{ name: "q", value: originalQuery }],
        hash: "",
      };
    }
    return intent;
  }

  function getSearch(query) {
    const originalQuery = String(query || "").trim();
    if (!originalQuery || !needsDiscovery(originalQuery)) return null;

    const normalized = normalize(originalQuery);
    const collectionSearch = isCollectionQuery(normalized);
    const cacheKey = `${collectionSearch ? "collections" : "shows"}|${normalized}`;
    if (queryResults.has(cacheKey)) {
      const cached = queryResults.get(cacheKey);
      queryResults.delete(cacheKey);
      queryResults.set(cacheKey, cached);
      return cached;
    }

    const discoveryEngine = getEngine();
    const intent = getIntent(originalQuery);
    const result = discoveryEngine.retrieve(intent);
    const resolvedCollections = (result.sections?.collections || [])
      .map((entry) => collections.find((collection) => collection.id === entry.id) || null)
      .filter(Boolean);
    const search = { intent, result, collections: resolvedCollections };
    queryResults.set(cacheKey, search);
    if (queryResults.size > 12) queryResults.delete(queryResults.keys().next().value);
    return search;
  }

  return {
    getSearch,
    getIntent,
    setRuntimeEvidence,
    getEntityById(id) {
      return entities.find((entity) => entity.id === id) || null;
    },
    getCollectionById(id) {
      return collections.find((collection) => collection.id === id) || null;
    },
  };
}
