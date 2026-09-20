import {
  bucketDiscoveryClearedFilterCount,
  bucketDiscoveryFilterCount,
  bucketDiscoveryResultCount,
  trackDiscoveryEvent,
} from "../discovery-analytics.js";

const { matchesEntityQuery } = globalThis.EchoArchiveEntities;

const DIRECTORY_FILTER_VALUES = new Set(["all", "production-company", "studio", "network"]);
const DIRECTORY_SORT_VALUES = new Set(["name", "shows"]);

function initializeEntityCatalogueSearch() {
  const grid = document.querySelector(".entity-detail-catalogue #entityShowGrid");
  const input = document.getElementById("entityShowSearch");
  if (!grid || !input) return;

  const entries = Array.from(grid.querySelectorAll("[data-entity-show-search]"));
  const results = document.getElementById("entityShowResults");
  const emptyState = document.getElementById("entityShowEmpty");
  const clearButton = document.querySelector("[data-entity-show-clear]");
  const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const update = () => {
    const query = normalize(input.value.trim());
    const visibleCount = entries.reduce((count, entry) => {
      const visible = !query || normalize(entry.dataset.entityShowSearch).includes(query);
      entry.hidden = !visible;
      return count + Number(visible);
    }, 0);
    if (results) results.textContent = `${visibleCount} connected ${visibleCount === 1 ? "show" : "shows"}${query ? " found" : ""}.`;
    if (emptyState) emptyState.hidden = visibleCount > 0;
    if (clearButton) clearButton.hidden = !query;
  };

  input.addEventListener("input", update);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !input.value) return;
    event.preventDefault();
    input.value = "";
    update();
  });
  clearButton?.addEventListener("click", () => {
    input.value = "";
    update();
    input.focus();
  });
  update();
}

function normalizeFilter(value) {
  return DIRECTORY_FILTER_VALUES.has(value) ? value : "all";
}

function normalizeSort(value) {
  return DIRECTORY_SORT_VALUES.has(value) ? value : "name";
}

export async function initializeEntityDirectory() {
  const catalogueGrid = document.querySelector(".entity-catalogue .podcast-card-grid");
  if (catalogueGrid) {
    const shows = Array.from(catalogueGrid.querySelectorAll("[data-podcast-id]")).map((node) => ({ id: node.dataset.podcastId }));
    const { syncCommunityCardBadges } = await import("../community.js");
    void syncCommunityCardBadges(catalogueGrid, shows);
  }

  initializeEntityCatalogueSearch();

  const input = document.getElementById("entitySearch");
  if (!input) return;

  const form = input.closest("form");
  const directoryGrid = document.getElementById("entityGrid");
  const results = document.getElementById("entityResults");
  const emptyState = document.getElementById("entityEmpty");
  const emptyTitle = document.getElementById("entityEmptyTitle");
  const emptyDescription = document.getElementById("entityEmptyDescription");
  const browseLink = document.querySelector("[data-entity-browse]");
  const resetLinks = Array.from(document.querySelectorAll("[data-entity-reset]"));
  const clearButton = document.querySelector("[data-entity-clear]");
  const sortSelect = document.getElementById("entitySort");
  const filterButtons = Array.from(document.querySelectorAll("[data-entity-filter]"));
  const entries = Array.from(directoryGrid.querySelectorAll("[data-entity-names]")).map((element) => {
    const [name, ...aliases] = JSON.parse(element.dataset.entityNames);
    return {
      element,
      name,
      aliases,
      type: element.dataset.entityType || "",
      showCount: Number(element.dataset.entityShowCount) || 0,
    };
  });
  const url = new URL(window.location.href);
  const state = {
    type: normalizeFilter(url.searchParams.get("type")),
    sort: normalizeSort(url.searchParams.get("sort")),
  };
  const entityAnalytics = {
    hasRendered: false,
    previousResultCountBucket: "unknown",
    lastResultCount: 0,
    seenSearchStates: new Set(),
    pendingFilterChange: null,
    pendingClear: null,
    searchAnalyticsTimer: 0,
    pendingSearch: null,
  };

  const update = () => {
    const query = input.value.trim();
    const sortedEntries = [...entries].sort((a, b) => {
      if (state.sort === "shows") return (b.showCount - a.showCount) || a.name.localeCompare(b.name, "en");
      return a.name.localeCompare(b.name, "en");
    });
    let count = 0;

    for (const entry of sortedEntries) {
      directoryGrid.append(entry.element);
      const matchesType = state.type === "all" || entry.type === state.type;
      const matchesSearch = !query || matchesEntityQuery(entry, query);
      entry.element.hidden = !(matchesType && matchesSearch);
      if (!entry.element.hidden) count += 1;
    }

    results.textContent = `${count} ${count === 1 ? "organization" : "organizations"}${query || state.type !== "all" ? " found" : " in the directory"}.`;
    emptyState.hidden = count > 0;
    browseLink.href = query ? `/?q=${encodeURIComponent(query)}#archive` : "/#archive";
    const activeState = Boolean(query || state.type !== "all" || state.sort !== "name");
    resetLinks.forEach((link) => {
      link.textContent = "Clear search and filters";
      if (link.classList.contains("entity-results-reset")) link.hidden = !activeState;
    });
    if (clearButton) clearButton.hidden = !query;
    if (emptyTitle && emptyDescription) {
      const activeFilter = filterButtons.find((button) => button.dataset.entityFilter === state.type)?.querySelector("span")?.textContent?.toLowerCase() || "organizations";
      if (query && state.type !== "all") {
        emptyTitle.textContent = `Nothing matched ${activeFilter} “${query}”`;
        emptyDescription.textContent = "Try a shorter name or clear the search and filter.";
      } else if (query) {
        emptyTitle.textContent = `Nothing matched “${query}”`;
        emptyDescription.textContent = "Try a shorter name, search the main archive for shows, or clear the search.";
      } else if (state.type !== "all") {
        emptyTitle.textContent = `No ${activeFilter} yet`;
        emptyDescription.textContent = "Choose All organizations or clear the filter.";
      } else {
        emptyTitle.textContent = "Nothing matched that search";
        emptyDescription.textContent = "Try a shorter name, search the main archive for shows, or clear your search.";
      }
    }
    for (const button of filterButtons) {
      const active = button.dataset.entityFilter === state.type;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      const filterValue = button.dataset.entityFilter;
      const filteredCount = entries.filter((entry) => (filterValue === "all" || entry.type === filterValue) && (!query || matchesEntityQuery(entry, query))).length;
      const countNode = button.querySelector(".entity-filter-count");
      if (countNode) countNode.textContent = String(filteredCount);
    }
    if (sortSelect) sortSelect.value = state.sort;

    const nextUrl = new URL(window.location.href);
    if (query) nextUrl.searchParams.set("q", query);
    else nextUrl.searchParams.delete("q");
    if (state.type === "all") nextUrl.searchParams.delete("type");
    else nextUrl.searchParams.set("type", state.type);
    if (state.sort === "name") nextUrl.searchParams.delete("sort");
    else nextUrl.searchParams.set("sort", state.sort);
    history.replaceState(history.state, "", nextUrl);

    const resultCountBucket = bucketDiscoveryResultCount(count);
    const recoveryContext = entityAnalytics.previousResultCountBucket === "0"
      ? "after_zero_results"
      : entityAnalytics.hasRendered
        ? "none"
        : "unknown";
    const searchSignature = JSON.stringify({ query: query.trim(), type: state.type });
    if (query.trim()) {
      entityAnalytics.pendingSearch = {
        signature: searchSignature,
        resultCountBucket,
        activeFilterCountBucket: bucketDiscoveryFilterCount(Number(state.type !== "all")),
        recoveryContext,
      };
      if (entityAnalytics.searchAnalyticsTimer) {
        window.clearTimeout(entityAnalytics.searchAnalyticsTimer);
      }
      entityAnalytics.searchAnalyticsTimer = window.setTimeout(() => {
        entityAnalytics.searchAnalyticsTimer = 0;
        const pendingSearch = entityAnalytics.pendingSearch;
        entityAnalytics.pendingSearch = null;
        if (!pendingSearch || entityAnalytics.seenSearchStates.has(pendingSearch.signature)) return;
        entityAnalytics.seenSearchStates.add(pendingSearch.signature);
        trackDiscoveryEvent("Search Used", {
          discovery_surface: "entity_directory",
          query_kind: "text",
          structured_clause_group: "none",
          result_count_bucket: pendingSearch.resultCountBucket,
          active_filter_count_bucket: pendingSearch.activeFilterCountBucket,
          recovery_context: pendingSearch.recoveryContext,
        });
      }, 350);
    } else {
      entityAnalytics.pendingSearch = null;
      if (entityAnalytics.searchAnalyticsTimer) {
        window.clearTimeout(entityAnalytics.searchAnalyticsTimer);
        entityAnalytics.searchAnalyticsTimer = 0;
      }
    }

    if (entityAnalytics.pendingFilterChange) {
      const { action, filterValue } = entityAnalytics.pendingFilterChange;
      trackDiscoveryEvent("Filter Changed", {
        discovery_surface: "entity_directory",
        filter_group: "entityType",
        filter_action: action,
        filter_value: filterValue,
        active_filter_count_bucket: bucketDiscoveryFilterCount(Number(state.type !== "all")),
        result_count_bucket: resultCountBucket,
        recovery_context: recoveryContext,
      });
      entityAnalytics.pendingFilterChange = null;
    }

    if (entityAnalytics.pendingClear) {
      const { count: clearedCount, hadSearch } = entityAnalytics.pendingClear;
      trackDiscoveryEvent("Filters Cleared", {
        discovery_surface: "entity_directory",
        clear_scope: "all",
        cleared_filter_count_bucket: bucketDiscoveryClearedFilterCount(clearedCount),
        had_search: hadSearch,
        result_count_bucket_before: bucketDiscoveryResultCount(entityAnalytics.lastResultCount),
      });
      entityAnalytics.pendingClear = null;
    }

    entityAnalytics.lastResultCount = count;
    entityAnalytics.previousResultCountBucket = resultCountBucket;
    entityAnalytics.hasRendered = true;
  };

  form.addEventListener("submit", (event) => { event.preventDefault(); update(); });
  input.addEventListener("input", update);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !input.value) return;
    event.preventDefault();
    entityAnalytics.pendingClear = { count: 1, hadSearch: true };
    input.value = "";
    update();
  });
  clearButton?.addEventListener("click", () => {
    if (input.value.trim()) {
      entityAnalytics.pendingClear = { count: 1, hadSearch: true };
    }
    input.value = "";
    update();
    input.focus();
  });
  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      const nextType = normalizeFilter(button.dataset.entityFilter);
      if (nextType !== state.type) {
        entityAnalytics.pendingFilterChange = {
          action: nextType === "all" ? "removed" : "added",
          filterValue: nextType === "all" ? state.type : nextType,
        };
      }
      state.type = nextType;
      update();
    });
  }
  sortSelect?.addEventListener("change", () => { state.sort = normalizeSort(sortSelect.value); update(); });
  resetLinks.forEach((resetLink) => resetLink.addEventListener("click", (event) => {
    event.preventDefault();
    if (input.value.trim() || state.type !== "all") {
      entityAnalytics.pendingClear = {
        count: Number(Boolean(input.value.trim())) + Number(state.type !== "all"),
        hadSearch: Boolean(input.value.trim()),
      };
    }
    input.value = "";
    state.type = "all";
    state.sort = "name";
    update();
    input.focus();
  }));

  input.value = url.searchParams.get("q") || "";
  update();
}
