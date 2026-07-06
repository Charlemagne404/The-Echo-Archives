import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { buildShowMap, getCollectionShows, getPublishedShows, loadCollections, loadShows } from "../data.js";
import { createCollectionDirectoryCard, createCollectionFeatureCard } from "../render-collections.js";
import { renderRouteErrorSurface } from "../route-error.js";
import { createScrollRestoration } from "../scroll-restoration.js";
import { formatDate, normalizeTag, setTextContent, updateDocumentMetadata } from "../utils.js";
import { getCollectionsGridMotionProfile, syncCollectionGrid } from "./collections-grid-motion.js";
import { prefersReducedMotion, restartAnimationClass, syncCollectionsSummary, syncCollectionsSurfaceVisibility } from "./collections-motion.js";

const MOOD_FILTERS = [
  { id: "long-walks", label: "Long walks", icon: "M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" },
  { id: "easy-first-step", label: "Easy first step", icon: "M5 12h14M13 6l6 6-6 6" },
  { id: "late-night", label: "Late night", icon: "M18 15.5A6.5 6.5 0 1 1 8.5 6 7 7 0 0 0 18 15.5Z" },
  { id: "headphones-on", label: "Headphones on", icon: "M4 13a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-2v-7h4M4 13h4v7H6a2 2 0 0 1-2-2v-5Z" },
  { id: "serious-sci-fi", label: "Serious sci-fi", icon: "M12 3v18M4 12h16M7 7l10 10M17 7 7 17" },
  { id: "funny-space", label: "Funny space", icon: "M7 15c2 3 8 3 10 0M8 9h.01M16 9h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" },
  { id: "cold-horror", label: "Cold horror", icon: "M12 3v18M5 7l14 10M19 7 5 17M4 12h16" },
  { id: "time-bent", label: "Time-bent", icon: "M12 7v5l3 2M4 12a8 8 0 1 0 3-6.25M4 5v5h5" },
];
const COLLECTION_SORT_MODES = new Set(["editorial", "newest", "title", "shows", "rating", "popularity"]);

function getElements() {
  return {
    moodChips: document.getElementById("collectionsMoodChips"),
    similarityGrid: document.getElementById("collectionsSimilarityGrid"),
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
  elements.directoryRoot.textContent = "";
  for (let index = 0; index < 6; index += 1) {
    elements.directoryRoot.appendChild(createCollectionsSkeletonCard());
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

function createMoodChip(filter, count, state, onSelect) {
  const button = document.createElement("button");
  button.className = "collections-mood-chip";
  button.type = "button";
  button.dataset.intent = filter.id;
  button.setAttribute("aria-pressed", String(state.intent === filter.id));

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", filter.icon);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "1.8");
  icon.appendChild(path);

  const label = document.createElement("span");
  label.textContent = filter.label;
  const countNode = document.createElement("strong");
  countNode.textContent = String(count);

  button.append(icon, label, countNode);
  button.addEventListener("click", () => onSelect(filter.id));
  return button;
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

function mountMoodChips({ moodChips, collections, onSelect }) {
  const chipMap = new Map();
  moodChips.textContent = "";
  MOOD_FILTERS.forEach((filter) => {
    const count = collections.filter((collection) => collectionMatchesIntent(collection, filter.id)).length;
    const chip = createMoodChip(filter, count, { intent: "" }, onSelect);
    chipMap.set(filter.id, chip);
    moodChips.appendChild(chip);
  });

  return chipMap;
}

function syncMoodChipState(chipMap, activeIntent, { scrollActiveIntoView = false } = {}) {
  chipMap.forEach((chip, intent) => {
    const isActive = activeIntent === intent;
    const wasActive = chip.getAttribute("aria-pressed") === "true";
    chip.setAttribute("aria-pressed", String(isActive));

    if (!isActive || wasActive) {
      return;
    }

    restartAnimationClass(chip, "is-activating", 340);
    if (scrollActiveIntoView) {
      chip.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  });
}

export async function initializeCollectionsPage() {
  const elements = getElements();

  if (!elements.directoryRoot || !elements.featuredGrid || !elements.similarityGrid || !elements.moodChips) {
    return;
  }
  renderCollectionsLoadingState(elements);
  const scrollRestoration = createScrollRestoration();
  scrollRestoration.enable();

  const [shows, collections] = await loadCollectionsPageData(elements);
  if (!shows || !collections) return;
  const publishedShows = getPublishedShows(shows);
  const showMap = buildShowMap(publishedShows);

  updateDocumentMetadata({
    title: "Collections - The Echo Archives",
    description: "Browse curated listening paths by mood, tone, and commitment in The Echo Archives.",
    path: "/collections",
    image: DEFAULT_SOCIAL_IMAGE,
  });

  const orderedCollections = sortCollections(collections, new Map(collections.map((entry) => [entry.id, []])), "editorial");
  const similarityCollections = orderedCollections.filter((collection) => collection.kind === "similarity");
  const showsByCollection = new Map(
    orderedCollections.map((collection) => [collection.id, getCollectionShows(collection, showMap)]),
  );
  const validIntentIds = new Set(MOOD_FILTERS.map((filter) => filter.id));
  const state = getInitialState(validIntentIds);
  const moodChipMap = mountMoodChips({
    moodChips: elements.moodChips,
    collections: orderedCollections,
    onSelect: (intent) => {
      state.intent = state.intent === intent ? "" : intent;
      render("explicit");
    },
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

  syncCollectionGrid(elements.similarityGrid, similarityCollections, {
    motionProfile: getCollectionsGridMotionProfile("initial"),
    renderItem: (collection) => createCollectionFeatureCard(collection, showsByCollection.get(collection.id)),
  });

  if (elements.searchInput instanceof HTMLInputElement) {
    elements.searchInput.value = state.query;
  }
  if (elements.sortSelect instanceof HTMLSelectElement) {
    elements.sortSelect.value = state.sortMode;
  }

  const render = (changeReason = "initial") => {
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
    const activeMood = MOOD_FILTERS.find((filter) => filter.id === state.intent)?.label || "";
    const gridMotionProfile = getCollectionsGridMotionProfile(changeReason);

    syncMoodChipState(moodChipMap, state.intent, {
      scrollActiveIntoView: changeReason === "explicit" && Boolean(state.intent),
    });

    syncCollectionGrid(elements.featuredGrid, featured, {
      motionProfile: gridMotionProfile,
      renderItem: (collection) => createCollectionFeatureCard(collection, showsByCollection.get(collection.id)),
    });
    syncCollectionGrid(elements.directoryRoot, filtered, {
      motionProfile: gridMotionProfile,
      renderItem: (collection) => createCollectionDirectoryCard(collection, showsByCollection.get(collection.id)),
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
  elements.startWithMood?.addEventListener("click", () =>
    elements.moodPanel?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" }),
  );
  elements.browseAll?.addEventListener("click", () =>
    elements.directorySection?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" }),
  );

  render();
  scrollRestoration.restore();
}

async function loadCollectionsPageData(elements) {
  try {
    return await Promise.all([loadShows(), loadCollections()]);
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
