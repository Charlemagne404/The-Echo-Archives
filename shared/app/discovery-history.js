export const DISCOVERY_SEARCH_COMMIT_DELAY_MS = 500;

export function createDiscoveryHistoryController({
  state,
  buildUrl,
  syncUrl,
  onBeforeSync = () => {},
} = {}) {
  let lastCommittedUrl = "";

  const synchronizeUrlState = (historyMode = "replace", changeReason = "explicit") => {
    const nextUrl = buildUrl(state);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const shouldPush = historyMode === "push" && nextUrl !== lastCommittedUrl;
    const effectiveHistoryMode = shouldPush ? "push" : "replace";
    if (effectiveHistoryMode === "push" || nextUrl !== currentUrl) {
      onBeforeSync({ changeReason, currentUrl, historyMode: effectiveHistoryMode, nextUrl });
    }
    const syncedUrl = syncUrl(state, { historyMode: effectiveHistoryMode });
    if (effectiveHistoryMode === "push" || changeReason === "initial" || changeReason === "history-restore") {
      lastCommittedUrl = syncedUrl;
    }
    return syncedUrl;
  };

  return {
    commitCurrentUrlState() {
      const nextUrl = buildUrl(state);
      if (nextUrl === lastCommittedUrl) {
        synchronizeUrlState("replace", "search-commit");
        return false;
      }

      synchronizeUrlState("push", "search-commit");
      return true;
    },
    markCurrentUrl() {
      lastCommittedUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    },
    synchronizeUrlState,
  };
}

export function createDebouncedHistoryCommit({
  onCommit,
  delayMs = DISCOVERY_SEARCH_COMMIT_DELAY_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  let timer = null;
  let pending = false;

  const cancelTimer = () => {
    if (timer !== null) {
      clearTimeoutImpl(timer);
      timer = null;
    }
  };

  const schedule = () => {
    pending = true;
    cancelTimer();
    timer = setTimeoutImpl(() => {
      timer = null;
      if (!pending) {
        return;
      }

      pending = false;
      onCommit?.();
    }, delayMs);
  };

  const commitNow = () => {
    if (!pending) {
      return false;
    }

    cancelTimer();
    pending = false;
    onCommit?.();
    return true;
  };

  const cancel = () => {
    cancelTimer();
    pending = false;
  };

  return {
    cancel,
    commitNow,
    isPending: () => pending,
    schedule,
  };
}
