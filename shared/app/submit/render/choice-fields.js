import { getTagSuggestions, normalizeCustomTag, renderSearchResultsMarkup } from "../search.js";
import { escapeAttribute, escapeHtml, iconMarkup, normalizeOption } from "../utils.js";
import { renderFieldShell } from "./base-fields.js";

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
  const tagLimit = selectionLimit;
  const tagLimitReached = values.length >= tagLimit;
  const isActiveField = activeField === fieldName;
  const effectiveQuery = tagLimitReached || !isActiveField ? "" : query;
  const selectedValues = new Set(values);
  const suggestions = getTagSuggestions(effectiveQuery, options, values);
  const normalizedQuery = normalizeCustomTag(effectiveQuery);
  const canCreateCustom = Boolean(
    allowCustom &&
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
      <div class="submit-tag-picker" data-tag-picker="${fieldName}">
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
              id="submitTagInput-${fieldName}"
              class="submit-tag-input"
              type="text"
              value="${escapeAttribute(effectiveQuery)}"
              maxlength="48"
              placeholder="${escapeAttribute(placeholder || (tagLimitReached ? `${values.length} selected` : values.length > 0 ? "Add another option" : "Select from the archive list."))}"
              autocomplete="off"
              aria-label="${escapeAttribute(inputLabel || `Type a ${String(label).replace(/\s+\(optional\)$/i, "").toLowerCase()} option`)}"
              data-tag-input="${fieldName}"
              ${tagLimitReached ? 'disabled aria-disabled="true"' : ""}
            />
          </div>
          <button
            type="button"
            class="submit-tag-picker-toggle"
            data-toggle-tag-picker="${fieldName}"
            aria-expanded="${String(menuOpen && !tagLimitReached && isActiveField)}"
            aria-label="Choose ${escapeAttribute(String(label).replace(/\s+\(optional\)$/i, "").toLowerCase())}"
            ${tagLimitReached ? 'disabled aria-disabled="true"' : ""}
          >
            ${iconMarkup("chevron-down")}
          </button>
        </div>
        <div class="submit-tag-picker-menu" ${menuOpen && !tagLimitReached && isActiveField ? "" : "hidden"}>
          <div class="submit-tag-picker-meta">${allowCustom ? "Choose an existing tag or type your own and press Enter." : "Choose one or more options from the archive list."}</div>
          ${canCreateCustom ? `
            <button
              type="button"
              class="submit-tag-action"
              data-create-tag="${escapeAttribute(query)}"
              data-tag-field="${fieldName}"
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
                data-tag-field="${fieldName}"
                aria-pressed="false"
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

export function renderExistingShowField({ label, value, helper, searchResults, searchOpen, selectedShowId, required = false }) {
  return renderFieldShell({
    label,
    required,
    helper,
    controlHtml: `
      <div class="submit-search-shell ${selectedShowId ? "is-selected" : ""}">
        <div class="submit-search-control">
          <input
            id="submitExistingShowSearch"
            type="text"
            value="${escapeAttribute(value)}"
            maxlength="160"
            placeholder="Start typing a show title"
            autocomplete="off"
            aria-expanded="${String(searchOpen)}"
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
            >
              ${iconMarkup("chevron-down")}
            </button>
          </div>
        </div>
        <div id="submitExistingShowSearchResults" class="submit-search-results" ${searchOpen ? "" : "hidden"}>
          ${searchOpen ? renderSearchResultsMarkup(searchResults, selectedShowId, value) : ""}
        </div>
      </div>
    `,
  });
}

export function renderRatingField(ratingStars) {
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
