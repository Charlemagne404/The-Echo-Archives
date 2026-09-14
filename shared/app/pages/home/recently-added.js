import { syncCommunityCardBadges } from "../../community.js";
import { archiveRecord } from "../../constants.js";
import { createShowCard } from "../../render-cards.js";
import { bucketDiscoveryPosition, getDiscoveryContentProfile } from "../../discovery-analytics.js";

const RECENTLY_ADDED_LIMIT = 4;

function getSortableDateValue(value) {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareRecentlyAdded(left, right) {
  const leftDate = getSortableDateValue(archiveRecord.getCatalogPublicationDate(left));
  const rightDate = getSortableDateValue(archiveRecord.getCatalogPublicationDate(right));
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
}) {
  const recentlyAddedShows = [...publishedShows]
    .filter((show) => getSortableDateValue(archiveRecord.getCatalogPublicationDate(show)) > Number.NEGATIVE_INFINITY)
    .sort(compareRecentlyAdded)
    .slice(0, RECENTLY_ADDED_LIMIT);
  const hasShows = recentlyAddedShows.length > 0;

  function render() {
    recentlyAddedGrid.textContent = "";
    if (!hasShows) {
      return;
    }

    recentlyAddedShows.forEach((show, index) => {
      recentlyAddedGrid.appendChild(createShowCard(show, {
        discovery: {
          surface: "home_recent_rail",
          resultType: "show_card",
          recommendationSource: "none",
          resultPositionBucket: bucketDiscoveryPosition(index + 1),
          contentProfile: getDiscoveryContentProfile(show.reviewStatus),
        },
      }));
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
