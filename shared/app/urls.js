export function createCollectionHref(collectionId) {
  return `/collection?id=${encodeURIComponent(collectionId)}`;
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
