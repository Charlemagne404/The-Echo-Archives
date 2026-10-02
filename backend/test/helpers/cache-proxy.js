const http = require("node:http");

// Controlled shared-cache model: honors Cache-Control and Vary, preserves the
// query string, and bypasses credentials. This is an application contract drill,
// not a claim about an unexported production Cloudflare ruleset.
async function startCacheProxy(origin) {
  const entries = new Map();
  let now = 0;
  let originRequests = 0;
  const server = http.createServer(async (req, res) => {
    try {
      const authenticated = Boolean(req.headers.cookie || req.headers.authorization);
      const bucket = entries.get(req.url) || [];
      const cached = !authenticated && req.method === "GET" && bucket.find((entry) =>
        entry.vary.every((name) => entry.requestHeaders[name] === (req.headers[name] || "")));
      if (cached && cached.expires > now) {
        res.writeHead(cached.status, { ...cached.headers, "cf-cache-status": "HIT" });
        return res.end(cached.body);
      }
      originRequests += 1;
      const headers = { ...req.headers };
      delete headers.host;
      const upstream = await fetch(new URL(req.url, origin), { headers, method: req.method, redirect: "manual", signal: AbortSignal.timeout(5000) });
      const body = Buffer.from(await upstream.arrayBuffer());
      const responseHeaders = Object.fromEntries(upstream.headers);
      // Fetch transparently decodes compressed bodies.
      delete responseHeaders["content-encoding"];
      delete responseHeaders["transfer-encoding"];
      responseHeaders["content-length"] = String(body.length);
      const policy = responseHeaders["cache-control"] || "";
      const age = /(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/i.exec(policy);
      const vary = (responseHeaders.vary || "").toLowerCase().split(",").map((v) => v.trim()).filter(Boolean);
      const cacheable = !authenticated && req.method === "GET" && upstream.status === 200 &&
        !responseHeaders["set-cookie"] && !/no-store|private|no-cache/i.test(policy) && age && !vary.includes("*");
      if (cacheable) {
        const entry = { status: upstream.status, headers: responseHeaders, body, vary,
          requestHeaders: Object.fromEntries(vary.map((name) => [name, req.headers[name] || ""])), expires: now + Number(age[1]) * 1000 };
        entries.set(req.url, [...bucket.filter((item) => item !== cached), entry]);
      }
      res.writeHead(upstream.status, { ...responseHeaders, "cf-cache-status": authenticated ? "BYPASS" : cached ? "EXPIRED" : cacheable ? "MISS" : "DYNAMIC" });
      res.end(body);
    } catch (_error) {
      res.writeHead(502, { "cache-control": "no-store" });
      res.end("Proxy upstream unavailable");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, advance: (ms) => { now += ms; },
    purge: () => entries.clear(), originRequests: () => originRequests,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }) };
}
module.exports = { startCacheProxy };
