import { DEFAULT_SOCIAL_IMAGE, HOME_CARD_HOVER_EXPAND_ENABLED, HOME_FAVORITE_ROUTE_IDS, archiveSearch } from "../constants.js";
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
import { seedHomeStateFromParams } from "./home/url-state.js";

const SHOW_HOME_RECENTLY_ADDED_BAND = false;

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
  const searchPerformanceCache = createHomeSearchPerformanceCache({ shows, archiveSearch });
  const filterGroupsById = new Map(structuredFilterGroups.map((group) => [group.id, group]));
  const filterOptionsByGroup = new Map(
    structuredFilterGroups.map((group) => [group.id, new Map(group.options.map((option) => [option.id, option.label]))]),
  );
  const state = createHomeState(structuredFilterGroups);
  seedHomeStateFromParams({ state, shows, collectionsById, structuredFilterGroups });
  const searchInputs = [elements.searchInput, elements.stickySearchInput];

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
    recentlyAddedEmptyState: elements.recentlyAddedEmptyState,
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
  let stickyBrowseObserver = null;
  if (elements.activeBrowseClear) {
    elements.activeBrowseClear.hidden = true;
  }
  let filterSurfaceController;

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

    bucket.groups.forEach((group) => {
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

    if (selectedValues.has(filterId)) {
      selectedValues.delete(filterId);
    } else {
      selectedValues.add(filterId);
    }

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
  mostPopularController.renderMostPopularSection();
  void mostPopularController.resolveMostPopularShows();
  recentlyAddedController.render();
  recentlyAddedController.setVisible(false);
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
  scrollRestoration.restore();

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
  elements.stickySearchInput.addEventListener("focus", stickyBrowseController.handleStickySearchFocus);
  elements.stickySearchInput.addEventListener("blur", stickyBrowseController.handleStickySearchBlur);

  filterSurfaceController.bindToggles();

  // Close on pointerdown so inside clicks are classified before the menu rerenders.
  document.addEventListener("pointerdown", (event) => {
    filterSurfaceController.closeOnOutsidePointerDown(event);
  });

  document.addEventListener("keydown", (event) => {
    if (filterSurfaceController.closeOnEscape(event)) {
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
  elements.clearResultsState?.addEventListener("click", clearAllFilters);
  elements.activeBrowseClear?.addEventListener("click", clearAllFilters);
  if ("IntersectionObserver" in window) {
    stickyBrowseObserver = new IntersectionObserver(
      ([entry]) => {
        const shouldShowStickyBar = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
        stickyBrowseController.setStickyBrowseVisibility(shouldShowStickyBar);
      },
      { threshold: 0 },
    );
    stickyBrowseObserver.observe(elements.heroShell);
  }

  window.addEventListener("resize", () => {
    previewController.closeActivePreview({ immediate: true });
    favoriteRoutesCarouselControls?.refresh();
    collectionCarouselControls?.refresh();
    const nextGridLayoutBucket = getHomeGridLayoutBucket();
    if (state.gridLayoutBucket !== nextGridLayoutBucket) {
      state.gridLayoutBucket = nextGridLayoutBucket;
      renderHomeResults("layout-change");
    }
  });

  window.addEventListener("beforeunload", () => {
    scrollRestoration.save();
    scrollRestoration.destroy();
    stickyBrowseObserver?.disconnect();
  });

  setBrowseControlsDisabled(elements, false);
}
