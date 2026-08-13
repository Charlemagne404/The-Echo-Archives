const GREETING_PATTERN = /^(hi|hello|hey|yo|sup|howdy)$/i;
const FOLLOW_UP_PATTERN =
  /\b(still|already|again|same|that|this|it|they|them|didn't|did not|won't|cannot|can't|not working|not loading|not helping)\b/i;

const RECOMMENDATION_PATTERNS = [
  /\brecommend\b/i,
  /\bsuggest\b/i,
  /\bsomething like\b/i,
  /\bshows? like\b/i,
  /\bwhat should i (?:listen to|start)\b/i,
  /\bfind me\b/i,
  /\bi want something\b/i,
  /\bi need (?:a )?show\b/i,
  /\blooking for\b/i,
  /\blike\s+[a-z0-9]/i,
];

const SHOW_DETAIL_PATTERN =
  /\b(this show|this page|archive rating|community rating|creator verified|full review|indexed(?: |-)?only|planned|finished|ongoing|status|where can i listen|listen links|official links|what is this show about|what's this show about|what is it about|what(?:'s| is) .+ about|how long|runtime|episodes?|seasons?|who made|who created|who wrote|cast|starring|full cast|single narrator|narrator|transcripts?|captions?|content warnings?|content notes?|trigger warnings?|similar to|what else is like|collection appearances?|in any collections?)\b/i;

const SHOW_DETAIL_TOPICS = new Set([
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

const HELP_TOPIC_PATTERNS = [
  {
    topic: "external-platform",
    patterns: [
      /\b(?:spotify|apple podcasts?|pocket casts?|overcast|youtube music|podbean)\b.*\b(?:not working|not playing|won't play|cannot play|can't play|broken|issue|problem|error)\b/i,
      /\b(?:episode|feed|player|app)\b.*\b(?:not working|not playing|won't play|cannot play|can't play|broken|issue|problem|error)\b/i,
    ],
  },
  {
    topic: "broken-link",
    patterns: [
      /\bbroken link\b/i,
      /\bwrong link\b/i,
      /\bdead link\b/i,
      /\boutdated link\b/i,
      /\blinks?\b.*\b(?:broken|wrong|dead|outdated|missing|404)\b/i,
    ],
  },
  {
    topic: "rating-help",
    patterns: [
      /\bwhy did(?:n't| not)\s+my rating(?:\s+not)?\s+stick\b/i,
      /\bwhy did my rating disappear\b/i,
      /\b(?:rating|ratings|community score|community rating|community average)\b.*\b(?:not stick|didn't stick|did not stick|not save|won't save|cannot save|can't save|failed|error|hidden|missing|not showing|won't show|cannot show|can't show)\b/i,
      /\b(?:can't|cannot|won't|didn't|did not)\b.*\b(?:rate|save my rating|submit my rating)\b/i,
      /\bwhy (?:is|isn't|is not)\b.*\b(?:community score|community rating|community average)\b/i,
    ],
  },
  {
    topic: "search-help",
    patterns: [
      /\bhow should i search\b/i,
      /\bsearch by\b/i,
      /\bdo(?:n'?t| not) know (?:the )?exact title\b/i,
      /\bno results\b/i,
      /\btoo many results\b/i,
      /\b(?:search|find|filter|filters|browse)\b.*\b(?:not working|broken|stuck|issue|problem|wrong|bad|help)\b/i,
      /\bcan(?:not|'?t)\s+find\b/i,
    ],
  },
  {
    topic: "submission-status",
    patterns: [
      /\bwhere(?:'s| is)\s+my\s+(?:submission|correction|review|verification)\b/i,
      /\bstatus of my\b.*\b(?:submission|correction|review|verification)\b/i,
      /\bwhy (?:isn't|is not)\s+(?:my show|it)\s+(?:listed|live|published)\b/i,
      /\bhow long does (?:a )?(?:submission|correction|review|verification)(?: request)?\b/i,
      /\bwhen will (?:my show|it)\s+(?:appear|go live|be listed)\b/i,
    ],
  },
  {
    topic: "page-navigation",
    patterns: [
      /\b(?:page|site|screen)\b.*\b(?:blank|missing|404|not loading|won't load|cannot load|can't load|broken)\b/i,
      /\bcan(?:not|'?t)\s+find\b.*\b(?:page|show page|collection page|submit page|help center)\b/i,
      /\bwhere (?:is|do i find)\b.*\b(?:submit|help center|collections|browse archive|show page)\b/i,
    ],
  },
  {
    topic: "creator-verification",
    patterns: [
      /\bcreator verified\b/i,
      /\bcreator verification\b/i,
      /\bverified creator\b/i,
      /\bmetadata verified\b/i,
    ],
  },
  {
    topic: "show-runtime",
    patterns: [
      /\bhow long\b/i,
      /\bruntime\b/i,
      /\bepisode count\b/i,
      /\bseason count\b/i,
      /\bhow many episodes?\b/i,
      /\bhow many seasons?\b/i,
      /\bcommitment\b/i,
    ],
  },
  {
    topic: "show-credits",
    patterns: [
      /\bwho made\b/i,
      /\bwho created\b/i,
      /\bwho wrote\b/i,
      /\bcreator of\b/i,
      /\bcreated by\b/i,
      /\bwho(?:'s| is) behind\b/i,
      /\bwho(?:'s| is) in\b/i,
      /\bstarring\b/i,
      /\bcast\b/i,
      /\bvoice cast\b/i,
      /\bproduction company\b/i,
      /\bnetwork\b/i,
    ],
  },
  {
    topic: "show-format",
    patterns: [
      /\bfull cast\b/i,
      /\bsingle narrator\b/i,
      /\bsolo narrator\b/i,
      /\bnarrator\b/i,
      /\bformat\b/i,
      /\banthology\b/i,
      /\bserialized\b/i,
      /\bpov\b/i,
      /\bpoint of view\b/i,
      /\bsource material\b/i,
    ],
  },
  {
    topic: "show-transcripts",
    patterns: [
      /\btranscripts?\b/i,
      /\bcaptions?\b/i,
      /\baccessible\b/i,
      /\baccessibility\b/i,
    ],
  },
  {
    topic: "show-content-notes",
    patterns: [
      /\bcontent warnings?\b/i,
      /\bcontent notes?\b/i,
      /\btrigger warnings?\b/i,
      /\bcontent warning\b/i,
    ],
  },
  {
    topic: "show-similar",
    patterns: [
      /\bwhat is .* similar to\b/i,
      /\bwhat's .* similar to\b/i,
      /\bshows? like this\b/i,
      /\bwhat else is like\b/i,
      /\bsimilar shows?\b/i,
    ],
  },
  {
    topic: "show-collections",
    patterns: [
      /\bwhat collections? (?:is|are) .* in\b/i,
      /\bin any collections?\b/i,
      /\bcollection appearances?\b/i,
      /\bpart of any collections?\b/i,
    ],
  },
  {
    topic: "listener-review",
    patterns: [
      /\blistener review\b/i,
      /\bsubmit .*review\b/i,
      /\breview submission\b/i,
      /\bleave a review\b/i,
    ],
  },
  {
    topic: "correction",
    patterns: [
      /\bsubmit .*correction\b/i,
      /\bhow do i correct\b/i,
      /\bcorrection\b/i,
      /\bmetadata error\b/i,
      /\bfix .*metadata\b/i,
    ],
  },
  {
    topic: "submission",
    patterns: [
      /\bsubmit\b/i,
      /\bnew show\b/i,
      /\badd (?:a )?show\b/i,
      /\bhow do i add\b/i,
      /\bhow does submission\b/i,
    ],
  },
  {
    topic: "privacy",
    patterns: [
      /\bprivacy\b/i,
      /\bcookies?\b/i,
      /\bchat history\b/i,
      /\bsession storage\b/i,
      /\blocal storage\b/i,
      /\btrack(?:ing)?\b/i,
      /\bdata\b/i,
      /\bip address\b/i,
      /\buser agent\b/i,
      /\bstore\b.*\bbrowser\b/i,
    ],
  },
  {
    topic: "terms",
    patterns: [
      /\bterms\b/i,
      /\brules\b/i,
      /\ballowed\b/i,
      /\bspam\b/i,
      /\bscrap(?:e|ing)\b/i,
      /\beditorial independence\b/i,
      /\bintellectual property\b/i,
    ],
  },
  {
    topic: "support",
    patterns: [
      /\bsupport the archive\b/i,
      /\bsupporters?\b/i,
      /\bpatreon\b/i,
      /\bdonate\b/i,
      /\blistener supported\b/i,
    ],
  },
  {
    topic: "contact",
    patterns: [
      /\bcontact\b/i,
      /\breach (?:out|you)\b/i,
      /\bemail\b/i,
      /\bhow do i get in touch\b/i,
    ],
  },
  {
    topic: "collections",
    patterns: [
      /\bcollections?\b/i,
      /\bcurated routes?\b/i,
      /\blistening paths?\b/i,
      /\bbrowse archive\b/i,
    ],
  },
  {
    topic: "archive-stats",
    patterns: [
      /\bhow many\b.*\bshows?\b/i,
      /\bhow many\b.*\bcollections?\b/i,
      /\bhow many\b.*\bfull reviews?\b/i,
      /\bhow many\b.*\bcreator verified\b/i,
      /\bhow big is (?:the )?archive\b/i,
      /\bhow large is (?:the )?archive\b/i,
    ],
  },
  {
    topic: "recently-added",
    patterns: [
      /\brecently added\b/i,
      /\bnew additions?\b/i,
      /\bnewly added\b/i,
      /\blatest additions?\b/i,
      /\bwhat'?s new in (?:the )?archive\b/i,
    ],
  },
  {
    topic: "creator-verified-list",
    patterns: [
      /\bcreator verified shows?\b/i,
      /\bwhich shows? (?:are|have been) creator verified\b/i,
      /\bwhat shows? are creator verified\b/i,
    ],
  },
  {
    topic: "full-review-list",
    patterns: [
      /\bfull review shows?\b/i,
      /\bwhich shows? have full reviews?\b/i,
      /\bwhat shows? are fully reviewed\b/i,
      /\breviewed shows?\b/i,
    ],
  },
  {
    topic: "ratings",
    patterns: [
      /\barchive rating\b/i,
      /\bcommunity rating\b/i,
      /\bratings?\b/i,
      /\bscores?\b/i,
      /\btop rated\b/i,
      /\bhighest rated\b/i,
      /\bbest rated\b/i,
      /\btrust\b/i,
    ],
  },
  {
    topic: "show-links",
    patterns: [
      /\bwhere can i listen\b/i,
      /\blisten links?\b/i,
      /\bofficial links?\b/i,
      /\bwebsite\b/i,
    ],
  },
  {
    topic: "show-status",
    patterns: [
      /\bon hiatus\b/i,
      /\bstatus\b/i,
      /\bfull review\b/i,
      /\bindexed(?: |-)?only\b/i,
      /\bimported\b/i,
      /\bplanned\b/i,
    ],
  },
  {
    topic: "show-summary",
    patterns: [
      /\bwhat is this show about\b/i,
      /\bwhat's this show about\b/i,
      /\bwhat is it about\b/i,
      /\btell me about\b/i,
      /\bsummary\b/i,
      /\bdescription\b/i,
    ],
  },
  {
    topic: "chat-help",
    patterns: [
      /\bchat\b.*\b(?:history|reset|cleared|forgot|lost|offline|not loading|broken|repeating|same answer|not working)\b/i,
      /\bwhy do you keep (?:repeating|saying the same thing)\b/i,
      /\bwhy (?:did|does) the chat\b/i,
    ],
  },
  {
    topic: "assistant-capabilities",
    patterns: [
      /\bwhat can you do\b/i,
      /\bhow does this work\b/i,
      /\bhelp\b/i,
      /\bhow can you help\b/i,
    ],
  },
  {
    topic: "archive-purpose",
    patterns: [
      /\bwhat is echo archives\b/i,
      /\bwhat is the echo archives\b/i,
      /\bwhat is this site\b/i,
      /\babout the archive\b/i,
      /\bwhy does this exist\b/i,
      /\bmission\b/i,
      /\bwhat is continental\b/i,
    ],
  },
];

function detectHelpTopic(message = "") {
  if (
    /\bhow many\b.*\bshows?\b/i.test(message) ||
    /\bhow many\b.*\bcollections?\b/i.test(message) ||
    /\bhow many\b.*\bfull reviews?\b/i.test(message) ||
    /\bhow many\b.*\bcreator verified\b/i.test(message) ||
    /\bhow big is (?:the )?archive\b/i.test(message) ||
    /\bhow large is (?:the )?archive\b/i.test(message)
  ) {
    return "archive-stats";
  }

  if (
    /\bcreator verified shows?\b/i.test(message) ||
    /\bwhich shows? (?:are|have been) creator verified\b/i.test(message) ||
    /\bwhat shows? are creator verified\b/i.test(message)
  ) {
    return "creator-verified-list";
  }

  if (
    /\bfull review shows?\b/i.test(message) ||
    /\bwhich shows? have full reviews?\b/i.test(message) ||
    /\bwhat shows? are fully reviewed\b/i.test(message) ||
    /\breviewed shows?\b/i.test(message)
  ) {
    return "full-review-list";
  }

  if (
    /\brecently added\b/i.test(message) ||
    /\bnew additions?\b/i.test(message) ||
    /\bnewly added\b/i.test(message) ||
    /\blatest additions?\b/i.test(message) ||
    /\bwhat'?s new in (?:the )?archive\b/i.test(message)
  ) {
    return "recently-added";
  }

  return HELP_TOPIC_PATTERNS.find((entry) => entry.patterns.some((pattern) => pattern.test(message)))?.topic || null;
}

function hasRecommendationSignal(message = "") {
  return RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(message));
}

function isClarificationRequest(message = "") {
  const trimmed = message.trim();
  return trimmed.length < 3 || GREETING_PATTERN.test(trimmed);
}

function normalizeMessageText(value = "") {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function getPreviousUserMessage(history = [], currentMessage = "") {
  const normalizedCurrent = normalizeMessageText(currentMessage);
  const userMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => entry && entry.role === "user" && typeof entry.content === "string")
    .map((entry) => entry.content.trim())
    .filter(Boolean);

  if (userMessages.length > 0 && normalizeMessageText(userMessages.at(-1)) === normalizedCurrent) {
    userMessages.pop();
  }

  return userMessages.at(-1) || "";
}

function looksLikeFollowUp(message = "") {
  const trimmed = message.trim();
  return trimmed.length > 0 && trimmed.length <= 140 && FOLLOW_UP_PATTERN.test(trimmed);
}

function buildIntentDetectionMessage(message = "", history = []) {
  if (!looksLikeFollowUp(message)) {
    return message;
  }

  const previousUserMessage = getPreviousUserMessage(history, message);
  return previousUserMessage ? `${previousUserMessage} ${message}` : message;
}

function classifyChatIntent({ message = "", page = {}, history = [] }) {
  if (isClarificationRequest(message)) {
    return {
      primary: "clarification",
      helpTopic: "assistant-capabilities",
      includeRecommendations: false,
    };
  }

  const detectionMessage = buildIntentDetectionMessage(message, history);
  const helpTopic = detectHelpTopic(detectionMessage);
  const includeRecommendations = hasRecommendationSignal(message) || helpTopic === "show-similar";
  const showDetailSignal =
    page.pageType === "show" &&
    (SHOW_DETAIL_TOPICS.has(helpTopic) || (!helpTopic && SHOW_DETAIL_PATTERN.test(detectionMessage)));

  if (showDetailSignal && includeRecommendations) {
    return {
      primary: "mixed",
      helpTopic: helpTopic || inferShowDetailTopic(message),
      includeRecommendations: true,
    };
  }

  if (showDetailSignal) {
    return {
      primary: "show-detail",
      helpTopic: helpTopic || inferShowDetailTopic(message),
      includeRecommendations: false,
    };
  }

  if (helpTopic && includeRecommendations) {
    return {
      primary: "mixed",
      helpTopic,
      includeRecommendations: true,
    };
  }

  if (helpTopic) {
    return {
      primary: "site-help",
      helpTopic,
      includeRecommendations: false,
    };
  }

  return {
    primary: "recommendation",
    helpTopic: null,
    includeRecommendations: false,
  };
}

function promoteIntentWithMatches({ intent, message = "", page = {}, matches = [] }) {
  if (intent.primary !== "recommendation" || matches.length === 0) {
    return intent;
  }

  const [topMatch] = matches;
  const looksLikeShowQuestion = SHOW_DETAIL_PATTERN.test(message);
  const isStrongTitleReference =
    Array.isArray(topMatch.reasons) &&
    topMatch.reasons.some((reason) => /direct title match|title starts with|title lines up/i.test(reason));

  if (!looksLikeShowQuestion || !isStrongTitleReference) {
    return intent;
  }

  return {
    primary: page.pageType === "show" && hasRecommendationSignal(message) ? "mixed" : "show-detail",
    helpTopic: detectHelpTopic(message) || inferShowDetailTopic(message),
    includeRecommendations: page.pageType === "show" && hasRecommendationSignal(message),
  };
}

function inferShowDetailTopic(message = "") {
  if (/\bwhere can i listen\b|\blisten links?\b|\bofficial links?\b|\bwebsite\b/i.test(message)) {
    return "show-links";
  }

  if (
    /\bcreator verified\b|\bcreator verification\b|\bverified creator\b|\bmetadata verified\b/i.test(message)
  ) {
    return "creator-verification";
  }

  if (/\barchive rating\b|\bcommunity rating\b|\bratings?\b|\bscores?\b|\btrust\b/i.test(message)) {
    return "ratings";
  }

  if (/\bhow long\b|\bruntime\b|\bepisodes?\b|\bseasons?\b|\bcommitment\b/i.test(message)) {
    return "show-runtime";
  }

  if (
    /\bwho made\b|\bwho created\b|\bwho wrote\b|\bcreator of\b|\bcreated by\b|\bwho(?:'s| is) behind\b|\bwho(?:'s| is) in\b|\bstarring\b|\bcast\b|\bvoice cast\b|\bproduction company\b|\bnetwork\b/i.test(message)
  ) {
    return "show-credits";
  }

  if (
    /\bfull cast\b|\bsingle narrator\b|\bsolo narrator\b|\bnarrator\b|\bformat\b|\banthology\b|\bserialized\b|\bpov\b|\bpoint of view\b|\bsource material\b/i.test(message)
  ) {
    return "show-format";
  }

  if (/\btranscripts?\b|\bcaptions?\b|\baccessible\b|\baccessibility\b/i.test(message)) {
    return "show-transcripts";
  }

  if (/\bcontent warnings?\b|\bcontent notes?\b|\btrigger warnings?\b/i.test(message)) {
    return "show-content-notes";
  }

  if (/\bsimilar to\b|\bwhat else is like\b|\bsimilar shows?\b|\bshows? like this\b/i.test(message)) {
    return "show-similar";
  }

  if (/\bin any collections?\b|\bcollection appearances?\b|\bpart of any collections?\b|\bwhat collections? .* in\b/i.test(message)) {
    return "show-collections";
  }

  if (/\bfinished\b|\bongoing\b|\bcompleted\b|\bon hiatus\b|\bstatus\b|\bfull review\b|\bindexed(?: |-)?only\b|\bimported\b|\bplanned\b/i.test(message)) {
    return "show-status";
  }

  return "show-summary";
}

module.exports = {
  classifyChatIntent,
  detectHelpTopic,
  hasRecommendationSignal,
  inferShowDetailTopic,
  isClarificationRequest,
  promoteIntentWithMatches,
};
