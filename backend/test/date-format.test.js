const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

test("date-only archive dates do not shift for time zones west of UTC", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      [
        'const { formatDate } = require("./lib/ai/site-help-format");',
        'process.stdout.write(formatDate("2026-06-02"));',
      ].join(""),
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        TZ: "America/Los_Angeles",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "June 2, 2026");
});
