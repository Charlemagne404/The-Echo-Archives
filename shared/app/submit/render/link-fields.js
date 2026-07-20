import { buildSubmitControlId, escapeAttribute, escapeHtml, getLinkTypeIcon, iconMarkup, normalizeLinkTypeClass } from "../utils.js";
import { getFieldIds, renderFieldShell } from "./base-fields.js";

export function renderLinkListField({
  fieldName,
  label,
  rows,
  helper,
  options,
  plain,
  required = false,
  chooseBeforeAdd = false,
  emptyMessage = "",
  addOptionsAriaLabel = "Add a link",
}) {
  const fieldId = buildSubmitControlId(fieldName);
  const { labelId, helperId, errorId } = getFieldIds(fieldId);
  const normalizedRows = Array.isArray(rows) && rows.length > 0
    ? rows
    : plain
      ? [{ url: "" }]
      : chooseBeforeAdd
        ? []
        : [{ label: options[0] || "Website", url: "" }];
  const rowMarkup = normalizedRows.map((row, index) => {
    const urlId = `${fieldId}Url${index}`;
    const labelSelectId = `${fieldId}Label${index}`;
    if (plain) {
      return `
        <div class="submit-link-row submit-link-row--plain">
          <label class="sr-only" for="${urlId}">${escapeHtml(label)} link ${index + 1}</label>
          <input
            id="${urlId}"
            type="url"
            name="${urlId}"
            value="${escapeAttribute(row.url || "")}"
            placeholder="https://example.com/source"
            data-link-list="${fieldName}"
            data-link-part="url"
            data-link-index="${index}"
            aria-labelledby="${labelId}"
            aria-describedby="${[helper ? helperId : "", errorId].filter(Boolean).join(" ")}"
            aria-errormessage="${errorId}"
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
          <span class="sr-only">Link type for ${escapeHtml(label)} row ${index + 1}</span>
          <select
            id="${labelSelectId}"
            name="${labelSelectId}"
            data-link-list="${fieldName}"
            data-link-part="label"
            data-link-index="${index}"
            aria-labelledby="${labelId}"
            aria-describedby="${[helper ? helperId : "", errorId].filter(Boolean).join(" ")}"
            aria-errormessage="${errorId}"
          >
            ${options.map((option) => `<option value="${escapeAttribute(option)}" ${option === row.label ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
        </label>
        <label class="sr-only" for="${urlId}">${escapeHtml(label)} URL ${index + 1}</label>
        <input
          id="${urlId}"
          type="url"
          name="${urlId}"
          value="${escapeAttribute(row.url || "")}"
          placeholder="https://example.com"
          data-link-list="${fieldName}"
          data-link-part="url"
          data-link-index="${index}"
          aria-labelledby="${labelId}"
          aria-describedby="${[helper ? helperId : "", errorId].filter(Boolean).join(" ")}"
          aria-errormessage="${errorId}"
        />
        <button type="button" class="submit-link-remove" data-remove-link="${fieldName}" data-link-index="${index}" aria-label="Remove link">
          ${iconMarkup("close")}
        </button>
      </div>
    `;
  }).join("");

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
        class="submit-link-list"
        role="group"
        aria-labelledby="${labelId}"
        aria-required="${String(required)}"
        aria-describedby="${[helper ? helperId : "", errorId].filter(Boolean).join(" ")}"
      >
        ${!plain && chooseBeforeAdd && normalizedRows.length === 0 && emptyMessage
          ? `<p class="submit-link-list-empty">${escapeHtml(emptyMessage)}</p>`
          : ""}
        ${rowMarkup}
        ${!plain && chooseBeforeAdd ? `
          <div class="submit-add-link-options" role="group" aria-label="${escapeAttribute(addOptionsAriaLabel)}">
            ${options.map((option) => `
              <button
                type="button"
                class="submit-add-link-option"
                data-add-link-option="${fieldName}"
                data-add-link-value="${escapeAttribute(option)}"
                aria-describedby="${errorId}"
              >
                <span class="submit-link-source-icon submit-link-source-icon--${escapeAttribute(normalizeLinkTypeClass(option))}" aria-hidden="true">${iconMarkup(getLinkTypeIcon(option))}</span>
                <span>${escapeHtml(option)}</span>
              </button>
            `).join("")}
          </div>
        ` : `
          <button type="button" class="submit-add-row" data-add-link="${fieldName}" aria-describedby="${errorId}">
            <span class="submit-add-row-icon" aria-hidden="true">${iconMarkup("plus")}</span>
            <span>Add another link</span>
          </button>
        `}
      </div>
    `,
  });
}
