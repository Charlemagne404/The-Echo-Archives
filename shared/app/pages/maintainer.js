import { createMaintainerSession, destroyMaintainerSession, fetchMaintainerSubmission, fetchMaintainerSubmissions, MaintainerAuthError, patchMaintainerSubmission } from "../maintainer/api.js";
import { formatDateTime, formatStatus, formatSubmissionType, summarizeCounts } from "../maintainer/format.js";
import { buildFilterSummary, FILTER_OPTIONS, getStoredReviewer, initializeAuthFlow, readFilters, renderSelectOptions, setAuthState, setStoredReviewer, syncFiltersToUrl } from "../maintainer/page-helpers.js";
import { renderDetailPane, renderQueueList, renderReportContent, renderSummaryCards } from "../maintainer/render.js";

export async function initializeMaintainerPage() {
  if (!document.body.classList.contains("maintainer-page")) {
    return;
  }

  if (document.body.classList.contains("maintainer-report-page")) {
    await initializeMaintainerReportPage();
    return;
  }

  const state = {
    filters: readFilters(20),
    response: null,
    selectedId: "",
    storedReviewer: getStoredReviewer(),
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
    submissionType: document.getElementById("maintainerTypeFilter"),
    priority: document.getElementById("maintainerPriorityFilter"),
    includeClosed: document.getElementById("maintainerIncludeClosed"),
    pageSize: document.getElementById("maintainerPageSize"),
  };

  renderSelectOptions(elements.status, FILTER_OPTIONS.status, state.filters.status);
  renderSelectOptions(elements.submissionType, FILTER_OPTIONS.submissionType, state.filters.submissionType);
  renderSelectOptions(elements.priority, FILTER_OPTIONS.priority, state.filters.priority);
  if (elements.search instanceof HTMLInputElement) elements.search.value = state.filters.q;
  if (elements.includeClosed instanceof HTMLInputElement) elements.includeClosed.checked = state.filters.includeClosed;
  if (elements.pageSize instanceof HTMLSelectElement) elements.pageSize.value = String(state.filters.pageSize);

  const auth = await initializeAuthFlow({
    createMaintainerSession,
    destroyMaintainerSession,
    onAuthenticated: async () => {
      await loadQueue();
    },
  });

  async function loadDetail() {
    if (!state.selectedId) {
      elements.detail.innerHTML = renderDetailPane({ submission: null, storedReviewer: state.storedReviewer });
      return;
    }

    const result = await fetchMaintainerSubmission(state.selectedId);
    elements.detail.innerHTML = renderDetailPane({ submission: result.submission, storedReviewer: state.storedReviewer });
    elements.detailMeta.textContent = `Submitted ${formatDateTime(result.submission.submittedAt)} · ${formatStatus(result.submission.status)}.`;

    const reviewForm = document.getElementById("maintainerReviewForm");
    reviewForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(reviewForm);
      const reviewedBy = String(formData.get("reviewedBy") || "").trim();
      setStoredReviewer(reviewedBy);
      state.storedReviewer = reviewedBy;
      elements.detailMeta.textContent = "Saving review state…";
      try {
        const response = await patchMaintainerSubmission(state.selectedId, {
          status: formData.get("status"),
          priority: formData.get("priority"),
          reviewedBy,
          reviewNotes: formData.get("reviewNotes"),
        });
        elements.detail.innerHTML = renderDetailPane({ submission: response.submission, storedReviewer: state.storedReviewer });
        elements.detailMeta.textContent = "Review state saved.";
        await loadQueue(true);
      } catch (error) {
        elements.detailMeta.textContent = error instanceof Error ? error.message : "Failed to save review state.";
      }
    }, { once: true });
  }

  async function loadQueue(preserveSelection = false) {
    try {
      const response = await fetchMaintainerSubmissions(state.filters);
      state.response = response;
      auth.logoutButtons.forEach((button) => { button.hidden = false; });
      if (elements.refreshButton) elements.refreshButton.hidden = false;
      setAuthState({ authPanel: auth.authPanel, appShell: elements.appShell, statusNode: auth.authStatus, signedIn: true });
      elements.summaryCards.innerHTML = renderSummaryCards(summarizeCounts(response.counts, response.total));
      if (!preserveSelection || !response.items.some((item) => item.id === state.selectedId)) {
        state.selectedId = response.items[0]?.id || "";
      }
      elements.list.innerHTML = renderQueueList({ items: response.items, selectedId: state.selectedId });
      const start = response.total === 0 ? 0 : ((response.page - 1) * response.pageSize) + 1;
      const end = Math.min(response.total, response.page * response.pageSize);
      elements.listStatus.textContent = response.total === 0 ? "No matching submissions." : `Showing ${start}-${end} of ${response.total}.`;
      elements.queueMeta.textContent = buildFilterSummary(state.filters, response.total, formatStatus, formatSubmissionType);
      elements.paginationSummary.textContent = `Page ${response.page} of ${Math.max(1, Math.ceil(response.total / response.pageSize))}`;
      elements.previousPage.disabled = response.page <= 1;
      elements.nextPage.disabled = response.page >= Math.ceil(Math.max(1, response.total) / response.pageSize);
      if (elements.reportLink instanceof HTMLAnchorElement) {
        elements.reportLink.href = `/maintainer/submissions/report.html${window.location.search}`;
      }
      await loadDetail();
    } catch (error) {
      if (error instanceof MaintainerAuthError) {
        setAuthState({ authPanel: auth.authPanel, appShell: elements.appShell, statusNode: auth.authStatus, signedIn: false });
        return;
      }
      elements.listStatus.textContent = error instanceof Error ? error.message : "Failed to load submissions.";
    }
  }

  elements.filterForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.filters = {
      q: elements.search.value.trim(),
      status: elements.status.value,
      submissionType: elements.submissionType.value,
      priority: elements.priority.value,
      includeClosed: elements.includeClosed.checked,
      pageSize: Number.parseInt(elements.pageSize.value, 10) || 20,
      page: 1,
    };
    syncFiltersToUrl(state.filters);
    await loadQueue();
  });
  document.getElementById("maintainerResetFilters")?.addEventListener("click", async () => {
    state.filters = { q: "", status: "", submissionType: "", priority: "", includeClosed: false, page: 1, pageSize: 20 };
    syncFiltersToUrl(state.filters);
    window.location.reload();
  });
  elements.refreshButton?.addEventListener("click", async () => loadQueue(true));
  elements.previousPage?.addEventListener("click", async () => {
    if (state.filters.page <= 1) return;
    state.filters.page -= 1;
    syncFiltersToUrl(state.filters);
    await loadQueue();
  });
  elements.nextPage?.addEventListener("click", async () => {
    state.filters.page += 1;
    syncFiltersToUrl(state.filters);
    await loadQueue();
  });
  elements.list?.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-submission-id]") : null;
    if (!(button instanceof HTMLElement)) return;
    state.selectedId = button.dataset.submissionId || "";
    elements.list.innerHTML = renderQueueList({ items: state.response?.items || [], selectedId: state.selectedId });
    await loadDetail();
  });

  await loadQueue();
}

async function initializeMaintainerReportPage() {
  const filters = readFilters(200);
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
  const logoutButton = document.getElementById("maintainerReportLogoutButton");

  async function loadReport() {
    try {
      const response = await fetchMaintainerSubmissions(filters);
      auth.logoutButtons.forEach((button) => { button.hidden = false; });
      if (logoutButton) logoutButton.hidden = false;
      if (printButton) printButton.hidden = false;
      setAuthState({ authPanel: auth.authPanel, appShell: shell, statusNode: auth.authStatus, signedIn: true });
      const filterSummary = buildFilterSummary(filters, response.total, formatStatus, formatSubmissionType);
      meta.textContent = filterSummary;
      content.innerHTML = renderReportContent({
        counts: response.counts,
        items: response.items,
        total: response.total,
        filterSummary,
      });
      if (queueLink instanceof HTMLAnchorElement) {
        queueLink.href = `/maintainer/submissions.html${window.location.search}`;
      }
    } catch (error) {
      if (error instanceof MaintainerAuthError) {
        setAuthState({ authPanel: auth.authPanel, appShell: shell, statusNode: auth.authStatus, signedIn: false });
        return;
      }
      meta.textContent = error instanceof Error ? error.message : "Failed to load report.";
    }
  }

  printButton?.addEventListener("click", () => window.print());
  await loadReport();
}
