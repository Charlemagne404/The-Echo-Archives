import { MODE_CONFIG, MODES_WITH_EXISTING_SHOW } from "../../submit/config.js";
import { getActiveDraft } from "../../submit/state.js";
import { getShowMatches, getTagSuggestions, renderSearchResultsMarkup } from "../../submit/search.js";
import { renderModeCardsMarkup, renderModeFields, renderRailCard } from "../../submit/render.js";
import { escapeHtml, iconMarkup } from "../../submit/utils.js";

export function createSubmitUiController({ state, elements }) {
  return {
    clearValidationErrors,
    showValidationError,
    renderAll,
    setStatus,
    updateTagSuggestionState,
    focusTagInput,
    focusExistingShowSearch,
    updateCounterFor,
    updateSearchResults,
    syncHiddenInputs,
    syncQueryState,
    setPending,
    showSuccess,
    showForm,
    focusFirstField,
  };

  function renderAll() {
    renderModeCards();
    renderActiveMode();
    syncHiddenInputs();
    syncQueryState();
  }

  function renderModeCards() {
    elements.modeCards.innerHTML = renderModeCardsMarkup(state.activeMode);
  }

  function renderActiveMode() {
    const mode = state.activeMode;
    const config = MODE_CONFIG[mode];
    const draft = getActiveDraft(state);
    const selectedShow = draft.existingShowId ? state.showMap.get(draft.existingShowId) || null : null;

    elements.heroDescription.textContent = config.heroDescription;
    document.body.dataset.submitMode = mode;

    elements.formIntro.innerHTML = `
      <div class="submit-form-intro-meta">
        <span class="submit-form-icon" aria-hidden="true">${iconMarkup(config.introIcon)}</span>
        <h2>${escapeHtml(config.introTitle)}</h2>
      </div>
      <p>${escapeHtml(config.introDescription)}</p>
    `;

    elements.dynamicFields.innerHTML = renderModeFields(mode, draft, {
      tagFieldOptions: state.tagFieldOptions,
      activeTagField: state.activeTagField,
      tagPickerOpen: state.tagPickerOpen,
      tagQuery: state.tagQuery,
      tagHighlightIndex: state.tagHighlightIndex,
      selectedShow,
      searchResults: getShowMatches(state.shows, draft.showSearch),
      searchOpen: state.searchOpen,
      lookupStatus: state.lookupStatus,
      lookupMessage: state.lookupMessage,
      showHighlightIndex: state.showHighlightIndex,
      showContext: selectedShow ? state.showContexts.get(selectedShow.id) || null : null,
      showContextStatus: selectedShow ? state.showContextStatuses.get(selectedShow.id) || "idle" : "idle",
      showContextMessage: selectedShow ? state.showContextMessages.get(selectedShow.id) || "" : "",
    });

    elements.sideRail.innerHTML = config.railCards.map((card) => renderRailCard(card)).join("");
    elements.submitButtonText.textContent = config.submitLabel;
    elements.submitButton.disabled = MODES_WITH_EXISTING_SHOW.has(mode) && state.lookupStatus !== "ready";
    elements.submitFooterNote.textContent = config.footerNote;
    elements.submitFooterNote.dataset.noteKind = "locked";

    clearValidationErrors();
    updateAllCounters();
    updateSearchResults();
  }

  function syncHiddenInputs() {
    const draft = getActiveDraft(state);
    elements.submissionType.value = state.activeMode;
    elements.existingShowId.value = MODES_WITH_EXISTING_SHOW.has(state.activeMode) ? draft.existingShowId || "" : "";
  }

  function syncQueryState() {
    const params = new URLSearchParams(window.location.search);
    if (state.activeMode === "show") {
      params.delete("submissionType");
      params.delete("showId");
    } else {
      params.set("submissionType", state.activeMode);
      const draft = getActiveDraft(state);
      if (draft.existingShowId) {
        params.set("showId", draft.existingShowId);
      } else if (state.lookupStatus !== "ready" && state.requestedShowId) {
        params.set("showId", state.requestedShowId);
      } else {
        params.delete("showId");
      }
    }

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }

  function setStatus(message, stateName = "") {
    elements.submitStatus.textContent = message;
    if (stateName) {
      elements.submitStatus.dataset.state = stateName;
      elements.submitStatus.setAttribute("role", stateName === "error" ? "alert" : "status");
      elements.submitStatus.setAttribute("aria-live", stateName === "error" ? "assertive" : "polite");
      return;
    }

    delete elements.submitStatus.dataset.state;
    elements.submitStatus.setAttribute("role", "status");
    elements.submitStatus.setAttribute("aria-live", "polite");
  }

  function setPending(isPending, mode = state.activeMode, pendingLabel = "Submitting…") {
    const config = MODE_CONFIG[mode];
    elements.form.setAttribute("aria-busy", String(isPending));
    elements.submitButton.disabled = isPending || (MODES_WITH_EXISTING_SHOW.has(mode) && state.lookupStatus !== "ready");
    elements.submitButtonText.textContent = isPending ? pendingLabel : config.submitLabel;
  }

  function showSuccess(message) {
    elements.form.hidden = true;
    elements.resultPanel.hidden = false;
    elements.resultPanel.innerHTML = `
      <div class="submit-result-icon" aria-hidden="true">${iconMarkup("check")}</div>
      <p class="submit-result-kicker">Submission received</p>
      <h2 tabindex="-1">${escapeHtml(message)}</h2>
      <button type="button" class="submit-primary-button submit-result-action" data-submit-another>Submit another</button>
    `;
    window.requestAnimationFrame(() => elements.resultPanel.querySelector("h2")?.focus());
  }

  function showForm() {
    elements.resultPanel.hidden = true;
    elements.resultPanel.innerHTML = "";
    elements.form.hidden = false;
    elements.legalAcknowledgement.checked = false;
    setStatus("");
    renderAll();
  }

  function focusFirstField() {
    window.requestAnimationFrame(() => {
      const target = elements.dynamicFields.querySelector("input:not([type='hidden']), textarea, select, button, summary");
      if (target instanceof HTMLElement) target.focus();
    });
  }

  function clearValidationErrors() {
    elements.dynamicFields.querySelectorAll("[data-field-shell]").forEach((shell) => {
      if (shell instanceof HTMLElement) {
        delete shell.dataset.invalid;
      }
    });

    elements.dynamicFields.querySelectorAll("[aria-invalid=\"true\"]").forEach((field) => {
      if (field instanceof HTMLElement) {
        field.removeAttribute("aria-invalid");
      }
    });

    elements.dynamicFields.querySelectorAll(".submit-field-error").forEach((errorNode) => {
      if (errorNode instanceof HTMLElement) {
        errorNode.hidden = true;
        errorNode.textContent = "";
      }
    });
  }

  function showValidationError(validationError) {
    if (!validationError?.fieldId || !validationError?.message) {
      return;
    }

    clearValidationErrors();
    const errorFieldId = validationError.errorFieldId || validationError.fieldId;
    const errorId = `${errorFieldId}Error`;
    const shell = elements.dynamicFields.querySelector(`[data-field-shell="${errorFieldId}"]`);
    const errorNode = document.getElementById(errorId);
    const field = document.getElementById(validationError.fieldId);

    if (shell instanceof HTMLElement) {
      shell.dataset.invalid = "true";
    }

    if (errorNode instanceof HTMLElement) {
      errorNode.hidden = false;
      errorNode.textContent = validationError.message;
    }

    if (field instanceof HTMLElement) {
      field.setAttribute("aria-invalid", "true");
    }

    setStatus(validationError.message, "error");
    focusValidationTarget(field, shell);
  }

  function focusValidationTarget(field, shell) {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement || field instanceof HTMLButtonElement) {
      field.focus();
      return;
    }

    const shellRoot = shell instanceof HTMLElement ? shell : field instanceof HTMLElement ? field : null;
    if (!shellRoot) {
      return;
    }

    const fallbackTarget = shellRoot.querySelector("input, textarea, select, button, [tabindex]:not([tabindex='-1'])");
    if (fallbackTarget instanceof HTMLElement) {
      fallbackTarget.focus();
      return;
    }

    if (shellRoot instanceof HTMLElement) {
      shellRoot.setAttribute("tabindex", "-1");
      shellRoot.focus();
    }
  }

  function updateTagSuggestionState(fieldName, query, { highlightIndex = state.tagHighlightIndex } = {}) {
    state.activeTagField = fieldName;
    state.tagQuery = query;
    const selectedValues = Array.isArray(getActiveDraft(state)[fieldName]) ? getActiveDraft(state)[fieldName] : [];
    const options = state.tagFieldOptions[fieldName] || [];
    const suggestions = getTagSuggestions(query, options, selectedValues);
    state.tagHighlightIndex = suggestions.length === 0
      ? -1
      : Math.max(-1, Math.min(highlightIndex, suggestions.length - 1));
  }

  function focusTagInput(fieldName, selectionStart = 0) {
    const input = document.querySelector(`[data-tag-input="${fieldName}"]`);
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.focus();
    const nextPosition = Math.max(0, Math.min(selectionStart, input.value.length));
    input.setSelectionRange(nextPosition, nextPosition);
  }

  function focusExistingShowSearch(selectionStart = 0) {
    const input = document.getElementById("submitExistingShowSearch");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.focus();
    const nextPosition = Math.max(0, Math.min(selectionStart, input.value.length));
    input.setSelectionRange(nextPosition, nextPosition);
  }

  function updateAllCounters() {
    elements.dynamicFields.querySelectorAll("[data-counter-target]").forEach((counter) => {
      const targetId = counter.getAttribute("data-counter-target");
      if (!targetId) {
        return;
      }

      const field = document.getElementById(targetId);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return;
      }

      counter.textContent = `${field.value.length}/${field.maxLength}`;
    });
  }

  function updateCounterFor(targetId, currentLength) {
    const counter = elements.dynamicFields.querySelector(`[data-counter-target="${targetId}"]`);
    const field = document.getElementById(targetId);
    if (!(counter instanceof HTMLElement) || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
      return;
    }

    counter.textContent = `${currentLength}/${field.maxLength}`;
  }

  function updateSearchResults() {
    const container = document.getElementById("submitExistingShowSearchResults");
    const input = document.getElementById("submitExistingShowSearch");
    if (!(container instanceof HTMLElement) || !(input instanceof HTMLInputElement)) {
      return;
    }

    if (!MODES_WITH_EXISTING_SHOW.has(state.activeMode) || !state.searchOpen) {
      container.hidden = true;
      container.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      return;
    }

    const draft = getActiveDraft(state);
    const matches = getShowMatches(state.shows, draft.showSearch);
    container.hidden = false;
    const boundedHighlightIndex = matches.length === 0
      ? -1
      : Math.max(-1, Math.min(state.showHighlightIndex, Math.min(matches.length, 7) - 1));
    state.showHighlightIndex = boundedHighlightIndex;
    container.innerHTML = renderSearchResultsMarkup(matches, draft.existingShowId, draft.showSearch, boundedHighlightIndex);
    input.setAttribute("aria-expanded", "true");
    if (boundedHighlightIndex >= 0) {
      input.setAttribute("aria-activedescendant", `${container.id}Option${boundedHighlightIndex}`);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }
}
