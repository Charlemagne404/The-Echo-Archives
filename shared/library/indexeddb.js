import {
  LIBRARY_DATABASE_NAME,
  LIBRARY_DATABASE_VERSION,
  LIBRARY_ENTRIES_STORE,
  LIBRARY_SETTINGS_STORE,
} from "./schema.js";

export class LibraryStorageError extends Error {
  constructor(code, message, { cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "LibraryStorageError";
    this.code = code;
  }
}

export function getLibraryMigrationSteps(oldVersion, newVersion) {
  if (!Number.isInteger(oldVersion) || !Number.isInteger(newVersion) || oldVersion < 0 || newVersion < oldVersion) {
    throw new LibraryStorageError("invalid_upgrade_version", "The Library database version is invalid.");
  }
  const steps = [];
  for (let version = oldVersion + 1; version <= newVersion; version += 1) {
    if (version !== 1) {
      throw new LibraryStorageError("unsupported_database_version", "This Library database version is not supported by this Echo version.");
    }
    steps.push(version);
  }
  return steps;
}

export function upgradeLibraryDatabase(database, transaction, oldVersion, newVersion) {
  const steps = getLibraryMigrationSteps(oldVersion, newVersion);
  for (const version of steps) {
    if (version === 1) createVersionOneSchema(database, transaction);
  }
}

function createVersionOneSchema(database) {
  if (!database.objectStoreNames.contains(LIBRARY_ENTRIES_STORE)) {
    const entries = database.createObjectStore(LIBRARY_ENTRIES_STORE, { keyPath: "showId" });
    entries.createIndex("by-state", "state", { unique: false });
    entries.createIndex("by-updated-at", "updatedAt", { unique: false });
    entries.createIndex("by-state-updated-at", ["state", "updatedAt"], { unique: false });
  }
  if (!database.objectStoreNames.contains(LIBRARY_SETTINGS_STORE)) {
    database.createObjectStore(LIBRARY_SETTINGS_STORE, { keyPath: "key" });
  }
}

export function createIndexedDbAdapter({
  indexedDBFactory = globalThis.indexedDB,
  databaseName = LIBRARY_DATABASE_NAME,
  databaseVersion = LIBRARY_DATABASE_VERSION,
  blockedTimeoutMs = 2000,
  onVersionChange = () => {},
  upgrade = upgradeLibraryDatabase,
} = {}) {
  let database = null;
  let databasePromise = null;
  let generation = 0;

  function open() {
    if (database) return Promise.resolve(database);
    if (databasePromise) return databasePromise;
    if (!indexedDBFactory || typeof indexedDBFactory.open !== "function") {
      return Promise.reject(new LibraryStorageError("storage_unavailable", "IndexedDB is unavailable in this browser."));
    }

    const openGeneration = generation;
    const pending = new Promise((resolve, reject) => {
      let settled = false;
      let blockedTimer = null;
      let request;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        if (blockedTimer !== null) clearTimeout(blockedTimer);
        reject(error);
      };

      try {
        request = indexedDBFactory.open(databaseName, databaseVersion);
      } catch (error) {
        const code = error?.name === "SecurityError" ? "storage_unavailable" : "storage_open_failed";
        fail(new LibraryStorageError(code, "The Library database could not be opened.", { cause: error }));
        return;
      }

      request.onupgradeneeded = (event) => {
        try {
          upgrade(request.result, request.transaction, event.oldVersion, event.newVersion);
        } catch (error) {
          fail(error instanceof LibraryStorageError ? error : new LibraryStorageError("upgrade_failed", "The Library schema upgrade failed.", { cause: error }));
          try { request.transaction.abort(); } catch {}
        }
      };
      request.onblocked = () => {
        if (settled) return;
        blockedTimer = setTimeout(() => {
          fail(new LibraryStorageError("blocked_upgrade", "Another open Echo tab is preventing a Library database upgrade."));
        }, Math.max(0, blockedTimeoutMs));
      };
      request.onerror = () => {
        const cause = request.error;
        const code = cause?.name === "VersionError" ? "unsupported_database_version"
          : cause?.name === "SecurityError" ? "storage_unavailable"
            : "storage_open_failed";
        fail(new LibraryStorageError(code, code === "unsupported_database_version"
          ? "This Library database was created by a newer Echo version and was left unchanged."
          : "The Library database could not be opened and was left unchanged.", { cause }));
      };
      request.onsuccess = () => {
        const openedDatabase = request.result;
        if (settled || openGeneration !== generation) {
          openedDatabase.close();
          return;
        }
        if (blockedTimer !== null) clearTimeout(blockedTimer);
        settled = true;
        database = openedDatabase;
        databasePromise = null;
        openedDatabase.onversionchange = (event) => {
          openedDatabase.close();
          if (database === openedDatabase) database = null;
          databasePromise = null;
          try { onVersionChange(event); } catch {}
        };
        resolve(openedDatabase);
      };
    });
    databasePromise = pending;
    pending.catch(() => {
      if (databasePromise === pending) databasePromise = null;
    });
    return pending;
  }

  function transact(storeNames, mode, run) {
    return open().then((db) => new Promise((resolve, reject) => {
      let result;
      let workError = null;
      let transaction;
      const fail = (error) => {
        if (workError) return;
        workError = error instanceof LibraryStorageError
          ? error
          : mapTransactionError(error instanceof Error ? error : null, mode);
        try { transaction.abort(); } catch {}
      };
      try {
        transaction = db.transaction(storeNames, mode);
      } catch (error) {
        reject(mapTransactionError(error, mode));
        return;
      }
      transaction.oncomplete = () => {
        if (workError) reject(workError);
        else resolve(result);
      };
      transaction.onabort = () => {
        reject(workError || mapTransactionError(transaction.error, mode));
      };
      transaction.onerror = () => {
        if (!workError) workError = mapTransactionError(transaction.error, mode);
      };
      try {
        run(transaction, {
          setResult(value) { result = value; },
          fail,
        });
      } catch (error) {
        fail(error);
      }
    }));
  }

  function close() {
    generation += 1;
    database?.close();
    database = null;
    databasePromise = null;
  }

  return Object.freeze({ open, transact, close, databaseName, databaseVersion });
}

function mapTransactionError(error, mode) {
  if (error instanceof LibraryStorageError) return error;
  if (error?.name === "QuotaExceededError") {
    return new LibraryStorageError("storage_quota_exceeded", "The browser could not save the Library because storage is full.", { cause: error });
  }
  if (error?.name === "VersionError") {
    return new LibraryStorageError("unsupported_database_version", "This Library database was created by a newer Echo version and was left unchanged.", { cause: error });
  }
  const action = mode === "readwrite" ? "write" : "read";
  return new LibraryStorageError(`storage_${action}_failed`, `The Library ${action} transaction failed.`, { cause: error });
}
