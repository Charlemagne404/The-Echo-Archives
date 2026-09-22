const test = require("node:test");
const assert = require("node:assert/strict");

function createWindow(initialSearch = "") {
  const calls = [];
  const location = {
    pathname: "/maintainer/submissions.html",
    search: initialSearch,
    hash: "#detail",
  };

  const history = {
    replaceState(_state, _title, nextUrl) {
      calls.push({ method: "replaceState", nextUrl });
      updateLocation(nextUrl);
    },
    pushState(_state, _title, nextUrl) {
      calls.push({ method: "pushState", nextUrl });
      updateLocation(nextUrl);
    },
  };

  function updateLocation(nextUrl) {
    const url = new URL(nextUrl, "https://echo.test");
    location.pathname = url.pathname;
    location.search = url.search;
    location.hash = url.hash;
  }

  return { location, history, calls };
}

test("maintainer queue selection resolves visible IDs and keeps URL state private", async () => {
  const {
    areMaintainerFiltersEqual,
    readSelectedSubmissionId,
    resolveSelectedSubmissionId,
    syncFiltersToUrl,
    syncSelectedSubmissionToUrl,
  } = await import("../../shared/app/maintainer/page-helpers.js");
  const previousWindow = global.window;
  const windowMock = createWindow("?status=new&q=Queue&page=1&pageSize=20&item=queue-b");
  global.window = windowMock;

  try {
    const items = [
      { id: "queue-a", payload: { review: "Private review text" } },
      { id: "queue-b", contactEmail: "secret@example.com" },
    ];

    assert.equal(readSelectedSubmissionId(), "queue-b");
    assert.equal(resolveSelectedSubmissionId(items, "queue-b"), "queue-b");
    assert.equal(resolveSelectedSubmissionId(items, "stale-id"), "queue-a");
    assert.equal(resolveSelectedSubmissionId([], "stale-id"), "");
    assert.equal(areMaintainerFiltersEqual({ status: "new", page: 1 }, { status: "new", page: 1 }), true);
    assert.equal(areMaintainerFiltersEqual({ status: "new" }, { status: "accepted" }), false);

    syncFiltersToUrl(
      { q: "Queue", status: "new", submissionType: "", priority: "", includeClosed: false, page: 1, pageSize: 20 },
      { selectedId: "queue-b" },
    );
    const filterUrl = new URL(`https://echo.test${windowMock.location.pathname}${windowMock.location.search}${windowMock.location.hash}`);
    assert.equal(filterUrl.searchParams.get("status"), "new");
    assert.equal(filterUrl.searchParams.get("q"), "Queue");
    assert.equal(filterUrl.searchParams.get("item"), "queue-b");
    assert.equal(filterUrl.hash, "#detail");
    assert.doesNotMatch(filterUrl.toString(), /Private|secret@example\.com|reviewNotes|contactEmail/i);

    syncSelectedSubmissionToUrl("queue-a", { mode: "push" });
    assert.equal(windowMock.calls.at(-1).method, "pushState");
    assert.equal(new URLSearchParams(windowMock.location.search).get("item"), "queue-a");
    assert.equal(new URLSearchParams(windowMock.location.search).get("status"), "new");
    assert.equal(new URLSearchParams(windowMock.location.search).get("q"), "Queue");

    syncSelectedSubmissionToUrl("");
    assert.equal(windowMock.calls.at(-1).method, "replaceState");
    assert.equal(new URLSearchParams(windowMock.location.search).has("item"), false);
  } finally {
    global.window = previousWindow;
  }
});

test("malformed maintainer item parameters fall back without throwing", async () => {
  const { readSelectedSubmissionId, resolveSelectedSubmissionId } = await import("../../shared/app/maintainer/page-helpers.js");
  const previousWindow = global.window;
  global.window = createWindow("?item=%E0%A4%A");

  try {
    assert.doesNotThrow(() => readSelectedSubmissionId());
    assert.equal(resolveSelectedSubmissionId([{ id: "queue-a" }], readSelectedSubmissionId()), "queue-a");
  } finally {
    global.window = previousWindow;
  }
});
