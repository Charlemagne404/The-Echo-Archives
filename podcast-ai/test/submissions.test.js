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
    throttleWindowMs: 60_000,
    maxSubmissionsPerWindow: 2,
  });

  return { tempDir, db, service };
}

function cleanupTempService({ tempDir, db }) {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

test("show submissions store the expanded structured intake payload", () => {
  const context = createTempSubmissionService();

  const result = context.service.submitShow({
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
    honeypot: "",
    sourceIp: "127.0.0.1",
    userAgent: "test-agent",
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

  const result = context.service.submitShow({
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
    honeypot: "filled",
    sourceIp: "127.0.0.1",
    userAgent: "test-agent",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.filtered, true);

  cleanupTempService(context);
});

test("submission throttling rejects repeated posts from one IP", () => {
  const context = createTempSubmissionService();

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
    honeypot: "",
    sourceIp: "127.0.0.1",
    userAgent: "test-agent",
  };

  context.service.submitShow({ ...basePayload, showTitle: "First Show" });
  context.service.submitShow({ ...basePayload, showTitle: "Second Show" });

  assert.throws(
    () => {
      context.service.submitShow({ ...basePayload, showTitle: "Third Show" });
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

  const result = context.service.submitShow({
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
    honeypot: "",
    sourceIp: "127.0.0.2",
    userAgent: "test-agent",
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
      context.service.submitShow({
        submissionType: "correction",
        existingShowId: "missing-show",
        showTitle: "Missing Show",
        correctionType: "metadata",
        issueDescription: "Missing creator credit.",
        correctedInformation: "Add Example Studio.",
        sourceLinks: [{ url: "https://example.com" }],
        honeypot: "",
        sourceIp: "127.0.0.3",
        userAgent: "test-agent",
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

  const result = context.service.submitShow({
    submissionType: "listener-review",
    existingShowId: "impact-winter",
    showTitle: "Impact Winter",
    creatorName: "",
    contactEmail: "",
    officialSite: "",
    rssOrListenLink: "",
    genres: "",
    ratingStars: 4,
    spoilerLevel: "spoiler-free",
    reviewTitle: "Atmospheric and sharply paced",
    reviewText: "A strong starting point with great atmosphere and very clean momentum.",
    whoWouldLikeThis: "Listeners who want horror with a polished production style.",
    bestFor: ["Long walks", "Headphones on"],
    workedBest: ["Atmosphere", "Sound design"],
    similarShows: "The White Vault, Derelict",
    alias: "Listener42",
    notes: "Keep this spoiler-safe.",
    honeypot: "",
    sourceIp: "127.0.0.4",
    userAgent: "test-agent",
  });

  assert.equal(result.submission.submission_type, "listener-review");
  assert.equal(result.submission.contact_email, "");
  assert.deepEqual(result.submission.payload_json, {
    ratingStars: 4,
    rating: 8,
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

test("creator verification submissions persist structured provenance without requiring contact email", () => {
  const context = createTempSubmissionService({
    knownShowIds: new Set(["impact-winter"]),
  });

  const result = context.service.submitShow({
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
    honeypot: "",
    sourceIp: "127.0.0.5",
    userAgent: "test-agent",
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
      context.service.submitShow({
        submissionType: "creator-verification",
        existingShowId: "impact-winter",
        showTitle: "Impact Winter",
        creatorName: "Example Studio",
        role: "creator",
        verificationMethod: "website",
        proofUrl: "",
        requestedUpdates: "Update the official site.",
        officialLinks: [{ label: "Website", url: "not-a-url" }],
        honeypot: "",
        sourceIp: "127.0.0.6",
        userAgent: "test-agent",
      });
    },
    {
      message: /(proof link|valid http or https)/i,
    },
  );

  cleanupTempService(context);
});
