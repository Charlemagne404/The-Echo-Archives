const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { loadCatalog, loadCollections } = require("../lib/catalog");
const { injectRuntimeSiteConfig } = require("../lib/public-page-render");
const { findFreePort } = require("./helpers/free-port");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");

function graphNode(structuredData, type) {
  const nodes = Array.isArray(structuredData?.["@graph"]) ? structuredData["@graph"] : [structuredData];
  return nodes.find((node) => node?.["@type"] === type);
}

async function waitForServer(url, timeoutMs = 20_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Retry until the process is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function startPublicRouteServer(envOverrides = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-public-routes-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVE_STATIC: "true",
      STATIC_ROOT: siteRoot,
      DB_PATH: dbPath,
      SITE_URL: baseUrl,
      NODE_ENV: "test",
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      ENABLE_TEST_ERROR_ROUTES: "true",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(`${baseUrl}/api/health`);

  return {
    baseUrl,
    serverProcess,
    tempDir,
  };
}

async function stopPublicRouteServer({ serverProcess, tempDir }) {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("runtime page config replaces every versioned public-data attribute", () => {
  const rendered = injectRuntimeSiteConfig(
    '<body data-shows-version="stale" data-collections-version="stale" data-search-index-version="stale"></body>',
    {
      showsVersion: "shows-current",
      collectionsVersion: "collections-current",
      searchIndexVersion: "search-current",
    },
  );

  assert.match(rendered, /data-shows-version="shows-current"/);
  assert.match(rendered, /data-collections-version="collections-current"/);
  assert.match(rendered, /data-search-index-version="search-current"/);
  assert.doesNotMatch(rendered, /stale/);
});

test("public clean routes resolve and legacy html routes redirect", async () => {
  const context = await startPublicRouteServer();

  try {
    for (const route of [
      "/about",
      "/collections",
      "/submit",
      "/privacy",
      "/shows/impact-winter",
      "/collections/best-for-long-walks",
    ]) {
      const response = await fetch(`${context.baseUrl}${route}`);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get("content-type") || "", /text\/html/);
      assert.equal(response.headers.get("cache-control"), "no-cache", route);
    }

    const redirectResponse = await fetch(`${context.baseUrl}/collections.html`, {
      redirect: "manual",
    });
    assert.equal(redirectResponse.status, 301);
    assert.equal(redirectResponse.headers.get("location"), "/collections");

    for (const [route, location] of [
      ["/show?id=impact-winter", "/shows/impact-winter"],
      ["/show.html?id=impact-winter", "/shows/impact-winter"],
      ["/show/index.html?id=impact-winter", "/shows/impact-winter"],
      ["/collection?id=best-for-long-walks", "/collections/best-for-long-walks"],
      ["/collection.html?id=best-for-long-walks", "/collections/best-for-long-walks"],
      ["/collections/best-for-long-walks/", "/collections/best-for-long-walks"],
    ]) {
      const alias = await fetch(`${context.baseUrl}${route}`, { redirect: "manual" });
      assert.equal(alias.status, 301, route);
      assert.equal(alias.headers.get("location"), location, route);
    }
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("show and collection routes include crawler-visible metadata in the raw HTML response", async () => {
  const context = await startPublicRouteServer();

  try {
    const catalog = await loadCatalog(siteRoot);
    const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
    const similarityCollection = collections.find((collection) => collection.kind === "similarity");
    const similarityAnchor = catalog.find((show) => show.id === similarityCollection?.anchorShowId);

    const showResponse = await fetch(`${context.baseUrl}/shows/impact-winter`);
    assert.equal(showResponse.status, 200);
    const showHtml = await showResponse.text();
    assert.match(showHtml, /<title>Impact Winter Review &amp; Similar Podcasts \| The Echo Archives<\/title>/);
    assert.match(showHtml, new RegExp(`<link rel="canonical" href="${context.baseUrl}/shows/impact-winter" \\/>`));
    assert.match(showHtml, new RegExp(`<meta property="og:image" content="${context.baseUrl}/`));
    assert.match(showHtml, /<main\b[^>]*id="showRoot"[^>]*>\s*<section class="detail-main podcast-detail">/);
    assert.match(showHtml, /<h1>Impact Winter<\/h1>/);
    assert.match(showHtml, /<script id="showBootstrap" type="application\/json"[^>]*>/);
    const structuredDataMatch = showHtml.match(
      /<script id="pageStructuredData" type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
    );
    assert.ok(structuredDataMatch);
    const structuredData = JSON.parse(structuredDataMatch[1]);
    const podcastSeries = graphNode(structuredData, "PodcastSeries");
    const showWebPage = graphNode(structuredData, "WebPage");
    const showBreadcrumbs = graphNode(structuredData, "BreadcrumbList");
    assert.equal(podcastSeries.url, `${context.baseUrl}/shows/impact-winter`);
    assert.equal(showWebPage.url, `${context.baseUrl}/shows/impact-winter`);
    assert.equal(showWebPage.mainEntity["@id"], podcastSeries["@id"]);
    assert.equal(showBreadcrumbs.itemListElement.at(-1).item, `${context.baseUrl}/shows/impact-winter`);
    assert.ok(podcastSeries.creator.every((creator) => typeof creator === "string"));

    const collectionResponse = await fetch(`${context.baseUrl}/collections/best-for-long-walks`);
    assert.equal(collectionResponse.status, 200);
    const collectionHtml = await collectionResponse.text();
    assert.match(
      collectionHtml,
      /<title>Best for long walks: Audio Drama Recommendations \| The Echo Archives<\/title>/,
    );
    assert.match(
      collectionHtml,
      new RegExp(`<link rel="canonical" href="${context.baseUrl}/collections/best-for-long-walks" \\/>`),
    );
    assert.match(collectionHtml, /<h1 id="collectionTitle">Best for long walks<\/h1>/);
    assert.doesNotMatch(collectionHtml, /Loading collection/);
    assert.match(collectionHtml, /8 curated entries in this listening path/);
    assert.match(collectionHtml, /href="\/shows\/impact-winter"/);
    assert.match(collectionHtml, /class="collection-show-card-note"/);
    const collectionStructuredDataMatch = collectionHtml.match(
      /<script id="pageStructuredData" type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
    );
    assert.ok(collectionStructuredDataMatch);
    const collectionStructuredData = JSON.parse(collectionStructuredDataMatch[1]);
    const collectionPage = graphNode(collectionStructuredData, "CollectionPage");
    const collectionItemList = graphNode(collectionStructuredData, "ItemList");
    assert.equal(collectionPage.url, `${context.baseUrl}/collections/best-for-long-walks`);
    assert.equal(collectionItemList.numberOfItems, 8);
    assert.ok(collectionItemList.itemListElement.every((item) => item.url.startsWith(`${context.baseUrl}/shows/`)));

    assert.ok(similarityCollection?.id);
    assert.ok(similarityAnchor?.cover);
    const similarityCollectionResponse = await fetch(
      `${context.baseUrl}/collections/${encodeURIComponent(similarityCollection.id)}`,
    );
    assert.equal(similarityCollectionResponse.status, 200);
    const similarityCollectionHtml = await similarityCollectionResponse.text();
    assert.match(
      similarityCollectionHtml,
      new RegExp(
        `<meta property="og:image" content="${new URL(`/${similarityAnchor.cover}`, context.baseUrl).toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      ),
    );

    const missingShowResponse = await fetch(`${context.baseUrl}/shows/missing-show`);
    assert.equal(missingShowResponse.status, 404);
    assert.match(missingShowResponse.headers.get("x-robots-tag") || "", /noindex/);

    const missingCollectionResponse = await fetch(`${context.baseUrl}/collections/missing-collection`);
    assert.equal(missingCollectionResponse.status, 404);
    assert.match(missingCollectionResponse.headers.get("x-robots-tag") || "", /noindex/);
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("public routes expose the home card hover expansion flag from env", async () => {
  const context = await startPublicRouteServer({
    HOME_CARD_HOVER_EXPAND_ENABLED: "false",
  });

  try {
    const response = await fetch(`${context.baseUrl}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<body[^>]*data-home-card-hover-expand-enabled="false"/);
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("search index responses use cache-friendly headers for versioned and unversioned requests", async () => {
  const context = await startPublicRouteServer();

  try {
    const versionedResponse = await fetch(`${context.baseUrl}/data/search-index.json?v=test-build`);
    assert.equal(versionedResponse.status, 200);
    assert.equal(versionedResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const unversionedResponse = await fetch(`${context.baseUrl}/data/search-index.json`);
    assert.equal(unversionedResponse.status, 200);
    assert.equal(
      unversionedResponse.headers.get("cache-control"),
      "public, max-age=0, must-revalidate, stale-while-revalidate=60",
    );
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("public 500s return branded HTML while API 500s stay JSON", async () => {
  const context = await startPublicRouteServer();

  try {
    const pageFailure = await fetch(`${context.baseUrl}/__test/boom`, {
      headers: {
        Accept: "text/html",
      },
    });
    assert.equal(pageFailure.status, 500);
    assert.match(pageFailure.headers.get("content-type") || "", /text\/html/);
    assert.match(await pageFailure.text(), /Temporary archive fault\./);

    const apiFailure = await fetch(`${context.baseUrl}/api/__test/boom`, {
      headers: {
        Accept: "application\/json",
      },
    });
    assert.equal(apiFailure.status, 500);
    assert.match(apiFailure.headers.get("content-type") || "", /application\/json/);
    const apiFailurePayload = await apiFailure.json();
    assert.equal(apiFailurePayload.error, "Unexpected server error.");
    assert.match(apiFailurePayload.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(apiFailure.headers.get("x-request-id"), apiFailurePayload.requestId);
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("server exposes only intended public files and preserves legacy show redirects", async () => {
  const context = await startPublicRouteServer();

  try {
    for (const route of [
      "/package.json",
      "/catalog-src/shows/_order.json",
      "/site-src/page-manifest.json",
      "/docs/ARCHITECTURE.md",
      "/deploy/echo-archives.service",
      "/README.md",
      "/TODO.md",
      "/data/schema.md",
      "/shared/package.json",
    ]) {
      const response = await fetch(`${context.baseUrl}${route}`);
      assert.equal(response.status, 404, route);
    }

    for (const route of [
      "/style.css",
      "/info.css",
      "/collections.css",
      "/creators.css",
      "/submit.css",
      "/maintainer.css",
      "/detail.css",
      "/chat.css",
      "/shared/app/app.js",
      "/echo-wordmark-nosub1.svg",
      "/echo-wordmark-sub1.svg",
      "/echo-wordmark1.png",
      "/data/reviews/impact-winter.json",
    ]) {
      const response = await fetch(`${context.baseUrl}${route}`);
      assert.equal(response.status, 200, route);
    }

    for (const [route, location] of [
      ["/shows/oz9/oz9.html", "/shows/oz-9"],
      ["/shows/Impact%20Winter/impact-winter.html", "/shows/impact-winter"],
      ["/shows/ars%20paradoxica/ars-paradoxica.html", "/shows/ars-paradoxica"],
    ]) {
      const legacy = await fetch(`${context.baseUrl}${route}`, { redirect: "manual" });
      assert.equal(legacy.status, 301, route);
      assert.equal(legacy.headers.get("location"), location, route);
    }
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("errors, contact, robots, canonical origin, and security headers have safe semantics", async () => {
  const context = await startPublicRouteServer();

  try {
    const missing = await fetch(`${context.baseUrl}/definitely-missing`, { headers: { Accept: "text/html" } });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-cache");
    assert.match(missing.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(await missing.text(), /Page not found\./i);

    assert.equal((await fetch(`${context.baseUrl}/404.html`)).status, 404);
    assert.equal((await fetch(`${context.baseUrl}/500.html`)).status, 500);
    assert.equal((await fetch(`${context.baseUrl}/offline.html`)).status, 200);

    const contact = await fetch(`${context.baseUrl}/contact`, { redirect: "manual" });
    assert.equal(contact.status, 302);
    assert.equal(contact.headers.get("location"), "https://contact.continental-hub.com/");

    const robots = await fetch(`${context.baseUrl}/robots.txt`);
    assert.equal(robots.status, 200);
    const robotsText = await robots.text();
    assert.match(robotsText, new RegExp(`Sitemap: ${context.baseUrl}/sitemap\\.xml`));
    assert.match(robotsText, /Disallow: \/maintainer\//);
    assert.match(robotsText, /Disallow: \/api\//);

    const response = await fetch(`${context.baseUrl}/shows/impact-winter`, {
      headers: { Host: "attacker.example" },
    });
    const html = await response.text();
    assert.match(html, new RegExp(`<link rel="canonical" href="${context.baseUrl}/shows/impact-winter"`));
    assert.doesNotMatch(html, /attacker\.example/);
    const csp = response.headers.get("content-security-policy") || "";
    assert.match(csp, /default-src 'self'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce);
    assert.ok(html.includes(`type="application/ld+json" nonce="${nonce}"`));
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");

    const missingShow = await fetch(`${context.baseUrl}/shows/not-a-show`);
    assert.equal(missingShow.status, 404);
    assert.match(missingShow.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(await missingShow.text(), /name="robots" content="noindex, nofollow, noarchive"/);

    const filteredHome = await fetch(`${context.baseUrl}/?q=horror`);
    assert.equal(filteredHome.status, 200);
    assert.match(filteredHome.headers.get("x-robots-tag") || "", /noindex, follow/);
    const filteredHomeHtml = await filteredHome.text();
    assert.match(filteredHomeHtml, /name="robots" content="noindex, follow, noarchive"/);
    assert.doesNotMatch(filteredHomeHtml, /https:\/\/echo\.continental-hub\.com/);
    const filteredStructuredData = JSON.parse(
      filteredHomeHtml.match(/<script id="pageStructuredData" type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1],
    );
    assert.equal(graphNode(filteredStructuredData, "WebPage").url, `${context.baseUrl}/`);

    const trackingQuery = await fetch(`${context.baseUrl}/shows/impact-winter?utm_source=test`, { redirect: "manual" });
    assert.equal(trackingQuery.status, 301);
    assert.equal(trackingQuery.headers.get("location"), "/shows/impact-winter");
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("public data responses are versionable and exclude server-only catalog fields", async () => {
  const context = await startPublicRouteServer();

  try {
    const showsResponse = await fetch(`${context.baseUrl}/data/shows.json?v=launch`);
    assert.equal(showsResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.match(showsResponse.headers.get("x-robots-tag") || "", /noindex/);
    const shows = await showsResponse.json();
    assert.ok(Array.isArray(shows));
    assert.equal(Object.hasOwn(shows[0], "imageSrc"), false);
    assert.equal(Object.hasOwn(shows[0], "searchIndex"), false);

    const collectionsResponse = await fetch(`${context.baseUrl}/data/collections.json?v=launch`);
    assert.equal(collectionsResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.match(collectionsResponse.headers.get("x-robots-tag") || "", /noindex/);
    assert.ok(Array.isArray(await collectionsResponse.json()));
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("malformed JSON requests remain actionable 400 responses", async () => {
  const context = await startPublicRouteServer();

  try {
    const response = await fetch(`${context.baseUrl}/api/submissions/shows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.doesNotMatch(payload.error || "", /unexpected server/i);
  } finally {
    await stopPublicRouteServer(context);
  }
});
