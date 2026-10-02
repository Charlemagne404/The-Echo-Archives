const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { createBoundedHttpServer } = require("../lib/http-server");

test("oversized headers and incomplete HTTP requests have bounded lifetimes", async () => {
  let handled = 0;
  const server = createBoundedHttpServer((req, res) => {
    handled += 1;
    req.resume();
    req.on("end", () => res.end("healthy"));
  }, { headersTimeout: 100, requestTimeout: 200, connectionsCheckingInterval: 20 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  async function raw(input) {
    return new Promise((resolve, reject) => {
      const socket = net.connect(port, "127.0.0.1", () => socket.write(input));
      let result = "";
      socket.setTimeout(1500, () => { socket.destroy(); reject(new Error("Unbounded HTTP connection")); });
      socket.on("data", (chunk) => { result += chunk; });
      socket.on("error", reject);
      socket.on("close", () => resolve(result));
    });
  }
  try {
    assert.match(await raw(`GET / HTTP/1.1\r\nHost: localhost\r\nX-Huge: ${"a".repeat(20000)}\r\n\r\n`), /431/);
    assert.equal(handled, 0);
    assert.match(await raw("GET / HTTP/1.1\r\nHost:"), /408/);
    assert.equal(handled, 0);
    assert.match(await raw("POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\nx"), /408/);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await response.text(), "healthy");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
