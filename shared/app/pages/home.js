import {
  DEFAULT_SOCIAL_IMAGE,
  archiveSearch,
  HOME_FAVORITE_ROUTE_IDS,
  userInput,
} from "../constants.js";
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
  loadCollections,
  loadSearchIndex,
} from "../data.js";
import { initializeHomePreviewController } from "../home-preview.js";
import { createShowCard, syncShowCardPresentation } from "../render-cards.js";
import { setChatOpen } from "../chat.js";
import { syncCommunityCardBadges } from "../community.js";
import { updateDocumentMetadata } from "../utils.js";
import { renderCollectionsRail } from "./home/collections.js";
import { getHomeElements } from "./home/elements.js";
import {
  createFilterMenuState,
  formatResultsSummaryPrefix,
  getActiveBrowseDescriptors,
  matchesSelectedFilters,
  openFilterMenuBucket,
  renderActiveBrowseState,
  renderBrowseModes,
  renderFilterMenu,
  renderQuickFilters,
  resetFilterMenuState,
  syncHomeControls,
} from "./home/filters.js";
import { initializeFilterDropdownController } from "./home/filter-dropdown.js";
import { getHomeGridLayoutBucket, patchArchiveGrid, sortVisibleShows } from "./home/layout.js";
import { createMostPopularController } from "./home/most-popular.js";
import { createRecentlyAddedController } from "./home/recently-added.js";
import { syncResultsSummary, syncResultsSurfaceVisibility } from "./home/results-motion.js";
import { createHomeState } from "./home/state.js";
import { seedHomeStateFromParams, syncBrowseUrlState } from "./home/url-state.js";

const SHOW_HOME_RECENTLY_ADDED_BAND = false;

function createHomeSkeletonCard() {
  const shell = document.createElement("article");
  shell.className = "archive-skeleton-card";
  shell.setAttribute("aria-hidden", "true");
  shell.innerHTML = `
    <div class="archive-skeleton-block archive-skeleton-cover"></div>
    <div class="archive-skeleton-copy">
      <span class="archive-skeleton-block archive-skeleton-title"></span>
      <span class="archive-skeleton-block archive-skeleton-line"></span>
      <span class="archive-skeleton-block archive-skeleton-rating"></span>
    </div>
  `;
  return shell;
}

function renderHomeLoadingState(elements) {
  elements.archiveGrid.textContent = "";
  elements.archiveGrid.dataset.loading = "true";
  for (let index = 0; index < 12; index += 1) {
    elements.archiveGrid.appendChild(createHomeSkeletonCard());
  }
  elements.resultsSummary.textContent = "Loading archive...";
  elements.noResultsMsg.hidden = true;
  elements.popularSection.hidden = true;
  elements.recentlyAddedSection.hidden = true;
  elements.favoriteRoutesSection.hidden = true;
  elements.collectionsSection.hidden = true;
}

export async function initializeHomePage() {
  const elements = getHomeElements();
  if (!elements) {
    return;
  }
  renderHomeLoadingState(elements);
  const scrollRestoration = createScrollRestoration();
  scrollRestoration.enable();

  const [shows, collections] = await Promise.all([loadSearchIndex(), loadCollections()]);
  const showMap = buildShowMap(shows);

  updateDocumentMetadata({
    title: "The Echo Archives",
    description: "A human-curated archive for discovering fiction podcasts by mood, tone, format, completion status, and similarity.",
    path: "/",
    image: DEFAULT_SOCIAL_IMAGE,
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
  const filterGroupsById = new Map(structuredFilterGroups.map((group) => [group.id, group]));
  const filterOptionsByGroup = new Map(
    structuredFilterGroups.map((group) => [group.id, new Map(group.options.map((option) => [option.id, option.label]))]),
  );
  const state = createHomeState(structuredFilterGroups);
  seedHomeStateFromParams({ state, shows, collectionsById, structuredFilterGroups });
  const searchInputs = [elements.searchInput, elements.stickySearchInput];

  const previewController = initializeHomePreviewController({
    archiveGrid: elements.archiveGrid,
    archiveSection: elements.archiveSection,
  });
  const archiveCardShellsById = new Map(
    shows.map((show) => [show.id, createShowCard(show, { previewMode: "inline-expand" })]),
  );
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
  let pendingRenderReason = "";
  let renderFrame = 0;
  let hasRenderedHomeResults = false;
  let stickyBrowseObserver = null;
  let stickySearchManuallyExpanded = false;
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
      optionGrid: elements.filterOptionGrid,
      toggle: elements.filterToggle,
      menuState: createFilterMenuState(),
    },
    {
      controller: stickyFilterDropdownController,
      dropdown: elements.stickyFilterDropdown,
      optionGrid: elements.stickyFilterOptionGrid,
      toggle: elements.stickyFilterToggle,
      menuState: createFilterMenuState(),
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

  const isStickySearchFocused = () => document.activeElement === elements.stickySearchInput;
  const syncStickySearchAccessibility = (isExpanded) => {
    elements.stickySearchToggle.setAttribute("aria-expanded", String(isExpanded));
    elements.stickySearchToggle.setAttribute(
      "aria-label",
      isExpanded && !state.query ? "Collapse archive search" : "Expand archive search",
    );
    elements.stickySearchField.setAttribute("aria-hidden", String(!isExpanded));
    if (isExpanded) {
      elements.stickySearchInput.removeAttribute("tabindex");
      return;
    }

    elements.stickySearchInput.setAttribute("tabindex", "-1");
  };
  const syncStickySearchMode = ({ focusInput = false, preserveManual = false, returnFocus = false } = {}) => {
    if (!preserveManual && !state.query && !isStickySearchFocused()) {
      stickySearchManuallyExpanded = false;
    }

    const shouldExpand = Boolean(state.query || stickySearchManuallyExpanded);
    elements.stickyBrowseBar.dataset.mode = shouldExpand ? "expanded" : "collapsed";
    syncStickySearchAccessibility(shouldExpand);

    if (!shouldExpand && stickyFilterDropdownController.isOpen()) {
      stickyFilterDropdownController.close();
    }

    if (focusInput && shouldExpand) {
      window.requestAnimationFrame(() => {
        elements.stickySearchInput.focus({ preventScroll: true });
      });
    }

    if (returnFocus && !shouldExpand) {
      window.requestAnimationFrame(() => {
        elements.stickySearchToggle.focus({ preventScroll: true });
      });
    }
  };
  const expandStickySearch = ({ focusInput = true } = {}) => {
    stickySearchManuallyExpanded = true;
    syncStickySearchMode({ focusInput, preserveManual: true });
  };
  const collapseStickySearch = ({ returnFocus = false } = {}) => {
    if (state.query) {
      return;
    }

    stickySearchManuallyExpanded = false;
    syncStickySearchMode({ returnFocus });
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
    if (!isVisible && !state.query) {
      stickySearchManuallyExpanded = false;
    }
    syncStickySearchMode();
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
    filterControlSurfaces.forEach((surface) => {
      renderFilterSurface(surface);
    });
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

  const focusFilterSurfaceTarget = (surface, selector) => {
    const target = surface.optionGrid.querySelector(selector);
    if (target instanceof HTMLElement) {
      target.focus();
    }
  };

  function renderFilterSurface(surface) {
    renderFilterMenu({
      filterDropdown: surface.dropdown,
      filterOptionGrid: surface.optionGrid,
      filterMenuBuckets,
      filterOptionsByGroup,
      filters: state.filters,
      menuState: surface.menuState,
      onOpenBucket: (bucketId) => {
        openFilterMenuBucket(surface.menuState, bucketId);
        renderFilterSurface(surface);
        const bucket = filterMenuBuckets.find((entry) => entry.id === bucketId);
        if (bucket?.searchable) {
          focusFilterSurfaceTarget(surface, ".filter-tag-search-input");
        } else {
          focusFilterSurfaceTarget(surface, ".filter-option");
        }
      },
      onBackToLauncher: () => {
        const previousBucketId = surface.menuState.activeBucketId;
        resetFilterMenuState(surface.menuState);
        renderFilterSurface(surface);
        focusFilterSurfaceTarget(surface, `[data-filter-bucket-id="${previousBucketId}"]`);
      },
      onToggleFilter: toggleFilter,
      onClearBucketFilters: clearBucketFilters,
    });
  }

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
    syncStickySearchMode();
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

  filterControlSurfaces.forEach((surface) => {
    renderFilterSurface(surface);
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
  syncStickySearchMode();
  renderHomeResults("initial");
  scrollRestoration.restore();

  const handleSearchInput = (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (input === elements.stickySearchInput) {
      stickySearchManuallyExpanded = true;
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

  elements.stickySearchToggle.addEventListener("click", () => {
    if (state.query) {
      expandStickySearch();
      return;
    }

    if (elements.stickyBrowseBar.dataset.mode === "expanded") {
      collapseStickySearch({ returnFocus: true });
      return;
    }

    expandStickySearch();
  });
  elements.stickySearchInput.addEventListener("focus", () => {
    stickySearchManuallyExpanded = true;
    syncStickySearchMode();
  });
  elements.stickySearchInput.addEventListener("blur", () => {
    window.requestAnimationFrame(() => {
      if (!state.query && !isStickySearchFocused()) {
        collapseStickySearch();
      }
    });
  });

  filterControlSurfaces.forEach((surface) => {
    surface.toggle.addEventListener("click", () => {
      if (surface.controller.isOpen()) {
        surface.controller.close();
        return;
      }

      closeOtherFilterDropdowns(surface);
      resetFilterMenuState(surface.menuState);
      renderFilterSurface(surface);
      surface.controller.open();
    });
  });

  // Close on pointerdown so inside clicks are classified before the menu rerenders.
  document.addEventListener("pointerdown", (event) => {
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
      return;
    }

    if (
      event.key === "Escape" &&
      !state.query &&
      isStickySearchFocused() &&
      elements.stickyBrowseBar.dataset.mode === "expanded"
    ) {
      event.preventDefault();
      collapseStickySearch({ returnFocus: true });
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
}
