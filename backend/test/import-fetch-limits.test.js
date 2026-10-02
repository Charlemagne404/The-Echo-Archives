const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");
const { fetchBufferWithLimits } = require("../lib/import/fetch");

function redirect(onCancel) {
  return new Response(new ReadableStream({ cancel: onCancel }), {
    status: 302, headers: { location: "https://example.com/next" },
  });
}

test("redirect bodies are cancelled before fetching the next hop", async () => {
  let cancelled = 0;
  let calls = 0;
  const fetchImpl = async () => {
    if (calls++ === 0) return redirect(() => { cancelled += 1; });
    assert.equal(cancelled, 1);
    return new Response("healthy");
  };
  const result = await fetchBufferWithLimits(fetchImpl, "https://example.com/feed", {}, { resolveDns: false });
  assert.equal(result.buffer.toString(), "healthy");
});

test("zero redirects rejects the first hop and disposes its body", async () => {
  let cancelled = false;
  let calls = 0;
  await assert.rejects(fetchBufferWithLimits(async () => {
    calls += 1;
    return redirect(() => { cancelled = true; });
  }, "https://example.com/feed", {}, { resolveDns: false, maxRedirects: 0 }), { code: "IMPORT_REDIRECT_FAILED" });
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
});

for (const [name, options, headers, code] of [
  ["advertised oversized body", { maxBytes: 2 }, { "content-length": "1000" }, "IMPORT_RESPONSE_TOO_LARGE"],
  ["unsupported MIME", { allowedContentTypes: ["application/xml"] }, { "content-type": "text/html" }, "IMPORT_INVALID_MIME"],
]) {
  test(`${name} aborts the upstream request`, async () => {
    let signal;
    await assert.rejects(fetchBufferWithLimits(async (_url, init) => {
      signal = init.signal;
      return new Response("rejected", { headers });
    }, "https://example.com/feed", {}, { resolveDns: false, ...options }), { code });
    assert.equal(signal.aborted, true);
  });
}


test("repeated endless redirect bodies release real loopback connections", async () => {
  const http = require("node:http");
  const sockets = new Set();
  const server = http.createServer((_req, res) => {
    res.writeHead(302, { location: "https://example.com/next" });
    res.write("unending redirect body");
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const local = `http://127.0.0.1:${server.address().port}`;
  try {
    const fetchImpl = (_url, init) => fetch(local, init);
    for (let i = 0; i < 20; i += 1) {
      await assert.rejects(fetchBufferWithLimits(fetchImpl, "https://example.com/feed", {}, {
        resolveDns: false, maxRedirects: 0, timeoutMs: 1000,
      }), { code: "IMPORT_REDIRECT_FAILED" });
    }
    // Undici may retain replacement idle connections; active stalled bodies
    // must be gone. Closing idle keep-alives distinguishes those states.
    await new Promise((resolve) => setTimeout(resolve, 100));
    server.closeIdleConnections();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sockets.size, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});


test("slow bodies time out, oversized streams cancel, and corrupt gzip fails locally", async () => {
  const http = require("node:http");
  const server = http.createServer((req, res) => {
    if (req.url === "/slow") { res.writeHead(200); res.write("partial"); return; }
    if (req.url === "/huge") { res.writeHead(200); res.end("x".repeat(4096)); return; }
    if (req.url === "/gzip") { res.writeHead(200, { "content-encoding": "gzip" }); res.end("invalid gzip"); return; }
    res.end("healthy");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const local = `http://127.0.0.1:${server.address().port}`;
  try {
    const options = { resolveDns: false, timeoutMs: 150, maxBytes: 100 };
    const fetchImpl = async (url, init) => {
      const response = await fetch(local + new URL(url).pathname, init);
      // Keep the simulated public URL while transport stays on loopback.
      Object.defineProperty(response, "url", { value: url });
      return response;
    };
    await assert.rejects(fetchBufferWithLimits(fetchImpl, "https://example.com/slow", {}, options), { code: "IMPORT_TIMEOUT" });
    await assert.rejects(fetchBufferWithLimits(fetchImpl, "https://example.com/huge", {}, options), { code: "IMPORT_RESPONSE_TOO_LARGE" });
    await assert.rejects(fetchBufferWithLimits(fetchImpl, "https://example.com/gzip", {}, options));
    const result = await fetchBufferWithLimits(fetchImpl, "https://example.com/healthy", {}, options);
    assert.equal(result.buffer.toString(), "healthy");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});


test("DNS rebinding after validation cannot replace the pinned socket answer", async () => {
  const dns = require("node:dns").promises;
  const lookup = dns.lookup;
  let lookups = 0;
  const connectedAddresses = [];
  const requestImpl = (options, onResponse) => {
    const request = new EventEmitter();
    request.end = () => {
      options.lookup(options.hostname, { all: true }, (error, addresses) => {
        if (error) {
          request.emit("error", error);
          return;
        }
        connectedAddresses.push(...addresses);
        const response = Readable.from(["healthy"]);
        response.statusCode = 200;
        response.headers = { "content-type": "text/plain" };
        response.rawHeaders = [];
        onResponse(response);
      });
    };
    request.destroy = () => {};
    return request;
  };
  try {
    dns.lookup = async (hostname, options) => {
      if (hostname !== "rebind.example") return lookup(hostname, options);
      lookups += 1;
      return [{ address: lookups === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }];
    };
    const result = await fetchBufferWithLimits(fetch, "http://rebind.example/feed", {}, { timeoutMs: 1000, requestImpl });
    assert.equal(result.buffer.toString(), "healthy");
    assert.equal(lookups, 1, "the connection must use the validated answer without a second DNS lookup");
    assert.deepEqual(connectedAddresses, [{ address: "93.184.216.34", family: 4 }]);
  } finally { dns.lookup = lookup; }
});


test("the total deadline includes a stalled preflight DNS resolver", async () => {
  const dns = require("node:dns").promises;
  const lookup = dns.lookup;
  const started = performance.now();
  try {
    dns.lookup = async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return [{ address: "203.0.113.10", family: 4 }];
    };
    await assert.rejects(fetchBufferWithLimits(fetch, "http://slow-dns.example/feed", {}, { timeoutMs: 20 }),
      { code: "IMPORT_TIMEOUT" });
    assert.ok(performance.now() - started < 150, "DNS wait must not extend the request deadline");
  } finally { dns.lookup = lookup; }
});


test("expanded IPv6 resolver answers cannot disguise loopback or unspecified addresses", () => {
  const { isPrivateIpAddress } = require("../lib/import/fetch");
  for (const address of ["0:0:0:0:0:0:0:1", "0:0:0:0:0:0:0:0", "::ffff:127.0.0.1", "::ffff:7f00:1", "fe80:0:0:0:0:0:0:1"]) {
    assert.equal(isPrivateIpAddress(address), true, address);
  }
  assert.equal(isPrivateIpAddress("2606:4700:4700:0:0:0:0:1111"), false);
});

test("same-origin redirects retain credentials but cross-origin hops remove every custom credential", async () => {
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    const headers = new Headers(init.headers);
    if (calls < 2) assert.equal(headers.get('authorization'), 'secret');
    else {
      for (const name of ['authorization', 'cookie', 'x-auth-key', 'host']) assert.equal(headers.has(name), false);
      assert.equal(headers.get('accept'), 'application/json');
    }
    calls += 1;
    if (calls === 1) return new Response(null, { status: 302, headers: { location: '/same-origin' } });
    if (calls === 2) return new Response(null, { status: 302, headers: { location: 'https://publisher.example/feed' } });
    return new Response('healthy');
  };
  await fetchBufferWithLimits(fetchImpl, 'https://directory.example/start', {
    headers: { Authorization: 'secret', Cookie: 'session=secret', 'X-Auth-Key': 'secret', Host: 'directory.example', Accept: 'application/json' },
  }, { resolveDns: false });
  assert.equal(calls, 3);
});
