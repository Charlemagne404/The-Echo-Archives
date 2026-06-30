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
  const page = await browser.newPage();

  try {
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
          /Corrections are for metadata and links/i.test(node.textContent || ""),
        ),
      undefined,
      { timeout: 5_000 },
    );
    await page.locator('.chat-action-link[href="/submit.html"]').waitFor();

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

    await page.goto(`${baseUrl}/submit.html`, { waitUntil: "networkidle" });
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
    await page.locator('.chat-action-link[href="/submit.html"]').waitFor();
    await page.getByRole("button", { name: "Close chat" }).click();
    await page.locator("#chat-container.is-open").waitFor({ state: "hidden" });

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

    await page.locator("[data-toggle-tag-picker]").click();
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

    await page.locator("#submitTagInput").fill("ghost story");
    await page.locator(".submit-tag-picker-menu:not([hidden])").waitFor();
    await page.locator("#submitTagInput").press("Enter");
    tagAndLinkState = await page.evaluate(() => ({
      selectedTags: Array.from(document.querySelectorAll(".submit-tag-picker-values .submit-chip")).map((node) =>
        node.textContent?.replace("×", "").trim(),
      ),
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      tagInputValue: document.getElementById("submitTagInput")?.value || "",
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
      await page.locator("[data-toggle-tag-picker]").click();
      await page.locator(".submit-tag-picker-menu:not([hidden])").waitFor();
      await page.locator(`.submit-tag-picker-menu:not([hidden]) [data-tag-suggestion="${tag}"]`).click();
    }

    tagAndLinkState = await page.evaluate(() => ({
      selectedTags: Array.from(document.querySelectorAll(".submit-tag-picker-values .submit-chip")).map((node) =>
        node.textContent?.replace("×", "").trim(),
      ),
      tagMenuOpen: !document.querySelector(".submit-tag-picker-menu")?.hasAttribute("hidden"),
      tagInputDisabled: Boolean(document.getElementById("submitTagInput")?.hasAttribute("disabled")),
      tagToggleDisabled: Boolean(document.querySelector("[data-toggle-tag-picker]")?.hasAttribute("disabled")),
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
    let formState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      reviewFieldVisible: Boolean(document.getElementById("submitReviewText")),
      proofFieldVisible: Boolean(document.getElementById("submitProofUrl")),
    }));
    assert.equal(formState.submissionType, "listener-review");
    assert.equal(formState.reviewFieldVisible, true);
    assert.equal(formState.proofFieldVisible, false);

    await page.locator('[data-submission-mode="creator-verification"]').click();
    await page.locator("#submitProofUrl").waitFor();
    await page.getByRole("button", { name: "Add another link" }).click();
    formState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      reviewFieldVisible: Boolean(document.getElementById("submitReviewText")),
      proofFieldVisible: Boolean(document.getElementById("submitProofUrl")),
      officialLinkRows: document.querySelectorAll('[data-link-list="officialLinks"][data-link-part="url"]').length,
    }));
    assert.equal(formState.submissionType, "creator-verification");
    assert.equal(formState.reviewFieldVisible, false);
    assert.equal(formState.proofFieldVisible, true);
    assert.equal(formState.officialLinkRows, 2);

    await page.locator('[data-submission-mode="correction"]').click();
    await page.locator("#submitExistingShowSearch").fill("Impact");
    await page.locator('[data-show-option-id="impact-winter"]').click();
    formState = await page.evaluate(() => ({
      submissionType: document.getElementById("submissionType")?.value || "",
      existingShowId: document.getElementById("existingShowId")?.value || "",
      showSearch: document.getElementById("submitExistingShowSearch")?.value || "",
    }));
    assert.equal(formState.submissionType, "correction");
    assert.equal(formState.existingShowId, "impact-winter");
    assert.equal(formState.showSearch, "Impact Winter");

    await page.goto(`${baseUrl}/submit.html?submissionType=listener-review&showId=impact-winter`, {
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

    await page.goto(`${baseUrl}/show.html?id=impact-winter`, { waitUntil: "networkidle" });
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
    assert.ok(chatState.actionHrefs.includes("/submit.html"));
  } finally {
    await page.close();
  }
});
