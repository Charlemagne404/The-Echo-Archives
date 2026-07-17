import { createMaintainerSession, destroyMaintainerSession, fetchMaintainerListenerReview, fetchMaintainerSubmission, fetchMaintainerSubmissions, MaintainerAuthError, patchMaintainerSubmission } from "../maintainer/api.js";
import { bindMaintainerListenerReviewEditor } from "../maintainer/listener-review-editor.js";
import { formatDateTime, formatStatus, formatSubmissionType, summarizeCounts } from "../maintainer/format.js";
import {
  buildFilterSummary,
  FILTER_OPTIONS,
  focusMaintainerWorkspace,
  getMaintainerViewElements,
  getStoredReviewer,
  initializeAuthFlow,
  isAbortError,
  readFilters,
  renderSelectOptions,
  runMaintainerAction,
  setMaintainerViewState,
  setStoredReviewer,
  syncFiltersToUrl,
} from "../maintainer/page-helpers.js";
import { renderDetailPane, renderQueueList, renderReportContent, renderSummaryCards } from "../maintainer/render.js";

const COMPACT_WORKSPACE_QUERY = "(max-width: 720px)";

function revealCompactDetail(elements) {
  if (!window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) return;
  elements.detailCard?.scrollIntoView({ block: "start", behavior: "auto" });
  window.requestAnimationFrame(() => elements.detailHeading?.focus({ preventScroll: true }));
}

function hideWorkspaceControls(auth, elements) {
  auth.logoutButtons.forEach((button) => { button.hidden = true; });
  if (elements.refreshButton) elements.refreshButton.hidden = true;
}

export async function initializeMaintainerPage() {
  if (!document.body.classList.contains("maintainer-page")) return;
  if (document.body.classList.contains("maintainer-report-page")) {
    await initializeMaintainerReportPage();
    return;
  }

  const state = {
    filters: readFilters(20),
    response: null,
    selectedId: "",
    storedReviewer: getStoredReviewer(),
    hasBeenReady: false,
    queueController: null,
    detailController: null,
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
    reportLink: document.getElementById("maintainerReportLink"),
    search: document.getElementById("maintainerSearch"),
    status: document.getElementById("maintainerStatusFilter"),
    submissionType: document.getElementById("maintainerTypeFilter"),
    priority: document.getElementById("maintainerPriorityFilter"),
    includeClosed: document.getElementById("maintainerIncludeClosed"),
    pageSize: document.getElementById("maintainerPageSize"),
    retryButton: document.getElementById("maintainerRetryButton"),
    listCard: document.getElementById("maintainerListCard"),
    listHeading: document.getElementById("maintainerListHeading"),
    detailCard: document.getElementById("maintainerDetailCard"),
    detailHeading: document.getElementById("maintainerDetailHeading"),
    backToQueue: document.getElementById("maintainerBackToQueue"),
  };
  const view = getMaintainerViewElements(elements.appShell);

  renderSelectOptions(elements.status, FILTER_OPTIONS.status, state.filters.status);
  renderSelectOptions(elements.submissionType, FILTER_OPTIONS.submissionType, state.filters.submissionType);
  renderSelectOptions(elements.priority, FILTER_OPTIONS.priority, state.filters.priority);
  if (elements.search instanceof HTMLInputElement) elements.search.value = state.filters.q;
  if (elements.includeClosed instanceof HTMLInputElement) elements.includeClosed.checked = state.filters.includeClosed;
  if (elements.pageSize instanceof HTMLSelectElement) elements.pageSize.value = String(state.filters.pageSize);

  const abortRequests = () => {
    state.queueController?.abort();
    state.detailController?.abort();
  };

  const auth = await initializeAuthFlow({
    createMaintainerSession,
    destroyMaintainerSession,
    onAuthenticated: async () => loadQueue(false, { afterAuthentication: true }),
    onLoggedOut: async () => {
      abortRequests();
      state.hasBeenReady = false;
      setMaintainerViewState(view, "authRequired", { message: "Signed out. Sign in to continue." });
    },
  });

  function showAuthentication(error = null) {
    abortRequests();
    hideWorkspaceControls(auth, elements);
    const message = state.hasBeenReady
      ? "Your maintainer session expired. Sign in again to continue."
      : error instanceof Error ? error.message : "Sign in to continue.";
    setMaintainerViewState(view, "authRequired", { message });
    window.requestAnimationFrame(() => document.getElementById("maintainerPassphrase")?.focus());
  }

  async function loadDetail({ focusDetail = false } = {}) {
    state.detailController?.abort();
    if (!state.selectedId) {
      elements.detail.innerHTML = renderDetailPane({ submission: null, storedReviewer: state.storedReviewer });
      return;
    }

    const selectedId = state.selectedId;
    const controller = new AbortController();
    state.detailController = controller;
    try {
      const result = await fetchMaintainerSubmission(selectedId, { signal: controller.signal });
      if (controller.signal.aborted || selectedId !== state.selectedId) return;
      const listenerReview = result.submission.submissionType === "listener-review"
        ? await fetchMaintainerListenerReview(selectedId).then((payload) => payload.review).catch(() => null)
        : null;
      elements.detail.innerHTML = renderDetailPane({ submission: result.submission, storedReviewer: state.storedReviewer, publicReview: listenerReview });
      elements.detailMeta.textContent = `Submitted ${formatDateTime(result.submission.submittedAt)} · ${formatStatus(result.submission.status)}.`;

      const reviewForm = document.getElementById("maintainerReviewForm");
      reviewForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = event.submitter instanceof HTMLElement ? event.submitter : reviewForm.querySelector('button[type="submit"]');
        await runMaintainerAction({
          control: submitButton,
          region: reviewForm,
          action: async () => {
            const formData = new FormData(reviewForm);
            const reviewedBy = String(formData.get("reviewedBy") || "").trim();
            setStoredReviewer(reviewedBy);
            state.storedReviewer = reviewedBy;
            elements.detailMeta.textContent = "Saving review state…";
            try {
              await patchMaintainerSubmission(selectedId, {
                status: formData.get("status"),
                priority: formData.get("priority"),
                reviewedBy,
                reviewNotes: formData.get("reviewNotes"),
              });
              await loadQueue(true);
              elements.detailMeta.textContent = "Review state saved.";
            } catch (error) {
              if (error instanceof MaintainerAuthError) {
                showAuthentication(error);
                return;
              }
              elements.detailMeta.textContent = error instanceof Error ? error.message : "Failed to save review state.";
            }
          },
        });
      });

      const listenerReviewForm = document.getElementById("maintainerListenerReviewForm");
      bindMaintainerListenerReviewEditor({
        form: listenerReviewForm,
        submissionId: selectedId,
        runAction: runMaintainerAction,
        onAuthError: showAuthentication,
        onComplete: () => loadDetail(),
        setStatus: (message) => { elements.detailMeta.textContent = message; },
      });

      if (focusDetail) revealCompactDetail(elements);
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof MaintainerAuthError) {
        showAuthentication(error);
        return;
      }
      elements.detail.innerHTML = renderDetailPane({ submission: null, storedReviewer: state.storedReviewer });
      elements.detailMeta.textContent = error instanceof Error ? error.message : "Failed to load submission detail.";
    }
  }

  async function loadQueue(preserveSelection = false, { afterAuthentication = false } = {}) {
    state.queueController?.abort();
    const controller = new AbortController();
    state.queueController = controller;
    if (!state.hasBeenReady) {
      setMaintainerViewState(view, "loading", { message: "Loading the protected submission queue…", retry: false });
    }

    try {
      const response = await fetchMaintainerSubmissions(state.filters, { signal: controller.signal });
      if (controller.signal.aborted) return;
      state.response = response;
      state.hasBeenReady = true;
      auth.logoutButtons.forEach((button) => { button.hidden = false; });
      if (elements.refreshButton) elements.refreshButton.hidden = false;
      setMaintainerViewState(view, "ready");
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
      if (afterAuthentication) focusMaintainerWorkspace();
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof MaintainerAuthError) {
        showAuthentication(error);
        return;
      }
      hideWorkspaceControls(auth, elements);
      setMaintainerViewState(view, "error", {
        message: error instanceof Error ? error.message : "Failed to load submissions.",
      });
    }
  }

  elements.retryButton?.addEventListener("click", async (event) => {
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadQueue(true) });
  });
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
    await runMaintainerAction({ control: event.submitter, region: elements.filterForm, action: async () => loadQueue() });
  });
  document.getElementById("maintainerResetFilters")?.addEventListener("click", () => {
    state.filters = { q: "", status: "", submissionType: "", priority: "", includeClosed: false, page: 1, pageSize: 20 };
    syncFiltersToUrl(state.filters);
    window.location.reload();
  });
  elements.refreshButton?.addEventListener("click", async (event) => {
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadQueue(true) });
  });
  elements.previousPage?.addEventListener("click", async (event) => {
    if (state.filters.page <= 1) return;
    state.filters.page -= 1;
    syncFiltersToUrl(state.filters);
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadQueue() });
  });
  elements.nextPage?.addEventListener("click", async (event) => {
    state.filters.page += 1;
    syncFiltersToUrl(state.filters);
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadQueue() });
  });
  elements.list?.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-submission-id]") : null;
    if (!(button instanceof HTMLElement) || button.dataset.maintainerBusy === "true") return;
    state.selectedId = button.dataset.submissionId || "";
    elements.list.innerHTML = renderQueueList({ items: state.response?.items || [], selectedId: state.selectedId });
    await runMaintainerAction({ control: button, region: elements.detail, action: async () => loadDetail({ focusDetail: true }) });
  });
  elements.backToQueue?.addEventListener("click", () => {
    elements.listCard?.scrollIntoView({ block: "start", behavior: "auto" });
    window.requestAnimationFrame(() => elements.listHeading?.focus({ preventScroll: true }));
  });

  window.addEventListener("pagehide", abortRequests, { once: true });
  await loadQueue();
}

async function initializeMaintainerReportPage() {
  const filters = readFilters(200);
  const shell = document.getElementById("maintainerReportShell");
  const content = document.getElementById("maintainerReportContent");
  const meta = document.getElementById("maintainerReportMeta");
  const printButton = document.getElementById("maintainerPrintButton");
  const queueLink = document.getElementById("maintainerQueueLink");
  const retryButton = document.getElementById("maintainerRetryButton");
  const view = getMaintainerViewElements(shell);
  let hasBeenReady = false;
  let reportController = null;

  const auth = await initializeAuthFlow({
    createMaintainerSession,
    destroyMaintainerSession,
    onAuthenticated: async () => loadReport({ afterAuthentication: true }),
    onLoggedOut: async () => {
      reportController?.abort();
      hasBeenReady = false;
      setMaintainerViewState(view, "authRequired", { message: "Signed out. Sign in to continue." });
    },
  });

  function showAuthentication(error = null) {
    reportController?.abort();
    auth.logoutButtons.forEach((button) => { button.hidden = true; });
    if (printButton) printButton.hidden = true;
    setMaintainerViewState(view, "authRequired", {
      message: hasBeenReady ? "Your maintainer session expired. Sign in again to continue." : error instanceof Error ? error.message : "Sign in to continue.",
    });
    window.requestAnimationFrame(() => document.getElementById("maintainerPassphrase")?.focus());
  }

  async function loadReport({ afterAuthentication = false } = {}) {
    reportController?.abort();
    const controller = new AbortController();
    reportController = controller;
    if (!hasBeenReady) {
      setMaintainerViewState(view, "loading", { message: "Loading the protected submission report…", retry: false });
    }
    try {
      const response = await fetchMaintainerSubmissions(filters, { signal: controller.signal });
      if (controller.signal.aborted) return;
      hasBeenReady = true;
      auth.logoutButtons.forEach((button) => { button.hidden = false; });
      if (printButton) printButton.hidden = false;
      setMaintainerViewState(view, "ready");
      const filterSummary = buildFilterSummary(filters, response.total, formatStatus, formatSubmissionType);
      meta.textContent = filterSummary;
      content.innerHTML = renderReportContent({ counts: response.counts, items: response.items, total: response.total, filterSummary });
      if (queueLink instanceof HTMLAnchorElement) queueLink.href = `/maintainer/submissions.html${window.location.search}`;
      if (afterAuthentication) focusMaintainerWorkspace();
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof MaintainerAuthError) {
        showAuthentication(error);
        return;
      }
      auth.logoutButtons.forEach((button) => { button.hidden = true; });
      if (printButton) printButton.hidden = true;
      setMaintainerViewState(view, "error", { message: error instanceof Error ? error.message : "Failed to load report." });
    }
  }

  retryButton?.addEventListener("click", async (event) => {
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadReport() });
  });
  printButton?.addEventListener("click", () => window.print());
  window.addEventListener("pagehide", () => reportController?.abort(), { once: true });
  await loadReport();
}
