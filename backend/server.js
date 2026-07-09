const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const config = require("./lib/config");
const { loadArchiveContext } = require("./lib/ai/archive-context");
const { loadCatalog, loadCollections } = require("./lib/catalog");
const { createMaintainerAuth } = require("./lib/maintainer-auth");
const { buildSitemapXml } = require("./lib/sitemap");
const { openDatabase } = require("./lib/store/database");
const { createCommunityStore } = require("./lib/store/community-store");
const { createImportStore } = require("./lib/store/import-store");
const { createRateLimitStore } = require("./lib/store/rate-limit-store");
const { createSubmissionStore } = require("./lib/store/submission-store");
const { createCommunityService } = require("./lib/services/community-service");
const { createImportService } = require("./lib/services/import-service");
const { createRateLimitService } = require("./lib/services/rate-limit-service");
const { createSubmissionService } = require("./lib/services/submission-service");
const { createTurnstileService } = require("./lib/services/turnstile-service");
const { createChatRouter } = require("./lib/routes/chat-routes");
const { createCommunityRouter } = require("./lib/routes/community-routes");
const { createMaintainerRouter } = require("./lib/routes/maintainer-routes");
const { createSubmissionRouter } = require("./lib/routes/submission-routes");
const { loadSiteHelpContext } = require("./lib/ai/site-help");
const {
  buildCollectionPageMetadata,
  buildShowPageMetadata,
  injectRuntimeSiteConfig,
  injectPageMetadata,
} = require("./lib/public-page-render");
const {
  createMissingShowPageMarkup,
  createShowPageMarkup,
  injectShowRootContent,
} = require("./lib/show-page-render");
const { createSearchIndexRecord } = require("../tools/lib/catalog-artifacts");

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
  ["/contact.html", "/contact"],
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
  ["/contact", "contact.html"],
]);

function normalizeSiteUrl(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function buildStaticPageMetadata({ routePath, requestSiteUrl, manifestEntry }) {
  const normalizedSiteUrl = normalizeSiteUrl(requestSiteUrl);
  const normalizedRoutePath = routePath === "/" ? "/" : String(routePath || "").replace(/\/+$/, "");
  const canonicalUrl = `${normalizedSiteUrl}${normalizedRoutePath}`;

  return {
    title: manifestEntry.title,
    description: manifestEntry.description,
    canonicalUrl,
    imageUrl: `${normalizedSiteUrl}/og-image.png`,
  };
}

async function startServer() {
  const app = express();
  const state = {
    catalog: [],
    publicCatalog: [],
    publicSearchIndex: [],
    collections: [],
    archiveContext: null,
    siteHelpContext: null,
  };

  async function reloadState() {
    const catalog = await loadCatalog(config.STATIC_ROOT);
    const publicCatalog = catalog.filter((show) => show.status === "published");
    const publicSearchIndex = publicCatalog.map(createSearchIndexRecord);
    const collections = loadCollections(config.STATIC_ROOT, new Set(catalog.map((show) => show.id)));
    const archiveContext = await loadArchiveContext(config.STATIC_ROOT, catalog, collections);
    const siteHelpContext = loadSiteHelpContext({ catalog: publicCatalog, collections, archiveContext });

    state.catalog = catalog;
    state.publicCatalog = publicCatalog;
    state.publicSearchIndex = publicSearchIndex;
    state.collections = collections;
    state.archiveContext = archiveContext;
    state.siteHelpContext = siteHelpContext;
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
    },
  });
  const communityStore = createCommunityStore({
    db: database,
    catalog: state.publicCatalog,
    minPublicRatings: config.COMMUNITY_MIN_PUBLIC_RATINGS,
  });
  const submissionStore = createSubmissionStore({ db: database });
  const importStore = createImportStore({ db: database });
  const turnstileService = createTurnstileService({
    enabled: config.COMMUNITY_TURNSTILE_ENABLED,
    secretKey: config.COMMUNITY_TURNSTILE_SECRET_KEY,
    endpoint: config.COMMUNITY_TURNSTILE_VERIFY_URL,
  });
  const communityService = createCommunityService({
    store: communityStore,
    rateLimiter: rateLimitService,
    turnstile: turnstileService,
    voterHashSecret: config.COMMUNITY_VOTER_HASH_SECRET,
    abuseRetentionDays: config.COMMUNITY_ABUSE_RETENTION_DAYS,
  });
  const submissionService = createSubmissionService({
    store: submissionStore,
    knownShowIds: new Set(state.publicCatalog.map((show) => show.id)),
    rateLimiter: rateLimitService,
  });
  const importService = createImportService({
    store: importStore,
    staticRoot: config.STATIC_ROOT,
    config,
    onPublished: async () => {
      await reloadState();
      communityStore.syncCatalog(state.publicCatalog);
      submissionService.setKnownShowIds(new Set(state.publicCatalog.map((show) => show.id)));
    },
  });
  const maintainerAuth = createMaintainerAuth(config);

  const applyRuntimeSiteConfig = (html) =>
    injectRuntimeSiteConfig(html, {
      homeCardHoverExpandEnabled: config.HOME_CARD_HOVER_EXPAND_ENABLED,
    });

  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.use(express.json({ limit: "24kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "echo-archives",
      catalogCount: state.publicCatalog.length,
      model: config.OLLAMA_MODEL,
    });
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
    res.type("application/xml").send(
      buildSitemapXml({
        siteUrl: config.SITE_URL,
        catalog: state.publicCatalog,
        collections: state.collections,
      }),
    );
  });

  app.get("/data/shows.json", (_req, res) => {
    res.json(state.publicCatalog);
  });

  app.get("/data/search-index.json", (_req, res) => {
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
  app.use("/api/community", createCommunityRouter({ communityService, config }));
  app.use("/api/submissions", createSubmissionRouter({ submissionService }));
  app.use(
    createMaintainerRouter({
      auth: maintainerAuth,
      staticRoot: config.STATIC_ROOT,
      submissionService,
      importService,
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

    function getRequestSiteUrl(req) {
      const protocol = req.secure ? "https" : String(req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
      return `${protocol}://${req.get("host")}`;
    }

    app.use((req, res, next) => {
      if (req.path.startsWith("/backend/") || req.path.startsWith("/podcast-ai/")) {
        return res.status(404).end();
      }

      return next();
    });

    app.use((req, res, next) => {
      const redirectPath = PUBLIC_ROUTE_REDIRECTS.get(req.path);
      if (!redirectPath) {
        return next();
      }

      const queryIndex = req.url.indexOf("?");
      const search = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
      return res.redirect(301, `${redirectPath}${search}`);
    });

    app.get("/collection", (req, res) => {
      const collectionId = typeof req.query.id === "string" ? req.query.id.trim() : "";
      const collection = state.collections.find((entry) => entry.id === collectionId);

      if (!collection) {
        return res.status(404).sendFile(path.join(config.STATIC_ROOT, "404.html"));
      }

      const showMap = new Map(state.publicCatalog.map((show) => [show.id, show]));
      const collectionShows = (Array.isArray(collection.showIds) ? collection.showIds : [])
        .map((showId) => showMap.get(showId))
        .filter(Boolean);
      const anchorShow =
        collection.anchorShowId && showMap.has(collection.anchorShowId) ? showMap.get(collection.anchorShowId) : null;
      const template = readPublicPageTemplate("collection.html");
      const rendered = injectPageMetadata(
        template,
        buildCollectionPageMetadata({
          siteUrl: getRequestSiteUrl(req),
          collection,
          collectionShows,
          anchorShow,
        }),
      );

      return res.type("html").send(applyRuntimeSiteConfig(rendered));
    });

    app.get("/show", (req, res) => {
      const showId = typeof req.query.id === "string" ? req.query.id.trim() : "";
      const show = state.publicCatalog.find((entry) => entry.id === showId);
      const template = readPublicPageTemplate("show.html");

      const requestSiteUrl = getRequestSiteUrl(req);
      if (!show) {
        const renderedMissing = injectPageMetadata(
          injectShowRootContent(template, createMissingShowPageMarkup()),
          {
            title: "Show not found - The Echo Archives",
            description: "The requested Echo Archives show page could not be found.",
            canonicalUrl: `${requestSiteUrl.replace(/\/+$/, "")}/show`,
            imageUrl: `${requestSiteUrl.replace(/\/+$/, "")}/og-image.png`,
          },
        );
        return res.status(404).type("html").send(applyRuntimeSiteConfig(renderedMissing));
      }

      const showMap = new Map(state.publicCatalog.map((entry) => [entry.id, entry]));
      const rendered = injectPageMetadata(
        injectShowRootContent(template, createShowPageMarkup(show, showMap, state.collections)),
        buildShowPageMetadata({
          siteUrl: requestSiteUrl,
          show,
        }),
      );

      return res.type("html").send(applyRuntimeSiteConfig(rendered));
    });

    PUBLIC_PAGE_FILES.forEach((fileName, routePath) => {
      app.get(routePath, (req, res) => {
        const manifestEntry = publicPageManifestByFile.get(fileName);
        if (!manifestEntry) {
          return res.sendFile(path.join(config.STATIC_ROOT, fileName));
        }

        const rendered = injectPageMetadata(
          readPublicPageTemplate(fileName),
          buildStaticPageMetadata({
            routePath,
            requestSiteUrl: getRequestSiteUrl(req),
            manifestEntry,
          }),
        );
        return res.type("html").send(applyRuntimeSiteConfig(rendered));
      });
    });

    app.use(express.static(config.STATIC_ROOT, { extensions: ["html"] }));
  }

  app.use((error, req, res, _next) => {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (statusCode === 429 && Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0) {
      res.set("Retry-After", String(error.retryAfterSeconds));
    }

    const wantsHtml =
      statusCode >= 500 &&
      config.SERVE_STATIC &&
      !req.path.startsWith("/api/") &&
      req.accepts(["html", "json"]) === "html";

    if (wantsHtml) {
      return res.status(statusCode).sendFile(path.join(config.STATIC_ROOT, "500.html"));
    }

    res.status(statusCode).json({
      error: error.message || "Unexpected server error.",
      ...(Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    });
  });

  app.listen(config.PORT, "0.0.0.0", () => {
    console.log(`Echo Archives listening on http://0.0.0.0:${config.PORT}`);
  });
}

startServer().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
