const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");

const { assertSafeRemoteUrl, fetchTextWithLimits, isPrivateIpAddress } = require("../lib/import/fetch");
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

function incomingResponse({ status = 200, headers = {}, body = "" } = {}) {
  const response = Readable.from(body ? [Buffer.from(body)] : []);
  response.statusCode = status;
  response.statusMessage = status === 302 ? "Found" : "OK";
  response.headers = headers;
  response.rawHeaders = Object.entries(headers).flatMap(([name, value]) => [name, String(value)]);
  return response;
}

function createPinnedNetworkFixture({ resolver, responses }) {
  const requests = [];
  const connections = [];
  const fetchImpl = async () => {
    assert.fail("The network fetch must use the pinned HTTP transport.");
  };
  fetchImpl.isNetworkFetch = true;

  const requestImpl = (options, onResponse) => {
    requests.push(options);
    const request = new EventEmitter();
    request.write = () => true;
    request.destroy = () => {};
    request.end = () => {
      const connected = (error, addresses) => {
        if (error) {
          request.emit("error", error);
          return;
        }
        connections.push({ hostname: options.hostname, addresses: addresses || [{ address: options.hostname, family: 4 }] });
        process.nextTick(() => onResponse(incomingResponse(responses.shift() || {})));
      };
      if (options.lookup) options.lookup(options.hostname, { all: true }, connected);
      else connected(null);
    };
    return request;
  };

  return {
    fetchImpl,
    requests,
    connections,
    options: { resolver, requestImpl },
  };
}

function unsafeAddressError(error) {
  assert.equal(error.code, "IMPORT_UNSAFE_URL");
  assert.equal(error.retryable, false);
  assert.doesNotMatch(error.message, /127\.0\.0\.1|169\.254\.169\.254/);
  return true;
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

test("bounded import fetches clear their timer when URL safety rejects before the request", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let timerCount = 0;
  let clearedTimerCount = 0;

  globalThis.setTimeout = (...args) => {
    timerCount += 1;
    return originalSetTimeout(...args);
  };
  globalThis.clearTimeout = (handle) => {
    clearedTimerCount += 1;
    return originalClearTimeout(handle);
  };

  try {
    await assert.rejects(
      () => fetchTextWithLimits(globalThis.fetch, "not-a-valid-url", {}, { timeoutMs: 100, label: "RSS request" }),
      /valid HTTP URL/i,
    );
    assert.equal(timerCount, 1);
    assert.equal(clearedTimerCount, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
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

test("outbound address policy blocks non-public IPv4/IPv6 ranges and unsafe address embeddings", () => {
  for (const address of [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.0.8",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "fec0::1",
    "ff02::1",
    "2001:2::1",
    "2001:db8::1",
    "3fff::1",
    "::ffff:127.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "2002:a9fe:a9fe::1",
  ]) {
    assert.equal(isPrivateIpAddress(address), true, `${address} must be blocked`);
  }

  for (const address of [
    "8.8.8.8",
    "192.0.0.9",
    "192.0.0.10",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "2002:808:808::1",
  ]) {
    assert.equal(isPrivateIpAddress(address), false, `${address} should remain eligible`);
  }
});

test("import fetch pins every validated public DNS answer into the actual HTTP lookup", async () => {
  const fixture = createPinnedNetworkFixture({
    resolver: async (hostname) => {
      assert.equal(hostname, "feeds.example.test");
      return [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ];
    },
    responses: [{ headers: { "content-type": "application/rss+xml" }, body: "<rss/>" }],
  });

  const result = await fetchTextWithLimits(fixture.fetchImpl, "https://Feeds.Example.Test.:443/feed.xml", {}, {
    ...fixture.options,
    maxBytes: 1024,
    label: "RSS request",
  });

  assert.equal(result.text, "<rss/>");
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.connections[0].hostname, "feeds.example.test");
  assert.deepEqual(fixture.connections[0].addresses, [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
  ]);
  assert.equal(fixture.requests[0].servername, "feeds.example.test");
  assert.equal(fixture.requests[0].headers.host, "feeds.example.test");
  assert.equal(fixture.requests[0].rejectUnauthorized, true);
});

test("import fetch rejects DNS names with prohibited or mixed public/private answers in either order", async () => {
  for (const records of [
    [{ address: "127.0.0.1", family: 4 }],
    [{ address: "2606:4700:4700::1111", family: 6 }, { address: "10.0.0.8", family: 4 }],
    [{ address: "10.0.0.8", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }],
    [{ address: "::ffff:169.254.169.254", family: 6 }, { address: "8.8.8.8", family: 4 }],
  ]) {
    let requestCount = 0;
    const fixture = createPinnedNetworkFixture({
      resolver: async () => records,
      responses: [{ body: "should not connect" }],
    });
    const originalRequest = fixture.options.requestImpl;
    fixture.options.requestImpl = (...args) => {
      requestCount += 1;
      return originalRequest(...args);
    };

    await assert.rejects(
      () => fetchTextWithLimits(fixture.fetchImpl, "https://mixed.example.test/feed.xml", {}, fixture.options),
      unsafeAddressError,
    );
    assert.equal(requestCount, 0);
  }
});

test("DNS rebinding after validation cannot change the address used by the connection", async () => {
  let resolverCalls = 0;
  const dnsAnswers = [
    [{ address: "93.184.216.34", family: 4 }],
    [{ address: "127.0.0.1", family: 4 }],
  ];
  const fixture = createPinnedNetworkFixture({
    resolver: async () => dnsAnswers[Math.min(resolverCalls++, dnsAnswers.length - 1)],
    responses: [{ headers: { "content-type": "application/rss+xml" }, body: "<rss/>" }],
  });

  const result = await fetchTextWithLimits(fixture.fetchImpl, "https://rebind.example.test/feed.xml", {}, {
    ...fixture.options,
    resolveDns: false,
    label: "RSS request",
  });

  assert.equal(result.text, "<rss/>");
  assert.equal(resolverCalls, 1, "the connection must not perform a second hostname resolution");
  assert.deepEqual(fixture.connections[0].addresses, [{ address: "93.184.216.34", family: 4 }]);
  assert.notDeepEqual(fixture.connections[0].addresses, dnsAnswers[1]);
});

test("each redirect is resolved and pinned, and unsafe redirect targets fail before connecting", async () => {
  const safeChain = createPinnedNetworkFixture({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    responses: [
      { status: 302, headers: { location: "/next" } },
      { headers: { "content-type": "application/rss+xml" }, body: "<rss/>" },
    ],
  });
  const result = await fetchTextWithLimits(safeChain.fetchImpl, "https://feeds.example.test/start", {}, {
    ...safeChain.options,
    label: "RSS request",
  });
  assert.equal(result.text, "<rss/>");
  assert.equal(safeChain.requests.length, 2);
  assert.equal(safeChain.connections.length, 2);
  assert.deepEqual(safeChain.connections[0].addresses, safeChain.connections[1].addresses);

  const unsafeRedirect = createPinnedNetworkFixture({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    responses: [{ status: 302, headers: { location: "http://127.0.0.1/internal" } }],
  });
  await assert.rejects(
    () => fetchTextWithLimits(unsafeRedirect.fetchImpl, "https://feeds.example.test/start", {}, unsafeRedirect.options),
    unsafeAddressError,
  );
  assert.equal(unsafeRedirect.requests.length, 1);

  let redirectResolverCalls = 0;
  const unsafeDnsRedirect = createPinnedNetworkFixture({
    resolver: async (hostname) => {
      redirectResolverCalls += 1;
      return hostname === "feeds.example.test"
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "10.0.0.9", family: 4 }];
    },
    responses: [{ status: 302, headers: { location: "https://private.example.test/feed" } }],
  });
  await assert.rejects(
    () => fetchTextWithLimits(unsafeDnsRedirect.fetchImpl, "https://feeds.example.test/start", {}, unsafeDnsRedirect.options),
    unsafeAddressError,
  );
  assert.equal(redirectResolverCalls, 2);
  assert.equal(unsafeDnsRedirect.requests.length, 1);
});

test("import fetch bounds redirect chains and reports malformed URLs without connecting", async () => {
  const redirectLimit = createPinnedNetworkFixture({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    responses: [
      { status: 302, headers: { location: "/second" } },
      { status: 302, headers: { location: "/third" } },
    ],
  });
  await assert.rejects(
    () => fetchTextWithLimits(redirectLimit.fetchImpl, "https://feeds.example.test/first", {}, {
      ...redirectLimit.options,
      maxRedirects: 1,
    }),
    (error) => error.code === "IMPORT_REDIRECT_FAILED",
  );
  assert.equal(redirectLimit.requests.length, 2);

  const malformed = createPinnedNetworkFixture({ resolver: async () => [], responses: [] });
  await assert.rejects(
    () => fetchTextWithLimits(malformed.fetchImpl, "not-a-url", {}, malformed.options),
    (error) => error.code === "IMPORT_UNSAFE_URL" && /valid HTTP URL/i.test(error.message),
  );
  assert.equal(malformed.requests.length, 0);

  const malformedRedirect = createPinnedNetworkFixture({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    responses: [{ status: 302, headers: { location: "http://[" } }],
  });
  await assert.rejects(
    () => fetchTextWithLimits(malformedRedirect.fetchImpl, "https://feeds.example.test/first", {}, malformedRedirect.options),
    (error) => error.code === "IMPORT_REDIRECT_FAILED",
  );
  assert.equal(malformedRedirect.requests.length, 1);
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
