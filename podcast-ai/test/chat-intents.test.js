const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyChatIntent, promoteIntentWithMatches } = require("../lib/chat-intents");

test("classifyChatIntent routes correction questions to site help", () => {
  const intent = classifyChatIntent({
    message: "How do I submit a correction?",
    page: { pageType: "home" },
  });

  assert.equal(intent.primary, "site-help");
  assert.equal(intent.helpTopic, "correction");
  assert.equal(intent.includeRecommendations, false);
});

test("classifyChatIntent recognizes mixed help and recommendation prompts", () => {
  const intent = classifyChatIntent({
    message: "What does creator verified mean and recommend something like Midnight Burger",
    page: { pageType: "home" },
  });

  assert.equal(intent.primary, "mixed");
  assert.equal(intent.helpTopic, "creator-verification");
  assert.equal(intent.includeRecommendations, true);
});

test("classifyChatIntent uses show-page context for show-detail questions", () => {
  const intent = classifyChatIntent({
    message: "Is this show finished?",
    page: { pageType: "show", showId: "impact-winter" },
  });

  assert.equal(intent.primary, "show-detail");
  assert.equal(intent.helpTopic, "show-status");
});

test("promoteIntentWithMatches upgrades direct-title status questions into show detail", () => {
  const intent = promoteIntentWithMatches({
    intent: {
      primary: "recommendation",
      helpTopic: null,
      includeRecommendations: false,
    },
    message: "Is Wolf 359 finished?",
    page: { pageType: "home" },
    matches: [
      {
        title: "Wolf 359",
        reasons: ["direct title match for Wolf 359"],
      },
    ],
  });

  assert.equal(intent.primary, "show-detail");
  assert.equal(intent.helpTopic, "show-status");
});

test("classifyChatIntent keeps external playback problems inside site-help boundaries", () => {
  const intent = classifyChatIntent({
    message: "Spotify is not playing this episode. Can you fix it?",
    page: { pageType: "show", showId: "impact-winter" },
  });

  assert.equal(intent.primary, "site-help");
  assert.equal(intent.helpTopic, "external-platform");
});
