import "../archive-record.js";
import "../archive-search.js";

self.addEventListener("message", async (event) => {
  const controller = new AbortController();
  const timeoutId = self.setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(event.data?.url, {
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Search index request failed with ${response.status}.`);

    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Search index data must be an array.");

    const search = globalThis.EchoArchiveSearch;
    const archiveRecord = globalThis.EchoArchiveRecord;
    const records = payload.map((record) => archiveRecord.normalizeShowRecord(record));
    search.hydrateCatalogSearch(records);
    self.postMessage({ ok: true, records });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.message || error) });
  } finally {
    self.clearTimeout(timeoutId);
  }
});
