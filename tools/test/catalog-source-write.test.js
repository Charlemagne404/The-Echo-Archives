const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeCatalogSource, writeShowRecordsAtomically, writeCollectionRecordsAtomically, writeJsonFileAtomic, readCatalogSource } = require("../lib/catalog-source");

test("malformed and duplicate source ids fail before replacing healthy files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-source-write-"));
  const source = { mode: "split", shows: [{ id: "healthy", title: "Healthy" }], collections: [{ id: "curated", showIds: ["healthy"] }], reviewsById: {} };
  try {
    writeCatalogSource(root, source);
    const before = readCatalogSource(root);
    for (const records of [[{ id: "../escaped" }], [{ id: "bad/id" }], [{ id: "duplicate" }, { id: "duplicate" }]]) {
      assert.throws(() => writeShowRecordsAtomically(root, records), /Invalid|Duplicate/);
      assert.throws(() => writeCollectionRecordsAtomically(root, records), /Invalid|Duplicate/);
      assert.throws(() => writeCatalogSource(root, { ...source, shows: records }), /Invalid|Duplicate/);
      assert.deepEqual(readCatalogSource(root), before);
    }
    assert.throws(() => writeCatalogSource(root, { ...source, shows: [{ id: "replacement" }], collections: [{ id: "../escaped" }] }), /Invalid/);
    assert.throws(() => writeCatalogSource(root, { ...source, reviewsById: { "../escaped": {} } }), /Invalid/);
    assert.deepEqual(readCatalogSource(root), before);
    assert.equal(fs.existsSync(path.join(root, "catalog-src", "escaped.json")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test("a failed atomic rename preserves the original and removes its staging file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-atomic-fault-"));
  const target = path.join(root, "show.json");
  fs.writeFileSync(target, '{"id":"healthy"}\n');
  const rename = fs.renameSync;
  try {
    fs.renameSync = () => { const error = new Error("Simulated read-only destination"); error.code = "EROFS"; throw error; };
    assert.throws(() => writeJsonFileAtomic(target, { id: "replacement" }), { code: "EROFS" });
    assert.equal(fs.readFileSync(target, "utf8"), '{"id":"healthy"}\n');
    assert.deepEqual(fs.readdirSync(root), ["show.json"]);
  } finally {
    fs.renameSync = rename;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
