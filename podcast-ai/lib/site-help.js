const { formatDate } = require("./site-help-format");

function loadSiteHelpContext({ catalog, collections, archiveContext }) {
  const fullReviewCount = catalog.filter((show) => show.reviewStatus === "full-review").length;

  return {
    counts: {
      shows: catalog.length,
      collections: collections.length,
      fullReviews: fullReviewCount,
    },
    routes: {
      browse: { label: "Browse Archive", href: "/index.html#archive", external: false },
      collections: { label: "Browse Collections", href: "/collections.html", external: false },
      about: { label: "Read About", href: "/about.html", external: false },
      creators: { label: "Open For Creators", href: "/for-creators.html", external: false },
      submit: { label: "Open Submit", href: "/submit.html", external: false },
      privacy: { label: "Read Privacy", href: "/privacy.html", external: false },
      terms: { label: "Read Terms", href: "/terms.html", external: false },
      supporters: { label: "Support Archive", href: "/supporters.html", external: false },
      contact: { label: "Contact Continental", href: "https://contact.continental-hub.com/", external: true },
    },
    featureAvailability: archiveContext?.featureAvailability || {},
    submitModes: {
      show: "Submit a new show that belongs in the archive.",
      correction: "Report a factual metadata issue or broken link on an existing archive entry.",
      "listener-review": "Share a moderated listener review for an existing entry.",
      "creator-verification": "Confirm factual metadata with official creator or representative proof.",
    },
  };
}

function buildSiteHelpResponse({
  message,
  helpTopic,
  page,
  catalog,
  collections,
  siteHelpContext,
  matches = [],
  includeRecommendations = false,
}) {
  const show = resolveRelevantShow({ page, catalog, matches, message });
  const collection = resolveRelevantCollection({ page, collections });
  const topicResponse = buildTopicResponse({
    topic: helpTopic,
    page,
    show,
    collection,
    siteHelpContext,
  });

  return {
    answer: topicResponse.answer,
    actions: topicResponse.actions,
    suggestedPrompts: topicResponse.suggestedPrompts,
    source: "site-help",
  };
}

function buildTopicResponse({ topic, page, show, collection, siteHelpContext }) {
  switch (topic) {
    case "show-summary":
      return buildShowSummaryResponse(show, siteHelpContext);
    case "show-status":
      return buildShowStatusResponse(show, siteHelpContext);
    case "show-links":
      return buildShowLinksResponse(show, siteHelpContext);
    case "ratings":
      return buildRatingsResponse(show, siteHelpContext);
    case "creator-verification":
      return buildCreatorVerificationResponse(show, siteHelpContext);
    case "submission":
      return {
        answer:
          "The submit page has four paths: new show, correction, listener review, and creator verification. Nothing auto-publishes, and every submission is manually reviewed before it affects the archive.",
        actions: [siteHelpContext.routes.submit],
        suggestedPrompts: [
          "How do I submit a correction?",
          "How do listener reviews work?",
          "What does creator verified mean?",
          "Where can I contact the archive?",
        ],
      };
    case "correction":
      return {
        answer:
          "Use Submit, choose the correction path, pick the archive entry, describe the factual issue, and add verifiable sources when you can. Corrections are for metadata and links, not editorial disagreement, and nothing auto-publishes.",
        actions: [siteHelpContext.routes.submit],
        suggestedPrompts: [
          "What counts as a correction?",
          "How do creator verification requests work?",
          "Where do I submit a listener review?",
          "What does the archive store?",
        ],
      };
    case "listener-review":
      return {
        answer:
          "Use Submit, choose the listener review path, select the show, add your rating, spoiler level, and review text, and send it for moderation. Listener reviews can inform community context, but Archive Rating stays editorially independent.",
        actions: [siteHelpContext.routes.submit],
        suggestedPrompts: [
          "How are community ratings different?",
          "How do I submit a correction?",
          "What does creator verified mean?",
          "Where can I browse collections?",
        ],
      };
    case "privacy":
      return {
        answer:
          "The chat panel stores recent conversation history in session storage for the current browser session, and anonymous community ratings keep a local profile id in your browser. Submission and rating requests can send the request body plus limited IP and user-agent data for moderation, abuse prevention, and rate limiting.",
        actions: [siteHelpContext.routes.privacy],
        suggestedPrompts: [
          "Does the site use cookies?",
          "What does the site store in my browser?",
          "How do submissions work?",
          "What are the site rules?",
        ],
      };
    case "terms":
      return {
        answer:
          "You can browse the archive and use the discovery and submission tools, but the site is not an open publishing platform. Ratings, archive notes, and collection placement stay editorial, and creator verification only confirms factual metadata.",
        actions: [siteHelpContext.routes.terms],
        suggestedPrompts: [
          "What does creator verified mean?",
          "How do corrections work?",
          "How does the archive handle privacy?",
          "How can I contact the archive?",
        ],
      };
    case "support":
      return {
        answer:
          "The Echo Archives is meant to stay free, ad-free, and listener-supported. The support page explains what support pays for, and Patreon is the current public support path.",
        actions: [siteHelpContext.routes.supporters],
        suggestedPrompts: [
          "How do I contact the archive?",
          "What is The Echo Archives?",
          "How are ratings handled here?",
          "Where can I browse collections?",
        ],
      };
    case "contact":
      return {
        answer:
          "The public contact route sends you to Continental's contact page. If you need help with a submission, correction, or verification request, that is still the right place to reach out directly.",
        actions: [siteHelpContext.routes.contact, siteHelpContext.routes.submit],
        suggestedPrompts: [
          "How do I submit a correction?",
          "How do creator verification requests work?",
          "What does the site store?",
          "Where can I support the archive?",
        ],
      };
    case "collections":
      return buildCollectionsResponse(collection, siteHelpContext);
    case "archive-purpose":
      return {
        answer: `The Echo Archives is a listener-first discovery archive for audio dramas and fiction podcasts. It is built to help you decide what to hear next by mood, tone, format, completion status, and listening context instead of charts or sponsor pressure.`,
        actions: [siteHelpContext.routes.about, siteHelpContext.routes.browse],
        suggestedPrompts: [
          "How are community ratings different?",
          "Where can I browse collections?",
          "How do I submit a correction?",
          "Recommend a finished show with strong worldbuilding",
        ],
      };
    case "external-platform":
      return {
        answer:
          "I can help with Echo Archives pages, archive metadata, and site flows, but I cannot diagnose Spotify, Apple Podcasts, or other player issues from here. For playback or account problems, use the platform's support or the show's official links.",
        actions: show ? [{ label: "Open Show", href: show.href, external: false }] : [siteHelpContext.routes.contact],
        suggestedPrompts: [
          "Where can I submit a broken link correction?",
          "What official links does this show have?",
          "How does creator verification work?",
          "Where can I browse collections?",
        ],
      };
    case "assistant-capabilities":
    default:
      if (page.pageType === "creators") {
        return {
          answer:
            "This creators page covers submission paths, correction and verification flows, archive standards, and what remains editorially independent. Ask if you want the right intake path or what creator verification does and does not change.",
          actions: [siteHelpContext.routes.submit, siteHelpContext.routes.creators, siteHelpContext.routes.terms],
          suggestedPrompts: [
            "How do creator verification requests work?",
            "What stays editorially independent?",
            "How do I submit a correction?",
            "Do I need verification to be listed?",
          ],
        };
      }

      return {
        answer:
          "I can help you browse the archive, explain ratings and creator verification, point you to collections or submission paths, and recommend shows from the catalog. Ask about a title, how the site works, privacy, corrections, or what to listen to next.",
        actions: [siteHelpContext.routes.collections, siteHelpContext.routes.submit, siteHelpContext.routes.about],
        suggestedPrompts: [
          "How do I submit a correction?",
          "What does creator verified mean?",
          "How are community ratings different?",
          "Recommend a finished show with strong worldbuilding",
        ],
      };
  }
}

function buildCollectionsResponse(collection, siteHelpContext) {
  if (collection) {
    return {
      answer: `${collection.title} is a curated listening path, not a generic genre folder. Collections are meant to route you by mood, tone, or intent, and the main browse page adds search and stacked filters when you want to get more specific.`,
      actions: [
        { label: "Open Collection", href: `/collection.html?id=${encodeURIComponent(collection.id)}`, external: false },
        siteHelpContext.routes.collections,
      ],
      suggestedPrompts: [
        "Show me another collection route",
        "How do the archive filters work?",
        "Recommend something like this collection",
        "What does creator verified mean?",
      ],
    };
  }

  return {
    answer:
      "Collections are curated listening paths built around mood, tone, or intent rather than generic taxonomy. Use collections when you want a strong route like long walks, completed shows, or a specific flavor of sci-fi or horror.",
    actions: [siteHelpContext.routes.collections, siteHelpContext.routes.browse],
    suggestedPrompts: [
      "How do the archive filters work?",
      "Recommend a finished show",
      "What does creator verified mean?",
      "How do I submit a correction?",
    ],
  };
}

function buildRatingsResponse(show, siteHelpContext) {
  if (show) {
    return {
      answer: `${show.title} currently has an Archive Rating of ${formatNumber(show.finalRating || show.ratings?.archive)}/10. Community rating is separate from that editorial score, and creator verification never means creator approval of the rating or review.`,
      actions: [{ label: "Read About Ratings", href: "/about.html", external: false }],
      suggestedPrompts: [
        "What does creator verified mean?",
        "Is this show finished?",
        "Why is this show indexed only?",
        "Recommend something like this",
      ],
    };
  }

  return {
    answer:
      "Archive Rating is the editorial score from Echo Archives. Community rating reflects listener response separately, and creator verification only means factual metadata was checked, not that the creator approved the rating or curation.",
    actions: [{ label: "Read About Ratings", href: "/about.html", external: false }, siteHelpContext.routes.terms],
    suggestedPrompts: [
      "What does creator verified mean?",
      "How do listener reviews work?",
      "How do I submit a correction?",
      "Recommend a top rated horror show",
    ],
  };
}

function buildCreatorVerificationResponse(show, siteHelpContext) {
  if (show) {
    const verifiedAt = show.verification?.verifiedAt ? ` as of ${formatDate(show.verification.verifiedAt)}` : "";
    if (show.verification?.status) {
      return {
        answer: `${show.title} is marked creator verified in the archive${verifiedAt}. That only confirms factual metadata and does not imply creator approval of Archive Rating, community feedback, or collection placement.`,
        actions: [siteHelpContext.routes.submit, siteHelpContext.routes.terms],
        suggestedPrompts: [
          "How do creator verification requests work?",
          "How are community ratings different?",
          "Where can I submit a correction?",
          "What official links does this show have?",
        ],
      };
    }

    return {
      answer: `${show.title} is not currently marked creator verified. When a show is verified here, it only confirms factual metadata and still does not affect Archive Rating, reviews, or recommendations.`,
      actions: [siteHelpContext.routes.submit, siteHelpContext.routes.terms],
      suggestedPrompts: [
        "How do creator verification requests work?",
        "How do I submit a correction?",
        "How are community ratings different?",
        "Recommend something like this",
      ],
    };
  }

  return {
    answer:
      "Creator verification is a metadata trust signal. It only means the archive has checked factual show details against an official source or representative, and it does not imply creator approval of ratings, reviews, or curation.",
    actions: [siteHelpContext.routes.submit, siteHelpContext.routes.terms],
    suggestedPrompts: [
      "How do creator verification requests work?",
      "How are community ratings different?",
      "How do I submit a correction?",
      "Where can I browse collections?",
    ],
  };
}

function buildShowSummaryResponse(show, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "I can explain show details when the title is in the archive or when you're on a show page. Try asking about a specific title, a status, creator verification, or where the page routes you next.",
      actions: [siteHelpContext.routes.browse, siteHelpContext.routes.collections],
      suggestedPrompts: [
        "Recommend a finished sci-fi show",
        "What does creator verified mean?",
        "How do I submit a correction?",
        "Where can I browse collections?",
      ],
    };
  }

  return {
    answer: `${show.title}: ${show.description} ${show.archiveTake ? show.archiveTake : ""}`.trim(),
    actions: [{ label: "Open Show", href: show.href, external: false }],
    suggestedPrompts: [
      "Is this show finished?",
      "What does creator verified mean here?",
      "Where can I listen to this show?",
      "Recommend something like this",
    ],
  };
}

function buildShowStatusResponse(show, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "I can answer show status questions when the title is already in the archive. Ask about a specific title or open a show page and I can explain whether it is ongoing, finished, or still waiting on a full review.",
      actions: [siteHelpContext.routes.browse],
      suggestedPrompts: [
        "Recommend a finished show",
        "What does indexed only mean?",
        "How do I submit a correction?",
        "Where can I browse collections?",
      ],
    };
  }

  return {
    answer: `${show.title} is ${toReadableCompletionStatus(show.completionStatus)} and its archive entry is ${toReadableReviewStatus(show.reviewStatus)}. ${show.releaseStatus ? `The release status is ${show.releaseStatus}.` : ""}`.trim(),
    actions: [{ label: "Open Show", href: show.href, external: false }],
    suggestedPrompts: [
      "What does creator verified mean here?",
      "Where can I listen to this show?",
      "Recommend something like this",
      "How are community ratings different?",
    ],
  };
}

function buildShowLinksResponse(show, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "Show pages separate official links from listening links so the archive stays clear about what it controls. Ask about a specific title or open a show page and I can point you to the available destinations.",
      actions: [siteHelpContext.routes.browse],
      suggestedPrompts: [
        "How do I submit a broken link correction?",
        "What does creator verified mean?",
        "Recommend a show with a full review",
        "Where can I browse collections?",
      ],
    };
  }

  const listenTargets = Object.keys(show.listenLinks || {}).filter((key) => show.listenLinks[key]);
  const officialTargets = Object.keys(show.officialLinks || {}).filter((key) => show.officialLinks[key]);
  const pieces = [];

  if (listenTargets.length > 0) {
    pieces.push(`Listening links on this page include ${joinReadableList(listenTargets)}.`);
  }

  if (officialTargets.length > 0) {
    pieces.push(`Official links include ${joinReadableList(officialTargets)}.`);
  }

  if (pieces.length === 0) {
    pieces.push("This page does not currently expose verified listen or official links.");
  }

  return {
    answer: `${show.title} keeps official links separate from listening links. ${pieces.join(" ")}`.trim(),
    actions: [{ label: "Open Show", href: show.href, external: false }, siteHelpContext.routes.submit],
    suggestedPrompts: [
      "How do I submit a broken link correction?",
      "Is this show finished?",
      "What does creator verified mean here?",
      "Recommend something like this",
    ],
  };
}

function resolveRelevantShow({ page, catalog, matches, message }) {
  if (page.showId) {
    return catalog.find((entry) => entry.id === page.showId) || null;
  }

  const [topMatch] = matches;
  if (!topMatch) {
    return null;
  }

  const hasStrongTitleReference =
    Array.isArray(topMatch.reasons) &&
    topMatch.reasons.some((reason) => /direct title match|title starts with|title lines up/i.test(reason));
  const normalizedMessage = normalizeText(message);
  const normalizedTitle = normalizeText(topMatch.title);

  return hasStrongTitleReference || (normalizedTitle && normalizedMessage.includes(normalizedTitle)) ? topMatch : null;
}

function resolveRelevantCollection({ page, collections }) {
  if (!page.collectionId) {
    return null;
  }

  return collections.find((entry) => entry.id === page.collectionId) || null;
}

function toReadableCompletionStatus(value = "") {
  switch (value) {
    case "finished":
      return "finished";
    case "ongoing":
      return "ongoing";
    case "cancelled":
      return "cancelled";
    case "unclear":
      return "still unclear";
    default:
      return value || "status-unclear";
  }
}

function toReadableReviewStatus(value = "") {
  switch (value) {
    case "full-review":
      return "a full-review entry";
    case "spotlight":
      return "a spotlight entry";
    case "indexed-only":
      return "an indexed-only entry";
    case "planned":
      return "a planned review entry";
    default:
      return "an archive entry";
  }
}

function joinReadableList(values) {
  const normalized = values.map((value) => String(value).replace(/[-_]+/g, " "));

  if (normalized.length <= 1) {
    return normalized[0] || "no current targets";
  }

  if (normalized.length === 2) {
    return `${normalized[0]} and ${normalized[1]}`;
  }

  return `${normalized.slice(0, -1).join(", ")}, and ${normalized.at(-1)}`;
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_./]+/g, " ")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  buildSiteHelpResponse,
  loadSiteHelpContext,
};
