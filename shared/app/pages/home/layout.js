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
import { archiveRecord } from "../../constants.js";

export const HOME_SORT_OPTIONS = Object.freeze([
  { id: "popular", label: "Popular" },
  { id: "recently-added", label: "Recently added" },
  { id: "recently-updated", label: "Recently updated" },
  { id: "archive-rating", label: "Highest Archive rating" },
  { id: "most-rated", label: "Most listener ratings" },
  { id: "title", label: "A–Z" },
  { id: "archive-order", label: "Archive order" },
]);

export const HOME_SORT_MODES = new Set(HOME_SORT_OPTIONS.map(({ id }) => id));

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

function compareShowsByTitle(left, right) {
  return getSortableTitle(left).localeCompare(getSortableTitle(right), "en", { sensitivity: "base" }) ||
    String(left?.id || "").localeCompare(String(right?.id || ""));
}

function getFallbackPopularityScore(show, now = new Date()) {
  const rating = Number(show?.finalRating);
  const ratingPoints = Number.isFinite(rating) && rating >= 0 && rating <= 10 ? 1.5 * rating / 10 : 0;
  const createdAt = Date.parse(String(show?.createdAt || ""));
  const nowAt = now instanceof Date ? now.getTime() : Date.parse(String(now || ""));
  const ageDays = Number.isFinite(createdAt) && Number.isFinite(nowAt)
    ? Math.max(0, (nowAt - createdAt) / 86_400_000)
    : null;
  const freshnessPoints = ageDays === null ? 0 : 1.2 * Math.pow(0.5, ageDays / 90);
  return ratingPoints + freshnessPoints;
}

function getPopularityScore(popularityScores, show, now) {
  const value = popularityScores?.[show?.id];
  return typeof value === "number" && Number.isFinite(value) ? value : getFallbackPopularityScore(show, now);
}

function getCommunityRatingCount(communitySummaries, showId) {
  const count = Number(communitySummaries?.[showId]?.ratingCount);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function getCommunityAverageRating(communitySummaries, showId) {
  const value = communitySummaries?.[showId]?.averageRating;
  if (value === null || value === undefined || value === "") return null;
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 0 && rating <= 10 ? rating : null;
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

export function sortVisibleShows({
  visibleShows,
  selectedCollection,
  sortMode,
  sortModeExplicit = false,
  popularityScores = null,
  communitySummaries = null,
  archiveOrderById = null,
  now = new Date(),
}) {
  const sortedShows = [...visibleShows];

  if (selectedCollection && !sortModeExplicit) {
    const collectionOrder = new Map(selectedCollection.showIds.map((id, index) => [id, index]));
    return sortedShows.sort((left, right) => {
      const leftOrder = collectionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = collectionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || compareShowsByTitle(left, right);
    });
  }

  if (sortMode === "popular") {
    return sortedShows.sort((left, right) => {
      const difference = getPopularityScore(popularityScores, right, now) - getPopularityScore(popularityScores, left, now);
      return difference || compareShowsByTitle(left, right);
    });
  }

  if (sortMode === "recently-added") {
    return sortedShows.sort((left, right) => {
      const leftValue = getSortableDateValue(archiveRecord.getCatalogPublicationDate(left));
      const rightValue = getSortableDateValue(archiveRecord.getCatalogPublicationDate(right));
      if (rightValue !== leftValue) {
        return rightValue - leftValue;
      }

      return compareShowsByTitle(left, right);
    });
  }

  if (sortMode === "recently-updated") {
    return sortedShows.sort((left, right) => {
      const leftValue = getSortableDateValue(left.updatedAt);
      const rightValue = getSortableDateValue(right.updatedAt);
      if (rightValue !== leftValue) {
        return rightValue - leftValue;
      }

      return compareShowsByTitle(left, right);
    });
  }

  if (sortMode === "archive-rating") {
    return sortedShows.sort((left, right) => {
      const leftRating = Number.isFinite(left?.finalRating) ? left.finalRating : Number.NEGATIVE_INFINITY;
      const rightRating = Number.isFinite(right?.finalRating) ? right.finalRating : Number.NEGATIVE_INFINITY;
      if (rightRating !== leftRating) {
        return rightRating > leftRating ? 1 : -1;
      }

      return compareShowsByTitle(left, right);
    });
  }

  if (sortMode === "most-rated") {
    return sortedShows.sort((left, right) => {
      const leftCount = getCommunityRatingCount(communitySummaries, left?.id);
      const rightCount = getCommunityRatingCount(communitySummaries, right?.id);
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }

      const leftAverage = leftCount > 0 ? getCommunityAverageRating(communitySummaries, left?.id) : null;
      const rightAverage = rightCount > 0 ? getCommunityAverageRating(communitySummaries, right?.id) : null;
      if (leftAverage !== null && rightAverage !== null && rightAverage !== leftAverage) {
        return rightAverage - leftAverage;
      }

      return compareShowsByTitle(left, right);
    });
  }

  if (sortMode === "title") {
    return sortedShows.sort(compareShowsByTitle);
  }

  if (sortMode === "archive-order" || sortMode === "default") {
    if (!archiveOrderById) return sortedShows;
    return sortedShows.sort((left, right) => {
      const leftOrder = archiveOrderById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = archiveOrderById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || compareShowsByTitle(left, right);
    });
  }

  return sortedShows;
}

export function createSearchSortApplier({ state, archiveOrderById }) {
  return (presentation, selectedCollection) => {
    if (!state.sortModeExplicit) return presentation;
    const sortedShows = sortVisibleShows({
      visibleShows: presentation.shows,
      selectedCollection,
      sortMode: state.sortMode,
      sortModeExplicit: true,
      popularityScores: state.popularityScores,
      communitySummaries: state.communitySummaries,
      archiveOrderById,
    });
    return {
      ...presentation,
      shows: sortedShows,
      publicPositionById: new Map(sortedShows.map((show, index) => [show.id, index + 1])),
    };
  };
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
