import {
  ACTIVE_BROWSE_CLEAR_KEY,
  cancelPendingExit,
  captureRects,
  createActiveBrowseChip,
  playEnterAnimation,
  playFlipAnimations,
  resetExitingChipPosition,
  scheduleChipExit,
  scheduleClearExit,
  syncActiveBrowseVisibility,
} from "./filter-motion.js";

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
