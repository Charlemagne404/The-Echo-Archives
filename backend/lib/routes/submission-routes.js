const express = require("express");

function createSubmissionRouter({ submissionService }) {
  const router = express.Router();

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
