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
        listenLinks: req.body?.listenLinks,
        selectedTags: req.body?.selectedTags,
        completionStatus: req.body?.completionStatus,
        shortDescription: req.body?.shortDescription,
        archiveFitNote: req.body?.archiveFitNote,
        verificationNotes: req.body?.verificationNotes,
        correctionType: req.body?.correctionType,
        issueDescription: req.body?.issueDescription,
        correctedInformation: req.body?.correctedInformation,
        sourceLinks: req.body?.sourceLinks,
        listenerRating: req.body?.listenerRating,
        ratingStars: req.body?.ratingStars,
        spoilerLevel: req.body?.spoilerLevel,
        listenerReview: req.body?.listenerReview,
        reviewTitle: req.body?.reviewTitle,
        reviewText: req.body?.reviewText,
        whoWouldLikeThis: req.body?.whoWouldLikeThis,
        bestFor: req.body?.bestFor,
        workedBest: req.body?.workedBest,
        similarShows: req.body?.similarShows,
        alias: req.body?.alias,
        verificationSources: req.body?.verificationSources,
        provenanceNotes: req.body?.provenanceNotes,
        role: req.body?.role,
        verificationMethod: req.body?.verificationMethod,
        proofUrl: req.body?.proofUrl,
        requestedUpdates: req.body?.requestedUpdates,
        preferredDescription: req.body?.preferredDescription,
        officialLinks: req.body?.officialLinks,
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
