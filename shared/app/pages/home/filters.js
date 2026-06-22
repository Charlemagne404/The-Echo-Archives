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

export function renderFilterOptions({ filterOptionGrid, structuredFilterGroups, onToggleFilter }) {
  filterOptionGrid.textContent = "";

  structuredFilterGroups.forEach((group, index) => {
    const section = document.createElement("section");
    section.className = "filter-group";
    section.style.setProperty("--filter-group-stagger-index", String(index + 1));

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
        restartAnimationClass(button, "is-toggling", FILTER_OPTION_TOGGLE_DURATION_MS);
        onToggleFilter(group.id, option.id);
      });
      optionGrid.appendChild(button);
    });

    heading.append(title, count);
    section.append(heading, optionGrid);
    filterOptionGrid.appendChild(section);
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
  filters,
  query,
  selectedCollectionId,
  sortMode,
}) {
  const selectedCount = getActiveFilterCount(filters);

  quickFiltersRoot.querySelectorAll(".quick-filter").forEach((button) => {
    const filter = button.dataset.chipFilter || "";
    const isActive =
      (filter === "all" && selectedCount === 0 && !query && !selectedCollectionId && sortMode === "default") ||
      (filter !== "all" && filters.tags.has(filter));

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  browseModesRoot.querySelectorAll(".browse-mode-button").forEach((button) => {
    const mode = button.dataset.browseMode || "default";
    const isActive = sortMode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  filterOptionGrid.querySelectorAll(".filter-option").forEach((button) => {
    const groupId = button.dataset.filterGroup || "";
    const value = button.dataset.filterValue || "";
    const isActive = Boolean(filters[groupId]?.has(value));
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
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
