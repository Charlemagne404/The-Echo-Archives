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
import { loadCommunitySummaries, syncCommunityCardBadges } from "../community.js";
import { normalizeTag, updateDocumentMetadata } from "../utils.js";

const HOME_MOST_POPULAR_LIMIT = 4;

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
  const activeBrowseState = document.getElementById("activeBrowseState");
  const activeBrowseChips = document.getElementById("activeBrowseChips");
  const activeBrowseClear = document.getElementById("activeBrowseClear");

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
  const publishedShows = shows.filter((show) => show.status === "published");
  const fallbackMostPopularShows = getFallbackMostPopularShows();
  const collectionsById = buildCollectionMap(collections);
  const filterGroupsById = new Map(structuredFilterGroups.map((group) => [group.id, group]));
  const filterOptionsByGroup = new Map(
    structuredFilterGroups.map((group) => [group.id, new Map(group.options.map((option) => [option.id, option.label]))]),
  );
  let collectionCarouselControls = null;
  let mostPopularShows = fallbackMostPopularShows;
  let mostPopularResolutionToken = 0;

  const state = {
    query: "",
    filters: {
      genres: new Set(),
      tags: new Set(),
      bestFor: new Set(),
      completionStatus: new Set(),
      reviewStatus: new Set(),
    },
    selectedCollectionId: "",
    sortMode: "default",
    gridLayoutBucket: getHomeGridLayoutBucket(),
  };

  const params = new URLSearchParams(window.location.search);
  const initialCollectionId = params.get("collection") || "";
  if (collectionsById.has(initialCollectionId)) {
    state.selectedCollectionId = initialCollectionId;
  }

  params.getAll("genre").forEach((genreId) => {
    const normalizedGenreId = normalizeTag(genreId);
    const hasGenre = shows.some((show) => show.genreTokens.includes(normalizedGenreId));
    if (hasGenre) {
      state.filters.genres.add(normalizedGenreId);
    }
  });

  const previewController = initializeHomePreviewController({
    archiveGrid,
    archiveSection,
  });
  const archiveCardShellsById = new Map(
    shows.map((show) => [show.id, createShowCard(show, { previewMode: "inline-expand" })]),
  );
  let searchRenderTimer = 0;

  renderFilterOptions();
  renderQuickFilters();
  renderBrowseModes();
  renderMostPopularSection();
  void resolveMostPopularShows();
  renderCollections();
  renderHomeResults();

  searchInput?.addEventListener("input", () => {
    state.query = searchInput.value.trim();
    if (searchRenderTimer) {
      window.clearTimeout(searchRenderTimer);
    }
    searchRenderTimer = window.setTimeout(() => {
      searchRenderTimer = 0;
      renderHomeResults();
    }, 150);
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

  activeBrowseClear?.addEventListener("click", () => {
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
    collectionCarouselControls?.refresh();
    const nextGridLayoutBucket = getHomeGridLayoutBucket();
    if (state.gridLayoutBucket !== nextGridLayoutBucket) {
      state.gridLayoutBucket = nextGridLayoutBucket;
      renderHomeResults();
    }
  });

  function clearAllFilters() {
    if (searchRenderTimer) {
      window.clearTimeout(searchRenderTimer);
      searchRenderTimer = 0;
    }
    Object.values(state.filters).forEach((values) => values.clear());
    state.selectedCollectionId = "";
    state.sortMode = "default";
    state.query = "";
    if (searchInput) {
      searchInput.value = "";
    }
    renderHomeResults();
  }

  function syncBrowseUrlState() {
    const nextParams = new URLSearchParams(window.location.search);
    nextParams.delete("collection");
    nextParams.delete("genre");

    if (state.selectedCollectionId) {
      nextParams.set("collection", state.selectedCollectionId);
    }

    Array.from(state.filters.genres)
      .sort()
      .forEach((genreId) => {
        nextParams.append("genre", genreId);
      });

    const nextSearch = nextParams.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
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

  function getFallbackMostPopularShows() {
    return HOME_MOST_POPULAR_IDS
      .map((showId) => showMap.get(showId))
      .filter((show) => show && show.status === "published")
      .slice(0, HOME_MOST_POPULAR_LIMIT);
  }

  function compareMostPopularShows(left, right) {
    return (
      right.summary.ratingCount - left.summary.ratingCount ||
      (right.summary.averageRating || 0) - (left.summary.averageRating || 0) ||
      left.show.title.localeCompare(right.show.title)
    );
  }

  function appendUniqueMostPopularShows(target, seenIds, candidates) {
    candidates.forEach((show) => {
      if (!show || seenIds.has(show.id) || show.status !== "published" || target.length >= HOME_MOST_POPULAR_LIMIT) {
        return;
      }

      seenIds.add(show.id);
      target.push(show);
    });
  }

  function buildMostPopularShows(communitySummaries) {
    const rankedByCommunity = publishedShows
      .map((show) => ({
        show,
        summary: communitySummaries[show.id] || null,
      }))
      .filter(({ summary }) => summary && summary.ratingCount > 0 && summary.averageRating !== null)
      .sort(compareMostPopularShows)
      .map(({ show }) => show);

    const rankedByPopularityScore = [...publishedShows]
      .filter((show) => Number.isFinite(show.popularity?.score))
      .sort((left, right) => {
        const leftScore = left.popularity?.score || 0;
        const rightScore = right.popularity?.score || 0;
        return rightScore - leftScore || left.title.localeCompare(right.title);
      });

    const resolved = [];
    const seenIds = new Set();
    appendUniqueMostPopularShows(resolved, seenIds, rankedByCommunity);
    appendUniqueMostPopularShows(resolved, seenIds, rankedByPopularityScore);
    appendUniqueMostPopularShows(resolved, seenIds, fallbackMostPopularShows);
    return resolved.slice(0, HOME_MOST_POPULAR_LIMIT);
  }

  function hasSameShowOrder(left, right) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((show, index) => show?.id === right[index]?.id);
  }

  async function resolveMostPopularShows() {
    if (publishedShows.length === 0) {
      return;
    }

    const requestToken = ++mostPopularResolutionToken;

    try {
      const communitySummaries = await loadCommunitySummaries(publishedShows.map((show) => show.id));
      if (requestToken !== mostPopularResolutionToken) {
        return;
      }

      const nextMostPopularShows = buildMostPopularShows(communitySummaries);
      mostPopularShows = nextMostPopularShows;

      if (hasSameShowOrder(nextMostPopularShows, fallbackMostPopularShows)) {
        void syncCommunityCardBadges(popularGrid, mostPopularShows);
        syncMostPopularSectionVisibility();
        return;
      }

      renderMostPopularSection();
    } catch (_error) {
      if (requestToken !== mostPopularResolutionToken) {
        return;
      }

      mostPopularShows = fallbackMostPopularShows;
      syncMostPopularSectionVisibility();
    }
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

  function getActiveBrowseDescriptors() {
    const descriptors = [];

    structuredFilterGroups.forEach((group) => {
      const selectedValues = state.filters[group.id];
      if (!selectedValues || selectedValues.size === 0) {
        return;
      }

      const optionLabels = filterOptionsByGroup.get(group.id) || new Map();
      Array.from(selectedValues)
        .sort((left, right) => {
          const leftLabel = optionLabels.get(left) || left;
          const rightLabel = optionLabels.get(right) || right;
          return leftLabel.localeCompare(rightLabel);
        })
        .forEach((value) => {
          const optionLabel = optionLabels.get(value) || value;
          const groupLabel = filterGroupsById.get(group.id)?.label || group.id;
          descriptors.push({
            id: `${group.id}:${value}`,
            label: `${groupLabel}: ${optionLabel}`,
            remove: () => {
              state.filters[group.id]?.delete(value);
            },
          });
        });
    });

    return descriptors;
  }

  function renderActiveBrowseState() {
    if (!activeBrowseState || !activeBrowseChips) {
      return;
    }

    const descriptors = getActiveBrowseDescriptors();
    activeBrowseState.hidden = descriptors.length === 0;
    activeBrowseChips.textContent = "";

    descriptors.forEach((descriptor) => {
      const button = document.createElement("button");
      button.className = "active-browse-chip";
      button.type = "button";
      button.dataset.activeBrowseId = descriptor.id;
      button.setAttribute("aria-label", `Remove ${descriptor.label}`);

      const label = document.createElement("span");
      label.textContent = descriptor.label;

      const remove = document.createElement("span");
      remove.className = "active-browse-chip-remove";
      remove.setAttribute("aria-hidden", "true");
      remove.textContent = "×";

      button.append(label, remove);
      button.addEventListener("click", () => {
        descriptor.remove();
        renderHomeResults();
      });
      activeBrowseChips.appendChild(button);
    });
  }

  function formatResultsSummaryPrefix(descriptors) {
    if (descriptors.length === 0) {
      return "";
    }

    if (descriptors.length <= 2) {
      return `${descriptors.map((descriptor) => descriptor.label).join(" • ")} • `;
    }

    return `Filtered by ${descriptors[0].label}, ${descriptors[1].label} + ${descriptors.length - 2} more • `;
  }

  function matchesSelectedFilters(show) {
    return Object.entries(state.filters).every(([groupId, selectedValues]) => {
      if (selectedValues.size === 0) {
        return true;
      }

      const values = (() => {
        switch (groupId) {
          case "genres":
            return show.genreTokens;
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

    const selectedCollection = getSelectedCollection();
    const visibleShows = getVisibleShows(selectedCollection);
    const activeDescriptors = getActiveBrowseDescriptors();

    syncMostPopularSectionVisibility();
    patchArchiveGrid(visibleShows);
    renderActiveBrowseState();
    syncBrowseUrlState();

    void syncCommunityCardBadges(archiveGrid, visibleShows);

    if (resultsSummary) {
      const fullReviewCount = visibleShows.filter((show) => show.reviewStatus === "full-review").length;
      const suffix = fullReviewCount === 1 ? "full review" : "full reviews";
      const collectionPrefix = selectedCollection ? `Collection: ${selectedCollection.title} • ` : "";
      const browsePrefix = `${collectionPrefix}${formatResultsSummaryPrefix(activeDescriptors)}`;
      const searchPrefix = state.query ? `${visibleShows.length} results for "${state.query}"` : `${visibleShows.length} results`;
      const modePrefix = !state.query && state.sortMode === "recently-updated" ? "Recently updated • " : "";
      resultsSummary.textContent = `${browsePrefix}${modePrefix}${searchPrefix} • ${fullReviewCount} ${suffix}`;
    }

    if (noResultsMsg) {
      noResultsMsg.hidden = visibleShows.length !== 0;
    }

    syncHomeControls();
  }

  function getSelectedCollection() {
    return state.selectedCollectionId ? collectionsById.get(state.selectedCollectionId) : null;
  }

  function getVisibleShows(selectedCollection) {
    const filteredShows = shows.filter((show) => {
      const matchesFilters = matchesSelectedFilters(show);
      const matchesCollection = !selectedCollection || selectedCollection.showIds.includes(show.id);
      return matchesFilters && matchesCollection;
    });

    if (!state.query) {
      return sortVisibleShows(filteredShows, selectedCollection);
    }

    const scoredResults = archiveSearch.scoreCatalog(shows, state.query);
    const filteredIds = new Set(filteredShows.map((show) => show.id));
    return scoredResults.filter((show) => filteredIds.has(show.id));
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

  function patchArchiveGrid(visibleShows) {
    const fragment = document.createDocumentFragment();
    const collectionInsertIndex = collectionsSection.hidden
      ? -1
      : Math.min(visibleShows.length, getHomeGridColumnCount() * 2);

    visibleShows.forEach((show, index) => {
      if (index === collectionInsertIndex) {
        fragment.appendChild(collectionsSection);
      }

      const shell = archiveCardShellsById.get(show.id);
      if (shell) {
        fragment.appendChild(shell);
      }
    });

    if (!collectionsSection.hidden && collectionInsertIndex >= visibleShows.length) {
      fragment.appendChild(collectionsSection);
    }

    archiveGrid.replaceChildren(fragment);
  }

  function getHomeGridColumnCount() {
    return state.gridLayoutBucket === "compact" ? 2 : 6;
  }

  function getHomeGridLayoutBucket() {
    return window.matchMedia("(max-width: 1180px)").matches ? "compact" : "wide";
  }
}
