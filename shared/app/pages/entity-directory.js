const { matchesEntityQuery } = globalThis.EchoArchiveEntities;

const DIRECTORY_FILTER_VALUES = new Set(["all", "production-company", "studio", "network"]);
const DIRECTORY_SORT_VALUES = new Set(["name", "shows"]);

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

    results.textContent = `${count} ${count === 1 ? "organization" : "organizations"}${query || state.type !== "all" ? " found" : " to explore"}.`;
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
        emptyTitle.textContent = `No ${activeFilter} match “${query}”`;
        emptyDescription.textContent = "Try a shorter organization name or clear the search and filter.";
      } else if (query) {
        emptyTitle.textContent = `No organizations match “${query}”`;
        emptyDescription.textContent = "Try a shorter name, search the main archive for shows, or clear the search.";
      } else if (state.type !== "all") {
        emptyTitle.textContent = `No ${activeFilter} yet`;
        emptyDescription.textContent = "Choose All organizations or clear the filter to keep exploring.";
      } else {
        emptyTitle.textContent = "No matching organizations yet";
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
  };

  form.addEventListener("submit", (event) => { event.preventDefault(); update(); });
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
  for (const button of filterButtons) {
    button.addEventListener("click", () => { state.type = normalizeFilter(button.dataset.entityFilter); update(); });
  }
  sortSelect?.addEventListener("change", () => { state.sort = normalizeSort(sortSelect.value); update(); });
  resetLinks.forEach((resetLink) => resetLink.addEventListener("click", (event) => {
    event.preventDefault();
    input.value = "";
    state.type = "all";
    state.sort = "name";
    update();
    input.focus();
  }));

  input.value = url.searchParams.get("q") || "";
  update();
}
