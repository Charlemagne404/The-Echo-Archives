const DIRECTORY_FILTER_VALUES = new Set(["all", "production-company", "studio", "network"]);
const DIRECTORY_SORT_VALUES = new Set(["name", "shows"]);

export function normalizeEntityDirectoryFilter(value) {
  return DIRECTORY_FILTER_VALUES.has(value) ? value : "all";
}

export function normalizeEntityDirectorySort(value) {
  return DIRECTORY_SORT_VALUES.has(value) ? value : "name";
}

export function parseEntityDirectoryUrlState(location = window.location) {
  const params = new URLSearchParams(location.search);
  return {
    query: params.get("q") || "",
    type: normalizeEntityDirectoryFilter(params.get("type")),
    sort: normalizeEntityDirectorySort(params.get("sort")),
  };
}

export function buildEntityDirectoryUrl(state, location = window.location) {
  const params = new URLSearchParams(location.search);
  params.delete("q");
  params.delete("type");
  params.delete("sort");

  if (state.query) {
    params.set("q", state.query);
  }
  if (state.type !== "all") {
    params.set("type", state.type);
  }
  if (state.sort !== "name") {
    params.set("sort", state.sort);
  }

  const nextSearch = params.toString();
  return `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`;
}

export function syncEntityDirectoryUrlState(state, { historyMode = "replace" } = {}) {
  const nextUrl = buildEntityDirectoryUrl(state);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const shouldWrite = historyMode === "push" || nextUrl !== currentUrl;

  if (shouldWrite) {
    const method = historyMode === "push" ? "pushState" : "replaceState";
    window.history[method](window.history.state, "", nextUrl);
  }

  return nextUrl;
}
