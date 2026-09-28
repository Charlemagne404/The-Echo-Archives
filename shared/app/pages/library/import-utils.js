export function readImportEntries(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.entries) ? parsed.entries.filter((entry) => entry && typeof entry === "object") : [];
  } catch {
    return [];
  }
}

export function getImportEntryLabel(entries, showId) {
  const entry = entries.find((candidate) => candidate.showId === showId);
  const title = typeof entry?.titleSnapshot === "string" ? entry.titleSnapshot.trim() : "";
  return title ? `${title} — ${showId}` : showId;
}
