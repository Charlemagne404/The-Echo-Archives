import {
  ACTIVE_BROWSE_CLEAR_KEY,
  FILTER_COUNT_PULSE_DURATION_MS,
  FILTER_OPTION_TOGGLE_DURATION_MS,
  cancelPendingExit,
  captureRects,
  createActiveBrowseChip,
  playEnterAnimation,
  playFlipAnimations,
  resetExitingChipPosition,
  restartAnimationClass,
  scheduleChipExit,
  scheduleClearExit,
  syncActiveBrowseVisibility,
} from "./filter-motion.js";

const FILTER_TAG_SUGGESTION_LIMIT = 8;
const FILTER_TAG_SEARCH_LIMIT = 18;

export function createFilterMenuState() {
  return {
    view: "launcher",
    activeBucketId: "",
    tagQuery: "",
  };
}

export function resetFilterMenuState(menuState) {
  if (!menuState) {
    return;
  }

  menuState.view = "launcher";
  menuState.activeBucketId = "";
  menuState.tagQuery = "";
}

export function openFilterMenuBucket(menuState, bucketId) {
  if (!menuState) {
    return;
  }

  menuState.view = "detail";
  menuState.activeBucketId = bucketId;
  menuState.tagQuery = "";
}

export function renderFilterMenu({
  filterDropdown,
  filterOptionGrid,
  filterMenuBuckets,
  filterOptionsByGroup,
  filters,
  menuState,
  onOpenBucket,
  onBackToLauncher,
  onToggleFilter,
  onClearBucketFilters,
}) {
  if (!filterDropdown || !filterOptionGrid) {
    return;
  }

  filterOptionGrid.textContent = "";
  const activeBucket = filterMenuBuckets.find((bucket) => bucket.id === menuState.activeBucketId) || null;
  filterDropdown.dataset.menuView = activeBucket ? "detail" : "launcher";
  syncFilterDropdownHeader({ filterDropdown, activeBucket });

  if (!activeBucket) {
    renderFilterMenuLauncher({
      filterOptionGrid,
      filterMenuBuckets,
      filterOptionsByGroup,
      filters,
      onOpenBucket,
    });
    return;
  }

  renderFilterMenuDetail({
    filterOptionGrid,
    bucket: activeBucket,
    filterOptionsByGroup,
    filters,
    menuState,
    onBackToLauncher,
    onToggleFilter,
    onClearBucketFilters,
  });
}

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

export function getActiveFilterCount(filters) {
  return Object.values(filters).reduce((count, values) => count + values.size, 0);
}

function syncFilterDropdownHeader({ filterDropdown, activeBucket }) {
  const intro = filterDropdown.querySelector(".filter-dropdown-header > div");
  const kicker = filterDropdown.querySelector(".filter-dropdown-kicker");
  const copy = filterDropdown.querySelector(".filter-dropdown-copy");
  if (!intro || !kicker || !copy) {
    return;
  }

  let title = intro.querySelector(".filter-dropdown-title");
  if (!(title instanceof HTMLElement)) {
    title = document.createElement("p");
    title.className = "filter-dropdown-title";
    copy.before(title);
  }

  kicker.textContent = activeBucket ? "Filter bucket" : "Refine the archive";
  title.textContent = activeBucket ? activeBucket.label : "Archive filters";
  copy.textContent = activeBucket
    ? activeBucket.description
    : "Start with story type, tone, listening context, archive status, or tags.";
}

function renderFilterMenuLauncher({
  filterOptionGrid,
  filterMenuBuckets,
  filterOptionsByGroup,
  filters,
  onOpenBucket,
}) {
  const launcher = document.createElement("div");
  launcher.className = "filter-menu-launcher";

  filterMenuBuckets.forEach((bucket) => {
    const button = document.createElement("button");
    button.className = "filter-bucket-card";
    button.type = "button";
    button.dataset.filterBucketId = bucket.id;
    button.dataset.hasSelection = String(getBucketSelectionCount(bucket, filters) > 0);
    button.addEventListener("click", () => {
      onOpenBucket(bucket.id);
    });

    const copy = document.createElement("span");
    copy.className = "filter-bucket-copy";

    const label = document.createElement("span");
    label.className = "filter-bucket-label";
    label.textContent = bucket.label;

    const description = document.createElement("span");
    description.className = "filter-bucket-description";
    description.textContent = bucket.description;

    const meta = document.createElement("span");
    meta.className = "filter-bucket-meta";

    const status = document.createElement("span");
    status.className = "filter-bucket-status";
    status.dataset.filterBucketStatus = bucket.id;
    status.textContent = formatFilterBucketStatus(bucket, filters, filterOptionsByGroup);

    const chevron = document.createElement("span");
    chevron.className = "filter-bucket-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";

    copy.append(label, description);
    meta.append(status, chevron);
    button.append(copy, meta);
    launcher.appendChild(button);
  });

  filterOptionGrid.appendChild(launcher);
}

function renderFilterMenuDetail({
  filterOptionGrid,
  bucket,
  filterOptionsByGroup,
  filters,
  menuState,
  onBackToLauncher,
  onToggleFilter,
  onClearBucketFilters,
}) {
  const detail = document.createElement("div");
  detail.className = "filter-menu-detail";
  detail.dataset.filterBucket = bucket.id;

  const toolbar = document.createElement("div");
  toolbar.className = "filter-detail-toolbar";

  const backButton = document.createElement("button");
  backButton.className = "filter-back-button";
  backButton.type = "button";
  backButton.textContent = "Back";
  backButton.addEventListener("click", () => {
    onBackToLauncher();
  });

  const titleBlock = document.createElement("div");
  titleBlock.className = "filter-detail-title-block";

  const title = document.createElement("p");
  title.className = "filter-detail-title";
  title.textContent = bucket.label;

  const status = document.createElement("p");
  status.className = "filter-detail-status";
  status.dataset.filterBucketStatus = bucket.id;
  status.textContent = formatFilterBucketStatus(bucket, filters, filterOptionsByGroup);

  const clearButton = document.createElement("button");
  clearButton.className = "filter-bucket-clear";
  clearButton.type = "button";
  clearButton.dataset.filterBucketClear = bucket.id;
  clearButton.textContent = "Clear section";
  clearButton.hidden = getBucketSelectionCount(bucket, filters) === 0;

  titleBlock.append(title, status);
  toolbar.append(backButton, titleBlock, clearButton);
  detail.appendChild(toolbar);

  let rerenderDetailResults = null;
  if (bucket.searchable) {
    const tagDetail = createTagFinderDetail({
      bucket,
      filters,
      filterOptionsByGroup,
      menuState,
      onToggleFilter,
    });
    rerenderDetailResults = tagDetail.__renderResults;
    detail.appendChild(tagDetail);
  } else {
    const scroll = document.createElement("div");
    scroll.className = "filter-detail-scroll";
    bucket.groups.forEach((group) => {
      scroll.appendChild(
        createFilterGroupSection({
          group,
          filters,
          onToggleFilter,
        }),
      );
    });
    detail.appendChild(scroll);
  }

  clearButton.addEventListener("click", () => {
    onClearBucketFilters(bucket.id);
    rerenderDetailResults?.();
  });

  filterOptionGrid.appendChild(detail);
}

function createTagFinderDetail({
  bucket,
  filters,
  filterOptionsByGroup,
  menuState,
  onToggleFilter,
}) {
  const tagGroup = bucket.groups[0];
  const scroll = document.createElement("div");
  scroll.className = "filter-detail-scroll";

  const searchField = document.createElement("label");
  searchField.className = "filter-tag-search-field";

  const searchLabel = document.createElement("span");
  searchLabel.className = "filter-tag-search-label";
  searchLabel.textContent = "Search tags";

  const searchInput = document.createElement("input");
  searchInput.className = "filter-tag-search-input";
  searchInput.type = "search";
  searchInput.placeholder = "Find a tag";
  searchInput.value = menuState.tagQuery;

  const resultsRoot = document.createElement("div");
  resultsRoot.className = "filter-tag-results";

  const renderResults = () => {
    renderTagFinderResults({
      resultsRoot,
      tagGroup,
      filters,
      filterOptionsByGroup,
      menuState,
      onToggleFilter,
    });
  };

  searchInput.addEventListener("input", () => {
    menuState.tagQuery = searchInput.value.trim();
    renderResults();
  });

  searchField.append(searchLabel, searchInput);
  scroll.append(searchField, resultsRoot);
  renderResults();
  scroll.__renderResults = renderResults;

  return scroll;
}

function renderTagFinderResults({
  resultsRoot,
  tagGroup,
  filters,
  filterOptionsByGroup,
  menuState,
  onToggleFilter,
}) {
  resultsRoot.textContent = "";

  const tagOptions = tagGroup?.options || [];
  const selectedTagIds = filters.tags || new Set();
  const selectedTags = getSortedSelectedOptions("tags", selectedTagIds, filterOptionsByGroup);
  const selectedTagMap = new Set(selectedTags.map((option) => option.id));
  const query = menuState.tagQuery.trim().toLowerCase();
  const toggleTagFilter = (groupId, filterId) => {
    onToggleFilter(groupId, filterId);
    renderTagFinderResults({
      resultsRoot,
      tagGroup,
      filters,
      filterOptionsByGroup,
      menuState,
      onToggleFilter,
    });
  };

  if (selectedTags.length > 0) {
    resultsRoot.appendChild(
      createFilterOptionSection({
        countText: `${selectedTags.length} selected`,
        filters,
        groupId: "tags",
        onToggleFilter: toggleTagFilter,
        options: selectedTags,
        title: "Selected tags",
      }),
    );
  }

  if (!query) {
    const suggestions = tagOptions
      .filter((option) => !selectedTagMap.has(option.id))
      .slice(0, FILTER_TAG_SUGGESTION_LIMIT);

    resultsRoot.appendChild(
      createFilterOptionSection({
        countText: `${suggestions.length} suggestions`,
        filters,
        groupId: "tags",
        onToggleFilter: toggleTagFilter,
        options: suggestions,
        title: "Popular tags",
      }),
    );
    return;
  }

  const matches = tagOptions
    .filter((option) => {
      const haystack = `${option.label} ${option.id}`.toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, FILTER_TAG_SEARCH_LIMIT);

  if (matches.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "filter-empty-note";
    emptyState.textContent = "No tag matches yet. Try a broader archive keyword.";
    resultsRoot.appendChild(emptyState);
    return;
  }

  resultsRoot.appendChild(
    createFilterOptionSection({
      countText: `${matches.length} matches`,
      filters,
      groupId: "tags",
      onToggleFilter: toggleTagFilter,
      options: matches,
      title: "Matching tags",
    }),
  );
}

function createFilterGroupSection({ group, filters, onToggleFilter }) {
  const section = document.createElement("section");
  section.className = "filter-group";

  const heading = document.createElement("div");
  heading.className = "filter-group-heading";

  const title = document.createElement("p");
  title.className = "filter-group-title";
  title.textContent = group.label;

  const count = document.createElement("p");
  count.className = "filter-group-count";
  count.dataset.filterGroupCountFor = group.id;
  count.textContent = formatFilterGroupCount(group, filters);

  heading.append(title, count);
  section.append(heading, createFilterOptionGrid({
    filters,
    groupId: group.id,
    onToggleFilter,
    options: group.options,
  }));

  return section;
}

function createFilterOptionSection({ title, countText, filters, groupId, onToggleFilter, options }) {
  const section = document.createElement("section");
  section.className = "filter-group filter-tag-group";

  const heading = document.createElement("div");
  heading.className = "filter-group-heading";

  const titleNode = document.createElement("p");
  titleNode.className = "filter-group-title";
  titleNode.textContent = title;

  const countNode = document.createElement("p");
  countNode.className = "filter-group-count";
  countNode.textContent = countText;

  heading.append(titleNode, countNode);
  section.append(heading, createFilterOptionGrid({
    filters,
    groupId,
    onToggleFilter,
    options,
  }));

  return section;
}

function createFilterOptionGrid({ filters, groupId, onToggleFilter, options }) {
  const optionGrid = document.createElement("div");
  optionGrid.className = "filter-group-options";

  options.forEach((option) => {
    optionGrid.appendChild(
      createFilterOptionButton({
        filterId: option.id,
        filters,
        groupId,
        label: option.label,
        onToggleFilter,
      }),
    );
  });

  return optionGrid;
}

function createFilterOptionButton({ filterId, filters, groupId, label, onToggleFilter }) {
  const button = document.createElement("button");
  button.className = "filter-option";
  button.type = "button";
  button.dataset.filterGroup = groupId;
  button.dataset.filterValue = filterId;
  button.textContent = label;
  const isActive = Boolean(filters[groupId]?.has(filterId));
  button.classList.toggle("is-active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
  button.addEventListener("click", () => {
    restartAnimationClass(button, "is-toggling", FILTER_OPTION_TOGGLE_DURATION_MS);
    onToggleFilter(groupId, filterId);
  });

  return button;
}

function getBucketSelectionEntries(bucket, filters, filterOptionsByGroup) {
  const entries = [];

  bucket.groups.forEach((group) => {
    const selectedValues = filters[group.id];
    if (!selectedValues || selectedValues.size === 0) {
      return;
    }

    entries.push(...getSortedSelectedOptions(group.id, selectedValues, filterOptionsByGroup));
  });

  return entries;
}

function getSortedSelectedOptions(groupId, selectedValues, filterOptionsByGroup) {
  const optionLabels = filterOptionsByGroup.get(groupId) || new Map();

  return Array.from(selectedValues)
    .sort((left, right) => {
      const leftLabel = optionLabels.get(left) || left;
      const rightLabel = optionLabels.get(right) || right;
      return leftLabel.localeCompare(rightLabel);
    })
    .map((value) => ({
      id: value,
      label: optionLabels.get(value) || value,
    }));
}

function formatFilterGroupCount(group, filters) {
  const selectedCount = filters[group.id]?.size || 0;
  if (selectedCount === 0) {
    return `${group.options.length} options`;
  }

  return `${selectedCount} selected`;
}

function formatFilterBucketStatus(bucket, filters, filterOptionsByGroup) {
  const selectedEntries = getBucketSelectionEntries(bucket, filters, filterOptionsByGroup);
  if (selectedEntries.length === 0) {
    return "none";
  }

  if (selectedEntries.length === 1) {
    return "1 selected";
  }

  if (selectedEntries.length === 2) {
    return `${selectedEntries[0].label} • ${selectedEntries[1].label}`;
  }

  return `${selectedEntries[0].label}, ${selectedEntries[1].label} + ${selectedEntries.length - 2}`;
}

function getBucketSelectionCount(bucket, filters) {
  return bucket.groups.reduce((count, group) => count + (filters[group.id]?.size || 0), 0);
}

export function getActiveBrowseDescriptors({
  filters,
  structuredFilterGroups,
  filterOptionsByGroup,
  filterGroupsById,
  removeFilter,
}) {
  const descriptors = [];

  structuredFilterGroups.forEach((group) => {
    const selectedValues = filters[group.id];
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
            removeFilter(group.id, value);
          },
        });
      });
  });

  return descriptors;
}

export function renderActiveBrowseState({
  activeBrowseState,
  activeBrowseChips,
  activeBrowseClear,
  descriptors,
  onAfterRemove,
}) {
  if (!activeBrowseState || !activeBrowseChips || !activeBrowseClear) {
    return;
  }

  const existingChipNodes = Array.from(activeBrowseChips.querySelectorAll(".active-browse-chip"));
  const stateWasHidden = activeBrowseState.hidden;
  if (descriptors.length > 0 || existingChipNodes.length > 0 || !activeBrowseClear.hidden) {
    activeBrowseState.hidden = false;
  }

  const firstRects = captureRects([
    ...existingChipNodes.map((node) => ({ key: node.dataset.activeBrowseId || "", node })),
    { key: ACTIVE_BROWSE_CLEAR_KEY, node: activeBrowseClear },
  ]);
  const reusableNodes = new Map(
    existingChipNodes
      .map((node) => [node.dataset.activeBrowseId || "", node])
      .filter(([id]) => Boolean(id)),
  );
  const nextChipNodes = descriptors.map((descriptor) => {
    const existingNode = reusableNodes.get(descriptor.id);
    if (!existingNode) {
      const nextNode = createActiveBrowseChip(descriptor, onAfterRemove);
      nextNode.__descriptorId = descriptor.id;
      nextNode.__descriptorRemove = descriptor.remove;
      nextNode.dataset.isNewChip = "true";
      return nextNode;
    }

    reusableNodes.delete(descriptor.id);
    cancelPendingExit(existingNode);
    resetExitingChipPosition(existingNode);
    existingNode.__descriptorId = descriptor.id;
    existingNode.__descriptorRemove = descriptor.remove;
    const label = existingNode.querySelector(".active-browse-chip-label");
    if (label) {
      label.textContent = descriptor.label;
    }
    existingNode.setAttribute("aria-label", `Remove ${descriptor.label}`);
    return existingNode;
  });

  reusableNodes.forEach((node) => {
    scheduleChipExit(node, activeBrowseChips, () => {
      syncActiveBrowseVisibility(activeBrowseState, activeBrowseChips, activeBrowseClear);
    });
  });

  nextChipNodes.forEach((node) => {
    activeBrowseChips.appendChild(node);
  });

  if (descriptors.length > 0) {
    const clearWasHidden = activeBrowseClear.hidden;
    cancelPendingExit(activeBrowseClear);
    activeBrowseClear.hidden = false;
    activeBrowseClear.classList.remove("is-exiting");
    activeBrowseClear.removeAttribute("aria-hidden");
    activeBrowseClear.disabled = false;
    if (clearWasHidden || stateWasHidden) {
      playEnterAnimation(activeBrowseClear);
    }
  } else {
    scheduleClearExit(activeBrowseClear, () => {
      syncActiveBrowseVisibility(activeBrowseState, activeBrowseChips, activeBrowseClear);
    });
  }

  playFlipAnimations(
    [
      ...nextChipNodes
        .filter((node) => node.dataset.isNewChip !== "true")
        .map((node) => ({ key: node.dataset.activeBrowseId || "", node })),
      descriptors.length > 0 ? { key: ACTIVE_BROWSE_CLEAR_KEY, node: activeBrowseClear } : null,
    ].filter(Boolean),
    firstRects,
  );

  nextChipNodes.forEach((node) => {
    if (node.dataset.isNewChip === "true" || stateWasHidden) {
      playEnterAnimation(node);
    }
    delete node.dataset.isNewChip;
  });

  syncActiveBrowseVisibility(activeBrowseState, activeBrowseChips, activeBrowseClear);
}

export function formatResultsSummaryPrefix(descriptors) {
  if (descriptors.length === 0) {
    return "";
  }

  if (descriptors.length <= 2) {
    return `${descriptors.map((descriptor) => descriptor.label).join(" • ")} • `;
  }

  return `Filtered by ${descriptors[0].label}, ${descriptors[1].label} + ${descriptors.length - 2} more • `;
}

export function matchesSelectedFilters(show, filters) {
  return Object.entries(filters).every(([groupId, selectedValues]) => {
    if (selectedValues.size === 0) {
      return true;
    }

    const values = (() => {
      switch (groupId) {
        case "genres":
          return show.genreTokens;
        case "tones":
          return Array.isArray(show.tones) ? show.tones : [];
        case "formats":
          return Array.isArray(show.formats) ? show.formats : [];
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
