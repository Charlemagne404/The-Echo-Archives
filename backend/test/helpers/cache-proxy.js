const http = require("node:http");

// Controlled shared-cache model: honors CDN-Cache-Control/Cache-Control, validators,
// stale-if-error, Vary, full query keys, credentials, and Set-Cookie. It is a contract
// test fixture, not a model of an unexported production Cloudflare configuration.
async function startCacheProxy(origin) {
  const entries = new Map();
  let now = 0;
  let originRequests = 0;

  function matchesVary(entry, headers) {
    return entry.vary.every((name) => entry.requestHeaders[name] === (headers[name] || ""));
  }

  function sendEntry(res, entry, cacheStatus, method = "GET", status = entry.status) {
    res.writeHead(status, { ...entry.headers, "cf-cache-status": cacheStatus });
    res.end(method === "HEAD" || status === 304 ? undefined : entry.body);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const authenticated = Boolean(req.headers.cookie || req.headers.authorization);
      const bucket = entries.get(req.url) || [];
      const cached = !authenticated && ["GET", "HEAD"].includes(req.method)
        ? bucket.find((entry) => matchesVary(entry, req.headers))
        : null;
      if (cached && cached.expires > now) {
        return sendEntry(res, cached, "HIT", req.method);
      }

      originRequests += 1;
      const headers = { ...req.headers };
      delete headers.host;
      delete headers["accept-encoding"];
      const upstreamMethod = req.method === "HEAD" ? "GET" : req.method;
      if (cached && !headers["if-none-match"] && cached.headers.etag) {
        headers["if-none-match"] = cached.headers.etag;
      }
      if (cached && !headers["if-modified-since"] && cached.headers["last-modified"]) {
        headers["if-modified-since"] = cached.headers["last-modified"];
      }
      const upstream = await new Promise((resolve, reject) => {
        const upstreamRequest = http.request(new URL(req.url, origin), { headers, method: upstreamMethod }, (upstreamResponse) => {
          const chunks = [];
          upstreamResponse.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          upstreamResponse.on("end", () => resolve({
            status: Number(upstreamResponse.statusCode) || 502,
            headers: upstreamResponse.headers,
            body: Buffer.concat(chunks),
          }));
        });
        upstreamRequest.setTimeout(5000, () => upstreamRequest.destroy(new Error("Proxy upstream timed out")));
        upstreamRequest.on("error", reject);
        upstreamRequest.end();
      });

      if (upstream.status === 304 && cached) {
        const revalidatedHeaders = { ...cached.headers };
        for (const [name, value] of Object.entries(upstream.headers)) {
          if (!["content-length", "content-encoding", "transfer-encoding"].includes(name)) {
            revalidatedHeaders[name] = Array.isArray(value) ? value.join(", ") : value;
          }
        }
        const policy = revalidatedHeaders["cdn-cache-control"] || revalidatedHeaders["cache-control"] || "";
        const age = /(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/i.exec(policy);
        const updated = {
          ...cached,
          headers: revalidatedHeaders,
          expires: now + (age ? Number(age[1]) : 0) * 1000,
        };
        const clientEtags = String(req.headers["if-none-match"] || "").split(",").map((value) => value.trim());
        const clientMatches = clientEtags.includes("*") || clientEtags.includes(cached.headers.etag);
        entries.set(req.url, [...bucket.filter((item) => item !== cached), updated]);
        return sendEntry(res, updated, "REVALIDATED", req.method, clientMatches ? 304 : updated.status);
      }

      if (cached && upstream.status >= 500) {
        const policy = cached.headers["cdn-cache-control"] || cached.headers["cache-control"] || "";
        const stale = /(?:^|,)\s*stale-if-error=(\d+)/i.exec(policy);
        const staleWindowMs = stale ? Number(stale[1]) * 1000 : 0;
        if (staleWindowMs > 0 && now <= cached.expires + staleWindowMs) {
          return sendEntry(res, cached, "STALE", req.method);
        }
      }

      const body = upstream.body;
      const responseHeaders = Object.fromEntries(Object.entries(upstream.headers).map(([name, value]) => [
        name,
        Array.isArray(value) ? value.join(", ") : value,
      ]));
      delete responseHeaders["content-encoding"];
      delete responseHeaders["transfer-encoding"];
      delete responseHeaders["content-length"];
      responseHeaders["content-length"] = String(body.length);
      const policy = responseHeaders["cdn-cache-control"] || responseHeaders["cache-control"] || "";
      const age = /(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/i.exec(policy);
      const vary = (responseHeaders.vary || "").toLowerCase().split(",").map((value) => value.trim()).filter(Boolean);
      const cacheable = !authenticated && ["GET", "HEAD"].includes(req.method) && upstream.status === 200 &&
        !responseHeaders["set-cookie"] && !/no-store|private|no-cache/i.test(policy) && age && !vary.includes("*");
      if (cacheable) {
        const entry = {
          status: upstream.status,
          headers: responseHeaders,
          body,
          vary,
          requestHeaders: Object.fromEntries(vary.map((name) => [name, req.headers[name] || ""])),
          expires: now + Number(age[1]) * 1000,
        };
        entries.set(req.url, [...bucket.filter((item) => item !== cached), entry]);
      }
      res.writeHead(upstream.status, {
        ...responseHeaders,
        "cf-cache-status": authenticated ? "BYPASS" : cached ? "EXPIRED" : cacheable ? "MISS" : "DYNAMIC",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (_error) {
      res.writeHead(502, { "cache-control": "no-store", "cf-cache-status": "DYNAMIC" });
      res.end("Proxy upstream unavailable");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    advance: (ms) => { now += ms; },
    purge: (url = "") => url ? entries.delete(url) : entries.clear(),
    originRequests: () => originRequests,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }),
  };
}

module.exports = { startCacheProxy };
