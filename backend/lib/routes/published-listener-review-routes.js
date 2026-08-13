const crypto = require("node:crypto");
const express = require("express");

const VOTER_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function decodeCookieComponent(value = "") {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return "";
  }
}

function parseCookies(header = "") {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) return cookies;
      const key = decodeCookieComponent(part.slice(0, separatorIndex).trim());
      if (key) cookies[key] = decodeCookieComponent(part.slice(separatorIndex + 1).trim());
      return cookies;
    }, {});
}

function isSecureRequest(req) {
  return req.secure || String(req.get("x-forwarded-proto") || "").split(",")[0].trim() === "https";
}

function parsePositiveInteger(value, fallback = 1, maximum = 100) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function createPublishedListenerReviewRouter({ reviewService, config }) {
  const router = express.Router();

  function getExistingVoterSecret(req) {
    const secret = parseCookies(req.get("cookie") || "")[config.COMMUNITY_VOTER_COOKIE_NAME];
    return VOTER_SECRET_PATTERN.test(secret || "") ? secret : "";
  }

  function ensureVoterSecret(req, res) {
    const existing = getExistingVoterSecret(req);
    if (existing) return existing;
    const voterSecret = crypto.randomBytes(32).toString("base64url");
    res.cookie(config.COMMUNITY_VOTER_COOKIE_NAME, voterSecret, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(req),
      maxAge: 400 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    return voterSecret;
  }

  router.get("/shows/:showId", (req, res, next) => {
    try {
      res.set("Cache-Control", "no-cache");
      res.json(reviewService.getPublicReviewPage(String(req.params.showId || "").trim(), {
        page: parsePositiveInteger(req.query.page, 1),
        pageSize: parsePositiveInteger(req.query.pageSize, 1, 20),
        voterSecret: getExistingVoterSecret(req),
      }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/scores/summary", (req, res, next) => {
    try {
      res.set("Cache-Control", "no-cache");
      res.json(reviewService.getListenerReviewScoreSummaries(
        typeof req.query.showIds === "string" ? req.query.showIds : "",
      ));
    } catch (error) {
      next(error);
    }
  });

  async function updateHelpful(req, res, next, helpful) {
    try {
      if (!config.COMMUNITY_RATING_WRITES_ENABLED) {
        return res.status(503).json({ error: "Community rating writes are unavailable." });
      }
      const result = await reviewService.updateHelpful({
        reviewId: String(req.params.reviewId || "").trim(),
        helpful,
        voterSecret: ensureVoterSecret(req, res),
        userAgent: req.get("user-agent") || "",
        sourceIp: req.ip || "",
      });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }

  router.put("/:reviewId/helpful", (req, res, next) => updateHelpful(req, res, next, true));
  router.delete("/:reviewId/helpful", (req, res, next) => updateHelpful(req, res, next, false));

  return router;
}

module.exports = { createPublishedListenerReviewRouter };
