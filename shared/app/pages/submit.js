import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { getPublishedShows, loadShows } from "../data.js";
import { updateDocumentMetadata } from "../utils.js";
import {
  MODE_CONFIG,
  MODES_WITH_EXISTING_SHOW,
  REVIEW_CONTEXT_OPTIONS,
  REVIEW_STRENGTH_OPTIONS,
} from "../submit/config.js";
import {
  addArrayValue,
  createDraft,
  createDrafts,
  getActiveDraft,
  seedStateFromParams,
} from "../submit/state.js";
import {
  buildTagOptions,
  getShowMatches,
  getTagSuggestions,
  resolveTagSubmission,
} from "../submit/search.js";
import { validateDraft } from "../submit/validation.js";
import { buildPayload, getPendingCopy, getSuccessCopy, submitSubmission } from "../submit/api.js";
import { bindSubmitPageClickHandlers } from "./submit/click-handlers.js";
import { captureCurrentDraft } from "./submit/draft.js";
import { getSubmitElements } from "./submit/elements.js";
import { createSubmitUiController } from "./submit/ui.js";

export async function initializeSubmitPage() {
  updateDocumentMetadata({
    title: "Submit a Show - The Echo Archives",
    description: "Submit a show, send a correction, share a listener review, or verify facts for The Echo Archives.",
    path: "/submit.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });

  const elements = getSubmitElements();
  if (!elements) {
    return;
  }

  const shows = getPublishedShows(await loadShows()).sort((left, right) => left.title.localeCompare(right.title));
  const state = {
    activeMode: "show",
    searchOpen: false,
    tagPickerOpen: false,
    tagPickerPinned: false,
    activeTagField: "selectedTags",
    tagQuery: "",
    tagHighlightIndex: -1,
    shows,
    showMap: new Map(shows.map((show) => [show.id, show])),
    tagFieldOptions: {
      selectedTags: buildTagOptions(shows),
      bestFor: REVIEW_CONTEXT_OPTIONS,
      workedBest: REVIEW_STRENGTH_OPTIONS,
    },
    drafts: createDrafts(),
  };
  const ui = createSubmitUiController({ state, elements });

  seedStateFromParams(state);
  ui.renderAll();
  bindSubmitPageClickHandlers({ state, elements, ui });

  elements.form.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.id === "submitExistingShowSearch") {
      state.searchOpen = true;
      ui.updateSearchResults();
      return;
    }

    const tagField = target.dataset.tagInput;
    if (tagField) {
      const nextOpenState = state.tagPickerPinned || Boolean(target.value.trim());
      const shouldRender = state.activeTagField !== tagField || state.tagPickerOpen !== nextOpenState;
      state.tagPickerOpen = nextOpenState;
      ui.updateTagSuggestionState(tagField, target.value, { highlightIndex: -1 });
      if (shouldRender) {
        ui.renderAll();
        ui.focusTagInput(tagField, target.value.length);
      }
    }
  });

  elements.form.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return;
    }

    captureCurrentDraft(state, elements);
    ui.updateCounterFor(target.id, target.value.length);

    if (target.id === "submitExistingShowSearch") {
      const draft = getActiveDraft(state);
      draft.showSearch = target.value;
      const selectedShow = state.showMap.get(draft.existingShowId) || null;
      if (!selectedShow || selectedShow.title !== target.value.trim()) {
        draft.existingShowId = "";
      }
      state.searchOpen = true;
      ui.syncHiddenInputs();
      ui.syncQueryState();
      ui.updateSearchResults();
      return;
    }

    const tagField = target.dataset.tagInput;
    if (tagField) {
      state.tagPickerOpen = state.tagPickerPinned || Boolean(target.value.trim());
      ui.updateTagSuggestionState(tagField, target.value, { highlightIndex: -1 });
      ui.renderAll();
      ui.focusTagInput(tagField, state.tagQuery.length);
    }
  });

  elements.form.addEventListener("change", (event) => {
    const target = event.target;
    captureCurrentDraft(state, elements);
    ui.syncHiddenInputs();

    if (target instanceof HTMLSelectElement && target.matches("[data-link-part=\"label\"]")) {
      ui.renderAll();
    }
  });

  elements.form.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const tagField = target.dataset.tagInput;
    if (!tagField) {
      return;
    }

    const draft = getActiveDraft(state);
    const options = state.tagFieldOptions[tagField] || [];
    const currentValues = Array.isArray(draft[tagField]) ? draft[tagField] : [];
    const suggestions = getTagSuggestions(state.tagQuery, options, currentValues);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.tagPickerPinned = true;
      state.tagPickerOpen = true;
      state.tagHighlightIndex = suggestions.length === 0
        ? -1
        : state.tagHighlightIndex < 0
          ? 0
          : Math.min(state.tagHighlightIndex + 1, suggestions.length - 1);
      ui.renderAll();
      ui.focusTagInput(tagField, state.tagQuery.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      state.tagPickerPinned = true;
      state.tagPickerOpen = true;
      state.tagHighlightIndex = suggestions.length === 0
        ? -1
        : state.tagHighlightIndex <= 0
          ? suggestions.length - 1
          : state.tagHighlightIndex - 1;
      ui.renderAll();
      ui.focusTagInput(tagField, state.tagQuery.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const highlightedSuggestion = state.tagHighlightIndex >= 0 ? suggestions[state.tagHighlightIndex] : "";
      const nextTag = resolveTagSubmission(state.tagQuery, highlightedSuggestion, options);
      if (!nextTag) {
        return;
      }

      addArrayValue(draft, tagField, nextTag, tagField === "selectedTags" ? 8 : Number.POSITIVE_INFINITY);
      state.tagPickerPinned = false;
      state.tagPickerOpen = false;
      ui.updateTagSuggestionState(tagField, "", { highlightIndex: -1 });
      ui.renderAll();
      ui.focusTagInput(tagField);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      state.tagPickerOpen = false;
      state.tagPickerPinned = false;
      state.tagQuery = "";
      state.tagHighlightIndex = -1;
      ui.renderAll();
      return;
    }

    if (event.key === "Backspace" && !state.tagQuery) {
      const nextTags = Array.isArray(draft[tagField]) ? [...draft[tagField]] : [];
      nextTags.pop();
      draft[tagField] = nextTags;
      state.tagPickerOpen = state.tagPickerPinned || Boolean(state.tagQuery.trim());
      ui.renderAll();
      ui.focusTagInput(tagField);
    }
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    captureCurrentDraft(state, elements);

    const mode = state.activeMode;
    const modeConfig = MODE_CONFIG[mode];
    const draft = getActiveDraft(state);
    const validationError = validateDraft(mode, draft, state.showMap);
    if (validationError) {
      ui.setStatus(validationError, "error");
      return;
    }

    const payload = buildPayload(mode, draft, state.showMap);
    elements.submitButton.disabled = true;
    elements.submitButtonText.textContent = "Submitting...";
    ui.setStatus(getPendingCopy(mode), "pending");

    try {
      await submitSubmission(payload);
      state.drafts[mode] = createDraft(mode);
      state.searchOpen = false;
      ui.renderAll();
      ui.setStatus(getSuccessCopy(mode), "success");
    } catch (error) {
      ui.setStatus(error instanceof Error ? error.message : "Submission failed. Try again.", "error");
    } finally {
      elements.submitButton.disabled = false;
      elements.submitButtonText.textContent = modeConfig.submitLabel;
    }
  });
}
