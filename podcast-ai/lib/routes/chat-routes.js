const express = require("express");

const { scoreCatalog } = require("../catalog");
const {
  buildFallbackAnswer,
  buildMessages,
  buildRecommendationCard,
  buildSuggestedPrompts,
  sanitizeAnswerText,
} = require("../chat");
const {
  classifyChatIntent,
  isClarificationRequest,
  promoteIntentWithMatches,
} = require("../chat-intents");
const { buildSiteHelpResponse } = require("../site-help");

function normalizePageContext(value) {
  const page = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return {
    path: typeof page.path === "string" ? page.path.slice(0, 200) : "",
    pageType: typeof page.pageType === "string" ? page.pageType.slice(0, 60) : "",
    showId: typeof page.showId === "string" ? page.showId.slice(0, 120) : "",
    collectionId: typeof page.collectionId === "string" ? page.collectionId.slice(0, 120) : "",
  };
}

function createChatRouter({ catalog, collections, config, siteHelpContext, rateLimiter = null }) {
  const router = express.Router();
  const catalogById = new Map(catalog.map((show) => [show.id, show]));

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      catalogCount: catalog.length,
      collectionCount: collections.length,
      model: config.OLLAMA_MODEL,
    });
  });

  router.post("/", async (req, res) => {
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    const history = Array.isArray(req.body.history)
      ? req.body.history
          .filter(
            (entry) =>
              entry &&
              (entry.role === "user" || entry.role === "assistant") &&
              typeof entry.content === "string",
          )
          .slice(-8)
      : [];
    const page = normalizePageContext(req.body.page);

    if (!message) {
      return res.status(400).json({ error: "A message is required." });
    }

    rateLimiter?.check("chat", req.ip || "");

    const initialIntent = classifyChatIntent({ message, page });

    if (initialIntent.primary === "clarification") {
      const helpResponse = buildSiteHelpResponse({
        message,
        helpTopic: initialIntent.helpTopic,
        page,
        catalog,
        collections,
        siteHelpContext,
      });

      return res.json({
        answer: helpResponse.answer,
        actions: helpResponse.actions,
        recommendations: [],
        suggestedPrompts: helpResponse.suggestedPrompts,
        source: helpResponse.source,
      });
    }

    const shouldScoreCatalog = initialIntent.primary !== "clarification";
    const matches = shouldScoreCatalog ? scoreCatalog(catalog, message) : [];
    const intent = promoteIntentWithMatches({
      intent: initialIntent,
      message,
      page,
      matches,
    });
    const recommendations = matches.slice(0, 3).map(buildRecommendationCard);

    if (intent.primary === "site-help" || intent.primary === "show-detail" || intent.primary === "mixed") {
      const helpResponse = buildSiteHelpResponse({
        message,
        helpTopic: intent.helpTopic,
        page,
        catalog,
        collections,
        siteHelpContext,
        matches,
        includeRecommendations: intent.includeRecommendations || intent.primary === "mixed",
      });
      const relatedRecommendations = helpResponse.recommendationIds
        .map((showId) => catalogById.get(showId))
        .filter(Boolean)
        .map(buildRecommendationCard);

      return res.json({
        answer: helpResponse.answer,
        actions: helpResponse.actions,
        recommendations:
          intent.includeRecommendations || intent.primary === "mixed"
            ? relatedRecommendations.length > 0
              ? relatedRecommendations
              : recommendations
            : [],
        suggestedPrompts: helpResponse.suggestedPrompts,
        source: helpResponse.source,
      });
    }

    if (isClarificationRequest(message) || matches.length === 0) {
      return res.json({
        answer: buildFallbackAnswer(message, matches),
        actions: [],
        recommendations,
        suggestedPrompts: buildSuggestedPrompts(matches),
        source: "fallback",
      });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);
      let response;

      try {
        const prompt = buildMessages({ message, history, matches });
        response = await fetch(config.OLLAMA_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.OLLAMA_MODEL,
            prompt,
            stream: false,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`Ollama request failed with ${response.status}`);
      }

      const result = await response.json();
      const fallbackAnswer = buildFallbackAnswer(message, matches);
      const answer =
        typeof result.response === "string" && result.response.trim()
          ? sanitizeAnswerText(result.response, fallbackAnswer)
          : fallbackAnswer;

      return res.json({
        answer,
        actions: [],
        recommendations,
        suggestedPrompts: buildSuggestedPrompts(matches),
        source: "ollama",
      });
    } catch (error) {
      return res.json({
        answer: buildFallbackAnswer(message, matches),
        actions: [],
        recommendations,
        suggestedPrompts: buildSuggestedPrompts(matches),
        source: "fallback",
        modelError: error.message,
      });
    }
  });

  return router;
}

module.exports = {
  createChatRouter,
};
