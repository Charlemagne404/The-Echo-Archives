import { HOME_FAVORITE_ROUTE_IDS as HOME_FAVORITE_ROUTE_IDS_CONFIG, HOME_MOST_POPULAR_IDS as HOME_MOST_POPULAR_IDS_CONFIG } from "./home-config.js";

const SHOWS_DATA_VERSION = document.body?.dataset.showsVersion?.trim() || "";
const COLLECTIONS_DATA_VERSION = document.body?.dataset.collectionsVersion?.trim() || "";
export const SHOWS_DATA_URL = SHOWS_DATA_VERSION
  ? `/data/shows.json?v=${SHOWS_DATA_VERSION}`
  : "/data/shows.json";
export const COLLECTIONS_DATA_URL = COLLECTIONS_DATA_VERSION
  ? `/data/collections.json?v=${COLLECTIONS_DATA_VERSION}`
  : "/data/collections.json";
const SEARCH_INDEX_VERSION = document.body?.dataset.searchIndexVersion?.trim() || "";
export const SEARCH_INDEX_URL = SEARCH_INDEX_VERSION
  ? `/data/search-index.json?v=${SEARCH_INDEX_VERSION}`
  : "/data/search-index.json";
export const ARCHIVE_STATS_URL = "/data/archive-stats.json";
export const DEFAULT_SOCIAL_IMAGE = "/echo-wordmark1.png";
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
export const HOME_MOST_POPULAR_IDS = HOME_MOST_POPULAR_IDS_CONFIG;
export const HOME_FAVORITE_ROUTE_IDS = HOME_FAVORITE_ROUTE_IDS_CONFIG;
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
  communitySummaryRequests: new Map(),
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

export let backToTopBtn;
export let toggleBtn;
export let closeChatBtn;
export let clearChatButton;
export let chatContainer;
export let chatLog;
export let chatStatus;
export let chatSuggestionRegion;
export let chatSuggestions;
export let chatFootnote;
export let userInput;
export let sendMessageButton;

export function refreshSharedElements() {
  backToTopBtn = document.getElementById("backToTop");
  toggleBtn = document.getElementById("chat-toggle");
  closeChatBtn = document.getElementById("chat-close");
  clearChatButton = document.getElementById("chat-clear");
  chatContainer = document.getElementById("chat-container");
  chatLog = document.getElementById("chatLog");
  chatStatus = document.getElementById("chatStatus");
  chatSuggestionRegion = document.getElementById("chatSuggestionRegion");
  chatSuggestions = document.getElementById("chatSuggestions");
  chatFootnote = document.querySelector(".chat-footnote");
  userInput = document.getElementById("userInput");
  sendMessageButton = document.getElementById("sendMessageButton");
}

refreshSharedElements();

if (!archiveSearch) {
  throw new Error("EchoArchiveSearch helper was not loaded before script.js.");
}

if (!archiveRecord) {
  throw new Error("EchoArchiveRecord helper was not loaded before script.js.");
}
