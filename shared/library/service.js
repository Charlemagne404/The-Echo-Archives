import {
  LIBRARY_BACKUP_FORMAT,
  LIBRARY_BACKUP_SCHEMA_VERSION,
  LIBRARY_DATABASE_NAME,
  LIBRARY_DATABASE_VERSION,
  LIBRARY_ENTRIES_STORE,
  LIBRARY_RECOVERY_FORMAT,
  LIBRARY_SETTINGS_STORE,
  LIBRARY_STATES,
  PERSONAL_DISCOVERY_SETTING_KEY,
  compareLibraryEntries,
  isPlainObject,
  isValidLibraryState,
  isValidPrivateRating,
  isValidShowId,
  normalizeTitleSnapshot,
  normalizeUtcTimestamp,
  validateLibraryEntry,
  validatePersonalDiscoverySetting,
} from "./schema.js";
import {
  buildBackup,
  buildRecoverySnapshot,
  serializeBackup,
  validateBackupInput,
} from "./backup.js";
import { createIndexedDbAdapter, LibraryStorageError } from "./indexeddb.js";

const CHANGE_MESSAGE = "echo-listener-library-changed-v1";
const CONFLICT_RULE = "imported-entry-replaces-local-entry";

export function createListenerLibrary({
  indexedDBFactory = globalThis.indexedDB,
  BroadcastChannelFactory = typeof globalThis.BroadcastChannel === "function"
    ? (name) => new globalThis.BroadcastChannel(name)
    : null,
  databaseName = LIBRARY_DATABASE_NAME,
  databaseVersion = LIBRARY_DATABASE_VERSION,
  channelName = `${LIBRARY_DATABASE_NAME}:changes`,
  blockedTimeoutMs = 2000,
  now = () => new Date().toISOString(),
  knownShowIds = null,
  upgrade,
} = {}) {
  const listeners = new Set();
  const importPreviews = new Map();
  const adapter = createIndexedDbAdapter({
    indexedDBFactory,
    databaseName,
    databaseVersion,
    blockedTimeoutMs,
    upgrade,
    onVersionChange: () => emit({ type: "upgrade" }),
  });
  let channel = null;
  let channelAttempted = false;
  let previewCounter = 0;

  function emit(event) {
    const safeEvent = Object.freeze({ type: event.type });
    for (const listener of [...listeners]) {
      try { listener(safeEvent); } catch {}
    }
  }

  function ensureChannel() {
    if (channelAttempted) return channel;
    channelAttempted = true;
    if (typeof BroadcastChannelFactory !== "function") return null;
    try {
      channel = BroadcastChannelFactory(channelName);
      channel.onmessage = (event) => {
        if (event.data?.type === CHANGE_MESSAGE) emit({ type: "change" });
      };
    } catch {
      channel = null;
    }
    return channel;
  }

  function publishChange() {
    emit({ type: "change" });
    try { ensureChannel()?.postMessage({ type: CHANGE_MESSAGE }); } catch {}
  }

  function currentTime() {
    let timestamp;
    try { timestamp = normalizeUtcTimestamp(now()); } catch { timestamp = null; }
    if (!timestamp) throw new LibraryStorageError("invalid_clock", "The Library could not create a valid timestamp.");
    return timestamp;
  }

  function failure(code, message, details = undefined) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return Object.freeze({ ok: false, error: Object.freeze(error) });
  }

  function fromError(error, fallbackCode = "library_operation_failed") {
    if (error instanceof LibraryStorageError) return failure(error.code, error.message);
    if (error?.code && typeof error.code === "string") return failure(error.code, error.message || "The Library action failed.");
    return failure(fallbackCode, "The Library action failed. Your stored data was left unchanged.");
  }

  async function perform(operation, fallbackCode) {
    try {
      return Object.freeze({ ok: true, value: freezeCopy(await operation()) });
    } catch (error) {
      return fromError(error, fallbackCode);
    }
  }

  function validateStoredEntry(row) {
    const result = validateLibraryEntry(row);
    if (!result.ok) {
      throw new LibraryStorageError("malformed_stored_data", "A stored Library entry is malformed. It was left unchanged; export a recovery snapshot or reset after saving it.");
    }
    return result.value;
  }

  function validateStoredEntries(rows) {
    if (!Array.isArray(rows)) {
      throw new LibraryStorageError("malformed_stored_data", "Stored Library entries could not be read safely.");
    }
    return rows.map(validateStoredEntry);
  }

  function readSetting(settingsStore, onValue, control) {
    const request = settingsStore.get(PERSONAL_DISCOVERY_SETTING_KEY);
    request.onsuccess = () => {
      const row = request.result;
      if (row === undefined) {
        try { onValue(false); } catch (error) { control.fail(error); }
        return;
      }
      if (!isPlainObject(row) || row.key !== PERSONAL_DISCOVERY_SETTING_KEY || !validatePersonalDiscoverySetting(row.value)) {
        control.fail(new LibraryStorageError("malformed_stored_data", "The stored Personal Discovery setting is malformed. It was left unchanged."));
        return;
      }
      try { onValue(row.value); } catch (error) { control.fail(error); }
    };
    request.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Personal Discovery setting could not be read."));
  }

  function readEntriesSnapshot() {
    return adapter.transact([LIBRARY_ENTRIES_STORE], "readonly", (transaction, control) => {
      const request = transaction.objectStore(LIBRARY_ENTRIES_STORE).getAll();
      request.onsuccess = () => {
        try { control.setResult(validateStoredEntries(request.result).sort(compareLibraryEntries)); }
        catch (error) { control.fail(error); }
      };
      request.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library entries could not be read."));
    });
  }

  function validKnownIds(override) {
    const source = override === undefined ? knownShowIds : override;
    if (source === null || source === undefined) return null;
    if (typeof source === "function") return source;
    try { return new Set(source); } catch { return null; }
  }

  function isKnownShow(showId, knownIds) {
    if (knownIds === null) return null;
    try {
      if (typeof knownIds === "function") return Boolean(knownIds(showId));
      return knownIds.has(showId);
    } catch {
      return null;
    }
  }

  function previewId() {
    previewCounter += 1;
    try {
      if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    } catch {}
    return `library-preview-${Date.now().toString(36)}-${previewCounter.toString(36)}`;
  }

  function buildInvalidPreview(validation, candidateEntryCount, mode, knownIdsOverride) {
    const candidateEntries = validation.candidateEntries || [];
    const knownIds = validKnownIds(knownIdsOverride);
    const unknownIds = knownIds === null
      ? null
      : candidateEntries.filter((entry) => isKnownShow(entry.showId, knownIds) === false).map((entry) => entry.showId).sort();
    return {
      previewId: null,
      valid: false,
      operationMode: mode,
      totalEntries: candidateEntryCount,
      statusCounts: statusCounts(candidateEntries),
      invalidData: validation.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      unknownCatalogueIds: unknownIds,
      catalogueContextAvailable: knownIds !== null,
      sameIdConflicts: [],
      conflictRule: CONFLICT_RULE,
    };
  }

  async function checkAvailability() {
    const result = await perform(async () => {
      await adapter.open();
      const supported = typeof BroadcastChannelFactory === "function";
      if (supported) ensureChannel();
      return {
        available: true,
        storage: "indexeddb",
        schemaVersion: databaseVersion,
        crossTabNotifications: Boolean(channel),
      };
    }, "storage_unavailable");
    if (!result.ok) return Object.freeze({ ...result, availability: Object.freeze({ available: false }) });
    return result;
  }

  async function getEntry(showId) {
    if (!isValidShowId(showId)) return failure("invalid_show_id", "A canonical show ID is required.");
    return perform(() => adapter.transact([LIBRARY_ENTRIES_STORE], "readonly", (transaction, control) => {
      const request = transaction.objectStore(LIBRARY_ENTRIES_STORE).get(showId);
      request.onsuccess = () => {
        try { control.setResult(request.result === undefined ? null : validateStoredEntry(request.result)); } catch (error) { control.fail(error); }
      };
      request.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library entry could not be read."));
    }));
  }

  async function listEntries() {
    return perform(async () => validateStoredEntries(await adapter.transact([LIBRARY_ENTRIES_STORE], "readonly", (transaction, control) => {
      const request = transaction.objectStore(LIBRARY_ENTRIES_STORE).getAll();
      request.onsuccess = () => control.setResult(request.result);
      request.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library entries could not be read."));
    })).sort(compareLibraryEntries));
  }

  async function setState(showId, state, { titleSnapshot } = {}) {
    if (!isValidShowId(showId)) return failure("invalid_show_id", "A canonical show ID is required.");
    if (!isValidLibraryState(state)) return failure("invalid_state", "Choose one supported Library state.");
    if (titleSnapshot !== undefined && titleSnapshot !== null && normalizeTitleSnapshot(titleSnapshot) === null) {
      return failure("invalid_title_snapshot", "The last-known title must be a short plain-text label.");
    }
    const result = await perform(() => adapter.transact([LIBRARY_ENTRIES_STORE], "readwrite", (transaction, control) => {
      const store = transaction.objectStore(LIBRARY_ENTRIES_STORE);
      const request = store.get(showId);
      request.onsuccess = () => {
        try {
          const existing = request.result === undefined ? null : validateStoredEntry(request.result);
          const timestamp = currentTime();
          const next = existing
            ? { ...existing, state, updatedAt: timestamp }
            : { showId, state, createdAt: timestamp, updatedAt: timestamp };
          if (titleSnapshot !== undefined) {
            if (titleSnapshot === null) delete next.titleSnapshot;
            else next.titleSnapshot = normalizeTitleSnapshot(titleSnapshot);
          }
          const normalized = validateLibraryEntry(next);
          if (!normalized.ok) throw new LibraryStorageError("invalid_title_snapshot", "The Library entry could not be validated.");
          const changed = !existing || !equalEntry(existing, normalized.value);
          if (changed) store.put(normalized.value);
          control.setResult({ entry: normalized.value, changed });
        } catch (error) { control.fail(error); }
      };
      request.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library entry could not be read."));
    }));
    if (result.ok && result.value.changed) publishChange();
    return result;
  }

  async function setRating(showId, rating) {
    if (!isValidShowId(showId)) return failure("invalid_show_id", "A canonical show ID is required.");
    if (!isValidPrivateRating(rating)) return failure("invalid_rating", "A private rating must be a whole number from 1 through 5.");
    return updateExistingEntry(showId, (entry, timestamp) => ({ ...entry, rating, updatedAt: timestamp }));
  }

  async function removeRating(showId) {
    if (!isValidShowId(showId)) return failure("invalid_show_id", "A canonical show ID is required.");
    return updateExistingEntry(showId, (entry, timestamp) => {
      if (!Object.hasOwn(entry, "rating")) return entry;
      const next = { ...entry, updatedAt: timestamp };
      delete next.rating;
      return next;
    });
  }

  async function updateExistingEntry(showId, update) {
    const result = await perform(() => adapter.transact([LIBRARY_ENTRIES_STORE], "readwrite", (transaction, control) => {
      const store = transaction.objectStore(LIBRARY_ENTRIES_STORE);
      const request = store.get(showId);
      request.onsuccess = () => {
        try {
          if (request.result === undefined) throw new LibraryStorageError("entry_not_found", "Add the show to the Library before editing its private rating.");
          const existing = validateStoredEntry(request.result);
          const timestamp = currentTime();
          const updated = update(existing, timestamp);
          const normalized = validateLibraryEntry(updated);
          if (!normalized.ok) throw new LibraryStorageError("invalid_entry", "The Library entry could not be validated.");
          const changed = !equalEntry(existing, normalized.value);
          if (changed) store.put(normalized.value);
          control.setResult({ entry: normalized.value, changed });
        } catch (error) { control.fail(error); }
      };
      request.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library entry could not be read."));
    }));
    if (result.ok && result.value.changed) publishChange();
    return result;
  }

  async function removeEntry(showId) {
    if (!isValidShowId(showId)) return failure("invalid_show_id", "A canonical show ID is required.");
    const result = await perform(() => adapter.transact([LIBRARY_ENTRIES_STORE], "readwrite", (transaction, control) => {
      const store = transaction.objectStore(LIBRARY_ENTRIES_STORE);
      const request = store.get(showId);
      request.onsuccess = () => {
        try {
          if (request.result === undefined) {
            control.setResult({ removed: false });
            return;
          }
          validateStoredEntry(request.result);
          store.delete(showId);
          control.setResult({ removed: true });
        } catch (error) { control.fail(error); }
      };
      request.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library entry could not be read."));
    }));
    if (result.ok && result.value.removed) publishChange();
    return result;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("A Library change listener must be a function.");
    listeners.add(listener);
    ensureChannel();
    return () => listeners.delete(listener);
  }

  async function getPersonalDiscoveryEnabled() {
    return perform(() => adapter.transact([LIBRARY_SETTINGS_STORE], "readonly", (transaction, control) => {
      readSetting(transaction.objectStore(LIBRARY_SETTINGS_STORE), (enabled) => control.setResult(enabled), control);
    }));
  }

  async function getPersonalContext() {
    return perform(() => adapter.transact([LIBRARY_ENTRIES_STORE, LIBRARY_SETTINGS_STORE], "readonly", (transaction, control) => {
      let entries = null;
      let enabled = null;
      const finish = () => {
        if (entries === null || enabled === null) return;
        try {
          const contextEntries = enabled
            ? validateStoredEntries(entries).map((entry) => {
              const contextEntry = { showId: entry.showId, state: entry.state };
              if (Object.hasOwn(entry, "rating")) contextEntry.rating = entry.rating;
              return contextEntry;
            })
            : [];
          control.setResult({ enabled, entries: contextEntries });
        } catch (error) { control.fail(error); }
      };
      const entriesRequest = transaction.objectStore(LIBRARY_ENTRIES_STORE).getAll();
      entriesRequest.onsuccess = () => { entries = entriesRequest.result; finish(); };
      entriesRequest.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library entries could not be read."));
      readSetting(transaction.objectStore(LIBRARY_SETTINGS_STORE), (value) => { enabled = value; finish(); }, control);
    }));
  }

  async function setPersonalDiscoveryEnabled(enabled) {
    if (!validatePersonalDiscoverySetting(enabled)) return failure("invalid_preference", "Personal Discovery must be enabled or disabled explicitly.");
    const result = await perform(() => adapter.transact([LIBRARY_SETTINGS_STORE], "readwrite", (transaction, control) => {
      const store = transaction.objectStore(LIBRARY_SETTINGS_STORE);
      const request = store.get(PERSONAL_DISCOVERY_SETTING_KEY);
      request.onsuccess = () => {
        try {
          let current = false;
          if (request.result !== undefined) {
            const row = request.result;
            if (!isPlainObject(row) || row.key !== PERSONAL_DISCOVERY_SETTING_KEY || !validatePersonalDiscoverySetting(row.value)) {
              throw new LibraryStorageError("malformed_stored_data", "The stored Personal Discovery setting is malformed. It was left unchanged.");
            }
            current = row.value;
          }
          store.put({ key: PERSONAL_DISCOVERY_SETTING_KEY, value: enabled });
          control.setResult({ enabled, changed: current !== enabled });
        } catch (error) { control.fail(error); }
      };
      request.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Personal Discovery setting could not be read."));
    }));
    if (result.ok && result.value.changed) publishChange();
    return result;
  }

  async function exportLibrary() {
    const result = await perform(async () => {
      const entries = await readEntriesSnapshot();
      const exportedAt = currentTime();
      const document = buildBackup({ entries, exportedAt });
      return {
        format: LIBRARY_BACKUP_FORMAT,
        schemaVersion: LIBRARY_BACKUP_SCHEMA_VERSION,
        filename: `echo-listener-library-${exportedAt.slice(0, 10)}.json`,
        json: serializeBackup(document),
      };
    });
    return result;
  }

  async function exportRecoverySnapshot() {
    return perform(async () => {
      const raw = await adapter.transact([LIBRARY_ENTRIES_STORE, LIBRARY_SETTINGS_STORE], "readonly", (transaction, control) => {
        let entries = null;
        let settings = null;
        const finish = () => {
          if (entries !== null && settings !== null) control.setResult({ entries, settings });
        };
        const entriesRequest = transaction.objectStore(LIBRARY_ENTRIES_STORE).getAll();
        entriesRequest.onsuccess = () => { entries = entriesRequest.result; finish(); };
        entriesRequest.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The recovery snapshot could not read stored rows."));
        const settingsRequest = transaction.objectStore(LIBRARY_SETTINGS_STORE).getAll();
        settingsRequest.onsuccess = () => { settings = settingsRequest.result; finish(); };
        settingsRequest.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The recovery snapshot could not read settings."));
      });
      const exportedAt = currentTime();
      const document = buildRecoverySnapshot({ exportedAt, entries: raw.entries, settings: raw.settings });
      let json;
      try { json = JSON.stringify(document, null, 2); } catch {
        throw new LibraryStorageError("recovery_export_failed", "The raw Library rows could not be serialized. The stored data remains unchanged.");
      }
      return {
        format: LIBRARY_RECOVERY_FORMAT,
        filename: `echo-listener-library-recovery-${exportedAt.slice(0, 10)}.json`,
        json,
      };
    }, "recovery_export_failed");
  }

  async function previewImport(input, { mode = "merge", knownShowIds: knownIdsOverride } = {}) {
    if (mode !== "merge" && mode !== "replace") return failure("invalid_import_mode", "Choose Merge or Replace for this import.");
    const validation = validateBackupInput(input);
    if (!validation.ok) {
      const candidateCount = validation.candidateEntryCount ?? (isPlainObject(input) && Array.isArray(input.entries) ? input.entries.length : 0);
      return Object.freeze({ ok: true, value: freezeCopy(buildInvalidPreview(validation, candidateCount, mode, knownIdsOverride)) });
    }

    const snapshot = await perform(readEntriesSnapshot);
    if (!snapshot.ok) return snapshot;
    const imported = validation.value;
    const localById = new Map(snapshot.value.map((entry) => [entry.showId, entry]));
    const knownIds = validKnownIds(knownIdsOverride);
    const unknownIds = knownIds === null
      ? null
      : imported.entries.filter((entry) => isKnownShow(entry.showId, knownIds) === false).map((entry) => entry.showId).sort();
    const conflicts = imported.entries.filter((entry) => localById.has(entry.showId)).map((entry) => entry.showId).sort();
    const id = previewId();
    importPreviews.set(id, {
      mode,
      entries: imported.entries.map((entry) => ({ ...entry })),
    });
    const mergedCount = mode === "replace"
      ? imported.entries.length
      : localById.size + imported.entries.filter((entry) => !localById.has(entry.showId)).length;
    return Object.freeze({
      ok: true,
      value: freezeCopy({
        previewId: id,
        valid: true,
        operationMode: mode,
        totalEntries: imported.entries.length,
        statusCounts: statusCounts(imported.entries),
        invalidData: [],
        unknownCatalogueIds: unknownIds,
        catalogueContextAvailable: knownIds !== null,
        sameIdConflicts: conflicts,
        conflictRule: CONFLICT_RULE,
        resultingEntryCount: mergedCount,
      }),
    });
  }

  async function commitImport(id, { confirmed = false } = {}) {
    const preview = importPreviews.get(id);
    if (!preview) return failure("invalid_import_preview", "Preview this backup again before committing it.");
    if (preview.mode === "replace" && confirmed !== true) {
      return failure("confirmation_required", "Confirm Replace in the calling layer before replacing the full Library.");
    }
    const result = await perform(() => adapter.transact([LIBRARY_ENTRIES_STORE], "readwrite", (transaction, control) => {
      const entriesStore = transaction.objectStore(LIBRARY_ENTRIES_STORE);
      const commit = (localEntries) => {
        try {
          const conflicts = preview.entries.filter((entry) => localEntries.has(entry.showId)).map((entry) => entry.showId).sort();
          let resultingEntries;
          if (preview.mode === "replace") {
            entriesStore.clear();
            resultingEntries = preview.entries;
          } else {
            resultingEntries = [...localEntries.values()];
            const byId = new Map(resultingEntries.map((entry) => [entry.showId, entry]));
            for (const entry of preview.entries) byId.set(entry.showId, entry);
            resultingEntries = [...byId.values()];
          }
          for (const entry of preview.entries) entriesStore.put({ ...entry });
          control.setResult({
            operationMode: preview.mode,
            importedCount: preview.entries.length,
            resultingEntryCount: resultingEntries.length,
            sameIdConflicts: conflicts,
            conflictRule: CONFLICT_RULE,
          });
        } catch (error) { control.fail(error); }
      };

      let localEntries = null;
      const entriesRequest = entriesStore.getAll();
      entriesRequest.onsuccess = () => {
        try {
          localEntries = new Map(validateStoredEntries(entriesRequest.result).map((entry) => [entry.showId, entry]));
          commit(localEntries);
        } catch (error) { control.fail(error); }
      };
      entriesRequest.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library entries could not be read."));
    }));
    if (result.ok) {
      importPreviews.delete(id);
      publishChange();
    }
    return result;
  }

  async function reset({ confirmed = false } = {}) {
    if (confirmed !== true) return failure("confirmation_required", "Confirm clearing the Library in the calling layer before resetting it.");
    const result = await perform(() => adapter.transact([LIBRARY_ENTRIES_STORE, LIBRARY_SETTINGS_STORE], "readwrite", (transaction, control) => {
      const entriesStore = transaction.objectStore(LIBRARY_ENTRIES_STORE);
      const settingsStore = transaction.objectStore(LIBRARY_SETTINGS_STORE);
      let count = null;
      let settings = null;
      const finish = () => {
        if (count === null || settings === null) return;
        try {
          const wasEnabled = settings.some((row) => row?.key === PERSONAL_DISCOVERY_SETTING_KEY && row?.value === true);
          const settingWasMalformed = settings.some((row) => !isPlainObject(row)
            || row.key !== PERSONAL_DISCOVERY_SETTING_KEY
            || !validatePersonalDiscoverySetting(row.value));
          entriesStore.clear();
          settingsStore.clear();
          control.setResult({
            removedEntryCount: count,
            personalDiscoveryWasEnabled: wasEnabled,
            personalDiscoverySettingWasMalformed: settingWasMalformed,
          });
        } catch (error) { control.fail(error); }
      };
      const countRequest = entriesStore.count();
      countRequest.onsuccess = () => { count = countRequest.result; finish(); };
      countRequest.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library entries could not be counted before reset."));
      const settingsRequest = settingsStore.getAll();
      settingsRequest.onsuccess = () => { settings = settingsRequest.result; finish(); };
      settingsRequest.onerror = () => control.fail(new LibraryStorageError("storage_read_failed", "The Library setting could not be read before reset."));
    }));
    if (result.ok && (result.value.removedEntryCount > 0 || result.value.personalDiscoveryWasEnabled)) publishChange();
    return result;
  }

  function close() {
    adapter.close();
    try { channel?.close(); } catch {}
    channel = null;
    channelAttempted = false;
    listeners.clear();
    importPreviews.clear();
  }

  async function open() {
    return checkAvailability();
  }

  return Object.freeze({
    open,
    checkAvailability,
    getEntry,
    listEntries,
    setState,
    setRating,
    removeRating,
    removeEntry,
    subscribe,
    getPersonalDiscoveryEnabled,
    setPersonalDiscoveryEnabled,
    getPersonalContext,
    exportLibrary,
    exportRecoverySnapshot,
    previewImport,
    commitImport,
    reset,
    close,
  });
}

function statusCounts(entries) {
  const counts = Object.fromEntries(LIBRARY_STATES.map((state) => [state, 0]));
  for (const entry of entries) {
    if (isValidLibraryState(entry?.state)) counts[entry.state] += 1;
  }
  return counts;
}

function equalEntry(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (!isPlainObject(value)) return value;
  const copy = {};
  for (const [key, child] of Object.entries(value)) copy[key] = freezeCopy(child);
  return Object.freeze(copy);
}
