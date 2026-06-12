import {
  DEFAULT_SOCIAL_IMAGE,
  HOME_MOST_POPULAR_IDS,
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
import { createMostPopularCard, createShowCard } from "../render-cards.js";
import { createCollectionCard, initializeCollectionCarousel } from "../render-collections.js";
import { setChatOpen } from "../chat.js";
import { syncCommunityCardBadges } from "../community.js";
import { updateDocumentMetadata } from "../utils.js";

export async function initializeHomePage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  const showMap = buildShowMap(shows);
  updateDocumentMetadata({
    title: "The Echo Archives",
    description: "Curated fiction podcasts, filtered by mood, genre, and listening intent.",
    path: "/",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  applyArchiveStats("home", getArchiveStats(shows, collections));

  const searchInput = document.getElementById("search");
  const filterToggle = document.getElementById("filterToggle");
  const filterDropdown = document.getElementById("filterDropdown");
  const filterCount = document.getElementById("filterCount");
  const filterClear = document.getElementById("filterClear");
  const filterOptionGrid = document.getElementById("filterOptionGrid");
  const browseModesRoot = document.getElementById("browseModes");
  const archiveSection = document.getElementById("archive");
  const popularSection = document.getElementById("mostPopular");
  const popularGrid = document.getElementById("popularGrid");
  const archiveGrid = document.getElementById("podcast-grid");
  const noResultsMsg = document.getElementById("noResultsMsg");
  const resultsSummary = document.getElementById("resultsSummary");
  const quickFiltersRoot = document.getElementById("quickFilters");
  const collectionsSection = document.getElementById("collections");
  const collectionCarousel = document.getElementById("collectionCarousel");
  const collectionViewport = document.getElementById("collectionViewport");
  const collectionGrid = document.getElementById("collectionGrid");
  const collectionPrev = document.getElementById("collectionPrev");
  const collectionNext = document.getElementById("collectionNext");
  const clearResultsState = document.getElementById("clearResultsState");
  const openArchivistAction = document.getElementById("openArchivistAction");

  if (
    !archiveGrid ||
    !archiveSection ||
    !popularSection ||
    !popularGrid ||
    !filterOptionGrid ||
    !quickFiltersRoot ||
    !collectionsSection ||
    !collectionCarousel ||
    !collectionViewport ||
    !collectionGrid ||
    !collectionPrev ||
    !collectionNext ||
    !browseModesRoot
  ) {
    return;
  }

  const filterTags = getVisibleFilterTags(shows);
  const structuredFilterGroups = getStructuredFilterGroups(shows);
  const quickFilters = getQuickFilters(filterTags);
  const featuredCollections = collections.filter((collection) => collection.featured);
  const mostPopularShows = HOME_MOST_POPULAR_IDS
    .map((showId) => showMap.get(showId))
    .filter((show) => show && show.status === "published");
  const collectionsById = buildCollectionMap(collections);
  let collectionCarouselControls = null;

  const state = {
    query: "",
    filters: {
      tags: new Set(),
      bestFor: new Set(),
      completionStatus: new Set(),
      reviewStatus: new Set(),
    },
    selectedCollectionId: "",
    sortMode: "default",
  };

  const initialCollectionId = new URLSearchParams(window.location.search).get("collection") || "";
  if (collectionsById.has(initialCollectionId)) {
    state.selectedCollectionId = initialCollectionId;
  }

  const previewController = initializeHomePreviewController({
    archiveGrid,
    archiveSection,
  });

  renderFilterOptions();
  renderQuickFilters();
  renderBrowseModes();
  renderMostPopularSection();
  renderCollections();
  renderHomeResults();

  searchInput?.addEventListener("input", () => {
    state.query = searchInput.value.trim();
    renderHomeResults();
  });

  filterToggle?.addEventListener("click", () => {
    const isOpen = !filterDropdown.classList.contains("hidden");
    filterDropdown.classList.toggle("hidden", isOpen);
    filterToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node) || !filterDropdown || !filterToggle) {
      return;
    }

    if (!filterDropdown.contains(target) && !filterToggle.contains(target)) {
      filterDropdown.classList.add("hidden");
      filterToggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && filterDropdown) {
      filterDropdown.classList.add("hidden");
      filterToggle?.setAttribute("aria-expanded", "false");
    }
  });

  filterClear?.addEventListener("click", () => {
    clearAllFilters();
  });

  clearResultsState?.addEventListener("click", () => {
    clearAllFilters();
  });

  openArchivistAction?.addEventListener("click", () => {
    setChatOpen(true);
    if (userInput) {
      userInput.value = "Help me find something finished or easy to jump into.";
      userInput.focus();
    }
  });

  window.addEventListener("resize", () => {
    previewController.closeActivePreview({ immediate: true });
    renderHomeResults();
    collectionCarouselControls?.refresh();
  });

  function clearAllFilters() {
    Object.values(state.filters).forEach((values) => values.clear());
    state.selectedCollectionId = "";
    state.sortMode = "default";
    state.query = "";
    if (searchInput) {
      searchInput.value = "";
    }
    renderHomeResults();
  }

  function renderFilterOptions() {
    filterOptionGrid.textContent = "";

    structuredFilterGroups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "filter-group";

      const heading = document.createElement("div");
      heading.className = "filter-group-heading";

      const title = document.createElement("p");
      title.className = "filter-group-title";
      title.textContent = group.label;

      const count = document.createElement("p");
      count.className = "filter-group-count";
      count.textContent = `${group.options.length} options`;

      const optionGrid = document.createElement("div");
      optionGrid.className = "filter-group-options";

      group.options.forEach((option) => {
        const button = document.createElement("button");
        button.className = "filter-option";
        button.type = "button";
        button.dataset.filterGroup = group.id;
        button.dataset.filterValue = option.id;
        button.textContent = option.label;
        button.addEventListener("click", () => {
          toggleFilter(group.id, option.id);
        });
        optionGrid.appendChild(button);
      });

      heading.append(title, count);
      section.append(heading, optionGrid);
      filterOptionGrid.appendChild(section);
    });
  }

  function renderQuickFilters() {
    quickFiltersRoot.textContent = "";
    quickFiltersRoot.appendChild(createQuickFilterButton({ id: "all", label: "All" }));

    quickFilters.forEach((tag) => {
      quickFiltersRoot.appendChild(createQuickFilterButton(tag));
    });
  }

  function renderBrowseModes() {
    browseModesRoot.textContent = "";

    [
      { id: "default", label: "Default order" },
      { id: "recently-updated", label: "Recently updated" },
    ].forEach((mode) => {
      const button = document.createElement("button");
      button.className = "browse-mode-button";
      button.type = "button";
      button.dataset.browseMode = mode.id;
      button.textContent = mode.label;
      button.addEventListener("click", () => {
        state.sortMode = mode.id;
        renderHomeResults();
      });
      browseModesRoot.appendChild(button);
    });
  }

  function createQuickFilterButton(tag) {
    const button = document.createElement("button");
    button.className = "quick-filter";
    button.type = "button";
    button.dataset.chipFilter = tag.id;
    button.textContent = tag.label;
    button.addEventListener("click", () => {
      if (tag.id === "all") {
        clearAllFilters();
      } else {
        state.selectedCollectionId = "";
        toggleFilter("tags", tag.id);
        return;
      }
    });
    return button;
  }

  function renderMostPopularSection() {
    popularGrid.textContent = "";

    if (mostPopularShows.length === 0) {
      popularSection.hidden = true;
      return;
    }

    mostPopularShows.forEach((show) => {
      popularGrid.appendChild(createMostPopularCard(show));
    });
    syncMostPopularSectionVisibility();
    void syncCommunityCardBadges(popularGrid, mostPopularShows);
  }

  function shouldShowMostPopularSection() {
    return (
      mostPopularShows.length > 0 &&
      !state.query &&
      getActiveFilterCount() === 0 &&
      !state.selectedCollectionId &&
      state.sortMode === "default"
    );
  }

  function syncMostPopularSectionVisibility() {
    popularSection.hidden = !shouldShowMostPopularSection();
  }

  function renderCollections() {
    collectionGrid.textContent = "";
    collectionsSection.hidden = featuredCollections.length === 0;
    collectionCarouselControls?.destroy();
    collectionCarouselControls = null;
    collectionPrev.hidden = true;
    collectionNext.hidden = true;

    if (featuredCollections.length === 0) {
      return;
    }

    const carouselGroups = featuredCollections.length > 1 ? [0, 1, 2] : [1];
    carouselGroups.forEach((groupIndex) => {
      featuredCollections.forEach((collection, index) => {
        const card = createCollectionCard(collection, index, showMap, {
          isClone: featuredCollections.length > 1 && groupIndex !== 1,
        });
        collectionGrid.appendChild(card);
      });
    });

    if (featuredCollections.length > 1) {
      collectionPrev.hidden = false;
      collectionNext.hidden = false;
      collectionCarouselControls = initializeCollectionCarousel({
        featuredCollections,
        collectionCarousel,
        collectionViewport,
        collectionGrid,
        collectionPrev,
        collectionNext,
      });
    }
  }

  function toggleFilter(groupId, filterId) {
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
  }

  function getActiveFilterCount() {
    return Object.values(state.filters).reduce((count, values) => count + values.size, 0);
  }

  function matchesSelectedFilters(show) {
    return Object.entries(state.filters).every(([groupId, selectedValues]) => {
      if (selectedValues.size === 0) {
        return true;
      }

      const values = (() => {
        switch (groupId) {
          case "tags":
            return show.tagTokens;
          case "bestFor":
            return show.bestForTokens;
          case "completionStatus":
            return [show.completionStatus || "unclear"];
          case "reviewStatus":
            return [show.reviewStatus || "indexed-only"];
          default:
            return [];
        }
      })();

      return Array.from(selectedValues).some((value) => values.includes(value));
    });
  }

  function sortVisibleShows(visibleShows, selectedCollection) {
    const sortedShows = [...visibleShows];

    if (state.sortMode === "recently-updated") {
      return sortedShows.sort((left, right) => {
        const leftValue = left.updatedAt || "";
        const rightValue = right.updatedAt || "";
        if (rightValue !== leftValue) {
          return rightValue.localeCompare(leftValue);
        }

        return left.title.localeCompare(right.title);
      });
    }

    if (!selectedCollection) {
      return sortedShows;
    }

    const collectionOrder = new Map(selectedCollection.showIds.map((id, index) => [id, index]));
    return sortedShows.sort((left, right) => (collectionOrder.get(left.id) || 0) - (collectionOrder.get(right.id) || 0));
  }

  function renderHomeResults() {
    previewController.closeActivePreview({ immediate: true });

    const selectedCollection = state.selectedCollectionId
      ? collectionsById.get(state.selectedCollectionId)
      : null;

    const filteredShows = shows.filter((show) => {
      const matchesFilters = matchesSelectedFilters(show);
      const matchesCollection = !selectedCollection || selectedCollection.showIds.includes(show.id);
      return matchesFilters && matchesCollection;
    });
    const visibleShows = state.query
      ? (() => {
          const scoredResults = archiveSearch.scoreCatalog(shows, state.query);
          const filteredIds = new Set(filteredShows.map((show) => show.id));
          return scoredResults.filter((show) => filteredIds.has(show.id));
        })()
      : sortVisibleShows(filteredShows, selectedCollection);

    syncMostPopularSectionVisibility();
    archiveGrid.textContent = "";
    visibleShows.forEach((show) => {
      archiveGrid.appendChild(createShowCard(show, { previewMode: "inline-expand" }));
    });
    insertCollectionsSection(visibleShows.length);

    void syncCommunityCardBadges(archiveGrid, visibleShows);

    if (resultsSummary) {
      const fullReviewCount = visibleShows.filter((show) => show.reviewStatus === "full-review").length;
      const suffix = fullReviewCount === 1 ? "full review" : "full reviews";
      const collectionPrefix = selectedCollection ? `${selectedCollection.title} • ` : "";
      const searchPrefix = state.query ? `${visibleShows.length} results for "${state.query}"` : `${visibleShows.length} results`;
      const modePrefix = !state.query && state.sortMode === "recently-updated" ? "Recently updated • " : "";
      resultsSummary.textContent = `${collectionPrefix}${modePrefix}${searchPrefix} • ${fullReviewCount} ${suffix}`;
    }

    if (noResultsMsg) {
      noResultsMsg.hidden = visibleShows.length !== 0;
    }

    syncHomeControls();
  }

  function syncHomeControls() {
    const selectedCount = getActiveFilterCount();

    quickFiltersRoot.querySelectorAll(".quick-filter").forEach((button) => {
      const filter = button.dataset.chipFilter || "";
      const isActive =
        (filter === "all" &&
          selectedCount === 0 &&
          !state.query &&
          !state.selectedCollectionId &&
          state.sortMode === "default") ||
        (filter !== "all" && state.filters.tags.has(filter));

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    browseModesRoot.querySelectorAll(".browse-mode-button").forEach((button) => {
      const mode = button.dataset.browseMode || "default";
      const isActive = state.sortMode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    filterOptionGrid.querySelectorAll(".filter-option").forEach((button) => {
      const groupId = button.dataset.filterGroup || "";
      const value = button.dataset.filterValue || "";
      const isActive = Boolean(state.filters[groupId]?.has(value));
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (filterCount) {
      filterCount.hidden = selectedCount === 0;
      filterCount.textContent = String(selectedCount);
    }

    if (filterClear) {
      filterClear.hidden = selectedCount === 0 && !state.query && !state.selectedCollectionId && state.sortMode === "default";
    }
  }

  function insertCollectionsSection(visibleShowCount) {
    if (collectionsSection.hidden) {
      return;
    }

    const insertIndex = Math.min(visibleShowCount, getHomeGridColumnCount() * 2);
    const insertionPoint = archiveGrid.children[insertIndex] || null;
    archiveGrid.insertBefore(collectionsSection, insertionPoint);
  }

  function getHomeGridColumnCount() {
    if (window.matchMedia("(max-width: 1180px)").matches) {
      return 2;
    }

    return 6;
  }
}
