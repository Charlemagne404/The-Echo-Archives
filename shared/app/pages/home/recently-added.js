import { syncCommunityCardBadges } from "../../community.js";
import { createShowCard } from "../../render-cards.js";

const RECENTLY_ADDED_LIMIT = 4;

function getSortableDateValue(value) {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareRecentlyAdded(left, right) {
  const leftDate = getSortableDateValue(left.createdAt);
  const rightDate = getSortableDateValue(right.createdAt);
  if (rightDate !== leftDate) {
    return rightDate - leftDate;
  }

  return (
    getSortableDateValue(right.updatedAt) - getSortableDateValue(left.updatedAt) ||
    String(left.title || "Untitled show").localeCompare(String(right.title || "Untitled show"))
  );
}

export function createRecentlyAddedController({
  publishedShows,
  recentlyAddedSection,
  recentlyAddedGrid,
  recentlyAddedEmptyState,
}) {
  const recentlyAddedShows = [...publishedShows]
    .filter((show) => getSortableDateValue(show.createdAt) > Number.NEGATIVE_INFINITY)
    .sort(compareRecentlyAdded)
    .slice(0, RECENTLY_ADDED_LIMIT);
  const hasShows = recentlyAddedShows.length > 0;

  function render() {
    recentlyAddedGrid.textContent = "";
    recentlyAddedEmptyState.hidden = true;

    if (!hasShows) {
      return;
    }

    recentlyAddedShows.forEach((show) => {
      recentlyAddedGrid.appendChild(createShowCard(show));
    });
    void syncCommunityCardBadges(recentlyAddedGrid, recentlyAddedShows);
  }

  function setVisible(isVisible) {
    recentlyAddedSection.hidden = !isVisible || !hasShows;
  }

  return {
    hasShows,
    render,
    setVisible,
    shows: recentlyAddedShows,
  };
}
