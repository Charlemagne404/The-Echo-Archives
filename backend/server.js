const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");

const config = require("./lib/config");
const { createAccessObservability } = require("./lib/access-observability");
const { loadArchiveContext } = require("./lib/ai/archive-context");
const { loadCatalog, loadCollections } = require("./lib/catalog");
const { createMaintainerAuth } = require("./lib/maintainer-auth");
const { buildSitemapXml } = require("./lib/sitemap");
const { openDatabase } = require("./lib/store/database");
const { createCommunityStore } = require("./lib/store/community-store");
const { createImportStore } = require("./lib/store/import-store");
const { createCollectionStore } = require("./lib/store/collection-store");
const { createPublishedListenerReviewStore } = require("./lib/store/published-listener-review-store");
const { createRateLimitStore } = require("./lib/store/rate-limit-store");
const { createSubmissionStore } = require("./lib/store/submission-store");
const { createCommunityService } = require("./lib/services/community-service");
const { createImportService } = require("./lib/services/import-service");
const { createCollectionService } = require("./lib/services/collection-service");
const { createElevationService } = require("./lib/services/elevation-service");
const { createRateLimitService } = require("./lib/services/rate-limit-service");
const { createSubmissionService } = require("./lib/services/submission-service");
const { createPublishedListenerReviewService } = require("./lib/services/published-listener-review-service");
const { applyGeneratedCoverVariants } = require("./lib/responsive-images");
const { createTurnstileService } = require("./lib/services/turnstile-service");
const { createChatRouter } = require("./lib/routes/chat-routes");
const { createCommunityRouter } = require("./lib/routes/community-routes");
const { createMaintainerRouter } = require("./lib/routes/maintainer-routes");
const { createSubmissionRouter } = require("./lib/routes/submission-routes");
const { createPublishedListenerReviewRouter } = require("./lib/routes/published-listener-review-routes");
const { loadSiteHelpContext } = require("./lib/ai/site-help");
const {
  buildCollectionPageMetadata,
  buildCollectionStructuredData,
  buildShowPageMetadata,
  buildShowStructuredData,
  injectCollectionSummary,
  injectCollectionShowCards,
  injectJsonBootstrap,
  injectNoIndex,
  injectRuntimeSiteConfig,
  injectPageMetadata,
  injectStructuredData,
} = require("./lib/public-page-render");
const { buildCollectionPath, buildShowPath, isIndexableCollection } = require("./lib/seo");
const {
  createMissingShowPageMarkup,
  createShowPageMarkup,
  injectShowRootContent,
} = require("./lib/show-page-render");
const { createSearchIndexRecord, serializeRuntimeShow } = require("../tools/lib/catalog-artifacts");

const CONTACT_URL = "https://contact.continental-hub.com/";
const PUBLIC_ROOT_ASSETS = new Set([
  "style.css",
  "public-heroes.css",
  "home.css",
  "info.css",
  "collections.css",
  "creators.css",
  "submit.css",
  "maintainer.css",
  "detail.css",
  "chat.css",
  "script.js",
  "sw.js",
  "site.webmanifest",
  "favicon.ico",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "echo-wordmark1.png",
  "echo-wordmark-nosub1.svg",
  "echo-wordmark-sub1.svg",
  "og-image.png",
]);
const PUBLIC_SHARED_EXTENSIONS = new Set([".css", ".js"]);
const PUBLIC_IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);

const PUBLIC_ROUTE_REDIRECTS = new Map([
  ["/index.html", "/"],
  ["/about.html", "/about"],
  ["/for-creators.html", "/for-creators"],
  ["/creator-standards.html", "/creator-standards"],
  ["/supporters.html", "/supporters"],
  ["/help-center.html", "/help-center"],
  ["/collections.html", "/collections"],
  ["/collection.html", "/collection"],
  ["/show.html", "/show"],
  ["/submit.html", "/submit"],
  ["/privacy.html", "/privacy"],
  ["/terms.html", "/terms"],
  ["/cookies.html", "/cookies"],
  ["/copyright.html", "/copyright"],
]);

const PUBLIC_PAGE_FILES = new Map([
  ["/", "index.html"],
  ["/about", "about.html"],
  ["/for-creators", "for-creators.html"],
  ["/creator-standards", "creator-standards.html"],
  ["/supporters", "supporters.html"],
  ["/help-center", "help-center.html"],
  ["/collections", "collections.html"],
  ["/collection", "collection.html"],
  ["/show", "show.html"],
  ["/submit", "submit.html"],
  ["/privacy", "privacy.html"],
  ["/terms", "terms.html"],
  ["/cookies", "cookies.html"],
  ["/copyright", "copyright.html"],
]);

function normalizeSiteUrl(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function hashPublicFile(staticRoot, relativePath) {
  try {
    return crypto
      .createHash("sha1")
      .update(fs.readFileSync(path.join(staticRoot, relativePath)))
      .digest("hex")
      .slice(0, 10);
  } catch (_error) {
    return "";
  }
}

function getPublicDataRevision(staticRoot) {
  return ["data/shows.json", "data/collections.json", "data/search-index.json"]
    .map((relativePath) => {
      try {
        const file = fs.statSync(path.join(staticRoot, relativePath));
        return `${relativePath}:${file.size}:${file.mtimeMs}`;
      } catch (_error) {
        return `${relativePath}:missing`;
      }
    })
    .join("|");
}

function setPublicCacheHeaders(req, res, { image = false } = {}) {
  if (typeof req.query.v === "string" && req.query.v.trim()) {
    res.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (image) {
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  } else {
    res.set("Cache-Control", "public, max-age=0, must-revalidate, stale-while-revalidate=60");
  }
}

function applySecurityHeaders(req, res, next) {
  req.cspNonce = crypto.randomBytes(18).toString("base64");
  res.set({
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'nonce-${req.cspNonce}' https://plausible.io https://challenges.cloudflare.com`,
      "connect-src 'self' https://plausible.io https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self'",
      "manifest-src 'self'",
    ].join("; "),
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  next();
}

function allowStaticExtensions(allowedExtensions) {
  return (req, res, next) => {
    if (!allowedExtensions.has(path.extname(req.path).toLowerCase())) {
      return res.status(404).end();
    }
    return next();
  };
}

function buildStaticPageMetadata({ routePath, requestSiteUrl, manifestEntry }) {
  const normalizedSiteUrl = normalizeSiteUrl(requestSiteUrl);
  const normalizedRoutePath = routePath === "/" ? "/" : String(routePath || "").replace(/\/+$/, "");
  const canonicalUrl = `${normalizedSiteUrl}${normalizedRoutePath}`;

  return {
    title: manifestEntry.title,
    description: manifestEntry.description,
    canonicalUrl,
    imageUrl: `${normalizedSiteUrl}/echo-wordmark1.png`,
  };
}

async function startServer() {
  config.validateConfig(config);
  const app = express();
  const state = {
    catalog: [],
    publicCatalog: [],
    publicRuntimeCatalog: [],
    publicSearchIndex: [],
    collections: [],
    archiveContext: null,
    siteHelpContext: null,
    showsVersion: "",
    collectionsVersion: "",
    searchIndexVersion: "",
    publicDataRevision: "",
  };
  let publicStateRefreshPromise = null;

  async function reloadState() {
    const catalog = await loadCatalog(config.STATIC_ROOT, {
      coverSync: {
        timeoutMs: config.IMPORT_FETCH_TIMEOUT_MS,
        documentMaxBytes: config.IMPORT_DOCUMENT_MAX_BYTES,
        coverMaxBytes: config.IMPORT_COVER_MAX_BYTES,
      },
    });
    applyGeneratedCoverVariants(config.STATIC_ROOT, catalog);
    const publicCatalog = catalog.filter((show) => show.status === "published");
    const publicRuntimeCatalog = publicCatalog.map(serializeRuntimeShow);
    const publicSearchIndex = publicCatalog.map(createSearchIndexRecord);
    const collections = loadCollections(config.STATIC_ROOT, new Set(catalog.map((show) => show.id)));
    const archiveContext = await loadArchiveContext(config.STATIC_ROOT, catalog, collections);
    const siteHelpContext = loadSiteHelpContext({ catalog: publicCatalog, collections, archiveContext });

    state.catalog = catalog;
    state.publicCatalog = publicCatalog;
    state.publicRuntimeCatalog = publicRuntimeCatalog;
    state.publicSearchIndex = publicSearchIndex;
    state.collections = collections;
    state.archiveContext = archiveContext;
    state.siteHelpContext = siteHelpContext;
    state.showsVersion = hashPublicFile(config.STATIC_ROOT, "data/shows.json");
    state.collectionsVersion = hashPublicFile(config.STATIC_ROOT, "data/collections.json");
    state.searchIndexVersion = hashPublicFile(config.STATIC_ROOT, "data/search-index.json");
    state.publicDataRevision = getPublicDataRevision(config.STATIC_ROOT);
  }

  async function refreshStateIfPublicDataChanged() {
    if (getPublicDataRevision(config.STATIC_ROOT) === state.publicDataRevision) {
      return;
    }

    if (!publicStateRefreshPromise) {
      publicStateRefreshPromise = reloadState().finally(() => {
        publicStateRefreshPromise = null;
      });
    }

    await publicStateRefreshPromise;
  }

  await reloadState();
  const database = openDatabase(config.DB_PATH);
  const rateLimitStore = createRateLimitStore({ db: database });
  const rateLimitService = createRateLimitService({
    store: rateLimitStore,
    policies: {
      chat: {
        windowMs: config.CHAT_RATE_LIMIT_WINDOW_MS,
        max: config.CHAT_RATE_LIMIT_MAX,
      },
      community: {
        windowMs: config.COMMUNITY_WRITE_WINDOW_MS,
        max: config.COMMUNITY_WRITE_MAX,
      },
      submissions: {
        windowMs: config.SUBMISSION_RATE_LIMIT_WINDOW_MS,
        max: config.SUBMISSION_RATE_LIMIT_MAX,
      },
      "maintainer-login": {
        windowMs: config.MAINTAINER_LOGIN_WINDOW_MS,
        max: config.MAINTAINER_LOGIN_MAX,
      },
    },
  });
  const communityStore = createCommunityStore({
    db: database,
    catalog: state.publicCatalog,
    minPublicRatings: config.COMMUNITY_MIN_PUBLIC_RATINGS,
  });
  const submissionStore = createSubmissionStore({ db: database });
  const publishedListenerReviewStore = createPublishedListenerReviewStore({ db: database });
  const importStore = createImportStore({ db: database });
  const collectionStore = createCollectionStore({ db: database });
  const turnstileService = createTurnstileService({
    enabled: config.COMMUNITY_TURNSTILE_ENABLED,
    secretKey: config.COMMUNITY_TURNSTILE_SECRET_KEY,
    endpoint: config.COMMUNITY_TURNSTILE_VERIFY_URL,
    timeoutMs: config.COMMUNITY_TURNSTILE_TIMEOUT_MS,
  });
  const communityService = createCommunityService({
    store: communityStore,
    rateLimiter: rateLimitService,
    turnstile: turnstileService,
    voterHashSecret: config.COMMUNITY_VOTER_HASH_SECRET,
    abuseRetentionDays: config.COMMUNITY_ABUSE_RETENTION_DAYS,
    maxSummaryIds: config.COMMUNITY_SUMMARY_MAX_IDS,
  });
  const submissionService = createSubmissionService({
    store: submissionStore,
    knownShows: state.publicCatalog,
    rateLimiter: rateLimitService,
  });
  const publishedListenerReviewService = createPublishedListenerReviewService({
    store: publishedListenerReviewStore,
    submissionStore,
    communityStore,
    rateLimiter: rateLimitService,
    voterHashSecret: config.COMMUNITY_VOTER_HASH_SECRET,
    abuseRetentionDays: config.COMMUNITY_ABUSE_RETENTION_DAYS,
    minimumPublicRatings: config.COMMUNITY_MIN_PUBLIC_RATINGS,
    maxSummaryIds: config.COMMUNITY_SUMMARY_MAX_IDS,
    knownShowIds: new Set(state.publicCatalog.map((show) => show.id)),
  });
  async function syncLiveCatalogState() {
    await reloadState();
    communityStore.syncCatalog(state.publicCatalog);
    submissionService.setKnownShows(state.publicCatalog);
    publishedListenerReviewService.setKnownShowIds(new Set(state.publicCatalog.map((show) => show.id)));
  }
  const collectionService = createCollectionService({
    store: collectionStore,
    staticRoot: config.STATIC_ROOT,
    config,
    onPublished: syncLiveCatalogState,
  });
  const refreshCollectionsForCatalogChange = async ({ showIds = [] } = {}) => {
    await collectionService.refreshForShows(showIds, "catalogue-automation");
    await syncLiveCatalogState();
  };
  const importService = createImportService({
    store: importStore,
    staticRoot: config.STATIC_ROOT,
    config,
    onPublished: refreshCollectionsForCatalogChange,
  });
  const elevationService = createElevationService({
    staticRoot: config.STATIC_ROOT,
    importService,
    onPublished: refreshCollectionsForCatalogChange,
  });
  const maintainerAuth = createMaintainerAuth(config);

  config.getConfigWarnings(config).forEach((warning) => console.warn(warning));

  const applyRuntimeSiteConfig = (html, nonce = "") =>
    injectRuntimeSiteConfig(html, {
      archivistEnabled: config.ARCHIVIST_ENABLED,
      homeCardHoverExpandEnabled: config.HOME_CARD_HOVER_EXPAND_ENABLED,
      siteUrl: config.SITE_URL,
      showsVersion: state.showsVersion,
      collectionsVersion: state.collectionsVersion,
      searchIndexVersion: state.searchIndexVersion,
      nonce,
    });

  const renderErrorPage = (req, fileName) => {
    const isServerError = fileName === "500.html";
    const metadata = {
      title: `${isServerError ? "Server Error" : "Page Not Found"} - The Echo Archives`,
      description: isServerError
        ? "The Echo Archives encountered an unexpected server error."
        : "The requested Echo Archives page could not be found.",
      canonicalUrl: `${normalizeSiteUrl(config.SITE_URL)}/${fileName}`,
      imageUrl: `${normalizeSiteUrl(config.SITE_URL)}/echo-wordmark1.png`,
      imageAlt: "The Echo Archives social preview",
    };
    const template = fs.readFileSync(path.join(config.STATIC_ROOT, fileName), "utf8");
    return applyRuntimeSiteConfig(injectNoIndex(injectPageMetadata(template, metadata)), req.cspNonce);
  };

  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.set("X-Request-ID", req.requestId);
    next();
  });
  app.use(
    createAccessObservability({
      enabled: config.ACCESS_LOG_ENABLED,
      secret: config.ACCESS_LOG_HMAC_SECRET,
    }),
  );
  app.use(applySecurityHeaders);
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-cache");
    next();
  });
  app.use(async (_req, _res, next) => {
    try {
      await refreshStateIfPublicDataChanged();
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use(express.json({ limit: "24kb" }));
  app.use("/api", (_req, res, next) => {
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      database.prepare("SELECT 1 AS ready").get();
      const journalMode = String(database.pragma("journal_mode", { simple: true }) || "").toUpperCase();
      const synchronousCode = Number(database.pragma("synchronous", { simple: true }));
      const synchronous =
        {
          0: "OFF",
          1: "NORMAL",
          2: "FULL",
          3: "EXTRA",
        }[synchronousCode] || `UNKNOWN(${synchronousCode})`;
      return res.json({
        ok: true,
        service: "echo-archives",
        catalogCount: state.publicCatalog.length,
        collectionCount: state.collections.length,
        durability: {
          journalMode,
          synchronous,
        },
        features: {
          communityRatingWrites: Boolean(config.COMMUNITY_RATING_WRITES_ENABLED),
          maintainerReview: maintainerAuth.enabled,
          accessLogs: Boolean(config.ACCESS_LOG_ENABLED),
        },
      });
    } catch (_error) {
      return res.status(503).json({
        ok: false,
        service: "echo-archives",
        error: "Database readiness check failed.",
      });
    }
  });

  if (process.env.ENABLE_TEST_ERROR_ROUTES === "true") {
    app.get("/__test/boom", () => {
      throw new Error("Intentional test route failure.");
    });

    app.get("/api/__test/boom", () => {
      throw new Error("Intentional API test route failure.");
    });
  }

  app.get("/sitemap.xml", (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=3600");
    res.type("application/xml").send(
      buildSitemapXml({
        siteUrl: config.SITE_URL,
        catalog: state.publicCatalog,
        collections: state.collections,
      }),
    );
  });

  app.get("/robots.txt", (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=3600");
    res.type("text/plain").send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "Disallow: /maintainer/",
        `Sitemap: ${normalizeSiteUrl(config.SITE_URL)}/sitemap.xml`,
        "",
      ].join("\n"),
    );
  });

  app.get("/data/shows.json", (_req, res) => {
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    setPublicCacheHeaders(_req, res);
    res.json(state.publicRuntimeCatalog);
  });

  app.get("/data/collections.json", (req, res) => {
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    setPublicCacheHeaders(req, res);
    res.json(state.collections);
  });

  app.get("/data/search-index.json", (req, res) => {
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    setPublicCacheHeaders(req, res);
    res.json(state.publicSearchIndex);
  });

  app.use(
    "/api/chat",
    createChatRouter({
      getCatalog: () => state.publicCatalog,
      getCollections: () => state.collections,
      getSiteHelpContext: () => state.siteHelpContext,
      config,
      rateLimiter: rateLimitService,
    }),
  );
  app.use("/api/community", createCommunityRouter({ communityService, config, rateLimiter: rateLimitService }));
  app.use("/api/reviews", createPublishedListenerReviewRouter({ reviewService: publishedListenerReviewService, config }));
  app.use("/api/submissions", createSubmissionRouter({ submissionService }));
  app.use(
    createMaintainerRouter({
      auth: maintainerAuth,
      staticRoot: config.STATIC_ROOT,
      submissionService,
      publishedListenerReviewService,
      importService,
      elevationService,
      collectionService,
      rateLimiter: rateLimitService,
    }),
  );

  if (config.SERVE_STATIC) {
    const publicPageManifest = JSON.parse(
      fs.readFileSync(path.join(config.STATIC_ROOT, "site-src", "page-manifest.json"), "utf8"),
    );
    const publicPageManifestByFile = new Map(
      publicPageManifest
        .filter((entry) => entry && typeof entry.output === "string")
        .map((entry) => [entry.output, entry]),
    );

    function readPublicPageTemplate(fileName) {
      return fs.readFileSync(path.join(config.STATIC_ROOT, fileName), "utf8");
    }

    const legacyRedirects = JSON.parse(
      fs.readFileSync(path.join(config.STATIC_ROOT, "shared", "config", "legacy-redirects.json"), "utf8"),
    );

    const resolveEntityAliasTarget = (routePath, req) => {
      const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
      if (routePath === "/show") {
        return id && state.publicCatalog.some((show) => show.id === id) ? buildShowPath(id) : id ? "" : routePath;
      }
      if (routePath === "/collection") {
        return id && state.collections.some((collection) => collection.id === id)
          ? buildCollectionPath(id)
          : id
            ? ""
            : routePath;
      }
      const queryIndex = req.url.indexOf("?");
      const search = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
      return `${routePath}${search}`;
    };

    app.use((req, res, next) => {
      if ((req.method !== "GET" && req.method !== "HEAD") || req.path === "/" || !req.path.endsWith("/")) {
        return next();
      }
      const queryIndex = req.url.indexOf("?");
      const search = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
      return res.redirect(301, `${req.path.replace(/\/+$/, "")}${search}`);
    });

    app.use((req, res, next) => {
      const redirectPath = PUBLIC_ROUTE_REDIRECTS.get(req.path);
      if (!redirectPath) {
        return next();
      }

      const target = resolveEntityAliasTarget(redirectPath, req);
      return target ? res.redirect(301, target) : next();
    });

    app.get(["/contact", "/contact.html"], (_req, res) => res.redirect(302, CONTACT_URL));

    for (const routePath of PUBLIC_PAGE_FILES.keys()) {
      if (routePath === "/") continue;
      app.get(`${routePath}/index.html`, (req, res) => {
        const target = resolveEntityAliasTarget(routePath, req);
        return target ? res.redirect(301, target) : res.status(404).type("html").send(renderErrorPage(req, "404.html"));
      });
    }

    const legacyRedirectMap = new Map(
      (Array.isArray(legacyRedirects) ? legacyRedirects : [])
        .filter((entry) => entry?.path && entry?.target)
        .map((entry) => [String(entry.path).replace(/^\/+/, ""), entry.target]),
    );
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return next();
      }

      let decodedPath;
      try {
        decodedPath = decodeURIComponent(req.path).replace(/^\/+/, "");
      } catch (_error) {
        return next();
      }

      const target = legacyRedirectMap.get(decodedPath);
      if (!target) return next();
      let normalizedTarget = target;
      try {
        const targetUrl = new URL(target, config.SITE_URL);
        const id = targetUrl.searchParams.get("id") || "";
        if (targetUrl.pathname === "/show" && state.publicCatalog.some((show) => show.id === id)) {
          normalizedTarget = buildShowPath(id);
        } else if (targetUrl.pathname === "/collection" && state.collections.some((collection) => collection.id === id)) {
          normalizedTarget = buildCollectionPath(id);
        }
      } catch (_error) {
        // Keep the explicitly configured local target when it cannot be parsed.
      }
      return res.redirect(301, normalizedTarget);
    });

    const renderCollectionPage = (req, res, collectionId) => {
      const collection = state.collections.find((entry) => entry.id === collectionId);

      if (!collection) {
        res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        res.set("Cache-Control", "no-cache");
        return res.status(404).type("html").send(renderErrorPage(req, "404.html"));
      }

      const showMap = new Map(state.publicCatalog.map((show) => [show.id, show]));
      const collectionShows = (Array.isArray(collection.showIds) ? collection.showIds : [])
        .map((showId) => showMap.get(showId))
        .filter(Boolean);
      const anchorShow =
        collection.anchorShowId && showMap.has(collection.anchorShowId) ? showMap.get(collection.anchorShowId) : null;
      const template = readPublicPageTemplate("collection.html");
      let rendered = injectPageMetadata(
        injectCollectionShowCards(
          injectCollectionSummary(template, {
            collection,
            collectionShows,
            anchorShow,
            collections: state.collections,
            allShows: state.publicCatalog,
          }),
          { collection, collectionShows },
        ),
        buildCollectionPageMetadata({
          siteUrl: config.SITE_URL,
          collection,
          collectionShows,
          anchorShow,
        }),
      );
      rendered = injectStructuredData(
        rendered,
        buildCollectionStructuredData({
          siteUrl: config.SITE_URL,
          collection,
          collectionShows,
          anchorShow,
        }),
      );

      if (!isIndexableCollection(collection, collectionShows)) {
        rendered = injectNoIndex(rendered, { follow: true });
        res.set("X-Robots-Tag", "noindex, follow, noarchive");
      }

      res.set("Cache-Control", "no-cache");
      return res.type("html").send(applyRuntimeSiteConfig(rendered, req.cspNonce));
    };

    app.get("/collections/:collectionId", (req, res) => {
      const collectionId = String(req.params.collectionId || "").trim();
      const canonicalPath = buildCollectionPath(collectionId);
      if (Object.keys(req.query).length > 0) {
        return res.redirect(301, canonicalPath);
      }
      return renderCollectionPage(req, res, collectionId);
    });

    app.get("/collection", (req, res) => {
      const collectionId = typeof req.query.id === "string" ? req.query.id.trim() : "";
      const collection = state.collections.find((entry) => entry.id === collectionId);
      if (!collection) {
        res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        res.set("Cache-Control", "no-cache");
        return res.status(404).type("html").send(renderErrorPage(req, "404.html"));
      }
      return res.redirect(301, buildCollectionPath(collection.id));
    });

    const renderShowPage = (req, res, showId) => {
      const show = state.publicCatalog.find((entry) => entry.id === showId);
      const template = readPublicPageTemplate("show.html");

      if (!show) {
        const renderedMissing = injectPageMetadata(
          injectNoIndex(injectShowRootContent(template, createMissingShowPageMarkup())),
          {
            title: "Show not found - The Echo Archives",
            description: "The requested Echo Archives show page could not be found.",
            canonicalUrl: `${normalizeSiteUrl(config.SITE_URL)}/show`,
            imageUrl: `${normalizeSiteUrl(config.SITE_URL)}/echo-wordmark1.png`,
            imageAlt: "The Echo Archives social preview",
          },
        );
        res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        res.set("Cache-Control", "no-cache");
        return res.status(404).type("html").send(applyRuntimeSiteConfig(renderedMissing, req.cspNonce));
      }

      const showMap = new Map(state.publicCatalog.map((entry) => [entry.id, entry]));
      let rendered = injectPageMetadata(
        injectShowRootContent(
          template,
          createShowPageMarkup(
            show,
            showMap,
            state.collections,
            publishedListenerReviewService.getPublicReviewPage(show.id, { page: 1, pageSize: 1 }),
          ),
        ),
        buildShowPageMetadata({
          siteUrl: config.SITE_URL,
          show,
        }),
      );
      rendered = injectStructuredData(rendered, buildShowStructuredData({ siteUrl: config.SITE_URL, show }));
      rendered = injectJsonBootstrap(rendered, "showBootstrap", serializeRuntimeShow(show));

      res.set("Cache-Control", "no-cache");
      return res.type("html").send(applyRuntimeSiteConfig(rendered, req.cspNonce));
    };

    app.get("/shows/:showId", (req, res) => {
      const showId = String(req.params.showId || "").trim();
      const canonicalPath = buildShowPath(showId);
      if (Object.keys(req.query).length > 0) {
        return res.redirect(301, canonicalPath);
      }
      return renderShowPage(req, res, showId);
    });

    app.get("/show", (req, res) => {
      const showId = typeof req.query.id === "string" ? req.query.id.trim() : "";
      const show = state.publicCatalog.find((entry) => entry.id === showId);
      if (!show) {
        return renderShowPage(req, res, showId);
      }
      return res.redirect(301, buildShowPath(show.id));
    });

    PUBLIC_PAGE_FILES.forEach((fileName, routePath) => {
      app.get(routePath, (req, res) => {
        res.set("Cache-Control", "no-cache");
        const manifestEntry = publicPageManifestByFile.get(fileName);
        if (!manifestEntry) {
          return res.sendFile(path.join(config.STATIC_ROOT, fileName));
        }

        let rendered = injectPageMetadata(
          readPublicPageTemplate(fileName),
          buildStaticPageMetadata({
            routePath,
            requestSiteUrl: config.SITE_URL,
            manifestEntry,
          }),
        );
        const isFilteredDiscoveryPage = ["/", "/collections"].includes(routePath) && Object.keys(req.query).length > 0;
        if (isFilteredDiscoveryPage) {
          rendered = injectNoIndex(rendered, { follow: true });
          res.set("X-Robots-Tag", "noindex, follow, noarchive");
        }
        return res.type("html").send(applyRuntimeSiteConfig(rendered, req.cspNonce));
      });
    });

    app.get("/offline.html", (_req, res) => {
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.set("Cache-Control", "no-cache");
      return res.sendFile(path.join(config.STATIC_ROOT, "offline.html"));
    });
    app.get("/404.html", (req, res) => {
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.set("Cache-Control", "no-cache");
      return res.status(404).type("html").send(renderErrorPage(req, "404.html"));
    });
    app.get("/500.html", (req, res) => {
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.set("Cache-Control", "no-cache");
      return res.status(500).type("html").send(renderErrorPage(req, "500.html"));
    });

    for (const fileName of PUBLIC_ROOT_ASSETS) {
      app.get(`/${fileName}`, (req, res) => {
        const extension = path.extname(fileName).toLowerCase();
        setPublicCacheHeaders(req, res, { image: PUBLIC_IMAGE_EXTENSIONS.has(extension) });
        if (fileName === "sw.js") {
          res.set("Cache-Control", "no-cache");
        }
        return res.sendFile(path.join(config.STATIC_ROOT, fileName));
      });
    }

    app.use(
      "/shared",
      allowStaticExtensions(PUBLIC_SHARED_EXTENSIONS),
      (req, res, next) => {
        setPublicCacheHeaders(req, res);
        next();
      },
      express.static(path.join(config.STATIC_ROOT, "shared"), { index: false, fallthrough: true }),
    );
    app.use(
      "/images",
      allowStaticExtensions(PUBLIC_IMAGE_EXTENSIONS),
      (req, res, next) => {
        setPublicCacheHeaders(req, res, { image: true });
        next();
      },
      express.static(path.join(config.STATIC_ROOT, "images"), { index: false, fallthrough: true }),
    );
    app.use(
      "/shows",
      allowStaticExtensions(PUBLIC_IMAGE_EXTENSIONS),
      (req, res, next) => {
        setPublicCacheHeaders(req, res, { image: true });
        next();
      },
      express.static(path.join(config.STATIC_ROOT, "shows"), { index: false, fallthrough: true }),
    );
    app.use(
      "/data",
      allowStaticExtensions(new Set([".json"])),
      (req, res, next) => {
        setPublicCacheHeaders(req, res);
        next();
      },
      express.static(path.join(config.STATIC_ROOT, "data"), { index: false, fallthrough: true }),
    );
  }

  app.use((req, res) => {
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.set("Cache-Control", "no-cache");
    if (req.path.startsWith("/api/") || req.accepts(["html", "json"]) === "json") {
      return res.status(404).json({ error: "Not found." });
    }
    if (config.SERVE_STATIC) {
      res.set("Cache-Control", "no-cache");
      return res.status(404).type("html").send(renderErrorPage(req, "404.html"));
    }
    return res.status(404).json({ error: "Not found." });
  });

  app.use((error, req, res, _next) => {
    if (res.headersSent) {
      return _next(error);
    }

    const candidateStatus = Number.isInteger(error.statusCode)
      ? error.statusCode
      : Number.isInteger(error.status)
        ? error.status
        : 500;
    const statusCode = candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500;
    if (statusCode === 429 && Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0) {
      res.set("Retry-After", String(error.retryAfterSeconds));
    }

    if (statusCode >= 500) {
      console.error(
        JSON.stringify({
          level: "error",
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          error: error.message || "Unexpected server error.",
        }),
      );
    }

    const wantsHtml =
      statusCode >= 500 &&
      config.SERVE_STATIC &&
      !req.path.startsWith("/api/") &&
      req.accepts(["html", "json"]) === "html";

    if (wantsHtml) {
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      res.set("Cache-Control", "no-cache");
      return res.status(statusCode).type("html").send(renderErrorPage(req, "500.html"));
    }

    res.status(statusCode).json({
      error: statusCode >= 500 ? "Unexpected server error." : error.message || "Request failed.",
      ...(statusCode >= 500 ? { requestId: req.requestId } : {}),
      ...(Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    });
  });

  const server = app.listen(config.PORT, config.HOST, () => {
    console.log(`Echo Archives listening on http://${config.HOST}:${config.PORT}`);
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; closing Echo Archives cleanly.`);

    const forceTimer = setTimeout(() => {
      console.error("Graceful shutdown timed out; forcing remaining connections closed.");
      server.closeAllConnections?.();
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    server.close(() => {
      clearTimeout(forceTimer);
      try {
        database.close();
      } catch (_error) {
        // The database may already be closed during a startup or process failure.
      }
      process.exit(0);
    });
    server.closeIdleConnections?.();
  }

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  return { app, server, database };
}

startServer().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
