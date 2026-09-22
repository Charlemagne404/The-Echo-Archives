import { normalizeTag } from "../utils.js";

export const COLLECTION_SORT_MODES = new Set(["editorial", "newest", "title", "shows", "rating", "popularity"]);

export function parseCollectionsUrlState(location = window.location, validIntentIds = new Set()) {
  const params = new URLSearchParams(location.search);
  const intent = normalizeTag(params.get("intent") || "");
  const sort = params.get("sort") === "updated" ? "newest" : params.get("sort") || "editorial";

  return {
    intent: validIntentIds.has(intent) ? intent : "",
    query: params.get("q") || "",
    sortMode: COLLECTION_SORT_MODES.has(sort) ? sort : "editorial",
  };
}

export function buildCollectionsUrl(state, location = window.location) {
  const params = new URLSearchParams(location.search);
  params.delete("intent");
  params.delete("q");
  params.delete("sort");

  if (state.intent) {
    params.set("intent", state.intent);
  }
  if (state.query) {
    params.set("q", state.query);
  }
  if (state.sortMode !== "editorial") {
    params.set("sort", state.sortMode);
  }

  const nextSearch = params.toString();
  return `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`;
}

export function syncCollectionsUrlState(state, { historyMode = "replace" } = {}) {
  const nextUrl = buildCollectionsUrl(state);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const shouldWrite = historyMode === "push" || nextUrl !== currentUrl;

  if (shouldWrite) {
    const method = historyMode === "push" ? "pushState" : "replaceState";
    window.history[method](window.history.state, "", nextUrl);
  }

  return nextUrl;
}
