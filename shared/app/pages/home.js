import { DEFAULT_SOCIAL_IMAGE, HOME_CARD_HOVER_EXPAND_ENABLED, HOME_FAVORITE_ROUTE_IDS, archiveSearch, archiveSimilarity } from "../constants.js";
import { createScrollRestoration } from "../scroll-restoration.js";
import {
  applyArchiveStats,
  buildCollectionMap,
  buildShowMap,
  getArchiveStats,
  getFilterMenuBuckets,
  getQuickFilters,
  getStructuredFilterGroups,
  getVisibleFilterTags,
} from "../data.js";
import { initializeHomePreviewController } from "../home-preview.js";
import { buildWebsiteStructuredData } from "../structured-data.js";
import { BRAND_DESCRIPTOR, DEFAULT_SEO_DESCRIPTION } from "../seo.js";
import { updateDocumentMetadata } from "../utils.js";
import { renderCollectionsRail } from "./home/collections.js";
import { loadHomePageData } from "./home/data-load.js";
import { getHomeElements } from "./home/elements.js";
import { getActiveBrowseDescriptors, renderBrowseModes, renderQuickFilters } from "./home/filters.js";
import { createHomeFilterSurfaceController } from "./home/filter-surfaces.js";
import { getHomeGridLayoutBucket } from "./home/layout.js";
import { renderHomeLoadingState, setBrowseControlsDisabled } from "./home/loading.js";
import { createMostPopularController } from "./home/most-popular.js";
import { buildArchiveCardShellsById, hasPrerenderedHomeContent } from "./home/prerender.js";
import { createRecentlyAddedController } from "./home/recently-added.js";
import { createHomeResultsController } from "./home/results.js";
import { syncResultsSurfaceVisibility } from "./home/results-motion.js";
import { createHomeSearchPerformanceCache } from "./home/search-cache.js";
import { createHomeState } from "./home/state.js";
import { createStickyBrowseController } from "./home/sticky-search.js";
import { createStickyBrowseVisibilityController } from "./home/sticky-visibility.js";
import { seedHomeStateFromParams } from "./home/url-state.js";
import {
  bucketDiscoveryClearedFilterCount,
  bucketDiscoveryFilterCount,
  bucketDiscoveryResultCount,
  trackDiscoveryEvent,
} from "../discovery-analytics.js";

const SHOW_HOME_RECENTLY_ADDED_BAND = true;

export async function initializeHomePage() {
  const elements = getHomeElements();
  if (!elements) {
    return;
  }
  setBrowseControlsDisabled(elements, true);
  const hasPrerenderedHome = hasPrerenderedHomeContent(elements);
  if (!hasPrerenderedHome) {
    renderHomeLoadingState(elements);
  }
  const scrollRestoration = createScrollRestoration();
  scrollRestoration.enable();

  const [shows, collections] = await loadHomePageData(elements);
  if (!shows || !collections) return;
  const showMap = buildShowMap(shows);

  updateDocumentMetadata({
    title: BRAND_DESCRIPTOR,
    description: DEFAULT_SEO_DESCRIPTION,
    path: "/",
    image: DEFAULT_SOCIAL_IMAGE,
    structuredData: buildWebsiteStructuredData(DEFAULT_SEO_DESCRIPTION),
  });
  applyArchiveStats("home", getArchiveStats(shows, collections));

  const filterTags = getVisibleFilterTags(shows);
  const structuredFilterGroups = getStructuredFilterGroups(shows);
  const filterMenuBuckets = getFilterMenuBuckets(structuredFilterGroups);
  const quickFilters = getQuickFilters(filterTags);
  const featuredCollections = collections.filter((collection) => collection.featured);
  const publishedShows = shows.filter((show) => show.status === "published");
  const collectionsById = buildCollectionMap(collections);
  const favoriteCollections = HOME_FAVORITE_ROUTE_IDS.map((collectionId) => collectionsById.get(collectionId)).filter(Boolean);
  const similarityIndex = archiveSimilarity?.createSimilarityIndex?.({ shows, collections }) || null;
  const searchPerformanceCache = createHomeSearchPerformanceCache({ shows, archiveSearch, similarityIndex });
  const filterGroupsById = new Map(structuredFilterGroups.map((group) => [group.id, group]));
  const filterOptionsByGroup = new Map(
    structuredFilterGroups.map((group) => [group.id, new Map(group.options.map((option) => [option.id, option.label]))]),
  );
  const state = createHomeState(structuredFilterGroups);
  seedHomeStateFromParams({ state, shows, collectionsById, structuredFilterGroups });
  const searchInputs = [elements.searchInput, elements.stickySearchInput];
  const homeAnalytics = {
    hasRendered: false,
    previousResultCountBucket: "unknown",
    lastResultCount: 0,
    seenSearchStates: new Set(),
    pendingFilterChanges: [],
    pendingClears: [],
    searchAnalyticsTimer: 0,
    pendingSearch: null,
  };

  const previewMode = HOME_CARD_HOVER_EXPAND_ENABLED ? "inline-expand" : "";
  const previewController = HOME_CARD_HOVER_EXPAND_ENABLED
    ? initializeHomePreviewController({ archiveGrid: elements.archiveGrid, archiveSection: elements.archiveSection })
    : { closeActivePreview() {} };
  const archiveCardShellsById = buildArchiveCardShellsById({
    shows,
    archiveGrid: elements.archiveGrid,
    previewMode,
  });
  const syncCollectionSectionVisibility = (section, sectionCollections, shouldShowMostPopular) => {
    section.hidden = sectionCollections.length === 0 || !shouldShowMostPopular;
  };
  const recentlyAddedController = createRecentlyAddedController({
    publishedShows,
    recentlyAddedSection: elements.recentlyAddedSection,
    recentlyAddedGrid: elements.recentlyAddedGrid,
  });
  const mostPopularController = createMostPopularController({
    showMap,
    publishedShows,
    popularSection: elements.popularSection,
    popularGrid: elements.popularGrid,
    state,
    onVisibilityChange: (shouldShowMostPopular) => {
      syncResultsSurfaceVisibility(elements.popularSection, shouldShowMostPopular, {
        openDurationMs: 250,
        closeDurationMs: 180,
        enterOffsetY: 16,
      });
      syncCollectionSectionVisibility(elements.favoriteRoutesSection, favoriteCollections, shouldShowMostPopular);
      syncCollectionSectionVisibility(elements.collectionsSection, featuredCollections, shouldShowMostPopular);
      recentlyAddedController.setVisible(SHOW_HOME_RECENTLY_ADDED_BAND && shouldShowMostPopular);
      return true;
    },
  });
  let collectionCarouselControls = null;
  let favoriteRoutesCarouselControls = null;
  let searchRenderTimer = 0;
  if (elements.activeBrowseClear) {
    elements.activeBrowseClear.hidden = true;
  }
  let filterSurfaceController;

  const getActiveFilterCountForAnalytics = () =>
    Object.values(state.filters).reduce((count, values) => count + values.size, 0) + Number(Boolean(state.selectedCollectionId));
  const getBrowseStateForAnalytics = () => {
    const hasSearch = Boolean(state.query.trim());
    const hasFilters = getActiveFilterCountForAnalytics() > 0 || Boolean(state.selectedCollectionId);
    return hasSearch ? (hasFilters ? "search_and_filtered" : "search") : hasFilters ? "filtered" : "default";
  };
  const getFilterStateSignature = () =>
    JSON.stringify({
      query: state.query.trim(),
      selectedCollectionId: state.selectedCollectionId,
      filters: Object.fromEntries(
        Object.entries(state.filters).map(([groupId, values]) => [groupId, Array.from(values).sort()]),
      ),
    });

  const recordFilterClear = ({ clearScope = "all", filterGroup = "", count, hadSearch }) => {
    if (count <= 0 && !hadSearch) {
      return;
    }

    homeAnalytics.pendingClears.push({
      clearScope,
      filterGroup,
      count: Math.max(1, count),
      hadSearch,
      resultCountBefore: homeAnalytics.lastResultCount,
    });
  };

  const syncSearchInputs = (nextValue, sourceInput = null) => {
    searchInputs.forEach((input) => {
      if (input !== sourceInput && input.value !== nextValue) {
        input.value = nextValue;
      }
    });
  };

  const clearAllFilters = () => {
    if (searchRenderTimer) {
      window.clearTimeout(searchRenderTimer);
      searchRenderTimer = 0;
    }
    const activeFilterCount = getActiveFilterCountForAnalytics();
    const hadSearch = Boolean(state.query.trim());
    recordFilterClear({
      clearScope: "all",
      count: activeFilterCount,
      hadSearch,
    });
    Object.values(state.filters).forEach((values) => values.clear());
    state.selectedCollectionId = "";
    state.sortMode = "default";
    state.query = "";
    syncSearchInputs("");
    filterSurfaceController?.renderAll();
    scheduleHomeResults("explicit");
  };

  const clearBucketFilters = (bucketId) => {
    const bucket = filterMenuBuckets.find((entry) => entry.id === bucketId);
    if (!bucket) {
      return;
    }

    const hadSearch = Boolean(state.query.trim());
    bucket.groups.forEach((group) => {
      const selectedCount = state.filters[group.id]?.size || 0;
      if (selectedCount > 0) {
        recordFilterClear({
          clearScope: "group",
          filterGroup: group.id,
          count: selectedCount,
          hadSearch,
        });
      }
      state.filters[group.id]?.clear();
    });
    state.selectedCollectionId = "";
    scheduleHomeResults("explicit");
  };

  const toggleFilter = (groupId, filterId) => {
    const selectedValues = state.filters[groupId];
    if (!selectedValues) {
      return;
    }

    const action = selectedValues.has(filterId) ? "removed" : "added";
    if (action === "removed") {
      selectedValues.delete(filterId);
    } else {
      selectedValues.add(filterId);
    }

    homeAnalytics.pendingFilterChanges.push({ groupId, action, filterValue: filterId });
    state.selectedCollectionId = "";
    scheduleHomeResults("explicit");
  };

  const getSelectedCollection = () => (state.selectedCollectionId ? collectionsById.get(state.selectedCollectionId) : null);
  const removeFilter = (groupId, value) => {
    state.filters[groupId]?.delete(value);
  };
  const getDescriptors = () =>
    getActiveBrowseDescriptors({
      filters: state.filters,
      structuredFilterGroups,
      filterOptionsByGroup,
      filterGroupsById,
      removeFilter,
    });

  filterSurfaceController = createHomeFilterSurfaceController({
    elements,
    filters: state.filters,
    filterMenuBuckets,
    filterOptionsByGroup,
    onToggleFilter: toggleFilter,
    onClearBucketFilters: clearBucketFilters,
  });
  const stickyBrowseController = createStickyBrowseController({
    elements,
    state,
    stickyFilterDropdownController: filterSurfaceController.stickyFilterDropdownController,
  });
  const { renderHomeResults, scheduleHomeResults } = createHomeResultsController({
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
    onResultsRendered: ({ resultCount }) => {
      const resultCountBucket = bucketDiscoveryResultCount(resultCount);
      const activeFilterCount = getActiveFilterCountForAnalytics();
      const recoveryContext = homeAnalytics.previousResultCountBucket === "0"
        ? "after_zero_results"
        : homeAnalytics.hasRendered
          ? "none"
          : "unknown";

      if (state.query.trim()) {
        homeAnalytics.pendingSearch = {
          signature: getFilterStateSignature(),
          query: state.query,
          resultCountBucket,
          activeFilterCountBucket: bucketDiscoveryFilterCount(activeFilterCount),
          recoveryContext,
        };
        if (homeAnalytics.searchAnalyticsTimer) {
          window.clearTimeout(homeAnalytics.searchAnalyticsTimer);
        }
        homeAnalytics.searchAnalyticsTimer = window.setTimeout(() => {
          homeAnalytics.searchAnalyticsTimer = 0;
          const pendingSearch = homeAnalytics.pendingSearch;
          homeAnalytics.pendingSearch = null;
          if (!pendingSearch || homeAnalytics.seenSearchStates.has(pendingSearch.signature)) {
            return;
          }
          homeAnalytics.seenSearchStates.add(pendingSearch.signature);
          const queryShape = archiveSearch.classifyQueryShape(publishedShows, pendingSearch.query);
          trackDiscoveryEvent("Search Used", {
            discovery_surface: "home_archive",
            query_kind: queryShape.queryKind,
            structured_clause_group: queryShape.structuredClauseGroup,
            result_count_bucket: pendingSearch.resultCountBucket,
            active_filter_count_bucket: pendingSearch.activeFilterCountBucket,
            recovery_context: pendingSearch.recoveryContext,
          });
        }, 350);
      } else {
        homeAnalytics.pendingSearch = null;
        if (homeAnalytics.searchAnalyticsTimer) {
          window.clearTimeout(homeAnalytics.searchAnalyticsTimer);
          homeAnalytics.searchAnalyticsTimer = 0;
        }
      }

      homeAnalytics.pendingFilterChanges.splice(0).forEach(({ groupId, action, filterValue }) => {
        trackDiscoveryEvent("Filter Changed", {
          discovery_surface: "home_archive",
          filter_group: groupId,
          filter_action: action,
          filter_value: archiveSearch.normalizeTag(filterValue),
          active_filter_count_bucket: bucketDiscoveryFilterCount(activeFilterCount),
          result_count_bucket: resultCountBucket,
          recovery_context: recoveryContext,
        });
      });

      homeAnalytics.pendingClears.splice(0).forEach(({ clearScope, filterGroup, count, hadSearch, resultCountBefore }) => {
        const props = {
          discovery_surface: "home_archive",
          clear_scope: clearScope,
          cleared_filter_count_bucket: bucketDiscoveryClearedFilterCount(count),
          had_search: hadSearch,
          result_count_bucket_before: bucketDiscoveryResultCount(resultCountBefore),
        };
        if (clearScope === "group") {
          props.filter_group = filterGroup;
        }
        trackDiscoveryEvent("Filters Cleared", props);
      });

      homeAnalytics.lastResultCount = resultCount;
      homeAnalytics.previousResultCountBucket = resultCountBucket;
      homeAnalytics.hasRendered = true;
    },
  });
  const stickyBrowseVisibilityController = createStickyBrowseVisibilityController({
    elements,
    state,
    stickyBrowseController,
    stickyFilterDropdownController: filterSurfaceController.stickyFilterDropdownController,
  });

  filterSurfaceController.renderAll();
  renderQuickFilters({
    quickFiltersRoot: elements.quickFiltersRoot,
    quickFilters,
    onClearAllFilters: clearAllFilters,
    onToggleTagFilter: (tagId) => {
      state.selectedCollectionId = "";
      toggleFilter("tags", tagId);
    },
  });
  renderBrowseModes({
    browseModesRoot: elements.browseModesRoot,
    onModeChange: (modeId) => {
      state.sortMode = modeId;
      scheduleHomeResults("explicit");
    },
  });
  recentlyAddedController.render();
  mostPopularController.renderMostPopularSection();
  void mostPopularController.resolveMostPopularShows();
  favoriteRoutesCarouselControls = renderCollectionsRail({
    featuredCollections: favoriteCollections,
    showMap,
    collectionsSection: elements.favoriteRoutesSection,
    collectionCarousel: elements.favoriteRoutesCarousel,
    collectionViewport: elements.favoriteRoutesViewport,
    collectionGrid: elements.favoriteRoutesGrid,
    collectionPrev: elements.favoriteRoutesPrev,
    collectionNext: elements.favoriteRoutesNext,
    currentControls: favoriteRoutesCarouselControls,
  });
  collectionCarouselControls = renderCollectionsRail({
    featuredCollections,
    showMap,
    collectionsSection: elements.collectionsSection,
    collectionCarousel: elements.collectionCarousel,
    collectionViewport: elements.collectionViewport,
    collectionGrid: elements.collectionGrid,
    collectionPrev: elements.collectionPrev,
    collectionNext: elements.collectionNext,
    currentControls: collectionCarouselControls,
  });
  syncSearchInputs(state.query);
  stickyBrowseController.syncStickySearchMode();
  renderHomeResults("initial");

  const handleSearchInput = (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (input === elements.stickySearchInput) {
      stickyBrowseController.markExpanded();
    }
    syncSearchInputs(input.value, input);
    state.query = input.value.trim();
    stickyBrowseVisibilityController.sync();
    if (searchRenderTimer) {
      window.clearTimeout(searchRenderTimer);
    }
    searchRenderTimer = window.setTimeout(() => {
      searchRenderTimer = 0;
      scheduleHomeResults("live-search");
    }, 150);
  };

  searchInputs.forEach((input) => {
    input.addEventListener("input", handleSearchInput);
  });

  elements.stickySearchToggle.addEventListener("click", stickyBrowseController.handleStickySearchToggle);

  filterSurfaceController.bindToggles();
  stickyBrowseVisibilityController.bind();

  // Close on pointerdown so inside clicks are classified before the menu rerenders.
  document.addEventListener("pointerdown", (event) => {
    filterSurfaceController.closeOnOutsidePointerDown(event);
    stickyBrowseVisibilityController.queueSync();
  });

  document.addEventListener("keydown", (event) => {
    if (filterSurfaceController.closeOnEscape(event)) {
      stickyBrowseVisibilityController.queueSync();
      return;
    }

    if (
      event.key === "Escape" &&
      !state.query &&
      stickyBrowseController.isStickySearchFocused() &&
      elements.stickyBrowseBar.dataset.mode === "expanded"
    ) {
      event.preventDefault();
      stickyBrowseController.collapseStickySearch({ returnFocus: true });
    }
  });

  elements.filterClear?.addEventListener("click", clearAllFilters);
  elements.stickyFilterClear?.addEventListener("click", clearAllFilters);
  elements.noResultsMount?.addEventListener("click", (event) => {
    if (event.target.closest("#clearResultsState")) clearAllFilters();
  });
  elements.activeBrowseClear?.addEventListener("click", clearAllFilters);
  stickyBrowseVisibilityController.observe();

  window.addEventListener("resize", () => {
    previewController.closeActivePreview({ immediate: true });
    favoriteRoutesCarouselControls?.refresh();
    collectionCarouselControls?.refresh();
    const nextGridLayoutBucket = getHomeGridLayoutBucket();
    if (state.gridLayoutBucket !== nextGridLayoutBucket) {
      state.gridLayoutBucket = nextGridLayoutBucket;
      renderHomeResults("layout-change");
    }
    stickyBrowseController.syncStickySearchMode();
    stickyBrowseVisibilityController.sync();
  });

  window.addEventListener("beforeunload", () => {
    scrollRestoration.save();
    scrollRestoration.destroy();
    stickyBrowseVisibilityController.destroy();
  });

  setBrowseControlsDisabled(elements, false);
}
