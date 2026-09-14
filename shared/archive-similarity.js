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

  // These weights are deliberately conservative. The score is a ranking aid,
  // not a claim that two shows are interchangeable. Editorial links are kept
  // separate from metadata overlap and ratings are evidence-only.
  const DIMENSION_DEFINITIONS = Object.freeze([
    { id: "editorial", label: "Curated relationship", weight: 30, coverageEligible: false },
    { id: "entity", label: "Shared creator or entity", weight: 14, coverageEligible: true, anchor: true },
    { id: "genre", field: "genres", label: "Shared genre", weight: 10, coverageEligible: true },
    { id: "format", field: "formats", label: "Shared format", weight: 10, coverageEligible: true, anchor: true },
    { id: "tone", field: "tones", label: "Shared tone", weight: 5, coverageEligible: true, coverageGroup: "discovery" },
    { id: "theme", field: "themes", label: "Shared theme", weight: 5, coverageEligible: true, coverageGroup: "discovery" },
    { id: "tag", field: "tags", label: "Shared discovery tag", weight: 3, coverageEligible: true, coverageGroup: "discovery" },
    { id: "bestFor", field: "bestFor", label: "Shared listening context", weight: 3, coverageEligible: true, coverageGroup: "discovery" },
    { id: "voiceStyle", path: "discovery.voiceStyle", label: "Shared voice style", weight: 2, coverageEligible: true, coverageGroup: "discovery" },
    { id: "narrativeFocus", path: "discovery.narrativeFocus", label: "Shared narrative focus", weight: 3, coverageEligible: true, coverageGroup: "discovery" },
    { id: "intensity", path: "discovery.intensity", fallbackPath: "content.intensity", label: "Shared intensity", weight: 2, coverageEligible: true, coverageGroup: "discovery" },
    { id: "commitment", path: "discovery.commitment", label: "Shared listening commitment", weight: 2, coverageEligible: true, coverageGroup: "discovery" },
    { id: "releaseProfile", label: "Shared release or completion state", weight: 3, coverageEligible: true, anchor: true },
    { id: "sharedCollection", label: "Shared curated collection", weight: 2, coverageEligible: true, anchor: true },
    { id: "episodeLength", label: "Similar episode length", weight: 4, coverageEligible: true, anchor: true },
    { id: "catalogLength", label: "Similar catalogue size", weight: 2, coverageEligible: true, anchor: true },
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

  function signalDistinctiveness(frequency, showCount) {
    const total = Math.max(1, Number(showCount) || 1);
    const count = Math.max(0, Number(frequency) || 0);
    if (count <= 0) return 1;
    return clamp(Math.log((total + 1) / (count + 1)) / Math.log(total + 1));
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
    const distinctivenessFactor = 0.35 + (0.65 * distinctiveness);
    const contribution = definition.weight * overlapRatio * distinctivenessFactor;
    const values = sharedKeys.map((key) => displayValue(leftValues.get(key) || rightValues.get(key))).filter(Boolean);

    return createDimensionBase(definition, {
      available: true,
      matched: contribution > 0,
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
    const distinctivenessFactor = 0.45 + (0.55 * distinctiveness);
    const contribution = definition.weight * strongestRole.factor * distinctivenessFactor;

    return createDimensionBase(definition, {
      available: true,
      matched: true,
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
    const distinctivenessFactor = 0.4 + (0.6 * distinctiveness);
    const overlapFactor = 0.65 + (0.35 * clamp(shared.length / 2));
    const contribution = definition.weight * overlapFactor * distinctivenessFactor;
    const sortedShared = [...shared].sort((leftCollection, rightCollection) => leftCollection.id.localeCompare(rightCollection.id, "en"));

    return createDimensionBase(definition, {
      available: true,
      matched: true,
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
    const distinctivenessFactor = 0.35 + (0.65 * distinctiveness);
    const contribution = definition.weight * distinctivenessFactor;
    const label = RELEASE_STATE_LABELS[left] || displayValue(left);

    return createDimensionBase(definition, {
      available: true,
      matched: contribution > 0,
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
      ? context
      : {
        showCount: 2,
        frequencies: createFrequencyIndex([source, target]),
        similarityCollections: [],
        collectionsByShow: new Map([[source.id, []], [target.id, []]]),
      };

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
      score,
      maxScore: SCORE_MAX,
      metadataCoverage: metadataCoverage.metadataCoverage,
      metadataAvailableWeight: metadataCoverage.metadataAvailableWeight,
      metadataDenominatorWeight: metadataCoverage.metadataDenominatorWeight,
      sourceMetadataCoverage: metadataCoverage.sourceMetadataCoverage,
      targetMetadataCoverage: metadataCoverage.targetMetadataCoverage,
      sourceMetadataAvailableWeight: metadataCoverage.sourceMetadataAvailableWeight,
      targetMetadataAvailableWeight: metadataCoverage.targetMetadataAvailableWeight,
      metadataAvailableDimensions: metadataCoverage.metadataAvailableDimensions,
      metadataMissingDimensions: metadataCoverage.metadataMissingDimensions,
      metadataCoverageByDimension: metadataCoverage.metadataCoverageByDimension,
      metadataMatches: metadataMatches.map((dimension) => dimension.id),
      curatedEvidence: dimensions.find((dimension) => dimension.id === "editorial")?.matched === true,
      dimensions,
      reasons,
    };
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
    };
    context.coverageDefinitions = DIMENSION_DEFINITIONS.filter((definition) => definition.coverageEligible);
    context.coverageDefinitionIds = new Set(
      getActiveCoverageDefinitions(publicShows, context).map((definition) => definition.id),
    );
    context.metadataCoverageDenominatorWeight = context.coverageDefinitions
      .filter((definition) => context.coverageDefinitionIds.has(definition.id))
      .reduce((total, definition) => total + definition.weight, 0);

    function compare(sourceOrId, targetOrId) {
      const source = typeof sourceOrId === "string" ? showById.get(sourceOrId) : sourceOrId;
      const target = typeof targetOrId === "string" ? showById.get(targetOrId) : targetOrId;
      return compareShows(source, target, context);
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

    function getMetadataProfile(sourceOrId) {
      const source = typeof sourceOrId === "string" ? showById.get(sourceOrId) : sourceOrId;
      if (!source) return null;
      return createRecordMetadataCoverage(source, context);
    }

    return {
      shows: publicShows,
      collections: publicCollections,
      compare,
      getSimilarShows,
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
    createSimilarityIndex,
    compareShows,
    displayValue,
    normalizeValue,
  };
});
