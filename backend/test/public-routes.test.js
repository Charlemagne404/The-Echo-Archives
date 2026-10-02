const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { XMLParser, XMLValidator } = require("fast-xml-parser");
const { loadCatalog, loadCollections } = require("../lib/catalog");
const { buildCollectionPath, isIndexableCollection } = require("../lib/seo");
const { loadEntities } = require("../lib/entities");
const { buildSitemapEntries } = require("../lib/sitemap");
const { injectRuntimeSiteConfig } = require("../lib/public-page-render");
const { createSimilarityIndex } = require("../../shared/archive-similarity");
const { findFreePort } = require("./helpers/free-port");
const { entityPath, getEntityShows, isIndexableEntity } = require("../../shared/archive-entities");
const { createVisibleStaticRoot } = require("./helpers/visible-static-root");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");

function publicFileVersion(relativePath) {
  return crypto.createHash("sha1").update(fs.readFileSync(path.join(siteRoot, relativePath))).digest("hex").slice(0, 10);
}

function graphNode(structuredData, type) {
  const nodes = Array.isArray(structuredData?.["@graph"]) ? structuredData["@graph"] : [structuredData];
  return nodes.find((node) => node?.["@type"] === type);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
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
  const staticRoot = createVisibleStaticRoot(tempDir, siteRoot);
  const dbPath = path.join(tempDir, "community.sqlite");
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVE_STATIC: "true",
      STATIC_ROOT: staticRoot,
      DB_PATH: dbPath,
      SITE_URL: baseUrl,
      NODE_ENV: "test",
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      ENABLE_TEST_ERROR_ROUTES: "true",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout?.resume();
  serverProcess.stderr?.resume();

  try {
    await waitForServer(`${baseUrl}/api/health`);
  } catch (error) {
    await stopPublicRouteServer({ serverProcess, tempDir });
    throw error;
  }

  return {
    baseUrl,
    serverProcess,
    tempDir,
  };
}

async function stopPublicRouteServer({ serverProcess, tempDir }) {
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceKillTimer);
        serverProcess.removeListener("exit", finish);
        serverProcess.removeListener("error", finish);
        resolve();
      };
      const forceKillTimer = setTimeout(() => {
        if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
          finish();
          return;
        }
        try {
          serverProcess.kill("SIGKILL");
        } catch (_error) {
          finish();
          return;
        }
        const finalWaitTimer = setTimeout(finish, 1_000);
        finalWaitTimer.unref();
      }, 15_000);
      forceKillTimer.unref();
      serverProcess.once("exit", finish);
      serverProcess.once("error", finish);
      try {
        serverProcess.kill("SIGTERM");
      } catch (_error) {
        finish();
      }
    });
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("missing generated page manifest fails before database initialization", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-missing-manifest-"));
  const staticRoot = createVisibleStaticRoot(tempDir, siteRoot);
  const dbPath = path.join(tempDir, "community.sqlite");
  const preloadPath = path.join(tempDir, "inject-missing-manifest.cjs");
  fs.writeFileSync(preloadPath, `
    const fs = require("node:fs");
    const readFileSync = fs.readFileSync;
    fs.readFileSync = function (filePath, ...args) {
      if (String(filePath).endsWith("/site-src/page-manifest.json")) {
        const error = new Error("ENOENT: injected missing generated page manifest");
        error.code = "ENOENT";
        throw error;
      }
      return readFileSync.call(this, filePath, ...args);
    };
  `);

  const serverProcess = spawn(process.execPath, ["--require", preloadPath, "server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: "42000",
      SERVE_STATIC: "true",
      STATIC_ROOT: staticRoot,
      DB_PATH: dbPath,
      SITE_URL: "http://127.0.0.1:42000",
      NODE_ENV: "test",
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  serverProcess.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });

  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        serverProcess.kill("SIGKILL");
        reject(new Error("Timed out waiting for startup to reject the missing page manifest."));
      }, 15_000);
      serverProcess.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      serverProcess.once("close", (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal });
      });
    });

    assert.notEqual(result.code, 0);
    assert.match(stderr, /injected missing generated page manifest/);
    assert.equal(fs.existsSync(dbPath), false, "startup validation must fail before SQLite can be created or migrated");
  } finally {
    if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
      serverProcess.kill("SIGKILL");
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runtime page config replaces public feature and data attributes", () => {
  for (const [publicAnalyticsEnabled, expectedAnalyticsValue] of [[false, "false"], [true, "true"]]) {
    const rendered = injectRuntimeSiteConfig(
      '<body data-analytics-enabled="stale" data-archivist-enabled="stale" data-shows-version="stale" data-collections-version="stale" data-search-index-version="stale"></body>',
      {
        publicAnalyticsEnabled,
        archivistEnabled: false,
        showsVersion: "shows-current",
        collectionsVersion: "collections-current",
        searchIndexVersion: "search-current",
      },
    );

    assert.match(rendered, new RegExp(`data-analytics-enabled="${expectedAnalyticsValue}"`));
    assert.match(rendered, /data-archivist-enabled="false"/);
    assert.match(rendered, /data-shows-version="shows-current"/);
    assert.match(rendered, /data-collections-version="collections-current"/);
    assert.match(rendered, /data-search-index-version="search-current"/);
    assert.doesNotMatch(rendered, /stale/);
  }
});

test("public HTML uses the runtime analytics flag instead of the build artifact flag", async () => {
  const context = await startPublicRouteServer({ PUBLIC_ANALYTICS_ENABLED: "false" });

  try {
    const response = await fetch(`${context.baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /data-analytics-enabled="false"/);
  } finally {
    await stopPublicRouteServer(context);
  }
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
      "/creators",
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
      ["/show?id=IMPACT-WINTER", "/shows/impact-winter"],
      ["/collection?id=BEST-FOR-LONG-WALKS", "/collections/best-for-long-walks"],
      ["/collection.html?id=best-for-long-walks", "/collections/best-for-long-walks"],
      ["/collections/best-for-long-walks/", "/collections/best-for-long-walks"],
      ["/ABOUT?utm_source=test", "/about?utm_source=test"],
      ["/ABOUT", "/about"],
      ["/ABOUT.HTML", "/about"],
      ["/SHOWS/IMPACT-WINTER", "/shows/impact-winter"],
      ["/COLLECTIONS/BEST-FOR-LONG-WALKS", "/collections/best-for-long-walks"],
      ["/CREATORS/7-LAMB-PRODUCTIONS", "/creators/7-lamb-productions"],
    ]) {
      const alias = await fetch(`${context.baseUrl}${route}`, { redirect: "manual" });
      assert.equal(alias.status, 301, route);
      assert.equal(alias.headers.get("location"), location, route);
    }
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("runtime sitemap matches the canonical route set and representative URLs return indexable pages", async () => {
  const context = await startPublicRouteServer();

  try {
    const robotsResponse = await fetch(`${context.baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200);
    const robots = await robotsResponse.text();
    assert.match(robots, new RegExp(`Sitemap: ${context.baseUrl}/sitemap\\.xml`));

    const sitemapResponse = await fetch(`${context.baseUrl}/sitemap.xml`);
    assert.equal(sitemapResponse.status, 200);
    assert.match(sitemapResponse.headers.get("content-type") || "", /^application\/xml(?:;|$)/i);
    const sitemapXml = await sitemapResponse.text();
    assert.equal(XMLValidator.validate(sitemapXml), true);

    const parsed = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(sitemapXml);
    assert.ok(parsed.urlset, "sitemap should be a URL set, not a sitemap index");
    const sitemapRecords = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
    const sitemapUrls = sitemapRecords.map((entry) => entry.loc);
    const catalog = await loadCatalog(siteRoot);
    const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
    const entities = loadEntities(siteRoot, catalog);
    const expectedUrls = buildSitemapEntries({
      siteUrl: context.baseUrl,
      catalog,
      collections,
      entities,
    }).map((entry) => entry.loc);

    assert.ok(sitemapUrls.length < 50_000, "single sitemap remains within the URL limit");
    assert.ok(Buffer.byteLength(sitemapXml) < 52_428_800, "single sitemap remains within the size limit");
    assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, "sitemap URLs must be unique");
    assert.deepEqual(new Set(sitemapUrls), new Set(expectedUrls));
    assert.ok(sitemapUrls.every((url) => new URL(url).origin === context.baseUrl));
    assert.ok(sitemapUrls.every((url) => !/[?#]/.test(url) && !url.endsWith(".html") && !url.endsWith("/index.html")));

    const sitemapUrlSet = new Set(sitemapUrls);
    const representativeUrls = [
      `${context.baseUrl}/`,
      `${context.baseUrl}/about`,
      `${context.baseUrl}/shows/impact-winter`,
      `${context.baseUrl}/collections/best-for-long-walks`,
      `${context.baseUrl}/collections/shows-like-midnight-burger`,
      `${context.baseUrl}/creators`,
      `${context.baseUrl}/creators/7-lamb-productions`,
    ];

    for (const url of representativeUrls) {
      assert.ok(sitemapUrlSet.has(url), `${url} should be in the sitemap`);
      const response = await fetch(url);
      assert.equal(response.status, 200, url);
      assert.match(response.headers.get("content-type") || "", /text\/html/i, url);
      const html = await response.text();
      const canonicalLinks = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/gi)];
      assert.equal(canonicalLinks.length, 1, `${url} should have exactly one canonical link`);
      assert.equal(canonicalLinks[0][1], url, `${url} should select itself as canonical`);
      assert.doesNotMatch(html, /<meta\s+name="robots"\s+content="noindex/i, `${url} must not be noindex`);
      assert.doesNotMatch(response.headers.get("x-robots-tag") || "", /noindex/i, `${url} response must be indexable`);
    }
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("public content pages negotiate Markdown without changing HTML defaults", async () => {
  const context = await startPublicRouteServer();

  try {
    const showPath = "/shows/impact-winter";
    const browserResponse = await fetch(`${context.baseUrl}${showPath}`);
    assert.equal(browserResponse.status, 200);
    assert.match(browserResponse.headers.get("content-type") || "", /text\/html/);
    assert.equal(browserResponse.headers.get("vary"), "Accept");
    assert.equal(browserResponse.headers.get("cache-control"), "no-cache");
    assert.match(await browserResponse.text(), /<html\b/i);

    const htmlResponse = await fetch(`${context.baseUrl}${showPath}`, {
      headers: { Accept: "text/html" },
    });
    assert.equal(htmlResponse.status, 200);
    assert.match(htmlResponse.headers.get("content-type") || "", /text\/html/);
    assert.equal(htmlResponse.headers.get("vary"), "Accept");

    const markdownResponse = await fetch(`${context.baseUrl}${showPath}`, {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get("content-type") || "", /^text\/markdown;\s*charset=utf-8/i);
    assert.equal(markdownResponse.headers.get("vary"), "Accept");
    assert.equal(markdownResponse.headers.get("cache-control"), "no-cache");
    assert.match(markdownResponse.headers.get("x-markdown-tokens") || "", /^\d+$/);
    const markdown = await markdownResponse.text();
    assert.match(markdown, /^---\ntitle:/);
    assert.match(markdown, /^# Impact Winter$/m);
    assert.match(markdown, /^## Archive review$/m);
    assert.match(markdown, /An amazing pick if you want something you can get completely obsessed with/);
    assert.match(markdown, /http:\/\/127\.0\.0\.1:\d+\/shows\/impact-winter/);
    assert.doesNotMatch(markdown, /<(?:html|nav|script|style|button|form|footer)\b/i);

    const markdownPreferred = await fetch(`${context.baseUrl}${showPath}`, {
      headers: { Accept: "text/markdown, text/html;q=0.9" },
    });
    assert.match(markdownPreferred.headers.get("content-type") || "", /^text\/markdown;/i);
    assert.equal(markdownPreferred.headers.get("vary"), "Accept");

    const htmlPreferred = await fetch(`${context.baseUrl}${showPath}`, {
      headers: { Accept: "text/html, text/markdown;q=0.9" },
    });
    assert.match(htmlPreferred.headers.get("content-type") || "", /text\/html/);
    assert.equal(htmlPreferred.headers.get("vary"), "Accept");

    const textWildcard = await fetch(`${context.baseUrl}${showPath}`, {
      headers: { Accept: "text/*" },
    });
    assert.match(textWildcard.headers.get("content-type") || "", /^text\/markdown;/i);
    assert.equal(textWildcard.headers.get("vary"), "Accept");

    const anyWildcard = await fetch(`${context.baseUrl}${showPath}`, {
      headers: { Accept: "*/*" },
    });
    assert.match(anyWildcard.headers.get("content-type") || "", /text\/html/);
    assert.equal(anyWildcard.headers.get("vary"), "Accept");

    const markdownRejected = await fetch(`${context.baseUrl}${showPath}`, {
      headers: { Accept: "text/markdown;q=0" },
    });
    assert.match(markdownRejected.headers.get("content-type") || "", /text\/html/);
    assert.equal(markdownRejected.headers.get("vary"), "Accept");

    const entityResponse = await fetch(`${context.baseUrl}/creators/7-lamb-productions`, {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(entityResponse.status, 200);
    assert.match(entityResponse.headers.get("content-type") || "", /^text\/markdown;/i);
    const entityMarkdown = await entityResponse.text();
    assert.match(entityMarkdown, /^# 7 Lamb Productions$/m);
    assert.match(entityMarkdown, /^## Connected shows$/m);
    assert.match(entityMarkdown, /\/shows\/tower-4/);

    const collectionResponse = await fetch(`${context.baseUrl}/collections/best-for-long-walks`, {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(collectionResponse.status, 200);
    assert.match(collectionResponse.headers.get("content-type") || "", /^text\/markdown;/i);
    const collectionMarkdown = await collectionResponse.text();
    assert.match(collectionMarkdown, /^# Best for long walks$/m);
    assert.match(collectionMarkdown, /Cinematic urgency and seasonal momentum/);
    assert.match(collectionMarkdown, /\/shows\/impact-winter/);

    const aboutResponse = await fetch(`${context.baseUrl}/about`, {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(aboutResponse.status, 200);
    assert.match(aboutResponse.headers.get("content-type") || "", /^text\/markdown;/i);
    const aboutMarkdown = await aboutResponse.text();
    assert.match(aboutMarkdown, /^# Why The Echo Archives exists$/m);
    assert.match(aboutMarkdown, /Published fiction podcasts in the archive/);
    assert.doesNotMatch(aboutMarkdown, /<(?:nav|script|style|button|form|footer)\b/i);

    const submissionResponse = await fetch(`${context.baseUrl}/submit`, {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(submissionResponse.status, 200);
    assert.match(submissionResponse.headers.get("content-type") || "", /text\/html/);
    assert.equal(submissionResponse.headers.get("vary"), null);

    const missingResponse = await fetch(`${context.baseUrl}/shows/not-a-real-show`, {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(missingResponse.status, 404);
    assert.match(missingResponse.headers.get("content-type") || "", /^text\/markdown;/i);
    assert.equal(missingResponse.headers.get("vary"), "Accept");
    assert.equal(missingResponse.headers.get("cache-control"), "no-cache");
    assert.match(missingResponse.headers.get("x-robots-tag") || "", /noindex/i);
    assert.match(await missingResponse.text(), /^# Show not found - The Echo Archives$/m);

    const missingEntityHtmlResponse = await fetch(`${context.baseUrl}/creators/not-a-real-creator`, {
      headers: { Accept: "text/html" },
    });
    assert.equal(missingEntityHtmlResponse.status, 404);
    assert.match(missingEntityHtmlResponse.headers.get("content-type") || "", /text\/html/);
    assert.equal(missingEntityHtmlResponse.headers.get("vary"), "Accept");
    assert.doesNotMatch(await missingEntityHtmlResponse.text(), /rel="canonical"|property="og:url"/i);

    const apiResponse = await fetch(`${context.baseUrl}/api/health`, {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(apiResponse.status, 200);
    assert.match(apiResponse.headers.get("content-type") || "", /application\/json/);
    assert.equal(apiResponse.headers.get("vary"), null);
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("all indexable creator and collection routes serve canonical structured pages", async () => {
  const context = await startPublicRouteServer();

  try {
    const catalog = await loadCatalog(siteRoot);
    const publishedShows = catalog.filter((show) => show.status === "published");
    const showMap = new Map(publishedShows.map((show) => [show.id, show]));
    const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
    const similarityIndex = createSimilarityIndex({ shows: publishedShows, collections });
    const entities = loadEntities(siteRoot, catalog);
    const routes = [
      ...entities.filter((entity) => isIndexableEntity(entity, publishedShows)).map((entity) => ({
        path: entityPath(entity.id),
        count: getEntityShows(entity.id, publishedShows).length,
        type: "CollectionPage",
      })),
      ...collections
        .map((collection) => ({
          collection,
          shows: collection.showIds.map((showId) => showMap.get(showId)).filter(Boolean),
        }))
        .filter(({ collection, shows }) => isIndexableCollection(collection, shows))
        .map(({ collection, shows }) => {
          const recommendationView = collection.kind === "similarity"
            ? similarityIndex.getShowsLikeCollectionView(collection.anchorShowId, collection)
            : null;
          return {
            path: buildCollectionPath(collection.id),
            count: recommendationView?.recommendations?.length || shows.length,
            type: "CollectionPage",
          };
        }),
    ];

    assert.ok(routes.length > 0);
    for (const route of routes) {
      const response = await fetch(`${context.baseUrl}${route.path}`);
      assert.equal(response.status, 200, route.path);
      const html = await response.text();
      const canonical = `${context.baseUrl}${route.path}`;
      assert.ok(html.includes(`<link rel="canonical" href="${canonical}" />`), route.path);

      const structuredDataMatch = html.match(
        /<script id="pageStructuredData" type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
      );
      assert.ok(structuredDataMatch, route.path);
      const structuredData = JSON.parse(structuredDataMatch[1]);
      const page = graphNode(structuredData, route.type);
      const itemList = graphNode(structuredData, "ItemList");
      assert.equal(page.url, canonical, route.path);
      assert.equal(itemList.numberOfItems, route.count, route.path);
      assert.equal(itemList.itemListElement.length, route.count, route.path);
    }
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("staging responses identify the environment and are excluded from indexing", async () => {
  const context = await startPublicRouteServer({
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "staging",
    SITE_URL: "http://127.0.0.1:3011",
    COMMUNITY_RATING_WRITES_ENABLED: "true",
    COMMUNITY_TURNSTILE_ENABLED: "false",
    COMMUNITY_VOTER_HASH_SECRET: "staging-test-voter-secret-123456789",
  });

  try {
    const response = await fetch(`${context.baseUrl}/`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-echo-environment"), "staging");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.match(await response.text(), /<meta[^>]+name="robots"[^>]+noindex/i);

    const health = await fetch(`${context.baseUrl}/api/health`);
    assert.equal(health.status, 200);
    const healthJson = await health.json();
    assert.deepEqual(healthJson, { ok: true, status: "ok" });
    assert.equal(health.headers.get("x-echo-release"), null);
    assert.equal(health.headers.get("x-echo-commit"), null);

    const robots = await fetch(`${context.baseUrl}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Disallow: \/\s*$/m);

    const offline = await fetch(`${context.baseUrl}/offline.html`);
    assert.equal(offline.status, 200);
    assert.match(await offline.text(), /data-site-url="http:\/\/127\.0\.0\.1:3011"/);
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("public health stays coarse while detailed health remains loopback-only", async () => {
  const internalPort = await findFreePort();
  const context = await startPublicRouteServer({
    INTERNAL_HEALTH_PORT: String(internalPort),
  });

  try {
    const publicHealth = await fetch(`${context.baseUrl}/api/health`);
    assert.deepEqual(await publicHealth.json(), { ok: true, status: "ok" });
    assert.equal(publicHealth.headers.get("x-echo-release"), null);
    assert.equal(publicHealth.headers.get("x-echo-commit"), null);

    const internalHealth = await fetch(`http://127.0.0.1:${internalPort}/api/health`);
    assert.equal(internalHealth.status, 200);
    const internalJson = await internalHealth.json();
    assert.equal(internalJson.ok, true);
    assert.equal(internalJson.status, "ok");
    assert.equal(internalJson.service, "echo-archives");
    assert.equal(internalJson.durability.synchronous, "FULL");
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("show and collection routes include crawler-visible metadata in the raw HTML response", async () => {
  const context = await startPublicRouteServer();

  try {
    const catalog = await loadCatalog(siteRoot);
    const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
    const publishedShowIds = new Set(catalog.filter((show) => show.status === "published").map((show) => show.id));
    const longWalkCollection = collections.find((collection) => collection.id === "best-for-long-walks");
    assert.ok(longWalkCollection);
    const longWalkShowCount = longWalkCollection.showIds.filter((showId) => publishedShowIds.has(showId)).length;
    const similarityCollection = collections.find((collection) => collection.kind === "similarity");
    const similarityAnchor = catalog.find((show) => show.id === similarityCollection?.anchorShowId);

    const showResponse = await fetch(`${context.baseUrl}/shows/impact-winter`);
    assert.equal(showResponse.status, 200);
    const showHtml = await showResponse.text();
    assert.match(showHtml, /<title>Impact Winter Review, Rating &amp; Similar Shows \| The Echo Archives<\/title>/);
    assert.match(showHtml, new RegExp(`<link rel="canonical" href="${context.baseUrl}/shows/impact-winter" \\/>`));
    assert.match(showHtml, new RegExp(`<meta property="og:image" content="${context.baseUrl}/`));
    assert.match(showHtml, /<main\b[^>]*id="showRoot"[^>]*>\s*<section class="detail-main podcast-detail detail-main--full">/);
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
    assert.ok(showWebPage.datePublished);
    assert.ok(showWebPage.dateModified);
    assert.equal(podcastSeries.datePublished, undefined);
    assert.equal(showBreadcrumbs.itemListElement.at(-1).item, `${context.baseUrl}/shows/impact-winter`);
    assert.ok(podcastSeries.creator.every((creator) => typeof creator === "string"));

    const unratedShowResponse = await fetch(`${context.baseUrl}/shows/marsfall`);
    assert.equal(unratedShowResponse.status, 200);
    const unratedShowHtml = await unratedShowResponse.text();
    assert.match(unratedShowHtml, /<h1>Marsfall<\/h1>/);
    assert.doesNotMatch(unratedShowHtml, /<strong class="detail-hero-score-value">--\/10<\/strong>/);
    assert.doesNotMatch(unratedShowHtml, /No listener reviews yet/);
    assert.doesNotMatch(unratedShowHtml, /\b0(?:\.0)?\/10\b/);
    assert.doesNotMatch(unratedShowHtml, /Echo score/);

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
    assert.match(collectionHtml, new RegExp(`${longWalkShowCount} shows in this collection`));
    assert.match(collectionHtml, /href="\/shows\/impact-winter"/);
    assert.match(collectionHtml, /class="collection-show-card-note"/);
    assert.match(collectionHtml, /data-discovery-recommendation-source="collection_membership"/);
    const collectionStructuredDataMatch = collectionHtml.match(
      /<script id="pageStructuredData" type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
    );
    assert.ok(collectionStructuredDataMatch);
    const collectionStructuredData = JSON.parse(collectionStructuredDataMatch[1]);
    const collectionPage = graphNode(collectionStructuredData, "CollectionPage");
    const collectionItemList = graphNode(collectionStructuredData, "ItemList");
    assert.equal(collectionPage.url, `${context.baseUrl}/collections/best-for-long-walks`);
    assert.equal(collectionItemList.numberOfItems, longWalkShowCount);
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
    assert.match(similarityCollectionHtml, /data-collection-prerendered="true"/);
    assert.match(similarityCollectionHtml, /<h2 id="collection-shows-title">Closest overall<\/h2>/);
    assert.match(similarityCollectionHtml, /collection-recommendation-section--atmosphere|collection-recommendation-section--premise|collection-recommendation-section--storytelling/);
    assert.match(similarityCollectionHtml, new RegExp(`href="\/?\\?collection=${encodeURIComponent(similarityCollection.id)}#archive"`));

    const overflowCollection = collections.find((collection) => collection.id === "shows-like-the-magnus-archives");
    assert.ok(overflowCollection?.id);
    const overflowCollectionResponse = await fetch(
      `${context.baseUrl}/collections/${encodeURIComponent(overflowCollection.id)}`,
    );
    assert.equal(overflowCollectionResponse.status, 200);
    assert.match(await overflowCollectionResponse.text(), /<details class="collection-recommendation-overflow">/);

    const generatedSimilarityCollection = collections.find((collection) => collection.generatedFrom === "authored-similarTo");
    assert.ok(generatedSimilarityCollection?.id);
    const generatedCollectionResponse = await fetch(
      `${context.baseUrl}/collections/${encodeURIComponent(generatedSimilarityCollection.id)}`,
    );
    assert.equal(generatedCollectionResponse.status, 200);
    assert.doesNotMatch(generatedCollectionResponse.headers.get("x-robots-tag") || "", /noindex/i);
    const generatedCollectionHtml = await generatedCollectionResponse.text();
    assert.match(generatedCollectionHtml, /Authored similarity route/);
    assert.match(generatedCollectionHtml, /collection-recommendation-section--hidden-gems/);
    assert.match(generatedCollectionHtml, /data-discovery-recommendation-source="computed_similarity"/);
    const generatedStructuredDataMatch = generatedCollectionHtml.match(
      /<script id="pageStructuredData" type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
    );
    assert.ok(generatedStructuredDataMatch);
    const generatedStructuredData = JSON.parse(generatedStructuredDataMatch[1]);
    const generatedItemList = graphNode(generatedStructuredData, "ItemList");
    assert.ok(generatedItemList.itemListElement.every((item) => item.description?.length >= 20));
    assert.match(generatedCollectionHtml, new RegExp(`href="\/?\\?collection=${encodeURIComponent(generatedSimilarityCollection.id)}#archive"`));

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
    const referenceResponse = await fetch(`${context.baseUrl}/data/archive.json`);
    assert.equal(referenceResponse.status, 200);
    assert.match(referenceResponse.headers.get("content-type") || "", /application\/json/);
    assert.match(referenceResponse.headers.get("x-robots-tag") || "", /noindex/);
    assert.equal(referenceResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate, stale-while-revalidate=60");
    const reference = await referenceResponse.json();
    assert.equal(reference.canonical, `${context.baseUrl}/data/archive.json`);
    assert.equal(reference.resources.find((resource) => resource.id === "shows").href, `${context.baseUrl}/data/shows.json`);
    assert.ok(reference.relationships.some((relationship) => relationship.relation === "curated-membership"));

    const graphResponse = await fetch(`${context.baseUrl}/data/entity-graph.json`);
    assert.equal(graphResponse.status, 200);
    assert.match(graphResponse.headers.get("content-type") || "", /application\/json/);
    assert.match(graphResponse.headers.get("x-robots-tag") || "", /noindex/);
    assert.equal(graphResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate, stale-while-revalidate=60");
    const graph = await graphResponse.json();
    assert.equal(graph.schema, "echo-archives/entity-graph/v1");
    assert.ok(Array.isArray(graph.edges) && graph.edges.length > 0);
    assert.ok(graph.entities.some((entity) => entity.id === "7-lamb-productions"));
    assert.ok(Array.isArray(graph.entityConnections));
    assert.match(graph.semantics.entityConnections, /does not assert a direct affiliation/);

    const versionedResponse = await fetch(`${context.baseUrl}/data/search-index.json?v=${publicFileVersion("data/search-index.json")}`);
    assert.equal(versionedResponse.status, 200);
    assert.equal(versionedResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const falseVersionResponse = await fetch(`${context.baseUrl}/data/search-index.json?v=test-build`);
    assert.equal(falseVersionResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate, stale-while-revalidate=60");

    const unversionedResponse = await fetch(`${context.baseUrl}/data/search-index.json`);
    assert.equal(unversionedResponse.status, 200);
    assert.equal(
      unversionedResponse.headers.get("cache-control"),
      "public, max-age=0, must-revalidate, stale-while-revalidate=60",
    );

    const runtimeResponse = await fetch(`${context.baseUrl}/data/runtime-evidence.json?v=${publicFileVersion("data/runtime-evidence.json")}`);
    assert.equal(runtimeResponse.status, 200);
    assert.match(runtimeResponse.headers.get("content-type") || "", /application\/json/);
    assert.match(runtimeResponse.headers.get("x-robots-tag") || "", /noindex/);
    assert.equal(runtimeResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
    const runtimeEvidence = await runtimeResponse.json();
    assert.ok(runtimeEvidence.find((entry) => entry.id === "solar")?.length?.totalHours > 0);

    for (const route of [
      "/data/archive-stats.json",
      "/data/tag-taxonomy.json",
      "/data/reviews/impact-winter.json",
    ]) {
      const response = await fetch(`${context.baseUrl}${route}`);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get("content-type") || "", /application\/json/i, route);
      assert.match(response.headers.get("x-robots-tag") || "", /noindex, nofollow, noarchive/i, route);
    }
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("submission show context exposes only public objective fields", async () => {
  const context = await startPublicRouteServer();
  const [knownShow] = JSON.parse(fs.readFileSync(path.join(siteRoot, "data", "shows.json"), "utf8"));
  try {
    const response = await fetch(`${context.baseUrl}/api/submissions/shows/${knownShow.id}/context`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.show.id, knownShow.id);
    assert.equal(payload.show.title, knownShow.title);
    assert.ok(Array.isArray(payload.show.creators));
    assert.ok(Array.isArray(payload.show.listenLinks));
    assert.ok(Array.isArray(payload.show.officialLinks));
    assert.deepEqual(Object.keys(payload.show).sort(), [
      "completionStatus",
      "creators",
      "id",
      "listenLinks",
      "officialDescription",
      "officialLinks",
      "title",
    ]);
    assert.equal((await fetch(`${context.baseUrl}/api/submissions/shows/not-a-real-show/context`)).status, 404);
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
      "/%2e%2e/package.json",
      "/data/%2e%2e/site-src/page-manifest.json",
      "/shared%2f..%2fsite-src%2fpage-manifest.json",
    ]) {
      const response = await fetch(`${context.baseUrl}${route}`);
      assert.equal(response.status, 404, route);
    }

    for (const route of [
      "/style.css",
      "/public-heroes.css",
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
    const missingHtml = await missing.text();
    assert.match(missingHtml, /Page not found\./i);
    assert.doesNotMatch(missingHtml, /rel="canonical"|property="og:url"/i);

    const notFoundPage = await fetch(`${context.baseUrl}/404.html`);
    assert.equal(notFoundPage.status, 404);
    assert.doesNotMatch(await notFoundPage.text(), /rel="canonical"|property="og:url"/i);
    const serverErrorPage = await fetch(`${context.baseUrl}/500.html`);
    assert.equal(serverErrorPage.status, 500);
    assert.doesNotMatch(await serverErrorPage.text(), /rel="canonical"|property="og:url"/i);
    assert.equal((await fetch(`${context.baseUrl}/offline.html`)).status, 200);

    const contact = await fetch(`${context.baseUrl}/contact`, { redirect: "manual" });
    assert.equal(contact.status, 302);
    assert.equal(contact.headers.get("location"), "https://contact.continental-hub.com/");

    const robots = await fetch(`${context.baseUrl}/robots.txt`);
    assert.equal(robots.status, 200);
    const robotsText = await robots.text();
    const robotsGeneralGroup = robotsText.split(/\n\s*\n/)[0];
    assert.match(robotsGeneralGroup, /^User-agent: \*$/m);
    assert.match(robotsGeneralGroup, /^Content-Signal: ai-train=no, search=yes, ai-input=yes$/m);
    assert.match(robotsGeneralGroup, /^Allow: \/$/m);
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
    const missingShowHtml = await missingShow.text();
    assert.match(missingShowHtml, /name="robots" content="noindex, nofollow, noarchive"/);
    assert.doesNotMatch(missingShowHtml, /rel="canonical"|property="og:url"/i);

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
    const showsResponse = await fetch(`${context.baseUrl}/data/shows.json?v=${publicFileVersion("data/shows.json")}`);
    assert.equal(showsResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.match(showsResponse.headers.get("x-robots-tag") || "", /noindex/);
    const shows = await showsResponse.json();
    assert.ok(Array.isArray(shows));
    assert.equal(Object.hasOwn(shows[0], "imageSrc"), false);
    assert.equal(Object.hasOwn(shows[0], "searchIndex"), false);

    const collectionsResponse = await fetch(`${context.baseUrl}/data/collections.json?v=${publicFileVersion("data/collections.json")}`);
    assert.equal(collectionsResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.match(collectionsResponse.headers.get("x-robots-tag") || "", /noindex/);
    assert.ok(Array.isArray(await collectionsResponse.json()));
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("malformed, oversized, and unsupported JSON requests fail safely", async () => {
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

    const oversized = await fetch(`${context.baseUrl}/api/submissions/shows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "x".repeat(30_000) }),
    });
    assert.equal(oversized.status, 413);
    const oversizedPayload = await oversized.json();
    assert.doesNotMatch(oversizedPayload.error || "", /stack|node_modules|internal\/modules/i);

    const unsupportedType = await fetch(`${context.baseUrl}/api/submissions/shows`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{\"showTitle\":\"not parsed\"}",
    });
    assert.equal(unsupportedType.status, 400);
    const unsupportedPayload = await unsupportedType.json();
    assert.doesNotMatch(unsupportedPayload.error || "", /stack|node_modules|internal\/modules/i);
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("malformed public traffic is bounded and negotiated variants cannot share cache identity", async () => {
  const context = await startPublicRouteServer();
  try {
    const html = await fetch(`${context.baseUrl}/shows/impact-winter`, { headers: { Accept: "text/html" } });
    const markdown = await fetch(`${context.baseUrl}/shows/impact-winter`, { headers: { Accept: "text/markdown" } });
    assert.match(html.headers.get("content-type") || "", /text\/html/);
    assert.match(markdown.headers.get("content-type") || "", /text\/markdown/);
    assert.match(html.headers.get("vary") || "", /Accept/i);
    assert.match(markdown.headers.get("vary") || "", /Accept/i);
    assert.equal(html.headers.get("cache-control"), "no-cache");
    assert.equal(markdown.headers.get("cache-control"), "no-cache");

    const falseAssetVersion = await fetch(`${context.baseUrl}/style.css?v=arbitrary`);
    assert.equal(falseAssetVersion.status, 200);
    assert.notEqual(falseAssetVersion.headers.get("cache-control"), "public, max-age=31536000, immutable");
    const validAssetVersion = await fetch(`${context.baseUrl}/style.css?v=${publicFileVersion("style.css")}`);
    assert.equal(validAssetVersion.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const longUrl = await fetch(`${context.baseUrl}/?q=${"a".repeat(9000)}`);
    assert.equal(longUrl.status, 414);
    assert.equal(longUrl.headers.get("cache-control"), "no-store");
    const parameterFlood = await fetch(`${context.baseUrl}/?${Array.from({ length: 101 }, (_, i) => `x${i}=1`).join("&")}`);
    assert.equal(parameterFlood.status, 400);
    const traceStatus = await new Promise((resolve, reject) => {
      const request = http.request(`${context.baseUrl}/shows/impact-winter`, { method: "TRACE" }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      request.on("error", reject);
      request.end();
    });
    assert.equal(traceStatus, 405);
    const head = await fetch(`${context.baseUrl}/shows/impact-winter`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.match(head.headers.get("vary") || "", /Accept/i);
    for (const route of ["/shows/%ZZ", "/shows/%00", "/shows/%2F", "/shows/" + "x".repeat(300)]) {
      const response = await fetch(`${context.baseUrl}${route}`, { redirect: "manual" });
      assert.ok(response.status >= 400 && response.status < 500, `${route}: ${response.status}`);
    }
  } finally {
    await stopPublicRouteServer(context);
  }
});

test("a malformed catalogue refresh serves the last good snapshot and fails readiness", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-catalogue-reload-"));
  for (const name of fs.readdirSync(siteRoot)) {
    if (name === "catalog-src" || name === "data") {
      fs.cpSync(path.join(siteRoot, name), path.join(fixtureRoot, name), { recursive: true });
    } else if (!name.startsWith(".")) {
      fs.symlinkSync(path.join(siteRoot, name), path.join(fixtureRoot, name));
    }
  }
  const showPath = path.join(fixtureRoot, "catalog-src", "shows", "impact-winter.json");
  const dataPath = path.join(fixtureRoot, "data", "shows.json");
  const originalShow = fs.readFileSync(showPath);
  let context;
  try {
    context = await startPublicRouteServer({ STATIC_ROOT: fixtureRoot });
    assert.equal((await fetch(`${context.baseUrl}/shows/impact-winter`)).status, 200);
    fs.writeFileSync(showPath, "{broken-json");
    fs.appendFileSync(dataPath, "\n");
    const stalePage = await fetch(`${context.baseUrl}/shows/impact-winter`);
    assert.equal(stalePage.status, 200);
    assert.match(await stalePage.text(), /Impact Winter/);
    const degraded = await fetch(`${context.baseUrl}/api/health`);
    assert.equal(degraded.status, 503);
    assert.deepEqual(await degraded.json(), { ok: false, status: "degraded" });

    fs.writeFileSync(showPath, originalShow);
    await new Promise((resolve) => setTimeout(resolve, 5100));
    assert.equal((await fetch(`${context.baseUrl}/shows/impact-winter`)).status, 200);
    assert.equal((await fetch(`${context.baseUrl}/api/health`)).status, 200);
  } finally {
    if (context) await stopPublicRouteServer(context);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});


test("missing error templates cannot expose an Express stack trace", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-error-disk-"));
  let server;
  try {
    for (const name of fs.readdirSync(siteRoot)) {
      if (!name.startsWith(".") && name !== "500.html" && name !== "404.html") {
        fs.symlinkSync(path.join(siteRoot, name), path.join(fixtureRoot, name));
      }
    }
    server = await startPublicRouteServer({ STATIC_ROOT: fixtureRoot });
    const response = await fetch(`${server.baseUrl}/__test/boom`, { headers: { Accept: "text/html" } });
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.match(body, /Server Error/);
    assert.doesNotMatch(body, /Intentional|ENOENT|server\.js|Error:|at Object/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const missing = await fetch(`${server.baseUrl}/unavailable-page`, { headers: { Accept: "text/html" } });
    assert.equal(missing.status, 404);
    assert.doesNotMatch(await missing.text(), /ENOENT|Error:|at Object/);
  } finally {
    if (server) await stopPublicRouteServer(server);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});


test("shared proxy isolates representations, credentials, queries, expiry and purge", async () => {
  const { startCacheProxy } = require("./helpers/cache-proxy");
  const context = await startPublicRouteServer({ MAINTAINER_REVIEW_PASSPHRASE: "test-passphrase", MAINTAINER_REVIEW_COOKIE_SECRET: "test-cookie-secret" });
  const proxy = await startCacheProxy(context.baseUrl);
  try {
    const asset = `/style.css?v=${publicFileVersion("style.css")}`;
    assert.equal((await fetch(proxy.url + asset)).headers.get("cf-cache-status"), "MISS");
    assert.equal((await fetch(proxy.url + asset)).headers.get("cf-cache-status"), "HIT");
    assert.equal((await fetch(proxy.url + asset, { headers: { Cookie: "session=invalid" } })).headers.get("cf-cache-status"), "BYPASS");
    assert.notEqual((await fetch(proxy.url + "/style.css?v=false")).headers.get("cf-cache-status"), "HIT");
    for (const accept of ["text/html", "text/markdown", "text/html"]) {
      const response = await fetch(proxy.url + "/shows/impact-winter", { headers: { Accept: accept } });
      assert.equal(response.headers.get("cf-cache-status"), "DYNAMIC");
      assert.match(response.headers.get("content-type"), accept === "text/markdown" ? /markdown/ : /html/);
    }
    const privateResponse = await fetch(proxy.url + "/api/maintainer/submissions", { headers: { Cookie: "echo-maintainer-session=invalid" } });
    assert.equal(privateResponse.headers.get("cf-cache-status"), "BYPASS");
    assert.equal(privateResponse.status, 401);
    assert.match(privateResponse.headers.get("cache-control"), /no-store/);
    proxy.advance(366 * 24 * 60 * 60 * 1000);
    assert.equal((await fetch(proxy.url + asset)).headers.get("cf-cache-status"), "EXPIRED");
    proxy.purge();
    assert.equal((await fetch(proxy.url + asset)).headers.get("cf-cache-status"), "MISS");
  } finally {
    await proxy.close();
    await stopPublicRouteServer(context);
  }
});


test("database read failure degrades readiness without leaking internals or blocking static reads", async () => {
  const faultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-db-fault-"));
  const loader = path.join(faultRoot, "fault.cjs");
  fs.writeFileSync(loader, `const Database = require(${JSON.stringify(require.resolve("better-sqlite3"))});
    const prepare = Database.prototype.prepare;
    let failed = false;
    process.on("SIGUSR2", () => { failed = !failed; });
    Database.prototype.prepare = function (...args) {
      if (failed) throw new Error("Synthetic database unavailable: private/path.sqlite");
      const statement = prepare.apply(this, args);
      return new Proxy(statement, { get(target, key) {
        const value = Reflect.get(target, key);
        if (typeof value !== "function") return value;
        return (...params) => {
          if (failed) throw new Error("Synthetic database unavailable: private/path.sqlite");
          return value.apply(target, params);
        };
      } });
    };`);
  let context;
  try {
    context = await startPublicRouteServer({ NODE_OPTIONS: `--require=${loader}` });
    context.serverProcess.kill("SIGUSR2");
    let health;
    for (let i = 0; i < 30; i += 1) {
      health = await fetch(`${context.baseUrl}/api/health`);
      if (health.status === 503) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { ok: false, status: "unhealthy" });
    const show = await fetch(`${context.baseUrl}/shows/impact-winter`, { headers: { Accept: "text/html" } });
    assert.equal(show.status, 500);
    assert.doesNotMatch(await show.text(), /Synthetic|private\/path|sqlite|Error:/);
    assert.equal((await fetch(`${context.baseUrl}/style.css`)).status, 200);
    assert.equal((await fetch(`${context.baseUrl}/sitemap.xml`)).status, 200);
    context.serverProcess.kill("SIGUSR2");
    await waitForServer(`${context.baseUrl}/api/health`, 5000);
    assert.equal((await fetch(`${context.baseUrl}/shows/impact-winter`)).status, 200);
  } finally {
    if (context) await stopPublicRouteServer(context);
    fs.rmSync(faultRoot, { recursive: true, force: true });
  }
});


test("a locked SQLite writer fails cheaply while public reads remain responsive", async () => {
  const Database = require("better-sqlite3");
  const context = await startPublicRouteServer();
  const locker = new Database(path.join(context.tempDir, "community.sqlite"));
  try {
    locker.exec("BEGIN IMMEDIATE");
    const started = performance.now();
    const writing = fetch(`${context.baseUrl}/api/submissions/shows`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intakeVersion: 2, submissionType: "show", showTitle: "Local Lock Fixture", listenLinks: [{ label: "Official Website", url: "https://example.com" }], legalAcknowledged: true, legalVersion: "2026-09-15" }),
    });
    const response = await writing;
    const elapsed = performance.now() - started;
    console.log(`SQLite locked-write response: ${response.status}, ${elapsed.toFixed(0)} ms`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "1");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.ok(elapsed < 1000, `locked write took ${elapsed} ms`);
    assert.equal((await fetch(`${context.baseUrl}/sitemap.xml`)).status, 200);
    assert.equal((await fetch(`${context.baseUrl}/api/health`)).status, 503);
    const burstStarted = performance.now();
    const burst = await Promise.all(Array.from({ length: 10 }, () => fetch(`${context.baseUrl}/api/submissions/shows`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    })));
    assert.ok(burst.every((response) => response.status === 503));
    assert.ok(performance.now() - burstStarted < 500, "busy cooldown avoids repeating synchronous DB waits");
    locker.exec("ROLLBACK");
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.equal((await fetch(`${context.baseUrl}/api/health`)).status, 200);
    const recovered = await fetch(`${context.baseUrl}/api/submissions/shows`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intakeVersion: 2, submissionType: "show", showTitle: "Recovered Fixture", listenLinks: [{ label: "Official Website", url: "https://example.com" }], legalAcknowledged: true, legalVersion: "2026-09-15" }),
    });
    assert.equal(recovered.status, 201);
  } finally {
    if (locker.inTransaction) locker.exec("ROLLBACK");
    locker.close();
    await stopPublicRouteServer(context);
  }
});

test("startup recovers a SIGKILL publication before serving public pages", async () => {
  const { spawnSync } = require("node:child_process");
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-startup-recovery-"));
  let context;
  try {
    for (const name of fs.readdirSync(siteRoot)) {
      if (["catalog-src", "data", "docs"].includes(name)) fs.cpSync(path.join(siteRoot, name), path.join(fixtureRoot, name), { recursive: true });
      else if (!name.startsWith(".")) fs.symlinkSync(path.join(siteRoot, name), path.join(fixtureRoot, name));
    }
    const sourceModule = require.resolve("../../tools/lib/catalog-source");
    const crashed = spawnSync(process.execPath, ["-e", `const fs=require('node:fs');const root=process.env.CRASH_ROOT;const show=JSON.parse(fs.readFileSync(root+'/catalog-src/shows/impact-winter.json'));show.title='Interrupted replacement';require(${JSON.stringify(sourceModule)}).writeShowRecordsAtomically(root,[show],{deferCommit:true});fs.writeFileSync(root+'/data/shows.json','invalid partial artifact');process.kill(process.pid,'SIGKILL');`], { env: { ...process.env, CRASH_ROOT: fixtureRoot }, timeout: 10000 });
    assert.equal(crashed.signal, "SIGKILL", crashed.stderr.toString());
    context = await startPublicRouteServer({ STATIC_ROOT: fixtureRoot });
    const response = await fetch(`${context.baseUrl}/shows/impact-winter`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Impact Winter/);
    assert.doesNotMatch(html, /Interrupted replacement/);
    assert.equal((await fetch(`${context.baseUrl}/api/health`)).status, 200);
    assert.equal(fs.existsSync(path.join(fixtureRoot, ".echo-catalog-transaction")), false);
  } finally {
    if (context) await stopPublicRouteServer(context);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
