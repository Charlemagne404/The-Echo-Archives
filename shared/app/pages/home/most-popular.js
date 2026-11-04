import { HOME_MOST_POPULAR_IDS } from "../../constants.js";
import { loadPopularityScores } from "../../data.js";
import { loadCommunitySummaries, syncCommunityCardBadges } from "../../community.js";
import { createMostPopularCard } from "../../render-cards.js";

const HOME_MOST_POPULAR_LIMIT = 4;
const COMMUNITY_SUMMARY_CANDIDATE_LIMIT = 100;

export function createMostPopularController({
  showMap,
  publishedShows,
  popularSection,
  popularTitle = popularSection.querySelector("#mostPopularTitle"),
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

  function setMostPopularTitle(value) {
    if (popularTitle && popularTitle.textContent !== value) {
      popularTitle.textContent = value;
    }
  }

  function hasRenderedShowOrder() {
    const renderedIds = Array.from(popularGrid.querySelectorAll(":scope > [data-podcast-id]"))
      .map((card) => card.dataset.podcastId || "");
    return (
      renderedIds.length === mostPopularShows.length &&
      renderedIds.every((showId, index) => showId === mostPopularShows[index]?.id)
    );
  }

  function renderMostPopularSection() {
    if (mostPopularShows.length === 0) {
      popularGrid.textContent = "";
      if (onVisibilityChange(false, popularSection) !== true) {
        popularSection.hidden = true;
      }
      return;
    }

    if (!hasRenderedShowOrder()) {
      popularGrid.textContent = "";
      mostPopularShows.forEach((show, index) => {
        popularGrid.appendChild(
          createMostPopularCard(show, {
            resultPositionBucket: index === 0 ? "1" : index < 4 ? "2-4" : "5-9",
          }),
        );
      });
    }
    syncMostPopularSectionVisibility();
    void syncCommunityCardBadges(popularGrid, mostPopularShows);
  }

  function shouldShowMostPopularSection() {
    return (
      mostPopularShows.length > 0 &&
      !state.query &&
      getActiveFilterCount(state.filters) === 0 &&
      !state.selectedCollectionId &&
      state.sortMode === "popular"
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
      String(left.show.title || "Untitled show").localeCompare(String(right.show.title || "Untitled show"))
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

  function buildMostPopularResolution(communitySummaries, popularityScores) {
    const rankedByCommunity = publishedShows
      .map((show) => ({
        show,
        summary: communitySummaries[show.id] || null,
      }))
      .filter(({ summary }) => summary && summary.ratingCount > 0 && summary.averageRating !== null)
      .sort(compareMostPopularShows)
      .map(({ show }) => show);

    const rankedByPopularityScore = [...publishedShows]
      .map((show) => ({
        show,
        score: popularityScores?.[show.id],
      }))
      .filter(({ score }) => typeof score === "number" && Number.isFinite(score))
      .sort((left, right) => right.score - left.score ||
        String(left.show.title || "Untitled show").localeCompare(String(right.show.title || "Untitled show")) ||
        String(left.show.id || "").localeCompare(String(right.show.id || "")))
      .map(({ show }) => show);

    const rankedByAuthoredPopularity = [...publishedShows]
      .filter((show) => typeof show.popularity?.score === "number" && Number.isFinite(show.popularity.score))
      .sort((left, right) => right.popularity.score - left.popularity.score ||
        String(left.title || "Untitled show").localeCompare(String(right.title || "Untitled show")) ||
        String(left.id || "").localeCompare(String(right.id || "")));

    const popularityEvidenceIds = new Set([
      ...rankedByCommunity.map((show) => show.id),
      ...publishedShows
        .filter((show) => typeof popularityScores?.[show.id] === "number" && Number.isFinite(popularityScores[show.id]) && popularityScores[show.id] > 0)
        .map((show) => show.id),
      ...publishedShows
        .filter((show) => typeof show.popularity?.score === "number" && Number.isFinite(show.popularity.score) && show.popularity.score > 0)
        .map((show) => show.id),
    ]);

    const resolved = [];
    const seenIds = new Set();
    appendUniqueMostPopularShows(resolved, seenIds, rankedByPopularityScore);
    appendUniqueMostPopularShows(resolved, seenIds, rankedByCommunity);
    appendUniqueMostPopularShows(resolved, seenIds, rankedByAuthoredPopularity);
    appendUniqueMostPopularShows(resolved, seenIds, fallbackMostPopularShows);
    const shows = resolved.slice(0, HOME_MOST_POPULAR_LIMIT);
    return {
      shows,
      title: shows.length > 0 && shows.every((show) => popularityEvidenceIds.has(show.id))
        ? "Popular in the archive"
        : "Archive picks",
    };
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

    let popularityScores = {};
    try {
      popularityScores = await loadPopularityScores();
    } catch (_error) {
      // Use the bounded community summary fallback if the ranking service is unavailable.
    }
    if (requestToken !== mostPopularResolutionToken) {
      return;
    }

    const scoredShowCount = publishedShows.reduce((count, show) => {
      const score = popularityScores?.[show.id];
      return count + (typeof score === "number" && Number.isFinite(score) ? 1 : 0);
    }, 0);
    let communitySummaries = {};
    if (scoredShowCount < HOME_MOST_POPULAR_LIMIT) {
      try {
        const communitySummaryCandidates = publishedShows
          .slice(0, COMMUNITY_SUMMARY_CANDIDATE_LIMIT)
          .map((show) => show.id);
        communitySummaries = await loadCommunitySummaries(communitySummaryCandidates);
      } catch (_error) {
        // Keep the authored archive picks if neither ranking source is available.
      }
    }
    if (requestToken !== mostPopularResolutionToken) {
      return;
    }

    try {
      const resolution = buildMostPopularResolution(communitySummaries, popularityScores);
      const nextMostPopularShows = resolution.shows;
      mostPopularShows = nextMostPopularShows;
      setMostPopularTitle(resolution.title);

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
      setMostPopularTitle("Archive picks");
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
