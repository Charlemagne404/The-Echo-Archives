const express = require("express");

const { scoreCatalog } = require("../catalog");
const {
  buildFallbackAnswer,
  buildMessages,
  buildRecommendationCard,
  buildSuggestedPrompts,
  isClarificationRequest,
  sanitizeAnswerText,
} = require("../chat");

function createChatRouter({ catalog, config }) {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      catalogCount: catalog.length,
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

    if (!message) {
      return res.status(400).json({ error: "A message is required." });
    }

    const matches = scoreCatalog(catalog, message);
    const recommendations = matches.slice(0, 3).map(buildRecommendationCard);

    if (isClarificationRequest(message) || matches.length === 0) {
      return res.json({
        answer: buildFallbackAnswer(message, matches),
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
        recommendations,
        suggestedPrompts: buildSuggestedPrompts(matches),
        source: "ollama",
      });
    } catch (error) {
      return res.json({
        answer: buildFallbackAnswer(message, matches),
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
