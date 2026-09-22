function getAggregateValue(shows, selector) {
  const values = (Array.isArray(shows) ? shows : [])
    .map((show) => selector(show))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getCollectionSortTitle(collection) {
  return String(collection?.title || "Untitled collection");
}

function getCollectionSortOrder(collection) {
  return Number.isFinite(collection?.order) ? collection.order : Number.MAX_SAFE_INTEGER;
}

function getCollectionSortDate(collection) {
  const timestamp = Date.parse(String(collection?.updatedAt || "").trim());
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getCollectionShowsForSort(showsByCollection, collection) {
  return showsByCollection.get(collection.id) || [];
}

export function sortCollections(collections, showsByCollection, sortMode) {
  return [...collections].sort((left, right) => {
    if (sortMode === "newest") {
      return getCollectionSortDate(right) - getCollectionSortDate(left) || getCollectionSortOrder(left) - getCollectionSortOrder(right);
    }
    if (sortMode === "title") {
      return getCollectionSortTitle(left).localeCompare(getCollectionSortTitle(right));
    }
    if (sortMode === "shows") {
      return (
        getCollectionShowsForSort(showsByCollection, right).length -
          getCollectionShowsForSort(showsByCollection, left).length ||
        getCollectionSortOrder(left) - getCollectionSortOrder(right)
      );
    }
    if (sortMode === "rating") {
      return (
        getAggregateValue(getCollectionShowsForSort(showsByCollection, right), (show) => show.finalRating) -
          getAggregateValue(getCollectionShowsForSort(showsByCollection, left), (show) => show.finalRating) ||
        getCollectionSortOrder(left) - getCollectionSortOrder(right) ||
        getCollectionSortTitle(left).localeCompare(getCollectionSortTitle(right))
      );
    }
    if (sortMode === "popularity") {
      return (
        getAggregateValue(getCollectionShowsForSort(showsByCollection, right), (show) => show.popularity?.score) -
          getAggregateValue(getCollectionShowsForSort(showsByCollection, left), (show) => show.popularity?.score) ||
        getCollectionSortOrder(left) - getCollectionSortOrder(right) ||
        getCollectionSortTitle(left).localeCompare(getCollectionSortTitle(right))
      );
    }
    return getCollectionSortOrder(left) - getCollectionSortOrder(right) || getCollectionSortTitle(left).localeCompare(getCollectionSortTitle(right));
  });
}
