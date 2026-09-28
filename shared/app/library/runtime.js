import { createListenerLibrary } from "../../library/service.js";

const library = createListenerLibrary();
const listeners = new Set();
let state = Object.freeze({ loading: true, storageAvailable: false, entries: null, error: null });
let generation = 0;
let initialized = false;

function emit() {
  for (const listener of [...listeners]) {
    try { listener(state); } catch {}
  }
}

export function getLibraryService() {
  return library;
}

export function getLibraryRuntimeState() {
  return state;
}

export function subscribeToLibraryRuntime(listener) {
  if (typeof listener !== "function") throw new TypeError("A Library runtime listener must be a function.");
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshLibraryRuntime() {
  const requestGeneration = ++generation;
  state = Object.freeze({ ...state, loading: true });
  emit();

  const availability = await library.checkAvailability();
  if (requestGeneration !== generation) return state;
  if (!availability.ok) {
    state = Object.freeze({ loading: false, storageAvailable: false, entries: null, error: availability.error });
    emit();
    return state;
  }

  const entriesResult = await library.listEntries();
  if (requestGeneration !== generation) return state;
  if (!entriesResult.ok) {
    state = Object.freeze({ loading: false, storageAvailable: true, entries: null, error: entriesResult.error });
    emit();
    return state;
  }

  state = Object.freeze({
    loading: false,
    storageAvailable: true,
    entries: entriesResult.value,
    entriesById: new Map(entriesResult.value.map((entry) => [entry.showId, entry])),
    error: null,
  });
  emit();
  return state;
}

export async function initializeLibraryRuntime() {
  if (!initialized) {
    initialized = true;
    library.subscribe(() => { void refreshLibraryRuntime(); });
  }
  return refreshLibraryRuntime();
}
