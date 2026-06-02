const SHOWS_DATA_URL = "/data/shows.json";
const COLLECTIONS_DATA_URL = "/data/collections.json";
const DEFAULT_SOCIAL_IMAGE = "/images/Logo.png";
const CHAT_STORAGE_KEY = "echo-archives-chat-v2";
const COMMUNITY_PROFILE_KEY = "echo-community-profile-id";
const COMMUNITY_PROFILE_HEADER = "x-echo-profile-id";
const COMMUNITY_PUBLIC_THRESHOLD = 5;
const DEFAULT_CHAT_SUGGESTIONS = [
  "Give me a sci-fi show with strong worldbuilding",
  "I want something funny in space",
  "Recommend a darker survival story",
  "Which podcast should I start with if I like time travel?",
];
const PREFERRED_QUICK_FILTERS = ["sci-fi", "mystery", "horror", "comedy", "survival", "time-travel"];

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
const chatSuggestions = document.getElementById("chatSuggestions");
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

  dataCache.collections = await fetchJson(COLLECTIONS_DATA_URL);
  return dataCache.collections;
}

function getPublishedShows(shows) {
  return shows.filter((show) => show.status === "published");
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
    href: `/show.html?id=${encodeURIComponent(record.id)}`,
    finalRating: Number.isFinite(rating) ? rating : null,
    searchText,
    tagTokens: tags.map((tag) => normalizeTag(tag)),
  };
}

function buildShowMap(shows) {
  return new Map(shows.map((show) => [show.id, show]));
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

async function initializeHomePage() {
  const shows = await loadShows();
  const collections = await loadCollections();

  const searchInput = document.getElementById("search");
  const filterToggle = document.getElementById("filterToggle");
  const filterDropdown = document.getElementById("filterDropdown");
  const filterCount = document.getElementById("filterCount");
  const filterClear = document.getElementById("filterClear");
  const filterOptionGrid = document.getElementById("filterOptionGrid");
  const archiveGrid = document.getElementById("podcast-grid");
  const noResultsMsg = document.getElementById("noResultsMsg");
  const resultsSummary = document.getElementById("resultsSummary");
  const quickFiltersRoot = document.getElementById("quickFilters");
  const collectionGrid = document.getElementById("collectionGrid");

  if (!archiveGrid || !filterOptionGrid || !quickFiltersRoot || !collectionGrid) {
    return;
  }

  const filterTags = getVisibleFilterTags(shows);
  const quickFilters = getQuickFilters(filterTags);
  const featuredCollections = collections.filter((collection) => collection.featured);
  const collectionsById = buildCollectionMap(collections);

  const state = {
    query: "",
    selectedTags: new Set(),
    selectedCollectionId: "",
    topRatedOnly: false,
  };

  const initialCollectionId = new URLSearchParams(window.location.search).get("collection") || "";
  if (collectionsById.has(initialCollectionId)) {
    state.selectedCollectionId = initialCollectionId;
  }

  renderFilterOptions();
  renderQuickFilters();
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
    state.selectedTags.clear();
    state.selectedCollectionId = "";
    state.topRatedOnly = false;
    if (searchInput) {
      searchInput.value = "";
      state.query = "";
    }
    renderHomeResults();
  });

  function renderFilterOptions() {
    filterOptionGrid.textContent = "";

    filterTags.forEach((tag) => {
      const button = document.createElement("button");
      button.className = "filter-option";
      button.type = "button";
      button.dataset.filterTag = tag.id;
      button.textContent = tag.label;
      button.addEventListener("click", () => {
        toggleTag(tag.id);
      });
      filterOptionGrid.appendChild(button);
    });
  }

  function renderQuickFilters() {
    quickFiltersRoot.textContent = "";
    quickFiltersRoot.appendChild(createQuickFilterButton({ id: "all", label: "All" }));

    quickFilters.forEach((tag) => {
      quickFiltersRoot.appendChild(createQuickFilterButton(tag));
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
        state.selectedTags.clear();
        state.selectedCollectionId = "";
        state.topRatedOnly = false;
      } else {
        state.selectedCollectionId = "";
        state.topRatedOnly = false;
        toggleTag(tag.id);
        return;
      }

      renderHomeResults();
    });
    return button;
  }

  function renderCollections() {
    collectionGrid.textContent = "";

    featuredCollections.forEach((collection, index) => {
      const card = document.createElement("article");
      card.className = "collection-card";

      const kicker = document.createElement("p");
      kicker.textContent = index % 2 === 0 ? "Curated route" : "Archive collection";

      const title = document.createElement("h3");
      title.textContent = collection.title;

      const description = document.createElement("p");
      description.textContent = collection.description;

      const link = document.createElement("a");
      link.className = "collection-action";
      link.href = createCollectionHref(collection.id);
      link.textContent = "Browse collection";

      card.append(kicker, title, description, link);
      collectionGrid.appendChild(card);
    });
  }

  function toggleTag(tagId) {
    if (state.selectedTags.has(tagId)) {
      state.selectedTags.delete(tagId);
    } else {
      state.selectedTags.add(tagId);
    }

    state.selectedCollectionId = "";
    state.topRatedOnly = false;
    renderHomeResults();
  }

  function renderHomeResults() {
    const selectedCollection = state.selectedCollectionId
      ? collectionsById.get(state.selectedCollectionId)
      : null;

    const visibleShows = shows.filter((show) => {
      const matchesQuery = !state.query || show.searchText.includes(state.query);
      const matchesTags =
        state.selectedTags.size === 0 ||
        Array.from(state.selectedTags).every((tag) => show.tagTokens.includes(tag));
      const matchesCollection = !selectedCollection || selectedCollection.showIds.includes(show.id);
      const matchesTopRated = !state.topRatedOnly || (show.finalRating || 0) >= 9;
      return matchesQuery && matchesTags && matchesCollection && matchesTopRated;
    });

    archiveGrid.textContent = "";
    visibleShows.forEach((show) => {
      archiveGrid.appendChild(createShowCard(show));
    });

    void syncCommunityCardBadges(archiveGrid, visibleShows);

    if (resultsSummary) {
      const fullReviewCount = visibleShows.filter((show) => show.reviewStatus === "full-review").length;
      const suffix = fullReviewCount === 1 ? "full review" : "full reviews";
      const collectionPrefix = selectedCollection ? `${selectedCollection.title} • ` : "";
      resultsSummary.textContent = `${collectionPrefix}${visibleShows.length} results • ${fullReviewCount} ${suffix}`;
    }

    if (noResultsMsg) {
      noResultsMsg.hidden = visibleShows.length !== 0;
    }

    syncHomeControls();
  }

  function syncHomeControls() {
    const selectedCount = state.selectedTags.size;

    quickFiltersRoot.querySelectorAll(".quick-filter").forEach((button) => {
      const filter = button.dataset.chipFilter || "";
      const isActive =
        (filter === "all" &&
          state.selectedTags.size === 0 &&
          !state.selectedCollectionId &&
          !state.topRatedOnly) ||
        (filter !== "all" && state.selectedTags.has(filter));

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    filterOptionGrid.querySelectorAll(".filter-option").forEach((button) => {
      const tag = button.dataset.filterTag || "";
      const isActive = state.selectedTags.has(tag);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (filterCount) {
      filterCount.hidden = selectedCount === 0;
      filterCount.textContent = String(selectedCount);
    }

    if (filterClear) {
      filterClear.hidden = selectedCount === 0 && !state.selectedCollectionId && !state.topRatedOnly;
    }
  }
}

function createShowCard(show) {
  const shell = document.createElement("div");
  shell.className = "podcast-card-shell";
  shell.dataset.podcastId = show.id;

  const card = document.createElement("a");
  card.className = "podcast-card";
  card.href = show.href;
  card.dataset.podcastId = show.id;
  card.dataset.statusLabel = getEditorialStatusLabel(show);

  const image = document.createElement("img");
  image.src = show.cover;
  image.alt = show.coverAlt;

  const title = document.createElement("h2");
  title.textContent = show.title;

  const tags = document.createElement("p");
  tags.className = "tags";

  show.tags.slice(0, 3).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = toDisplayTag(tag);
    tags.appendChild(chip);
    tags.append(" ");
  });

  const rating = document.createElement("p");
  rating.className = "rating";
  rating.textContent = `${formatRating(show.finalRating)}/10`;

  card.append(image, title, tags, rating);
  const communityBadge = document.createElement("p");
  communityBadge.className = "community-card-badge";
  communityBadge.dataset.podcastId = show.id;
  communityBadge.hidden = true;

  shell.append(card, communityBadge);
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

  directoryRoot.textContent = "";
  collections.forEach((collection) => {
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
    grid.appendChild(createShowCard(show));
  });
  void syncCommunityCardBadges(grid, collectionShows);
}

function createShowPageMarkup(show, showMap) {
  const statusChips = [];
  if ((show.finalRating || 0) >= 9) {
    statusChips.push('<span class="detail-status-chip is-accent">Top rated</span>');
  }
  statusChips.push(
    `<span class="detail-status-chip">${show.reviewStatus === "full-review" ? "Full review" : "Indexed entry"}</span>`,
  );
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

  cards.push(createFactCard("Review status", show.reviewStatus === "full-review" ? "Full review" : "Indexed-only entry"));
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

async function initializeAboutPage() {
  const shows = await loadShows();
  const collections = await loadCollections();
  const publishedShows = shows.filter((show) => show.status === "published");
  const fullReviews = publishedShows.filter((show) => show.reviewStatus === "full-review");
  const latestUpdatedAt = publishedShows
    .map((show) => show.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  setTextContent("aboutShowCount", String(publishedShows.length));
  setTextContent("aboutReviewCount", String(fullReviews.length));
  setTextContent("aboutCollectionCount", String(collections.length));
  setTextContent("aboutLastUpdated", latestUpdatedAt ? formatDate(latestUpdatedAt) : "Unknown");
}

async function initializeSubmitPage() {
  const form = document.getElementById("showSubmitForm");
  const status = document.getElementById("submitStatus");
  const submissionType = document.getElementById("submissionType");
  const existingShowField = document.getElementById("existingShowField");
  const existingShowId = document.getElementById("existingShowId");
  if (!form || !status || !submissionType || !existingShowField || !existingShowId) {
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

  const showTitleInput = form.querySelector('input[name="showTitle"]');

  function syncSubmissionMode() {
    const isCorrection = submissionType.value === "correction";
    existingShowField.hidden = !isCorrection;
    existingShowId.required = isCorrection;
  }

  submissionType.addEventListener("change", syncSubmissionMode);
  existingShowId.addEventListener("change", () => {
    if (submissionType.value !== "correction" || !(showTitleInput instanceof HTMLInputElement) || showTitleInput.value) {
      return;
    }

    const selectedOption = existingShowId.selectedOptions[0];
    if (selectedOption?.textContent) {
      showTitleInput.value = selectedOption.textContent;
    }
  });

  syncSubmissionMode();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
      submitButton.textContent = "Submitting...";
    }

    status.textContent = "Sending your show to the archive queue...";
    status.dataset.state = "pending";

    const formData = new FormData(form);
    const payload = {
      submissionType: formData.get("submissionType"),
      existingShowId: formData.get("existingShowId"),
      showTitle: formData.get("showTitle"),
      creatorName: formData.get("creatorName"),
      contactEmail: formData.get("contactEmail"),
      officialSite: formData.get("officialSite"),
      rssOrListenLink: formData.get("rssOrListenLink"),
      genres: formData.get("genres"),
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
      status.textContent = "Submission received. The archive review queue now has it.";
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

  const widget = mountDetailRatingWidget(detailRoot, { podcastId: show.id, title: show.title });

  try {
    const profileId = await ensureCommunityProfile();
    const summaries = await fetchRatingSummaries([show.id], profileId);
    syncDetailRatingWidget(widget, summaries[show.id]);
  } catch (_error) {
    widget.summary.textContent = "Community ratings are offline right now.";
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

  function syncBackToTopState() {
    backToTopBtn.style.display = window.scrollY > 420 ? "flex" : "none";

    if (!siteFooter) {
      return;
    }

    const footerRect = siteFooter.getBoundingClientRect();
    const footerOverlap = Math.max(0, window.innerHeight - footerRect.top);
    const clearance = Math.min(Math.max(footerOverlap + 18, 18), Math.round(window.innerHeight * 0.35));
    backToTopBtn.style.bottom = `${clearance}px`;
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
  scrollChatToBottom();
}

function resetChatThread() {
  if (chatLog) {
    chatLog.textContent = "";
  }

  chatState.history = [];
  renderAndStoreEntry({
    role: "assistant",
    content: "Tell me a genre, mood, theme, or specific show and I'll narrow the archive down.",
    recommendations: [],
  });
  updateChatSuggestions(DEFAULT_CHAT_SUGGESTIONS);
  setChatStatus("Ask for a vibe, a genre, or a title already in the archive.");
}

async function syncChatHealth() {
  try {
    const response = await fetch("/api/chat/health");
    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`);
    }

    const result = await response.json();
    setChatStatus(`Ask the Archivist is ready - ${result.catalogCount} shows indexed`);
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
  summary.textContent = "Loading community ratings...";

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
  if (!widget || !summary) {
    return;
  }

  widget.summary.textContent = formatCommunitySummary(summary);
  widget.clearButton.hidden = !summary.myRating;

  widget.ratingButtons.forEach((button, index) => {
    const rating = index + 1;
    const isActive = summary.myRating === rating;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const distributionValues = Object.values(summary.distribution || {});
  const maxCount = distributionValues.length > 0 ? Math.max(...distributionValues) : 0;

  widget.distribution.querySelectorAll(".community-distribution-row").forEach((row) => {
    const rating = row.dataset.ratingValue || "";
    const count = summary.distribution[rating] || 0;
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

function hasVisibleCommunityAverage(summary) {
  return Boolean(summary && summary.ratingCount >= COMMUNITY_PUBLIC_THRESHOLD && summary.averageRating !== null);
}

function formatCommunitySummary(summary) {
  if (!summary || summary.ratingCount === 0) {
    return "No community ratings yet. Be the first to score it.";
  }

  const yourRating = summary.myRating ? ` Your rating: ${summary.myRating}/10.` : "";

  if (!hasVisibleCommunityAverage(summary)) {
    const noun = summary.ratingCount === 1 ? "rating" : "ratings";
    return `${summary.ratingCount} community ${noun} recorded. The public average stays hidden until ${COMMUNITY_PUBLIC_THRESHOLD} ratings.${yourRating}`;
  }

  const noun = summary.ratingCount === 1 ? "rating" : "ratings";
  return `Community score ${summary.averageRating.toFixed(1)}/10 from ${summary.ratingCount} ${noun}.${yourRating}`;
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
  if (!hasVisibleCommunityAverage(summary)) {
    return "";
  }

  const noun = summary.ratingCount === 1 ? "rating" : "ratings";
  return `Community ${summary.averageRating.toFixed(1)}/10 • ${summary.ratingCount} ${noun}`;
}

async function syncCommunityCardBadges(container, shows) {
  if (!container) {
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  container.dataset.communityRequestId = requestId;

  const badges = Array.from(container.querySelectorAll(".community-card-badge"));
  badges.forEach((badge) => {
    badge.hidden = true;
    badge.textContent = "";
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
      const text = formatCommunityBadgeSummary(summary);
      badge.textContent = text;
      badge.hidden = !text;
    });
  } catch (_error) {
    if (container.dataset.communityRequestId !== requestId) {
      return;
    }

    badges.forEach((badge) => {
      badge.hidden = true;
    });
  }
}

function getEditorialStatusLabel(show) {
  if ((show.finalRating || 0) >= 9 && show.reviewStatus === "full-review") {
    return "Top rated • Full review";
  }

  if ((show.finalRating || 0) >= 9) {
    return "Top rated";
  }

  if (show.reviewStatus === "full-review") {
    return "Full review";
  }

  return "Indexed entry";
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
