const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const script = path.join(ROOT, "tools/prune-local-backups.js");

test("local retention is dry-run-first, keeps a floor, and requires offsite confirmation", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-local-retention-"));
  try {
    for (let index = 0; index < 10; index += 1) {
      const filePath = path.join(
        tempRoot,
        `community-2026-06-${String(index + 1).padStart(2, "0")}T00-00-00-000Z.sqlite`,
      );
      fs.writeFileSync(filePath, "test");
      const ageDays = index < 8 ? 60 - index : 2;
      const timestamp = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
      fs.utimesSync(filePath, timestamp, timestamp);
    }
    fs.writeFileSync(path.join(tempRoot, "do-not-touch.txt"), "safe");

    const args = [
      script,
      "--directory",
      tempRoot,
      "--retention-days",
      "30",
      "--minimum-keep",
      "7",
    ];
    const dryRun = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Would remove 3 local backup/);
    assert.equal(fs.readdirSync(tempRoot).filter((name) => name.endsWith(".sqlite")).length, 10);

    const unconfirmed = spawnSync(process.execPath, [...args, "--apply"], { encoding: "utf8" });
    assert.notEqual(unconfirmed.status, 0);
    assert.match(unconfirmed.stderr, /requires --offsite-verified/);

    const applied = spawnSync(
      process.execPath,
      [...args, "--apply", "--offsite-verified"],
      { encoding: "utf8" },
    );
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /Removed 3 local backup/);
    assert.equal(fs.readdirSync(tempRoot).filter((name) => name.endsWith(".sqlite")).length, 7);
    assert.equal(fs.readFileSync(path.join(tempRoot, "do-not-touch.txt"), "utf8"), "safe");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
