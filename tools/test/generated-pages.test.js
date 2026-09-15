const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  GENERATED_PAGE_BANNER,
  expectedGeneratedPagePaths,
  listGeneratedHtmlPaths,
} = require("../lib/generated-pages");

const ROOT = path.resolve(__dirname, "../..");

test("build:pages output covers every manifest route, clean alias, and public creator page", () => {
  const expected = expectedGeneratedPagePaths(ROOT);
  const actual = listGeneratedHtmlPaths(ROOT);

  assert.ok(expected.size > 0, "the current catalog should produce a non-empty generated page set");
  assert.deepEqual([...actual].sort(), [...expected].sort());

  expected.forEach((relativePath) => {
    const contents = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    assert.ok(contents.includes(GENERATED_PAGE_BANNER), relativePath);
  });
});
