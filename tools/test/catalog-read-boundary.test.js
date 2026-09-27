const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { renderCollectionsPagePrerender, renderHomePagePrerender } = require("../lib/home-page-prerender");
const { createCatalogReport } = require("../report-catalog");

const projectRoot = path.resolve(__dirname, "../..");

function createTempSiteRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-catalog-read-"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function snapshotTree(root) {
  const entries = [];
  const visit = (directoryPath) => {
    const stat = fs.statSync(directoryPath, { bigint: true });
    entries.push({
      path: path.relative(root, directoryPath) || ".",
      type: "directory",
      mode: String(stat.mode),
      mtimeNs: String(stat.mtimeNs),
      ctimeNs: String(stat.ctimeNs),
    });

    fs.readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((entry) => {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          visit(entryPath);
          return;
        }

        const fileStat = fs.statSync(entryPath, { bigint: true });
        entries.push({
          path: path.relative(root, entryPath),
          type: "file",
          mode: String(fileStat.mode),
          mtimeNs: String(fileStat.mtimeNs),
          ctimeNs: String(fileStat.ctimeNs),
          contents: fs.readFileSync(entryPath).toString("base64"),
        });
      });
  };

  visit(root);
  return entries;
}

function createDraftShow() {
  return {
    id: "demo-show",
    title: "Demo Show",
    description: "A draft used to verify that catalogue reports only inspect source data.",
    cover: "",
    status: "draft",
    reviewStatus: "planned",
    releaseStatus: "unknown",
    completionStatus: "unclear",
    listenLinks: { rss: "https://example.test/feed.xml" },
    officialLinks: {},
    genres: [],
    tones: [],
    formats: [],
    tags: [],
    aliases: [],
    themes: [],
    contentNotes: [],
    languages: [],
    transcriptLanguages: [],
    cast: [],
    creators: [],
    bestFor: [],
    similarTo: [],
    similarReasons: {},
    ratings: {},
    updatedAt: "2026-06-15",
  };
}

test("catalog report reads legacy runtime data without migrating or synchronizing it", async () => {
  const tempRoot = createTempSiteRoot();
  const originalFetch = global.fetch;
  let fetchCalls = 0;

  try {
    writeJson(path.join(tempRoot, "data", "shows.json"), [createDraftShow()]);
    writeJson(path.join(tempRoot, "data", "collections.json"), []);
    const before = snapshotTree(tempRoot);
    global.fetch = async () => {
      fetchCalls += 1;
      throw new Error("catalog reports must not fetch cover sources");
    };

    const report = await createCatalogReport(tempRoot);

    assert.equal(report.catalog.length, 1);
    assert.equal(report.catalog[0].cover, "images/TEA-Logo-S.png");
    assert.equal(fetchCalls, 0);
    assert.equal(fs.existsSync(path.join(tempRoot, "catalog-src")), false);
    assert.deepEqual(snapshotTree(tempRoot), before);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("homepage and collection prerendering only reads catalogue files", () => {
  const tempRoot = createTempSiteRoot();
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  const show = {
    ...createDraftShow(),
    status: "published",
    reviewStatus: "indexed-only",
    cover: "images/covers/missing-demo-show.jpg",
    title: "Demo Show",
    description: "A source-backed demo description with enough detail to support archive discovery.",
    genres: ["sci-fi"],
    formats: ["full-cast"],
    tags: ["Time travel"],
    bestFor: ["long-walks"],
    finalRating: 8,
  };
  const collection = {
    id: "demo-route",
    title: "Demo Route",
    description: "A fixture route for prerendering.",
    showIds: ["demo-show"],
    coverShowIds: ["demo-show"],
    featured: true,
    kind: "curated",
    updatedAt: "2026-06-15",
  };
  const shows = Array.from({ length: 61 }, (_value, index) => ({
    ...show,
    id: index === 0 ? "demo-show" : `demo-show-${index + 1}`,
    title: index === 0 ? "Demo Show" : `Demo Show ${index + 1}`,
  }));

  try {
    writeJson(path.join(tempRoot, "data", "shows.json"), shows);
    writeJson(path.join(tempRoot, "data", "collections.json"), [collection]);
    const before = snapshotTree(tempRoot);
    global.fetch = async () => {
      fetchCalls += 1;
      throw new Error("page prerendering must not fetch cover sources");
    };

    const homeSource = fs.readFileSync(path.join(projectRoot, "site-src", "pages", "index.html"), "utf8");
    const collectionsSource = fs.readFileSync(path.join(projectRoot, "site-src", "pages", "collections.html"), "utf8");
    const homeMarkup = renderHomePagePrerender(homeSource, {
      rootDir: tempRoot,
      homeMostPopularIds: ["demo-show"],
      homeFavoriteRouteIds: ["demo-route"],
    });
    const collectionsMarkup = renderCollectionsPagePrerender(collectionsSource, { rootDir: tempRoot });

    assert.match(homeMarkup, /data-home-prerendered="true"/);
    assert.match(homeMarkup, /Demo Show/);
    assert.match(collectionsMarkup, /data-collections-prerendered="true"/);
    assert.match(collectionsMarkup, /Demo Route/);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(snapshotTree(tempRoot), before);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
