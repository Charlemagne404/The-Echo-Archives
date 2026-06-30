import {
  DEFAULT_SOCIAL_IMAGE,
  archiveSearch,
  userInput,
} from "../constants.js";
import {
  applyArchiveStats,
  buildCollectionMap,
  buildShowMap,
  getArchiveStats,
  getQuickFilters,
  getStructuredFilterGroups,
  getVisibleFilterTags,
  loadCollections,
  loadShows,
} from "../data.js";
import { initializeHomePreviewController } from "../home-preview.js";
import { createShowCard } from "../render-cards.js";
import { setChatOpen } from "../chat.js";
import { syncCommunityCardBadges } from "../community.js";
import { updateDocumentMetadata } from "../utils.js";
import { renderCollectionsRail } from "./home/collections.js";
import { getHomeElements } from "./home/elements.js";
import {
  formatResultsSummaryPrefix,
  getActiveBrowseDescriptors,
  matchesSelectedFilters,
  renderActiveBrowseState,
  renderBrowseModes,
  renderFilterOptions,
  renderQuickFilters,
  syncHomeControls,
} from "./home/filters.js";
import { initializeFilterDropdownController } from "./home/filter-dropdown.js";
import { getHomeGridLayoutBucket, patchArchiveGrid, sortVisibleShows } from "./home/layout.js";
import { createMostPopularController } from "./home/most-popular.js";
import { syncResultsSummary, syncResultsSurfaceVisibility } from "./home/results-motion.js";
import { createHomeState } from "./home/state.js";
import { seedHomeStateFromParams, syncBrowseUrlState } from "./home/url-state.js";

export async function initializeHomePage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  const showMap = buildShowMap(shows);
  const elements = getHomeElements();
  if (!elements) {
    return;
  }

  updateDocumentMetadata({
    title: "The Echo Archives",
    description: "A human-curated archive for discovering fiction podcasts by mood, tone, format, completion status, and similarity.",
    path: "/",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  applyArchiveStats("home", getArchiveStats(shows, collections));

  const filterTags = getVisibleFilterTags(shows);
  const structuredFilterGroups = getStructuredFilterGroups(shows);
  const quickFilters = getQuickFilters(filterTags);
  const featuredCollections = collections.filter((collection) => collection.featured);
  const publishedShows = shows.filter((show) => show.status === "published");
  const collectionsById = buildCollectionMap(collections);
  const filterGroupsById = new Map(structuredFilterGroups.map((group) => [group.id, group]));
  const filterOptionsByGroup = new Map(
    structuredFilterGroups.map((group) => [group.id, new Map(group.options.map((option) => [option.id, option.label]))]),
  );
  const state = createHomeState();
  seedHomeStateFromParams({ state, shows, collectionsById });
  const searchInputs = [elements.searchInput, elements.stickySearchInput];

  const previewController = initializeHomePreviewController({
    archiveGrid: elements.archiveGrid,
    archiveSection: elements.archiveSection,
  });
  const archiveCardShellsById = new Map(
    shows.map((show) => [show.id, createShowCard(show, { previewMode: "inline-expand" })]),
  );
  const syncFeaturedCollectionsVisibility = (shouldShowMostPopular) => {
    elements.collectionsSection.hidden = featuredCollections.length === 0 || !shouldShowMostPopular;
  };
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
      syncFeaturedCollectionsVisibility(shouldShowMostPopular);
      return true;
    },
  });
  let collectionCarouselControls = null;
  let searchRenderTimer = 0;
  let pendingRenderReason = "";
  let renderFrame = 0;
  let hasRenderedHomeResults = false;
  let stickyBrowseObserver = null;
  if (elements.activeBrowseClear) {
    elements.activeBrowseClear.hidden = true;
  }
  const heroFilterDropdownController = initializeFilterDropdownController({
    filterDropdown: elements.filterDropdown,
    filterToggle: elements.filterToggle,
  });
  const stickyFilterDropdownController = initializeFilterDropdownController({
    filterDropdown: elements.stickyFilterDropdown,
    filterToggle: elements.stickyFilterToggle,
  });
  const filterControlSurfaces = [
    {
      controller: heroFilterDropdownController,
      dropdown: elements.filterDropdown,
      toggle: elements.filterToggle,
    },
    {
      controller: stickyFilterDropdownController,
      dropdown: elements.stickyFilterDropdown,
      toggle: elements.stickyFilterToggle,
    },
  ];

  const syncSearchInputs = (nextValue, sourceInput = null) => {
    searchInputs.forEach((input) => {
      if (input !== sourceInput && input.value !== nextValue) {
        input.value = nextValue;
      }
    });
  };

  const closeOtherFilterDropdowns = (activeSurface) => {
    filterControlSurfaces.forEach((surface) => {
      if (surface !== activeSurface && surface.controller.isOpen()) {
        surface.controller.close();
      }
    });
  };

  const setStickyBrowseVisibility = (isVisible) => {
    const nextVisibility = isVisible ? "visible" : "hidden";
    if (elements.stickyBrowseBar.dataset.visibility === nextVisibility) {
      return;
    }

    elements.stickyBrowseBar.dataset.visibility = nextVisibility;
    elements.stickyBrowseBar.setAttribute("aria-hidden", String(!isVisible));
    if (!isVisible && stickyFilterDropdownController.isOpen()) {
      stickyFilterDropdownController.close();
    }
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

  const getVisibleShows = (selectedCollection) => {
    const filteredShows = shows.filter((show) => {
      const matchesFilters = matchesSelectedFilters(show, state.filters);
      const matchesCollection = !selectedCollection || selectedCollection.showIds.includes(show.id);
      return matchesFilters && matchesCollection;
    });

    if (!state.query) {
      return sortVisibleShows({
        visibleShows: filteredShows,
        selectedCollection,
        sortMode: state.sortMode,
      });
    }

    const scoredResults = archiveSearch.scoreCatalog(shows, state.query);
    const filteredIds = new Set(filteredShows.map((show) => show.id));
    return scoredResults.filter((show) => filteredIds.has(show.id));
  };

  function renderHomeResults(changeReason = "explicit") {
    previewController.closeActivePreview({ immediate: true });

    const selectedCollection = getSelectedCollection();
    const visibleShows = getVisibleShows(selectedCollection);
    const activeDescriptors = getDescriptors();

    mostPopularController.syncMostPopularSectionVisibility();
    patchArchiveGrid({
      archiveGrid: elements.archiveGrid,
      collectionsSection: elements.collectionsSection,
      visibleShows,
      archiveCardShellsById,
      gridLayoutBucket: state.gridLayoutBucket,
      changeReason,
    });
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
      filters: state.filters,
      query: state.query,
      selectedCollectionId: state.selectedCollectionId,
      sortMode: state.sortMode,
    });
    syncHomeControls({
      filterOptionGrid: elements.stickyFilterOptionGrid,
      filterCount: elements.stickyFilterCount,
      filterClear: elements.stickyFilterClear,
      filters: state.filters,
      query: state.query,
      selectedCollectionId: state.selectedCollectionId,
      sortMode: state.sortMode,
    });
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

  renderFilterOptions({
    filterOptionGrid: elements.filterOptionGrid,
    structuredFilterGroups,
    onToggleFilter: toggleFilter,
  });
  renderFilterOptions({
    filterOptionGrid: elements.stickyFilterOptionGrid,
    structuredFilterGroups,
    onToggleFilter: toggleFilter,
  });
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
  renderHomeResults("initial");

  const handleSearchInput = (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
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

  filterControlSurfaces.forEach((surface) => {
    surface.toggle.addEventListener("click", () => {
      if (surface.controller.isOpen()) {
        surface.controller.close();
        return;
      }

      closeOtherFilterDropdowns(surface);
      surface.controller.open();
    });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    filterControlSurfaces.forEach((surface) => {
      if (
        surface.controller.isOpen() &&
        !surface.dropdown.contains(target) &&
        !surface.toggle.contains(target)
      ) {
        surface.controller.close();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    const openSurface = filterControlSurfaces.find((surface) => surface.controller.isOpen());
    if (event.key === "Escape" && openSurface) {
      event.preventDefault();
      openSurface.controller.close({ returnFocus: true });
    }
  });

  elements.filterClear?.addEventListener("click", clearAllFilters);
  elements.stickyFilterClear?.addEventListener("click", clearAllFilters);
  elements.clearResultsState?.addEventListener("click", clearAllFilters);
  elements.activeBrowseClear?.addEventListener("click", clearAllFilters);
  elements.openArchivistAction?.addEventListener("click", () => {
    setChatOpen(true);
    if (userInput) {
      userInput.value = "Help me find something finished or easy to jump into.";
      userInput.focus();
    }
  });

  if ("IntersectionObserver" in window) {
    stickyBrowseObserver = new IntersectionObserver(
      ([entry]) => {
        const shouldShowStickyBar = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
        setStickyBrowseVisibility(shouldShowStickyBar);
      },
      { threshold: 0 },
    );
    stickyBrowseObserver.observe(elements.heroShell);
  }

  window.addEventListener("resize", () => {
    previewController.closeActivePreview({ immediate: true });
    collectionCarouselControls?.refresh();
    const nextGridLayoutBucket = getHomeGridLayoutBucket();
    if (state.gridLayoutBucket !== nextGridLayoutBucket) {
      state.gridLayoutBucket = nextGridLayoutBucket;
      renderHomeResults("layout-change");
    }
  });

  window.addEventListener("beforeunload", () => {
    stickyBrowseObserver?.disconnect();
  });
}
