const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("Caddy origin candidate tooling is guarded and documents rollback", () => {
  const scriptPath = path.join(ROOT, "deploy/prepare-caddy-origin-candidate.sh");
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);

  const script = read("deploy/prepare-caddy-origin-candidate.sh");
  assert.match(script, /refusing to overwrite existing candidate/);
  assert.match(script, /already has global options/);
  assert.match(script, /caddy validate --config/);
  assert.doesNotMatch(script, /caddy fmt/, "Unrelated shared-host blocks must not be reformatted.");
  assert.match(script, /Caddyfile\.global\.echo/);
  assert.match(script, /Caddyfile\.echo/);

  const runbook = read("deploy/CADDY_ORIGIN_RUNBOOK.md");
  assert.match(runbook, /systemctl reload caddy/);
  assert.match(runbook, /preserved\/Caddyfile/);
  assert.match(runbook, /direct IP access/);
  assert.match(runbook, /two external clients/);
  assert.match(runbook, /unrelated shared-host service/);
});
