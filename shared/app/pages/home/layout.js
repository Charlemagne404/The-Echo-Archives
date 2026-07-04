import {
  captureGridShellRects,
  freezeGridShellPosition,
  getGridMotionProfile,
  playGridEnterAnimation,
  playGridFlipAnimation,
  resetGridShellMotion,
  scheduleGridExit,
  setGridMotionMetadata,
} from "./grid-motion.js";

export function getHomeGridLayoutBucket() {
  return window.matchMedia("(max-width: 1180px)").matches ? "compact" : "wide";
}

export function getHomeGridColumnCount(gridLayoutBucket) {
  return gridLayoutBucket === "compact" ? 2 : 6;
}

function dedupeArchiveGridNodes(nodes) {
  const seenNodes = new Set();
  return nodes.filter((node) => {
    if (!(node instanceof HTMLElement) || seenNodes.has(node)) {
      return false;
    }

    seenNodes.add(node);
    return true;
  });
}

export function sortVisibleShows({ visibleShows, selectedCollection, sortMode }) {
  const sortedShows = [...visibleShows];

  if (sortMode === "recently-updated") {
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

function getOrderedArchiveGridNodes({ collectionsSection, visibleShows, archiveCardShellsById, gridLayoutBucket }) {
  const orderedNodes = [];
  const collectionInsertIndex = collectionsSection.hidden
    ? -1
    : Math.min(visibleShows.length, getHomeGridColumnCount(gridLayoutBucket) * 2);

  visibleShows.forEach((show, index) => {
    if (index === collectionInsertIndex) {
      orderedNodes.push(collectionsSection);
    }

    const shell = archiveCardShellsById.get(show.id);
    if (shell) {
      orderedNodes.push(shell);
    }
  });

  if (!collectionsSection.hidden && collectionInsertIndex >= visibleShows.length) {
    orderedNodes.push(collectionsSection);
  }

  return dedupeArchiveGridNodes(orderedNodes);
}

function getArchiveGridShells(archiveGrid) {
  return Array.from(archiveGrid.children).filter((node) => node instanceof HTMLElement && node.classList.contains("podcast-card-shell"));
}

function hasGridShellMotionInFlight(shell) {
  return (
    shell instanceof HTMLElement &&
    Boolean(
      shell.__gridExitTimer ||
        shell.__gridExitAnimation ||
        shell.__gridEnterAnimation ||
        shell.__gridFlipAnimation ||
        shell.classList.contains("is-grid-exiting") ||
        shell.classList.contains("is-grid-entering") ||
        shell.classList.contains("is-grid-flipping"),
    )
  );
}

function hasDuplicateGridShellIds(shells) {
  const ids = shells
    .map((shell) => shell.dataset.podcastId || "")
    .filter(Boolean);
  return new Set(ids).size !== ids.length;
}

function hasUnexpectedArchiveGridChildren(archiveGrid, collectionsSection) {
  return Array.from(archiveGrid.children).some((node) => {
    if (!(node instanceof HTMLElement) || node === collectionsSection) {
      return false;
    }

    return !node.classList.contains("podcast-card-shell");
  });
}

function hasGridShellStateDrift(shell) {
  if (!(shell instanceof HTMLElement)) {
    return false;
  }

  const position = window.getComputedStyle(shell).position;
  return !shell.dataset.podcastId || (position === "absolute" && !shell.classList.contains("is-grid-exiting"));
}

function shouldStabilizeArchiveGrid({
  archiveGrid,
  collectionsSection,
  currentShells,
  nextShells,
}) {
  return (
    currentShells.some((shell) => hasGridShellMotionInFlight(shell) || hasGridShellStateDrift(shell)) ||
    hasDuplicateGridShellIds(currentShells) ||
    hasDuplicateGridShellIds(nextShells) ||
    hasUnexpectedArchiveGridChildren(archiveGrid, collectionsSection)
  );
}

function syncArchiveGridInstantly({ archiveGrid, collectionsSection, orderedNodes, nextShells }) {
  const nextNodeSet = new Set(orderedNodes.filter((node) => node instanceof HTMLElement));
  const nextShellSet = new Set(nextShells);
  nextShells.forEach((shell) => {
    resetGridShellMotion(shell);
  });
  orderedNodes.forEach((node) => {
    archiveGrid.appendChild(node);
  });

  Array.from(archiveGrid.children).forEach((node) => {
    if (!(node instanceof HTMLElement) || nextNodeSet.has(node)) {
      return;
    }

    if (node.classList.contains("podcast-card-shell")) {
      resetGridShellMotion(node);
      if (!nextShellSet.has(node)) {
        node.remove();
      }
      return;
    }

    node.remove();
  });

  if (collectionsSection.hidden && collectionsSection.parentElement === archiveGrid) {
    collectionsSection.remove();
  }
}

export function patchArchiveGrid({
  archiveGrid,
  collectionsSection,
  visibleShows,
  archiveCardShellsById,
  gridLayoutBucket,
  changeReason,
}) {
  const orderedNodes = getOrderedArchiveGridNodes({
    collectionsSection,
    visibleShows,
    archiveCardShellsById,
    gridLayoutBucket,
  });
  const nextShells = orderedNodes.filter((node) => node instanceof HTMLElement && node.classList.contains("podcast-card-shell"));
  const currentShells = getArchiveGridShells(archiveGrid);
  const motionProfile = getGridMotionProfile(changeReason);
  const shouldBypassMotion =
    !motionProfile ||
    shouldStabilizeArchiveGrid({
      archiveGrid,
      collectionsSection,
      currentShells,
      nextShells,
    });

  setGridMotionMetadata(archiveGrid, changeReason, shouldBypassMotion ? null : motionProfile);
  if (shouldBypassMotion) {
    syncArchiveGridInstantly({
      archiveGrid,
      collectionsSection,
      orderedNodes,
      nextShells,
    });
    return;
  }

  const nextShellSet = new Set(nextShells);
  const firstRects = captureGridShellRects(currentShells);
  const exitingShells = currentShells.filter((shell) => !nextShellSet.has(shell));
  const stagedExits = [];

  nextShells.forEach((shell) => {
    resetGridShellMotion(shell);
  });

  exitingShells.forEach((shell) => {
    if (shell.classList.contains("is-grid-exiting")) {
      return;
    }

    resetGridShellMotion(shell);
    freezeGridShellPosition(shell, archiveGrid);
    stagedExits.push(shell);
  });

  orderedNodes.forEach((node) => {
    archiveGrid.appendChild(node);
  });
  if (collectionsSection.hidden && collectionsSection.parentElement === archiveGrid) {
    collectionsSection.remove();
  }
  exitingShells.forEach((shell) => {
    archiveGrid.appendChild(shell);
  });

  nextShells.forEach((shell) => {
    const firstRect = firstRects.get(shell.dataset.podcastId || "");
    if (firstRect) {
      playGridFlipAnimation(shell, firstRect, motionProfile.flipDuration);
      return;
    }

    playGridEnterAnimation(shell, motionProfile.enterDuration);
  });
  stagedExits.forEach((shell) => {
    scheduleGridExit(shell, motionProfile.exitDuration);
  });
}
