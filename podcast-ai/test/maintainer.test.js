const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { openDatabase } = require("../lib/store/database");
const { createSubmissionStore } = require("../lib/store/submission-store");
const { createSubmissionService } = require("../lib/services/submission-service");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");

function createTempContext() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-maintainer-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const store = createSubmissionStore({ db });
  const service = createSubmissionService({ store });
  return { tempDir, dbPath, db, store, service };
}

function cleanupTempContext(context) {
  context.db.close();
  fs.rmSync(context.tempDir, { recursive: true, force: true });
}

function seedSubmission(store, overrides = {}) {
  return store.createShowSubmission({
    status: overrides.status || "new",
    priority: overrides.priority || "normal",
    submissionType: overrides.submissionType || "show",
    existingShowId: overrides.existingShowId || "",
    showTitle: overrides.showTitle || "Seed Show",
    creatorName: overrides.creatorName || "",
    contactEmail: overrides.contactEmail || "seed@example.com",
    officialSite: overrides.officialSite || "",
    rssOrListenLink: overrides.rssOrListenLink || "",
    genres: overrides.genres || "",
    notes: overrides.notes || "",
    payload: overrides.payload || {},
    provenance: overrides.provenance || {},
    reviewNotes: overrides.reviewNotes || "",
    reviewedBy: overrides.reviewedBy || "",
    reviewedAt: overrides.reviewedAt || null,
    sourceIp: overrides.sourceIp || "127.0.0.1",
    userAgent: overrides.userAgent || "test-agent",
  });
}

async function waitForServer(url, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Retry until the process is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function startMaintainerServer({ enabled = true } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-maintainer-server-"));
  const dbPath = path.join(tempDir, "community.sqlite");
  const db = openDatabase(dbPath);
  const store = createSubmissionStore({ db });
  const seeded = seedSubmission(store, {
    status: "new",
    priority: "high",
    submissionType: "listener-review",
    existingShowId: "impact-winter",
    showTitle: "Impact Winter",
    payload: {
      ratingStars: 5,
      rating: 10,
      reviewTitle: "Excellent tension",
      review: "Very sharp pacing and atmosphere throughout.",
      spoilerLevel: "spoiler-free",
    },
    notes: "Flag this for a spoiler check.",
  });
  db.close();

  const port = 3480 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVE_STATIC: "true",
      STATIC_ROOT: siteRoot,
      DB_PATH: dbPath,
      OLLAMA_URL: "http://127.0.0.1:9/api/generate",
      MAINTAINER_REVIEW_PASSPHRASE: enabled ? "archive-test-passphrase" : "",
      MAINTAINER_REVIEW_COOKIE_SECRET: enabled ? "archive-test-secret" : "",
      MAINTAINER_REVIEW_SESSION_TTL_HOURS: "12",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer(`${baseUrl}/api/health`);

  return {
    tempDir,
    baseUrl,
    serverProcess,
    seededId: seeded.id,
  };
}

async function stopMaintainerServer(context) {
  if (context.serverProcess && !context.serverProcess.killed) {
    context.serverProcess.kill("SIGTERM");
    await new Promise((resolve) => context.serverProcess.once("exit", resolve));
  }
  fs.rmSync(context.tempDir, { recursive: true, force: true });
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

test("maintainer list defaults to open statuses, searches payload text, and persists review updates", () => {
  const context = createTempContext();

  const first = seedSubmission(context.store, {
    showTitle: "Show Submission",
    status: "new",
    priority: "normal",
    submissionType: "show",
    payload: { shortDescription: "A grounded thriller." },
  });
  const second = seedSubmission(context.store, {
    showTitle: "Correction Case",
    status: "needs-follow-up",
    priority: "high",
    submissionType: "correction",
    payload: { issueDescription: "Broken website link", correctedInformation: "Use the official domain." },
  });
  seedSubmission(context.store, {
    showTitle: "Archived Review",
    status: "accepted",
    priority: "low",
    submissionType: "listener-review",
    payload: { review: "Closed out already." },
  });

  const openResult = context.service.listForMaintainer({});
  assert.equal(openResult.total, 2);
  assert.deepEqual(openResult.items.map((item) => item.id), [second.id, first.id]);
  assert.equal(openResult.counts.status.accepted, undefined);

  const searchResult = context.service.listForMaintainer({ q: "official domain", includeClosed: true });
  assert.equal(searchResult.total, 1);
  assert.equal(searchResult.items[0].submissionType, "correction");

  const updated = context.service.reviewForMaintainer(second.id, {
    status: "in-review",
    priority: "normal",
    reviewedBy: "CA",
    reviewNotes: "Confirmed the replacement URL.",
  });
  assert.equal(updated.status, "in-review");
  assert.equal(updated.priority, "normal");
  assert.equal(updated.reviewedBy, "CA");
  assert.match(updated.reviewNotes, /replacement url/i);
  assert.match(updated.reviewedAt || "", /^\d{4}-\d{2}-\d{2}T/);

  cleanupTempContext(context);
});

test("maintainer session and queue routes enforce auth and allow queue updates after login", async () => {
  const context = await startMaintainerServer();

  try {
    const pageResponse = await fetch(`${context.baseUrl}/maintainer/submissions.html`);
    assert.equal(pageResponse.status, 200);
    assert.match(await pageResponse.text(), /maintainer passphrase/i);

    const unauthorizedList = await fetch(`${context.baseUrl}/api/maintainer/submissions`);
    assert.equal(unauthorizedList.status, 401);

    const rejectedLogin = await fetch(`${context.baseUrl}/api/maintainer/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "wrong" }),
    });
    assert.equal(rejectedLogin.status, 401);

    const loginResponse = await fetch(`${context.baseUrl}/api/maintainer/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "archive-test-passphrase" }),
    });
    assert.equal(loginResponse.status, 204);
    const cookie = loginResponse.headers.get("set-cookie") || "";
    assert.match(cookie, /echo-maintainer-session=/);

    const authenticatedList = await fetch(`${context.baseUrl}/api/maintainer/submissions`, {
      headers: { Cookie: cookie },
    });
    assert.equal(authenticatedList.status, 200);
    const listPayload = await authenticatedList.json();
    assert.equal(listPayload.total, 1);
    assert.equal(listPayload.items[0].priority, "high");

    const detailResponse = await fetch(`${context.baseUrl}/api/maintainer/submissions/${context.seededId}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.submission.showTitle, "Impact Winter");

    const patchResponse = await fetch(`${context.baseUrl}/api/maintainer/submissions/${context.seededId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        status: "accepted",
        priority: "normal",
        reviewedBy: "CA",
        reviewNotes: "Safe to archive as a listener review quote candidate.",
      }),
    });
    assert.equal(patchResponse.status, 200);
    const patchPayload = await patchResponse.json();
    assert.equal(patchPayload.submission.status, "accepted");
    assert.equal(patchPayload.submission.reviewedBy, "CA");

    const closedList = await fetch(`${context.baseUrl}/api/maintainer/submissions?includeClosed=true`, {
      headers: { Cookie: cookie },
    });
    assert.equal(closedList.status, 200);
    const closedPayload = await closedList.json();
    assert.equal(closedPayload.total, 1);
    assert.equal(closedPayload.items[0].status, "accepted");

    const logoutResponse = await fetch(`${context.baseUrl}/api/maintainer/session`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    assert.equal(logoutResponse.status, 204);
    assert.match(logoutResponse.headers.get("set-cookie") || "", /echo-maintainer-session=;/);

    const postLogoutList = await fetch(`${context.baseUrl}/api/maintainer/submissions`, {
    });
    assert.equal(postLogoutList.status, 401);
  } finally {
    await stopMaintainerServer(context);
  }
});

test("maintainer routes return 404 when the maintainer passphrase is disabled", async () => {
  const context = await startMaintainerServer({ enabled: false });

  try {
    const pageResponse = await fetch(`${context.baseUrl}/maintainer/submissions.html`);
    assert.equal(pageResponse.status, 404);

    const apiResponse = await fetch(`${context.baseUrl}/api/maintainer/submissions`);
    assert.equal(apiResponse.status, 404);
    assert.deepEqual(await readJson(apiResponse), {});
  } finally {
    await stopMaintainerServer(context);
  }
});
