import { FILTER_OPTION_TOGGLE_DURATION_MS, restartAnimationClass } from "./filter-motion.js";
import {
  formatFilterBucketStatus,
  formatFilterGroupCount,
  getBucketSelectionCount,
  getSortedSelectedOptions,
} from "./filter-utils.js";

const FILTER_TAG_SUGGESTION_LIMIT = 8;
const FILTER_TAG_SEARCH_LIMIT = 18;

export function renderFilterMenu({
  filterDropdown,
  filterOptionGrid,
  filterMenuBuckets,
  filterOptionsByGroup,
  filters,
  menuState,
  onOpenBucket,
  onBackToLauncher,
  onToggleFilter,
  onClearBucketFilters,
}) {
  if (!filterDropdown || !filterOptionGrid) {
    return;
  }

  filterOptionGrid.textContent = "";
  const activeBucket = filterMenuBuckets.find((bucket) => bucket.id === menuState.activeBucketId) || null;
  filterDropdown.dataset.menuView = activeBucket ? "detail" : "launcher";
  syncFilterDropdownHeader({ filterDropdown, activeBucket });

  if (!activeBucket) {
    renderFilterMenuLauncher({
      filterOptionGrid,
      filterMenuBuckets,
      filterOptionsByGroup,
      filters,
      onOpenBucket,
    });
    return;
  }

  renderFilterMenuDetail({
    filterOptionGrid,
    bucket: activeBucket,
    filterOptionsByGroup,
    filters,
    menuState,
    onBackToLauncher,
    onToggleFilter,
    onClearBucketFilters,
  });
}

function syncFilterDropdownHeader({ filterDropdown, activeBucket }) {
  const intro = filterDropdown.querySelector(".filter-dropdown-header > div");
  const kicker = filterDropdown.querySelector(".filter-dropdown-kicker");
  const copy = filterDropdown.querySelector(".filter-dropdown-copy");
  if (!intro || !kicker || !copy) {
    return;
  }

  let title = intro.querySelector(".filter-dropdown-title");
  if (!(title instanceof HTMLElement)) {
    title = document.createElement("p");
    title.className = "filter-dropdown-title";
    copy.before(title);
  }

  kicker.textContent = activeBucket ? "Filter bucket" : "Refine the archive";
  title.textContent = activeBucket ? activeBucket.label : "Archive filters";
  copy.textContent = activeBucket
    ? activeBucket.description
    : "Start with story type, tone, listening context, archive status, or tags.";
}

function renderFilterMenuLauncher({
  filterOptionGrid,
  filterMenuBuckets,
  filterOptionsByGroup,
  filters,
  onOpenBucket,
}) {
  const launcher = document.createElement("div");
  launcher.className = "filter-menu-launcher";

  filterMenuBuckets.forEach((bucket) => {
    const button = document.createElement("button");
    button.className = "filter-bucket-card";
    button.type = "button";
    button.dataset.filterBucketId = bucket.id;
    button.dataset.hasSelection = String(getBucketSelectionCount(bucket, filters) > 0);
    button.addEventListener("click", () => {
      onOpenBucket(bucket.id);
    });

    const copy = document.createElement("span");
    copy.className = "filter-bucket-copy";

    const label = document.createElement("span");
    label.className = "filter-bucket-label";
    label.textContent = bucket.label;

    const description = document.createElement("span");
    description.className = "filter-bucket-description";
    description.textContent = bucket.description;

    const meta = document.createElement("span");
    meta.className = "filter-bucket-meta";

    const status = document.createElement("span");
    status.className = "filter-bucket-status";
    status.dataset.filterBucketStatus = bucket.id;
    status.textContent = formatFilterBucketStatus(bucket, filters, filterOptionsByGroup);

    const chevron = document.createElement("span");
    chevron.className = "filter-bucket-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";

    copy.append(label, description);
    meta.append(status, chevron);
    button.append(copy, meta);
    launcher.appendChild(button);
  });

  filterOptionGrid.appendChild(launcher);
}

function renderFilterMenuDetail({
  filterOptionGrid,
  bucket,
  filterOptionsByGroup,
  filters,
  menuState,
  onBackToLauncher,
  onToggleFilter,
  onClearBucketFilters,
}) {
  const detail = document.createElement("div");
  detail.className = "filter-menu-detail";
  detail.dataset.filterBucket = bucket.id;

  const toolbar = document.createElement("div");
  toolbar.className = "filter-detail-toolbar";

  const backButton = document.createElement("button");
  backButton.className = "filter-back-button";
  backButton.type = "button";
  backButton.textContent = "Back";
  backButton.addEventListener("click", () => {
    onBackToLauncher();
  });

  const titleBlock = document.createElement("div");
  titleBlock.className = "filter-detail-title-block";

  const title = document.createElement("p");
  title.className = "filter-detail-title";
  title.textContent = bucket.label;

  const status = document.createElement("p");
  status.className = "filter-detail-status";
  status.dataset.filterBucketStatus = bucket.id;
  status.textContent = formatFilterBucketStatus(bucket, filters, filterOptionsByGroup);

  const clearButton = document.createElement("button");
  clearButton.className = "filter-bucket-clear";
  clearButton.type = "button";
  clearButton.dataset.filterBucketClear = bucket.id;
  clearButton.textContent = "Clear section";
  clearButton.hidden = getBucketSelectionCount(bucket, filters) === 0;

  titleBlock.append(title, status);
  toolbar.append(backButton, titleBlock, clearButton);
  detail.appendChild(toolbar);

  let rerenderDetailResults = null;
  if (bucket.searchable) {
    const tagDetail = createTagFinderDetail({
      bucket,
      filters,
      filterOptionsByGroup,
      menuState,
      onToggleFilter,
    });
    rerenderDetailResults = tagDetail.__renderResults;
    detail.appendChild(tagDetail);
  } else {
    const scroll = document.createElement("div");
    scroll.className = "filter-detail-scroll";
    bucket.groups.forEach((group) => {
      scroll.appendChild(
        createFilterGroupSection({
          group,
          filters,
          onToggleFilter,
        }),
      );
    });
    detail.appendChild(scroll);
  }

  clearButton.addEventListener("click", () => {
    onClearBucketFilters(bucket.id);
    rerenderDetailResults?.();
  });

  filterOptionGrid.appendChild(detail);
}

function createTagFinderDetail({
  bucket,
  filters,
  filterOptionsByGroup,
  menuState,
  onToggleFilter,
}) {
  const tagGroup = bucket.groups[0];
  const scroll = document.createElement("div");
  scroll.className = "filter-detail-scroll";

  const searchField = document.createElement("label");
  searchField.className = "filter-tag-search-field";

  const searchLabel = document.createElement("span");
  searchLabel.className = "filter-tag-search-label";
  searchLabel.textContent = "Search tags";

  const searchInput = document.createElement("input");
  searchInput.className = "filter-tag-search-input";
  searchInput.type = "search";
  searchInput.placeholder = "Find a tag";
  searchInput.value = menuState.tagQuery;

  const resultsRoot = document.createElement("div");
  resultsRoot.className = "filter-tag-results";

  const renderResults = () => {
    renderTagFinderResults({
      resultsRoot,
      tagGroup,
      filters,
      filterOptionsByGroup,
      menuState,
      onToggleFilter,
    });
  };

  searchInput.addEventListener("input", () => {
    menuState.tagQuery = searchInput.value.trim();
    renderResults();
  });

  searchField.append(searchLabel, searchInput);
  scroll.append(searchField, resultsRoot);
  renderResults();
  scroll.__renderResults = renderResults;

  return scroll;
}

function renderTagFinderResults({
  resultsRoot,
  tagGroup,
  filters,
  filterOptionsByGroup,
  menuState,
  onToggleFilter,
}) {
  resultsRoot.textContent = "";

  const tagOptions = tagGroup?.options || [];
  const selectedTagIds = filters.tags || new Set();
  const selectedTags = getSortedSelectedOptions("tags", selectedTagIds, filterOptionsByGroup);
  const selectedTagMap = new Set(selectedTags.map((option) => option.id));
  const query = menuState.tagQuery.trim().toLowerCase();
  const toggleTagFilter = (groupId, filterId) => {
    onToggleFilter(groupId, filterId);
    renderTagFinderResults({
      resultsRoot,
      tagGroup,
      filters,
      filterOptionsByGroup,
      menuState,
      onToggleFilter,
    });
  };

  if (selectedTags.length > 0) {
    resultsRoot.appendChild(
      createFilterOptionSection({
        countText: `${selectedTags.length} selected`,
        filters,
        groupId: "tags",
        onToggleFilter: toggleTagFilter,
        options: selectedTags,
        title: "Selected tags",
      }),
    );
  }

  if (!query) {
    const suggestions = tagOptions
      .filter((option) => !selectedTagMap.has(option.id))
      .slice(0, FILTER_TAG_SUGGESTION_LIMIT);

    resultsRoot.appendChild(
      createFilterOptionSection({
        countText: `${suggestions.length} suggestions`,
        filters,
        groupId: "tags",
        onToggleFilter: toggleTagFilter,
        options: suggestions,
        title: "Popular tags",
      }),
    );
    return;
  }

  const matches = tagOptions
    .filter((option) => {
      const haystack = `${option.label} ${option.id}`.toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, FILTER_TAG_SEARCH_LIMIT);

  if (matches.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "filter-empty-note";
    emptyState.textContent = "No tag matches yet. Try a broader archive keyword.";
    resultsRoot.appendChild(emptyState);
    return;
  }

  resultsRoot.appendChild(
    createFilterOptionSection({
      countText: `${matches.length} matches`,
      filters,
      groupId: "tags",
      onToggleFilter: toggleTagFilter,
      options: matches,
      title: "Matching tags",
    }),
  );
}

function createFilterGroupSection({ group, filters, onToggleFilter }) {
  const section = document.createElement("section");
  section.className = "filter-group";

  const heading = document.createElement("div");
  heading.className = "filter-group-heading";

  const title = document.createElement("p");
  title.className = "filter-group-title";
  title.textContent = group.label;

  const count = document.createElement("p");
  count.className = "filter-group-count";
  count.dataset.filterGroupCountFor = group.id;
  count.textContent = formatFilterGroupCount(group, filters);

  heading.append(title, count);
  section.append(
    heading,
    createFilterOptionGrid({
      filters,
      groupId: group.id,
      onToggleFilter,
      options: group.options,
    }),
  );

  return section;
}

function createFilterOptionSection({ title, countText, filters, groupId, onToggleFilter, options }) {
  const section = document.createElement("section");
  section.className = "filter-group filter-tag-group";

  const heading = document.createElement("div");
  heading.className = "filter-group-heading";

  const titleNode = document.createElement("p");
  titleNode.className = "filter-group-title";
  titleNode.textContent = title;

  const countNode = document.createElement("p");
  countNode.className = "filter-group-count";
  countNode.textContent = countText;

  heading.append(titleNode, countNode);
  section.append(
    heading,
    createFilterOptionGrid({
      filters,
      groupId,
      onToggleFilter,
      options,
    }),
  );

  return section;
}

function createFilterOptionGrid({ filters, groupId, onToggleFilter, options }) {
  const optionGrid = document.createElement("div");
  optionGrid.className = "filter-group-options";

  options.forEach((option) => {
    optionGrid.appendChild(
      createFilterOptionButton({
        filterId: option.id,
        filters,
        groupId,
        label: option.label,
        onToggleFilter,
      }),
    );
  });

  return optionGrid;
}

function createFilterOptionButton({ filterId, filters, groupId, label, onToggleFilter }) {
  const button = document.createElement("button");
  button.className = "filter-option";
  button.type = "button";
  button.dataset.filterGroup = groupId;
  button.dataset.filterValue = filterId;
  button.textContent = label;
  const isActive = Boolean(filters[groupId]?.has(filterId));
  button.classList.toggle("is-active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
  button.addEventListener("click", () => {
    restartAnimationClass(button, "is-toggling", FILTER_OPTION_TOGGLE_DURATION_MS);
    onToggleFilter(groupId, filterId);
  });

  return button;
}
