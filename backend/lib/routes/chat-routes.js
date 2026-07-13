const express = require("express");

const { scoreCatalog } = require("../catalog");
const {
  buildFallbackAnswer,
  buildMessages,
  buildRecommendationCard,
  buildSuggestedPrompts,
  sanitizeAnswerText,
} = require("../ai/chat");
const {
  classifyChatIntent,
  inferShowDetailTopic,
  isClarificationRequest,
  promoteIntentWithMatches,
} = require("../ai/chat-intents");
const { analyzeChatQuery, answerMentionsExcludedTitle } = require("../ai/chat-query");
const { buildSiteHelpResponse } = require("../ai/site-help");

const REPEAT_SCORE_MARGIN = 35;
const SHOW_CONTEXT_TOPICS = new Set([
  "ratings",
  "creator-verification",
  "show-links",
  "show-status",
  "show-summary",
  "show-runtime",
  "show-credits",
  "show-format",
  "show-transcripts",
  "show-content-notes",
  "show-similar",
  "show-collections",
]);

function normalizePageContext(value) {
  const page = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return {
    path: typeof page.path === "string" ? page.path.slice(0, 200) : "",
    pageType: typeof page.pageType === "string" ? page.pageType.slice(0, 60) : "",
    showId: typeof page.showId === "string" ? page.showId.slice(0, 120) : "",
    collectionId: typeof page.collectionId === "string" ? page.collectionId.slice(0, 120) : "",
  };
}

function normalizeSeenRecommendationIds(value) {
  return new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean)
      .slice(-30),
  );
}

function applyRepeatPolicy(matches, seenRecommendationIds) {
  if (!seenRecommendationIds || seenRecommendationIds.size === 0 || matches.length === 0) {
    return {
      matches,
      repeatedRecommendation: null,
    };
  }

  const [topMatch] = matches;
  if (!seenRecommendationIds.has(topMatch.id)) {
    return {
      matches,
      repeatedRecommendation: null,
    };
  }

  const freshIndex = matches.findIndex((match) => !seenRecommendationIds.has(match.id));
  if (freshIndex === -1) {
    return {
      matches,
      repeatedRecommendation: topMatch,
    };
  }

  const freshMatch = matches[freshIndex];
  if ((topMatch.score || 0) - (freshMatch.score || 0) <= REPEAT_SCORE_MARGIN) {
    return {
      matches: [freshMatch, ...matches.filter((_, index) => index !== freshIndex)],
      repeatedRecommendation: null,
    };
  }

  return {
    matches,
    repeatedRecommendation: topMatch,
  };
}

function shouldUseTargetShowForHelp(intent, queryContext) {
  return Boolean(
    queryContext.targetShowId &&
      (intent.primary === "show-detail" || SHOW_CONTEXT_TOPICS.has(intent.helpTopic)),
  );
}

function buildFallbackOptions(queryContext, repeatedRecommendation) {
  return {
    constraintIntro: queryContext.appliedConstraintIntro,
    repeatedRecommendationTitle: repeatedRecommendation?.title || "",
  };
}

function createChatRouter({ getCatalog, getCollections, getSiteHelpContext, config, rateLimiter = null }) {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    const catalog = getCatalog();
    const collections = getCollections();
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      catalogCount: catalog.length,
      collectionCount: collections.length,
    });
  });

  router.post("/", async (req, res) => {
    const catalog = getCatalog();
    const collections = getCollections();
    const siteHelpContext = getSiteHelpContext();
    const catalogById = new Map(catalog.map((show) => [show.id, show]));
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    const messageMaxLength = Math.max(1, config.CHAT_MESSAGE_MAX_LENGTH || 2000);
    const historyEntryMaxLength = Math.max(1, config.CHAT_HISTORY_ENTRY_MAX_LENGTH || 2000);
    const history = Array.isArray(req.body.history)
      ? req.body.history
          .filter(
            (entry) =>
              entry &&
              (entry.role === "user" || entry.role === "assistant") &&
              typeof entry.content === "string",
          )
          .slice(-8)
          .map((entry) => ({
            role: entry.role,
            content: entry.content.slice(0, historyEntryMaxLength),
          }))
      : [];
    const page = normalizePageContext(req.body.page);
    const seenRecommendationIds = normalizeSeenRecommendationIds(req.body.seenRecommendationIds);

    if (!message) {
      return res.status(400).json({ error: "A message is required." });
    }

    if (message.length > messageMaxLength) {
      return res.status(400).json({
        error: `Messages must be ${messageMaxLength} characters or fewer.`,
      });
    }

    rateLimiter?.check("chat", req.ip || "");

    const queryContext = analyzeChatQuery({ message, history, catalog });
    let initialIntent = classifyChatIntent({ message, page, history });

    if (queryContext.isTitleDetailQuestion && initialIntent.primary === "recommendation") {
      initialIntent = {
        primary: "show-detail",
        helpTopic: inferShowDetailTopic(message),
        includeRecommendations: false,
      };
    }

    if (initialIntent.primary === "clarification") {
      const helpResponse = buildSiteHelpResponse({
        message,
        helpTopic: initialIntent.helpTopic,
        history,
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

    if (queryContext.needsPositiveClarification) {
      return res.json({
        answer: queryContext.clarificationAnswer,
        actions: [],
        recommendations: [],
        suggestedPrompts: [
          "Try a warm sci-fi show",
          "Recommend something finished",
          "Give me a funny full-cast show",
          "Find a serious mystery instead",
        ],
        source: "fallback",
      });
    }

    const shouldScoreCatalog = initialIntent.primary !== "clarification";
    const rawMatches = shouldScoreCatalog ? scoreCatalog(catalog, queryContext.scoringMessage, queryContext.scoreOptions) : [];
    const repeatAware = applyRepeatPolicy(rawMatches, seenRecommendationIds);
    const matches = repeatAware.matches;
    const intent = promoteIntentWithMatches({
      intent: initialIntent,
      message,
      page,
      matches,
    });
    const recommendations = matches.slice(0, 3).map(buildRecommendationCard);
    const pageForHelp = shouldUseTargetShowForHelp(intent, queryContext)
      ? { ...page, showId: queryContext.targetShowId }
      : page;

    if (intent.primary === "site-help" || intent.primary === "show-detail" || intent.primary === "mixed") {
      const helpResponse = buildSiteHelpResponse({
        message,
        helpTopic: intent.helpTopic,
        history,
        page: pageForHelp,
        catalog,
        collections,
        siteHelpContext,
        matches,
        includeRecommendations: intent.includeRecommendations || intent.primary === "mixed",
      });
      const relatedRecommendations = helpResponse.recommendationIds
        .map((showId) => catalogById.get(showId))
        .filter(Boolean)
        .filter((show) => !queryContext.excludedShowIds.includes(show.id))
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
        answer: buildFallbackAnswer(message, matches, buildFallbackOptions(queryContext, repeatAware.repeatedRecommendation)),
        actions: [],
        recommendations,
        suggestedPrompts: buildSuggestedPrompts(matches),
        source: "fallback",
      });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);
      let result;

      try {
        const prompt = buildMessages({ message, history, matches });
        const response = await fetch(config.OLLAMA_URL, {
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
        if (!response.ok) {
          throw new Error(`Ollama request failed with ${response.status}`);
        }
        result = await response.json();
      } finally {
        clearTimeout(timeout);
      }
      const fallbackAnswer = buildFallbackAnswer(
        message,
        matches,
        buildFallbackOptions(queryContext, repeatAware.repeatedRecommendation),
      );
      let answer = fallbackAnswer;
      const canUseModelAnswer =
        !queryContext.hasAppliedConstraints &&
        !repeatAware.repeatedRecommendation &&
        typeof result.response === "string" &&
        result.response.trim() &&
        !answerMentionsExcludedTitle(result.response, queryContext.excludedTitles);

      if (canUseModelAnswer) {
        answer = sanitizeAnswerText(result.response, fallbackAnswer);
      }

      return res.json({
        answer,
        actions: [],
        recommendations,
        suggestedPrompts: buildSuggestedPrompts(matches),
        source: canUseModelAnswer ? "ollama" : "fallback",
      });
    } catch (error) {
      return res.json({
        answer: buildFallbackAnswer(message, matches, buildFallbackOptions(queryContext, repeatAware.repeatedRecommendation)),
        actions: [],
        recommendations,
        suggestedPrompts: buildSuggestedPrompts(matches),
        source: "fallback",
      });
    }
  });

  return router;
}

module.exports = {
  createChatRouter,
};
