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

async function startServer() {
  const app = express();
  const state = {
    catalog: [],
    publicCatalog: [],
    collections: [],
    archiveContext: null,
    siteHelpContext: null,
  };

  async function reloadState() {
    const catalog = await loadCatalog(config.STATIC_ROOT);
    const publicCatalog = catalog.filter((show) => show.status === "published");
    const collections = loadCollections(config.STATIC_ROOT, new Set(catalog.map((show) => show.id)));
    const archiveContext = await loadArchiveContext(config.STATIC_ROOT, catalog, collections);
    const siteHelpContext = loadSiteHelpContext({ catalog: publicCatalog, collections, archiveContext });

    state.catalog = catalog;
    state.publicCatalog = publicCatalog;
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
    app.use((req, res, next) => {
      if (req.path.startsWith("/backend/") || req.path.startsWith("/podcast-ai/")) {
        return res.status(404).end();
      }

      return next();
    });

    app.use(express.static(config.STATIC_ROOT, { extensions: ["html"] }));
    app.get("/", (_req, res) => {
      res.sendFile(path.join(config.STATIC_ROOT, "index.html"));
    });
  }

  app.use((error, _req, res, _next) => {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (statusCode === 429 && Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0) {
      res.set("Retry-After", String(error.retryAfterSeconds));
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
