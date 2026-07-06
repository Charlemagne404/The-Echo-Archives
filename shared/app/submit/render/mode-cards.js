import { MODE_CONFIG, MODE_ORDER } from "../config.js";
import { escapeHtml, iconMarkup } from "../utils.js";

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
        tabindex="${isActive ? "0" : "-1"}"
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
