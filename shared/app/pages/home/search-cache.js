import { archiveSimilarity } from "../../constants.js";
import { createPersonalDiscoveryPersonalizer } from "../../discovery-personalization.js";
import { createHomeDiscoveryAdapter } from "./discovery.js";

const SEARCH_SCORE_CACHE_LIMIT = 12;

function addRuntimeEvidence(shows, runtimeEvidence) {
  const lengthById = new Map((Array.isArray(runtimeEvidence) ? runtimeEvidence : [])
    .filter((record) => record?.id && record.length && Object.keys(record.length).length)
    .map((record) => [record.id, record.length]));
  return shows.map((show) => {
    const length = lengthById.get(show.id);
    return length ? { ...show, length } : show;
  });
}

export function createHomeSearchPerformanceCache({
  shows,
  archiveSearch,
  collections = [],
  runtimeEvidence = [],
  runtimeEvidencePromise = null,
  similarityIndex = null,
  discoveryAdapter = null,
  catalogueRevision = "",
}) {
  const activeSimilarityIndex = similarityIndex || archiveSimilarity?.createSimilarityIndex?.({ shows, collections }) || null;
  const activeDiscoveryAdapter = discoveryAdapter || createHomeDiscoveryAdapter({
    shows,
    runtimeEvidence,
    collections,
    archiveSearch,
    similarityIndex: activeSimilarityIndex,
    catalogueRevision: catalogueRevision || `${globalThis.document?.body?.dataset.searchIndexVersion || "search"}:${globalThis.document?.body?.dataset.collectionsVersion || "collections"}`,
  });
  let personalSimilarityIndex = similarityIndex
    || archiveSimilarity?.createSimilarityIndex?.({ shows: addRuntimeEvidence(shows, runtimeEvidence), collections })
    || null;
  let personalizeDiscoveryResult = createPersonalDiscoveryPersonalizer({
    shows,
    similarityIndex: personalSimilarityIndex,
    scope: "search",
  });
  if (runtimeEvidencePromise && typeof runtimeEvidencePromise.then === "function") {
    void runtimeEvidencePromise.then((records) => {
      activeDiscoveryAdapter?.setRuntimeEvidence(records);
      if (!similarityIndex && archiveSimilarity?.createSimilarityIndex && Array.isArray(records) && records.length) {
        personalSimilarityIndex = archiveSimilarity.createSimilarityIndex({
          shows: addRuntimeEvidence(shows, records),
          collections,
        });
        personalizeDiscoveryResult = createPersonalDiscoveryPersonalizer({
          shows,
          similarityIndex: personalSimilarityIndex,
          scope: "search",
        });
      }
    });
  }
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
        similarityIndex: activeSimilarityIndex,
      });
      scoredSearchResultsByQuery.set(cacheKey, scoredResults);
      if (scoredSearchResultsByQuery.size > SEARCH_SCORE_CACHE_LIMIT) {
        const oldestKey = scoredSearchResultsByQuery.keys().next().value;
        scoredSearchResultsByQuery.delete(oldestKey);
      }
      return scoredResults;
    },

    getDiscoverySearch(query) {
      return activeDiscoveryAdapter?.getSearch(query) || null;
    },

    getDiscoveryIntent(query) {
      return activeDiscoveryAdapter?.getIntent(query) || null;
    },

    personalizeDiscoveryResult(publicResult, personalContext, intent) {
      return personalizeDiscoveryResult({ publicResult, personalContext, intent });
    },
  };
}
