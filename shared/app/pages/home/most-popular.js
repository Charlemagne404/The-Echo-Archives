import { HOME_MOST_POPULAR_IDS } from "../../constants.js";
import { loadCommunitySummaries, syncCommunityCardBadges } from "../../community.js";
import { createMostPopularCard } from "../../render-cards.js";

const HOME_MOST_POPULAR_LIMIT = 4;

export function createMostPopularController({
  showMap,
  publishedShows,
  popularSection,
  popularGrid,
  state,
  onVisibilityChange = () => {},
}) {
  const fallbackMostPopularShows = HOME_MOST_POPULAR_IDS
    .map((showId) => showMap.get(showId))
    .filter((show) => show && show.status === "published")
    .slice(0, HOME_MOST_POPULAR_LIMIT);
  let mostPopularShows = fallbackMostPopularShows;
  let mostPopularResolutionToken = 0;

  function renderMostPopularSection() {
    popularGrid.textContent = "";

    if (mostPopularShows.length === 0) {
      if (onVisibilityChange(false, popularSection) !== true) {
        popularSection.hidden = true;
      }
      return;
    }

    mostPopularShows.forEach((show) => {
      popularGrid.appendChild(createMostPopularCard(show));
    });
    syncMostPopularSectionVisibility();
    void syncCommunityCardBadges(popularGrid, mostPopularShows);
  }

  function shouldShowMostPopularSection() {
    return (
      mostPopularShows.length > 0 &&
      !state.query &&
      getActiveFilterCount(state.filters) === 0 &&
      !state.selectedCollectionId &&
      state.sortMode === "default"
    );
  }

  function syncMostPopularSectionVisibility() {
    const shouldShow = shouldShowMostPopularSection();
    if (onVisibilityChange(shouldShow, popularSection) !== true) {
      popularSection.hidden = !shouldShow;
    }
  }

  function compareMostPopularShows(left, right) {
    return (
      right.summary.ratingCount - left.summary.ratingCount ||
      (right.summary.averageRating || 0) - (left.summary.averageRating || 0) ||
      left.show.title.localeCompare(right.show.title)
    );
  }

  function appendUniqueMostPopularShows(target, seenIds, candidates) {
    candidates.forEach((show) => {
      if (!show || seenIds.has(show.id) || show.status !== "published" || target.length >= HOME_MOST_POPULAR_LIMIT) {
        return;
      }

      seenIds.add(show.id);
      target.push(show);
    });
  }

  function buildMostPopularShows(communitySummaries) {
    const rankedByCommunity = publishedShows
      .map((show) => ({
        show,
        summary: communitySummaries[show.id] || null,
      }))
      .filter(({ summary }) => summary && summary.ratingCount > 0 && summary.averageRating !== null)
      .sort(compareMostPopularShows)
      .map(({ show }) => show);

    const rankedByPopularityScore = [...publishedShows]
      .filter((show) => Number.isFinite(show.popularity?.score))
      .sort((left, right) => {
        const leftScore = left.popularity?.score || 0;
        const rightScore = right.popularity?.score || 0;
        return rightScore - leftScore || left.title.localeCompare(right.title);
      });

    const resolved = [];
    const seenIds = new Set();
    appendUniqueMostPopularShows(resolved, seenIds, rankedByCommunity);
    appendUniqueMostPopularShows(resolved, seenIds, rankedByPopularityScore);
    appendUniqueMostPopularShows(resolved, seenIds, fallbackMostPopularShows);
    return resolved.slice(0, HOME_MOST_POPULAR_LIMIT);
  }

  function hasSameShowOrder(left, right) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((show, index) => show?.id === right[index]?.id);
  }

  async function resolveMostPopularShows() {
    if (publishedShows.length === 0) {
      return;
    }

    const requestToken = ++mostPopularResolutionToken;

    try {
      const communitySummaries = await loadCommunitySummaries(publishedShows.map((show) => show.id));
      if (requestToken !== mostPopularResolutionToken) {
        return;
      }

      const nextMostPopularShows = buildMostPopularShows(communitySummaries);
      mostPopularShows = nextMostPopularShows;

      if (hasSameShowOrder(nextMostPopularShows, fallbackMostPopularShows)) {
        void syncCommunityCardBadges(popularGrid, mostPopularShows);
        syncMostPopularSectionVisibility();
        return;
      }

      renderMostPopularSection();
    } catch (_error) {
      if (requestToken !== mostPopularResolutionToken) {
        return;
      }

      mostPopularShows = fallbackMostPopularShows;
      syncMostPopularSectionVisibility();
    }
  }

  return {
    renderMostPopularSection,
    resolveMostPopularShows,
    shouldShowMostPopularSection,
    syncMostPopularSectionVisibility,
  };
}

function getActiveFilterCount(filters) {
  return Object.values(filters).reduce((count, values) => count + values.size, 0);
}
