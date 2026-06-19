import { getHomeGridLayoutBucket } from "./layout.js";

export function createHomeState() {
  return {
    query: "",
    filters: {
      genres: new Set(),
      tags: new Set(),
      bestFor: new Set(),
      completionStatus: new Set(),
      reviewStatus: new Set(),
    },
    selectedCollectionId: "",
    sortMode: "default",
    gridLayoutBucket: getHomeGridLayoutBucket(),
  };
}
