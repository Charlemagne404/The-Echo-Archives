import { CORRECTION_TYPE_OPTIONS } from "../../config.js";
import { renderExistingShowField } from "../choice-fields.js";
import { renderLinkListField } from "../link-fields.js";
import { renderSelectField, renderTextInputField, renderTextareaField } from "../base-fields.js";

export function renderCorrectionMode(draft, context) {
  return [
    renderExistingShowField({
      label: "Existing archive entry / show",
      required: true,
      value: draft.showSearch,
      helper: "Search or select the show or episode you want to correct.",
      searchResults: context.searchResults,
      searchOpen: context.searchOpen,
      selectedShowId: draft.existingShowId,
      lookupStatus: context.lookupStatus,
      lookupMessage: context.lookupMessage,
      highlightIndex: context.showHighlightIndex,
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
}
