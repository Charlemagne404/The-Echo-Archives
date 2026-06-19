import {
  chatContainer,
  chatFootnote,
  chatLog,
  chatState,
  chatStatus,
  chatSuggestionRegion,
  chatSuggestions,
  sendMessageButton,
  userInput,
} from "../constants.js";

function updateChatSuggestions(suggestions, handleSuggestion) {
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
      handleSuggestion?.(suggestion);
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

export {
  scrollChatToBottom,
  setChatStatus,
  setPendingState,
  syncChatSuggestionsVisibility,
  updateChatSuggestions,
};
