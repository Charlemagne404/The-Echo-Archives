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
const CHAT_STORAGE_KEY = "echo-archives-chat-v2";
const COMMUNITY_PROFILE_KEY = "echo-community-profile-id";
const COMMUNITY_PROFILE_HEADER = "x-echo-profile-id";
const DEFAULT_CHAT_SUGGESTIONS = [
  "Give me a sci-fi show with strong worldbuilding",
  "I want something funny in space",
  "Recommend a darker survival story",
  "Which podcast should I start with if I like time travel?",
];

const chatState = {
  history: [],
  pending: false,
};

const communityState = {
  profileId: null,
  profilePromise: null,
};

if (document.body.classList.contains("home-page")) {
  initializeHomePage();
}

initializeDetailRatingPage();
initializeDetailPageControls();
initializeSharedChat();
initializeBackToTop();

function initializeHomePage() {
  const searchInput = document.getElementById("search");
  const filterToggle = document.getElementById("filterToggle");
  const filterDropdown = document.getElementById("filterDropdown");
  const filterCount = document.getElementById("filterCount");
  const filterClear = document.getElementById("filterClear");
  const filterOptions = Array.from(document.querySelectorAll(".filter-option"));
  const archiveGrid = document.getElementById("podcast-grid");
  const noResultsMsg = document.getElementById("noResultsMsg");
  const resultsSummary = document.getElementById("resultsSummary");
  const quickFilters = Array.from(document.querySelectorAll(".quick-filter"));
  const collectionActions = Array.from(document.querySelectorAll(".collection-action"));
  const liveReviewPaths = new Set([
    "Impact Winter/impact-winter.html",
    "ars paradoxica/ars-paradoxica.html",
    "oz9/oz9.html",
  ]);

  const state = {
    query: "",
    selectedTags: new Set(),
    topRatedOnly: false,
  };

  const cards = Array.from(document.querySelectorAll(".podcast-card")).map((card) => {
    const ratingElement = card.querySelector(".rating");
    const title = card.querySelector("h2")?.textContent?.trim() || "";
    const podcastId = normalizePodcastId(title);
    const tags = Array.from(card.querySelectorAll(".tag")).map((tag) => normalizeTag(tag.textContent));
    const href = card.getAttribute("href") || "";
    const ratingText = ratingElement ? ratingElement.textContent : "";
    const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)(?=\/10)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
    const isLiveReview = liveReviewPaths.has(href);
    const isTopRated = rating >= 9;
    const searchText = [title, tags.join(" "), ratingText].join(" ").toLowerCase();

    if (ratingElement) {
      ratingElement.textContent = ratingText.replace(/^Rating:\s*/i, "");
    }

    const editorialStatusLabel = getEditorialStatusLabel({ isLiveReview, isTopRated });

    if (editorialStatusLabel) {
      card.dataset.statusLabel = editorialStatusLabel;
    } else {
      card.dataset.statusLabel = "";
    }

    if (!isLiveReview) {
      card.dataset.originalHref = href;
      card.removeAttribute("href");
      card.classList.add("is-disabled");
      card.setAttribute("aria-disabled", "true");
    }

    card.dataset.available = String(isLiveReview);
    card.dataset.topRated = String(isTopRated);
    card.dataset.podcastId = podcastId;
    card.dataset.podcastTitle = title;

    return { card, podcastId, title, tags, rating, isLiveReview, isTopRated, searchText };
  });

  cards.forEach(({ card }) => {
    card.addEventListener("click", (event) => {
      if (card.classList.contains("is-disabled")) {
        event.preventDefault();
      }
    });

    card.querySelectorAll(".tag").forEach((tag) => {
      tag.setAttribute("tabindex", "0");
      tag.setAttribute("role", "button");
      tag.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleTag(normalizeTag(tag.textContent));
      });
      tag.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleTag(normalizeTag(tag.textContent));
        }
      });
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.query = searchInput.value.trim().toLowerCase();
      renderCards();
    });
  }

  if (filterToggle && filterDropdown) {
    filterToggle.addEventListener("click", () => {
      const isOpen = !filterDropdown.classList.contains("hidden");
      filterDropdown.classList.toggle("hidden", isOpen);
      filterToggle.setAttribute("aria-expanded", String(!isOpen));
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!filterDropdown.contains(target) && !filterToggle.contains(target)) {
        filterDropdown.classList.add("hidden");
        filterToggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      filterDropdown.classList.add("hidden");
      filterToggle.setAttribute("aria-expanded", "false");
    });
  }

  if (filterClear) {
    filterClear.addEventListener("click", () => {
      state.selectedTags.clear();
      state.topRatedOnly = false;
      renderCards();
    });
  }

  filterOptions.forEach((button) => {
    button.addEventListener("click", () => {
      const tag = button.getAttribute("data-filter-tag");
      if (!tag) {
        return;
      }

      toggleTag(tag);
    });
  });

  [...quickFilters, ...collectionActions].forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.getAttribute("data-chip-filter");
      const shouldHighlightTopRated = button.getAttribute("data-highlight") === "top-rated";

      if (shouldHighlightTopRated) {
        state.topRatedOnly = true;
        state.selectedTags.clear();
        if (searchInput) {
          state.query = "";
          searchInput.value = "";
        }
      } else if (filter === "all") {
        state.topRatedOnly = false;
        state.selectedTags.clear();
      } else if (filter) {
        state.topRatedOnly = false;
        toggleTag(filter);
        return;
      }

      renderCards();
    });
  });

  renderCards();

  function toggleTag(tag) {
    state.topRatedOnly = false;

    if (state.selectedTags.has(tag)) {
      state.selectedTags.delete(tag);
    } else {
      state.selectedTags.add(tag);
    }

    renderCards();
  }

  function renderCards() {
    let visibleCount = 0;
    let visibleLiveReviews = 0;
    const visibleEntries = [];

    cards.forEach((entry) => {
      const matchesQuery = state.query === "" || entry.searchText.includes(state.query);
      const matchesTags =
        state.selectedTags.size === 0 ||
        Array.from(state.selectedTags).every((tag) => entry.tags.includes(tag));
      const matchesTopRated = !state.topRatedOnly || entry.isTopRated;
      const shouldShow = matchesQuery && matchesTags && matchesTopRated;

      if (shouldShow) {
        visibleCount += 1;
        visibleEntries.push(entry);
        if (entry.isLiveReview) {
          visibleLiveReviews += 1;
        }
      }
    });

    syncVisibleCards(visibleEntries);
    syncControls();

    if (noResultsMsg) {
      noResultsMsg.hidden = visibleCount !== 0;
    }

    if (resultsSummary) {
      if (state.topRatedOnly) {
        resultsSummary.textContent = `${visibleCount} top-rated picks`;
      } else {
        const suffix = visibleLiveReviews === 1 ? "live review" : "live reviews";
        resultsSummary.textContent = `${visibleCount} results • ${visibleLiveReviews} ${suffix}`;
      }
    }
  }

  function syncVisibleCards(visibleEntries) {
    if (!archiveGrid) {
      return;
    }

    cards.forEach(({ card }) => {
      const visibilityNode = getCardVisibilityNode(card);
      archiveGrid.appendChild(visibilityNode);
      visibilityNode.hidden = true;
    });

    visibleEntries.forEach(({ card }) => {
      const visibilityNode = getCardVisibilityNode(card);
      archiveGrid.appendChild(visibilityNode);
      visibilityNode.hidden = false;
    });
  }

  function syncControls() {
    const selectedCount = state.selectedTags.size;

    quickFilters.forEach((button) => {
      const filter = button.getAttribute("data-chip-filter");
      const isActive =
        (filter === "all" && state.selectedTags.size === 0 && !state.topRatedOnly) ||
        (filter && filter !== "all" && state.selectedTags.has(filter)) ||
        false;

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    filterOptions.forEach((button) => {
      const tag = button.getAttribute("data-filter-tag");
      const isActive = Boolean(tag && state.selectedTags.has(tag));
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    if (filterCount) {
      filterCount.hidden = selectedCount === 0;
      filterCount.textContent = String(selectedCount);
    }

    if (filterClear) {
      filterClear.hidden = selectedCount === 0 && !state.topRatedOnly;
    }
  }
}

async function initializeArchiveRatings(cards) {
  const entries = cards.filter((entry) => entry.podcastId);
  if (entries.length === 0) {
    return;
  }

  entries.forEach((entry) => {
    mountArchiveRatingWidget(entry);
  });

  try {
    const profileId = await ensureCommunityProfile();
    const summaries = await fetchRatingSummaries(
      entries.map((entry) => entry.podcastId),
      profileId,
    );

    entries.forEach((entry) => {
      syncArchiveRatingWidget(entry.card, summaries[entry.podcastId]);
    });
  } catch (error) {
    entries.forEach((entry) => {
      setArchiveWidgetMessage(entry.card, "Community ratings are offline right now.");
    });
  }
}

async function initializeDetailRatingPage() {
  const detailRoot = document.querySelector(".podcast-detail");
  if (!detailRoot) {
    return;
  }

  const title = detailRoot.querySelector(".podcast-header h1, h1")?.textContent?.trim() || "";
  const podcastId = normalizePodcastId(title);
  if (!podcastId) {
    return;
  }

  const widget = mountDetailRatingWidget(detailRoot, { podcastId, title });

  try {
    const profileId = await ensureCommunityProfile();
    const summaries = await fetchRatingSummaries([podcastId], profileId);
    syncDetailRatingWidget(widget, summaries[podcastId]);
  } catch (error) {
    widget.summary.textContent = "Community ratings are offline right now.";
  }
}

function initializeDetailPageControls() {
  const detailRoot = document.querySelector(".podcast-detail");
  if (!detailRoot) {
    return;
  }

  const seasonButtons = Array.from(detailRoot.querySelectorAll(".season-filter-button"));
  const episodeItems = Array.from(detailRoot.querySelectorAll(".episode-list li"));
  if (seasonButtons.length === 0 || episodeItems.length === 0) {
    return;
  }

  const detailEpisodes = detailRoot.querySelector(".detail-episodes-section");
  const defaultSeason =
    detailEpisodes?.getAttribute("data-default-season") || seasonButtons[0]?.getAttribute("data-season-target") || "";

  function renderSeason(season) {
    seasonButtons.forEach((button) => {
      const isActive = button.getAttribute("data-season-target") === season;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    episodeItems.forEach((item) => {
      item.hidden = !item.classList.contains(season);
    });
  }

  seasonButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const season = button.getAttribute("data-season-target");
      if (season) {
        renderSeason(season);
      }
    });
  });

  renderSeason(defaultSeason);
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

    if (
      chatContainer.classList.contains("is-open") &&
      !chatContainer.contains(target) &&
      !toggleBtn.contains(target)
    ) {
      setChatOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && chatContainer.classList.contains("is-open")) {
      setChatOpen(false);
    }
  });

  if (sendMessageButton) {
    sendMessageButton.addEventListener("click", sendMessage);
  }

  if (userInput) {
    userInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendMessage();
      }
    });
  }
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
    setChatStatus(`Archive AI ready - ${result.catalogCount} shows indexed`);
  } catch (error) {
    setChatStatus("Chat server offline. Start `podcast-ai` to enable live replies.");
  }
}

async function sendMessage(prefilledMessage) {
  if (!userInput || !chatLog) {
    return;
  }

  if (chatState.pending) {
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
    setChatStatus(
      result.source === "ollama"
        ? "Live model connected to the archive."
        : "Using archive fallback recommendations.",
    );
  } catch (error) {
    typingIndicator.remove();
    renderAndStoreEntry({
      role: "assistant",
      content: "I couldn't reach the archive assistant. Start the local `podcast-ai` service and try again.",
      recommendations: [],
    });
    setChatStatus("Chat request failed. The website could not reach `/api/chat`.");
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
      typeof recommendation.rating === "number" ? `${recommendation.rating}/10` : "",
      Array.isArray(recommendation.tags) ? recommendation.tags.slice(0, 3).join(" • ") : "",
    ]
      .filter(Boolean)
      .join(" • ");

    card.append(title, why);

    if (meta.textContent) {
      card.appendChild(meta);
    }

    if (recommendation.hasPage && recommendation.href) {
      const link = document.createElement("a");
      link.className = "chat-recommendation-link";
      link.href = recommendation.href;
      link.textContent = "Open review";
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

  chatSuggestions
    ?.querySelectorAll("button")
    .forEach((button) => {
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
      (entry) =>
        entry &&
        (entry.role === "assistant" || entry.role === "user") &&
        typeof entry.content === "string",
    );
  } catch (error) {
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

function normalizeTag(tag) {
  return tag.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
}

function normalizePodcastId(title) {
  return title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "").trim();
}

function getCardVisibilityNode(card) {
  return card.parentElement?.classList.contains("podcast-card-shell") ? card.parentElement : card;
}

function ensurePodcastCardShell(card) {
  const existingShell = card.parentElement;
  if (existingShell?.classList.contains("podcast-card-shell")) {
    return existingShell;
  }

  const shell = document.createElement("div");
  shell.className = "podcast-card-shell";
  card.parentNode?.insertBefore(shell, card);
  shell.appendChild(card);
  return shell;
}

function createRatingSelect(selectedValue, podcastId) {
  const select = document.createElement("select");
  select.className = "community-rating-select";
  select.id = `community-rating-${podcastId}`;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Pick a score";
  select.appendChild(placeholder);

  for (let rating = 1; rating <= 10; rating += 1) {
    const option = document.createElement("option");
    option.value = String(rating);
    option.textContent = String(rating);
    if (selectedValue === rating) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  return select;
}

function mountArchiveRatingWidget(entry) {
  const shell = ensurePodcastCardShell(entry.card);
  shell.dataset.podcastId = entry.podcastId;
  bindArchiveWidgetDismissal();

  if (entry.card._communityWidget) {
    return entry.card._communityWidget;
  }

  const widget = document.createElement("details");
  widget.className = "community-card-widget";

  const toggle = document.createElement("summary");
  toggle.className = "community-card-toggle";

  const info = document.createElement("div");
  info.className = "community-card-info";

  const kicker = document.createElement("span");
  kicker.className = "community-card-kicker";
  kicker.textContent = "Community";

  const stats = document.createElement("div");
  stats.className = "community-card-stats";

  const scoreGroup = document.createElement("div");
  scoreGroup.className = "community-card-score-group";

  const scoreValue = document.createElement("span");
  scoreValue.className = "community-card-score";
  scoreValue.textContent = "--";

  const scoreScale = document.createElement("span");
  scoreScale.className = "community-card-score-scale";
  scoreScale.textContent = "/10";

  const count = document.createElement("span");
  count.className = "community-card-count";
  count.textContent = "No ratings yet";

  const summary = document.createElement("p");
  summary.className = "community-card-summary";
  summary.textContent = "Loading community ratings...";

  const action = document.createElement("span");
  action.className = "community-card-action";
  action.textContent = "Rate";

  const controls = document.createElement("div");
  controls.className = "community-card-controls";

  const select = createRatingSelect(null, entry.podcastId);
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "community-card-button";
  saveButton.textContent = "Save";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "community-card-clear";
  clearButton.textContent = "Clear";
  clearButton.hidden = true;

  [controls, select, saveButton, clearButton].forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  saveButton.addEventListener("click", async () => {
    const rating = Number.parseInt(select.value, 10);
    if (!Number.isInteger(rating)) {
      summary.textContent = "Choose a rating between 1 and 10 first.";
      return;
    }

    setArchiveWidgetBusy(entry.card, true);
    try {
      const result = await submitCommunityRating(entry.podcastId, rating);
      syncArchiveRatingWidget(entry.card, result.summary);
      widget.open = false;
    } catch (error) {
      setArchiveWidgetMessage(entry.card, "Saving your rating failed.");
    } finally {
      setArchiveWidgetBusy(entry.card, false);
    }
  });

  clearButton.addEventListener("click", async () => {
    setArchiveWidgetBusy(entry.card, true);
    try {
      const result = await clearCommunityRating(entry.podcastId);
      syncArchiveRatingWidget(entry.card, result.summary);
      widget.open = false;
    } catch (error) {
      setArchiveWidgetMessage(entry.card, "Removing your rating failed.");
    } finally {
      setArchiveWidgetBusy(entry.card, false);
    }
  });

  widget.addEventListener("toggle", () => {
    if (!widget.open) {
      return;
    }

    closeOtherArchiveWidgets(widget);
  });

  scoreGroup.append(scoreValue, scoreScale);
  stats.append(scoreGroup, count);
  info.append(kicker, stats, summary);
  toggle.replaceChildren(info, action);
  controls.append(select, saveButton, clearButton);
  widget.append(toggle, controls);
  shell.appendChild(widget);

  entry.card._communityWidget = {
    root: widget,
    scoreValue,
    count,
    summary,
    action,
    select,
    saveButton,
    clearButton,
  };

  return entry.card._communityWidget;
}

function syncArchiveRatingWidget(card, summary) {
  const widget = card._communityWidget;
  if (!widget || !summary) {
    return;
  }

  widget.scoreValue.textContent = formatCommunityAverageValue(summary);
  widget.count.textContent = formatCommunityCountLabel(summary);
  widget.summary.textContent = formatArchiveWidgetNote(summary);
  widget.action.textContent = summary.myRating ? "Edit" : "Rate";
  widget.select.value = summary.myRating ? String(summary.myRating) : "";
  widget.clearButton.hidden = !summary.myRating;
}

function setArchiveWidgetBusy(card, isBusy) {
  const widget = card._communityWidget;
  if (!widget) {
    return;
  }

  widget.select.disabled = isBusy;
  widget.saveButton.disabled = isBusy;
  widget.clearButton.disabled = isBusy;
  widget.root.classList.toggle("is-busy", isBusy);
}

function setArchiveWidgetMessage(card, message) {
  const widget = card._communityWidget;
  if (widget) {
    widget.summary.textContent = message;
  }
}

function closeOtherArchiveWidgets(activeWidget) {
  document.querySelectorAll(".community-card-widget[open]").forEach((widget) => {
    if (widget !== activeWidget) {
      widget.open = false;
    }
  });
}

function bindArchiveWidgetDismissal() {
  if (document.body.dataset.archiveWidgetDismissBound === "true") {
    return;
  }

  document.body.dataset.archiveWidgetDismissBound = "true";

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".community-card-widget")) {
      return;
    }

    closeOtherArchiveWidgets(null);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOtherArchiveWidgets(null);
    }
  });
}

function mountDetailRatingWidget(detailRoot, podcast) {
  const section = document.createElement("section");
  section.className = "community-review-panel";
  section.dataset.podcastId = podcast.podcastId;

  const kicker = document.createElement("p");
  kicker.className = "community-review-kicker";
  kicker.textContent = "Community rating";

  const title = document.createElement("h2");
  title.textContent = "Rate this podcast";

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
      } catch (error) {
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
    } catch (error) {
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

  const firstSection = detailRoot.querySelector(".detail-section, .section-container");
  if (firstSection) {
    detailRoot.insertBefore(section, firstSection);
  } else {
    detailRoot.appendChild(section);
  }

  const widget = {
    root: section,
    summary,
    clearButton,
    ratingButtons,
    distribution,
  };

  detailRoot._communityWidget = widget;
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

  const maxCount = Math.max(...Object.values(summary.distribution));
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

function formatCommunitySummary(summary) {
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return "No community ratings yet. Be the first to score it.";
  }

  const yourRating = summary.myRating ? ` Your rating: ${summary.myRating}/10.` : "";
  const noun = summary.ratingCount === 1 ? "rating" : "ratings";
  return `Community score ${summary.averageRating.toFixed(1)}/10 from ${summary.ratingCount} ${noun}.${yourRating}`;
}

function formatCommunityAverageValue(summary) {
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return "--";
  }

  return summary.averageRating.toFixed(1);
}

function formatCommunityCountLabel(summary) {
  if (!summary || summary.ratingCount === 0) {
    return "No ratings yet";
  }

  const noun = summary.ratingCount === 1 ? "rating" : "ratings";
  return `${summary.ratingCount} ${noun}`;
}

function formatArchiveWidgetNote(summary) {
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return "Be the first to score this one.";
  }

  if (summary.myRating) {
    return `You rated it ${summary.myRating}/10.`;
  }

  return "Add your score to shape the archive.";
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
  const response = await fetch(
    `/api/community/ratings/summary?podcastIds=${encodeURIComponent(podcastIds.join(","))}`,
    {
      headers: profileId
        ? {
            [COMMUNITY_PROFILE_HEADER]: profileId,
          }
        : {},
    },
  );

  if (!response.ok) {
    throw new Error(`Ratings summary request failed with ${response.status}`);
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
    throw new Error(`Saving rating failed with ${response.status}`);
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
    throw new Error(`Clearing rating failed with ${response.status}`);
  }

  return response.json();
}

function getEditorialStatusLabel({ isLiveReview, isTopRated }) {
  const labels = [];

  if (isTopRated) {
    labels.push("Top rated");
  }

  if (isLiveReview) {
    labels.push("Full review");
  }

  return labels.join(" • ");
}

function toggleDropdown() {
  const menu = document.getElementById("season-menu");
  if (menu) {
    menu.classList.toggle("hidden");
  }
}

function selectSeason(season) {
  const selectedSeason = document.getElementById("selected-season");
  const allEpisodes = document.querySelectorAll(".episode-list li");
  const menu = document.getElementById("season-menu");

  if (selectedSeason) {
    selectedSeason.textContent = season.replace("season", "Season ");
  }

  allEpisodes.forEach((episode) => {
    episode.style.display = episode.classList.contains(season) ? "block" : "none";
  });

  if (menu) {
    menu.classList.add("hidden");
  }
}
