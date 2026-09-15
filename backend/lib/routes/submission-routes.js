const express = require("express");

function createSubmissionRouter({
  submissionService,
  analyticsStore = null,
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
      });

      if (result.filtered) {
        return res.status(202).json({
          accepted: true,
        });
      }

      recordAnalytics({
        ...getAnalyticsRequestContext(req),
        eventName: "Catalogue Submission",
        properties: {
          submission_type: result.submission.submissionType,
          ...(result.submission.existingShowId ? { show_id: result.submission.existingShowId } : {}),
        },
        userAgent: req.get("user-agent") || "",
        internal: isInternalRequest(req),
      });

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
