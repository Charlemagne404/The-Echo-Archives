import { createEntitySearchResults } from "./entity-results.js";
import { syncCommunityCardBadges } from "../../community.js";
import { ARCHIVIST_ENABLED } from "../../constants.js";
import { setShowDiscoveryMarker, syncShowCardPresentation } from "../../render-cards.js";
import { bucketDiscoveryPosition, getDiscoveryContentProfile } from "../../discovery-analytics.js";
import { getSavedHomeResultLimit, HOME_RESULTS_PAGE_SIZE, persistHomeResultLimit } from "./state.js";
import { buildBrowseUrlState, syncBrowseUrlState } from "./url-state.js";
import { formatResultsSummaryPrefix, matchesSelectedFilters, renderActiveBrowseState, syncHomeControls } from "./filters.js";
import { patchArchiveGrid, sortVisibleShows } from "./layout.js";
import { syncResultsSummary } from "./results-motion.js";

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
  onBeforeUrlSync = () => {},
  onResultsRendered = () => {},
}) {
  const renderEntityResults = createEntitySearchResults(elements.archiveGrid, shows);
  let pendingRenderReason = "";
  let pendingHistoryMode = "replace";
  let renderFrame = 0;
  let hasRenderedHomeResults = false;
  let lastCommittedUrl = "";
  let displayedResultLimit = getSavedHomeResultLimit();
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
    const archivistAction = ARCHIVIST_ENABLED
      ? '<button class="quick-filter" type="button" data-open-chat data-chat-initial-prompt="Help me find something finished or easy to jump into.">Ask the Archivist</button>'
      : "";
    state.innerHTML = `
      <p>Nothing matched that search. Try a broader term, clear a filter, or browse collections.</p>
      <div class="empty-state-actions">
        <button id="clearResultsState" class="quick-filter" type="button">Clear filters</button>
        <a class="collection-action" href="/collections">Browse collections</a>
        ${archivistAction}
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
    persistHomeResultLimit(displayedResultLimit);
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

  function synchronizeUrlState(historyMode, changeReason) {
    const nextUrl = buildBrowseUrlState(state);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const shouldPush = historyMode === "push" && nextUrl !== lastCommittedUrl;
    const effectiveHistoryMode = shouldPush ? "push" : "replace";
    const shouldWrite = effectiveHistoryMode === "push" || nextUrl !== currentUrl;
    if (shouldWrite) {
      onBeforeUrlSync({ changeReason, currentUrl, historyMode: effectiveHistoryMode, nextUrl });
    }

    const syncedUrl = syncBrowseUrlState(state, { historyMode: effectiveHistoryMode });
    if (effectiveHistoryMode === "push" || changeReason === "initial" || changeReason === "history-restore") {
      lastCommittedUrl = syncedUrl;
    }
    return syncedUrl;
  }

  function commitCurrentUrlState() {
    const nextUrl = buildBrowseUrlState(state);
    if (nextUrl === lastCommittedUrl) {
      synchronizeUrlState("replace", "search-commit");
      return false;
    }

    synchronizeUrlState("push", "search-commit");
    return true;
  }

  function renderHomeResults(changeReason = "explicit", historyMode = "replace") {
    previewController.closeActivePreview({ immediate: true });
    const selectedCollection = getSelectedCollection();
    const matchingShows = getVisibleShows(selectedCollection);
    renderEntityResults(state.query);
    const visibleShows = matchingShows.slice(0, displayedResultLimit);
    matchingResultCount = matchingShows.length;
    displayedResultCount = visibleShows.length;
    const activeDescriptors = getDescriptors();

    const browseState = state.query
      ? (getActiveFilterCountForResults(state.filters) > 0 || selectedCollection ? "search_and_filtered" : "search")
      : (getActiveFilterCountForResults(state.filters) > 0 || selectedCollection ? "filtered" : "default");
    visibleShows.forEach((show, index) => {
      const shell = archiveCardShellsById.get(show.id);
      if (shell) {
        syncShowCardPresentation(shell, show);
        const card = shell.querySelector(".podcast-card");
        const hasCollectionMembership = Boolean(selectedCollection?.id);
        const discovery = {
          showId: show.id,
          surface: "home_archive_grid",
          browseState,
          resultType: hasCollectionMembership ? "collection_member" : state.query ? "search_result" : "show_card",
          recommendationSource: hasCollectionMembership ? "collection_membership" : "none",
          resultPositionBucket: bucketDiscoveryPosition(index + 1),
          contentProfile: getDiscoveryContentProfile(show.reviewStatus),
          collectionId: selectedCollection?.id || "",
        };
        setShowDiscoveryMarker(card, discovery);
        shell.__homeCardDiscovery = {
          surface: discovery.surface,
          browseState: discovery.browseState,
          resultType: discovery.resultType,
          recommendationSource: discovery.recommendationSource,
          resultPositionBucket: discovery.resultPositionBucket,
          contentProfile: discovery.contentProfile,
          collectionId: discovery.collectionId,
        };
        const previewLink = shell.querySelector(".preview-open-link");
        if (previewLink) {
          setShowDiscoveryMarker(previewLink, discovery);
        }
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
      onAfterRemove: () => scheduleHomeResults("explicit", "push"),
    });
    synchronizeUrlState(historyMode, changeReason);
    persistHomeResultLimit(displayedResultLimit);
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
    onResultsRendered({
      changeReason,
      query: state.query,
      resultCount: matchingResultCount,
      displayedResultCount,
      activeFilterCount: Object.values(state.filters).reduce((count, values) => count + values.size, 0),
      selectedCollectionId: state.selectedCollectionId,
    });
    hasRenderedHomeResults = true;
  }

  function scheduleHomeResults(changeReason = "explicit", historyMode = "replace") {
    if (changeReason === "history-restore") {
      if (renderFrame) {
        window.cancelAnimationFrame(renderFrame);
        renderFrame = 0;
      }
      pendingRenderReason = "";
      pendingHistoryMode = "replace";
      displayedResultLimit = getSavedHomeResultLimit();
      resetAutoLoadScrollAttempts();
      renderHomeResults(changeReason, "replace");
      return;
    }

    if (!LOAD_MORE_CHANGE_REASONS.has(changeReason) && changeReason !== "layout-change") {
      displayedResultLimit = HOME_RESULTS_PAGE_SIZE;
      persistHomeResultLimit(displayedResultLimit);
      resetAutoLoadScrollAttempts();
    }
    pendingRenderReason = pendingRenderReason === "explicit" || changeReason === "explicit" ? "explicit" : changeReason;
    if (historyMode === "push") {
      pendingHistoryMode = "push";
    }
    if (renderFrame) {
      return;
    }

    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      const nextReason = pendingRenderReason || changeReason;
      const nextHistoryMode = pendingHistoryMode;
      pendingRenderReason = "";
      pendingHistoryMode = "replace";
      renderHomeResults(nextReason, nextHistoryMode);
    });
  }

  elements.loadMoreButton.addEventListener("click", () => loadMoreResults("load-more"));
  window.addEventListener("wheel", handleWheel, { passive: true });
  window.addEventListener("scroll", handleWindowScroll, { passive: true });
  window.addEventListener("touchstart", handleTouchStart, { passive: true });
  window.addEventListener("touchend", handleTouchEnd, { passive: true });

  return { commitCurrentUrlState, renderHomeResults, restoreHomeResults: () => scheduleHomeResults("history-restore"), scheduleHomeResults };
}

function getActiveFilterCountForResults(filters) {
  return Object.values(filters).reduce((count, values) => count + values.size, 0);
}
