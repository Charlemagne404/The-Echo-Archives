import {
  DEFAULT_CHAT_SUGGESTIONS,
  chatContainer,
  chatLog,
  chatState,
  clearChatButton,
  closeChatBtn,
  sendMessageButton,
  toggleBtn,
  userInput,
} from "./constants.js";
import { initializeChatOpenState, setChatOpen, trapChatFocus } from "./chat-open.js";
import { applyChatCopy, getChatPageContext } from "./chat/context.js";
import { appendTypingIndicator, renderHistoryEntry } from "./chat/messages.js";
import { persistChatState, readChatState } from "./chat/persistence.js";
import {
  scrollChatToBottom,
  setChatStatus,
  setPendingState,
  syncChatSuggestionsVisibility,
  updateChatSuggestions,
} from "./chat/ui.js";

export function initializeSharedChat() {
  if (!toggleBtn || !chatContainer) {
    return;
  }

  applyChatCopy();
  hydrateChat();
  syncChatHealth();

  closeChatBtn?.addEventListener("click", () => setChatOpen(false));
  clearChatButton?.addEventListener("click", resetChatThread);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    const chatLauncher = target instanceof Element ? target.closest("[data-open-chat]") : null;

    if (
      chatContainer.classList.contains("is-open") &&
      !chatLauncher &&
      !chatContainer.contains(target) &&
      !toggleBtn.contains(target)
    ) {
      setChatOpen(false, { restoreFocus: false });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!chatContainer.classList.contains("is-open")) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setChatOpen(false);
      return;
    }

    if (event.key === "Tab") {
      trapChatFocus(event);
    }
  });

  sendMessageButton?.addEventListener("click", () => sendMessage());

  userInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });

  initializeChatOpenState();
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

  updateChatSuggestions(DEFAULT_CHAT_SUGGESTIONS, sendMessage);
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
      "Ask about a show, the archive, ratings, creators, runtime, transcripts, collections, or what to listen to next.",
    recommendations: [],
    actions: [],
  });
  updateChatSuggestions(DEFAULT_CHAT_SUGGESTIONS, sendMessage);
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
    setChatStatus("Ask the Archivist is temporarily unavailable.");
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
        seenRecommendationIds: collectSeenRecommendationIds(),
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
      sendMessage,
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
      content: "I couldn't reach the archive assistant right now. Try again later, or browse the archive directly.",
      recommendations: [],
      actions: [],
    });
    setChatStatus("Ask the Archivist is temporarily unavailable.");
  } finally {
    setPendingState(false);
  }
}

function collectSeenRecommendationIds() {
  return Array.from(
    new Set(
      chatState.history
        .flatMap((entry) => (Array.isArray(entry.recommendations) ? entry.recommendations : []))
        .map((recommendation) => recommendation?.id)
        .filter((id) => typeof id === "string" && id),
    ),
  ).slice(-30);
}

function renderAndStoreEntry(entry) {
  chatState.history.push(entry);
  renderHistoryEntry(entry);
  persistChatState();
}

export { setChatOpen };
