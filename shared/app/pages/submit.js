import { DEFAULT_SOCIAL_IMAGE } from "../constants.js";
import { getPublishedShows, loadShows } from "../data.js";
import { updateDocumentMetadata } from "../utils.js";

export async function initializeSubmitPage() {
  updateDocumentMetadata({
    title: "Submit a Show - The Echo Archives",
    description: "Submit a show, send a correction, share a listener review, or verify facts for The Echo Archives.",
    path: "/submit.html",
    image: DEFAULT_SOCIAL_IMAGE,
  });
  const form = document.getElementById("showSubmitForm");
  const status = document.getElementById("submitStatus");
  const submissionType = document.getElementById("submissionType");
  const submissionHelp = document.getElementById("submissionHelp");
  const existingShowField = document.getElementById("existingShowField");
  const existingShowId = document.getElementById("existingShowId");
  const showTitleInput = document.getElementById("showTitleInput");
  const showTitleLabel = document.getElementById("showTitleLabel");
  const creatorField = document.getElementById("creatorField");
  const officialSiteField = document.getElementById("officialSiteField");
  const rssField = document.getElementById("rssField");
  const genresField = document.getElementById("genresField");
  const listenerRatingField = document.getElementById("listenerRatingField");
  const listenerSpoilerLevelField = document.getElementById("listenerSpoilerLevelField");
  const listenerReviewField = document.getElementById("listenerReviewField");
  const verificationSourcesField = document.getElementById("verificationSourcesField");
  const provenanceNotesField = document.getElementById("provenanceNotesField");
  const notesField = document.getElementById("notesField");
  const notesLabel = document.getElementById("notesLabel");
  if (
    !form ||
    !status ||
    !submissionType ||
    !submissionHelp ||
    !existingShowField ||
    !existingShowId ||
    !(showTitleInput instanceof HTMLInputElement) ||
    !showTitleLabel ||
    !creatorField ||
    !officialSiteField ||
    !rssField ||
    !genresField ||
    !listenerRatingField ||
    !listenerSpoilerLevelField ||
    !listenerReviewField ||
    !verificationSourcesField ||
    !provenanceNotesField ||
    !notesField ||
    !notesLabel
  ) {
    return;
  }

  const shows = await loadShows();
  const publishedShows = getPublishedShows(shows).sort((left, right) => left.title.localeCompare(right.title));
  publishedShows.forEach((show) => {
    const option = document.createElement("option");
    option.value = show.id;
    option.textContent = show.title;
    existingShowId.appendChild(option);
  });

  const creatorInput = creatorField.querySelector("input");
  const officialSiteInput = officialSiteField.querySelector("input");
  const rssOrListenInput = rssField.querySelector("input");
  const genresInput = genresField.querySelector("input");
  const listenerRatingInput = listenerRatingField.querySelector("select");
  const listenerSpoilerLevelInput = listenerSpoilerLevelField.querySelector("select");
  const listenerReviewInput = listenerReviewField.querySelector("textarea");
  const verificationSourcesInput = verificationSourcesField.querySelector("textarea");
  const provenanceNotesInput = provenanceNotesField.querySelector("textarea");
  const notesInput = notesField.querySelector("textarea");
  const submitParams = new URLSearchParams(window.location.search);
  const requestedSubmissionType = submitParams.get("submissionType") || "";
  const requestedShowId = submitParams.get("showId") || "";

  const modeConfig = {
    show: {
      help: "New-show submissions need enough links and context for the archive to verify the entry.",
      showTitleLabel: "Show title",
      notesLabel: "Why it belongs in the archive",
      notesPlaceholder: "Give the archive context about tone, format, strengths, and who it fits.",
      requiresExistingShow: false,
      lockTitle: false,
      visibleFields: ["creator", "officialSite", "rss", "genres", "notes"],
      requiredFields: [],
    },
    correction: {
      help: "Correction requests stay manual. Point to the existing entry and explain exactly what needs to change.",
      showTitleLabel: "Archive entry title",
      notesLabel: "Correction details",
      notesPlaceholder: "Describe the factual issue and what should replace it.",
      requiresExistingShow: true,
      lockTitle: true,
      visibleFields: ["notes"],
      requiredFields: ["notes"],
    },
    "listener-review": {
      help: "Listener reviews enter moderation before anything is surfaced publicly. Keep the spoiler level honest.",
      showTitleLabel: "Reviewed show",
      notesLabel: "Extra notes for the archive",
      notesPlaceholder: "Optional context for moderation, edits, or edge cases.",
      requiresExistingShow: true,
      lockTitle: true,
      visibleFields: ["listenerRating", "listenerSpoilerLevel", "listenerReview", "notes"],
      requiredFields: ["listenerRating", "listenerReview"],
    },
    "creator-verification": {
      help: "Creator verification is for factual metadata only. Include source links so the archive can confirm the update.",
      showTitleLabel: "Archive entry title",
      notesLabel: "Verification context",
      notesPlaceholder: "Optional background for the archive reviewer.",
      requiresExistingShow: true,
      lockTitle: true,
      visibleFields: ["creator", "officialSite", "verificationSources", "provenanceNotes", "notes"],
      requiredFields: ["verificationSources", "provenanceNotes"],
    },
  };

  const fieldRegistry = {
    creator: creatorField,
    officialSite: officialSiteField,
    rss: rssField,
    genres: genresField,
    listenerRating: listenerRatingField,
    listenerSpoilerLevel: listenerSpoilerLevelField,
    listenerReview: listenerReviewField,
    verificationSources: verificationSourcesField,
    provenanceNotes: provenanceNotesField,
    notes: notesField,
  };

  function setFieldHidden(field, hidden) {
    field.hidden = hidden;
    field.querySelectorAll("input, textarea, select").forEach((control) => {
      if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement) && !(control instanceof HTMLSelectElement)) {
        return;
      }

      control.disabled = hidden;
      if (hidden) {
        control.required = false;
      }
    });
  }

  function syncSubmissionMode() {
    const mode = modeConfig[submissionType.value] || modeConfig.show;
    submissionHelp.textContent = mode.help;
    showTitleLabel.textContent = mode.showTitleLabel;
    notesLabel.textContent = mode.notesLabel;
    if (notesInput instanceof HTMLTextAreaElement) {
      notesInput.placeholder = mode.notesPlaceholder;
    }

    existingShowField.hidden = !mode.requiresExistingShow;
    existingShowId.disabled = !mode.requiresExistingShow;
    existingShowId.required = mode.requiresExistingShow;
    showTitleInput.readOnly = mode.lockTitle;

    Object.entries(fieldRegistry).forEach(([key, field]) => {
      setFieldHidden(field, !mode.visibleFields.includes(key));
    });

    if (creatorInput instanceof HTMLInputElement) {
      creatorInput.required = false;
    }
    if (officialSiteInput instanceof HTMLInputElement) {
      officialSiteInput.required = false;
    }
    if (rssOrListenInput instanceof HTMLInputElement) {
      rssOrListenInput.required = false;
    }
    if (genresInput instanceof HTMLInputElement) {
      genresInput.required = false;
    }
    if (listenerRatingInput instanceof HTMLSelectElement) {
      listenerRatingInput.required = mode.requiredFields.includes("listenerRating");
    }
    if (listenerSpoilerLevelInput instanceof HTMLSelectElement) {
      listenerSpoilerLevelInput.required = false;
    }
    if (listenerReviewInput instanceof HTMLTextAreaElement) {
      listenerReviewInput.required = mode.requiredFields.includes("listenerReview");
    }
    if (verificationSourcesInput instanceof HTMLTextAreaElement) {
      verificationSourcesInput.required = mode.requiredFields.includes("verificationSources");
    }
    if (provenanceNotesInput instanceof HTMLTextAreaElement) {
      provenanceNotesInput.required = mode.requiredFields.includes("provenanceNotes");
    }
    if (notesInput instanceof HTMLTextAreaElement) {
      notesInput.required = mode.requiredFields.includes("notes");
    }

    if (mode.requiresExistingShow) {
      const selectedOption = existingShowId.selectedOptions[0];
      if (selectedOption?.textContent && (!showTitleInput.value || showTitleInput.dataset.autoFilled === "true")) {
        showTitleInput.value = selectedOption.textContent;
        showTitleInput.dataset.autoFilled = "true";
      }
      return;
    }

    showTitleInput.dataset.autoFilled = "false";
  }

  submissionType.addEventListener("change", syncSubmissionMode);
  showTitleInput.addEventListener("input", () => {
    showTitleInput.dataset.autoFilled = "false";
  });
  existingShowId.addEventListener("change", () => {
    const selectedOption = existingShowId.selectedOptions[0];
    if (!selectedOption?.textContent) {
      return;
    }

    showTitleInput.value = selectedOption.textContent;
    showTitleInput.dataset.autoFilled = "true";
  });

  if (Object.hasOwn(modeConfig, requestedSubmissionType)) {
    submissionType.value = requestedSubmissionType;
  }
  if (requestedShowId && publishedShows.some((show) => show.id === requestedShowId)) {
    existingShowId.value = requestedShowId;
    const selectedOption = existingShowId.selectedOptions[0];
    if (selectedOption?.textContent) {
      showTitleInput.value = selectedOption.textContent;
      showTitleInput.dataset.autoFilled = "true";
    }
  }

  syncSubmissionMode();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
      submitButton.textContent = "Submitting...";
    }

    const formData = new FormData(form);
    const mode = formData.get("submissionType");
    const pendingLabel = (() => {
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
    })();
    status.textContent = pendingLabel;
    status.dataset.state = "pending";

    const payload = {
      submissionType: mode,
      existingShowId: formData.get("existingShowId"),
      showTitle: formData.get("showTitle"),
      creatorName: formData.get("creatorName"),
      contactEmail: formData.get("contactEmail"),
      officialSite: formData.get("officialSite"),
      rssOrListenLink: formData.get("rssOrListenLink"),
      genres: formData.get("genres"),
      listenerRating: formData.get("listenerRating"),
      spoilerLevel: formData.get("spoilerLevel"),
      listenerReview: formData.get("listenerReview"),
      verificationSources: formData.get("verificationSources"),
      provenanceNotes: formData.get("provenanceNotes"),
      notes: formData.get("notes"),
      website: formData.get("website"),
    };

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

      form.reset();
      syncSubmissionMode();
      status.textContent = "Submission received. It is now in the manual archive review queue.";
      status.dataset.state = "success";
    } catch (error) {
      status.textContent = error.message || "Submission failed. Try again.";
      status.dataset.state = "error";
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
        submitButton.textContent = "Submit to the archive";
      }
    }
  });
}
