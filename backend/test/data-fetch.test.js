const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "../..");

test("fetchJson keeps its timeout active while a response body is stalled", async () => {
  const previousFetch = global.fetch;
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousArchiveSearch = global.EchoArchiveSearch;
  const previousArchiveSimilarity = global.EchoArchiveSimilarity;
  const previousArchiveRecord = global.EchoArchiveRecord;
  global.window = { setTimeout, clearTimeout };
  global.document = { body: { dataset: {} }, getElementById: () => null, querySelector: () => null };
  global.EchoArchiveSearch = require("../../shared/archive-search");
  global.EchoArchiveSimilarity = require("../../shared/archive-similarity");
  global.EchoArchiveRecord = require("../../shared/archive-record");
  global.fetch = async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener("abort", () => {
        controller.error(new DOMException("The request was aborted.", "AbortError"));
      }, { once: true });
    },
  }), { headers: { "content-type": "application/json" } });

  try {
    const { fetchJson } = await import(pathToFileURL(path.join(repositoryRoot, "shared/app/data.js")).href);
    const request = fetchJson("/slow-body.json", { timeoutMs: 20 });
    const outcome = await Promise.race([
      request.then(
        () => ({ kind: "resolved" }),
        (error) => ({ kind: "rejected", message: error.message }),
      ),
      new Promise((resolve) => setTimeout(() => resolve({ kind: "pending" }), 120)),
    ]);
    assert.equal(outcome.kind, "rejected", "a response that never finishes its body must not hang the caller");
    assert.match(outcome.message, /timed out/i);
  } finally {
    if (previousFetch === undefined) delete global.fetch;
    else global.fetch = previousFetch;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
    if (previousArchiveSearch === undefined) delete global.EchoArchiveSearch;
    else global.EchoArchiveSearch = previousArchiveSearch;
    if (previousArchiveSimilarity === undefined) delete global.EchoArchiveSimilarity;
    else global.EchoArchiveSimilarity = previousArchiveSimilarity;
    if (previousArchiveRecord === undefined) delete global.EchoArchiveRecord;
    else global.EchoArchiveRecord = previousArchiveRecord;
  }
});
