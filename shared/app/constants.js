import { HOME_FAVORITE_ROUTE_IDS as HOME_FAVORITE_ROUTE_IDS_CONFIG, HOME_MOST_POPULAR_IDS as HOME_MOST_POPULAR_IDS_CONFIG } from "./home-config.js";

const pageBody = globalThis.document?.body;
const SHOWS_DATA_VERSION = pageBody?.dataset.showsVersion?.trim() || "";
const COLLECTIONS_DATA_VERSION = pageBody?.dataset.collectionsVersion?.trim() || "";
export const SHOWS_DATA_URL = SHOWS_DATA_VERSION
  ? `/data/shows.json?v=${SHOWS_DATA_VERSION}`
  : "/data/shows.json";
export const COLLECTIONS_DATA_URL = COLLECTIONS_DATA_VERSION
  ? `/data/collections.json?v=${COLLECTIONS_DATA_VERSION}`
  : "/data/collections.json";
const SEARCH_INDEX_VERSION = pageBody?.dataset.searchIndexVersion?.trim() || "";
export const SEARCH_INDEX_URL = SEARCH_INDEX_VERSION
  ? `/data/search-index.json?v=${SEARCH_INDEX_VERSION}`
  : "/data/search-index.json";
const RUNTIME_EVIDENCE_VERSION = pageBody?.dataset.runtimeEvidenceVersion?.trim() || "";
export const RUNTIME_EVIDENCE_URL = RUNTIME_EVIDENCE_VERSION
  ? `/data/runtime-evidence.json?v=${RUNTIME_EVIDENCE_VERSION}`
  : "/data/runtime-evidence.json";
export const ARCHIVE_STATS_URL = "/data/archive-stats.json";
export const DEFAULT_SOCIAL_IMAGE = "/echo-wordmark1.png";
export const DEFAULT_FALLBACK_COVER_IMAGE = "/images/TEA-Logo-S.png";
export const TOP_RATED_BADGE_ASSET_URL = "/images/badges/top-rated-bookmark.png";
export const archiveSearch = globalThis.EchoArchiveSearch;
export const archiveSimilarity = globalThis.EchoArchiveSimilarity;
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
export const HOME_CARD_HOVER_EXPAND_ENABLED = pageBody?.dataset.homeCardHoverExpandEnabled === "true";
export const ARCHIVIST_ENABLED = pageBody?.dataset.archivistEnabled === "true";
export const SHOW_CARD_PREVIEW_DELAY_MS = 480;
export const SHOW_CARD_PREVIEW_CLOSE_DELAY_MS = 32;
export const SHOW_CARD_PREVIEW_CLOSE_TRANSITION_MS = 210;
export const SHOW_CARD_PREVIEW_SCROLL_IDLE_MS = 140;
export const HOME_CARD_PREVIEW_ID_PREFIX = "archiveCardPreview";

export const dataCache = {
  archiveStats: null,
  archiveStatsPromise: null,
  shows: null,
  showsPromise: null,
  collections: null,
  collectionsPromise: null,
  searchIndex: null,
  searchIndexPromise: null,
  runtimeEvidence: null,
  runtimeEvidencePromise: null,
  communitySummaries: new Map(),
  communitySummaryRequests: new Map(),
  listenerReviewSummaries: new Map(),
  listenerReviewSummaryRequests: new Map(),
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
  const currentDocument = globalThis.document;
  if (!currentDocument?.getElementById) return;
  backToTopBtn = currentDocument.getElementById("backToTop");
  toggleBtn = currentDocument.getElementById("chat-toggle");
  closeChatBtn = currentDocument.getElementById("chat-close");
  clearChatButton = currentDocument.getElementById("chat-clear");
  chatContainer = currentDocument.getElementById("chat-container");
  chatLog = currentDocument.getElementById("chatLog");
  chatStatus = currentDocument.getElementById("chatStatus");
  chatSuggestionRegion = currentDocument.getElementById("chatSuggestionRegion");
  chatSuggestions = currentDocument.getElementById("chatSuggestions");
  chatFootnote = currentDocument.querySelector?.(".chat-footnote") || null;
  userInput = currentDocument.getElementById("userInput");
  sendMessageButton = currentDocument.getElementById("sendMessageButton");
}

refreshSharedElements();

if (globalThis.document && !archiveSearch) {
  throw new Error("EchoArchiveSearch helper was not loaded before script.js.");
}

if (globalThis.document && !archiveRecord) {
  throw new Error("EchoArchiveRecord helper was not loaded before script.js.");
}
