const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

const { loadArchiveContext } = require("../lib/ai/archive-context");
const { loadCatalog, loadCollections } = require("../lib/catalog");
const { createChatRouter } = require("../lib/routes/chat-routes");
const { loadSiteHelpContext } = require("../lib/ai/site-help");

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
      getCatalog: () => catalog,
      getCollections: () => collections,
      config: {
        OLLAMA_MODEL: "test-model",
        OLLAMA_URL: "http://127.0.0.1:9/api/generate",
        REQUEST_TIMEOUT_MS: 50,
      },
      getSiteHelpContext: () => siteHelpContext,
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
    assert.match(result.body.answer, /strongest fit|cleanest archive match|best next stop|archive/i);
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

test("chat route answers regular creator questions with grounded show metadata", async () => {
  const context = await createChatTestServer();
  const creatorShow = context.catalog.find((show) => Array.isArray(show.creators) && show.creators.length > 0);
  assert.ok(creatorShow, "Expected at least one show with creator metadata.");

  try {
    const result = await postJson(context.baseUrl, {
      message: `Who made ${creatorShow.title}?`,
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.equal(result.body.recommendations.length, 0);
    assert.match(result.body.answer, new RegExp(creatorShow.title, "i"));
    assert.match(result.body.answer, new RegExp(creatorShow.creators[0], "i"));
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route handles regular search-trouble questions with site help", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "I can't find a show even when I search by title",
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.equal(result.body.recommendations.length, 0);
    assert.match(result.body.answer, /title fragments|aliases|creators|genres|tones|tags/i);
    assert.equal(result.body.actions[0].href, "/index.html#archive");
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route explains rating persistence issues on show pages", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "Why didn't my rating stick?",
      history: [],
      page: {
        path: "/show.html?id=impact-winter",
        pageType: "show",
        showId: "impact-winter",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.equal(result.body.recommendations.length, 0);
    assert.match(result.body.answer, /local storage|cookie|verification|backend/i);
    assert.equal(result.body.actions[0].href, "/show.html?id=impact-winter");
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route keeps support context for short broken-link follow-ups", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "I already did that",
      history: [{ role: "user", content: "How do I report a broken link for Midnight Burger?" }],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.equal(result.body.recommendations.length, 0);
    assert.match(result.body.answer, /contact route as a follow-up|still live/i);
    assert.match(result.body.answer, /Midnight Burger/i);
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route returns related cards for similarity questions", async () => {
  const context = await createChatTestServer();
  const similarShow = context.catalog.find((show) => Array.isArray(show.similarTo) && show.similarTo.length > 0);
  assert.ok(similarShow, "Expected at least one show with similar links.");

  try {
    const result = await postJson(context.baseUrl, {
      message: `What is ${similarShow.title} similar to?`,
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.ok(result.body.recommendations.length > 0);
    assert.ok(result.body.recommendations.every((entry) => entry.title !== similarShow.title));
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route asks for a positive target when the prompt only excludes a show lane", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "Don't give me something like How I Died",
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "fallback");
    assert.match(result.body.answer, /Avoiding How I Died and nearby archive neighbors/i);
    assert.match(result.body.answer, /What mood, genre, or listening context/i);
    assert.equal(result.body.recommendations.length, 0);
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route answers title-specific about questions from structured show metadata", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "What's Midnight Burger about?",
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.equal(result.body.recommendations.length, 0);
    assert.match(result.body.answer, /Midnight Burger/i);
    assert.match(result.body.answer, /dimension-spanning diner/i);
    assert.match(result.body.answer, /warm/i);
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route refuses to invent details for title questions outside the archive", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "What's MarsCorp about?",
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.equal(result.body.recommendations.length, 0);
    assert.match(result.body.answer, /do not have that title/i);
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route excludes explicitly avoided show lanes from recommendations", async () => {
  const context = await createChatTestServer();
  const excludedTitles = new Set(["How I Died", "Paralyzed", "The White Vault"]);

  try {
    const result = await postJson(context.baseUrl, {
      message: "Recommend a mystery but not something like How I Died",
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.match(result.body.answer, /Avoiding How I Died and nearby archive neighbors/i);
    assert.ok(result.body.recommendations.length > 0);
    assert.ok(result.body.recommendations.every((entry) => !excludedTitles.has(entry.title)));
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route carries avoidance constraints across the current thread", async () => {
  const context = await createChatTestServer();
  const excludedTitles = new Set(["How I Died", "Paralyzed", "The White Vault"]);

  try {
    const result = await postJson(context.baseUrl, {
      message: "Recommend a mystery",
      history: [
        { role: "user", content: "Don't give me something like How I Died" },
        {
          role: "assistant",
          content: "Avoiding How I Died and nearby archive neighbors. What mood should I aim for instead?",
        },
      ],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.match(result.body.answer, /Avoiding How I Died and nearby archive neighbors/i);
    assert.ok(result.body.recommendations.length > 0);
    assert.ok(result.body.recommendations.every((entry) => !excludedTitles.has(entry.title)));
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route prefers fresh comparable recommendations over previous cards", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "Recommend a finished show",
      seenRecommendationIds: ["wolf-359"],
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.ok(result.body.recommendations.length > 0);
    assert.notEqual(result.body.recommendations[0].id, "wolf-359");
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route acknowledges repeated recommendations when the same show is clearly strongest", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "Recommend Derelict",
      seenRecommendationIds: ["derelict"],
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.recommendations[0]?.id, "derelict");
    assert.match(result.body.answer, /already suggested Derelict/i);
  } finally {
    await closeChatTestServer(context.server);
  }
});

test("chat route answers archive overview questions without falling back", async () => {
  const context = await createChatTestServer();

  try {
    const result = await postJson(context.baseUrl, {
      message: "How many shows are in the archive?",
      history: [],
      page: {
        path: "/",
        pageType: "home",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.source, "site-help");
    assert.match(result.body.answer, /published shows/i);
    assert.match(result.body.answer, new RegExp(String(context.catalog.length), "i"));
  } finally {
    await closeChatTestServer(context.server);
  }
});
