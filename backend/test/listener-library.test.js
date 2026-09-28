const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { chromium } = require("playwright");

const repositoryRoot = path.resolve(__dirname, "../..");
const moduleRoot = path.join(repositoryRoot, "shared", "library");
const migrationFixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/listener-library/initial-upgrade-v0.json"), "utf8"));
const backupFormat = "the-echo-archives.listener-library";
let server;
let browser;
let origin;

before(async () => {
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<!doctype html><title>Library test</title>");
      return;
    }
    const relativePath = pathname.replace(/^\/shared\/library\//, "");
    const filePath = path.resolve(moduleRoot, relativePath);
    if (!pathname.startsWith("/shared/library/") || !filePath.startsWith(`${moduleRoot}${path.sep}`)) {
      response.writeHead(404).end();
      return;
    }
    fs.readFile(filePath, (error, contents) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(contents);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

async function createContext() {
  return browser.newContext();
}

async function initializeLibrary(page, {
  databaseName = `echo-library-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  channelName = `${databaseName}:changes`,
  knownShowIds = ["show-alpha", "show-beta", "show-gamma", "show-delta", "saved-newer"],
  blockedTimeoutMs = 200,
} = {}) {
  await page.goto(`${origin}/`);
  const result = await page.evaluate(async (options) => {
    const { createListenerLibrary } = await import(options.moduleUrl);
    window.__libraryClock = "2026-09-28T10:00:00.000Z";
    window.library = createListenerLibrary({
      databaseName: options.databaseName,
      channelName: options.channelName,
      knownShowIds: options.knownShowIds,
      blockedTimeoutMs: options.blockedTimeoutMs,
      now: () => window.__libraryClock,
    });
    return window.library.open();
  }, {
    moduleUrl: `${origin}/shared/library/service.js`,
    databaseName,
    channelName,
    knownShowIds,
    blockedTimeoutMs,
  });
  return { databaseName, channelName, availability: result };
}

async function call(page, method, ...args) {
  return page.evaluate(async ({ methodName, methodArgs }) => window.library[methodName](...methodArgs), {
    methodName: method,
    methodArgs: args,
  });
}

async function setClock(page, value) {
  return page.evaluate((clock) => { window.__libraryClock = clock; }, value);
}

async function directDatabase(page, databaseName, version = undefined) {
  return page.evaluate(({ name, requestedVersion }) => new Promise((resolve, reject) => {
    const request = requestedVersion === undefined ? indexedDB.open(name) : indexedDB.open(name, requestedVersion);
    request.onsuccess = () => {
      window.__testDatabase = request.result;
      resolve({ version: request.result.version, stores: [...request.result.objectStoreNames] });
    };
    request.onerror = () => reject(request.error);
  }), { name: databaseName, requestedVersion: version });
}

test("Listener Library schema validates every state, IDs, ratings, timestamps, and backup versions", async () => {
  const schema = await import(pathToFileUrl(path.join(moduleRoot, "schema.js")));
  const adapter = await import(pathToFileUrl(path.join(moduleRoot, "indexeddb.js")));
  assert.deepEqual(schema.LIBRARY_STATES, ["saved", "listening", "finished", "dropped", "hidden"]);
  assert.deepEqual(adapter.getLibraryMigrationSteps(migrationFixture.databaseVersion, 1), [1]);
  assert.throws(() => adapter.getLibraryMigrationSteps(1, 2), { code: "unsupported_database_version" });
  for (const state of schema.LIBRARY_STATES) {
    const result = schema.validateLibraryEntry({
      showId: "show-alpha",
      state,
      rating: 1,
      createdAt: "2026-09-28T10:00:00.000Z",
      updatedAt: "2026-09-28T10:01:00.000Z",
    });
    assert.equal(result.ok, true, state);
  }
  for (const rating of [1, 2, 3, 4, 5]) assert.equal(schema.isValidPrivateRating(rating), true);
  for (const rating of [0, 6, 1.5, "5", null]) assert.equal(schema.isValidPrivateRating(rating), false);
  assert.equal(schema.isValidShowId("show-alpha"), true);
  assert.equal(schema.isValidShowId("Unknown Show"), false);
  assert.equal(schema.isValidUtcTimestamp("2026-09-28T10:00:00.000Z"), true);
  assert.equal(schema.isValidUtcTimestamp("September 28, 2026"), false);

  const validBackup = {
    format: backupFormat,
    schemaVersion: 1,
    exportedAt: "2026-09-28T10:00:00.000Z",
    entries: [{ showId: "retired-show", state: "hidden", createdAt: "2026-09-28T10:00:00.000Z", updatedAt: "2026-09-28T10:00:00.000Z" }],
  };
  assert.equal(schema.validateBackupDocument(validBackup).ok, true);
  assert.equal(schema.validateBackupDocument({ ...validBackup, personalDiscoveryEnabled: true }).ok, false);
  assert.equal(schema.validateBackupDocument({ ...validBackup, schemaVersion: 9 }).issues[0].code, "unsupported_newer_schema");
  assert.equal(schema.validateBackupDocument({ ...validBackup, entries: [{ ...validBackup.entries[0], note: "not part of this schema" }] }).ok, false);
  assert.equal(schema.validateBackupDocument({ ...validBackup, entries: [validBackup.entries[0], validBackup.entries[0]] }).issues.at(-1).code, "duplicate_show_id");
});

test("real Chromium Library API persists entries, ratings, preferences, imports, and reset atomically", async () => {
  const context = await createContext();
  try {
    const first = await context.newPage();
    const second = await context.newPage();
    const library = await initializeLibrary(first);
    const secondLibrary = await initializeLibrary(second, { databaseName: library.databaseName, channelName: library.channelName });
    assert.equal(library.availability.ok, true);
    assert.equal(library.availability.value.storage, "indexeddb");
    assert.equal(library.availability.value.crossTabNotifications, true);
    assert.equal(secondLibrary.availability.ok, true);

    await Promise.all([first.evaluate(() => { window.__changes = []; window.__unsubscribe = library.subscribe((event) => window.__changes.push(event)); }),
      second.evaluate(() => { window.__changes = []; window.__unsubscribe = library.subscribe((event) => window.__changes.push(event)); })]);
    assert.deepEqual((await call(first, "getPersonalDiscoveryEnabled")).value, false);
    assert.equal((await call(first, "getEntry", "never-saved")).value, null);
    assert.deepEqual((await call(first, "getPersonalContext")).value, { enabled: false, entries: [] });

    await setClock(first, "2026-09-28T10:00:00.000Z");
    assert.equal((await call(first, "setState", "show-alpha", "saved", { titleSnapshot: "  The   Alpha Show " })).value.entry.titleSnapshot, "The Alpha Show");
    await setClock(first, "2026-09-28T10:01:00.000Z");
    await call(first, "setState", "saved-newer", "saved");
    await setClock(first, "2026-09-28T10:02:00.000Z");
    await call(first, "setState", "show-beta", "listening");
    await setClock(first, "2026-09-28T10:03:00.000Z");
    await call(first, "setState", "show-gamma", "finished");
    await setClock(first, "2026-09-28T10:04:00.000Z");
    await call(first, "setState", "show-delta", "dropped");
    await setClock(first, "2026-09-28T10:05:00.000Z");
    await call(first, "setState", "retired-show", "hidden", { titleSnapshot: "Retired Signal" });
    assert.deepEqual((await call(first, "listEntries")).value.map((entry) => entry.showId), [
      "saved-newer", "show-alpha", "show-beta", "show-gamma", "show-delta", "retired-show",
    ]);
    assert.equal(await first.evaluate(async () => {
      const result = await library.listEntries();
      return Object.isFrozen(result.value) && result.value.every((entry) => Object.isFrozen(entry));
    }), true);
    await first.reload();
    await initializeLibrary(first, { databaseName: library.databaseName, channelName: library.channelName });
    assert.equal((await call(first, "getEntry", "retired-show")).value.titleSnapshot, "Retired Signal");
    await first.evaluate(() => { window.__changes = []; window.__unsubscribe = library.subscribe((event) => window.__changes.push(event)); });
    await call(first, "setState", "remove-me", "saved");
    assert.equal((await call(first, "removeEntry", "remove-me")).value.removed, true);
    assert.equal((await call(first, "removeEntry", "remove-me")).value.removed, false);
    assert.equal((await call(first, "getEntry", "remove-me")).value, null);

    for (const rating of [1, 5]) assert.equal((await call(first, "setRating", "show-alpha", rating)).ok, true);
    for (const rating of [0, 6, 1.5, "4"]) assert.equal((await call(first, "setRating", "show-alpha", rating)).error.code, "invalid_rating");
    assert.equal((await call(first, "setRating", "not-in-library", 5)).error.code, "entry_not_found");
    assert.equal((await call(first, "setState", "INVALID ID", "saved")).error.code, "invalid_show_id");
    assert.equal((await call(first, "setState", "show-alpha", "listening")).value.entry.rating, 5);
    assert.equal((await call(first, "removeRating", "show-alpha")).value.entry.rating, undefined);
    await call(first, "setRating", "show-alpha", 4);

    await second.waitForFunction(() => window.__changes.some((event) => event.type === "change"));
    assert.equal((await call(second, "getEntry", "show-alpha")).value.state, "listening");
    assert.deepEqual(Object.keys((await second.evaluate(() => window.__changes.at(-1)))).sort(), ["type"]);

    await Promise.all([
      call(first, "setState", "parallel-one", "saved"),
      call(second, "setState", "parallel-two", "saved"),
    ]);
    assert.equal((await call(first, "listEntries")).value.some((entry) => entry.showId === "parallel-one"), true);
    assert.equal((await call(first, "listEntries")).value.some((entry) => entry.showId === "parallel-two"), true);
    await Promise.all([
      call(first, "setRating", "show-alpha", 2),
      call(second, "setState", "show-alpha", "hidden"),
    ]);
    let alpha = (await call(first, "getEntry", "show-alpha")).value;
    assert.equal(alpha.state, "hidden");
    assert.equal(alpha.rating, 2);
    await call(first, "setState", "show-alpha", "saved");
    await call(first, "setRating", "show-alpha", 4);
    await call(second, "setState", "show-alpha", "hidden");
    assert.equal((await call(first, "getEntry", "show-alpha")).value.state, "hidden");
    await call(first, "setState", "show-alpha", "saved");

    await call(first, "setState", "local-only", "listening");
    await call(first, "setPersonalDiscoveryEnabled", true);
    const personalContext = (await call(first, "getPersonalContext")).value;
    assert.equal(personalContext.enabled, true);
    assert.ok(personalContext.entries.some((entry) => entry.showId === "show-alpha" && entry.state === "saved" && entry.rating === 4));
    assert.equal(personalContext.entries.some((entry) => Object.hasOwn(entry, "createdAt") || Object.hasOwn(entry, "updatedAt") || Object.hasOwn(entry, "titleSnapshot")), false);
    personalContext.entries.forEach((entry) => assert.ok(Object.keys(entry).every((key) => ["showId", "state", "rating"].includes(key))));
    const exported = await call(first, "exportLibrary");
    assert.equal(exported.ok, true);
    const exportedDocument = JSON.parse(exported.value.json);
    assert.equal(exportedDocument.format, backupFormat);
    assert.equal(exportedDocument.schemaVersion, 1);
    assert.equal(Object.hasOwn(exportedDocument, "personalDiscoveryEnabled"), false);
    assert.equal(exportedDocument.entries[0].createdAt !== undefined, true);
    assert.equal(exportedDocument.entries[0].updatedAt !== undefined, true);
    assert.equal(exportedDocument.entries.some((entry) => Object.hasOwn(entry, "note")), false);
    assert.equal(exportedDocument.entries.find((entry) => entry.showId === "retired-show").titleSnapshot, "Retired Signal");

    const importDocument = {
      format: backupFormat,
      schemaVersion: 1,
      exportedAt: "2026-09-28T11:00:00.000Z",
      entries: [
        { showId: "show-alpha", state: "finished", rating: 3, createdAt: "2026-09-28T10:00:00.000Z", updatedAt: "2026-09-28T10:59:00.000Z" },
        { showId: "retired-show", state: "hidden", titleSnapshot: "Earlier Title", createdAt: "2026-09-28T10:00:00.000Z", updatedAt: "2026-09-28T10:58:00.000Z" },
        { showId: "arrived-between-preview-and-commit", state: "dropped", createdAt: "2026-09-28T10:00:00.000Z", updatedAt: "2026-09-28T10:57:00.000Z" },
      ],
    };
    const preview = await call(first, "previewImport", JSON.stringify(importDocument), { mode: "merge" });
    assert.equal(preview.value.valid, true);
    assert.equal(preview.value.totalEntries, 3);
    assert.deepEqual(preview.value.statusCounts, { saved: 0, listening: 0, finished: 1, dropped: 1, hidden: 1 });
    assert.deepEqual(preview.value.unknownCatalogueIds, ["arrived-between-preview-and-commit", "retired-show"]);
    assert.deepEqual(preview.value.sameIdConflicts, ["retired-show", "show-alpha"]);
    assert.equal(preview.value.conflictRule, "imported-entry-replaces-local-entry");
    assert.equal(preview.value.operationMode, "merge");
    assert.equal(Object.hasOwn(preview.value, "personalDiscovery"), false);
    await call(second, "setState", "arrived-between-preview-and-commit", "saved");
    const merged = await call(first, "commitImport", preview.value.previewId);
    assert.equal(merged.ok, true);
    assert.deepEqual(merged.value.sameIdConflicts, ["arrived-between-preview-and-commit", "retired-show", "show-alpha"]);
    assert.equal((await call(first, "getEntry", "show-alpha")).value.state, "finished");
    assert.equal((await call(first, "getEntry", "show-alpha")).value.rating, 3);
    assert.equal((await call(first, "getEntry", "retired-show")).value.titleSnapshot, "Earlier Title");
    assert.equal((await call(first, "getEntry", "local-only")).value.state, "listening");
    assert.equal((await call(first, "getEntry", "arrived-between-preview-and-commit")).value.state, "dropped");
    assert.equal((await call(first, "getPersonalDiscoveryEnabled")).value, true);

    const roundtrip = await call(first, "exportLibrary");
    const restorePage = await context.newPage();
    const restoreLibrary = await initializeLibrary(restorePage, { databaseName: `${library.databaseName}-restore`, channelName: `${library.channelName}-restore` });
    assert.equal(restoreLibrary.availability.ok, true);
    const restorePreview = await call(restorePage, "previewImport", roundtrip.value.json, { mode: "replace" });
    assert.equal(restorePreview.value.valid, true);
    assert.equal((await call(restorePage, "commitImport", restorePreview.value.previewId)).error.code, "confirmation_required");
    assert.equal((await call(restorePage, "commitImport", restorePreview.value.previewId, { confirmed: true })).ok, true);
    assert.deepEqual((await call(restorePage, "listEntries")).value, (await call(first, "listEntries")).value);
    assert.equal((await call(restorePage, "getPersonalDiscoveryEnabled")).value, false);

    const invalid = {
      ...importDocument,
      entries: [
        importDocument.entries[0],
        { ...importDocument.entries[1], rating: 9 },
      ],
    };
    const beforeInvalid = (await call(first, "listEntries")).value;
    const invalidPreview = await call(first, "previewImport", invalid, { mode: "merge" });
    assert.equal(invalidPreview.ok, true);
    assert.equal(invalidPreview.value.valid, false);
    assert.equal(invalidPreview.value.totalEntries, 2);
    assert.equal(invalidPreview.value.statusCounts.finished, 1);
    assert.equal(invalidPreview.value.invalidData[0].code, "invalid_rating");
    assert.equal(invalidPreview.value.previewId, null);
    const newer = await call(first, "previewImport", { ...importDocument, schemaVersion: 2 }, { mode: "replace" });
    assert.equal(newer.value.valid, false);
    assert.equal(newer.value.invalidData.some((issue) => issue.code === "unsupported_newer_schema"), true);
    assert.deepEqual((await call(first, "listEntries")).value, beforeInvalid);

    const replaceDocument = {
      format: backupFormat,
      schemaVersion: 1,
      exportedAt: "2026-09-28T12:00:00.000Z",
      entries: [{ showId: "replace-target", state: "saved", createdAt: "2026-09-28T12:00:00.000Z", updatedAt: "2026-09-28T12:00:00.000Z" }],
    };
    const replacePreview = await call(first, "previewImport", replaceDocument, { mode: "replace" });
    assert.equal((await call(first, "commitImport", replacePreview.value.previewId)).error.code, "confirmation_required");
    assert.deepEqual((await call(first, "listEntries")).value, beforeInvalid);
    assert.equal((await call(first, "commitImport", replacePreview.value.previewId, { confirmed: true })).ok, true);
    assert.deepEqual((await call(first, "listEntries")).value.map((entry) => entry.showId), ["replace-target"]);
    assert.equal((await call(first, "getPersonalDiscoveryEnabled")).value, true);
    assert.deepEqual((await call(first, "getPersonalContext")).value, { enabled: true, entries: [{ showId: "replace-target", state: "saved" }] });
    assert.equal((await call(first, "reset")).error.code, "confirmation_required");
    const reset = await call(first, "reset", { confirmed: true });
    assert.equal(reset.value.removedEntryCount, 1);
    assert.equal((await call(first, "listEntries")).value.length, 0);
    assert.equal((await call(first, "getPersonalDiscoveryEnabled")).value, false);
  } finally {
    await context.close();
  }
});

test("real Chromium reports storage failures, preserves malformed data, and handles migrations and stale tabs", async () => {
  const context = await createContext();
  try {
    const first = await context.newPage();
    const second = await context.newPage();
    const { databaseName } = await initializeLibrary(first);
    assert.equal((await call(first, "setState", "preserved-show", "saved")).ok, true);

    const openFailure = await first.evaluate(async () => {
      const { createListenerLibrary } = await import(`${location.origin}/shared/library/service.js`);
      const unavailable = createListenerLibrary({ indexedDBFactory: null, databaseName: "unavailable-library-test" });
      const denied = createListenerLibrary({
        indexedDBFactory: { open() { throw new DOMException("denied", "SecurityError"); } },
        databaseName: "denied-library-test",
      });
      const broken = createListenerLibrary({
        indexedDBFactory: { open() { throw new Error("open failure"); } },
        databaseName: "broken-library-test",
      });
      const invalidVersion = createListenerLibrary({ databaseVersion: 0, databaseName: "invalid-version-library-test" });
      return [await unavailable.open(), await denied.open(), await broken.open(), await invalidVersion.open(), await invalidVersion.open()];
    });
    assert.equal(openFailure[0].error.code, "storage_unavailable");
    assert.equal(openFailure[1].error.code, "storage_unavailable");
    assert.equal(openFailure[2].error.code, "storage_open_failed");
    assert.equal(openFailure[3].error.code, "storage_open_failed");
    assert.equal(openFailure[4].error.code, "storage_open_failed");

    const newerDatabaseName = `${databaseName}-newer-schema`;
    await first.evaluate((name) => new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => request.result.createObjectStore("future", { keyPath: "id" });
      request.onsuccess = () => {
        const transaction = request.result.transaction("future", "readwrite");
        transaction.objectStore("future").put({ id: "preserve-me", value: "newer data" });
        transaction.oncomplete = () => { request.result.close(); resolve(); };
        transaction.onabort = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    }), newerDatabaseName);
    const olderCode = await first.evaluate(async (name) => {
      const { createListenerLibrary } = await import(`${location.origin}/shared/library/service.js`);
      return createListenerLibrary({ databaseName: name, databaseVersion: 1 }).checkAvailability();
    }, newerDatabaseName);
    assert.equal(olderCode.error.code, "unsupported_database_version");
    assert.equal((await directDatabase(first, newerDatabaseName)).version, 2);
    const newerData = await first.evaluate(() => new Promise((resolve, reject) => {
      const request = window.__testDatabase.transaction("future").objectStore("future").get("preserve-me");
      request.onsuccess = () => resolve(request.result.value);
      request.onerror = () => reject(request.error);
    }));
    assert.equal(newerData, "newer data");

    const writeFailure = await first.evaluate(async () => {
      const original = IDBObjectStore.prototype.put;
      let failed = false;
      IDBObjectStore.prototype.put = function (...args) {
        if (!failed) {
          failed = true;
          throw new DOMException("quota", "QuotaExceededError");
        }
        return original.apply(this, args);
      };
      try { return await library.setState("quota-show", "saved"); }
      finally { IDBObjectStore.prototype.put = original; }
    });
    assert.equal(writeFailure.error.code, "storage_quota_exceeded");
    assert.equal((await call(first, "getEntry", "quota-show")).value, null);

    const replace = {
      format: backupFormat,
      schemaVersion: 1,
      exportedAt: "2026-09-28T13:00:00.000Z",
      entries: [{ showId: "replacement", state: "finished", createdAt: "2026-09-28T13:00:00.000Z", updatedAt: "2026-09-28T13:00:00.000Z" }],
    };
    const replacePreview = await call(first, "previewImport", replace, { mode: "replace" });
    const failedCommit = await first.evaluate(async ({ previewId }) => {
      const original = IDBObjectStore.prototype.put;
      let failed = false;
      IDBObjectStore.prototype.put = function (...args) {
        if (!failed) {
          failed = true;
          throw new DOMException("quota", "QuotaExceededError");
        }
        return original.apply(this, args);
      };
      try { return await library.commitImport(previewId, { confirmed: true }); }
      finally { IDBObjectStore.prototype.put = original; }
    }, { previewId: replacePreview.value.previewId });
    assert.equal(failedCommit.error.code, "storage_quota_exceeded");
    assert.deepEqual((await call(first, "listEntries")).value.map((entry) => entry.showId), ["preserved-show"]);
    assert.equal((await call(first, "getPersonalDiscoveryEnabled")).value, false);
    assert.equal((await call(first, "commitImport", replacePreview.value.previewId, { confirmed: true })).ok, true);
    assert.deepEqual((await call(first, "listEntries")).value.map((entry) => entry.showId), ["replacement"]);
    const failedReset = await first.evaluate(async () => {
      const original = IDBObjectStore.prototype.clear;
      let failed = false;
      IDBObjectStore.prototype.clear = function (...args) {
        if (!failed && this.name === "settings") {
          failed = true;
          throw new Error("fixture reset failure");
        }
        return original.apply(this, args);
      };
      try { return await library.reset({ confirmed: true }); }
      finally { IDBObjectStore.prototype.clear = original; }
    });
    assert.equal(failedReset.error.code, "storage_write_failed");
    assert.deepEqual((await call(first, "listEntries")).value.map((entry) => entry.showId), ["replacement"]);
    assert.equal((await call(first, "getPersonalDiscoveryEnabled")).value, false);

    const rawWrite = await directDatabase(first, databaseName, 1);
    assert.equal(rawWrite.version, 1);
    const malformedInserted = await first.evaluate(() => new Promise((resolve, reject) => {
      const transaction = window.__testDatabase.transaction(["entries", "settings"], "readwrite");
      transaction.objectStore("entries").put({ showId: "malformed-row", state: "not-a-library-state", createdAt: "bad", updatedAt: "bad", arbitrary: "kept for recovery" });
      transaction.objectStore("settings").put({ key: "personalDiscoveryEnabled", value: "not-a-boolean" });
      transaction.oncomplete = () => resolve(true);
      transaction.onabort = () => reject(transaction.error);
    }));
    assert.equal(malformedInserted, true);
    assert.equal((await call(first, "listEntries")).error.code, "malformed_stored_data");
    const invalidExport = await call(first, "exportLibrary");
    assert.equal(invalidExport.error.code, "malformed_stored_data", JSON.stringify(invalidExport));
    const recovery = await call(first, "exportRecoverySnapshot");
    assert.equal(recovery.ok, true);
    assert.equal(JSON.parse(recovery.value.json).entries.find((entry) => entry.showId === "malformed-row").arbitrary, "kept for recovery");
    const recoveryReset = await call(first, "reset", { confirmed: true });
    assert.equal(recoveryReset.ok, true);
    assert.equal(recoveryReset.value.personalDiscoverySettingWasMalformed, true);
    assert.equal((await call(first, "listEntries")).value.length, 0);

    const migrationFixtureDatabase = `${databaseName}-migration-fixture`;
    const migration = await initializeLibrary(first, { databaseName: migrationFixtureDatabase });
    assert.equal(migration.availability.ok, true);
    const migratedStores = await directDatabase(first, migrationFixtureDatabase, 1);
    assert.deepEqual(migratedStores.stores.sort(), ["entries", "settings"]);
    const indexNames = await first.evaluate(() => [...window.__testDatabase.transaction("entries").objectStore("entries").indexNames].sort());
    assert.deepEqual(indexNames, ["by-state", "by-state-updated-at", "by-updated-at"]);

    const failedUpgradeDb = `${databaseName}-failed-upgrade`;
    await initializeLibrary(first, { databaseName: failedUpgradeDb, channelName: `${failedUpgradeDb}:v1` });
    await call(first, "setState", "before-upgrade", "saved");
    const failedUpgrade = await first.evaluate(async (name) => {
      const { createListenerLibrary } = await import(`${location.origin}/shared/library/service.js`);
      const future = createListenerLibrary({
        databaseName: name,
        databaseVersion: 2,
        upgrade() { throw new Error("fixture migration failure"); },
      });
      return future.checkAvailability();
    }, failedUpgradeDb);
    assert.equal(failedUpgrade.error.code, "upgrade_failed");
    const originalVersion = await directDatabase(first, failedUpgradeDb);
    assert.equal(originalVersion.version, 1);
    assert.equal((await call(first, "getEntry", "before-upgrade")).value.state, "saved");

    const blockedDatabase = `${databaseName}-blocked-upgrade`;
    const base = await initializeLibrary(first, { databaseName: blockedDatabase, channelName: `${blockedDatabase}:changes` });
    await first.evaluate(() => { window.__versionEvents = []; window.__stopVersionEvents = library.subscribe((event) => window.__versionEvents.push(event.type)); });
    await second.goto(`${origin}/`);
    await directDatabase(second, blockedDatabase, 1);
    const upgradeResult = await second.evaluate(async (name) => {
      const { createListenerLibrary } = await import(`${location.origin}/shared/library/service.js`);
      window.futureLibrary = createListenerLibrary({
        databaseName: name,
        databaseVersion: 2,
        blockedTimeoutMs: 50,
        upgrade(database) { if (!database.objectStoreNames.contains("future")) database.createObjectStore("future"); },
      });
      return futureLibrary.checkAvailability();
    }, blockedDatabase);
    assert.equal(upgradeResult.error.code, "blocked_upgrade");
    assert.equal((await first.evaluate(() => window.__versionEvents.includes("upgrade"))), true);
    await second.evaluate(() => window.__testDatabase.close());
    const reopened = await second.evaluate(async () => futureLibrary.checkAvailability());
    assert.equal(reopened.ok, true);
    assert.equal((await call(first, "getEntry", "before-upgrade")).error.code, "unsupported_database_version");
    assert.equal(base.availability.ok, true);
  } finally {
    await context.close();
  }
});

test("an unused Library service has no analytics, network, community, submission, or page side effects", async () => {
  const platformSources = fs.readdirSync(moduleRoot)
    .filter((fileName) => fileName.endsWith(".js"))
    .map((fileName) => fs.readFileSync(path.join(moduleRoot, fileName), "utf8"))
    .join("\n");
  const appSource = fs.readFileSync(path.join(repositoryRoot, "shared/app/app.js"), "utf8");
  const generatorSource = fs.readFileSync(path.join(repositoryRoot, "tools/build-pages.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(repositoryRoot, "backend/server.js"), "utf8");
  assert.doesNotMatch(platformSources, /\b(fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|analytics|community|submission)\b/);
  assert.doesNotMatch(platformSources, /\b(location|URLSearchParams|document\.cookie)\b/);
  assert.match(appSource, /initializeLibraryIntegrationLazily/);
  assert.match(appSource, /void import\(`\.\/library\/integration\.js\?v=/);
  assert.doesNotMatch(appSource, /from ["'][^"']*library\/service\.js/);
  assert.match(generatorSource, /platform:\s*hashTree\("shared\/library"\)/);
  assert.match(generatorSource, /libraryIntegration:\s*hashFile\("shared\/app\/library\/integration\.js"\)/);
  assert.doesNotMatch(serverSource, /listener-library|ListenerLibrary/);

  const context = await createContext();
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    const untouched = await page.evaluate(async () => {
      let openCalls = 0;
      const { createListenerLibrary } = await import(`${location.origin}/shared/library/service.js`);
      const unused = createListenerLibrary({ indexedDBFactory: { open() { openCalls += 1; throw new Error("must not open until requested"); } } });
      return { openCalls, hasSetState: typeof unused.setState === "function", localStorageValue: localStorage.getItem("echo-library-test-never-set") };
    });
    assert.deepEqual(untouched, { openCalls: 0, hasSetState: true, localStorageValue: null });
  } finally {
    await context.close();
  }
});

function pathToFileUrl(filePath) {
  return require("node:url").pathToFileURL(filePath).href;
}
