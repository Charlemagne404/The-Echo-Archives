const path = require("node:path");
const express = require("express");

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createAuthRequiredError() {
  const error = new Error("Maintainer authentication is required.");
  error.statusCode = 401;
  return error;
}

function createMaintainerRouter({ auth, staticRoot, submissionService }) {
  const router = express.Router();

  router.use(["/maintainer", "/api/maintainer"], (req, res, next) => {
    if (!auth.enabled) {
      return res.status(404).end();
    }

    res.set("Cache-Control", "no-store");
    return next();
  });

  function sendMaintainerPage(relativePath) {
    return (_req, res) => {
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.sendFile(path.join(staticRoot, relativePath));
    };
  }

  function requireMaintainerSession(req, _res, next) {
    if (!auth.hasSession(req)) {
      return next(createAuthRequiredError());
    }

    return next();
  }

  router.get("/maintainer/submissions.html", sendMaintainerPage("maintainer/submissions.html"));
  router.get("/maintainer/submissions/report.html", sendMaintainerPage("maintainer/submissions/report.html"));

  router.post("/api/maintainer/session", (req, res, next) => {
    if (!auth.authenticate(req.body?.passphrase || "")) {
      const error = new Error("Incorrect maintainer passphrase.");
      error.statusCode = 401;
      return next(error);
    }

    auth.setSessionCookie(req, res);
    return res.status(204).end();
  });

  router.delete("/api/maintainer/session", (req, res) => {
    auth.clearSessionCookie(req, res);
    return res.status(204).end();
  });

  router.get("/api/maintainer/submissions", requireMaintainerSession, (req, res, next) => {
    try {
      const result = submissionService.listForMaintainer({
        status: req.query.status,
        submissionType: req.query.submissionType,
        priority: req.query.priority,
        q: req.query.q,
        includeClosed: parseBoolean(req.query.includeClosed),
        page: parsePositiveInteger(req.query.page, 1),
        pageSize: parsePositiveInteger(req.query.pageSize, 20),
      });

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/submissions/:id", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({
        submission: submissionService.getForMaintainer(req.params.id),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/api/maintainer/submissions/:id", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({
        submission: submissionService.reviewForMaintainer(req.params.id, {
          status: req.body?.status,
          priority: req.body?.priority,
          reviewNotes: req.body?.reviewNotes,
          reviewedBy: req.body?.reviewedBy,
        }),
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createMaintainerRouter,
};
