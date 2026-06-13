import { setChatOpen } from "../chat.js";
import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { getPublishedShows, loadShows } from "../data.js";
import { updateDocumentMetadata } from "../utils.js";

const MODE_ORDER = ["show", "correction", "listener-review", "creator-verification"];
const MODES_WITH_EXISTING_SHOW = new Set(["correction", "listener-review", "creator-verification"]);
const FALLBACK_TAG_OPTIONS = [
  "Horror",
  "Sci-fi",
  "Mystery",
  "Fantasy",
  "Comedy",
  "Thriller",
  "Drama",
  "Adventure",
  "Anthology",
  "Full-cast",
  "Serialized",
  "Character-driven",
];
const LISTEN_LINK_OPTIONS = ["Spotify", "Apple Podcasts", "RSS Feed", "Official Website", "YouTube", "Other"];
const CORRECTION_TYPE_OPTIONS = [
  { value: "broken-link", label: "Broken link" },
  { value: "metadata", label: "Metadata error" },
  { value: "status", label: "Status update" },
  { value: "credits", label: "Credit correction" },
  { value: "artwork", label: "Artwork update" },
  { value: "other", label: "Other" },
];
const COMPLETION_STATUS_OPTIONS = [
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "hiatus", label: "On hiatus" },
  { value: "returning", label: "Returning / seasonal" },
  { value: "anthology", label: "Anthology" },
  { value: "unknown", label: "Unknown" },
];
const SPOILER_LEVEL_OPTIONS = [
  {
    value: "spoiler-free",
    label: "Spoiler-free",
    description: "No plot details",
  },
  {
    value: "light-spoilers",
    label: "Mild spoilers",
    description: "Some details",
  },
  {
    value: "full-spoilers",
    label: "Full spoilers",
    description: "All spoilers",
  },
];
const REVIEW_CONTEXT_OPTIONS = [
  "Long walks",
  "Headphones on",
  "Slow burn",
  "Serious sci-fi",
  "Horror",
  "Comedy",
  "Commute",
  "Background listening",
  "Relaxing",
  "Family-friendly",
  "Kids",
];
const REVIEW_STRENGTH_OPTIONS = [
  "Atmosphere",
  "Sound design",
  "World-building",
  "Characters",
  "Story",
  "Acting",
  "Pacing",
  "Originality",
  "Emotional impact",
];
const ROLE_OPTIONS = [
  { value: "creator", label: "Creator" },
  { value: "producer", label: "Producer" },
  { value: "network-representative", label: "Network representative" },
  { value: "publicist", label: "Publicist" },
  { value: "other", label: "Other" },
];
const VERIFICATION_METHOD_OPTIONS = [
  {
    value: "official-domain-email",
    label: "Official domain email",
    description: "Best for factual updates",
  },
  {
    value: "website",
    label: "Website",
    description: "Official website proof",
  },
  {
    value: "social-account",
    label: "Social account",
    description: "Verified social proof",
  },
  {
    value: "press-kit",
    label: "Press kit",
    description: "Public press materials",
  },
  {
    value: "other",
    label: "Other",
    description: "Another proof path",
  },
];
const OFFICIAL_LINK_OPTIONS = ["Website", "RSS Feed", "Spotify", "Apple Podcasts", "Press kit", "YouTube", "X (Twitter)", "Other"];

const MODE_CONFIG = {
  show: {
    cardTitle: "Submit a new show",
    cardDescription: "Add a show that should be considered for the archive.",
    cardIcon: "antenna",
    introTitle: "Submission details",
    introDescription: "Provide accurate, verifiable information to help us review your submission.",
    introIcon: "document",
    submitLabel: "Send to archive review",
    footerNote: "All submissions are manually reviewed.",
    steps: [
      {
        title: "You submit",
        body: "Send us the details using the form below.",
      },
      {
        title: "We review",
        body: "Our team verifies and adds context as needed.",
      },
      {
        title: "It enters the archive",
        body: "If accepted, it becomes part of the curated collection.",
      },
    ],
    railCards: [
      {
        title: "Submission guidelines",
        icon: "clipboard",
        accent: true,
        items: [
          {
            title: "Provide accurate, verifiable information.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Include at least one official listen link.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Keep descriptions spoiler-safe and factual.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Edits may be made for clarity and consistency.",
            description: "",
            icon: "check",
            accent: true,
          },
        ],
      },
      {
        title: "Good to know",
        icon: "info",
        items: [
          {
            title: "Nothing auto-publishes",
            description: "Every submission is manually reviewed before it enters the archive.",
            icon: "info",
          },
          {
            title: "Editorial stance stays independent",
            description: "Creator or listener input improves metadata, not archive ratings or reviews.",
            icon: "archive",
          },
          {
            title: "Creator corrections update facts",
            description: "Verification improves metadata quality and provenance only.",
            icon: "shield",
          },
          {
            title: "Response time",
            description: "Most submissions receive a response within 7-14 days.",
            icon: "clock",
          },
        ],
      },
      {
        title: "Questions?",
        icon: "question",
        accent: true,
        description: "Visit our help center or reach out to the Archivist.",
        buttonLabel: "Ask the Archivist",
        footer: "We're here to help.",
      },
    ],
  },
  correction: {
    cardTitle: "Suggest a correction",
    cardDescription: "Fix factual data or update existing information.",
    cardIcon: "pencil",
    introTitle: "Correction details",
    introDescription: "Provide accurate, verifiable information to help us fix or update the archive.",
    introIcon: "document",
    submitLabel: "Send correction",
    footerNote: "Corrections are reviewed before they update the archive.",
    steps: [
      {
        title: "You submit",
        body: "Send the factual issue and the corrected information.",
      },
      {
        title: "We review",
        body: "Our team verifies the sources and notes.",
      },
      {
        title: "We update the archive",
        body: "Accepted corrections improve the live archive entry.",
      },
    ],
    railCards: [
      {
        title: "Correction guidelines",
        icon: "clipboard",
        accent: true,
        items: [
          {
            title: "Provide accurate, verifiable information.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Link to an official source when possible.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Keep notes specific and factual.",
            description: "",
            icon: "check",
            accent: true,
          },
          {
            title: "Suggest factual updates, not opinions or ratings.",
            description: "",
            icon: "check",
            accent: true,
          },
        ],
      },
      {
        title: "Good to know",
        icon: "info",
        items: [
          {
            title: "Corrections update facts, not opinions.",
            description: "We do not change reviews or ratings submitted by listeners.",
            icon: "document",
          },
          {
            title: "Manual review before publication.",
            description: "Every correction is verified by our team for accuracy.",
            icon: "team",
          },
          {
            title: "Broken links are prioritized.",
            description: "We aim to fix dead or incorrect links as quickly as possible.",
            icon: "link",
          },
          {
            title: "Response time",
            description: "Most corrections receive a response within 7-14 days.",
            icon: "clock",
          },
        ],
      },
      {
        title: "Need help?",
        icon: "question",
        accent: true,
        description: "Visit our help center or reach out to the Archivist.",
        buttonLabel: "Ask the Archivist",
        footer: "We're here to help.",
      },
    ],
  },
  "listener-review": {
    cardTitle: "Submit a listener review",
    cardDescription: "Share your take to help other listeners discover.",
    cardIcon: "review",
    introTitle: "Listener review",
    introDescription: "Tell other listeners what to expect and why this show matters.",
    introIcon: "review",
    submitLabel: "Send listener review",
    footerNote: "Listener reviews may be summarized or quoted, but archive ratings stay editorially independent.",
    steps: [
      {
        title: "You submit",
        body: "Send us your review using the form below.",
      },
      {
        title: "We review",
        body: "Our team reads and edits for clarity and respect.",
      },
      {
        title: "It helps listeners discover",
        body: "Approved reviews can appear on show pages and related collections.",
      },
    ],
    railCards: [
      {
        title: "Review guidelines",
        icon: "star-badge",
        accent: true,
        description: "Help keep the archive useful and respectful.",
        items: [
          {
            title: "Keep it spoiler-tagged",
            description: "Choose the right spoiler level and do not drop untagged major reveals.",
            icon: "tag",
            accent: true,
          },
          {
            title: "Stay respectful",
            description: "Be kind to creators and other listeners. No harassment or hate.",
            icon: "team",
          },
          {
            title: "Focus on what listeners should know",
            description: "Highlight tone, themes, strengths, and who this show is for.",
            icon: "review",
            accent: true,
          },
          {
            title: "Edits may be made for clarity",
            description: "We may edit for length, grammar, and consistency.",
            icon: "pencil",
          },
        ],
      },
      {
        title: "How reviews are used",
        icon: "info",
        description: "Listener reviews help others decide what to listen to next.",
        items: [
          {
            title: "Community voice",
            description: "Reviews reflect real listener experiences and perspectives.",
            icon: "team",
          },
          {
            title: "Discovery support",
            description: "Helpful reviews appear on show pages and in collections.",
            icon: "spark",
          },
          {
            title: "Editorial independence",
            description: "Reviews inform discovery, but our ratings remain editorially independent.",
            icon: "archive",
          },
        ],
      },
      {
        title: "Questions?",
        icon: "question",
        accent: true,
        description: "Visit our help center or reach out to the Archivist.",
        buttonLabel: "Ask the Archivist",
        footer: "We're here to help.",
      },
    ],
  },
  "creator-verification": {
    cardTitle: "Creator verification",
    cardDescription: "Verify your show or update official details.",
    cardIcon: "shield",
    introTitle: "Creator or official update",
    introDescription: "Provide accurate, verifiable information to confirm or update official details.",
    introIcon: "shield",
    submitLabel: "Send creator update",
    footerNote: "Verification helps confirm factual details. It does not affect archive ratings or recommendations.",
    steps: [
      {
        title: "You submit",
        body: "Send official proof and the updates that should be confirmed.",
      },
      {
        title: "We review",
        body: "Our team checks the proof and may follow up for clarification.",
      },
      {
        title: "We update factual details",
        body: "Accepted changes refresh links, bios, status, artwork, or metadata.",
      },
    ],
    railCards: [
      {
        title: "Verification guidelines",
        icon: "clipboard",
        accent: true,
        items: [
          {
            title: "Use official channels",
            description: "Submit from your official email domain, website, or verified social account.",
            icon: "check",
            accent: true,
          },
          {
            title: "Provide proof of association",
            description: "Include a link or documentation that confirms your role.",
            icon: "check",
            accent: true,
          },
          {
            title: "Factual updates only",
            description: "We update verifiable details like links, bios, status, artwork, and metadata.",
            icon: "check",
            accent: true,
          },
          {
            title: "Response may require follow-up",
            description: "Our team may reach out for clarification before changes are applied.",
            icon: "check",
            accent: true,
          },
        ],
      },
      {
        title: "What verification changes",
        icon: "shield",
        description: "",
        items: [
          {
            title: "Confirms official links",
            description: "We update websites, RSS feeds, and streaming links.",
            icon: "link",
          },
          {
            title: "Updates bios and descriptions",
            description: "Official descriptions and creator details are refreshed.",
            icon: "document",
          },
          {
            title: "Confirms show status",
            description: "We verify ongoing, paused, completed, or relaunch information.",
            icon: "clock",
          },
          {
            title: "Updates artwork",
            description: "Official cover art and banners may be updated.",
            icon: "image",
          },
          {
            title: "Updates official metadata",
            description: "Release dates, networks, and other factual details are confirmed.",
            icon: "spark",
          },
          {
            title: "Does not change ratings",
            description: "Audience ratings and rankings remain untouched by verification.",
            icon: "archive",
          },
        ],
      },
      {
        title: "Questions?",
        icon: "question",
        accent: true,
        description: "Visit our help center or reach out to the Archivist.",
        buttonLabel: "Ask the Archivist",
        footer: "We're here to help.",
      },
    ],
  },
};

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
  });

  elements.form.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.id === "submitExistingShowSearch") {
      state.searchOpen = true;
      updateSearchResults();
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
    }
  });

  elements.form.addEventListener("change", () => {
    captureCurrentDraft();
    syncHiddenInputs();
  });

  elements.form.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const chip = target.closest("[data-chip-field]");
    if (chip) {
      event.preventDefault();
      captureCurrentDraft();
      const field = chip.getAttribute("data-chip-field");
      const value = chip.getAttribute("data-chip-value");
      if (field && value) {
        toggleArrayValue(getActiveDraft(state), field, value);
        renderActiveMode();
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
        appendLinkRow(getActiveDraft(state), field);
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
      const response = await fetch("/api/submissions/shows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Submission failed with ${response.status}`);
      }

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
    elements.modeCards.innerHTML = MODE_ORDER.map((mode) => {
      const config = MODE_CONFIG[mode];
      const isActive = mode === state.activeMode;
      return `
        <button
          type="button"
          class="submit-mode-card"
          data-submission-mode="${mode}"
          data-active="${String(isActive)}"
          role="radio"
          aria-checked="${String(isActive)}"
        >
          <span class="submit-mode-card-icon" aria-hidden="true">${iconMarkup(config.cardIcon)}</span>
          <span class="submit-mode-card-copy">
            <span class="submit-mode-card-title">${escapeHtml(config.cardTitle)}</span>
            <span class="submit-mode-card-description">${escapeHtml(config.cardDescription)}</span>
          </span>
          <span class="submit-mode-card-check" aria-hidden="true"></span>
        </button>
      `;
    }).join("");
  }

  function renderActiveMode() {
    const mode = state.activeMode;
    const config = MODE_CONFIG[mode];
    const draft = getActiveDraft(state);
    const selectedShow = draft.existingShowId ? state.showMap.get(draft.existingShowId) || null : null;

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

function seedStateFromParams(state) {
  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("submissionType");
  if (requestedMode && Object.hasOwn(MODE_CONFIG, requestedMode)) {
    state.activeMode = requestedMode;
  }

  const requestedShowId = params.get("showId");
  if (!requestedShowId || !state.showMap.has(requestedShowId)) {
    state.searchOpen = false;
    return;
  }

  const show = state.showMap.get(requestedShowId);
  for (const mode of MODES_WITH_EXISTING_SHOW) {
    state.drafts[mode].existingShowId = show.id;
    state.drafts[mode].showSearch = show.title;
  }
  state.searchOpen = false;
}

function createDrafts() {
  return {
    show: createDraft("show"),
    correction: createDraft("correction"),
    "listener-review": createDraft("listener-review"),
    "creator-verification": createDraft("creator-verification"),
  };
}

function createDraft(mode) {
  switch (mode) {
    case "show":
      return {
        showTitle: "",
        creatorName: "",
        contactEmail: "",
        officialSite: "",
        listenLinks: [{ label: "Spotify", url: "" }],
        selectedTags: [],
        completionStatus: "ongoing",
        shortDescription: "",
        archiveFitNote: "",
        verificationNotes: "",
      };
    case "correction":
      return {
        existingShowId: "",
        showSearch: "",
        correctionType: "broken-link",
        issueDescription: "",
        correctedInformation: "",
        sourceLinks: [{ url: "" }],
        optionalNotes: "",
        contactEmail: "",
      };
    case "listener-review":
      return {
        existingShowId: "",
        showSearch: "",
        ratingStars: 4,
        spoilerLevel: "spoiler-free",
        reviewTitle: "",
        reviewText: "",
        whoWouldLikeThis: "",
        bestFor: [],
        workedBest: [],
        similarShows: "",
        alias: "",
        contactEmail: "",
      };
    case "creator-verification":
      return {
        existingShowId: "",
        showSearch: "",
        creatorName: "",
        role: "creator",
        officialSite: "",
        verificationMethod: "official-domain-email",
        proofUrl: "",
        requestedUpdates: "",
        preferredDescription: "",
        officialLinks: [{ label: "Website", url: "" }],
        optionalNotes: "",
      };
    default:
      return {};
  }
}

function getActiveDraft(state) {
  return state.drafts[state.activeMode];
}

function appendLinkRow(draft, fieldName) {
  const row = fieldName === "sourceLinks"
    ? { url: "" }
    : fieldName === "officialLinks"
      ? { label: "Website", url: "" }
      : { label: "Spotify", url: "" };
  draft[fieldName] = [...draft[fieldName], row];
}

function removeLinkRow(draft, fieldName, index) {
  const currentRows = Array.isArray(draft[fieldName]) ? draft[fieldName] : [];
  const nextRows = currentRows.filter((_, currentIndex) => currentIndex !== index);
  if (nextRows.length > 0) {
    draft[fieldName] = nextRows;
    return;
  }

  draft[fieldName] = fieldName === "sourceLinks"
    ? [{ url: "" }]
    : fieldName === "officialLinks"
      ? [{ label: "Website", url: "" }]
      : [{ label: "Spotify", url: "" }];
}

function toggleArrayValue(draft, field, value) {
  const current = new Set(Array.isArray(draft[field]) ? draft[field] : []);
  if (current.has(value)) {
    current.delete(value);
  } else if (current.size < 8 || field !== "selectedTags") {
    current.add(value);
  }
  draft[field] = [...current];
}

function validateDraft(mode, draft, showMap) {
  const selectedShow = draft.existingShowId ? showMap.get(draft.existingShowId) || null : null;

  if (mode === "show") {
    if (!draft.showTitle) {
      return "Show title is required.";
    }
    if (!draft.creatorName) {
      return "Creator or network is required.";
    }
    if (!isValidEmail(draft.contactEmail)) {
      return "A valid contact email is required.";
    }
    const listenLinks = normalizeLinkRows(draft.listenLinks, false);
    if (listenLinks.length === 0) {
      return "Add at least one listen link.";
    }
    if (listenLinks.some((row) => !isValidHttpUrl(row.url))) {
      return "Listen links must use valid http or https URLs.";
    }
    if (draft.officialSite && !isValidHttpUrl(draft.officialSite)) {
      return "Official website must use a valid http or https URL.";
    }
    if (!Array.isArray(draft.selectedTags) || draft.selectedTags.length === 0) {
      return "Choose at least one genre or tag.";
    }
    if (!draft.completionStatus) {
      return "Completion status is required.";
    }
    if (!draft.shortDescription) {
      return "Short spoiler-free description is required.";
    }
    if (!draft.archiveFitNote) {
      return "Why it belongs in the archive is required.";
    }
    return null;
  }

  if (!selectedShow) {
    return "Choose the existing archive entry for this submission.";
  }

  if (mode === "correction") {
    if (!draft.correctionType) {
      return "Correction type is required.";
    }
    if (!draft.issueDescription) {
      return "Describe what is wrong.";
    }
    if (!draft.correctedInformation) {
      return "Correct information is required.";
    }
    const sourceLinks = normalizeLinkRows(draft.sourceLinks, true);
    if (sourceLinks.length === 0) {
      return "Add at least one source link.";
    }
    if (sourceLinks.some((row) => !isValidHttpUrl(row.url))) {
      return "Source links must use valid http or https URLs.";
    }
    if (draft.contactEmail && !isValidEmail(draft.contactEmail)) {
      return "Contact email must be valid if provided.";
    }
    return null;
  }

  if (mode === "listener-review") {
    if (!Number.isInteger(draft.ratingStars) || draft.ratingStars < 1 || draft.ratingStars > 5) {
      return "Listener reviews require a 1 to 5 star rating.";
    }
    if (!draft.reviewTitle) {
      return "Review title is required.";
    }
    if (!draft.reviewText) {
      return "Review text is required.";
    }
    if (!draft.spoilerLevel) {
      return "Spoiler level is required.";
    }
    if (draft.contactEmail && !isValidEmail(draft.contactEmail)) {
      return "Contact email must be valid if provided.";
    }
    return null;
  }

  if (!draft.creatorName) {
    return "Creator or network is required.";
  }
  if (!draft.role) {
    return "Your role is required.";
  }
  if (draft.officialSite && !isValidHttpUrl(draft.officialSite)) {
    return "Official website must use a valid http or https URL.";
  }
  if (!draft.verificationMethod) {
    return "Verification method is required.";
  }
  if (!isValidHttpUrl(draft.proofUrl)) {
    return "Proof link or profile URL must use a valid http or https URL.";
  }
  if (!draft.requestedUpdates) {
    return "Requested updates are required.";
  }
  const officialLinks = normalizeLinkRows(draft.officialLinks, false);
  if (officialLinks.length === 0) {
    return "Add at least one official link.";
  }
  if (officialLinks.some((row) => !isValidHttpUrl(row.url))) {
    return "Official links must use valid http or https URLs.";
  }
  return null;
}

function buildPayload(mode, draft, showMap) {
  const selectedShow = draft.existingShowId ? showMap.get(draft.existingShowId) || null : null;

  if (mode === "show") {
    const listenLinks = normalizeLinkRows(draft.listenLinks, false);
    const topLevelListenLink = pickPrimaryListenLink(listenLinks);
    return {
      submissionType: "show",
      showTitle: draft.showTitle,
      creatorName: draft.creatorName,
      contactEmail: draft.contactEmail,
      officialSite: draft.officialSite,
      rssOrListenLink: topLevelListenLink,
      genres: draft.selectedTags.join(", "),
      notes: draft.archiveFitNote,
      listenLinks,
      selectedTags: [...draft.selectedTags],
      completionStatus: draft.completionStatus,
      shortDescription: draft.shortDescription,
      archiveFitNote: draft.archiveFitNote,
      verificationNotes: draft.verificationNotes,
      website: readHoneypotValue(),
    };
  }

  if (mode === "correction") {
    const sourceLinks = normalizeLinkRows(draft.sourceLinks, true).map((row) => row.url);
    return {
      submissionType: "correction",
      existingShowId: draft.existingShowId,
      showTitle: selectedShow?.title || draft.showSearch,
      creatorName: "",
      contactEmail: draft.contactEmail,
      officialSite: "",
      rssOrListenLink: "",
      genres: "",
      notes: draft.optionalNotes,
      correctionType: draft.correctionType,
      issueDescription: draft.issueDescription,
      correctedInformation: draft.correctedInformation,
      sourceLinks,
      website: readHoneypotValue(),
    };
  }

  if (mode === "listener-review") {
    const normalizedRating = draft.ratingStars * 2;
    return {
      submissionType: "listener-review",
      existingShowId: draft.existingShowId,
      showTitle: selectedShow?.title || draft.showSearch,
      creatorName: "",
      contactEmail: draft.contactEmail,
      officialSite: "",
      rssOrListenLink: "",
      genres: "",
      listenerRating: String(normalizedRating),
      ratingStars: draft.ratingStars,
      spoilerLevel: draft.spoilerLevel,
      listenerReview: draft.reviewText,
      notes: "",
      reviewTitle: draft.reviewTitle,
      reviewText: draft.reviewText,
      whoWouldLikeThis: draft.whoWouldLikeThis,
      bestFor: [...draft.bestFor],
      workedBest: [...draft.workedBest],
      similarShows: draft.similarShows,
      alias: draft.alias,
      website: readHoneypotValue(),
    };
  }

  const officialLinks = normalizeLinkRows(draft.officialLinks, false);
  return {
    submissionType: "creator-verification",
    existingShowId: draft.existingShowId,
    showTitle: selectedShow?.title || draft.showSearch,
    creatorName: draft.creatorName,
    contactEmail: "",
    officialSite: draft.officialSite || findPrimaryOfficialSite(officialLinks),
    rssOrListenLink: "",
    genres: "",
    notes: draft.optionalNotes,
    role: draft.role,
    verificationMethod: draft.verificationMethod,
    proofUrl: draft.proofUrl,
    requestedUpdates: draft.requestedUpdates,
    preferredDescription: draft.preferredDescription,
    officialLinks,
    website: readHoneypotValue(),
  };
}

function readHoneypotValue() {
  const honeypot = document.querySelector('input[name="website"]');
  return honeypot instanceof HTMLInputElement ? honeypot.value : "";
}

function getPendingCopy(mode) {
  switch (mode) {
    case "correction":
      return "Sending your correction into the archive queue...";
    case "listener-review":
      return "Sending your listener review into moderation...";
    case "creator-verification":
      return "Sending your verification request into moderation...";
    default:
      return "Sending your show to the archive queue...";
  }
}

function getSuccessCopy(mode) {
  switch (mode) {
    case "correction":
      return "Correction received. It is now in the manual archive review queue.";
    case "listener-review":
      return "Listener review received. It is now in the moderation queue.";
    case "creator-verification":
      return "Verification request received. It is now in the moderation queue.";
    default:
      return "Submission received. It is now in the manual archive review queue.";
  }
}

function renderModeFields(mode, draft, context) {
  switch (mode) {
    case "show":
      return [
        renderFormRow([
          renderTextInputField({
            id: "submitShowTitle",
            label: "Show title",
            required: true,
            value: draft.showTitle,
            maxLength: 160,
            placeholder: "e.g., The White Vault",
          }),
          renderTextInputField({
            id: "submitCreatorName",
            label: "Creator or network",
            required: true,
            value: draft.creatorName,
            maxLength: 160,
            placeholder: "e.g., Fool & Scholar",
          }),
        ]),
        renderFormRow([
          renderTextInputField({
            id: "submitContactEmail",
            label: "Contact email",
            required: true,
            type: "email",
            value: draft.contactEmail,
            maxLength: 160,
            placeholder: "you@example.com",
            autocomplete: "email",
          }),
          renderTextInputField({
            id: "submitOfficialSite",
            label: "Official website",
            type: "url",
            value: draft.officialSite,
            maxLength: 500,
            placeholder: "https://example.com",
          }),
        ]),
        renderLinkListField({
          fieldName: "listenLinks",
          label: "Listen links (add at least one)",
          helper: "Add official listen destinations for the archive review queue.",
          required: true,
          rows: draft.listenLinks,
          options: LISTEN_LINK_OPTIONS,
          plain: false,
        }),
        renderFormRow([
          renderChipGroupField({
            fieldName: "selectedTags",
            label: "Genres or tags",
            helper: "Choose up to eight tags that help listeners find the show.",
            required: true,
            values: draft.selectedTags,
            options: context.tagOptions,
          }),
          renderSelectField({
            id: "submitCompletionStatus",
            label: "Completion status",
            required: true,
            value: draft.completionStatus,
            options: COMPLETION_STATUS_OPTIONS,
            helper: "Select the current state of the show.",
          }),
        ]),
        renderTextareaField({
          id: "submitShortDescription",
          label: "Short spoiler-free description",
          required: true,
          value: draft.shortDescription,
          maxLength: 1000,
          rows: 5,
          helper: "Who is it for and what can listeners expect?",
          placeholder: "Give a concise, spoiler-safe description of the show.",
          short: true,
        }),
        renderTextareaField({
          id: "submitArchiveFitNote",
          label: "Why it belongs in the archive",
          required: true,
          value: draft.archiveFitNote,
          maxLength: 500,
          rows: 4,
          helper: "Tell us why this show should be preserved and discoverable.",
          placeholder: "Explain why this show fits the archive.",
          short: true,
        }),
        renderTextareaField({
          id: "submitVerificationNotes",
          label: "Optional notes or verification sources",
          value: draft.verificationNotes,
          maxLength: 1000,
          rows: 4,
          helper: "Share press kits, creator pages, IMDb links, or anything else that helps review.",
          placeholder: "Anything else the archive should know.",
          short: true,
        }),
      ].join("");
    case "correction":
      return [
        renderExistingShowField({
          label: "Existing archive entry / show",
          required: true,
          value: draft.showSearch,
          helper: "Search or select the show or episode you want to correct.",
          searchResults: context.searchResults,
          searchOpen: context.searchOpen,
          selectedShowId: draft.existingShowId,
        }),
        renderSelectField({
          id: "submitCorrectionType",
          label: "Correction type",
          required: true,
          value: draft.correctionType,
          options: CORRECTION_TYPE_OPTIONS,
          helper: "Choose the category that best describes the issue.",
        }),
        renderTextareaField({
          id: "submitIssueDescription",
          label: "What is wrong?",
          required: true,
          value: draft.issueDescription,
          maxLength: 1000,
          rows: 4,
          helper: "Describe the issue clearly and where it appears.",
          placeholder: "Describe the factual problem in the current entry.",
          short: true,
        }),
        renderTextareaField({
          id: "submitCorrectedInformation",
          label: "Correct information",
          required: true,
          value: draft.correctedInformation,
          maxLength: 1000,
          rows: 4,
          helper: "Provide the accurate information or update.",
          placeholder: "What should replace the current information?",
          short: true,
        }),
        renderLinkListField({
          fieldName: "sourceLinks",
          label: "Source links (add at least one)",
          helper: "Link to official sites, posts, or other verifiable sources.",
          required: true,
          rows: draft.sourceLinks,
          options: [],
          plain: true,
        }),
        renderTextareaField({
          id: "submitCorrectionNotes",
          label: "Optional notes",
          value: draft.optionalNotes,
          maxLength: 1000,
          rows: 4,
          helper: "Add any extra context that might help our review.",
          placeholder: "Anything else the archive should know.",
          short: true,
        }),
        renderTextInputField({
          id: "submitContactEmail",
          label: "Contact email (optional)",
          type: "email",
          value: draft.contactEmail,
          maxLength: 160,
          placeholder: "listener@example.com",
          autocomplete: "email",
          helper: "We'll only use this to follow up about your correction.",
        }),
      ].join("");
    case "listener-review":
      return [
        renderExistingShowField({
          label: "Show",
          required: true,
          value: draft.showSearch,
          helper: "Search or select the show you are reviewing.",
          searchResults: context.searchResults,
          searchOpen: context.searchOpen,
          selectedShowId: draft.existingShowId,
        }),
        renderRatingField(draft.ratingStars),
        renderSegmentedField({
          fieldName: "spoilerLevel",
          label: "Spoiler level",
          required: true,
          value: draft.spoilerLevel,
          helper: "Choose how much of the story your review discusses.",
          options: SPOILER_LEVEL_OPTIONS,
        }),
        renderTextInputField({
          id: "submitReviewTitle",
          label: "Review title",
          required: true,
          value: draft.reviewTitle,
          maxLength: 80,
          placeholder: "A short, descriptive title for your review.",
        }),
        renderTextareaField({
          id: "submitReviewText",
          label: "Review text",
          required: true,
          value: draft.reviewText,
          maxLength: 2000,
          rows: 7,
          helper: "Share your thoughts. Be clear, helpful, and respectful.",
          placeholder: "What worked for you, who should hear it, and what listeners should know before starting?",
        }),
        renderTextInputField({
          id: "submitWhoWouldLikeThis",
          label: "Who would like this? (optional)",
          value: draft.whoWouldLikeThis,
          maxLength: 200,
          placeholder: "Who is this show best suited for?",
        }),
        renderChipGroupField({
          fieldName: "bestFor",
          label: "Best for / listening context (optional)",
          helper: "Select all that apply.",
          values: draft.bestFor,
          options: REVIEW_CONTEXT_OPTIONS,
        }),
        renderChipGroupField({
          fieldName: "workedBest",
          label: "What worked best? (optional)",
          helper: "Pick what stood out most to you.",
          values: draft.workedBest,
          options: REVIEW_STRENGTH_OPTIONS,
        }),
        renderTextInputField({
          id: "submitSimilarShows",
          label: "Similar shows (optional)",
          value: draft.similarShows,
          maxLength: 120,
          placeholder: "e.g., The Magnus Archives, Wolf 359",
          helper: "List shows listeners might enjoy if they liked this one.",
        }),
        renderFormRow([
          renderTextInputField({
            id: "submitAlias",
            label: "Name or alias (optional)",
            value: draft.alias,
            maxLength: 120,
            placeholder: "e.g., Avery, Listener42, or Anonymous",
          }),
          renderTextInputField({
            id: "submitContactEmail",
            label: "Contact email (optional)",
            type: "email",
            value: draft.contactEmail,
            maxLength: 160,
            placeholder: "you@example.com",
            autocomplete: "email",
            helper: "We'll only reach out if we have a question.",
          }),
        ]),
      ].join("");
    case "creator-verification":
      return [
        renderExistingShowField({
          label: "Archive entry / show",
          required: true,
          value: draft.showSearch,
          helper: "Search or select the archive entry this update applies to.",
          searchResults: context.searchResults,
          searchOpen: context.searchOpen,
          selectedShowId: draft.existingShowId,
        }),
        renderFormRow([
          renderTextInputField({
            id: "submitCreatorName",
            label: "Creator or network",
            required: true,
            value: draft.creatorName,
            maxLength: 160,
            placeholder: "e.g., Rusty Quill",
          }),
          renderSelectField({
            id: "submitRole",
            label: "Your role",
            required: true,
            value: draft.role,
            options: ROLE_OPTIONS,
            helper: "Examples: creator, producer, network rep, publicist.",
          }),
        ]),
        renderFormRow([
          renderTextInputField({
            id: "submitOfficialSite",
            label: "Official website",
            type: "url",
            value: draft.officialSite,
            maxLength: 500,
            placeholder: "https://example.com",
          }),
          renderTextInputField({
            id: "submitProofUrl",
            label: "Proof link or profile URL",
            required: true,
            type: "url",
            value: draft.proofUrl,
            maxLength: 500,
            placeholder: "https://example.com/about",
          }),
        ]),
        renderSegmentedField({
          fieldName: "verificationMethod",
          label: "Verification method",
          required: true,
          value: draft.verificationMethod,
          helper: "Choose the strongest official proof path you can provide.",
          options: VERIFICATION_METHOD_OPTIONS,
          wide: true,
        }),
        renderTextareaField({
          id: "submitRequestedUpdates",
          label: "Requested updates",
          required: true,
          value: draft.requestedUpdates,
          maxLength: 1000,
          rows: 5,
          helper: "Describe what should be confirmed or updated, such as links, status, artwork, or metadata.",
          placeholder: "Describe the factual updates that should be confirmed.",
        }),
        renderTextareaField({
          id: "submitPreferredDescription",
          label: "Preferred official description (optional)",
          value: draft.preferredDescription,
          maxLength: 1000,
          rows: 5,
          helper: "Provide the official description to be used in the archive.",
          placeholder: "Paste the official short description if you want us to consider it.",
        }),
        renderLinkListField({
          fieldName: "officialLinks",
          label: "Official links",
          helper: "Add links that represent the show or network. Use + Add another link to include additional URLs.",
          required: true,
          rows: draft.officialLinks,
          options: OFFICIAL_LINK_OPTIONS,
          plain: false,
        }),
        renderTextareaField({
          id: "submitVerificationNotes",
          label: "Optional notes",
          value: draft.optionalNotes,
          maxLength: 1000,
          rows: 4,
          helper: "Anything else we should know.",
          placeholder: "Optional notes for the archive review team.",
          short: true,
        }),
      ].join("");
    default:
      return "";
  }
}

function renderRailCard(card) {
  return `
    <article class="submit-rail-card ${card.buttonLabel ? "submit-rail-help" : ""}">
      <div class="submit-rail-card-heading">
        <span class="submit-rail-card-icon ${card.accent ? "is-accent" : ""}" aria-hidden="true">${iconMarkup(card.icon)}</span>
        <div>
          <h3>${escapeHtml(card.title)}</h3>
          ${card.description ? `<p>${escapeHtml(card.description)}</p>` : ""}
        </div>
      </div>
      ${Array.isArray(card.items) ? `<div class="submit-rail-list">${card.items.map((item) => renderRailItem(item)).join("")}</div>` : ""}
      ${card.buttonLabel ? `<button type="button" class="submit-rail-help-button" data-open-chat>${iconMarkup("magnify")}<span>${escapeHtml(card.buttonLabel)}</span></button>` : ""}
      ${card.footer ? `<p>${escapeHtml(card.footer)}</p>` : ""}
    </article>
  `;
}

function renderRailItem(item) {
  return `
    <div class="submit-rail-list-item">
      <span class="submit-rail-list-item-icon ${item.accent ? "is-accent" : ""}" aria-hidden="true">${iconMarkup(item.icon)}</span>
      <span class="submit-rail-list-item-copy">
        <strong>${escapeHtml(item.title)}</strong>
        ${item.description ? `<span>${escapeHtml(item.description)}</span>` : ""}
      </span>
    </div>
  `;
}

function renderFormRow(children, single = false) {
  return `<div class="submit-form-row ${single ? "submit-form-row--single" : ""}">${children.join("")}</div>`;
}

function renderTextInputField({
  id,
  label,
  value,
  required = false,
  type = "text",
  maxLength = 160,
  placeholder = "",
  helper = "",
  autocomplete = "off",
}) {
  return renderFieldShell({
    label,
    required,
    helper,
    counterTarget: maxLength ? id : "",
    currentLength: String(value || "").length,
    maxLength,
    controlHtml: `
      <input
        id="${id}"
        type="${type}"
        value="${escapeAttribute(value)}"
        maxlength="${maxLength}"
        placeholder="${escapeAttribute(placeholder)}"
        autocomplete="${autocomplete}"
        ${required ? "required" : ""}
      />
    `,
  });
}

function renderTextareaField({
  id,
  label,
  value,
  required = false,
  maxLength = 1000,
  placeholder = "",
  helper = "",
  rows = 5,
  short = false,
}) {
  return renderFieldShell({
    label,
    required,
    helper,
    counterTarget: maxLength ? id : "",
    currentLength: String(value || "").length,
    maxLength,
    controlHtml: `
      <textarea
        id="${id}"
        rows="${rows}"
        maxlength="${maxLength}"
        placeholder="${escapeAttribute(placeholder)}"
        class="${short ? "submit-short-textarea" : ""}"
        ${required ? "required" : ""}
      >${escapeHtml(value)}</textarea>
    `,
  });
}

function renderSelectField({ id, label, value, options, required = false, helper = "" }) {
  return renderFieldShell({
    label,
    required,
    helper,
    controlHtml: `
      <select id="${id}" ${required ? "required" : ""}>
        ${options.map((option) => {
          const normalized = normalizeOption(option);
          return `<option value="${escapeAttribute(normalized.value)}" ${normalized.value === value ? "selected" : ""}>${escapeHtml(normalized.label)}</option>`;
        }).join("")}
      </select>
    `,
  });
}

function renderChipGroupField({ fieldName, label, values, options, helper = "", required = false }) {
  const selectedValues = new Set(values);
  return renderFieldShell({
    label,
    required,
    helper,
    controlHtml: `
      <div class="submit-chip-group">
        ${options.map((option) => `
          <button
            type="button"
            class="submit-chip ${selectedValues.has(option) ? "is-selected" : ""}"
            data-chip-field="${fieldName}"
            data-chip-value="${escapeAttribute(option)}"
            aria-pressed="${String(selectedValues.has(option))}"
          >
            <span>${escapeHtml(option)}</span>
            ${selectedValues.has(option) ? '<span class="submit-chip-close" aria-hidden="true">×</span>' : ""}
          </button>
        `).join("")}
      </div>
    `,
  });
}

function renderSegmentedField({ fieldName, label, value, options, helper = "", required = false, wide = false }) {
  return renderFieldShell({
    label,
    required,
    helper,
    controlHtml: `
      <div class="submit-segmented ${wide ? "submit-segmented--wide" : ""}">
        ${options.map((option) => {
          const normalized = normalizeOption(option);
          const description = typeof option === "string" ? "" : option.description || "";
          const isSelected = normalized.value === value;
          return `
            <button
              type="button"
              class="submit-segmented-option ${isSelected ? "is-selected" : ""}"
              data-segment-field="${fieldName}"
              data-segment-value="${escapeAttribute(normalized.value)}"
              aria-pressed="${String(isSelected)}"
            >
              <span class="submit-segmented-option-title">${escapeHtml(normalized.label)}</span>
              ${description ? `<span class="submit-segmented-option-copy">${escapeHtml(description)}</span>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    `,
  });
}

function renderExistingShowField({ label, value, helper, searchResults, searchOpen, selectedShowId, required = false }) {
  return renderFieldShell({
    label,
    required,
    helper,
    controlHtml: `
      <div class="submit-search-shell">
        <input
          id="submitExistingShowSearch"
          type="text"
          value="${escapeAttribute(value)}"
          maxlength="160"
          placeholder="Start typing a show title"
          autocomplete="off"
          ${required ? "required" : ""}
        />
        <div id="submitExistingShowSearchResults" class="submit-search-results" ${searchOpen ? "" : "hidden"}>
          ${searchOpen ? renderSearchResultsMarkup(searchResults, selectedShowId, value) : ""}
        </div>
      </div>
    `,
  });
}

function renderSearchResultsMarkup(results, selectedShowId, query) {
  if (!Array.isArray(results) || results.length === 0) {
    return `<div class="submit-search-empty">No matching archive entry found for "${escapeHtml(query || "")}".</div>`;
  }

  return results.slice(0, 7).map((show) => `
    <button type="button" class="submit-search-result" data-show-option-id="${show.id}">
      <span class="submit-search-result-topline">
        <span class="submit-search-result-title">${escapeHtml(show.title)}</span>
        ${selectedShowId === show.id ? `<span class="submit-search-result-check" aria-hidden="true">${iconMarkup("check")}</span>` : ""}
      </span>
      <span class="submit-search-result-meta">
        ${escapeHtml(show.creators?.[0] || show.creatorName || show.genres?.join(" • ") || "Archive entry")}
      </span>
    </button>
  `).join("");
}

function renderLinkListField({ fieldName, label, rows, helper, options, plain, required = false }) {
  const normalizedRows = Array.isArray(rows) && rows.length > 0 ? rows : plain ? [{ url: "" }] : [{ label: options[0] || "Website", url: "" }];
  const rowMarkup = normalizedRows.map((row, index) => {
    if (plain) {
      return `
        <div class="submit-link-row submit-link-row--plain">
          <input
            type="url"
            value="${escapeAttribute(row.url || "")}"
            placeholder="https://example.com/source"
            data-link-list="${fieldName}"
            data-link-part="url"
            data-link-index="${index}"
          />
          <button type="button" class="submit-link-remove" data-remove-link="${fieldName}" data-link-index="${index}" aria-label="Remove link">
            ${iconMarkup("close")}
          </button>
        </div>
      `;
    }

    return `
      <div class="submit-link-row">
        <select data-link-list="${fieldName}" data-link-part="label" data-link-index="${index}">
          ${options.map((option) => `<option value="${escapeAttribute(option)}" ${option === row.label ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
        <input
          type="url"
          value="${escapeAttribute(row.url || "")}"
          placeholder="https://example.com"
          data-link-list="${fieldName}"
          data-link-part="url"
          data-link-index="${index}"
        />
        <button type="button" class="submit-link-remove" data-remove-link="${fieldName}" data-link-index="${index}" aria-label="Remove link">
          ${iconMarkup("close")}
        </button>
      </div>
    `;
  }).join("");

  return renderFieldShell({
    label,
    required,
    helper,
    controlHtml: `
      <div class="submit-link-list">
        ${rowMarkup}
        <button type="button" class="submit-add-row" data-add-link="${fieldName}">
          <span class="submit-add-row-icon" aria-hidden="true">${iconMarkup("plus")}</span>
          <span>Add another link</span>
        </button>
      </div>
    `,
  });
}

function renderRatingField(ratingStars) {
  return renderFieldShell({
    label: "Listener rating",
    required: true,
    helper: "How would you rate this show overall?",
    controlHtml: `
      <div class="submit-rating-control">
        <div class="submit-star-row" role="group" aria-label="Listener rating">
          ${Array.from({ length: 5 }, (_unused, index) => {
            const starValue = index + 1;
            return `
              <button
                type="button"
                class="submit-star-button ${starValue <= ratingStars ? "is-active" : ""}"
                data-rating-stars="${starValue}"
                aria-label="${starValue} out of 5 stars"
              >
                ${iconMarkup("star")}
              </button>
            `;
          }).join("")}
        </div>
        <span class="submit-rating-summary">${ratingStars} out of 5</span>
      </div>
    `,
  });
}

function renderFieldShell({ label, required = false, helper = "", counterTarget = "", currentLength = 0, maxLength = 0, controlHtml }) {
  return `
    <div class="submit-field">
      <span class="submit-field-label">
        <span class="submit-field-label-main">${escapeHtml(label)}${required ? '<span class="submit-required"> *</span>' : ""}</span>
        ${counterTarget && maxLength ? `<span class="submit-field-counter" data-counter-target="${counterTarget}">${currentLength}/${maxLength}</span>` : ""}
      </span>
      ${controlHtml}
      ${helper ? `<span class="submit-field-helper">${escapeHtml(helper)}</span>` : ""}
    </div>
  `;
}

function buildTagOptions(shows) {
  const counts = new Map();
  shows.forEach((show) => {
    const values = [
      ...(Array.isArray(show.genres) ? show.genres : []),
      ...(Array.isArray(show.tags) ? show.tags : []),
      ...(Array.isArray(show.formats) ? show.formats : []),
    ];

    values.forEach((value) => {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return;
      }
      const key = normalized.toLowerCase();
      const entry = counts.get(key) || { label: normalized, count: 0 };
      entry.count += 1;
      if (normalized.length < entry.label.length) {
        entry.label = normalized;
      }
      counts.set(key, entry);
    });
  });

  const derivedOptions = [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((entry) => toDisplayLabel(entry.label))
    .filter((value, index, collection) => collection.indexOf(value) === index)
    .slice(0, 12);

  return derivedOptions.length >= 8 ? derivedOptions : FALLBACK_TAG_OPTIONS;
}

function getShowMatches(shows, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return shows.slice(0, 7);
  }

  return shows.filter((show) => {
    const creators = Array.isArray(show.creators) ? show.creators.join(" ") : "";
    const haystack = [show.title, creators, ...(show.genres || []), ...(show.tags || [])].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function normalizeLinkRows(rows, plain) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => ({
      label: plain ? "" : String(row?.label || "").trim(),
      url: String(row?.url || "").trim(),
    }))
    .filter((row) => row.url);
}

function pickPrimaryListenLink(rows) {
  const primary = rows.find((row) => row.label.toLowerCase() === "rss feed") || rows[0];
  return primary?.url || "";
}

function findPrimaryOfficialSite(rows) {
  const primary = rows.find((row) => row.label.toLowerCase() === "website") || rows[0];
  return primary?.url || "";
}

function normalizeOption(option) {
  if (typeof option === "string") {
    return {
      value: option,
      label: option,
    };
  }

  return {
    value: String(option.value || "").trim(),
    label: String(option.label || option.value || "").trim(),
  };
}

function isValidHttpUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function toDisplayLabel(value) {
  return String(value || "")
    .split(/[\s-]+/)
    .map((segment) => segment ? `${segment[0].toUpperCase()}${segment.slice(1)}` : "")
    .join(" ")
    .replace("Sci Fi", "Sci-fi")
    .replace("Full Cast", "Full-cast");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

function iconMarkup(name) {
  switch (name) {
    case "antenna":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.25V14M8.5 20.25h7M9.25 14h5.5M12 13.75c0-5.4 2.45-8.75 6.75-8.75M12 13.75C12 8.35 9.55 5 5.25 5M8.25 8.25a5.25 5.25 0 0 0-3 4.7M15.75 8.25a5.25 5.25 0 0 1 3 4.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "pencil":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 19.25h3.5L18 9.5 14.5 6 4.75 15.75v3.5ZM13.75 6.75 17.25 10.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "review":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.25 6.75h13.5v8H11l-3.5 3v-3H5.25z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="m16.65 16.75.45 1.35 1.4.02-1.13.83.42 1.34-1.14-.82-1.13.82.42-1.34-1.13-.83 1.39-.02.45-1.35Z" fill="currentColor" stroke="none"/></svg>`;
    case "shield":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.75 5.75 7.5v4.25c0 3.88 2.42 6.97 6.25 7.5 3.83-.53 6.25-3.62 6.25-7.5V7.5L12 4.75Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="m9 12.25 2 2 4.25-4.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "document":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.75h6l4 4v10.5H8z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="M14 4.75v4h4M10.25 12h5.5M10.25 15.25h5.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "clipboard":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.25 5.75h5.5a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-5.5a1.5 1.5 0 0 1-1.5-1.5v-10a1.5 1.5 0 0 1 1.5-1.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="M10.5 5.75a1.5 1.5 0 1 1 3 0M10 10.5h4M10 13.5h4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "info":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM12 10.5v4M12 8.25h.01" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "question":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5Zm-1.5-7a1.5 1.5 0 1 1 2.45 1.15c-.7.57-.95.92-.95 1.6M12 16.25h.01" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "magnify":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.75 18.5a7.75 7.75 0 1 1 5.48-2.27l3.02 3.02" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "check":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.75 4 4 8-8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg>`;
    case "close":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>`;
    case "plus":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/></svg>`;
    case "arrow-right":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "clock":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="M12 9v3.25l2.25 1.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "archive":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.75 8.5h10.5v8.75H6.75zM5.75 8.5h12.5V5.75H5.75zM10 12h4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "link":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14 8.25 15.75a2.75 2.75 0 1 1-3.89-3.89L6.1 10.1a2.75 2.75 0 0 1 3.9 0M14 10l1.75-1.75a2.75 2.75 0 1 1 3.89 3.89L17.9 13.9a2.75 2.75 0 0 1-3.9 0M9.5 14.5l5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "team":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.25 12a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm7.5-1.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM5.25 18c.55-2.1 2.44-3.5 5-3.5s4.45 1.4 5 3.5M14.5 18c.33-1.28 1.41-2.15 2.95-2.15 1.44 0 2.41.73 2.8 1.9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    case "star":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4.75 2.3 4.66 5.14.75-3.72 3.62.88 5.12L12 16.55 7.4 18.9l.88-5.12-3.72-3.62 5.14-.75L12 4.75Z"/></svg>`;
    case "star-badge":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="m12 8.2 1.2 2.45 2.7.39-1.95 1.9.46 2.68L12 14.34l-2.41 1.28.46-2.68-1.95-1.9 2.7-.39L12 8.2Z" fill="currentColor" stroke="none"/></svg>`;
    case "tag":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.25 8.5 12 4.75h6.25v6.25L13.5 15.75 7.25 8.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/><path d="M14.5 8.5h.01" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg>`;
    case "spark":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 5.25 1.45 4.3 4.3 1.45-4.3 1.45L12 16.75l-1.45-4.3-4.3-1.45 4.3-1.45L12 5.25ZM18.25 4l.45 1.3L20 5.75l-1.3.45-.45 1.3-.45-1.3L16.5 5.75l1.3-.45.45-1.3ZM18.25 15.25l.45 1.3 1.3.45-1.3.45-.45 1.3-.45-1.3-1.3-.45 1.3-.45.45-1.3Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>`;
    case "image":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.25 6.25h11.5v11.5H6.25zM9.25 10.25h.01M7.75 15.75l3.25-3 2.25 2 2-1.75 1.5 1.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.25" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;
  }
}
