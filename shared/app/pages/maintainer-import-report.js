import {
  createMaintainerSession,
  destroyMaintainerSession,
  fetchMaintainerImports,
  MaintainerAuthError,
} from "../maintainer/api.js";
import {
  buildImportFilterSummary,
  focusMaintainerWorkspace,
  getMaintainerViewElements,
  initializeAuthFlow,
  isAbortError,
  readImportFilters,
  runMaintainerAction,
  setMaintainerViewState,
} from "../maintainer-import/page-helpers.js";
import { renderImportReportContent } from "../maintainer-import/render.js";

export async function initializeMaintainerImportsReportPage() {
  const filters = readImportFilters(200);
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
      setMaintainerViewState(view, "loading", { message: "Loading the protected import report…", retry: false });
    }
    try {
      const response = await fetchMaintainerImports({
        ...filters,
        includeClosed: true,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      hasBeenReady = true;
      auth.logoutButtons.forEach((button) => {
        button.hidden = false;
      });
      if (printButton) printButton.hidden = false;
      setMaintainerViewState(view, "ready");
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
      if (afterAuthentication) focusMaintainerWorkspace();
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof MaintainerAuthError) {
        showAuthentication(error);
        return;
      }
      auth.logoutButtons.forEach((button) => { button.hidden = true; });
      if (printButton) printButton.hidden = true;
      setMaintainerViewState(view, "error", { message: error instanceof Error ? error.message : "Failed to load import report." });
    }
  }

  retryButton?.addEventListener("click", async (event) => {
    await runMaintainerAction({ control: event.currentTarget, action: async () => loadReport() });
  });
  printButton?.addEventListener("click", () => window.print());
  window.addEventListener("pagehide", () => reportController?.abort(), { once: true });
  await loadReport();
}
