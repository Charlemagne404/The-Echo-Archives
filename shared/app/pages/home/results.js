import { createEntitySearchResults } from "./entity-results.js";
import { syncCommunityCardBadges } from "../../community.js";
import { ARCHIVIST_ENABLED } from "../../constants.js";
import { createDiscoveryHistoryController } from "../../discovery-history.js";
import { setShowDiscoveryMarker, syncShowCardPresentation } from "../../render-cards.js";
import { bucketDiscoveryPosition, getDiscoveryContentProfile } from "../../discovery-analytics.js";
import { createCollectionHref } from "../../urls.js";
import { getSavedHomeResultLimit, HOME_RESULTS_PAGE_SIZE, persistHomeResultLimit } from "./state.js";
import { buildBrowseUrlState, syncBrowseUrlState } from "./url-state.js";
import { formatResultsSummaryPrefix, matchesSelectedFilters, renderActiveBrowseState, syncHomeControls } from "./filters.js";
import { patchArchiveGrid, sortVisibleShows } from "./layout.js";
import { syncResultsSummary } from "./results-motion.js";
import { getDiscoveryFeedback } from "./discovery-feedback.js";

const AUTO_LOAD_SCROLL_ATTEMPTS_REQUIRED = 5;
const AUTO_LOAD_ATTEMPT_DEBOUNCE_MS = 400;
const AUTO_LOAD_BOTTOM_TOLERANCE_PX = 24;
const LOAD_MORE_CHANGE_REASONS = new Set(["load-more", "auto-load"]);
const DISABLED_PERSONAL_CONTEXT = Object.freeze({ enabled: false, entries: Object.freeze([]) });

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
  getPersonalContext = () => DISABLED_PERSONAL_CONTEXT,
  onBeforeUrlSync = () => {},
  onResultsRendered = () => {},
}) {
  const renderEntityResults = createEntitySearchResults(elements.archiveGrid, shows);
  const showsById = new Map(shows.map((show) => [show.id, show]));
  let pendingRenderReason = "";
  let pendingHistoryMode = "replace";
  let renderFrame = 0;
  let hasRenderedHomeResults = false;
  let displayedResultLimit = getSavedHomeResultLimit();
  let matchingResultCount = 0;
  let displayedResultCount = 0;
  let autoLoadScrollAttempts = 0;
  let lastAutoLoadAttemptAt = 0;
  let touchStartY = null;

  const { commitCurrentUrlState: commitUrlState, synchronizeUrlState } = createDiscoveryHistoryController({
    state,
    buildUrl: buildBrowseUrlState,
    syncUrl: syncBrowseUrlState,
    onBeforeSync: onBeforeUrlSync,
  });

  const commitCurrentUrlState = () => {
    state.discoveryIntent = searchPerformanceCache.getDiscoverySearch(state.query)?.intent || null;
    return commitUrlState();
  };

  function getDiscoveryCandidates(publicResult, isSimilarity) {
    const sections = publicResult?.sections || {};
    return isSimilarity
      ? [...(sections.authoredSimilarity || []), ...(sections.computedSimilarity || [])]
      : (sections.shows || []);
  }

  function getSearchCandidatePresentation(candidates) {
    const visibleShows = [];
    const candidatesById = new Map();
    const publicPositionById = new Map();
    const seen = new Set();
    for (const candidate of candidates) {
      if (!candidate?.id || seen.has(candidate.id)) continue;
      const show = showsById.get(candidate.id);
      if (!show) continue;
      seen.add(candidate.id);
      visibleShows.push(show);
      candidatesById.set(candidate.id, candidate);
      publicPositionById.set(candidate.id, visibleShows.length);
    }
    return { visibleShows, candidatesById, publicPositionById };
  }

  function hasPersonalSignals(personalContext) {
    return personalContext?.enabled === true
      && Array.isArray(personalContext.entries)
      && personalContext.entries.length > 0;
  }

  function syncNoResultsState(isActive, discoveryResult = null, collectionRoutes = []) {
    const mount = elements.noResultsMount;
    if (!(mount instanceof HTMLElement)) return;
    const existing = mount.querySelector("#noResultsMsg");
    if (!isActive) {
      existing?.remove();
      return;
    }
    existing?.remove();
    const state = document.createElement("div");
    state.id = "noResultsMsg";
    state.className = "empty-state-card";
    const archivistAction = ARCHIVIST_ENABLED
      ? '<button class="quick-filter" type="button" data-open-chat data-chat-initial-prompt="Help me find something finished or easy to jump into.">Ask the Archivist</button>'
      : "";
    const message = discoveryResult?.outcome === "requires-personal-context"
      ? "This request depends on private listening history, which public search does not use."
      : discoveryResult?.outcome === "needs-clarification"
        ? "That request needs a clearer choice. Edit the search or filters to choose what you mean."
        : discoveryResult?.outcome === "no-results"
          ? "No shows met every requested condition. Edit the search or filters to broaden it; Echo kept those conditions strict."
          : collectionRoutes.length
            ? "That query matches a curated collection. Open its existing listening path."
            : "Nothing matched that search. Try a broader term, clear a filter, or browse collections.";
    state.innerHTML = `
      <p>${message}</p>
      <div class="empty-state-actions">
        <button id="clearResultsState" class="quick-filter" type="button">Clear filters</button>
        <a class="collection-action" href="/collections">Browse collections</a>
        ${archivistAction}
        <a class="collection-action" href="/submit">Submit or correct a show</a>
      </div>`;
    const actions = state.querySelector(".empty-state-actions");
    collectionRoutes.slice(0, 3).forEach((collection) => {
      const link = document.createElement("a");
      link.className = "collection-action";
      link.href = createCollectionHref(collection.id);
      link.textContent = `Open ${collection.title}`;
      link.dataset.discoveryCollectionId = collection.id;
      link.dataset.discoverySurface = "home_collection_results";
      actions?.prepend(link);
    });
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

  function getVisibleShows(selectedCollection, discoverySearch = null) {
    const selectedCollectionShowIds = searchPerformanceCache.getCollectionShowIdSet(selectedCollection);
    const filteredShows = shows.filter((show) => {
      const matchesFilters = matchesSelectedFilters(show, state.filters);
      const matchesCollection = !selectedCollectionShowIds || selectedCollectionShowIds.has(show.id);
      return matchesFilters && matchesCollection;
    });

    if (!state.query) {
      return {
        shows: sortVisibleShows({ visibleShows: filteredShows, selectedCollection, sortMode: state.sortMode }),
        candidatesById: new Map(),
        publicPositionById: new Map(),
        publicResultCount: filteredShows.length,
      };
    }

    const matchingIds = new Set(filteredShows.map((show) => show.id));
    if (discoverySearch?.result) {
      const sections = discoverySearch.result.sections || {};
      const isSimilarity = discoverySearch.intent.kind === "similarity";
      const visibleSections = { ...sections };
      if (isSimilarity) {
        visibleSections.authoredSimilarity = (sections.authoredSimilarity || []).filter((entry) => matchingIds.has(entry.id));
        visibleSections.computedSimilarity = (sections.computedSimilarity || []).filter((entry) => matchingIds.has(entry.id));
      } else {
        visibleSections.shows = (sections.shows || []).filter((entry) => matchingIds.has(entry.id));
      }
      const publicResult = {
        ...discoverySearch.result,
        sections: visibleSections,
      };
      const publicCandidates = isSimilarity
        ? [...visibleSections.authoredSimilarity, ...visibleSections.computedSimilarity]
        : visibleSections.shows;
      const publicPresentation = getSearchCandidatePresentation(publicCandidates);
      const personalContext = getPersonalContext();
      if (!hasPersonalSignals(personalContext)) {
        return {
          shows: publicPresentation.visibleShows,
          candidatesById: publicPresentation.candidatesById,
          publicPositionById: publicPresentation.publicPositionById,
          publicResultCount: publicPresentation.visibleShows.length,
        };
      }

      const personalizedResult = searchPerformanceCache.personalizeDiscoveryResult(publicResult, personalContext, discoverySearch.intent);
      if (personalizedResult === publicResult) {
        return {
          shows: publicPresentation.visibleShows,
          candidatesById: publicPresentation.candidatesById,
          publicPositionById: publicPresentation.publicPositionById,
          publicResultCount: publicPresentation.visibleShows.length,
        };
      }
      const personalizedCandidates = getDiscoveryCandidates(personalizedResult, isSimilarity);
      const personalizedPresentation = getSearchCandidatePresentation(personalizedCandidates);
      return {
        shows: personalizedPresentation.visibleShows,
        candidatesById: personalizedPresentation.candidatesById,
        publicPositionById: publicPresentation.publicPositionById,
        publicResultCount: publicPresentation.visibleShows.length,
      };
    }

    const scoredResults = searchPerformanceCache.getScoredSearchResults(state.query);
    const publicCandidates = scoredResults.filter((show) => matchingIds.has(show.id));
    const publicPresentation = getSearchCandidatePresentation(publicCandidates);
    const personalContext = getPersonalContext();
    if (!hasPersonalSignals(personalContext)) {
      return {
        shows: publicCandidates,
        candidatesById: new Map(),
        publicPositionById: publicPresentation.publicPositionById,
        publicResultCount: publicCandidates.length,
      };
    }

    const intent = searchPerformanceCache.getDiscoveryIntent(state.query);
    const publicResult = {
      intent,
      candidateIds: publicCandidates.map((show) => show.id),
      outcome: publicCandidates.length ? "results" : "no-results",
      sections: { shows: publicCandidates },
    };
    const personalizedResult = searchPerformanceCache.personalizeDiscoveryResult(publicResult, personalContext, intent);
    if (personalizedResult === publicResult) {
      return {
        shows: publicCandidates,
        candidatesById: new Map(),
        publicPositionById: publicPresentation.publicPositionById,
        publicResultCount: publicCandidates.length,
      };
    }

    const personalizedCandidates = getDiscoveryCandidates(personalizedResult, false);
    const personalizedPresentation = getSearchCandidatePresentation(personalizedCandidates);
    return {
      shows: personalizedPresentation.visibleShows,
      candidatesById: personalizedPresentation.candidatesById,
      publicPositionById: publicPresentation.publicPositionById,
      publicResultCount: publicCandidates.length,
    };
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

  function renderHomeResults(changeReason = "explicit", historyMode = "replace") {
    previewController.closeActivePreview({ immediate: true });
    const selectedCollection = getSelectedCollection();
    const discoverySearch = state.query ? searchPerformanceCache.getDiscoverySearch(state.query) : null;
    state.discoveryIntent = discoverySearch?.intent || null;
    const {
      shows: matchingShows,
      candidatesById,
      publicPositionById,
      publicResultCount,
    } = getVisibleShows(selectedCollection, discoverySearch);
    const entityResultCount = renderEntityResults(state.query, discoverySearch?.result || null);
    const collectionCandidates = discoverySearch?.collections || [];
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
        const discoveryCandidate = candidatesById.get(show.id);
        if (card && discoveryCandidate) {
          card.dataset.discoveryCandidateSection = discoveryCandidate.section || "shows";
          card.dataset.discoveryCandidateProvenance = discoveryCandidate.provenance?.kind || "archive-search";
        } else if (card) {
          delete card.dataset.discoveryCandidateSection;
          delete card.dataset.discoveryCandidateProvenance;
        }
        const hasCollectionMembership = Boolean(selectedCollection?.id);
        const discovery = {
          showId: show.id,
          surface: "home_archive_grid",
          browseState,
          resultType: hasCollectionMembership ? "collection_member" : state.query ? "search_result" : "show_card",
          recommendationSource: hasCollectionMembership ? "collection_membership" : "none",
          resultPositionBucket: bucketDiscoveryPosition(publicPositionById.get(show.id) || index + 1),
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
    const summaryText = `${browsePrefix}${modePrefix}${searchPrefix} • ${fullReviewCount} ${suffix}`;
    syncResultsSummary(
      elements.resultsSummary,
      summaryText,
      { skipAnimation: !hasRenderedHomeResults || changeReason === "initial" },
    );
    const discoveryFeedback = getDiscoveryFeedback(discoverySearch, state.filters);
    if (discoveryFeedback) {
      const feedback = document.createElement("span");
      feedback.className = "discovery-query-feedback";
      feedback.textContent = ` · ${discoveryFeedback}`;
      elements.resultsSummary.append(feedback);
    }
    const personalReason = state.query
      ? visibleShows
        .map((show) => candidatesById.get(show.id)?.personalizationReason)
        .find((reason) => typeof reason === "string" && reason.trim()) || ""
      : "";
    if (elements.personalDiscoveryReason) {
      elements.personalDiscoveryReason.textContent = personalReason;
      elements.personalDiscoveryReason.hidden = !personalReason;
    }
    syncNoResultsState(matchingShows.length === 0 && entityResultCount === 0, discoverySearch?.result || null, collectionCandidates);
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
      resultCount: publicResultCount,
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
