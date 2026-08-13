export function bindImportBatchActions({
  elements,
  state,
  renderQueue,
  runAction,
  publishBatch,
  loadQueue,
  isAuthError,
  showAuthentication,
}) {
  elements.selectImportedEligible?.addEventListener("click", () => {
    const eligibleIds = (state.response?.items || [])
      .filter((candidate) => candidate.status === "ready" && candidate.readiness?.publicationEligibility?.imported?.eligible)
      .map((candidate) => candidate.id);
    state.selectedBatchIds = new Set(eligibleIds);
    renderQueue();
    if (elements.publishImportedBatch) elements.publishImportedBatch.disabled = eligibleIds.length === 0;
  });

  elements.publishImportedBatch?.addEventListener("click", async (event) => {
    const candidateIds = [...state.selectedBatchIds];
    const noun = candidateIds.length === 1 ? "entry" : "entries";
    if (candidateIds.length === 0 || !window.confirm(`Publish ${candidateIds.length} eligible ${noun} as Imported in one catalogue build?`)) return;
    await runAction({
      control: event.currentTarget,
      region: elements.listCard,
      action: async () => {
        try {
          elements.listStatus.textContent = `Publishing ${candidateIds.length} Imported entries…`;
          await publishBatch({ candidateIds, publicationTier: "imported", reviewedBy: state.storedReviewer });
          state.selectedBatchIds.clear();
          await loadQueue(false);
        } catch (error) {
          if (isAuthError(error)) return showAuthentication(error);
          elements.listStatus.textContent = error instanceof Error ? error.message : "Failed to publish Imported batch.";
        }
      },
    });
  });

  elements.list?.addEventListener("change", (event) => {
    const checkbox = event.target instanceof Element ? event.target.closest("[data-import-batch-select]") : null;
    if (!(checkbox instanceof HTMLInputElement)) return;
    const candidateId = checkbox.dataset.importBatchSelect || "";
    if (checkbox.checked) state.selectedBatchIds.add(candidateId);
    else state.selectedBatchIds.delete(candidateId);
    if (elements.publishImportedBatch) elements.publishImportedBatch.disabled = state.selectedBatchIds.size === 0;
  });
}
