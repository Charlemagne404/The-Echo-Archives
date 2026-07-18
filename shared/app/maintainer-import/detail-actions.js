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
        publish: "Publish this prepared catalog record?",
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
            if (action === "hydrate") actionResult = await api.hydrate(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "draft") actionResult = await api.draft(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "retry") actionResult = await api.retry(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "reopen") actionResult = await api.reopen(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "publish") await api.publish(candidateId, { reviewedBy: payload.reviewedBy });
            else if (action === "reject") await api.review(candidateId, { ...payload, status: "rejected" });
            else if (action === "duplicate") await api.review(candidateId, { ...payload, status: "duplicate" });
            if (actionResult?.runId) await waitForRun(actionResult.runId);
            await reloadQueue();
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
