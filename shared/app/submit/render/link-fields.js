import { escapeAttribute, escapeHtml, getLinkTypeIcon, iconMarkup, normalizeLinkTypeClass } from "../utils.js";
import { renderFieldShell } from "./base-fields.js";

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
