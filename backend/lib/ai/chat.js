const GREETING_PATTERN = /^(hi|hello|hey|yo|sup|howdy)$/i;
const HELP_PATTERN = /(what can you do|help|how does this work)/i;

function hashText(value = "") {
  return Array.from(String(value || "")).reduce((hash, character) => ((hash * 31 + character.charCodeAt(0)) >>> 0), 11);
}

function pickVariant(seed, variants) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return "";
  }

  return variants[hashText(seed) % variants.length];
}

function isClarificationRequest(message = "") {
  const trimmed = message.trim();
  return trimmed.length < 3 || GREETING_PATTERN.test(trimmed);
}

function buildRecommendationWhy(match) {
  const meaningfulReasons = Array.isArray(match.reasons)
    ? match.reasons.filter((reason) => !/direct title match|title starts with|title lines up with/i.test(reason))
    : [];

  if (meaningfulReasons.length > 0) {
    return meaningfulReasons.slice(0, 2).map(formatRecommendationReason).join(" and ");
  }

  if (match.bestFor.length > 0) {
    return `is strong for ${match.bestFor.slice(0, 2).map((tag) => tag.replace(/-/g, " ")).join(" and ")}`;
  }

  if (match.tags.length > 0) {
    return `fits ${match.tags.slice(0, 2).join(" and ")}`;
  }

  if (match.tones.length > 0) {
    return `leans ${match.tones.slice(0, 2).join(" and ")}`;
  }

  return "fits the archive criteria you asked for";
}

function formatRecommendationReason(reason = "") {
  const value = String(reason || "").trim();

  if (/^similar to\b/i.test(value)) {
    return `is ${value}`;
  }

  if (/^good for\b/i.test(value)) {
    return `is ${value}`;
  }

  if (/^[a-z0-9 -]+ format$/i.test(value)) {
    return `uses a ${value}`;
  }

  if (/^created by\b/i.test(value)) {
    return `was ${value}`;
  }

  if (/^cast includes\b/i.test(value)) {
    return value.replace(/^cast includes/i, "has cast including");
  }

  if (/^linked to\b/i.test(value)) {
    return `is ${value}`;
  }

  if (/^(finished|ongoing|completed|cancelled|unclear) listen$/i.test(value)) {
    return `is a ${value}`;
  }

  return value;
}

function buildRecommendationCard(match) {
  return {
    id: match.id,
    title: match.title,
    href: match.href,
    hasPage: match.hasPage,
    image: match.image,
    imageAlt: match.imageAlt,
    tags: match.tags.slice(0, 4),
    rating: match.finalRating,
    summary: match.summary,
    why: buildRecommendationWhy(match),
    reviewStatus: match.reviewStatus,
  };
}

function buildCandidateDigest(matches) {
  return matches.slice(0, 6).map((match) => ({
    title: match.title,
    subtitle: match.subtitle,
    tags: match.tags,
    genres: match.genres,
    tones: match.tones,
    formats: match.formats,
    rating: match.finalRating,
    summary: match.summary,
    archiveTake: match.archiveTake,
    thoughts: match.thoughts,
    bestFor: match.bestFor,
    length: match.length,
    creators: match.creators,
    completionStatus: match.completionStatus,
    reviewStatus: match.reviewStatus,
    narrator: match.facts?.narrator || "",
    transcripts: match.availability?.transcripts || "",
    themes: match.themes,
    contentNotes: match.contentNotes,
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
    "You may mention creator, completion status, format, runtime, transcript availability, or archive take only when present in the candidate data.",
    "Keep the answer concise: 2 to 4 short sentences.",
    "If the user is vague, ask for a genre, mood, or theme instead of guessing.",
    "Avoid reusing the same opening sentence across turns when a different phrasing would fit.",
    "When recommending an Imported entry, say that its factual metadata was source checked by automation and has not been individually reviewed.",
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

function buildFallbackAnswer(message, matches, options = {}) {
  const constraintIntro = typeof options.constraintIntro === "string" ? options.constraintIntro.trim() : "";
  const repeatedRecommendationTitle =
    typeof options.repeatedRecommendationTitle === "string" ? options.repeatedRecommendationTitle.trim() : "";

  if (HELP_PATTERN.test(message)) {
    return pickVariant(message, [
      "Ask about the archive, ratings, submissions, or what to listen to next, and I'll keep the answer grounded in Echo Archives.",
      "I can help with recommendations, archive rules, ratings, and common site questions as long as the answer stays grounded in Echo Archives data.",
      "Use me for archive recommendations, show facts, ratings context, or regular site-help questions, and I'll stay anchored to the archive.",
    ]);
  }

  if (isClarificationRequest(message)) {
    return pickVariant(message, [
      "Tell me if you want something finished or ongoing, or give me a mood, theme, or title already in the archive.",
      "Give me a mood, a genre lane, or a title already in the archive, and I can narrow it properly.",
      "Point me at a completion status, theme, or seed title from the archive so I can aim the recommendation.",
    ]);
  }

  if (matches.length === 0) {
    if (constraintIntro) {
      return `${constraintIntro}, ${pickVariant(message, [
        "I couldn't find a clean archive match. Try adding a mood, genre, completion status, or a title you already like.",
        "nothing lines up cleanly yet. Add a mood, genre, completion status, or a title you already like.",
        "I still need a clearer lane. Try a mood, genre, completion status, or a title you already like.",
      ])}`;
    }

    return pickVariant(message, [
      "I need a little more to go on. Try a completion status, a listening mood, or a podcast title already in the archive.",
      "I need a clearer lane. Try a mood, a completion status, or a title already in the archive.",
      "Give me one anchor point like mood, genre, completion status, or an archive title you already like.",
    ]);
  }

  const [first, second] = matches;
  const firstWhy = buildRecommendationWhy(first);
  const firstSnapshot = buildShowSnapshot(first);
  const firstTake = buildTakeSnippet(first);
  const importedDisclosure = first.reviewStatus === "imported"
    ? "This is an Imported entry: its factual metadata was source checked by automation and has not been individually reviewed."
    : "";
  const wantsRatedAnswer = /\btop rated\b|\bhighest rated\b|\bbest rated\b/i.test(message);
  const wantsAlternates = shouldOfferAlternate(message, matches);

  if (!second) {
    return compactSentences([
      buildOpeningSentence(first.title, { constraintIntro, repeatedRecommendationTitle }),
      `It ${firstWhy}${firstSnapshot ? `, and ${firstSnapshot}` : ""}.`,
      wantsRatedAnswer && Number.isFinite(first.finalRating) ? `Archive Rating is ${first.finalRating}/10.` : firstTake,
      importedDisclosure,
    ]);
  }

  return compactSentences([
    buildOpeningSentence(first.title, { constraintIntro, repeatedRecommendationTitle }),
    `It ${firstWhy}${firstSnapshot ? `, and ${firstSnapshot}` : ""}.`,
    wantsRatedAnswer && Number.isFinite(first.finalRating) ? `Archive Rating is ${first.finalRating}/10.` : firstTake,
    importedDisclosure,
    wantsAlternates
      ? pickVariant(`${message}|${first.title}|${second.title}`, [
          `If you want a nearby alternative, ${second.title} is the next clean fit.`,
          `${second.title} is the closest alternate if you want one step sideways.`,
          `If you want a second lane, ${second.title} is the next archive match.`,
        ])
      : "",
  ]);
}

function buildSuggestedPrompts(matches) {
  const defaultPrompts = [
    "How do I submit a correction?",
    "What does creator verified mean?",
    "How are community ratings different?",
    "Recommend a finished show with strong worldbuilding",
  ];

  if (matches.length === 0) {
    return defaultPrompts;
  }

  const [topMatch] = matches;

  return [
    `Who made ${topMatch.title}?`,
    `How long is ${topMatch.title}?`,
    `What is ${topMatch.title} similar to?`,
    "Show me another finished pick",
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

function buildShowSnapshot(match) {
  const pieces = [];

  if (match.completionStatus === "finished") {
    pieces.push("it is finished");
  } else if (match.completionStatus === "ongoing") {
    pieces.push("it is ongoing");
  }

  const formatLabel = Array.isArray(match.formats) && match.formats.length > 0 ? match.formats[0].replace(/-/g, " ") : "";
  const genreLabel =
    Array.isArray(match.genres) && match.genres.length > 0 ? match.genres.slice(0, 2).join(" / ") : "";

  if (formatLabel || genreLabel) {
    pieces.push(`it is tagged ${[formatLabel, genreLabel].filter(Boolean).join(" ")}`);
  }

  if (Array.isArray(match.tones) && match.tones.length > 0) {
    pieces.push(`the tone is ${match.tones.slice(0, 2).join(" and ")}`);
  }

  return pieces.slice(0, 2).join(", ");
}

function buildTakeSnippet(match) {
  const archiveTake = String(match.archiveTake || "").trim();
  if (archiveTake) {
    return archiveTake.endsWith(".") ? archiveTake : `${archiveTake}.`;
  }

  const summary = String(match.summary || "").trim();
  if (!summary) {
    return "";
  }

  const sentence = (summary.match(/[^.!?]+[.!?]?/) || [summary])[0].trim();
  return sentence;
}

function buildOpeningSentence(title, { constraintIntro = "", repeatedRecommendationTitle = "" } = {}) {
  if (repeatedRecommendationTitle && repeatedRecommendationTitle === title) {
    return compactSentences(
      [
        constraintIntro ? `${constraintIntro}.` : "",
        pickVariant(`${title}|${constraintIntro}|repeat`, [
          `I know I already suggested ${title}, but it is still the strongest fit.`,
          `I have mentioned ${title} already, but it is still the cleanest archive match.`,
          `${title} has come up before, but it still looks like the best fit.`,
        ]),
      ].filter(Boolean),
    );
  }

  if (constraintIntro) {
    return pickVariant(`${title}|${constraintIntro}`, [
      `${constraintIntro}, ${title} is the strongest fit.`,
      `${constraintIntro}, ${title} looks like the cleanest archive match.`,
      `${constraintIntro}, ${title} is probably your best next stop.`,
    ]);
  }

  return pickVariant(title, [
    `${title} is the strongest fit.`,
    `${title} looks like the cleanest archive match.`,
    `${title} is probably your best next stop.`,
  ]);
}

function shouldOfferAlternate(message, matches) {
  if (matches.length < 2) {
    return false;
  }

  return /\banother\b|\balternative\b|\balternates\b|\boptions\b|\bfew\b|\bsome\b|\bshow me\b|\brecommend\b|\bsuggest\b/i.test(
    message,
  );
}

function compactSentences(sentences) {
  return sentences
    .filter(Boolean)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  buildFallbackAnswer,
  buildMessages,
  buildRecommendationCard,
  buildSuggestedPrompts,
  isClarificationRequest,
  sanitizeAnswerText,
};
