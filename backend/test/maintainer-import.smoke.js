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
      reviewStatus: "imported",
      releaseStatus: "active",
      completionStatus: "unclear",
      listenLinks: { rss: "https://example.com/feed.xml" },
    },
    readiness: {
      ready: true,
      blockers: [],
      warnings: ["No structured transcript links were exposed by the feed."],
      updateDiff: [],
      publicationEligibility: {
        imported: { eligible: true, blockers: [] },
        indexedOnly: { eligible: false, blockers: [{ code: "facts-not-reviewed", message: "A current factual review is required." }] },
      },
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

test("maintainer import workspace handles progress, batch preparation, blockers, evidence, retry, review, and approval", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const calls = { evidence: 0, publish: 0, retry: 0, review: 0, seed: 0, rerunAll: 0, lastReviewPayload: null, lastPublishPayload: null };
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
      if (method === "POST" && pathname === "/api/maintainer/imports/prepare-all") {
        calls.rerunAll += 1;
        return respond({ runId: "run-prepare-all", candidateIds: ["ready-1", "blocked-1", "failed-1"] }, 202);
      }
      if (method === "POST" && pathname.endsWith("/publish")) {
        calls.publish += 1;
        calls.lastPublishPayload = JSON.parse(request.postData() || "{}");
        candidates[0].status = "published";
        candidates[0].publishedShowId = "signal-test";
        return respond({ candidate: candidates[0], publishedShowId: "signal-test" });
      }
      if (method === "PATCH" && pathname.endsWith("/review")) {
        calls.review += 1;
        calls.lastReviewPayload = JSON.parse(request.postData() || "{}");
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
    await page.route("**/api/maintainer/elevations**", async (route) => {
      const url = new URL(route.request().url());
      const target = url.searchParams.get("target") || "indexed-only";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          target,
          items: [{
            showId: "signal-test",
            title: "Signal Test",
            reviewStatus: "imported",
            target,
            score: 85,
            factors: ["Clear in-scope identity", "Strong factual baseline"],
            blockers: [],
            eligible: true,
          }],
        }),
      });
    });

    await page.locator("#maintainerPassphrase").fill("smoke-maintainer");
    await page.getByRole("button", { name: "Unlock import lane" }).click();
    await page.locator("#maintainerAppShell").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "maintainerWorkspaceTitle" && window.scrollY <= 1);
    await page.getByText("Review and publish", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "What to flesh out next" }).waitFor();
    assert.equal(await page.getByText("Clear in-scope identity", { exact: false }).count() > 0, true);
    assert.equal(await page.locator(".import-cover-preview img").count(), 1);
    assert.deepEqual(await page.locator(".import-cover-preview img").evaluate((image) => [image.getAttribute("width"), image.getAttribute("height")]), ["112", "112"]);
    assert.match(await page.locator("#maintainerDetail").innerText(), /Field provenance/);
    await page.getByRole("button", { name: "Select eligible on page" }).click();
    assert.equal(await page.locator('[data-import-batch-select="ready-1"]').isChecked(), true);
    assert.equal(await page.getByRole("button", { name: "Publish selected as Imported" }).isEnabled(), true);
    await page.locator('[data-import-batch-select="ready-1"]').uncheck();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Re-run all preparation" }).click();
    await page.waitForFunction(() => document.querySelector("#maintainerListStatus")?.textContent?.includes("Showing"));
    assert.equal(calls.rerunAll, 1);

    await page.locator("#maintainerImportSeedInput").fill("Another Show");
    await page.getByRole("button", { name: "Queue imports" }).evaluate((button) => {
      button.click();
      button.click();
    });
    await page.getByText("Preparation finished: 1 ready or reviewable, 0 failed.").waitFor();
    assert.equal(calls.seed, 1);

    await page.locator('[data-import-candidate-id="blocked-1"]').click();
    await page.waitForFunction(() => document.activeElement?.id === "maintainerDetailHeading");
    await page.getByText("Preparation blockers", { exact: true }).waitFor();
    assert.match(await page.locator("#maintainerDetail").innerText(), /Official sources disagree on the title/);
    await page.getByRole("button", { name: "Back to queue" }).click();
    await page.waitForFunction(() => document.activeElement?.id === "maintainerListHeading");
    await page.locator('[data-import-evidence-id="21"]').click();
    await page.waitForFunction(() => document.querySelector("#maintainerDetailMeta")?.textContent?.includes("Needs Review"));
    assert.equal(calls.evidence, 1);

    await page.locator('[data-import-candidate-id="failed-1"]').click();
    await page.getByRole("button", { name: "Retry failed import" }).click();
    await page.waitForFunction(() => document.querySelector("#maintainerDetailMeta")?.textContent?.includes("Failed"));
    assert.equal(calls.retry, 1);

    await page.locator('[data-import-candidate-id="ready-1"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("#maintainerImportReviewForm")?.getAttribute("data-import-candidate-id") === "ready-1" &&
        document.querySelector("#maintainerDetailMeta")?.textContent?.includes("Ready"),
    );
    await page.locator("[data-import-verification-response]").fill(JSON.stringify({
      verified: { title: "Signal Test", tags: ["Science Fiction", "Space"] },
      enrichment: {
        formats: ["Serialized", "Full cast"],
        tones: ["Atmospheric"],
        people: [{ name: "Alex Writer", role: "writer" }],
        cadenceLabel: "Weekly",
      },
      source_urls: ["https://example.com/feed.xml"],
      field_sources: { formats: ["https://example.com/about"] },
    }));
    await page.getByRole("button", { name: "Preview verified fields" }).click();
    const applyVerifiedFields = page.getByRole("button", { name: "Apply verified fields to editor" });
    await page.waitForFunction(
      () => !document.querySelector("[data-import-verification-apply]")?.hasAttribute("disabled"),
    );
    assert.match(await page.locator("[data-import-verification-preview-result]").innerText(), /Catalog enrichment ready:/);
    await applyVerifiedFields.click();
    assert.equal(await page.locator('input[name="formats"]').inputValue(), "Serialized, Full cast");
    assert.equal(await page.locator('input[name="cadenceLabel"]').inputValue(), "Weekly");
    assert.equal(await page.locator('textarea[name="credits"]').inputValue(), "Alex Writer — writer");
    await page.getByRole("button", { name: "Save show details" }).click();
    await page.getByText("Import review state saved.").waitFor();
    assert.equal(calls.lastReviewPayload.details.formats, "Serialized, Full cast");
    assert.match(calls.lastReviewPayload.details.externalVerification, /https:\/\/example\.com\/about/);
    await page.locator('input[name="reviewedBy"]').fill("QA");
    await page.getByRole("button", { name: "Save review state" }).click();
    await page.getByText("Import review state saved.").waitFor();
    assert.equal(calls.review, 2);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Publish as Imported" }).click();
    await page.waitForFunction(() => document.querySelector("#maintainerDetailMeta")?.textContent?.includes("Published"));
    assert.equal(calls.publish, 1);
    assert.equal(calls.lastPublishPayload.publicationTier, "imported");

    const failImportQueue = (route) => route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary maintainer outage." }),
    });
    await page.route("**/api/maintainer/imports**", failImportQueue);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#maintainerStatePanel").waitFor({ state: "visible" });
    assert.equal(await page.locator("body").getAttribute("data-maintainer-state"), "error");
    assert.match(await page.locator("#maintainerStateMessage").innerText(), /temporary maintainer outage/i);
    assert.equal(await page.locator("#maintainerRetryButton").isVisible(), true);
    assert.equal(await page.locator("#maintainerAppShell").isHidden(), true);
    await page.unroute("**/api/maintainer/imports**", failImportQueue);
    await page.getByRole("button", { name: "Retry" }).click();
    await page.locator("#maintainerAppShell").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Refresh queue" }).waitFor({ state: "visible" });

    const expireSession = (route) => route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Maintainer authentication required." }),
    });
    await page.unroute("**/api/maintainer/imports**");
    await page.route("**/api/maintainer/imports**", expireSession);
    await page.getByRole("button", { name: "Refresh queue" }).click();
    await page.locator("#maintainerAuthPanel").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.body.dataset.maintainerState === "authRequired");
    assert.equal(await page.locator("body").getAttribute("data-maintainer-state"), "authRequired");
    assert.match(await page.locator("#maintainerAuthStatus").innerText(), /session expired/i);
  } finally {
    await context.close();
  }
});

test("maintainer reports expose focused, overflow-safe ready states on mobile", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const emptyReport = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 200,
    counts: { status: {} },
  };

  await page.route("**/api/maintainer/imports**", async (route) => {
    const authenticated = (await context.cookies()).some((cookie) => cookie.name === "echo-maintainer-session");
    return route.fulfill({
      status: authenticated ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(authenticated ? emptyReport : { error: "Maintainer authentication required." }),
    });
  });
  await page.route("**/api/maintainer/submissions**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(emptyReport),
  }));

  try {
    await page.goto(`${baseUrl}/maintainer/imports/report.html`, { waitUntil: "networkidle" });
    await page.locator("#maintainerAuthPanel").waitFor({ state: "visible" });
    await page.locator("#maintainerPassphrase").fill("smoke-maintainer");
    await page.getByRole("button", { name: "Unlock report" }).click();
    await page.locator("#maintainerReportShell").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.id === "maintainerWorkspaceTitle" && window.scrollY <= 1);
    assert.equal(await page.locator("body").getAttribute("data-maintainer-state"), "ready");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);

    await page.goto(`${baseUrl}/maintainer/submissions/report.html`, { waitUntil: "networkidle" });
    await page.locator("#maintainerReportShell").waitFor({ state: "visible" });
    assert.equal(await page.locator("body").getAttribute("data-maintainer-state"), "ready");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
  } finally {
    await context.close();
  }
});
