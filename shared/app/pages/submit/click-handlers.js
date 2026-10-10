import { MODE_CONFIG } from "../../submit/config.js";
import { appendModeLinkRow, addArrayValue, getActiveDraft, removeLinkRow, toggleArrayValue } from "../../submit/state.js";
import { normalizeCustomTag } from "../../submit/search.js";
import { captureCurrentDraft, clearActiveDraft, switchActiveDraftContext } from "./draft.js";

function resetModeUiState(state) {
  state.searchOpen = false;
  state.showHighlightIndex = -1;
  state.tagPickerOpen = false;
  state.tagPickerPinned = false;
  state.activeTagField = "selectedTags";
  state.tagQuery = "";
  state.tagHighlightIndex = -1;
}

function getRadioMoveIndex(currentIndex, key, count) {
  if (count <= 0) {
    return -1;
  }
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (currentIndex + 1 + count) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (currentIndex - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return -1;
  }
}

function focusAfterRender(selector) {
  window.requestAnimationFrame(() => {
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body && activeElement !== document.documentElement) {
      return;
    }
    const target = document.querySelector(selector);
    if (target instanceof HTMLElement) {
      target.focus();
    }
  });
}
function escapeCssIdentifier(value = "") {
  if (globalThis.CSS?.escape) {
    return globalThis.CSS.escape(value);
  }

  return String(value).replace(/["\\]/g, "\\$&");
}

function setCategoryRatingSliderState(slider, value, progressValue = value) {
  const key = slider.getAttribute("data-category-score-slider");
  if (!key) {
    return;
  }

  const progress = ((progressValue - 1) / 9) * 100;
  slider.parentElement?.style.setProperty("--category-rating-progress", `${progress}%`);
  slider.setAttribute("aria-valuetext", `${value} out of 10`);

  const group = slider.closest("[data-category-score-group]");
  const output = group?.querySelector(`[data-category-rating-value="${escapeCssIdentifier(key)}"]`);
  if (output && output.textContent !== `${value}/10`) {
    output.textContent = `${value}/10`;
  }

  const clearButton = group?.querySelector(`[data-clear-category-score="${escapeCssIdentifier(key)}"]`);
  if (clearButton instanceof HTMLButtonElement) {
    clearButton.hidden = false;
  }

  const ratedCount = document.querySelectorAll("[data-category-score-slider][data-category-score-selected='true']").length;
  const wasSelected = slider.dataset.categoryScoreSelected === "true";
  slider.dataset.categoryScoreSelected = "true";
  if (!wasSelected) {
    const count = document.querySelector("[data-category-ratings-count]");
    if (count) {
      count.textContent = `${ratedCount + 1} of ${document.querySelectorAll("[data-category-score-slider]").length} rated`;
    }
  }
}

export function bindSubmitPageClickHandlers({ state, elements, ui, ensureLookup, ensureShowContext }) {
  let activeCategorySlider = null;

  function updateCategoryRating(slider, { snap = false } = {}) {
    const key = slider.getAttribute("data-category-score-slider");
    const rawValue = Number(slider.value);
    if (!key || !Number.isFinite(rawValue) || rawValue < 1 || rawValue > 10) {
      return;
    }

    const value = Math.max(1, Math.min(10, Math.round(rawValue)));
    if (snap) {
      slider.value = String(value);
    }

    const draft = getActiveDraft(state);
    const isNewRating = slider.dataset.categoryScoreSelected !== "true";
    const storedValue = Number(draft.categoryScores?.[key]);
    if (isNewRating || storedValue !== value) {
      captureCurrentDraft(state, elements);
      const currentDraft = getActiveDraft(state);
      currentDraft.categoryScores = { ...(currentDraft.categoryScores || {}), [key]: value };
      state.persistActiveDraft?.();
      state.onDraftChanged?.();
    }

    setCategoryRatingSliderState(slider, value, snap ? value : rawValue);
  }

  function animateCategoryRatingCommit(slider) {
    const output = slider.closest("[data-category-score-group]")?.querySelector("[data-category-rating-value]");
    const prefersReducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!(output instanceof HTMLElement) || prefersReducedMotion || typeof output.animate !== "function") {
      return;
    }

    output.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.08)" },
        { transform: "scale(1)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }

  function selectShow(show) {
    const currentContext = state.draftContexts[state.activeMode] || {};
    switchActiveDraftContext(
      state,
      elements,
      { showId: show.id, entityId: currentContext.entityId || "" },
      { showTitle: show.title },
    );
    state.searchOpen = false;
    state.showHighlightIndex = -1;
    ui.syncHiddenInputs();
    ui.syncQueryState();
    ui.renderAll();
    void ensureShowContext(show.id);
    ui.focusExistingShowSearch(show.title.length);
  }

  function activateMode(nextMode, { focus = false } = {}) {
    if (
      elements.form.getAttribute("aria-busy") === "true" ||
      !nextMode ||
      nextMode === state.activeMode ||
      !Object.prototype.hasOwnProperty.call(MODE_CONFIG, nextMode)
    ) {
      return;
    }

    captureCurrentDraft(state, elements);
    state.activeMode = nextMode;
    resetModeUiState(state);
    ui.clearValidationErrors();
    if (elements.submitStatus.dataset.state === "error") {
      ui.setStatus("");
    }
    ui.setStatus("");
    elements.resultPanel.hidden = true;
    elements.resultPanel.innerHTML = "";
    elements.form.hidden = false;
    ui.renderAll();

    if (focus) {
      focusAfterRender(`[data-submission-mode="${escapeCssIdentifier(nextMode)}"]`);
    }

    if (nextMode !== "show") {
      void ensureLookup().catch(() => {});
    }
  }

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
    activateMode(nextMode, { focus: true });
  });

  elements.modeCards.addEventListener("keydown", (event) => {
    const target = event.target;
    const current = target instanceof Element ? target.closest("[data-submission-mode][role='radio']") : null;
    if (!(current instanceof HTMLElement)) {
      return;
    }

    const radios = Array.from(elements.modeCards.querySelectorAll("[data-submission-mode][role='radio']"));
    const currentIndex = radios.indexOf(current);
    const nextIndex = getRadioMoveIndex(currentIndex, event.key, radios.length);
    if (nextIndex < 0) {
      return;
    }

    event.preventDefault();
    const nextMode = radios[nextIndex]?.getAttribute("data-submission-mode");
    activateMode(nextMode, { focus: true });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const searchShell = elements.form.querySelector(".submit-search-shell");
    const clickPath = typeof event.composedPath === "function" ? event.composedPath() : [];
    const clickedInsideSearchShell = searchShell && (
      searchShell.contains(target) ||
      clickPath.some((node) => node instanceof Element && node.matches(".submit-search-shell"))
    );
    if (searchShell && !clickedInsideSearchShell) {
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

    ui.clearValidationErrors();

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

    const clearDraft = target.closest("[data-clear-submit-draft]");
    if (clearDraft) {
      event.preventDefault();
      clearActiveDraft(state, elements);
      ui.setStatus("Draft cleared.");
      ui.renderAll();
      return;
    }

    const tagSuggestion = target.closest("[data-tag-suggestion]");
    if (tagSuggestion) {
      event.preventDefault();
      event.stopPropagation();
      const field = tagSuggestion.getAttribute("data-tag-field");
      const value = tagSuggestion.getAttribute("data-tag-suggestion");
      if (field && value) {
        addArrayValue(getActiveDraft(state), field, value, field === "selectedTags" ? 4 : Number.POSITIVE_INFINITY);
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
        addArrayValue(getActiveDraft(state), field, value, field === "selectedTags" ? 4 : Number.POSITIVE_INFINITY);
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
      captureCurrentDraft(state, elements);
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
        const selectionStart = state.tagQuery.length;
        ui.focusTagInput(field, selectionStart);
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
        focusAfterRender(`[data-segment-field="${escapeCssIdentifier(field)}"][data-segment-value="${escapeCssIdentifier(value)}"]`);
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
        focusAfterRender(`[data-rating-stars="${nextValue}"]`);
      }
      return;
    }

    const clearCategoryScore = target.closest("[data-clear-category-score]");
    if (clearCategoryScore) {
      event.preventDefault();
      captureCurrentDraft(state, elements);
      const key = clearCategoryScore.getAttribute("data-clear-category-score");
      if (key) {
        const draft = getActiveDraft(state);
        const nextScores = { ...(draft.categoryScores || {}) };
        delete nextScores[key];
        draft.categoryScores = nextScores;
        ui.renderAll();
        focusAfterRender(`[data-category-score-slider="${escapeCssIdentifier(key)}"]`);
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
      const currentContext = state.draftContexts[state.activeMode] || {};
      switchActiveDraftContext(
        state,
        elements,
        { showId: "", entityId: currentContext.entityId || "" },
        { restore: false },
      );
      state.searchOpen = true;
      state.showHighlightIndex = -1;
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
      state.showHighlightIndex = -1;
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

      selectShow(show);
      return;
    }

    const retryLookup = target.closest("[data-retry-submit-lookup]");
    if (retryLookup) {
      event.preventDefault();
      void ensureLookup({ force: true, focusSearch: true }).catch(() => {});
    }
  });

  elements.form.addEventListener("input", (event) => {
    const slider = event.target;
    if (!(slider instanceof HTMLInputElement) || !slider.matches("[data-category-score-slider]")) {
      return;
    }

    updateCategoryRating(slider);
  });

  elements.form.addEventListener("change", (event) => {
    const slider = event.target;
    if (slider instanceof HTMLInputElement && slider.matches("[data-category-score-slider]")) {
      updateCategoryRating(slider, { snap: true });
      slider.classList.remove("is-dragging");
      animateCategoryRatingCommit(slider);
    }
  });

  elements.form.addEventListener("pointerdown", (event) => {
    const slider = event.target instanceof Element ? event.target.closest("[data-category-score-slider]") : null;
    if (slider instanceof HTMLInputElement) {
      activeCategorySlider = slider;
      slider.classList.add("is-dragging");
    }
  });

  function finishCategorySliderDrag() {
    if (!(activeCategorySlider instanceof HTMLInputElement)) {
      return;
    }

    const wasUnrated = activeCategorySlider.dataset.categoryScoreSelected !== "true";
    updateCategoryRating(activeCategorySlider, { snap: true });
    activeCategorySlider.classList.remove("is-dragging");
    if (wasUnrated) {
      animateCategoryRatingCommit(activeCategorySlider);
    }
    activeCategorySlider = null;
  }

  window.addEventListener("pointerup", finishCategorySliderDrag, { passive: true });
  window.addEventListener("pointercancel", finishCategorySliderDrag, { passive: true });

  elements.form.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches("[data-category-score-slider]")) {
      const currentValue = Math.round(Number(target.value));
      let nextValue = currentValue;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowUp":
          nextValue += 1;
          break;
        case "ArrowLeft":
        case "ArrowDown":
          nextValue -= 1;
          break;
        case "PageUp":
          nextValue += 2;
          break;
        case "PageDown":
          nextValue -= 2;
          break;
        case "Home":
          nextValue = 1;
          break;
        case "End":
          nextValue = 10;
          break;
        default:
          return;
      }

      event.preventDefault();
      target.value = String(Math.max(1, Math.min(10, nextValue)));
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const radio = target instanceof Element ? target.closest("[role='radio']") : null;
    const group = radio?.closest("[role='radiogroup']");
    if (!(radio instanceof HTMLElement) || !(group instanceof HTMLElement)) {
      return;
    }

    const radios = Array.from(group.querySelectorAll("[role='radio']")).filter((node) => node instanceof HTMLElement);
    const currentIndex = radios.indexOf(radio);
    const nextIndex = getRadioMoveIndex(currentIndex, event.key, radios.length);
    if (nextIndex < 0) {
      return;
    }

    const nextRadio = radios[nextIndex];
    if (!(nextRadio instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    nextRadio.click();
  });
}
