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

function findPublishedShowsWithTooFewSimilarLinks(catalog = [], minimum = 2) {
  return getPublishedShows(catalog)
    .map((show) => {
      const count = Array.isArray(show.similarTo) ? show.similarTo.length : 0;
      return {
        id: show.id,
        title: show.title,
        count,
      };
    })
    .filter((show) => show.count < minimum);
}

function findAnchorShowsMissingSimilarReasons(catalog = [], anchorShowIds = ANCHOR_SHOW_IDS) {
  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((show) => [show.id, show]));

  return anchorShowIds
    .map((showId) => {
      const show = catalogById.get(showId);
      if (!show) {
        return {
          id: showId,
          title: "",
          missingFor: ["[missing anchor show]"],
        };
      }

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

function buildDiscoveryGapReport(catalog = [], collections = []) {
  const publishedShows = getPublishedShows(catalog);
  const routeCollections = (Array.isArray(collections) ? collections : []).filter(isShowsLikeCollection);

  return {
    summary: {
      publishedShowCount: publishedShows.length,
      fullReviewCount: publishedShows.filter((show) => show.reviewStatus === "full-review").length,
      routeCollectionCount: routeCollections.length,
    },
    publishedShowsWithTooFewSimilarLinks: findPublishedShowsWithTooFewSimilarLinks(publishedShows),
    anchorShowsMissingSimilarReasons: findAnchorShowsMissingSimilarReasons(catalog),
    publishedShowsMissingDiscoveryFields: findPublishedShowsMissingDiscoveryFields(publishedShows),
    routeCollectionsMissingShowReasons: findRouteCollectionsMissingShowReasons(routeCollections),
  };
}

function getGateBCriticalValidationErrors(catalog = [], collections = []) {
  const errors = [];
  const publishedShowsMissingDiscoveryFields = findPublishedShowsMissingDiscoveryFields(catalog);
  const anchorShowsMissingSimilarReasons = findAnchorShowsMissingSimilarReasons(catalog);
  const routeCollectionsMissingShowReasons = findRouteCollectionsMissingShowReasons(collections);

  publishedShowsMissingDiscoveryFields.forEach((show) => {
    const criticalFields = show.missing.filter((fieldName) => fieldName === "tones" || fieldName === "formats");
    if (criticalFields.length > 0) {
      errors.push(`Published show "${show.id}" is missing ${criticalFields.join(" and ")}.`);
    }
  });

  anchorShowsMissingSimilarReasons.forEach((show) => {
    if (show.missingFor.includes("[missing anchor show]")) {
      errors.push(`Anchor show "${show.id}" is missing from the catalog.`);
      return;
    }

    errors.push(`Anchor show "${show.id}" is missing similarReasons for: ${show.missingFor.join(", ")}.`);
  });

  routeCollectionsMissingShowReasons.forEach((collection) => {
    errors.push(`Route collection "${collection.id}" is missing showReasons for: ${collection.missingFor.join(", ")}.`);
  });

  return errors;
}

module.exports = {
  ANCHOR_SHOW_IDS,
  buildDiscoveryGapReport,
  findAnchorShowsMissingSimilarReasons,
  findPublishedShowsMissingDiscoveryFields,
  findPublishedShowsWithTooFewSimilarLinks,
  findRouteCollectionsMissingShowReasons,
  getGateBCriticalValidationErrors,
  isShowsLikeCollection,
};
