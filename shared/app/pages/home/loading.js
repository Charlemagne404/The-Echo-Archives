function createHomeSkeletonCard() {
  const shell = document.createElement("article");
  shell.className = "archive-skeleton-card";
  shell.setAttribute("aria-hidden", "true");
  shell.innerHTML = `
    <div class="archive-skeleton-block archive-skeleton-cover"></div>
    <div class="archive-skeleton-copy">
      <span class="archive-skeleton-block archive-skeleton-title"></span>
      <span class="archive-skeleton-block archive-skeleton-line"></span>
      <span class="archive-skeleton-block archive-skeleton-rating"></span>
    </div>
  `;
  return shell;
}

function disableBrowseControls(elements) {
  [elements.searchInput, elements.stickySearchInput].forEach((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.disabled = true;
    input.setAttribute("aria-disabled", "true");
  });

  [elements.filterToggle, elements.stickyFilterToggle].forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  });
}

export function renderHomeLoadingState(elements) {
  elements.archiveGrid.textContent = "";
  elements.archiveGrid.dataset.loading = "true";
  for (let index = 0; index < 12; index += 1) {
    elements.archiveGrid.appendChild(createHomeSkeletonCard());
  }
  elements.resultsSummary.textContent = "Loading archive...";
  elements.noResultsMsg.hidden = true;
  elements.popularSection.hidden = true;
  elements.recentlyAddedSection.hidden = true;
  elements.favoriteRoutesSection.hidden = true;
  elements.collectionsSection.hidden = true;
}

export function renderHomeErrorState(elements, createErrorSurface, { preserveExistingContent = false } = {}) {
  if (preserveExistingContent) {
    delete elements.archiveGrid.dataset.loading;
    elements.resultsSummary.textContent = "Showing the build snapshot. Search and filters could not load right now.";
    elements.noResultsMsg.hidden = true;
    elements.activeBrowseState.hidden = true;
    disableBrowseControls(elements);
    return;
  }

  elements.archiveGrid.textContent = "";
  delete elements.archiveGrid.dataset.loading;
  elements.archiveGrid.appendChild(createErrorSurface());
  elements.resultsSummary.textContent = "Archive data could not load.";
  elements.noResultsMsg.hidden = true;
  elements.popularSection.hidden = true;
  elements.recentlyAddedSection.hidden = true;
  elements.favoriteRoutesSection.hidden = true;
  elements.collectionsSection.hidden = true;
}
