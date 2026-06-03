const GREETING_PATTERN = /^(hi|hello|hey|yo|sup|howdy)$/i;
const HELP_PATTERN = /(what can you do|help|how does this work)/i;

function isClarificationRequest(message = "") {
  const trimmed = message.trim();
  return trimmed.length < 3 || GREETING_PATTERN.test(trimmed);
}

function buildRecommendationWhy(match) {
  if (match.reasons.length > 0) {
    return match.reasons.slice(0, 2).join(" and ");
  }

  if (match.bestFor.length > 0) {
    return `is strong for ${match.bestFor.slice(0, 2).map((tag) => tag.replace(/-/g, " ")).join(" and ")}`;
  }

  if (match.tags.length > 0) {
    return `fits ${match.tags.slice(0, 2).join(" and ")}`;
  }

  return "fits the archive criteria you asked for";
}

function buildRecommendationCard(match) {
  return {
    title: match.title,
    href: match.href,
    hasPage: match.hasPage,
    image: match.image,
    imageAlt: match.imageAlt,
    tags: match.tags.slice(0, 4),
    rating: match.finalRating,
    summary: match.summary,
    why: buildRecommendationWhy(match),
  };
}

function buildCandidateDigest(matches) {
  return matches.slice(0, 6).map((match) => ({
    title: match.title,
    tags: match.tags,
    rating: match.finalRating,
    summary: match.summary,
    thoughts: match.thoughts,
    bestFor: match.bestFor,
    length: match.length,
    similarTo: match.similarTo,
    why: buildRecommendationWhy(match),
  }));
}

function buildMessages({ message, history, matches }) {
  const instructions = [
    "You are The Echo Archives assistant.",
    "Recommend only podcasts that appear in the candidate list.",
    "Do not invent titles, links, ratings, or details.",
    "Prefer 1 strong recommendation, with at most 2 alternates if the user asks broadly.",
    "Keep the answer concise: 2 to 4 short sentences.",
    "If the user is vague, ask for a genre, mood, or theme instead of guessing.",
    "Use a natural voice, not bullet points.",
  ].join(" ");

  const transcript = history
    .slice(-6)
    .map((entry) => `${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content}`)
    .join("\n");

  const prompt = [
    instructions,
    "",
    transcript ? `Recent conversation:\n${transcript}\n` : "",
    `User question: ${message}`,
    "",
    `Candidate podcasts:\n${JSON.stringify(buildCandidateDigest(matches), null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return prompt;
}

function buildFallbackAnswer(message, matches) {
  if (HELP_PATTERN.test(message)) {
    return "Ask for a mood, completion status, listening context, or a specific show and I'll narrow the archive down for you.";
  }

  if (isClarificationRequest(message)) {
    return "Tell me if you want something finished or ongoing, or give me a mood, theme, or title already in the archive.";
  }

  if (matches.length === 0) {
    return "I need a little more to go on. Try a completion status, a listening mood, or a podcast title already in the archive.";
  }

  const [first, second] = matches;
  const firstWhy = buildRecommendationWhy(first);

  if (!second) {
    return `${first.title} is the strongest fit. It ${firstWhy}.`;
  }

  return `${first.title} is the strongest fit. If you want a nearby alternative, try ${second.title} too.`;
}

function buildSuggestedPrompts(matches) {
  const defaultPrompts = [
    "Give me a finished show with strong worldbuilding",
    "I want something easy to jump into late at night",
    "Recommend a darker survival story",
    "What should I start with if I want a full review first?",
  ];

  if (matches.length === 0) {
    return defaultPrompts;
  }

  return [
    `Tell me more about ${matches[0].title}`,
    `Give me something like ${matches[0].title}`,
    "Show me another finished pick",
    "I want something easier to jump into",
  ];
}

function sanitizeAnswerText(answer, fallback) {
  const raw = String(answer || "").replace(/\s+/g, " ").trim();

  if (/^Based on/i.test(raw)) {
    return fallback;
  }

  const cleaned = raw
    .replace(/^Based on your request[^.?!]*[.?!]\s*/i, "")
    .replace(/^Based on what you described[^.?!]*[.?!]\s*/i, "")
    .trim();

  if (!cleaned) {
    return fallback;
  }

  const sentences = cleaned.match(/[^.!?]+[.!?]?/g) || [cleaned];
  const concise = sentences
    .slice(0, 3)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!concise) {
    return fallback;
  }

  return concise.length > 420 ? `${concise.slice(0, 417).trim()}...` : concise;
}

module.exports = {
  buildFallbackAnswer,
  buildMessages,
  buildRecommendationCard,
  buildSuggestedPrompts,
  isClarificationRequest,
  sanitizeAnswerText,
};
