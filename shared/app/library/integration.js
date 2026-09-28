import { getShowIdFromLocation } from "../urls.js";
import { announceStorageFailure, bindLibraryActions } from "./actions.js";
import { STATE_LABELS, STATE_ORDER } from "./constants.js";
import {
  getLibraryService,
  getLibraryRuntimeState,
  initializeLibraryRuntime,
  refreshLibraryRuntime,
  subscribeToLibraryRuntime,
} from "./runtime.js";

const library = getLibraryService();
let observer = null;

function makeElement(tagName, className = "", text = "") {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function getEntryTitle(anchor, showId) {
  const card = anchor.closest(".podcast-card-shell, .popular-card-shell, .detail-similar-card");
  const heading = card?.querySelector("h2, h3, h4, [data-card-title]")
    || anchor.closest(".detail-card-copy")?.querySelector("h2, h3, h4");
  const title = heading?.textContent?.trim()
    || anchor.getAttribute("aria-label")?.replace(/^Open\s+/i, "").replace(/\s+in the archive$/i, "").trim();
  return title || showId;
}

function makeStatusNode() {
  return makeElement("span", "library-control-status");
}

function createCardControl(showId, title, relationship = false) {
  const details = makeElement("details", `library-card-control${relationship ? " is-relationship-control" : ""}`);
  details.dataset.libraryShowId = showId;
  details.dataset.libraryControl = "card";
  const summary = makeElement("summary", "library-card-summary", "+ Library");
  summary.setAttribute("aria-label", `Manage ${title} in your Library`);
  details.append(summary);

  const panel = makeElement("div", "library-card-panel");
  const heading = makeElement("p", "library-card-panel-heading", "Library state");
  const group = makeElement("div", "library-card-state-options");
  group.setAttribute("aria-label", `Choose a Library state for ${title}`);
  STATE_ORDER.forEach((state) => {
    const button = makeElement("button", "library-card-state-option", STATE_LABELS[state]);
    button.type = "button";
    button.dataset.libraryStateAction = state;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `${title}: set Library state to ${STATE_LABELS[state]}`);
    group.append(button);
  });
  const remove = makeElement("button", "library-card-remove", "Remove from Library");
  remove.type = "button";
  remove.dataset.libraryRemove = showId;
  remove.hidden = true;
  const status = makeStatusNode();
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  panel.append(heading, group, remove, status);
  details.append(panel);
  return details;
}

function appendDetailStateOptions(select, currentState) {
  select.replaceChildren();
  const prompt = makeElement("option", "", currentState ? STATE_LABELS[currentState] : "Choose a Library state");
  prompt.value = currentState || "";
  prompt.disabled = !currentState;
  prompt.selected = true;
  select.append(prompt);
  STATE_ORDER.forEach((state) => {
    const option = makeElement("option", "", STATE_LABELS[state]);
    option.value = state;
    select.append(option);
  });
}

function createDetailControl(showId, title) {
  const section = makeElement("section", "library-detail-control");
  section.dataset.libraryShowId = showId;
  section.dataset.libraryTitle = title;
  section.dataset.libraryControl = "detail";
  section.setAttribute("aria-label", `${title} in your Listener Library`);
  const heading = makeElement("h2", "library-detail-heading", "Your Listener Library");
  const stateLabel = makeElement("label", "library-detail-field");
  stateLabel.append(makeElement("span", "", "Library state"));
  const stateSelect = makeElement("select", "library-detail-state");
  stateSelect.dataset.libraryStateSelect = showId;
  stateSelect.setAttribute("aria-label", `Library state for ${title}`);
  appendDetailStateOptions(stateSelect, "");
  stateLabel.append(stateSelect);

  const ratingLabel = makeElement("label", "library-detail-field");
  ratingLabel.append(makeElement("span", "", "Your private rating"));
  const rating = makeElement("select", "library-detail-rating");
  rating.dataset.libraryRatingSelect = showId;
  rating.setAttribute("aria-label", `Your private rating for ${title}`);
  const noRating = makeElement("option", "", "No private rating");
  noRating.value = "";
  rating.append(noRating);
  for (let value = 1; value <= 5; value += 1) {
    const option = makeElement("option", "", `${value} of 5 stars`);
    option.value = String(value);
    rating.append(option);
  }
  ratingLabel.append(rating);

  const remove = makeElement("button", "library-detail-remove", "Remove from Library");
  remove.type = "button";
  remove.dataset.libraryRemove = showId;
  remove.hidden = true;
  const note = makeElement("p", "library-detail-rating-note", "Your private rating is stored only in this browser. It never submits a Community Rating.");
  const hiddenNote = makeElement("p", "library-hidden-meaning", "Hidden affects only this exact show in Personal Discovery when that integration is active. It does not change the catalogue, ordinary browsing, or direct access to this show.");
  const status = makeStatusNode();
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  section.append(heading, stateLabel, ratingLabel, note, remove, hiddenNote, status);
  return section;
}

function renderControlState(control, runtimeState) {
  const showId = control.dataset.libraryShowId;
  const entry = runtimeState.entriesById?.get(showId) || null;
  const title = control.dataset.libraryTitle || showId;
  const unavailable = runtimeState.loading || !runtimeState.storageAvailable || runtimeState.entries === null;
  if (control.dataset.libraryControl === "card") {
    const summary = control.querySelector("summary");
    const statusText = !runtimeState.storageAvailable && !runtimeState.loading
      ? "Local saving unavailable"
      : runtimeState.entries === null && !runtimeState.loading
        ? "Library needs recovery"
        : entry ? STATE_LABELS[entry.state] : "+ Library";
    summary.textContent = statusText;
    summary.setAttribute("aria-label", unavailable
      ? `${title}: local Library saving is unavailable`
      : entry ? `Manage ${title} in your Library. Current state: ${STATE_LABELS[entry.state]}.` : `Add ${title} to your Library`);
    summary.setAttribute("aria-disabled", String(unavailable));
    summary.tabIndex = 0;
    control.querySelectorAll("[data-library-state-action]").forEach((button) => {
      const state = button.dataset.libraryStateAction;
      button.disabled = unavailable;
      button.setAttribute("aria-pressed", String(entry?.state === state));
    });
    const remove = control.querySelector("[data-library-remove]");
    remove.hidden = !entry;
    remove.disabled = unavailable;
    const status = control.querySelector(".library-control-status");
    if (unavailable && !runtimeState.loading) {
      status.textContent = runtimeState.error?.message
        ? `Local Library unavailable: ${runtimeState.error.message}`
        : "Local Library saving is unavailable in this browser.";
      status.dataset.tone = "error";
    } else if (unavailable && runtimeState.loading) {
      status.textContent = "Checking local Library storage.";
      status.dataset.tone = "";
    } else {
      status.textContent = "";
      status.dataset.tone = "";
    }
    if (entry?.state === "hidden") control.dataset.libraryHidden = "true";
    else delete control.dataset.libraryHidden;
    return;
  }

  const stateSelect = control.querySelector("[data-library-state-select]");
  appendDetailStateOptions(stateSelect, entry?.state || "");
  stateSelect.disabled = unavailable;
  const ratingSelect = control.querySelector("[data-library-rating-select]");
  ratingSelect.value = entry && Object.hasOwn(entry, "rating") ? String(entry.rating) : "";
  ratingSelect.disabled = unavailable || !entry;
  const remove = control.querySelector("[data-library-remove]");
  remove.hidden = !entry;
  remove.disabled = unavailable;
  control.dataset.libraryCurrentState = entry?.state || "";
}

function findCardHosts(anchor) {
  const showId = anchor.dataset.discoveryShowId;
  if (!showId) return [];
  const shell = anchor.closest(".podcast-card-shell, .popular-card-shell");
  if (shell) return [{ host: shell, relationship: false }];
  const relationshipCopy = anchor.closest(".detail-similar-card")?.querySelector(".detail-card-copy");
  if (relationshipCopy) return [{ host: relationshipCopy, relationship: true }];
  return [];
}

function ensureCardControls() {
  const runtimeState = getLibraryRuntimeState();
  document.querySelectorAll("a[data-discovery-show-id]").forEach((anchor) => {
    const showId = anchor.dataset.discoveryShowId;
    findCardHosts(anchor).forEach(({ host, relationship }) => {
      if (host.querySelector(`:scope > [data-library-control="card"][data-library-show-id="${CSS.escape(showId)}"]`)) return;
      const control = createCardControl(showId, getEntryTitle(anchor, showId), relationship);
      control.dataset.libraryTitle = getEntryTitle(anchor, showId);
      host.append(control);
      host.classList.add("library-card-host");
      renderControlState(control, runtimeState);
    });
  });
}

function ensureDetailControl() {
  const currentState = getLibraryRuntimeState();
  const showId = getShowIdFromLocation();
  const actions = document.querySelector(".podcast-detail .detail-actions");
  if (!showId || !actions) return;
  let control = actions.parentElement.querySelector(":scope > [data-library-control=detail]");
  if (!control) {
    const title = document.querySelector(".podcast-detail .detail-title-group h1")?.textContent?.trim() || showId;
    control = createDetailControl(showId, title);
    actions.insertAdjacentElement("afterend", control);
  }
  renderControlState(control, currentState);
}

function renderAllControls(runtimeState = getLibraryRuntimeState()) {
  ensureCardControls();
  document.querySelectorAll("[data-library-control]").forEach((control) => renderControlState(control, runtimeState));
  ensureDetailControl();
}

function initMutationObserver() {
  if (observer || !document.body) return;
  const subtreeHas = (node, selector) => {
    if (!(node instanceof Element) && !(node instanceof DocumentFragment)) return false;
    return (node instanceof Element && node.matches(selector)) || Boolean(node.querySelector(selector));
  };
  observer = new MutationObserver((records) => {
    const addedNodes = records.flatMap((record) => [...record.addedNodes]);
    if (addedNodes.some((node) => subtreeHas(node, "a[data-discovery-show-id]"))) {
      ensureCardControls();
    }
    if (addedNodes.some((node) => subtreeHas(node, ".podcast-detail .detail-actions"))) {
      ensureDetailControl();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export async function initializeLibraryIntegration() {
  if (document.documentElement.dataset.listenerLibraryBound === "true") return;
  document.documentElement.dataset.listenerLibraryBound = "true";
  const status = makeElement("p", "visually-hidden", "");
  status.id = "libraryGlobalStatus";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  document.body.append(status);

  bindLibraryActions({ library, getRuntimeState: getLibraryRuntimeState, refreshRuntime: refreshLibraryRuntime });
  renderAllControls();
  subscribeToLibraryRuntime((runtimeState) => {
    renderAllControls(runtimeState);
    announceStorageFailure(runtimeState);
  });
  initMutationObserver();

  if (document.getElementById("listenerLibraryApp")) {
    void import("../pages/library.js").then(({ initializeLibraryPage }) => initializeLibraryPage({
      library,
      runtime: { getState: getLibraryRuntimeState, subscribe: subscribeToLibraryRuntime },
      refreshRuntime: refreshLibraryRuntime,
    }));
  }
  await initializeLibraryRuntime();
}
