const test = require("node:test");
const assert = require("node:assert/strict");

function createMockElement(tagName) {
  return {
    tagName: String(tagName || "").toUpperCase(),
    className: "",
    innerHTML: "",
    hidden: false,
    dataset: {},
    attributes: {},
    children: [],
    append(...nodes) {
      this.children.push(...nodes);
    },
    appendChild(node) {
      this.children.push(node);
      return node;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function installFrontendGlobals() {
  global.document = {
    body: { dataset: {} },
    createElement: createMockElement,
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
  };
  global.EchoArchiveSearch = {};
  global.EchoArchiveRecord = require("../../shared/archive-record.js");
}

function cleanupFrontendGlobals() {
  delete global.document;
  delete global.EchoArchiveSearch;
  delete global.EchoArchiveRecord;
}

test("archive score element renders missing and invalid archive ratings as Unrated", async () => {
  installFrontendGlobals();

  const { createArchiveScoreElement } = await import("../../shared/app/render-cards/scores.js");
  [null, undefined, "", "   ", "not rated", "8.5", Number.NaN].forEach((finalRating) => {
    const score = createArchiveScoreElement({ finalRating });
    assert.match(score.innerHTML, /Unrated/);
    assert.doesNotMatch(score.innerHTML, /\b0(?:\.0)?\/10\b/);
  });

  cleanupFrontendGlobals();
});

test("archive score element preserves genuine numeric archive ratings", async () => {
  installFrontendGlobals();

  const { createArchiveScoreElement } = await import("../../shared/app/render-cards/scores.js");
  const score = createArchiveScoreElement({ finalRating: 8.5 });

  assert.match(score.innerHTML, />8\.5\/10</);
  assert.doesNotMatch(score.innerHTML, /Unrated/);

  cleanupFrontendGlobals();
});

test("archive score element treats explicit zero as Unrated when requested", async () => {
  installFrontendGlobals();

  const { createArchiveScoreElement } = await import("../../shared/app/render-cards/scores.js");
  const score = createArchiveScoreElement({ finalRating: 0 }, { treatZeroAsUnrated: true });

  assert.match(score.innerHTML, /Unrated/);

  cleanupFrontendGlobals();
});

test("primary card score preserves Archive Rating and otherwise uses the written-review score", async () => {
  installFrontendGlobals();

  const { createPrimaryScoreElement } = await import("../../shared/app/render-cards/scores.js");
  const archiveScore = createPrimaryScoreElement({ finalRating: 8.5, listenerReviewScore: { averageRating: 9.2, reviewCount: 6 } });
  const listenerScore = createPrimaryScoreElement({ finalRating: null, listenerReviewScore: { averageRating: 8.25, reviewCount: 6 } });
  const emptyListenerScore = createPrimaryScoreElement({ finalRating: null, listenerReviewScore: { averageRating: null, reviewCount: 0 } });

  assert.match(archiveScore.className, /archive-inline-score/);
  assert.match(archiveScore.innerHTML, />8\.5\/10</);
  assert.match(listenerScore.className, /listener-review-inline-score/);
  assert.match(listenerScore.innerHTML, /listener-review-score-icon/);
  assert.match(listenerScore.innerHTML, /Listener Review Score/);
  assert.match(listenerScore.innerHTML, />8\.3\/10</);
  assert.equal(listenerScore.attributes["aria-label"], "Listener Review Score 8.3/10 from 6 reviews.");
  assert.match(emptyListenerScore.innerHTML, /--\/10/);
  assert.equal(emptyListenerScore.attributes["aria-label"], "Listener Review Score --/10. No published listener reviews yet.");

  cleanupFrontendGlobals();
});

test("client card badges distinguish Imported entries from full reviews", async () => {
  installFrontendGlobals();
  const { createEditorialBadges } = await import("../../shared/app/render-cards/badges.js");
  const badges = createEditorialBadges({ reviewStatus: "imported", finalRating: null });

  assert.equal(badges.children.length, 1);
  assert.match(badges.children[0].className, /editorial-badge-imported/);
  assert.equal(badges.children[0].textContent, "Imported");
  cleanupFrontendGlobals();
});

test("client card metadata mirrors the Imported source-genre policy", async () => {
  installFrontendGlobals();
  const { formatCardDiscoveryMetadata } = await import("../../shared/app/render-cards/shared.js");

  assert.equal(
    formatCardDiscoveryMetadata({ reviewStatus: "imported", genres: ["drama", "sci-fi"], tags: [] }, 2),
    "Genre: Sci-Fi",
  );
  assert.equal(
    formatCardDiscoveryMetadata({ reviewStatus: "imported", genres: ["drama"], tags: [] }, 2),
    "Genre not yet reviewed",
  );
  assert.equal(
    formatCardDiscoveryMetadata({ reviewStatus: "indexed-only", genres: ["sci-fi"], tags: ["Space"] }, 2),
    "Space",
  );

  cleanupFrontendGlobals();
});
