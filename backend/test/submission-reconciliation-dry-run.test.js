const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { openDatabase } = require("../lib/store/database");
const { createSubmissionStore } = require("../lib/store/submission-store");
const { createSubmissionService } = require("../lib/services/submission-service");
const { createImportStore } = require("../lib/store/import-store");
const { buildManifest, readDatabaseRows } = require("../scripts/submission-reconciliation-dry-run");

const SCRIPT = path.resolve(__dirname, "../scripts/submission-reconciliation-dry-run.js");

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "echo-submission-reconcile-"));
  const dbPath = path.join(directory, "community.sqlite");
  const catalogPath = path.join(directory, "shows.json");
  const db = openDatabase(dbPath);
  const store = createSubmissionStore({ db });
  const service = createSubmissionService({ store });
  const importStore = createImportStore({ db });
  const submit = (showTitle, url) => service.submit({
    intakeVersion: 2,
    submissionType: "show",
    showTitle,
    contactEmail: "private@example.test",
    listenLinks: [{ label: "RSS Feed", url }],
    website: "",
  }, { sourceIp: "192.0.2.8", userAgent: "private-test-agent" }).submission;
  return { directory, db, dbPath, catalogPath, importStore, submit };
}

test("dry-run manifest is deterministic and title-only matches stay manual", () => {
  const input = {
    checkedAt: "2026-11-25T12:00:00.000Z",
    submissions: [{
      id: "submission-1",
      submitted_at: "2026-11-24T12:00:00.000Z",
      submission_type: "show",
      show_title: "Same Title",
      creator_name: "Example Creator",
      status: "new",
      payload_json: JSON.stringify({ listenLinks: [{ label: "RSS Feed", url: "https://feed.example/new.xml" }] }),
    }],
    candidates: [],
    shows: [{ id: "same-title", title: "Same Title", credits: { creatorName: "Example Creator" } }],
  };
  const first = buildManifest(input);
  const second = buildManifest(input);
  assert.deepEqual(second, first);
  assert.equal(first.writesPerformed, false);
  assert.equal(first.rows[0].after.action, "manual-review");
  assert.equal(first.rows[0].after.resolutionStatus, "open");
});

test("CLI reads the database in query-only mode, reports strong identities, and omits personal fields", () => {
  const fixture = createFixture();
  try {
    const listed = fixture.submit("Changed Display Title", "https://feeds.example/listed.xml");
    fixture.importStore.createCandidate({
      id: "published-candidate",
      status: "published",
      title: listed.show_title,
      primarySourceType: "submission",
      primarySourceKey: listed.id,
      publishedShowId: "listed-show",
    });
    fixture.submit("Archive Show", "https://feeds.example/archive.xml");
    fs.writeFileSync(fixture.catalogPath, JSON.stringify([{
      id: "archive-show",
      title: "Archive Show",
      listenLinks: { rss: "https://feeds.example/archive.xml" },
    }, {
      id: "listed-show",
      title: "Changed Display Title",
    }]));
    fixture.db.close();

    const before = readDatabaseRows(fixture.dbPath);
    const manifest = buildManifest({ ...before, shows: JSON.parse(fs.readFileSync(fixture.catalogPath, "utf8")), checkedAt: "2026-11-25T12:00:00.000Z" });
    assert.deepEqual(manifest.rows.map((row) => row.after.action).sort(), ["resolve-already-listed", "resolve-published"]);

    const first = spawnSync(process.execPath, [SCRIPT, "--db", fixture.dbPath, "--catalog", fixture.catalogPath], { encoding: "utf8" });
    const second = spawnSync(process.execPath, [SCRIPT, "--db", fixture.dbPath, "--catalog", fixture.catalogPath], { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    const firstManifest = JSON.parse(first.stdout);
    const secondManifest = JSON.parse(second.stdout);
    assert.equal(firstManifest.writesPerformed, false);
    assert.deepEqual(firstManifest.rows, secondManifest.rows);
    assert.doesNotMatch(first.stdout, /private@example\.test|192\.0\.2\.8|private-test-agent/);
    assert.doesNotMatch(first.stdout, /contact_email|source_ip|user_agent/);
    assert.deepEqual(readDatabaseRows(fixture.dbPath), before);
  } finally {
    try { fixture.db.close(); } catch (_error) {}
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("published targets, candidate provenance, and conflicting provider identities must be verified", () => {
  const baseSubmission = {
    id: "submission-1",
    submitted_at: "2026-11-24T12:00:00.000Z",
    submission_type: "show",
    show_title: "A Different Display Title",
    creator_name: "Example Creator",
    status: "new",
    import_candidate_id: "candidate-1",
    payload_json: JSON.stringify({ listenLinks: [{ label: "RSS Feed", url: "https://feeds.example/one.xml" }] }),
  };
  const publishedCandidate = {
    id: "candidate-1",
    status: "published",
    primary_source_type: "submission",
    primary_source_key: "submission-1",
    published_show_id: "published-show",
  };
  const archiveShow = {
    id: "published-show",
    title: "A Different Display Title",
    listenLinks: { rss: "https://feeds.example/one.xml" },
  };

  const missingTarget = buildManifest({
    submissions: [baseSubmission],
    candidates: [publishedCandidate],
    shows: [],
    checkedAt: "2026-11-25T12:00:00.000Z",
  });
  assert.equal(missingTarget.rows[0].after.action, "manual-review");
  assert.equal(missingTarget.rows[0].after.evidence.missingShowId, "published-show");

  const mismatchedProvenance = buildManifest({
    submissions: [baseSubmission],
    candidates: [{ ...publishedCandidate, primary_source_key: "another-submission" }],
    shows: [archiveShow],
    checkedAt: "2026-11-25T12:00:00.000Z",
  });
  assert.equal(mismatchedProvenance.rows[0].after.action, "manual-review");

  const conflictingIdentities = buildManifest({
    submissions: [{
      ...baseSubmission,
      import_candidate_id: "",
      payload_json: JSON.stringify({ listenLinks: [
        { label: "RSS Feed", url: "https://feeds.example/one.xml" },
        { label: "Apple Podcasts", url: "https://podcasts.apple.com/podcast/example/id1234567890" },
      ] }),
    }],
    candidates: [],
    shows: [
      { ...archiveShow, id: "rss-show" },
      { id: "apple-show", title: "Another Show", listenLinks: { apple: "https://podcasts.apple.com/podcast/example/id1234567890" } },
    ],
    checkedAt: "2026-11-25T12:00:00.000Z",
  });
  assert.equal(conflictingIdentities.rows[0].after.action, "manual-review");
  assert.deepEqual(conflictingIdentities.rows[0].after.evidence.conflictingShowIds.sort(), ["apple-show", "rss-show"]);
});
