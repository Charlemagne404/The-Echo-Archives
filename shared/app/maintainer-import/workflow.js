const COMPACT_WORKSPACE_QUERY = "(max-width: 720px)";

export const IMPORT_RUN_TIMEOUT_MS = 120_000;

export function waitForDelay(delayMs, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

export function waitForVisibleDocument(signal) {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      signal?.removeEventListener("abort", onAbort);
    };
    const onVisibilityChange = () => {
      if (document.hidden) return;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function revealCompactDetail(elements) {
  if (!window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) return;
  elements.detailCard?.scrollIntoView({ block: "start", behavior: "auto" });
  window.requestAnimationFrame(() => elements.detailHeading?.focus({ preventScroll: true }));
}

async function readFileInput(fileInput) {
  const file = fileInput?.files?.[0];
  return file ? file.text() : "";
}

export async function collectSeedEntries(textarea, fileInput) {
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

export function buildReviewPayload(form) {
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

export async function waitForImportPreparation({ runId, fetchRun, onProgress, signal, timeoutMs = IMPORT_RUN_TIMEOUT_MS } = {}) {
  if (!runId) return null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await waitForVisibleDocument(signal);
    const { run } = await fetchRun(runId, { signal });
    onProgress?.(run);
    if (["completed", "failed"].includes(run.status)) return run;
    const elapsed = Date.now() - startedAt;
    await waitForDelay(elapsed < 10_000 ? 1_000 : 2_000, signal);
  }
  return null;
}

export async function waitForManagedImportRun({ runId, state, fetchRun, setStatus }) {
  state.runController?.abort();
  const controller = new AbortController();
  state.runController = controller;
  try {
    const run = await waitForImportPreparation({
      runId,
      fetchRun,
      signal: controller.signal,
      onProgress: (nextRun) => setStatus(`Import run: ${nextRun.progress.completed + nextRun.progress.failed}/${nextRun.progress.total} complete · ${nextRun.progress.processing} processing.`),
    });
    if (!run) setStatus("Import preparation is taking longer than two minutes. Refresh the queue to check its latest state.");
    return run;
  } finally {
    if (state.runController === controller) state.runController = null;
  }
}
