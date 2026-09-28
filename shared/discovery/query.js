(function (root, factory) {
  const archiveSearch = typeof module === "object" && module.exports ? require("../archive-search") : root.EchoArchiveSearch;
  const api = factory(archiveSearch);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EchoDiscoveryQuery = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (archiveSearch) {
  const INTENT_VERSION = 1;
  const FACET_DEFINITIONS = [
    ["genreIds", "genres"], ["formatIds", "formats"], ["toneIds", "tones"],
    ["catalogueStatusIds", "completionStatus"], ["releaseStatusIds", "releaseStatus"],
    ["bestForIds", "bestFor"], ["tagIds", "tags"], ["themeIds", "themes"],
    ["commitmentIds", "discovery.commitment"],
  ];
  const SYNONYMS = [
    ["genreIds", "sci-fi", ["sci fi", "science fiction", "scifi"]],
    ["formatIds", "full-cast", ["full cast", "fullcast"]],
    ["formatIds", "single narrator", ["single narrator", "single-narrator", "solo narrator", "one narrator"]],
    ["catalogueStatusIds", "finished", ["finished", "complete", "completed"]],
    ["catalogueStatusIds", "ongoing", ["ongoing", "active", "unfinished"]],
    ["bestForIds", "easy-entry", ["easy entry", "easy to jump into", "easy to get into"]],
    ["bestForIds", "funny-space-disasters", ["funny space disasters", "funny space disaster"]],
    ["bestForIds", "cold-isolation-horror", ["cold isolation horror"]],
    ["bestForIds", "headphones-on", ["headphones on"]],
    ["bestForIds", "binge-listening", ["binge listening", "bingeable"]],
    ["bestForIds", "long-walks", ["long walk", "long walks"]],
    ["bestForIds", "late-night", ["late night"]],
  ];
  const normalize = (value) => archiveSearch.normalizeText(value);
  const toId = (value) => normalize(value).replace(/\s+/g, "-");

  function createFacetMaps(shows = []) {
    const maps = new Map(FACET_DEFINITIONS.map(([key]) => [key, new Map()]));
    for (const show of Array.isArray(shows) ? shows : []) {
      for (const [key, field] of FACET_DEFINITIONS) {
        const values = field.startsWith("discovery.")
          ? [["discovery", ...field.slice("discovery.".length).split(".")].reduce((value, part) => value?.[part], show)]
          : (Array.isArray(show?.[field]) ? show[field] : [show?.[field]]);
        for (const value of values) {
          if (!value) continue;
          const id = toId(value);
          if (!maps.get(key).has(id)) maps.get(key).set(id, id);
        }
      }
    }
    for (const [key, id, aliases] of SYNONYMS) {
      let canonical = maps.get(key)?.get(id);
      if (!canonical && ["genreIds", "formatIds", "catalogueStatusIds"].includes(key)) canonical = id;
      if (!canonical && key === "bestForIds" && maps.get(key)?.has(id)) canonical = maps.get(key).get(id);
      if (canonical) aliases.forEach((alias) => maps.get(key).set(normalize(alias), canonical));
    }
    return maps;
  }

  function createIdentityIndex(shows = [], entities = [], collections = []) {
    const titleAndAlias = new Map();
    const partialTitles = [];
    const publicShows = (Array.isArray(shows) ? shows : []).filter((show) => show && (show.status === undefined || show.status === "published"));
    const addName = (map, value, entry) => {
      const key = normalize(value);
      if (!key) return;
      const entries = map.get(key) || [];
      const existing = entries.findIndex((candidate) => candidate.id === entry.id);
      if (existing === -1) entries.push(entry);
      else if (["title", "name"].includes(entry.match) && !["title", "name"].includes(entries[existing].match)) entries[existing] = entry;
      map.set(key, entries);
    };
    for (const show of publicShows) {
      const title = String(show.title || "");
      const entry = { kind: "show", id: show.id, title, match: "title" };
      addName(titleAndAlias, title, entry);
      const withoutArticle = title.replace(/^(?:the|a|an)\s+/i, "");
      if (withoutArticle !== title) addName(titleAndAlias, withoutArticle, { ...entry, commonArticleOmitted: true });
      for (const alias of Array.isArray(show.aliases) ? show.aliases : []) addName(titleAndAlias, alias, { ...entry, match: "alias", alias: String(alias) });
      partialTitles.push({ ...entry, normalized: normalize(title), normalizedWithoutArticle: normalize(withoutArticle) });
    }
    partialTitles.sort((left, right) => left.title.localeCompare(right.title, "en") || left.id.localeCompare(right.id, "en"));
    const entityNames = new Map();
    const publicEntities = (Array.isArray(entities) ? entities : []).filter((entity) => entity?.publication === "public");
    for (const entity of publicEntities) {
      addName(entityNames, entity.name, { kind: "entity", id: entity.id, name: entity.name, type: entity.type, match: "name" });
      for (const alias of Array.isArray(entity.aliases) ? entity.aliases : []) addName(entityNames, alias, { kind: "entity", id: entity.id, name: entity.name, type: entity.type, match: "alias", alias: String(alias) });
    }
    const collectionNames = new Map();
    for (const collection of Array.isArray(collections) ? collections : []) addName(collectionNames, collection.title, { kind: "collection", id: collection.id, title: collection.title, match: "name" });
    return { publicShows, publicEntities, titleAndAlias, partialTitles, entityNames, collectionNames };
  }

  const makeRequired = () => ({ genreIds: [], formatIds: [], toneIds: [], catalogueStatusIds: [], releaseStatusIds: [], bestForIds: [], tagIds: [], themeIds: [], commitmentIds: [], runtimeHours: null });
  const makePreferred = () => ({ genreIds: [], formatIds: [], toneIds: [], tagIds: [], themeIds: [], bestForIds: [], commitmentIds: [], runtimeTargetHours: null });
  const makeAvoid = () => ({ genreIds: [], formatIds: [], toneIds: [], tagIds: [], themeIds: [], bestForIds: [] });
  const addUnique = (target, key, value) => { if (value !== undefined && value !== null && !target[key].includes(value)) target[key].push(value); };

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  }
  function matchAt(normalized, phrase) {
    if (!phrase) return null;
    const escaped = escapeRegex(normalize(phrase)).replace(/\s+/g, "\\s+");
    const match = new RegExp("(?:^|\\s)(" + escaped + ")(?=\\s|$)").exec(normalized);
    return match ? { phrase: match[1] } : null;
  }
  function removePhrase(text, phrase) {
    if (!phrase) return text;
    const escaped = escapeRegex(normalize(phrase)).replace(/\s+/g, "\\s+");
    return text.replace(new RegExp("(?:^|\\s)" + escaped + "(?=\\s|$)", "g"), " ").replace(/\s+/g, " ").trim();
  }
  function getExactShow(index, value) {
    const entries = index.titleAndAlias.get(normalize(value)) || [];
    if (entries.length === 1) return { entry: entries[0], alternatives: [] };
    if (entries.length > 1) return { entry: null, alternatives: entries };
    return null;
  }
  function getExactEntity(index, value) {
    const entries = index.entityNames.get(normalize(value)) || [];
    if (entries.length === 1) return { entry: entries[0], alternatives: [] };
    if (entries.length > 1) return { entry: null, alternatives: entries };
    return null;
  }
  function findCollection(index, value) {
    const entries = index.collectionNames.get(normalize(value)) || [];
    return entries.length === 1 ? entries[0] : null;
  }
  function findPartialTitle(index, value) {
    const query = normalize(value);
    if (query.length < 4) return [];
    return index.partialTitles.filter((entry) => entry.normalized.startsWith(query) || entry.normalizedWithoutArticle.startsWith(query));
  }
  function getPhraseForMap(normalized, map, key) {
    const phrases = [];
    for (const [term, value] of map.entries()) if (term.includes(" ") && value !== undefined) phrases.push({ term, value });
    phrases.sort((left, right) => right.term.length - left.term.length || left.term.localeCompare(right.term, "en"));
    for (const { term, value } of phrases) if (matchAt(normalized, term)) return { key, term, value };
    return null;
  }

  function resolveTaxonomy(index, normalized, { seed = false, preferenceTone = false, runtimeOverride = null, explicitFacets = [] } = {}) {
    const required = makeRequired();
    const preferred = makePreferred();
    const avoid = makeAvoid();
    const provenance = [];
    const unresolvedPhrases = [];
    const working = { positive: normalized };
    for (const phrase of ["less chaotic", "darker", "more cinematic", "more dark", "less intense", "more intense"]) {
      const at = matchAt(working.positive, phrase);
      if (!at) continue;
      unresolvedPhrases.push(at.phrase);
      working.positive = removePhrase(working.positive, at.phrase);
    }
    const exclusion = working.positive.match(/(?:^|\s)(?:but\s+)?not\s+([\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+){0,2})(?=$|\s)/u);
    if (exclusion) {
      const facet = resolveSingleFacet(index, exclusion[1]);
      if (facet && ["genreIds", "formatIds", "toneIds", "bestForIds"].includes(facet.key)) {
        addUnique(avoid, facet.key, facet.value);
        working.positive = working.positive.replace(exclusion[0], " ").replace(/\s+/g, " ").trim();
        provenance.push({ field: "avoid", source: "phrase", phrase: exclusion[1], evidence: { field: facet.field, value: facet.value } });
      }
    }
    for (const key of ["bestForIds", "formatIds", "catalogueStatusIds", "genreIds", "toneIds", "commitmentIds"]) {
      const map = index.facetMaps.get(key);
      const phrase = map && getPhraseForMap(working.positive, map, key);
      if (!phrase) continue;
      const asPreference = (key === "bestForIds" && phrase.value !== "cold-isolation-horror") || (key === "toneIds" && seed);
      addUnique(asPreference ? preferred : required, key, phrase.value);
      provenance.push({ field: asPreference ? "preferred" : "required", source: "phrase", phrase: phrase.term, evidence: { field: fieldForCriterion(key), value: phrase.value } });
      working.positive = removePhrase(working.positive, phrase.term);
      if (key === "bestForIds" && phrase.value === "cold-isolation-horror") {
        addUnique(required, "genreIds", "horror");
        provenance.push({ field: "required", source: "phrase", phrase: phrase.term, evidence: { field: "genres", value: "horror" } });
      }
    }
    for (const token of working.positive.split(/\s+/).filter(Boolean)) {
      let matched = null;
      for (const key of ["catalogueStatusIds", "toneIds", "commitmentIds", "genreIds"]) {
        const value = index.facetMaps.get(key)?.get(token);
        if (value) { matched = { key, value }; break; }
      }
      if (!matched) continue;
      const asPreference = matched.key === "commitmentIds" || (matched.key === "toneIds" && (seed || preferenceTone));
      addUnique(asPreference ? preferred : required, matched.key, matched.value);
      provenance.push({ field: asPreference ? "preferred" : "required", source: "phrase", phrase: token, evidence: { field: fieldForCriterion(matched.key), value: matched.value } });
      working.positive = removePhrase(working.positive, token);
    }
    for (const facet of explicitFacets) {
      addUnique(required, facet.key, facet.value);
      provenance.push({ field: "required", source: "explicit-vocabulary", phrase: facet.phrase, evidence: { field: facet.key === "tagIds" ? "tags" : "themes", value: facet.value } });
      working.positive = removePhrase(working.positive, facet.prefix + " " + normalize(facet.text));
    }
    const runtime = runtimeOverride || parseRuntimePhrase(working.positive);
    if (runtime) {
      if (runtime.kind === "around") preferred.runtimeTargetHours = { hours: runtime.hours, mode: "around", strength: "soft" };
      else required.runtimeHours = { min: runtime.min, max: runtime.max, minExclusive: Boolean(runtime.minExclusive), maxExclusive: Boolean(runtime.maxExclusive) };
      provenance.push({ field: runtime.kind === "around" ? "preferred" : "required", source: "phrase", phrase: runtime.phrase, evidence: { field: "length.totalHours", value: runtime.kind === "around" ? runtime.hours : { min: runtime.min, max: runtime.max }, qualifier: runtime.kind === "around" ? "soft target" : "user-selected range" } });
      working.positive = removePhrase(working.positive, normalize(runtime.phrase));
    }
    if (/\b(?:one|1) season long\b/.test(working.positive)) {
      unresolvedPhrases.push("one season long");
      working.positive = removePhrase(working.positive, "one season long");
    }
    const residualTokens = working.positive.trim().split(/\s+/).filter(Boolean);
    const scaffolding = new Set(["a", "an", "about", "and", "for", "give", "me", "of", "please", "recommend", "show", "shows", "something", "the", "to"]);
    const residual = residualTokens.every((token) => scaffolding.has(token)) ? "" : working.positive.trim();
    collectUnresolvedPhrases(residual).forEach((phrase) => { if (!unresolvedPhrases.includes(phrase)) unresolvedPhrases.push(phrase); });
    if (preferenceTone) {
      required.toneIds.forEach((value) => addUnique(preferred, "toneIds", value));
      required.toneIds = [];
    }
    return { required, preferred, avoid, provenance, residual, unresolvedPhrases };
  }

  function fieldForCriterion(key) {
    return FACET_DEFINITIONS.find(([id]) => id === key)?.[1] || key;
  }
  function resolveSingleFacet(index, value) {
    const normalized = normalize(value);
    for (const key of ["genreIds", "formatIds", "toneIds", "catalogueStatusIds", "bestForIds", "commitmentIds"]) {
      const id = index.facetMaps.get(key)?.get(normalized);
      if (id) return { key, field: fieldForCriterion(key), value: id };
    }
    return null;
  }
  function parseRuntimePhrase(query) {
    const around = query.match(/(?:^|\s)(around|about|roughly|approximately)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/);
    if (around) return { kind: "around", hours: Number(around[2]), phrase: around[0].trim() };
    const between = query.match(/(?:^|\s)between\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/);
    if (between) return { kind: "range", min: Math.min(Number(between[1]), Number(between[2])), max: Math.max(Number(between[1]), Number(between[2])), minExclusive: false, maxExclusive: false, phrase: between[0].trim() };
    const lower = query.match(/(?:^|\s)(at least|over|more than)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/);
    if (lower) return { kind: "range", min: Number(lower[2]), max: null, minExclusive: lower[1] !== "at least", maxExclusive: false, phrase: lower[0].trim() };
    const upper = query.match(/(?:^|\s)(under|below|less than|no more than|at most)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/);
    if (upper) return { kind: "range", min: null, max: Number(upper[2]), minExclusive: false, maxExclusive: !["no more than", "at most"].includes(upper[1]), phrase: upper[0].trim() };
    return null;
  }
  function findExplicitVocabularyFacets(rawQuery, facetMaps) {
    const matches = [];
    const pattern = /(?:^|\s)(tag|theme):([^\s,;]+)/gi;
    let match;
    while ((match = pattern.exec(String(rawQuery || "")))) {
      const prefix = match[1].toLocaleLowerCase();
      const key = prefix === "tag" ? "tagIds" : "themeIds";
      const text = match[2].replace(/^['"]|['"]$/g, "");
      const value = facetMaps.get(key)?.get(toId(text));
      if (value) matches.push({ prefix, key, text, value, phrase: `${prefix}:${text}` });
    }
    return matches;
  }
  function collectUnresolvedPhrases(text) {
    const stop = new Set(["a", "an", "and", "about", "are", "by", "for", "from", "give", "in", "is", "it", "me", "of", "on", "or", "show", "shows", "something", "that", "the", "to", "with", "but", "not", "like", "who", "what", "where", "when", "why", "how", "created", "people", "behind"]);
    const groups = [];
    let current = [];
    const flush = () => {
      if (current.length) groups.push(current.join(" "));
      current = [];
    };
    for (const token of String(text || "").split(/\s+/).filter(Boolean)) {
      if (stop.has(token) || /^\d/.test(token)) {
        flush();
        if (!stop.has(token)) groups.push(token);
      } else current.push(token);
    }
    flush();
    return groups;
  }
  function createProvenance(fields) {
    const sources = new Set(fields.map((entry) => entry.source));
    return { source: sources.size > 1 ? "mixed" : (sources.values().next().value || "phrase"), fields };
  }
  function createPublicUrl(pathname, query, params = []) {
    const cleanParams = [...params];
    if (query && !cleanParams.some(([name]) => name === "q")) cleanParams.push(["q", query]);
    return { pathname, params: cleanParams.map(([name, value]) => ({ name, value })), hash: "" };
  }

  function parseQuery(index, rawQuery, options = {}) {
    const query = String(rawQuery || "").trim();
    const normalized = normalize(query);
    const surface = options.surface || "show-search";
    const pathname = surface === "collections-search" ? "/collections" : surface === "entity-search" ? "/creators" : "/";
    const intent = {
      version: INTENT_VERSION, kind: "text-search", query, normalizedQuery: normalized, surface,
      identity: null, required: makeRequired(), preferred: makePreferred(), avoid: makeAvoid(),
      residual: { text: query, unresolvedPhrases: [] }, ambiguities: [], personalIntent: null,
      entityResolution: null, collectionResolution: null, runtimeRequest: null,
      provenance: { source: "phrase", fields: [] }, url: createPublicUrl(pathname, query),
    };
    if (!normalized) return intent;

    // Exact title and alias identity precede every taxonomy pass.
    const exactWhole = getExactShow(index, normalized);
    if (exactWhole?.entry) {
      intent.kind = exactWhole.entry.match === "alias" ? "title-alias" : "title-identity";
      intent.identity = { kind: "show", id: exactWhole.entry.id, match: exactWhole.entry.match, matchedText: exactWhole.entry.match === "alias" ? exactWhole.entry.alias : exactWhole.entry.title, ...(exactWhole.entry.commonArticleOmitted ? { commonArticleOmitted: true } : {}) };
      intent.residual = { text: "", unresolvedPhrases: [] };
      intent.provenance = createProvenance([{ field: "identity", source: "phrase", phrase: query, evidence: { kind: exactWhole.entry.match, showId: exactWhole.entry.id } }]);
      return intent;
    }

    if (surface === "collections-search") {
      const collection = findCollection(index, normalized);
      if (collection) {
        const source = index.collectionsById?.get(collection.id) || collection;
        intent.kind = source.kind === "similarity" ? "authored-similarity-collection" : "authored-collection-route";
        intent.identity = { kind: "collection", id: collection.id, match: "title", matchedText: collection.title };
        intent.collectionResolution = { id: collection.id, kind: source.kind === "similarity" ? "similarity" : source.kind, anchorShowId: source.anchorShowId || null, evidenceSource: "collection-title" };
        intent.residual = { text: "", unresolvedPhrases: [] };
        intent.provenance = createProvenance([{ field: "identity", source: "route", phrase: query, evidence: { kind: "collection-title", collectionId: collection.id } }]);
        return intent;
      }
      const term = toId(normalized);
      const tagged = (index.collections || []).filter((entry) => (entry.intentTags || []).some((tag) => toId(tag) === term));
      if (tagged.length) {
        intent.kind = "collection-intent";
        intent.collectionResolution = { intentTag: term, evidenceSource: "collection.intentTags", collectionIds: tagged.map((entry) => entry.id) };
        intent.residual = { text: "", unresolvedPhrases: [] };
        intent.provenance = createProvenance([{ field: "identity", source: "route", phrase: query, evidence: { kind: "collection-intent", intentTag: term } }]);
        return intent;
      }
    }

    if (/^(?:shows?\s+ive\s+finished|shows?\s+i\s+have\s+finished|my\s+finished\s+shows?)$/.test(normalized)) {
      intent.kind = "personal-library-status";
      intent.personalIntent = { kind: "library-status", status: "finished", scope: "local-only", requiresLibraryContext: true };
      intent.residual = { text: "", unresolvedPhrases: [] };
      intent.provenance = createProvenance([{ field: "required", source: "phrase", phrase: query, evidence: { kind: "personal-library-status", status: "finished" } }]);
      intent.url = createPublicUrl("/", "", []);
      return intent;
    }

    let mode = null, identityText = "", modifierText = "", relation = null, preferenceTone = false, match = null;
    match = normalized.match(/^(?:something\s+)?like\s+(.+?)(?:\s+but\s+(.+))?$/);
    if (match) {
      mode = "similarity"; identityText = match[1]; modifierText = match[2] || ""; relation = "similarity-seed";
    } else if ((match = normalized.match(/^(.+?)\s+like\s+(.+?)(?:\s+but\s+(.+))?$/))) {
      mode = "similarity"; identityText = match[2]; modifierText = [match[1], match[3]].filter(Boolean).join(" "); relation = "similarity-seed"; preferenceTone = true;
    } else if ((match = normalized.match(/^people\s+behind\s+(.+)$/))) {
      mode = "people-behind"; identityText = match[1]; relation = "people-behind";
    } else if ((match = normalized.match(/^who\s+created\s+(.+)$/))) {
      mode = "creator-lookup"; identityText = match[1]; relation = "creator-lookup";
    } else if ((match = normalized.match(/^exact\s+runtime\s+for\s+(.+)$/))) {
      mode = "runtime-lookup"; identityText = match[1]; relation = "runtime-lookup";
    }
    const resolvedSubject = identityText ? getExactShow(index, identityText) : null;
    if (resolvedSubject?.entry) {
      intent.identity = { kind: "show", id: resolvedSubject.entry.id, match: mode === "similarity" ? "seed" : "title", matchedText: identityText, ...(mode === "similarity" ? { seed: true } : {}) };
      intent.kind = mode === "similarity" ? "similarity" : mode;
      intent.provenance.fields.push({ field: "identity", source: "phrase", phrase: identityText, evidence: { kind: relation, showId: resolvedSubject.entry.id } });
      if (mode === "runtime-lookup") intent.runtimeRequest = { precision: "exact", showId: resolvedSubject.entry.id };
      if (mode === "people-behind" || mode === "creator-lookup") intent.entityResolution = { kind: mode, seedShowId: resolvedSubject.entry.id, requestedRoles: ["creator"], evidenceSource: "explicit-entityLinks", entityIds: [] };
    } else if (mode && identityText) {
      intent.kind = mode;
      intent.residual = { text: query, unresolvedPhrases: [identityText] };
      intent.ambiguities.push({ phrase: identityText, kind: "unresolved-identity", alternatives: [{ kind: "show" }, { kind: "text-search" }], resolution: "retain-text-until-resolved" });
      intent.provenance.fields.push({ field: "residual", source: "phrase", phrase: identityText, evidence: { kind: "unresolved-identity" } });
    }

    if (!intent.identity && surface !== "collections-search") {
      const entity = getExactEntity(index, normalized);
      if (entity?.entry) {
        const role = entity.entry.type === "person" ? "creator" : entity.entry.type;
        intent.kind = entity.entry.match === "alias" ? "entity-alias" : "entity-lookup";
        intent.identity = { kind: "entity", id: entity.entry.id, type: entity.entry.type, role, match: entity.entry.match, matchedText: entity.entry.match === "alias" ? entity.entry.alias : entity.entry.name };
        intent.entityResolution = { kind: "entity-lookup", entityId: entity.entry.id, role, evidenceSource: "public-entity-name-or-alias", entityIds: [entity.entry.id] };
        intent.residual = { text: "", unresolvedPhrases: [] };
        intent.provenance.fields.push({ field: "identity", source: "phrase", phrase: query, evidence: { kind: "entity", entityId: entity.entry.id, role } });
      }
    }
    const subjectIsResolved = Boolean(intent.identity?.kind === "show" && ["similarity", "people-behind", "creator-lookup", "runtime-lookup"].includes(intent.kind));
    const taxonomyInput = subjectIsResolved ? modifierText : normalized;
    const rawRuntime = parseRuntimePhrase(query.toLocaleLowerCase());
    const taxonomy = resolveTaxonomy(index, taxonomyInput, { seed: intent.kind === "similarity", preferenceTone, runtimeOverride: rawRuntime, explicitFacets: findExplicitVocabularyFacets(query, index.facetMaps) });
    if (intent.identity?.kind === "show" && intent.kind === "title-identity") {
      taxonomy.required = makeRequired(); taxonomy.preferred = makePreferred(); taxonomy.avoid = makeAvoid(); taxonomy.provenance = []; taxonomy.residual = ""; taxonomy.unresolvedPhrases = [];
    }
    if (intent.identity?.kind === "entity") {
      taxonomy.required = makeRequired(); taxonomy.preferred = makePreferred(); taxonomy.avoid = makeAvoid(); taxonomy.provenance = []; taxonomy.residual = ""; taxonomy.unresolvedPhrases = [];
    }
    intent.required = taxonomy.required;
    intent.preferred = taxonomy.preferred;
    intent.avoid = taxonomy.avoid;
    intent.residual = { text: taxonomy.residual, unresolvedPhrases: taxonomy.unresolvedPhrases };
    intent.provenance.fields.push(...taxonomy.provenance);

    const hasRecognizedCriteria = ["required", "preferred", "avoid"].some((group) => Object.entries(intent[group] || {}).some(([key, value]) => (
      key === "runtimeHours" || key === "runtimeTargetHours" ? value !== null : Array.isArray(value) && value.length > 0
    )));
    if (!intent.identity && !mode && !hasRecognizedCriteria && surface !== "collections-search") {
      const partials = findPartialTitle(index, normalized);
      if (partials.length) {
        const first = partials[0];
        intent.kind = "partial-title";
        intent.identity = { kind: "show", id: first.id, match: "partial-title", matchedText: query, candidateIds: partials.map((entry) => entry.id) };
        intent.residual = { text: "", unresolvedPhrases: [] };
        intent.provenance.fields.push({ field: "identity", source: "phrase", phrase: query, evidence: { kind: "partial-title-prefix", showIds: partials.map((entry) => entry.id) } });
      }
    }

    if (intent.kind === "text-search" || intent.kind === "partial-title") {
      const hardCount = Object.entries(intent.required).filter(([key, value]) => key === "runtimeHours" ? value !== null : Array.isArray(value) && value.length > 0).length;
      const preferredCount = Object.entries(intent.preferred).filter(([key, value]) => key === "runtimeTargetHours" ? value !== null : Array.isArray(value) && value.length > 0).length;
      if (intent.preferred.bestForIds.length) intent.kind = "listening-context";
      else if (intent.preferred.runtimeTargetHours && hardCount === 0 && preferredCount === 1) intent.kind = "runtime-preference";
      else if (intent.required.genreIds.length === 1 && hardCount === 1 && !Object.values(intent.avoid).some((values) => Array.isArray(values) && values.length)) intent.kind = "genre-query";
      else if (intent.required.formatIds.length === 1 && hardCount === 1 && !Object.values(intent.avoid).some((values) => Array.isArray(values) && values.length)) intent.kind = "format-query";
      else if (intent.required.catalogueStatusIds.length && !intent.required.genreIds.length && !intent.required.formatIds.length && preferredCount === 0 && !Object.values(intent.avoid).some((values) => Array.isArray(values) && values.length)) intent.kind = "catalogue-lifecycle";
      else if (intent.preferred.toneIds.length) intent.kind = "listening-context";
      else if (hardCount || preferredCount || intent.avoid.genreIds.length) intent.kind = "facet-search";
      if (intent.residual.unresolvedPhrases.length && !intent.identity) intent.kind = "unresolved-compound-request";
    }
    if (/\b(?:one|1) season long\b/.test(normalized)) {
      intent.kind = "ambiguous-runtime";
      intent.ambiguities.push({ phrase: "one season long", kind: "runtime-unit", alternatives: [{ kind: "catalogue-season-count", unit: "season" }, { kind: "runtime-preference", unit: "hours" }], resolution: "editable-choice-or-retain-phrase" });
      if (!intent.residual.unresolvedPhrases.includes("one season long")) intent.residual.unresolvedPhrases.push("one season long");
    }
    if (intent.kind === "genre-query" && intent.required.genreIds.includes("horror") && normalized === "horror") {
      intent.ambiguities.push({ phrase: "horror", kind: "taxonomy-title-collision", defaultInterpretation: "genre", alternatives: [{ kind: "genre", value: "horror" }, { kind: "title-fragment", value: "horror" }], resolution: "editable-interpretation-or-text-search" });
    }
    if (intent.kind === "runtime-lookup" && intent.runtimeRequest) intent.residual = { text: "", unresolvedPhrases: ["exact runtime"] };
    if (intent.identity?.kind === "entity") intent.kind = intent.identity.match === "alias" ? "entity-alias" : "entity-lookup";
    if (!intent.provenance.fields.length && query) intent.provenance.fields.push({ field: "residual", source: "phrase", phrase: query, evidence: { kind: "free-text" } });
    intent.provenance = createProvenance(intent.provenance.fields);
    intent.url = createPublicUrl(pathname, intent.personalIntent ? "" : query, query && !intent.personalIntent ? [["q", query]] : []);
    return intent;
  }

  return { INTENT_VERSION, FACET_DEFINITIONS, SYNONYMS, createFacetMaps, createIdentityIndex, parseQuery, parseRuntimePhrase, normalize, toId, makeRequired, makePreferred, makeAvoid, fieldForCriterion, collectUnresolvedPhrases };
});
