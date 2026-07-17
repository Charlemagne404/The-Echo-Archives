import {
  createMaintainerDiscoverySource,
  fetchMaintainerDiscovery,
  fetchMaintainerDiscoveryRun,
  MaintainerAuthError,
  patchMaintainerDiscoverySource,
  runMaintainerDiscovery,
  runMaintainerDiscoverySource,
} from "../maintainer/api.js";
import { isAbortError } from "./page-helpers.js";
import { renderImportDiscoveryWorkspace } from "./discovery-render.js";
import { IMPORT_RUN_TIMEOUT_MS, waitForDelay, waitForVisibleDocument } from "./workflow.js";
export function bindDiscoveryWorkspace({ elements, getReviewer, runAction, onAuthError, onCandidatesChanged }) {
  let discovery = null;
  let controller = null;

  function setStatus(message) {
    if (elements.status) elements.status.textContent = message;
  }

  function setRunFeedback(message) {
    const feedback = document.getElementById("maintainerDiscoveryRunFeedback");
    if (feedback) feedback.textContent = message;
  }

  function render() {
    if (elements.workspace) elements.workspace.innerHTML = renderImportDiscoveryWorkspace(discovery || {});
  }

  async function load() {
    controller?.abort();
    controller = new AbortController();
    try {
      const response = await fetchMaintainerDiscovery({ signal: controller.signal });
      if (controller.signal.aborted) return;
      discovery = response;
      render();
      setStatus(response.sources?.length
        ? `${response.sources.length} configured source${response.sources.length === 1 ? "" : "s"}. New results enter the import queue only once.`
        : "Add an approved search source to begin automatic discovery.");
    } catch (error) {
      if (isAbortError(error)) return;
      if (error instanceof MaintainerAuthError) return onAuthError(error);
      setStatus(error instanceof Error ? error.message : "Failed to load discovery sources.");
    }
  }

  async function waitForRun(runId) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < IMPORT_RUN_TIMEOUT_MS) {
      const { run } = await fetchMaintainerDiscoveryRun(runId);
      setStatus(`Discovery run: ${run.progress.completed + run.progress.failed}/${run.progress.total} complete.`);
      setRunFeedback(`Checking discovery sources: ${run.progress.completed + run.progress.failed}/${run.progress.total} complete.`);
      if (["completed", "failed"].includes(run.status)) return run;
      await waitForVisibleDocument();
      await waitForDelay(1_000);
    }
    setStatus("Discovery is still running. Refresh the workspace for its latest state.");
    return null;
  }

  elements.form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(elements.form);
    const query = String(data.get("query") || "").trim();
    if (!query) return setStatus("Enter a focused query for this approved source.");
    await runAction({
      control: event.submitter,
      region: elements.form,
      action: async () => {
        try {
          await createMaintainerDiscoverySource({
            name: String(data.get("name") || "").trim(),
            sourceType: String(data.get("sourceType") || "apple-search"),
            query,
            intervalMinutes: Number(data.get("intervalMinutes")) || 1_440,
            config: {
              limit: Number(data.get("limit")) || 10,
              includeBorderline: data.get("includeBorderline") === "on",
            },
          });
          elements.form.reset();
          setStatus("Discovery source saved. Run it when you are ready to collect candidates.");
          await load();
        } catch (error) {
          if (error instanceof MaintainerAuthError) return onAuthError(error);
          setStatus(error instanceof Error ? error.message : "Failed to save discovery source.");
        }
      },
    });
  });

  elements.runAll?.addEventListener("click", async () => {
    await runAction({
      control: elements.runAll,
      region: elements.workspace,
      action: async () => {
        try {
          setStatus("Running all enabled discovery sources…");
          setRunFeedback("Discovery has started. Searching Podcast Index now…");
          elements.runAll.textContent = "Discovery running…";
          const result = await runMaintainerDiscovery({ reviewedBy: getReviewer() });
          if (!result.runIds?.length) {
            setStatus("No enabled discovery sources are configured yet. Save a focused source below, then run it here.");
            setRunFeedback("No enabled sources are available yet.");
            return;
          }
          if (result.createdDefaultSource) setStatus("Set up a Podcast Index audio drama source and started discovery…");
          const runs = await Promise.all(result.runIds.map((runId) => waitForRun(runId)));
          const found = runs.reduce((total, run) => total + (Number(run?.summary?.found) || 0), 0);
          const candidates = runs.reduce((total, run) => total + (run?.summary?.candidateIds?.length || 0), 0);
          const failures = runs.filter((run) => run?.status === "failed").length;
          setRunFeedback(failures
            ? `Discovery finished with ${failures} source error${failures === 1 ? "" : "s"}. Check the run history below.`
            : `Discovery complete: ${found} results checked; ${candidates} candidate${candidates === 1 ? "" : "s"} added for review.`);
          await load();
          await onCandidatesChanged();
        } catch (error) {
          if (error instanceof MaintainerAuthError) return onAuthError(error);
          setStatus(error instanceof Error ? error.message : "Discovery run failed.");
          setRunFeedback(error instanceof Error ? `Discovery did not start: ${error.message}` : "Discovery did not start.");
        } finally {
          elements.runAll.textContent = "Start discovery";
        }
      },
    });
  });

  elements.workspace?.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-discovery-source-id]") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const sourceId = button.dataset.discoverySourceId || "";
    const action = button.dataset.discoveryAction || "";
    const source = discovery?.sources?.find((entry) => entry.id === sourceId);
    if (!sourceId || !source) return;
    await runAction({
      control: button,
      region: elements.workspace,
      action: async () => {
        try {
          if (action === "run") {
            const result = await runMaintainerDiscoverySource(sourceId, { reviewedBy: getReviewer() });
            await waitForRun(result.runId);
            await load();
            await onCandidatesChanged();
          } else if (action === "toggle") {
            await patchMaintainerDiscoverySource(sourceId, { ...source, enabled: !source.enabled });
            await load();
          }
        } catch (error) {
          if (error instanceof MaintainerAuthError) return onAuthError(error);
          setStatus(error instanceof Error ? error.message : "Discovery action failed.");
        }
      },
    });
  });

  return {
    abort() { controller?.abort(); },
    load,
    render,
  };
}
