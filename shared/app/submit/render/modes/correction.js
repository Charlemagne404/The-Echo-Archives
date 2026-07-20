import {
  COMPLETION_STATUS_OPTIONS,
  CORRECTION_CREDIT_ACTION_OPTIONS,
  CORRECTION_LINK_ACTION_OPTIONS,
  CORRECTION_METADATA_FIELD_OPTIONS,
  CORRECTION_TYPE_OPTIONS,
} from "../../config.js";
import { renderExistingShowField } from "../choice-fields.js";
import { renderLinkListField } from "../link-fields.js";
import { renderFormRow, renderSelectField, renderTextInputField, renderTextareaField } from "../base-fields.js";
import { renderShowContext } from "../supporting.js";

function renderCorrectionDetails(draft) {
  switch (draft.correctionType) {
    case "broken-link":
      return renderFormRow([
        renderSelectField({
          id: "submitLinkAction",
          label: "Link action",
          required: true,
          value: draft.linkAction,
          options: CORRECTION_LINK_ACTION_OPTIONS,
        }),
        renderTextInputField({
          id: "submitAffectedUrl",
          label: "Affected link",
          required: true,
          type: "url",
          value: draft.affectedUrl,
          maxLength: 500,
          placeholder: "https://example.com/old-link",
          helper: "Choose from the current archive data above or paste the affected URL.",
        }),
        ...(draft.linkAction === "replace" ? [renderTextInputField({
          id: "submitReplacementUrl",
          label: "Replacement link",
          required: true,
          type: "url",
          value: draft.replacementUrl,
          maxLength: 500,
          placeholder: "https://example.com/current-link",
        })] : []),
      ]);
    case "metadata":
      return renderFormRow([
        renderSelectField({
          id: "submitMetadataField",
          label: "Metadata field",
          required: true,
          value: draft.metadataField,
          options: CORRECTION_METADATA_FIELD_OPTIONS,
        }),
        renderTextareaField({
          id: "submitProposedMetadataValue",
          label: "Correct information",
          required: true,
          value: draft.proposedMetadataValue,
          maxLength: 1000,
          rows: 4,
          placeholder: "What should this field say?",
          short: true,
        }),
      ]);
    case "status":
      return renderFormRow([
        renderSelectField({
          id: "submitProposedStatus",
          label: "Proposed status",
          required: true,
          value: draft.proposedStatus,
          options: COMPLETION_STATUS_OPTIONS,
        }),
        renderTextInputField({
          id: "submitStatusContext",
          label: "Effective date or context (optional)",
          value: draft.statusContext,
          maxLength: 500,
          placeholder: "e.g., Completed after season 3 in May 2025",
        }),
      ]);
    case "credits":
      return [
        renderSelectField({
          id: "submitCreditAction",
          label: "Credit action",
          required: true,
          value: draft.creditAction,
          options: CORRECTION_CREDIT_ACTION_OPTIONS,
        }),
        renderFormRow([
          renderTextInputField({
            id: "submitCreditName",
            label: "Person or organization",
            required: true,
            value: draft.creditName,
            maxLength: 200,
            placeholder: "Name as it should appear",
          }),
          renderTextInputField({
            id: "submitCreditRole",
            label: "Credit role",
            required: true,
            value: draft.creditRole,
            maxLength: 160,
            placeholder: "e.g., Writer, producer, network",
          }),
        ]),
      ].join("");
    case "artwork":
      return renderFormRow([
        renderTextInputField({
          id: "submitArtworkUrl",
          label: "Official artwork URL",
          required: true,
          type: "url",
          value: draft.artworkUrl,
          maxLength: 500,
          placeholder: "https://example.com/official-cover.jpg",
        }),
        renderTextInputField({
          id: "submitArtworkCredit",
          label: "Artwork credit (optional)",
          value: draft.artworkCredit,
          maxLength: 300,
          placeholder: "Artist or rights holder",
        }),
      ]);
    default:
      return renderFormRow([
        renderTextareaField({
          id: "submitOtherIssue",
          label: "What is wrong?",
          required: true,
          value: draft.otherIssue,
          maxLength: 1000,
          rows: 4,
          placeholder: "Describe the factual problem.",
          short: true,
        }),
        renderTextareaField({
          id: "submitOtherProposedValue",
          label: "Proposed correction",
          required: true,
          value: draft.otherProposedValue,
          maxLength: 1000,
          rows: 4,
          placeholder: "What should change?",
          short: true,
        }),
      ]);
  }
}

export function renderCorrectionMode(draft, context) {
  const sourceRequired = ["metadata", "status", "credits"].includes(draft.correctionType);
  return [
    renderExistingShowField({
      label: "Existing archive entry / show",
      required: true,
      value: draft.showSearch,
      helper: "Search and select the archive entry to correct.",
      searchResults: context.searchResults,
      searchOpen: context.searchOpen,
      selectedShowId: draft.existingShowId,
      lookupStatus: context.lookupStatus,
      lookupMessage: context.lookupMessage,
      highlightIndex: context.showHighlightIndex,
    }),
    renderShowContext(context),
    renderSelectField({
      id: "submitCorrectionType",
      label: "Correction type",
      required: true,
      value: draft.correctionType,
      options: CORRECTION_TYPE_OPTIONS,
      helper: "The fields below change to match the evidence this correction needs.",
    }),
    `<section id="submitCorrectionDetails" class="submit-conditional-fields" aria-label="Correction details">${renderCorrectionDetails(draft)}</section>`,
    renderLinkListField({
      fieldName: "sourceLinks",
      label: sourceRequired ? "Official source" : "Supporting source (optional)",
      helper: sourceRequired
        ? "Add at least one official page, post, feed, or other verifiable source."
        : "Add a source when it helps confirm the requested change.",
      required: sourceRequired,
      rows: draft.sourceLinks,
      options: [],
      plain: true,
    }),
    renderTextareaField({
      id: "submitCorrectionNotes",
      label: "Additional notes (optional)",
      value: draft.optionalNotes,
      maxLength: 1000,
      rows: 4,
      placeholder: "Anything else that helps us verify the correction.",
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
      helper: "Used only if the review team needs clarification.",
    }),
  ].join("");
}
