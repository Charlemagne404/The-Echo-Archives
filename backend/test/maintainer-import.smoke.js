const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSmokeContext,
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

function createCandidate(overrides = {}) {
  return {
    id: "ready-1",
    status: "ready",
    scopeStatus: "in-scope",
    mode: "create",
    title: "Signal Test",
    seedQuery: "Signal Test",
    primarySourceType: "rss",
    primarySourceUrl: "https://example.com/feed.xml",
    createdAt: "2026-07-14T09:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z",
    objective: {
      title: "Signal Test",
      creatorName: "Test Network",
      description: "A factual description supplied by the official feed.",
      rssUrl: "https://example.com/feed.xml",
      websiteUrl: "https://example.com/",
      episodeCount: 12,
    },
    preparedRecord: {
      id: "signal-test",
      title: "Signal Test",
      description: "A factual description supplied by the official feed.",
      reviewStatus: "indexed-only",
      releaseStatus: "active",
      completionStatus: "unclear",
      listenLinks: { rss: "https://example.com/feed.xml" },
    },
    readiness: {
      ready: true,
      blockers: [],
      warnings: ["No structured transcript links were exposed by the feed."],
      updateDiff: [],
    },
    coverStage: {
      ready: true,
      sourceUrl: "/og-image.png",
      width: 1400,
      height: 1400,
      contentType: "image/png",
      byteSize: 9000,
      appleQuality: true,
    },
    provenance: {
      fields: { title: { confidence: 0.98, method: "source-agreement" } },
    },
    fieldEvidence: [{
      id: 11,
      fieldName: "title",
      sourceType: "rss",
      confidence: 0.95,
      value: "Signal Test",
      normalizedValue: "Signal Test",
    }],
    sourceHealth: { healthy: 1, failed: 0, errors: [] },
    sources: [{
      sourceType: "rss",
      sourceKey: "https://example.com/feed.xml",
      sourceUrl: "https://example.com/feed.xml",
      fetchStatus: "fetched",
      fetchedAt: "2026-07-14T10:00:00.000Z",
      normalized: { title: "Signal Test", episodeCount: 12 },
    }],
    conflicts: [],
    dedupe: { allMatches: [] },
    ...overrides,
  };
}

function listPayload(candidates) {
  const status = {};
  candidates.forEach((candidate) => {
    status[candidate.status] = (status[candidate.status] || 0) + 1;
  });
  return {
    items: candidates,
    total: candidates.length,
    page: 1,
    pageSize: 20,
    counts: { status },
  };
}

test("maintainer import workspace handles progress, blockers, evidence, retry, review, and approval", async () => {
  const page = await browser.newPage();
  const calls = { evidence: 0, publish: 0, retry: 0, review: 0, seed: 0 };
  const candidates = [
    createCandidate(),
    createCandidate({
      id: "blocked-1",
      status: "needs-review",
      title: "Ambiguous Signal",
      seedQuery: "Ambiguous Signal",
      readiness: {
        ready: false,
        blockers: [{ code: "source-conflict", field: "title", message: "Official sources disagree on the title." }],
        warnings: [],
      },
      conflicts: [{
        fieldName: "title",
        message: "Official sources disagree on the title.",
        options: [{ sourceType: "rss", value: "Ambiguous Signal" }, { sourceType: "website", value: "Signal" }],
      }],
      fieldEvidence: [
        { id: 21, fieldName: "title", sourceType: "rss", confidence: 0.95, value: "Ambiguous Signal", normalizedValue: "Ambiguous Signal" },
        { id: 22, fieldName: "title", sourceType: "website", confidence: 0.95, value: "Signal", normalizedValue: "Signal" },
      ],
    }),
    createCandidate({
      id: "failed-1",
      status: "failed",
      title: "Temporarily Unavailable",
      seedQuery: "Temporarily Unavailable",
      preparedRecord: {},
      readiness: {
        ready: false,
        blockers: [{ code: "source-failure", field: "sources", message: "Feed fetch exhausted its retries." }],
        warnings: [],
      },
      coverStage: {},
      fieldEvidence: [],
      sources: [],
    }),
  ];

  try {
    await page.goto(`${baseUrl}/maintainer/imports.html`, { waitUntil: "networkidle" });
    await page.locator("#maintainerAuthPanel").waitFor({ state: "visible" });

    await page.route("**/api/maintainer/imports**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;
      const method = request.method();
      const respond = (payload, status = 200) => route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

      if (/\/runs\//.test(pathname)) {
        return respond({ run: { id: pathname.split("/").at(-1), status: "completed", progress: { total: 1, queued: 0, processing: 0, completed: 1, failed: 0 } } });
      }
      if (method === "POST" && pathname.endsWith("/evidence")) {
        calls.evidence += 1;
        return respond({ runId: "run-evidence", candidateIds: ["blocked-1"] }, 202);
      }
      if (method === "POST" && pathname.endsWith("/retry")) {
        calls.retry += 1;
        return respond({ runId: "run-retry", candidateIds: ["failed-1"] }, 202);
      }
      if (method === "POST" && pathname.endsWith("/publish")) {
        calls.publish += 1;
        candidates[0].status = "published";
        candidates[0].publishedShowId = "signal-test";
        return respond({ candidate: candidates[0], publishedShowId: "signal-test" });
      }
      if (method === "PATCH" && pathname.endsWith("/review")) {
        calls.review += 1;
        candidates[0].reviewedAt = "2026-07-14T10:30:00.000Z";
        candidates[0].reviewedBy = "QA";
        return respond({ candidate: candidates[0] });
      }
      if (method === "POST" && pathname === "/api/maintainer/imports") {
        calls.seed += 1;
        return respond({ runId: "run-seed", candidateIds: ["queued-1"] }, 202);
      }
      if (method === "GET" && pathname === "/api/maintainer/imports") {
        return respond(listPayload(candidates));
      }
      if (method === "GET") {
        const candidate = candidates.find((item) => pathname.endsWith(`/${item.id}`));
        if (candidate) return respond({ candidate });
      }
      return respond({ error: "Unhandled mocked import route." }, 500);
    });

    await page.locator("#maintainerPassphrase").fill("smoke-maintainer");
    await page.getByRole("button", { name: "Unlock import lane" }).click();
    await page.locator("#maintainerAppShell").waitFor({ state: "visible" });
    await page.getByText("Review and publish", { exact: true }).waitFor();
    assert.equal(await page.locator(".import-cover-preview img").count(), 1);
    assert.match(await page.locator("#maintainerDetail").innerText(), /Field provenance/);

    await page.locator("#maintainerImportSeedInput").fill("Another Show");
    await page.getByRole("button", { name: "Queue imports" }).click();
    await page.getByText("Preparation finished: 1 ready or reviewable, 0 failed.").waitFor();
    assert.equal(calls.seed, 1);

    await page.locator('[data-import-candidate-id="blocked-1"]').click();
    await page.getByText("Preparation blockers", { exact: true }).waitFor();
    assert.match(await page.locator("#maintainerDetail").innerText(), /Official sources disagree on the title/);
    await page.locator('[data-import-evidence-id="21"]').click();
    await page.waitForFunction(() => document.querySelector("#maintainerDetailMeta")?.textContent?.includes("Needs Review"));
    assert.equal(calls.evidence, 1);

    await page.locator('[data-import-candidate-id="failed-1"]').click();
    await page.getByRole("button", { name: "Retry failed import" }).click();
    await page.waitForFunction(() => document.querySelector("#maintainerDetailMeta")?.textContent?.includes("Failed"));
    assert.equal(calls.retry, 1);

    await page.locator('[data-import-candidate-id="ready-1"]').click();
    await page.locator('input[name="reviewedBy"]').fill("QA");
    await page.getByRole("button", { name: "Save review state" }).click();
    await page.getByText("Import review state saved.").waitFor();
    assert.equal(calls.review, 1);
    await page.getByRole("button", { name: "Approve and publish" }).click();
    await page.waitForFunction(() => document.querySelector("#maintainerDetailMeta")?.textContent?.includes("Published"));
    assert.equal(calls.publish, 1);
  } finally {
    await page.close();
  }
});
