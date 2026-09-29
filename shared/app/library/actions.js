import { STATE_LABELS } from "./constants.js";

function setControlStatus(showId, message, tone = "") {
  document.querySelectorAll(`[data-library-control][data-library-show-id="${CSS.escape(showId)}"] .library-control-status`).forEach((node) => {
    node.textContent = message;
    node.dataset.tone = tone;
  });
  const globalStatus = document.getElementById("libraryGlobalStatus");
  if (globalStatus) globalStatus.textContent = message;
}

export function announceStorageFailure(runtimeState) {
  const status = document.getElementById("libraryGlobalStatus");
  if (!status || runtimeState.loading || !runtimeState.error) return;
  status.textContent = `Local Library unavailable: ${runtimeState.error.message}`;
}

export function bindLibraryActions({ library, getRuntimeState, refreshRuntime }) {
  async function removeEntry(showId) {
    const result = await library.removeEntry(showId);
    if (!result.ok) {
      setControlStatus(showId, `Could not remove this entry: ${result.error.message}`, "error");
      return;
    }
    await refreshRuntime();
    setControlStatus(showId, result.value.removed ? "Removed from your local Library." : "This show is not in your Library.");
    const remainingControl = document.querySelector(`[data-library-control][data-library-show-id="${CSS.escape(showId)}"]`);
    if (remainingControl?.matches("details.library-card-control")) remainingControl.querySelector("summary")?.focus();
    else if (remainingControl) remainingControl.querySelector("[data-library-state-select]")?.focus();
    else document.querySelector("#libraryStateFilters [aria-pressed='true']")?.focus();
  }

  async function updateRating(showId, value, select) {
    const result = value ? await library.setRating(showId, Number(value)) : await library.removeRating(showId);
    if (!result.ok) {
      setControlStatus(showId, `Private rating could not be saved: ${result.error.message}`, "error");
      const entry = getRuntimeState().entriesById?.get(showId);
      select.value = entry && Object.hasOwn(entry, "rating") ? String(entry.rating) : "";
      return;
    }
    await refreshRuntime();
    setControlStatus(showId, value ? `Your private rating is ${value} of 5.` : "Your private rating was removed.");
  }

  document.addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) return;
    const removeButton = event.target.closest("[data-library-remove]");
    if (removeButton) {
      event.preventDefault();
      await removeEntry(removeButton.dataset.libraryRemove);
    }
  });

  document.addEventListener("change", async (event) => {
    if (!(event.target instanceof Element)) return;
    const stateSelect = event.target.closest("[data-library-state-select]");
    if (stateSelect) {
      const showId = stateSelect.dataset.libraryStateSelect;
      const entry = getRuntimeState().entriesById?.get(showId);
      if (stateSelect.value === entry?.state || !stateSelect.value) return;
      const result = await library.setState(showId, stateSelect.value);
      if (!result.ok) {
        setControlStatus(showId, `State could not be saved: ${result.error.message}`, "error");
        await refreshRuntime();
        return;
      }
      await refreshRuntime();
      setControlStatus(showId, `Library state changed to ${STATE_LABELS[stateSelect.value]}.`);
      const cardControl = stateSelect.closest("details.library-card-control");
      if (cardControl) {
        cardControl.open = false;
        cardControl.querySelector("summary")?.focus();
      } else {
        stateSelect.focus();
      }
      return;
    }
    const ratingSelect = event.target.closest("[data-library-rating-select]");
    if (ratingSelect) {
      await updateRating(ratingSelect.dataset.libraryRatingSelect, ratingSelect.value, ratingSelect);
      ratingSelect.focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !(event.target instanceof Element)) return;
    const details = event.target.closest("details.library-card-control[open]");
    if (!details) return;
    event.preventDefault();
    details.open = false;
    details.querySelector("summary")?.focus();
  });
}
