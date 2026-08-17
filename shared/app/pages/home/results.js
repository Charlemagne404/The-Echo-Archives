import { syncCommunityCardBadges } from "../../community.js";
import { syncShowCardPresentation } from "../../render-cards.js";
import { syncBrowseUrlState } from "./url-state.js";
import { formatResultsSummaryPrefix, matchesSelectedFilters, renderActiveBrowseState, syncHomeControls } from "./filters.js";
import { patchArchiveGrid, sortVisibleShows } from "./layout.js";
import { syncResultsSummary } from "./results-motion.js";

const HOME_RESULTS_PAGE_SIZE = 60;
const AUTO_LOAD_SCROLL_ATTEMPTS_REQUIRED = 5;
const AUTO_LOAD_ATTEMPT_DEBOUNCE_MS = 400;
const AUTO_LOAD_BOTTOM_TOLERANCE_PX = 24;
const LOAD_MORE_CHANGE_REASONS = new Set(["load-more", "auto-load"]);

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
  let displayedResultLimit = HOME_RESULTS_PAGE_SIZE;
  let matchingResultCount = 0;
  let displayedResultCount = 0;
  let autoLoadScrollAttempts = 0;
  let lastAutoLoadAttemptAt = 0;
  let touchStartY = null;

  function syncNoResultsState(isActive) {
    const mount = elements.noResultsMount;
    if (!(mount instanceof HTMLElement)) return;
    const existing = mount.querySelector("#noResultsMsg");
    if (!isActive) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const state = document.createElement("div");
    state.id = "noResultsMsg";
    state.className = "empty-state-card";
    state.innerHTML = `
      <p>No matches yet. Try a tone, format, completion status, or a search like "Midnight Burger like".</p>
      <div class="empty-state-actions">
        <button id="clearResultsState" class="quick-filter" type="button">Clear filters</button>
        <a class="collection-action" href="/collections">Browse collections</a>
        <button class="quick-filter" type="button" data-open-chat data-chat-initial-prompt="Help me find something finished or easy to jump into.">Ask the Archivist</button>
        <a class="collection-action" href="/submit">Submit or correct a show</a>
      </div>`;
    mount.appendChild(state);
  }

  function hasMoreResults() {
    return matchingResultCount > displayedResultCount;
  }

  function syncLoadMoreSurface() {
    const hasMore = hasMoreResults();
    elements.loadMoreSurface.hidden = !hasMore;
    if (!hasMore) {
      elements.loadMoreStatus.textContent = "";
      elements.loadMoreButton.textContent = "Load more shows";
      return;
    }

    const remainingCount = matchingResultCount - displayedResultCount;
    const nextPageSize = Math.min(HOME_RESULTS_PAGE_SIZE, remainingCount);
    elements.loadMoreStatus.textContent = `Showing ${displayedResultCount} of ${matchingResultCount} shows.`;
    elements.loadMoreButton.textContent = `Load ${nextPageSize} more ${nextPageSize === 1 ? "show" : "shows"}`;
  }

  function resetAutoLoadScrollAttempts() {
    autoLoadScrollAttempts = 0;
    lastAutoLoadAttemptAt = 0;
  }

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

  function loadMoreResults(changeReason = "load-more") {
    if (!hasMoreResults()) {
      return;
    }

    displayedResultLimit += HOME_RESULTS_PAGE_SIZE;
    resetAutoLoadScrollAttempts();
    scheduleHomeResults(changeReason);
  }

  function isAtPageEnd() {
    const documentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    return window.innerHeight + window.scrollY >= documentHeight - AUTO_LOAD_BOTTOM_TOLERANCE_PX;
  }

  function registerDownwardScrollAttempt() {
    if (!hasMoreResults()) {
      return;
    }

    if (!isAtPageEnd()) {
      resetAutoLoadScrollAttempts();
      return;
    }

    const now = Date.now();
    if (now - lastAutoLoadAttemptAt < AUTO_LOAD_ATTEMPT_DEBOUNCE_MS) {
      return;
    }

    lastAutoLoadAttemptAt = now;
    autoLoadScrollAttempts += 1;
    if (autoLoadScrollAttempts >= AUTO_LOAD_SCROLL_ATTEMPTS_REQUIRED) {
      loadMoreResults("auto-load");
      return;
    }
  }

  function handleWindowScroll() {
    if (!isAtPageEnd() && autoLoadScrollAttempts > 0) {
      resetAutoLoadScrollAttempts();
    }
  }

  function handleWheel(event) {
    if (event.deltaY <= 0) {
      if (event.deltaY < 0) {
        resetAutoLoadScrollAttempts();
      }
      return;
    }

    registerDownwardScrollAttempt();
  }

  function handleTouchStart(event) {
    touchStartY = event.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(event) {
    const endY = event.changedTouches[0]?.clientY;
    const didSwipeDownPage = touchStartY !== null && Number.isFinite(endY) && touchStartY - endY > 12;
    touchStartY = null;
    if (didSwipeDownPage) {
      registerDownwardScrollAttempt();
    }
  }

  function renderHomeResults(changeReason = "explicit") {
    previewController.closeActivePreview({ immediate: true });
    const selectedCollection = getSelectedCollection();
    const matchingShows = getVisibleShows(selectedCollection);
    const visibleShows = matchingShows.slice(0, displayedResultLimit);
    matchingResultCount = matchingShows.length;
    displayedResultCount = visibleShows.length;
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
      favoriteRoutesSection: elements.favoriteRoutesSection,
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

    const fullReviewCount = matchingShows.filter((show) => show.reviewStatus === "full-review").length;
    const suffix = fullReviewCount === 1 ? "full review" : "full reviews";
    const collectionPrefix = selectedCollection ? `Collection: ${selectedCollection.title} • ` : "";
    const browsePrefix = `${collectionPrefix}${formatResultsSummaryPrefix(activeDescriptors)}`;
    const resultCountLabel = displayedResultCount < matchingResultCount ? `${displayedResultCount} of ${matchingResultCount}` : `${matchingResultCount}`;
    const searchPrefix = state.query ? `${resultCountLabel} results for "${state.query}"` : `${resultCountLabel} results`;
    const modePrefix = !state.query && state.sortMode === "recently-updated" ? "Recently updated • " : "";
    syncResultsSummary(
      elements.resultsSummary,
      `${browsePrefix}${modePrefix}${searchPrefix} • ${fullReviewCount} ${suffix}`,
      { skipAnimation: !hasRenderedHomeResults || changeReason === "initial" },
    );
    syncNoResultsState(matchingShows.length === 0);
    syncLoadMoreSurface();
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
    if (!LOAD_MORE_CHANGE_REASONS.has(changeReason) && changeReason !== "layout-change") {
      displayedResultLimit = HOME_RESULTS_PAGE_SIZE;
      resetAutoLoadScrollAttempts();
    }
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

  elements.loadMoreButton.addEventListener("click", () => loadMoreResults("load-more"));
  window.addEventListener("wheel", handleWheel, { passive: true });
  window.addEventListener("scroll", handleWindowScroll, { passive: true });
  window.addEventListener("touchstart", handleTouchStart, { passive: true });
  window.addEventListener("touchend", handleTouchEnd, { passive: true });

  return { renderHomeResults, scheduleHomeResults };
}
