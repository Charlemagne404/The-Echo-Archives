import { buildReviewPayload } from "./workflow.js";

export function bindImportCandidateActions({
  container,
  candidateId,
  reviewForm,
  getReviewer,
  setReviewer,
  setStatus,
  runAction,
  waitForRun,
  reloadQueue,
  isAbortError,
  isAuthError,
  showAuthentication,
  api,
}) {
  container.querySelectorAll("[data-import-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!(button instanceof HTMLButtonElement)) return;
      const action = button.dataset.importAction || "";
      const confirmationCopy = {
        "publish-imported": "Publish this source-checked record as Imported?",
        "publish-indexed": "Publish this fact-reviewed record as indexed-only?",
        "facts-review": "Confirm that you checked this exact revision's identity, description, links, artwork, discovery metadata, lifecycle claims, and remaining gaps?",
        "promote-elevation": "Apply this fact-checked update to the published record? Its review tier stays indexed-only until you publish the full review.",
        promote: "Promote this Imported entry to indexed-only?",
        reject: "Reject this import candidate?",
        duplicate: "Mark this import candidate as a duplicate?",
      }[action];
      if (confirmationCopy && !window.confirm(confirmationCopy)) return;
      const payload = reviewForm ? buildReviewPayload(reviewForm) : { reviewedBy: getReviewer() };
      setReviewer(payload.reviewedBy || "");
      setStatus(`${action === "hydrate" ? "Hydrating" : "Processing"} import candidate…`);

      await runAction({
        control: button,
        region: container,
        action: async () => {
          try {
            let actionResult = null;
            let successMessage = "";
            if (action === "hydrate") actionResult = await api.hydrate(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "draft") actionResult = await api.draft(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "retry") actionResult = await api.retry(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "reopen") actionResult = await api.reopen(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "publish-imported") await api.publish(candidateId, { reviewedBy: payload.reviewedBy, publicationTier: "imported" });
            else if (action === "publish-indexed") await api.publish(candidateId, { reviewedBy: payload.reviewedBy, publicationTier: "indexed-only" });
            else if (action === "facts-review") {
              actionResult = await api.factualReview(candidateId, { reviewedBy: payload.reviewedBy });
              const revision = actionResult?.candidate?.factsReviewedRevision;
              successMessage = `Fact check saved${revision ? ` for revision ${revision}` : ""}. The promotion action is now available.`;
            }
            else if (action === "promote-elevation") {
              actionResult = await api.promoteElevation(candidateId, { reviewedBy: payload.reviewedBy });
              successMessage = "Factual update promoted. The show remains indexed-only; return to Build a full review to publish the archive review.";
            }
            else if (action === "promote") await api.promote(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "reject") await api.review(candidateId, { ...payload, status: "rejected" });
            else if (action === "duplicate") await api.review(candidateId, { ...payload, status: "duplicate" });
            if (actionResult?.runId) await waitForRun(actionResult.runId);
            await reloadQueue();
            if (successMessage) setStatus(successMessage);
          } catch (error) {
            if (isAbortError(error)) return;
            if (isAuthError(error)) {
              showAuthentication(error);
              return;
            }
            setStatus(error instanceof Error ? error.message : "Import action failed.");
          }
        },
      });
    });
  });

  container.querySelectorAll("[data-import-evidence-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!(button instanceof HTMLButtonElement)) return;
      setStatus("Selecting evidence and re-running preparation…");
      await runAction({
        control: button,
        region: container,
        action: async () => {
          try {
            const evidenceResult = await api.selectEvidence(candidateId, {
              evidenceId: Number(button.dataset.importEvidenceId),
              fieldName: button.dataset.importEvidenceField,
              reviewedBy: getReviewer(),
            });
            await waitForRun(evidenceResult.runId);
            await reloadQueue();
          } catch (error) {
            if (isAbortError(error)) return;
            if (isAuthError(error)) {
              showAuthentication(error);
              return;
            }
            setStatus(error instanceof Error ? error.message : "Failed to select field evidence.");
          }
        },
      });
    });
  });
}
