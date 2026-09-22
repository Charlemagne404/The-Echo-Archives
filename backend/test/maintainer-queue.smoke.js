const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSmokeContext,
  gotoSmokePage,
  setupSmoke,
  teardownSmoke,
} = require("./helpers/browser-smoke");

let browser;
let baseUrl;

test.before(async () => {
  await setupSmoke();
  ({ browser, baseUrl } = getSmokeContext());
});

test.after(async () => {
  await teardownSmoke();
});

function createSubmission(id, status = "new") {
  return {
    id,
    status,
    priority: "normal",
    submissionType: "show",
    existingShowId: "",
    submittedAt: "2026-09-22T08:00:00.000Z",
    showTitle: `Queue ${id.slice(-1).toUpperCase()}`,
    creatorName: "Private creator name",
    contactEmail: "secret@example.com",
    officialSite: "https://private.example/show",
    rssOrListenLink: "https://private.example/feed.xml",
    genres: "mystery",
    notes: "PRIVATE MODERATION NOTE",
    payload: { shortDescription: "Private submission content." },
    provenance: { sourceLinks: ["https://private.example/source"] },
    reviewNotes: "Private review notes.",
    reviewedBy: "",
    reviewedAt: "",
    sourceIp: "127.0.0.1",
    userAgent: "private-test-agent",
  };
}

function createQueueResponse(items) {
  const status = {};
  items.forEach((item) => {
    status[item.status] = (status[item.status] || 0) + 1;
  });
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    counts: { status },
  };
}

async function waitForSelected(page, expectedId) {
  await page.waitForFunction(
    (id) => Array.from(document.querySelectorAll(".maintainer-list-item.is-selected [data-submission-id]"))
      .some((button) => button.dataset.submissionId === id),
    expectedId,
    { timeout: 5_000 },
  );
}

function assertQueueUrl(urlString, expectedItem) {
  const url = new URL(urlString);
  const keys = [...url.searchParams.keys()];
  assert.ok(keys.every((key) => ["item", "page", "pageSize", "q", "status"].includes(key)));
  assert.equal(url.searchParams.get("item"), expectedItem);
  assert.equal(url.searchParams.get("q"), "Queue");
  assert.doesNotMatch(urlString, /PRIVATE|secret@example\.com|private\.example|reviewNotes|sourceIp|userAgent/i);
}

test("maintainer queue selection is addressable, history-aware, filter-safe, and private", async () => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const submissions = [createSubmission("queue-a"), createSubmission("queue-b"), createSubmission("queue-c"), createSubmission("queue-d", "rejected")];
  let authenticated = false;
  const detailRequests = [];

  try {
    await page.route("**/api/maintainer/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;
      const method = request.method();
      const respond = (payload, status = 200) => route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

      if (pathname === "/api/maintainer/session" && method === "POST") {
        authenticated = true;
        return route.fulfill({ status: 204 });
      }
      if (pathname === "/api/maintainer/session" && method === "DELETE") {
        authenticated = false;
        return route.fulfill({ status: 204 });
      }
      if (!authenticated) {
        return respond({ error: "Maintainer authentication is required." }, 401);
      }
      if (pathname === "/api/maintainer/submissions" && method === "GET") {
        const status = url.searchParams.get("status") || "";
        const query = (url.searchParams.get("q") || "").toLowerCase();
        const items = submissions.filter((item) => {
          const matchesStatus = !status || item.status === status;
          const searchable = `${item.id} ${item.showTitle} ${item.creatorName}`.toLowerCase();
          return matchesStatus && (!query || searchable.includes(query));
        });
        return respond(createQueueResponse(items.map((item) => ({ ...item, payload: { ...item.payload }, provenance: { ...item.provenance } }))));
      }

      const submissionMatch = pathname.match(/^\/api\/maintainer\/submissions\/([^/]+)$/);
      if (submissionMatch && method === "GET") {
        const id = decodeURIComponent(submissionMatch[1]);
        detailRequests.push(id);
        const submission = submissions.find((item) => item.id === id);
        return submission ? respond({ submission }) : respond({ error: "Submission not found." }, 404);
      }
      if (submissionMatch && method === "PATCH") {
        const id = decodeURIComponent(submissionMatch[1]);
        const submission = submissions.find((item) => item.id === id);
        if (!submission) {
          return respond({ error: "Submission not found." }, 404);
        }
        const updates = JSON.parse(request.postData() || "{}");
        Object.assign(submission, {
          status: updates.status || submission.status,
          priority: updates.priority || submission.priority,
          reviewNotes: updates.reviewNotes || "",
          reviewedBy: updates.reviewedBy || "",
          reviewedAt: "2026-09-22T09:00:00.000Z",
        });
        return respond({ submission });
      }

      return respond({ error: "Unhandled maintainer route." }, 500);
    });

    await gotoSmokePage(
      page,
      `${baseUrl}/maintainer/submissions.html?status=new&q=Queue&pageSize=20&item=queue-b`,
      { waitUntil: "networkidle" },
    );
    await page.locator("#maintainerAuthPanel").waitFor({ state: "visible" });
    await page.locator("#maintainerPassphrase").fill("smoke-maintainer");
    await page.locator("#maintainerAuthForm button[type=submit]").click();
    await page.locator("#maintainerAppShell").waitFor({ state: "visible" });
    await waitForSelected(page, "queue-b");
    assertQueueUrl(page.url(), "queue-b");

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#maintainerAppShell").waitFor({ state: "visible" });
    await waitForSelected(page, "queue-b");
    assertQueueUrl(page.url(), "queue-b");

    await page.locator('[data-submission-id="queue-c"]').click();
    await waitForSelected(page, "queue-c");
    assertQueueUrl(page.url(), "queue-c");

    await page.goBack();
    await waitForSelected(page, "queue-b");
    assertQueueUrl(page.url(), "queue-b");
    await page.goForward();
    await waitForSelected(page, "queue-c");
    assertQueueUrl(page.url(), "queue-c");

    await page.locator("#maintainerReviewStatus").selectOption("accepted");
    await page.locator("#maintainerReviewedBy").fill("QA");
    await page.locator("#maintainerReviewForm button[type=submit]").click();
    await waitForSelected(page, "queue-a");
    assertQueueUrl(page.url(), "queue-a");

    await page.locator("#maintainerStatusFilter").selectOption("rejected");
    await page.locator("#maintainerFilterForm button[type=submit]").click();
    await waitForSelected(page, "queue-d");
    assertQueueUrl(page.url(), "queue-d");

    const detailRequestCountBeforeFilteredDirectLink = detailRequests.length;
    await page.goto(
      `${baseUrl}/maintainer/submissions.html?status=rejected&q=Queue&pageSize=20&item=queue-b`,
      { waitUntil: "networkidle" },
    );
    await page.locator("#maintainerAppShell").waitFor({ state: "visible" });
    await waitForSelected(page, "queue-d");
    assertQueueUrl(page.url(), "queue-d");
    assert.equal(detailRequests.slice(detailRequestCountBeforeFilteredDirectLink).includes("queue-b"), false);

    await page.locator("#maintainerReviewStatus").selectOption("accepted");
    await page.locator("#maintainerReviewForm button[type=submit]").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".maintainer-list-item").length === 0 &&
        document.querySelector("#maintainerDetail")?.textContent.includes("No submission selected."),
      undefined,
      { timeout: 5_000 },
    );
    const emptyQueueUrl = new URL(page.url());
    assert.equal(emptyQueueUrl.searchParams.has("item"), false);
    assert.doesNotMatch(page.url(), /PRIVATE|secret@example\.com|private\.example|reviewNotes|sourceIp|userAgent/i);
  } finally {
    await context.close();
  }
});
