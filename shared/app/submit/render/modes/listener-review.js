import { REVIEW_CONTEXT_OPTIONS, REVIEW_STRENGTH_OPTIONS, SPOILER_LEVEL_OPTIONS } from "../../config.js";
import { renderChipGroupField, renderExistingShowField, renderRatingField, renderSegmentedField } from "../choice-fields.js";
import { renderFormRow, renderTextInputField, renderTextareaField } from "../base-fields.js";

export function renderListenerReviewMode(draft, context) {
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
}
