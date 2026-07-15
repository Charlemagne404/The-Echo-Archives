export function createShowHref(showId) {
  return `/shows/${encodeURIComponent(showId)}`;
}

export function createCollectionHref(collectionId) {
  return `/collections/${encodeURIComponent(collectionId)}`;
}

function getPathId(pathname, routeName) {
  const match = String(pathname || "").match(new RegExp(`^/${routeName}/([^/]+)/?$`));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch (_error) {
    return "";
  }
}

export function getShowIdFromLocation(location = window.location) {
  return getPathId(location.pathname, "shows") || new URLSearchParams(location.search).get("id") || "";
}

export function getCollectionIdFromLocation(location = window.location) {
  return getPathId(location.pathname, "collections") || new URLSearchParams(location.search).get("id") || "";
}

export function createArchiveCollectionHref(collectionId) {
  return `/?collection=${encodeURIComponent(collectionId)}#archive`;
}

export function createArchiveGenreHref(genreId) {
  return `/?genre=${encodeURIComponent(genreId)}#archive`;
}

export function createSubmissionHref(submissionType = "", showId = "") {
  const query = new URLSearchParams();
  if (submissionType) {
    query.set("submissionType", submissionType);
  }
  if (showId) {
    query.set("showId", showId);
  }

  const search = query.toString();
  return `/submit${search ? `?${search}` : ""}`;
}
