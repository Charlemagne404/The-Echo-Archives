import { FILTER_COUNT_PULSE_DURATION_MS, restartAnimationClass } from "./filter-motion.js";
import { getActiveFilterCount } from "./filter-state.js";
import { formatFilterBucketStatus, formatFilterGroupCount, getBucketSelectionCount } from "./filter-utils.js";
import { HOME_SORT_OPTIONS } from "./layout.js";

export function renderQuickFilters({ quickFiltersRoot, quickFilters, onClearAllFilters, onToggleTagFilter }) {
  const tags = [{ id: "all", label: "All" }, ...quickFilters];
  const expectedIds = new Set(tags.map((tag) => tag.id));
  const existingButtons = new Map(
    Array.from(quickFiltersRoot.querySelectorAll(".quick-filter[data-chip-filter]"))
      .filter((button) => button instanceof HTMLButtonElement)
      .map((button) => [button.dataset.chipFilter || "", button]),
  );

  quickFiltersRoot.querySelectorAll(".quick-filter[data-chip-filter]").forEach((button) => {
    if (!expectedIds.has(button.getAttribute("data-chip-filter") || "")) {
      button.remove();
    }
  });

  tags.forEach((tag) => {
    const button = createQuickFilterButton(
      tag,
      { onClearAllFilters, onToggleTagFilter },
      existingButtons.get(tag.id),
    );
    quickFiltersRoot.appendChild(button);
  });
}

export function renderBrowseModes({ browseModesRoot, sortMode, sortModeExplicit = false, query = "", onModeChange }) {
  const select = browseModesRoot?.querySelector("#browseSort");
  if (!(select instanceof HTMLSelectElement)) return;

  const modes = query
    ? [{ id: "search-relevance", label: "Search relevance" }, ...HOME_SORT_OPTIONS]
    : HOME_SORT_OPTIONS;
  select.replaceChildren(...modes.map((mode) => {
    const option = document.createElement("option");
    option.value = mode.id;
    option.textContent = mode.label;
    return option;
  }));
  select.value = query && !sortModeExplicit ? "search-relevance" : sortMode;
  select.disabled = false;
  select.removeAttribute("aria-disabled");
  select.onchange = () => onModeChange(select.value);
}

export function syncHomeControls({
  quickFiltersRoot,
  browseModesRoot,
  filterOptionGrid,
  filterCount,
  filterClear,
  filterMenuBuckets,
  filterOptionsByGroup,
  filters,
  query,
  selectedCollectionId,
  sortMode,
  sortModeExplicit = false,
}) {
  const selectedCount = getActiveFilterCount(filters);
  const bucketMap = new Map((filterMenuBuckets || []).map((bucket) => [bucket.id, bucket]));

  quickFiltersRoot?.querySelectorAll(".quick-filter").forEach((button) => {
    const filter = button.dataset.chipFilter || "";
    const isActive =
      (filter === "all" && selectedCount === 0 && !query && !selectedCollectionId && sortMode === "popular" && !sortModeExplicit) ||
      (filter !== "all" && filters.tags.has(filter));

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const browseSort = browseModesRoot?.querySelector("#browseSort");
  if (browseSort instanceof HTMLSelectElement) {
    let relevanceOption = browseSort.querySelector('option[value="search-relevance"]');
    if (query && !relevanceOption) {
      relevanceOption = document.createElement("option");
      relevanceOption.value = "search-relevance";
      relevanceOption.textContent = "Search relevance";
      browseSort.prepend(relevanceOption);
    } else if (!query) {
      relevanceOption?.remove();
      relevanceOption = null;
    }
    browseSort.value = query && !sortModeExplicit ? "search-relevance" : sortMode;
  }

  filterOptionGrid?.querySelectorAll(".filter-option").forEach((button) => {
    const groupId = button.dataset.filterGroup || "";
    const value = button.dataset.filterValue || "";
    const isActive = Boolean(filters[groupId]?.has(value));
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  filterOptionGrid?.querySelectorAll(".filter-group-count[data-filter-group-count-for]").forEach((node) => {
    const groupId = node.getAttribute("data-filter-group-count-for") || "";
    const group = (filterMenuBuckets || [])
      .flatMap((bucket) => bucket.groups)
      .find((entry) => entry.id === groupId);
    if (!group) {
      return;
    }

    node.textContent = formatFilterGroupCount(group, filters);
  });

  filterOptionGrid?.querySelectorAll(".filter-bucket-status[data-filter-bucket-status]").forEach((node) => {
    const bucketId = node.getAttribute("data-filter-bucket-status") || "";
    const bucket = bucketMap.get(bucketId);
    if (!bucket) {
      return;
    }

    node.textContent = formatFilterBucketStatus(bucket, filters, filterOptionsByGroup);
  });

  filterOptionGrid?.querySelectorAll(".filter-bucket-card[data-filter-bucket-id]").forEach((button) => {
    const bucketId = button.getAttribute("data-filter-bucket-id") || "";
    const bucket = bucketMap.get(bucketId);
    const hasSelection = bucket ? getBucketSelectionCount(bucket, filters) > 0 : false;
    button.classList.toggle("has-selection", hasSelection);
    button.setAttribute("data-has-selection", String(hasSelection));
  });

  filterOptionGrid?.querySelectorAll(".filter-bucket-clear[data-filter-bucket-clear]").forEach((button) => {
    const bucketId = button.getAttribute("data-filter-bucket-clear") || "";
    const bucket = bucketMap.get(bucketId);
    if (!bucket) {
      return;
    }

    button.hidden = getBucketSelectionCount(bucket, filters) === 0;
  });

  if (filterCount) {
    const previousCount = Number.parseInt(filterCount.dataset.activeCount || "0", 10);
    filterCount.hidden = selectedCount === 0;
    filterCount.textContent = String(selectedCount);
    filterCount.dataset.activeCount = String(selectedCount);
    if (!filterCount.hidden && previousCount !== selectedCount) {
      restartAnimationClass(filterCount, "is-pulsing", FILTER_COUNT_PULSE_DURATION_MS);
    }
  }

  if (filterClear) {
    filterClear.hidden = selectedCount === 0 && !query && !selectedCollectionId && !sortModeExplicit;
    const filterHeader = filterClear.closest(".filter-dropdown-header");
    if (filterHeader instanceof HTMLElement) {
      filterHeader.hidden = filterClear.hidden;
    }
  }
}

function createQuickFilterButton(tag, { onClearAllFilters, onToggleTagFilter }, existingButton = null) {
  const button = existingButton instanceof HTMLButtonElement ? existingButton : document.createElement("button");
  button.className = "quick-filter";
  button.type = "button";
  button.dataset.chipFilter = tag.id;
  button.textContent = tag.label;
  button.disabled = false;
  button.removeAttribute("aria-disabled");
  button.onclick = () => {
    if (tag.id === "all") {
      onClearAllFilters();
      return;
    }

    onToggleTagFilter(tag.id);
  };
  return button;
}
