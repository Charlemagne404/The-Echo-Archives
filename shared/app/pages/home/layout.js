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

function getSortableDateValue(value) {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getSortableTitle(show) {
  return String(show?.title || "Untitled show");
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
      const leftValue = getSortableDateValue(left.updatedAt);
      const rightValue = getSortableDateValue(right.updatedAt);
      if (rightValue !== leftValue) {
        return rightValue - leftValue;
      }

      return getSortableTitle(left).localeCompare(getSortableTitle(right));
    });
  }

  if (!selectedCollection) {
    return sortedShows;
  }

  const collectionOrder = new Map(selectedCollection.showIds.map((id, index) => [id, index]));
  return sortedShows.sort((left, right) => {
    const leftOrder = collectionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = collectionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || getSortableTitle(left).localeCompare(getSortableTitle(right));
  });
}

function getOrderedArchiveGridNodes({
  collectionsSection,
  favoriteRoutesSection,
  visibleShows,
  archiveCardShellsById,
  gridLayoutBucket,
}) {
  const orderedNodes = [];
  const gridRowSize = getHomeGridColumnCount(gridLayoutBucket);
  const collectionInsertIndex = collectionsSection.hidden
    ? -1
    : Math.min(visibleShows.length, gridRowSize * 2);
  const favoriteRoutesInsertIndex = favoriteRoutesSection.hidden
    ? -1
    : Math.min(visibleShows.length, (collectionInsertIndex >= 0 ? collectionInsertIndex : 0) + gridRowSize * 2);

  visibleShows.forEach((show, index) => {
    if (index === collectionInsertIndex) {
      orderedNodes.push(collectionsSection);
    }
    if (index === favoriteRoutesInsertIndex) {
      orderedNodes.push(favoriteRoutesSection);
    }

    const shell = archiveCardShellsById.get(show.id);
    if (shell) {
      orderedNodes.push(shell);
    }
  });

  if (!collectionsSection.hidden && collectionInsertIndex >= visibleShows.length) {
    orderedNodes.push(collectionsSection);
  }
  if (!favoriteRoutesSection.hidden && favoriteRoutesInsertIndex >= visibleShows.length) {
    orderedNodes.push(favoriteRoutesSection);
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

function hasUnexpectedArchiveGridChildren(archiveGrid, collectionsSection, favoriteRoutesSection) {
  return Array.from(archiveGrid.children).some((node) => {
    if (!(node instanceof HTMLElement) || node === collectionsSection || node === favoriteRoutesSection) {
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
  favoriteRoutesSection,
  currentShells,
  nextShells,
}) {
  return (
    currentShells.some((shell) => hasGridShellMotionInFlight(shell) || hasGridShellStateDrift(shell)) ||
    hasDuplicateGridShellIds(currentShells) ||
    hasDuplicateGridShellIds(nextShells) ||
    hasUnexpectedArchiveGridChildren(archiveGrid, collectionsSection, favoriteRoutesSection)
  );
}

function syncArchiveGridInstantly({ archiveGrid, orderedNodes, nextShells }) {
  const currentNodes = Array.from(archiveGrid.children);
  const nextNodes = orderedNodes.filter((node) => node instanceof HTMLElement);
  const isAlreadyOrdered =
    currentNodes.length === nextNodes.length && currentNodes.every((node, index) => node === nextNodes[index]);

  if (isAlreadyOrdered) {
    return;
  }

  const shellsToReset = new Set([
    ...currentNodes.filter((node) => node instanceof HTMLElement && node.classList.contains("podcast-card-shell")),
    ...nextShells,
  ]);
  shellsToReset.forEach((shell) => {
    resetGridShellMotion(shell);
  });

  // Reconcile the whole grid in one DOM operation. The old per-node append /
  // remove loop magnified layout and mutation work for a large catalogue.
  archiveGrid.replaceChildren(...nextNodes);
}

export function patchArchiveGrid({
  archiveGrid,
  collectionsSection,
  favoriteRoutesSection,
  visibleShows,
  archiveCardShellsById,
  gridLayoutBucket,
  changeReason,
}) {
  const orderedNodes = getOrderedArchiveGridNodes({
    collectionsSection,
    favoriteRoutesSection,
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
      favoriteRoutesSection,
      currentShells,
      nextShells,
    });

  setGridMotionMetadata(archiveGrid, changeReason, shouldBypassMotion ? null : motionProfile);
  if (shouldBypassMotion) {
    syncArchiveGridInstantly({
      archiveGrid,
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
  [collectionsSection, favoriteRoutesSection].forEach((section) => {
    if (section.hidden && section.parentElement === archiveGrid) {
      section.remove();
    }
  });
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
