const SHOWS_DATA_URL = "/data/shows.json";
const COLLECTIONS_DATA_URL = "/data/collections.json";
const DEFAULT_SOCIAL_IMAGE = "/images/Logo.png";
const TOP_RATED_BADGE_ASSET_URL = "/images/badges/top-rated-bookmark.png";
const CHAT_STORAGE_KEY = "echo-archives-chat-v2";
const COMMUNITY_PROFILE_KEY = "echo-community-profile-id";
const COMMUNITY_PROFILE_HEADER = "x-echo-profile-id";
const DEFAULT_CHAT_SUGGESTIONS = [
  "Give me a finished show with strong worldbuilding",
  "I want something easy to jump into late at night",
  "Recommend a darker survival story",
  "What should I start with if I want a full review first?",
];
const PREFERRED_QUICK_FILTERS = ["sci-fi", "mystery", "horror", "comedy", "survival", "time-travel"];
const SHOW_CARD_PREVIEW_DELAY_MS = 650;
const SHOW_CARD_PREVIEW_CLOSE_DELAY_MS = 32;
const SHOW_CARD_PREVIEW_CLOSE_TRANSITION_MS = 170;
const SHOW_CARD_PREVIEW_SCROLL_IDLE_MS = 140;
const SHOW_CARD_PREVIEW_EDGE_GUTTER_PX = 16;
const HOME_CARD_PREVIEW_ID_PREFIX = "archiveCardPreview";

const dataCache = {
  shows: null,
  collections: null,
  communitySummaries: new Map(),
};

const chatState = {
  history: [],
  pending: false,
};

const communityState = {
  profileId: null,
  profilePromise: null,
};

const backToTopBtn = document.getElementById("backToTop");
const toggleBtn = document.getElementById("chat-toggle");
const closeChatBtn = document.getElementById("chat-close");
const clearChatButton = document.getElementById("chat-clear");
const chatContainer = document.getElementById("chat-container");
const chatLog = document.getElementById("chatLog");
const chatStatus = document.getElementById("chatStatus");
const chatSuggestionRegion = document.getElementById("chatSuggestionRegion");
const chatSuggestions = document.getElementById("chatSuggestions");
const chatFootnote = document.querySelector(".chat-footnote");
const userInput = document.getElementById("userInput");
const sendMessageButton = document.getElementById("sendMessageButton");

initializeApp().catch((error) => {
  console.error("Failed to initialize the Echo Archives app.", error);
});

async function initializeApp() {
  initializeSharedChat();
  initializeBackToTop();

  if (document.body.classList.contains("home-page") && document.getElementById("podcast-grid")) {
    await initializeHomePage();
  }

  if (document.body.classList.contains("show-page")) {
    await initializeShowPage();
  }

  if (document.body.classList.contains("collections-page")) {
    await initializeCollectionsPage();
  }

  if (document.body.classList.contains("collection-page")) {
    await initializeCollectionPage();
  }

  if (document.body.classList.contains("about-page")) {
    await initializeAboutPage();
  }

  if (document.body.classList.contains("submit-page")) {
    await initializeSubmitPage();
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request for ${url} failed with ${response.status}`);
  }

  return response.json();
}

async function loadShows() {
  if (dataCache.shows) {
    return dataCache.shows;
  }

  const records = await fetchJson(SHOWS_DATA_URL);
  dataCache.shows = records.map((record) => normalizeShowRecord(record));
  return dataCache.shows;
}

async function loadCollections() {
  if (dataCache.collections) {
    return dataCache.collections;
  }

  const records = await fetchJson(COLLECTIONS_DATA_URL);
  dataCache.collections = records.map((record) => normalizeCollectionRecord(record));
  return dataCache.collections;
}

function getPublishedShows(shows) {
  return shows.filter((show) => show.status === "published");
}

function normalizeKeyedTextMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, text]) => [String(key || "").trim(), String(text || "").trim()])
      .filter(([key, text]) => key && text),
  );
}

function normalizeCollectionRecord(record) {
  return {
    ...record,
    showIds: Array.isArray(record.showIds) ? record.showIds.filter(Boolean) : [],
    showReasons: normalizeKeyedTextMap(record.showReasons),
  };
}

function buildCollectionMap(collections) {
  return new Map(collections.map((collection) => [collection.id, collection]));
}

function getCollectionShows(collection, showMap) {
  if (!collection) {
    return [];
  }

  return collection.showIds
    .map((showId) => showMap.get(showId))
    .filter((show) => show && show.status === "published");
}

function createCollectionHref(collectionId) {
  return `/collection.html?id=${encodeURIComponent(collectionId)}`;
}

function createArchiveCollectionHref(collectionId) {
  return `/index.html?collection=${encodeURIComponent(collectionId)}#archive`;
}

function normalizeShowRecord(record) {
  const tags = Array.isArray(record.tags) ? record.tags.filter(Boolean) : [];
  const genres = Array.isArray(record.genres) ? record.genres.filter(Boolean) : [];
  const tones = Array.isArray(record.tones) ? record.tones.filter(Boolean) : [];
  const formats = Array.isArray(record.formats) ? record.formats.filter(Boolean) : [];
  const bestFor = Array.isArray(record.bestFor) ? record.bestFor.filter(Boolean) : [];
  const similarTo = Array.isArray(record.similarTo) ? record.similarTo.filter(Boolean) : [];
  const similarReasons = normalizeKeyedTextMap(record.similarReasons);
  const rating = Number(record.ratings?.archive);
  const searchText = [
    record.title,
    record.subtitle,
    record.description,
    record.archiveTake,
    record.spoilerFreeReview,
    record.thoughts,
    tags.join(" "),
    genres.join(" "),
    tones.join(" "),
    formats.join(" "),
    bestFor.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    ...record,
    tags,
    genres,
    tones,
    formats,
    bestFor,
    similarTo,
    similarReasons,
    href: `/show.html?id=${encodeURIComponent(record.id)}`,
    finalRating: Number.isFinite(rating) ? rating : null,
    searchText,
    tagTokens: tags.map((tag) => normalizeTag(tag)),
    bestForTokens: bestFor.map((tag) => normalizeTag(tag)),
  };
}

function buildShowMap(shows) {
  return new Map(shows.map((show) => [show.id, show]));
}

function getArchiveStats(shows, collections) {
  const publishedShows = getPublishedShows(shows);
  const fullReviewCount = publishedShows.filter((show) => show.reviewStatus === "full-review").length;
  const latestUpdatedAt = [
    ...publishedShows.map((show) => show.updatedAt),
    ...(Array.isArray(collections) ? collections.map((collection) => collection.updatedAt) : []),
  ]
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    showCount: publishedShows.length,
    fullReviewCount,
    collectionCount: Array.isArray(collections) ? collections.length : 0,
    latestUpdatedAt: latestUpdatedAt || "",
  };
}

function applyArchiveStats(prefix, stats) {
  setTextContent(`${prefix}ShowCount`, String(stats.showCount));
  setTextContent(`${prefix}ReviewCount`, String(stats.fullReviewCount));
  setTextContent(`${prefix}CollectionCount`, String(stats.collectionCount));
  const formattedDate = stats.latestUpdatedAt
    ? prefix === "home"
      ? formatCompactDate(stats.latestUpdatedAt)
      : formatDate(stats.latestUpdatedAt)
    : "Unknown";
  setTextContent(`${prefix}LastUpdated`, formattedDate);
}

function getVisibleFilterTags(shows) {
  const counts = new Map();

  shows.forEach((show) => {
    show.tags.forEach((tag) => {
      const normalized = normalizeTag(tag);
      if (!normalized) {
        return;
      }

      const current = counts.get(normalized) || {
        id: normalized,
        label: toDisplayTag(tag),
        count: 0,
      };
      current.count += 1;
      counts.set(normalized, current);
    });
  });

  return Array.from(counts.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function getQuickFilters(filterTags) {
  const tagsById = new Map(filterTags.map((tag) => [tag.id, tag]));
  return PREFERRED_QUICK_FILTERS.filter((id) => tagsById.has(id)).map((id) => tagsById.get(id));
}

function createCountedOptions(shows, selector, formatter = toDisplayTag) {
  const counts = new Map();

  shows.forEach((show) => {
    const values = Array.isArray(selector(show)) ? selector(show) : [];
    values.forEach((value) => {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return;
      }

      const current = counts.get(normalized) || {
        id: normalized,
        label: formatter(normalized),
        count: 0,
      };
      current.count += 1;
      counts.set(normalized, current);
    });
  });

  return Array.from(counts.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function getStructuredFilterGroups(shows) {
  return [
    { id: "reviewStatus", label: "Coverage", options: createCountedOptions(shows, (show) => [show.reviewStatus], toLabel) },
    {
      id: "completionStatus",
      label: "Completion",
      options: createCountedOptions(shows, (show) => [show.completionStatus], toDisplayTag),
    },
    { id: "bestFor", label: "Best for", options: createCountedOptions(shows, (show) => show.bestFor, toDisplayTag) },
    { id: "tags", label: "Tags", options: getVisibleFilterTags(shows) },
  ].filter((group) => group.options.length > 0);
}

async function initializeHomePage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  const showMap = buildShowMap(shows);
  updateDocumentMetadata({
    title: "The Echo Archives",
    description: "Curated fiction podcasts, filtered by mood, genre, and listening intent.",
    path: "/",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  applyArchiveStats("home", getArchiveStats(shows, collections));

  const searchInput = document.getElementById("search");
  const filterToggle = document.getElementById("filterToggle");
  const filterDropdown = document.getElementById("filterDropdown");
  const filterCount = document.getElementById("filterCount");
  const filterClear = document.getElementById("filterClear");
  const filterOptionGrid = document.getElementById("filterOptionGrid");
  const browseModesRoot = document.getElementById("browseModes");
  const archiveSection = document.getElementById("archive");
  const archiveGrid = document.getElementById("podcast-grid");
  const noResultsMsg = document.getElementById("noResultsMsg");
  const resultsSummary = document.getElementById("resultsSummary");
  const quickFiltersRoot = document.getElementById("quickFilters");
  const collectionsSection = document.getElementById("collections");
  const collectionCarousel = document.getElementById("collectionCarousel");
  const collectionViewport = document.getElementById("collectionViewport");
  const collectionGrid = document.getElementById("collectionGrid");
  const collectionPrev = document.getElementById("collectionPrev");
  const collectionNext = document.getElementById("collectionNext");
  const clearResultsState = document.getElementById("clearResultsState");
  const openArchivistAction = document.getElementById("openArchivistAction");

  if (
    !archiveGrid ||
    !archiveSection ||
    !filterOptionGrid ||
    !quickFiltersRoot ||
    !collectionsSection ||
    !collectionCarousel ||
    !collectionViewport ||
    !collectionGrid ||
    !collectionPrev ||
    !collectionNext ||
    !browseModesRoot
  ) {
    return;
  }

  const filterTags = getVisibleFilterTags(shows);
  const structuredFilterGroups = getStructuredFilterGroups(shows);
  const quickFilters = getQuickFilters(filterTags);
  const featuredCollections = collections.filter((collection) => collection.featured);
  const collectionsById = buildCollectionMap(collections);
  let collectionCarouselControls = null;

  const state = {
    query: "",
    filters: {
      tags: new Set(),
      bestFor: new Set(),
      completionStatus: new Set(),
      reviewStatus: new Set(),
    },
    selectedCollectionId: "",
    sortMode: "default",
  };

  const initialCollectionId = new URLSearchParams(window.location.search).get("collection") || "";
  if (collectionsById.has(initialCollectionId)) {
    state.selectedCollectionId = initialCollectionId;
  }

  const previewController = initializeHomePreviewController({
    archiveGrid,
    archiveSection,
  });

  renderFilterOptions();
  renderQuickFilters();
  renderBrowseModes();
  renderCollections();
  renderHomeResults();

  searchInput?.addEventListener("input", () => {
    state.query = searchInput.value.trim().toLowerCase();
    renderHomeResults();
  });

  filterToggle?.addEventListener("click", () => {
    const isOpen = !filterDropdown.classList.contains("hidden");
    filterDropdown.classList.toggle("hidden", isOpen);
    filterToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node) || !filterDropdown || !filterToggle) {
      return;
    }

    if (!filterDropdown.contains(target) && !filterToggle.contains(target)) {
      filterDropdown.classList.add("hidden");
      filterToggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && filterDropdown) {
      filterDropdown.classList.add("hidden");
      filterToggle?.setAttribute("aria-expanded", "false");
    }
  });

  filterClear?.addEventListener("click", () => {
    clearAllFilters();
  });

  clearResultsState?.addEventListener("click", () => {
    clearAllFilters();
  });

  openArchivistAction?.addEventListener("click", () => {
    setChatOpen(true);
    if (userInput) {
      userInput.value = "Help me find something finished or easy to jump into.";
      userInput.focus();
    }
  });

  window.addEventListener("resize", () => {
    previewController.closeActivePreview({ immediate: true });
    renderHomeResults();
    collectionCarouselControls?.refresh();
  });

  function clearAllFilters() {
    Object.values(state.filters).forEach((values) => values.clear());
    state.selectedCollectionId = "";
    state.sortMode = "default";
    state.query = "";
    if (searchInput) {
      searchInput.value = "";
    }
    renderHomeResults();
  }

  function renderFilterOptions() {
    filterOptionGrid.textContent = "";

    structuredFilterGroups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "filter-group";

      const heading = document.createElement("div");
      heading.className = "filter-group-heading";

      const title = document.createElement("p");
      title.className = "filter-group-title";
      title.textContent = group.label;

      const count = document.createElement("p");
      count.className = "filter-group-count";
      count.textContent = `${group.options.length} options`;

      const optionGrid = document.createElement("div");
      optionGrid.className = "filter-group-options";

      group.options.forEach((option) => {
        const button = document.createElement("button");
        button.className = "filter-option";
        button.type = "button";
        button.dataset.filterGroup = group.id;
        button.dataset.filterValue = option.id;
        button.textContent = option.label;
        button.addEventListener("click", () => {
          toggleFilter(group.id, option.id);
        });
        optionGrid.appendChild(button);
      });

      heading.append(title, count);
      section.append(heading, optionGrid);
      filterOptionGrid.appendChild(section);
    });
  }

  function renderQuickFilters() {
    quickFiltersRoot.textContent = "";
    quickFiltersRoot.appendChild(createQuickFilterButton({ id: "all", label: "All" }));

    quickFilters.forEach((tag) => {
      quickFiltersRoot.appendChild(createQuickFilterButton(tag));
    });
  }

  function renderBrowseModes() {
    browseModesRoot.textContent = "";

    [
      { id: "default", label: "Default order" },
      { id: "recently-updated", label: "Recently updated" },
    ].forEach((mode) => {
      const button = document.createElement("button");
      button.className = "browse-mode-button";
      button.type = "button";
      button.dataset.browseMode = mode.id;
      button.textContent = mode.label;
      button.addEventListener("click", () => {
        state.sortMode = mode.id;
        renderHomeResults();
      });
      browseModesRoot.appendChild(button);
    });
  }

  function createQuickFilterButton(tag) {
    const button = document.createElement("button");
    button.className = "quick-filter";
    button.type = "button";
    button.dataset.chipFilter = tag.id;
    button.textContent = tag.label;
    button.addEventListener("click", () => {
      if (tag.id === "all") {
        clearAllFilters();
      } else {
        state.selectedCollectionId = "";
        toggleFilter("tags", tag.id);
        return;
      }
    });
    return button;
  }

  function renderCollections() {
    collectionGrid.textContent = "";
    collectionsSection.hidden = featuredCollections.length === 0;
    collectionCarouselControls?.destroy();
    collectionCarouselControls = null;
    collectionPrev.hidden = true;
    collectionNext.hidden = true;

    if (featuredCollections.length === 0) {
      return;
    }

    const carouselGroups = featuredCollections.length > 1 ? [0, 1, 2] : [1];
    carouselGroups.forEach((groupIndex) => {
      featuredCollections.forEach((collection, index) => {
        const card = createCollectionCard(collection, index, {
          isClone: featuredCollections.length > 1 && groupIndex !== 1,
        });
        collectionGrid.appendChild(card);
      });
    });

    if (featuredCollections.length > 1) {
      collectionPrev.hidden = false;
      collectionNext.hidden = false;
      collectionCarouselControls = initializeCollectionCarousel();
    }
  }

  function createCollectionCard(collection, index, { isClone = false } = {}) {
    const collectionShows = getCollectionShows(collection, showMap);
    const coverShow = collectionShows[0];
    const card = document.createElement("a");
    card.className = "collection-card";
    card.href = createCollectionHref(collection.id);
    card.setAttribute("aria-label", `Browse the ${collection.title} collection`);
    card.dataset.collectionId = collection.id;
    if (isClone) {
      card.dataset.collectionClone = "true";
      card.tabIndex = -1;
      card.setAttribute("aria-hidden", "true");
    }

    if (coverShow?.cover) {
      card.style.setProperty("--collection-cover-image", `url("/${coverShow.cover}")`);
    }

    const badge = document.createElement("span");
    badge.className = "collection-card-badge";
    badge.textContent = index % 2 === 0 ? "Featured route" : "Archive collection";

    const title = document.createElement("h3");
    title.textContent = collection.title;

    const footer = document.createElement("div");
    footer.className = "collection-card-footer";

    const count = document.createElement("p");
    count.className = "collection-card-count";
    count.textContent = `${collectionShows.length} ${collectionShows.length === 1 ? "show" : "shows"}`;

    const cta = document.createElement("span");
    cta.className = "collection-card-cta";
    cta.textContent = "Browse";

    footer.append(count, cta);
    card.append(badge, title, footer);
    return card;
  }

  function initializeCollectionCarousel() {
    const originalsPerSet = featuredCollections.length;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const autoScrollSpeedPxPerSecond = 28;
    const manualScrollDurationMs = 420;
    let autoScrollTimer = 0;
    let manualScrollFrame = 0;
    let normalizeFrame = 0;
    let lastAutoScrollAt = 0;
    let stepSize = 0;
    let middleStart = 0;
    let setWidth = 0;
    let paused = false;

    const cards = Array.from(collectionGrid.querySelectorAll(".collection-card"));

    function setViewportScroll(left) {
      const previousBehavior = collectionViewport.style.scrollBehavior;
      collectionViewport.style.scrollBehavior = "auto";
      collectionViewport.scrollLeft = left;
      collectionViewport.style.scrollBehavior = previousBehavior;
    }

    function getRelativeProgress(left) {
      if (!setWidth) {
        return 0;
      }

      return ((left - middleStart) % setWidth + setWidth) % setWidth;
    }

    function measure({ preservePosition = true } = {}) {
      const relativeProgress = preservePosition ? getRelativeProgress(collectionViewport.scrollLeft) : 0;
      const middleCards = cards.slice(originalsPerSet, originalsPerSet * 2);
      const firstMiddleCard = middleCards[0];
      const secondMiddleCard = middleCards[1];
      const nextSetFirstCard = cards[originalsPerSet * 2];

      if (!firstMiddleCard || !nextSetFirstCard) {
        return;
      }

      middleStart = firstMiddleCard.offsetLeft;
      setWidth = nextSetFirstCard.offsetLeft - middleStart;
      stepSize = secondMiddleCard ? secondMiddleCard.offsetLeft - firstMiddleCard.offsetLeft : setWidth;
      setViewportScroll(middleStart + relativeProgress);
    }

    function normalizeLoopPosition() {
      if (!setWidth) {
        return;
      }

      const maxScrollLeft = Math.max(collectionGrid.scrollWidth - collectionViewport.clientWidth, 0);
      if (collectionViewport.scrollLeft <= 1) {
        setViewportScroll(collectionViewport.scrollLeft + setWidth);
      } else if (collectionViewport.scrollLeft >= maxScrollLeft - 1) {
        setViewportScroll(collectionViewport.scrollLeft - setWidth);
      }
    }

    function queueNormalize() {
      if (normalizeFrame) {
        return;
      }

      normalizeFrame = window.requestAnimationFrame(() => {
        normalizeFrame = 0;
        normalizeLoopPosition();
      });
    }

    function stopManualScroll() {
      if (manualScrollFrame) {
        window.cancelAnimationFrame(manualScrollFrame);
        manualScrollFrame = 0;
      }
    }

    function animateManualScroll(direction) {
      stopManualScroll();
      normalizeLoopPosition();

      const startLeft = collectionViewport.scrollLeft;
      const targetLeft = startLeft + stepSize * direction;
      const startedAt = window.performance.now();

      const tick = (timestamp) => {
        const progress = Math.min((timestamp - startedAt) / manualScrollDurationMs, 1);
        const eased = 1 - (1 - progress) ** 3;
        setViewportScroll(startLeft + (targetLeft - startLeft) * eased);
        normalizeLoopPosition();

        if (progress < 1) {
          manualScrollFrame = window.requestAnimationFrame(tick);
          return;
        }

        manualScrollFrame = 0;
      };

      manualScrollFrame = window.requestAnimationFrame(tick);
    }

    function stopAutoScroll() {
      if (autoScrollTimer) {
        window.clearInterval(autoScrollTimer);
        autoScrollTimer = 0;
      }
      lastAutoScrollAt = 0;
    }

    function startAutoScroll() {
      stopAutoScroll();
      if (prefersReducedMotion || paused) {
        return;
      }

      lastAutoScrollAt = window.performance.now();
      autoScrollTimer = window.setInterval(() => {
        const now = window.performance.now();
        const elapsedMs = Math.min(now - lastAutoScrollAt, 32);
        lastAutoScrollAt = now;
        setViewportScroll(collectionViewport.scrollLeft + (autoScrollSpeedPxPerSecond * elapsedMs) / 1000);
        normalizeLoopPosition();
      }, 16);
    }

    function pauseCarousel() {
      paused = true;
      stopAutoScroll();
    }

    function resumeCarousel() {
      paused = false;
      if (collectionCarousel.matches(":hover") || collectionCarousel.matches(":focus-within")) {
        return;
      }

      startAutoScroll();
    }

    const handlePointerEnter = () => {
      pauseCarousel();
    };
    const handlePointerLeave = () => {
      resumeCarousel();
    };
    const handleFocusIn = () => {
      pauseCarousel();
    };
    const handleFocusOut = (event) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && collectionCarousel.contains(nextTarget)) {
        return;
      }

      resumeCarousel();
    };
    const handleViewportScroll = () => {
      queueNormalize();
    };
    const handlePrevClick = () => {
      pauseCarousel();
      animateManualScroll(-1);
    };
    const handleNextClick = () => {
      pauseCarousel();
      animateManualScroll(1);
    };

    measure({ preservePosition: false });
    collectionCarousel.addEventListener("mouseenter", handlePointerEnter);
    collectionCarousel.addEventListener("mouseleave", handlePointerLeave);
    collectionCarousel.addEventListener("focusin", handleFocusIn);
    collectionCarousel.addEventListener("focusout", handleFocusOut);
    collectionViewport.addEventListener("scroll", handleViewportScroll, { passive: true });
    collectionPrev.addEventListener("click", handlePrevClick);
    collectionNext.addEventListener("click", handleNextClick);
    startAutoScroll();

    return {
      refresh() {
        measure();
      },
      destroy() {
        stopAutoScroll();
        stopManualScroll();
        if (normalizeFrame) {
          window.cancelAnimationFrame(normalizeFrame);
          normalizeFrame = 0;
        }
        collectionCarousel.removeEventListener("mouseenter", handlePointerEnter);
        collectionCarousel.removeEventListener("mouseleave", handlePointerLeave);
        collectionCarousel.removeEventListener("focusin", handleFocusIn);
        collectionCarousel.removeEventListener("focusout", handleFocusOut);
        collectionViewport.removeEventListener("scroll", handleViewportScroll);
        collectionPrev.removeEventListener("click", handlePrevClick);
        collectionNext.removeEventListener("click", handleNextClick);
      },
    };
  }

  function toggleFilter(groupId, filterId) {
    const selectedValues = state.filters[groupId];
    if (!selectedValues) {
      return;
    }

    if (selectedValues.has(filterId)) {
      selectedValues.delete(filterId);
    } else {
      selectedValues.add(filterId);
    }

    state.selectedCollectionId = "";
    renderHomeResults();
  }

  function getActiveFilterCount() {
    return Object.values(state.filters).reduce((count, values) => count + values.size, 0);
  }

  function matchesSelectedFilters(show) {
    return Object.entries(state.filters).every(([groupId, selectedValues]) => {
      if (selectedValues.size === 0) {
        return true;
      }

      const values = (() => {
        switch (groupId) {
          case "tags":
            return show.tagTokens;
          case "bestFor":
            return show.bestForTokens;
          case "completionStatus":
            return [show.completionStatus || "unclear"];
          case "reviewStatus":
            return [show.reviewStatus || "indexed-only"];
          default:
            return [];
        }
      })();

      return Array.from(selectedValues).some((value) => values.includes(value));
    });
  }

  function sortVisibleShows(visibleShows, selectedCollection) {
    const sortedShows = [...visibleShows];

    if (state.sortMode === "recently-updated") {
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

  function renderHomeResults() {
    previewController.closeActivePreview({ immediate: true });

    const selectedCollection = state.selectedCollectionId
      ? collectionsById.get(state.selectedCollectionId)
      : null;

    const visibleShows = sortVisibleShows(
      shows.filter((show) => {
        const matchesQuery = !state.query || show.searchText.includes(state.query);
        const matchesFilters = matchesSelectedFilters(show);
        const matchesCollection = !selectedCollection || selectedCollection.showIds.includes(show.id);
        return matchesQuery && matchesFilters && matchesCollection;
      }),
      selectedCollection,
    );

    archiveGrid.textContent = "";
    visibleShows.forEach((show) => {
      archiveGrid.appendChild(createShowCard(show, { previewMode: "inline-expand" }));
    });
    insertCollectionsSection(visibleShows.length);

    void syncCommunityCardBadges(archiveGrid, visibleShows);

    if (resultsSummary) {
      const fullReviewCount = visibleShows.filter((show) => show.reviewStatus === "full-review").length;
      const suffix = fullReviewCount === 1 ? "full review" : "full reviews";
      const collectionPrefix = selectedCollection ? `${selectedCollection.title} • ` : "";
      const modePrefix = state.sortMode === "recently-updated" ? "Recently updated • " : "";
      resultsSummary.textContent = `${collectionPrefix}${modePrefix}${visibleShows.length} results • ${fullReviewCount} ${suffix}`;
    }

    if (noResultsMsg) {
      noResultsMsg.hidden = visibleShows.length !== 0;
    }

    syncHomeControls();
  }

  function syncHomeControls() {
    const selectedCount = getActiveFilterCount();

    quickFiltersRoot.querySelectorAll(".quick-filter").forEach((button) => {
      const filter = button.dataset.chipFilter || "";
      const isActive =
        (filter === "all" &&
          selectedCount === 0 &&
          !state.selectedCollectionId &&
          state.sortMode === "default") ||
        (filter !== "all" && state.filters.tags.has(filter));

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    browseModesRoot.querySelectorAll(".browse-mode-button").forEach((button) => {
      const mode = button.dataset.browseMode || "default";
      const isActive = state.sortMode === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    filterOptionGrid.querySelectorAll(".filter-option").forEach((button) => {
      const groupId = button.dataset.filterGroup || "";
      const value = button.dataset.filterValue || "";
      const isActive = Boolean(state.filters[groupId]?.has(value));
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (filterCount) {
      filterCount.hidden = selectedCount === 0;
      filterCount.textContent = String(selectedCount);
    }

    if (filterClear) {
      filterClear.hidden = selectedCount === 0 && !state.selectedCollectionId && state.sortMode === "default";
    }
  }

  function insertCollectionsSection(visibleShowCount) {
    if (collectionsSection.hidden) {
      return;
    }

    const insertIndex = Math.min(visibleShowCount, getHomeGridColumnCount() * 2);
    const insertionPoint = archiveGrid.children[insertIndex] || null;
    archiveGrid.insertBefore(collectionsSection, insertionPoint);
  }

  function getHomeGridColumnCount() {
    if (window.matchMedia("(max-width: 1180px)").matches) {
      return 2;
    }

    return 6;
  }
}

function initializeHomePreviewController({ archiveGrid, archiveSection }) {
  const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
  const hoverlessPointerQuery = window.matchMedia("(hover: none)");
  const state = {
    activeShell: null,
    pendingShell: null,
    openTimer: 0,
    closeTimer: 0,
    hideTimer: 0,
    scrollStopTimer: 0,
    hoverShell: null,
    focusShell: null,
    isUserScrolling: false,
    lastPointerType: "mouse",
  };

  function getPreviewShell(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    return target.closest('.podcast-card-shell[data-preview-card="true"]');
  }

  function clearOpenTimer() {
    if (state.openTimer) {
      window.clearTimeout(state.openTimer);
      state.openTimer = 0;
    }

    state.pendingShell = null;
  }

  function clearCloseTimer() {
    if (state.closeTimer) {
      window.clearTimeout(state.closeTimer);
      state.closeTimer = 0;
    }
  }

  function clearHideTimer() {
    if (state.hideTimer) {
      window.clearTimeout(state.hideTimer);
      state.hideTimer = 0;
    }
  }

  function clearScrollStopTimer() {
    if (state.scrollStopTimer) {
      window.clearTimeout(state.scrollStopTimer);
      state.scrollStopTimer = 0;
    }
  }

  function getSourceCard(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".podcast-card-primary");
  }

  function getPreviewLayer(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".home-card-preview-layer");
  }

  function getPreviewPanel(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".home-card-preview");
  }

  function getPreviewOpenLink(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".preview-open-link");
  }

  function getPreviewCloseButton(shell) {
    if (!shell) {
      return null;
    }

    return shell.querySelector(".preview-close-button");
  }

  function isWithinPreview(target) {
    if (!(target instanceof Node)) {
      return false;
    }

    return state.activeShell?.contains(target) || false;
  }

  function hasFocusedPreviewTarget(shell) {
    const activeElement = document.activeElement;
    if (!shell || !(activeElement instanceof Element) || !shell.contains(activeElement)) {
      return false;
    }

    return !activeElement.closest(".home-card-preview-layer[hidden]");
  }

  function getEligibleOpenShell() {
    if (state.focusShell?.isConnected && hasFocusedPreviewTarget(state.focusShell)) {
      return state.focusShell;
    }

    if (state.hoverShell?.isConnected && state.hoverShell.matches(":hover")) {
      return state.hoverShell;
    }

    return null;
  }

  function syncSourceState(shell, isActive) {
    const card = getSourceCard(shell);
    if (!shell || !card) {
      return;
    }

    shell.classList.toggle("preview-source-active", isActive);
    card.setAttribute("aria-expanded", String(isActive));
  }

  function hideOverlayImmediately(shell) {
    const layer = getPreviewLayer(shell);
    const panel = getPreviewPanel(shell);
    const closeButton = getPreviewCloseButton(shell);
    const openLink = getPreviewOpenLink(shell);

    clearHideTimer();
    shell?.classList.remove("is-preview-expanded", "is-preview-closing", "is-preview-measuring");
    if (layer) {
      layer.hidden = true;
      layer.setAttribute("aria-hidden", "true");
    }
    if (panel) {
      panel.removeAttribute("data-preview-layout");
      panel.removeAttribute("data-preview-placement");
      panel.scrollTop = 0;
    }
    closeButton?.setAttribute("tabindex", "-1");
    openLink?.setAttribute("tabindex", "-1");
  }

  function closeShell(shell, { immediate = false, returnFocus = false } = {}) {
    if (!shell) {
      clearOpenTimer();
      clearCloseTimer();
      clearHideTimer();
      if (state.activeShell) {
        syncSourceState(state.activeShell, false);
        hideOverlayImmediately(state.activeShell);
      }
      state.activeShell = null;
      return;
    }

    const layer = getPreviewLayer(shell);
    const closeButton = getPreviewCloseButton(shell);
    const openLink = getPreviewOpenLink(shell);

    if (state.pendingShell === shell) {
      clearOpenTimer();
    }

    clearCloseTimer();
    clearHideTimer();
    syncSourceState(shell, false);

    if (state.activeShell === shell) {
      state.activeShell = null;
    }

    if (returnFocus && shell.contains(document.activeElement)) {
      getSourceCard(shell)?.focus();
    }

    if (immediate || !layer) {
      hideOverlayImmediately(shell);
      return;
    }

    shell.classList.remove("is-preview-expanded", "is-preview-measuring");
    shell.classList.add("is-preview-closing");
    layer.setAttribute("aria-hidden", "true");
    closeButton?.setAttribute("tabindex", "-1");
    openLink?.setAttribute("tabindex", "-1");
    state.hideTimer = window.setTimeout(() => {
      hideOverlayImmediately(shell);
    }, SHOW_CARD_PREVIEW_CLOSE_TRANSITION_MS);
  }

  function openShell(shell, { force = false } = {}) {
    if (!shell) {
      return;
    }

    const layer = getPreviewLayer(shell);
    const panel = getPreviewPanel(shell);
    const closeButton = getPreviewCloseButton(shell);
    const openLink = getPreviewOpenLink(shell);

    clearOpenTimer();
    clearCloseTimer();
    clearHideTimer();

    if (state.activeShell && state.activeShell !== shell) {
      closeShell(state.activeShell, { immediate: true });
    }

    if (!layer || !panel || !closeButton || !openLink) {
      return;
    }

    if (!force && (state.isUserScrolling || getEligibleOpenShell() !== shell)) {
      return;
    }

    layer.hidden = false;
    layer.setAttribute("aria-hidden", "false");
    closeButton.removeAttribute("tabindex");
    openLink.removeAttribute("tabindex");
    panel.scrollTop = 0;
    shell.classList.remove("is-preview-closing");
    shell.classList.add("is-preview-measuring");
    positionHomeCardPreview(shell, archiveGrid, archiveSection);
    syncSourceState(shell, true);

    state.activeShell = shell;
    window.requestAnimationFrame(() => {
      shell.classList.remove("is-preview-measuring");
      window.requestAnimationFrame(() => {
        shell.classList.add("is-preview-expanded");
      });
    });
  }

  function scheduleOpen(shell) {
    if (!shell) {
      return;
    }

    clearCloseTimer();

    if (state.activeShell === shell || state.isUserScrolling) {
      return;
    }

    clearOpenTimer();
    state.pendingShell = shell;
    state.openTimer = window.setTimeout(() => {
      openShell(shell);
    }, SHOW_CARD_PREVIEW_DELAY_MS);
  }

  function handleScrollActivity() {
    state.isUserScrolling = true;
    clearOpenTimer();
    clearScrollStopTimer();
    closeActivePreview({ immediate: true });
    state.scrollStopTimer = window.setTimeout(() => {
      state.isUserScrolling = false;
      const shell = getEligibleOpenShell();
      if (shell) {
        scheduleOpen(shell);
      }
    }, SHOW_CARD_PREVIEW_SCROLL_IDLE_MS);
  }

  function scheduleClose(shell, { immediate = false, returnFocus = false } = {}) {
    if (!shell) {
      return;
    }

    if (state.pendingShell === shell) {
      clearOpenTimer();
    }

    if (immediate) {
      closeShell(shell, { immediate: true, returnFocus });
      return;
    }

    clearCloseTimer();
    state.closeTimer = window.setTimeout(() => {
      closeShell(shell, { returnFocus });
    }, SHOW_CARD_PREVIEW_CLOSE_DELAY_MS);
  }

  function closeActivePreview({ immediate = false, returnFocus = false } = {}) {
    if (state.pendingShell && state.pendingShell !== state.activeShell) {
      clearOpenTimer();
    }

    if (!state.activeShell) {
      clearCloseTimer();
      return;
    }

    scheduleClose(state.activeShell, { immediate, returnFocus });
  }

  function isTouchLikeActivation(event) {
    if (event.detail === 0) {
      return false;
    }

    if (state.lastPointerType === "touch" || state.lastPointerType === "pen") {
      return true;
    }

    return coarsePointerQuery.matches || hoverlessPointerQuery.matches;
  }

  const handlePointerOver = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      state.lastPointerType = event.pointerType;
      return;
    }

    state.lastPointerType = "mouse";
    const shell = getPreviewShell(event.target);
    if (!shell) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && shell.contains(relatedTarget)) {
      return;
    }

    state.hoverShell = shell;
    scheduleOpen(shell);
  };

  const handlePointerOut = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") {
      return;
    }

    const shell = getPreviewShell(event.target);
    if (!shell) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && shell.contains(relatedTarget)) {
      return;
    }

    if (state.hoverShell === shell) {
      state.hoverShell = null;
    }
    scheduleClose(shell);
  };

  const handleFocusIn = (event) => {
    const shell = getPreviewShell(event.target);
    if (!shell) {
      return;
    }

    state.focusShell = shell;
    scheduleOpen(shell);
  };

  const handleFocusOut = (event) => {
    const shell = getPreviewShell(event.target);
    if (!shell) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && shell.contains(nextTarget)) {
      return;
    }

    if (state.focusShell === shell) {
      state.focusShell = null;
    }
    scheduleClose(shell, { immediate: true });
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (!state.activeShell || !isWithinPreview(event.target)) {
      return;
    }

    event.preventDefault();
    closeShell(state.activeShell, { immediate: true, returnFocus: true });
  };

  const handleCardClick = (event) => {
    const card = event.target instanceof Element ? event.target.closest(".podcast-card-primary") : null;
    if (!(card instanceof HTMLAnchorElement) || !archiveGrid.contains(card)) {
      return;
    }

    if (!isTouchLikeActivation(event)) {
      return;
    }

    const shell = getPreviewShell(card);
    if (!shell) {
      return;
    }

    event.preventDefault();
    openShell(shell, { force: true });
  };

  const handlePreviewCloseClick = (event) => {
    const closeButton = event.target instanceof Element ? event.target.closest(".preview-close-button") : null;
    if (!(closeButton instanceof HTMLButtonElement) || !archiveGrid.contains(closeButton)) {
      return;
    }

    const shell = getPreviewShell(closeButton);
    if (!shell) {
      return;
    }

    event.preventDefault();
    closeShell(shell, { immediate: true, returnFocus: event.detail === 0 });
  };

  const handleDocumentPointerDown = (event) => {
    if (event.pointerType) {
      state.lastPointerType = event.pointerType;
    }

    const activeShell = state.activeShell;
    const pendingShell = state.pendingShell;

    if (!activeShell && !pendingShell) {
      return;
    }

    const target = event.target;
    if (target instanceof Node && (activeShell?.contains(target) || pendingShell?.contains(target))) {
      return;
    }

    closeActivePreview({ immediate: true });
  };

  const handleViewportChange = () => {
    if (!state.activeShell) {
      return;
    }

    positionHomeCardPreview(state.activeShell, archiveGrid, archiveSection);
  };

  archiveGrid.addEventListener("pointerover", handlePointerOver);
  archiveGrid.addEventListener("pointerout", handlePointerOut);
  archiveGrid.addEventListener("focusin", handleFocusIn);
  archiveGrid.addEventListener("focusout", handleFocusOut);
  archiveGrid.addEventListener("keydown", handleKeyDown);
  archiveGrid.addEventListener("click", handlePreviewCloseClick);
  archiveGrid.addEventListener("click", handleCardClick);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  window.addEventListener("scroll", handleScrollActivity, { passive: true });
  window.addEventListener("wheel", handleScrollActivity, { passive: true });
  window.addEventListener("touchmove", handleScrollActivity, { passive: true });
  window.addEventListener("resize", handleViewportChange);

  return {
    closeActivePreview,
  };
}

function positionHomeCardPreview(shell, archiveGrid, archiveSection) {
  const panel = getShellPreviewPanel(shell);
  if (!panel) {
    return;
  }

  const shellRect = shell.getBoundingClientRect();
  const cardRect = shell.querySelector(".podcast-card-primary")?.getBoundingClientRect() || shellRect;
  const gridRect = archiveGrid.getBoundingClientRect();
  const sectionRect = archiveSection.getBoundingClientRect();
  const gridStyles = window.getComputedStyle(archiveGrid);
  const columnGap = Number.parseFloat(gridStyles.columnGap) || 24;
  const isStackedLayout = window.matchMedia("(max-width: 780px)").matches;
  const previewOffset = isStackedLayout ? 0 : 18;
  const viewportTopLimit = SHOW_CARD_PREVIEW_EDGE_GUTTER_PX;
  const viewportBottomLimit = window.innerHeight - SHOW_CARD_PREVIEW_EDGE_GUTTER_PX;
  const maxViewportHeight = Math.max(0, viewportBottomLimit - viewportTopLimit);
  let width = 0;
  let viewportLeft = 0;
  let viewportTop = 0;
  let placement = "below";
  let maxHeight = maxViewportHeight;
  const minHeight = Math.min(shellRect.height, maxViewportHeight);

  if (isStackedLayout) {
    width = Math.min(gridRect.width, window.innerWidth - SHOW_CARD_PREVIEW_EDGE_GUTTER_PX * 2);
    viewportLeft = Math.min(
      Math.max(gridRect.left, SHOW_CARD_PREVIEW_EDGE_GUTTER_PX),
      Math.max(SHOW_CARD_PREVIEW_EDGE_GUTTER_PX, window.innerWidth - SHOW_CARD_PREVIEW_EDGE_GUTTER_PX - width),
    );
  } else {
    const desiredWidth = Math.min(
      Math.max(shellRect.width * 2.6 + columnGap, 620),
      720,
      window.innerWidth - SHOW_CARD_PREVIEW_EDGE_GUTTER_PX * 2,
    );
    const centeredLeft = shellRect.left + shellRect.width / 2 - desiredWidth / 2;
    const minLeft = Math.max(gridRect.left, SHOW_CARD_PREVIEW_EDGE_GUTTER_PX);
    const maxLeft = Math.min(
      sectionRect.right - desiredWidth,
      window.innerWidth - SHOW_CARD_PREVIEW_EDGE_GUTTER_PX - desiredWidth,
    );
    width = desiredWidth;
    viewportLeft = Math.min(Math.max(centeredLeft, minLeft), Math.max(minLeft, maxLeft));
  }

  shell.style.setProperty("--preview-width", `${width}px`);
  shell.style.setProperty("--preview-left", `${viewportLeft - shellRect.left}px`);
  shell.style.setProperty("--preview-min-height", `${minHeight}px`);
  panel.dataset.previewLayout = isStackedLayout ? "stack" : "split";
  shell.style.setProperty("--preview-max-height", `${maxViewportHeight}px`);

  const naturalHeight = panel.scrollHeight || panel.getBoundingClientRect().height || 0;
  const preferredBelowTop = Math.max(isStackedLayout ? shellRect.top : shellRect.top - previewOffset, viewportTopLimit);
  const preferredAboveBottom = Math.min(shellRect.bottom + previewOffset, viewportBottomLimit);
  const availableBelow = Math.max(0, viewportBottomLimit - preferredBelowTop);
  const availableAbove = Math.max(0, preferredAboveBottom - viewportTopLimit);
  const belowFits = naturalHeight <= availableBelow;
  const aboveFits = naturalHeight <= availableAbove;

  if (!belowFits && (aboveFits || availableAbove > availableBelow)) {
    placement = "above";
  }

  if (placement === "above") {
    maxHeight = Math.min(maxViewportHeight, availableAbove, naturalHeight || availableAbove);
    viewportTop = Math.max(viewportTopLimit, preferredAboveBottom - maxHeight);
  } else {
    maxHeight = Math.min(maxViewportHeight, availableBelow, naturalHeight || availableBelow);
    viewportTop = Math.max(preferredBelowTop, viewportTopLimit);
    if (viewportTop + maxHeight > viewportBottomLimit) {
      viewportTop = Math.max(viewportTopLimit, viewportBottomLimit - maxHeight);
    }
  }

  panel.dataset.previewPlacement = placement;
  shell.style.setProperty("--preview-top", `${viewportTop - shellRect.top}px`);
  shell.style.setProperty("--preview-max-height", `${maxHeight}px`);

  const previewHeight = panel.getBoundingClientRect().height || maxHeight || 0;
  const startScaleX = clampValue(cardRect.width / width, 0.34, 0.58);
  const startScaleY = clampValue(cardRect.height / Math.max(previewHeight, 1), 0.34, 0.94);
  const startShiftX = cardRect.left - viewportLeft;
  const startShiftY = cardRect.top - viewportTop;

  shell.style.setProperty("--preview-top", `${viewportTop - shellRect.top}px`);
  shell.style.setProperty("--preview-start-scale-x", `${startScaleX}`);
  shell.style.setProperty("--preview-start-scale-y", `${startScaleY}`);
  shell.style.setProperty("--preview-shift-x", `${startShiftX}px`);
  shell.style.setProperty("--preview-shift-y", `${startShiftY}px`);
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatInlineTagList(tags, maxItems) {
  return tags
    .slice(0, maxItems)
    .map((tag) => toDisplayTag(tag))
    .join(" • ");
}

function createShowCard(show, { previewMode = "" } = {}) {
  const shell = document.createElement("div");
  shell.className = "podcast-card-shell";
  shell.dataset.podcastId = show.id;
  if (previewMode === "inline-expand") {
    shell.dataset.previewCard = "true";
  }

  const previewId = previewMode === "inline-expand" ? buildHomeCardPreviewId(show.id) : "";
  const card = createShowCardPrimary(show, {
    isPreviewTrigger: previewMode === "inline-expand",
    previewId,
  });
  shell.append(card);
  if (previewMode === "inline-expand") {
    shell.append(createHomeCardPreviewPanel(show, previewId));
  }
  return shell;
}

function createShowCardPrimary(show, { isPreviewTrigger = false, previewId = "" } = {}) {
  const card = document.createElement("a");
  card.className = isPreviewTrigger ? "podcast-card podcast-card-primary" : "podcast-card";
  card.href = show.href;
  card.dataset.podcastId = show.id;
  if (isPreviewTrigger) {
    card.setAttribute("aria-controls", previewId);
    card.setAttribute("aria-expanded", "false");
  }

  const image = document.createElement("img");
  image.src = show.cover;
  image.alt = show.coverAlt;

  const editorialBadges = createEditorialBadges(show);

  const title = document.createElement("h2");
  title.textContent = show.title;

  const tags = document.createElement("p");
  tags.className = "tags";
  tags.textContent = formatInlineTagList(show.tags, 2);
  tags.hidden = !tags.textContent;

  const rating = document.createElement("div");
  rating.className = "rating";

  rating.append(
    createArchiveScoreElement(show, { showLabel: false }),
    createRatingDividerElement(),
    createCommunityScoreElement(show, { showLabel: false }),
  );
  card.append(editorialBadges, image, title, tags, rating);
  return card;
}

function createArchiveScoreElement(show, { showLabel = true } = {}) {
  const archiveRating = document.createElement("div");
  archiveRating.className = "archive-inline-score";
  archiveRating.innerHTML = `
    <span class="inline-score-topline">
      <span class="inline-score-icon archive-score-icon" aria-hidden="true">★</span>
      <span class="inline-score-value">${formatRating(show.finalRating)}/10</span>
    </span>
    ${showLabel ? '<span class="inline-score-label">Archive Rating</span>' : ""}
  `;
  return archiveRating;
}

function createCommunityScoreElement(show, { showLabel = true } = {}) {
  const communityBadge = document.createElement("div");
  communityBadge.className = "community-inline-score";
  communityBadge.dataset.podcastId = show.id;
  communityBadge.dataset.fallbackRating = String(formatRating(show.finalRating));
  communityBadge.hidden = false;
  communityBadge.setAttribute("aria-label", `Community score ${formatRating(show.finalRating)}/10`);
  communityBadge.innerHTML = `
    <span class="inline-score-topline">
      <svg viewBox="0 0 28 24" aria-hidden="true" focusable="false">
        <rect x="1.5" y="9" width="2.5" height="6" rx="1.25" />
        <rect x="5.75" y="6.5" width="2.5" height="11" rx="1.25" />
        <rect x="10" y="2.75" width="2.5" height="18.5" rx="1.25" />
        <rect x="14.25" y="7.75" width="2.5" height="8.5" rx="1.25" />
        <rect x="18.5" y="1.5" width="2.5" height="21" rx="1.25" />
        <rect x="22.75" y="6.5" width="2.5" height="11" rx="1.25" />
      </svg>
      <span class="community-inline-score-value">${formatRating(show.finalRating)}/10</span>
    </span>
    ${showLabel ? '<span class="inline-score-label">Community Rating</span>' : ""}
  `;
  return communityBadge;
}

function createRatingDividerElement() {
  const ratingDivider = document.createElement("span");
  ratingDivider.className = "rating-divider";
  ratingDivider.setAttribute("aria-hidden", "true");
  return ratingDivider;
}

function syncInlineScoreGroup(group) {
  if (!group) {
    return;
  }

  const divider = group.querySelector(".rating-divider");
  const archiveScore = group.querySelector(".archive-inline-score");
  const communityScore = group.querySelector(".community-inline-score");
  if (!divider || !archiveScore) {
    return;
  }

  divider.hidden = !communityScore || communityScore.hidden;
}

function buildHomeCardPreviewId(value) {
  return `${HOME_CARD_PREVIEW_ID_PREFIX}-${String(value).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function getShellPreviewPanel(shell) {
  if (!shell) {
    return null;
  }

  return shell.querySelector(".home-card-preview");
}

function createHomeCardPreviewPanel(show, previewId) {
  const layer = document.createElement("div");
  layer.className = "home-card-preview-layer";
  layer.hidden = true;
  layer.setAttribute("aria-hidden", "true");

  const panel = document.createElement("article");
  panel.className = "home-card-preview";
  panel.id = previewId;
  panel.dataset.podcastId = show.id;
  panel.setAttribute("role", "group");

  const titleId = `${previewId}-title`;
  panel.setAttribute("aria-labelledby", titleId);

  const closeButton = document.createElement("button");
  closeButton.className = "preview-close-button";
  closeButton.type = "button";
  closeButton.setAttribute("tabindex", "-1");
  closeButton.setAttribute("aria-label", `Close the ${show.title} archive preview`);
  closeButton.textContent = "Close";

  const media = document.createElement("div");
  media.className = "home-card-preview-media";

  const image = document.createElement("img");
  image.src = show.cover;
  image.alt = show.coverAlt;
  media.appendChild(image);

  const content = document.createElement("div");
  content.className = "home-card-preview-content";

  const kicker = document.createElement("p");
  kicker.className = "home-card-preview-kicker";
  kicker.textContent = "Archive entry";

  const title = document.createElement("h3");
  title.className = "home-card-preview-title";
  title.id = titleId;
  title.textContent = show.title;

  const accentRule = document.createElement("span");
  accentRule.className = "home-card-preview-rule";
  accentRule.setAttribute("aria-hidden", "true");

  const copy = document.createElement("div");
  copy.className = "home-card-preview-copy";

  const lead = document.createElement("p");
  lead.className = "preview-lead";
  lead.textContent = String(show.subtitle || "").trim();
  lead.hidden = !lead.textContent;

  const goodFor = document.createElement("p");
  goodFor.className = "preview-good-for";

  const goodForLabel = document.createElement("span");
  goodForLabel.className = "preview-good-for-label";
  goodForLabel.textContent = "Good for:";
  const goodForText = document.createElement("span");
  const bestForValues = show.bestFor.slice(0, 3).map((value) => toDisplayTag(value));
  goodForText.textContent = bestForValues.length > 0 ? ` ${bestForValues.join(", ")}` : "";
  goodFor.append(goodForLabel, goodForText);
  goodFor.hidden = bestForValues.length === 0;

  const previewTags = document.createElement("div");
  previewTags.className = "preview-tags";
  previewTags.textContent = formatInlineTagList(show.tags, 3);
  previewTags.hidden = !previewTags.textContent;

  const footer = document.createElement("div");
  footer.className = "home-card-preview-footer";

  const ratings = document.createElement("div");
  ratings.className = "home-card-preview-ratings";
  ratings.append(
    createArchiveScoreElement(show),
    createRatingDividerElement(),
    createCommunityScoreElement(show),
  );
  syncInlineScoreGroup(ratings);
  footer.appendChild(ratings);

  const openLink = document.createElement("a");
  openLink.className = "preview-open-link";
  openLink.href = show.href;
  openLink.setAttribute("tabindex", "-1");
  openLink.setAttribute("aria-label", `Open the ${show.title} archive page`);
  const openText = document.createElement("span");
  openText.textContent = "Open archive";
  const openArrow = document.createElement("span");
  openArrow.className = "preview-open-link-arrow";
  openArrow.setAttribute("aria-hidden", "true");
  openArrow.textContent = "→";
  openLink.append(openText, openArrow);
  footer.appendChild(openLink);

  copy.append(lead, goodFor, previewTags);
  content.append(kicker, title, accentRule, copy);
  panel.append(closeButton, media, content, footer);
  layer.appendChild(panel);

  return layer;
}

function createEditorialBadges(show) {
  const badges = document.createElement("div");
  badges.className = "editorial-badges";
  badges.setAttribute("aria-hidden", "true");

  if ((show.finalRating || 0) >= 9) {
    const topRatedBadge = document.createElement("span");
    topRatedBadge.className = "editorial-badge editorial-badge-corner";
    const topRatedArtwork = document.createElement("img");
    topRatedArtwork.className = "editorial-badge-artwork";
    topRatedArtwork.src = TOP_RATED_BADGE_ASSET_URL;
    topRatedArtwork.alt = "";
    topRatedBadge.appendChild(topRatedArtwork);
    badges.appendChild(topRatedBadge);
  }

  if (show.reviewStatus === "full-review") {
    const fullReviewBadge = document.createElement("span");
    fullReviewBadge.className = "editorial-badge editorial-badge-ribbon";
    const fullReviewLabel = document.createElement("span");
    fullReviewLabel.className = "editorial-badge-ribbon-label";
    fullReviewLabel.textContent = "Full review";
    fullReviewBadge.appendChild(fullReviewLabel);
    badges.appendChild(fullReviewBadge);
  }

  return badges;
}

function getCollectionShowReason(collection, showId) {
  const reason = collection?.showReasons?.[showId];
  return typeof reason === "string" && reason.trim() ? reason.trim() : "";
}

function createCollectionShowCard(show, reason = "") {
  const shell = createShowCard(show);
  if (!reason) {
    return shell;
  }

  const reasonNode = document.createElement("p");
  reasonNode.className = "collection-card-reason";
  reasonNode.textContent = reason;
  shell.appendChild(reasonNode);
  return shell;
}

async function initializeShowPage() {
  const shows = await loadShows();
  const showMap = buildShowMap(shows);
  const showRoot = document.getElementById("showRoot");

  if (!showRoot) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const showId = params.get("id") || "";
  const show = showMap.get(showId);

  if (!show) {
    renderMissingShowPage(showRoot);
    return;
  }

  document.body.style.setProperty("--detail-accent", show.accent?.hex || "#e54838");
  document.body.style.setProperty("--detail-accent-rgb", show.accent?.rgb || "229, 72, 56");
  updateDocumentMetadata({
    title: `${show.title} - The Echo Archives`,
    description: show.description,
    path: `/show.html?id=${encodeURIComponent(show.id)}`,
    image: `/${show.cover}`,
  });

  showRoot.innerHTML = createShowPageMarkup(show, showMap);
  const detailRoot = showRoot.querySelector(".podcast-detail");
  if (detailRoot) {
    detailRoot.dataset.podcastId = show.id;
    detailRoot.dataset.podcastTitle = show.title;
    await initializeDetailRatingPage(show);
  }
}

function renderMissingShowPage(showRoot) {
  updateDocumentMetadata({
    title: "Show not found - The Echo Archives",
    description: "The requested Echo Archives show page could not be found.",
    path: "/show.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  showRoot.innerHTML = `
    <section class="detail-main podcast-detail">
      <section class="detail-section detail-empty-state">
        <div class="detail-section-header">
          <div>
            <h1>Show not found</h1>
            <p>The requested archive entry is missing or has not been published yet.</p>
          </div>
        </div>
        <a class="detail-primary-action" href="/index.html#browse">Back to the archive</a>
      </section>
    </section>
  `;
}

async function initializeCollectionsPage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  updateDocumentMetadata({
    title: "Collections - The Echo Archives",
    description: "Browse every curated discovery collection in The Echo Archives.",
    path: "/collections.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  const publishedShows = getPublishedShows(shows);
  const showMap = buildShowMap(publishedShows);
  const directoryRoot = document.getElementById("collectionsDirectory");

  if (!directoryRoot) {
    return;
  }

  const featuredCount = collections.filter((collection) => collection.featured).length;
  const coveredShowIds = new Set(collections.flatMap((collection) => collection.showIds));
  const latestUpdatedAt = collections
    .map((collection) => collection.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  setTextContent("collectionsCount", String(collections.length));
  setTextContent("collectionsFeaturedCount", String(featuredCount));
  setTextContent("collectionsShowReach", String(coveredShowIds.size));
  setTextContent("collectionsLastUpdated", latestUpdatedAt ? formatDate(latestUpdatedAt) : "Unknown");

  const featuredCollections = collections.filter((collection) => collection.featured);
  const standardCollections = collections.filter((collection) => !collection.featured);

  directoryRoot.textContent = "";

  featuredCollections.forEach((collection) => {
    directoryRoot.appendChild(createCollectionDirectoryCard(collection, getCollectionShows(collection, showMap)));
  });

  if (featuredCollections.length > 0 && standardCollections.length > 0) {
    directoryRoot.appendChild(createCollectionDirectoryDivider());
  }

  standardCollections.forEach((collection) => {
    directoryRoot.appendChild(createCollectionDirectoryCard(collection, getCollectionShows(collection, showMap)));
  });
}

function createCollectionDirectoryCard(collection, shows) {
  const article = document.createElement("article");
  article.className = "page-card collection-directory-card";

  const kicker = document.createElement("p");
  kicker.className = "page-card-kicker";
  kicker.textContent = collection.featured ? "Featured collection" : "Collection";

  const title = document.createElement("h2");
  title.textContent = collection.title;

  const description = document.createElement("p");
  description.textContent = collection.description;

  const meta = document.createElement("p");
  meta.className = "collection-directory-meta";
  meta.textContent = `${shows.length} shows • ${collection.kind || "curated"}`;

  const actions = document.createElement("div");
  actions.className = "collection-directory-actions";

  const collectionLink = document.createElement("a");
  collectionLink.className = "collection-action";
  collectionLink.href = createCollectionHref(collection.id);
  collectionLink.textContent = "Open collection";

  const archiveLink = document.createElement("a");
  archiveLink.className = "collection-secondary-link";
  archiveLink.href = createArchiveCollectionHref(collection.id);
  archiveLink.textContent = "Browse in archive";

  actions.append(collectionLink, archiveLink);
  article.append(kicker, title, description, meta, actions);
  return article;
}

function createCollectionDirectoryDivider() {
  const divider = document.createElement("div");
  divider.className = "collection-directory-divider";
  divider.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "collection-directory-divider-label";
  label.textContent = "More collections";

  divider.appendChild(label);
  return divider;
}

async function initializeCollectionPage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  const publishedShows = getPublishedShows(shows);
  const showMap = buildShowMap(publishedShows);
  const collectionMap = buildCollectionMap(collections);

  const collectionId = new URLSearchParams(window.location.search).get("id") || "";
  const collection = collectionMap.get(collectionId);
  const root = document.getElementById("collectionRoot");
  const grid = document.getElementById("collectionShowGrid");
  const archiveSection = document.getElementById("collectionArchiveSection");

  if (!root || !grid || !archiveSection) {
    return;
  }

  if (!collection) {
    updateDocumentMetadata({
      title: "Collection not found - The Echo Archives",
      description: "The requested Echo Archives collection could not be found.",
      path: "/collection.html",
      image: DEFAULT_SOCIAL_IMAGE,
    });
    root.innerHTML = `
      <article class="page-card">
        <h2>Collection not found</h2>
        <p>The requested collection is missing or has not been published yet.</p>
        <div class="collection-directory-actions">
          <a class="collection-action" href="/collections.html">Browse collections</a>
          <a class="collection-secondary-link" href="/index.html#archive">Back to archive</a>
        </div>
      </article>
    `;
    archiveSection.remove();
    return;
  }

  const collectionShows = getCollectionShows(collection, showMap);
  const firstCover = collectionShows[0]?.cover ? `/${collectionShows[0].cover}` : DEFAULT_SOCIAL_IMAGE;
  updateDocumentMetadata({
    title: `${collection.title} - The Echo Archives`,
    description: collection.description,
    path: `/collection.html?id=${encodeURIComponent(collection.id)}`,
    image: firstCover,
  });

  setTextContent("collectionTitle", collection.title);
  setTextContent("collectionDescription", collection.description);
  setTextContent("collectionShowCount", String(collectionShows.length));
  setTextContent("collectionKind", toDisplayTag(collection.kind || "curated"));
  setTextContent("collectionFeatured", collection.featured ? "Yes" : "No");
  setTextContent("collectionLastUpdated", collection.updatedAt ? formatDate(collection.updatedAt) : "Unknown");

  const archiveLink = document.getElementById("collectionArchiveLink");
  if (archiveLink) {
    archiveLink.href = createArchiveCollectionHref(collection.id);
  }

  grid.textContent = "";
  collectionShows.forEach((show) => {
    grid.appendChild(createCollectionShowCard(show, getCollectionShowReason(collection, show.id)));
  });
  void syncCommunityCardBadges(grid, collectionShows);
}

function createShowPageMarkup(show, showMap) {
  const statusChips = [];
  if ((show.finalRating || 0) >= 9) {
    statusChips.push('<span class="detail-status-chip is-accent">Top rated</span>');
  }
  if (show.reviewStatus === "full-review") {
    statusChips.push('<span class="detail-status-chip">Full review</span>');
  }
  if (show.tags[0]) {
    statusChips.push(`<span class="detail-status-chip">${escapeHtml(toDisplayTag(show.tags[0]))}</span>`);
  }

  return `
    <section class="detail-main podcast-detail">
      <section class="detail-hero-shell">
        <div class="detail-hero-panel" style="--detail-cover-image: url('${escapeHtml(show.cover)}');">
          <div class="detail-breadcrumbs">
            <a href="/index.html">Archive</a>
            <span class="detail-breadcrumb-divider">/</span>
            <span>${escapeHtml(show.title)}</span>
          </div>

          <div class="detail-hero-grid">
            <div class="detail-hero-copy">
              <div class="detail-status-row">
                ${statusChips.join("")}
              </div>

              <header class="podcast-header">
                <h1>${escapeHtml(show.title)}</h1>
              </header>

              <p>${escapeHtml(show.description)}</p>

              <div class="detail-meta-grid">
                ${renderMetaCard("Archive rating", `${formatRating(show.finalRating)}/10`)}
                ${renderMetaCard("Runtime", escapeHtml(getRuntimeLabel(show)))}
                ${renderMetaCard("Format", escapeHtml(getFormatLabel(show)))}
              </div>

              <div class="detail-tag-list" aria-label="Tags">
                ${show.tags.map((tag) => `<span class="detail-tag">${escapeHtml(toDisplayTag(tag))}</span>`).join("")}
              </div>

              <div class="detail-actions">
                <a class="detail-primary-action" href="#archive-snapshot">Archive snapshot</a>
                <a class="detail-secondary-action" href="#listen-links">Listen links</a>
              </div>
            </div>

            <div class="detail-cover-column">
              <div class="detail-cover-card">
                <img src="/${escapeHtml(show.cover)}" alt="${escapeHtml(show.coverAlt)}" />
              </div>
              <article class="detail-highlight-card">
                <h2>Archive take</h2>
                <p>${escapeHtml(show.archiveTake || show.description)}</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <div class="detail-layout">
        ${renderSnapshotSection(show)}
        ${renderRatingsSection(show)}
        ${renderQuoteSection(show)}
        ${renderReviewSection(show)}
        ${renderListenSection(show)}
        ${renderSimilarSection(show, showMap)}
      </div>
    </section>
  `;
}

function renderMetaCard(label, value) {
  return `
    <article class="detail-meta-card">
      <span class="detail-meta-label">${label}</span>
      <span class="detail-meta-value">${value}</span>
    </article>
  `;
}

function renderSnapshotSection(show) {
  const cards = [];

  if (show.reviewStatus === "full-review") {
    cards.push(createFactCard("Review status", "Full review"));
  }
  cards.push(createFactCard("Release", toDisplayTag(show.releaseStatus || "unknown")));
  cards.push(createFactCard("Completion", toDisplayTag(show.completionStatus || "unclear")));
  cards.push(createFactCard("Structure", show.facts?.structure || "Still being cataloged."));
  cards.push(createFactCard("Narration", show.facts?.narrator || "Still being cataloged."));
  cards.push(createFactCard("Ads", show.facts?.ads || "Still being cataloged."));

  if (show.facts?.favoriteRun) {
    cards.push(createFactCard("Favorite run", show.facts.favoriteRun));
  }

  if (typeof show.facts?.wouldRelisten === "boolean") {
    cards.push(createFactCard("Re-listen", show.facts.wouldRelisten ? "Yes." : "No."));
  }

  if (show.reviewStatus !== "full-review") {
    cards.push(
      createFactCard(
        "Archive note",
        "Full review not published yet. This page stays live so the archive can index and recommend the show now.",
      ),
    );
  }

  return `
    <section class="detail-section" id="archive-snapshot">
      <div class="detail-section-header">
        <div>
          <h2>Archive snapshot</h2>
          <p>Quick context before you decide whether to commit time to this one.</p>
        </div>
      </div>

      <div class="detail-fact-grid">
        ${cards.join("")}
      </div>
    </section>
  `;
}

function createFactCard(title, value) {
  return `
    <article class="detail-fact-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(value)}</p>
    </article>
  `;
}

function renderRatingsSection(show) {
  const ratingEntries = Object.entries(show.ratings || {}).filter(([key]) => key !== "archive");
  if (ratingEntries.length === 0) {
    return "";
  }

  return `
    <section class="detail-section">
      <div class="detail-section-header">
        <div>
          <h2>Score breakdown</h2>
          <p>Where the show wins outright and where it simply stays solid.</p>
        </div>
      </div>

      <div class="detail-ratings-grid">
        ${ratingEntries
          .map(([key, value]) => {
            const numericValue = Number(value);
            const width = Math.max(0, Math.min(100, numericValue * 10));
            return `
              <article class="detail-rating-card">
                <div class="detail-rating-topline"><span>${escapeHtml(toLabel(key))}</span><span>${formatRating(
                  numericValue,
                )}/10</span></div>
                <div class="detail-rating-bar"><div class="detail-rating-fill" style="width: ${width}%"></div></div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderQuoteSection(show) {
  if (!show.quote?.text) {
    return "";
  }

  return `
    <blockquote class="detail-quote">
      &ldquo;${escapeHtml(show.quote.text)}&rdquo;
      <cite>${escapeHtml(show.quote.attribution || "Archive note")}</cite>
    </blockquote>
  `;
}

function renderReviewSection(show) {
  if (show.reviewStatus === "full-review") {
    return `
      <section class="detail-section" id="review-notes">
        <div class="detail-section-header">
          <div>
            <h2>Review notes</h2>
            <p>The spoiler-free read on why the show works and what kind of listener it fits.</p>
          </div>
        </div>

        <div class="detail-review-grid">
          <article class="detail-summary">
            <h3>Spoiler-free review</h3>
            <p>${escapeHtml(show.spoilerFreeReview || show.description)}</p>
          </article>
          <article class="detail-thoughts">
            <h3>Archive reaction</h3>
            <p>${escapeHtml(show.thoughts || show.archiveTake || show.description)}</p>
          </article>
        </div>
      </section>
    `;
  }

  return `
    <section class="detail-section" id="review-notes">
      <div class="detail-section-header">
        <div>
          <h2>Archive note</h2>
          <p>This show is indexed and recommendation-ready, but the long-form review has not been published yet.</p>
        </div>
      </div>

      <div class="detail-review-grid detail-review-grid-single">
        <article class="detail-summary">
          <h3>Why it is here</h3>
          <p>${escapeHtml(show.archiveTake || show.description)}</p>
        </article>
      </div>
    </section>
  `;
}

function renderListenSection(show) {
  const links = Object.entries(show.listenLinks || {}).filter(([, value]) => Boolean(value));
  const linkMarkup =
    links.length > 0
      ? links
          .map(
            ([key, value]) =>
              `<a class="detail-secondary-action" href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(
                toLabel(key),
              )}</a>`,
          )
          .join("")
      : '<p class="detail-section-intro">Listen links are still being verified for this entry.</p>';

  return `
    <section class="detail-section" id="listen-links">
      <div class="detail-section-header">
        <div>
          <h2>Listen links</h2>
          <p>Archive-ready linking support is built now, even where the specific destinations still need to be filled in.</p>
        </div>
      </div>

      <div class="detail-actions detail-actions-wrap">
        ${linkMarkup}
      </div>
    </section>
  `;
}

function renderSimilarSection(show, showMap) {
  const neighbors = show.similarTo.map((id) => showMap.get(id)).filter(Boolean);
  if (neighbors.length === 0) {
    return "";
  }

  return `
    <section class="detail-section">
      <div class="detail-section-header">
        <div>
          <h2>Start next</h2>
          <p>Closest neighboring picks in the archive once you finish this one.</p>
        </div>
      </div>

      <div class="detail-similar-grid">
        ${neighbors
          .map(
            (neighbor) => `
              <article class="detail-similar-card">
                <img src="/${escapeHtml(neighbor.cover)}" alt="${escapeHtml(neighbor.coverAlt)}" />
                <div class="detail-card-copy">
                  <h3>${escapeHtml(neighbor.title)}</h3>
                  ${getSimilarReason(show, neighbor.id) ? `<p class="detail-similar-reason">${escapeHtml(getSimilarReason(show, neighbor.id))}</p>` : ""}
                  <p>${escapeHtml(neighbor.archiveTake || neighbor.description)}</p>
                  <a class="detail-archive-link" href="${escapeHtml(neighbor.href)}">Open show</a>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function getSimilarReason(show, neighborId) {
  const reason = show?.similarReasons?.[neighborId];
  return typeof reason === "string" && reason.trim() ? reason.trim() : "";
}

async function initializeAboutPage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  updateDocumentMetadata({
    title: "About - The Echo Archives",
    description: "How The Echo Archives curates fiction podcasts, handles ratings, and keeps the catalog trustworthy.",
    path: "/about.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  applyArchiveStats("about", getArchiveStats(shows, collections));
}

async function initializeSubmitPage() {
  updateDocumentMetadata({
    title: "Submit a Show - The Echo Archives",
    description: "Submit a show, send a correction, share a listener review, or verify facts for The Echo Archives.",
    path: "/submit.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  const form = document.getElementById("showSubmitForm");
  const status = document.getElementById("submitStatus");
  const submissionType = document.getElementById("submissionType");
  const submissionHelp = document.getElementById("submissionHelp");
  const existingShowField = document.getElementById("existingShowField");
  const existingShowId = document.getElementById("existingShowId");
  const showTitleInput = document.getElementById("showTitleInput");
  const showTitleLabel = document.getElementById("showTitleLabel");
  const creatorField = document.getElementById("creatorField");
  const officialSiteField = document.getElementById("officialSiteField");
  const rssField = document.getElementById("rssField");
  const genresField = document.getElementById("genresField");
  const listenerRatingField = document.getElementById("listenerRatingField");
  const listenerSpoilerLevelField = document.getElementById("listenerSpoilerLevelField");
  const listenerReviewField = document.getElementById("listenerReviewField");
  const verificationSourcesField = document.getElementById("verificationSourcesField");
  const provenanceNotesField = document.getElementById("provenanceNotesField");
  const notesField = document.getElementById("notesField");
  const notesLabel = document.getElementById("notesLabel");
  if (
    !form ||
    !status ||
    !submissionType ||
    !submissionHelp ||
    !existingShowField ||
    !existingShowId ||
    !(showTitleInput instanceof HTMLInputElement) ||
    !showTitleLabel ||
    !creatorField ||
    !officialSiteField ||
    !rssField ||
    !genresField ||
    !listenerRatingField ||
    !listenerSpoilerLevelField ||
    !listenerReviewField ||
    !verificationSourcesField ||
    !provenanceNotesField ||
    !notesField ||
    !notesLabel
  ) {
    return;
  }

  const shows = await loadShows();
  const publishedShows = getPublishedShows(shows).sort((left, right) => left.title.localeCompare(right.title));
  publishedShows.forEach((show) => {
    const option = document.createElement("option");
    option.value = show.id;
    option.textContent = show.title;
    existingShowId.appendChild(option);
  });

  const creatorInput = creatorField.querySelector("input");
  const officialSiteInput = officialSiteField.querySelector("input");
  const rssOrListenInput = rssField.querySelector("input");
  const genresInput = genresField.querySelector("input");
  const listenerRatingInput = listenerRatingField.querySelector("select");
  const listenerSpoilerLevelInput = listenerSpoilerLevelField.querySelector("select");
  const listenerReviewInput = listenerReviewField.querySelector("textarea");
  const verificationSourcesInput = verificationSourcesField.querySelector("textarea");
  const provenanceNotesInput = provenanceNotesField.querySelector("textarea");
  const notesInput = notesField.querySelector("textarea");

  const modeConfig = {
    show: {
      help: "New-show submissions need enough links and context for the archive to verify the entry.",
      showTitleLabel: "Show title",
      notesLabel: "Why it belongs in the archive",
      notesPlaceholder: "Give the archive context about tone, format, strengths, and who it fits.",
      requiresExistingShow: false,
      lockTitle: false,
      visibleFields: ["creator", "officialSite", "rss", "genres", "notes"],
      requiredFields: [],
    },
    correction: {
      help: "Correction requests stay manual. Point to the existing entry and explain exactly what needs to change.",
      showTitleLabel: "Archive entry title",
      notesLabel: "Correction details",
      notesPlaceholder: "Describe the factual issue and what should replace it.",
      requiresExistingShow: true,
      lockTitle: true,
      visibleFields: ["notes"],
      requiredFields: ["notes"],
    },
    "listener-review": {
      help: "Listener reviews enter moderation before anything is surfaced publicly. Keep the spoiler level honest.",
      showTitleLabel: "Reviewed show",
      notesLabel: "Extra notes for the archive",
      notesPlaceholder: "Optional context for moderation, edits, or edge cases.",
      requiresExistingShow: true,
      lockTitle: true,
      visibleFields: ["listenerRating", "listenerSpoilerLevel", "listenerReview", "notes"],
      requiredFields: ["listenerRating", "listenerReview"],
    },
    "creator-verification": {
      help: "Creator verification is for factual metadata only. Include source links so the archive can confirm the update.",
      showTitleLabel: "Archive entry title",
      notesLabel: "Verification context",
      notesPlaceholder: "Optional background for the archive reviewer.",
      requiresExistingShow: true,
      lockTitle: true,
      visibleFields: ["creator", "officialSite", "verificationSources", "provenanceNotes", "notes"],
      requiredFields: ["verificationSources", "provenanceNotes"],
    },
  };

  const fieldRegistry = {
    creator: creatorField,
    officialSite: officialSiteField,
    rss: rssField,
    genres: genresField,
    listenerRating: listenerRatingField,
    listenerSpoilerLevel: listenerSpoilerLevelField,
    listenerReview: listenerReviewField,
    verificationSources: verificationSourcesField,
    provenanceNotes: provenanceNotesField,
    notes: notesField,
  };

  function setFieldHidden(field, hidden) {
    field.hidden = hidden;
    field.querySelectorAll("input, textarea, select").forEach((control) => {
      if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement) && !(control instanceof HTMLSelectElement)) {
        return;
      }

      control.disabled = hidden;
      if (hidden) {
        control.required = false;
      }
    });
  }

  function syncSubmissionMode() {
    const mode = modeConfig[submissionType.value] || modeConfig.show;
    submissionHelp.textContent = mode.help;
    showTitleLabel.textContent = mode.showTitleLabel;
    notesLabel.textContent = mode.notesLabel;
    if (notesInput instanceof HTMLTextAreaElement) {
      notesInput.placeholder = mode.notesPlaceholder;
    }

    existingShowField.hidden = !mode.requiresExistingShow;
    existingShowId.disabled = !mode.requiresExistingShow;
    existingShowId.required = mode.requiresExistingShow;
    showTitleInput.readOnly = mode.lockTitle;

    Object.entries(fieldRegistry).forEach(([key, field]) => {
      setFieldHidden(field, !mode.visibleFields.includes(key));
    });

    if (creatorInput instanceof HTMLInputElement) {
      creatorInput.required = false;
    }
    if (officialSiteInput instanceof HTMLInputElement) {
      officialSiteInput.required = false;
    }
    if (rssOrListenInput instanceof HTMLInputElement) {
      rssOrListenInput.required = false;
    }
    if (genresInput instanceof HTMLInputElement) {
      genresInput.required = false;
    }
    if (listenerRatingInput instanceof HTMLSelectElement) {
      listenerRatingInput.required = mode.requiredFields.includes("listenerRating");
    }
    if (listenerSpoilerLevelInput instanceof HTMLSelectElement) {
      listenerSpoilerLevelInput.required = false;
    }
    if (listenerReviewInput instanceof HTMLTextAreaElement) {
      listenerReviewInput.required = mode.requiredFields.includes("listenerReview");
    }
    if (verificationSourcesInput instanceof HTMLTextAreaElement) {
      verificationSourcesInput.required = mode.requiredFields.includes("verificationSources");
    }
    if (provenanceNotesInput instanceof HTMLTextAreaElement) {
      provenanceNotesInput.required = mode.requiredFields.includes("provenanceNotes");
    }
    if (notesInput instanceof HTMLTextAreaElement) {
      notesInput.required = mode.requiredFields.includes("notes");
    }

    if (mode.requiresExistingShow) {
      const selectedOption = existingShowId.selectedOptions[0];
      if (selectedOption?.textContent && (!showTitleInput.value || showTitleInput.dataset.autoFilled === "true")) {
        showTitleInput.value = selectedOption.textContent;
        showTitleInput.dataset.autoFilled = "true";
      }
      return;
    }

    showTitleInput.dataset.autoFilled = "false";
  }

  submissionType.addEventListener("change", syncSubmissionMode);
  showTitleInput.addEventListener("input", () => {
    showTitleInput.dataset.autoFilled = "false";
  });
  existingShowId.addEventListener("change", () => {
    const selectedOption = existingShowId.selectedOptions[0];
    if (!selectedOption?.textContent) {
      return;
    }

    showTitleInput.value = selectedOption.textContent;
    showTitleInput.dataset.autoFilled = "true";
  });

  syncSubmissionMode();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
      submitButton.textContent = "Submitting...";
    }

    const formData = new FormData(form);
    const mode = formData.get("submissionType");
    const pendingLabel = (() => {
      switch (mode) {
        case "correction":
          return "Sending your correction into the archive queue...";
        case "listener-review":
          return "Sending your listener review into moderation...";
        case "creator-verification":
          return "Sending your verification request into moderation...";
        default:
          return "Sending your show to the archive queue...";
      }
    })();
    status.textContent = pendingLabel;
    status.dataset.state = "pending";

    const payload = {
      submissionType: mode,
      existingShowId: formData.get("existingShowId"),
      showTitle: formData.get("showTitle"),
      creatorName: formData.get("creatorName"),
      contactEmail: formData.get("contactEmail"),
      officialSite: formData.get("officialSite"),
      rssOrListenLink: formData.get("rssOrListenLink"),
      genres: formData.get("genres"),
      listenerRating: formData.get("listenerRating"),
      spoilerLevel: formData.get("spoilerLevel"),
      listenerReview: formData.get("listenerReview"),
      verificationSources: formData.get("verificationSources"),
      provenanceNotes: formData.get("provenanceNotes"),
      notes: formData.get("notes"),
      website: formData.get("website"),
    };

    try {
      const response = await fetch("/api/submissions/shows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Submission failed with ${response.status}`);
      }

      form.reset();
      syncSubmissionMode();
      status.textContent = "Submission received. It is now in the manual archive review queue.";
      status.dataset.state = "success";
    } catch (error) {
      status.textContent = error.message || "Submission failed. Try again.";
      status.dataset.state = "error";
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
        submitButton.textContent = "Submit to the archive";
      }
    }
  });
}

async function initializeDetailRatingPage(show) {
  const detailRoot = document.querySelector(".podcast-detail");
  if (!detailRoot || !show?.id) {
    return;
  }

  const widget = mountDetailRatingWidget(detailRoot, {
    podcastId: show.id,
    title: show.title,
    archiveRating: show.finalRating,
  });

  try {
    const profileId = await ensureCommunityProfile();
    const summaries = await fetchRatingSummaries([show.id], profileId);
    syncDetailRatingWidget(widget, summaries[show.id]);
  } catch (_error) {
    widget.summary.textContent = `${formatCommunitySummary(null, show.finalRating)} Community ratings are offline right now.`;
  }
}

function initializeSharedChat() {
  if (!toggleBtn || !chatContainer) {
    return;
  }

  hydrateChat();
  syncChatHealth();

  toggleBtn.addEventListener("click", () => {
    setChatOpen(!chatContainer.classList.contains("is-open"));
  });

  closeChatBtn?.addEventListener("click", () => setChatOpen(false));
  clearChatButton?.addEventListener("click", resetChatThread);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (chatContainer.classList.contains("is-open") && !chatContainer.contains(target) && !toggleBtn.contains(target)) {
      setChatOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && chatContainer.classList.contains("is-open")) {
      setChatOpen(false);
    }
  });

  sendMessageButton?.addEventListener("click", () => sendMessage());

  userInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });
}

function initializeBackToTop() {
  if (!backToTopBtn) {
    return;
  }

  const siteFooter = document.getElementById("site-footer");
  const floatingChatToggle = toggleBtn;

  function syncBackToTopState() {
    backToTopBtn.style.display = window.scrollY > 420 ? "flex" : "none";

    if (!siteFooter) {
      return;
    }

    const footerRect = siteFooter.getBoundingClientRect();
    const footerOverlap = Math.max(0, window.innerHeight - footerRect.top);
    const clearance = Math.min(Math.max(footerOverlap + 18, 18), Math.round(window.innerHeight * 0.35));
    backToTopBtn.style.bottom = `${clearance}px`;
    if (floatingChatToggle) {
      floatingChatToggle.style.bottom = `${clearance}px`;
    }
  }

  window.addEventListener("scroll", syncBackToTopState, { passive: true });
  window.addEventListener("resize", syncBackToTopState);
  syncBackToTopState();

  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function hydrateChat() {
  const savedHistory = readChatState();
  if (!chatLog) {
    return;
  }

  chatLog.textContent = "";
  chatState.history = [];

  if (savedHistory.length === 0) {
    resetChatThread();
    return;
  }

  savedHistory.forEach((entry) => {
    chatState.history.push(entry);
    renderHistoryEntry(entry);
  });

  updateChatSuggestions(DEFAULT_CHAT_SUGGESTIONS);
  syncChatSuggestionsVisibility();
  scrollChatToBottom();
}

function resetChatThread() {
  if (chatLog) {
    chatLog.textContent = "";
  }

  chatState.history = [];
  renderAndStoreEntry({
    role: "assistant",
    content: "Tell me if you want something finished or ongoing, a mood, a listening context, or a specific title already in the archive.",
    recommendations: [],
  });
  updateChatSuggestions(DEFAULT_CHAT_SUGGESTIONS);
  syncChatSuggestionsVisibility();
}

async function syncChatHealth() {
  try {
    const response = await fetch("/api/chat/health");
    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`);
    }

    const result = await response.json();
    setChatStatus(`Ask the Archivist is ready. ${result.catalogCount} shows are indexed.`);
  } catch (_error) {
    setChatStatus("Chat server offline. Start `podcast-ai` to enable live replies.");
  }
}

async function sendMessage(prefilledMessage) {
  if (!userInput || !chatLog || chatState.pending) {
    return;
  }

  const message = typeof prefilledMessage === "string" ? prefilledMessage.trim() : userInput.value.trim();
  if (!message) {
    return;
  }

  renderAndStoreEntry({ role: "user", content: message, recommendations: [] });
  userInput.value = "";
  setChatOpen(true);
  setPendingState(true);

  const typingIndicator = appendTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: chatState.history.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat request failed with ${response.status}`);
    }

    const result = await response.json();
    typingIndicator.remove();

    renderAndStoreEntry({
      role: "assistant",
      content: result.answer || "I couldn't build a reply from the archive yet.",
      recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
    });
    updateChatSuggestions(
      Array.isArray(result.suggestedPrompts) && result.suggestedPrompts.length > 0
        ? result.suggestedPrompts
        : DEFAULT_CHAT_SUGGESTIONS,
    );
    setChatStatus(result.source === "ollama" ? "Live model connected to the archive." : "Using archive fallback recommendations.");
  } catch (_error) {
    typingIndicator.remove();
    renderAndStoreEntry({
      role: "assistant",
      content: "I couldn't reach the archive assistant. Start the local `podcast-ai` service and try again.",
      recommendations: [],
    });
    setChatStatus("Chat request failed. The site could not reach `/api/chat`.");
  } finally {
    setPendingState(false);
  }
}

function renderAndStoreEntry(entry) {
  chatState.history.push(entry);
  renderHistoryEntry(entry);
  persistChatState();
}

function renderHistoryEntry(entry) {
  appendMessage(entry.content, entry.role === "assistant" ? "bot" : "user", entry.recommendations || []);
}

function appendMessage(text, sender, recommendations = []) {
  if (!chatLog) {
    return;
  }

  const msgEl = document.createElement("div");
  msgEl.className = `message ${sender}`;
  msgEl.textContent = text;
  chatLog.appendChild(msgEl);

  if (sender === "bot" && recommendations.length > 0) {
    chatLog.appendChild(createRecommendationStrip(recommendations));
  }

  scrollChatToBottom();
}

function appendTypingIndicator() {
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "message bot";
  typingIndicator.innerHTML =
    '<div class="loader"><span class="bar"></span><span class="bar"></span><span class="bar"></span></div>';
  chatLog?.appendChild(typingIndicator);
  scrollChatToBottom();
  return typingIndicator;
}

function createRecommendationStrip(recommendations) {
  const strip = document.createElement("div");
  strip.className = "chat-recommendations";

  recommendations.forEach((recommendation) => {
    const card = document.createElement("article");
    card.className = "chat-recommendation-card";

    const title = document.createElement("h3");
    title.textContent = recommendation.title;

    const why = document.createElement("p");
    why.className = "chat-recommendation-why";
    why.textContent = recommendation.why || "Fits your prompt.";

    const meta = document.createElement("p");
    meta.className = "chat-recommendation-meta";
    meta.textContent = [
      typeof recommendation.rating === "number" ? `${formatRating(recommendation.rating)}/10` : "",
      Array.isArray(recommendation.tags) ? recommendation.tags.slice(0, 3).join(" • ") : "",
    ]
      .filter(Boolean)
      .join(" • ");

    card.append(title, why);

    if (meta.textContent) {
      card.appendChild(meta);
    }

    if (recommendation.href) {
      const link = document.createElement("a");
      link.className = "chat-recommendation-link";
      link.href = recommendation.href;
      link.textContent = "Open show";
      card.appendChild(link);
    }

    strip.appendChild(card);
  });

  return strip;
}

function updateChatSuggestions(suggestions) {
  if (!chatSuggestions) {
    return;
  }

  chatSuggestions.textContent = "";

  suggestions.slice(0, 4).forEach((suggestion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-suggestion";
    button.textContent = suggestion;
    button.disabled = chatState.pending;
    button.addEventListener("click", () => {
      sendMessage(suggestion);
    });
    chatSuggestions.appendChild(button);
  });

  syncChatSuggestionsVisibility();
}

function setPendingState(isPending) {
  chatState.pending = isPending;

  if (userInput) {
    userInput.disabled = isPending;
  }

  if (sendMessageButton) {
    sendMessageButton.disabled = isPending;
    sendMessageButton.textContent = isPending ? "Thinking..." : "Ask";
  }

  chatSuggestions?.querySelectorAll("button").forEach((button) => {
    button.disabled = isPending;
  });

  syncChatSuggestionsVisibility();
}

function persistChatState() {
  try {
    window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatState.history.slice(-12)));
  } catch (error) {
    console.warn("Failed to persist chat state.", error);
  }
}

function readChatState() {
  try {
    const raw = window.sessionStorage.getItem(CHAT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry) => entry && (entry.role === "assistant" || entry.role === "user") && typeof entry.content === "string",
    );
  } catch (_error) {
    return [];
  }
}

function scrollChatToBottom() {
  if (chatLog) {
    chatLog.scrollTop = chatLog.scrollHeight;
  }
}

function setChatStatus(message) {
  if (chatStatus) {
    chatStatus.textContent = message;
  }
}

function syncChatSuggestionsVisibility() {
  const hasUserMessages = chatState.history.some((entry) => entry.role === "user");
  chatContainer?.classList.toggle("has-history", hasUserMessages);

  if (chatFootnote) {
    chatFootnote.hidden = hasUserMessages;
  }

  if (!chatSuggestions && !chatSuggestionRegion) {
    return;
  }

  const hasSuggestionButtons = Boolean(chatSuggestions && chatSuggestions.childElementCount > 0);
  const shouldShowSuggestions = hasSuggestionButtons && !hasUserMessages && !chatState.pending;

  if (chatSuggestionRegion) {
    chatSuggestionRegion.hidden = !shouldShowSuggestions;
    return;
  }

  if (chatSuggestions) {
    chatSuggestions.hidden = !shouldShowSuggestions;
  }
}

function setChatOpen(isOpen) {
  if (!toggleBtn || !chatContainer) {
    return;
  }

  chatContainer.classList.toggle("is-open", isOpen);
  chatContainer.setAttribute("aria-hidden", String(!isOpen));
  toggleBtn.setAttribute("aria-expanded", String(isOpen));

  if (isOpen) {
    userInput?.focus();
  }
}

function mountDetailRatingWidget(detailRoot, podcast) {
  const section = document.createElement("section");
  section.className = "community-review-panel";
  section.dataset.podcastId = podcast.podcastId;

  const kicker = document.createElement("p");
  kicker.className = "community-review-kicker";
  kicker.textContent = "Community rating";

  const title = document.createElement("h2");
  title.textContent = "Rate this show";

  const summary = document.createElement("p");
  summary.className = "community-review-summary";
  summary.textContent = formatCommunitySummary(null, podcast.archiveRating);

  const buttons = document.createElement("div");
  buttons.className = "community-review-buttons";

  const distribution = document.createElement("div");
  distribution.className = "community-review-distribution";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "community-review-clear";
  clearButton.textContent = "Clear your rating";
  clearButton.hidden = true;

  const ratingButtons = [];
  const widget = {
    root: section,
    summary,
    clearButton,
    ratingButtons,
    distribution,
    fallbackRating: podcast.archiveRating,
  };

  for (let rating = 1; rating <= 10; rating += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "community-review-button";
    button.textContent = String(rating);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", async () => {
      setDetailWidgetBusy(widget, true);
      try {
        const result = await submitCommunityRating(podcast.podcastId, rating);
        syncDetailRatingWidget(widget, result.summary);
      } catch (_error) {
        widget.summary.textContent = "Saving your rating failed.";
      } finally {
        setDetailWidgetBusy(widget, false);
      }
    });
    ratingButtons.push(button);
    buttons.appendChild(button);
  }

  clearButton.addEventListener("click", async () => {
    setDetailWidgetBusy(widget, true);
    try {
      const result = await clearCommunityRating(podcast.podcastId);
      syncDetailRatingWidget(widget, result.summary);
    } catch (_error) {
      widget.summary.textContent = "Removing your rating failed.";
    } finally {
      setDetailWidgetBusy(widget, false);
    }
  });

  for (let rating = 10; rating >= 1; rating -= 1) {
    const row = document.createElement("div");
    row.className = "community-distribution-row";
    row.dataset.ratingValue = String(rating);

    const label = document.createElement("span");
    label.className = "community-distribution-label";
    label.textContent = `${rating}`;

    const bar = document.createElement("div");
    bar.className = "community-distribution-bar";

    const fill = document.createElement("div");
    fill.className = "community-distribution-fill";
    bar.appendChild(fill);

    const count = document.createElement("span");
    count.className = "community-distribution-count";
    count.textContent = "0";

    row.append(label, bar, count);
    distribution.appendChild(row);
  }

  section.append(kicker, title, summary, buttons, clearButton, distribution);

  const detailLayout = detailRoot.querySelector(".detail-layout");
  if (detailLayout) {
    detailRoot.insertBefore(section, detailLayout);
  } else {
    detailRoot.appendChild(section);
  }

  return widget;
}

function syncDetailRatingWidget(widget, summary) {
  if (!widget) {
    return;
  }

  widget.summary.textContent = formatCommunitySummary(summary, widget.fallbackRating);
  widget.clearButton.hidden = !summary?.myRating;

  widget.ratingButtons.forEach((button, index) => {
    const rating = index + 1;
    const isActive = summary?.myRating === rating;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const distributionValues = Object.values(summary?.distribution || {});
  const maxCount = distributionValues.length > 0 ? Math.max(...distributionValues) : 0;

  widget.distribution.querySelectorAll(".community-distribution-row").forEach((row) => {
    const rating = row.dataset.ratingValue || "";
    const count = summary?.distribution?.[rating] || 0;
    const fill = row.querySelector(".community-distribution-fill");
    const countNode = row.querySelector(".community-distribution-count");

    if (fill) {
      fill.style.width = `${maxCount > 0 ? (count / maxCount) * 100 : 0}%`;
    }

    if (countNode) {
      countNode.textContent = String(count);
    }
  });
}

function setDetailWidgetBusy(widget, isBusy) {
  widget.ratingButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  widget.clearButton.disabled = isBusy;
}

function getDisplayedCommunityRating(summary, fallbackRating) {
  if (summary && summary.averageRating !== null) {
    return summary.averageRating;
  }

  return Number.isFinite(fallbackRating) ? fallbackRating : null;
}

function formatCommunitySummary(summary, fallbackRating) {
  const displayedRating = getDisplayedCommunityRating(summary, fallbackRating);
  const ratingLabel = displayedRating === null ? "Community score unavailable." : `Community score ${displayedRating.toFixed(1)}/10.`;

  if (!summary || summary.ratingCount === 0) {
    return `${ratingLabel} No community ratings yet.`;
  }

  const yourRating = summary.myRating ? ` Your rating: ${summary.myRating}/10.` : "";
  const noun = summary.ratingCount === 1 ? "rating" : "ratings";
  return `${ratingLabel} ${summary.ratingCount} community ${noun} recorded.${yourRating}`;
}

async function ensureCommunityProfile() {
  if (communityState.profileId) {
    return communityState.profileId;
  }

  if (!communityState.profilePromise) {
    communityState.profilePromise = (async () => {
      try {
        const existingProfileId = window.localStorage.getItem(COMMUNITY_PROFILE_KEY);
        const response = await fetch("/api/community/profiles/anonymous", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ existingProfileId }),
        });

        if (!response.ok) {
          throw new Error(`Profile bootstrap failed with ${response.status}`);
        }

        const result = await response.json();
        communityState.profileId = result.profileId;
        window.localStorage.setItem(COMMUNITY_PROFILE_KEY, result.profileId);
        return result.profileId;
      } catch (error) {
        communityState.profilePromise = null;
        throw error;
      }
    })();
  }

  return communityState.profilePromise;
}

async function fetchRatingSummaries(podcastIds, profileId) {
  const query = new URLSearchParams();
  query.set("podcastIds", podcastIds.join(","));

  const response = await fetch(`/api/community/ratings/summary?${query.toString()}`, {
    headers: profileId
      ? {
          [COMMUNITY_PROFILE_HEADER]: profileId,
        }
      : {},
  });

  if (!response.ok) {
    throw new Error(`Summary request failed with ${response.status}`);
  }

  const result = await response.json();
  return result.summaries || {};
}

async function submitCommunityRating(podcastId, rating) {
  const profileId = await ensureCommunityProfile();
  const response = await fetch(`/api/community/podcasts/${encodeURIComponent(podcastId)}/rating`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      [COMMUNITY_PROFILE_HEADER]: profileId,
    },
    body: JSON.stringify({ rating }),
  });

  if (!response.ok) {
    throw new Error(`Rating request failed with ${response.status}`);
  }

  return response.json();
}

async function clearCommunityRating(podcastId) {
  const profileId = await ensureCommunityProfile();
  const response = await fetch(`/api/community/podcasts/${encodeURIComponent(podcastId)}/rating`, {
    method: "DELETE",
    headers: {
      [COMMUNITY_PROFILE_HEADER]: profileId,
    },
  });

  if (!response.ok) {
    throw new Error(`Rating removal failed with ${response.status}`);
  }

  return response.json();
}

async function loadCommunitySummaries(podcastIds) {
  const ids = Array.from(new Set((Array.isArray(podcastIds) ? podcastIds : []).filter(Boolean)));
  const missingIds = ids.filter((id) => !dataCache.communitySummaries.has(id));

  if (missingIds.length > 0) {
    const summaries = await fetchRatingSummaries(missingIds, null);
    Object.entries(summaries).forEach(([id, summary]) => {
      dataCache.communitySummaries.set(id, summary);
    });
  }

  return ids.reduce((result, id) => {
    result[id] = dataCache.communitySummaries.get(id) || null;
    return result;
  }, {});
}

function formatCommunityBadgeSummary(summary) {
  const displayedRating = getDisplayedCommunityRating(summary, Number.parseFloat(summary?.fallbackRating ?? ""));
  if (displayedRating === null) {
    return "";
  }

  return `${displayedRating.toFixed(1)}/10`;
}

async function syncCommunityCardBadges(container, shows) {
  if (!container) {
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  container.dataset.communityRequestId = requestId;

  const badges = Array.from(container.querySelectorAll(".community-inline-score"));
  badges.forEach((badge) => {
    const fallbackText = badge.dataset.fallbackRating ? `${badge.dataset.fallbackRating}/10` : "";
    badge.hidden = !fallbackText;
    const value = badge.querySelector(".community-inline-score-value");
    if (value) {
      value.textContent = fallbackText;
    }
    if (fallbackText) {
      badge.setAttribute("aria-label", `Community score ${fallbackText}`);
    }
  });
  container.querySelectorAll(".rating, .home-card-preview-ratings").forEach((group) => {
    syncInlineScoreGroup(group);
  });

  const ids = shows.map((show) => show.id);
  if (ids.length === 0) {
    return;
  }

  try {
    const summaries = await loadCommunitySummaries(ids);
    if (container.dataset.communityRequestId !== requestId) {
      return;
    }

    badges.forEach((badge) => {
      const summary = summaries[badge.dataset.podcastId || ""];
      const text = formatCommunityBadgeSummary({
        ...(summary || {}),
        fallbackRating: badge.dataset.fallbackRating || "",
      });
      const value = badge.querySelector(".community-inline-score-value");
      if (value) {
        value.textContent = text;
      }
      if (text) {
        badge.setAttribute("aria-label", `Community score ${text}`);
      }
      badge.hidden = !text;
    });
    container.querySelectorAll(".rating, .home-card-preview-ratings").forEach((group) => {
      syncInlineScoreGroup(group);
    });
  } catch (_error) {
    if (container.dataset.communityRequestId !== requestId) {
      return;
    }

    badges.forEach((badge) => {
      const fallbackText = badge.dataset.fallbackRating ? `${badge.dataset.fallbackRating}/10` : "";
      const value = badge.querySelector(".community-inline-score-value");
      badge.hidden = !fallbackText;
      if (value) {
        value.textContent = fallbackText;
      }
      if (fallbackText) {
        badge.setAttribute("aria-label", `Community score ${fallbackText}`);
      }
    });
    container.querySelectorAll(".rating, .home-card-preview-ratings").forEach((group) => {
      syncInlineScoreGroup(group);
    });
  }
}

function getRuntimeLabel(show) {
  return show.length?.label || "Runtime still being filled in";
}

function getFormatLabel(show) {
  if (typeof show.length?.seasons === "number" && show.length.seasons > 0) {
    return `${show.length.seasons} seasons`;
  }

  if (show.formats.length > 0) {
    return show.formats.map((format) => toDisplayTag(format)).join(" • ");
  }

  return "Format still being filled in";
}

function toDisplayTag(value = "") {
  return String(value)
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z0-9]+$/.test(part)) {
        return part;
      }

      if (part.length <= 3 && part === part.toUpperCase()) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function toLabel(value = "") {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeTag(tag) {
  return String(tag).trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
}

function formatRating(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatCompactDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getSiteOrigin() {
  const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  const candidate = canonicalHref || window.location.origin;

  try {
    return new URL(candidate, window.location.origin).origin;
  } catch (_error) {
    return window.location.origin;
  }
}

function buildAbsoluteUrl(value = "") {
  const fallback = new URL(DEFAULT_SOCIAL_IMAGE, getSiteOrigin()).toString();
  if (!value) {
    return fallback;
  }

  try {
    return new URL(value, window.location.origin).toString();
  } catch (_error) {
    return fallback;
  }
}

function setMetaContent(selector, value) {
  const node = document.querySelector(selector);
  if (node) {
    node.setAttribute("content", value);
  }
}

function setCanonicalHref(value) {
  const node = document.querySelector('link[rel="canonical"]');
  if (node) {
    node.setAttribute("href", value);
  }
}

function updateDocumentMetadata({ title, description, path, image }) {
  const resolvedTitle = title || "The Echo Archives";
  const resolvedDescription =
    description || "Curated fiction podcasts, filtered by mood, genre, and listening intent.";
  const resolvedUrl = buildAbsoluteUrl(path || window.location.pathname);
  const resolvedImage = buildAbsoluteUrl(image || DEFAULT_SOCIAL_IMAGE);

  document.title = resolvedTitle;
  setMetaContent('meta[name="description"]', resolvedDescription);
  setMetaContent('meta[property="og:title"]', resolvedTitle);
  setMetaContent('meta[property="og:description"]', resolvedDescription);
  setMetaContent('meta[property="og:url"]', resolvedUrl);
  setMetaContent('meta[property="og:image"]', resolvedImage);
  setMetaContent('meta[name="twitter:title"]', resolvedTitle);
  setMetaContent('meta[name="twitter:description"]', resolvedDescription);
  setMetaContent('meta[name="twitter:image"]', resolvedImage);
  setCanonicalHref(resolvedUrl);
}

function setTextContent(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
