import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { buildShowMap, getCollectionShows, getPublishedShows, loadCollections, loadSearchIndex } from "../data.js";
import { createCollectionDirectoryCard, createCollectionFeatureCard, getCollectionAnchorShow } from "../render-collections.js";
import { renderRouteErrorSurface } from "../route-error.js";
import { createScrollRestoration } from "../scroll-restoration.js";
import { buildCollectionsDirectoryStructuredData } from "../structured-data.js";
import { formatDate, normalizeTag, setTextContent, updateDocumentMetadata } from "../utils.js";
import { buildIntentCounts, buildIntentFilters, createStickyMoodBarController, mountMoodChips, syncMoodChipState } from "./collections-intents.js";
import { getCollectionsGridMotionProfile, syncCollectionGrid } from "./collections-grid-motion.js";
import { prefersReducedMotion, syncCollectionsSummary, syncCollectionsSurfaceVisibility } from "./collections-motion.js";

const COLLECTION_SORT_MODES = new Set(["editorial", "newest", "title", "shows", "rating", "popularity"]);
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

function getInitialState(validIntentIds) {
  const params = new URLSearchParams(window.location.search);
  const intent = normalizeTag(params.get("intent") || "");
  const sort = params.get("sort") === "updated" ? "newest" : params.get("sort") || "editorial";
  return {
    intent: validIntentIds.has(intent) ? intent : "",
    query: params.get("q") || "",
    sortMode: COLLECTION_SORT_MODES.has(sort) ? sort : "editorial",
  };
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

function getAggregateValue(shows, selector) {
  const values = (Array.isArray(shows) ? shows : [])
    .map((show) => selector(show))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getCollectionSortTitle(collection) {
  return String(collection?.title || "Untitled collection");
}

function getCollectionSortOrder(collection) {
  return Number.isFinite(collection?.order) ? collection.order : Number.MAX_SAFE_INTEGER;
}

function getCollectionSortDate(collection) {
  const timestamp = Date.parse(String(collection?.updatedAt || "").trim());
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getCollectionShowsForSort(showsByCollection, collection) {
  return showsByCollection.get(collection.id) || [];
}

function sortCollections(collections, showsByCollection, sortMode) {
  return [...collections].sort((left, right) => {
    if (sortMode === "newest") {
      return getCollectionSortDate(right) - getCollectionSortDate(left) || getCollectionSortOrder(left) - getCollectionSortOrder(right);
    }
    if (sortMode === "title") {
      return getCollectionSortTitle(left).localeCompare(getCollectionSortTitle(right));
    }
    if (sortMode === "shows") {
      return (
        getCollectionShowsForSort(showsByCollection, right).length -
          getCollectionShowsForSort(showsByCollection, left).length ||
        getCollectionSortOrder(left) - getCollectionSortOrder(right)
      );
    }
    if (sortMode === "rating") {
      return (
        getAggregateValue(getCollectionShowsForSort(showsByCollection, right), (show) => show.finalRating) -
          getAggregateValue(getCollectionShowsForSort(showsByCollection, left), (show) => show.finalRating) ||
        getCollectionSortOrder(left) - getCollectionSortOrder(right) ||
        getCollectionSortTitle(left).localeCompare(getCollectionSortTitle(right))
      );
    }
    if (sortMode === "popularity") {
      return (
        getAggregateValue(getCollectionShowsForSort(showsByCollection, right), (show) => show.popularity?.score) -
          getAggregateValue(getCollectionShowsForSort(showsByCollection, left), (show) => show.popularity?.score) ||
        getCollectionSortOrder(left) - getCollectionSortOrder(right) ||
        getCollectionSortTitle(left).localeCompare(getCollectionSortTitle(right))
      );
    }
    return getCollectionSortOrder(left) - getCollectionSortOrder(right) || getCollectionSortTitle(left).localeCompare(getCollectionSortTitle(right));
  });
}

function syncUrlState(state) {
  const params = new URLSearchParams(window.location.search);
  params.delete("intent");
  params.delete("q");
  params.delete("sort");
  if (state.intent) {
    params.set("intent", state.intent);
  }
  if (state.query) {
    params.set("q", state.query);
  }
  if (state.sortMode !== "editorial") {
    params.set("sort", state.sortMode);
  }
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
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
    title: "Curated Audio Drama & Fiction Podcast Collections | The Echo Archives",
    description: "Browse human-curated audio drama and fiction podcast recommendations by mood, genre, listening time, completion status, and similar shows.",
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
  const state = getInitialState(validIntentIds);
  const similarityState = {
    visibleCount: SIMILARITY_COLLECTIONS_PAGE_SIZE,
  };
  const handleMoodSelection = (intent, sourceSurface = "hero") => {
    state.intent = state.intent === intent ? "" : intent;
    render("explicit", sourceSurface);
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
  const latestUpdatedAt = orderedCollections.map((collection) => collection.updatedAt).filter(Boolean).sort().at(-1);

  setTextContent("collectionsCount", String(orderedCollections.length));
  setTextContent("collectionsShowReach", String(coveredShowIds.size));
  setTextContent("collectionsFeaturedCount", String(featuredCount));
  setTextContent("collectionsLastUpdated", latestUpdatedAt ? formatDate(latestUpdatedAt) : "Unknown");
  setTextContent(
    "collectionsSimilaritySummary",
    `${similarityCollections.length} anchored route${similarityCollections.length === 1 ? "" : "s"} for starting from a favorite show.`,
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
        elements.similarityMore.textContent = `Show ${nextRevealCount} more routes`;
        elements.similarityMore.setAttribute("aria-label", `Show ${nextRevealCount} more similar-show routes`);
      }
    }
  };

  if (elements.searchInput instanceof HTMLInputElement) {
    elements.searchInput.value = state.query;
  }
  if (elements.sortSelect instanceof HTMLSelectElement) {
    elements.sortSelect.value = state.sortMode;
  }

  const render = (changeReason = "initial", sourceSurface = "") => {
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
        activeMood ? `Featured paths matching ${activeMood.toLowerCase()}.` : "Featured listening paths from the archive.",
        { skipAnimation: changeReason === "initial" },
      );
    }
    if (elements.directorySummary) {
      const queryLabel = state.query ? ` for "${state.query}"` : "";
      const moodLabel = activeMood ? ` matching ${activeMood.toLowerCase()}` : "";
      syncCollectionsSummary(
        elements.directorySummary,
        `${filtered.length} listening ${filtered.length === 1 ? "path" : "paths"}${moodLabel}${queryLabel}.`,
        { skipAnimation: changeReason === "initial" },
      );
    }
    if (elements.emptyState) {
      syncCollectionsSurfaceVisibility(elements.emptyState, filtered.length === 0, {
        enterOffsetY: 10,
      });
    }
    syncUrlState(state);
  };

  elements.searchInput?.addEventListener("input", () => {
    state.query = elements.searchInput.value.trim();
    render("live-search");
  });
  elements.sortSelect?.addEventListener("change", () => {
    state.sortMode = elements.sortSelect.value;
    render("explicit");
  });
  elements.clearSearch?.addEventListener("click", () => {
    state.query = "";
    state.intent = "";
    if (elements.searchInput instanceof HTMLInputElement) {
      elements.searchInput.value = "";
      elements.searchInput.focus();
    }
    render("explicit");
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
    state.intent = "";
    state.query = SIMILARITY_COLLECTIONS_QUERY;
    if (elements.searchInput instanceof HTMLInputElement) {
      elements.searchInput.value = SIMILARITY_COLLECTIONS_QUERY;
    }
    render("explicit");
    scrollToDirectorySection(elements, { updateHash: true });
  });

  renderSimilarityCollections();
  render();
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
      explanation: "The curated listening paths need the public catalog data before they can be searched or sorted.",
      primaryAction: { href: "/", label: "Back to archive" },
      secondaryAction: { href: "/help-center", label: "Get help" },
      onRetry: () => window.location.reload(),
    });
    return [null, null];
  }
}
