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
import { getHomeGridLayoutBucket, patchArchiveGrid, sortVisibleShows } from "./home/layout.js";
import { createMostPopularController } from "./home/most-popular.js";
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
    description: "Curated fiction podcasts, filtered by mood, genre, and listening intent.",
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

  const previewController = initializeHomePreviewController({
    archiveGrid: elements.archiveGrid,
    archiveSection: elements.archiveSection,
  });
  const archiveCardShellsById = new Map(
    shows.map((show) => [show.id, createShowCard(show, { previewMode: "inline-expand" })]),
  );
  const mostPopularController = createMostPopularController({
    showMap,
    publishedShows,
    popularSection: elements.popularSection,
    popularGrid: elements.popularGrid,
    state,
  });
  let collectionCarouselControls = null;
  let searchRenderTimer = 0;

  const clearAllFilters = () => {
    if (searchRenderTimer) {
      window.clearTimeout(searchRenderTimer);
      searchRenderTimer = 0;
    }
    Object.values(state.filters).forEach((values) => values.clear());
    state.selectedCollectionId = "";
    state.sortMode = "default";
    state.query = "";
    elements.searchInput.value = "";
    renderHomeResults();
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
    renderHomeResults();
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

  function renderHomeResults() {
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
    });
    renderActiveBrowseState({
      activeBrowseState: elements.activeBrowseState,
      activeBrowseChips: elements.activeBrowseChips,
      descriptors: activeDescriptors,
      onAfterRemove: renderHomeResults,
    });
    syncBrowseUrlState(state);

    void syncCommunityCardBadges(elements.archiveGrid, visibleShows);

    const fullReviewCount = visibleShows.filter((show) => show.reviewStatus === "full-review").length;
    const suffix = fullReviewCount === 1 ? "full review" : "full reviews";
    const collectionPrefix = selectedCollection ? `Collection: ${selectedCollection.title} • ` : "";
    const browsePrefix = `${collectionPrefix}${formatResultsSummaryPrefix(activeDescriptors)}`;
    const searchPrefix = state.query ? `${visibleShows.length} results for "${state.query}"` : `${visibleShows.length} results`;
    const modePrefix = !state.query && state.sortMode === "recently-updated" ? "Recently updated • " : "";
    elements.resultsSummary.textContent = `${browsePrefix}${modePrefix}${searchPrefix} • ${fullReviewCount} ${suffix}`;
    elements.noResultsMsg.hidden = visibleShows.length !== 0;

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
  }

  renderFilterOptions({
    filterOptionGrid: elements.filterOptionGrid,
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
      renderHomeResults();
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
  renderHomeResults();

  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value.trim();
    if (searchRenderTimer) {
      window.clearTimeout(searchRenderTimer);
    }
    searchRenderTimer = window.setTimeout(() => {
      searchRenderTimer = 0;
      renderHomeResults();
    }, 150);
  });

  elements.filterToggle?.addEventListener("click", () => {
    const isOpen = !elements.filterDropdown.classList.contains("hidden");
    elements.filterDropdown.classList.toggle("hidden", isOpen);
    elements.filterToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node) || !elements.filterDropdown || !elements.filterToggle) {
      return;
    }

    if (!elements.filterDropdown.contains(target) && !elements.filterToggle.contains(target)) {
      elements.filterDropdown.classList.add("hidden");
      elements.filterToggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.filterDropdown) {
      elements.filterDropdown.classList.add("hidden");
      elements.filterToggle?.setAttribute("aria-expanded", "false");
    }
  });

  elements.filterClear?.addEventListener("click", clearAllFilters);
  elements.clearResultsState?.addEventListener("click", clearAllFilters);
  elements.activeBrowseClear?.addEventListener("click", clearAllFilters);
  elements.openArchivistAction?.addEventListener("click", () => {
    setChatOpen(true);
    if (userInput) {
      userInput.value = "Help me find something finished or easy to jump into.";
      userInput.focus();
    }
  });

  window.addEventListener("resize", () => {
    previewController.closeActivePreview({ immediate: true });
    collectionCarouselControls?.refresh();
    const nextGridLayoutBucket = getHomeGridLayoutBucket();
    if (state.gridLayoutBucket !== nextGridLayoutBucket) {
      state.gridLayoutBucket = nextGridLayoutBucket;
      renderHomeResults();
    }
  });
}
