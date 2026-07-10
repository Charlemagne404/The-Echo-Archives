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
  global.EchoArchiveRecord = {};
}

function cleanupFrontendGlobals() {
  delete global.document;
  delete global.EchoArchiveSearch;
  delete global.EchoArchiveRecord;
}

test("archive score element renders missing archive ratings as Unrated", async () => {
  installFrontendGlobals();

  const { createArchiveScoreElement } = await import("../../shared/app/render-cards/scores.js");
  const score = createArchiveScoreElement({ finalRating: null });

  assert.match(score.innerHTML, /Unrated/);
  assert.doesNotMatch(score.innerHTML, />0\/10</);

  cleanupFrontendGlobals();
});

test("archive score element treats explicit zero as Unrated when requested", async () => {
  installFrontendGlobals();

  const { createArchiveScoreElement } = await import("../../shared/app/render-cards/scores.js");
  const score = createArchiveScoreElement({ finalRating: 0 }, { treatZeroAsUnrated: true });

  assert.match(score.innerHTML, /Unrated/);

  cleanupFrontendGlobals();
});
