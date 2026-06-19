import { MODE_CONFIG, MODES_WITH_EXISTING_SHOW } from "../../submit/config.js";
import { getActiveDraft } from "../../submit/state.js";
import { getShowMatches, getTagSuggestions, renderSearchResultsMarkup } from "../../submit/search.js";
import { renderModeCardsMarkup, renderModeFields, renderRailCard } from "../../submit/render.js";
import { escapeHtml, iconMarkup } from "../../submit/utils.js";

export function createSubmitUiController({ state, elements }) {
  return {
    renderAll,
    setStatus,
    updateTagSuggestionState,
    focusTagInput,
    updateCounterFor,
    updateSearchResults,
    syncHiddenInputs,
    syncQueryState,
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

    elements.stepsPanel.innerHTML = config.steps.map((step, index) => `
      <div class="submit-step-item">
        <span class="submit-step-number" aria-hidden="true">${index + 1}</span>
        <span class="submit-step-copy">
          <strong>${escapeHtml(step.title)}</strong>
          <span>${escapeHtml(step.body)}</span>
        </span>
      </div>
      ${index < config.steps.length - 1 ? `<span class="submit-step-arrow" aria-hidden="true">${iconMarkup("arrow-right")}</span>` : ""}
    `).join("");

    elements.dynamicFields.innerHTML = renderModeFields(mode, draft, {
      tagOptions: state.tagOptions,
      tagPickerOpen: state.tagPickerOpen,
      tagQuery: state.tagQuery,
      tagHighlightIndex: state.tagHighlightIndex,
      selectedShow,
      searchResults: getShowMatches(state.shows, draft.showSearch),
      searchOpen: state.searchOpen,
    });

    elements.sideRail.innerHTML = config.railCards.map((card) => renderRailCard(card)).join("");
    elements.submitButtonText.textContent = config.submitLabel;
    elements.submitFooterNote.textContent = config.footerNote;
    elements.submitFooterNote.dataset.noteKind = "locked";

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
      return;
    }

    delete elements.submitStatus.dataset.state;
  }

  function updateTagSuggestionState(query, { highlightIndex = state.tagHighlightIndex } = {}) {
    state.tagQuery = query;
    const suggestions = getTagSuggestions(query, state.tagOptions, getActiveDraft(state).selectedTags);
    state.tagHighlightIndex = suggestions.length === 0
      ? -1
      : Math.max(-1, Math.min(highlightIndex, suggestions.length - 1));
  }

  function focusTagInput(selectionStart = 0) {
    const input = document.getElementById("submitTagInput");
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
      return;
    }

    const draft = getActiveDraft(state);
    const matches = getShowMatches(state.shows, draft.showSearch);
    container.hidden = false;
    container.innerHTML = renderSearchResultsMarkup(matches, draft.existingShowId, draft.showSearch);
  }
}
