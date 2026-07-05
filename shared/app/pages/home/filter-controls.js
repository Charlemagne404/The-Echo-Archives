import { FILTER_COUNT_PULSE_DURATION_MS, restartAnimationClass } from "./filter-motion.js";
import { getActiveFilterCount } from "./filter-state.js";
import { formatFilterBucketStatus, formatFilterGroupCount, getBucketSelectionCount } from "./filter-utils.js";

export function renderQuickFilters({ quickFiltersRoot, quickFilters, onClearAllFilters, onToggleTagFilter }) {
  quickFiltersRoot.textContent = "";
  quickFiltersRoot.appendChild(createQuickFilterButton({ id: "all", label: "All" }, { onClearAllFilters, onToggleTagFilter }));

  quickFilters.forEach((tag) => {
    quickFiltersRoot.appendChild(createQuickFilterButton(tag, { onClearAllFilters, onToggleTagFilter }));
  });
}

export function renderBrowseModes({ browseModesRoot, onModeChange }) {
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
      onModeChange(mode.id);
    });
    browseModesRoot.appendChild(button);
  });
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
}) {
  const selectedCount = getActiveFilterCount(filters);
  const bucketMap = new Map((filterMenuBuckets || []).map((bucket) => [bucket.id, bucket]));

  quickFiltersRoot?.querySelectorAll(".quick-filter").forEach((button) => {
    const filter = button.dataset.chipFilter || "";
    const isActive =
      (filter === "all" && selectedCount === 0 && !query && !selectedCollectionId && sortMode === "default") ||
      (filter !== "all" && filters.tags.has(filter));

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  browseModesRoot?.querySelectorAll(".browse-mode-button").forEach((button) => {
    const mode = button.dataset.browseMode || "default";
    const isActive = sortMode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

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
    filterClear.hidden = selectedCount === 0 && !query && !selectedCollectionId && sortMode === "default";
  }
}

function createQuickFilterButton(tag, { onClearAllFilters, onToggleTagFilter }) {
  const button = document.createElement("button");
  button.className = "quick-filter";
  button.type = "button";
  button.dataset.chipFilter = tag.id;
  button.textContent = tag.label;
  button.addEventListener("click", () => {
    if (tag.id === "all") {
      onClearAllFilters();
      return;
    }

    onToggleTagFilter(tag.id);
  });
  return button;
}
