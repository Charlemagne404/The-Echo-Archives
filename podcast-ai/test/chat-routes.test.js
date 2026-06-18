const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

const { loadArchiveContext } = require("../lib/archive-context");
const { loadCatalog, loadCollections } = require("../lib/catalog");
const { createChatRouter } = require("../lib/routes/chat-routes");
const { loadSiteHelpContext } = require("../lib/site-help");

const siteRoot = path.resolve(__dirname, "../..");

async function createChatTestServer() {
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  const archiveContext = await loadArchiveContext(siteRoot, catalog, collections);
  const siteHelpContext = loadSiteHelpContext({ catalog, collections, archiveContext });
  const app = express();
  app.use(express.json());
  app.use(
    "/api/chat",
    createChatRouter({
      catalog,
      collections,
      config: {
        OLLAMA_MODEL: "test-model",
        OLLAMA_URL: "http://127.0.0.1:9/api/generate",
        REQUEST_TIMEOUT_MS: 50,
      },
      siteHelpContext,
    }),
  );

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  return {
    catalog,
    collections,
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function postJson(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function closeChatTestServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

test("chat route returns structured help actions for site questions", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "How do I submit a correction?",
      history: [],
      page: {
        path: "/submit.html",
        pageType: "submit",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.equal(result.body.recommendations.length, 0);
    assert.equal(result.body.actions[0].href, "/submit.html");
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route keeps recommendation cards for discovery prompts", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "Recommend a finished sci-fi show",
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.actions.length, 0);
    assert.ok(result.body.recommendations.length > 0);
    assert.match(result.body.answer, /strongest fit|nearby alternative|archive/i);
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route uses page context for show-page trust questions", async () => {
  const context = await createChatTestServer();
  const verifiedShow = context.catalog.find((show) => Boolean(show.verification?.status));
  assert.ok(verifiedShow, "Expected at least one creator-verified show fixture.");

  try {
    const result = await postJson(context.baseUrl, {
      message: "What does creator verified mean?",
      history: [],
      page: {
        path: `/show.html?id=${verifiedShow.id}`,
        pageType: "show",
        showId: verifiedShow.id,
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.match(result.body.answer, new RegExp(verifiedShow.title, "i"));
    assert.equal(result.body.actions[0].href, "/submit.html");
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route keeps recommendations available for mixed help prompts", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "What does creator verified mean and recommend something like Midnight Burger",
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.ok(result.body.recommendations.length > 0);
    assert.ok(result.body.actions.length > 0);
  } finally {
    await closeChatTestServer(context.server);
  }
});
