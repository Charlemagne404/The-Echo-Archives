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
  const publishedShowsWithOutOfRangeSimilarLinks = findPublishedShowsWithOutOfRangeSimilarLinks(catalog);
  const publishedShowsMissingSimilarReasons = findPublishedShowsMissingSimilarReasons(catalog);
  const publishedShowsWithTooFewCollectionMemberships = findPublishedShowsWithTooFewCollectionMemberships(
    catalog,
    collections,
  );
  const anchorShowsWithTooFewCollectionMemberships = findAnchorShowsWithTooFewCollectionMemberships(catalog, collections);
  const publishedShowsMissingDiscoveryFields = findPublishedShowsMissingDiscoveryFields(catalog);
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
  isShowsLikeCollection,
};
