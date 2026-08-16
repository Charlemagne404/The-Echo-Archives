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

function createMaintainerRouter({ auth, staticRoot, submissionService, publishedListenerReviewService, importService, elevationService, collectionService, rateLimiter = null }) {
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
  router.get("/maintainer/imports.html", sendMaintainerPage("maintainer/imports.html"));
  router.get("/maintainer/imports/report.html", sendMaintainerPage("maintainer/imports/report.html"));
  router.get("/maintainer/collections.html", sendMaintainerPage("maintainer/collections.html"));

  router.post("/api/maintainer/session", (req, res, next) => {
    if (!auth.authenticate(req.body?.passphrase || "")) {
      rateLimiter?.check("maintainer-login", req.ip || "");
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

  router.post("/api/maintainer/submissions/:id/import", requireMaintainerSession, async (req, res, next) => {
    try {
      const submission = submissionService.getForMaintainer(req.params.id);
      return res.status(202).json(await importService.seedSubmissionForMaintainer(
        submission,
        req.body?.reviewedBy || "",
      ));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/submissions/:id/listener-review", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({ review: publishedListenerReviewService.getForMaintainer(req.params.id) });
    } catch (error) {
      return next(error);
    }
  });

  router.put("/api/maintainer/submissions/:id/listener-review", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({
        review: publishedListenerReviewService.saveForMaintainer(req.params.id, req.body || {}),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/submissions/:id/listener-review/publish", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({
        review: publishedListenerReviewService.publishForMaintainer(req.params.id, req.body || {}),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/api/maintainer/submissions/:id/listener-review", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({ review: publishedListenerReviewService.unpublishForMaintainer(req.params.id) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/imports", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json(
        importService.listForMaintainer({
          status: req.query.status,
          scopeStatus: req.query.scopeStatus,
          sourceType: req.query.sourceType,
          duplicateState: req.query.duplicateState,
          q: req.query.q,
          includeClosed: parseBoolean(req.query.includeClosed),
          page: parsePositiveInteger(req.query.page, 1),
          pageSize: parsePositiveInteger(req.query.pageSize, 20),
        }),
      );
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.status(202).json(
        await importService.seedCandidates({
          entries: Array.isArray(req.body?.entries) ? req.body.entries : [],
          searchResults: Array.isArray(req.body?.searchResults) ? req.body.searchResults : [],
          actor: req.body?.reviewedBy || "",
          autoHydrate: false,
        }),
      );
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/imports/search", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(
        await importService.searchExternalSources({
          q: req.query.q,
          source: req.query.source,
          limit: parsePositiveInteger(req.query.limit, 10),
        }),
      );
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/imports/runs/:runId", requireMaintainerSession, (req, res, next) => {
    try {
      const run = importService.getRun(req.params.runId);
      if (!run) {
        const error = new Error("Import run not found.");
        error.statusCode = 404;
        throw error;
      }
      return res.json({ run });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/runs/:runId/retry", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(202).json(importService.retryRunForMaintainer(req.params.runId, req.body?.reviewedBy || ""));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/prepare-all", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(202).json(importService.rerunAllForMaintainer(req.body?.reviewedBy || ""));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/audit", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.status(202).json(await importService.auditCatalog({ actor: req.body?.reviewedBy || "" }));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/imports/discovery", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json(importService.listDiscoveryForMaintainer());
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/discovery/run", requireMaintainerSession, async (req, res, next) => {
    try {
      const discovery = importService.listDiscoveryForMaintainer();
      const createdDefaultSource = discovery.sources.length === 0;
      if (createdDefaultSource) {
        importService.createDiscoverySourceForMaintainer({
          name: discovery.podcastIndexEnabled ? "Podcast Index audio drama" : "Apple audio drama",
          sourceType: discovery.podcastIndexEnabled ? "podcast-index-search" : "apple-search",
          query: "audio drama",
          intervalMinutes: 1_440,
          config: { limit: 10, includeBorderline: false },
        });
      }
      return res.status(202).json({ ...(await importService.runDueDiscovery({
        force: true,
        actor: req.body?.reviewedBy || "",
      })), createdDefaultSource });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/discovery/sources", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(201).json({ source: importService.createDiscoverySourceForMaintainer(req.body || {}) });
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/api/maintainer/imports/discovery/sources/:sourceId", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({ source: importService.updateDiscoverySourceForMaintainer(req.params.sourceId, req.body || {}) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/discovery/sources/:sourceId/run", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(202).json(importService.enqueueDiscoverySource(req.params.sourceId, {
        actor: req.body?.reviewedBy || "",
        force: true,
      }));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/imports/discovery/runs/:runId", requireMaintainerSession, (req, res, next) => {
    try {
      const run = importService.getDiscoveryRun(req.params.runId);
      if (!run) {
        const error = new Error("Discovery run not found.");
        error.statusCode = 404;
        throw error;
      }
      return res.json({ run });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/batch-publish", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await importService.batchPublishForMaintainer(
        Array.isArray(req.body?.candidateIds) ? req.body.candidateIds : [],
        req.body?.reviewedBy || "",
        req.body?.publicationTier || "",
      ));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/elevations", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json(elevationService.listForMaintainer(req.query.target));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/elevations/:showId", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json(elevationService.getForMaintainer(req.params.showId));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/elevations/:showId/factual-draft", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(202).json(elevationService.createFactualDraft(req.params.showId, req.body?.reviewedBy || ""));
    } catch (error) {
      return next(error);
    }
  });

  router.put("/api/maintainer/elevations/:showId/review-draft", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await elevationService.saveReviewDraft(req.params.showId, req.body || {}));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/elevations/:showId/review-publish", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await elevationService.publishReview(req.params.showId, req.body?.reviewedBy || ""));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/elevations/:showId/brief", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json(elevationService.buildCodexBrief(req.params.showId, req.query.target));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/elevations/drafts/:candidateId/promote", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await importService.promoteElevationForMaintainer(req.params.candidateId, req.body?.reviewedBy || ""));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/imports/:id", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({
        candidate: importService.getForMaintainer(req.params.id),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/:id/hydrate", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(202).json(importService.enqueueForMaintainer(req.params.id, {
        actor: req.body?.reviewedBy || "",
        runType: "hydrate",
        incrementRevision: true,
      }));
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/api/maintainer/imports/:id/review", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({
        candidate: importService.reviewForMaintainer(req.params.id, {
          status: req.body?.status,
          scopeStatus: req.body?.scopeStatus,
          reviewNotes: req.body?.reviewNotes,
          reviewedBy: req.body?.reviewedBy,
          duplicateOfShowId: req.body?.duplicateOfShowId,
          duplicateOfCandidateId: req.body?.duplicateOfCandidateId,
          details: req.body?.details,
        }, req.body?.reviewedBy || ""),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/:id/draft", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(202).json(importService.enqueueForMaintainer(req.params.id, {
        actor: req.body?.reviewedBy || "",
        runType: "prepare",
        incrementRevision: true,
      }));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/:id/retry", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(202).json(importService.retryForMaintainer(req.params.id, req.body?.reviewedBy || ""));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/:id/reopen", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(202).json(importService.reopenForMaintainer(req.params.id, req.body?.reviewedBy || ""));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/:id/evidence", requireMaintainerSession, (req, res, next) => {
    try {
      return res.status(202).json(importService.selectEvidenceForMaintainer(
        req.params.id,
        req.body?.fieldName,
        req.body?.evidenceId,
        req.body?.reviewedBy || "",
      ));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/:id/publish", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await importService.publishForMaintainer(
        req.params.id,
        req.body?.reviewedBy || "",
        req.body?.publicationTier || "",
      ));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/:id/factual-review", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({ candidate: importService.markFactsReviewedForMaintainer(req.params.id, req.body?.reviewedBy || "") });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/imports/:id/promote", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await importService.promoteForMaintainer(req.params.id, req.body?.reviewedBy || ""));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/collections", requireMaintainerSession, async (_req, res, next) => {
    try {
      return res.json(await collectionService.listForMaintainer());
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/collections/candidates/generate", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.status(202).json(await collectionService.generateCandidates({
        actor: req.body?.reviewedBy || "",
        includeSemantic: req.body?.includeSemantic !== false,
      }));
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/api/maintainer/collections/candidates/:candidateId", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({ candidate: collectionService.updateCandidate(req.params.candidateId, req.body || {}, req.body?.reviewedBy || "") });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/collections/candidates/:candidateId/approve", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await collectionService.approveCandidate(req.params.candidateId, {
        actor: req.body?.reviewedBy || "",
        edits: req.body?.edits || {},
      }));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/collections/candidates/:candidateId/reject", requireMaintainerSession, (req, res, next) => {
    try {
      return res.json({ candidate: collectionService.rejectCandidate(req.params.candidateId, {
        actor: req.body?.reviewedBy || "",
        reviewNotes: req.body?.reviewNotes || "",
      }) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/maintainer/collections/:collectionId", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await collectionService.getForMaintainer(req.params.collectionId));
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/api/maintainer/collections/:collectionId", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await collectionService.editCollection(req.params.collectionId, req.body || {}, {
        actor: req.body?.reviewedBy || "",
      }));
    } catch (error) {
      return next(error);
    }
  });

  router.post("/api/maintainer/collections/:collectionId/regenerate", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.status(202).json(await collectionService.recalculate({
        collectionIds: [req.params.collectionId],
        actor: req.body?.reviewedBy || "",
        forceSemantic: true,
        reason: "maintainer-regenerate",
      }));
    } catch (error) {
      return next(error);
    }
  });

  router.put("/api/maintainer/collections/:collectionId/memberships/:showId", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await collectionService.setMembershipOverride(req.params.collectionId, req.params.showId, {
        decision: req.body?.decision,
        reason: req.body?.reason || "",
        actor: req.body?.reviewedBy || "",
      }));
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/api/maintainer/collections/:collectionId/memberships/:showId", requireMaintainerSession, async (req, res, next) => {
    try {
      return res.json(await collectionService.clearMembershipOverride(req.params.collectionId, req.params.showId, {
        actor: req.body?.reviewedBy || "",
      }));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createMaintainerRouter,
};
