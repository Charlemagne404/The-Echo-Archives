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

  // These weights are deliberately conservative. The score is a ranking aid,
  // not a claim that two shows are interchangeable. Editorial links are kept
  // separate from metadata overlap and ratings are evidence-only.
  const DIMENSION_DEFINITIONS = Object.freeze([
    { id: "editorial", label: "Curated relationship", weight: 30, coverageEligible: false },
    { id: "entity", label: "Shared creator or entity", weight: 13, coverageEligible: true },
    { id: "genre", field: "genres", label: "Shared genre", weight: 11, coverageEligible: true },
    { id: "format", field: "formats", label: "Shared format", weight: 9, coverageEligible: true },
    { id: "tone", field: "tones", label: "Shared tone", weight: 7, coverageEligible: true },
    { id: "theme", field: "themes", label: "Shared theme", weight: 6, coverageEligible: true },
    { id: "tag", field: "tags", label: "Shared discovery tag", weight: 4, coverageEligible: true },
    { id: "bestFor", field: "bestFor", label: "Shared listening context", weight: 3, coverageEligible: true },
    { id: "voiceStyle", path: "discovery.voiceStyle", label: "Shared voice style", weight: 4, coverageEligible: true },
    { id: "narrativeFocus", path: "discovery.narrativeFocus", label: "Shared narrative focus", weight: 4, coverageEligible: true },
    { id: "intensity", path: "discovery.intensity", fallbackPath: "content.intensity", label: "Shared intensity", weight: 3, coverageEligible: true },
    { id: "commitment", path: "discovery.commitment", label: "Shared listening commitment", weight: 3, coverageEligible: true },
    { id: "sharedCollection", label: "Shared curated collection", weight: 1, coverageEligible: false },
    { id: "episodeLength", label: "Similar episode length", weight: 2, coverageEligible: true },
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

  function getRatingNumber(value) {
    const number = typeof value === "number" ? value : Number(String(value || "").trim());
    return Number.isFinite(number) && number >= 0 && number <= 10 ? number : null;
  }

  function getAverageEpisodeMinutes(show) {
    return getNumeric(show?.length?.avgEpisodeMinutes) || getNumeric(show?.length?.medianEpisodeMinutes);
  }

  function getEntityEntries(show) {
    if (Array.isArray(show?.resolvedEntities) && show.resolvedEntities.length > 0) {
      return show.resolvedEntities
        .map((entity) => ({
          id: normalizeText(entity?.id),
          name: normalizeText(entity?.name) || normalizeText(entity?.id),
          role: normalizeText(entity?.role),
        }))
        .filter((entity) => entity.id && ENTITY_ROLE_LABELS[entity.role]);
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

    shows.forEach((show) => {
      definitions.forEach((definition) => {
        const seen = new Set(normalizeSetValues(getDefinitionValues(show, definition)).keys());
        seen.forEach((key) => frequencies[definition.id].set(key, (frequencies[definition.id].get(key) || 0) + 1));
      });
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

  function createEntityDimension(source, target) {
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
    const contribution = definition.weight * strongestRole.factor;

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

    return createDimensionBase(definition, {
      available: true,
      matched: true,
      contribution: definition.weight,
      reasons: shared.slice(0, 3).map((collection) => ({
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

  function createEpisodeLengthDimension(source, target) {
    const definition = DIMENSION_BY_ID.get("episodeLength");
    const left = getAverageEpisodeMinutes(source);
    const right = getAverageEpisodeMinutes(target);
    const available = left !== null && right !== null;

    if (!available) return createDimensionBase(definition, { available });

    const closeness = clamp(1 - (Math.abs(left - right) / Math.max(left, right, 1)));
    const matched = closeness >= 0.6;
    return createDimensionBase(definition, {
      available: true,
      matched,
      contribution: matched ? round(definition.weight * closeness) : 0,
      reasons: matched ? [{
        code: "episodeLength",
        label: definition.label,
        source: "length.avgEpisodeMinutes",
        values: [`${left} minutes`, `${right} minutes`],
        text: `Similar average episode length: ${left} vs ${right} minutes.`,
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

    const dimensions = [
      createEditorialDimension(source, target, comparisonContext),
      createEntityDimension(source, target),
      ...DIMENSION_DEFINITIONS
        .filter((definition) => definition.field || definition.path)
        .map((definition) => createSetDimension(definition, source, target, comparisonContext)),
      createEpisodeLengthDimension(source, target),
      createSharedCollectionDimension(source, target, comparisonContext),
      createRatingDimension(source, target),
    ];
    const score = round(dimensions.reduce((total, dimension) => total + dimension.contribution, 0), 1);
    const metadataDimensions = dimensions.filter((dimension) => dimension.coverageEligible);
    const metadataAvailableWeight = metadataDimensions
      .filter((dimension) => dimension.available)
      .reduce((total, dimension) => total + dimension.weight, 0);
    const metadataMatches = metadataDimensions.filter((dimension) => dimension.matched);
    const reasons = dimensions
      .flatMap((dimension) => dimension.reasons.map((reason) => ({ ...reason, dimension: dimension.id, contribution: dimension.contribution })))
      .sort((left, right) => right.contribution - left.contribution || left.dimension.localeCompare(right.dimension) || left.text.localeCompare(right.text));

    return {
      sourceId: source.id,
      targetId: target.id,
      score,
      maxScore: SCORE_MAX,
      metadataCoverage: round(metadataAvailableWeight / Math.max(METADATA_SCORE_WEIGHT, 1), 3),
      metadataAvailableWeight,
      metadataMatches: metadataMatches.map((dimension) => dimension.id),
      curatedEvidence: dimensions.find((dimension) => dimension.id === "editorial")?.matched === true,
      dimensions,
      reasons,
    };
  }

  function createSimilarityIndex({ shows = [], collections = [] } = {}) {
    const publicShows = asArray(shows).filter(isPublishedShow);
    const showById = new Map(publicShows.filter((show) => normalizeText(show.id)).map((show) => [show.id, show]));
    const publicCollections = asArray(collections).filter((collection) => CURATED_COLLECTION_KINDS.has(collection?.kind));
    const similarityCollections = publicCollections.filter((collection) => collection.kind === "similarity");
    const collectionsByShow = new Map(publicShows.map((show) => [show.id, []]));

    publicCollections.forEach((collection) => {
      const normalized = {
        ...collection,
        id: normalizeText(collection.id),
        title: normalizeText(collection.title) || normalizeText(collection.id),
      };
      asArray(collection.showIds).forEach((showId) => {
        if (collectionsByShow.has(showId)) collectionsByShow.get(showId).push(normalized);
      });
    });

    const context = {
      showCount: publicShows.length,
      frequencies: createFrequencyIndex(publicShows),
      similarityCollections: similarityCollections.map((collection) => ({
        ...collection,
        id: normalizeText(collection.id),
        title: normalizeText(collection.title) || normalizeText(collection.id),
      })),
      collectionsByShow,
    };

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
      const minimumScore = Number.isFinite(requestedMinimumScore) ? requestedMinimumScore : 12;
      const requestedMinimumMetadataDimensions = Number(options.minimumMetadataDimensions);
      const minimumMetadataDimensions = Math.max(
        0,
        Number.isFinite(requestedMinimumMetadataDimensions) ? requestedMinimumMetadataDimensions : 2,
      );
      const includePartial = options.includePartial === true;

      return publicShows
        .filter((candidate) => candidate.id !== source.id)
        .map((candidate) => ({ show: candidate, similarity: compareShows(source, candidate, context) }))
        .filter(({ similarity }) => {
          if (!similarity) return false;
          if (includePartial) return similarity.score > 0;
          return similarity.curatedEvidence || (
            similarity.score >= minimumScore && similarity.metadataMatches.length >= minimumMetadataDimensions
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

    return {
      shows: publicShows,
      collections: publicCollections,
      compare,
      getSimilarShows,
      fieldFrequencies: context.frequencies,
      dimensions: DIMENSION_DEFINITIONS,
    };
  }

  return {
    DIMENSION_DEFINITIONS,
    SCORE_MAX,
    createSimilarityIndex,
    compareShows,
    displayValue,
    normalizeValue,
  };
});
