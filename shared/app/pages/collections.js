import { DEFAULT_SOCIAL_IMAGE, archiveSearch } from "../constants.js";
import { createDebouncedHistoryCommit, createDiscoveryHistoryController } from "../discovery-history.js";
import { buildShowMap, getCollectionShows, getPublishedShows, loadCollections, loadSearchIndex } from "../data.js";
import { createCollectionDirectoryCard, createCollectionFeatureCard, getCollectionAnchorShow } from "../render-collections.js";
import { renderRouteErrorSurface } from "../route-error.js";
import { createScrollRestoration } from "../scroll-restoration.js";
import { buildCollectionsDirectoryStructuredData } from "../structured-data.js";
import { formatDate, setTextContent, updateDocumentMetadata } from "../utils.js";
import { buildIntentCounts, buildIntentFilters, createStickyMoodBarController, mountMoodChips, syncMoodChipState } from "./collections-intents.js";
import { getCollectionsGridMotionProfile, syncCollectionGrid } from "./collections-grid-motion.js";
import { prefersReducedMotion, syncCollectionsSummary, syncCollectionsSurfaceVisibility } from "./collections-motion.js";
import { sortCollections } from "./collections-sort.js";
import {
  buildCollectionsUrl,
  parseCollectionsUrlState,
  syncCollectionsUrlState,
} from "./collections-url-state.js";
import {
  bucketDiscoveryClearedFilterCount,
  bucketDiscoveryFilterCount,
  bucketDiscoveryResultCount,
  trackDiscoveryEvent,
} from "../discovery-analytics.js";

const SIMILARITY_COLLECTIONS_PAGE_SIZE = 5;
const SIMILARITY_COLLECTIONS_QUERY = "shows like";

function getElements() {
  return {
    heroSection: document.getElementById("collectionsHero"),
    moodChips: document.getElementById("collectionsMoodChips"),
    stickyMoodBar: document.getElementById("collectionsStickyMoodBar"),
    stickyMoodChips: document.getElementById("collectionsStickyMoodChips"),
    similarityGrid: document.getElementById("collectionsSimilarityGrid"),
    similarityActions: document.getElementById("collectionsSimilarityActions"),
    similarityMore: document.getElementById("collectionsSimilarityMore"),
    featuredGrid: document.getElementById("collectionsFeaturedGrid"),
    directoryRoot: document.getElementById("collectionsDirectory"),
    searchInput: document.getElementById("collectionsSearch"),
    sortSelect: document.getElementById("collectionsSort"),
    emptyState: document.getElementById("collectionsEmptyState"),
    clearSearch: document.getElementById("collectionsClearSearch"),
    similaritySummary: document.getElementById("collectionsSimilaritySummary"),
    featuredSummary: document.getElementById("collectionsFeaturedSummary"),
    directorySummary: document.getElementById("collectionsDirectorySummary"),
    startWithMood: document.getElementById("startWithMood"),
    browseAll: document.getElementById("browseAllCollections"),
    similarityBrowseAll: document.getElementById("collectionsSimilarityBrowseAll"),
    moodPanel: document.getElementById("collectionsMoodPanel"),
    directorySection: document.getElementById("collectionsDirectorySection"),
  };
}

function createCollectionsSkeletonCard() {
  const shell = document.createElement("article");
  shell.className = "archive-skeleton-card collection-skeleton-card";
  shell.setAttribute("aria-hidden", "true");
  shell.innerHTML = `
    <div class="archive-skeleton-block archive-skeleton-cover"></div>
    <div class="archive-skeleton-copy">
      <span class="archive-skeleton-block archive-skeleton-title"></span>
      <span class="archive-skeleton-block archive-skeleton-line"></span>
      <span class="archive-skeleton-block archive-skeleton-line archive-skeleton-line-short"></span>
    </div>
  `;
  return shell;
}

function renderCollectionsLoadingState(elements) {
  [elements.similarityGrid, elements.featuredGrid].forEach((grid) => {
    grid.textContent = "";
    for (let index = 0; index < 3; index += 1) {
      grid.appendChild(createCollectionsSkeletonCard());
    }
  });
  if (elements.directoryRoot.dataset.collectionsPrerendered !== "true") {
    elements.directoryRoot.textContent = "";
    for (let index = 0; index < 6; index += 1) {
      elements.directoryRoot.appendChild(createCollectionsSkeletonCard());
    }
  }
}

function getCollectionSearchText(collection, shows) {
  const collectionShows = Array.isArray(shows) ? shows : [];
  return [
    collection.title,
    collection.description,
    collection.label,
    collection.commitment,
    collection.kind,
    ...(collection.intentTags || []),
    ...collectionShows.flatMap((show) => [show.title, ...(show.genres || []), ...(show.tones || []), ...(show.tags || [])]),
  ]
    .join(" ")
    .toLowerCase();
}

function collectionMatchesIntent(collection, intent) {
  return !intent || (collection.intentTags || []).includes(intent);
}

function collectionMatchesQuery(collection, shows, query) {
  return !query || getCollectionSearchText(collection, shows).includes(query.toLowerCase());
}

function focusMoodChip(moodChips) {
  const activeChip =
    moodChips?.querySelector('.collections-mood-chip[aria-pressed="true"]') ||
    moodChips?.querySelector(".collections-mood-chip");

  if (!(activeChip instanceof HTMLButtonElement)) {
    return;
  }

  activeChip.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "nearest",
    inline: "center",
  });
  activeChip.focus({ preventScroll: true });
}

function scrollToDirectorySection(elements, { updateHash = false } = {}) {
  if (updateHash) {
    const params = new URLSearchParams(window.location.search);
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}#collectionsDirectorySection`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  elements.directorySection?.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

export async function initializeCollectionsPage() {
  const elements = getElements();

  if (
    !elements.directoryRoot ||
    !elements.featuredGrid ||
    !elements.similarityGrid ||
    !elements.moodChips ||
    !elements.stickyMoodBar ||
    !elements.stickyMoodChips
  ) {
    return;
  }
  renderCollectionsLoadingState(elements);
  const scrollRestoration = createScrollRestoration();
  scrollRestoration.enable();

  const [shows, collections] = await loadCollectionsPageData(elements);
  if (!shows || !collections) return;
  const publishedShows = getPublishedShows(shows);
  const showMap = buildShowMap(publishedShows);
  const orderedCollections = sortCollections(collections, new Map(collections.map((entry) => [entry.id, []])), "editorial");

  updateDocumentMetadata({
    title: "Audio Drama & Fiction Podcast Collections | The Echo Archives",
    description: "Browse audio drama and fiction podcast recommendations by mood, genre, listening time, completion status, and similar shows.",
    path: "/collections",
    image: DEFAULT_SOCIAL_IMAGE,
    structuredData: buildCollectionsDirectoryStructuredData(orderedCollections),
  });

  const similarityCollections = orderedCollections.filter((collection) => collection.kind === "similarity");
  const intentFilters = buildIntentFilters(orderedCollections);
  const intentCounts = buildIntentCounts(orderedCollections);
  const showsByCollection = new Map(
    orderedCollections.map((collection) => [collection.id, getCollectionShows(collection, showMap)]),
  );
  const validIntentIds = new Set(intentFilters.map((filter) => filter.id));
  const state = parseCollectionsUrlState(window.location, validIntentIds);
  const collectionsAnalytics = {
    hasRendered: false,
    previousResultCountBucket: "unknown",
    lastResultCount: 0,
    seenSearchStates: new Set(),
    pendingFilterChanges: [],
    pendingClear: null,
    searchAnalyticsTimer: 0,
    pendingSearch: null,
  };
  const similarityState = {
    visibleCount: SIMILARITY_COLLECTIONS_PAGE_SIZE,
  };
  const { commitCurrentUrlState, markCurrentUrl, synchronizeUrlState } = createDiscoveryHistoryController({
    state,
    buildUrl: buildCollectionsUrl,
    syncUrl: syncCollectionsUrlState,
    onBeforeSync: () => scrollRestoration.save(),
  });
  const searchHistoryCommit = createDebouncedHistoryCommit({
    onCommit: () => commitCurrentUrlState(),
  });
  const handleMoodSelection = (intent, sourceSurface = "hero") => {
    searchHistoryCommit.commitNow();
    collectionsAnalytics.pendingFilterChanges.push({
      action: state.intent === intent ? "removed" : "added",
      filterValue: intent,
    });
    state.intent = state.intent === intent ? "" : intent;
    render("explicit", sourceSurface, "push");
  };
  const heroMoodChipMap = mountMoodChips({
    moodChips: elements.moodChips,
    intentFilters,
    intentCounts,
    onSelect: handleMoodSelection,
  });
  const stickyMoodChipMap = mountMoodChips({
    moodChips: elements.stickyMoodChips,
    intentFilters,
    intentCounts,
    onSelect: handleMoodSelection,
    compact: true,
  });
  const stickyMoodBarController = createStickyMoodBarController({
    observedSurface: elements.moodPanel || elements.heroSection,
    stickyBar: elements.stickyMoodBar,
  });

  const featuredCount = orderedCollections.filter((collection) => collection.featured).length;
  const coveredShowIds = new Set(orderedCollections.flatMap((collection) => collection.showIds));
  const updatedAtValues = orderedCollections.map((collection) => collection.updatedAt).filter(Boolean).sort();
  const latestUpdatedAt = updatedAtValues[updatedAtValues.length - 1];

  setTextContent("collectionsCount", String(orderedCollections.length));
  setTextContent("collectionsShowReach", String(coveredShowIds.size));
  setTextContent("collectionsFeaturedCount", String(featuredCount));
  setTextContent("collectionsLastUpdated", latestUpdatedAt ? formatDate(latestUpdatedAt) : "Unknown");
  const similarityLabel = similarityCollections.length === 1 ? "collection" : "collections";
  setTextContent(
    "collectionsSimilaritySummary",
    `${similarityCollections.length} “shows like” ${similarityLabel} that branch out from a show in the archive.`,
  );

  const renderSimilarityCollections = (changeReason = "initial") => {
    const visibleCount = Math.min(similarityState.visibleCount, similarityCollections.length);

    syncCollectionGrid(elements.similarityGrid, similarityCollections.slice(0, visibleCount), {
      motionProfile: getCollectionsGridMotionProfile(changeReason),
      renderItem: (collection) =>
        createCollectionFeatureCard(collection, showsByCollection.get(collection.id), {
          anchorShow: getCollectionAnchorShow(collection, showMap),
        }),
    });

    if (elements.similarityMore instanceof HTMLButtonElement) {
      const remainingCount = Math.max(similarityCollections.length - visibleCount, 0);
      const nextRevealCount = Math.min(SIMILARITY_COLLECTIONS_PAGE_SIZE, remainingCount);
      const hasMore = remainingCount > 0;
      if (elements.similarityActions instanceof HTMLElement) {
        elements.similarityActions.hidden = !hasMore;
      }
      elements.similarityMore.hidden = !hasMore;
      elements.similarityMore.disabled = !hasMore;

      if (hasMore) {
        elements.similarityMore.textContent = `Show ${nextRevealCount} more collections`;
        elements.similarityMore.setAttribute("aria-label", `Show ${nextRevealCount} more “shows like” collections`);
      }
    }
  };

  if (elements.searchInput instanceof HTMLInputElement) {
    elements.searchInput.value = state.query;
  }
  if (elements.sortSelect instanceof HTMLSelectElement) {
    elements.sortSelect.value = state.sortMode;
  }

  const render = (changeReason = "initial", sourceSurface = "", historyMode = "replace") => {
    const filtered = sortCollections(
      orderedCollections.filter((collection) => {
        const collectionShows = showsByCollection.get(collection.id);
        return collectionMatchesIntent(collection, state.intent) && collectionMatchesQuery(collection, collectionShows, state.query);
      }),
      showsByCollection,
      state.sortMode,
    );
    const featuredBase = state.intent ? filtered : orderedCollections.filter((collection) => collection.featured);
    const featured = sortCollections(featuredBase, showsByCollection, "editorial").slice(0, 5);
    const activeMood = intentFilters.find((filter) => filter.id === state.intent)?.label || "";
    const gridMotionProfile = getCollectionsGridMotionProfile(changeReason);

    syncMoodChipState(heroMoodChipMap, state.intent, {
      scrollActiveIntoView: changeReason === "explicit" && Boolean(state.intent) && sourceSurface === "hero",
    });
    syncMoodChipState(stickyMoodChipMap, state.intent, {
      scrollActiveIntoView: changeReason === "explicit" && Boolean(state.intent) && sourceSurface === "sticky",
    });

    syncCollectionGrid(elements.featuredGrid, featured, {
      motionProfile: gridMotionProfile,
      renderItem: (collection) =>
        createCollectionFeatureCard(collection, showsByCollection.get(collection.id), {
          anchorShow: getCollectionAnchorShow(collection, showMap),
        }),
    });
    syncCollectionGrid(elements.directoryRoot, filtered, {
      motionProfile: gridMotionProfile,
      renderItem: (collection) =>
        createCollectionDirectoryCard(collection, showsByCollection.get(collection.id), {
          anchorShow: getCollectionAnchorShow(collection, showMap),
        }),
    });

    if (elements.featuredSummary) {
      syncCollectionsSummary(
        elements.featuredSummary,
        activeMood ? `Collections matching ${activeMood.toLowerCase()}.` : "Use mood, format, or listening time to narrow the list.",
        { skipAnimation: changeReason === "initial" },
      );
    }
    if (elements.directorySummary) {
      const queryLabel = state.query ? ` for "${state.query}"` : "";
      const moodLabel = activeMood ? ` matching ${activeMood.toLowerCase()}` : "";
      syncCollectionsSummary(
        elements.directorySummary,
        `${filtered.length} collection${filtered.length === 1 ? "" : "s"}${moodLabel}${queryLabel}.`,
        { skipAnimation: changeReason === "initial" },
      );
    }
    if (elements.emptyState) {
      syncCollectionsSurfaceVisibility(elements.emptyState, filtered.length === 0, {
        enterOffsetY: 10,
      });
    }
    synchronizeUrlState(historyMode, changeReason);

    const resultCountBucket = bucketDiscoveryResultCount(filtered.length);
    if (changeReason === "history-restore") {
      collectionsAnalytics.pendingSearch = null;
      if (collectionsAnalytics.searchAnalyticsTimer) {
        window.clearTimeout(collectionsAnalytics.searchAnalyticsTimer);
        collectionsAnalytics.searchAnalyticsTimer = 0;
      }
      collectionsAnalytics.pendingFilterChanges.splice(0);
      collectionsAnalytics.pendingClear = null;
      collectionsAnalytics.lastResultCount = filtered.length;
      collectionsAnalytics.previousResultCountBucket = resultCountBucket;
      collectionsAnalytics.hasRendered = true;
      return;
    }

    const recoveryContext = collectionsAnalytics.previousResultCountBucket === "0"
      ? "after_zero_results"
      : collectionsAnalytics.hasRendered
        ? "none"
        : "unknown";
    const searchSignature = JSON.stringify({ query: state.query.trim(), intent: state.intent });
    if (state.query.trim()) {
      collectionsAnalytics.pendingSearch = {
        signature: searchSignature,
        query: state.query,
        resultCountBucket,
        activeFilterCountBucket: bucketDiscoveryFilterCount(Number(Boolean(state.intent))),
        recoveryContext,
      };
      if (collectionsAnalytics.searchAnalyticsTimer) {
        window.clearTimeout(collectionsAnalytics.searchAnalyticsTimer);
      }
      collectionsAnalytics.searchAnalyticsTimer = window.setTimeout(() => {
        collectionsAnalytics.searchAnalyticsTimer = 0;
        const pendingSearch = collectionsAnalytics.pendingSearch;
        collectionsAnalytics.pendingSearch = null;
        if (!pendingSearch || collectionsAnalytics.seenSearchStates.has(pendingSearch.signature)) return;
        collectionsAnalytics.seenSearchStates.add(pendingSearch.signature);
        const queryShape = archiveSearch.classifyQueryShape(publishedShows, pendingSearch.query);
        trackDiscoveryEvent("Search Used", {
          discovery_surface: "collections_directory",
          query_kind: queryShape.queryKind,
          structured_clause_group: queryShape.structuredClauseGroup,
          result_count_bucket: pendingSearch.resultCountBucket,
          active_filter_count_bucket: pendingSearch.activeFilterCountBucket,
          recovery_context: pendingSearch.recoveryContext,
        });
      }, 350);
    } else {
      collectionsAnalytics.pendingSearch = null;
      if (collectionsAnalytics.searchAnalyticsTimer) {
        window.clearTimeout(collectionsAnalytics.searchAnalyticsTimer);
        collectionsAnalytics.searchAnalyticsTimer = 0;
      }
    }

    collectionsAnalytics.pendingFilterChanges.splice(0).forEach(({ action, filterValue }) => {
      trackDiscoveryEvent("Filter Changed", {
        discovery_surface: "collections_directory",
        filter_group: "intent",
        filter_action: action,
        filter_value: filterValue,
        active_filter_count_bucket: bucketDiscoveryFilterCount(Number(Boolean(state.intent))),
        result_count_bucket: resultCountBucket,
        recovery_context: recoveryContext,
      });
    });

    if (collectionsAnalytics.pendingClear) {
      const { count, hadSearch } = collectionsAnalytics.pendingClear;
      trackDiscoveryEvent("Filters Cleared", {
        discovery_surface: "collections_directory",
        clear_scope: "all",
        cleared_filter_count_bucket: bucketDiscoveryClearedFilterCount(count),
        had_search: hadSearch,
        result_count_bucket_before: bucketDiscoveryResultCount(collectionsAnalytics.lastResultCount),
      });
      collectionsAnalytics.pendingClear = null;
    }

    collectionsAnalytics.lastResultCount = filtered.length;
    collectionsAnalytics.previousResultCountBucket = resultCountBucket;
    collectionsAnalytics.hasRendered = true;
  };

  elements.searchInput?.addEventListener("input", () => {
    state.query = elements.searchInput.value.trim();
    searchHistoryCommit.schedule();
    render("live-search", "", "replace");
  });
  elements.searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchHistoryCommit.commitNow();
    }
  });
  elements.sortSelect?.addEventListener("change", () => {
    if (state.sortMode === elements.sortSelect.value) {
      return;
    }
    searchHistoryCommit.commitNow();
    state.sortMode = elements.sortSelect.value;
    render("explicit", "", "push");
  });
  elements.clearSearch?.addEventListener("click", () => {
    searchHistoryCommit.cancel();
    const hadSearch = Boolean(state.query.trim());
    const hadIntent = Boolean(state.intent);
    if (hadSearch || hadIntent) {
      collectionsAnalytics.pendingClear = {
        count: Number(hadSearch) + Number(hadIntent),
        hadSearch,
      };
    }
    state.query = "";
    state.intent = "";
    if (elements.searchInput instanceof HTMLInputElement) {
      elements.searchInput.value = "";
      elements.searchInput.focus();
    }
    render("explicit", "", hadSearch || hadIntent ? "push" : "replace");
  });
  elements.similarityMore?.addEventListener("click", () => {
    similarityState.visibleCount = Math.min(
      similarityState.visibleCount + SIMILARITY_COLLECTIONS_PAGE_SIZE,
      similarityCollections.length,
    );
    renderSimilarityCollections("explicit");
  });
  elements.startWithMood?.addEventListener("click", () => focusMoodChip(elements.moodChips));
  elements.browseAll?.addEventListener("click", () => scrollToDirectorySection(elements));
  elements.similarityBrowseAll?.addEventListener("click", (event) => {
    event.preventDefault();
    searchHistoryCommit.commitNow();
    state.intent = "";
    state.query = SIMILARITY_COLLECTIONS_QUERY;
    if (elements.searchInput instanceof HTMLInputElement) {
      elements.searchInput.value = SIMILARITY_COLLECTIONS_QUERY;
    }
    render("explicit", "", "push");
    scrollToDirectorySection(elements, { updateHash: true });
    markCurrentUrl();
  });

  renderSimilarityCollections();
  render("initial", "", "replace");
  window.addEventListener("popstate", () => {
    searchHistoryCommit.cancel();
    Object.assign(state, parseCollectionsUrlState(window.location, validIntentIds));
    if (elements.searchInput instanceof HTMLInputElement) {
      elements.searchInput.value = state.query;
    }
    if (elements.sortSelect instanceof HTMLSelectElement) {
      elements.sortSelect.value = state.sortMode;
    }
    render("history-restore", "", "replace");
    scrollRestoration.restore({ force: true });
  });
  stickyMoodBarController.start();
}

async function loadCollectionsPageData(elements) {
  try {
    return await Promise.all([loadSearchIndex(), loadCollections()]);
  } catch (_error) {
    [elements.similarityGrid, elements.featuredGrid].forEach((grid) => {
      if (grid) grid.textContent = "";
    });
    renderRouteErrorSurface(elements.directoryRoot, {
      title: "Collections did not load",
      explanation: "The collections need the public catalog data before they can be searched or sorted.",
      primaryAction: { href: "/", label: "Back to archive" },
      secondaryAction: { href: "/help-center", label: "Get help" },
      onRetry: () => window.location.reload(),
    });
    return [null, null];
  }
}
