export function getHomeElements() {
  const elements = {
    heroShell: document.getElementById("browse"),
    searchInput: document.getElementById("search"),
    stickyBrowseBar: document.getElementById("stickyBrowseBar"),
    stickySearchToggle: document.getElementById("stickySearchToggle"),
    stickySearchField: document.getElementById("stickySearchField"),
    stickySearchInput: document.getElementById("stickySearch"),
    filterToggle: document.getElementById("filterToggle"),
    filterDropdown: document.getElementById("filterDropdown"),
    filterCount: document.getElementById("filterCount"),
    filterClear: document.getElementById("filterClear"),
    filterOptionGrid: document.getElementById("filterOptionGrid"),
    stickyFilterToggle: document.getElementById("stickyFilterToggle"),
    stickyFilterDropdown: document.getElementById("stickyFilterDropdown"),
    stickyFilterCount: document.getElementById("stickyFilterCount"),
    stickyFilterClear: document.getElementById("stickyFilterClear"),
    stickyFilterOptionGrid: document.getElementById("stickyFilterOptionGrid"),
    browseModesRoot: document.getElementById("browseModes"),
    archiveSection: document.getElementById("archive"),
    popularSection: document.getElementById("mostPopular"),
    popularGrid: document.getElementById("popularGrid"),
    recentlyAddedSection: document.getElementById("recentlyAdded"),
    recentlyAddedGrid: document.getElementById("recentlyAddedGrid"),
    recentlyAddedEmptyState: document.getElementById("recentlyAddedEmptyState"),
    archiveGrid: document.getElementById("podcast-grid"),
    noResultsMsg: document.getElementById("noResultsMsg"),
    resultsSummary: document.getElementById("resultsSummary"),
    quickFiltersRoot: document.getElementById("quickFilters"),
    favoriteRoutesSection: document.getElementById("favoriteRoutes"),
    favoriteRoutesCarousel: document.getElementById("favoriteRoutesCarousel"),
    favoriteRoutesViewport: document.getElementById("favoriteRoutesViewport"),
    favoriteRoutesGrid: document.getElementById("favoriteRoutesGrid"),
    favoriteRoutesPrev: document.getElementById("favoriteRoutesPrev"),
    favoriteRoutesNext: document.getElementById("favoriteRoutesNext"),
    collectionsSection: document.getElementById("collections"),
    collectionCarousel: document.getElementById("collectionCarousel"),
    collectionViewport: document.getElementById("collectionViewport"),
    collectionGrid: document.getElementById("collectionGrid"),
    collectionPrev: document.getElementById("collectionPrev"),
    collectionNext: document.getElementById("collectionNext"),
    clearResultsState: document.getElementById("clearResultsState"),
    openArchivistAction: document.getElementById("openArchivistAction"),
    activeBrowseState: document.getElementById("activeBrowseState"),
    activeBrowseChips: document.getElementById("activeBrowseChips"),
    activeBrowseClear: document.getElementById("activeBrowseClear"),
  };

  if (
    !elements.heroShell ||
    !(elements.searchInput instanceof HTMLInputElement) ||
    !(elements.stickySearchToggle instanceof HTMLButtonElement) ||
    !elements.stickySearchField ||
    !(elements.stickySearchInput instanceof HTMLInputElement) ||
    !elements.stickyBrowseBar ||
    !elements.archiveGrid ||
    !elements.archiveSection ||
    !elements.popularSection ||
    !elements.popularGrid ||
    !elements.recentlyAddedSection ||
    !elements.recentlyAddedGrid ||
    !elements.recentlyAddedEmptyState ||
    !elements.filterOptionGrid ||
    !elements.stickyFilterOptionGrid ||
    !elements.quickFiltersRoot ||
    !elements.favoriteRoutesSection ||
    !elements.favoriteRoutesCarousel ||
    !elements.favoriteRoutesViewport ||
    !elements.favoriteRoutesGrid ||
    !elements.favoriteRoutesPrev ||
    !elements.favoriteRoutesNext ||
    !elements.collectionsSection ||
    !elements.collectionCarousel ||
    !elements.collectionViewport ||
    !elements.collectionGrid ||
    !elements.collectionPrev ||
    !elements.collectionNext ||
    !elements.browseModesRoot ||
    !elements.resultsSummary ||
    !(elements.filterToggle instanceof HTMLButtonElement) ||
    !(elements.stickyFilterToggle instanceof HTMLButtonElement)
  ) {
    return null;
  }

  return elements;
}
