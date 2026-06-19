import { chatLog } from "../constants.js";
import { formatRating } from "../utils.js";
import { scrollChatToBottom } from "./ui.js";

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

export { appendTypingIndicator, renderHistoryEntry };
