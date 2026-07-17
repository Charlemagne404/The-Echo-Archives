import {
  MaintainerAuthError,
  publishMaintainerListenerReview,
  saveMaintainerListenerReview,
  unpublishMaintainerListenerReview,
} from "./api.js";

function readPublicReview(form) {
  const formData = new FormData(form);
  const list = (name) => String(formData.get(name) || "").split(",").map((value) => value.trim()).filter(Boolean);
  const categoryScores = Object.fromEntries([
    "voiceActing",
    "soundDesign",
    "story",
    "characters",
    "ads",
    "length",
  ].map((key) => [key, formData.get(`category${key[0].toUpperCase()}${key.slice(1)}`)]));
  return {
    authorName: formData.get("authorName"),
    ratingStars: formData.get("ratingStars"),
    spoilerLevel: formData.get("spoilerLevel"),
    title: formData.get("title"),
    body: formData.get("body"),
    bestFor: list("bestFor"),
    workedBest: list("workedBest"),
    categoryScores,
  };
}

export function bindMaintainerListenerReviewEditor({ form, submissionId, runAction, onAuthError, onComplete, setStatus }) {
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = event.submitter instanceof HTMLButtonElement ? event.submitter.value : "save";
    const control = event.submitter instanceof HTMLElement ? event.submitter : form.querySelector('button[type="submit"]');
    await runAction({
      control,
      region: form,
      action: async () => {
        try {
          if (action === "publish") await publishMaintainerListenerReview(submissionId, readPublicReview(form));
          else if (action === "unpublish") await unpublishMaintainerListenerReview(submissionId);
          else await saveMaintainerListenerReview(submissionId, readPublicReview(form));
          await onComplete();
          setStatus(action === "unpublish" ? "Listener review unpublished." : action === "publish" ? "Listener review published." : "Public review draft saved.");
        } catch (error) {
          if (error instanceof MaintainerAuthError) return onAuthError(error);
          setStatus(error instanceof Error ? error.message : "Failed to update listener review.");
        }
      },
    });
  });
}
