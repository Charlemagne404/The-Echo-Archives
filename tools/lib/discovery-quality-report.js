const {
  MIN_PUBLISHED_DESCRIPTION_LENGTH,
  isPlaceholderDescription,
} = require("../../shared/archive-quality");

const IMPORTED_REVIEW_STATUS = "imported";
const EDITORIAL_REVIEW_STATUSES = new Set(["full-review", "spotlight"]);
const DEFAULT_SAMPLE_LIMIT = 12;
const DEFAULT_BAND_FRACTION = 0.1;
const NON_INFORMATIONAL_VALUES = new Set([
  "n/a",
  "na",
  "none",
  "not applicable",
  "not verified",
  "unknown",
]);

const DISCOVERY_FACET_DEFINITIONS = Object.freeze([
  { id: "tones", label: "Tones", values: (show) => show.tones },
  { id: "tags", label: "Tags", values: (show) => show.tags },
  { id: "bestFor", label: "Best-for routes", values: (show) => show.bestFor },
  { id: "similarTo", label: "Similar shows", values: (show) => show.similarTo },
]);

const RICHNESS_DIMENSIONS = Object.freeze([
  { id: "description", label: "useful description", test: ({ show }) => hasUsefulDescription(show) },
  { id: "genres", label: "genre", test: ({ show }) => hasUsableArray(show.genres) },
  { id: "formats", label: "format", test: ({ show }) => hasUsableArray(show.formats) },
  { id: "tones", label: "tone", test: ({ show }) => hasUsableArray(show.tones) },
  { id: "tags", label: "discovery tag", test: ({ show }) => hasUsableArray(show.tags) },
  { id: "bestFor", label: "best-for route", test: ({ show }) => hasUsableArray(show.bestFor) },
  {
    id: "themesOrContentNotes",
    label: "themes or content notes",
    test: ({ show }) => hasUsableArray(show.themes) || hasUsableArray(show.contentNotes),
  },
  { id: "similarTo", label: "similar-show links", test: ({ show }) => hasUsableArray(show.similarTo) },
  { id: "length", label: "runtime", test: ({ show }) => hasUsefulLength(show) },
  { id: "listenLinks", label: "listen link", test: ({ show }) => hasUsefulObject(show.listenLinks) },
  { id: "officialLinks", label: "official link", test: ({ show }) => hasUsefulObject(show.officialLinks) },
  { id: "credits", label: "credits", test: ({ show }) => hasUsefulValue(show.credits) },
  { id: "objectiveSources", label: "objective source provenance", test: ({ show }) => hasObjectiveSources(show) },
  { id: "discoveryProfile", label: "curated discovery profile", test: ({ show }) => hasUsefulObject(show.discovery) },
  {
    id: "entityLinks",
    label: "entity relationship",
    test: ({ show, entityGraph }) => (entityGraph.showLinksById.get(show.id) || []).length > 0,
  },
  {
    id: "collections",
    label: "collection membership",
    test: ({ show, collectionCoverage }) => (collectionCoverage.byShowId.get(show.id) || 0) > 0,
  },
  { id: "archiveRating", label: "archive rating", test: ({ show }) => hasArchiveRating(show) },
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function isMeaningfulScalar(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;

  const text = value.trim();
  return Boolean(text) && !NON_INFORMATIONAL_VALUES.has(text.toLowerCase());
}

function hasUsefulValue(value) {
  if (Array.isArray(value)) return value.some(hasUsefulValue);
  if (value && typeof value === "object") return Object.values(value).some(hasUsefulValue);
  return isMeaningfulScalar(value);
}

function hasUsableArray(value) {
  return Array.isArray(value) && value.some(hasUsefulValue);
}

function hasUsefulObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && hasUsefulValue(value));
}

function hasUsefulDescription(show = {}) {
  const description = normalizeText(show.description);
  return description.length >= MIN_PUBLISHED_DESCRIPTION_LENGTH && !isPlaceholderDescription(show.title, description);
}

function hasUsefulLength(show = {}) {
  const length = show.length && typeof show.length === "object" ? show.length : {};
  const numericFields = [
    "seasons",
    "episodes",
    "avgEpisodeMinutes",
    "medianEpisodeMinutes",
    "totalHours",
    "totalObservedHours",
  ];

  return numericFields.some((fieldName) => Number.isFinite(Number(length[fieldName])) && Number(length[fieldName]) > 0)
    || (normalizeText(length.label).length >= 4 && isMeaningfulScalar(length.label));
}

function hasObjectiveSources(show = {}) {
  return Array.isArray(show.metadata?.objectiveSources)
    && show.metadata.objectiveSources.some((value) => /^https?:\/\//i.test(normalizeText(value)));
}

function isFiniteNumeric(value) {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && Boolean(value.trim()) && Number.isFinite(Number(value));
}

function hasArchiveRating(show = {}) {
  return isFiniteNumeric(show.ratings?.archive);
}

function hasAnyRating(show = {}) {
  return Boolean(show.ratings && typeof show.ratings === "object" && Object.values(show.ratings).some(isFiniteNumeric));
}

function getPublishedShows(shows = []) {
  return (Array.isArray(shows) ? shows : []).filter((show) => show && show.status === "published");
}

function getEnrichmentEligibleShows(publishedShows = []) {
  return publishedShows.filter((show) => show.reviewStatus !== IMPORTED_REVIEW_STATUS);
}

function getEditorialShows(publishedShows = []) {
  return publishedShows.filter((show) => EDITORIAL_REVIEW_STATUSES.has(show.reviewStatus));
}

function getLatestCatalogUpdate(shows = [], collections = []) {
  return [
    ...(Array.isArray(shows) ? shows : []).map((show) => normalizeText(show?.updatedAt)),
    ...(Array.isArray(collections) ? collections : []).map((collection) => normalizeText(collection?.updatedAt)),
  ].filter(Boolean).sort().at(-1) || null;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentage(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return round((numerator / denominator) * 100, 1);
}

function coverageResult(numerator, denominator, scope) {
  return {
    numerator,
    denominator,
    percentage: percentage(numerator, denominator),
    scope,
  };
}

function valueResult(value, unit, scope) {
  return {
    value: round(value, unit === "average" ? 2 : 1),
    unit,
    scope,
  };
}

function buildCollectionCoverage(shows = [], collections = []) {
  const publishedShows = getPublishedShows(shows);
  const allShowIds = new Set((Array.isArray(shows) ? shows : []).map((show) => show?.id).filter(Boolean));
  const publishedShowIds = new Set(publishedShows.map((show) => show.id));
  const byShowId = new Map(publishedShows.map((show) => [show.id, 0]));
  const invalidReferences = [];
  const collectionSizes = [];

  (Array.isArray(collections) ? collections : []).forEach((collection) => {
    const seen = new Set();
    let publishedMemberCount = 0;
    (Array.isArray(collection?.showIds) ? collection.showIds : []).forEach((showIdValue) => {
      const showId = normalizeText(showIdValue);
      if (!showId || !publishedShowIds.has(showId)) {
        if (showId) {
          invalidReferences.push({
            collectionId: collection?.id || "",
            showId,
            reason: allShowIds.has(showId) ? "not-published" : "unknown-show",
          });
        }
        return;
      }

      if (seen.has(showId)) return;
      seen.add(showId);
      publishedMemberCount += 1;
      byShowId.set(showId, byShowId.get(showId) + 1);
    });

    collectionSizes.push({
      id: collection?.id || "",
      title: collection?.title || collection?.id || "Untitled collection",
      count: publishedMemberCount,
      publishedShowIds: [...seen],
      intentTags: hasUsableArray(collection?.intentTags),
    });
  });

  const distribution = new Map();
  byShowId.forEach((count) => distribution.set(count, (distribution.get(count) || 0) + 1));
  const nonEmptyCollections = collectionSizes.filter((collection) => collection.count > 0);
  const collectionsById = new Map((Array.isArray(collections) ? collections : []).map((collection) => [collection?.id, collection]));
  const collectionsWithReasons = collectionSizes.filter((collection) => {
    const source = collectionsById.get(collection.id) || {};
    const reasons = source.showReasons && typeof source.showReasons === "object" && !Array.isArray(source.showReasons)
      ? source.showReasons
      : {};
    return collection.count > 0 && collection.publishedShowIds.every((showId) => isMeaningfulScalar(reasons[showId]));
  }).length;

  return {
    totalCollections: Array.isArray(collections) ? collections.length : 0,
    byShowId,
    membershipEdges: [...byShowId.values()].reduce((sum, count) => sum + count, 0),
    nonEmptyCollections,
    emptyCollections: collectionSizes.filter((collection) => collection.count === 0),
    collectionsWithIntentTags: collectionSizes.filter((collection) => collection.intentTags).length,
    collectionsWithReasons,
    invalidReferences,
    distribution: [...distribution.entries()]
      .sort(([left], [right]) => left - right)
      .map(([memberships, showCount]) => ({ memberships, showCount })),
    topCollections: [...collectionSizes]
      .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))
      .slice(0, 12)
      .map(({ id, title, count, intentTags }) => ({ id, title, count, intentTags })),
  };
}

function buildEntityGraph(shows = [], entities = []) {
  const publishedShows = getPublishedShows(shows);
  const publicEntities = (Array.isArray(entities) ? entities : []).filter((entity) => entity?.publication === "public");
  const byEntityId = new Map(publicEntities.map((entity) => [entity.id, {
    id: entity.id,
    name: entity.name || entity.id,
    type: entity.type || "unknown",
    showIds: new Set(),
    relationshipCount: 0,
  }]));
  const showLinksById = new Map();
  const invalidLinks = [];
  const roleCounts = new Map();
  const typeCounts = new Map();
  const linkedShowIds = new Set();

  publishedShows.forEach((show) => {
    const links = Array.isArray(show.entityLinks) ? show.entityLinks : [];
    const validLinks = [];
    links.forEach((link) => {
      const entity = byEntityId.get(link?.entityId);
      if (!entity) {
        invalidLinks.push({ showId: show.id, entityId: link?.entityId || "", role: link?.role || "" });
        return;
      }

      validLinks.push({ entityId: entity.id, role: link.role || "unknown" });
      entity.showIds.add(show.id);
      entity.relationshipCount += 1;
      roleCounts.set(link.role || "unknown", (roleCounts.get(link.role || "unknown") || 0) + 1);
      typeCounts.set(entity.type, (typeCounts.get(entity.type) || 0) + 1);
      linkedShowIds.add(show.id);
    });
    showLinksById.set(show.id, validLinks);
  });

  const entityUsage = [...byEntityId.values()].map((entity) => ({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    showCount: entity.showIds.size,
    relationshipCount: entity.relationshipCount,
  }));

  return {
    publicEntityCount: publicEntities.length,
    showLinksById,
    linkedShowIds,
    relationshipCount: entityUsage.reduce((sum, entity) => sum + entity.relationshipCount, 0),
    linkedEntityCount: entityUsage.filter((entity) => entity.showCount > 0).length,
    multiShowEntityCount: entityUsage.filter((entity) => entity.showCount >= 2).length,
    unlinkedEntities: entityUsage.filter((entity) => entity.showCount === 0),
    singleShowEntities: entityUsage
      .filter((entity) => entity.showCount === 1)
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 12),
    roleCounts: Object.fromEntries([...roleCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    typeCounts: Object.fromEntries([...typeCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    invalidLinks,
    topEntities: [...entityUsage]
      .sort((left, right) => right.showCount - left.showCount || left.name.localeCompare(right.name))
      .slice(0, 12),
    distribution: Object.fromEntries(
      [...entityUsage.reduce((counts, entity) => counts.set(entity.showCount, (counts.get(entity.showCount) || 0) + 1), new Map())]
        .sort(([left], [right]) => left - right),
    ),
  };
}

function getTaxonomyEntries(taxonomy) {
  if (Array.isArray(taxonomy)) return taxonomy;
  return Array.isArray(taxonomy?.tags) ? taxonomy.tags : [];
}

function buildTaxonomyCoverage(publishedShows = [], taxonomy) {
  const entries = getTaxonomyEntries(taxonomy);
  const byLabel = new Map(entries.map((entry) => [normalizeKey(entry?.label), entry]));
  const usage = new Map();
  const unknownTagUses = [];

  publishedShows.forEach((show) => {
    (Array.isArray(show.tags) ? show.tags : []).forEach((tag) => {
      const key = normalizeKey(tag);
      const entry = byLabel.get(key);
      if (!entry) {
        unknownTagUses.push({ showId: show.id, tag });
        return;
      }
      usage.set(key, (usage.get(key) || 0) + 1);
    });
  });

  const approved = entries.filter((entry) => entry?.status === "approved");
  const unusedApprovedTags = approved
    .filter((entry) => !usage.has(normalizeKey(entry.label)))
    .map((entry) => entry.label)
    .sort((left, right) => left.localeCompare(right));
  const singletonApprovedTags = approved
    .filter((entry) => usage.get(normalizeKey(entry.label)) === 1)
    .map((entry) => entry.label)
    .sort((left, right) => left.localeCompare(right));

  return {
    controlledTagCount: entries.length,
    approvedTagCount: approved.length,
    usedApprovedTagCount: approved.filter((entry) => usage.has(normalizeKey(entry.label))).length,
    unusedApprovedTags,
    singletonApprovedTags,
    unknownTagUses,
  };
}

function buildShowProfiles(publishedShows, entityGraph, collectionCoverage) {
  return publishedShows.map((show) => {
    const entityRelationships = entityGraph.showLinksById.get(show.id) || [];
    const collectionMemberships = collectionCoverage.byShowId.get(show.id) || 0;
    const facetGroups = DISCOVERY_FACET_DEFINITIONS
      .filter((definition) => hasUsableArray(definition.values(show)))
      .map((definition) => definition.id);
    const context = { show, entityGraph, collectionCoverage };
    const presentDimensions = RICHNESS_DIMENSIONS.filter((dimension) => dimension.test(context)).map((dimension) => dimension.id);

    return {
      id: show.id,
      title: show.title || show.id,
      reviewStatus: show.reviewStatus || "unknown",
      score: presentDimensions.length,
      maxScore: RICHNESS_DIMENSIONS.length,
      presentDimensions,
      missingDimensions: RICHNESS_DIMENSIONS
        .filter((dimension) => !presentDimensions.includes(dimension.id))
        .map((dimension) => dimension.label),
      facetGroups,
      facetGroupCount: facetGroups.length,
      entityRelationships,
      collectionMemberships,
      hasArchiveRating: hasArchiveRating(show),
      hasAnyRating: hasAnyRating(show),
      hasTones: hasUsableArray(show.tones),
      hasTags: hasUsableArray(show.tags),
      hasBestFor: hasUsableArray(show.bestFor),
      hasSimilarity: hasUsableArray(show.similarTo),
      hasUsefulLength: hasUsefulLength(show),
      hasListenLink: hasUsefulObject(show.listenLinks),
      hasOfficialLink: hasUsefulObject(show.officialLinks),
    };
  });
}

function serializeProfile(profile) {
  return {
    id: profile.id,
    title: profile.title,
    reviewStatus: profile.reviewStatus,
    score: profile.score,
    maxScore: profile.maxScore,
    facetGroupCount: profile.facetGroupCount,
    entityRelationships: profile.entityRelationships.length,
    collectionMemberships: profile.collectionMemberships,
    missing: profile.missingDimensions,
    present: profile.presentDimensions,
  };
}

function rankQualityBand(profiles, direction, fraction, sampleLimit, scope) {
  const sorted = [...profiles].sort((left, right) => {
    const scoreDelta = direction === "rich" ? right.score - left.score : left.score - right.score;
    return scoreDelta || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
  });
  const count = sorted.length > 0 ? Math.max(1, Math.ceil(sorted.length * fraction)) : 0;
  const selected = sorted.slice(0, count);

  return {
    scope,
    targetShare: round(fraction * 100, 1),
    count,
    thresholdScore: selected.length ? selected[selected.length - 1].score : null,
    showIds: selected.map((profile) => profile.id),
    sample: selected.slice(0, sampleLimit).map(serializeProfile),
  };
}

function buildQualityBands(profiles, publishedShows, eligibleShows, options = {}) {
  const sampleLimit = Number.isInteger(options.sampleLimit) && options.sampleLimit > 0
    ? options.sampleLimit
    : DEFAULT_SAMPLE_LIMIT;
  const bandFraction = Number.isFinite(options.bandFraction) && options.bandFraction > 0 && options.bandFraction <= 0.5
    ? options.bandFraction
    : DEFAULT_BAND_FRACTION;
  const eligibleIds = new Set(eligibleShows.map((show) => show.id));
  const eligibleProfiles = profiles.filter((profile) => eligibleIds.has(profile.id));

  return {
    scoreDefinition: {
      maxScore: RICHNESS_DIMENSIONS.length,
      dimensions: RICHNESS_DIMENSIONS.map(({ id, label }) => ({ id, label })),
      bandMethod: `top/bottom ${round(bandFraction * 100, 1)}% by score; ties are resolved by title and id`,
    },
    unusuallyRich: rankQualityBand(profiles, "rich", bandFraction, sampleLimit, "all published shows"),
    unusuallySparse: rankQualityBand(
      eligibleProfiles,
      "sparse",
      bandFraction,
      sampleLimit,
      "published shows eligible for editorial enrichment (reviewStatus is not imported)",
    ),
    policySparse: {
      scope: "published imported shows",
      count: publishedShows.length - eligibleShows.length,
      reason: "Imported records are factual-only and intentionally do not receive editorial facets, recommendations, or archive ratings before promotion/review.",
    },
  };
}

function buildEnrichmentPriorities(profiles, publishedShows, options = {}) {
  const eligibleIds = new Set(getEnrichmentEligibleShows(publishedShows).map((show) => show.id));
  const candidates = profiles
    .filter((profile) => eligibleIds.has(profile.id))
    .map((profile) => {
      const missing = [];
      let opportunityScore = 0;

      if (profile.collectionMemberships === 0) {
        opportunityScore += 4;
        missing.push("collection membership");
      }
      if (profile.entityRelationships.length === 0) {
        opportunityScore += 4;
        missing.push("typed entity relationship");
      }
      if (!profile.hasTones) {
        opportunityScore += 1;
        missing.push("tone");
      }
      if (!profile.hasBestFor) {
        opportunityScore += 1;
        missing.push("best-for route");
      }
      if (!profile.hasSimilarity) {
        opportunityScore += 2;
        missing.push("similar-show links");
      }
      if (!profile.hasTags) {
        opportunityScore += 1;
        missing.push("discovery tags");
      }
      if (!profile.hasArchiveRating && EDITORIAL_REVIEW_STATUSES.has(profile.reviewStatus)) {
        opportunityScore += 1;
        missing.push("archive rating");
      }

      return {
        ...serializeProfile(profile),
        opportunityScore,
        missing,
      };
    })
    .filter((candidate) => candidate.opportunityScore > 0)
    .sort((left, right) => right.opportunityScore - left.opportunityScore || left.score - right.score || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));

  const sampleLimit = Number.isInteger(options.sampleLimit) && options.sampleLimit > 0
    ? options.sampleLimit
    : DEFAULT_SAMPLE_LIMIT;

  return {
    scope: "published shows eligible for editorial enrichment",
    candidateCount: candidates.length,
    candidateIds: candidates.map((candidate) => candidate.id),
    scoreDefinition: {
      collectionMembership: 4,
      typedEntityRelationship: 4,
      tone: 1,
      bestForRoute: 1,
      similarShowLinks: 2,
      discoveryTags: 1,
      editorialArchiveRating: 1,
    },
    sample: candidates.slice(0, sampleLimit),
  };
}

function buildBlindSpots(context) {
  const {
    publishedShows,
    eligibleShows,
    profiles,
    collectionCoverage,
    entityGraph,
    taxonomyCoverage,
  } = context;
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const noCollections = publishedShows.filter((show) => (collectionCoverage.byShowId.get(show.id) || 0) === 0);
  const noEntities = publishedShows.filter((show) => (entityGraph.showLinksById.get(show.id) || []).length === 0);
  const eligibleMissingRichFacets = eligibleShows.filter((show) => (profileById.get(show.id)?.facetGroupCount || 0) < 3);
  const editorialShows = getEditorialShows(publishedShows);
  const editorialUnrated = editorialShows.filter((show) => !hasArchiveRating(show));
  const blindSpots = [
    {
      id: "no-collection-membership",
      label: "Published shows without a collection",
      count: noCollections.length,
      denominator: publishedShows.length,
      priority: "high",
      action: "Curate these shows into a useful mood, intent, commitment, or similarity route where the evidence supports it.",
    },
    {
      id: "no-entity-relationship",
      label: "Published shows without a typed entity relationship",
      count: noEntities.length,
      denominator: publishedShows.length,
      priority: "high",
      action: "Add only source-backed creator, production-company, studio, or network links; do not infer credits from raw names.",
    },
    {
      id: "eligible-missing-rich-facets",
      label: "Enrichment-eligible shows missing one or more of tones, best-for routes, or similarity links",
      count: eligibleMissingRichFacets.length,
      denominator: eligibleShows.length,
      priority: "medium",
      action: "Review these records for additional recommendation signals, preserving explicit unknowns when sources do not support them.",
    },
    {
      id: "editorial-unrated",
      label: "Editorial shows without an archive rating",
      count: editorialUnrated.length,
      denominator: editorialShows.length,
      priority: "medium",
      action: "Rate only when the editorial review workflow supports a defensible archive score.",
    },
    {
      id: "imported-policy-sparse",
      label: "Imported shows intentionally lacking editorial discovery fields",
      count: publishedShows.length - eligibleShows.length,
      denominator: publishedShows.length,
      priority: "context",
      action: "Do not fill editorial fields mechanically; promote through the factual/editorial review path first.",
    },
    {
      id: "unused-approved-tags",
      label: "Approved discovery tags unused by any published show",
      count: taxonomyCoverage.unusedApprovedTags.length,
      denominator: taxonomyCoverage.approvedTagCount,
      priority: "low",
      action: "Review taxonomy gaps against real catalog evidence before assigning new tags.",
    },
  ];

  if (collectionCoverage.invalidReferences.length > 0) {
    blindSpots.push({
      id: "invalid-collection-references",
      label: "Collection references that are unknown or not published",
      count: collectionCoverage.invalidReferences.length,
      denominator: collectionCoverage.invalidReferences.length,
      priority: "high",
      action: "Repair the collection source reference before treating collection coverage as complete.",
    });
  }
  if (entityGraph.invalidLinks.length > 0) {
    blindSpots.push({
      id: "invalid-entity-references",
      label: "Entity links that do not resolve to a public entity",
      count: entityGraph.invalidLinks.length,
      denominator: entityGraph.invalidLinks.length,
      priority: "high",
      action: "Resolve the entity registry relationship or remove the stale link through the normal source review workflow.",
    });
  }

  return blindSpots.filter((blindSpot) => blindSpot.count > 0).map((blindSpot) => ({
    ...blindSpot,
    percentage: percentage(blindSpot.count, blindSpot.denominator),
  }));
}

function buildDiscoveryFieldCoverage(publishedShows, eligibleShows, importedShows) {
  const scopes = [
    { id: "published", label: "All published", shows: publishedShows },
    { id: "eligible", label: "Enrichment-eligible", shows: eligibleShows },
    { id: "imported", label: "Imported", shows: importedShows },
  ];
  const fieldDefinitions = [
    { id: "genres", label: "Genres", test: (show) => hasUsableArray(show.genres) },
    { id: "formats", label: "Formats", test: (show) => hasUsableArray(show.formats) },
    ...DISCOVERY_FACET_DEFINITIONS.map((definition) => ({
      id: definition.id,
      label: definition.label,
      test: (show) => hasUsableArray(definition.values(show)),
    })),
    {
      id: "usefulFacets",
      label: "At least one useful facet",
      test: (show) => DISCOVERY_FACET_DEFINITIONS.some((definition) => hasUsableArray(definition.values(show))),
    },
    {
      id: "richFacets",
      label: "Three or more useful facet groups",
      test: (show) => DISCOVERY_FACET_DEFINITIONS.filter((definition) => hasUsableArray(definition.values(show))).length >= 3,
    },
    {
      id: "discoveryProfile",
      label: "Curated discovery profile",
      test: (show) => hasUsefulObject(show.discovery),
    },
  ];

  return fieldDefinitions.map((field) => ({
    id: field.id,
    label: field.label,
    coverage: Object.fromEntries(scopes.map((scope) => [
      scope.id,
      coverageResult(scope.shows.filter(field.test).length, scope.shows.length, scope.label),
    ])),
  }));
}

const METRIC_DEFINITIONS = Object.freeze([
  {
    id: "published-show-count",
    label: "Total published shows",
    description: "Published catalog records included in the discovery surface.",
    calculate: ({ publishedShows }) => valueResult(publishedShows.length, "shows", "published catalog"),
  },
  {
    id: "entity-linked-show-coverage",
    label: "Shows with explicit entity relationships",
    description: "Shows with at least one resolved typed entity relationship.",
    calculate: ({ publishedShows, entityGraph }) => coverageResult(entityGraph.linkedShowIds.size, publishedShows.length, "all published shows"),
  },
  {
    id: "creator-linked-show-coverage",
    label: "Shows with a creator-role entity relationship",
    description: "Shows with at least one resolved entity link whose role is creator.",
    calculate: ({ publishedShows, entityGraph }) => coverageResult(
      [...entityGraph.showLinksById.values()].filter((links) => links.some((link) => link.role === "creator")).length,
      publishedShows.length,
      "all published shows",
    ),
  },
  {
    id: "average-relationships-per-linked-show",
    label: "Average relationships per linked show",
    description: "Mean number of resolved typed entity edges among shows with at least one edge.",
    calculate: ({ entityGraph }) => valueResult(
      entityGraph.linkedShowIds.size > 0 ? entityGraph.relationshipCount / entityGraph.linkedShowIds.size : 0,
      "average",
      "shows with an entity relationship",
    ),
  },
  {
    id: "collection-show-coverage",
    label: "Shows with at least one collection",
    description: "Published shows appearing in one or more materialized collections.",
    calculate: ({ publishedShows, collectionCoverage }) => coverageResult(
      [...collectionCoverage.byShowId.values()].filter((count) => count > 0).length,
      publishedShows.length,
      "all published shows",
    ),
  },
  {
    id: "two-plus-collection-show-coverage",
    label: "Shows with at least two collections",
    description: "A stronger collection coverage signal for repeated discovery routes.",
    calculate: ({ publishedShows, collectionCoverage }) => coverageResult(
      [...collectionCoverage.byShowId.values()].filter((count) => count >= 2).length,
      publishedShows.length,
      "all published shows",
    ),
  },
  {
    id: "archive-rating-coverage",
    label: "Shows with an archive rating",
    description: "Archive rating coverage among published records where imported factual-only status does not make a rating inapplicable.",
    calculate: ({ eligibleShows }) => coverageResult(eligibleShows.filter(hasArchiveRating).length, eligibleShows.length, "published shows with reviewStatus other than imported"),
  },
  {
    id: "editorial-archive-rating-coverage",
    label: "Editorial shows with an archive rating",
    description: "Archive rating coverage among full-review and spotlight records.",
    calculate: ({ editorialShows }) => coverageResult(editorialShows.filter(hasArchiveRating).length, editorialShows.length, "published full-review or spotlight shows"),
  },
  {
    id: "useful-discovery-facet-coverage",
    label: "Shows with at least one useful discovery facet",
    description: "At least one of tones, tags, best-for routes, or similar-show links; genres alone do not qualify.",
    calculate: ({ publishedShows }) => coverageResult(
      publishedShows.filter((show) => DISCOVERY_FACET_DEFINITIONS.some((definition) => hasUsableArray(definition.values(show)))).length,
      publishedShows.length,
      "all published shows",
    ),
  },
  {
    id: "rich-discovery-facet-coverage",
    label: "Shows with three or more useful facet groups",
    description: "A stronger recommendation signal across tones, tags, best-for routes, and similar-show links.",
    calculate: ({ publishedShows }) => coverageResult(
      publishedShows.filter((show) => DISCOVERY_FACET_DEFINITIONS.filter((definition) => hasUsableArray(definition.values(show))).length >= 3).length,
      publishedShows.length,
      "all published shows",
    ),
  },
  {
    id: "curated-discovery-profile-coverage",
    label: "Shows with a curated discovery profile",
    description: "Optional structured voice, narrative-focus, intensity, or commitment metadata; absent records remain valid.",
    calculate: ({ publishedShows }) => coverageResult(
      publishedShows.filter((show) => hasUsefulObject(show.discovery)).length,
      publishedShows.length,
      "all published shows",
    ),
  },
]);

function buildMetricContext({ shows = [], collections = [], entities = [], taxonomy } = {}) {
  const publishedShows = getPublishedShows(shows);
  const eligibleShows = getEnrichmentEligibleShows(publishedShows);
  const importedShows = publishedShows.filter((show) => show.reviewStatus === IMPORTED_REVIEW_STATUS);
  const editorialShows = getEditorialShows(publishedShows);
  const collectionCoverage = buildCollectionCoverage(shows, collections);
  const entityGraph = buildEntityGraph(shows, entities);
  const taxonomyCoverage = buildTaxonomyCoverage(publishedShows, taxonomy);
  const profiles = buildShowProfiles(publishedShows, entityGraph, collectionCoverage);

  return {
    shows: Array.isArray(shows) ? shows : [],
    collections: Array.isArray(collections) ? collections : [],
    entities: Array.isArray(entities) ? entities : [],
    publishedShows,
    eligibleShows,
    importedShows,
    editorialShows,
    collectionCoverage,
    entityGraph,
    taxonomyCoverage,
    profiles,
  };
}

function buildDiscoveryQualityReport(inputs = {}, options = {}) {
  const context = buildMetricContext(inputs);
  const metrics = METRIC_DEFINITIONS.map(({ calculate, ...definition }) => ({
    ...definition,
    ...calculate(context),
  }));
  const qualityBands = buildQualityBands(context.profiles, context.publishedShows, context.eligibleShows, options);
  const enrichmentPriorities = buildEnrichmentPriorities(context.profiles, context.publishedShows, options);

  return {
    version: 1,
    ...(options.inputSummary ? { inputs: options.inputSummary } : {}),
    scope: {
      publishedShows: context.publishedShows.length,
      latestCatalogUpdate: getLatestCatalogUpdate(context.shows, context.collections),
      enrichmentEligibleShows: context.eligibleShows.length,
      importedShows: context.importedShows.length,
      editorialShows: context.editorialShows.length,
      reviewStatusCounts: Object.fromEntries(
        context.publishedShows.reduce((counts, show) => {
          const status = show.reviewStatus || "unknown";
          counts.set(status, (counts.get(status) || 0) + 1);
          return counts;
        }, new Map()),
      ),
    },
    metrics,
    discoveryFieldCoverage: buildDiscoveryFieldCoverage(context.publishedShows, context.eligibleShows, context.importedShows),
    entityGraph: {
      publicEntityCount: context.entityGraph.publicEntityCount,
      linkedEntityCount: context.entityGraph.linkedEntityCount,
      multiShowEntityCount: context.entityGraph.multiShowEntityCount,
      linkedShowCount: context.entityGraph.linkedShowIds.size,
      relationshipCount: context.entityGraph.relationshipCount,
      entityCoverage: coverageResult(context.entityGraph.linkedEntityCount, context.entityGraph.publicEntityCount, "public entity registry"),
      multiShowCoverage: coverageResult(context.entityGraph.multiShowEntityCount, context.entityGraph.publicEntityCount, "public entity registry"),
      roleCounts: context.entityGraph.roleCounts,
      typeCounts: context.entityGraph.typeCounts,
      distribution: context.entityGraph.distribution,
      unlinkedEntities: context.entityGraph.unlinkedEntities,
      singleShowEntities: context.entityGraph.singleShowEntities,
      topEntities: context.entityGraph.topEntities,
      invalidLinks: context.entityGraph.invalidLinks,
    },
    collectionCoverage: {
      totalCollections: context.collectionCoverage.totalCollections,
      membershipEdges: context.collectionCoverage.membershipEdges,
      nonEmptyCollectionCount: context.collectionCoverage.nonEmptyCollections.length,
      emptyCollections: context.collectionCoverage.emptyCollections,
      collectionsWithIntentTags: context.collectionCoverage.collectionsWithIntentTags,
      collectionsWithReasons: context.collectionCoverage.collectionsWithReasons,
      distribution: context.collectionCoverage.distribution,
      topCollections: context.collectionCoverage.topCollections,
      invalidReferences: context.collectionCoverage.invalidReferences,
    },
    qualityBands,
    enrichmentPriorities,
    taxonomy: context.taxonomyCoverage,
    blindSpots: buildBlindSpots(context),
  };
}

function formatCoverage(value) {
  if (!value || value.denominator === undefined) return "n/a";
  return `${value.numerator}/${value.denominator} (${value.percentage === null ? "n/a" : `${value.percentage}%`})`;
}

function formatMetric(metric) {
  if (metric.numerator !== undefined) return formatCoverage(metric);
  if (metric.unit === "average") return `${metric.value.toFixed(2)} relationships/show`;
  return `${metric.value} ${metric.unit}`;
}

function formatSamples(samples, formatter) {
  if (!samples.length) return ["- none"];
  return samples.map((sample) => `- ${formatter(sample)}`);
}

function formatDiscoveryQualityReport(report) {
  const lines = [
    "Discovery quality report",
    "Read-only snapshot for enrichment prioritization; this command does not build or write catalog content.",
    "Rating coverage refers to catalog archive ratings; community rating state is outside this catalog snapshot.",
    `Published shows: ${report.scope.publishedShows}`,
    `Latest catalog update observed: ${report.scope.latestCatalogUpdate || "unknown"}`,
    `Segments: ${report.scope.importedShows} imported/factual-only, ${report.scope.enrichmentEligibleShows} enrichment-eligible, ${report.scope.editorialShows} editorial`,
  ];

  if (report.inputs) {
    lines.push(`Inputs: shows=${report.inputs.shows}, collections=${report.inputs.collections}, entities=${report.inputs.entities}`);
  }

  lines.push("", "## Coverage", "", "| Metric | Result | Scope |", "| --- | ---: | --- |");
  report.metrics.forEach((metric) => lines.push(`| ${metric.label} | ${formatMetric(metric)} | ${metric.scope} |`));

  lines.push("", "## Discovery facet coverage", "", "| Facet | All published | Enrichment-eligible | Imported |", "| --- | ---: | ---: | ---: |");
  report.discoveryFieldCoverage.forEach((field) => {
    lines.push(`| ${field.label} | ${formatCoverage(field.coverage.published)} | ${formatCoverage(field.coverage.eligible)} | ${formatCoverage(field.coverage.imported)} |`);
  });

  const graph = report.entityGraph;
  lines.push(
    "",
    "## Creator/entity graph",
    "",
    `- Public entities: ${graph.publicEntityCount}; linked to at least one published show: ${formatCoverage(graph.entityCoverage)}; linked to two or more: ${formatCoverage(graph.multiShowCoverage)}.`,
    `- Entity edges: ${graph.relationshipCount}; linked shows: ${graph.linkedShowCount}.`,
    `- Roles: ${Object.entries(graph.roleCounts).map(([role, count]) => `${role}=${count}`).join(", ") || "none"}.`,
    `- Types: ${Object.entries(graph.typeCounts).map(([type, count]) => `${type}=${count}`).join(", ") || "none"}.`,
    `- Public entities with no linked published show: ${graph.unlinkedEntities.length}.`,
    `- Invalid/unresolved entity links: ${graph.invalidLinks.length}.`,
  );
  if (graph.unlinkedEntities.length) {
    lines.push(`- Unlinked entity sample: ${graph.unlinkedEntities.slice(0, 8).map((entity) => entity.name).join(", ")}.`);
  }

  const collections = report.collectionCoverage;
  lines.push(
    "",
    "## Collection coverage",
    "",
    `- Collections: ${collections.totalCollections}; non-empty: ${collections.nonEmptyCollectionCount}; empty: ${collections.emptyCollections.length}.`,
    `- Materialized published-show membership edges: ${collections.membershipEdges}.`,
    `- Collections with intent tags: ${collections.collectionsWithIntentTags}; with complete show reasons: ${collections.collectionsWithReasons}.`,
    `- Invalid/unpublished collection references: ${collections.invalidReferences.length}.`,
    `- Show membership distribution: ${collections.distribution.map((entry) => `${entry.memberships}=${entry.showCount}`).join(", ") || "none"}.`,
  );

  lines.push(
    "",
    "## Quality bands",
    "",
    `- Unusually rich: ${report.qualityBands.unusuallyRich.count} shows in the ${report.qualityBands.unusuallyRich.scope} band; score threshold ${report.qualityBands.unusuallyRich.thresholdScore}/${report.qualityBands.scoreDefinition.maxScore}.`,
    ...formatSamples(report.qualityBands.unusuallyRich.sample, (show) => `${show.title} [${show.id}] — ${show.score}/${show.maxScore}; ${show.entityRelationships} entity relationships, ${show.collectionMemberships} collections`),
    `- Unusually sparse: ${report.qualityBands.unusuallySparse.count} shows in the ${report.qualityBands.unusuallySparse.scope} band; score threshold ${report.qualityBands.unusuallySparse.thresholdScore}/${report.qualityBands.scoreDefinition.maxScore}.`,
    ...formatSamples(report.qualityBands.unusuallySparse.sample, (show) => `${show.title} [${show.id}] — ${show.score}/${show.maxScore}; missing ${show.missing.slice(0, 5).join(", ") || "none"}`),
    `- Policy-sparse context: ${report.qualityBands.policySparse.count} imported shows are intentionally outside the editorial sparse queue.`,
  );

  lines.push(
    "",
    "## Enrichment priorities",
    "",
    `Eligible candidates with at least one actionable gap: ${report.enrichmentPriorities.candidateCount}.`,
    "Opportunity score weights collection and typed-entity gaps at 4, similar-show gaps at 2, and tone, best-for, tag, and eligible rating gaps at 1.",
  );
  lines.push(...formatSamples(report.enrichmentPriorities.sample, (candidate) => `${candidate.title} [${candidate.id}] — opportunity ${candidate.opportunityScore}; missing ${candidate.missing.join(", ")}`));

  lines.push("", "## Obvious catalog blind spots", "", "| Blind spot | Count | Scope | Priority |", "| --- | ---: | --- | --- |");
  report.blindSpots.forEach((blindSpot) => {
    lines.push(`| ${blindSpot.label} | ${blindSpot.count}${blindSpot.denominator ? ` (${blindSpot.percentage}%)` : ""} | ${blindSpot.denominator ? `${blindSpot.count}/${blindSpot.denominator}` : "n/a"} | ${blindSpot.priority} |`);
    lines.push(`| ↳ action | ${blindSpot.action} | | |`);
  });

  lines.push(
    "",
    "## Taxonomy signals",
    "",
    `- Controlled tags: ${report.taxonomy.controlledTagCount}; approved: ${report.taxonomy.approvedTagCount}; used approved tags: ${report.taxonomy.usedApprovedTagCount}.`,
    `- Unused approved tags: ${report.taxonomy.unusedApprovedTags.length}${report.taxonomy.unusedApprovedTags.length ? ` (sample: ${report.taxonomy.unusedApprovedTags.slice(0, 10).join(", ")})` : ""}.`,
    `- Singleton approved tags: ${report.taxonomy.singletonApprovedTags.length}${report.taxonomy.singletonApprovedTags.length ? ` (sample: ${report.taxonomy.singletonApprovedTags.slice(0, 10).join(", ")})` : ""}.`,
    `- Unknown tag uses: ${report.taxonomy.unknownTagUses.length}.`,
    "",
  );

  return lines.join("\n");
}

module.exports = {
  DEFAULT_BAND_FRACTION,
  DEFAULT_SAMPLE_LIMIT,
  DISCOVERY_FACET_DEFINITIONS,
  METRIC_DEFINITIONS,
  RICHNESS_DIMENSIONS,
  buildDiscoveryQualityReport,
  buildMetricContext,
  formatDiscoveryQualityReport,
  getEnrichmentEligibleShows,
  getEditorialShows,
  getLatestCatalogUpdate,
  getPublishedShows,
  hasArchiveRating,
  hasAnyRating,
  hasUsefulDescription,
  hasUsefulLength,
  percentage,
};
