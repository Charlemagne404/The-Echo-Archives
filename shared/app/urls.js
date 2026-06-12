export function createCollectionHref(collectionId) {
  return `/collection.html?id=${encodeURIComponent(collectionId)}`;
}

export function createArchiveCollectionHref(collectionId) {
  return `/index.html?collection=${encodeURIComponent(collectionId)}#archive`;
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
  return `/submit.html${search ? `?${search}` : ""}`;
}
