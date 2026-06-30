import {
  createMaintainerSession,
  destroyMaintainerSession,
  draftMaintainerImportCandidate,
  fetchMaintainerImportCandidate,
  fetchMaintainerImports,
  hydrateMaintainerImportCandidate,
  MaintainerAuthError,
  patchMaintainerImportCandidateReview,
  publishMaintainerImportCandidate,
  searchMaintainerImportSources,
  seedMaintainerImportCandidates,
} from "../maintainer/api.js";
import {
  buildImportFilterSummary,
  getStoredReviewer,
  IMPORT_FILTER_OPTIONS,
  initializeAuthFlow,
  readImportFilters,
  renderSelectOptions,
  setAuthState,
  setStoredReviewer,
  syncImportFiltersToUrl,
} from "../maintainer-import/page-helpers.js";
import {
  formatScopeStatus,
  formatStatus,
  summarizeImportCounts,
} from "../maintainer-import/format.js";
import {
  renderImportDetailPane,
  renderImportQueueList,
  renderImportReportContent,
  renderImportSearchResults,
  renderImportSummaryCards,
} from "../maintainer-import/render.js";

async function readFileInput(fileInput) {
  const file = fileInput?.files?.[0];
  return file ? file.text() : "";
}

async function collectSeedEntries(textarea, fileInput) {
  const [textareaText, fileText] = await Promise.all([
    Promise.resolve(textarea?.value || ""),
    readFileInput(fileInput),
  ]);

  return [textareaText, fileText]
    .join("\n")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildReviewPayload(form) {
  const formData = new FormData(form);
  return {
    status: String(formData.get("status") || ""),
    scopeStatus: String(formData.get("scopeStatus") || ""),
    reviewedBy: String(formData.get("reviewedBy") || "").trim(),
    reviewNotes: String(formData.get("reviewNotes") || ""),
    duplicateOfShowId: String(formData.get("duplicateOfShowId") || "").trim(),
    duplicateOfCandidateId: String(formData.get("duplicateOfCandidateId") || "").trim(),
  };
}

export async function initializeMaintainerImportsPage() {
  if (!document.body.classList.contains("maintainer-import-page")) {
    return;
  }

  if (document.body.classList.contains("maintainer-import-report-page")) {
    await initializeMaintainerImportsReportPage();
    return;
  }

  const state = {
    filters: readImportFilters(20),
    response: null,
    selectedId: "",
    storedReviewer: getStoredReviewer(),
    searchResults: [],
  };

  const elements = {
    authPanel: document.getElementById("maintainerAuthPanel"),
    appShell: document.getElementById("maintainerAppShell"),
    authStatus: document.getElementById("maintainerAuthStatus"),
    summaryCards: document.getElementById("maintainerSummaryCards"),
    list: document.getElementById("maintainerList"),
    detail: document.getElementById("maintainerDetail"),
    listStatus: document.getElementById("maintainerListStatus"),
    detailMeta: document.getElementById("maintainerDetailMeta"),
    queueMeta: document.getElementById("maintainerQueueMeta"),
    paginationSummary: document.getElementById("maintainerPaginationSummary"),
    previousPage: document.getElementById("maintainerPreviousPage"),
    nextPage: document.getElementById("maintainerNextPage"),
    filterForm: document.getElementById("maintainerFilterForm"),
    refreshButton: document.getElementById("maintainerRefreshButton"),
    logoutButton: document.getElementById("maintainerLogoutButton"),
    reportLink: document.getElementById("maintainerReportLink"),
    search: document.getElementById("maintainerSearch"),
    status: document.getElementById("maintainerStatusFilter"),
    scopeStatus: document.getElementById("maintainerScopeFilter"),
    sourceType: document.getElementById("maintainerSourceFilter"),
    duplicateState: document.getElementById("maintainerDuplicateFilter"),
    includeClosed: document.getElementById("maintainerIncludeClosed"),
    pageSize: document.getElementById("maintainerPageSize"),
    seedForm: document.getElementById("maintainerImportSeedForm"),
    seedInput: document.getElementById("maintainerImportSeedInput"),
    seedFile: document.getElementById("maintainerImportSeedFile"),
    seedStatus: document.getElementById("maintainerImportSeedStatus"),
    searchForm: document.getElementById("maintainerImportSearchForm"),
    searchQuery: document.getElementById("maintainerImportSearchQuery"),
    searchSource: document.getElementById("maintainerImportSearchSource"),
    searchStatus: document.getElementById("maintainerImportSearchStatus"),
    searchResults: document.getElementById("maintainerImportSearchResults"),
  };

  renderSelectOptions(elements.status, IMPORT_FILTER_OPTIONS.status, state.filters.status);
  renderSelectOptions(elements.scopeStatus, IMPORT_FILTER_OPTIONS.scopeStatus, state.filters.scopeStatus);
  renderSelectOptions(elements.sourceType, IMPORT_FILTER_OPTIONS.sourceType, state.filters.sourceType);
  renderSelectOptions(elements.duplicateState, IMPORT_FILTER_OPTIONS.duplicateState, state.filters.duplicateState);
  renderSelectOptions(elements.searchSource, [["apple", "Apple"], ["podcast-index", "Podcast Index"], ["all", "All available"]], "apple");
  if (elements.search instanceof HTMLInputElement) {
    elements.search.value = state.filters.q;
  }
  if (elements.includeClosed instanceof HTMLInputElement) {
    elements.includeClosed.checked = state.filters.includeClosed;
  }
  if (elements.pageSize instanceof HTMLSelectElement) {
    elements.pageSize.value = String(state.filters.pageSize);
  }

  const auth = await initializeAuthFlow({
    createMaintainerSession,
    destroyMaintainerSession,
    onAuthenticated: async () => {
      await loadQueue();
    },
  });

  function renderSearchResults() {
    elements.searchResults.innerHTML = renderImportSearchResults(state.searchResults);
  }

  async function loadDetail() {
    if (!state.selectedId) {
      elements.detail.innerHTML = renderImportDetailPane({ candidate: null, storedReviewer: state.storedReviewer });
      return;
    }

    const result = await fetchMaintainerImportCandidate(state.selectedId);
    const candidate = result.candidate;
    elements.detail.innerHTML = renderImportDetailPane({ candidate, storedReviewer: state.storedReviewer });
    elements.detailMeta.textContent = `${formatStatus(candidate.status)} · ${formatScopeStatus(candidate.scopeStatus)}.`;

    const reviewForm = document.getElementById("maintainerImportReviewForm");
    reviewForm?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const payload = buildReviewPayload(reviewForm);
        setStoredReviewer(payload.reviewedBy);
        state.storedReviewer = payload.reviewedBy;
        elements.detailMeta.textContent = "Saving import review state…";
        try {
          await patchMaintainerImportCandidateReview(state.selectedId, payload);
          await loadQueue(true);
          elements.detailMeta.textContent = "Import review state saved.";
        } catch (error) {
          elements.detailMeta.textContent = error instanceof Error ? error.message : "Failed to save import review state.";
        }
      },
      { once: true },
    );

    elements.detail.querySelectorAll("[data-import-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        const action = button.dataset.importAction || "";
        const payload = reviewForm ? buildReviewPayload(reviewForm) : { reviewedBy: state.storedReviewer };
        setStoredReviewer(payload.reviewedBy || "");
        state.storedReviewer = payload.reviewedBy || state.storedReviewer;
        elements.detailMeta.textContent = `${action === "hydrate" ? "Hydrating" : "Processing"} import candidate…`;

        try {
          if (action === "hydrate") {
            await hydrateMaintainerImportCandidate(state.selectedId, { reviewedBy: payload.reviewedBy });
          } else if (action === "draft") {
            await draftMaintainerImportCandidate(state.selectedId, { reviewedBy: payload.reviewedBy });
          } else if (action === "publish") {
            await publishMaintainerImportCandidate(state.selectedId, { reviewedBy: payload.reviewedBy });
          } else if (action === "reject") {
            await patchMaintainerImportCandidateReview(state.selectedId, {
              ...payload,
              status: "rejected",
            });
          } else if (action === "duplicate") {
            await patchMaintainerImportCandidateReview(state.selectedId, {
              ...payload,
              status: "duplicate",
            });
          }

          await loadQueue(true);
        } catch (error) {
          elements.detailMeta.textContent = error instanceof Error ? error.message : "Import action failed.";
        }
      });
    });
  }

  async function loadQueue(preserveSelection = false) {
    try {
      const response = await fetchMaintainerImports(state.filters);
      state.response = response;
      auth.logoutButtons.forEach((button) => {
        button.hidden = false;
      });
      if (elements.refreshButton) {
        elements.refreshButton.hidden = false;
      }
      setAuthState({
        authPanel: auth.authPanel,
        appShell: elements.appShell,
        statusNode: auth.authStatus,
        signedIn: true,
      });
      elements.summaryCards.innerHTML = renderImportSummaryCards(response.counts, response.total);
      if (!preserveSelection || !response.items.some((item) => item.id === state.selectedId)) {
        state.selectedId = response.items[0]?.id || "";
      }
      elements.list.innerHTML = renderImportQueueList({ items: response.items, selectedId: state.selectedId });
      const start = response.total === 0 ? 0 : (response.page - 1) * response.pageSize + 1;
      const end = Math.min(response.total, response.page * response.pageSize);
      elements.listStatus.textContent =
        response.total === 0 ? "No matching candidates." : `Showing ${start}-${end} of ${response.total}.`;
      elements.queueMeta.textContent = buildImportFilterSummary(state.filters, response.total);
      elements.paginationSummary.textContent = `Page ${response.page} of ${Math.max(1, Math.ceil(response.total / response.pageSize))}`;
      elements.previousPage.disabled = response.page <= 1;
      elements.nextPage.disabled = response.page >= Math.ceil(Math.max(1, response.total) / response.pageSize);
      if (elements.reportLink instanceof HTMLAnchorElement) {
        elements.reportLink.href = `/maintainer/imports/report.html${window.location.search}`;
      }
      await loadDetail();
    } catch (error) {
      if (error instanceof MaintainerAuthError) {
        setAuthState({ authPanel: auth.authPanel, appShell: elements.appShell, statusNode: auth.authStatus, signedIn: false });
        return;
      }
      elements.listStatus.textContent = error instanceof Error ? error.message : "Failed to load import candidates.";
    }
  }

  elements.filterForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.filters = {
      q: elements.search.value.trim(),
      status: elements.status.value,
      scopeStatus: elements.scopeStatus.value,
      sourceType: elements.sourceType.value,
      duplicateState: elements.duplicateState.value,
      includeClosed: elements.includeClosed.checked,
      pageSize: Number.parseInt(elements.pageSize.value, 10) || 20,
      page: 1,
    };
    syncImportFiltersToUrl(state.filters);
    await loadQueue();
  });

  document.getElementById("maintainerResetFilters")?.addEventListener("click", async () => {
    state.filters = {
      q: "",
      status: "",
      scopeStatus: "",
      sourceType: "",
      duplicateState: "",
      includeClosed: false,
      page: 1,
      pageSize: 20,
    };
    syncImportFiltersToUrl(state.filters);
    window.location.reload();
  });

  elements.refreshButton?.addEventListener("click", async () => loadQueue(true));
  elements.previousPage?.addEventListener("click", async () => {
    if (state.filters.page <= 1) {
      return;
    }
    state.filters.page -= 1;
    syncImportFiltersToUrl(state.filters);
    await loadQueue();
  });
  elements.nextPage?.addEventListener("click", async () => {
    state.filters.page += 1;
    syncImportFiltersToUrl(state.filters);
    await loadQueue();
  });
  elements.list?.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-import-candidate-id]") : null;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    state.selectedId = button.dataset.importCandidateId || "";
    elements.list.innerHTML = renderImportQueueList({ items: state.response?.items || [], selectedId: state.selectedId });
    await loadDetail();
  });

  elements.seedForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const entries = await collectSeedEntries(elements.seedInput, elements.seedFile);
    if (entries.length === 0) {
      elements.seedStatus.textContent = "Paste one or more titles or URLs first.";
      return;
    }

    elements.seedStatus.textContent = "Seeding import candidates…";
    try {
      const result = await seedMaintainerImportCandidates({
        entries,
        reviewedBy: state.storedReviewer,
      });
      elements.seedStatus.textContent = `Seeded ${result.candidates.length} candidates.`;
      if (elements.seedInput instanceof HTMLTextAreaElement) {
        elements.seedInput.value = "";
      }
      if (elements.seedFile instanceof HTMLInputElement) {
        elements.seedFile.value = "";
      }
      await loadQueue();
    } catch (error) {
      elements.seedStatus.textContent = error instanceof Error ? error.message : "Failed to seed candidates.";
    }
  });

  elements.searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const q = elements.searchQuery.value.trim();
    if (!q) {
      elements.searchStatus.textContent = "Enter a show title or creator to search.";
      return;
    }

    elements.searchStatus.textContent = "Searching external sources…";
    try {
      const response = await searchMaintainerImportSources({
        q,
        source: elements.searchSource.value,
        limit: 8,
      });
      state.searchResults = response.results || [];
      renderSearchResults();
      elements.searchStatus.textContent = `Loaded ${state.searchResults.length} external results.`;
    } catch (error) {
      elements.searchStatus.textContent = error instanceof Error ? error.message : "External search failed.";
    }
  });

  elements.searchResults?.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-import-add-result-index]") : null;
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const resultIndex = Number.parseInt(button.dataset.importAddResultIndex || "", 10);
    const searchResult = state.searchResults[resultIndex];
    if (!searchResult) {
      return;
    }

    elements.searchStatus.textContent = "Adding search result as an import candidate…";
    try {
      const response = await seedMaintainerImportCandidates({
        searchResults: [searchResult],
        reviewedBy: state.storedReviewer,
      });
      elements.searchStatus.textContent = `Added ${response.candidates.length} candidate from external search.`;
      await loadQueue();
    } catch (error) {
      elements.searchStatus.textContent = error instanceof Error ? error.message : "Failed to add search result.";
    }
  });

  renderSearchResults();
  await loadQueue();
}

async function initializeMaintainerImportsReportPage() {
  const filters = readImportFilters(200);
  const auth = await initializeAuthFlow({
    createMaintainerSession,
    destroyMaintainerSession,
    onAuthenticated: async () => {
      await loadReport();
    },
  });

  const shell = document.getElementById("maintainerReportShell");
  const content = document.getElementById("maintainerReportContent");
  const meta = document.getElementById("maintainerReportMeta");
  const printButton = document.getElementById("maintainerPrintButton");
  const queueLink = document.getElementById("maintainerQueueLink");

  async function loadReport() {
    try {
      const response = await fetchMaintainerImports({
        ...filters,
        includeClosed: true,
      });
      auth.logoutButtons.forEach((button) => {
        button.hidden = false;
      });
      if (printButton) {
        printButton.hidden = false;
      }
      setAuthState({ authPanel: auth.authPanel, appShell: shell, statusNode: auth.authStatus, signedIn: true });
      const filterSummary = buildImportFilterSummary(filters, response.total);
      meta.textContent = filterSummary;
      content.innerHTML = renderImportReportContent({
        counts: response.counts,
        items: response.items,
        total: response.total,
        filterSummary,
      });
      if (queueLink instanceof HTMLAnchorElement) {
        queueLink.href = `/maintainer/imports.html${window.location.search}`;
      }
    } catch (error) {
      if (error instanceof MaintainerAuthError) {
        setAuthState({ authPanel: auth.authPanel, appShell: shell, statusNode: auth.authStatus, signedIn: false });
        return;
      }
      meta.textContent = error instanceof Error ? error.message : "Failed to load import report.";
    }
  }

  printButton?.addEventListener("click", () => window.print());
  await loadReport();
}
