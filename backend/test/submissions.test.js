const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const { createSubmissionStore } = require("../lib/store/submission-store");
const { createSubmissionService } = require("../lib/services/submission-service");

function createTempSubmissionService({ knownShowIds = null, knownShows = null } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-submissions-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const store = createSubmissionStore({ db });
  const service = createSubmissionService({
    store,
    knownShowIds,
    knownShows,
  });

  return { tempDir, db, service };
}

function cleanupTempService({ tempDir, db }) {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function submit(context, rawBody, requestContext = {}) {
  return context.service.submit(rawBody, {
    sourceIp: requestContext.sourceIp || "127.0.0.1",
    userAgent: requestContext.userAgent || "test-agent",
  });
}

test("show submissions accept the v2 minimal contract and preserve optional context", () => {
  const context = createTempSubmissionService();

  const result = submit(context, {
    intakeVersion: 2,
    submissionType: "show",
    showTitle: "Test Show",
    creatorName: "Example Studio",
    contactEmail: "hello@example.com",
    officialSite: "https://example.com",
    rssOrListenLink: "",
    genres: "horror, sci-fi",
    listenLinks: [
      { label: "Spotify", url: "https://open.spotify.com/show/test" },
      { label: "RSS Feed", url: "https://example.com/feed" },
    ],
    selectedTags: ["Horror", "Sci-fi", "Full-cast"],
    completionStatus: "ongoing",
    shortDescription: "A spoiler-free description of the show.",
    verificationNotes: "Press kit is available on the official site.",
    notes: "Press kit is available on the official site.",
    website: "",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.filtered, false);
  assert.equal(result.submission.status, "new");
  assert.equal(result.submission.submission_type, "show");
  assert.equal(result.submission.show_title, "Test Show");
  assert.equal(result.submission.contact_email, "hello@example.com");
  assert.equal(result.submission.rss_or_listen_link, "https://example.com/feed");
  assert.equal(result.submission.genres, "Horror, Sci-fi, Full-cast");
  assert.deepEqual(result.submission.payload_json, {
    intakeVersion: 2,
    listenLinks: [
      { label: "Spotify", url: "https://open.spotify.com/show/test" },
      { label: "RSS Feed", url: "https://example.com/feed" },
    ],
    selectedTags: ["Horror", "Sci-fi", "Full-cast"],
    completionStatus: "ongoing",
    shortDescription: "A spoiler-free description of the show.",
    verificationNotes: "Press kit is available on the official site.",
  });

  cleanupTempService(context);
});

test("minimal new-show intake needs only a title and one reliable URL", () => {
  const context = createTempSubmissionService();
  try {
    const result = submit(context, {
      intakeVersion: 2,
      submissionType: "show",
      showTitle: "Minimal Show",
      listenLinks: [{ label: "Official Website", url: "https://minimal.example/show" }],
      website: "",
    });
    assert.equal(result.submission.creator_name, "");
    assert.equal(result.submission.contact_email, "");
    assert.equal(result.submission.official_site, "https://minimal.example/show");
    assert.equal(result.submission.rss_or_listen_link, "");
    assert.equal(result.submission.payload_json.completionStatus, "unknown");
    assert.throws(
      () => submit(context, { intakeVersion: 2, submissionType: "show", showTitle: "No source", website: "" }),
      /official or listen link/i,
    );
    assert.throws(
      () => submit(context, {
        intakeVersion: 2,
        submissionType: "show",
        showTitle: "",
        listenLinks: [{ label: "RSS Feed", url: "https://minimal.example/feed" }],
        website: "",
      }),
      /show title is required/i,
    );
    assert.throws(
      () => submit(context, {
        intakeVersion: 2,
        submissionType: "show",
        showTitle: "Malformed optional details",
        contactEmail: "not-an-email",
        listenLinks: [{ label: "RSS Feed", url: "https://minimal.example/feed" }],
        website: "",
      }),
      /contact email must be valid/i,
    );
    assert.throws(
      () => submit(context, {
        intakeVersion: 2,
        submissionType: "show",
        showTitle: "Malformed source",
        listenLinks: [{ label: "RSS Feed", url: "ftp://minimal.example/feed" }],
        website: "",
      }),
      /valid http or https/i,
    );
  } finally {
    cleanupTempService(context);
  }
});

test("honeypot submissions are accepted without creating queue entries", () => {
  const context = createTempSubmissionService();

  const result = submit(context, {
    submissionType: "show",
    showTitle: "Bot Show",
    creatorName: "Bot Studio",
    contactEmail: "bot@example.com",
    officialSite: "https://example.com",
    listenLinks: [{ label: "Website", url: "https://example.com" }],
    selectedTags: ["Mystery"],
    completionStatus: "unknown",
    shortDescription: "A placeholder description.",
    archiveFitNote: "Placeholder archive note.",
    website: "filled",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.filtered, true);

  cleanupTempService(context);
});

test("submission throttling rejects repeated posts from one IP", () => {
  const context = createTempSubmissionService();
  let remainingSubmissions = 2;
  context.service = createSubmissionService({
    store: createSubmissionStore({ db: context.db }),
    rateLimiter: {
      check(scope, clientIp) {
        assert.equal(scope, "submissions");
        assert.equal(clientIp, "127.0.0.1");
        remainingSubmissions -= 1;
        if (remainingSubmissions < 0) {
          const error = new Error("Too many submissions requests from this address. Try again later.");
          error.statusCode = 429;
          error.retryAfterSeconds = 60;
          throw error;
        }
      },
    },
  });

  const basePayload = {
    submissionType: "show",
    creatorName: "Example Studio",
    contactEmail: "hello@example.com",
    officialSite: "https://example.com",
    listenLinks: [{ label: "Website", url: "https://example.com" }],
    selectedTags: ["Drama"],
    completionStatus: "ongoing",
    shortDescription: "A spoiler-free description.",
    archiveFitNote: "An archive note.",
    website: "",
  };

  submit(context, { ...basePayload, showTitle: "First Show" });
  submit(context, { ...basePayload, showTitle: "Second Show" });

  assert.throws(
    () => {
      submit(context, { ...basePayload, showTitle: "Third Show" });
    },
    {
      message: /too many submissions/i,
    },
  );

  cleanupTempService(context);
});

test("correction submissions require a known archive entry, allow optional email, and persist structured sources", () => {
  const context = createTempSubmissionService({
    knownShowIds: new Set(["impact-winter"]),
  });

  const result = submit(context, {
    submissionType: "correction",
    existingShowId: "impact-winter",
    showTitle: "Impact Winter",
    creatorName: "",
    contactEmail: "",
    officialSite: "",
    rssOrListenLink: "",
    genres: "",
    correctionType: "broken-link",
    issueDescription: "The official website link returns a 404.",
    correctedInformation: "Use https://impactwinter.com instead.",
    sourceLinks: [
      { url: "https://impactwinter.com" },
      { url: "https://x.com/impactwinter/status/1234567890123456789" },
    ],
    notes: "Confirmed via official site and verified social account.",
    website: "",
  }, {
    sourceIp: "127.0.0.2",
  });

  assert.equal(result.submission.submission_type, "correction");
  assert.equal(result.submission.existing_show_id, "impact-winter");
  assert.equal(result.submission.contact_email, "");
  assert.deepEqual(result.submission.payload_json, {
    correctionType: "broken-link",
    issueDescription: "The official website link returns a 404.",
    correctedInformation: "Use https://impactwinter.com instead.",
    sourceLinks: [
      "https://impactwinter.com",
      "https://x.com/impactwinter/status/1234567890123456789",
    ],
    notes: "Confirmed via official site and verified social account.",
  });
  assert.deepEqual(result.submission.provenance_json, {
    sourceLinks: [
      "https://impactwinter.com",
      "https://x.com/impactwinter/status/1234567890123456789",
    ],
  });

  assert.throws(
    () => {
      submit(context, {
        submissionType: "correction",
        existingShowId: "missing-show",
        showTitle: "Missing Show",
        correctionType: "metadata",
        issueDescription: "Missing creator credit.",
        correctedInformation: "Add Example Studio.",
        sourceLinks: [{ url: "https://example.com" }],
        website: "",
      }, {
        sourceIp: "127.0.0.3",
      });
    },
    {
      message: /unknown archive entry/i,
    },
  );

  cleanupTempService(context);
});

test("v2 corrections validate only the active subtype and store structured details", () => {
  const context = createTempSubmissionService({ knownShowIds: new Set(["impact-winter"]) });
  const base = {
    intakeVersion: 2,
    submissionType: "correction",
    existingShowId: "impact-winter",
    showTitle: "Forged title",
    website: "",
  };
  try {
    const broken = submit(context, {
      ...base,
      correctionType: "broken-link",
      correctionDetails: {
        action: "replace",
        affectedUrl: "https://old.example/show",
        replacementUrl: "https://new.example/show",
        proposedValue: "stale hidden value",
      },
      sourceLinks: [],
    });
    assert.deepEqual(broken.submission.payload_json.correctionDetails, {
      action: "replace",
      affectedUrl: "https://old.example/show",
      replacementUrl: "https://new.example/show",
    });

    const removed = submit(context, {
      ...base,
      correctionType: "broken-link",
      correctionDetails: {
        action: "remove",
        affectedUrl: "https://old.example/remove-me",
        replacementUrl: "not-a-valid-hidden-url",
      },
      sourceLinks: [],
    }, { sourceIp: "127.0.0.20" });
    assert.deepEqual(removed.submission.payload_json.correctionDetails, {
      action: "remove",
      affectedUrl: "https://old.example/remove-me",
    });

    const metadata = submit(context, {
      ...base,
      correctionType: "metadata",
      correctionDetails: { field: "creator", proposedValue: "Updated Studio" },
      sourceLinks: ["https://official.example/about"],
    }, { sourceIp: "127.0.0.11" });
    assert.equal(metadata.submission.payload_json.intakeVersion, 2);
    assert.deepEqual(metadata.submission.payload_json.correctionDetails, {
      field: "creator",
      proposedValue: "Updated Studio",
    });

    const status = submit(context, {
      ...base,
      correctionType: "status",
      correctionDetails: { proposedStatus: "completed", effectiveDateOrNote: "Finale published in June." },
      sourceLinks: ["https://official.example/status"],
    }, { sourceIp: "127.0.0.21" });
    assert.deepEqual(status.submission.payload_json.correctionDetails, {
      proposedStatus: "completed",
      effectiveDateOrNote: "Finale published in June.",
    });

    const credits = submit(context, {
      ...base,
      correctionType: "credits",
      correctionDetails: { action: "update", name: "Avery Example", role: "Writer" },
      sourceLinks: ["https://official.example/credits"],
    }, { sourceIp: "127.0.0.22" });
    assert.deepEqual(credits.submission.payload_json.correctionDetails, {
      action: "update",
      name: "Avery Example",
      role: "Writer",
    });

    const artwork = submit(context, {
      ...base,
      correctionType: "artwork",
      correctionDetails: { artworkUrl: "https://official.example/artwork.jpg", credit: "Example Studio" },
      sourceLinks: [],
    }, { sourceIp: "127.0.0.23" });
    assert.deepEqual(artwork.submission.payload_json.correctionDetails, {
      artworkUrl: "https://official.example/artwork.jpg",
      credit: "Example Studio",
    });

    const other = submit(context, {
      ...base,
      correctionType: "other",
      correctionDetails: { issue: "The language is incorrect.", proposedValue: "English and Swedish." },
      sourceLinks: [],
    }, { sourceIp: "127.0.0.24" });
    assert.deepEqual(other.submission.payload_json.correctionDetails, {
      issue: "The language is incorrect.",
      proposedValue: "English and Swedish.",
    });

    assert.throws(
      () => submit(context, {
        ...base,
        correctionType: "credits",
        correctionDetails: { action: "add", name: "Avery", role: "Writer" },
        sourceLinks: [],
      }, { sourceIp: "127.0.0.12" }),
      /official source/i,
    );
    assert.throws(
      () => submit(context, {
        ...base,
        correctionType: "broken-link",
        correctionDetails: { action: "remove", affectedUrl: "not-a-url" },
      }, { sourceIp: "127.0.0.13" }),
      /affected link/i,
    );
  } finally {
    cleanupTempService(context);
  }
});

test("listener review submissions normalize 5 stars into the 10-point score and keep optional fields", () => {
  const context = createTempSubmissionService({
    knownShowIds: new Set(["impact-winter"]),
  });

  const result = submit(context, {
    submissionType: "listener-review",
    existingShowId: "impact-winter",
    showTitle: "Impact Winter",
    creatorName: "",
    contactEmail: "",
    officialSite: "",
    rssOrListenLink: "",
    genres: "",
    ratingStars: 4,
    categoryScores: {
      voiceActing: 9,
      soundDesign: 8,
      story: 7,
      characters: 8,
      ads: 6,
      length: 7,
    },
    spoilerLevel: "spoiler-free",
    reviewTitle: "Atmospheric and sharply paced",
    reviewText: "A strong starting point with great atmosphere and very clean momentum.",
    whoWouldLikeThis: "Listeners who want horror with a polished production style.",
    bestFor: ["Long walks", "Headphones on"],
    workedBest: ["Atmosphere", "Sound design"],
    similarShows: "The White Vault, Derelict",
    alias: "Listener42",
    notes: "Keep this spoiler-safe.",
    website: "",
  }, {
    sourceIp: "127.0.0.4",
  });

  assert.equal(result.submission.submission_type, "listener-review");
  assert.equal(result.submission.contact_email, "");
  assert.deepEqual(result.submission.payload_json, {
    ratingStars: 4,
    rating: 8,
    categoryScores: {
      voiceActing: 9,
      soundDesign: 8,
      story: 7,
      characters: 8,
      ads: 6,
      length: 7,
    },
    spoilerLevel: "spoiler-free",
    reviewTitle: "Atmospheric and sharply paced",
    review: "A strong starting point with great atmosphere and very clean momentum.",
    whoWouldLikeThis: "Listeners who want horror with a polished production style.",
    bestFor: ["Long walks", "Headphones on"],
    workedBest: ["Atmosphere", "Sound design"],
    similarShows: "The White Vault, Derelict",
    alias: "Listener42",
    notes: "Keep this spoiler-safe.",
  });

  cleanupTempService(context);
});

test("listener review submissions accept sparse detailed ratings and reject invalid supplied scores", () => {
  const context = createTempSubmissionService({ knownShowIds: new Set(["impact-winter"]) });
  const baseReview = {
    submissionType: "listener-review",
    existingShowId: "impact-winter",
    showTitle: "Impact Winter",
    ratingStars: 4,
    spoilerLevel: "spoiler-free",
    reviewTitle: "A complete review",
    reviewText: "A spoiler-safe public review with enough detail to moderate.",
    website: "",
  };

  try {
    const sparse = submit(context, { ...baseReview, intakeVersion: 2, categoryScores: { voiceActing: 8, soundDesign: 7 } });
    assert.deepEqual(sparse.submission.payload_json.categoryScores, { voiceActing: 8, soundDesign: 7 });
    const empty = submit(context, { ...baseReview, intakeVersion: 2, showTitle: "", categoryScores: {} }, { sourceIp: "127.0.0.9" });
    assert.deepEqual(empty.submission.payload_json.categoryScores, {});
    assert.throws(
      () => submit(context, {
        ...baseReview,
        categoryScores: { voiceActing: 8, soundDesign: 7, story: 11, characters: 8, ads: 7, length: 8 },
      }),
      /whole numbers from 1 to 10/i,
    );
    assert.throws(
      () => submit(context, { ...baseReview, categoryScores: { madeUp: 8 } }, { sourceIp: "127.0.0.10" }),
      /unknown detailed rating category/i,
    );
    assert.throws(
      () => submit(context, { ...baseReview, categoryScores: { ads: 7.5 } }, { sourceIp: "127.0.0.11" }),
      /whole numbers from 1 to 10/i,
    );
  } finally {
    cleanupTempService(context);
  }
});

test("creator verification submissions persist structured provenance without requiring contact email", () => {
  const context = createTempSubmissionService({
    knownShowIds: new Set(["impact-winter"]),
  });

  const result = submit(context, {
    submissionType: "creator-verification",
    existingShowId: "impact-winter",
    showTitle: "Impact Winter",
    creatorName: "Example Studio",
    contactEmail: "",
    officialSite: "https://impactwinter.com",
    role: "network-representative",
    verificationMethod: "website",
    proofUrl: "https://impactwinter.com/about",
    requestedUpdates: "Update the official website, status, and Apple Podcasts link.",
    preferredDescription: "The official horror thriller series from Example Studio.",
    officialLinks: [
      { label: "Website", url: "https://impactwinter.com" },
      { label: "Apple Podcasts", url: "https://podcasts.apple.com/us/podcast/impact-winter/id123" },
    ],
    notes: "Official update from the network team.",
    website: "",
  }, {
    sourceIp: "127.0.0.5",
  });

  assert.equal(result.submission.submission_type, "creator-verification");
  assert.equal(result.submission.contact_email, "");
  assert.deepEqual(result.submission.payload_json, {
    role: "network-representative",
    verificationMethod: "website",
    proofUrl: "https://impactwinter.com/about",
    requestedUpdates: "Update the official website, status, and Apple Podcasts link.",
    preferredDescription: "The official horror thriller series from Example Studio.",
    officialLinks: [
      { label: "Website", url: "https://impactwinter.com" },
      { label: "Apple Podcasts", url: "https://podcasts.apple.com/us/podcast/impact-winter/id123" },
    ],
    notes: "Official update from the network team.",
  });
  assert.deepEqual(result.submission.provenance_json, {
    proofUrl: "https://impactwinter.com/about",
    officialLinks: [
      { label: "Website", url: "https://impactwinter.com" },
      { label: "Apple Podcasts", url: "https://podcasts.apple.com/us/podcast/impact-winter/id123" },
    ],
  });

  assert.throws(
    () => {
      submit(context, {
        submissionType: "creator-verification",
        existingShowId: "impact-winter",
        showTitle: "Impact Winter",
        creatorName: "Example Studio",
        role: "creator",
        verificationMethod: "website",
        proofUrl: "",
        requestedUpdates: "Update the official site.",
        officialLinks: [{ label: "Website", url: "not-a-url" }],
        website: "",
      }, {
        sourceIp: "127.0.0.6",
      });
    },
    {
      message: /(proof link|valid http or https)/i,
    },
  );

  cleanupTempService(context);
});

test("v2 verification evidence follows the selected method", () => {
  const knownShows = [{
    id: "impact-winter",
    title: "Impact Winter",
    creators: ["Example Studio"],
    completionStatus: "ongoing",
    officialDescription: { text: "Official description." },
    listenLinks: { apple: "https://podcasts.apple.com/show/impact" },
    officialLinks: { website: "https://impact.example" },
  }];
  const context = createTempSubmissionService({ knownShows });
  const base = {
    intakeVersion: 2,
    submissionType: "creator-verification",
    existingShowId: "impact-winter",
    showTitle: "Not the canonical title",
    creatorName: "Example Studio",
    role: "creator",
    requestedUpdates: "Confirm the creator association.",
    website: "",
  };
  try {
    const emailResult = submit(context, {
      ...base,
      contactEmail: "creator@impact.example",
      verificationEvidence: { method: "official-domain-email", email: "creator@impact.example" },
    });
    assert.equal(emailResult.submission.show_title, "Impact Winter");
    assert.equal(emailResult.submission.contact_email, "creator@impact.example");
    assert.deepEqual(emailResult.submission.payload_json.verificationEvidence, {
      method: "official-domain-email",
      email: "creator@impact.example",
    });

    const websiteResult = submit(context, {
      ...base,
      contactEmail: "stale@example.org",
      verificationEvidence: {
        method: "website",
        email: "stale@example.org",
        url: "https://impact.example/about",
        description: "Stale evidence from another method.",
      },
    }, { sourceIp: "127.0.0.14" });
    assert.equal(websiteResult.submission.payload_json.officialLinks.length, 0);
    assert.deepEqual(websiteResult.submission.payload_json.verificationEvidence, {
      method: "website",
      url: "https://impact.example/about",
    });
    assert.equal(websiteResult.submission.contact_email, "");

    for (const [method, sourceIp] of [["social-account", "127.0.0.17"], ["press-kit", "127.0.0.18"]]) {
      const result = submit(context, {
        ...base,
        verificationEvidence: { method, url: `https://impact.example/${method}` },
      }, { sourceIp });
      assert.deepEqual(result.submission.payload_json.verificationEvidence, {
        method,
        url: `https://impact.example/${method}`,
      });
    }

    const otherResult = submit(context, {
      ...base,
      contactEmail: "creator@impact.example",
      verificationEvidence: {
        method: "other",
        email: "creator@impact.example",
        description: "Confirm through the production contact listed in the press materials.",
      },
    }, { sourceIp: "127.0.0.19" });
    assert.deepEqual(otherResult.submission.payload_json.verificationEvidence, {
      method: "other",
      email: "creator@impact.example",
      description: "Confirm through the production contact listed in the press materials.",
    });

    assert.throws(
      () => submit(context, {
        ...base,
        verificationEvidence: { method: "official-domain-email" },
      }, { sourceIp: "127.0.0.15" }),
      /official-domain email/i,
    );
    assert.throws(
      () => submit(context, {
        ...base,
        verificationEvidence: { method: "other", description: "Known through another channel." },
      }, { sourceIp: "127.0.0.16" }),
      /either a proof URL or contact email/i,
    );

    assert.deepEqual(context.service.getShowContext("impact-winter"), {
      id: "impact-winter",
      title: "Impact Winter",
      creators: ["Example Studio"],
      completionStatus: "ongoing",
      officialDescription: "Official description.",
      listenLinks: [{ label: "Apple Podcasts", url: "https://podcasts.apple.com/show/impact" }],
      officialLinks: [{ label: "Official Website", url: "https://impact.example" }],
    });
    assert.throws(() => context.service.getShowContext("missing"), /show not found/i);
  } finally {
    cleanupTempService(context);
  }
});
