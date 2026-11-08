#!/usr/bin/env node
const { beginCatalogRuntimeSnapshot } = require("../tools/lib/catalog-publication-transaction");

const root = process.argv[2];
const ownerUidText = process.argv[3];
const ownerGidText = process.argv[4];
if (!root) {
  process.stderr.write("A runtime root is required for the catalogue snapshot lock.\n");
  process.exit(2);
}
if ((ownerUidText === undefined) !== (ownerGidText === undefined) ||
    (ownerUidText !== undefined && (!/^\d+$/.test(ownerUidText) || !/^\d+$/.test(ownerGidText)))) {
  process.stderr.write("Runtime snapshot owner uid and gid must be supplied together as numbers.\n");
  process.exit(2);
}

let snapshot;
try {
  const owner = ownerUidText === undefined ? {} : { ownerUid: Number(ownerUidText), ownerGid: Number(ownerGidText) };
  snapshot = beginCatalogRuntimeSnapshot(root, owner);
} catch (error) {
  process.stderr.write(`${error.message || "Could not acquire the catalogue snapshot lock."}\n`);
  process.exit(1);
}

let released = false;
function release() {
  if (released) return;
  snapshot.release();
  released = true;
}

process.stdout.write("snapshot-lock-ready\n");
process.stdin.setEncoding("utf8");
let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (!input.includes("\n")) return;
  try {
    release();
    process.stdout.write("snapshot-lock-released\n");
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${error.message || "Could not release the catalogue snapshot lock."}\n`);
    process.exit(1);
  }
});
process.stdin.on("end", () => {
  try {
    release();
    process.exit(0);
  } catch (error) {
    process.stderr.write(`${error.message || "Could not release the catalogue snapshot lock."}\n`);
    process.exit(1);
  }
});
process.on("SIGTERM", () => {
  try { release(); } catch (_error) { /* Preserve the termination status. */ }
  process.exit(143);
});
