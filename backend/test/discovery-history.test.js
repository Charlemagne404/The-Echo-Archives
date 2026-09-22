const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const siteRoot = path.resolve(__dirname, "../..");

async function importSharedModule(relativePath) {
  return import(pathToFileURL(path.join(siteRoot, relativePath)).href);
}

function withWindow(value, callback) {
  const previousWindow = global.window;
  global.window = value;
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (previousWindow === undefined) delete global.window;
      else global.window = previousWindow;
    });
}

function withAppGlobals(callback) {
  const previous = {
    document: global.document,
    archiveRecord: global.EchoArchiveRecord,
    archiveSearch: global.EchoArchiveSearch,
  };
  global.document = {
    body: { dataset: {} },
    getElementById: () => null,
    querySelector: () => null,
  };
  global.EchoArchiveRecord = require("../../shared/archive-record");
  global.EchoArchiveSearch = require("../../shared/archive-search");
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (previous.document === undefined) delete global.document;
      else global.document = previous.document;
      if (previous.archiveRecord === undefined) delete global.EchoArchiveRecord;
      else global.EchoArchiveRecord = previous.archiveRecord;
      if (previous.archiveSearch === undefined) delete global.EchoArchiveSearch;
      else global.EchoArchiveSearch = previous.archiveSearch;
    });
}

test("search history commits once after settled typing and can commit immediately", async () => {
  const { createDebouncedHistoryCommit } = await importSharedModule("shared/app/discovery-history.js");
  const timers = new Map();
  const cleared = [];
  let nextTimerId = 1;
  let commitCount = 0;
  const historyCommit = createDebouncedHistoryCommit({
    delayMs: 500,
    onCommit: () => {
      commitCount += 1;
    },
    setTimeoutImpl: (callback) => {
      const id = nextTimerId++;
      timers.set(id, callback);
      return id;
    },
    clearTimeoutImpl: (id) => {
      cleared.push(id);
      timers.delete(id);
    },
  });

  historyCommit.schedule();
  historyCommit.schedule();
  historyCommit.schedule();
  assert.equal(historyCommit.isPending(), true);
  assert.equal(timers.size, 1);
  assert.equal(commitCount, 0);
  const activeTimer = [...timers.values()][0];
  activeTimer();
  assert.equal(commitCount, 1);
  assert.equal(historyCommit.isPending(), false);

  historyCommit.schedule();
  assert.equal(historyCommit.commitNow(), true);
  assert.equal(commitCount, 2);
  assert.equal(historyCommit.commitNow(), false);
  assert.ok(cleared.length >= 1);
});

test("discovery history controller replaces transient state and pushes meaningful state", async () => {
  const { createDiscoveryHistoryController } = await importSharedModule("shared/app/discovery-history.js");
  const calls = [];
  const state = { view: "initial" };
  function updateLocation(nextUrl) {
    const next = new URL(nextUrl, "https://echo.test");
    global.window.location.pathname = next.pathname;
    global.window.location.search = next.search;
    global.window.location.hash = next.hash;
  }

  await withWindow(
    {
      location: { pathname: "/browse", search: "?legacy=keep", hash: "#archive" },
      history: {
        state: null,
        pushState(_state, _title, nextUrl) {
          calls.push("pushState");
          updateLocation(nextUrl);
        },
        replaceState(_state, _title, nextUrl) {
          calls.push("replaceState");
          updateLocation(nextUrl);
        },
      },
    },
    async () => {
      const buildUrl = (currentState) => `/browse?view=${currentState.view}#archive`;
      const syncUrl = (currentState, { historyMode }) => {
        const nextUrl = buildUrl(currentState);
        const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (historyMode === "push" || nextUrl !== currentUrl) {
          window.history[historyMode === "push" ? "pushState" : "replaceState"](window.history.state, "", nextUrl);
        }
        return nextUrl;
      };
      const controller = createDiscoveryHistoryController({ state, buildUrl, syncUrl });

      controller.synchronizeUrlState("replace", "initial");
      state.view = "search";
      controller.synchronizeUrlState("replace", "live-search");
      state.view = "filter";
      controller.synchronizeUrlState("push", "explicit");
      controller.synchronizeUrlState("push", "explicit");
      state.view = "search";
      controller.synchronizeUrlState("replace", "history-restore");
    },
  );

  assert.deepEqual(calls, ["replaceState", "replaceState", "pushState", "replaceState"]);
});

test("collections URL state canonicalizes supported filters and preserves unrelated URL state", async () => {
  await withAppGlobals(async () => {
    const {
      buildCollectionsUrl,
      parseCollectionsUrlState,
      syncCollectionsUrlState,
    } = await importSharedModule("shared/app/pages/collections-url-state.js");
    const location = {
      pathname: "/collections",
      search: "?legacy=keep&intent=not-valid&q=space&sort=updated",
      hash: "#collectionsDirectorySection",
    };
    const state = parseCollectionsUrlState(location, new Set(["finished"]));
    assert.deepEqual(state, { intent: "", query: "space", sortMode: "newest" });
    assert.equal(
      buildCollectionsUrl({ intent: "finished", query: "derelict", sortMode: "rating" }, location),
      "/collections?legacy=keep&intent=finished&q=derelict&sort=rating#collectionsDirectorySection",
    );

    const calls = [];
    await withWindow(
      {
        location: { ...location },
        history: {
          state: null,
          pushState(_state, _title, nextUrl) {
            calls.push(["pushState", nextUrl]);
          },
          replaceState(_state, _title, nextUrl) {
            calls.push(["replaceState", nextUrl]);
          },
        },
      },
      async () => {
        syncCollectionsUrlState({ intent: "finished", query: "derelict", sortMode: "rating" }, { historyMode: "push" });
        syncCollectionsUrlState({ intent: "finished", query: "derelict", sortMode: "rating" });
      },
    );
    assert.deepEqual(calls.map(([method]) => method), ["pushState", "replaceState"]);
  });
});

test("entity directory URL state restores only supported query, filter, and sort values", async () => {
  const {
    buildEntityDirectoryUrl,
    parseEntityDirectoryUrlState,
  } = await importSharedModule("shared/app/pages/entity-directory-url-state.js");
  const location = { pathname: "/creators", search: "?q=Fool&type=invalid&sort=unknown&keep=1", hash: "#directory" };
  assert.deepEqual(parseEntityDirectoryUrlState(location), { query: "Fool", type: "all", sort: "name" });
  assert.equal(
    buildEntityDirectoryUrl({ query: "Fool and Scholar", type: "network", sort: "shows" }, location),
    "/creators?keep=1&q=Fool+and+Scholar&type=network&sort=shows#directory",
  );
});
