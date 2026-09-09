const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const siteRoot = path.resolve(__dirname, "../..");

async function importSharedModule(relativePath) {
  return import(pathToFileURL(path.join(siteRoot, relativePath)).href);
}

function createBrowseState() {
  return {
    selectedCollectionId: "",
    query: "",
    sortMode: "default",
    filters: {
      genres: new Set(),
      tones: new Set(),
      formats: new Set(),
      tags: new Set(),
      bestFor: new Set(),
      completionStatus: new Set(),
      reviewStatus: new Set(),
    },
  };
}

function withWindow(value, callback) {
  const previousWindow = global.window;
  global.window = value;
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (previousWindow === undefined) {
        delete global.window;
      } else {
        global.window = previousWindow;
      }
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

test("archive URLs encode route IDs and prefer clean paths over legacy query IDs", async () => {
  const {
    createArchiveBestForHref,
    createArchiveGenreHref,
    createArchiveTagHref,
    createCollectionHref,
    createCollectionIntentHref,
    createShowHref,
    getCollectionIdFromLocation,
    getShowIdFromLocation,
  } = await importSharedModule("shared/app/urls.js");

  assert.equal(createShowHref("A show/with? punctuation"), "/shows/A%20show%2Fwith%3F%20punctuation");
  assert.equal(createCollectionHref("A collection/route"), "/collections/A%20collection%2Froute");
  assert.equal(createArchiveGenreHref("science fiction"), "/?genre=science%20fiction#archive");
  assert.equal(createArchiveTagHref("Time travel"), "/?tags=Time%20travel#archive");
  assert.equal(createArchiveBestForHref("long walks"), "/?bestFor=long%20walks#archive");
  assert.equal(createCollectionIntentHref("long walks"), "/collections?intent=long%20walks#collectionsDirectorySection");

  assert.equal(
    getShowIdFromLocation({ pathname: "/shows/clean-id/", search: "?id=legacy-id" }),
    "clean-id",
  );
  assert.equal(getCollectionIdFromLocation({ pathname: "/collections/clean-route", search: "?id=legacy-route" }), "clean-route");
  assert.equal(getShowIdFromLocation({ pathname: "/show", search: "?id=legacy-id" }), "legacy-id");
  assert.equal(getShowIdFromLocation({ pathname: "/shows/%E0%A4%A", search: "" }), "");
});

test("browse filters use OR within a group and AND across groups", async () => {
  const { matchesSelectedFilters } = await importSharedModule("shared/app/pages/home/filter-state.js");
  const show = {
    genreTokens: ["sci-fi"],
    tones: ["dark"],
    formats: ["full-cast"],
    tagTokens: ["time-travel", "space"],
    bestForTokens: ["long-walks"],
    completionStatus: "finished",
    reviewStatus: "indexed-only",
  };

  assert.equal(
    matchesSelectedFilters(show, {
      genres: new Set(["mystery", "sci-fi"]),
      tones: new Set(["dark"]),
      formats: new Set(),
      tags: new Set(["space"]),
      bestFor: new Set(["long-walks"]),
      completionStatus: new Set(["finished"]),
      reviewStatus: new Set(["indexed-only"]),
    }),
    true,
  );
  assert.equal(
    matchesSelectedFilters(show, {
      genres: new Set(["sci-fi"]),
      tones: new Set(["warm"]),
      formats: new Set(),
      tags: new Set(),
      bestFor: new Set(),
      completionStatus: new Set(),
      reviewStatus: new Set(),
    }),
    false,
  );
});

test("browse URL state ignores unknown filters and writes a stable canonical query", async () => {
  await withAppGlobals(async () => {
    const { seedHomeStateFromParams, syncBrowseUrlState } = await importSharedModule("shared/app/pages/home/url-state.js");
    const state = createBrowseState();
    let replacedUrl = "";

    await withWindow(
      {
        location: {
          pathname: "/",
          search: "?collection=known&q=%20derelict%20&sort=recently-updated&genre=sci-fi&genre=missing&tags=TIME%20TRAVEL&tags=unknown&formats=full-cast&reviewStatus=reviewed",
          hash: "#archive",
        },
        history: {
          state: null,
          replaceState(_historyState, _unused, url) {
            replacedUrl = url;
          },
        },
      },
      async () => {
        seedHomeStateFromParams({
          state,
          shows: [{ genreTokens: ["sci-fi"] }, { genreTokens: ["horror"] }],
          collectionsById: new Map([["known", {}]]),
          structuredFilterGroups: [
            { id: "tags", options: [{ id: "time-travel" }] },
            { id: "formats", options: [{ id: "full-cast" }] },
            { id: "reviewStatus", options: [{ id: "indexed-only" }] },
          ],
        });

        assert.equal(state.selectedCollectionId, "known");
        assert.equal(state.query, "derelict");
        assert.equal(state.sortMode, "recently-updated");
        assert.deepEqual([...state.filters.genres], ["sci-fi"]);
        assert.deepEqual([...state.filters.tags], ["time-travel"]);
        assert.deepEqual([...state.filters.formats], ["full-cast"]);
        assert.deepEqual([...state.filters.reviewStatus], []);

        global.window.location.search = "?legacy=keep&genre=stale&tags=old";
        syncBrowseUrlState(state);

        const url = new URL(`https://example.test${replacedUrl}`);
        assert.equal(url.searchParams.get("legacy"), "keep");
        assert.equal(url.searchParams.get("collection"), "known");
        assert.equal(url.searchParams.get("q"), "derelict");
        assert.equal(url.searchParams.get("sort"), "recently-updated");
        assert.deepEqual(url.searchParams.getAll("genre"), ["sci-fi"]);
        assert.deepEqual(url.searchParams.getAll("tags"), ["time-travel"]);
        assert.deepEqual(url.searchParams.getAll("formats"), ["full-cast"]);
        assert.equal(url.searchParams.getAll("tags").includes("old"), false);
        assert.equal(url.hash, "#archive");
      },
    );
  });
});

test("collection and structured filter helpers keep draft and one-off records out of public browse counts", async () => {
  await withAppGlobals(async () => {
    const { getCollectionShows, getPublishedShows, getStructuredFilterGroups } = await importSharedModule("shared/app/data.js");
    const shows = [
      { id: "published-one", status: "published", genres: ["sci-fi"], tones: ["dark"], formats: ["serialized"], tags: ["Space", "Time travel"], bestFor: ["long-walks"], reviewStatus: "indexed-only", completionStatus: "finished" },
      { id: "published-two", status: "published", genres: ["sci-fi"], tones: [], formats: ["serialized"], tags: ["Space"], bestFor: [], reviewStatus: "imported", completionStatus: "ongoing" },
      { id: "draft-one", status: "draft", genres: ["sci-fi"], tones: ["dark"], formats: ["serialized"], tags: ["Space"], bestFor: [], reviewStatus: "indexed-only", completionStatus: "unclear" },
    ];

    const publishedShows = getPublishedShows(shows);
    assert.deepEqual(publishedShows.map((show) => show.id), ["published-one", "published-two"]);
    assert.deepEqual(
      getCollectionShows({ showIds: ["published-one", "draft-one", "missing"] }, new Map(shows.map((show) => [show.id, show]))).map((show) => show.id),
      ["published-one"],
    );

    const groups = getStructuredFilterGroups(publishedShows);
    const tags = groups.find((group) => group.id === "tags");
    assert.ok(tags);
    assert.deepEqual(tags.options.map((option) => option.id), ["space"]);
    assert.equal(tags.options[0].count, 2, "filter counts must exclude draft records");
  });
});
