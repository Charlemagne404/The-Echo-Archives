import { setChatOpen } from "../chat.js";
import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { getPublishedShows, loadShows } from "../data.js";
import { updateDocumentMetadata } from "../utils.js";
import { MODE_CONFIG, MODES_WITH_EXISTING_SHOW } from "../submit/config.js";
import {
  appendModeLinkRow,
  addArrayValue,
  createDraft,
  createDrafts,
  getActiveDraft,
  removeLinkRow,
  seedStateFromParams,
  toggleArrayValue,
} from "../submit/state.js";
import {
  buildTagOptions,
  getShowMatches,
  getTagSuggestions,
  normalizeCustomTag,
  renderSearchResultsMarkup,
  resolveTagSubmission,
} from "../submit/search.js";
import { validateDraft } from "../submit/validation.js";
import {
  buildPayload,
  getPendingCopy,
  getSuccessCopy,
  submitSubmission,
} from "../submit/api.js";
import {
  renderModeCardsMarkup,
  renderModeFields,
  renderRailCard,
} from "../submit/render.js";
import { escapeHtml, iconMarkup } from "../submit/utils.js";

export async function initializeSubmitPage() {
  updateDocumentMetadata({
    title: "Submit a Show - The Echo Archives",
    description: "Submit a show, send a correction, share a listener review, or verify facts for The Echo Archives.",
    path: "/submit.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });

  const elements = {
    form: document.getElementById("showSubmitForm"),
    submissionType: document.getElementById("submissionType"),
    existingShowId: document.getElementById("existingShowId"),
    heroDescription: document.getElementById("submitHeroDescription"),
    modeCards: document.getElementById("submitModeCards"),
    stepsPanel: document.getElementById("submitStepsPanel"),
    formIntro: document.getElementById("submitFormIntro"),
    dynamicFields: document.getElementById("submitDynamicFields"),
    sideRail: document.getElementById("submitSideRail"),
    submitButton: document.getElementById("submitPrimaryButton"),
    submitButtonText: document.getElementById("submitPrimaryButtonText"),
    submitFooterNote: document.getElementById("submitFooterNote"),
    submitStatus: document.getElementById("submitStatus"),
  };

  if (
    !(elements.form instanceof HTMLFormElement) ||
    !(elements.submissionType instanceof HTMLInputElement) ||
    !(elements.existingShowId instanceof HTMLInputElement) ||
    !(elements.heroDescription instanceof HTMLElement) ||
    !elements.modeCards ||
    !elements.stepsPanel ||
    !elements.formIntro ||
    !elements.dynamicFields ||
    !elements.sideRail ||
    !(elements.submitButton instanceof HTMLButtonElement) ||
    !elements.submitButtonText ||
    !elements.submitFooterNote ||
    !elements.submitStatus
  ) {
    return;
  }

  const shows = getPublishedShows(await loadShows()).sort((left, right) => left.title.localeCompare(right.title));
  const state = {
    activeMode: "show",
    searchOpen: false,
    tagPickerOpen: false,
    tagPickerPinned: false,
    tagQuery: "",
    tagHighlightIndex: -1,
    shows,
    showMap: new Map(shows.map((show) => [show.id, show])),
    tagOptions: buildTagOptions(shows),
    drafts: createDrafts(),
  };

  seedStateFromParams(state);
  renderAll();

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

    captureCurrentDraft();
    state.activeMode = nextMode;
    state.searchOpen = false;
    state.tagPickerOpen = false;
    state.tagPickerPinned = false;
    state.tagQuery = "";
    state.tagHighlightIndex = -1;
    setStatus("Nothing submitted yet.");
    renderAll();
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
      updateSearchResults();
    }

    const tagPicker = elements.form.querySelector("[data-tag-picker]");
    if (tagPicker && target instanceof Node && !tagPicker.contains(target) && state.tagPickerOpen) {
      state.tagPickerOpen = false;
      state.tagPickerPinned = false;
      state.tagHighlightIndex = -1;
      renderActiveMode();
    }
  });

  elements.form.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.id === "submitExistingShowSearch") {
      state.searchOpen = true;
      updateSearchResults();
      return;
    }

    if (target.id === "submitTagInput") {
      updateTagSuggestionState(target.value, { highlightIndex: -1 });
    }
  });

  elements.form.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return;
    }

    captureCurrentDraft();
    updateCounterFor(target.id, target.value.length);

    if (target.id === "submitExistingShowSearch") {
      const draft = getActiveDraft(state);
      draft.showSearch = target.value;
      const selectedShow = state.showMap.get(draft.existingShowId) || null;
      if (!selectedShow || selectedShow.title !== target.value.trim()) {
        draft.existingShowId = "";
      }
      state.searchOpen = true;
      syncHiddenInputs();
      syncQueryState();
      updateSearchResults();
      return;
    }

    if (target.id === "submitTagInput") {
      state.tagPickerOpen = state.tagPickerPinned || Boolean(target.value.trim());
      updateTagSuggestionState(target.value, { highlightIndex: -1 });
      renderActiveMode();
      focusTagInput(state.tagQuery.length);
    }
  });

  elements.form.addEventListener("change", (event) => {
    const target = event.target;
    captureCurrentDraft();
    syncHiddenInputs();

    if (target instanceof HTMLSelectElement && target.matches("[data-link-part=\"label\"]")) {
      renderActiveMode();
    }
  });

  elements.form.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.id !== "submitTagInput") {
      return;
    }

    const draft = getActiveDraft(state);
    const suggestions = getTagSuggestions(state.tagQuery, state.tagOptions, draft.selectedTags);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.tagPickerPinned = true;
      state.tagPickerOpen = true;
      state.tagHighlightIndex = suggestions.length === 0
        ? -1
        : state.tagHighlightIndex < 0
          ? 0
          : Math.min(state.tagHighlightIndex + 1, suggestions.length - 1);
      renderActiveMode();
      focusTagInput(state.tagQuery.length);
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
      renderActiveMode();
      focusTagInput(state.tagQuery.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const highlightedSuggestion = state.tagHighlightIndex >= 0 ? suggestions[state.tagHighlightIndex] : "";
      const nextTag = resolveTagSubmission(state.tagQuery, highlightedSuggestion, state.tagOptions);
      if (!nextTag) {
        return;
      }

      addArrayValue(draft, "selectedTags", nextTag, 8);
      state.tagPickerPinned = false;
      state.tagPickerOpen = false;
      updateTagSuggestionState("", { highlightIndex: -1 });
      renderActiveMode();
      focusTagInput();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      state.tagPickerOpen = false;
      state.tagPickerPinned = false;
      state.tagHighlightIndex = -1;
      renderActiveMode();
      return;
    }

    if (event.key === "Backspace" && !state.tagQuery) {
      const nextTags = Array.isArray(draft.selectedTags) ? [...draft.selectedTags] : [];
      nextTags.pop();
      draft.selectedTags = nextTags;
      state.tagPickerOpen = state.tagPickerPinned || Boolean(state.tagQuery.trim());
      renderActiveMode();
      focusTagInput();
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
      captureCurrentDraft();
      const field = chip.getAttribute("data-chip-field");
      const value = chip.getAttribute("data-chip-value");
      if (field && value) {
        toggleArrayValue(getActiveDraft(state), field, value);
        renderActiveMode();
      }
      return;
    }

    const tagSuggestion = target.closest("[data-tag-suggestion]");
    if (tagSuggestion) {
      event.preventDefault();
      event.stopPropagation();
      const value = tagSuggestion.getAttribute("data-tag-suggestion");
      if (value) {
        addArrayValue(getActiveDraft(state), "selectedTags", value, 8);
        state.tagPickerPinned = false;
        state.tagPickerOpen = false;
        updateTagSuggestionState("", { highlightIndex: -1 });
        renderActiveMode();
        focusTagInput();
      }
      return;
    }

    const createTag = target.closest("[data-create-tag]");
    if (createTag) {
      event.preventDefault();
      event.stopPropagation();
      const value = normalizeCustomTag(createTag.getAttribute("data-create-tag"));
      if (value) {
        addArrayValue(getActiveDraft(state), "selectedTags", value, 8);
        state.tagPickerPinned = false;
        state.tagPickerOpen = false;
        updateTagSuggestionState("", { highlightIndex: -1 });
        renderActiveMode();
        focusTagInput();
      }
      return;
    }

    const tagPickerToggle = target.closest("[data-toggle-tag-picker]");
    if (tagPickerToggle) {
      event.preventDefault();
      event.stopPropagation();
      state.tagPickerPinned = !state.tagPickerPinned;
      state.tagPickerOpen = state.tagPickerPinned || Boolean(state.tagQuery.trim());
      state.tagHighlightIndex = -1;
      renderActiveMode();
      if (state.tagPickerOpen) {
        focusTagInput(state.tagQuery.length);
      }
      return;
    }

    const segment = target.closest("[data-segment-field]");
    if (segment) {
      event.preventDefault();
      captureCurrentDraft();
      const field = segment.getAttribute("data-segment-field");
      const value = segment.getAttribute("data-segment-value");
      if (field && value) {
        getActiveDraft(state)[field] = value;
        renderActiveMode();
      }
      return;
    }

    const star = target.closest("[data-rating-stars]");
    if (star) {
      event.preventDefault();
      captureCurrentDraft();
      const nextValue = Number.parseInt(star.getAttribute("data-rating-stars") || "", 10);
      if (Number.isInteger(nextValue) && nextValue >= 1 && nextValue <= 5) {
        getActiveDraft(state).ratingStars = nextValue;
        renderActiveMode();
      }
      return;
    }

    const addRow = target.closest("[data-add-link]");
    if (addRow) {
      event.preventDefault();
      captureCurrentDraft();
      const field = addRow.getAttribute("data-add-link");
      if (field) {
        appendModeLinkRow(getActiveDraft(state), field);
        renderActiveMode();
      }
      return;
    }

    const removeRow = target.closest("[data-remove-link]");
    if (removeRow) {
      event.preventDefault();
      captureCurrentDraft();
      const field = removeRow.getAttribute("data-remove-link");
      const index = Number.parseInt(removeRow.getAttribute("data-link-index") || "", 10);
      if (field && Number.isInteger(index)) {
        removeLinkRow(getActiveDraft(state), field, index);
        renderActiveMode();
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
      syncHiddenInputs();
      syncQueryState();
      renderActiveMode();
    }
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    captureCurrentDraft();

    const mode = state.activeMode;
    const modeConfig = MODE_CONFIG[mode];
    const draft = getActiveDraft(state);
    const validationError = validateDraft(mode, draft, state.showMap);
    if (validationError) {
      setStatus(validationError, "error");
      return;
    }

    const payload = buildPayload(mode, draft, state.showMap);
    elements.submitButton.disabled = true;
    elements.submitButtonText.textContent = "Submitting...";
    setStatus(getPendingCopy(mode), "pending");

    try {
      await submitSubmission(payload);
      state.drafts[mode] = createDraft(mode);
      state.searchOpen = false;
      renderAll();
      setStatus(getSuccessCopy(mode), "success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Submission failed. Try again.", "error");
    } finally {
      elements.submitButton.disabled = false;
      elements.submitButtonText.textContent = modeConfig.submitLabel;
    }
  });

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

  function captureCurrentDraft() {
    const draft = getActiveDraft(state);
    const currentMode = state.activeMode;

    if (MODES_WITH_EXISTING_SHOW.has(currentMode)) {
      draft.showSearch = readValue("submitExistingShowSearch");
    }

    switch (currentMode) {
      case "show":
        draft.showTitle = readValue("submitShowTitle");
        draft.creatorName = readValue("submitCreatorName");
        draft.contactEmail = readValue("submitContactEmail");
        draft.officialSite = readValue("submitOfficialSite");
        draft.completionStatus = readValue("submitCompletionStatus");
        draft.shortDescription = readValue("submitShortDescription");
        draft.archiveFitNote = readValue("submitArchiveFitNote");
        draft.verificationNotes = readValue("submitVerificationNotes");
        draft.listenLinks = readLinkRows("listenLinks", false);
        break;
      case "correction":
        draft.contactEmail = readValue("submitContactEmail");
        draft.correctionType = readValue("submitCorrectionType");
        draft.issueDescription = readValue("submitIssueDescription");
        draft.correctedInformation = readValue("submitCorrectedInformation");
        draft.optionalNotes = readValue("submitCorrectionNotes");
        draft.sourceLinks = readLinkRows("sourceLinks", true);
        break;
      case "listener-review":
        draft.reviewTitle = readValue("submitReviewTitle");
        draft.reviewText = readValue("submitReviewText");
        draft.whoWouldLikeThis = readValue("submitWhoWouldLikeThis");
        draft.similarShows = readValue("submitSimilarShows");
        draft.alias = readValue("submitAlias");
        draft.contactEmail = readValue("submitContactEmail");
        break;
      case "creator-verification":
        draft.creatorName = readValue("submitCreatorName");
        draft.role = readValue("submitRole");
        draft.officialSite = readValue("submitOfficialSite");
        draft.proofUrl = readValue("submitProofUrl");
        draft.requestedUpdates = readValue("submitRequestedUpdates");
        draft.preferredDescription = readValue("submitPreferredDescription");
        draft.optionalNotes = readValue("submitVerificationNotes");
        draft.officialLinks = readLinkRows("officialLinks", false);
        break;
      default:
        break;
    }
  }

  function readValue(id) {
    const field = document.getElementById(id);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      return field.value.trim();
    }

    return "";
  }

  function readLinkRows(fieldName, plain) {
    const urlInputs = Array.from(elements.form.querySelectorAll(`[data-link-list="${fieldName}"][data-link-part="url"]`));
    const labelInputs = plain
      ? []
      : Array.from(elements.form.querySelectorAll(`[data-link-list="${fieldName}"][data-link-part="label"]`));

    return urlInputs.map((node, index) => {
      const url = node instanceof HTMLInputElement ? node.value.trim() : "";
      const labelNode = labelInputs[index];
      const label = labelNode instanceof HTMLSelectElement ? labelNode.value.trim() : "";
      return plain ? { url } : { label, url };
    });
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
