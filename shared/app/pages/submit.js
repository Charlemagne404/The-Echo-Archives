import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { getPublishedShows, loadSearchIndex } from "../data.js";
import { updateDocumentMetadata } from "../utils.js";
import {
  MODES_WITH_EXISTING_SHOW,
  FALLBACK_TAG_OPTIONS,
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
import { buildPayload, getPendingCopy, getSuccessCopy, loadShowContext, submitSubmission } from "../submit/api.js";
import { bindSubmitPageClickHandlers } from "./submit/click-handlers.js";
import { captureCurrentDraft } from "./submit/draft.js";
import { getSubmitElements } from "./submit/elements.js";
import { createSubmitUiController } from "./submit/ui.js";

export async function initializeSubmitPage() {
  updateDocumentMetadata({
    title: "Submit a Show - The Echo Archives",
    description: "Submit a show, send a correction, share a listener review, or verify facts for The Echo Archives.",
    path: "/submit",
    image: DEFAULT_SOCIAL_IMAGE,
  });

  const elements = getSubmitElements();
  if (!elements) {
    return;
  }

  const state = {
    activeMode: "show",
    searchOpen: false,
    tagPickerOpen: false,
    tagPickerPinned: false,
    activeTagField: "selectedTags",
    tagQuery: "",
    tagHighlightIndex: -1,
    showHighlightIndex: -1,
    shows: [],
    showMap: new Map(),
    lookupStatus: "idle",
    lookupMessage: "Archive lookup loads only when this submission path needs it.",
    lookupPromise: null,
    requestedShowId: "",
    showContexts: new Map(),
    showContextStatuses: new Map(),
    showContextMessages: new Map(),
    showContextTokens: new Map(),
    tagFieldOptions: {
      selectedTags: [...FALLBACK_TAG_OPTIONS],
      bestFor: REVIEW_CONTEXT_OPTIONS,
      workedBest: REVIEW_STRENGTH_OPTIONS,
    },
    drafts: createDrafts(),
  };
  const ui = createSubmitUiController({ state, elements });
  const renderPreservingFocus = ({ capture = true } = {}) => {
    if (capture) {
      captureCurrentDraft(state, elements);
    }
    const activeElement = document.activeElement;
    const activeId = activeElement instanceof HTMLElement ? activeElement.id : "";
    const activeSelector = activeElement instanceof HTMLElement
      ? activeElement.matches("summary") && activeElement.parentElement?.id
        ? `#${activeElement.parentElement.id} > summary`
        : activeElement.dataset.segmentField && activeElement.dataset.segmentValue
          ? `[data-segment-field="${activeElement.dataset.segmentField}"][data-segment-value="${activeElement.dataset.segmentValue}"]`
          : activeElement.dataset.ratingStars
            ? `[data-rating-stars="${activeElement.dataset.ratingStars}"]`
            : activeElement.dataset.categoryScore && activeElement.dataset.categoryScoreValue
              ? `[data-category-score="${activeElement.dataset.categoryScore}"][data-category-score-value="${activeElement.dataset.categoryScoreValue}"]`
              : ""
      : "";
    const selectionStart = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
      ? activeElement.selectionStart
      : null;
    const selectionEnd = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
      ? activeElement.selectionEnd
      : null;

    ui.renderAll();
    if (!activeId && !activeSelector) return;
    window.requestAnimationFrame(() => {
      const nextActiveElement = activeId ? document.getElementById(activeId) : document.querySelector(activeSelector);
      if (!(nextActiveElement instanceof HTMLElement)) return;
      nextActiveElement.focus();
      if (
        (nextActiveElement instanceof HTMLInputElement || nextActiveElement instanceof HTMLTextAreaElement) &&
        selectionStart !== null && selectionEnd !== null
      ) {
        nextActiveElement.setSelectionRange(selectionStart, selectionEnd);
      }
    });
  };

  const initialParams = seedStateFromParams(state);
  state.requestedShowId = initialParams?.requestedShowId || "";
  ui.renderAll();
  const ensureLookup = async ({ force = false, focusSearch = false } = {}) => {
    if (state.lookupStatus === "ready") {
      if (focusSearch && MODES_WITH_EXISTING_SHOW.has(state.activeMode)) {
        ui.focusExistingShowSearch(getActiveDraft(state).showSearch.length);
      }
      return state.shows;
    }

    if (state.lookupPromise && !force) {
      return state.lookupPromise;
    }

    state.lookupStatus = "loading";
    state.lookupMessage = "Loading the archive show index…";
    state.searchOpen = false;
    state.showHighlightIndex = -1;
    ui.renderAll();

    state.lookupPromise = loadSearchIndex()
      .then((records) => {
        const shows = getPublishedShows(records).sort((left, right) => left.title.localeCompare(right.title));
        state.shows = shows;
        state.showMap = new Map(shows.map((show) => [show.id, show]));
        state.tagFieldOptions.selectedTags = buildTagOptions(shows);
        state.lookupStatus = "ready";
        state.lookupMessage = "";
        seedStateFromParams(state);
        state.requestedShowId = "";
        ui.renderAll();
        if (focusSearch && MODES_WITH_EXISTING_SHOW.has(state.activeMode)) {
          ui.focusExistingShowSearch(getActiveDraft(state).showSearch.length);
        }
        return shows;
      })
      .catch((error) => {
        state.lookupStatus = "error";
        state.lookupMessage = "Archive lookup is temporarily unavailable. Retry here, or use the new-show path now.";
        ui.renderAll();
        throw error;
      })
      .finally(() => {
        state.lookupPromise = null;
      });

    return state.lookupPromise;
  };
  const ensureShowContext = async (showId) => {
    if (!showId || state.showContexts.has(showId)) {
      return state.showContexts.get(showId) || null;
    }
    const nextToken = (state.showContextTokens.get(showId) || 0) + 1;
    state.showContextTokens.set(showId, nextToken);
    state.showContextStatuses.set(showId, "loading");
    state.showContextMessages.delete(showId);
    renderPreservingFocus();
    try {
      const context = await loadShowContext(showId);
      if (state.showContextTokens.get(showId) !== nextToken) return null;
      captureCurrentDraft(state, elements);
      state.showContexts.set(showId, context);
      state.showContextStatuses.set(showId, "ready");
      const verificationDraft = state.drafts["creator-verification"];
      if (verificationDraft.existingShowId === showId && !verificationDraft.creatorName && context.creators?.length) {
        verificationDraft.creatorName = context.creators.join(", ");
      }
      renderPreservingFocus({ capture: false });
      return context;
    } catch (_error) {
      if (state.showContextTokens.get(showId) !== nextToken) return null;
      state.showContextStatuses.set(showId, "error");
      state.showContextMessages.set(showId, "Current archive details could not be loaded. You can still submit for the selected show.");
      renderPreservingFocus();
      return null;
    }
  };
  bindSubmitPageClickHandlers({ state, elements, ui, ensureLookup, ensureShowContext });

  if (MODES_WITH_EXISTING_SHOW.has(initialParams?.requestedMode)) {
    try {
      await ensureLookup();
      const selectedShowId = getActiveDraft(state).existingShowId;
      if (selectedShowId) await ensureShowContext(selectedShowId);
    } catch (_error) {
      // The dependent form owns its retry surface; the new-show path stays usable.
    }
  }

  elements.form.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.id === "submitExistingShowSearch") {
      if (state.lookupStatus !== "ready") {
        return;
      }
      state.searchOpen = true;
      state.showHighlightIndex = -1;
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

    ui.clearValidationErrors();
    if (elements.submitStatus.dataset.state === "error") {
      ui.setStatus("");
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
      state.showHighlightIndex = -1;
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
    ui.clearValidationErrors();
    if (elements.submitStatus.dataset.state === "error") {
      ui.setStatus("");
    }
    captureCurrentDraft(state, elements);
    ui.syncHiddenInputs();

    if (target instanceof HTMLSelectElement && target.matches("[data-link-part=\"label\"]")) {
      ui.renderAll();
      return;
    }

    if (target instanceof HTMLSelectElement && ["submitCorrectionType", "submitLinkAction"].includes(target.id)) {
      const targetId = target.id;
      ui.renderAll();
      window.requestAnimationFrame(() => document.getElementById(targetId)?.focus());
    }
  });

  elements.form.addEventListener("toggle", (event) => {
    if (event.target instanceof HTMLDetailsElement) {
      captureCurrentDraft(state, elements);
    }
  }, true);

  elements.form.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement && target.matches("[data-segment-field]")) {
      const field = target.getAttribute("data-segment-field");
      const group = target.closest('[role="radiogroup"]');
      const buttons = field && group ? Array.from(group.querySelectorAll(`[data-segment-field="${field}"]`)) : [];
      const currentIndex = buttons.indexOf(target);
      const keyMoves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      let nextIndex = currentIndex;
      if (Object.prototype.hasOwnProperty.call(keyMoves, event.key)) {
        nextIndex = (currentIndex + keyMoves[event.key] + buttons.length) % buttons.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = buttons.length - 1;
      } else {
        return;
      }

      if (!field || currentIndex < 0 || nextIndex < 0) return;
      event.preventDefault();
      captureCurrentDraft(state, elements);
      const value = buttons[nextIndex].getAttribute("data-segment-value");
      if (!value) return;
      getActiveDraft(state)[field] = value;
      ui.renderAll();
      window.requestAnimationFrame(() => document.querySelector(`[data-segment-field="${field}"][data-segment-value="${value}"]`)?.focus());
      return;
    }

    if (target instanceof HTMLButtonElement && target.matches("[data-rating-stars], [data-category-score]")) {
      const isStarRating = target.hasAttribute("data-rating-stars");
      const group = target.closest('[role="radiogroup"]');
      const selector = isStarRating ? "[data-rating-stars]" : "[data-category-score]";
      const buttons = group ? Array.from(group.querySelectorAll(selector)) : [];
      const currentIndex = buttons.indexOf(target);
      const keyMoves = {
        ArrowRight: 1,
        ArrowDown: 1,
        ArrowLeft: -1,
        ArrowUp: -1,
      };
      let nextIndex = currentIndex;
      if (Object.prototype.hasOwnProperty.call(keyMoves, event.key)) {
        nextIndex = (currentIndex + keyMoves[event.key] + buttons.length) % buttons.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = buttons.length - 1;
      } else {
        return;
      }

      if (currentIndex < 0 || nextIndex < 0) return;
      event.preventDefault();
      captureCurrentDraft(state, elements);
      const nextButton = buttons[nextIndex];
      if (isStarRating) {
        const value = Number.parseInt(nextButton.getAttribute("data-rating-stars") || "", 10);
        getActiveDraft(state).ratingStars = value;
        ui.renderAll();
        window.requestAnimationFrame(() => document.querySelector(`[data-rating-stars="${value}"]`)?.focus());
      } else {
        const key = nextButton.getAttribute("data-category-score");
        const value = Number.parseInt(nextButton.getAttribute("data-category-score-value") || "", 10);
        if (!key) return;
        const draft = getActiveDraft(state);
        draft.categoryScores = { ...(draft.categoryScores || {}), [key]: value };
        ui.renderAll();
        window.requestAnimationFrame(() => document.querySelector(`[data-category-score="${key}"][data-category-score-value="${value}"]`)?.focus());
      }
      return;
    }

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.id === "submitExistingShowSearch") {
      if (state.lookupStatus !== "ready") {
        return;
      }

      const draft = getActiveDraft(state);
      const matches = getShowMatches(state.shows, draft.showSearch).slice(0, 7);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        state.searchOpen = true;
        if (matches.length === 0) {
          state.showHighlightIndex = -1;
        } else if (event.key === "ArrowDown") {
          state.showHighlightIndex = state.showHighlightIndex < 0
            ? 0
            : (state.showHighlightIndex + 1) % matches.length;
        } else {
          state.showHighlightIndex = state.showHighlightIndex <= 0
            ? matches.length - 1
            : state.showHighlightIndex - 1;
        }
        ui.updateSearchResults();
        return;
      }

      if (event.key === "Enter" && state.searchOpen && state.showHighlightIndex >= 0) {
        const selectedShow = matches[state.showHighlightIndex];
        if (selectedShow) {
          event.preventDefault();
          draft.existingShowId = selectedShow.id;
          draft.showSearch = selectedShow.title;
          state.searchOpen = false;
          state.showHighlightIndex = -1;
          ui.renderAll();
          void ensureShowContext(selectedShow.id);
          ui.focusExistingShowSearch(draft.showSearch.length);
        }
        return;
      }

      if (event.key === "Escape" && state.searchOpen) {
        event.preventDefault();
        state.searchOpen = false;
        state.showHighlightIndex = -1;
        ui.updateSearchResults();
      }
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
    const draft = getActiveDraft(state);
    const validationError = validateDraft(mode, draft, state.showMap);
    if (validationError) {
      ui.showValidationError(validationError);
      return;
    }

    ui.clearValidationErrors();
    const payload = buildPayload(mode, draft, state.showMap);
    const pendingCopy = getPendingCopy(mode);
    ui.setPending(true, mode, pendingCopy);
    ui.setStatus(pendingCopy, "pending");

    try {
      await submitSubmission(payload);
      state.drafts[mode] = createDraft(mode);
      state.searchOpen = false;
      const successMessage = getSuccessCopy(mode);
      ui.showSuccess(successMessage, mode);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Submission failed. Try again.";
      ui.setStatus(errorMessage, "error");
      elements.submitStatus.setAttribute("tabindex", "-1");
      elements.submitStatus.focus();
    } finally {
      ui.setPending(false, mode);
    }
  });

  elements.resultPanel.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-submit-another]")) return;
    ui.showForm();
    ui.focusFirstField();
  });
}
