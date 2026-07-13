const crypto = require("node:crypto");

function safeDigest(value = "") {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest();
}

function safeEqual(left = "", right = "") {
  const leftDigest = safeDigest(left);
  const rightDigest = safeDigest(right);
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function parseCookies(header = "") {
  return String(header || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex < 0) {
        return accumulator;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key) {
        try {
          accumulator[key] = decodeURIComponent(value);
        } catch (_error) {
          accumulator[key] = "";
        }
      }
      return accumulator;
    }, {});
}

function createMaintainerAuth(config) {
  const cookieName = config.MAINTAINER_REVIEW_COOKIE_NAME || "echo-maintainer-session";
  const passphrase = String(config.MAINTAINER_REVIEW_PASSPHRASE || "");
  const signingSecret = String(config.MAINTAINER_REVIEW_COOKIE_SECRET || passphrase || "");
  const sessionTtlHours = Math.max(1, Number.parseInt(String(config.MAINTAINER_REVIEW_SESSION_TTL_HOURS || "12"), 10) || 12);
  const sessionMaxAgeMs = sessionTtlHours * 60 * 60 * 1000;
  const enabled = Boolean(passphrase && signingSecret);

  function signSessionToken(expiresAtMs) {
    const payload = String(expiresAtMs);
    const signature = crypto.createHmac("sha256", signingSecret).update(payload, "utf8").digest("hex");
    return `${payload}.${signature}`;
  }

  function createSessionToken() {
    const expiresAtMs = Date.now() + sessionMaxAgeMs;
    return signSessionToken(expiresAtMs);
  }

  function hasValidSessionToken(token = "") {
    if (!enabled || !token) {
      return false;
    }

    const separatorIndex = token.indexOf(".");
    if (separatorIndex <= 0) {
      return false;
    }

    const payload = token.slice(0, separatorIndex);
    const signature = token.slice(separatorIndex + 1);
    const expiresAtMs = Number.parseInt(payload, 10);

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return false;
    }

    return safeEqual(signature, signSessionToken(expiresAtMs).slice(payload.length + 1));
  }

  function hasSession(req) {
    const cookies = parseCookies(req?.headers?.cookie || "");
    return hasValidSessionToken(cookies[cookieName] || "");
  }

  function setSessionCookie(req, res) {
    res.cookie(cookieName, createSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure || req.get("x-forwarded-proto") === "https",
      path: "/",
      maxAge: sessionMaxAgeMs,
    });
  }

  function clearSessionCookie(req, res) {
    res.clearCookie(cookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure || req.get("x-forwarded-proto") === "https",
      path: "/",
    });
  }

  function authenticate(passphraseAttempt = "") {
    return enabled && safeEqual(passphraseAttempt, passphrase);
  }

  return {
    enabled,
    hasSession,
    authenticate,
    setSessionCookie,
    clearSessionCookie,
    sessionTtlHours,
  };
}

module.exports = {
  createMaintainerAuth,
};
