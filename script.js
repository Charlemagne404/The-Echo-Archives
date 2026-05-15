const backToTopBtn = document.getElementById("backToTop");
const toggleBtn = document.getElementById("chat-toggle");
const closeChatBtn = document.getElementById("chat-close");
const chatContainer = document.getElementById("chat-container");
const chatLog = document.getElementById("chatLog");
const userInput = document.getElementById("userInput");
const sendMessageButton = document.getElementById("sendMessageButton");

if (document.body.classList.contains("home-page")) {
  initializeHomePage();
}

initializeSharedChat();
initializeBackToTop();

function initializeHomePage() {
  const searchInput = document.getElementById("search");
  const filterToggle = document.getElementById("filterToggle");
  const filterDropdown = document.getElementById("filterDropdown");
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
    const tags = Array.from(card.querySelectorAll(".tag")).map((tag) => normalizeTag(tag.textContent));
    const href = card.getAttribute("href") || "";
    const ratingText = ratingElement ? ratingElement.textContent : "";
    const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)(?=\/10)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
    const isLiveReview = liveReviewPaths.has(href);
    const isTopRated = rating >= 9;
    const searchText = [card.querySelector("h2")?.textContent || "", tags.join(" "), ratingText].join(" ").toLowerCase();

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

    return { card, tags, rating, isLiveReview, isTopRated, searchText };
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
  }

  document.querySelectorAll('#filterDropdown input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.selectedTags = new Set(
        Array.from(document.querySelectorAll('#filterDropdown input[type="checkbox"]:checked')).map((input) => input.value),
      );
      state.topRatedOnly = false;
      renderCards();
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

    cards.forEach((entry) => {
      const matchesQuery = state.query === "" || entry.searchText.includes(state.query);
      const matchesTags =
        state.selectedTags.size === 0 ||
        Array.from(state.selectedTags).every((tag) => entry.tags.includes(tag));
      const matchesTopRated = !state.topRatedOnly || entry.isTopRated;
      const shouldShow = matchesQuery && matchesTags && matchesTopRated;

      entry.card.hidden = !shouldShow;

      if (shouldShow) {
        visibleCount += 1;
        if (entry.isLiveReview) {
          visibleLiveReviews += 1;
        }
      }
    });

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

  function syncControls() {
    quickFilters.forEach((button) => {
      const filter = button.getAttribute("data-chip-filter");
      const isActive =
        (filter === "all" && state.selectedTags.size === 0 && !state.topRatedOnly) ||
        (filter && filter !== "all" && state.selectedTags.has(filter)) ||
        false;

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    document.querySelectorAll('#filterDropdown input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = state.selectedTags.has(checkbox.value);
    });
  }
}

function initializeSharedChat() {
  if (!toggleBtn || !chatContainer) {
    return;
  }

  toggleBtn.addEventListener("click", () => {
    setChatOpen(!chatContainer.classList.contains("is-open"));
  });

  closeChatBtn?.addEventListener("click", () => setChatOpen(false));

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

async function sendMessage() {
  if (!userInput || !chatLog) {
    return;
  }

  const message = userInput.value.trim();
  if (!message) {
    return;
  }

  appendMessage(message, "user");
  userInput.value = "";
  chatLog.scrollTop = chatLog.scrollHeight;

  const typingIndicator = document.createElement("div");
  typingIndicator.className = "message bot";
  typingIndicator.innerHTML =
    '<div class="loader"><span class="bar"></span><span class="bar"></span><span class="bar"></span></div>';

  chatLog.appendChild(typingIndicator);
  chatLog.scrollTop = chatLog.scrollHeight;

  try {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const response = await fetch(`${protocol}//mpmc.ddns.net:3000/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: message }),
    });

    const result = await response.json();

    typingIndicator.remove();
    appendMessage(result.answer, "bot", true);
    chatLog.scrollTop = chatLog.scrollHeight;
  } catch (error) {
    typingIndicator.remove();
    appendMessage("Error: failed to reach AI.", "bot");
  }
}

function appendMessage(text, sender, animate = false) {
  if (!chatLog) {
    return;
  }

  const msgEl = document.createElement("div");
  msgEl.className = `message ${sender}`;

  if (!animate) {
    msgEl.textContent = text;
    chatLog.appendChild(msgEl);
    return;
  }

  chatLog.appendChild(msgEl);
  const words = text.split(" ");
  let index = 0;

  function typeWord() {
    if (index < words.length) {
      msgEl.textContent += `${index > 0 ? " " : ""}${words[index]}`;
      index += 1;
      chatLog.scrollTop = chatLog.scrollHeight;
      setTimeout(typeWord, 120);
    }
  }

  typeWord();
}

function setChatOpen(isOpen) {
  if (!toggleBtn || !chatContainer) {
    return;
  }

  chatContainer.classList.toggle("is-open", isOpen);
  chatContainer.setAttribute("aria-hidden", String(!isOpen));
  toggleBtn.setAttribute("aria-expanded", String(isOpen));
}

function normalizeTag(tag) {
  return tag.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "-");
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
