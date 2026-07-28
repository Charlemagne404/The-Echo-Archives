const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const runbook = fs.readFileSync(
  path.resolve(__dirname, "../../deploy/COMPONENT_UPGRADE_RUNBOOK.md"),
  "utf8",
);

test("component upgrade runbook pins artifacts and keeps changes serial and reversible", () => {
  assert.match(runbook, /two separate maintenance events/);
  assert.match(runbook, /Caddy\s+`2\.11\.4`/);
  assert.match(runbook, /Ollama\s+`0\.32\.5`/);
  assert.match(runbook, /1c6f5404f3622e46d401d81f4af59677/);
  assert.match(runbook, /f7d6bdbcf71b83aa8670c4e7dc4b6936/);
  assert.match(runbook, /dpkg --force-confold --install .*2\.10\.2/);
  assert.match(runbook, /systemctl reload caddy/);
  assert.match(runbook, /127\.0\.0\.1:11434/);
  assert.match(runbook, /ollama-lib\.previous/);
  assert.match(runbook, /Models live separately and must not be\s+deleted/);
});
