export function getHomeGridLayoutBucket() {
  return window.matchMedia("(max-width: 1180px)").matches ? "compact" : "wide";
}

export function getHomeGridColumnCount(gridLayoutBucket) {
  return gridLayoutBucket === "compact" ? 2 : 6;
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

export function patchArchiveGrid({ archiveGrid, collectionsSection, visibleShows, archiveCardShellsById, gridLayoutBucket }) {
  const fragment = document.createDocumentFragment();
  const collectionInsertIndex = collectionsSection.hidden
    ? -1
    : Math.min(visibleShows.length, getHomeGridColumnCount(gridLayoutBucket) * 2);

  visibleShows.forEach((show, index) => {
    if (index === collectionInsertIndex) {
      fragment.appendChild(collectionsSection);
    }

    const shell = archiveCardShellsById.get(show.id);
    if (shell) {
      fragment.appendChild(shell);
    }
  });

  if (!collectionsSection.hidden && collectionInsertIndex >= visibleShows.length) {
    fragment.appendChild(collectionsSection);
  }

  archiveGrid.replaceChildren(fragment);
}
