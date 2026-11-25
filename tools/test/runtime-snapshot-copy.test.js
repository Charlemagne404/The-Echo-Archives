const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

test("runtime preservation does not carry its temporary catalogue snapshot journal forward", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-runtime-snapshot-copy-"));
  const deployRoot = path.join(tempRoot, "deploy");
  const stagingRoot = path.join(deployRoot, "runtime/staging");
  const sourceRoot = path.join(stagingRoot, "a".repeat(40));
  const targetRoot = path.join(stagingRoot, "b".repeat(40));
  const currentLink = path.join(stagingRoot, "current");
  const shimRoot = path.join(tempRoot, "shims");
  const publisherPlan = path.join("import-staging", "echo-publisher", "plans", "plan-1.json");

  try {
    fs.mkdirSync(path.dirname(path.join(sourceRoot, publisherPlan)), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, publisherPlan), JSON.stringify({ planId: "plan-1" }));
    fs.mkdirSync(path.join(targetRoot, "import-staging"), { recursive: true });
    fs.symlinkSync(path.basename(sourceRoot), currentLink, "dir");
    fs.mkdirSync(shimRoot, { recursive: true });
    fs.writeFileSync(path.join(shimRoot, "sudo"), "#!/bin/sh\nexec \"$@\"\n", { mode: 0o755 });

    const script = 'set -Eeuo pipefail; export DEPLOY_ROOT="$1"; source "$2"; preserve_runtime_mutable_state staging "$3" "$4"';
    const result = spawnSync("/bin/bash", [
      "-c",
      script,
      "runtime-snapshot-copy",
      deployRoot,
      path.join(ROOT, "deploy/release-common.sh"),
      sourceRoot,
      targetRoot,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, PATH: `${shimRoot}:${process.env.PATH}` },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.existsSync(path.join(sourceRoot, "import-staging/.echo-catalog-transaction")), false);
    assert.equal(fs.existsSync(path.join(targetRoot, "import-staging/.echo-catalog-transaction")), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(targetRoot, publisherPlan), "utf8")), { planId: "plan-1" });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
