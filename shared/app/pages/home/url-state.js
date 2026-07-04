import { normalizeTag } from "../../utils.js";

const HOME_SORT_MODES = new Set(["default", "recently-updated"]);

export function seedHomeStateFromParams({ state, shows, collectionsById, structuredFilterGroups }) {
  const params = new URLSearchParams(window.location.search);
  const initialCollectionId = params.get("collection") || "";
  if (collectionsById.has(initialCollectionId)) {
    state.selectedCollectionId = initialCollectionId;
  }

  state.query = params.get("q")?.trim() || "";

  const sortMode = params.get("sort") || "";
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

export function syncBrowseUrlState(state) {
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.delete("collection");
  nextParams.delete("genre");
  nextParams.delete("q");
  nextParams.delete("sort");
  Object.keys(state.filters || {}).forEach((groupId) => {
    nextParams.delete(groupId);
  });

  if (state.selectedCollectionId) {
    nextParams.set("collection", state.selectedCollectionId);
  }

  if (state.query) {
    nextParams.set("q", state.query);
  }

  if (state.sortMode && state.sortMode !== "default") {
    nextParams.set("sort", state.sortMode);
  }

  Array.from(state.filters.genres)
    .sort()
    .forEach((genreId) => {
      nextParams.append("genre", genreId);
    });

  Object.entries(state.filters || {}).forEach(([groupId, values]) => {
    if (groupId === "genres") {
      return;
    }

    Array.from(values)
      .sort()
      .forEach((value) => {
        nextParams.append(groupId, value);
      });
  });

  const nextSearch = nextParams.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }
}
