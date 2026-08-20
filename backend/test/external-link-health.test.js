const test = require("node:test");
const assert = require("node:assert/strict");

const {
  checkCatalogExternalLinks,
  classifyNetworkError,
  collectCatalogExternalLinks,
  verifyExternalLink,
} = require("../lib/external-link-health");
const { getExitCode, main, parseArgs } = require("../scripts/check-external-links");

function createResponse(status, headers = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
  );
  return {
    status,
    headers: {
      get(name) {
        return normalizedHeaders.get(String(name).toLowerCase()) || null;
      },
    },
    body: {
      async cancel() {},
    },
  };
}

function createShow({
  id,
  status = "published",
  listenLinks = {},
  officialLinks = {},
}) {
  return {
    id,
    title: `Show ${id}`,
    status,
    listenLinks,
    officialLinks,
  };
}

test("collectCatalogExternalLinks scans published user-facing links and deduplicates destinations", () => {
  const links = collectCatalogExternalLinks([
    createShow({
      id: "one",
      listenLinks: {
        website: "https://example.com/show#listen",
        apple: "https://podcasts.example/one",
      },
      officialLinks: {
        website: "https://example.com/show",
        empty: "",
      },
    }),
    createShow({
      id: "two",
      officialLinks: {
        website: "https://example.com/show#about",
      },
    }),
    createShow({
      id: "draft",
      status: "draft",
      listenLinks: {
        website: "https://draft.example/",
      },
    }),
  ]);

  assert.deepEqual(
    links.map((entry) => entry.url),
    ["https://example.com/show", "https://podcasts.example/one"],
  );
  assert.deepEqual(links[0].references, [
    { showId: "one", showTitle: "Show one", field: "listenLinks.website" },
    { showId: "one", showTitle: "Show one", field: "officialLinks.website" },
    { showId: "two", showTitle: "Show two", field: "officialLinks.website" },
  ]);
});

test("verifyExternalLink uses GET and follows bounded redirects", async () => {
  const calls = [];
  const responses = [
    createResponse(301, { location: "/new-home" }),
    createResponse(200),
  ];

  const result = await verifyExternalLink("https://example.com/old", {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responses.shift();
    },
    retries: 0,
    timeoutMs: 100,
  });

  assert.equal(result.classification, "healthy");
  assert.equal(result.status, 200);
  assert.equal(result.finalUrl, "https://example.com/new-home");
  assert.deepEqual(result.redirects, ["https://example.com/new-home"]);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://example.com/old",
    "https://example.com/new-home",
  ]);
  calls.forEach(({ options }) => {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.match(options.headers["user-agent"], /Echo-Archives-Link-Health/);
  });
});

test("verifyExternalLink retries HTTP failures before confirming them", async () => {
  let fetchCount = 0;
  const delays = [];
  const result = await verifyExternalLink("https://example.com/missing", {
    fetchImpl: async () => {
      fetchCount += 1;
      return createResponse(404);
    },
    retries: 2,
    retryDelayMs: 25,
    timeoutMs: 100,
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  assert.equal(fetchCount, 3);
  assert.deepEqual(delays, [25, 25]);
  assert.equal(result.classification, "confirmed-http-failure");
  assert.equal(result.status, 404);
  assert.equal(result.attemptCount, 3);
});

test("verifyExternalLink separates bot blocks from confirmed HTTP failures", async () => {
  const forbidden = await verifyExternalLink("https://example.com/protected", {
    fetchImpl: async () => createResponse(403),
    retries: 1,
    retryDelayMs: 0,
    timeoutMs: 100,
  });
  const challenge = await verifyExternalLink("https://example.com/challenge", {
    fetchImpl: async () => createResponse(503, { "cf-mitigated": "challenge" }),
    retries: 0,
    timeoutMs: 100,
  });

  assert.equal(forbidden.classification, "bot-block");
  assert.equal(forbidden.attemptCount, 2);
  assert.equal(challenge.classification, "bot-block");
});

test("verifyExternalLink keeps transient upstream failures out of confirmed broken-link results", async () => {
  const unavailable = await verifyExternalLink("https://example.com/temporarily-unavailable", {
    fetchImpl: async () => createResponse(520),
    retries: 1,
    retryDelayMs: 0,
    timeoutMs: 100,
  });

  assert.equal(unavailable.classification, "inconclusive");
  assert.equal(unavailable.reason, "upstream-http-520");
  assert.equal(unavailable.attemptCount, 2);
});

test("verifyExternalLink classifies redirect failures as inconclusive", async () => {
  let fetchCount = 0;
  const result = await verifyExternalLink("https://example.com/one", {
    fetchImpl: async () => {
      fetchCount += 1;
      return createResponse(302, { location: `/${fetchCount + 1}` });
    },
    maxRedirects: 1,
    retries: 0,
    timeoutMs: 100,
  });

  assert.equal(fetchCount, 2);
  assert.equal(result.classification, "inconclusive");
  assert.equal(result.reason, "too-many-redirects");
});

test("verifyExternalLink refuses private-network destinations before mocked fetch", async () => {
  let fetchCalled = false;
  const result = await verifyExternalLink("http://127.0.0.1/private", {
    fetchImpl: async () => {
      fetchCalled = true;
      return createResponse(200);
    },
    retries: 0,
    timeoutMs: 100,
  });

  assert.equal(fetchCalled, false);
  assert.equal(result.classification, "inconclusive");
  assert.equal(result.reason, "IMPORT_UNSAFE_URL");
});

test("network errors have stable DNS, TLS, timeout, and inconclusive classifications", () => {
  const dnsError = new TypeError("fetch failed", { cause: Object.assign(new Error("lookup failed"), { code: "ENOTFOUND" }) });
  const tlsError = new TypeError("fetch failed", {
    cause: Object.assign(new Error("certificate expired"), { code: "CERT_HAS_EXPIRED" }),
  });
  const timeoutError = Object.assign(new Error("connect timed out"), { code: "UND_ERR_CONNECT_TIMEOUT" });
  const connectionError = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });

  assert.equal(classifyNetworkError(dnsError).classification, "dns-error");
  assert.equal(classifyNetworkError(tlsError).classification, "tls-error");
  assert.equal(classifyNetworkError(timeoutError).classification, "timeout");
  assert.equal(classifyNetworkError(connectionError).classification, "inconclusive");
});

test("verifyExternalLink aborts a stalled mocked request at its timeout", async () => {
  const result = await verifyExternalLink("https://example.com/stalled", {
    fetchImpl: async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    retries: 0,
    timeoutMs: 5,
  });

  assert.equal(result.classification, "timeout");
  assert.equal(result.reason, "request-timeout");
  assert.equal(result.attemptCount, 1);
});

test("mixed retry outcomes stay inconclusive", async () => {
  const outcomes = [
    () => createResponse(404),
    () => {
      throw Object.assign(new Error("lookup failed"), { code: "ENOTFOUND" });
    },
  ];
  const result = await verifyExternalLink("https://example.com/unstable", {
    fetchImpl: async () => outcomes.shift()(),
    retries: 1,
    retryDelayMs: 0,
    timeoutMs: 100,
  });

  assert.equal(result.classification, "inconclusive");
  assert.equal(result.reason, "mixed-results:http-failure,dns-error");
});

test("checkCatalogExternalLinks bounds concurrency and preserves deterministic order", async () => {
  const catalog = Array.from({ length: 5 }, (_, index) =>
    createShow({
      id: `show-${index}`,
      listenLinks: { website: `https://example.com/${index}` },
    }));
  let active = 0;
  let maximumActive = 0;

  const report = await checkCatalogExternalLinks(catalog, {
    concurrency: 2,
    fetchImpl: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => queueMicrotask(resolve));
      active -= 1;
      return createResponse(200);
    },
    retries: 0,
    timeoutMs: 100,
  });

  assert.equal(maximumActive, 2);
  assert.equal(report.total, 5);
  assert.deepEqual(
    report.results.map((result) => result.url),
    Array.from({ length: 5 }, (_, index) => `https://example.com/${index}`),
  );
  assert.equal(report.summary.healthy, 5);
});

test("CLI parsing requires explicit opt-in and applies safety bounds", () => {
  const defaults = parseArgs([]);
  const configured = parseArgs([
    "--confirm-network",
    "--json",
    "--concurrency=2",
    "--retries=1",
    "--retry-delay-ms=10",
    "--timeout-ms=2500",
    "--max-redirects=3",
  ]);

  assert.equal(defaults.confirmNetwork, false);
  assert.deepEqual(configured, {
    confirmNetwork: true,
    help: false,
    json: true,
    concurrency: 2,
    maxRedirects: 3,
    retries: 1,
    retryDelayMs: 10,
    timeoutMs: 2500,
  });
  assert.throws(() => parseArgs(["--concurrency=9"]), /1 to 8/);
  assert.throws(() => parseArgs(["--unknown"]), /Unknown option/);
});

test("CLI refuses to run without opt-in and cannot reach fetch", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Unexpected network call");
  };
  console.log = () => {};
  console.error = () => {};

  try {
    assert.equal(await main([]), 2);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
  }
});

test("CLI exit codes distinguish confirmed failures from uncertain outcomes", () => {
  const summary = {
    healthy: 1,
    "confirmed-http-failure": 0,
    "dns-error": 0,
    "tls-error": 0,
    timeout: 0,
    "bot-block": 0,
    inconclusive: 0,
  };

  assert.equal(getExitCode({ summary }), 0);
  assert.equal(getExitCode({ summary: { ...summary, "bot-block": 1 } }), 2);
  assert.equal(getExitCode({ summary: { ...summary, "confirmed-http-failure": 1, timeout: 1 } }), 1);
});
