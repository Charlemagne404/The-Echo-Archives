import { escapeAttribute, escapeHtml, normalizeOption } from "../utils.js";

export function renderFormRow(children, single = false) {
  return `<div class="submit-form-row ${single ? "submit-form-row--single" : ""}">${children.join("")}</div>`;
}

export function getFieldIds(fieldId = "") {
  const normalized = String(fieldId || "submitField").replace(/[^A-Za-z0-9_-]/g, "");
  return {
    labelId: `${normalized}Label`,
    helperId: `${normalized}Help`,
    errorId: `${normalized}Error`,
  };
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
  const { labelId, helperId, errorId } = getFieldIds(id);
  return renderFieldShell({
    fieldId: id,
    labelId,
    helperId,
    errorId,
    label,
    required,
    helper,
    controlHtml: `
      <input
        id="${id}"
        name="${id}"
        type="${type}"
        value="${escapeAttribute(value)}"
        maxlength="${maxLength}"
        placeholder="${escapeAttribute(placeholder)}"
        autocomplete="${autocomplete}"
        aria-labelledby="${labelId}"
        ${helper ? `aria-describedby="${helperId}"` : ""}
        aria-errormessage="${errorId}"
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
  const { labelId, helperId, errorId } = getFieldIds(id);
  const counterId = `${id}Count`;
  const describedBy = [helper ? helperId : "", counterId].filter(Boolean).join(" ");
  return renderFieldShell({
    fieldId: id,
    labelId,
    helperId,
    errorId,
    label,
    required,
    helper,
    controlHtml: `
      <div class="submit-textarea-shell">
        <textarea
          id="${id}"
          name="${id}"
          rows="${rows}"
          maxlength="${maxLength}"
          placeholder="${escapeAttribute(placeholder)}"
          class="${short ? "submit-short-textarea" : ""}"
          aria-labelledby="${labelId}"
          aria-describedby="${describedBy}"
          aria-errormessage="${errorId}"
          ${required ? "required" : ""}
        >${escapeHtml(value)}</textarea>
        <span id="${counterId}" class="submit-textarea-counter" data-counter-target="${id}">${String(value || "").length}/${maxLength}</span>
      </div>
    `,
  });
}

export function renderSelectField({ id, label, value, options, required = false, helper = "" }) {
  const { labelId, helperId, errorId } = getFieldIds(id);
  return renderFieldShell({
    fieldId: id,
    labelId,
    helperId,
    errorId,
    label,
    required,
    helper,
    controlHtml: `
      <select
        id="${id}"
        name="${id}"
        aria-labelledby="${labelId}"
        ${helper ? `aria-describedby="${helperId}"` : ""}
        aria-errormessage="${errorId}"
        ${required ? "required" : ""}
      >
        ${options.map((option) => {
          const normalized = normalizeOption(option);
          return `<option value="${escapeAttribute(normalized.value)}" ${normalized.value === value ? "selected" : ""}>${escapeHtml(normalized.label)}</option>`;
        }).join("")}
      </select>
    `,
  });
}

export function renderFieldShell({ fieldId = "", labelId = "", helperId = "", errorId = "", label, required = false, helper = "", controlHtml, useLabelTag = true }) {
  const labelTag = fieldId && useLabelTag ? "label" : "span";
  return `
    <div class="submit-field" ${fieldId ? `data-field-shell="${fieldId}"` : ""}>
      <${labelTag} class="submit-field-label" ${fieldId && useLabelTag ? `for="${fieldId}"` : ""} ${labelId ? `id="${labelId}"` : ""}>
        <span class="submit-field-label-main">
          ${escapeHtml(label)}${required ? '<span class="submit-required" aria-label="Required">*</span>' : ""}
        </span>
      </${labelTag}>
      ${controlHtml}
      ${helper ? `<p id="${helperId}" class="submit-field-helper">${escapeHtml(helper)}</p>` : ""}
      ${errorId ? `<p id="${errorId}" class="submit-field-error" hidden></p>` : ""}
    </div>
  `;
}
