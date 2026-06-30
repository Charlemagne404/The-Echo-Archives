const { normalizeTag, normalizeText } = require("../../../shared/archive-search");

const RECOMMENDATION_SIGNAL_PATTERN =
  /\b(recommend|suggest|find me|looking for|what should i listen to|what should i start|give me|show me|i want|i need|something|anything)\b/i;
const RESET_CONSTRAINTS_PATTERN =
  /\b(forget|reset|clear|ignore)\b.*\b(preferences?|constraints?|exclusions?|filters?|avoidance|avoid)\b/i;
const NEGATIVE_CONTEXT_PATTERN = /\b(don t|dont|do not|not|no|avoid|exclude|without|skip|nothing)\b/;
const ALLOW_CONTEXT_PATTERN = /\b(can include|include|allow|allowed|ok|okay|fine|stop avoiding|don t avoid|dont avoid)\b/;
const NOT_LIKE_CONTEXT_PATTERN =
  /\b(don t give me something like|dont give me something like|do not give me something like|not something like|nothing like|not like|avoid something like|exclude something like|without something like|avoid shows like|exclude shows like)\b/;
const TITLE_ABOUT_PATTERN = /^(?:what s|what is)\s+.+\s+about$/;
const SITE_ABOUT_PATTERN = /\b(echo archives|the echo archives|this site|the site|archive)\b/;
const DETAIL_SIGNAL_PATTERN =
  /\b(what s|what is|tell me about|summary|description|who made|who created|who wrote|how long|runtime|episodes?|seasons?|where can i listen|listen links?|official links?|transcripts?|captions?|content notes?|content warnings?|trigger warnings?|similar to|what else is like|collections?)\b/;

const COMPLETION_ALIASES = [
  { value: "finished", aliases: ["finished", "completed", "complete"] },
  { value: "ongoing", aliases: ["ongoing", "active", "unfinished"] },
  { value: "cancelled", aliases: ["cancelled", "canceled"] },
];

const FIELD_ALIASES = {
  genres: {
    "sci-fi": ["sci fi", "sci-fi", "science fiction", "scifi"],
  },
  formats: {
    "full-cast": ["full cast", "full-cast", "fullcast"],
    narrated: ["narrated", "single narrator", "solo narrator", "one narrator"],
  },
  bestFor: {
    "long-walks": ["long walks", "long-walks"],
    "easy-entry": ["easy entry", "easy-entry", "easy to get into", "easy to jump into"],
    "binge-listening": ["binge listening", "binge-listening", "bingeable"],
    "headphones-on": ["headphones on", "headphones-on"],
    "cold-isolation-horror": ["cold isolation horror", "cold-isolation-horror"],
    "funny-space-disasters": ["funny space disasters", "funny-space-disasters"],
    "serious-sci-fi": ["serious sci fi", "serious sci-fi", "serious science fiction"],
  },
};

function analyzeChatQuery({ message = "", history = [], catalog = [] }) {
  const pastUserMessages = normalizeHistoryMessages(history, message);
  const messages = pastUserMessages.concat(message);
  const state = buildConstraintState({ messages, catalog });
  const currentDelta = extractMessageSignals(message, catalog);
  const nonNegativeMentions = currentDelta.titleMentions.filter((mention) => !mention.isNegative);
  const currentPositiveConstraints = currentDelta.positiveConstraints;
  const currentHasPositiveConstraints = Object.keys(currentPositiveConstraints).length > 0;
  const targetShowId = resolveTargetShowId({ mentions: nonNegativeMentions, message });
  const positiveSeedShowId = resolvePositiveSeedShowId({ mentions: nonNegativeMentions, message });
  const isTitleDetailQuestion = looksLikeShowDetailQuestion(message);
  const onlyNegativeRecommendation =
    currentDelta.hasNegativeConstraint &&
    hasRecommendationSignal(message) &&
    !currentHasPositiveConstraints &&
    !positiveSeedShowId &&
    !isTitleDetailQuestion;

  const hardExcludedIds = collectHardExcludedIds({ catalog, state });
  const scoreOptions = {
    excludeIds: Array.from(hardExcludedIds),
    avoidSimilaritySeedIds: Array.from(state.relatedExclusionSeedIds),
    requiredFields: serializePositiveConstraints(state.positiveConstraints),
    ...(positiveSeedShowId ? { seedShowId: positiveSeedShowId } : {}),
  };

  return {
    targetShowId,
    positiveSeedShowId,
    scoringMessage: buildScoringMessage(message, currentDelta),
    scoreOptions,
    hasAppliedConstraints: hardExcludedIds.size > 0 || Object.keys(scoreOptions.requiredFields).length > 0,
    hasNegativeConstraints: state.exactExcludedIds.size > 0 || state.relatedExclusionSeedIds.size > 0,
    excludedShowIds: Array.from(hardExcludedIds),
    excludedTitles: Array.from(hardExcludedIds)
      .map((showId) => catalog.find((show) => show.id === showId)?.title)
      .filter(Boolean),
    appliedConstraintIntro: buildAppliedConstraintIntro({ state, catalog }),
    needsPositiveClarification: onlyNegativeRecommendation,
    clarificationAnswer: buildNegativeOnlyClarification({ state, catalog }),
    isTitleDetailQuestion,
  };
}

function normalizeHistoryMessages(history, message) {
  const normalizedCurrent = normalizeText(message);
  const userMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => entry && entry.role === "user" && typeof entry.content === "string")
    .map((entry) => entry.content.trim())
    .filter(Boolean);

  if (userMessages.length > 0 && normalizeText(userMessages.at(-1)) === normalizedCurrent) {
    return userMessages.slice(0, -1);
  }

  return userMessages;
}

function buildConstraintState({ messages, catalog }) {
  const state = {
    exactExcludedIds: new Set(),
    relatedExclusionSeedIds: new Set(),
    positiveConstraints: {},
  };

  messages.forEach((entry) => {
    if (RESET_CONSTRAINTS_PATTERN.test(entry)) {
      state.exactExcludedIds.clear();
      state.relatedExclusionSeedIds.clear();
      state.positiveConstraints = {};
      return;
    }

    const delta = extractMessageSignals(entry, catalog);

    delta.allowedIds.forEach((showId) => {
      state.exactExcludedIds.delete(showId);
      state.relatedExclusionSeedIds.delete(showId);
    });
    delta.exactExcludedIds.forEach((showId) => state.exactExcludedIds.add(showId));
    delta.relatedExclusionSeedIds.forEach((showId) => {
      state.exactExcludedIds.add(showId);
      state.relatedExclusionSeedIds.add(showId);
    });
    mergePositiveConstraints(state.positiveConstraints, delta.positiveConstraints);
  });

  return state;
}

function extractMessageSignals(message, catalog) {
  const normalizedMessage = normalizeText(message);
  const titleMentions = findTitleMentions(message, catalog);
  const exactExcludedIds = new Set();
  const relatedExclusionSeedIds = new Set();
  const allowedIds = new Set();

  titleMentions.forEach((mention) => {
    if (mention.isAllowed) {
      allowedIds.add(mention.show.id);
      return;
    }

    if (!mention.isNegative) {
      return;
    }

    exactExcludedIds.add(mention.show.id);
    if (mention.isNotLike) {
      relatedExclusionSeedIds.add(mention.show.id);
    }
  });

  return {
    titleMentions,
    exactExcludedIds,
    relatedExclusionSeedIds,
    allowedIds,
    positiveConstraints: extractPositiveConstraints(normalizedMessage, catalog),
    hasNegativeConstraint: exactExcludedIds.size > 0 || relatedExclusionSeedIds.size > 0,
  };
}

function findTitleMentions(message, catalog) {
  const normalizedMessage = normalizeText(message);
  const entries = buildTitleEntries(catalog);
  const mentions = [];
  const seenShowIds = new Set();

  entries.forEach((entry) => {
    if (seenShowIds.has(entry.show.id)) {
      return;
    }

    const match = findPhrase(normalizedMessage, entry.normalized);
    if (!match) {
      return;
    }

    const contextStart = Math.max(0, match.index - 90);
    const before = normalizedMessage.slice(contextStart, match.index);
    const after = normalizedMessage.slice(match.end, Math.min(normalizedMessage.length, match.end + 40));
    const isAllowed = ALLOW_CONTEXT_PATTERN.test(before);
    const isNegative = !isAllowed && NEGATIVE_CONTEXT_PATTERN.test(before);
    const isNotLike =
      isNegative &&
      (NOT_LIKE_CONTEXT_PATTERN.test(before) ||
        /\b(like|similar to|shows like|something like)\s*$/.test(before) ||
        /^\s*(or anything like|or something like)\b/.test(after));

    mentions.push({
      show: entry.show,
      matchedText: entry.text,
      index: match.index,
      end: match.end,
      before,
      after,
      isAllowed,
      isNegative,
      isNotLike,
    });
    seenShowIds.add(entry.show.id);
  });

  return mentions.sort((left, right) => left.index - right.index);
}

function buildTitleEntries(catalog) {
  return (Array.isArray(catalog) ? catalog : [])
    .flatMap((show) => {
      const values = [show.title, ...(Array.isArray(show.aliases) ? show.aliases : [])];
      return values
        .map((value) => ({ show, text: String(value || "").trim(), normalized: normalizeText(value) }))
        .filter((entry) => entry.normalized.length > 1);
    })
    .sort((left, right) => right.normalized.length - left.normalized.length);
}

function buildScoringMessage(message, currentDelta) {
  let cleaned = String(message || "");
  const negativeMentions = currentDelta.titleMentions.filter((mention) => mention.isNegative);

  negativeMentions.forEach((mention) => {
    const titlePattern = mention.matchedText
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");

    if (!titlePattern) {
      return;
    }

    const pattern = new RegExp(
      `\\s*(?:but\\s+)?(?:(?:don'?t|dont|do\\s+not)\\s+give\\s+me\\s+)?(?:not\\s+|no\\s+|avoid\\s+|exclude\\s+|without\\s+|skip\\s+|nothing\\s+)?(?:something\\s+like\\s+|shows?\\s+like\\s+|like\\s+|similar\\s+to\\s+)?${titlePattern}`,
      "ig",
    );
    cleaned = cleaned.replace(pattern, " ");
  });

  const compacted = cleaned.replace(/\s+/g, " ").trim();
  return compacted || message;
}

function findPhrase(normalizedText, normalizedPhrase) {
  if (!normalizedPhrase) {
    return null;
  }

  const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalizedText.match(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`));

  if (!match || match.index === undefined) {
    return null;
  }

  const leadingSpace = match[1] ? match[1].length : 0;
  const index = match.index + leadingSpace;
  return {
    index,
    end: index + normalizedPhrase.length,
  };
}

function extractPositiveConstraints(normalizedMessage, catalog) {
  const constraints = {};

  COMPLETION_ALIASES.forEach((entry) => {
    if (entry.aliases.some((alias) => containsPositivePhrase(normalizedMessage, alias))) {
      addConstraintValue(constraints, "completionStatus", entry.value);
    }
  });

  ["genres", "tones", "formats", "bestFor"].forEach((fieldName) => {
    buildCatalogFieldTerms(catalog, fieldName).forEach((entry) => {
      if (entry.aliases.some((alias) => containsPositivePhrase(normalizedMessage, alias))) {
        addConstraintValue(constraints, fieldName, entry.value);
      }
    });
  });

  return constraints;
}

function buildCatalogFieldTerms(catalog, fieldName) {
  const values = new Set();
  (Array.isArray(catalog) ? catalog : []).forEach((show) => {
    const fieldValues = Array.isArray(show[fieldName]) ? show[fieldName] : [];
    fieldValues.forEach((value) => values.add(normalizeTag(value)));
  });

  return Array.from(values).map((value) => ({
    value,
    aliases: Array.from(
      new Set([value, value.replace(/-/g, " "), ...(FIELD_ALIASES[fieldName]?.[value] || [])].map(normalizeText).filter(Boolean)),
    ),
  }));
}

function containsPositivePhrase(normalizedMessage, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  const match = findPhrase(normalizedMessage, normalizedPhrase);
  if (!match) {
    return false;
  }

  const before = normalizedMessage.slice(Math.max(0, match.index - 20), match.index);
  return !/\b(not|no|without|avoid|exclude)\s*$/.test(before);
}

function addConstraintValue(constraints, fieldName, value) {
  if (!constraints[fieldName]) {
    constraints[fieldName] = new Set();
  }

  constraints[fieldName].add(normalizeTag(value));
}

function mergePositiveConstraints(target, source) {
  Object.entries(source).forEach(([fieldName, values]) => {
    if (!target[fieldName] || fieldName === "completionStatus") {
      target[fieldName] = new Set();
    }

    values.forEach((value) => target[fieldName].add(value));
  });
}

function serializePositiveConstraints(constraints) {
  return Object.fromEntries(
    Object.entries(constraints)
      .map(([fieldName, values]) => [fieldName, Array.from(values)])
      .filter(([, values]) => values.length > 0),
  );
}

function resolvePositiveSeedShowId({ mentions, message }) {
  const normalizedMessage = normalizeText(message);
  const seedMention = mentions.find((mention) => {
    const before = normalizedMessage.slice(Math.max(0, mention.index - 40), mention.index);
    const after = normalizedMessage.slice(mention.end, Math.min(normalizedMessage.length, mention.end + 20));
    return (
      /\b(like|shows like|something like|similar to)\s*$/.test(before) ||
      /^\s+like\b/.test(after)
    );
  });

  return seedMention?.show.id || "";
}

function resolveTargetShowId({ mentions, message }) {
  if (!looksLikeShowDetailQuestion(message)) {
    return "";
  }

  return mentions[0]?.show.id || "";
}

function looksLikeShowDetailQuestion(message) {
  const normalized = normalizeText(message);
  if (!normalized || SITE_ABOUT_PATTERN.test(normalized)) {
    return false;
  }

  return TITLE_ABOUT_PATTERN.test(normalized) || DETAIL_SIGNAL_PATTERN.test(normalized);
}

function hasRecommendationSignal(message) {
  return RECOMMENDATION_SIGNAL_PATTERN.test(message);
}

function collectHardExcludedIds({ catalog, state }) {
  const excluded = new Set(state.exactExcludedIds);

  state.relatedExclusionSeedIds.forEach((seedId) => {
    const seed = catalog.find((show) => show.id === seedId);
    if (!seed) {
      return;
    }

    excluded.add(seed.id);
    (Array.isArray(seed.similarTo) ? seed.similarTo : []).forEach((showId) => excluded.add(showId));
    catalog
      .filter((show) => Array.isArray(show.similarTo) && show.similarTo.includes(seed.id))
      .forEach((show) => excluded.add(show.id));
  });

  return excluded;
}

function buildAppliedConstraintIntro({ state, catalog }) {
  const avoidedTitles = Array.from(state.exactExcludedIds)
    .map((showId) => catalog.find((show) => show.id === showId)?.title)
    .filter(Boolean);

  if (avoidedTitles.length === 0) {
    return "";
  }

  const titleText = joinReadableList(avoidedTitles);
  const hasRelatedAvoidance = state.relatedExclusionSeedIds.size > 0;
  return hasRelatedAvoidance
    ? `Avoiding ${titleText} and nearby archive neighbors`
    : `Avoiding ${titleText}`;
}

function buildNegativeOnlyClarification({ state, catalog }) {
  const intro = buildAppliedConstraintIntro({ state, catalog });

  if (!intro) {
    return "What mood, genre, or listening context should I aim for instead?";
  }

  return `${intro}. What mood, genre, or listening context should I aim for instead?`;
}

function answerMentionsExcludedTitle(answer, excludedTitles = []) {
  const normalizedAnswer = normalizeText(answer);

  return excludedTitles.some((title) => {
    const normalizedTitle = normalizeText(title);
    return normalizedTitle && Boolean(findPhrase(normalizedAnswer, normalizedTitle));
  });
}

function joinReadableList(values) {
  const normalized = values.map((value) => String(value || "").trim()).filter(Boolean);

  if (normalized.length <= 1) {
    return normalized[0] || "";
  }

  if (normalized.length === 2) {
    return `${normalized[0]} and ${normalized[1]}`;
  }

  return `${normalized.slice(0, -1).join(", ")}, and ${normalized.at(-1)}`;
}

module.exports = {
  analyzeChatQuery,
  answerMentionsExcludedTitle,
  findTitleMentions,
  looksLikeShowDetailQuestion,
};
