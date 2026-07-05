export function createFilterMenuState() {
  return {
    view: "launcher",
    activeBucketId: "",
    tagQuery: "",
  };
}

export function resetFilterMenuState(menuState) {
  if (!menuState) {
    return;
  }

  menuState.view = "launcher";
  menuState.activeBucketId = "";
  menuState.tagQuery = "";
}

export function openFilterMenuBucket(menuState, bucketId) {
  if (!menuState) {
    return;
  }

  menuState.view = "detail";
  menuState.activeBucketId = bucketId;
  menuState.tagQuery = "";
}

export function getActiveFilterCount(filters) {
  return Object.values(filters).reduce((count, values) => count + values.size, 0);
}

export function matchesSelectedFilters(show, filters) {
  return Object.entries(filters).every(([groupId, selectedValues]) => {
    if (selectedValues.size === 0) {
      return true;
    }

    const values = (() => {
      switch (groupId) {
        case "genres":
          return show.genreTokens;
        case "tones":
          return Array.isArray(show.tones) ? show.tones : [];
        case "formats":
          return Array.isArray(show.formats) ? show.formats : [];
        case "tags":
          return show.tagTokens;
        case "bestFor":
          return show.bestForTokens;
        case "completionStatus":
          return [show.completionStatus || "unclear"];
        case "reviewStatus":
          return [show.reviewStatus || "indexed-only"];
        default:
          return [];
      }
    })();

    return Array.from(selectedValues).some((value) => values.includes(value));
  });
}
