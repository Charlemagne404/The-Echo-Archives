import { setChatOpen } from "../../chat.js";
import { MODE_CONFIG } from "../../submit/config.js";
import {
  appendModeLinkRow,
  addArrayValue,
  getActiveDraft,
  removeLinkRow,
  toggleArrayValue,
} from "../../submit/state.js";
import { normalizeCustomTag } from "../../submit/search.js";
import { captureCurrentDraft } from "./draft.js";

function resetModeUiState(state) {
  state.searchOpen = false;
  state.tagPickerOpen = false;
  state.tagPickerPinned = false;
  state.activeTagField = "selectedTags";
  state.tagQuery = "";
  state.tagHighlightIndex = -1;
}

export function bindSubmitPageClickHandlers({ state, elements, ui }) {
  elements.modeCards.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const card = target.closest("[data-submission-mode]");
    if (!card) {
      return;
    }

    const nextMode = card.getAttribute("data-submission-mode");
    if (!nextMode || nextMode === state.activeMode || !Object.hasOwn(MODE_CONFIG, nextMode)) {
      return;
    }

    captureCurrentDraft(state, elements);
    state.activeMode = nextMode;
    resetModeUiState(state);
    ui.setStatus("Nothing submitted yet.");
    ui.renderAll();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const openChatButton = target.closest("[data-open-chat]");
    if (openChatButton) {
      setChatOpen(true);
      return;
    }

    const searchShell = elements.form.querySelector(".submit-search-shell");
    if (searchShell && target instanceof Node && !searchShell.contains(target)) {
      state.searchOpen = false;
      ui.updateSearchResults();
    }

    const activeTagPicker = state.activeTagField
      ? elements.form.querySelector(`[data-tag-picker="${state.activeTagField}"]`)
      : null;
    if (activeTagPicker && target instanceof Node && !activeTagPicker.contains(target) && state.tagPickerOpen) {
      state.tagPickerOpen = false;
      state.tagPickerPinned = false;
      state.tagQuery = "";
      state.tagHighlightIndex = -1;
      ui.renderAll();
    }
  });

  elements.form.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const chip = target.closest("[data-chip-field]");
    if (chip) {
      event.preventDefault();
      if (chip.closest("[data-tag-picker]")) {
        event.stopPropagation();
      }
      captureCurrentDraft(state, elements);
      const field = chip.getAttribute("data-chip-field");
      const value = chip.getAttribute("data-chip-value");
      if (field && value) {
        toggleArrayValue(getActiveDraft(state), field, value);
        ui.renderAll();
      }
      return;
    }

    const tagSuggestion = target.closest("[data-tag-suggestion]");
    if (tagSuggestion) {
      event.preventDefault();
      event.stopPropagation();
      const field = tagSuggestion.getAttribute("data-tag-field");
      const value = tagSuggestion.getAttribute("data-tag-suggestion");
      if (field && value) {
        addArrayValue(getActiveDraft(state), field, value, field === "selectedTags" ? 8 : Number.POSITIVE_INFINITY);
        state.tagPickerPinned = false;
        state.tagPickerOpen = false;
        ui.updateTagSuggestionState(field, "", { highlightIndex: -1 });
        ui.renderAll();
        ui.focusTagInput(field);
      }
      return;
    }

    const createTag = target.closest("[data-create-tag]");
    if (createTag) {
      event.preventDefault();
      event.stopPropagation();
      const field = createTag.getAttribute("data-tag-field");
      const value = normalizeCustomTag(createTag.getAttribute("data-create-tag"));
      if (field && value) {
        addArrayValue(getActiveDraft(state), field, value, field === "selectedTags" ? 8 : Number.POSITIVE_INFINITY);
        state.tagPickerPinned = false;
        state.tagPickerOpen = false;
        ui.updateTagSuggestionState(field, "", { highlightIndex: -1 });
        ui.renderAll();
        ui.focusTagInput(field);
      }
      return;
    }

    const tagPickerToggle = target.closest("[data-toggle-tag-picker]");
    if (tagPickerToggle) {
      event.preventDefault();
      event.stopPropagation();
      const field = tagPickerToggle.getAttribute("data-toggle-tag-picker");
      if (!field) {
        return;
      }

      const isSameField = state.activeTagField === field;
      state.activeTagField = field;
      state.tagPickerPinned = isSameField ? !state.tagPickerPinned : true;
      ui.updateTagSuggestionState(field, "", { highlightIndex: -1 });
      state.tagPickerOpen = state.tagPickerPinned;
      ui.renderAll();
      if (state.tagPickerOpen) {
        ui.focusTagInput(field, state.tagQuery.length);
      }
      return;
    }

    const segment = target.closest("[data-segment-field]");
    if (segment) {
      event.preventDefault();
      captureCurrentDraft(state, elements);
      const field = segment.getAttribute("data-segment-field");
      const value = segment.getAttribute("data-segment-value");
      if (field && value) {
        getActiveDraft(state)[field] = value;
        ui.renderAll();
      }
      return;
    }

    const star = target.closest("[data-rating-stars]");
    if (star) {
      event.preventDefault();
      captureCurrentDraft(state, elements);
      const nextValue = Number.parseInt(star.getAttribute("data-rating-stars") || "", 10);
      if (Number.isInteger(nextValue) && nextValue >= 1 && nextValue <= 5) {
        getActiveDraft(state).ratingStars = nextValue;
        ui.renderAll();
      }
      return;
    }

    const addLinkOption = target.closest("[data-add-link-option]");
    if (addLinkOption) {
      event.preventDefault();
      captureCurrentDraft(state, elements);
      const field = addLinkOption.getAttribute("data-add-link-option");
      const preferredLabel = addLinkOption.getAttribute("data-add-link-value") || "";
      if (field && preferredLabel) {
        appendModeLinkRow(getActiveDraft(state), field, preferredLabel);
        ui.renderAll();
      }
      return;
    }

    const addRow = target.closest("[data-add-link]");
    if (addRow) {
      event.preventDefault();
      captureCurrentDraft(state, elements);
      const field = addRow.getAttribute("data-add-link");
      if (field) {
        appendModeLinkRow(getActiveDraft(state), field);
        ui.renderAll();
      }
      return;
    }

    const removeRow = target.closest("[data-remove-link]");
    if (removeRow) {
      event.preventDefault();
      captureCurrentDraft(state, elements);
      const field = removeRow.getAttribute("data-remove-link");
      const index = Number.parseInt(removeRow.getAttribute("data-link-index") || "", 10);
      if (field && Number.isInteger(index)) {
        removeLinkRow(getActiveDraft(state), field, index);
        ui.renderAll();
      }
      return;
    }

    const clearSelectedShow = target.closest("[data-clear-existing-show]");
    if (clearSelectedShow) {
      event.preventDefault();
      const draft = getActiveDraft(state);
      draft.existingShowId = "";
      draft.showSearch = "";
      state.searchOpen = true;
      ui.syncHiddenInputs();
      ui.syncQueryState();
      ui.renderAll();
      ui.focusExistingShowSearch();
      return;
    }

    const toggleShowSearch = target.closest("[data-toggle-show-search]");
    if (toggleShowSearch) {
      event.preventDefault();
      state.searchOpen = !state.searchOpen;
      ui.renderAll();
      if (state.searchOpen) {
        ui.focusExistingShowSearch(getActiveDraft(state).showSearch.length);
      }
      return;
    }

    const searchResult = target.closest("[data-show-option-id]");
    if (searchResult) {
      event.preventDefault();
      const showId = searchResult.getAttribute("data-show-option-id");
      if (!showId) {
        return;
      }

      const show = state.showMap.get(showId);
      if (!show) {
        return;
      }

      const draft = getActiveDraft(state);
      draft.existingShowId = show.id;
      draft.showSearch = show.title;
      state.searchOpen = false;
      ui.syncHiddenInputs();
      ui.syncQueryState();
      ui.renderAll();
    }
  });
}
