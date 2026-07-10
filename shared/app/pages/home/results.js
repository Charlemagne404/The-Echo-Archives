import { syncCommunityCardBadges } from "../../community.js";
import { syncShowCardPresentation } from "../../render-cards.js";
import { syncBrowseUrlState } from "./url-state.js";
import { formatResultsSummaryPrefix, matchesSelectedFilters, renderActiveBrowseState, syncHomeControls } from "./filters.js";
import { patchArchiveGrid, sortVisibleShows } from "./layout.js";
import { syncResultsSummary, syncResultsSurfaceVisibility } from "./results-motion.js";

export function createHomeResultsController({
  archiveCardShellsById,
  elements,
  filterMenuBuckets,
  filterOptionsByGroup,
  getDescriptors,
  getSelectedCollection,
  mostPopularController,
  previewController,
  searchPerformanceCache,
  shows,
  state,
  stickyBrowseController,
}) {
  let pendingRenderReason = "";
  let renderFrame = 0;
  let hasRenderedHomeResults = false;

  function getVisibleShows(selectedCollection) {
    const selectedCollectionShowIds = searchPerformanceCache.getCollectionShowIdSet(selectedCollection);
    const filteredShows = shows.filter((show) => {
      const matchesFilters = matchesSelectedFilters(show, state.filters);
      const matchesCollection = !selectedCollectionShowIds || selectedCollectionShowIds.has(show.id);
      return matchesFilters && matchesCollection;
    });

    if (!state.query) {
      return sortVisibleShows({ visibleShows: filteredShows, selectedCollection, sortMode: state.sortMode });
    }

    const scoredResults = searchPerformanceCache.getScoredSearchResults(state.query);
    const filteredIds = new Set(filteredShows.map((show) => show.id));
    return scoredResults.filter((show) => filteredIds.has(show.id));
  }

  function renderHomeResults(changeReason = "explicit") {
    previewController.closeActivePreview({ immediate: true });
    const selectedCollection = getSelectedCollection();
    const visibleShows = getVisibleShows(selectedCollection);
    const activeDescriptors = getDescriptors();

    visibleShows.forEach((show) => {
      const shell = archiveCardShellsById.get(show.id);
      if (shell) {
        syncShowCardPresentation(shell, show);
      }
    });

    mostPopularController.syncMostPopularSectionVisibility();
    patchArchiveGrid({
      archiveGrid: elements.archiveGrid,
      collectionsSection: elements.collectionsSection,
      visibleShows,
      archiveCardShellsById,
      gridLayoutBucket: state.gridLayoutBucket,
      changeReason,
    });
    delete elements.archiveGrid.dataset.loading;
    renderActiveBrowseState({
      activeBrowseState: elements.activeBrowseState,
      activeBrowseChips: elements.activeBrowseChips,
      activeBrowseClear: elements.activeBrowseClear,
      descriptors: activeDescriptors,
      onAfterRemove: () => scheduleHomeResults("explicit"),
    });
    syncBrowseUrlState(state);
    void syncCommunityCardBadges(elements.archiveGrid, visibleShows);

    const fullReviewCount = visibleShows.filter((show) => show.reviewStatus === "full-review").length;
    const suffix = fullReviewCount === 1 ? "full review" : "full reviews";
    const collectionPrefix = selectedCollection ? `Collection: ${selectedCollection.title} • ` : "";
    const browsePrefix = `${collectionPrefix}${formatResultsSummaryPrefix(activeDescriptors)}`;
    const searchPrefix = state.query ? `${visibleShows.length} results for "${state.query}"` : `${visibleShows.length} results`;
    const modePrefix = !state.query && state.sortMode === "recently-updated" ? "Recently updated • " : "";
    syncResultsSummary(
      elements.resultsSummary,
      `${browsePrefix}${modePrefix}${searchPrefix} • ${fullReviewCount} ${suffix}`,
      { skipAnimation: !hasRenderedHomeResults || changeReason === "initial" },
    );
    syncResultsSurfaceVisibility(elements.noResultsMsg, visibleShows.length === 0, {
      openDurationMs: 220,
      closeDurationMs: 160,
      enterOffsetY: 12,
    });
    syncHomeControls({
      quickFiltersRoot: elements.quickFiltersRoot,
      browseModesRoot: elements.browseModesRoot,
      filterOptionGrid: elements.filterOptionGrid,
      filterCount: elements.filterCount,
      filterClear: elements.filterClear,
      filterMenuBuckets,
      filterOptionsByGroup,
      filters: state.filters,
      query: state.query,
      selectedCollectionId: state.selectedCollectionId,
      sortMode: state.sortMode,
    });
    syncHomeControls({
      filterOptionGrid: elements.stickyFilterOptionGrid,
      filterCount: elements.stickyFilterCount,
      filterClear: elements.stickyFilterClear,
      filterMenuBuckets,
      filterOptionsByGroup,
      filters: state.filters,
      query: state.query,
      selectedCollectionId: state.selectedCollectionId,
      sortMode: state.sortMode,
    });
    stickyBrowseController.syncStickySearchMode();
    hasRenderedHomeResults = true;
  }

  function scheduleHomeResults(changeReason = "explicit") {
    pendingRenderReason = pendingRenderReason === "explicit" || changeReason === "explicit" ? "explicit" : changeReason;
    if (renderFrame) {
      return;
    }

    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      const nextReason = pendingRenderReason || changeReason;
      pendingRenderReason = "";
      renderHomeResults(nextReason);
    });
  }

  return { renderHomeResults, scheduleHomeResults };
}
