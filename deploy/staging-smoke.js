const baseUrl = String(process.env.STAGING_SMOKE_BASE_URL || process.argv[2] || "https://staging.echoarchives.net").replace(/\/+$/, "");
const args = new Set(process.argv.slice(2));
const crawlAll = args.has("--crawl");
const writeTests = args.has("--write-tests");
const jsonOutput = args.has("--json");
const errors = [];
const warnings = [];
const checks = [];
const timeoutMs = 15_000;

function urlFor(route) {
  return new URL(route, `${baseUrl}/`).toString();
}

function record(label) {
  checks.push(label);
}

function fail(label, message) {
  errors.push(`${label}: ${message}`);
}

async function request(label, route, options = {}) {
  const expected = options.expected || [200];
  let response;
  let body = "";
  try {
    response = await fetch(urlFor(route), {
      method: options.method || "GET",
      headers: {
        Accept: options.accept || "*/*",
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: options.redirect || "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    body = await response.text();
  } catch (error) {
    fail(label, `request failed: ${error.message}`);
    return { response: null, body };
  }

  if (!expected.includes(response.status)) {
    fail(label, `expected HTTP ${expected.join(" or ")}, received ${response.status}`);
  } else {
    record(`${label} [${response.status}]`);
  }

  return { response, body };
}

function parseJson(label, body) {
  try {
    return JSON.parse(body);
  } catch (error) {
    fail(label, `invalid JSON: ${error.message}`);
    return null;
  }
}

function assertHtml(label, result) {
  const contentType = result.response?.headers.get("content-type") || "";
  if (!/text\/html/i.test(contentType)) fail(label, `expected HTML content type, received ${contentType || "none"}`);
  if (!/<title\b/i.test(result.body)) fail(label, "HTML response has no title element");
  if (/(?:Cannot GET|Internal Server Error|Unexpected server error|UnhandledPromiseRejection)/i.test(result.body)) {
    fail(label, "HTML contains an obvious server-error marker");
  }
}

function internalReferences(html) {
  const references = [];
  const pattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const reference = match[1].trim();
    if (!reference || reference.startsWith("#") || /^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(reference)) continue;
    const parsed = new URL(reference, `${baseUrl}/`);
    if (parsed.origin === new URL(`${baseUrl}/`).origin) {
      references.push(`${parsed.pathname}${parsed.search}`);
    }
  }
  return [...new Set(references)];
}

async function checkHtmlRoute(label, route) {
  const result = await request(label, route, { accept: "text/html" });
  if (result.response?.ok) assertHtml(label, result);
  return result;
}

async function checkInternalReferences(label, html, { limit = 80 } = {}) {
  const references = internalReferences(html).slice(0, limit);
  for (const reference of references) {
    const result = await request(`${label} -> ${reference}`, reference, { redirect: "manual", expected: [200, 301, 302, 304] });
    if (result.response?.status === 200 && /\.(?:css|js|json|png|jpe?g|webp|svg|ico|avif|gif)$/i.test(reference)) {
      const contentType = result.response.headers.get("content-type") || "";
      if (!contentType) fail(`${label} -> ${reference}`, "asset response has no content type");
    }
  }
  if (internalReferences(html).length > limit) warnings.push(`${label}: checked ${limit} of ${internalReferences(html).length} internal references`);
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const health = await request("health", "/api/health", { accept: "application/json" });
  const healthJson = parseJson("health", health.body) || {};
  if (healthJson.ok !== true) fail("health", "ok was not true");
  if (healthJson.status !== "ok") fail("health", `status was ${healthJson.status || "missing"}, not ok`);
  if ((health.response?.headers.get("x-echo-environment") || "") !== "staging") fail("health", "X-Echo-Environment header was not staging");

  const showsResult = await request("runtime show data", "/data/shows.json", { accept: "application/json" });
  const shows = parseJson("runtime show data", showsResult.body);
  const collectionsResult = await request("runtime collection data", "/data/collections.json", { accept: "application/json" });
  const collections = parseJson("runtime collection data", collectionsResult.body);
  const searchResult = await request("search index", "/data/search-index.json", { accept: "application/json" });
  const searchIndex = parseJson("search index", searchResult.body);
  if (!Array.isArray(shows) || shows.length === 0) fail("runtime show data", "no show records returned");
  if (!Array.isArray(collections) || collections.length === 0) fail("runtime collection data", "no collection records returned");
  if (!Array.isArray(searchIndex) || searchIndex.length !== (Array.isArray(shows) ? shows.length : 0)) fail("search index", "record count does not match shows");

  const showId = shows?.[0]?.id || "impact-winter";
  const collectionId = collections?.[0]?.id || "best-for-long-walks";
  const show = shows?.[0] || {};

  for (const [label, route] of [
    ["homepage", "/"],
    ["browse/search", `/?q=${encodeURIComponent(show.title || "archive")}`],
    ["collections", "/collections"],
    ["creator information page", "/for-creators"],
    ["creator standards page", "/creator-standards"],
    ["representative show", `/shows/${encodeURIComponent(showId)}`],
    ["representative collection", `/collections/${encodeURIComponent(collectionId)}`],
    ["privacy", "/privacy"],
    ["terms", "/terms"],
    ["cookies", "/cookies"],
    ["copyright", "/copyright"],
  ]) {
    const result = await checkHtmlRoute(label, route);
    if (result.response?.ok && ["homepage", "collections", "representative show"].includes(label)) {
      await checkInternalReferences(label, result.body);
    }
  }

  const coverPath = String(show.cover || "").replace(/^\/+/, "");
  for (const [label, route] of [
    ["style asset", "/style.css"],
    ["home asset", "/home.css"],
    ["application asset", "/script.js"],
    ["service worker", "/sw.js"],
    ["manifest", "/site.webmanifest"],
    ...(coverPath ? [["representative cover", `/${coverPath}`]] : []),
  ]) {
    await request(label, route, { expected: [200], redirect: "manual" });
  }

  const notFound = await request("404 handling", "/__echo-staging-definitely-missing__", { accept: "text/html", expected: [404] });
  if (!/Page Not Found|not found/i.test(notFound.body)) fail("404 handling", "404 body did not contain a not-found marker");

  const communityConfig = await request("community config", "/api/community/config", { accept: "application/json" });
  const communityJson = parseJson("community config", communityConfig.body) || {};
  if (communityJson.ratings?.writeEnabled !== true) fail("community config", "staging rating writes are not enabled for isolated smoke testing");
  const ratingSummary = await request("community rating summary API", `/api/community/ratings/summary?podcastIds=${encodeURIComponent(showId)}`, { accept: "application/json" });
  if (ratingSummary.response?.status === 200) parseJson("community rating summary API", ratingSummary.body);

  const context = await request("submission show context", `/api/submissions/shows/${encodeURIComponent(showId)}/context`, { accept: "application/json" });
  if (!(parseJson("submission show context", context.body) || {}).show) fail("submission show context", "show context was missing");
  const reviews = await request("review summary API", `/api/reviews/scores/summary?showIds=${encodeURIComponent(showId)}`, { accept: "application/json" });
  if (reviews.response?.ok) parseJson("review summary API", reviews.body);
  const reviewPage = await request("public review page API", `/api/reviews/shows/${encodeURIComponent(showId)}`, { accept: "application/json" });
  if (reviewPage.response?.ok) parseJson("public review page API", reviewPage.body);

  const cookieResponse = await request("anonymous community profile", "/api/community/profiles/anonymous", {
    method: "POST",
    accept: "application/json",
    body: {},
    expected: [201],
  });
  const cookies = cookieResponse.response?.headers.getSetCookie?.() || [];
  const cookie = cookies[0]?.split(";", 1)[0] || (cookieResponse.response?.headers.get("set-cookie") || "").split(";", 1)[0];
  if (!cookie) fail("anonymous community profile", "no voter cookie was returned");

  await request("isolated rating write", `/api/community/podcasts/${encodeURIComponent(showId)}/rating`, {
    method: "PUT",
    accept: "application/json",
    cookie,
    body: { rating: 8 },
    expected: [200],
  });
  await request("isolated rating removal", `/api/community/podcasts/${encodeURIComponent(showId)}/rating`, {
    method: "DELETE",
    accept: "application/json",
    cookie,
    body: {},
    expected: [200],
  });

  const smokeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const submissionBody = {
    intakeVersion: 2,
    submissionType: "show",
    showTitle: `Echo staging smoke ${smokeId}`,
    creatorName: "Echo Archives staging smoke",
    officialSite: "https://example.com",
    rssOrListenLink: "https://example.com/feed.xml",
    listenLinks: [{ label: "Official Website", url: "https://example.com" }],
    selectedTags: [],
    completionStatus: "unknown",
    shortDescription: "Disposable staging smoke submission.",
    verificationNotes: "Created by staging smoke test; safe to remove from staging.",
    legalAcknowledged: true,
    legalVersion: "2026-08-20",
  };
  if (!writeTests) {
    // Exercise the submission endpoint without creating a row or consuming the
    // normal submission rate limit. Use --write-tests for a real staging write.
    submissionBody.website = "echo-staging-smoke-honeypot";
  }
  const submission = await request("isolated submission write", "/api/submissions/shows", {
    method: "POST",
    accept: "application/json",
    body: submissionBody,
    expected: writeTests ? [201] : [202],
  });
  if (!(parseJson("isolated submission write", submission.body) || {}).accepted) fail("isolated submission write", "submission was not accepted");
  if (writeTests) {
    warnings.push("staging smoke created one disposable submission in the isolated staging database");
  } else {
    record("submission endpoint filtered-write safety path");
  }

  if (crawlAll && Array.isArray(shows) && Array.isArray(collections)) {
    const routes = [
      ...shows.map((entry) => `/shows/${encodeURIComponent(entry.id)}`),
      ...collections.map((entry) => `/collections/${encodeURIComponent(entry.id)}`),
    ];
    await mapLimit(routes, 8, async (route) => {
      const result = await request(`crawl ${route}`, route, { accept: "text/html" });
      if (result.response?.ok) assertHtml(`crawl ${route}`, result);
    });
  }

  const report = { ok: errors.length === 0, baseUrl, checks: checks.length, errors, warnings, health: healthJson };
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Staging smoke checks: ${checks.length} passed, ${errors.length} errors, ${warnings.length} warnings.`);
    checks.forEach((check) => console.log(`PASS ${check}`));
    warnings.forEach((warning) => console.log(`WARN ${warning}`));
    errors.forEach((error) => console.error(`FAIL ${error}`));
  }
  process.exitCode = errors.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
