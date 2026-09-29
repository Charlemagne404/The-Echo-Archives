import { loadShows } from "../data.js";
import { STATE_LABELS, STATE_ORDER } from "../library/constants.js";
import { renderEntryCard } from "./library/entry-renderer.js";
import { renderImportPreview as buildImportPreview } from "./library/import-preview.js";
import { getImportEntryLabel, readImportEntries } from "./library/import-utils.js";
import { captureEntryControlFocus, restoreEntryControlFocus } from "./library/library-focus.js";
import { makeElement } from "./library/library-dom.js";
import { getShowSearchText } from "./library/search.js";

const stateNames = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function setStatus(id, message, tone = "") {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = tone;
}

function downloadJson({ filename, json }) {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export async function initializeLibraryPage({ library, runtime, refreshRuntime }) {
  const app = document.getElementById("listenerLibraryApp");
  if (!app) return;
  app.hidden = false;

  const state = {
    filter: "all",
    sort: "updated",
    query: "",
    shows: new Map(),
    catalogueAvailable: false,
    catalogueError: "",
    preference: null,
    preferenceGeneration: 0,
    importText: "",
    importEntries: [],
    importPreview: null,
    importPreviewGeneration: 0,
    importFileGeneration: 0,
    importMode: "merge",
  };

  const filterNav = document.getElementById("libraryStateFilters");
  const knownEntries = document.getElementById("libraryKnownEntries");
  const unresolvedEntries = document.getElementById("libraryUnresolvedEntries");
  const search = document.getElementById("librarySearch");
  const sort = document.getElementById("librarySort");
  const importInput = document.getElementById("libraryImportFile");
  const importPreview = document.getElementById("libraryImportPreview");
  const importPreviewContent = document.getElementById("libraryImportPreviewContent");
  const importCommitButton = document.getElementById("libraryImportCommitButton");
  const replaceDialog = document.getElementById("libraryReplaceDialog");
  const replaceAcknowledgement = document.getElementById("libraryReplaceAcknowledgement");
  const replaceConfirmButton = document.getElementById("libraryReplaceConfirmButton");

  async function loadPreference() {
    const requestGeneration = ++state.preferenceGeneration;
    const result = await library.getPersonalDiscoveryEnabled();
    if (requestGeneration !== state.preferenceGeneration) return;
    const checkbox = document.getElementById("libraryPersonalDiscovery");
    if (!result.ok) {
      state.preference = null;
      if (checkbox) checkbox.disabled = true;
      setStatus("libraryPreferenceStatus", `This setting could not be read: ${result.error.message}`, "error");
      return;
    }
    state.preference = result.value;
    if (checkbox) {
      checkbox.checked = result.value;
      checkbox.disabled = false;
    }
    const preferenceStatus = document.getElementById("libraryPreferenceStatus");
    if (preferenceStatus && !preferenceStatus.textContent) {
      setStatus("libraryPreferenceStatus", "Saved only in this browser. It will not be changed by importing a backup.");
    }
  }

  function render(currentRuntime = runtime.getState()) {
    const focusedEntryControl = captureEntryControlFocus();
    const entries = Array.isArray(currentRuntime.entries) ? [...currentRuntime.entries] : [];
    const known = [];
    const unresolved = [];
    entries.forEach((entry) => {
      const show = state.shows.get(entry.showId) || null;
      const record = { entry, show, unresolved: !show };
      (show ? known : unresolved).push(record);
    });

    const counts = Object.fromEntries(STATE_ORDER.map((value) => [value, entries.filter((entry) => entry.state === value).length]));
    filterNav?.querySelectorAll("[data-library-filter]").forEach((button) => {
      const key = button.dataset.libraryFilter;
      const label = key === "all" ? "All Library" : STATE_LABELS[key];
      button.textContent = key === "all" ? `${label} (${entries.length})` : `${label} (${counts[key] || 0})`;
      button.setAttribute("aria-pressed", String(key === state.filter));
    });

    const matches = ({ entry, show }) => {
      if (state.filter !== "all" && entry.state !== state.filter) return false;
      if (!state.query) return true;
      const haystack = `${show ? getShowSearchText(show) : ""} ${entry.titleSnapshot || ""} ${entry.showId}`.toLocaleLowerCase("en");
      return haystack.includes(state.query);
    };
    const sorter = (left, right) => {
      if (state.sort === "title") {
        return stateNames.compare(left.show?.title || left.entry.titleSnapshot || left.entry.showId, right.show?.title || right.entry.titleSnapshot || right.entry.showId)
          || left.entry.showId.localeCompare(right.entry.showId);
      }
      const field = state.sort === "added" ? "createdAt" : "updatedAt";
      return right.entry[field].localeCompare(left.entry[field]) || left.entry.showId.localeCompare(right.entry.showId);
    };
    const visibleKnown = known.filter(matches).sort(sorter);
    const visibleUnresolved = unresolved.filter(matches).sort(sorter);
    knownEntries.replaceChildren();
    unresolvedEntries.replaceChildren();
    visibleKnown.forEach(({ entry, show }) => knownEntries.append(renderEntryCard(entry, show)));

    if (visibleUnresolved.length) {
      unresolvedEntries.hidden = false;
      unresolvedEntries.append(makeElement("h2", "library-unresolved-heading", `Unresolved archive IDs (${visibleUnresolved.length})`));
      unresolvedEntries.append(makeElement("p", "library-unresolved-description", "These entries remain attached to their original IDs. Echo does not match them to another show by title."));
      visibleUnresolved.forEach(({ entry }) => unresolvedEntries.append(renderEntryCard(entry, null, true)));
    } else {
      unresolvedEntries.hidden = true;
    }

    restoreEntryControlFocus(focusedEntryControl, { knownEntries, unresolvedEntries, filterNav });

    const visibleCount = visibleKnown.length + visibleUnresolved.length;
    const summary = document.getElementById("libraryEntrySummary");
    if (summary) {
      summary.textContent = currentRuntime.entries === null
        ? currentRuntime.loading ? "Opening this browser's Library…" : "The Library could not be read. Your saved rows have not been changed."
        : `${visibleCount} of ${entries.length} ${entries.length === 1 ? "entry" : "entries"} shown`;
    }

    const emptyState = document.getElementById("libraryEmptyState");
    const hasNoEntries = Array.isArray(currentRuntime.entries) && entries.length === 0;
    const hasNoMatches = Array.isArray(currentRuntime.entries) && entries.length > 0 && visibleCount === 0;
    if (emptyState) {
      emptyState.hidden = !(hasNoEntries || hasNoMatches);
      if (hasNoEntries || hasNoMatches) {
        emptyState.querySelector("h2").textContent = hasNoMatches || state.query || state.filter !== "all" ? "No matching shows" : "Your Library is empty";
        emptyState.querySelector("p:not(.library-section-kicker)").textContent = hasNoMatches || state.query || state.filter !== "all"
          ? "Try another local search or status filter."
          : "Save a show from a card or show page. Your Library stays in this browser and works whether Personal Discovery is on or off.";
      }
    }

    const exportButton = document.getElementById("libraryExportButton");
    if (exportButton) exportButton.disabled = currentRuntime.entries === null || currentRuntime.loading;
    if (state.catalogueError && currentRuntime.entries !== null && !currentRuntime.loading) {
      setStatus("libraryPageStatus", `Public show details are unavailable right now (${state.catalogueError}). Library IDs remain intact and searchable.`, "error");
    } else if (!currentRuntime.loading && currentRuntime.error) {
      setStatus("libraryPageStatus", `Local Library unavailable: ${currentRuntime.error.message} No server or temporary-memory copy was used.`, "error");
    } else if (currentRuntime.entries !== null && !currentRuntime.loading) {
      setStatus("libraryPageStatus", "Your Library is stored in this browser.");
    }
  }

  async function refreshImportPreview() {
    if (!state.importText) return;
    const requestGeneration = ++state.importPreviewGeneration;
    const importText = state.importText;
    const importMode = state.importMode;
    const knownShowIds = state.catalogueAvailable ? [...state.shows.keys()] : null;
    const result = await library.previewImport(importText, { mode: importMode, knownShowIds });
    if (requestGeneration !== state.importPreviewGeneration || state.importText !== importText || state.importMode !== importMode) return;
    if (!result.ok) {
      state.importPreview = null;
      setStatus("libraryTransferStatus", `The backup could not be previewed: ${result.error.message} Nothing was changed.`, "error");
      renderImportPreview(null);
      return;
    }
    state.importPreview = result.value;
    renderImportPreview(result.value);
  }

  function renderImportPreview(preview) {
    importPreview.hidden = !preview;
    const rendered = buildImportPreview(preview, {
      labelForShowId: (showId) => getImportEntryLabel(state.importEntries, showId),
      entriesAvailable: runtime.getState().entries !== null,
    });
    importPreviewContent.replaceChildren(rendered.content);
    importCommitButton.textContent = rendered.buttonText;
    importCommitButton.disabled = rendered.disabled;
  }

  function clearImport(message = "") {
    state.importFileGeneration += 1;
    state.importPreviewGeneration += 1;
    state.importText = "";
    state.importEntries = [];
    state.importPreview = null;
    importInput.value = "";
    renderImportPreview(null);
    if (message) setStatus("libraryTransferStatus", message);
  }

  async function commitCurrentImport(confirmedReplace = false) {
    const preview = state.importPreview;
    if (!preview?.valid || !preview.previewId) return;
    const result = await library.commitImport(preview.previewId, { confirmed: confirmedReplace });
    if (!result.ok) {
      setStatus("libraryTransferStatus", `Import failed: ${result.error.message} Your current Library was not changed.`, "error");
      return false;
    }
    const action = result.value.operationMode === "replace" ? "Replaced" : "Merged";
    clearImport(`${action} ${result.value.importedCount} ${result.value.importedCount === 1 ? "entry" : "entries"}.`);
    await refreshRuntime();
    return true;
  }

  filterNav?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-library-filter]");
    if (!button) return;
    state.filter = button.dataset.libraryFilter || "all";
    render();
  });
  search?.addEventListener("input", () => {
    state.query = search.value.trim().toLocaleLowerCase("en");
    render();
  });
  sort?.addEventListener("change", () => {
    state.sort = sort.value;
    render();
  });

  document.getElementById("libraryPersonalDiscovery")?.addEventListener("change", async (event) => {
    const checkbox = event.currentTarget;
    const desired = checkbox.checked;
    checkbox.disabled = true;
    const result = await library.setPersonalDiscoveryEnabled(desired);
    if (!result.ok) {
      checkbox.checked = state.preference === true;
      checkbox.disabled = state.preference === null;
      setStatus("libraryPreferenceStatus", `The preference could not be saved: ${result.error.message} Your Library entries are unchanged.`, "error");
      return;
    }
    state.preference = desired;
    checkbox.disabled = false;
    setStatus("libraryPreferenceStatus", desired
      ? "Enabled on this browser. Discovery 2.0 is not using the preference yet; your Library entries remain unchanged."
      : "Disabled on this browser. Your Library entries and private ratings remain unchanged.");
  });

  document.getElementById("libraryExportButton")?.addEventListener("click", async () => {
    const button = document.getElementById("libraryExportButton");
    button.disabled = true;
    const result = await library.exportLibrary();
    button.disabled = false;
    if (!result.ok) {
      setStatus("libraryTransferStatus", `Backup export failed: ${result.error.message} Your stored data is unchanged.`, "error");
      return;
    }
    downloadJson(result.value);
    setStatus("libraryTransferStatus", `Downloaded ${result.value.filename}. This backup contains Library entries only; Personal Discovery was not exported.`);
  });

  importInput?.addEventListener("change", async () => {
    const fileGeneration = ++state.importFileGeneration;
    const file = importInput.files?.[0];
    if (!file) {
      clearImport("Import canceled. Your Library was not changed.");
      return;
    }
    try {
      const importText = await file.text();
      if (fileGeneration !== state.importFileGeneration) return;
      state.importText = importText;
      state.importEntries = readImportEntries(state.importText);
      await refreshImportPreview();
      if (fileGeneration !== state.importFileGeneration || state.importText !== importText) return;
      if (state.importPreview?.valid) setStatus("libraryTransferStatus", "Backup validated. Review the preview and choose Merge or Replace. Nothing has been imported yet.");
      else setStatus("libraryTransferStatus", "This backup has invalid data. Review the issues below; nothing has been imported.", "error");
    } catch (error) {
      if (fileGeneration !== state.importFileGeneration) return;
      clearImport();
      setStatus("libraryTransferStatus", `The selected file could not be read: ${error?.message || "file read failed"}. Nothing was changed.`, "error");
    }
  });

  document.querySelectorAll('input[name="libraryImportMode"]').forEach((radio) => {
    radio.addEventListener("change", async () => {
      if (!radio.checked) return;
      state.importMode = radio.value === "replace" ? "replace" : "merge";
      await refreshImportPreview();
    });
  });

  importCommitButton?.addEventListener("click", async () => {
    if (state.importMode === "replace") {
      replaceAcknowledgement.checked = false;
      replaceConfirmButton.disabled = true;
      replaceDialog.showModal();
      return;
    }
    importCommitButton.disabled = true;
    const committed = await commitCurrentImport(false);
    if (!committed) importCommitButton.disabled = false;
  });
  document.getElementById("libraryImportCancelButton")?.addEventListener("click", () => clearImport("Import canceled. Your Library was not changed."));
  replaceAcknowledgement?.addEventListener("change", () => { replaceConfirmButton.disabled = !replaceAcknowledgement.checked; });
  replaceConfirmButton?.addEventListener("click", async () => {
    if (!replaceAcknowledgement.checked) return;
    replaceConfirmButton.disabled = true;
    const committed = await commitCurrentImport(true);
    replaceDialog.close(committed ? "replaced" : "failed");
  });
  replaceDialog?.addEventListener("cancel", () => setStatus("libraryTransferStatus", "Replace canceled. Your Library was not changed."));

  document.getElementById("libraryRecoveryButton")?.addEventListener("click", async () => {
    const result = await library.exportRecoverySnapshot();
    if (!result.ok) {
      setStatus("libraryRecoveryStatus", `Recovery export failed: ${result.error.message}. Stored rows were not changed.`, "error");
      return;
    }
    downloadJson(result.value);
    setStatus("libraryRecoveryStatus", `Downloaded ${result.value.filename}. Keep the raw recovery file private.`);
  });

  document.getElementById("libraryReplaceCancelButton")?.addEventListener("click", () => setStatus("libraryTransferStatus", "Replace canceled. Your Library was not changed."));

  runtime.subscribe((nextState) => render(nextState));
  runtime.subscribe(() => { void loadPreference(); });
  const preferenceLoad = loadPreference();
  try {
    const shows = await loadShows();
    state.shows = new Map(shows.filter((show) => show?.id && show.status === "published").map((show) => [show.id, show]));
    state.catalogueAvailable = true;
    app.dataset.libraryCatalogueState = "available";
    render();
    if (state.importText) await refreshImportPreview();
  } catch (error) {
    state.catalogueError = error?.message || "Catalogue unavailable";
    app.dataset.libraryCatalogueState = "unavailable";
    render();
  }
  await preferenceLoad;
  render();
}
