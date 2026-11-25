const express = require("express");

function createSubmissionRouter({
  submissionService,
  submissionLifecycleService = null,
  analyticsStore = null,
  discordNotifications = null,
  getShowHref = () => "",
  getAnalyticsRequestContext = () => ({}),
  isInternalRequest = () => false,
}) {
  const router = express.Router();

  function recordAnalytics(payload) {
    try {
      analyticsStore?.recordServerInteraction(payload);
    } catch (_error) {
      // Analytics must never turn a successful submission into a failure.
    }
  }

  router.get("/shows/:showId/context", (req, res, next) => {
    try {
      return res.json({
        show: submissionService.getShowContext(req.params.showId),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/shows", (req, res, next) => {
    try {
      const result = submissionService.submit(req.body || {}, {
        sourceIp: req.ip || "",
        userAgent: req.get("user-agent") || "",
        idempotencyKey: req.get("idempotency-key") || "",
      });

      if (result.filtered) {
        return res.status(202).json({
          accepted: true,
        });
      }

      const internal = isInternalRequest(req);
      if (result.submission?.submission_type === "show") {
        try {
          submissionLifecycleService?.signalNewSubmission(result.submission.id);
        } catch (_error) {
          // Durable received state is recovered by the lifecycle scan after a restart.
        }
      }
      recordAnalytics({
        ...getAnalyticsRequestContext(req),
        eventName: "Catalogue Submission",
        properties: {
          submission_type: result.submission.submissionType,
          ...(result.submission.existingShowId ? { show_id: result.submission.existingShowId } : {}),
        },
        userAgent: req.get("user-agent") || "",
        internal,
      });

      if (!internal && result.submission?.submission_type !== "show") {
        try {
          const submission = result.submission;
          const payload = submission.payload_json || {};
          const showId = submission.existing_show_id || "";
          discordNotifications?.enqueueContribution({
            eventId: `submission:${submission.id}`,
            kind: "submission",
            submissionType: submission.submission_type,
            showId,
            showTitle: submission.show_title,
            showHref: getShowHref(showId),
            correctionType: payload.correctionType,
            ratingStars: payload.ratingStars,
            timestamp: submission.submitted_at,
          });
        } catch (_error) {
          // Notifications cannot turn a saved submission into a failed request.
        }
      }

      return res.status(201).json({
        accepted: true,
        submissionId: result.submission.id,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createSubmissionRouter,
};
