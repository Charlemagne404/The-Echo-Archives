function createRateLimitStore({ db }) {
  const statements = {
    pruneExpiredScope: db.prepare(`
      DELETE FROM rate_limit_events
      WHERE scope = @scope
        AND created_at_ms <= @cutoffMs
    `),
    listScopeForClient: db.prepare(`
      SELECT created_at_ms
      FROM rate_limit_events
      WHERE scope = @scope
        AND client_ip = @clientIp
      ORDER BY created_at_ms ASC
    `),
    insertScopeEvent: db.prepare(`
      INSERT INTO rate_limit_events (scope, client_ip, created_at_ms)
      VALUES (@scope, @clientIp, @createdAtMs)
    `),
  };

  const consume = db.transaction(({ scope, clientIp, windowMs, maxEvents, createdAtMs }) => {
    const cutoffMs = createdAtMs - windowMs;
    statements.pruneExpiredScope.run({ scope, cutoffMs });

    const activeRows = statements.listScopeForClient.all({ scope, clientIp });
    if (activeRows.length >= maxEvents) {
      const oldestEventMs = activeRows[0]?.created_at_ms || createdAtMs;
      const retryAfterMs = Math.max(1, windowMs - (createdAtMs - oldestEventMs));
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    statements.insertScopeEvent.run({
      scope,
      clientIp,
      createdAtMs,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  });

  const pruneExpired = db.transaction(({ scopeWindows = {}, nowMs = Date.now() } = {}) => {
    const results = {};
    Object.entries(scopeWindows).forEach(([scope, windowMs]) => {
      const safeWindowMs = Number(windowMs);
      if (!Number.isFinite(safeWindowMs) || safeWindowMs <= 0) {
        return;
      }

      const result = statements.pruneExpiredScope.run({
        scope,
        cutoffMs: Number(nowMs) - safeWindowMs,
      });
      results[scope] = result.changes;
    });
    return results;
  });

  return {
    consume,
    pruneExpired,
  };
}

module.exports = {
  createRateLimitStore,
};
