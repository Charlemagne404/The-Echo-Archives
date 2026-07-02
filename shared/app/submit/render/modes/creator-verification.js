import { OFFICIAL_LINK_OPTIONS, ROLE_OPTIONS, VERIFICATION_METHOD_OPTIONS } from "../../config.js";
import { renderExistingShowField, renderSegmentedField } from "../choice-fields.js";
import { renderFormRow, renderSelectField, renderTextInputField, renderTextareaField } from "../base-fields.js";
import { renderLinkListField } from "../link-fields.js";

export function renderCreatorVerificationMode(draft, context) {
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
      label: "Official links (add at least one)",
      helper: "Click an official link type to add it, then paste the official destination URL.",
      required: true,
      rows: draft.officialLinks,
      options: OFFICIAL_LINK_OPTIONS,
      plain: false,
      chooseBeforeAdd: true,
      emptyMessage: "No official links added yet.",
      addOptionsAriaLabel: "Add an official link",
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
}
