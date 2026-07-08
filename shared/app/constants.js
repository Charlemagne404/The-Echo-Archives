export const SHOWS_DATA_URL = "/data/shows.json";
export const COLLECTIONS_DATA_URL = "/data/collections.json";
const SEARCH_INDEX_REQUEST_KEY = Date.now().toString(36);
export const SEARCH_INDEX_URL = `/data/search-index.json?view=${SEARCH_INDEX_REQUEST_KEY}`;
export const ARCHIVE_STATS_URL = "/data/archive-stats.json";
export const DEFAULT_SOCIAL_IMAGE = "/images/Logo.png";
export const DEFAULT_FALLBACK_COVER_IMAGE = "/images/TEA-Logo-S.png";
export const TOP_RATED_BADGE_ASSET_URL = "/images/badges/top-rated-bookmark.png";
export const archiveSearch = globalThis.EchoArchiveSearch;
export const archiveRecord = globalThis.EchoArchiveRecord;
export const CHAT_STORAGE_KEY = "echo-archives-chat-v3";
export const COMMUNITY_PROFILE_KEY = "echo-community-profile-id";
export const COMMUNITY_PROFILE_HEADER = "x-echo-profile-id";
export const DEFAULT_CHAT_SUGGESTIONS = [
  "How do I submit a correction?",
  "What does creator verified mean?",
  "How are community ratings different?",
  "Recommend a finished show with strong worldbuilding",
];
export const PREFERRED_QUICK_FILTERS = ["sci-fi", "mystery", "horror", "comedy", "survival", "time-travel"];
export const HOME_MOST_POPULAR_IDS = ["midnight-burger", "were-alive", "red-valley", "derelict"];
export const HOME_FAVORITE_ROUTE_IDS = [
  "shows-like-midnight-burger",
  "shows-like-welcome-to-night-vale",
  "shows-like-derelict",
  "shows-like-the-white-vault",
  "shows-like-midst",
  "shows-like-malevolent",
];
export const HOME_CARD_HOVER_EXPAND_ENABLED = document.body?.dataset.homeCardHoverExpandEnabled === "true";
export const SHOW_CARD_PREVIEW_DELAY_MS = 480;
export const SHOW_CARD_PREVIEW_CLOSE_DELAY_MS = 32;
export const SHOW_CARD_PREVIEW_CLOSE_TRANSITION_MS = 210;
export const SHOW_CARD_PREVIEW_SCROLL_IDLE_MS = 140;
export const HOME_CARD_PREVIEW_ID_PREFIX = "archiveCardPreview";

export const dataCache = {
  archiveStats: null,
  shows: null,
  collections: null,
  searchIndex: null,
  communitySummaries: new Map(),
};

export const chatState = {
  history: [],
  pending: false,
};

export const communityState = {
  profileId: null,
  profilePromise: null,
  config: null,
  configPromise: null,
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

if (!archiveRecord) {
  throw new Error("EchoArchiveRecord helper was not loaded before script.js.");
}
