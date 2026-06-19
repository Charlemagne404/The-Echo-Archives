import { escapeAttribute, escapeHtml, normalizeOption } from "../utils.js";

export function renderFormRow(children, single = false) {
  return `<div class="submit-form-row ${single ? "submit-form-row--single" : ""}">${children.join("")}</div>`;
}

export function renderTextInputField({
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

export function renderTextareaField({
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

export function renderSelectField({ id, label, value, options, required = false, helper = "" }) {
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

export function renderFieldShell({ label, required = false, helper = "", controlHtml }) {
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
