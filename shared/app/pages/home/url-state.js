import { normalizeTag } from "../../utils.js";

export function seedHomeStateFromParams({ state, shows, collectionsById }) {
  const params = new URLSearchParams(window.location.search);
  const initialCollectionId = params.get("collection") || "";
  if (collectionsById.has(initialCollectionId)) {
    state.selectedCollectionId = initialCollectionId;
  }

  params.getAll("genre").forEach((genreId) => {
    const normalizedGenreId = normalizeTag(genreId);
    const hasGenre = shows.some((show) => show.genreTokens.includes(normalizedGenreId));
    if (hasGenre) {
      state.filters.genres.add(normalizedGenreId);
    }
  });
}

export function syncBrowseUrlState(state) {
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.delete("collection");
  nextParams.delete("genre");

  if (state.selectedCollectionId) {
    nextParams.set("collection", state.selectedCollectionId);
  }

  Array.from(state.filters.genres)
    .sort()
    .forEach((genreId) => {
      nextParams.append("genre", genreId);
    });

  const nextSearch = nextParams.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }
}
