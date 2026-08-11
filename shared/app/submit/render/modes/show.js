import { COMPLETION_STATUS_OPTIONS, LISTEN_LINK_OPTIONS } from "../../config.js";
import { renderChipGroupField } from "../choice-fields.js";
import { renderFormRow, renderSelectField, renderTextInputField, renderTextareaField } from "../base-fields.js";
import { renderLinkListField } from "../link-fields.js";
import { renderOptionalDisclosure } from "../supporting.js";

export function renderShowMode(draft, context) {
  const optionalFields = [
    renderFormRow([
      renderTextInputField({
        id: "submitCreatorName",
        label: "Creator or network (optional)",
        value: draft.creatorName,
        maxLength: 160,
        placeholder: "e.g., Fool & Scholar",
      }),
      renderTextInputField({
        id: "submitContactEmail",
        label: "Contact email (optional)",
        type: "email",
        value: draft.contactEmail,
        maxLength: 160,
        placeholder: "you@example.com",
        autocomplete: "email",
        helper: "Used only if the review team needs clarification.",
      }),
    ]),
    renderFormRow([
      renderChipGroupField({
        fieldName: "selectedTags",
        label: "Archive discovery tags (optional)",
        helper: "Choose established archive terms only. They are review hints, not publication-ready tags.",
        values: draft.selectedTags,
        options: context.tagFieldOptions.selectedTags,
        activeField: context.activeTagField,
        menuOpen: context.tagPickerOpen,
        query: context.tagQuery,
        highlightIndex: context.tagHighlightIndex,
        inputLabel: "Choose an archive discovery tag",
        placeholder: "Choose up to 4 established tags.",
        selectionLimit: 4,
        allowCustom: false,
      }),
      renderSelectField({
        id: "submitCompletionStatus",
        label: "Completion status (optional)",
        value: draft.completionStatus,
        options: COMPLETION_STATUS_OPTIONS,
        helper: "Leave this as Unknown when you are unsure.",
      }),
    ]),
    renderTextareaField({
      id: "submitSuggestedDescriptors",
      label: "Helpful themes or subjects (optional)",
      value: draft.suggestedDescriptors,
      maxLength: 500,
      rows: 3,
      helper: "Free text is stored as an untrusted review note. It never creates an archive tag automatically.",
      placeholder: "Anything a reviewer should verify from the official sources.",
      short: true,
    }),
    renderTextareaField({
      id: "submitShortDescription",
      label: "Short factual description (optional)",
      value: draft.shortDescription,
      maxLength: 1000,
      rows: 5,
      helper: "Keep it spoiler-safe and factual; the importer may replace it with an official description.",
      placeholder: "A concise description, if you have one.",
      short: true,
    }),
    renderTextareaField({
      id: "submitVerificationNotes",
      label: "Additional notes (optional)",
      value: draft.verificationNotes,
      maxLength: 1000,
      rows: 4,
      helper: "Share anything that helps identify or review the show without guessing at facts.",
      placeholder: "Press kit, creator page, alternate title, or other useful context.",
      short: true,
    }),
  ].join("");

  return [
    renderTextInputField({
      id: "submitShowTitle",
      label: "Show title",
      required: true,
      value: draft.showTitle,
      maxLength: 160,
      placeholder: "e.g., The White Vault",
    }),
    renderLinkListField({
      fieldName: "listenLinks",
      label: "Official or listening link",
      helper: "Add at least one reliable destination. RSS feeds and official websites are especially useful.",
      required: true,
      rows: draft.listenLinks,
      options: LISTEN_LINK_OPTIONS,
      plain: false,
      chooseBeforeAdd: true,
      emptyMessage: "No source link added yet.",
      addOptionsAriaLabel: "Add an official or listening link",
    }),
    renderOptionalDisclosure({
      id: "submitHelpfulDetails",
      title: "Add helpful details (optional)",
      summary: "Creator, contact, tags, status, description, and notes",
      open: draft.helpfulDetailsOpen,
      content: optionalFields,
    }),
  ].join("");
}
