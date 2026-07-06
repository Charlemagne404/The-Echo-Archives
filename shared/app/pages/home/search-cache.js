const SEARCH_SCORE_CACHE_LIMIT = 12;

export function createHomeSearchPerformanceCache({ shows, archiveSearch }) {
  const collectionShowIdSets = new Map();
  const scoredSearchResultsByQuery = new Map();

  return {
    getCollectionShowIdSet(collection) {
      if (!collection) {
        return null;
      }

      if (!collectionShowIdSets.has(collection.id)) {
        collectionShowIdSets.set(collection.id, new Set(collection.showIds));
      }

      return collectionShowIdSets.get(collection.id);
    },

    getScoredSearchResults(query) {
      const cacheKey = query.trim();
      if (!cacheKey) {
        return [];
      }

      const cachedResults = scoredSearchResultsByQuery.get(cacheKey);
      if (cachedResults) {
        return cachedResults;
      }

      const scoredResults = archiveSearch.scoreCatalog(shows, cacheKey);
      scoredSearchResultsByQuery.set(cacheKey, scoredResults);
      if (scoredSearchResultsByQuery.size > SEARCH_SCORE_CACHE_LIMIT) {
        const oldestKey = scoredSearchResultsByQuery.keys().next().value;
        scoredSearchResultsByQuery.delete(oldestKey);
      }
      return scoredResults;
    },
  };
}
