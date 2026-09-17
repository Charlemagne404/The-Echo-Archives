import { getHomeGridLayoutBucket } from "./layout.js";

export const HOME_RESULTS_PAGE_SIZE = 60;
const HOME_HISTORY_STATE_KEY = "echoArchivesHome";

const DEFAULT_HOME_FILTER_GROUP_IDS = [
  "genres",
  "tones",
  "formats",
  "tags",
  "bestFor",
  "completionStatus",
  "reviewStatus",
];

function createHomeFilterState(structuredFilterGroups = []) {
  const groupIds = new Set(DEFAULT_HOME_FILTER_GROUP_IDS);
  structuredFilterGroups.forEach((group) => {
    const groupId = String(group?.id || "").trim();
    if (groupId) {
      groupIds.add(groupId);
    }
  });

  return Object.fromEntries(Array.from(groupIds, (groupId) => [groupId, new Set()]));
}

export function createHomeState(structuredFilterGroups = []) {
  return {
    query: "",
    filters: createHomeFilterState(structuredFilterGroups),
    selectedCollectionId: "",
    sortMode: "default",
    gridLayoutBucket: getHomeGridLayoutBucket(),
  };
}

function isValidHomeResultLimit(value) {
  return Number.isSafeInteger(value) && value >= HOME_RESULTS_PAGE_SIZE && value % HOME_RESULTS_PAGE_SIZE === 0;
}

function getHomeResultStorageKey() {
  return `echo-home-results:${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function getSavedHomeResultLimit() {
  const savedLimit = window.history.state?.[HOME_HISTORY_STATE_KEY]?.displayedResultLimit;
  if (isValidHomeResultLimit(savedLimit)) {
    return savedLimit;
  }

  try {
    const sessionLimit = Number(window.sessionStorage.getItem(getHomeResultStorageKey()));
    return isValidHomeResultLimit(sessionLimit) ? sessionLimit : HOME_RESULTS_PAGE_SIZE;
  } catch (_error) {
    return HOME_RESULTS_PAGE_SIZE;
  }
}

export function persistHomeResultLimit(displayedResultLimit) {
  if (!isValidHomeResultLimit(displayedResultLimit)) {
    return;
  }

  try {
    window.sessionStorage.setItem(getHomeResultStorageKey(), String(displayedResultLimit));
  } catch (_error) {
    // Ignore storage failures and keep the history-state path available.
  }

  const currentState = window.history.state;
  const baseState = currentState && typeof currentState === "object" && !Array.isArray(currentState) ? currentState : {};
  const currentHomeState = baseState[HOME_HISTORY_STATE_KEY];
  const homeState = currentHomeState && typeof currentHomeState === "object" && !Array.isArray(currentHomeState) ? currentHomeState : {};

  if (homeState.displayedResultLimit === displayedResultLimit) {
    return;
  }

  window.history.replaceState(
    {
      ...baseState,
      [HOME_HISTORY_STATE_KEY]: {
        ...homeState,
        displayedResultLimit,
      },
    },
    "",
  );
}
