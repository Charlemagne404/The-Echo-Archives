#!/usr/bin/env node
// Local-only HTTP load profiles. Starts its own disposable server and SQLite DB.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn, execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..");
const profiles = new Set(["browse", "search", "crawler", "links", "mixed", "spike"]);
const profile = process.argv[2] || "mixed";
const concurrency = Number(process.argv[3] || (profile === "spike" ? 64 : 16));
const count = Number(process.argv[4] || (profile === "crawler" ? 0 : 300));
if (!profiles.has(profile) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 128 || !Number.isInteger(count) || count < 0 || count > 10000 || (count === 0 && !["crawler", "links"].includes(profile))) {
  throw new Error("Usage: node tools/benchmark-public-load.js <browse|search|crawler|links|mixed|spike> [concurrency 1..128] [requests 0..10000]");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] || 0;
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "echo-public-load-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(root, "backend"),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), STATIC_ROOT: root, DB_PATH: path.join(temp, "load.sqlite"), SITE_URL: origin, NODE_ENV: "test", ACCESS_LOG_ENABLED: "false", OLLAMA_URL: "http://127.0.0.1:9/api/generate" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  server.stdout.resume();
  server.stderr.on("data", (chunk) => { errors = (errors + chunk).slice(-4000); });
  try {
    const boot = performance.now();
    while (performance.now() - boot < 30000) {
      if (server.exitCode !== null) throw new Error(`Server exited: ${errors}`);
      try {
        const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
        if (health.ok) break;
      } catch { /* still starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const startupMs = performance.now() - boot;
    if (startupMs >= 30000) throw new Error(`Server start timed out: ${errors}`);

    async function sitemapPaths(name) {
      const response = await fetch(`${origin}/${name}`);
      if (!response.ok) throw new Error(`Sitemap ${name} returned ${response.status}`);
      const xml = await response.text();
      const urls = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => new URL(match[1].replaceAll("&amp;", "&")));
      if (urls.some((url) => url.origin !== origin)) throw new Error("Sitemap points outside the disposable local server.");
      if (xml.includes("<sitemapindex")) {
        const paths = [];
        for (const url of urls) paths.push(...await sitemapPaths(url.pathname.slice(1)));
        return paths;
      }
      return urls.map((url) => url.pathname);
    }
    const paths = await sitemapPaths("sitemap.xml");
    const sitemapPathSet = new Set(paths);
    const shows = paths.filter((url) => url.startsWith("/shows/"));
    const collections = paths.filter((url) => url.startsWith("/collections/"));
    const browse = [...shows, ...collections];
    const searches = ["/?q=sci-fi", "/?q=impact", "/collections?q=horror", "/creators?q=audio", "/?q=%C3%A9", "/?q=unknown-show"];
    const mixed = [...browse.slice(0, 120), ...searches, "/", "/sitemap.xml", "/data/search-index.json"];
    const pool = profile === "browse" ? browse : profile === "search" ? searches : ["crawler", "links"].includes(profile) ? paths : mixed;
    const initialCount = ["crawler", "links"].includes(profile) && count === 0 ? pool.length : count;
    const timings = [];
    const statuses = {};
    const linkedPaths = new Set();
    const broken = [];
    const seoFailures = [];
    const canonicals = new Set();
    const cheerio = profile === "links" ? require(path.join(root, "backend", "node_modules", "cheerio")) : null;
    const start = performance.now();
    const resourceSamples = [];
    function sampleResources() {
      try {
        const output = execFileSync("ps", ["-o", "rss=,time=", "-p", String(server.pid)], { encoding: "utf8" }).trim().split(/\s+/);
        const cpuSeconds = output[1].split(":").reduce((seconds, part) => seconds * 60 + Number(part), 0);
        resourceSamples.push({ elapsedMs: Math.round(performance.now() - start), completed: timings.length,
          rssMb: +(Number(output[0]) / 1024).toFixed(1), cpuSeconds });
      } catch { /* ps is optional on non-Unix hosts */ }
    }
    sampleResources();
    const resourceTimer = setInterval(sampleResources, 1000);
    resourceTimer.unref();
    async function runRoutes(routes, collectLinks = false) {
      let next = 0;
      async function worker() {
        while (next < routes.length) {
          const route = routes[next++];
          const started = performance.now();
          try {
            const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(15000) });
            const body = collectLinks && response.headers.get("content-type")?.includes("text/html") ? await response.text() : null;
            if (body === null) await response.arrayBuffer();
            timings.push(performance.now() - started);
            statuses[response.status] = (statuses[response.status] || 0) + 1;
            if (response.status >= 400) broken.push(`${route} (${response.status})`);
            if (body !== null && response.ok) {
              const $ = cheerio.load(body);
              if (collectLinks && sitemapPathSet.has(route)) {
                const canonical = $('link[rel="canonical"]');
                const canonicalUrl = canonical.attr("href");
                if (canonical.length !== 1 || canonicalUrl !== `${origin}${route}` || canonicals.has(canonicalUrl)) seoFailures.push(`${route}: missing, duplicate or incorrect canonical`);
                canonicals.add(canonicalUrl);
                for (const selector of ['title', 'meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]']) {
                  const node = $(selector);
                  if (node.length !== 1 || !(node.attr("content") || node.text()).trim()) seoFailures.push(`${route}: invalid ${selector}`);
                }
                if (($('meta[name="robots"]').attr("content") || "").includes("noindex")) seoFailures.push(`${route}: sitemap includes noindex page`);
                $('script[type="application/ld+json"]').each((_index, node) => {
                  try { JSON.parse($(node).text()); } catch { seoFailures.push(`${route}: malformed structured data`); }
                });
              }
              $("a[href], img[src], script[src], link[href]").each((_index, element) => {
                const target = $(element).attr("href") || $(element).attr("src");
                try {
                  const resolved = new URL(target, `${origin}${route}`);
                  if (resolved.origin === origin || ["echoarchives.net", "www.echoarchives.net"].includes(resolved.hostname)) {
                    linkedPaths.add(`${resolved.pathname}${resolved.search}`);
                  }
                } catch {
                  if (String(target || "").startsWith("/")) broken.push(`${route} has malformed link ${target}`);
                }
              });
            }
          } catch {
            statuses.networkError = (statuses.networkError || 0) + 1;
            broken.push(`${route} (network error)`);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, routes.length) }, worker));
    }
    await runRoutes(Array.from({ length: initialCount }, (_, index) => pool[index % pool.length]), profile === "links");
    if (profile === "links") await runRoutes([...linkedPaths]);
    const total = initialCount + (profile === "links" ? linkedPaths.size : 0);
    const elapsedMs = performance.now() - start;
    clearInterval(resourceTimer);
    sampleResources();
    let rssKb = null;
    try { rssKb = Number(execFileSync("ps", ["-o", "rss=", "-p", String(server.pid)], { encoding: "utf8" }).trim()); } catch { /* optional */ }
    console.log(JSON.stringify({ profile, catalogueRoutes: paths.length, uniqueInternalLinks: profile === "links" ? linkedPaths.size : null, concurrency, requests: total, startupMs: +startupMs.toFixed(1), elapsedMs: +elapsedMs.toFixed(1), requestsPerSecond: +(total * 1000 / elapsedMs).toFixed(1), p50Ms: +percentile(timings, .5).toFixed(1), p95Ms: +percentile(timings, .95).toFixed(1), p99Ms: +percentile(timings, .99).toFixed(1), statuses, seoFailures: seoFailures.slice(0, 30), broken: broken.slice(0, 30), resourceSamples, rssMb: rssKb ? +(rssKb / 1024).toFixed(1) : null }));
    if (broken.length || seoFailures.length) process.exitCode = 1;
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => { if (server.exitCode !== null) return resolve(); server.once("exit", resolve); setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 5000).unref(); });
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
