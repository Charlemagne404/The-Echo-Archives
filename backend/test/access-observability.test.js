const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  createAccessObservability,
  createWeeklyClientPseudonym,
  getRouteTemplate,
  getUtcWeekStart,
} = require("../lib/access-observability");

const SECRET = "test-only-access-log-secret-value-1234567890";

test("weekly client pseudonyms are keyed, stable for one week, and rotate", () => {
  const monday = new Date("2026-07-27T12:00:00Z");
  const sunday = new Date("2026-08-02T23:59:59Z");
  const nextMonday = new Date("2026-08-03T00:00:00Z");

  assert.equal(getUtcWeekStart(monday), "2026-07-27");
  assert.equal(getUtcWeekStart(sunday), "2026-07-27");
  assert.equal(getUtcWeekStart(nextMonday), "2026-08-03");

  const first = createWeeklyClientPseudonym("203.0.113.42", SECRET, monday);
  assert.equal(first, createWeeklyClientPseudonym("203.0.113.42", SECRET, sunday));
  assert.notEqual(first, createWeeklyClientPseudonym("203.0.113.42", SECRET, nextMonday));
  assert.notEqual(first, createWeeklyClientPseudonym("203.0.113.43", SECRET, monday));
  assert.doesNotMatch(first, /203|113|42/);
  assert.match(first, /^[a-f0-9]{16}$/);
});

test("access telemetry contains only bounded operational fields", () => {
  const entries = [];
  const middleware = createAccessObservability({
    enabled: true,
    secret: SECRET,
    now: () => new Date("2026-07-28T12:00:00Z"),
    write: (entry) => entries.push(entry),
  });
  const req = {
    method: "POST",
    ip: "203.0.113.42",
    requestId: "request-123",
    baseUrl: "/api/submissions",
    route: { path: "/:submissionId" },
    originalUrl: "/api/submissions/private-id?token=secret",
    headers: { cookie: "private", authorization: "secret" },
    body: { email: "private@example.com", turnstileToken: "secret" },
  };
  const res = new EventEmitter();
  res.statusCode = 429;

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  res.emit("finish");

  assert.equal(nextCalled, true);
  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys(entries[0]).sort(), [
    "client",
    "durationMs",
    "event",
    "level",
    "method",
    "requestId",
    "route",
    "status",
  ]);
  assert.equal(entries[0].route, "/api/submissions/:submissionId");
  const serialized = JSON.stringify(entries[0]);
  for (const forbidden of [
    "203.0.113.42",
    "private-id",
    "token=secret",
    "private@example.com",
    "turnstileToken",
    "authorization",
    "cookie",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("disabled telemetry is a no-op and unmatched paths are not recorded verbatim", () => {
  let called = false;
  createAccessObservability()({}, {}, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(getRouteTemplate({ path: "/attacker-private-value" }), "<unmatched>");
  assert.throws(
    () => createAccessObservability({ enabled: true, secret: "too-short" }),
    /at least 32 characters/,
  );
});
