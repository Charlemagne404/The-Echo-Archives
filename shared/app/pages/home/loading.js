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

export function renderHomeErrorState(elements, createErrorSurface) {
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
