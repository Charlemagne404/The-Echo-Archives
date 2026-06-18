import {
  COMPLETION_STATUS_OPTIONS,
  CORRECTION_TYPE_OPTIONS,
  LISTEN_LINK_OPTIONS,
  MODE_CONFIG,
  MODE_ORDER,
  OFFICIAL_LINK_OPTIONS,
  REVIEW_CONTEXT_OPTIONS,
  REVIEW_STRENGTH_OPTIONS,
  ROLE_OPTIONS,
  SPOILER_LEVEL_OPTIONS,
  VERIFICATION_METHOD_OPTIONS,
} from "./config.js";
import {
  getTagSuggestions,
  normalizeCustomTag,
  renderSearchResultsMarkup,
} from "./search.js";
import {
  escapeAttribute,
  escapeHtml,
  getLinkTypeIcon,
  iconMarkup,
  normalizeLinkTypeClass,
  normalizeOption,
} from "./utils.js";

export function renderModeCardsMarkup(activeMode) {
  return MODE_ORDER.map((mode) => {
    const config = MODE_CONFIG[mode];
    const isActive = mode === activeMode;
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

export function renderModeFields(mode, draft, context) {
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
          helper: "Click a listener link type to add it, then paste the official destination URL.",
          required: true,
          rows: draft.listenLinks,
          options: LISTEN_LINK_OPTIONS,
          plain: false,
          chooseBeforeAdd: true,
          emptyMessage: "No listener links added yet.",
        }),
        renderFormRow([
          renderChipGroupField({
            fieldName: "selectedTags",
            label: "Genres or tags",
            helper: "Choose up to eight tags that help listeners find the show.",
            required: true,
            values: draft.selectedTags,
            options: context.tagOptions,
            menuOpen: context.tagPickerOpen,
            query: context.tagQuery,
            highlightIndex: context.tagHighlightIndex,
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

export function renderRailCard(card) {
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
      ${card.buttonLabel ? `<button type="button" class="submit-rail-help-button" data-open-chat><span class="submit-rail-help-button-icon" aria-hidden="true">${iconMarkup("magnify")}</span><span>${escapeHtml(card.buttonLabel)}</span></button>` : ""}
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
    controlHtml: `
      <div class="submit-textarea-shell">
        <textarea
          id="${id}"
          rows="${rows}"
          maxlength="${maxLength}"
          placeholder="${escapeAttribute(placeholder)}"
          class="${short ? "submit-short-textarea" : ""}"
          ${required ? "required" : ""}
        >${escapeHtml(value)}</textarea>
        <span class="submit-textarea-counter" data-counter-target="${id}">${String(value || "").length}/${maxLength}</span>
      </div>
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

function renderChipGroupField({
  fieldName,
  label,
  values,
  options,
  helper = "",
  required = false,
  menuOpen = false,
  query = "",
  highlightIndex = -1,
}) {
  const tagLimit = fieldName === "selectedTags" ? 8 : Number.POSITIVE_INFINITY;
  const tagLimitReached = values.length >= tagLimit;
  const effectiveQuery = tagLimitReached ? "" : query;
  const selectedValues = new Set(values);
  const suggestions = getTagSuggestions(effectiveQuery, options, values);
  const normalizedQuery = normalizeCustomTag(effectiveQuery);
  const canCreateCustom = Boolean(
    !tagLimitReached &&
    normalizedQuery &&
      !selectedValues.has(normalizedQuery) &&
      !options.some((option) => option.trim().toLowerCase() === normalizedQuery.toLowerCase()),
  );

  return renderFieldShell({
    label,
    required,
    helper,
    controlHtml: `
      <div class="submit-tag-picker" data-tag-picker>
        <div class="submit-tag-picker-input">
          <div class="submit-tag-picker-values">
            ${values.length > 0 ? values.map((option) => `
              <button
                type="button"
                class="submit-chip is-selected"
                data-chip-field="${fieldName}"
                data-chip-value="${escapeAttribute(option)}"
                aria-pressed="true"
              >
                <span>${escapeHtml(option)}</span>
                <span class="submit-chip-close" aria-hidden="true">×</span>
              </button>
            `).join("") : ""}
            <input
              id="submitTagInput"
              class="submit-tag-input"
              type="text"
              value="${escapeAttribute(effectiveQuery)}"
              maxlength="48"
              placeholder="${tagLimitReached ? "8 tags selected" : values.length > 0 ? "Add another tag" : "Select up to 8 tags."}"
              autocomplete="off"
              aria-label="Type a genre or tag"
              ${tagLimitReached ? 'disabled aria-disabled="true"' : ""}
            />
          </div>
          <button
            type="button"
            class="submit-tag-picker-toggle"
            data-toggle-tag-picker
            aria-expanded="${String(menuOpen && !tagLimitReached)}"
            aria-label="Choose genres or tags"
            ${tagLimitReached ? 'disabled aria-disabled="true"' : ""}
          >
            ${iconMarkup("chevron-down")}
          </button>
        </div>
        <div class="submit-tag-picker-menu" ${menuOpen && !tagLimitReached ? "" : "hidden"}>
          <div class="submit-tag-picker-meta">Choose an existing tag or type your own and press Enter.</div>
          ${canCreateCustom ? `
            <button
              type="button"
              class="submit-tag-action"
              data-create-tag="${escapeAttribute(query)}"
            >
              <span class="submit-tag-action-label">Create tag</span>
              <span class="submit-tag-action-value">${escapeHtml(normalizedQuery)}</span>
            </button>
          ` : ""}
          <div class="submit-chip-group submit-chip-group--menu">
            ${suggestions.length > 0 ? suggestions.map((option, index) => `
              <button
                type="button"
                class="submit-chip ${index === highlightIndex ? "is-highlighted" : ""}"
                data-tag-suggestion="${escapeAttribute(option)}"
                aria-pressed="false"
              >
                <span>${escapeHtml(option)}</span>
              </button>
            `).join("") : '<p class="submit-tag-picker-empty">No existing tags match yet. Press Enter to add your own.</p>'}
          </div>
        </div>
        ${tagLimitReached ? `<p class="submit-tag-limit" role="status">Tag limit reached (${values.length}/${tagLimit}). Remove one to add another.</p>` : ""}
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

function renderLinkListField({
  fieldName,
  label,
  rows,
  helper,
  options,
  plain,
  required = false,
  chooseBeforeAdd = false,
  emptyMessage = "",
}) {
  const normalizedRows = Array.isArray(rows) && rows.length > 0
    ? rows
    : plain
      ? [{ url: "" }]
      : chooseBeforeAdd
        ? []
        : [{ label: options[0] || "Website", url: "" }];
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
        <label class="submit-link-source submit-link-source--${escapeAttribute(normalizeLinkTypeClass(row.label))}">
          <span class="submit-link-source-badge" aria-hidden="true">
            <span class="submit-link-source-icon submit-link-source-icon--${escapeAttribute(normalizeLinkTypeClass(row.label))}">${iconMarkup(getLinkTypeIcon(row.label))}</span>
            <span class="submit-link-source-text">${escapeHtml(row.label)}</span>
          </span>
          <select data-link-list="${fieldName}" data-link-part="label" data-link-index="${index}" aria-label="Listen link type">
            ${options.map((option) => `<option value="${escapeAttribute(option)}" ${option === row.label ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
        </label>
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
        ${!plain && chooseBeforeAdd && normalizedRows.length === 0 && emptyMessage
          ? `<p class="submit-link-list-empty">${escapeHtml(emptyMessage)}</p>`
          : ""}
        ${rowMarkup}
        ${!plain && chooseBeforeAdd ? `
          <div class="submit-add-link-options" role="group" aria-label="Add a listener link">
            ${options.map((option) => `
              <button
                type="button"
                class="submit-add-link-option"
                data-add-link-option="${fieldName}"
                data-add-link-value="${escapeAttribute(option)}"
              >
                <span class="submit-link-source-icon submit-link-source-icon--${escapeAttribute(normalizeLinkTypeClass(option))}" aria-hidden="true">${iconMarkup(getLinkTypeIcon(option))}</span>
                <span>${escapeHtml(option)}</span>
              </button>
            `).join("")}
          </div>
        ` : `
          <button type="button" class="submit-add-row" data-add-link="${fieldName}">
            <span class="submit-add-row-icon" aria-hidden="true">${iconMarkup("plus")}</span>
            <span>Add another link</span>
          </button>
        `}
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

function renderFieldShell({ label, required = false, helper = "", controlHtml }) {
  return `
    <div class="submit-field">
      <span class="submit-field-label">
        <span class="submit-field-label-main">
          ${escapeHtml(label)}${required ? '<span class="submit-required" aria-label="Required">*</span>' : ""}
        </span>
      </span>
      ${controlHtml}
      ${helper ? `<p class="submit-field-helper">${escapeHtml(helper)}</p>` : ""}
    </div>
  `;
}
