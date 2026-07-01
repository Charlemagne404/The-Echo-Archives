import { getHomeGridLayoutBucket } from "./layout.js";

const DEFAULT_HOME_FILTER_GROUP_IDS = [
  "genres",
  "tones",
  "formats",
  "tags",
  "bestFor",
  "completionStatus",
  "reviewStatus",
];

function createHomeFilterState(structuredFilterGroups = []) {
  const groupIds = new Set(DEFAULT_HOME_FILTER_GROUP_IDS);
  structuredFilterGroups.forEach((group) => {
    const groupId = String(group?.id || "").trim();
    if (groupId) {
      groupIds.add(groupId);
    }
  });

  return Object.fromEntries(Array.from(groupIds, (groupId) => [groupId, new Set()]));
}

export function createHomeState(structuredFilterGroups = []) {
  return {
    query: "",
    filters: createHomeFilterState(structuredFilterGroups),
    selectedCollectionId: "",
    sortMode: "default",
    gridLayoutBucket: getHomeGridLayoutBucket(),
  };
}
