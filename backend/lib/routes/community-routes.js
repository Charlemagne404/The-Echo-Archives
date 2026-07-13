const express = require("express");
const crypto = require("node:crypto");

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
      if (separatorIndex <= 0) {
        return cookies;
      }

      const key = decodeCookieComponent(part.slice(0, separatorIndex).trim());
      if (!key) {
        return cookies;
      }

      const value = decodeCookieComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function isSecureRequest(req) {
  return req.secure || String(req.get("x-forwarded-proto") || "").split(",")[0].trim() === "https";
}

function createVoterSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function createCommunityRouter({ communityService, config, rateLimiter = null }) {
  const router = express.Router();

  function getProfileId(req) {
    const fromHeader = req.get(config.PROFILE_HEADER);
    const fromBody = req.body && typeof req.body.profileId === "string" ? req.body.profileId : null;
    return fromHeader || fromBody || null;
  }

  function getExistingVoterSecret(req) {
    const cookies = parseCookies(req.get("cookie") || "");
    const secret = cookies[config.COMMUNITY_VOTER_COOKIE_NAME];
    return VOTER_SECRET_PATTERN.test(secret || "") ? secret : null;
  }

  function ensureVoterSecret(req, res) {
    const existing = getExistingVoterSecret(req);
    if (existing) {
      return existing;
    }

    const secret = createVoterSecret();
    res.cookie(config.COMMUNITY_VOTER_COOKIE_NAME, secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureRequest(req),
      maxAge: 400 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    return secret;
  }

  function getSourceIp(req) {
    return req.ip || "";
  }

  router.post("/profiles/anonymous", (req, res, next) => {
    try {
      rateLimiter?.check("community", req.ip || "");
      const payload = communityService.createDeviceProfile({
        voterSecret: ensureVoterSecret(req, res),
        userAgent: req.get("user-agent") || "",
        sourceIp: getSourceIp(req),
      });
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/config", (_req, res) => {
    res.json({
      minPublicRatings: config.COMMUNITY_MIN_PUBLIC_RATINGS,
      ratings: {
        writeEnabled: Boolean(config.COMMUNITY_RATING_WRITES_ENABLED),
      },
      turnstile: {
        enabled: config.COMMUNITY_TURNSTILE_ENABLED,
        siteKey: config.COMMUNITY_TURNSTILE_SITE_KEY,
      },
    });
  });

  router.get("/ratings/summary", (req, res, next) => {
    try {
      const voterSecret = getExistingVoterSecret(req);
      const result = communityService.getRatingSummaries({
        podcastIds: typeof req.query.podcastIds === "string" ? req.query.podcastIds : "",
        profileId: getProfileId(req),
        voterSecret,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.put("/podcasts/:podcastId/rating", async (req, res, next) => {
    try {
      if (!config.COMMUNITY_RATING_WRITES_ENABLED) {
        return res.status(503).json({ error: "Community rating writes are unavailable." });
      }

      const result = await communityService.submitRating({
        podcastId: req.params.podcastId,
        rating: req.body?.rating,
        voterSecret: ensureVoterSecret(req, res),
        turnstileToken: req.body?.turnstileToken,
        userAgent: req.get("user-agent") || "",
        source: "web",
        sourceIp: getSourceIp(req),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/podcasts/:podcastId/rating", async (req, res, next) => {
    try {
      if (!config.COMMUNITY_RATING_WRITES_ENABLED) {
        return res.status(503).json({ error: "Community rating writes are unavailable." });
      }

      const result = await communityService.removeRating({
        podcastId: req.params.podcastId,
        voterSecret: ensureVoterSecret(req, res),
        turnstileToken: req.body?.turnstileToken,
        userAgent: req.get("user-agent") || "",
        source: "web",
        sourceIp: getSourceIp(req),
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
