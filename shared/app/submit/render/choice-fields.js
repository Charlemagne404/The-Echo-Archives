import { getTagSuggestions, normalizeCustomTag, renderSearchResultsMarkup } from "../search.js";
import { buildSubmitControlId, escapeAttribute, escapeHtml, iconMarkup, normalizeOption } from "../utils.js";
import { getFieldIds, renderFieldShell } from "./base-fields.js";

export function renderChipGroupField({
  fieldName,
  label,
  values,
  options,
  helper = "",
  required = false,
  menuOpen = false,
  query = "",
  highlightIndex = -1,
  activeField = "",
  allowCustom = true,
  inputLabel = "",
  placeholder = "",
  selectionLimit = fieldName === "selectedTags" ? 8 : Number.POSITIVE_INFINITY,
}) {
  const fieldId = buildSubmitControlId(fieldName);
  const inputId = `${fieldId}Input`;
  const menuId = `${fieldId}Menu`;
  const toggleId = `${fieldId}Toggle`;
  const { labelId, helperId, errorId } = getFieldIds(fieldId);
  const tagLimit = selectionLimit;
  const tagLimitReached = values.length >= tagLimit;
  const isActiveField = activeField === fieldName;
  const effectiveQuery = tagLimitReached || !isActiveField ? "" : query;
  const selectedValues = new Set(values);
  const suggestions = getTagSuggestions(effectiveQuery, options, values);
  const normalizedQuery = normalizeCustomTag(effectiveQuery);
  const activeOptionId = menuOpen && !tagLimitReached && isActiveField && highlightIndex >= 0
    ? `${menuId}Option${highlightIndex}`
    : "";
  const canCreateCustom = Boolean(
    allowCustom &&
      !tagLimitReached &&
      normalizedQuery &&
      !selectedValues.has(normalizedQuery) &&
      !options.some((option) => option.trim().toLowerCase() === normalizedQuery.toLowerCase()),
  );

  return renderFieldShell({
    fieldId,
    labelId,
    helperId,
    errorId,
    useLabelTag: false,
    label,
    required,
    helper,
    controlHtml: `
      <div
        id="${fieldId}"
        class="submit-tag-picker"
        data-tag-picker="${fieldName}"
        aria-describedby="${[helper ? helperId : "", errorId].filter(Boolean).join(" ")}"
      >
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
              id="${inputId}"
              class="submit-tag-input"
              type="text"
              name="${inputId}"
              role="combobox"
              value="${escapeAttribute(effectiveQuery)}"
              maxlength="48"
              placeholder="${escapeAttribute(placeholder || (tagLimitReached ? `${values.length} selected` : values.length > 0 ? "Add another option" : "Select from the archive list."))}"
              autocomplete="off"
              aria-labelledby="${labelId}"
              aria-describedby="${[helper ? helperId : "", errorId].filter(Boolean).join(" ")}"
              aria-label="${escapeAttribute(inputLabel || `Type a ${String(label).replace(/\s+\(optional\)$/i, "").toLowerCase()} option`)}"
              aria-autocomplete="list"
              aria-controls="${menuId}"
              aria-expanded="${String(menuOpen && !tagLimitReached && isActiveField)}"
              aria-haspopup="listbox"
              ${activeOptionId ? `aria-activedescendant="${activeOptionId}"` : ""}
              aria-errormessage="${errorId}"
              data-tag-input="${fieldName}"
              ${tagLimitReached ? 'disabled aria-disabled="true"' : ""}
            />
          </div>
          <button
            id="${toggleId}"
            type="button"
            class="submit-tag-picker-toggle"
            data-toggle-tag-picker="${fieldName}"
            aria-expanded="${String(menuOpen && !tagLimitReached && isActiveField)}"
            aria-controls="${menuId}"
            aria-haspopup="listbox"
            aria-label="Choose ${escapeAttribute(String(label).replace(/\s+\(optional\)$/i, "").toLowerCase())}"
            ${tagLimitReached ? 'disabled aria-disabled="true"' : ""}
          >
            ${iconMarkup("chevron-down")}
          </button>
        </div>
        <div id="${menuId}" class="submit-tag-picker-menu" role="listbox" aria-labelledby="${labelId}" ${menuOpen && !tagLimitReached && isActiveField ? "" : "hidden"}>
          <div class="submit-tag-picker-meta">${allowCustom ? "Choose an existing tag or type your own and press Enter." : "Choose one or more options from the archive list."}</div>
          ${canCreateCustom ? `
            <button
              type="button"
              class="submit-tag-action"
              data-create-tag="${escapeAttribute(query)}"
              data-tag-field="${fieldName}"
              role="option"
              aria-selected="false"
            >
              <span class="submit-tag-action-label">Create tag</span>
              <span class="submit-tag-action-value">${escapeHtml(normalizedQuery)}</span>
            </button>
          ` : ""}
          <div class="submit-chip-group submit-chip-group--menu">
            ${suggestions.length > 0 ? suggestions.map((option, index) => `
              <button
                id="${menuId}Option${index}"
                type="button"
                class="submit-chip ${index === highlightIndex ? "is-highlighted" : ""}"
                data-tag-suggestion="${escapeAttribute(option)}"
                data-tag-field="${fieldName}"
                aria-pressed="false"
                role="option"
                aria-selected="${String(index === highlightIndex)}"
              >
                <span>${escapeHtml(option)}</span>
              </button>
            `).join("") : `<p class="submit-tag-picker-empty">${allowCustom ? "No existing tags match yet. Press Enter to add your own." : "No matching options yet."}</p>`}
          </div>
        </div>
        ${Number.isFinite(tagLimit) && tagLimitReached ? `<p class="submit-tag-limit" role="status">Tag limit reached (${values.length}/${tagLimit}). Remove one to add another.</p>` : ""}
      </div>
    `,
  });
}

export function renderSegmentedField({ fieldName, label, value, options, helper = "", required = false, wide = false }) {
  const fieldId = buildSubmitControlId(fieldName);
  const { labelId, helperId, errorId } = getFieldIds(fieldId);
  return renderFieldShell({
    fieldId,
    labelId,
    helperId,
    errorId,
    useLabelTag: false,
    label,
    required,
    helper,
    controlHtml: `
      <div
        id="${fieldId}"
        class="submit-segmented ${wide ? "submit-segmented--wide" : ""}"
        role="radiogroup"
        aria-labelledby="${labelId}"
        aria-describedby="${[helper ? helperId : "", errorId].filter(Boolean).join(" ")}"
        aria-errormessage="${errorId}"
      >
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
              role="radio"
              aria-checked="${String(isSelected)}"
              tabindex="${isSelected ? "0" : "-1"}"
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

export function renderExistingShowField({
  label,
  value,
  helper,
  searchResults,
  searchOpen,
  selectedShowId,
  required = false,
  lookupStatus = "ready",
  lookupMessage = "",
  highlightIndex = -1,
}) {
  const fieldId = "submitExistingShowSearch";
  const resultsId = `${fieldId}Results`;
  const { labelId, helperId, errorId } = getFieldIds(fieldId);
  const lookupReady = lookupStatus === "ready";
  const activeOptionId = lookupReady && searchOpen && highlightIndex >= 0
    ? `${resultsId}Option${highlightIndex}`
    : "";
  return renderFieldShell({
    fieldId,
    labelId,
    helperId,
    errorId,
    label,
    required,
    helper,
    controlHtml: `
      <div class="submit-search-shell ${selectedShowId ? "is-selected" : ""}">
        <div class="submit-search-control">
          <input
            id="${fieldId}"
            name="${fieldId}"
            type="text"
            value="${escapeAttribute(value)}"
            maxlength="160"
            placeholder="Start typing a show title"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="${String(searchOpen)}"
            aria-controls="${resultsId}"
            ${activeOptionId ? `aria-activedescendant="${activeOptionId}"` : ""}
            aria-labelledby="${labelId}"
            aria-describedby="${[helper ? helperId : "", errorId].filter(Boolean).join(" ")}"
            aria-errormessage="${errorId}"
            ${lookupReady ? "" : 'disabled aria-disabled="true"'}
            ${required ? "required" : ""}
          />
          <div class="submit-search-actions">
            ${value ? `
              <button
                type="button"
                class="submit-search-action"
                data-clear-existing-show
                aria-label="Clear selected show"
              >
                ${iconMarkup("close")}
              </button>
            ` : ""}
            <button
              type="button"
              class="submit-search-action ${searchOpen ? "is-open" : ""}"
              data-toggle-show-search
              aria-label="${searchOpen ? "Collapse show suggestions" : "Expand show suggestions"}"
              aria-expanded="${String(searchOpen)}"
              aria-controls="${resultsId}"
              ${lookupReady ? "" : 'disabled aria-disabled="true"'}
            >
              ${iconMarkup("chevron-down")}
            </button>
          </div>
        </div>
        <div class="submit-lookup-status" data-state="${escapeAttribute(lookupStatus)}" role="${lookupStatus === "error" ? "alert" : "status"}" aria-live="polite">
          <span>${lookupReady ? "" : escapeHtml(lookupMessage)}</span>
          ${lookupStatus === "error" ? '<button type="button" class="submit-lookup-retry" data-retry-submit-lookup>Retry archive lookup</button>' : ""}
        </div>
        <div id="${resultsId}" class="submit-search-results" role="listbox" aria-labelledby="${labelId}" ${searchOpen ? "" : "hidden"}>
          ${searchOpen ? renderSearchResultsMarkup(searchResults, selectedShowId, value, highlightIndex) : ""}
        </div>
      </div>
    `,
  });
}

export function renderRatingField(ratingStars) {
  const fieldId = "submitRatingStars";
  const { labelId, helperId, errorId } = getFieldIds(fieldId);
  return renderFieldShell({
    fieldId,
    labelId,
    helperId,
    errorId,
    useLabelTag: false,
    label: "Listener rating",
    required: true,
    helper: "How would you rate this show overall?",
    controlHtml: `
      <div class="submit-rating-control">
        <div
          id="${fieldId}"
          class="submit-star-row"
          role="radiogroup"
          aria-labelledby="${labelId}"
          aria-describedby="${helperId} ${errorId}"
          aria-errormessage="${errorId}"
        >
          ${Array.from({ length: 5 }, (_unused, index) => {
            const starValue = index + 1;
            const isSelected = starValue === ratingStars;
            const isTabStop = isSelected || (!ratingStars && starValue === 1);
            return `
              <button
                type="button"
                class="submit-star-button ${starValue <= ratingStars ? "is-active" : ""}"
                data-rating-stars="${starValue}"
                role="radio"
                aria-checked="${String(isSelected)}"
                aria-label="${starValue} out of 5 stars"
                tabindex="${isTabStop ? "0" : "-1"}"
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
