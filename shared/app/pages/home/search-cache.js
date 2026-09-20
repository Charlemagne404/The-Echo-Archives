const SEARCH_SCORE_CACHE_LIMIT = 12;

export function createHomeSearchPerformanceCache({ shows, archiveSearch, similarityIndex = null }) {
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
      // Keep punctuation/case variants on the same bounded cache entry. The
      // scorer applies the same canonicalization, so recomputing these forms
      // only wastes work as the catalogue grows.
      const cacheKey = archiveSearch.normalizeText(query);
      if (!cacheKey) {
        return [];
      }

      const cachedResults = scoredSearchResultsByQuery.get(cacheKey);
      if (cachedResults) {
        return cachedResults;
      }

      const scoredResults = archiveSearch.scoreCatalog(shows, cacheKey, {
        includeComputedSimilarityFallback: true,
        similarityIndex,
      });
      scoredSearchResultsByQuery.set(cacheKey, scoredResults);
      if (scoredSearchResultsByQuery.size > SEARCH_SCORE_CACHE_LIMIT) {
        const oldestKey = scoredSearchResultsByQuery.keys().next().value;
        scoredSearchResultsByQuery.delete(oldestKey);
      }
      return scoredResults;
    },
  };
}
