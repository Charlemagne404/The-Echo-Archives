import { getShowIdFromLocation } from "../urls.js";
import { archiveSimilarity } from "../constants.js";
import { loadCollections, loadShows } from "../data.js";
import { createPersonalDiscoveryPersonalizer } from "../discovery-personalization.js";
import { formatRouteExpansion } from "../utils.js";
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
let personalDiscoveryDataPromise = null;
let personalPresentationGeneration = 0;
let pendingPersonalDiscoveryValue;
const recommendationGroupBaselines = new WeakMap();
const noAnchorPersonalizer = createPersonalDiscoveryPersonalizer({
  similarityIndex: { getPublicSimilarityMatches: () => [] },
  scope: "try-next",
});

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
  const summary = makeElement("summary", "library-card-summary", "Save");
  summary.setAttribute("aria-label", `Manage ${title} in your Library`);
  details.append(summary);

  const panel = makeElement("div", "library-card-panel");
  const stateLabel = makeElement("label", "library-card-field");
  stateLabel.append(makeElement("span", "", "Library status"));
  const stateSelect = makeElement("select", "library-card-state");
  stateSelect.dataset.libraryStateSelect = showId;
  stateSelect.setAttribute("aria-label", `Library status for ${title}`);
  appendDetailStateOptions(stateSelect, "");
  stateLabel.append(stateSelect);
  const remove = makeElement("button", "library-card-remove", "Remove from Library");
  remove.type = "button";
  remove.dataset.libraryRemove = showId;
  remove.hidden = true;
  const status = makeStatusNode();
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  panel.append(stateLabel, remove, status);
  details.append(panel);
  return details;
}

function appendDetailStateOptions(select, currentState) {
  select.replaceChildren();
  const prompt = makeElement("option", "", currentState ? STATE_LABELS[currentState] : "Choose a state");
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
  const section = makeElement("details", "library-detail-control");
  section.dataset.libraryShowId = showId;
  section.dataset.libraryTitle = title;
  section.dataset.libraryControl = "detail";
  section.setAttribute("aria-label", `${title} in your Listener Library`);
  const summary = makeElement("summary", "library-detail-summary", "Save to Library");
  section.append(summary);
  const panel = makeElement("div", "library-detail-panel");
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

  const preference = makeElement("label", "library-personal-discovery-setting");
  const preferenceInput = document.createElement("input");
  preferenceInput.type = "checkbox";
  preferenceInput.dataset.libraryDiscoveryPreference = "true";
  preferenceInput.setAttribute("aria-label", "Use my Library in discovery");
  const preferenceCopy = makeElement("span", "library-personal-discovery-copy", "Use my Library in discovery");
  preference.append(preferenceInput, preferenceCopy);
  const preferenceHelp = makeElement("p", "library-personal-discovery-help", "Uses your Library states and private ratings.");
  preferenceHelp.id = `library-discovery-help-${showId}`;
  preferenceInput.setAttribute("aria-describedby", preferenceHelp.id);

  const remove = makeElement("button", "library-detail-remove", "Remove from Library");
  remove.type = "button";
  remove.dataset.libraryRemove = showId;
  remove.hidden = true;
  const note = makeElement("p", "library-detail-rating-note", "Private to this browser; never submitted as a Community Rating.");
  const hiddenNote = makeElement("p", "library-hidden-meaning", "With Personal Discovery on, Hidden removes this show from your results; its page stays available.");
  hiddenNote.hidden = true;
  const status = makeStatusNode();
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  panel.append(stateLabel, ratingLabel, note, preference, preferenceHelp, remove, hiddenNote, status);
  section.append(panel);
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
      ? "Unavailable"
      : runtimeState.entries === null && !runtimeState.loading
        ? "Recovery needed"
        : entry ? (entry.state === "hidden" ? "Hidden" : STATE_LABELS[entry.state]) : "Save";
    summary.textContent = statusText;
    summary.setAttribute("aria-label", unavailable
      ? `${title}: local Library saving is unavailable`
      : entry ? `Manage ${title} in your Library. Current state: ${STATE_LABELS[entry.state]}.` : `Add ${title} to your Library`);
    summary.setAttribute("aria-disabled", String(unavailable));
    summary.tabIndex = 0;
    const stateSelect = control.querySelector("[data-library-state-select]");
    appendDetailStateOptions(stateSelect, entry?.state || "");
    stateSelect.disabled = unavailable;
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
  const preference = control.querySelector("[data-library-discovery-preference]");
  const preferencePending = pendingPersonalDiscoveryValue !== undefined;
  preference.checked = preferencePending
    ? pendingPersonalDiscoveryValue
    : runtimeState.personalContext?.enabled === true && !runtimeState.loading;
  preference.disabled = unavailable || Boolean(runtimeState.personalDiscoveryError) || preferencePending;
  preference.setAttribute("aria-describedby", `library-discovery-help-${showId}`);
  const preferenceHelp = control.querySelector(".library-personal-discovery-help");
  if (runtimeState.personalDiscoveryError) {
    preferenceHelp.textContent = "Personal Discovery is unavailable until the local Library setting can be read.";
  } else {
    preferenceHelp.textContent = "Uses your Library states and private ratings.";
  }
  const hiddenNote = control.querySelector(".library-hidden-meaning");
  hiddenNote.hidden = entry?.state !== "hidden";
  control.dataset.libraryCurrentState = entry?.state || "";
  const summary = control.querySelector("summary");
  summary.textContent = entry
    ? `Library · ${entry.state === "hidden" ? "Hidden" : STATE_LABELS[entry.state]}`
    : "Save to Library";
  summary.setAttribute("aria-label", entry
    ? `Manage ${title} in your Library. Current state: ${STATE_LABELS[entry.state]}.`
    : `Add ${title} to your Library`);
  summary.setAttribute("aria-disabled", String(unavailable));
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
  let control = actions.querySelector(":scope > [data-library-control=detail]");
  if (!control) {
    const title = document.querySelector(".podcast-detail .detail-title-group h1")?.textContent?.trim() || showId;
    control = createDetailControl(showId, title);
    actions.append(control);
  }
  renderControlState(control, currentState);
}

function renderAllControls(runtimeState = getLibraryRuntimeState()) {
  ensureCardControls();
  document.querySelectorAll("[data-library-control]").forEach((control) => renderControlState(control, runtimeState));
  ensureDetailControl();
  void syncPersonalTryNext(runtimeState);
}

function getRecommendationGroupBaseline(group) {
  let baseline = recommendationGroupBaselines.get(group);
  if (baseline) return baseline;
  const cards = [...group.querySelectorAll(".detail-similar-card")];
  const visibleGrid = group.querySelector(":scope > .detail-similar-grid");
  const overflow = group.querySelector(":scope > .detail-similar-overflow");
  const overflowGrid = overflow?.querySelector(".detail-similar-overflow-grid") || null;
  if (!visibleGrid || !cards.length) return null;
  baseline = {
    source: group.dataset.recommendationSource,
    cards,
    visibleLimit: visibleGrid.children.length,
    visibleGrid,
    overflow,
    overflowGrid,
    reasons: new Map(cards.map((card) => [card, card.querySelector(".detail-similar-reason")?.textContent || ""])),
    // Click telemetry keeps the authored/public position while visible order changes locally.
    positionBuckets: new Map(cards.map((card) => [
      card,
      card.querySelector("a[data-discovery-show-id]")?.dataset.discoveryResultPositionBucket || "unknown",
    ])),
  };
  recommendationGroupBaselines.set(group, baseline);
  return baseline;
}

function getRecommendationEntries(baseline) {
  return baseline.cards.map((card) => ({
    id: card.querySelector("a[data-discovery-show-id]")?.dataset.discoveryShowId || "",
    provenance: { kind: baseline.source === "curated" ? "authored" : "computed" },
  })).filter((entry) => entry.id);
}

async function getPersonalDiscoveryData() {
  if (!personalDiscoveryDataPromise) {
    personalDiscoveryDataPromise = Promise.all([loadShows(), loadCollections()])
      .then(([shows, collections]) => {
        const publishedShows = shows.filter((show) => show?.status === "published");
        const similarityIndex = archiveSimilarity.createSimilarityIndex({ shows: publishedShows, collections });
        return {
          shows: publishedShows,
          similarityIndex,
          personalize: createPersonalDiscoveryPersonalizer({ shows: publishedShows, similarityIndex, scope: "try-next" }),
        };
      })
      .catch((error) => {
        personalDiscoveryDataPromise = null;
        throw error;
      });
  }
  return personalDiscoveryDataPromise;
}

function hasPersonalTasteSignal(entries) {
  return entries.some((entry) => {
    if ([1, 2, 4, 5].includes(entry.rating)) return true;
    return !Number.isInteger(entry.rating) && (entry.state === "saved" || entry.state === "listening");
  });
}

function restoreRecommendationGroup(group, baseline) {
  baseline.cards.forEach((card) => {
    card.querySelector(".detail-similar-reason")?.replaceChildren(document.createTextNode(baseline.reasons.get(card) || ""));
  });
  const visible = baseline.cards.slice(0, baseline.visibleLimit);
  const overflow = baseline.cards.slice(baseline.visibleLimit);
  baseline.visibleGrid.replaceChildren(...visible);
  if (baseline.overflowGrid) baseline.overflowGrid.replaceChildren(...overflow);
  if (baseline.overflow) {
    baseline.overflow.hidden = overflow.length === 0;
    const summary = baseline.overflow.querySelector(":scope > summary");
    if (summary && overflow.length) summary.textContent = formatRouteExpansion(overflow.length);
  }
  baseline.cards.forEach((card) => {
    const link = card.querySelector("a[data-discovery-show-id]");
    if (link) link.dataset.discoveryResultPositionBucket = baseline.positionBuckets.get(card) || "unknown";
  });
  group.hidden = baseline.cards.length === 0;
}

function syncTryNextSectionVisibility() {
  const section = document.querySelector(".detail-similar-section");
  if (!section) return;
  section.hidden = ![...section.querySelectorAll(".detail-similar-group[data-recommendation-source]")]
    .some((group) => !group.hidden);
}

function applyPersonalRecommendationGroup(group, baseline, entries) {
  const cardById = new Map(baseline.cards.map((card) => [
    card.querySelector("a[data-discovery-show-id]")?.dataset.discoveryShowId || "",
    card,
  ]));
  const visibleEntries = entries.slice(0, baseline.visibleLimit);
  const overflowEntries = entries.slice(baseline.visibleLimit);
  baseline.visibleGrid.replaceChildren(...visibleEntries.map((entry) => cardById.get(entry.id)).filter(Boolean));
  if (baseline.overflowGrid) baseline.overflowGrid.replaceChildren(...overflowEntries.map((entry) => cardById.get(entry.id)).filter(Boolean));
  if (baseline.overflow) {
    baseline.overflow.hidden = overflowEntries.length === 0;
    const summary = baseline.overflow.querySelector(":scope > summary");
    if (summary && overflowEntries.length) summary.textContent = formatRouteExpansion(overflowEntries.length);
  }
  entries.forEach((entry) => {
    const card = cardById.get(entry.id);
    if (!card) return;
    const reason = card.querySelector(".detail-similar-reason");
    if (reason && entry.personalizationReason) reason.textContent = entry.personalizationReason;
  });
  group.hidden = entries.length === 0;
}

async function syncPersonalTryNext(runtimeState) {
  const generation = ++personalPresentationGeneration;
  const groups = [...document.querySelectorAll(".detail-similar-group[data-recommendation-source]")];
  if (!groups.length) return;
  const baselines = groups.map((group) => ({ group, baseline: getRecommendationGroupBaseline(group) })).filter(({ baseline }) => baseline);
  baselines.forEach(({ group, baseline }) => restoreRecommendationGroup(group, baseline));
  syncTryNextSectionVisibility();
  const context = runtimeState?.personalContext;
  if (runtimeState?.loading || !runtimeState?.storageAvailable || context?.enabled !== true || !context.entries.length) return;

  let personalize = noAnchorPersonalizer;
  if (hasPersonalTasteSignal(context.entries)) {
    try {
      personalize = (await getPersonalDiscoveryData()).personalize;
    } catch (error) {
      console.error("Personal Discovery could not prepare local Try Next ordering.", error);
      return;
    }
  }
  const currentState = getLibraryRuntimeState();
  if (
    generation !== personalPresentationGeneration
      || currentState.loading
      || currentState.personalContext !== context
      || currentState.personalContext?.enabled !== true
  ) return;

  const bySource = new Map(baselines.map(({ group, baseline }) => [baseline.source, { group, baseline }]));
  const authored = bySource.get("curated")?.baseline;
  const computed = bySource.get("computed")?.baseline;
  const sections = {
    shows: [],
    authoredSimilarity: authored ? getRecommendationEntries(authored) : [],
    computedSimilarity: computed ? getRecommendationEntries(computed) : [],
    collections: [],
    entities: [],
  };
  const publicResult = {
    sections,
    candidateIds: [...sections.authoredSimilarity, ...sections.computedSimilarity].map((entry) => entry.id),
    outcome: "results",
  };
  const sourceShowId = getShowIdFromLocation();
  const result = personalize({
    publicResult,
    personalContext: context,
    intent: { kind: "similarity", surface: "show-page", identity: { kind: "show", id: sourceShowId } },
  });
  if (authored) applyPersonalRecommendationGroup(bySource.get("curated").group, authored, result.sections.authoredSimilarity);
  if (computed) applyPersonalRecommendationGroup(bySource.get("computed").group, computed, result.sections.computedSimilarity);
  syncTryNextSectionVisibility();
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
    if (addedNodes.some((node) => subtreeHas(node, ".detail-similar-group[data-recommendation-source]"))) {
      void syncPersonalTryNext(getLibraryRuntimeState());
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function bindPersonalDiscoveryPreference() {
  document.addEventListener("change", async (event) => {
    if (!(event.target instanceof Element)) return;
    const preference = event.target.closest("[data-library-discovery-preference]");
    if (!preference) return;

    const requestedValue = preference.checked;
    pendingPersonalDiscoveryValue = requestedValue;
    preference.disabled = true;
    const result = await library.setPersonalDiscoveryEnabled(requestedValue);
    if (!result.ok) {
      pendingPersonalDiscoveryValue = undefined;
      await refreshLibraryRuntime();
      renderAllControls();
      const status = preference.closest("[data-library-control]")?.querySelector(".library-control-status");
      if (status) {
        status.textContent = `Personal Discovery could not be changed: ${result.error.message}`;
        status.dataset.tone = "error";
      }
      return;
    }

    await refreshLibraryRuntime();
    pendingPersonalDiscoveryValue = undefined;
    renderAllControls();
    const status = preference.closest("[data-library-control]")?.querySelector(".library-control-status");
    if (status) {
      status.textContent = `Personal Discovery ${requestedValue ? "enabled" : "disabled"} on this browser.`;
      status.dataset.tone = "";
    }
  });
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
  bindPersonalDiscoveryPreference();
  renderAllControls();
  subscribeToLibraryRuntime((runtimeState) => {
    renderAllControls(runtimeState);
    announceStorageFailure(runtimeState);
  });
  initMutationObserver();

  await initializeLibraryRuntime();
}
