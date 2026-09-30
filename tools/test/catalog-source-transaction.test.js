const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  readCatalogSource,
  writeCollectionRecordsAtomically,
  writeShowRecordsAtomically,
} = require("../lib/catalog-source");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createSiteRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-catalog-writer-"));
  writeJson(path.join(root, "catalog-src", "shows", "_order.json"), []);
  writeJson(path.join(root, "catalog-src", "collections", "_order.json"), []);
  fs.mkdirSync(path.join(root, "catalog-src", "reviews"), { recursive: true });
  return root;
}

function snapshotFiles(root) {
  const snapshot = new Map();
  const visit = (directory) => {
    fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
      .forEach((entry) => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(absolutePath);
        } else {
          snapshot.set(path.relative(root, absolutePath), fs.readFileSync(absolutePath).toString("base64"));
        }
      });
  };

  visit(root);
  return snapshot;
}

function withSiteRoot(run) {
  const root = createSiteRoot();
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function withRenameFailure(destinationSuffix, run) {
  const originalRenameSync = fs.renameSync;
  fs.renameSync = function renameSync(sourcePath, destinationPath, ...args) {
    if (String(destinationPath).endsWith(destinationSuffix)) {
      const error = new Error(`simulated rename failure for ${destinationSuffix}`);
      error.code = "EIO";
      throw error;
    }
    return originalRenameSync.call(this, sourcePath, destinationPath, ...args);
  };

  try {
    run();
  } finally {
    fs.renameSync = originalRenameSync;
  }
}

test("show writer rejects duplicate and unsafe batch ids before touching the source tree", () => {
  withSiteRoot((root) => {
    const before = snapshotFiles(root);
    assert.throws(
      () => writeShowRecordsAtomically(root, [{ id: "new-show" }, { id: "new-show" }]),
      /duplicate show id/i,
    );
    assert.throws(
      () => writeShowRecordsAtomically(root, [{ id: "new-show" }, { id: "..\/..\/escaped" }]),
      /valid slug id/i,
    );

    assert.deepEqual(snapshotFiles(root), before);
    assert.equal(fs.existsSync(path.join(root, "escaped.json")), false);
  });
});

test("collection writer rejects duplicate and unsafe batch ids before touching the source tree", () => {
  withSiteRoot((root) => {
    const before = snapshotFiles(root);
    assert.throws(
      () => writeCollectionRecordsAtomically(root, [{ id: "new-route" }, { id: "new-route" }]),
      /duplicate collection id/i,
    );
    assert.throws(
      () => writeCollectionRecordsAtomically(root, [{ id: "new-route" }, { id: "..\/..\/escaped" }]),
      /valid slug id/i,
    );

    assert.deepEqual(snapshotFiles(root), before);
    assert.equal(fs.existsSync(path.join(root, "escaped.json")), false);
  });
});

test("show and collection writers remove temporary files and roll back a failed middle write", () => {
  withSiteRoot((root) => {
    const before = snapshotFiles(root);
    withRenameFailure("second-show.json", () => {
      assert.throws(
        () => writeShowRecordsAtomically(root, [{ id: "first-show" }, { id: "second-show" }]),
        /simulated rename failure/,
      );
    });
    assert.deepEqual(snapshotFiles(root), before);

    withRenameFailure("second-route.json", () => {
      assert.throws(
        () => writeCollectionRecordsAtomically(root, [{ id: "first-route" }, { id: "second-route" }]),
        /simulated rename failure/,
      );
    });
    assert.deepEqual(snapshotFiles(root), before);
  });
});

test("show writer preserves malformed existing source bytes when parsing fails", () => {
  withSiteRoot((root) => {
    const showPath = path.join(root, "catalog-src", "shows", "broken-show.json");
    writeJson(path.join(root, "catalog-src", "shows", "_order.json"), ["broken-show"]);
    fs.writeFileSync(showPath, "{\"id\":\n");
    const before = snapshotFiles(root);

    assert.throws(() => writeShowRecordsAtomically(root, [{ id: "broken-show", title: "Replacement" }]), /json/i);
    assert.deepEqual(snapshotFiles(root), before);
  });
});

test("collection writer preserves malformed existing source bytes when parsing fails", () => {
  withSiteRoot((root) => {
    const collectionPath = path.join(root, "catalog-src", "collections", "broken-route.json");
    writeJson(path.join(root, "catalog-src", "collections", "_order.json"), ["broken-route"]);
    fs.writeFileSync(collectionPath, "{\"id\":\n");
    const before = snapshotFiles(root);

    assert.throws(() => writeCollectionRecordsAtomically(root, [{ id: "broken-route", title: "Replacement" }]), /json/i);
    assert.deepEqual(snapshotFiles(root), before);
  });
});

test("repeating a valid show or collection write leaves stable records and order manifests", () => {
  withSiteRoot((root) => {
    const show = { id: "stable-show", title: "Stable Show" };
    const collection = { id: "stable-route", title: "Stable Route" };

    writeShowRecordsAtomically(root, [show]);
    const afterShowWrite = snapshotFiles(root);
    writeShowRecordsAtomically(root, [show]);
    assert.deepEqual(snapshotFiles(root), afterShowWrite);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "catalog-src", "shows", "_order.json"), "utf8")), ["stable-show"]);

    writeCollectionRecordsAtomically(root, [collection]);
    const afterCollectionWrite = snapshotFiles(root);
    writeCollectionRecordsAtomically(root, [collection]);
    assert.deepEqual(snapshotFiles(root), afterCollectionWrite);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "catalog-src", "collections", "_order.json"), "utf8")), ["stable-route"]);
  });
});

test("split source reads fail closed when required folders or order manifests are incomplete", () => {
  withSiteRoot((root) => {
    fs.rmSync(path.join(root, "catalog-src", "shows"), { recursive: true });
    assert.throws(() => readCatalogSource(root), /show source directory .*missing/i);
  });

  withSiteRoot((root) => {
    fs.rmSync(path.join(root, "catalog-src", "collections"), { recursive: true });
    assert.throws(() => readCatalogSource(root), /collection source directory .*missing/i);
  });

  withSiteRoot((root) => {
    fs.rmSync(path.join(root, "catalog-src", "shows", "_order.json"));
    assert.throws(() => readCatalogSource(root), /shows.*_order\.json is missing/i);
  });

  withSiteRoot((root) => {
    writeJson(path.join(root, "catalog-src", "shows", "orphan-show.json"), { id: "orphan-show" });
    assert.throws(() => readCatalogSource(root), /_order\.json.*missing.*orphan-show/i);
  });
});

test("split source records follow the authored manifest regardless of filesystem order", () => {
  withSiteRoot((root) => {
    writeJson(path.join(root, "catalog-src", "shows", "zulu-show.json"), { id: "zulu-show" });
    writeJson(path.join(root, "catalog-src", "shows", "alpha-show.json"), { id: "alpha-show" });
    writeJson(path.join(root, "catalog-src", "shows", "_order.json"), ["zulu-show", "alpha-show"]);

    assert.deepEqual(readCatalogSource(root).shows.map((record) => record.id), ["zulu-show", "alpha-show"]);
  });

  withSiteRoot((root) => {
    writeJson(path.join(root, "catalog-src", "shows", "123.json"), { id: "123" });
    writeJson(path.join(root, "catalog-src", "shows", "_order.json"), [123]);
    assert.throws(() => readCatalogSource(root), /shows\/_order\.json\[0\] must be a slug id/i);
  });

  withSiteRoot((root) => {
    writeJson(path.join(root, "catalog-src", "shows", "expected-show.json"), { id: "different-show" });
    writeJson(path.join(root, "catalog-src", "shows", "_order.json"), ["expected-show"]);
    assert.throws(() => readCatalogSource(root), /expected-show\.json.*internal id "different-show"/i);
  });
});

test("split source parsing accepts CRLF and rewritten JSON uses stable LF endings", () => {
  withSiteRoot((root) => {
    const show = { id: "crlf-show", title: "Before" };
    const showPath = path.join(root, "catalog-src", "shows", `${show.id}.json`);
    const orderPath = path.join(root, "catalog-src", "shows", "_order.json");
    fs.writeFileSync(showPath, `${JSON.stringify(show, null, 2).replace(/\n/g, "\r\n")}\r\n`);
    fs.writeFileSync(orderPath, `${JSON.stringify([show.id], null, 2).replace(/\n/g, "\r\n")}\r\n`);

    assert.deepEqual(readCatalogSource(root).shows.map((record) => record.id), [show.id]);
    writeShowRecordsAtomically(root, [{ ...show, title: "After" }]);
    assert.doesNotMatch(fs.readFileSync(showPath, "utf8"), /\r\n/);
  });
});
