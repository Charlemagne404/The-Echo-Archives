import { escapeHtml, iconMarkup } from "../utils.js";

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
