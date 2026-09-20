(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.EchoArchiveSimilarity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCORE_MAX = 100;
  const CURATED_COLLECTION_KINDS = new Set(["curated", "editorial", "similarity"]);
  const RATING_FIELDS = ["archive", "story", "characters", "voiceActing", "soundDesign", "ads", "length"];
  const ENTITY_ROLE_LABELS = {
    creator: "creator",
    "production-company": "production company",
    studio: "studio",
    network: "network",
  };
  const ENTITY_ROLE_FACTORS = {
    creator: 1,
    "production-company": 1,
    studio: 0.9,
    network: 0.55,
  };

  // Keep the matching policy separate from the dimension weights. This makes
  // the conservative candidate gate easy to tune without hiding thresholds in
  // the ranking implementation.
  const MATCH_POLICY = Object.freeze({
    minimumScore: 8,
    sparseMinimumScore: 7.5,
    sparseCoverageThreshold: 0.35,
    minimumMetadataDimensions: 2,
    minimumAnchorDimensions: 1,
  });

  // The diagnostic gate is intentionally broad enough to reveal useful
  // catalogue signals. Public computed matches need a materially stronger
  // evidence floor so that metadata overlap never reads like editorial
  // recommendation. Keep this as a policy adapter around getSimilarShows;
  // the scoring model remains the single source of similarity evidence.
  const PUBLIC_MATCH_POLICY = Object.freeze({
    minimumScore: 18,
    sparseMinimumScore: 12,
    sparseCoverageThreshold: 0.7,
    minimumMetadataCoverage: 0.65,
    sparseMinimumMetadataCoverage: 0.6,
    minimumRecordMetadataCoverage: 0.65,
    sparseMinimumRecordMetadataCoverage: 0.6,
    minimumMetadataDimensions: 3,
    minimumAnchorDimensions: 2,
    minimumSpecificDimensions: 2,
    minimumDistinctiveSpecificDimensions: 1,
    minimumSpecificDistinctiveness: 0.25,
    maximumResults: 4,
    explanationReasons: 2,
    diversityPenalty: 7,
    nearDuplicatePenalty: 14,
  });

  const PUBLIC_SPECIFIC_DIMENSION_IDS = Object.freeze([
    "entity",
    "tone",
    "theme",
    "tag",
    "bestFor",
    "voiceStyle",
    "narrativeFocus",
    "intensity",
    "commitment",
  ]);
  const PUBLIC_SPECIFIC_DIMENSION_SET = new Set(PUBLIC_SPECIFIC_DIMENSION_IDS);
  const PUBLIC_REASON_PRIORITY = Object.freeze({
    entity: 0,
    tone: 1,
    theme: 2,
    tag: 3,
    bestFor: 4,
    voiceStyle: 5,
    narrativeFocus: 6,
    intensity: 7,
    commitment: 8,
    sharedCollection: 9,
    releaseProfile: 10,
    format: 11,
    genre: 12,
    episodeLength: 13,
    catalogLength: 14,
  });

  const DISCOVERY_DIMENSION_IDS = Object.freeze([
    "tone",
    "theme",
    "tag",
    "bestFor",
    "voiceStyle",
    "narrativeFocus",
    "intensity",
    "commitment",
  ]);
  const DISCOVERY_DIMENSION_SET = new Set(DISCOVERY_DIMENSION_IDS);
  const DIVERSITY_DIMENSION_FACTORS = Object.freeze({
    entity: 1.15,
    tone: 1.2,
    theme: 1.2,
    tag: 1.2,
    bestFor: 1.1,
    voiceStyle: 1,
    narrativeFocus: 1.1,
    intensity: 1,
    commitment: 1,
    genre: 0.45,
    format: 0.45,
    releaseProfile: 0.35,
    sharedCollection: 0.35,
    episodeLength: 0.25,
    catalogLength: 0.25,
  });

  const SHOWS_LIKE_TARGET_COUNT = 8;
  const SHOWS_LIKE_VISIBLE_LIMIT = 4;
  const SHOWS_LIKE_GENERIC_REASON_PATTERNS = Object.freeze([
    /^editorial inclusion\.?$/i,
    /^explicit catalog similarity link\.?$/i,
    /^similar show\.?$/i,
    /^included in .+\.?$/i,
  ]);
  const SHOWS_LIKE_SECTION_DEFINITIONS = Object.freeze([
    {
      id: "characters",
      label: "Similar characters & relationships",
      description: "For the chemistry, ensemble, or personal stakes you want to carry forward.",
    },
    {
      id: "atmosphere",
      label: "Similar atmosphere & tone",
      description: "For the same emotional weather, even when the setting changes.",
    },
    {
      id: "premise",
      label: "Similar premise & world",
      description: "For a familiar story engine, setting, or genre appetite from another angle.",
    },
    {
      id: "storytelling",
      label: "Similar storytelling & format",
      description: "For listeners drawn to how the show is made, voiced, or structured.",
    },
  ]);
  const SHOWS_LIKE_SECTION_BY_ID = new Map(SHOWS_LIKE_SECTION_DEFINITIONS.map((section) => [section.id, section]));
  const SHOWS_LIKE_EXPERIENCE_FACTORS = Object.freeze({
    entity: 1.25,
    genre: 0.8,
    format: 0.8,
    tone: 1.25,
    theme: 1.2,
    tag: 1.1,
    bestFor: 1.1,
    voiceStyle: 1.05,
    narrativeFocus: 1.15,
    intensity: 0.8,
    commitment: 0.85,
    releaseProfile: 0.35,
    episodeLength: 0.25,
    catalogLength: 0.15,
  });
  const SHOWS_LIKE_SUPPLEMENTAL_FACTORS = Object.freeze({
    setting: 4,
    storyStructure: 3,
  });
  const SHOWS_LIKE_DIVERSITY_PENALTY = 4;
  const SHOWS_LIKE_LIMITED_METADATA_COVERAGE = 0.65;
  const SHOWS_LIKE_GENERIC_TEXT_TOKENS = new Set([
    "a",
    "an",
    "and",
    "audio",
    "acted",
    "balanced",
    "cast",
    "comedy",
    "drama",
    "environment",
    "fiction",
    "for",
    "found",
    "full",
    "global",
    "horror",
    "in",
    "into",
    "later",
    "mystery",
    "of",
    "original",
    "over",
    "podcast",
    "primarily",
    "record",
    "series",
    "show",
    "sites",
    "story",
    "the",
    "thriller",
    "to",
    "under",
    "with",
    "world",
  ]);

  // These weights are deliberately conservative. The score is a ranking aid,
  // not a claim that two shows are interchangeable. Editorial links are kept
  // separate from metadata overlap and ratings are evidence-only.
  const DIMENSION_DEFINITIONS = Object.freeze([
    { id: "editorial", label: "Curated relationship", weight: 30, coverageEligible: false },
    { id: "entity", label: "Shared creator or entity", weight: 14, coverageEligible: true, anchor: true },
    { id: "genre", field: "genres", label: "Shared genre", weight: 8, coverageEligible: true },
    { id: "format", field: "formats", label: "Shared format", weight: 8, coverageEligible: true, anchor: true },
    { id: "tone", field: "tones", label: "Shared tone", weight: 7, coverageEligible: true, coverageGroup: "discovery" },
    { id: "theme", field: "themes", label: "Shared theme", weight: 7, coverageEligible: true, coverageGroup: "discovery" },
    { id: "tag", field: "tags", label: "Shared discovery tag", weight: 4, coverageEligible: true, coverageGroup: "discovery" },
    { id: "bestFor", field: "bestFor", label: "Shared listening context", weight: 4, coverageEligible: true, coverageGroup: "discovery" },
    { id: "voiceStyle", path: "discovery.voiceStyle", label: "Shared voice style", weight: 3, coverageEligible: true, coverageGroup: "discovery" },
    { id: "narrativeFocus", path: "discovery.narrativeFocus", label: "Shared narrative focus", weight: 4, coverageEligible: true, coverageGroup: "discovery" },
    { id: "intensity", path: "discovery.intensity", fallbackPath: "content.intensity", label: "Shared intensity", weight: 2, coverageEligible: true, coverageGroup: "discovery" },
    { id: "commitment", path: "discovery.commitment", label: "Shared listening commitment", weight: 2, coverageEligible: true, coverageGroup: "discovery" },
    { id: "releaseProfile", label: "Shared release or completion state", weight: 3, coverageEligible: true, anchor: true },
    { id: "sharedCollection", label: "Shared curated collection", weight: 1, coverageEligible: true, anchor: true },
    { id: "episodeLength", label: "Similar episode length", weight: 2, coverageEligible: true, anchor: true },
    { id: "catalogLength", label: "Similar catalogue size", weight: 1, coverageEligible: true, anchor: true },
    {
      id: "ratingProfile",
      label: "Comparable archive rating profile",
      weight: 0,
      coverageEligible: false,
      evidenceOnly: true,
    },
  ]);

  const DIMENSION_BY_ID = new Map(DIMENSION_DEFINITIONS.map((definition) => [definition.id, definition]));
  const METADATA_SCORE_WEIGHT = DIMENSION_DEFINITIONS
    .filter((definition) => definition.coverageEligible)
    .reduce((total, definition) => total + definition.weight, 0);

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeValue(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeIdentityUrl(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");
  }

  function getIdentityKeys(show) {
    return ["rss", "apple", "spotify"]
      .map((key) => {
        const value = normalizeIdentityUrl(show?.listenLinks?.[key]);
        return value ? `${key}:${value}` : "";
      })
      .filter(Boolean);
  }

  function normalizeSetValues(value) {
    const values = new Map();
    asArray(value).forEach((entry) => {
      const display = normalizeText(entry);
      const key = normalizeValue(display);
      if (key && !values.has(key)) values.set(key, display);
    });
    return values;
  }

  function displayValue(value) {
    const text = normalizeText(value).replace(/[-_]+/g, " ");
    if (!text) return "";

    return text
      .split(/\s+/)
      .map((part) => {
        if (/^sci$/i.test(part)) return "Sci";
        if (/^fi$/i.test(part)) return "fi";
        if (/^[A-Z0-9]{2,}$/.test(part)) return part;
        return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
      })
      .join(" ")
      .replace(/^Sci Fi$/i, "Sci-fi");
  }

  function round(value, places = 3) {
    const factor = 10 ** places;
    return Math.round(Number(value || 0) * factor) / factor;
  }

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function isPublishedShow(show) {
    return Boolean(show) && (show.status === undefined || show.status === "published");
  }

  function getPathValue(record, path) {
    return String(path || "")
      .split(".")
      .reduce((value, key) => value?.[key], record);
  }

  function getDefinitionValues(record, definition) {
    if (definition.field) return record?.[definition.field];
    if (definition.path) {
      const value = getPathValue(record, definition.path);
      if (value !== undefined && value !== null && value !== "") return [value];
    }
    if (definition.fallbackPath) {
      const value = getPathValue(record, definition.fallbackPath);
      return value === undefined || value === null || value === "" ? [] : [value];
    }
    return [];
  }

  function getNumeric(value) {
    const number = typeof value === "number" ? value : Number(String(value || "").trim());
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  const RELEASE_STATE_LABELS = Object.freeze({
    finished: "Finished",
    ongoing: "Ongoing",
    cancelled: "Cancelled",
    hiatus: "On hiatus",
    inactive: "Inactive",
  });

  function getReleaseState(show) {
    const completion = normalizeValue(show?.completionStatus);
    const release = normalizeValue(show?.releaseStatus);

    if (completion === "finished" || release === "completed") return "finished";
    if (completion === "ongoing" || release === "active") return "ongoing";
    if (completion === "cancelled") return "cancelled";
    if (release === "hiatus") return "hiatus";
    if (release === "inactive") return "inactive";
    return "";
  }

  function getRatingNumber(value) {
    const number = typeof value === "number" ? value : Number(String(value || "").trim());
    return Number.isFinite(number) && number >= 0 && number <= 10 ? number : null;
  }

  function getEpisodeLength(show) {
    const average = getNumeric(show?.length?.avgEpisodeMinutes);
    if (average !== null) return { value: average, source: "length.avgEpisodeMinutes" };
    const median = getNumeric(show?.length?.medianEpisodeMinutes);
    if (median !== null) return { value: median, source: "length.medianEpisodeMinutes" };
    return null;
  }

  function getCatalogLength(show) {
    const episodes = getNumeric(show?.length?.episodes) || getNumeric(show?.length?.episodeCount);
    if (episodes !== null) return { value: episodes, unit: "episodes", source: "length.episodes" };
    const seasons = getNumeric(show?.length?.seasons) || getNumeric(show?.length?.seasonCount);
    if (seasons !== null) return { value: seasons, unit: "seasons", source: "length.seasons" };
    return null;
  }

  function normalizeExperienceTokens(value) {
    return new Map(
      normalizeText(value)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4 && !SHOWS_LIKE_GENERIC_TEXT_TOKENS.has(token))
        .map((token) => [token, displayValue(token)]),
    );
  }

  function createSupplementalTextSignal(id, label, sourceValue, targetValue, sourceName) {
    const sourceText = normalizeText(sourceValue);
    const targetText = normalizeText(targetValue);
    if (!sourceText || !targetText) return null;

    const sourceTokens = normalizeExperienceTokens(sourceText);
    const targetTokens = normalizeExperienceTokens(targetText);
    const sharedTokens = [...sourceTokens.keys()].filter((token) => targetTokens.has(token));
    const exact = normalizeValue(sourceText) === normalizeValue(targetText);
    const overlap = sharedTokens.length / Math.max(sourceTokens.size, targetTokens.size, 1);
    if (!exact && (sharedTokens.length === 0 || overlap < 0.34)) return null;

    const values = (exact ? [...sourceTokens.keys()] : sharedTokens)
      .map((token) => sourceTokens.get(token) || targetTokens.get(token))
      .filter(Boolean);
    if (values.length === 0) return null;

    return {
      id,
      label,
      source: sourceName,
      values,
      strength: round(exact ? 1 : clamp(0.45 + (overlap * 0.55)), 3),
      text: `${label}: ${joinHumanValues(values)}`,
    };
  }

  function createSupplementalExperienceSignals(source, target) {
    return [
      createSupplementalTextSignal(
        "setting",
        "Similar setting",
        source?.content?.setting,
        target?.content?.setting,
        "content.setting",
      ),
      createSupplementalTextSignal(
        "storyStructure",
        "Similar storytelling structure",
        source?.content?.pov,
        target?.content?.pov,
        "content.pov",
      ),
    ].filter(Boolean);
  }

  function getEntityEntries(show) {
    if (Array.isArray(show?.resolvedEntities) && show.resolvedEntities.length > 0) {
      const resolved = show.resolvedEntities
        .map((entity) => ({
          id: normalizeText(entity?.id),
          name: normalizeText(entity?.name) || normalizeText(entity?.id),
          role: normalizeText(entity?.role),
        }))
        .filter((entity) => entity.id && ENTITY_ROLE_LABELS[entity.role]);
      if (resolved.length > 0) return resolved;
    }

    return asArray(show?.entityLinks)
      .map((link) => ({
        id: normalizeText(link?.entityId),
        name: normalizeText(link?.name) || normalizeText(link?.entityId),
        role: normalizeText(link?.role),
      }))
      .filter((entity) => entity.id && ENTITY_ROLE_LABELS[entity.role]);
  }

  function createFrequencyIndex(shows) {
    const definitions = DIMENSION_DEFINITIONS.filter((definition) => definition.field || definition.path);
    const frequencies = Object.fromEntries(definitions.map((definition) => [definition.id, new Map()]));
    frequencies.entity = new Map();
    frequencies.releaseProfile = new Map();

    shows.forEach((show) => {
      definitions.forEach((definition) => {
        const seen = new Set(normalizeSetValues(getDefinitionValues(show, definition)).keys());
        seen.forEach((key) => frequencies[definition.id].set(key, (frequencies[definition.id].get(key) || 0) + 1));
      });

      const seenEntities = new Set(getEntityEntries(show).map((entity) => `${entity.role}:${entity.id}`));
      seenEntities.forEach((key) => frequencies.entity.set(key, (frequencies.entity.get(key) || 0) + 1));

      const releaseState = getReleaseState(show);
      if (releaseState) frequencies.releaseProfile.set(releaseState, (frequencies.releaseProfile.get(releaseState) || 0) + 1);
    });

    return frequencies;
  }

  function createIdentityIndex(shows) {
    const identityKeysByShow = new Map();
    const showsByIdentityKey = new Map();

    shows.forEach((show) => {
      const keys = new Set(getIdentityKeys(show));
      identityKeysByShow.set(show.id, keys);
      keys.forEach((key) => {
        const ids = showsByIdentityKey.get(key) || new Set();
        ids.add(show.id);
        showsByIdentityKey.set(key, ids);
      });
    });

    return { identityKeysByShow, showsByIdentityKey };
  }

  function areNearDuplicates(source, target, context) {
    if (!source || !target || !context?.identityKeysByShow) return false;
    const sourceKeys = context.identityKeysByShow.get(source.id) || new Set();
    const targetKeys = context.identityKeysByShow.get(target.id) || new Set();
    return [...sourceKeys].some((key) => targetKeys.has(key));
  }

  function signalDistinctiveness(frequency, showCount) {
    const total = Math.max(1, Number(showCount) || 1);
    const count = Math.max(0, Number(frequency) || 0);
    // Tiny fixture indexes do not contain enough catalogue context to tell a
    // genuinely common value from a value that simply appears in every test
    // record. Keep those comparisons neutral; the production catalogue uses
    // the full frequency-aware calculation below.
    if (total < 10) return 0.5;
    if (count <= 0) return 1;
    return clamp(Math.log((total + 1) / (count + 1)) / Math.log(total + 1));
  }

  function getDiscoveryCohesion(source, target, context) {
    const discoveryDefinitions = DIMENSION_DEFINITIONS.filter((definition) => DISCOVERY_DIMENSION_SET.has(definition.id));
    const matchedSignals = discoveryDefinitions.map((definition) => {
      const leftValues = normalizeSetValues(getDefinitionValues(source, definition));
      const rightValues = normalizeSetValues(getDefinitionValues(target, definition));
      const sharedKeys = [...leftValues.keys()].filter((key) => rightValues.has(key));
      if (sharedKeys.length === 0) return null;

      const overlap = sharedKeys.length / Math.max(leftValues.size, rightValues.size, 1);
      const distinctiveness = sharedKeys.reduce((total, key) => {
        const frequency = context.frequencies[definition.id]?.get(key) || 0;
        return total + signalDistinctiveness(frequency, context.showCount);
      }, 0) / sharedKeys.length;
      return overlap * distinctiveness;
    }).filter((value) => Number.isFinite(value));

    if (matchedSignals.length < 2) return 0;
    const averageStrength = matchedSignals.reduce((total, value) => total + value, 0) / matchedSignals.length;
    return round(clamp(((matchedSignals.length - 1) / 4) * averageStrength));
  }

  function createDimensionBase(definition, overrides = {}) {
    return {
      id: definition.id,
      label: definition.label,
      weight: definition.weight,
      coverageEligible: definition.coverageEligible !== false,
      coverageGroup: definition.coverageGroup || "factual",
      anchor: definition.anchor === true,
      evidenceOnly: definition.evidenceOnly === true,
      available: false,
      matched: false,
      distinctiveness: 0,
      contribution: 0,
      reasons: [],
      ...overrides,
    };
  }

  function createSetDimension(definition, source, target, context) {
    const leftValues = normalizeSetValues(getDefinitionValues(source, definition));
    const rightValues = normalizeSetValues(getDefinitionValues(target, definition));
    const available = leftValues.size > 0 && rightValues.size > 0;
    const sharedKeys = [...leftValues.keys()].filter((key) => rightValues.has(key));

    if (!available || sharedKeys.length === 0) {
      return createDimensionBase(definition, { available });
    }

    const maxSize = Math.max(leftValues.size, rightValues.size, 1);
    const overlapRatio = sharedKeys.length / maxSize;
    const distinctiveness = sharedKeys.reduce((total, key) => {
      const frequency = context.frequencies[definition.id]?.get(key) || 0;
      return total + signalDistinctiveness(frequency, context.showCount);
    }, 0) / sharedKeys.length;
    // Common values such as "drama" or "serialized" still count, but less
    // than a rarer catalog value. The reason remains the actual shared value.
    const distinctivenessFactor = 0.3 + (0.7 * distinctiveness);
    const cohesionBoost = definition.coverageGroup === "discovery"
      ? 1 + (0.16 * Number(context.discoveryCohesion || 0))
      : 1;
    const contribution = Math.min(
      definition.weight,
      definition.weight * overlapRatio * distinctivenessFactor * cohesionBoost,
    );
    const values = sharedKeys.map((key) => displayValue(leftValues.get(key) || rightValues.get(key))).filter(Boolean);

    return createDimensionBase(definition, {
      available: true,
      matched: contribution > 0,
      distinctiveness: round(distinctiveness),
      contribution: round(contribution),
      reasons: [{
        code: definition.id,
        label: definition.label,
        source: "metadata",
        values,
        text: `${definition.label}: ${values.join(", ")}`,
      }],
    });
  }

  function createEditorialDimension(source, target, context) {
    const evidence = [];
    const sourceLinks = new Set(asArray(source?.similarTo).map(normalizeText));
    const targetLinks = new Set(asArray(target?.similarTo).map(normalizeText));

    if (sourceLinks.has(target.id)) {
      evidence.push({
        code: "similarTo",
        source: "catalog.similarTo",
        direction: "source-to-target",
        text: normalizeText(source?.similarReasons?.[target.id]) || "Explicit catalog similarity link.",
      });
    }
    if (targetLinks.has(source.id)) {
      evidence.push({
        code: "similarTo",
        source: "catalog.similarTo",
        direction: "target-to-source",
        text: normalizeText(target?.similarReasons?.[source.id]) || "Explicit catalog similarity link.",
      });
    }

    const similarityCollections = context.similarityCollections.filter((collection) => {
      const anchor = normalizeText(collection.anchorShowId);
      const members = new Set(asArray(collection.showIds).map(normalizeText));
      return (anchor === source.id && members.has(target.id)) || (anchor === target.id && members.has(source.id));
    });

    similarityCollections.forEach((collection) => {
      const memberId = collection.anchorShowId === source.id ? target.id : source.id;
      evidence.push({
        code: "similarityCollection",
        source: "catalog.similarity-collection",
        collectionId: collection.id,
        collectionTitle: normalizeText(collection.title) || collection.id,
        text: normalizeText(collection.showReasons?.[memberId]) || `Included in ${normalizeText(collection.title) || collection.id}.`,
      });
    });

    return createDimensionBase(DIMENSION_BY_ID.get("editorial"), {
      available: evidence.length > 0,
      matched: evidence.length > 0,
      contribution: evidence.length > 0 ? DIMENSION_BY_ID.get("editorial").weight : 0,
      reasons: evidence.map((entry) => ({
        code: entry.code,
        label: entry.code === "similarTo" ? "Archive similarity" : "Similarity collection",
        source: entry.source,
        ...(entry.direction ? { direction: entry.direction } : {}),
        ...(entry.collectionId ? { collectionId: entry.collectionId, collectionTitle: entry.collectionTitle } : {}),
        text: entry.text,
      })),
    });
  }

  function createEntityDimension(source, target, context) {
    const leftEntities = getEntityEntries(source);
    const rightEntities = getEntityEntries(target);
    const available = leftEntities.length > 0 && rightEntities.length > 0;
    const matches = [];

    leftEntities.forEach((left) => {
      rightEntities.forEach((right) => {
        if (left.id !== right.id || left.role !== right.role) return;
        if (matches.some((match) => match.id === left.id && match.role === left.role)) return;
        matches.push({ id: left.id, name: left.name || right.name, role: left.role });
      });
    });

    if (!available || matches.length === 0) {
      return createDimensionBase(DIMENSION_BY_ID.get("entity"), { available });
    }

    const strongestRole = matches.reduce((strongest, match) => {
      const factor = ENTITY_ROLE_FACTORS[match.role] || 0;
      return factor > strongest.factor ? { factor, role: match.role } : strongest;
    }, { factor: 0, role: "" });
    const definition = DIMENSION_BY_ID.get("entity");
    const strongestMatch = matches.find((match) => match.role === strongestRole.role);
    const frequency = context.frequencies.entity?.get(`${strongestMatch.role}:${strongestMatch.id}`) || 0;
    const distinctiveness = signalDistinctiveness(frequency, context.showCount);
    const distinctivenessFactor = 0.4 + (0.6 * distinctiveness);
    const contribution = definition.weight * strongestRole.factor * distinctivenessFactor;

    return createDimensionBase(definition, {
      available: true,
      matched: true,
      distinctiveness: round(distinctiveness),
      contribution: round(contribution),
      reasons: matches.map((match) => {
        const roleLabel = ENTITY_ROLE_LABELS[match.role] || "entity";
        return {
          code: "entity",
          label: `Shared ${roleLabel}`,
          source: "entityLinks",
          entityId: match.id,
          role: match.role,
          values: [match.name],
          text: `Shared ${roleLabel}: ${match.name}`,
        };
      }),
    });
  }

  function createSharedCollectionDimension(source, target, context) {
    const definition = DIMENSION_BY_ID.get("sharedCollection");
    const left = context.collectionsByShow.get(source.id) || [];
    const right = context.collectionsByShow.get(target.id) || [];
    const available = left.length > 0 && right.length > 0;
    const rightIds = new Set(right.map((collection) => collection.id));
    const shared = left.filter((collection) => rightIds.has(collection.id));

    if (!available || shared.length === 0) {
      return createDimensionBase(definition, { available });
    }

    const distinctiveness = shared.reduce((total, collection) => {
      const frequency = context.collectionFrequencies?.get(collection.id) || 0;
      return total + signalDistinctiveness(frequency, context.showCount);
    }, 0) / shared.length;
    const distinctivenessFactor = 0.35 + (0.65 * distinctiveness);
    const overlapFactor = 0.65 + (0.35 * clamp(shared.length / 2));
    const contribution = definition.weight * overlapFactor * distinctivenessFactor;
    const sortedShared = [...shared].sort((leftCollection, rightCollection) => leftCollection.id.localeCompare(rightCollection.id, "en"));

    return createDimensionBase(definition, {
      available: true,
      matched: true,
      distinctiveness: round(distinctiveness),
      contribution: round(contribution),
      reasons: sortedShared.slice(0, 3).map((collection) => ({
        code: "sharedCollection",
        label: "Shared curated collection",
        source: "collections",
        collectionId: collection.id,
        collectionTitle: collection.title,
        values: [collection.title],
        text: `Both appear in ${collection.title}.`,
      })),
    });
  }

  function createReleaseProfileDimension(source, target, context) {
    const definition = DIMENSION_BY_ID.get("releaseProfile");
    const left = getReleaseState(source);
    const right = getReleaseState(target);
    const available = Boolean(left && right);

    if (!available || left !== right) {
      return createDimensionBase(definition, { available });
    }

    const frequency = context.frequencies.releaseProfile?.get(left) || 0;
    const distinctiveness = signalDistinctiveness(frequency, context.showCount);
    const distinctivenessFactor = 0.3 + (0.7 * distinctiveness);
    const contribution = definition.weight * distinctivenessFactor;
    const label = RELEASE_STATE_LABELS[left] || displayValue(left);

    return createDimensionBase(definition, {
      available: true,
      matched: contribution > 0,
      distinctiveness: round(distinctiveness),
      contribution: round(contribution),
      reasons: contribution > 0 ? [{
        code: "releaseProfile",
        label: definition.label,
        source: "releaseStatus/completionStatus",
        values: [label],
        text: `Shared release or completion state: ${label}.`,
      }] : [],
    });
  }

  function createCatalogLengthDimension(source, target) {
    const definition = DIMENSION_BY_ID.get("catalogLength");
    const left = getCatalogLength(source);
    const right = getCatalogLength(target);
    const available = Boolean(left && right && left.unit === right.unit);

    if (!available) return createDimensionBase(definition, { available: Boolean(left && right) });

    const closeness = clamp(1 - (Math.abs(left.value - right.value) / Math.max(left.value, right.value, 1)));
    const matched = closeness >= 0.55;
    return createDimensionBase(definition, {
      available: true,
      matched,
      contribution: matched ? round(definition.weight * closeness) : 0,
      reasons: matched ? [{
        code: "catalogLength",
        label: definition.label,
        source: left.source,
        values: [`${left.value} ${left.unit}`, `${right.value} ${right.unit}`],
        text: `Similar catalogue size: ${left.value} vs ${right.value} ${left.unit}.`,
      }] : [],
    });
  }

  function createEpisodeLengthDimension(source, target) {
    const definition = DIMENSION_BY_ID.get("episodeLength");
    const left = getEpisodeLength(source);
    const right = getEpisodeLength(target);
    const available = left !== null && right !== null;

    if (!available) return createDimensionBase(definition, { available });

    const closeness = clamp(1 - (Math.abs(left.value - right.value) / Math.max(left.value, right.value, 1)));
    const matched = closeness >= 0.6;
    return createDimensionBase(definition, {
      available: true,
      matched,
      contribution: matched ? round(definition.weight * closeness) : 0,
      reasons: matched ? [{
        code: "episodeLength",
        label: definition.label,
        source: left.source,
        values: [`${left.value} minutes`, `${right.value} minutes`],
        text: `Similar episode length: ${left.value} vs ${right.value} minutes.`,
      }] : [],
    });
  }

  function createRatingDimension(source, target) {
    const definition = DIMENSION_BY_ID.get("ratingProfile");
    const comparable = RATING_FIELDS
      .filter((field) => getRatingNumber(source?.ratings?.[field]) !== null && getRatingNumber(target?.ratings?.[field]) !== null)
      .map((field) => ({
        field,
        left: getRatingNumber(source.ratings[field]),
        right: getRatingNumber(target.ratings[field]),
      }));
    const available = comparable.length > 0;

    if (!available) return createDimensionBase(definition, { available });

    const agreement = comparable.reduce((total, entry) => total + (1 - (Math.abs(entry.left - entry.right) / 10)), 0) / comparable.length;
    const matched = agreement >= 0.7;
    return createDimensionBase(definition, {
      available: true,
      matched,
      reasons: matched ? [{
        code: "ratingProfile",
        label: definition.label,
        source: "ratings",
        includedInScore: false,
        fields: comparable.map((entry) => entry.field),
        values: comparable.map((entry) => `${displayValue(entry.field)} ${entry.left}/${entry.right}`),
        text: `Comparable archive rating profile across ${comparable.map((entry) => displayValue(entry.field)).join(", ")}.`,
      }] : [],
    });
  }

  function hasRecordDimensionValue(record, definition, context) {
    if (definition.id === "entity") return getEntityEntries(record).length > 0;
    if (definition.id === "releaseProfile") return Boolean(getReleaseState(record));
    if (definition.id === "episodeLength") return getEpisodeLength(record) !== null;
    if (definition.id === "catalogLength") return getCatalogLength(record) !== null;
    if (definition.id === "sharedCollection") return (context.collectionsByShow.get(record?.id) || []).length > 0;
    return normalizeSetValues(getDefinitionValues(record, definition)).size > 0;
  }

  function getActiveCoverageDefinitions(records, context) {
    return DIMENSION_DEFINITIONS
      .filter((definition) => definition.coverageEligible)
      .filter((definition) => records.some((record) => hasRecordDimensionValue(record, definition, context)));
  }

  function createRecordMetadataCoverage(record, context) {
    const definitions = context.coverageDefinitions || getActiveCoverageDefinitions([record], context);
    const activeDefinitions = definitions.filter((definition) => context.coverageDefinitionIds?.has(definition.id) ?? true);
    const denominatorWeight = activeDefinitions.reduce((total, definition) => total + definition.weight, 0);
    const availableDefinitions = activeDefinitions.filter((definition) => hasRecordDimensionValue(record, definition, context));
    const availableWeight = availableDefinitions.reduce((total, definition) => total + definition.weight, 0);
    const availableIds = new Set(availableDefinitions.map((definition) => definition.id));

    return {
      metadataCoverage: round(availableWeight / Math.max(denominatorWeight, 1), 3),
      metadataAvailableWeight: availableWeight,
      metadataDenominatorWeight: denominatorWeight,
      metadataAvailableDimensions: [...availableIds],
      metadataMissingDimensions: activeDefinitions.filter((definition) => !availableIds.has(definition.id)).map((definition) => definition.id),
      metadataCoverageByDimension: definitions.map((definition) => ({
        id: definition.id,
        label: definition.label,
        weight: definition.weight,
        coverageGroup: definition.coverageGroup || "factual",
        active: context.coverageDefinitionIds?.has(definition.id) ?? true,
        available: hasRecordDimensionValue(record, definition, context),
      })),
    };
  }

  function createComparisonMetadataCoverage(source, target, dimensions, context) {
    const definitions = context.coverageDefinitions || getActiveCoverageDefinitions([source, target], context);
    const activeDefinitions = definitions.filter((definition) => context.coverageDefinitionIds?.has(definition.id) ?? true);
    const dimensionById = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
    const denominatorWeight = activeDefinitions.reduce((total, definition) => total + definition.weight, 0);
    const sourceCoverage = createRecordMetadataCoverage(source, context);
    const targetCoverage = createRecordMetadataCoverage(target, context);
    const availableDefinitions = activeDefinitions.filter((definition) => dimensionById.get(definition.id)?.available === true);
    const availableWeight = availableDefinitions.reduce((total, definition) => total + definition.weight, 0);
    const availableIds = new Set(availableDefinitions.map((definition) => definition.id));

    return {
      metadataCoverage: round(availableWeight / Math.max(denominatorWeight, 1), 3),
      metadataAvailableWeight: availableWeight,
      metadataDenominatorWeight: denominatorWeight,
      metadataAvailableDimensions: [...availableIds],
      metadataMissingDimensions: activeDefinitions.filter((definition) => !availableIds.has(definition.id)).map((definition) => definition.id),
      sourceMetadataCoverage: sourceCoverage.metadataCoverage,
      targetMetadataCoverage: targetCoverage.metadataCoverage,
      sourceMetadataAvailableWeight: sourceCoverage.metadataAvailableWeight,
      targetMetadataAvailableWeight: targetCoverage.metadataAvailableWeight,
      metadataCoverageByDimension: definitions.map((definition) => {
        const dimension = dimensionById.get(definition.id);
        const active = context.coverageDefinitionIds?.has(definition.id) ?? true;
        return {
          id: definition.id,
          label: definition.label,
          weight: definition.weight,
          coverageGroup: definition.coverageGroup || "factual",
          active,
          sourceAvailable: hasRecordDimensionValue(source, definition, context),
          targetAvailable: hasRecordDimensionValue(target, definition, context),
          comparable: active && dimension?.available === true,
          matched: active && dimension?.matched === true,
          contribution: active ? dimension?.contribution || 0 : 0,
        };
      }),
    };
  }

  function compareShows(source, target, context = {}) {
    if (!source || !target || source.id === target.id) return null;

    const comparisonContext = context && context.frequencies
      ? { ...context }
      : {
        showCount: 2,
        frequencies: createFrequencyIndex([source, target]),
        similarityCollections: [],
        collectionsByShow: new Map([[source.id, []], [target.id, []]]),
        identityKeysByShow: new Map(),
      };

    comparisonContext.discoveryCohesion = getDiscoveryCohesion(source, target, comparisonContext);

    if (!comparisonContext.coverageDefinitions) {
      comparisonContext.coverageDefinitions = DIMENSION_DEFINITIONS.filter((definition) => definition.coverageEligible);
      comparisonContext.coverageDefinitionIds = new Set(
        getActiveCoverageDefinitions([source, target], comparisonContext).map((definition) => definition.id),
      );
    }

    const dimensions = [
      createEditorialDimension(source, target, comparisonContext),
      createEntityDimension(source, target, comparisonContext),
      ...DIMENSION_DEFINITIONS
        .filter((definition) => definition.field || definition.path)
        .map((definition) => createSetDimension(definition, source, target, comparisonContext)),
      createReleaseProfileDimension(source, target, comparisonContext),
      createEpisodeLengthDimension(source, target),
      createCatalogLengthDimension(source, target),
      createSharedCollectionDimension(source, target, comparisonContext),
      createRatingDimension(source, target),
    ];
    const collectionSignals = createSupplementalExperienceSignals(source, target);
    const score = round(dimensions.reduce((total, dimension) => total + dimension.contribution, 0), 1);
    const metadataDimensions = dimensions.filter((dimension) => dimension.coverageEligible);
    const metadataMatches = metadataDimensions.filter((dimension) => dimension.matched);
    const metadataCoverage = createComparisonMetadataCoverage(source, target, dimensions, comparisonContext);
    const reasons = dimensions
      .flatMap((dimension) => dimension.reasons.map((reason) => ({ ...reason, dimension: dimension.id, contribution: dimension.contribution })))
      .sort((left, right) => right.contribution - left.contribution || left.dimension.localeCompare(right.dimension) || left.text.localeCompare(right.text));

    return {
      sourceId: source.id,
      targetId: target.id,
      catalogShowCount: comparisonContext.showCount,
      score,
      maxScore: SCORE_MAX,
      metadataCoverage: metadataCoverage.metadataCoverage,
      metadataAvailableWeight: metadataCoverage.metadataAvailableWeight,
      metadataDenominatorWeight: metadataCoverage.metadataDenominatorWeight,
      sourceMetadataCoverage: metadataCoverage.sourceMetadataCoverage,
      targetMetadataCoverage: metadataCoverage.targetMetadataCoverage,
      sourceMetadataAvailableWeight: metadataCoverage.sourceMetadataAvailableWeight,
      targetMetadataAvailableWeight: metadataCoverage.targetMetadataAvailableWeight,
      discoveryCohesion: comparisonContext.discoveryCohesion,
      collectionSignals,
      nearDuplicate: areNearDuplicates(source, target, comparisonContext),
      metadataAvailableDimensions: metadataCoverage.metadataAvailableDimensions,
      metadataMissingDimensions: metadataCoverage.metadataMissingDimensions,
      metadataCoverageByDimension: metadataCoverage.metadataCoverageByDimension,
      metadataMatches: metadataMatches.map((dimension) => dimension.id),
      curatedEvidence: dimensions.find((dimension) => dimension.id === "editorial")?.matched === true,
      dimensions,
      reasons,
    };
  }

  function joinHumanValues(values) {
    const unique = [];
    const seen = new Set();
    asArray(values).map(normalizeText).filter(Boolean).forEach((value) => {
      const key = normalizeValue(value);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(value);
    });

    if (unique.length <= 1) return unique[0] || "";
    if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
    return `${unique.slice(0, -1).join(", ")}, and ${unique.at(-1)}`;
  }

  function formatPublicReasonGroup(dimension, reasons) {
    const values = reasons.flatMap((reason) => asArray(reason.values)).filter(Boolean);
    const joinedValues = joinHumanValues(values);
    if (!joinedValues) return normalizeText(reasons[0]?.text);

    if (dimension === "entity") {
      const roleGroups = new Map();
      reasons.forEach((reason) => {
        const role = normalizeText(reason.role) || "entity";
        const group = roleGroups.get(role) || [];
        group.push(...asArray(reason.values));
        roleGroups.set(role, group);
      });
      return [...roleGroups.entries()]
        .map(([role, roleValues]) => {
          const roleLabel = ENTITY_ROLE_LABELS[role] || "entity";
          const plural = roleValues.length === 1
            ? roleLabel
            : roleLabel === "production company" ? "production companies" : `${roleLabel}s`;
          return `Shared ${plural}: ${joinHumanValues(roleValues)}`;
        })
        .join("; ");
    }

    switch (dimension) {
      case "bestFor":
        return `Both work well for: ${joinedValues}.`;
      case "voiceStyle":
        return `Both use a ${joinedValues.toLowerCase()} voice style.`;
      case "narrativeFocus":
        return `Both use a ${joinedValues.toLowerCase()} narrative focus.`;
      case "intensity":
        return `Both have ${joinedValues.toLowerCase()} intensity.`;
      case "commitment":
        return `Both share a ${joinedValues.toLowerCase()} listening commitment.`;
      case "releaseProfile":
        return `Both are ${joinedValues.toLowerCase()}.`;
      case "sharedCollection":
        return `Both appear in ${joinedValues}.`;
      case "episodeLength":
        return `Episodes are a similar length: ${joinedValues.replace(/\s+and\s+/, " vs ")}.`;
      case "catalogLength":
        return `Similar catalogue size: ${joinedValues.replace(/\s+and\s+/, " vs ")}.`;
      default:
        return `${reasons[0]?.label || "Shared archive signal"}: ${joinedValues}`;
    }
  }

  function getPublicSimilarityReasons(similarity, options = {}) {
    const requestedLimit = Number(options.limit);
    const limit = Math.max(
      1,
      Number.isFinite(requestedLimit) ? requestedLimit : PUBLIC_MATCH_POLICY.explanationReasons,
    );
    const groups = new Map();

    asArray(similarity?.reasons)
      .filter((reason) => reason && reason.dimension !== "editorial")
      .filter((reason) => reason.includedInScore !== false && Number(reason.contribution) > 0)
      .filter((reason) => normalizeText(reason.text))
      .forEach((reason) => {
        const group = groups.get(reason.dimension) || [];
        group.push(reason);
        groups.set(reason.dimension, group);
      });

    return [...groups.entries()]
      .map(([dimension, reasons]) => ({
        ...reasons[0],
        dimension,
        contribution: Math.max(...reasons.map((reason) => Number(reason.contribution) || 0)),
        values: reasons.flatMap((reason) => asArray(reason.values)),
        text: formatPublicReasonGroup(dimension, reasons),
      }))
      .filter((reason) => normalizeText(reason.text))
      .sort((left, right) => {
        const priorityDifference = (PUBLIC_REASON_PRIORITY[left.dimension] ?? 99) - (PUBLIC_REASON_PRIORITY[right.dimension] ?? 99);
        return priorityDifference || Number(right.contribution || 0) - Number(left.contribution || 0) || String(left.text).localeCompare(String(right.text), "en");
      })
      .slice(0, limit);
  }

  function buildPublicSimilarityExplanation(similarity, options = {}) {
    return getPublicSimilarityReasons(similarity, options)
      .map((reason) => normalizeText(reason.text))
      .filter(Boolean)
      .join(" · ");
  }

  function getSimilarityFeatureProfile(similarity) {
    const profile = new Map();
    asArray(similarity?.dimensions)
      .filter((dimension) => dimension.matched && dimension.id !== "editorial")
      .forEach((dimension) => {
        const factor = DIVERSITY_DIMENSION_FACTORS[dimension.id] || 0.5;
        const values = dimension.reasons
          .flatMap((reason) => asArray(reason.values))
          .map(normalizeValue)
          .filter(Boolean);
        const keys = values.length > 0 ? values.map((value) => `${dimension.id}:${value}`) : [`${dimension.id}:matched`];
        const tokenWeight = factor / keys.length;
        keys.forEach((key) => profile.set(key, Math.max(profile.get(key) || 0, tokenWeight)));
      });
    return profile;
  }

  function getFeatureOverlap(left, right) {
    const keys = new Set([...left.keys(), ...right.keys()]);
    let intersection = 0;
    let union = 0;
    keys.forEach((key) => {
      const leftWeight = left.get(key) || 0;
      const rightWeight = right.get(key) || 0;
      intersection += Math.min(leftWeight, rightWeight);
      union += Math.max(leftWeight, rightWeight);
    });
    return union > 0 ? clamp(intersection / union) : 0;
  }

  function getShowsLikeRecommendationMetrics(similarity) {
    const dimensions = asArray(similarity?.dimensions)
      .filter((dimension) => dimension?.matched && !["editorial", "ratingProfile", "sharedCollection"].includes(dimension.id));
    const weightedExperienceScore = dimensions.reduce((total, dimension) => (
      total + (Number(dimension.contribution) || 0) * (SHOWS_LIKE_EXPERIENCE_FACTORS[dimension.id] || 0.5)
    ), 0);
    const metadataScore = dimensions.reduce((total, dimension) => total + (Number(dimension.contribution) || 0), 0);
    const discoveryDimensions = dimensions.filter((dimension) => DISCOVERY_DIMENSION_SET.has(dimension.id));
    const discoveryMatchCount = discoveryDimensions.length;
    const entityMatched = dimensions.some((dimension) => dimension.id === "entity");
    const evidenceCount = discoveryMatchCount + (entityMatched ? 2 : 0);
    const evidenceFactor = evidenceCount >= 2 ? 1 : evidenceCount === 1 ? 0.72 : 0.5;
    const sourceCoverage = Number.isFinite(Number(similarity?.sourceMetadataCoverage))
      ? Number(similarity.sourceMetadataCoverage)
      : Number(similarity?.metadataCoverage || 0);
    const targetCoverage = Number.isFinite(Number(similarity?.targetMetadataCoverage))
      ? Number(similarity.targetMetadataCoverage)
      : Number(similarity?.metadataCoverage || 0);
    const coverage = clamp(Math.min(sourceCoverage, targetCoverage));
    const coverageFactor = 0.7 + (0.3 * coverage);
    const supplementalScore = asArray(similarity?.collectionSignals).reduce((total, signal) => (
      total + (Number(signal?.strength) || 0) * (SHOWS_LIKE_SUPPLEMENTAL_FACTORS[signal?.id] || 0)
    ), 0);
    const rankingScore = round(
      ((weightedExperienceScore + supplementalScore) * evidenceFactor * coverageFactor)
      + (Number(similarity?.discoveryCohesion || 0) * 5),
      2,
    );

    return {
      rankingScore,
      metadataScore: round(metadataScore, 2),
      discoveryMatchCount,
      evidenceCount,
      supplementalScore: round(supplementalScore, 2),
      sourceCoverage: round(sourceCoverage, 3),
      targetCoverage: round(targetCoverage, 3),
      metadataConfidence: coverage < SHOWS_LIKE_LIMITED_METADATA_COVERAGE || evidenceCount < 2
        ? "limited-metadata"
        : "supported",
    };
  }

  function getShowsLikeFeatureProfile(similarity) {
    const profile = getSimilarityFeatureProfile(similarity);
    asArray(similarity?.collectionSignals).forEach((signal) => {
      const factor = SHOWS_LIKE_SUPPLEMENTAL_FACTORS[signal?.id] || 0.5;
      const values = asArray(signal?.values).map(normalizeValue).filter(Boolean);
      const keys = values.length > 0 ? values.map((value) => `${signal.id}:${value}`) : [`${signal.id}:matched`];
      const tokenWeight = factor / keys.length;
      keys.forEach((key) => profile.set(key, Math.max(profile.get(key) || 0, tokenWeight)));
    });
    return profile;
  }

  function compareShowsLikeCandidateOrder(left, right) {
    const scoreDifference = Number(right.rankingScore || 0) - Number(left.rankingScore || 0);
    if (scoreDifference !== 0) return scoreDifference;
    const metadataDifference = Number(right.metadataScore || 0) - Number(left.metadataScore || 0);
    if (metadataDifference !== 0) return metadataDifference;
    const sourceOrderDifference = Number(left.sourceOrder || 0) - Number(right.sourceOrder || 0);
    if (sourceOrderDifference !== 0) return sourceOrderDifference;
    return String(left.show?.title || left.show?.id || "").localeCompare(String(right.show?.title || right.show?.id || ""), "en")
      || String(left.show?.id || "").localeCompare(String(right.show?.id || ""), "en");
  }

  function selectDiverseShowsLikeCandidates(candidates, limit) {
    const remaining = [...candidates].sort(compareShowsLikeCandidateOrder);
    const selected = [];
    const profiles = new Map(remaining.map((candidate) => [candidate.show.id, getShowsLikeFeatureProfile(candidate.similarity)]));
    const selectionLimit = Math.max(0, Number.isFinite(Number(limit)) ? Number(limit) : remaining.length);

    while (remaining.length > 0 && selected.length < selectionLimit) {
      let bestIndex = 0;
      let bestEffectiveScore = Number.NEGATIVE_INFINITY;

      remaining.forEach((candidate, index) => {
        const profile = profiles.get(candidate.show.id) || new Map();
        const overlap = selected.reduce((maximum, selectedCandidate) => Math.max(
          maximum,
          getFeatureOverlap(profile, profiles.get(selectedCandidate.show.id) || new Map()),
        ), 0);
        const effectiveScore = Number(candidate.rankingScore || 0) - (overlap * SHOWS_LIKE_DIVERSITY_PENALTY);

        if (
          effectiveScore > bestEffectiveScore
          || (effectiveScore === bestEffectiveScore && compareShowsLikeCandidateOrder(candidate, remaining[bestIndex]) < 0)
        ) {
          bestIndex = index;
          bestEffectiveScore = effectiveScore;
        }
      });

      selected.push(remaining.splice(bestIndex, 1)[0]);
    }

    return selected;
  }

  function compareCandidateOrder(left, right) {
    const scoreDifference = Number(right.similarity?.score || 0) - Number(left.similarity?.score || 0);
    if (scoreDifference !== 0) return scoreDifference;
    const coverageDifference = Number(right.similarity?.metadataCoverage || 0) - Number(left.similarity?.metadataCoverage || 0);
    if (coverageDifference !== 0) return coverageDifference;
    return String(left.show?.title || left.show?.id || "").localeCompare(String(right.show?.title || right.show?.id || ""), "en")
      || String(left.show?.id || "").localeCompare(String(right.show?.id || ""), "en");
  }

  function selectDiverseCandidates(candidates, limit) {
    const remaining = [...candidates].sort(compareCandidateOrder);
    const selected = [];
    const profiles = new Map(remaining.map((candidate) => [candidate.show.id, getSimilarityFeatureProfile(candidate.similarity)]));

    while (remaining.length > 0 && selected.length < limit) {
      let bestIndex = 0;
      let bestEffectiveScore = Number.NEGATIVE_INFINITY;

      remaining.forEach((candidate, index) => {
        const profile = profiles.get(candidate.show.id) || new Map();
        const overlap = selected.reduce((maximum, selectedCandidate) => Math.max(
          maximum,
          getFeatureOverlap(profile, profiles.get(selectedCandidate.show.id) || new Map()),
        ), 0);
        const duplicatePenalty = candidate.similarity?.nearDuplicate
          ? PUBLIC_MATCH_POLICY.nearDuplicatePenalty
          : 0;
        const effectiveScore = Number(candidate.similarity?.score || 0)
          - (overlap * PUBLIC_MATCH_POLICY.diversityPenalty)
          - duplicatePenalty;

        if (
          effectiveScore > bestEffectiveScore
          || (effectiveScore === bestEffectiveScore && compareCandidateOrder(candidate, remaining[bestIndex]) < 0)
        ) {
          bestIndex = index;
          bestEffectiveScore = effectiveScore;
        }
      });

      selected.push(remaining.splice(bestIndex, 1)[0]);
    }

    return selected;
  }

  function isUsefulShowsLikeReason(value) {
    const reason = normalizeText(value).replace(/\s+/g, " ");
    if (reason.length < 24) return false;
    return !SHOWS_LIKE_GENERIC_REASON_PATTERNS.some((pattern) => pattern.test(reason));
  }

  function getShowsLikeReasonFocus(reason = {}) {
    const values = [...new Set(asArray(reason.values).map(normalizeText).filter(Boolean))];
    const joinedValues = joinHumanValues(values).toLowerCase();
    if (reason.dimension === "entity") {
      return joinedValues ? `the shared creative connection to ${joinedValues}` : "the shared creative connection";
    }

    switch (reason.dimension) {
      case "tone":
        return joinedValues ? `the ${joinedValues} atmosphere` : "the atmosphere";
      case "theme":
        return joinedValues ? `${joinedValues} subject matter` : "the same thematic territory";
      case "tag":
        return joinedValues ? `the ${joinedValues} thread` : "the same discovery thread";
      case "bestFor":
        return joinedValues ? `the ${joinedValues} listening context` : "a similar listening context";
      case "voiceStyle":
        return joinedValues ? `a ${joinedValues} voice style` : "a similar voice style";
      case "narrativeFocus":
        return joinedValues ? `a ${joinedValues} narrative focus` : "a similar narrative focus";
      case "intensity":
        return joinedValues ? `${joinedValues} intensity` : "a similar intensity";
      case "commitment":
        return joinedValues ? `a ${joinedValues} listening commitment` : "a similar listening commitment";
      case "setting":
        return joinedValues ? `a similar setting involving ${joinedValues}` : "a similar setting";
      case "storyStructure":
        return joinedValues ? `a similar ${joinedValues} storytelling approach` : "a similar storytelling approach";
      case "format":
        return joinedValues ? `the ${joinedValues} format` : "a similar format";
      case "genre":
        return joinedValues ? `the ${joinedValues} genre territory` : "the same genre territory";
      default:
        return normalizeText(reason.text).replace(/^[^:]+:\s*/, "").replace(/[.]+$/, "").toLowerCase();
    }
  }

  function buildShowsLikeComputedReason(anchor, target, match) {
    const anchorTitle = normalizeText(anchor?.title) || "the source show";
    const targetTitle = normalizeText(target?.title) || "This show";
    const supplementalReasons = asArray(match?.similarity?.collectionSignals).map((signal) => ({
      ...signal,
      dimension: signal.id,
      contribution: (Number(signal.strength) || 0) * (SHOWS_LIKE_SUPPLEMENTAL_FACTORS[signal.id] || 0),
    }));
    const reasonPriority = {
      entity: 0,
      tone: 1,
      theme: 2,
      tag: 3,
      setting: 4,
      bestFor: 5,
      voiceStyle: 6,
      narrativeFocus: 7,
      storyStructure: 8,
      intensity: 9,
      commitment: 10,
      format: 11,
      genre: 12,
    };
    const reasons = [...asArray(match?.reasons), ...supplementalReasons]
      .filter((reason) => reason && reason.dimension !== "editorial" && normalizeText(reason.text))
      .sort((left, right) => (reasonPriority[left.dimension] ?? 99) - (reasonPriority[right.dimension] ?? 99) || Number(right.contribution || 0) - Number(left.contribution || 0))
      .slice(0, 2);
    const focuses = reasons.map(getShowsLikeReasonFocus).filter(Boolean);
    if (focuses.length === 0) return "A metadata-supported archive match with more than one specific discovery signal.";
    if (focuses.length === 1) {
      return `If you liked ${anchorTitle} for ${focuses[0]}, ${targetTitle} follows that thread through a different story.`;
    }
    return `If you liked ${anchorTitle} for ${focuses[0]}, ${targetTitle} also offers ${focuses[1]}—a distinct route through the same listening appetite.`;
  }

  function getShowsLikeRecommendationSectionScore(recommendation) {
    const dimensions = asArray(recommendation?.similarity?.dimensions).filter((dimension) => (
      dimension?.matched && !["editorial", "ratingProfile"].includes(dimension.id)
    ));
    const dimensionIds = new Set(dimensions.map((dimension) => dimension.id));
    const evidenceText = [
      recommendation?.reason,
      ...dimensions.flatMap((dimension) => dimension.reasons?.flatMap((reason) => [reason.text, ...asArray(reason.values)]) || []),
      ...asArray(recommendation?.similarity?.collectionSignals).flatMap((signal) => [signal.text, ...asArray(signal.values)]),
    ]
      .map(normalizeText)
      .join(" ")
      .toLowerCase();
    const supplementalIds = new Set(asArray(recommendation?.similarity?.collectionSignals).map((signal) => signal.id));
    const scores = {
      characters: 0,
      atmosphere: 0,
      premise: 0,
      storytelling: 0,
    };

    if (dimensionIds.has("narrativeFocus") && /character-driven|character|relationship|family|ensemble|people|attachment/.test(evidenceText)) scores.characters += 4;
    if (dimensionIds.has("theme") && /character|relationship|family|identity|ensemble|people|attachment/.test(evidenceText)) scores.characters += 3;
    if (/character|relationship|family|ensemble|chemistry|personal stakes|people|attachment/.test(evidenceText)) scores.characters += 4;

    if (dimensionIds.has("tone")) scores.atmosphere += 4;
    if (dimensionIds.has("intensity")) scores.atmosphere += 2;
    if (/atmosphere|tone|dread|warm|dark|eerie|funny|weird|bleak|hopeful|menace|comfort/.test(evidenceText)) scores.atmosphere += 2;

    if (dimensionIds.has("theme")) scores.premise += 4;
    if (dimensionIds.has("tag")) scores.premise += 2;
    if (dimensionIds.has("genre")) scores.premise += 1;
    if (supplementalIds.has("setting")) scores.premise += 3;
    if (/premise|world|setting|cosmic|mystery|horror|science fiction|sci-fi|station|colony|mythology|investigation|conspiracy|journey/.test(evidenceText)) scores.premise += 2;

    if (dimensionIds.has("format")) scores.storytelling += 1;
    if (dimensionIds.has("voiceStyle")) scores.storytelling += 3;
    if (dimensionIds.has("commitment")) scores.storytelling += 2;
    if (dimensionIds.has("episodeLength")) scores.storytelling += 1;
    if (supplementalIds.has("storyStructure")) scores.storytelling += 3;
    if (/format|full-cast|narrat|record|case-file|anthology|documentary|radio|voice-led|episod|tape|dossier|call-in|voice|timing/.test(evidenceText)) scores.storytelling += 2;

    return scores;
  }

  function classifyShowsLikeRecommendation(recommendation) {
    if (recommendation?.source === "computed") return "hidden";
    const scores = getShowsLikeRecommendationSectionScore(recommendation);
    return SHOWS_LIKE_SECTION_DEFINITIONS
      .map((section, index) => ({ section, score: scores[section.id] || 0, index }))
      .filter((entry) => entry.score >= 3)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map((entry) => entry.section.id)[0] || "";
  }

  function createShowsLikeSections(authoredRecommendations, computedRecommendations) {
    const sectionsById = new Map();
    const closest = authoredRecommendations.slice(0, 3);
    const remainingAuthored = authoredRecommendations.slice(3);
    const buckets = new Map(SHOWS_LIKE_SECTION_DEFINITIONS.map((section) => [section.id, []]));

    remainingAuthored.forEach((recommendation) => {
      const sectionId = classifyShowsLikeRecommendation(recommendation);
      if (sectionId && buckets.has(sectionId)) buckets.get(sectionId).push(recommendation);
      else closest.push(recommendation);
    });

    const closeIds = new Set(closest.map((recommendation) => recommendation.show.id));
    buckets.forEach((recommendations, sectionId) => {
      if (recommendations.length < 2) {
        recommendations.forEach((recommendation) => {
          if (!closeIds.has(recommendation.show.id)) {
            closest.push(recommendation);
            closeIds.add(recommendation.show.id);
          }
        });
        return;
      }
      sectionsById.set(sectionId, recommendations);
    });

    const sections = [];
    if (closest.length > 0) {
      sections.push({
        id: "closest",
        label: "Closest overall",
        description: "The clearest next steps from this anchor, with the archive's written route leading.",
        recommendations: closest,
      });
    }
    SHOWS_LIKE_SECTION_DEFINITIONS.forEach((section) => {
      const recommendations = sectionsById.get(section.id);
      if (recommendations?.length) sections.push({ ...section, recommendations });
    });
    if (computedRecommendations.length > 0) {
      sections.push({
        id: "hidden-gems",
        label: "Less obvious picks",
        description: "Strong archive matches that open a different door into the same listening appetite.",
        recommendations: computedRecommendations,
      });
    }
    return sections;
  }

  function createSimilarityIndex({ shows = [], collections = [] } = {}) {
    const publicShows = asArray(shows).filter(isPublishedShow);
    const showById = new Map(publicShows.filter((show) => normalizeText(show.id)).map((show) => [show.id, show]));
    const publicCollections = asArray(collections)
      .filter((collection) => CURATED_COLLECTION_KINDS.has(collection?.kind))
      .map((collection) => ({
        ...collection,
        id: normalizeText(collection.id),
        title: normalizeText(collection.title) || normalizeText(collection.id),
        showIds: asArray(collection.showIds).map(normalizeText),
      }))
      .filter((collection) => collection.id);
    const similarityCollections = publicCollections.filter((collection) => collection.kind === "similarity");
    const collectionsByShow = new Map(publicShows.map((show) => [show.id, []]));
    const collectionFrequencies = new Map();
    const identityIndex = createIdentityIndex(publicShows);

    publicCollections.forEach((collection) => {
      const memberIds = new Set(collection.showIds);
      memberIds.forEach((showId) => {
        if (collectionsByShow.has(showId)) {
          collectionsByShow.get(showId).push(collection);
          collectionFrequencies.set(collection.id, (collectionFrequencies.get(collection.id) || 0) + 1);
        }
      });
    });

    const context = {
      showCount: publicShows.length,
      frequencies: createFrequencyIndex(publicShows),
      similarityCollections: similarityCollections.map((collection) => ({
        ...collection,
      })),
      collectionsByShow,
      collectionFrequencies,
      identityKeysByShow: identityIndex.identityKeysByShow,
      showsByIdentityKey: identityIndex.showsByIdentityKey,
    };
    context.coverageDefinitions = DIMENSION_DEFINITIONS.filter((definition) => definition.coverageEligible);
    context.coverageDefinitionIds = new Set(
      getActiveCoverageDefinitions(publicShows, context).map((definition) => definition.id),
    );
    context.metadataCoverageDenominatorWeight = context.coverageDefinitions
      .filter((definition) => context.coverageDefinitionIds.has(definition.id))
      .reduce((total, definition) => total + definition.weight, 0);
    const publicMatchCache = new Map();

    function compare(sourceOrId, targetOrId) {
      const source = typeof sourceOrId === "string" ? showById.get(sourceOrId) : sourceOrId;
      const target = typeof targetOrId === "string" ? showById.get(targetOrId) : targetOrId;
      return compareShows(source, target, context);
    }

    function getEditorialSimilarityMatches(sourceOrId, options = {}) {
      const source = typeof sourceOrId === "string" ? showById.get(sourceOrId) : sourceOrId;
      if (!source || !normalizeText(source.id)) return [];

      const requestedLimit = Number(options.limit);
      const limit = Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 24);
      const matches = [];
      const seen = new Set();

      const addMatch = (neighbor, reason, direction) => {
        if (!neighbor || neighbor.id === source.id || seen.has(neighbor.id)) return;
        const text = normalizeText(reason) || "Explicit catalog similarity link.";
        seen.add(neighbor.id);
        matches.push({ show: neighbor, reason: text, direction });
      };

      asArray(source.similarTo).forEach((id) => {
        const neighbor = showById.get(normalizeText(id));
        addMatch(neighbor, source.similarReasons?.[neighbor?.id], "source-to-target");
      });

      similarityCollections.forEach((collection) => {
        const anchorId = normalizeText(collection.anchorShowId);
        const memberIds = asArray(collection.showIds).map(normalizeText).filter(Boolean);
        if (anchorId === source.id) {
          memberIds.forEach((memberId) => {
            const neighbor = showById.get(memberId);
            addMatch(
              neighbor,
              collection.showReasons?.[memberId] || `Included in ${collection.title}.`,
              "similarity-collection",
            );
          });
        } else if (memberIds.includes(source.id)) {
          const neighbor = showById.get(anchorId);
          addMatch(
            neighbor,
            collection.showReasons?.[source.id] || `Included in ${collection.title}.`,
            "similarity-collection",
          );
        }
      });

      publicShows
        .filter((candidate) => candidate.id !== source.id && asArray(candidate.similarTo).map(normalizeText).includes(source.id))
        .sort((left, right) => String(left.title || left.id).localeCompare(String(right.title || right.id), "en") || left.id.localeCompare(right.id, "en"))
        .forEach((neighbor) => addMatch(neighbor, neighbor.similarReasons?.[source.id], "target-to-source"));

      return matches.slice(0, limit);
    }

    function getSimilarShows(sourceOrId, options = {}) {
      const source = typeof sourceOrId === "string" ? showById.get(sourceOrId) : sourceOrId;
      if (!source || !normalizeText(source.id)) return [];

      const requestedLimit = Number(options.limit);
      const limit = Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 8);
      const requestedMinimumScore = Number(options.minimumScore);
      const minimumScore = Number.isFinite(requestedMinimumScore)
        ? requestedMinimumScore
        : (createRecordMetadataCoverage(source, context).metadataCoverage < MATCH_POLICY.sparseCoverageThreshold
          ? MATCH_POLICY.sparseMinimumScore
          : MATCH_POLICY.minimumScore);
      const requestedMinimumMetadataDimensions = Number(options.minimumMetadataDimensions);
      const minimumMetadataDimensions = Math.max(
        0,
        Number.isFinite(requestedMinimumMetadataDimensions)
          ? requestedMinimumMetadataDimensions
          : MATCH_POLICY.minimumMetadataDimensions,
      );
      const requestedMinimumAnchorDimensions = Number(options.minimumAnchorDimensions);
      const minimumAnchorDimensions = Math.max(
        0,
        Number.isFinite(requestedMinimumAnchorDimensions)
          ? requestedMinimumAnchorDimensions
          : MATCH_POLICY.minimumAnchorDimensions,
      );
      const includePartial = options.includePartial === true;

      return publicShows
        .filter((candidate) => candidate.id !== source.id)
        .map((candidate) => ({ show: candidate, similarity: compareShows(source, candidate, context) }))
        .filter(({ similarity }) => {
          if (!similarity) return false;
          if (includePartial) return similarity.score > 0;
          const anchorMatches = similarity.dimensions.filter((dimension) => dimension.anchor && dimension.matched);
          return similarity.curatedEvidence || (
            similarity.score >= minimumScore
            && similarity.metadataMatches.length >= minimumMetadataDimensions
            && anchorMatches.length >= minimumAnchorDimensions
          );
        })
        .sort((left, right) => {
          const scoreDifference = right.similarity.score - left.similarity.score;
          if (scoreDifference !== 0) return scoreDifference;
          const coverageDifference = right.similarity.metadataCoverage - left.similarity.metadataCoverage;
          if (coverageDifference !== 0) return coverageDifference;
          return String(left.show.title || left.show.id).localeCompare(String(right.show.title || right.show.id), "en") || left.show.id.localeCompare(right.show.id, "en");
        })
        .slice(0, limit);
    }

    function getPublicSimilarityMatches(sourceOrId, options = {}) {
      const source = typeof sourceOrId === "string" ? showById.get(sourceOrId) : sourceOrId;
      if (!source || !normalizeText(source.id)) return [];

      const requestedLimit = Number(options.limit);
      const requestedMaximumResults = Number(options.maximumResults);
      const maximumResults = Math.max(
        PUBLIC_MATCH_POLICY.maximumResults,
        Number.isFinite(requestedMaximumResults) ? requestedMaximumResults : PUBLIC_MATCH_POLICY.maximumResults,
      );
      const limit = Math.min(
        maximumResults,
        Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : PUBLIC_MATCH_POLICY.maximumResults),
      );
      const diversify = options.diversify !== false;
      const cacheKey = `${source.id}:${limit}:${maximumResults}:${diversify ? "diverse" : "ranked"}`;
      if (publicMatchCache.has(cacheKey)) return publicMatchCache.get(cacheKey);
      const sourceCoverage = createRecordMetadataCoverage(source, context).metadataCoverage;
      const sparseSource = sourceCoverage < PUBLIC_MATCH_POLICY.sparseCoverageThreshold;
      const minimumScore = sparseSource ? PUBLIC_MATCH_POLICY.sparseMinimumScore : PUBLIC_MATCH_POLICY.minimumScore;
      const minimumMetadataCoverage = sparseSource
        ? PUBLIC_MATCH_POLICY.sparseMinimumMetadataCoverage
        : PUBLIC_MATCH_POLICY.minimumMetadataCoverage;
      const minimumRecordMetadataCoverage = sparseSource
        ? PUBLIC_MATCH_POLICY.sparseMinimumRecordMetadataCoverage
        : PUBLIC_MATCH_POLICY.minimumRecordMetadataCoverage;
      const candidates = getSimilarShows(source.id, {
        limit: publicShows.length,
        minimumScore,
        minimumMetadataDimensions: PUBLIC_MATCH_POLICY.minimumMetadataDimensions,
        minimumAnchorDimensions: PUBLIC_MATCH_POLICY.minimumAnchorDimensions,
      });

      const matches = candidates
        .filter(({ show, similarity }) => {
          if (similarity.curatedEvidence) return false;
          if (similarity.metadataCoverage < minimumMetadataCoverage) return false;
          if (similarity.sourceMetadataCoverage < minimumRecordMetadataCoverage) return false;
          if (similarity.targetMetadataCoverage < minimumRecordMetadataCoverage) return false;

          const specificMatches = similarity.metadataMatches.filter((id) => PUBLIC_SPECIFIC_DIMENSION_SET.has(id));
          if (specificMatches.length < PUBLIC_MATCH_POLICY.minimumSpecificDimensions) return false;

          if (Number(similarity.catalogShowCount || 0) < 10) return true;

          const distinctiveSpecificMatches = similarity.dimensions.filter((dimension) => (
            PUBLIC_SPECIFIC_DIMENSION_SET.has(dimension.id)
            && dimension.matched
            && Number(dimension.distinctiveness || 0) >= PUBLIC_MATCH_POLICY.minimumSpecificDistinctiveness
          ));
          return distinctiveSpecificMatches.length >= PUBLIC_MATCH_POLICY.minimumDistinctiveSpecificDimensions;
        });
      const diverseMatches = diversify
        ? selectDiverseCandidates(matches, limit)
        : matches.sort(compareCandidateOrder).slice(0, limit);

      const publicMatches = diverseMatches
        .map(({ show, similarity }) => ({
          show,
          similarity,
          reasons: getPublicSimilarityReasons(similarity),
          explanation: buildPublicSimilarityExplanation(similarity),
          confidence: similarity.sourceMetadataCoverage < PUBLIC_MATCH_POLICY.sparseCoverageThreshold
            || similarity.targetMetadataCoverage < PUBLIC_MATCH_POLICY.sparseCoverageThreshold
            ? "limited-metadata"
            : "strong-metadata",
        }))
        .filter((entry) => entry.explanation)
        .slice(0, limit);
      publicMatchCache.set(cacheKey, publicMatches);
      return publicMatches;
    }

    function getShowsLikeCollectionView(sourceOrId, collection = {}, options = {}) {
      const anchorId = normalizeText(collection.anchorShowId) || (typeof sourceOrId === "string" ? normalizeText(sourceOrId) : normalizeText(sourceOrId?.id));
      const anchor = showById.get(anchorId);
      if (!anchor || collection.kind !== "similarity") return null;

      const authoredIds = new Set(asArray(collection.showIds).map(normalizeText).filter(Boolean));
      const seen = new Set();
      const authoredRecommendations = [];
      const addAuthoredRecommendation = (show, reason, sourceOrder = authoredRecommendations.length) => {
        if (!show || show.id === anchor.id || seen.has(show.id) || !isUsefulShowsLikeReason(reason)) return;
        const similarity = compareShows(anchor, show, context);
        if (!similarity || similarity.nearDuplicate) return;
        const metrics = getShowsLikeRecommendationMetrics(similarity);
        seen.add(show.id);
        authoredRecommendations.push({
          show,
          reason: normalizeText(reason),
          source: "authored",
          similarity,
          sourceOrder,
          ...metrics,
          confidence: "authored",
        });
      };

      asArray(collection.showIds).forEach((showId, sourceOrder) => {
        const id = normalizeText(showId);
        const show = showById.get(id);
        const reason = normalizeText(collection.showReasons?.[id]) || normalizeText(anchor.similarReasons?.[id]);
        addAuthoredRecommendation(show, reason, sourceOrder);
      });

      if (options.includeDirectRelationships === true && authoredRecommendations.length < 4) {
        asArray(anchor.similarTo).forEach((showId, offset) => {
          const id = normalizeText(showId);
          const show = showById.get(id);
          if (!authoredIds.has(id)) addAuthoredRecommendation(show, anchor.similarReasons?.[id], authoredRecommendations.length + offset);
        });
      }

      const rankedAuthoredRecommendations = selectDiverseShowsLikeCandidates(
        authoredRecommendations,
        authoredRecommendations.length,
      );
      const fallbackSlots = Math.max(0, SHOWS_LIKE_TARGET_COUNT - rankedAuthoredRecommendations.length);
      const computedRecommendations = fallbackSlots > 0
        ? selectDiverseShowsLikeCandidates(
          getPublicSimilarityMatches(anchor.id, {
            limit: publicShows.length,
            maximumResults: publicShows.length,
            diversify: false,
          })
            .filter((match) => {
              if (!match?.show || authoredIds.has(match.show.id) || seen.has(match.show.id) || match.similarity?.nearDuplicate) return false;
              const discoveryReasons = asArray(match.reasons).filter((reason) => DISCOVERY_DIMENSION_SET.has(reason.dimension));
              return discoveryReasons.length >= 2 && normalizeText(match.explanation);
            })
            .map((match, sourceOrder) => {
              const metrics = getShowsLikeRecommendationMetrics(match.similarity);
              return {
                show: match.show,
                reason: buildShowsLikeComputedReason(anchor, match.show, match),
                source: "computed",
                similarity: match.similarity,
                confidence: match.confidence,
                evidence: match.reasons,
                sourceOrder,
                ...metrics,
              };
            }),
          fallbackSlots,
        ).map((recommendation) => {
          seen.add(recommendation.show.id);
          return recommendation;
        })
        : [];

      const sections = createShowsLikeSections(rankedAuthoredRecommendations, computedRecommendations);
      return {
        anchor,
        authoredCount: rankedAuthoredRecommendations.length,
        computedCount: computedRecommendations.length,
        recommendations: sections.flatMap((section) => section.recommendations),
        sections,
      };
    }

    function getMetadataProfile(sourceOrId) {
      const source = typeof sourceOrId === "string" ? showById.get(sourceOrId) : sourceOrId;
      if (!source) return null;
      return createRecordMetadataCoverage(source, context);
    }

    return {
      shows: publicShows,
      collections: publicCollections,
      compare,
      getEditorialSimilarityMatches,
      getSimilarShows,
      getPublicSimilarityMatches,
      getShowsLikeCollectionView,
      getMetadataProfile,
      fieldFrequencies: context.frequencies,
      dimensions: DIMENSION_DEFINITIONS,
      metadataScoreWeight: METADATA_SCORE_WEIGHT,
      metadataCoverageDenominatorWeight: context.metadataCoverageDenominatorWeight,
    };
  }

  return {
    DIMENSION_DEFINITIONS,
    METADATA_SCORE_WEIGHT,
    SCORE_MAX,
    MATCH_POLICY,
    PUBLIC_MATCH_POLICY,
    PUBLIC_SPECIFIC_DIMENSION_IDS,
    buildPublicSimilarityExplanation,
    createSimilarityIndex,
    compareShows,
    getPublicSimilarityReasons,
    displayValue,
    normalizeValue,
  };
});
