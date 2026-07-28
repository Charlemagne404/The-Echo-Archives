const crypto = require("node:crypto");

function getUtcWeekStart(now = new Date()) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function createWeeklyClientPseudonym(address, secret, now = new Date()) {
  const weekStart = getUtcWeekStart(now);
  const weeklyKey = crypto
    .createHmac("sha256", secret)
    .update(`echo-access-week:${weekStart}`)
    .digest();
  return crypto
    .createHmac("sha256", weeklyKey)
    .update(String(address || "unknown"))
    .digest("hex")
    .slice(0, 16);
}

function getRouteTemplate(req) {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    return `${req.baseUrl || ""}${routePath}` || "/";
  }
  if (Array.isArray(routePath) && routePath.length > 0) {
    return `${req.baseUrl || ""}${routePath[0]}` || "/";
  }
  return "<unmatched>";
}

function createAccessObservability({
  enabled = false,
  secret = "",
  now = () => new Date(),
  write = (entry) => console.log(JSON.stringify(entry)),
} = {}) {
  if (!enabled) {
    return (_req, _res, next) => next();
  }
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Access-observability HMAC secret must contain at least 32 characters.");
  }

  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.once("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      write({
        level: "info",
        event: "http_request",
        requestId: req.requestId || "",
        method: req.method,
        route: getRouteTemplate(req),
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        client: createWeeklyClientPseudonym(req.ip, secret, now()),
      });
    });
    next();
  };
}

module.exports = {
  createAccessObservability,
  createWeeklyClientPseudonym,
  getRouteTemplate,
  getUtcWeekStart,
};
