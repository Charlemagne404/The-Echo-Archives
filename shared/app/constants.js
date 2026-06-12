export const SHOWS_DATA_URL = "/data/shows.json";
export const COLLECTIONS_DATA_URL = "/data/collections.json";
export const DEFAULT_SOCIAL_IMAGE = "/images/Logo.png";
export const TOP_RATED_BADGE_ASSET_URL = "/images/badges/top-rated-bookmark.png";
export const archiveSearch = globalThis.EchoArchiveSearch;
export const CHAT_STORAGE_KEY = "echo-archives-chat-v2";
export const COMMUNITY_PROFILE_KEY = "echo-community-profile-id";
export const COMMUNITY_PROFILE_HEADER = "x-echo-profile-id";
export const DEFAULT_CHAT_SUGGESTIONS = [
  "Give me a finished show with strong worldbuilding",
  "I want something easy to jump into late at night",
  "Recommend a darker survival story",
  "What should I start with if I want a full review first?",
];
export const PREFERRED_QUICK_FILTERS = ["sci-fi", "mystery", "horror", "comedy", "survival", "time-travel"];
export const HOME_MOST_POPULAR_IDS = ["midnight-burger", "were-alive", "red-valley", "derelict"];
export const SHOW_CARD_PREVIEW_DELAY_MS = 650;
export const SHOW_CARD_PREVIEW_CLOSE_DELAY_MS = 32;
export const SHOW_CARD_PREVIEW_CLOSE_TRANSITION_MS = 170;
export const SHOW_CARD_PREVIEW_SCROLL_IDLE_MS = 140;
export const HOME_CARD_PREVIEW_ID_PREFIX = "archiveCardPreview";

export const dataCache = {
  shows: null,
  collections: null,
  communitySummaries: new Map(),
};

export const chatState = {
  history: [],
  pending: false,
};

export const communityState = {
  profileId: null,
  profilePromise: null,
};

export const backToTopBtn = document.getElementById("backToTop");
export const toggleBtn = document.getElementById("chat-toggle");
export const closeChatBtn = document.getElementById("chat-close");
export const clearChatButton = document.getElementById("chat-clear");
export const chatContainer = document.getElementById("chat-container");
export const chatLog = document.getElementById("chatLog");
export const chatStatus = document.getElementById("chatStatus");
export const chatSuggestionRegion = document.getElementById("chatSuggestionRegion");
export const chatSuggestions = document.getElementById("chatSuggestions");
export const chatFootnote = document.querySelector(".chat-footnote");
export const userInput = document.getElementById("userInput");
export const sendMessageButton = document.getElementById("sendMessageButton");

if (!archiveSearch) {
  throw new Error("EchoArchiveSearch helper was not loaded before script.js.");
}
