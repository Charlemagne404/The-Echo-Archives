const express = require("express");

function createCommunityRouter({ communityService, config }) {
  const router = express.Router();

  function getProfileId(req) {
    const fromHeader = req.get(config.PROFILE_HEADER);
    const fromBody = req.body && typeof req.body.profileId === "string" ? req.body.profileId : null;
    return fromHeader || fromBody || null;
  }

  router.post("/profiles/anonymous", (req, res, next) => {
    try {
      const payload = communityService.createAnonymousProfile(
        typeof req.body?.existingProfileId === "string" ? req.body.existingProfileId : null,
        req.get("user-agent") || "",
      );
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/ratings/summary", (req, res, next) => {
    try {
      const result = communityService.getRatingSummaries({
        podcastIds: typeof req.query.podcastIds === "string" ? req.query.podcastIds : "",
        profileId: getProfileId(req),
        userAgent: req.get("user-agent") || "",
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.put("/podcasts/:podcastId/rating", (req, res, next) => {
    try {
      const result = communityService.submitRating({
        podcastId: req.params.podcastId,
        rating: req.body?.rating,
        profileId: getProfileId(req),
        userAgent: req.get("user-agent") || "",
        source: "web",
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/podcasts/:podcastId/rating", (req, res, next) => {
    try {
      const result = communityService.removeRating({
        podcastId: req.params.podcastId,
        profileId: getProfileId(req),
        userAgent: req.get("user-agent") || "",
        source: "web",
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  createCommunityRouter,
};
