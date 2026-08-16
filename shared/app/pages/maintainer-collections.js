import {
  approveMaintainerCollectionCandidate,
  clearMaintainerCollectionMembership,
  createMaintainerSession,
  destroyMaintainerSession,
  fetchMaintainerCollection,
  fetchMaintainerCollections,
  generateMaintainerCollectionCandidates,
  patchMaintainerCollection,
  patchMaintainerCollectionCandidate,
  regenerateMaintainerCollection,
  rejectMaintainerCollectionCandidate,
  setMaintainerCollectionMembership,
} from "../maintainer/collection-api.js";
import {
  focusMaintainerWorkspace,
  getMaintainerViewElements,
  getStoredReviewer,
  initializeAuthFlow,
  runMaintainerAction,
  setMaintainerViewState,
  setStoredReviewer,
} from "../maintainer/page-helpers.js";
import { escapeHtml, toLabel } from "../utils.js";

function formatConfidence(value) {
  const score = Number(value);
  return Number.isFinite(score) ? `${Math.round(score * 100)}%` : "—";
}

function showTitle(show) {
  return show ? `<a class="maintainer-text-link" href="/shows/${encodeURIComponent(show.id)}" target="_blank" rel="noreferrer">${escapeHtml(show.title)}</a>` : "Unknown show";
}

function renderCandidate(candidate) {
  const type = candidate.collectionType === "semantic" ? "Semantic" : "Rule";
  const matches = Array.isArray(candidate.matchingShowIds) ? candidate.matchingShowIds.length : 0;
  return `
    <article class="maintainer-list-item collection-candidate-card">
      <div class="maintainer-list-item-top">
        <span class="maintainer-list-item-title">${escapeHtml(candidate.title)}</span>
        <span class="maintainer-list-item-badges"><span class="maintainer-badge is-accent">${type}</span><span class="maintainer-badge is-neutral">${matches} matches</span><span class="maintainer-badge is-good">${formatConfidence(candidate.confidence)}</span></span>
      </div>
      <span class="maintainer-list-item-preview">${escapeHtml(candidate.description || "No description generated.")}</span>
      <details class="collection-candidate-edit"><summary>Edit proposal before approval</summary>
        <form class="maintainer-review-form" data-candidate-edit="${escapeHtml(candidate.id)}">
          <label class="maintainer-field"><span>Title</span><input name="title" maxlength="100" value="${escapeHtml(candidate.title)}" required /></label>
          <label class="maintainer-field"><span>Description</span><textarea name="description" rows="3" maxlength="320" required>${escapeHtml(candidate.description || "")}</textarea></label>
          <label class="maintainer-field"><span>Review note</span><textarea name="reviewNotes" rows="2" maxlength="2000">${escapeHtml(candidate.reviewNotes || "")}</textarea></label>
          <button class="maintainer-ghost-button" type="submit">Save proposal edits</button>
        </form>
      </details>
      <div class="maintainer-review-actions">
        <button class="maintainer-primary-button" type="button" data-candidate-action="approve" data-candidate-id="${escapeHtml(candidate.id)}">Approve and publish route</button>
        <button class="maintainer-ghost-button" type="button" data-candidate-action="reject" data-candidate-id="${escapeHtml(candidate.id)}">Reject</button>
      </div>
    </article>`;
}

function renderCollectionList(collection) {
  const type = collection.kind === "semantic" ? "Semantic" : collection.kind === "rule" ? "Rule" : "Editorial";
  return `
    <article class="maintainer-list-item">
      <button class="maintainer-list-item-select" type="button" data-collection-id="${escapeHtml(collection.id)}">
        <span class="maintainer-list-item-top"><span class="maintainer-list-item-title">${escapeHtml(collection.title)}</span><span class="maintainer-list-item-badges"><span class="maintainer-badge is-neutral">${type}</span>${collection.borderlineCount ? `<span class="maintainer-badge is-warning">${collection.borderlineCount} borderline</span>` : ""}</span></span>
        <span class="maintainer-list-item-meta">${collection.memberCount} public members · ${collection.overrideCount} manual decisions</span>
        <span class="maintainer-list-item-preview">${escapeHtml(collection.description || "No description.")}</span>
      </button>
    </article>`;
}

function renderMembership(membership, overrides) {
  const override = overrides.find((entry) => entry.showId === membership.showId);
  const isBorderline = membership.state === "borderline";
  return `
    <article class="collection-membership-row ${isBorderline ? "is-borderline" : ""}">
      <div>
        <div class="maintainer-list-item-top"><strong>${showTitle(membership.show)}</strong><span class="maintainer-list-item-badges"><span class="maintainer-badge is-${isBorderline ? "warning" : "neutral"}">${escapeHtml(toLabel(membership.sourceType))}</span>${membership.confidence !== null ? `<span class="maintainer-badge is-good">${formatConfidence(membership.confidence)}</span>` : ""}${membership.reason?.approval === "editor-approved" ? `<span class="maintainer-badge is-accent">Editor approved</span>` : ""}${override ? `<span class="maintainer-badge is-accent">Manual ${escapeHtml(override.decision)}</span>` : ""}</span></div>
        <p>${escapeHtml(membership.reason?.summary || "No membership rationale recorded.")}</p>
      </div>
      <div class="maintainer-review-actions">
        <button class="maintainer-ghost-button" type="button" data-membership-decision="pin" data-show-id="${escapeHtml(membership.showId)}">Pin</button>
        <button class="maintainer-ghost-button" type="button" data-membership-decision="remove" data-show-id="${escapeHtml(membership.showId)}">Remove</button>
        ${override ? `<button class="maintainer-ghost-button" type="button" data-membership-clear="${escapeHtml(membership.showId)}">Clear manual decision</button>` : ""}
      </div>
    </article>`;
}

function renderDetail(detail) {
  if (!detail) return `<div class="maintainer-empty-state"><h3>No collection selected</h3><p>Select a route to inspect membership confidence and editorial overrides.</p></div>`;
  const collection = detail.collection;
  const automation = collection.automation?.mode === "rule"
    ? `Rule: ${[...(collection.automation.criteria?.all || []), ...(collection.automation.criteria?.any || [])].map((entry) => `${entry.field} ${entry.operator} ${entry.value}`).join("; ")}`
    : collection.automation?.mode === "semantic" ? `Semantic concept: ${collection.automation.query}` : "Manual editorial selection";
  const memberships = detail.memberships || [];
  return `
    <section class="maintainer-detail-section collection-detail-summary">
      <p class="maintainer-kicker">${escapeHtml(toLabel(collection.kind || "editorial"))}</p>
      <p>${escapeHtml(automation)}</p>
      <div class="maintainer-review-actions"><button id="regenerateCollection" class="maintainer-primary-button" type="button">Regenerate membership</button></div>
    </section>
    <form id="collectionEditForm" class="maintainer-review-form maintainer-detail-section">
      <h3>Collection copy</h3>
      <label class="maintainer-field"><span>Title</span><input name="title" maxlength="100" value="${escapeHtml(collection.title)}" required /></label>
      <label class="maintainer-field"><span>Description</span><textarea name="description" rows="4" maxlength="320" required>${escapeHtml(collection.description || "")}</textarea></label>
      <p class="maintainer-panel-meta">Saving description marks it as manual; regeneration will not replace it.</p>
      <button class="maintainer-ghost-button" type="submit">Save collection copy</button>
    </form>
    <form id="collectionMembershipForm" class="maintainer-review-form maintainer-detail-section">
      <h3>Manual membership decision</h3>
      <div class="maintainer-review-grid">
        <label class="maintainer-field"><span>Published show id</span><input name="showId" required placeholder="show-id" /></label>
        <label class="maintainer-field"><span>Decision</span><select name="decision"><option value="add">Add</option><option value="pin">Add and pin</option><option value="remove">Remove and suppress automation</option></select></label>
      </div>
      <label class="maintainer-field"><span>Why (internal/public collection reason)</span><input name="reason" maxlength="420" placeholder="Optional concise reason" /></label>
      <button class="maintainer-primary-button" type="submit">Save manual decision</button>
    </form>
    <section class="maintainer-detail-section"><h3>Memberships and borderline matches</h3><div class="collection-membership-list">${memberships.length ? memberships.map((membership) => renderMembership(membership, detail.overrides || [])).join("") : "<p>No stored membership audit yet.</p>"}</div></section>
    <section class="maintainer-detail-section"><h3>Audit trail</h3><div class="collection-event-list">${(detail.events || []).slice(0, 20).map((event) => `<p><strong>${escapeHtml(toLabel(event.eventType))}</strong> · ${escapeHtml(event.actor || "system")} · ${escapeHtml(event.createdAt || "")}</p>`).join("") || "<p>No events yet.</p>"}</div></section>`;
}

export async function initializeMaintainerCollectionsPage() {
  const appShell = document.getElementById("maintainerAppShell");
  const view = getMaintainerViewElements(appShell);
  const elements = {
    appShell,
    candidates: document.getElementById("collectionCandidateList"),
    candidateMeta: document.getElementById("collectionCandidateMeta"),
    collections: document.getElementById("collectionDefinitionList"),
    collectionMeta: document.getElementById("collectionListMeta"),
    detail: document.getElementById("collectionDetail"),
    detailHeading: document.getElementById("collectionDetailHeading"),
    detailMeta: document.getElementById("collectionDetailMeta"),
    refresh: document.getElementById("maintainerRefreshButton"),
    generator: document.getElementById("generateCollectionCandidates"),
    includeSemantic: document.getElementById("includeSemanticCandidates"),
    generatorStatus: document.getElementById("collectionGeneratorStatus"),
    safetyStatus: document.getElementById("collectionSafetyStatus"),
    retry: document.getElementById("maintainerRetryButton"),
  };
  const state = { selectedId: "", reviewer: getStoredReviewer(), response: null, detail: null };

  const auth = await initializeAuthFlow({
    createMaintainerSession,
    destroyMaintainerSession,
    onAuthenticated: async () => { await load(); focusMaintainerWorkspace(); },
    onLoggedOut: async () => setMaintainerViewState(view, "authRequired", { message: "Signed out. Sign in to continue." }),
  });

  async function load({ preserveSelection = true } = {}) {
    try {
      const response = await fetchMaintainerCollections();
      state.response = response;
      if (!preserveSelection || !response.collections.some((entry) => entry.id === state.selectedId)) state.selectedId = response.collections[0]?.id || "";
      elements.candidates.innerHTML = response.candidates.items.length
        ? response.candidates.items.map(renderCandidate).join("")
        : `<div class="maintainer-empty-state"><h3>No collection proposals</h3><p>Generate candidates from the catalogue when you want a fresh review queue.</p></div>`;
      elements.candidateMeta.textContent = `${response.candidates.total} proposed collection${response.candidates.total === 1 ? "" : "s"} awaiting review.`;
      elements.collections.innerHTML = response.collections.map(renderCollectionList).join("") || "<p>No collection definitions found.</p>";
      elements.collectionMeta.textContent = `${response.catalogCount} published shows · semantic AI ${response.semantic.enabled ? "available" : "not configured"}.`;
      elements.safetyStatus.textContent = `Public semantic threshold ${formatConfidence(response.semantic.publishThreshold)}; borderline review starts at ${formatConfidence(response.semantic.borderlineThreshold)}. Manual removals always suppress automation.`;
      auth.logoutButtons.forEach((button) => { button.hidden = false; });
      elements.refresh.hidden = false;
      setMaintainerViewState(view, "ready");
      await loadDetail();
    } catch (error) {
      if (error?.name === "MaintainerAuthError") {
        setMaintainerViewState(view, "authRequired", { message: "Sign in to review collections." });
      } else {
        setMaintainerViewState(view, "error", { message: error instanceof Error ? error.message : "Failed to load collection engine." });
      }
    }
  }

  async function loadDetail() {
    if (!state.selectedId) {
      state.detail = null;
      elements.detail.innerHTML = renderDetail(null);
      return;
    }
    const detail = await fetchMaintainerCollection(state.selectedId);
    state.detail = detail;
    elements.detailHeading.textContent = detail.collection.title;
    elements.detailMeta.textContent = `${(detail.memberships || []).filter((entry) => entry.state === "active").length} active memberships; ${(detail.memberships || []).filter((entry) => entry.state === "borderline").length} borderline matches.`;
    elements.detail.innerHTML = renderDetail(detail);
  }

  async function refreshDetailAndList() { await load({ preserveSelection: true }); }

  elements.generator?.addEventListener("click", async (event) => {
    await runMaintainerAction({ control: event.currentTarget, action: async () => {
      elements.generatorStatus.textContent = "Generating private collection proposals…";
      try {
        const result = await generateMaintainerCollectionCandidates({ reviewedBy: state.reviewer, includeSemantic: elements.includeSemantic?.checked !== false });
        elements.generatorStatus.textContent = `${result.proposed.length} proposals added; ${result.skipped.length} duplicate or low-value concepts skipped.`;
        await refreshDetailAndList();
      } catch (error) { elements.generatorStatus.textContent = error instanceof Error ? error.message : "Candidate generation failed."; }
    }});
  });
  elements.refresh?.addEventListener("click", (event) => runMaintainerAction({ control: event.currentTarget, action: refreshDetailAndList }));
  elements.retry?.addEventListener("click", () => load({ preserveSelection: true }));
  elements.collections?.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-collection-id]") : null;
    if (!button) return;
    state.selectedId = button.dataset.collectionId || "";
    await loadDetail();
  });
  elements.candidates?.addEventListener("submit", async (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form?.dataset.candidateEdit) return;
    event.preventDefault();
    const data = new FormData(form);
    await runMaintainerAction({ control: form.querySelector("button"), region: form, action: async () => {
      state.reviewer = getStoredReviewer();
      await patchMaintainerCollectionCandidate(form.dataset.candidateEdit, { title: data.get("title"), description: data.get("description"), reviewNotes: data.get("reviewNotes"), reviewedBy: state.reviewer });
      await refreshDetailAndList();
    }});
  });
  elements.candidates?.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-candidate-action]") : null;
    if (!button) return;
    const id = button.dataset.candidateId;
    await runMaintainerAction({ control: button, action: async () => {
      if (button.dataset.candidateAction === "approve") await approveMaintainerCollectionCandidate(id, { reviewedBy: state.reviewer });
      else await rejectMaintainerCollectionCandidate(id, { reviewedBy: state.reviewer, reviewNotes: "Rejected from collection review queue." });
      await refreshDetailAndList();
    }});
  });
  elements.detail?.addEventListener("submit", async (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form || !state.selectedId) return;
    event.preventDefault();
    const data = new FormData(form);
    await runMaintainerAction({ control: form.querySelector("button"), region: form, action: async () => {
      if (form.id === "collectionEditForm") {
        await patchMaintainerCollection(state.selectedId, { title: data.get("title"), description: data.get("description"), reviewedBy: state.reviewer });
      } else if (form.id === "collectionMembershipForm") {
        await setMaintainerCollectionMembership(state.selectedId, String(data.get("showId") || "").trim(), { decision: data.get("decision"), reason: data.get("reason"), reviewedBy: state.reviewer });
      }
      await refreshDetailAndList();
    }});
  });
  elements.detail?.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !state.selectedId) return;
    const regenerate = target.closest("#regenerateCollection");
    const decision = target.closest("[data-membership-decision]");
    const clear = target.closest("[data-membership-clear]");
    if (!regenerate && !decision && !clear) return;
    const control = regenerate || decision || clear;
    await runMaintainerAction({ control, action: async () => {
      if (regenerate) await regenerateMaintainerCollection(state.selectedId, { reviewedBy: state.reviewer });
      if (decision) await setMaintainerCollectionMembership(state.selectedId, decision.dataset.showId, { decision: decision.dataset.membershipDecision, reviewedBy: state.reviewer });
      if (clear) await clearMaintainerCollectionMembership(state.selectedId, clear.dataset.membershipClear, { reviewedBy: state.reviewer });
      await refreshDetailAndList();
    }});
  });
  await load({ preserveSelection: false });
}
