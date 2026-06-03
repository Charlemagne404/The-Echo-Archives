const express = require("express");

function createSubmissionRouter({ submissionService }) {
  const router = express.Router();

  router.post("/shows", (req, res, next) => {
    try {
      const result = submissionService.submitShow({
        submissionType: req.body?.submissionType,
        existingShowId: req.body?.existingShowId,
        showTitle: req.body?.showTitle,
        creatorName: req.body?.creatorName,
        contactEmail: req.body?.contactEmail,
        officialSite: req.body?.officialSite,
        rssOrListenLink: req.body?.rssOrListenLink,
        genres: req.body?.genres,
        listenerRating: req.body?.listenerRating,
        spoilerLevel: req.body?.spoilerLevel,
        listenerReview: req.body?.listenerReview,
        verificationSources: req.body?.verificationSources,
        provenanceNotes: req.body?.provenanceNotes,
        notes: req.body?.notes,
        honeypot: req.body?.website,
        sourceIp: req.ip || "",
        userAgent: req.get("user-agent") || "",
      });

      if (result.filtered) {
        return res.status(202).json({
          accepted: true,
        });
      }

      return res.status(201).json({
        accepted: true,
        submission: result.submission,
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
