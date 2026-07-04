import { syncCommunityCardBadges } from "../../community.js";
import { createShowCard } from "../../render-cards.js";

const RECENTLY_ADDED_LIMIT = 4;

function compareRecentlyAdded(left, right) {
  const leftDate = String(left.createdAt || "");
  const rightDate = String(right.createdAt || "");
  if (rightDate !== leftDate) {
    return rightDate.localeCompare(leftDate);
  }

  return String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")) || left.title.localeCompare(right.title);
}

export function createRecentlyAddedController({
  publishedShows,
  recentlyAddedSection,
  recentlyAddedGrid,
  recentlyAddedEmptyState,
}) {
  const recentlyAddedShows = [...publishedShows].filter((show) => Boolean(show.createdAt)).sort(compareRecentlyAdded).slice(0, RECENTLY_ADDED_LIMIT);
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
