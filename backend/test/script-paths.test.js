const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const REPO_ROOT = path.resolve(__dirname, "../..");

test("import and review scripts resolve the site root independently of the caller directory", () => {
  const env = { ...process.env };
  delete env.STATIC_ROOT;

  const script = [
    'const { resolveSiteRoot: resolveImportRoot } = require("./backend/scripts/import-helpers");',
    'const { resolveSiteRoot: resolveReviewRoot } = require("./backend/scripts/review-helpers");',
    'process.stdout.write(JSON.stringify([resolveImportRoot(), resolveReviewRoot()]));',
  ].join("\n");
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [REPO_ROOT, REPO_ROOT]);
});
