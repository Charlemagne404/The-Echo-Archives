const test = require("node:test");
const assert = require("node:assert/strict");

const { assertSafeRemoteUrl, fetchTextWithLimits } = require("../lib/import/fetch");
const { createTurnstileService } = require("../lib/services/turnstile-service");

function abortableNeverFetch(_url, init = {}) {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });
}

async function headersThenStalledJson(_url, init = {}) {
  return {
    ok: true,
    async json() {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    },
  };
}

test("bounded import fetches reject oversized and timed-out responses", async () => {
  await assert.rejects(
    () =>
      fetchTextWithLimits(
        async () => new Response("12345", { headers: { "Content-Length": "5" } }),
        "https://example.com/feed.xml",
        {},
        { maxBytes: 4, timeoutMs: 100, label: "RSS request" },
      ),
    /4-byte response limit/i,
  );

  await assert.rejects(
    () =>
      fetchTextWithLimits(abortableNeverFetch, "https://example.com/feed.xml", {}, {
        maxBytes: 1024,
        timeoutMs: 20,
        label: "RSS request",
      }),
    /timed out after 20ms/i,
  );
});

test("import fetch safety rejects private-network and credentialed URLs before fetching", async () => {
  for (const url of [
    "http://127.0.0.1/feed",
    "http://[::1]/feed",
    "http://169.254.169.254/latest",
    "http://[::ffff:127.0.0.1]/feed",
    "http://[::ffff:169.254.169.254]/latest",
    "http://[0:0:0:0:0:ffff:ac10:1]/feed",
    "http://[::ffff:6440:1]/feed",
    "https://user:pass@example.com/feed",
    "file:///tmp/feed.xml",
  ]) {
    await assert.rejects(() => assertSafeRemoteUrl(url, { resolveDns: false }), /unsafe|private-network/i);
  }
  await assert.doesNotReject(() => assertSafeRemoteUrl("https://example.com/feed.xml", { resolveDns: false }));
});

test("Turnstile verification fails closed with a bounded service-unavailable response", async () => {
  for (const fetchImpl of [abortableNeverFetch, headersThenStalledJson]) {
    const service = createTurnstileService({
      enabled: true,
      secretKey: "test-secret",
      timeoutMs: 20,
      fetchImpl,
    });

    await assert.rejects(
      () => service.verify("token", "203.0.113.10"),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.match(error.message, /temporarily unavailable/i);
        return true;
      },
    );
  }
});
