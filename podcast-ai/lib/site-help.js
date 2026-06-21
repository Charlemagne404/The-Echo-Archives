const { formatDate } = require("./site-help-format");

function loadSiteHelpContext({ catalog, collections, archiveContext }) {
  const publishedShows = catalog.filter((show) => show.status === "published");
  const fullReviewShows = publishedShows.filter((show) => show.reviewStatus === "full-review");
  const creatorVerifiedShows = publishedShows.filter((show) => Boolean(show.verification?.status));
  const finishedShows = publishedShows.filter((show) => show.completionStatus === "finished");
  const recentShows = [...publishedShows]
    .filter((show) => show.createdAt)
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
  const topRatedShows = [...publishedShows].sort((left, right) => {
    if ((right.finalRating || 0) !== (left.finalRating || 0)) {
      return (right.finalRating || 0) - (left.finalRating || 0);
    }

    return left.title.localeCompare(right.title);
  });
  const featuredCollections = [...collections].sort((left, right) => {
    if (Boolean(right.featured) !== Boolean(left.featured)) {
      return Number(Boolean(right.featured)) - Number(Boolean(left.featured));
    }

    return left.title.localeCompare(right.title);
  });

  return {
    counts: {
      shows: publishedShows.length,
      collections: collections.length,
      fullReviews: fullReviewShows.length,
      creatorVerifiedShows: creatorVerifiedShows.length,
      finishedShows: finishedShows.length,
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
    showsById: new Map(publishedShows.map((show) => [show.id, show])),
    archiveLists: {
      topRatedShows,
      recentShows,
      creatorVerifiedShows,
      fullReviewShows,
      featuredCollections,
    },
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
    message,
    topic: helpTopic,
    page,
    show,
    collection,
    collections,
    siteHelpContext,
  });

  return {
    answer: topicResponse.answer,
    actions: topicResponse.actions,
    suggestedPrompts: topicResponse.suggestedPrompts,
    recommendationIds: Array.isArray(topicResponse.recommendationIds) ? topicResponse.recommendationIds : [],
    source: "site-help",
  };
}

function buildTopicResponse({ message, topic, page, show, collection, collections, siteHelpContext }) {
  switch (topic) {
    case "show-summary":
      return buildShowSummaryResponse(show, siteHelpContext);
    case "show-status":
      return buildShowStatusResponse(show, siteHelpContext);
    case "show-links":
      return buildShowLinksResponse(show, siteHelpContext);
    case "show-runtime":
      return buildShowRuntimeResponse(show, siteHelpContext);
    case "show-credits":
      return buildShowCreditsResponse(show, siteHelpContext);
    case "show-format":
      return buildShowFormatResponse(show, siteHelpContext);
    case "show-transcripts":
      return buildShowTranscriptsResponse(show, siteHelpContext);
    case "show-content-notes":
      return buildShowContentNotesResponse(show, siteHelpContext);
    case "show-similar":
      return buildShowSimilarResponse(show, siteHelpContext);
    case "show-collections":
      return buildShowCollectionsResponse(show, collections, siteHelpContext);
    case "ratings":
      return buildRatingsResponse(show, siteHelpContext, message);
    case "creator-verification":
      return buildCreatorVerificationResponse(show, siteHelpContext);
    case "archive-stats":
      return buildArchiveStatsResponse(siteHelpContext);
    case "recently-added":
      return buildRecentlyAddedResponse(siteHelpContext);
    case "creator-verified-list":
      return buildCreatorVerifiedListResponse(siteHelpContext);
    case "full-review-list":
      return buildFullReviewListResponse(siteHelpContext);
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
          "I can help with archive recommendations, show summaries, creators, runtime, transcripts, collection appearances, ratings, creator verification, and site flows like corrections or submissions. Ask about a title, what the archive contains, or what to listen to next.",
        actions: [siteHelpContext.routes.collections, siteHelpContext.routes.submit, siteHelpContext.routes.about],
        suggestedPrompts: [
          "Who made Midnight Burger?",
          "How long is Impact Winter?",
          "Which shows are creator verified?",
          "Recommend a finished show with strong worldbuilding",
        ],
      };
  }
}

function buildCollectionsResponse(collection, siteHelpContext) {
  if (collection) {
    return {
      answer: `${collection.title} is a curated listening path, not a generic genre folder. This route currently carries ${collection.showIds.length} archive picks and is meant to move you by mood, tone, or intent rather than taxonomy alone.`,
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

  const featuredTitles = siteHelpContext.archiveLists.featuredCollections.slice(0, 4).map((entry) => entry.title);

  return {
    answer: `Collections are curated listening paths built around mood, tone, or intent rather than generic taxonomy. Right now the archive highlights ${joinReadableList(featuredTitles)}${featuredTitles.length > 0 ? ", alongside a few quieter routes deeper in the collections page." : "."}`,
    actions: [siteHelpContext.routes.collections, siteHelpContext.routes.browse],
    suggestedPrompts: [
      "How do the archive filters work?",
      "Recommend a finished show",
      "What does creator verified mean?",
      "How do I submit a correction?",
    ],
  };
}

function buildRatingsResponse(show, siteHelpContext, message = "") {
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

  if (/\btop rated\b|\bhighest rated\b|\bbest rated\b/i.test(message)) {
    const topRatedTitles = siteHelpContext.archiveLists.topRatedShows.slice(0, 4).map((entry) => entry.title);

    return {
      answer: `Some of the strongest Archive Rating picks right now are ${joinReadableList(topRatedTitles)}. Community rating remains separate from that editorial score, and creator verification does not change either one.`,
      actions: [siteHelpContext.routes.browse, { label: "Read About Ratings", href: "/about.html", external: false }],
      suggestedPrompts: [
        "Which shows are creator verified?",
        "What collections do you have?",
        "Recommend a finished horror show",
        "How are community ratings different?",
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
        "I do not have that title cleanly matched in the archive. I can explain show details when the title is already indexed, or you can use Submit to suggest a missing show or correction.",
      actions: [siteHelpContext.routes.browse, siteHelpContext.routes.collections],
      suggestedPrompts: [
        "Recommend a finished sci-fi show",
        "What does creator verified mean?",
        "How do I submit a correction?",
        "Where can I browse collections?",
      ],
    };
  }

  const pieces = [];
  const subtitle = String(show.subtitle || "").trim();
  const description = String(show.description || "").trim();
  const setting = String(show.content?.setting || "").trim();
  const formatLabel =
    Array.isArray(show.formats) && show.formats.length > 0
      ? show.formats
          .slice(0, 2)
          .map((entry) => entry.replace(/-/g, " "))
      : [];
  const genreLabel = Array.isArray(show.genres) && show.genres.length > 0 ? show.genres.slice(0, 2) : [];
  const toneLabel = Array.isArray(show.tones) && show.tones.length > 0 ? show.tones.slice(0, 2) : [];

  if (subtitle && subtitle !== description) {
    pieces.push(subtitle.endsWith(".") ? subtitle : `${subtitle}.`);
  }

  if (description) {
    pieces.push(description.endsWith(".") ? description : `${description}.`);
  }

  if (setting) {
    pieces.push(`The archive setting note is ${setting}.`);
  }

  if (formatLabel.length > 0 || genreLabel.length > 0 || toneLabel.length > 0) {
    pieces.push(
      `It is tagged ${joinReadableList(formatLabel.concat(genreLabel))}${
        toneLabel.length > 0 ? `, with a ${joinReadableList(toneLabel)} tone` : ""
      }.`,
    );
  }

  if (show.archiveTake) {
    pieces.push(show.archiveTake.endsWith(".") ? show.archiveTake : `${show.archiveTake}.`);
  }

  return {
    answer: `${show.title}: ${pieces.join(" ") || "The archive has only limited summary metadata for this entry right now."}`.trim(),
    actions: [{ label: "Open Show", href: show.href, external: false }],
    suggestedPrompts: [
      "How long is this show?",
      "Who made this show?",
      "Does this show have transcripts?",
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
      "How long is this show?",
      "Where can I listen to this show?",
      "What is this show similar to?",
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

function buildShowRuntimeResponse(show, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "I can answer runtime and commitment questions when the title is already in the archive. Ask about a specific show and I can pull episode count, season count, or the current archive length note.",
      actions: [siteHelpContext.routes.browse],
      suggestedPrompts: [
        "How long is Impact Winter?",
        "How many episodes does Wolf 359 have?",
        "Recommend an easier entry point",
        "What collections do you have?",
      ],
    };
  }

  const lengthSummary = buildLengthSummary(show.length);
  const runtimeSentence = /[.!?]$/.test(lengthSummary) ? lengthSummary : `${lengthSummary}.`;

  return {
    answer: `${show.title} currently shows ${runtimeSentence}`,
    actions: [{ label: "Open Show", href: show.href, external: false }],
    suggestedPrompts: [
      "Who made this show?",
      "Does this show have transcripts?",
      "What is this show similar to?",
      "Recommend something like this",
    ],
  };
}

function buildShowCreditsResponse(show, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "I can answer creator and cast questions when the title is already in the archive. Ask about a specific show and I can pull the listed creators, network, production company, or cast when those fields are verified.",
      actions: [siteHelpContext.routes.browse],
      suggestedPrompts: [
        "Who made Midnight Burger?",
        "Who is in Impact Winter?",
        "How long is Derelict?",
        "Which shows are creator verified?",
      ],
    };
  }

  const creators = show.creators.slice(0, 3);
  const cast = show.cast.slice(0, 4);
  const pieces = [];

  if (creators.length > 0) {
    pieces.push(`The listed creators are ${joinReadableList(creators)}.`);
  }

  const networkOrCompany = [show.credits?.productionCompany, show.credits?.network].filter(Boolean);
  if (networkOrCompany.length > 0) {
    pieces.push(`The credited production context here is ${joinReadableList(networkOrCompany)}.`);
  }

  if (cast.length > 0) {
    pieces.push(`Listed cast includes ${joinReadableList(cast)}.`);
  }

  if (pieces.length === 0) {
    pieces.push("The archive does not currently expose clean creator or cast credits for this entry.");
  }

  return {
    answer: `${show.title}: ${pieces.join(" ")}`.trim(),
    actions: [{ label: "Open Show", href: show.href, external: false }],
    suggestedPrompts: [
      "How long is this show?",
      "Does this show have transcripts?",
      "What collections is this in?",
      "What is this show similar to?",
    ],
  };
}

function buildShowFormatResponse(show, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "I can answer format questions when the title is already in the archive. Ask about a specific show and I can pull tags like full-cast, narrator setup, POV, or source-material notes when they exist.",
      actions: [siteHelpContext.routes.browse],
      suggestedPrompts: [
        "Is Midnight Burger full cast?",
        "Does this show have a narrator?",
        "Recommend a full-cast sci-fi show",
        "What collections do you have?",
      ],
    };
  }

  const pieces = [];

  if (show.formats.length > 0) {
    pieces.push(`It is tagged as ${joinReadableList(show.formats.map((entry) => entry.replace(/-/g, " ")).slice(0, 3))}.`);
  }

  if (show.facts?.narrator && !/^unknown\.?$/i.test(show.facts.narrator)) {
    pieces.push(`Narrator setup: ${show.facts.narrator}`);
  }

  if (show.content?.pov) {
    pieces.push(`POV: ${show.content.pov}.`);
  }

  if (show.content?.sourceMaterial) {
    pieces.push(`Source material: ${show.content.sourceMaterial}.`);
  }

  if (show.tones.length > 0) {
    pieces.push(`The tone leans ${joinReadableList(show.tones.slice(0, 2))}.`);
  }

  return {
    answer: `${show.title}: ${pieces.join(" ") || "The archive has only limited format notes for this entry right now."}`.trim(),
    actions: [{ label: "Open Show", href: show.href, external: false }],
    suggestedPrompts: [
      "How long is this show?",
      "Does this show have transcripts?",
      "What content notes does this show have?",
      "Recommend something like this",
    ],
  };
}

function buildShowTranscriptsResponse(show, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "I can answer transcript and accessibility questions when the title is already in the archive. Ask about a specific show and I can pull the transcript note or caption status when that metadata exists.",
      actions: [siteHelpContext.routes.browse],
      suggestedPrompts: [
        "Does Derelict have transcripts?",
        "Which shows are creator verified?",
        "How long is Impact Winter?",
        "Recommend a show with transcripts",
      ],
    };
  }

  const transcriptNote = show.availability?.transcripts || "Transcript availability is not currently verified for this entry.";
  const languageNote =
    show.transcriptLanguages.length > 0 ? ` Transcript language notes: ${joinReadableList(show.transcriptLanguages)}.` : "";
  const transcriptSentence = /[.!?]$/.test(transcriptNote) ? transcriptNote : `${transcriptNote}.`;

  return {
    answer: `${show.title}: ${transcriptSentence}${languageNote}`.trim(),
    actions: [{ label: "Open Show", href: show.href, external: false }],
    suggestedPrompts: [
      "Who made this show?",
      "How long is this show?",
      "What content notes does this show have?",
      "Recommend something like this",
    ],
  };
}

function buildShowContentNotesResponse(show, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "I can answer content-note questions when the title is already in the archive. Ask about a specific show and I can pull the recorded content notes when they exist, or tell you when the archive has not filled them yet.",
      actions: [siteHelpContext.routes.browse],
      suggestedPrompts: [
        "What content notes does The White Vault have?",
        "Does this show have transcripts?",
        "Recommend a finished horror show",
        "What collections do you have?",
      ],
    };
  }

  if (show.contentNotes.length === 0) {
    return {
      answer: `${show.title} does not currently have specific content notes recorded in the archive.`,
      actions: [{ label: "Open Show", href: show.href, external: false }],
      suggestedPrompts: [
        "Does this show have transcripts?",
        "What is this show similar to?",
        "How long is this show?",
        "Recommend something like this",
      ],
    };
  }

  return {
    answer: `${show.title} currently carries content notes for ${joinReadableList(show.contentNotes)}.`,
    actions: [{ label: "Open Show", href: show.href, external: false }],
    suggestedPrompts: [
      "Does this show have transcripts?",
      "How long is this show?",
      "What collections is this in?",
      "Recommend something like this",
    ],
  };
}

function buildShowSimilarResponse(show, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "I can answer similarity questions when the title is already in the archive. Ask about a specific show and I can surface its nearest archive neighbors when those relationships are mapped.",
      actions: [siteHelpContext.routes.browse, siteHelpContext.routes.collections],
      suggestedPrompts: [
        "What is Midnight Burger similar to?",
        "Recommend something like Derelict",
        "What collections is this in?",
        "Which shows are creator verified?",
      ],
    };
  }

  if (!Array.isArray(show.similarTo) || show.similarTo.length === 0) {
    return {
      answer: `${show.title} does not currently have explicit similar-show links mapped in the archive yet.`,
      actions: [{ label: "Open Show", href: show.href, external: false }],
      suggestedPrompts: [
        "Recommend something like this",
        "What collections is this in?",
        "How long is this show?",
        "Who made this show?",
      ],
    };
  }

  const relatedShows = show.similarTo
    .map((showId) => siteHelpContext.showsById.get(showId))
    .filter(Boolean);
  const relatedTitles = relatedShows.length > 0 ? relatedShows.map((entry) => entry.title) : show.similarTo.map(formatShowIdForDisplay);

  return {
    answer: `${show.title} is currently linked to ${joinReadableList(relatedTitles.slice(0, 4))} as its nearest archive neighbors.`,
    actions: [{ label: "Open Show", href: show.href, external: false }],
    recommendationIds: show.similarTo.slice(0, 3),
    suggestedPrompts: [
      "Recommend something like this",
      "What collections is this in?",
      "How long is this show?",
      "Does this show have transcripts?",
    ],
  };
}

function buildShowCollectionsResponse(show, collections, siteHelpContext) {
  if (!show) {
    return {
      answer:
        "I can answer collection-membership questions when the title is already in the archive. Ask about a specific show and I can tell you whether it appears in any curated listening paths.",
      actions: [siteHelpContext.routes.collections, siteHelpContext.routes.browse],
      suggestedPrompts: [
        "What collections is Midnight Burger in?",
        "What collections do you have?",
        "Recommend something like this",
        "How long is this show?",
      ],
    };
  }

  const memberships = (Array.isArray(collections) ? collections : []).filter((entry) => entry.showIds.includes(show.id));

  if (memberships.length === 0) {
    return {
      answer: `${show.title} is not currently placed in a named archive collection.`,
      actions: [{ label: "Open Show", href: show.href, external: false }, siteHelpContext.routes.collections],
      suggestedPrompts: [
        "What is this show similar to?",
        "Recommend something like this",
        "What collections do you have?",
        "How long is this show?",
      ],
    };
  }

  return {
    answer: `${show.title} currently appears in ${joinReadableList(memberships.map((entry) => entry.title).slice(0, 4))}.`,
    actions: [
      { label: "Open Show", href: show.href, external: false },
      { label: "Browse Collections", href: "/collections.html", external: false },
    ],
    suggestedPrompts: [
      "What is this show similar to?",
      "Recommend something like this",
      "How long is this show?",
      "Does this show have transcripts?",
    ],
  };
}

function buildArchiveStatsResponse(siteHelpContext) {
  return {
    answer: `The archive currently tracks ${siteHelpContext.counts.shows} published shows, ${siteHelpContext.counts.collections} curated collections, ${siteHelpContext.counts.fullReviews} full reviews, and ${siteHelpContext.counts.creatorVerifiedShows} creator-verified entries.`,
    actions: [siteHelpContext.routes.browse, siteHelpContext.routes.collections, siteHelpContext.routes.about],
    suggestedPrompts: [
      "What collections do you have?",
      "Which shows are creator verified?",
      "What are the recently added shows?",
      "Recommend a finished show",
    ],
  };
}

function buildRecentlyAddedResponse(siteHelpContext) {
  const recentShows = siteHelpContext.archiveLists.recentShows.slice(0, 4);

  if (recentShows.length === 0) {
    return {
      answer: "The archive does not currently have enough created-at metadata filled to summarize recent additions cleanly.",
      actions: [siteHelpContext.routes.browse],
      suggestedPrompts: [
        "What collections do you have?",
        "Which shows are creator verified?",
        "How many shows are in the archive?",
        "Recommend a finished show",
      ],
    };
  }

  return {
    answer: `The most recently added archive entries are ${joinReadableList(recentShows.map((entry) => entry.title))}.`,
    actions: [siteHelpContext.routes.browse],
    suggestedPrompts: [
      "Which shows are creator verified?",
      "What collections do you have?",
      "Recommend a finished show",
      "How are community ratings different?",
    ],
  };
}

function buildCreatorVerifiedListResponse(siteHelpContext) {
  const verifiedShows = siteHelpContext.archiveLists.creatorVerifiedShows.slice(0, 4);

  if (verifiedShows.length === 0) {
    return {
      answer: "No archive entries are currently marked creator verified.",
      actions: [siteHelpContext.routes.submit, siteHelpContext.routes.terms],
      suggestedPrompts: [
        "What does creator verified mean?",
        "How do creator verification requests work?",
        "How many shows are in the archive?",
        "What collections do you have?",
      ],
    };
  }

  return {
    answer: `The archive currently marks ${joinReadableList(verifiedShows.map((entry) => entry.title))} as creator verified.`,
    actions: [siteHelpContext.routes.submit, siteHelpContext.routes.terms],
    suggestedPrompts: [
      "What does creator verified mean?",
      "How do creator verification requests work?",
      "What are the recently added shows?",
      "Recommend something like one of those shows",
    ],
  };
}

function buildFullReviewListResponse(siteHelpContext) {
  const fullReviewShows = siteHelpContext.archiveLists.fullReviewShows.slice(0, 4);

  if (fullReviewShows.length === 0) {
    return {
      answer: "The archive does not currently have any entries marked as full-review.",
      actions: [siteHelpContext.routes.browse],
      suggestedPrompts: [
        "How many shows are in the archive?",
        "Which shows are creator verified?",
        "What collections do you have?",
        "Recommend a finished show",
      ],
    };
  }

  return {
    answer: `Current full-review entries include ${joinReadableList(fullReviewShows.map((entry) => entry.title))}.`,
    actions: [siteHelpContext.routes.browse],
    suggestedPrompts: [
      "What are the top rated shows?",
      "Which shows are creator verified?",
      "What collections do you have?",
      "Recommend something with a full review",
    ],
  };
}

function buildLengthSummary(length = {}) {
  const parts = [];

  if (Number.isFinite(Number(length.episodes)) && Number(length.episodes) > 0) {
    parts.push(`${length.episodes} episode${Number(length.episodes) === 1 ? "" : "s"}`);
  }

  if (Number.isFinite(Number(length.seasons)) && Number(length.seasons) > 0) {
    parts.push(`${length.seasons} season${Number(length.seasons) === 1 ? "" : "s"}`);
  }

  if (Number.isFinite(Number(length.avgEpisodeMinutes)) && Number(length.avgEpisodeMinutes) > 0) {
    parts.push(`about ${length.avgEpisodeMinutes} minutes per episode`);
  }

  if (Number.isFinite(Number(length.totalHours)) && Number(length.totalHours) > 0) {
    parts.push(`roughly ${length.totalHours} total hours`);
  }

  if (parts.length === 0 && typeof length.label === "string" && length.label.trim()) {
    return length.label.trim();
  }

  if (parts.length === 0) {
    return "limited runtime metadata in the archive right now";
  }

  const structured = joinReadableList(parts);
  if (typeof length.label === "string" && length.label.trim()) {
    return `${structured}. Archive note: ${length.label.trim()}`;
  }

  return structured;
}

function formatShowIdForDisplay(value = "") {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
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
