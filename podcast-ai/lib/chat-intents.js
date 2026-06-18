const GREETING_PATTERN = /^(hi|hello|hey|yo|sup|howdy)$/i;

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
  /\b(this show|this page|archive rating|community rating|creator verified|full review|indexed(?: |-)?only|planned|finished|ongoing|status|where can i listen|listen links|official links|what is this show about|what's this show about|what is it about)\b/i;

const SHOW_DETAIL_TOPICS = new Set(["ratings", "creator-verification", "show-links", "show-status", "show-summary"]);

const HELP_TOPIC_PATTERNS = [
  {
    topic: "external-platform",
    patterns: [
      /\b(?:spotify|apple podcasts?|pocket casts?|overcast|youtube music|podbean)\b.*\b(?:not working|not playing|won't play|cannot play|can't play|broken|issue|problem|error)\b/i,
      /\b(?:episode|feed|player|app)\b.*\b(?:not working|not playing|won't play|cannot play|can't play|broken|issue|problem|error)\b/i,
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
      /\bwrong link\b/i,
      /\bbroken link\b/i,
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
      /\bbrowse\b/i,
      /\bfilters?\b/i,
      /\bsearch\b/i,
      /\bhow do i find\b/i,
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
  return HELP_TOPIC_PATTERNS.find((entry) => entry.patterns.some((pattern) => pattern.test(message)))?.topic || null;
}

function hasRecommendationSignal(message = "") {
  return RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(message));
}

function isClarificationRequest(message = "") {
  const trimmed = message.trim();
  return trimmed.length < 3 || GREETING_PATTERN.test(trimmed);
}

function classifyChatIntent({ message = "", page = {} }) {
  if (isClarificationRequest(message)) {
    return {
      primary: "clarification",
      helpTopic: "assistant-capabilities",
      includeRecommendations: false,
    };
  }

  const helpTopic = detectHelpTopic(message);
  const includeRecommendations = hasRecommendationSignal(message);
  const showDetailSignal =
    page.pageType === "show" && (SHOW_DETAIL_PATTERN.test(message) || SHOW_DETAIL_TOPICS.has(helpTopic));

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

  if (/\bfinished\b|\bongoing\b|\bcompleted\b|\bon hiatus\b|\bstatus\b|\bfull review\b|\bindexed(?: |-)?only\b|\bplanned\b/i.test(message)) {
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
