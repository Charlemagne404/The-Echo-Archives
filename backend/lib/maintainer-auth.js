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

function createMaintainerAuth(config, { db } = {}) {
  const cookieName = config.MAINTAINER_REVIEW_COOKIE_NAME || "echo-maintainer-session";
  const passphrase = String(config.MAINTAINER_REVIEW_PASSPHRASE || "");
  const signingSecret = String(config.MAINTAINER_REVIEW_COOKIE_SECRET || passphrase || "");
  const sessionTtlHours = Math.max(1, Number.parseInt(String(config.MAINTAINER_REVIEW_SESSION_TTL_HOURS || "12"), 10) || 12);
  const sessionMaxAgeMs = sessionTtlHours * 60 * 60 * 1000;
  const enabled = Boolean(passphrase && signingSecret && db);
  const findSession = db?.prepare("SELECT expires_at_ms FROM maintainer_sessions WHERE session_id = ?");
  const insertSession = db?.prepare("INSERT INTO maintainer_sessions (session_id, expires_at_ms) VALUES (?, ?)");
  const deleteSession = db?.prepare("DELETE FROM maintainer_sessions WHERE session_id = ?");
  const pruneExpiredSessions = db?.prepare("DELETE FROM maintainer_sessions WHERE expires_at_ms <= ?");

  function signSessionToken(expiresAtMs, sessionId) {
    const payload = `${expiresAtMs}.${sessionId}`;
    const signature = crypto.createHmac("sha256", signingSecret).update(payload, "utf8").digest("hex");
    return `${payload}.${signature}`;
  }

  function createSessionToken() {
    const now = Date.now();
    const expiresAtMs = now + sessionMaxAgeMs;
    const sessionId = crypto.randomBytes(32).toString("hex");
    pruneExpiredSessions?.run(now);
    insertSession.run(sessionId, expiresAtMs);
    return signSessionToken(expiresAtMs, sessionId);
  }

  function hasValidSessionToken(token = "") {
    if (!enabled || !token) {
      return false;
    }

    const segments = token.split(".");
    if (segments.length !== 3) {
      return false;
    }

    const [expiryPayload, sessionId, signature] = segments;
    const expiresAtMs = Number(expiryPayload);

    if (
      !Number.isSafeInteger(expiresAtMs) ||
      String(expiresAtMs) !== expiryPayload ||
      !/^[a-f0-9]{64}$/.test(sessionId) ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      expiresAtMs <= Date.now()
    ) {
      return false;
    }

    if (!safeEqual(signature, signSessionToken(expiresAtMs, sessionId).split(".")[2])) {
      return false;
    }

    const session = findSession.get(sessionId);
    return Number(session?.expires_at_ms) === expiresAtMs;
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
    const token = parseCookies(req?.headers?.cookie || "")[cookieName] || "";
    const [, sessionId] = token.split(".");
    if (/^[a-f0-9]{64}$/.test(sessionId || "")) {
      deleteSession.run(sessionId);
    }
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
