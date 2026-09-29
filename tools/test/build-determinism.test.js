const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { describeDifferences } = require("../check-build-determinism");
const { listBuildOutputs } = require("../build-pages");

const root = path.resolve(__dirname, "../..");

test("build determinism reports changed, added, and removed generated outputs", () => {
  assert.deepEqual(
    describeDifferences([["changed.html", "old"], ["removed.css", "old"]], [["added.js", "new"], ["changed.html", "new"]]),
    ["added: added.js", "changed: changed.html", "removed: removed.css"],
  );
});

test("the generated-output manifest covers route, alias, creator, asset, and service-worker outputs", () => {
  const outputs = new Set(listBuildOutputs());
  const entities = JSON.parse(fs.readFileSync(path.join(root, "data", "entities.json"), "utf8"));

  for (const output of ["index.html", "maintainer/analytics.html", "about/index.html", "style.css", "script.js", "sw.js", "sitemap.xml"]) {
    assert.equal(outputs.has(output), true, `${output} should be fingerprinted by the reproducibility check.`);
  }
  assert.equal(outputs.has(`creators/${entities[0].id}/index.html`), true);
});
