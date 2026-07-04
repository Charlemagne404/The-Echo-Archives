const SCROLL_STORAGE_PREFIX = "echo-scroll";

function getStorageKey(key = "") {
  return `${SCROLL_STORAGE_PREFIX}:${key || `${window.location.pathname}${window.location.search}${window.location.hash}`}`;
}

function readSavedPosition(storageKey) {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return Number.isFinite(parsed?.y) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

export function createScrollRestoration({ key = "" } = {}) {
  const resolveStorageKey = () => getStorageKey(typeof key === "function" ? key() : key);
  let saveTimer = 0;
  let restored = false;

  const save = () => {
    const storageKey = resolveStorageKey();
    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          y: window.scrollY,
          x: window.scrollX,
          updatedAt: Date.now(),
        }),
      );
    } catch (_error) {
      // Ignore storage failures.
    }
  };

  const scheduleSave = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 90);
  };

  const enable = () => {
    const hasSavedPosition = Boolean(readSavedPosition(resolveStorageKey()));
    if (hasSavedPosition && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    window.addEventListener("scroll", scheduleSave, { passive: true });
    window.addEventListener("pagehide", save);
  };

  const restore = () => {
    if (restored) {
      return;
    }

    restored = true;
    const saved = readSavedPosition(resolveStorageKey());
    if (!saved) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({
          top: saved.y,
          left: Number.isFinite(saved.x) ? saved.x : 0,
          behavior: "auto",
        });
      });
    });
  };

  const destroy = () => {
    window.clearTimeout(saveTimer);
    window.removeEventListener("scroll", scheduleSave);
    window.removeEventListener("pagehide", save);
  };

  return {
    destroy,
    enable,
    restore,
    save,
    storageKey: resolveStorageKey,
  };
}
