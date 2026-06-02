const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openDatabase } = require("../lib/store/database");
const { createSubmissionStore } = require("../lib/store/submission-store");
const { createSubmissionService } = require("../lib/services/submission-service");

function createTempSubmissionService() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-submissions-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const store = createSubmissionStore({ db });
  const service = createSubmissionService({
    store,
    throttleWindowMs: 60_000,
    maxSubmissionsPerWindow: 2,
  });

  return { tempDir, db, service };
}

test("show submissions are stored in the SQLite review queue", () => {
  const { tempDir, db, service } = createTempSubmissionService();

  const result = service.submitShow({
    showTitle: "Test Show",
    creatorName: "Example Studio",
    contactEmail: "hello@example.com",
    officialSite: "https://example.com",
    rssOrListenLink: "",
    genres: "sci-fi, mystery",
    notes: "A concise intake note.",
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

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("honeypot submissions are accepted without creating queue entries", () => {
  const { tempDir, db, service } = createTempSubmissionService();

  const result = service.submitShow({
    showTitle: "Bot Show",
    creatorName: "",
    contactEmail: "bot@example.com",
    officialSite: "https://example.com",
    rssOrListenLink: "",
    genres: "",
    notes: "",
    honeypot: "filled",
    sourceIp: "127.0.0.1",
    userAgent: "test-agent",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.filtered, true);

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("submission throttling rejects repeated posts from one IP", () => {
  const { tempDir, db, service } = createTempSubmissionService();

  const basePayload = {
    creatorName: "",
    contactEmail: "hello@example.com",
    officialSite: "https://example.com",
    rssOrListenLink: "",
    genres: "",
    notes: "",
    honeypot: "",
    sourceIp: "127.0.0.1",
    userAgent: "test-agent",
  };

  service.submitShow({ ...basePayload, showTitle: "First Show" });
  service.submitShow({ ...basePayload, showTitle: "Second Show" });

  assert.throws(
    () => {
      service.submitShow({ ...basePayload, showTitle: "Third Show" });
    },
    {
      message: /too many submissions/i,
    },
  );

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("correction submissions require a known archive entry and persist it", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-submissions-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const store = createSubmissionStore({ db });
  const service = createSubmissionService({
    store,
    knownShowIds: new Set(["impact-winter"]),
    throttleWindowMs: 60_000,
    maxSubmissionsPerWindow: 2,
  });

  const result = service.submitShow({
    submissionType: "correction",
    existingShowId: "impact-winter",
    showTitle: "Impact Winter",
    creatorName: "",
    contactEmail: "hello@example.com",
    officialSite: "https://example.com",
    rssOrListenLink: "",
    genres: "",
    notes: "Archive note correction.",
    honeypot: "",
    sourceIp: "127.0.0.1",
    userAgent: "test-agent",
  });

  assert.equal(result.submission.submission_type, "correction");
  assert.equal(result.submission.existing_show_id, "impact-winter");

  assert.throws(
    () => {
      service.submitShow({
        submissionType: "correction",
        existingShowId: "missing-show",
        showTitle: "Missing Show",
        creatorName: "",
        contactEmail: "hello@example.com",
        officialSite: "https://example.com",
        rssOrListenLink: "",
        genres: "",
        notes: "",
        honeypot: "",
        sourceIp: "127.0.0.2",
        userAgent: "test-agent",
      });
    },
    {
      message: /unknown archive entry/i,
    },
  );

  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
