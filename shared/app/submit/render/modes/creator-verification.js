import { OFFICIAL_LINK_OPTIONS, ROLE_OPTIONS, VERIFICATION_METHOD_OPTIONS } from "../../config.js";
import { renderExistingShowField, renderSegmentedField } from "../choice-fields.js";
import { renderFormRow, renderSelectField, renderTextInputField, renderTextareaField } from "../base-fields.js";
import { renderLinkListField } from "../link-fields.js";
import { renderOptionalDisclosure, renderShowContext } from "../supporting.js";

function renderEvidenceFields(draft) {
  switch (draft.verificationMethod) {
    case "official-domain-email":
      return renderTextInputField({
        id: "submitContactEmail",
        label: "Official-domain email",
        required: true,
        type: "email",
        value: draft.contactEmail,
        maxLength: 160,
        placeholder: "name@official-show-domain.com",
        autocomplete: "email",
        helper: "Domain matching helps review but never creates automatic verification.",
      });
    case "website":
      return renderTextInputField({
        id: "submitProofUrl",
        label: "Official website proof URL",
        required: true,
        type: "url",
        value: draft.proofUrl,
        maxLength: 500,
        placeholder: "https://example.com/about",
      });
    case "social-account":
      return renderTextInputField({
        id: "submitProofUrl",
        label: "Official social profile URL",
        required: true,
        type: "url",
        value: draft.proofUrl,
        maxLength: 500,
        placeholder: "https://social.example.com/official-profile",
      });
    case "press-kit":
      return renderTextInputField({
        id: "submitProofUrl",
        label: "Public press-kit URL",
        required: true,
        type: "url",
        value: draft.proofUrl,
        maxLength: 500,
        placeholder: "https://example.com/press-kit",
      });
    default:
      return [
        renderFormRow([
          renderTextInputField({
            id: "submitProofUrl",
            label: "Evidence URL (optional)",
            type: "url",
            value: draft.proofUrl,
            maxLength: 500,
            placeholder: "https://example.com/proof",
          }),
          renderTextInputField({
            id: "submitContactEmail",
            label: "Contact email (optional)",
            type: "email",
            value: draft.contactEmail,
            maxLength: 160,
            placeholder: "you@example.com",
            autocomplete: "email",
            helper: "Provide this or an evidence URL.",
          }),
        ]),
        renderTextareaField({
          id: "submitEvidenceDescription",
          label: "How can we verify your association?",
          required: true,
          value: draft.evidenceDescription,
          maxLength: 1000,
          rows: 4,
          helper: "Describe the proof and provide either the URL or email above.",
          placeholder: "Explain the official channel or evidence we should check.",
          short: true,
        }),
      ].join("");
  }
}

export function renderCreatorVerificationMode(draft, context) {
  const optionalFields = [
    renderTextareaField({
      id: "submitPreferredDescription",
      label: "Preferred official description (optional)",
      value: draft.preferredDescription,
      maxLength: 1000,
      rows: 5,
      helper: "Add this only when the official description should be updated.",
      placeholder: "Paste the official short description.",
    }),
    renderLinkListField({
      fieldName: "officialLinks",
      label: "Official links to confirm or update (optional)",
      helper: "Add only destinations that should be added, confirmed, or changed.",
      rows: draft.officialLinks,
      options: OFFICIAL_LINK_OPTIONS,
      plain: false,
      chooseBeforeAdd: true,
      emptyMessage: "No official link changes added.",
      addOptionsAriaLabel: "Add an official link update",
    }),
    renderTextareaField({
      id: "submitVerificationNotes",
      label: "Additional notes (optional)",
      value: draft.optionalNotes,
      maxLength: 1000,
      rows: 4,
      placeholder: "Anything else that helps the verification review.",
      short: true,
    }),
  ].join("");

  return [
    renderExistingShowField({
      label: "Archive entry / show",
      required: true,
      value: draft.showSearch,
      helper: "Search and select the archive entry this request applies to.",
      searchResults: context.searchResults,
      searchOpen: context.searchOpen,
      selectedShowId: draft.existingShowId,
      lookupStatus: context.lookupStatus,
      lookupMessage: context.lookupMessage,
      highlightIndex: context.showHighlightIndex,
    }),
    renderShowContext(context),
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
      }),
    ]),
    renderSegmentedField({
      fieldName: "verificationMethod",
      label: "Verification method",
      required: true,
      value: draft.verificationMethod,
      helper: "Choose the strongest official proof you can provide.",
      options: VERIFICATION_METHOD_OPTIONS,
      wide: true,
    }),
    `<section id="submitVerificationEvidence" class="submit-conditional-fields" aria-label="Verification evidence">${renderEvidenceFields(draft)}</section>`,
    renderTextareaField({
      id: "submitRequestedUpdates",
      label: "Facts to confirm or update",
      required: true,
      value: draft.requestedUpdates,
      maxLength: 1000,
      rows: 5,
      helper: "Describe factual links, status, artwork, credits, or metadata—not ratings or editorial opinions.",
      placeholder: "Describe the factual details that should be confirmed or updated.",
    }),
    renderOptionalDisclosure({
      id: "submitAdditionalVerification",
      title: "Add proposed official details (optional)",
      summary: "Description, link updates, and notes",
      open: draft.additionalVerificationOpen,
      content: optionalFields,
    }),
  ].join("");
}
