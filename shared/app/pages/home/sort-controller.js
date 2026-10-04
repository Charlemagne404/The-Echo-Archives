import { loadCommunitySummaries } from "../../community.js";
import { loadPopularityScores } from "../../data.js";

export function createHomeSortController({ elements, publishedShows, state, commitPendingSearchHistory, scheduleHomeResults }) {
  let communitySummaryPromise = null;
  let popularityScorePromise = null;
  let changeToken = 0;

  function ensureCommunityRatingSummaries() {
    if (state.communitySummaries) return Promise.resolve(state.communitySummaries);
    if (!communitySummaryPromise) {
      communitySummaryPromise = loadCommunitySummaries(publishedShows.map((show) => show.id))
        .then((summaries) => {
          state.communitySummaries = summaries;
          return summaries;
        })
        .catch((error) => {
          communitySummaryPromise = null;
          throw error;
        });
    }
    return communitySummaryPromise;
  }

  function ensurePopularityScores() {
    if (state.popularityScores) return Promise.resolve(state.popularityScores);
    if (!popularityScorePromise) {
      popularityScorePromise = loadPopularityScores()
        .then((scores) => {
          state.popularityScores = scores;
          return scores;
        })
        .catch((error) => {
          popularityScorePromise = null;
          throw error;
        });
    }
    return popularityScorePromise;
  }

  function syncSelectedSort() {
    const sortSelect = elements.browseModesRoot.querySelector("#browseSort");
    if (sortSelect) sortSelect.value = state.sortMode;
  }

  async function changeMode(modeId) {
    const requestToken = ++changeToken;
    if (modeId === "search-relevance") {
      commitPendingSearchHistory();
      state.sortMode = "popular";
      state.sortModeExplicit = false;
      scheduleHomeResults("explicit", "push");
      return;
    }
    if (state.sortMode === modeId && state.sortModeExplicit) return;

    commitPendingSearchHistory();
    if (modeId === "most-rated" && !state.communitySummaries) {
      elements.resultsSummary.textContent = "Loading listener rating counts…";
      try {
        await ensureCommunityRatingSummaries();
      } catch (_error) {
        if (requestToken !== changeToken) return;
        syncSelectedSort();
        elements.resultsSummary.textContent = "Listener rating counts are unavailable. The current sort was kept.";
        return;
      }
    }
    if (modeId === "popular" && !state.popularityScores) {
      await ensurePopularityScores().catch(() => null);
    }
    if (requestToken !== changeToken) return;
    state.sortMode = modeId;
    state.sortModeExplicit = true;
    scheduleHomeResults("explicit", "push");
  }

  async function initialize() {
    if (state.sortMode === "most-rated") {
      try {
        await ensureCommunityRatingSummaries();
      } catch (_error) {
        state.sortMode = "popular";
        state.sortModeExplicit = false;
        syncSelectedSort();
      }
    }
    if (state.sortMode === "popular") await ensurePopularityScores().catch(() => null);
  }

  return {
    changeMode,
    initialize,
    cancelPendingChanges() {
      changeToken += 1;
    },
  };
}
