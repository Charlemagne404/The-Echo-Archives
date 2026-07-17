const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const { createSubmissionStore } = require("../lib/store/submission-store");
const { createSubmissionService } = require("../lib/services/submission-service");

function createTempSubmissionService({ knownShowIds = null } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-submissions-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const store = createSubmissionStore({ db });
  const service = createSubmissionService({
    store,
    knownShowIds,
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

test("show submissions store the expanded structured intake payload", () => {
  const context = createTempSubmissionService();

  const result = submit(context, {
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
    archiveFitNote: "A strong archive fit with a clear audience.",
    verificationNotes: "Press kit is available on the official site.",
    notes: "A strong archive fit with a clear audience.",
    website: "",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.filtered, false);
  assert.equal(result.submission.status, "new");
  assert.equal(result.submission.submission_type, "show");
  assert.equal(result.submission.show_title, "Test Show");
  assert.equal(result.submission.contact_email, "hello@example.com");
  assert.equal(result.submission.rss_or_listen_link, "https://open.spotify.com/show/test");
  assert.equal(result.submission.genres, "Horror, Sci-fi, Full-cast");
  assert.deepEqual(result.submission.payload_json, {
    listenLinks: [
      { label: "Spotify", url: "https://open.spotify.com/show/test" },
      { label: "RSS Feed", url: "https://example.com/feed" },
    ],
    selectedTags: ["Horror", "Sci-fi", "Full-cast"],
    completionStatus: "ongoing",
    shortDescription: "A spoiler-free description of the show.",
    archiveFitNote: "A strong archive fit with a clear audience.",
    verificationNotes: "Press kit is available on the official site.",
  });

  cleanupTempService(context);
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

test("listener review submissions reject incomplete or out-of-range category scores", () => {
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
    assert.throws(
      () => submit(context, { ...baseReview, categoryScores: { voiceActing: 8, soundDesign: 7, story: 8, characters: 8, ads: 7 } }),
      /Rate every category/i,
    );
    assert.throws(
      () => submit(context, {
        ...baseReview,
        categoryScores: { voiceActing: 8, soundDesign: 7, story: 11, characters: 8, ads: 7, length: 8 },
      }),
      /Rate every category/i,
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
