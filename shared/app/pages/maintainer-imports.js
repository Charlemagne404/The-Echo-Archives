import {
  createMaintainerSession,
  batchPublishMaintainerImports,
  confirmMaintainerImportFactualReview,
  destroyMaintainerSession,
  draftMaintainerImportCandidate,
  fetchMaintainerImportCandidate,
  fetchMaintainerImportRun,
  fetchMaintainerImports,
  hydrateMaintainerImportCandidate,
  MaintainerAuthError,
  patchMaintainerImportCandidateReview,
  promoteMaintainerImportCandidate,
  publishMaintainerImportCandidate,
  rerunAllMaintainerImportPreparation,
  retryMaintainerImportCandidate,
  reopenMaintainerImportCandidate,
  searchMaintainerImportSources,
  selectMaintainerImportEvidence,
  seedMaintainerImportCandidates,
} from "../maintainer/api.js";
import {
  buildImportFilterSummary,
  focusMaintainerWorkspace,
  getMaintainerViewElements,
  getStoredReviewer,
  IMPORT_FILTER_OPTIONS,
  initializeAuthFlow,
  isAbortError,
  readImportFilters,
  renderSelectOptions,
  runMaintainerAction,
  setMaintainerViewState,
  setStoredReviewer,
  syncImportFiltersToUrl,
} from "../maintainer-import/page-helpers.js";
import { formatScopeStatus, formatStatus } from "../maintainer-import/format.js";
import {
  renderImportDetailPane,
  renderImportQueueList,
  renderImportSearchResults,
  renderImportSummaryCards,
} from "../maintainer-import/render.js";
import { bindDiscoveryWorkspace } from "../maintainer-import/discovery-workspace.js";
import { bindImportBatchActions } from "../maintainer-import/batch-actions.js";
import { bindImportCandidateActions } from "../maintainer-import/detail-actions.js";
import { buildReviewPayload, collectSeedEntries, revealCompactDetail, waitForManagedImportRun } from "../maintainer-import/workflow.js";
import { bindExternalVerificationWorkspace } from "../maintainer-import/external-verification.js";
import { bindElevationDesk } from "../maintainer-import/elevation.js";
import { initializeMaintainerImportsReportPage } from "./maintainer-import-report.js";

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
    hasBeenReady: false,
    queueController: null,
    detailController: null,
    runController: null,
    searchSequence: 0,
    selectedBatchIds: new Set(),
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
    rerunAllPreparation: document.getElementById("maintainerRerunAllPreparation"),
    selectImportedEligible: document.getElementById("maintainerSelectImportedEligible"),
    publishImportedBatch: document.getElementById("maintainerPublishImportedBatch"),
    filterForm: document.getElementById("maintainerFilterForm"),
    refreshButton: document.getElementById("maintainerRefreshButton"),
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
    discoveryForm: document.getElementById("maintainerDiscoverySourceForm"),
    discoveryWorkspace: document.getElementById("maintainerDiscoveryWorkspace"),
    discoveryStatus: document.getElementById("maintainerDiscoveryStatus"),
    retryButton: document.getElementById("maintainerRetryButton"),
    listCard: document.getElementById("maintainerListCard"),
    listHeading: document.getElementById("maintainerListHeading"),
    detailCard: document.getElementById("maintainerDetailCard"),
    detailHeading: document.getElementById("maintainerDetailHeading"),
    backToQueue: document.getElementById("maintainerBackToQueue"),
  };
  const view = getMaintainerViewElements(elements.appShell);

  renderSelectOptions(elements.status, IMPORT_FILTER_OPTIONS.status, state.filters.status);
  renderSelectOptions(elements.scopeStatus, IMPORT_FILTER_OPTIONS.scopeStatus, state.filters.scopeStatus);
  renderSelectOptions(elements.sourceType, IMPORT_FILTER_OPTIONS.sourceType, state.filters.sourceType);
  renderSelectOptions(elements.duplicateState, IMPORT_FILTER_OPTIONS.duplicateState, state.filters.duplicateState);
  renderSelectOptions(elements.searchSource, [["apple", "Apple"], ["podcast-index", "Podcast Index"], ["all", "All available"]], "apple");
  if (elements.search instanceof HTMLInputElement) elements.search.value = state.filters.q;
  if (elements.includeClosed instanceof HTMLInputElement) elements.includeClosed.checked = state.filters.includeClosed;
  if (elements.pageSize instanceof HTMLSelectElement) {
    elements.pageSize.value = String(state.filters.pageSize);
  }

  let discoveryWorkspace = null;
  let elevationDesk = null;

  const abortRequests = () => {
    state.queueController?.abort();
    state.detailController?.abort();
    state.runController?.abort();
    discoveryWorkspace?.abort();
    elevationDesk?.abort();
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

  function hideWorkspaceControls() {
    auth.logoutButtons.forEach((button) => { button.hidden = true; });
    if (elements.refreshButton) elements.refreshButton.hidden = true;
  }

  function showAuthentication(error = null) {
    abortRequests();
    hideWorkspaceControls();
    setMaintainerViewState(view, "authRequired", {
      message: state.hasBeenReady
        ? "Your maintainer session expired. Sign in again to continue."
        : error instanceof Error ? error.message : "Sign in to continue.",
    });
    window.requestAnimationFrame(() => document.getElementById("maintainerPassphrase")?.focus());
  }

  function renderSearchResults() {
    elements.searchResults.innerHTML = renderImportSearchResults(state.searchResults);
  }

  discoveryWorkspace = bindDiscoveryWorkspace({
    elements: {
      form: elements.discoveryForm,
      workspace: elements.discoveryWorkspace,
      status: elements.discoveryStatus,
      runAll: document.getElementById("maintainerDiscoveryRunAll"),
    },
    getReviewer: () => state.storedReviewer,
    runAction: runMaintainerAction,
    onAuthError: showAuthentication,
    onCandidatesChanged: () => loadQueue(true),
  });
  elevationDesk = bindElevationDesk({
    container: document.getElementById("maintainerElevationDesk"),
    getReviewer: () => state.storedReviewer,
    onAuthError: showAuthentication,
    onStatus: (message) => { elements.detailMeta.textContent = message; },
  });

  async function waitForImportRun(runId) {
    return waitForManagedImportRun({ runId, state, fetchRun: fetchMaintainerImportRun, setStatus: (message) => { elements.detailMeta.textContent = message; } });
  }

  async function loadDetail({ focusDetail = false } = {}) {
    state.detailController?.abort();
    if (!state.selectedId) {
      elements.detail.innerHTML = renderImportDetailPane({ candidate: null, storedReviewer: state.storedReviewer });
      return;
    }

    const selectedId = state.selectedId;
    const controller = new AbortController();
    state.detailController = controller;
    try {
      const result = await fetchMaintainerImportCandidate(selectedId, { signal: controller.signal });
      if (controller.signal.aborted || selectedId !== state.selectedId) return;
      const candidate = result.candidate;
      elements.detail.innerHTML = renderImportDetailPane({ candidate, storedReviewer: state.storedReviewer });
      elements.detailMeta.textContent = `${formatStatus(candidate.status)} · ${formatScopeStatus(candidate.scopeStatus)}.`;

      const reviewForm = document.getElementById("maintainerImportReviewForm");
      bindExternalVerificationWorkspace({ container: elements.detail, reviewForm, runAction: runMaintainerAction });

      reviewForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = event.submitter instanceof HTMLElement ? event.submitter : reviewForm.querySelector('button[type="submit"]');
        await runMaintainerAction({
          control: submitButton,
          region: reviewForm,
          action: async () => {
            const payload = buildReviewPayload(reviewForm, submitButton?.dataset.importSaveDetails === "true");
            setStoredReviewer(payload.reviewedBy);
            state.storedReviewer = payload.reviewedBy;
            elements.detailMeta.textContent = "Saving import review state…";
            try {
              await patchMaintainerImportCandidateReview(selectedId, payload);
              await loadQueue(true);
              elements.detailMeta.textContent = "Import review state saved.";
            } catch (error) {
              if (error instanceof MaintainerAuthError) {
                showAuthentication(error);
                return;
              }
              elements.detailMeta.textContent = error instanceof Error ? error.message : "Failed to save import review state.";
            }
          },
        });
      });

      bindImportCandidateActions({
        container: elements.detail,
        candidateId: selectedId,
        reviewForm,
        getReviewer: () => state.storedReviewer,
        setReviewer: (reviewedBy) => {
          setStoredReviewer(reviewedBy);
          state.storedReviewer = reviewedBy || state.storedReviewer;
        },
        setStatus: (message) => { elements.detailMeta.textContent = message; },
        runAction: runMaintainerAction,
        waitForRun: waitForImportRun,
        reloadQueue: () => loadQueue(true),
        isAbortError,
        isAuthError: (error) => error instanceof MaintainerAuthError,
        showAuthentication,
        api: {
          hydrate: hydrateMaintainerImportCandidate,
          draft: draftMaintainerImportCandidate,
          retry: retryMaintainerImportCandidate,
          reopen: reopenMaintainerImportCandidate,
          publish: publishMaintainerImportCandidate,
          factualReview: confirmMaintainerImportFactualReview,
          promote: promoteMaintainerImportCandidate,
          review: patchMaintainerImportCandidateReview,
          selectEvidence: selectMaintainerImportEvidence,
        },
      });

      if (focusDetail) revealCompactDetail(elements);
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof MaintainerAuthError) {
        showAuthentication(error);
        return;
      }
      elements.detail.innerHTML = renderImportDetailPane({ candidate: null, storedReviewer: state.storedReviewer });
      elements.detailMeta.textContent = error instanceof Error ? error.message : "Failed to load import candidate detail.";
    }
  }

  async function loadQueue(preserveSelection = false, { afterAuthentication = false } = {}) {
    state.queueController?.abort();
    const controller = new AbortController();
    state.queueController = controller;
    if (!state.hasBeenReady) {
      setMaintainerViewState(view, "loading", { message: "Loading the protected import queue…", retry: false });
    }
    try {
      const response = await fetchMaintainerImports(state.filters, { signal: controller.signal });
      if (controller.signal.aborted) return;
      state.response = response;
      state.hasBeenReady = true;
      auth.logoutButtons.forEach((button) => {
        button.hidden = false;
      });
      if (elements.refreshButton) {
        elements.refreshButton.hidden = false;
      }
      setMaintainerViewState(view, "ready");
      elements.summaryCards.innerHTML = renderImportSummaryCards(response.counts, response.total);
      if (!preserveSelection || !response.items.some((item) => item.id === state.selectedId)) {
        state.selectedId = response.items[0]?.id || "";
      }
      const visibleIds = new Set(response.items.map((item) => item.id));
      state.selectedBatchIds = new Set([...state.selectedBatchIds].filter((id) => visibleIds.has(id)));
      elements.list.innerHTML = renderImportQueueList({ items: response.items, selectedId: state.selectedId, selectedBatchIds: state.selectedBatchIds });
      if (elements.publishImportedBatch) elements.publishImportedBatch.disabled = state.selectedBatchIds.size === 0;
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
      await discoveryWorkspace.load();
      await elevationDesk.load();
      if (afterAuthentication) focusMaintainerWorkspace();
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof MaintainerAuthError) {
        showAuthentication(error);
        return;
      }
      hideWorkspaceControls();
      setMaintainerViewState(view, "error", {
        message: error instanceof Error ? error.message : "Failed to load import candidates.",
      });
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
    await runMaintainerAction({ control: event.submitter, region: elements.filterForm, action: async () => loadQueue() });
  });

  document.getElementById("maintainerResetFilters")?.addEventListener("click", () => {
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

  elements.retryButton?.addEventListener("click", async (event) => {
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadQueue(true) });
  });
  elements.refreshButton?.addEventListener("click", async (event) => {
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadQueue(true) });
  });
  elements.rerunAllPreparation?.addEventListener("click", async (event) => {
    if (!window.confirm("Re-run preparation for every ready, needs-review, and failed candidate? Candidates already queued or processing will continue their current preparation.")) {
      return;
    }
    await runMaintainerAction({
      control: event.currentTarget,
      region: elements.listCard,
      action: async () => {
        try {
          elements.listStatus.textContent = "Queueing preparation for all eligible candidates…";
          const result = await rerunAllMaintainerImportPreparation({ reviewedBy: state.storedReviewer });
          const run = await waitForManagedImportRun({
            runId: result.runId,
            state,
            fetchRun: fetchMaintainerImportRun,
            setStatus: (message) => { elements.listStatus.textContent = message; },
          });
          if (!run) {
            elements.listStatus.textContent = "Batch preparation is still running. Refresh the queue to check its latest progress.";
            return;
          }
          await loadQueue(true);
        } catch (error) {
          if (isAbortError(error)) return;
          if (error instanceof MaintainerAuthError) {
            showAuthentication(error);
            return;
          }
          elements.listStatus.textContent = error instanceof Error ? error.message : "Failed to re-run preparation for the queue.";
        }
      },
    });
  });
  bindImportBatchActions({
    elements,
    state,
    renderQueue: () => {
      elements.list.innerHTML = renderImportQueueList({ items: state.response?.items || [], selectedId: state.selectedId, selectedBatchIds: state.selectedBatchIds });
    },
    runAction: runMaintainerAction,
    publishBatch: batchPublishMaintainerImports,
    loadQueue,
    isAuthError: (error) => error instanceof MaintainerAuthError,
    showAuthentication,
  });
  elements.previousPage?.addEventListener("click", async (event) => {
    if (state.filters.page <= 1) {
      return;
    }
    state.filters.page -= 1;
    syncImportFiltersToUrl(state.filters);
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadQueue() });
  });
  elements.nextPage?.addEventListener("click", async (event) => {
    state.filters.page += 1;
    syncImportFiltersToUrl(state.filters);
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadQueue() });
  });
  elements.list?.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-import-candidate-id]") : null;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    state.selectedId = button.dataset.importCandidateId || "";
    elements.list.innerHTML = renderImportQueueList({ items: state.response?.items || [], selectedId: state.selectedId, selectedBatchIds: state.selectedBatchIds });
    await runMaintainerAction({ control: button, region: elements.detail, action: async () => loadDetail({ focusDetail: true }) });
  });
  elements.backToQueue?.addEventListener("click", () => {
    elements.listCard?.scrollIntoView({ block: "start", behavior: "auto" });
    window.requestAnimationFrame(() => elements.listHeading?.focus({ preventScroll: true }));
  });

  elements.seedForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runMaintainerAction({
      control: event.submitter,
      region: elements.seedForm,
      action: async () => {
        const entries = await collectSeedEntries(elements.seedInput, elements.seedFile);
        if (entries.length === 0) {
          elements.seedStatus.textContent = "Paste one or more titles or URLs first.";
          return;
        }

        elements.seedStatus.textContent = "Seeding import candidates…";
        try {
          const result = await seedMaintainerImportCandidates({ entries, reviewedBy: state.storedReviewer });
          elements.seedStatus.textContent = `Queued ${result.candidateIds?.length || result.candidates?.length || 0} candidates for automatic preparation.`;
          if (elements.seedInput instanceof HTMLTextAreaElement) elements.seedInput.value = "";
          if (elements.seedFile instanceof HTMLInputElement) elements.seedFile.value = "";
          const run = await waitForImportRun(result.runId);
          elements.seedStatus.textContent = run
            ? `Preparation finished: ${run.progress.completed} ready or reviewable, ${run.progress.failed} failed.`
            : "Preparation is still running. Refresh the queue to see its latest progress.";
          await loadQueue();
        } catch (error) {
          if (isAbortError(error)) return;
          if (error instanceof MaintainerAuthError) {
            showAuthentication(error);
            return;
          }
          elements.seedStatus.textContent = error instanceof Error ? error.message : "Failed to seed candidates.";
        }
      },
    });
  });

  elements.searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const q = elements.searchQuery.value.trim();
    if (!q) {
      elements.searchStatus.textContent = "Enter a show title or creator to search.";
      return;
    }

    const sequence = ++state.searchSequence;
    elements.searchStatus.textContent = "Searching external sources…";
    await runMaintainerAction({
      control: event.submitter,
      region: elements.searchForm,
      action: async () => {
        try {
          const response = await searchMaintainerImportSources({ q, source: elements.searchSource.value, limit: 8 });
          if (sequence !== state.searchSequence) return;
          state.searchResults = response.results || [];
          renderSearchResults();
          elements.searchStatus.textContent = `Loaded ${state.searchResults.length} external results.`;
        } catch (error) {
          if (sequence !== state.searchSequence) return;
          if (error instanceof MaintainerAuthError) {
            showAuthentication(error);
            return;
          }
          elements.searchStatus.textContent = error instanceof Error ? error.message : "External search failed.";
        }
      },
    });
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
    await runMaintainerAction({
      control: button,
      region: elements.searchResults,
      action: async () => {
        try {
          const response = await seedMaintainerImportCandidates({ searchResults: [searchResult], reviewedBy: state.storedReviewer });
          elements.searchStatus.textContent = `Queued ${response.candidateIds?.length || 1} candidate for automatic preparation.`;
          const run = await waitForImportRun(response.runId);
          elements.searchStatus.textContent = run
            ? `Preparation finished: ${run.progress.completed} ready or reviewable, ${run.progress.failed} failed.`
            : "Preparation is still running. Refresh the queue to see its latest progress.";
          await loadQueue();
        } catch (error) {
          if (isAbortError(error)) return;
          if (error instanceof MaintainerAuthError) {
            showAuthentication(error);
            return;
          }
          elements.searchStatus.textContent = error instanceof Error ? error.message : "Failed to add search result.";
        }
      },
    });
  });

  renderSearchResults();
  discoveryWorkspace.render();
  window.addEventListener("pagehide", abortRequests, { once: true });
  await loadQueue();
}
