const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const scriptPath = path.resolve(__dirname, "../scripts/configure-access-observability.js");

test("access observability setup appends a private secret without printing it", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-access-setup-"));
  const envPath = path.join(tempRoot, ".env");
  try {
    fs.writeFileSync(envPath, "SITE_URL=https://echoarchives.net\n", { mode: 0o600 });
    const result = spawnSync(process.execPath, [scriptPath, "--env", envPath], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const contents = fs.readFileSync(envPath, "utf8");
    const secret = contents.match(/^ACCESS_LOG_HMAC_SECRET=(.+)$/m)?.[1];
    assert.equal(contents.match(/^ACCESS_LOG_ENABLED=true$/m)?.[0], "ACCESS_LOG_ENABLED=true");
    assert.ok(secret && secret.length >= 32);
    assert.doesNotMatch(result.stdout, new RegExp(secret));
    assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);

    const duplicate = spawnSync(process.execPath, [scriptPath, "--env", envPath], {
      encoding: "utf8",
    });
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /already configured/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
