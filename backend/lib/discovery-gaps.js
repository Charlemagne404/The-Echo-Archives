const ANCHOR_SHOW_IDS = [
  "midnight-burger",
  "derelict",
  "the-white-vault",
  "wolf-359",
  "were-alive",
  "impact-winter",
  "ars-paradoxica",
  "tower-4",
  "station-151",
  "oz-9",
  "welcome-to-night-vale",
  "midst",
  "malevolent",
];

function normalizeText(value) {
  return String(value || "").trim();
}

function isPublishedShow(show) {
  return Boolean(show && show.status === "published");
}

function isShowsLikeCollection(collection) {
  return /^shows-like-/.test(String(collection?.id || "").trim());
}

function getPublishedShows(catalog = []) {
  return (Array.isArray(catalog) ? catalog : []).filter(isPublishedShow);
}

function getCollectionMembershipCounts(catalog = [], collections = []) {
  const publishedShowIds = new Set(getPublishedShows(catalog).map((show) => show.id));
  const counts = new Map([...publishedShowIds].map((showId) => [showId, 0]));

  (Array.isArray(collections) ? collections : []).forEach((collection) => {
    (Array.isArray(collection.showIds) ? collection.showIds : []).forEach((showId) => {
      if (!counts.has(showId)) {
        return;
      }

      counts.set(showId, (counts.get(showId) || 0) + 1);
    });
  });

  return counts;
}

function findPublishedShowsWithOutOfRangeSimilarLinks(catalog = [], minimum = 3, maximum = 5) {
  return getPublishedShows(catalog)
    .map((show) => {
      const count = Array.isArray(show.similarTo) ? show.similarTo.length : 0;
      return {
        id: show.id,
        title: show.title,
        count,
      };
    })
    .filter((show) => show.count < minimum || show.count > maximum);
}

function findPublishedShowsMissingSimilarReasons(catalog = []) {
  return getPublishedShows(catalog)
    .map((show) => {
      const similarTo = Array.isArray(show.similarTo) ? show.similarTo : [];
      const similarReasons = show.similarReasons && typeof show.similarReasons === "object" ? show.similarReasons : {};
      const missingFor = similarTo.filter((neighborId) => !normalizeText(similarReasons[neighborId]));

      if (missingFor.length === 0) {
        return null;
      }

      return {
        id: show.id,
        title: show.title,
        missingFor,
      };
    })
    .filter(Boolean);
}

function findPublishedShowsMissingDiscoveryFields(catalog = []) {
  return getPublishedShows(catalog)
    .map((show) => {
      const missing = [];
      if (!Array.isArray(show.tones) || show.tones.length === 0) {
        missing.push("tones");
      }
      if (!Array.isArray(show.formats) || show.formats.length === 0) {
        missing.push("formats");
      }
      if (!Array.isArray(show.bestFor) || show.bestFor.length === 0) {
        missing.push("bestFor");
      }

      if (missing.length === 0) {
        return null;
      }

      return {
        id: show.id,
        title: show.title,
        missing,
      };
    })
    .filter(Boolean);
}

function findRouteCollectionsMissingShowReasons(collections = []) {
  return (Array.isArray(collections) ? collections : [])
    .filter(isShowsLikeCollection)
    .map((collection) => {
      const showIds = Array.isArray(collection.showIds) ? collection.showIds : [];
      const showReasons =
        collection.showReasons && typeof collection.showReasons === "object" && !Array.isArray(collection.showReasons)
          ? collection.showReasons
          : {};
      const missingFor = showIds.filter((showId) => !normalizeText(showReasons[showId]));

      if (missingFor.length === 0) {
        return null;
      }

      return {
        id: collection.id,
        title: collection.title,
        missingFor,
      };
    })
    .filter(Boolean);
}

function findPublishedShowsWithTooFewCollectionMemberships(catalog = [], collections = [], minimum = 2) {
  const collectionMemberships = getCollectionMembershipCounts(catalog, collections);

  return getPublishedShows(catalog)
    .map((show) => ({
      id: show.id,
      title: show.title,
      count: collectionMemberships.get(show.id) || 0,
    }))
    .filter((show) => show.count < minimum);
}

function findAnchorShowsWithTooFewCollectionMemberships(
  catalog = [],
  collections = [],
  minimum = 3,
  anchorShowIds = ANCHOR_SHOW_IDS,
) {
  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((show) => [show.id, show]));
  const collectionMemberships = getCollectionMembershipCounts(catalog, collections);

  return anchorShowIds
    .map((showId) => {
      const show = catalogById.get(showId);
      if (!show || !isPublishedShow(show)) {
        return null;
      }

      const count = collectionMemberships.get(showId) || 0;
      if (count >= minimum) {
        return null;
      }

      return {
        id: show.id,
        title: show.title,
        count,
        missing: false,
      };
    })
    .filter(Boolean);
}

function buildDiscoveryGapReport(catalog = [], collections = []) {
  const publishedShows = getPublishedShows(catalog);
  const routeCollections = (Array.isArray(collections) ? collections : []).filter(isShowsLikeCollection);

  return {
    summary: {
      publishedShowCount: publishedShows.length,
      fullReviewCount: publishedShows.filter((show) => show.reviewStatus === "full-review").length,
      routeCollectionCount: routeCollections.length,
    },
    publishedShowsWithOutOfRangeSimilarLinks: findPublishedShowsWithOutOfRangeSimilarLinks(publishedShows),
    publishedShowsMissingSimilarReasons: findPublishedShowsMissingSimilarReasons(publishedShows),
    publishedShowsWithTooFewCollectionMemberships: findPublishedShowsWithTooFewCollectionMemberships(
      publishedShows,
      collections,
    ),
    anchorShowsWithTooFewCollectionMemberships: findAnchorShowsWithTooFewCollectionMemberships(publishedShows, collections),
    publishedShowsMissingDiscoveryFields: findPublishedShowsMissingDiscoveryFields(publishedShows),
    routeCollectionsMissingShowReasons: findRouteCollectionsMissingShowReasons(routeCollections),
  };
}

function getGateBCriticalValidationErrors(catalog = [], collections = []) {
  const errors = [];
  const editorialCatalog = (Array.isArray(catalog) ? catalog : []).filter(
    (show) => ["full-review", "spotlight"].includes(show?.reviewStatus),
  );
  const publishedShowsWithOutOfRangeSimilarLinks = findPublishedShowsWithOutOfRangeSimilarLinks(editorialCatalog);
  const publishedShowsMissingSimilarReasons = findPublishedShowsMissingSimilarReasons(editorialCatalog);
  const publishedShowsWithTooFewCollectionMemberships = findPublishedShowsWithTooFewCollectionMemberships(
    editorialCatalog,
    collections,
  );
  const anchorShowsWithTooFewCollectionMemberships = findAnchorShowsWithTooFewCollectionMemberships(editorialCatalog, collections);
  const publishedShowsMissingDiscoveryFields = findPublishedShowsMissingDiscoveryFields(editorialCatalog);
  const routeCollectionsMissingShowReasons = findRouteCollectionsMissingShowReasons(collections);

  publishedShowsWithOutOfRangeSimilarLinks.forEach((show) => {
    errors.push(`Published show "${show.id}" must have 3 to 5 similar links. Current count: ${show.count}.`);
  });

  publishedShowsMissingSimilarReasons.forEach((show) => {
    errors.push(`Published show "${show.id}" is missing similarReasons for: ${show.missingFor.join(", ")}.`);
  });

  publishedShowsWithTooFewCollectionMemberships.forEach((show) => {
    errors.push(`Published show "${show.id}" must belong to at least 2 collections. Current count: ${show.count}.`);
  });

  anchorShowsWithTooFewCollectionMemberships.forEach((show) => {
    errors.push(`Anchor show "${show.id}" must belong to at least 3 collections. Current count: ${show.count}.`);
  });

  publishedShowsMissingDiscoveryFields.forEach((show) => {
    const criticalFields = show.missing.filter((fieldName) => fieldName === "tones" || fieldName === "formats");
    if (criticalFields.length > 0) {
      errors.push(`Published show "${show.id}" is missing ${criticalFields.join(" and ")}.`);
    }
  });

  routeCollectionsMissingShowReasons.forEach((collection) => {
    errors.push(`Route collection "${collection.id}" is missing showReasons for: ${collection.missingFor.join(", ")}.`);
  });

  return errors;
}

function hasUsableListenLink(show = {}) {
  return Object.values(show.listenLinks || {}).some((value) => normalizeText(value));
}

function hasDetailedLength(show = {}) {
  return Boolean(show.length && typeof show.length === "object" && Object.keys(show.length).length > 1);
}

function hasRuntimeDuration(show = {}) {
  const length = show.length && typeof show.length === "object" ? show.length : {};
  return ["avgEpisodeMinutes", "medianEpisodeMinutes", "totalHours", "totalObservedHours"].some(
    (fieldName) => Number.isFinite(Number(length[fieldName])) && Number(length[fieldName]) > 0,
  );
}

function hasDocumentedResearchGap(show = {}, pattern) {
  const gaps = Array.isArray(show.metadata?.researchGaps) ? show.metadata.researchGaps : [];
  return gaps.some((gap) => pattern.test(String(gap)));
}

function buildPhase2Readiness(catalog = [], collections = [], { reviewsById = {}, tagTaxonomy = {} } = {}) {
  const publishedShows = getPublishedShows(catalog);
  const editorialShows = publishedShows.filter((show) => ["full-review", "spotlight"].includes(show.reviewStatus));
  const gapReport = buildDiscoveryGapReport(catalog, collections);
  const numericTargets = {
    publishedShows: { actual: publishedShows.length, target: 129, pass: publishedShows.length >= 129 },
    fullReviews: {
      actual: publishedShows.filter((show) => show.reviewStatus === "full-review").length,
      target: 7,
      pass: publishedShows.filter((show) => show.reviewStatus === "full-review").length >= 7,
    },
    collections: { actual: Array.isArray(collections) ? collections.length : 0, target: 29, pass: collections.length >= 29 },
  };

  const factualGaps = [];
  publishedShows.forEach((show) => {
    const missing = [];
    if (!normalizeText(show.title)) missing.push("title");
    if ((!Array.isArray(show.creators) || show.creators.length === 0) && !normalizeText(show.credits?.creatorName)) missing.push("creator");
    if (!normalizeText(show.description)) missing.push("description");
    if (!Array.isArray(show.genres) || show.genres.length === 0) missing.push("primary genre");
    if (!normalizeText(show.status)) missing.push("lifecycle/status");
    if (!hasUsableListenLink(show)) missing.push("listen link");
    if (missing.length > 0) factualGaps.push({ id: show.id, title: show.title, missing });
  });

  const missingObjectiveSources = publishedShows
    .filter((show) => !Array.isArray(show.metadata?.objectiveSources) || show.metadata.objectiveSources.length === 0)
    .map((show) => ({ id: show.id, title: show.title }));
  const missingRss = publishedShows.filter((show) => !normalizeText(show.listenLinks?.rss));
  const documentedMissingRss = missingRss.filter((show) => hasDocumentedResearchGap(show, /rss|feed/i));
  const actionableMissingRss = missingRss.filter((show) => !documentedMissingRss.includes(show));
  const missingRuntime = publishedShows.filter((show) => !hasDetailedLength(show));
  const undocumentedRuntimeGaps = publishedShows.filter((show) => !hasRuntimeDuration(show) && !hasDocumentedResearchGap(show, /runtime|duration/i));
  const documentedRuntimeUnknowns = publishedShows.filter((show) => !hasRuntimeDuration(show) && hasDocumentedResearchGap(show, /runtime|duration/i));
  const documentedResearchGaps = publishedShows
    .filter((show) => Array.isArray(show.metadata?.researchGaps) && show.metadata.researchGaps.length > 0)
    .map((show) => ({ id: show.id, title: show.title, gaps: show.metadata.researchGaps }));
  const sparseIndexedOnlyShows = publishedShows.filter(
    (show) => show.reviewStatus === "indexed-only" && !show.tones?.length && !show.bestFor?.length && !show.similarTo?.length,
  );
  const sparseIndexedOnlyIds = new Set(sparseIndexedOnlyShows.map((show) => show.id));
  const sparseEditorialViolations = sparseIndexedOnlyShows.filter(
    (show) => show.ratings?.archive !== undefined || normalizeText(show.archiveTake) || show.spoilerFreeReviewParagraphs?.length || show.thoughts?.length,
  );

  const editorialGaps = [];
  editorialShows.forEach((show) => {
    const review = reviewsById[show.id];
    const missing = [];
    if (!review || typeof review !== "object") missing.push("review companion");
    if (!normalizeText(show.archiveTake) && !normalizeText(review?.archiveTake)) missing.push("archive take");
    if (!(Array.isArray(show.spoilerFreeReviewParagraphs) && show.spoilerFreeReviewParagraphs.length > 0) && !(Array.isArray(review?.spoilerFreeReview) && review.spoilerFreeReview.length > 0)) {
      missing.push("spoiler-safe review");
    }
    if (!Array.isArray(show.tones) || show.tones.length === 0) missing.push("tones");
    if (!Array.isArray(show.formats) || show.formats.length === 0) missing.push("formats");
    if (!Array.isArray(show.bestFor) || show.bestFor.length === 0) missing.push("best-for signals");
    if (!hasDetailedLength(show)) missing.push("detailed length");
    if (missing.length > 0) editorialGaps.push({ id: show.id, title: show.title, missing });
  });

  const approvedTags = new Map(
    (Array.isArray(tagTaxonomy.tags) ? tagTaxonomy.tags : [])
      .map((entry) => [normalizeText(entry.label).toLowerCase(), entry]),
  );
  const taxonomyUnknownTags = [];
  const taxonomyDeprecatedTags = [];
  publishedShows.forEach((show) => {
    (Array.isArray(show.tags) ? show.tags : []).forEach((tag) => {
      const entry = approvedTags.get(normalizeText(tag).toLowerCase());
      if (!entry) taxonomyUnknownTags.push({ id: show.id, tag });
      else if (entry.status !== "approved") taxonomyDeprecatedTags.push({ id: show.id, tag, status: entry.status });
    });
  });

  const outOfScopePublished = publishedShows.filter((show) => {
    const languageValues = Array.isArray(show.languages) ? show.languages : [];
    const hasNonEnglishLanguage = languageValues.some((language) => !/^(english|en(?:-|$))/i.test(String(language).trim()));
    const text = [show.title, show.description, ...(show.genres || []), ...(show.formats || []), ...(show.tags || [])].join(" ");
    return hasNonEnglishLanguage || /(actual play|roleplaying|role-playing|ttrpg|tabletop)/i.test(text);
  });

  const factualBlockingErrors = [
    ...factualGaps.map((gap) => `Factual metadata missing for "${gap.id}": ${gap.missing.join(", ")}.`),
    ...missingObjectiveSources.map((show) => `Published show "${show.id}" is missing objective source/provenance metadata.`),
    ...actionableMissingRss.map((show) => `Published show "${show.id}" is missing an RSS link without a documented research gap.`),
    ...missingRuntime.map((show) => `Published show "${show.id}" is missing detailed length metadata.`),
    ...undocumentedRuntimeGaps.map((show) => `Published show "${show.id}" has no verified runtime duration and no documented research gap.`),
    ...sparseEditorialViolations.map((show) => `Sparse indexed-only show "${show.id}" contains unsupported editorial claims.`),
  ];
  const taxonomyBlockingErrors = [
    ...(Array.isArray(tagTaxonomy.tags) && tagTaxonomy.tags.length !== 165
      ? [`Controlled taxonomy has ${tagTaxonomy.tags.length} labels; Phase 2 requires the stable 165-label vocabulary.`]
      : []),
    ...taxonomyUnknownTags.map((entry) => `Published show "${entry.id}" uses unknown or unapproved public tag "${entry.tag}".`),
    ...taxonomyDeprecatedTags.map((entry) => `Published show "${entry.id}" uses deprecated public tag "${entry.tag}".`),
  ];
  const scopeBlockingErrors = outOfScopePublished.map((show) => `Published show "${show.id}" falls outside the locked English fiction/audio-drama scope.`);
  const editorialBlockingErrors = [
    ...getGateBCriticalValidationErrors(catalog, collections),
    ...editorialGaps.map((gap) => `Editorial show "${gap.id}" is missing: ${gap.missing.join(", ")}.`),
  ];
  const numericBlockingErrors = Object.entries(numericTargets)
    .filter(([, target]) => !target.pass)
    .map(([name, target]) => `Phase 2 numeric target "${name}" is ${target.actual}; required floor is ${target.target}.`);
  const blockingErrors = [
    ...numericBlockingErrors,
    ...factualBlockingErrors,
    ...editorialBlockingErrors,
    ...taxonomyBlockingErrors,
    ...scopeBlockingErrors,
  ];

  return {
    policy: {
      fullReviewFloor: 7,
      publicationScope: "English-language fiction/audio drama; actual play/TTRPG and non-English imports remain out of scope.",
      sparseIndexedOnly: "Published factual-only records remain indexed without unsupported editorial claims.",
      unverifiableFacts: "Explicit unknowns and metadata.researchGaps are acceptable when sources cannot verify a field.",
    },
    numericTargets,
    factual: {
      coreMetadataGaps: factualGaps,
      missingObjectiveSources,
      missingRss: missingRss.map((show) => show.id),
      documentedMissingRss: documentedMissingRss.map((show) => show.id),
      actionableMissingRss: actionableMissingRss.map((show) => show.id),
      missingRuntime: missingRuntime.map((show) => show.id),
      documentedRuntimeUnknowns: documentedRuntimeUnknowns.map((show) => show.id),
      documentedResearchGaps,
      sparseEditorialViolations: sparseEditorialViolations.map((show) => show.id),
      blockingErrors: factualBlockingErrors,
    },
    editorial: {
      eligibleShows: editorialShows.map((show) => show.id),
      gaps: editorialGaps,
      blockingErrors: editorialBlockingErrors,
    },
    collections: {
      routeCollectionCount: gapReport.summary.routeCollectionCount,
      routeCollectionsMissingShowReasons: gapReport.routeCollectionsMissingShowReasons,
      anchorShowsWithTooFewCollectionMemberships: gapReport.anchorShowsWithTooFewCollectionMemberships,
      sparseIndexedOnlyShows: gapReport.publishedShowsWithTooFewCollectionMemberships.filter((entry) => {
        return sparseIndexedOnlyIds.has(entry.id);
      }).map((entry) => entry.id),
      blockingErrors: [
        ...gapReport.routeCollectionsMissingShowReasons.map((entry) => `Route collection "${entry.id}" is missing showReasons.`),
        ...gapReport.anchorShowsWithTooFewCollectionMemberships.map((entry) => `Anchor show "${entry.id}" has only ${entry.count} collection memberships.`),
      ],
    },
    taxonomy: {
      controlledLabelCount: Array.isArray(tagTaxonomy.tags) ? tagTaxonomy.tags.length : 0,
      expectedControlledLabelCount: 165,
      unknownTags: taxonomyUnknownTags,
      deprecatedTags: taxonomyDeprecatedTags,
      blockingErrors: taxonomyBlockingErrors,
    },
    scope: {
      outOfScopePublished: outOfScopePublished.map((show) => show.id),
      blockingErrors: scopeBlockingErrors,
    },
    sparseIndexedOnly: {
      count: sparseIndexedOnlyShows.length,
      outOfRangeSimilarLinks: gapReport.publishedShowsWithOutOfRangeSimilarLinks.filter((entry) => sparseIndexedOnlyIds.has(entry.id)).length,
      fewerThanTwoCollections: gapReport.publishedShowsWithTooFewCollectionMemberships.filter((entry) => sparseIndexedOnlyIds.has(entry.id)).length,
      editorialViolations: sparseEditorialViolations.map((show) => show.id),
      informationalOnly: true,
    },
    blockingErrors,
    complete: blockingErrors.length === 0,
  };
}

module.exports = {
  ANCHOR_SHOW_IDS,
  buildDiscoveryGapReport,
  findAnchorShowsWithTooFewCollectionMemberships,
  findPublishedShowsMissingDiscoveryFields,
  findPublishedShowsMissingSimilarReasons,
  findPublishedShowsWithOutOfRangeSimilarLinks,
  findPublishedShowsWithTooFewCollectionMemberships,
  findRouteCollectionsMissingShowReasons,
  getGateBCriticalValidationErrors,
  getPublishedShows,
  getCollectionMembershipCounts,
  buildPhase2Readiness,
  isShowsLikeCollection,
};
