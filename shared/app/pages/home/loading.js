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

export function setBrowseControlsDisabled(elements, disabled) {
  [elements.searchInput, elements.stickySearchInput, elements.stickySearchToggle, elements.filterToggle, elements.stickyFilterToggle].forEach((control) => {
    if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLButtonElement)) {
      return;
    }

    control.disabled = disabled;
    if (disabled) {
      control.setAttribute("aria-disabled", "true");
    } else {
      control.removeAttribute("aria-disabled");
    }
  });

  document.body.dataset.homeReady = disabled ? "false" : "true";
}

export function renderHomeLoadingState(elements) {
  elements.archiveGrid.textContent = "";
  elements.archiveGrid.dataset.loading = "true";
  for (let index = 0; index < 12; index += 1) {
    elements.archiveGrid.appendChild(createHomeSkeletonCard());
  }
  elements.resultsSummary.textContent = "Loading archive...";
  elements.noResultsMount.replaceChildren();
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
    setBrowseControlsDisabled(elements, true);
    return;
  }

  elements.archiveGrid.textContent = "";
  delete elements.archiveGrid.dataset.loading;
  elements.archiveGrid.appendChild(createErrorSurface());
  elements.resultsSummary.textContent = "Archive data could not load.";
  elements.noResultsMount.replaceChildren();
  elements.popularSection.hidden = true;
  elements.recentlyAddedSection.hidden = true;
  elements.favoriteRoutesSection.hidden = true;
  elements.collectionsSection.hidden = true;
}
