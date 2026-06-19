import { CHAT_STORAGE_KEY, chatState } from "../constants.js";

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

export { persistChatState, readChatState };
