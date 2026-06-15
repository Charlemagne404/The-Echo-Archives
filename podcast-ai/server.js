const path = require("node:path");
const express = require("express");

const config = require("./lib/config");
const { loadArchiveContext } = require("./lib/archive-context");
const { loadCatalog, loadCollections } = require("./lib/catalog");
const { buildSitemapXml } = require("./lib/sitemap");
const { openDatabase } = require("./lib/store/database");
const { createCommunityStore } = require("./lib/store/community-store");
const { createSubmissionStore } = require("./lib/store/submission-store");
const { createCommunityService } = require("./lib/services/community-service");
const { createSubmissionService } = require("./lib/services/submission-service");
const { createChatRouter } = require("./lib/routes/chat-routes");
const { createCommunityRouter } = require("./lib/routes/community-routes");
const { createSubmissionRouter } = require("./lib/routes/submission-routes");

async function startServer() {
  const app = express();
  const catalog = await loadCatalog(config.STATIC_ROOT);
  const collections = loadCollections(config.STATIC_ROOT, new Set(catalog.map((show) => show.id)));
  await loadArchiveContext(config.STATIC_ROOT, catalog, collections);
  const database = openDatabase(config.DB_PATH);
  const communityStore = createCommunityStore({ db: database, catalog });
  const submissionStore = createSubmissionStore({ db: database });
  const communityService = createCommunityService({
    store: communityStore,
    writeThrottleWindowMs: config.COMMUNITY_WRITE_WINDOW_MS,
    maxWritesPerWindow: config.COMMUNITY_WRITE_MAX,
  });
  const submissionService = createSubmissionService({
    store: submissionStore,
    knownShowIds: new Set(catalog.map((show) => show.id)),
  });

  app.disable("x-powered-by");
  app.use(express.json({ limit: "24kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "echo-archives",
      catalogCount: catalog.length,
      databasePath: config.DB_PATH,
      model: config.OLLAMA_MODEL,
    });
  });

  app.get("/sitemap.xml", (_req, res) => {
    res.type("application/xml").send(
      buildSitemapXml({
        siteUrl: config.SITE_URL,
        catalog,
        collections,
      }),
    );
  });

  app.get("/data/shows.json", (_req, res) => {
    res.json(catalog);
  });

  app.use("/api/chat", createChatRouter({ catalog, config }));
  app.use("/api/community", createCommunityRouter({ communityService, config }));
  app.use("/api/submissions", createSubmissionRouter({ submissionService }));

  if (config.SERVE_STATIC) {
    app.use((req, res, next) => {
      if (req.path.startsWith("/podcast-ai/")) {
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
    res.status(statusCode).json({
      error: error.message || "Unexpected server error.",
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
