import "../../../discovery/url-state.js";
import { normalizeTag } from "../../utils.js";

const HOME_SORT_MODES = new Set(["default", "recently-updated"]);
const discoveryUrlState = globalThis.EchoDiscoveryUrlState;

export function seedHomeStateFromParams({ state, shows, collectionsById, structuredFilterGroups }) {
  const params = new URLSearchParams(window.location.search);
  const publicDiscoveryState = discoveryUrlState.parsePublicDiscoveryUrl(window.location.href);

  state.selectedCollectionId = "";
  state.query = "";
  state.discoveryIntent = null;
  state.sortMode = "default";
  Object.values(state.filters || {}).forEach((values) => values.clear());

  const initialCollectionId = params.get("collection") || publicDiscoveryState.collectionId || "";
  if (collectionsById.has(initialCollectionId)) {
    state.selectedCollectionId = initialCollectionId;
  }

  state.query = (params.has("q") ? params.get("q") : publicDiscoveryState.query)?.trim().slice(0, 200) || "";

  const sortMode = params.get("sort") || publicDiscoveryState.sort || "";
  if (HOME_SORT_MODES.has(sortMode)) {
    state.sortMode = sortMode;
  }

  const validOptionsByGroup = new Map(
    (Array.isArray(structuredFilterGroups) ? structuredFilterGroups : []).map((group) => [
      group.id,
      new Set(group.options.map((option) => normalizeTag(option.id))),
    ]),
  );

  params.getAll("genre").forEach((genreId) => {
    const normalizedGenreId = normalizeTag(genreId);
    const hasGenre = shows.some((show) => show.genreTokens.includes(normalizedGenreId));
    if (hasGenre) {
      state.filters.genres.add(normalizedGenreId);
    }
  });

  validOptionsByGroup.forEach((validOptions, groupId) => {
    if (groupId === "genres") {
      return;
    }

    params.getAll(groupId).forEach((value) => {
      const normalizedValue = normalizeTag(value);
      if (validOptions.has(normalizedValue)) {
        state.filters[groupId]?.add(normalizedValue);
      }
    });
  });
}

export function buildBrowseUrlState(state, location = window.location) {
  const nextParams = new URLSearchParams(location.search);
  const appendUnique = (name, value) => {
    if (!nextParams.getAll(name).includes(value)) {
      nextParams.append(name, value);
    }
  };
  discoveryUrlState.PARAM_ORDER.forEach((name) => nextParams.delete(name));
  nextParams.delete("collection");
  nextParams.delete("genre");
  nextParams.delete("q");
  nextParams.delete("sort");
  Object.keys(state.filters || {}).forEach((groupId) => {
    nextParams.delete(groupId);
  });

  const currentDiscoveryIntent = state.discoveryIntent?.query === state.query ? state.discoveryIntent : null;
  if (currentDiscoveryIntent) {
    const discoveryUrl = discoveryUrlState.serializePublicUrlState(currentDiscoveryIntent, {
      pathname: location.pathname,
    });
    const discoveryParams = new URLSearchParams(discoveryUrl.split("?")[1] || "");
    discoveryParams.forEach((value, name) => {
      if (!nextParams.getAll(name).includes(value)) nextParams.append(name, value);
    });
  } else if (state.query) {
    nextParams.set("q", state.query);
  }

  if (state.selectedCollectionId) {
    nextParams.set("collection", state.selectedCollectionId);
  }

  if (state.query && !state.discoveryIntent && !nextParams.has("q")) {
    nextParams.set("q", state.query);
  }

  if (state.sortMode && state.sortMode !== "default") {
    nextParams.set("sort", state.sortMode);
  }

  Array.from(state.filters.genres)
    .sort()
    .forEach((genreId) => {
      appendUnique("genre", genreId);
    });

  Object.entries(state.filters || {}).forEach(([groupId, values]) => {
    if (groupId === "genres") {
      return;
    }

    Array.from(values)
      .sort()
      .forEach((value) => {
        appendUnique(groupId, value);
      });
  });

  const nextSearch = nextParams.toString();
  return `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`;
}

export function syncBrowseUrlState(state, { historyMode = "replace" } = {}) {
  const nextUrl = buildBrowseUrlState(state);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const shouldWrite = historyMode === "push" || nextUrl !== currentUrl;

  if (shouldWrite) {
    const method = historyMode === "push" ? "pushState" : "replaceState";
    window.history[method](window.history.state, "", nextUrl);
  }

  return nextUrl;
}
