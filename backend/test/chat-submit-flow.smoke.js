const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSummaryPayload,
  countDistinctRows,
  createEmptyDistribution,
  createSummary,
  getArchiveGridMotionState,
  getCenteredVisibleCollectionCard,
  getCollectionCarouselFocusState,
  getMostPopularBandState,
  getOverlayMetrics,
  getPreviewOverlapPoint,
  getSmokeContext,
  homeMostPopularIds,
  legacyRedirectManifest,
  scoreCatalog,
  setupSmoke,
  teardownSmoke,
  waitForMostPopularBandIds,
} = require("./helpers/browser-smoke");

let browser;
let baseUrl;
let showFixtures;
let collectionFixtures;
let firstCollectionId;
let firstShowId;
let homeMostPopularTitles;

test.before(async () => {
  await setupSmoke();

  ({
    browser,
    baseUrl,
    showFixtures,
    collectionFixtures,
    firstCollectionId,
    firstShowId,
    homeMostPopularTitles,
  } = getSmokeContext());
});

test.after(async () => {
  await teardownSmoke();
});

test("Ask the Archivist and the remade submit page interactions work across modes", async () => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();

  try {
    await page.route("**/api/submissions/shows/*/context", async (route) => {
      const showId = new URL(route.request().url()).pathname.split("/").at(-2);
      const show = showFixtures.find((entry) => entry.id === showId);
      await route.fulfill({
        status: show ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(show
          ? {
              show: {
                id: show.id,
                title: show.title,
                creators: show.creators || [],
                completionStatus: show.completionStatus || "unknown",
                officialDescription: "",
                listenLinks: [],
                officialLinks: [],
              },
            }
          : { error: "Show not found." }),
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    let chatState = await page.evaluate(() => ({
      placeholder: document.getElementById("userInput")?.getAttribute("placeholder") || "",
      suggestions: Array.from(document.querySelectorAll("#chatSuggestions .chat-suggestion")).map((node) =>
        node.textContent?.trim() || "",
      ),
    }));
    assert.match(chatState.placeholder, /archive|site works/i);
    assert.ok(chatState.suggestions.includes("How do I submit a correction?"));
    assert.ok(chatState.suggestions.includes("What does creator verified mean?"));

    await page.locator("#userInput").fill("How do I submit a correction?");
    await page.locator("#sendMessageButton").click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#chatLog .message.bot")).some((node) =>
          /Corrections are for factual metadata and links/i.test(node.textContent || ""),
        ),
      undefined,
      { timeout: 5_000 },
    );
    await page.locator('.chat-action-link[href="/submit"]').waitFor();

    await page.locator("#chat-clear").click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#chatLog .message.bot")).some((node) =>
          /Ask about a show, the archive, ratings, creators, runtime, transcripts, collections/i.test(node.textContent || ""),
        ),
      undefined,
      { timeout: 5_000 },
    );

    await page.locator("#userInput").fill("Recommend a finished sci-fi show");
    await page.locator("#sendMessageButton").click();
    await page.locator(".chat-recommendation-card").first().waitFor({ timeout: 5_000 });
    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });

    await page.goto(`${baseUrl}/submit`, { waitUntil: "networkidle" });
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    await page.locator("#userInput").fill("How do creator verification requests work?");
    await page.locator("#sendMessageButton").click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#chatLog .message.bot")).some((node) =>
          /creator verification|factual metadata/i.test(node.textContent || ""),
        ),
      undefined,
      { timeout: 5_000 },
    );
    await page.locator('.chat-action-link[href="/submit"]').waitFor();
    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });

    await page.locator("#submitPrimaryButton").click();
    await page.waitForFunction(
      () => document.getElementById("submitShowTitle")?.getAttribute("aria-invalid") === "true",
      undefined,
      { timeout: 5_000 },
    );
    let accessibilityState = await page.evaluate(() => {
      const titleInput = document.getElementById("submitShowTitle");
      const sourceGroup = document.getElementById("submitListenLinks");
      return {
        titleLabel: document.querySelector('label[for="submitShowTitle"]')?.textContent?.trim() || "",
        titleError: document.getElementById("submitShowTitleError")?.textContent?.trim() || "",
        titleInvalid: titleInput?.getAttribute("aria-invalid") || "",
        activeElementId: document.activeElement?.id || "",
        sourceRequired: sourceGroup?.getAttribute("aria-required") || "",
        statusRole: document.getElementById("submitStatus")?.getAttribute("role") || "",
        statusText: document.getElementById("submitStatus")?.textContent?.trim() || "",
      };
    });
    assert.match(accessibilityState.titleLabel, /Show title/);
    assert.equal(accessibilityState.titleInvalid, "true");
    assert.equal(accessibilityState.activeElementId, "submitShowTitle");
    assert.equal(accessibilityState.titleError, "Show title is required.");
    assert.equal(accessibilityState.sourceRequired, "true");
    assert.equal(accessibilityState.statusRole, "alert");
    assert.equal(accessibilityState.statusText, "Show title is required.");

    await page.goto(`${baseUrl}/submit`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#submitStatus").innerText(), "");
    await page.locator("#submitHelpfulDetails > summary").click();

    let tagAndLinkState = await page.evaluate(() => ({
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      completionTop: (() => {
        const field = document.getElementById("submitCompletionStatus");
        if (!field) {
          return 0;
        }
        const rect = field.getBoundingClientRect();
        return rect.top + window.scrollY;
      })(),
    }));
    assert.equal(tagAndLinkState.tagMenuOpen, false);
    const completionTopBeforeTagMenu = tagAndLinkState.completionTop;

    await page.locator('[data-toggle-tag-picker="selectedTags"]').click();
    await page.locator(".submit-tag-picker-menu:not([hidden])").waitFor();
    tagAndLinkState = await page.evaluate(() => ({
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      completionTop: (() => {
        const field = document.getElementById("submitCompletionStatus");
        if (!field) {
          return 0;
        }
        const rect = field.getBoundingClientRect();
        return rect.top + window.scrollY;
      })(),
    }));
    assert.equal(tagAndLinkState.tagMenuOpen, true);
    assert.equal(tagAndLinkState.completionTop, completionTopBeforeTagMenu);

    await page.locator('.submit-tag-picker-menu:not([hidden]) [data-tag-suggestion="Horror"]').click();
    tagAndLinkState = await page.evaluate(() => ({
      selectedTags: Array.from(document.querySelectorAll(".submit-tag-picker-values .submit-chip")).map((node) =>
        node.textContent?.replace("×", "").trim(),
      ),
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      completionTop: (() => {
        const field = document.getElementById("submitCompletionStatus");
        if (!field) {
          return 0;
        }
        const rect = field.getBoundingClientRect();
        return rect.top + window.scrollY;
      })(),
    }));
    assert.deepEqual(tagAndLinkState.selectedTags, ["Horror"]);
    assert.equal(tagAndLinkState.tagMenuOpen, false);
    assert.equal(tagAndLinkState.completionTop > 0, true);

    await page.locator('[data-tag-input="selectedTags"]').fill("ghost story");
    await page.locator(".submit-tag-picker-menu:not([hidden])").waitFor();
    await page.locator('[data-tag-input="selectedTags"]').press("Enter");
    tagAndLinkState = await page.evaluate(() => ({
      selectedTags: Array.from(document.querySelectorAll(".submit-tag-picker-values .submit-chip")).map((node) =>
        node.textContent?.replace("×", "").trim(),
      ),
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      tagInputValue: document.querySelector('[data-tag-input="selectedTags"]')?.value || "",
      completionTop: (() => {
        const field = document.getElementById("submitCompletionStatus");
        if (!field) {
          return 0;
        }
        const rect = field.getBoundingClientRect();
        return rect.top + window.scrollY;
      })(),
    }));
    assert.deepEqual(tagAndLinkState.selectedTags, ["Horror", "Ghost Story"]);
    assert.equal(tagAndLinkState.tagMenuOpen, false);
    assert.equal(tagAndLinkState.tagInputValue, "");

    for (const tag of ["Sci-fi", "Full-cast", "Mystery", "Serialized", "Thriller", "Comedy"]) {
      await page.locator('[data-toggle-tag-picker="selectedTags"]').click();
      await page.locator(".submit-tag-picker-menu:not([hidden])").waitFor();
      await page.locator(`.submit-tag-picker-menu:not([hidden]) [data-tag-suggestion="${tag}"]`).click();
    }

    tagAndLinkState = await page.evaluate(() => ({
      selectedTags: Array.from(document.querySelectorAll(".submit-tag-picker-values .submit-chip")).map((node) =>
        node.textContent?.replace("×", "").trim(),
      ),
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      tagInputDisabled: Boolean(document.querySelector('[data-tag-input="selectedTags"]')?.hasAttribute("disabled")),
      tagToggleDisabled: Boolean(document.querySelector('[data-toggle-tag-picker="selectedTags"]')?.hasAttribute("disabled")),
      tagLimitMessage: document.querySelector(".submit-tag-limit")?.textContent?.trim() || "",
    }));
    assert.equal(tagAndLinkState.selectedTags.length, 8);
    assert.equal(tagAndLinkState.tagMenuOpen, false);
    assert.equal(tagAndLinkState.tagInputDisabled, true);
    assert.equal(tagAndLinkState.tagToggleDisabled, true);
    assert.match(tagAndLinkState.tagLimitMessage, /Tag limit reached \(8\/8\)/);

    await page.locator('[data-add-link-option="listenLinks"][data-add-link-value="Apple Podcasts"]').click();
    tagAndLinkState = await page.evaluate(() => ({
      badgeLabels: Array.from(document.querySelectorAll(".submit-link-source-text")).map((node) => node.textContent?.trim()),
      selectValues: Array.from(document.querySelectorAll('[data-link-list="listenLinks"][data-link-part="label"]')).map((node) => node.value),
      removeIconSize: {
        width: window.getComputedStyle(document.querySelector(".submit-link-remove svg")).width,
        height: window.getComputedStyle(document.querySelector(".submit-link-remove svg")).height,
      },
      emptyStateVisible: Boolean(document.querySelector(".submit-link-list-empty")),
    }));
    assert.equal(tagAndLinkState.emptyStateVisible, false);
    assert.equal(tagAndLinkState.badgeLabels[0], "Apple Podcasts");
    assert.equal(tagAndLinkState.selectValues[0], "Apple Podcasts");
    assert.equal(tagAndLinkState.removeIconSize.width, "16px");
    assert.equal(tagAndLinkState.removeIconSize.height, "16px");

    await page.locator('[data-add-link-option="listenLinks"][data-add-link-value="RSS Feed"]').click();
    tagAndLinkState = await page.evaluate(() => ({
      selectValues: Array.from(document.querySelectorAll('[data-link-list="listenLinks"][data-link-part="label"]')).map((node) => node.value),
      addLinkOptionCount: document.querySelectorAll('[data-add-link-option="listenLinks"]').length,
    }));
    assert.deepEqual(tagAndLinkState.selectValues, ["Apple Podcasts", "RSS Feed"]);
    assert.equal(tagAndLinkState.addLinkOptionCount, 6);

    await page.locator('[data-submission-mode="listener-review"]').click();
    await page.locator("#submitReviewText").waitFor();
    await page.locator('.submit-lookup-status[data-state="ready"]').waitFor({
      state: "attached",
      timeout: 15_000,
    });
    let formState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      reviewFieldVisible: Boolean(document.getElementById("submitReviewText")),
      proofFieldVisible: Boolean(document.getElementById("submitProofUrl")),
      reviewTitleRequired: document.getElementById("submitReviewTitle")?.required || false,
      detailedRatingsOpen: document.getElementById("submitDetailedRatings")?.hasAttribute("open") || false,
      detailedRatingsSummary: document.querySelector("#submitDetailedRatings summary")?.textContent?.trim() || "",
    }));
    assert.equal(formState.submissionType, "listener-review");
    assert.equal(formState.reviewFieldVisible, true);
    assert.equal(formState.proofFieldVisible, false);
    assert.equal(formState.reviewTitleRequired, false);
    assert.equal(formState.detailedRatingsOpen, false);
    assert.match(formState.detailedRatingsSummary, /0 of 6 rated/);

    await page.locator("#submitDetailedRatings > summary").click();
    await page.locator('[data-category-score="ads"][data-category-score-value="8"]').click();
    formState = await page.evaluate(() => ({
      summary: document.querySelector("#submitDetailedRatings summary")?.textContent?.trim() || "",
      selected: document.querySelector('[data-category-score="ads"][aria-checked="true"]')?.textContent?.trim() || "",
      adLabel: document.querySelector('[data-category-score-group="ads"] .submit-category-rating-label')?.textContent?.trim() || "",
      lengthHelp: document.querySelector('[data-category-score-group="length"] .submit-category-rating-help')?.textContent?.trim() || "",
    }));
    assert.match(formState.summary, /1 of 6 rated/);
    assert.equal(formState.selected, "8");
    assert.equal(formState.adLabel, "Ad experience");
    assert.match(formState.lengthHelp, /feels right for the show/i);
    await page.locator('[data-clear-category-score="ads"]').click();
    assert.match(await page.locator("#submitDetailedRatings > summary").innerText(), /0 of 6 rated/);

    await page.locator('[data-submission-mode="creator-verification"]').click();
    await page.locator("#submitContactEmail").waitFor();
    formState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      reviewFieldVisible: Boolean(document.getElementById("submitReviewText")),
      proofFieldVisible: Boolean(document.getElementById("submitProofUrl")),
      contactEmailVisible: Boolean(document.getElementById("submitContactEmail")),
      officialLinkRows: document.querySelectorAll('[data-link-list="officialLinks"][data-link-part="url"]').length,
      officialLinkButtons: document.querySelectorAll('[data-add-link-option="officialLinks"]').length,
      emptyStateVisible: Boolean(document.querySelector(".submit-link-list-empty")),
    }));
    assert.equal(formState.submissionType, "creator-verification");
    assert.equal(formState.reviewFieldVisible, false);
    assert.equal(formState.proofFieldVisible, false);
    assert.equal(formState.contactEmailVisible, true);
    assert.equal(formState.officialLinkRows, 0);
    assert.equal(formState.officialLinkButtons, 8);
    assert.equal(formState.emptyStateVisible, true);

    await page.locator('[data-segment-field="verificationMethod"][data-segment-value="official-domain-email"]').focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-segment-field="verificationMethod"][data-segment-value="website"]')
          ?.getAttribute("aria-checked") === "true" &&
        Boolean(document.getElementById("submitProofUrl")),
      undefined,
      { timeout: 5_000 },
    );
    assert.equal(await page.locator("#submitContactEmail").count(), 0);
    assert.equal(
      await page.locator('[data-segment-field="verificationMethod"][data-segment-value="website"]').getAttribute("aria-checked"),
      "true",
    );
    await page.locator("#submitAdditionalVerification > summary").click();

    await page.locator('[data-add-link-option="officialLinks"][data-add-link-value="Website"]').click();
    formState = await page.evaluate(() => ({
      officialLinkRows: document.querySelectorAll('[data-link-list="officialLinks"][data-link-part="url"]').length,
      firstOfficialLinkLabel: document.querySelector('[data-link-list="officialLinks"][data-link-part="label"]')?.value || "",
      emptyStateVisible: Boolean(document.querySelector(".submit-link-list-empty")),
    }));
    assert.equal(formState.officialLinkRows, 1);
    assert.equal(formState.firstOfficialLinkLabel, "Website");
    assert.equal(formState.emptyStateVisible, false);

    await page.locator('[data-remove-link="officialLinks"][data-link-index="0"]').click();
    formState = await page.evaluate(() => ({
      officialLinkRows: document.querySelectorAll('[data-link-list="officialLinks"][data-link-part="url"]').length,
      emptyStateVisible: Boolean(document.querySelector(".submit-link-list-empty")),
    }));
    assert.equal(formState.officialLinkRows, 0);
    assert.equal(formState.emptyStateVisible, true);

    await page.locator('[data-submission-mode="correction"]').click();
    await page.locator("#submitExistingShowSearch").fill("Impact");
    await page.locator("#submitExistingShowSearch").press("ArrowDown");
    const activeDescendant = await page.locator("#submitExistingShowSearch").getAttribute("aria-activedescendant");
    assert.match(activeDescendant || "", /submitExistingShowSearchResultsOption\d+/);
    assert.equal(
      await page.locator(`#${activeDescendant} .submit-search-result-title`).innerText(),
      "Impact Winter",
    );
    const showContextResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/submissions/shows/impact-winter/context",
      { timeout: 15_000 },
    );
    await page.locator("#submitExistingShowSearch").press("Enter");
    assert.equal((await showContextResponse).status(), 200);
    await page.waitForFunction(
      () => document.getElementById("existingShowId")?.value === "impact-winter" &&
        document.getElementById("submitExistingShowSearch")?.value === "Impact Winter" &&
        document.querySelector(".submit-current-show h3")?.textContent?.trim() === "Impact Winter",
      undefined,
      { timeout: 15_000 },
    );
    formState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      existingShowId: document.getElementById("existingShowId")?.value || "",
      showSearch: document.getElementById("submitExistingShowSearch")?.value || "",
      currentShowTitle: document.querySelector(".submit-current-show h3")?.textContent?.trim() || "",
    }));
    assert.equal(formState.submissionType, "correction");
    assert.equal(formState.existingShowId, "impact-winter");
    assert.equal(formState.showSearch, "Impact Winter");
    assert.equal(formState.currentShowTitle, "Impact Winter");

    await page.goto(`${baseUrl}/submit?submissionType=listener-review&showId=impact-winter`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(
      () => {
        const submissionType = document.getElementById("submissionType");
        const existingShowId = document.getElementById("existingShowId");
        return Boolean(
          submissionType instanceof HTMLInputElement &&
            existingShowId instanceof HTMLInputElement &&
            submissionType.value === "listener-review" &&
            existingShowId.value === "impact-winter",
        );
      },
      undefined,
      { timeout: 5_000 },
    );

    const deepLinkState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      existingShowId: document.getElementById("existingShowId")?.value || "",
      showSearch: document.getElementById("submitExistingShowSearch")?.value || "",
      reviewFieldVisible: Boolean(document.getElementById("submitReviewText")),
      ratingButtons: document.querySelectorAll("[data-rating-stars]").length,
    }));
    assert.equal(deepLinkState.submissionType, "listener-review");
    assert.equal(deepLinkState.existingShowId, "impact-winter");
    assert.equal(deepLinkState.showSearch, "Impact Winter");
    assert.equal(deepLinkState.reviewFieldVisible, true);
    assert.equal(deepLinkState.ratingButtons, 5);

    await page.goto(`${baseUrl}/shows/impact-winter`, { waitUntil: "networkidle" });
    await page.locator("#chat-toggle").click();
    await page.locator("#chat-container.is-open").waitFor();
    await page.locator("#userInput").fill("What does creator verified mean?");
    await page.locator("#sendMessageButton").click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("#chatLog .message.bot")).some((node) =>
          /Impact Winter is marked creator verified/i.test(node.textContent || ""),
        ),
      undefined,
      { timeout: 5_000 },
    );
    chatState = await page.evaluate(() => ({
      actionHrefs: Array.from(document.querySelectorAll(".chat-action-link")).map((node) => node.getAttribute("href") || ""),
    }));
    assert.ok(chatState.actionHrefs.includes("/submit"));
  } finally {
    await context.close();
  }
});

test("submit defers archive lookup and keeps the new-show intake usable when lookup fails", async () => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  let lookupRequests = 0;

  try {
    await page.route("**/data/search-index.json*", async (route) => {
      lookupRequests += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' });
    });
    await page.goto(`${baseUrl}/submit`, { waitUntil: "networkidle" });

    assert.ok((await page.locator("#submitModeCards [data-submission-mode]").count()) > 0);
    await page.locator("#submitShowTitle").waitFor();
    assert.equal(lookupRequests, 0, "default new-show intake should not request the search index");

    await page.locator('[data-submission-mode="correction"]').click();
    await page.locator('.submit-lookup-status[data-state="error"]').waitFor();
    assert.equal(lookupRequests, 1);
    assert.match(await page.locator(".submit-lookup-status").innerText(), /temporarily unavailable/i);
    assert.equal(await page.locator("#submitExistingShowSearch").isDisabled(), true);
    assert.equal(await page.locator("[data-retry-submit-lookup]").isVisible(), true);

    await page.locator('[data-submission-mode="show"]').click();
    await page.locator("#submitShowTitle").fill("Still usable without lookup");
    assert.equal(await page.locator("#submitShowTitle").inputValue(), "Still usable without lookup");
  } finally {
    await context.close();
  }
});

test("show context failures stay non-blocking and stale responses cannot replace a newer selection", async () => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const contextPattern = "**/api/submissions/shows/*/context";

  try {
    await page.route(contextPattern, async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' });
    });
    await page.goto(`${baseUrl}/submit?submissionType=correction&showId=impact-winter`, { waitUntil: "networkidle" });
    await page.locator('.submit-current-show[data-state="error"]').waitFor({ timeout: 10_000 });
    assert.equal(await page.locator("#existingShowId").inputValue(), "impact-winter");
    assert.match(await page.locator(".submit-current-show").innerText(), /still submit/i);

    await page.unroute(contextPattern);
    await page.route(contextPattern, async (route) => {
      const showId = new URL(route.request().url()).pathname.split("/").at(-2);
      if (showId === "impact-winter") {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      const show = showId === "solar"
        ? { id: "solar", title: "Solar", creators: ["CurtCo Media"], completionStatus: "completed" }
        : { id: "impact-winter", title: "Impact Winter", creators: ["Travis Beacham"], completionStatus: "ongoing" };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ show: { ...show, officialDescription: "", listenLinks: [], officialLinks: [] } }),
      });
    });

    await page.goto(`${baseUrl}/submit?submissionType=correction`, { waitUntil: "networkidle" });
    await page.locator("#submitExistingShowSearch").fill("Impact");
    await page.locator("#submitExistingShowSearch").press("ArrowDown");
    await page.locator("#submitExistingShowSearch").press("Enter");
    await page.locator("#submitExistingShowSearch").fill("Solar");
    await page.locator("#submitExistingShowSearch").press("ArrowDown");
    await page.locator("#submitExistingShowSearch").press("Enter");
    await page.waitForFunction(
      () => document.getElementById("existingShowId")?.value === "solar" &&
        document.querySelector(".submit-current-show h3")?.textContent?.trim() === "Solar",
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(500);
    assert.equal(await page.locator("#existingShowId").inputValue(), "solar");
    assert.equal(await page.locator(".submit-current-show h3").innerText(), "Solar");
  } finally {
    await context.close();
  }
});

test("submit success and failure flows use one persistent result surface and preserve retry data", async () => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();

  async function fillValidShowSubmission() {
    await page.locator("#submitShowTitle").fill("Launch Test Show");
    await page.locator('[data-add-link-option="listenLinks"][data-add-link-value="Apple Podcasts"]').click();
    await page.locator('[data-link-list="listenLinks"][data-link-part="url"]').fill("https://podcasts.apple.com/us/podcast/launch-test-show/id123456789");
  }

  try {
    await page.goto(`${baseUrl}/submit`, { waitUntil: "networkidle" });
    await page.route("**/api/submissions/shows", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ accepted: true, submissionId: "smoke-submission" }),
      });
    });
    await fillValidShowSubmission();
    await page.locator('button[type="submit"]').click();
    const pendingState = await page.evaluate(() => ({
      busy: document.getElementById("showSubmitForm")?.getAttribute("aria-busy") || "",
      disabled: document.getElementById("submitPrimaryButton")?.hasAttribute("disabled") || false,
      label: document.getElementById("submitPrimaryButtonText")?.textContent?.trim() || "",
    }));
    assert.deepEqual(pendingState, { busy: "true", disabled: true, label: "Submitting new show…" });
    await page.waitForFunction(
      () => !document.getElementById("submitResultPanel")?.hasAttribute("hidden"),
      undefined,
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => document.activeElement?.matches("#submitResultPanel h2"),
      undefined,
      { timeout: 5_000 },
    );

    const successState = await page.evaluate(() => ({
      result: document.getElementById("submitResultPanel")?.textContent?.trim() || "",
      formHidden: document.getElementById("showSubmitForm")?.hasAttribute("hidden") || false,
      activeTag: document.activeElement?.tagName || "",
      toastCount: document.querySelectorAll(".archive-toast-message").length,
    }));
    assert.match(successState.result, /New show received for archive screening\./);
    assert.match(successState.result, /Submit another/);
    assert.equal(successState.formHidden, true);
    assert.equal(successState.activeTag, "H2");
    assert.equal(successState.toastCount, 0);

    await page.unroute("**/api/submissions/shows");
    await page.route("**/api/submissions/shows", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Submission failed with 500" }),
      });
    });

    await page.locator("[data-submit-another]").click();
    await fillValidShowSubmission();
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(
      () => document.getElementById("submitStatus")?.textContent?.includes("Your entries are still here"),
      undefined,
      { timeout: 5_000 },
    );

    const failureState = await page.evaluate(() => ({
      status: document.getElementById("submitStatus")?.textContent?.trim() || "",
      activeElementId: document.activeElement?.id || "",
      showTitle: document.getElementById("submitShowTitle")?.value || "",
      toastCount: document.querySelectorAll(".archive-toast-message").length,
    }));
    assert.equal(failureState.status, "Submission failed with 500. Your entries are still here; try again.");
    assert.equal(failureState.activeElementId, "submitStatus");
    assert.equal(failureState.showTitle, "Launch Test Show");
    assert.equal(failureState.toastCount, 0);

    await page.unroute("**/api/submissions/shows");
    await page.route("**/api/submissions/shows", async (route) => {
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "45" },
        contentType: "application/json",
        body: JSON.stringify({ error: "Too many submissions" }),
      });
    });
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(
      () => document.getElementById("submitStatus")?.textContent?.includes("Try again in 45 seconds"),
      undefined,
      { timeout: 5_000 },
    );
    assert.match(await page.locator("#submitStatus").innerText(), /Too many submissions.*45 seconds/);

    await page.unroute("**/api/submissions/shows");
    await page.route("**/api/submissions/shows", async (route) => route.abort("failed"));
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(
      () => document.getElementById("submitStatus")?.textContent?.includes("Check your connection"),
      undefined,
      { timeout: 5_000 },
    );
    assert.equal(await page.locator("#submitShowTitle").inputValue(), "Launch Test Show");
  } finally {
    await context.close();
  }
});
