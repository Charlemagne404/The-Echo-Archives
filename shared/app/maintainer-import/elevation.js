import {
  createMaintainerElevationFactualDraft,
  fetchMaintainerElevation,
  fetchMaintainerElevationBrief,
  fetchMaintainerElevations,
  publishMaintainerElevationReview,
  saveMaintainerElevationReviewDraft,
} from "../maintainer/api.js";
import { escapeHtml } from "./format.js";

function listValue(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function renderCards(items, target, selectedId) {
  if (!items.length) return '<p class="maintainer-panel-meta">No entries currently qualify for this elevation path.</p>';
  return items.map((item) => `
    <article class="import-match-card ${item.showId === selectedId ? "is-selected" : ""}">
      <div class="import-match-card-top"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(String(item.score))} priority</span></div>
      <p>${escapeHtml(item.reviewStatus)} → ${escapeHtml(target)}</p>
      <p>${escapeHtml(item.factors.join(" · ") || "Needs a closer review.")}</p>
      ${item.blockers.length ? `<p><strong>Blocked:</strong> ${escapeHtml(item.blockers.join("; "))}</p>` : ""}
      <button type="button" class="maintainer-ghost-button" data-elevation-select="${escapeHtml(item.showId)}" data-elevation-target="${escapeHtml(target)}">Open elevation</button>
    </article>
  `).join("");
}

function renderCollectionControls(collections = []) {
  return collections.map((collection) => `
    <label class="maintainer-checkbox">
      <input type="checkbox" name="collection" value="${escapeHtml(collection.id)}" ${collection.selected ? "checked" : ""} />
      <span>${escapeHtml(collection.title)}</span>
      <input type="text" name="collection-reason-${escapeHtml(collection.id)}" value="${escapeHtml(collection.reason || "")}" placeholder="Why this belongs here" />
    </label>
  `).join("");
}

function renderDetail(detail, target, reviewer) {
  const show = detail.show;
  const review = detail.review || {};
  const factualStatus = detail.factualCurrent ? "Current factual review" : "Factual review required before full-review publication";
  return `
    <div class="maintainer-detail-stack">
      <div class="maintainer-detail-header"><div><h3>${escapeHtml(show.title)}</h3><p>${escapeHtml(show.reviewStatus)} · ${escapeHtml(factualStatus)}</p></div></div>
      <div class="maintainer-detail-badges">${(detail.editorialMissing || []).map((item) => `<span class="maintainer-badge is-warning">Needs ${escapeHtml(item)}</span>`).join("")}</div>
      <div class="maintainer-toolbar-actions">
        ${["imported", "planned"].includes(show.reviewStatus) ? '<button type="button" class="maintainer-primary-button" data-elevation-action="factual">Create factual elevation draft</button>' : ""}
        <button type="button" class="maintainer-ghost-button" data-elevation-action="brief">Copy Codex brief</button>
      </div>
      <p class="maintainer-panel-meta">A factual elevation opens a protected importer update draft. Review its source evidence, save any factual edits there, confirm factual review, and promote it to indexed-only.</p>
      <form id="maintainerElevationReviewForm" class="maintainer-review-form">
        <input name="reviewedBy" type="hidden" value="${escapeHtml(reviewer)}" />
        <label class="maintainer-field"><span>Archive rating (0–10)</span><input name="archiveRating" type="number" min="0" max="10" step="0.1" value="${escapeHtml(String(show.ratings?.archive ?? ""))}" /></label>
        <label class="maintainer-field"><span>Archive take</span><textarea name="archiveTake" rows="3">${escapeHtml(review.archiveTake || "")}</textarea></label>
        <label class="maintainer-field"><span>Spoiler-safe review (separate paragraphs with blank lines)</span><textarea name="spoilerFreeReview" rows="8">${escapeHtml((review.spoilerFreeReview || []).join("\n\n"))}</textarea></label>
        <label class="maintainer-field"><span>Further thoughts (optional; separate paragraphs with blank lines)</span><textarea name="thoughts" rows="5">${escapeHtml((review.thoughts || []).join("\n\n"))}</textarea></label>
        <div class="maintainer-review-grid">
          <label class="maintainer-field"><span>Quote (optional)</span><input name="quoteText" value="${escapeHtml(review.quote?.text || "")}" /></label>
          <label class="maintainer-field"><span>Quote attribution</span><input name="quoteAttribution" value="${escapeHtml(review.quote?.attribution || "")}" /></label>
        </div>
        <div class="maintainer-review-grid">
          <label class="maintainer-field"><span>Tones</span><input name="tones" value="${escapeHtml(listValue(show.tones))}" placeholder="Atmospheric, Tense" /></label>
          <label class="maintainer-field"><span>Formats</span><input name="formats" value="${escapeHtml(listValue(show.formats))}" placeholder="Serialized, Full cast" /></label>
          <label class="maintainer-field"><span>Best for</span><input name="bestFor" value="${escapeHtml(listValue(show.bestFor))}" placeholder="Long walks, late-night listening" /></label>
        </div>
        <label class="maintainer-field"><span>Similar show IDs (3–5)</span><input name="similarTo" value="${escapeHtml(listValue(show.similarTo))}" placeholder="show-id-one, show-id-two" /></label>
        <label class="maintainer-field"><span>Similar-show reasons (one per line: show-id: reason)</span><textarea name="similarReasonsText" rows="5">${escapeHtml((show.similarTo || []).map((id) => `${id}: ${show.similarReasons?.[id] || ""}`).join("\n"))}</textarea></label>
        <section class="maintainer-detail-section"><h3>Collection placement</h3><p class="maintainer-panel-meta">Choose at least two collections for a full review and record why the show belongs in each.</p>${renderCollectionControls(detail.collections)}</section>
        <div class="maintainer-review-actions"><button class="maintainer-primary-button" type="submit" name="elevationAction" value="save">Save editorial draft</button><button class="maintainer-secondary-button" type="submit" name="elevationAction" value="publish">Publish full review</button></div>
      </form>
    </div>
  `;
}

function formPayload(form) {
  const formData = new FormData(form);
  const similarTo = String(formData.get("similarTo") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const suppliedReasons = String(formData.get("similarReasonsText") || "").split("\n").map((line) => line.split(/:\s*/, 2)).filter(([id]) => id?.trim());
  const reasonMap = new Map(suppliedReasons.map(([id, reason]) => [id.trim(), String(reason || "").trim()]));
  const similarReasons = Object.fromEntries(similarTo.map((id) => [id, reasonMap.get(id) || ""]));
  const collections = [...form.querySelectorAll('input[name="collection"]:checked')].map((input) => ({ id: input.value, reason: String(formData.get(`collection-reason-${input.value}`) || "").trim() }));
  return {
    archiveRating: String(formData.get("archiveRating") || ""), archiveTake: formData.get("archiveTake"), spoilerFreeReview: formData.get("spoilerFreeReview"), thoughts: formData.get("thoughts"), quoteText: formData.get("quoteText"), quoteAttribution: formData.get("quoteAttribution"),
    tones: formData.get("tones"), formats: formData.get("formats"), bestFor: formData.get("bestFor"), similarTo, similarReasons, collections,
  };
}

export function bindElevationDesk({ container, getReviewer, onAuthError, onStatus } = {}) {
  if (!container) return { load() {}, abort() {} };
  let controller = null;
  let selectedId = "";
  let selectedTarget = "indexed-only";
  const render = (html) => { container.innerHTML = html; };

  async function load() {
    controller?.abort();
    controller = new AbortController();
    try {
      const [indexed, full] = await Promise.all([
        fetchMaintainerElevations("indexed-only", { signal: controller.signal }),
        fetchMaintainerElevations("full-review", { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      render(`
        <div class="maintainer-toolbar-heading"><div><p class="maintainer-kicker">Elevation desk</p><h2>What to flesh out next</h2></div><p class="maintainer-toolbar-meta">Balanced ranking uses source readiness and discovery coverage, never unverified popularity.</p></div>
        <div class="maintainer-import-grid"><section><h3>Fact-check to indexed-only</h3>${renderCards(indexed.items, "indexed-only", selectedId)}</section><section><h3>Build a full review</h3>${renderCards(full.items, "full-review", selectedId)}</section></div>
        <section id="maintainerElevationDetail" class="maintainer-detail-section">${selectedId ? "Loading selected elevation…" : "<p class=\"maintainer-panel-meta\">Select an entry to prepare a factual elevation or editorial review draft.</p>"}</section>
      `);
      if (selectedId) await loadDetail();
      container.querySelectorAll("[data-elevation-select]").forEach((button) => button.addEventListener("click", async () => {
        selectedId = button.dataset.elevationSelect || "";
        selectedTarget = button.dataset.elevationTarget || "indexed-only";
        await load();
      }));
    } catch (error) {
      if (error.name === "AbortError") return;
      if (error.name === "MaintainerAuthError") return onAuthError?.(error);
      render(`<p class="maintainer-panel-meta">${escapeHtml(error.message || "Failed to load elevation candidates.")}</p>`);
    }
  }

  async function loadDetail() {
    const detailContainer = container.querySelector("#maintainerElevationDetail");
    if (!detailContainer || !selectedId) return;
    try {
      const detail = await fetchMaintainerElevation(selectedId, { signal: controller?.signal });
      detailContainer.innerHTML = renderDetail(detail, selectedTarget, getReviewer?.() || "");
      bindDetailActions(detailContainer);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (error.name === "MaintainerAuthError") return onAuthError?.(error);
      detailContainer.innerHTML = `<p class="maintainer-panel-meta">${escapeHtml(error.message || "Failed to load elevation detail.")}</p>`;
    }
  }

  function bindDetailActions(detailContainer) {
    detailContainer.querySelector('[data-elevation-action="factual"]')?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await createMaintainerElevationFactualDraft(selectedId, { reviewedBy: getReviewer?.() || "" });
        onStatus?.("Factual elevation draft queued. Opening it in the importer workspace…");
        window.location.assign(`/maintainer/imports.html?q=${encodeURIComponent(result.candidateIds?.[0] || "")}`);
      } catch (error) {
        if (error.name === "MaintainerAuthError") return onAuthError?.(error);
        onStatus?.(error.message || "Failed to create factual elevation draft.");
        button.disabled = false;
      }
    });
    detailContainer.querySelector('[data-elevation-action="brief"]')?.addEventListener("click", async () => {
      try {
        const { brief } = await fetchMaintainerElevationBrief(selectedId, selectedTarget);
        await navigator.clipboard.writeText(brief);
        onStatus?.("Codex brief copied to the clipboard.");
      } catch (error) {
        onStatus?.(error.message || "Could not copy the Codex brief.");
      }
    });
    detailContainer.querySelector("#maintainerElevationReviewForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const action = event.submitter?.value || "save";
      try {
        await saveMaintainerElevationReviewDraft(selectedId, formPayload(form));
        if (action === "publish") await publishMaintainerElevationReview(selectedId, { reviewedBy: getReviewer?.() || "" });
        onStatus?.(action === "publish" ? "Full review published." : "Editorial draft saved.");
        await load();
      } catch (error) {
        if (error.name === "MaintainerAuthError") return onAuthError?.(error);
        onStatus?.(error.message || "Failed to save elevation draft.");
      }
    });
  }

  return { load, abort: () => controller?.abort() };
}
