import {
  CHAT_STORAGE_KEY,
  DEFAULT_CHAT_SUGGESTIONS,
  chatContainer,
  chatFootnote,
  chatLog,
  chatState,
  chatStatus,
  chatSuggestionRegion,
  chatSuggestions,
  clearChatButton,
  closeChatBtn,
  sendMessageButton,
  toggleBtn,
  userInput,
} from "./constants.js";
import { formatRating } from "./utils.js";

export function initializeSharedChat() {
  if (!toggleBtn || !chatContainer) {
    return;
  }

  applyChatCopy();
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
    content:
      "Ask about a show, the archive, ratings, creator verification, submissions, or what to listen to next.",
    recommendations: [],
    actions: [],
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
        page: getChatPageContext(),
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
      actions: Array.isArray(result.actions) ? result.actions : [],
    });
    updateChatSuggestions(
      Array.isArray(result.suggestedPrompts) && result.suggestedPrompts.length > 0
        ? result.suggestedPrompts
        : DEFAULT_CHAT_SUGGESTIONS,
    );
    if (result.source === "ollama") {
      setChatStatus("Live model connected to the archive.");
    } else if (result.source === "site-help") {
      setChatStatus("Using grounded archive help.");
    } else {
      setChatStatus("Using grounded archive fallback.");
    }
  } catch (_error) {
    typingIndicator.remove();
    renderAndStoreEntry({
      role: "assistant",
      content: "I couldn't reach the archive assistant. Start the local `podcast-ai` service and try again.",
      recommendations: [],
      actions: [],
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
  appendMessage(
    entry.content,
    entry.role === "assistant" ? "bot" : "user",
    entry.recommendations || [],
    entry.actions || [],
  );
}

function appendMessage(text, sender, recommendations = [], actions = []) {
  if (!chatLog) {
    return;
  }

  const msgEl = document.createElement("div");
  msgEl.className = `message ${sender}`;
  msgEl.textContent = text;
  chatLog.appendChild(msgEl);

  if (sender === "bot" && actions.length > 0) {
    chatLog.appendChild(createActionStrip(actions));
  }

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

function createActionStrip(actions) {
  const strip = document.createElement("div");
  strip.className = "chat-actions";

  actions.forEach((action) => {
    if (!action || typeof action.href !== "string" || !action.href) {
      return;
    }

    const link = document.createElement("a");
    link.className = "chat-action-link";
    link.href = action.href;
    link.textContent = action.label || "Open";

    if (action.external) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }

    strip.appendChild(link);
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

    return parsed
      .filter((entry) => entry && (entry.role === "assistant" || entry.role === "user") && typeof entry.content === "string")
      .map((entry) => ({
        role: entry.role,
        content: entry.content,
        recommendations: Array.isArray(entry.recommendations) ? entry.recommendations : [],
        actions: Array.isArray(entry.actions) ? entry.actions : [],
      }));
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

export function setChatOpen(isOpen) {
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

function applyChatCopy() {
  const inputLabel = document.querySelector('label[for="userInput"]');
  if (inputLabel) {
    inputLabel.textContent = "Ask about the archive or a show";
  }

  if (userInput) {
    userInput.placeholder = "Ask about the archive, a show, or how the site works";
  }

  if (chatFootnote) {
    chatFootnote.textContent =
      "Ask for a recommendation, a correction path, rating help, privacy details, or what creator verified means.";
  }
}

function getChatPageContext() {
  const params = new URLSearchParams(window.location.search);
  const pageType = getChatPageType();
  const id = params.get("id") || "";

  return {
    path: window.location.pathname,
    pageType,
    showId: pageType === "show" ? id : "",
    collectionId: pageType === "collection" ? id : "",
  };
}

function getChatPageType() {
  const path = window.location.pathname;

  if (document.body.classList.contains("show-page")) {
    return "show";
  }

  if (document.body.classList.contains("collection-page")) {
    return "collection";
  }

  if (document.body.classList.contains("collections-page")) {
    return "collections";
  }

  if (document.body.classList.contains("about-page")) {
    return "about";
  }

  if (document.body.classList.contains("submit-page")) {
    return "submit";
  }

  if (path.endsWith("/privacy.html")) {
    return "privacy";
  }

  if (path.endsWith("/terms.html")) {
    return "terms";
  }

  if (path.endsWith("/supporters.html")) {
    return "supporters";
  }

  if (path.endsWith("/collections.html")) {
    return "collections";
  }

  if (path.endsWith("/collection.html")) {
    return "collection";
  }

  if (path.endsWith("/show.html")) {
    return "show";
  }

  if (path.endsWith("/about.html")) {
    return "about";
  }

  if (path.endsWith("/submit.html")) {
    return "submit";
  }

  return path === "/" || path.endsWith("/index.html") ? "home" : "unknown";
}
