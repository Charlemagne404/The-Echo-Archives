const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadCatalog } = require("../lib/catalog");
const { PLACEHOLDER_COVER } = require("../lib/cover-sync");

const siteRoot = path.resolve(__dirname, "../..");

function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function createResponse({ url, status = 200, headers = {}, body = "" }) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");

  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers(headers),
    async text() {
      return payload.toString("utf8");
    },
    async arrayBuffer() {
      return bufferToArrayBuffer(payload);
    },
  };
}

function createFetchStub(routeMap) {
  const calls = [];

  const fetchStub = async (url) => {
    const normalizedUrl = String(url);
    calls.push(normalizedUrl);
    const route = routeMap.get(normalizedUrl);

    if (!route) {
      throw new Error(`Unexpected fetch ${normalizedUrl}`);
    }

    if (route instanceof Error) {
      throw route;
    }

    return route;
  };

  fetchStub.calls = calls;
  return fetchStub;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function createTempSiteRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echo-archives-cover-sync-"));
}

function seedAssets(tempRoot) {
  fs.mkdirSync(path.join(tempRoot, "images"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "images", "Logo.png"), Buffer.from("logo"));
  fs.writeFileSync(path.join(tempRoot, "images", "TEA-Logo-S.png"), Buffer.from("placeholder"));
}

function createShowRecord(overrides = {}) {
  return {
    id: "demo-show",
    title: "Demo Show",
    description: "A demo archive description.",
    cover: "",
    coverAlt: "",
    status: "published",
    reviewStatus: "indexed-only",
    releaseStatus: "completed",
    completionStatus: "finished",
    listenLinks: {
      rss: "",
      apple: "",
      website: "",
    },
    officialLinks: {
      website: "",
    },
    genres: ["sci-fi"],
    tones: ["dark"],
    formats: ["full-cast"],
    tags: ["Time travel"],
    ratings: {
      archive: 8,
    },
    bestFor: ["easy-entry"],
    similarTo: [],
    archiveTake: "Worth indexing.",
    spoilerFreeReview: "",
    thoughts: "",
    quote: {
      text: "",
      attribution: "",
    },
    updatedAt: "2026-06-15",
    ...overrides,
  };
}

function createLogger() {
  return {
    warnings: [],
    warn(message) {
      this.warnings.push(String(message));
    },
  };
}

test("blank cover with RSS source downloads a managed local cover and persists it", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  seedAssets(tempRoot);
  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      listenLinks: {
        rss: "https://example.com/feed.xml",
        apple: "",
        website: "",
      },
    }),
  ]);

  const fetchStub = createFetchStub(
    new Map([
      [
        "https://example.com/feed.xml",
        createResponse({
          url: "https://example.com/feed.xml",
          headers: { "content-type": "application/rss+xml" },
          body: `<?xml version="1.0"?><rss><channel><itunes:image href="https://cdn.example.com/artwork.jpeg?size=3000" /></channel></rss>`,
        }),
      ],
      [
        "https://cdn.example.com/artwork.jpeg?size=3000",
        createResponse({
          url: "https://cdn.example.com/artwork.jpeg?size=3000",
          headers: { "content-type": "image/jpeg" },
          body: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
        }),
      ],
    ]),
  );

  const [show] = await loadCatalog(tempRoot, { coverSync: { fetchImpl: fetchStub, logger: createLogger() } });
  const persistedShows = readJson(path.join(dataRoot, "shows.json"));

  assert.equal(show.cover, "images/covers/demo-show.jpg");
  assert.equal(show.coverAlt, "Demo Show cover art");
  assert.equal(persistedShows[0].cover, "images/covers/demo-show.jpg");
  assert.equal(persistedShows[0].coverAlt, "Demo Show cover art");
  assert.ok(fs.existsSync(path.join(tempRoot, "images", "covers", "demo-show.jpg")));

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("blank cover with Apple source downloads a managed local cover and persists it", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  seedAssets(tempRoot);
  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      listenLinks: {
        rss: "",
        apple: "https://podcasts.apple.com/us/podcast/demo-show/id123",
        website: "",
      },
    }),
  ]);

  const fetchStub = createFetchStub(
    new Map([
      [
        "https://podcasts.apple.com/us/podcast/demo-show/id123",
        createResponse({
          url: "https://podcasts.apple.com/us/podcast/demo-show/id123",
          headers: { "content-type": "text/html; charset=utf-8" },
          body: `<html><head><meta property="og:image" content="https://is1-ssl.mzstatic.com/image/thumb/demo/cover.png/1200x1200.png"></head></html>`,
        }),
      ],
      [
        "https://is1-ssl.mzstatic.com/image/thumb/demo/cover.png/1200x1200.png",
        createResponse({
          url: "https://is1-ssl.mzstatic.com/image/thumb/demo/cover.png/1200x1200.png",
          headers: { "content-type": "image/png" },
          body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        }),
      ],
    ]),
  );

  const [show] = await loadCatalog(tempRoot, { coverSync: { fetchImpl: fetchStub, logger: createLogger() } });
  const persistedShows = readJson(path.join(dataRoot, "shows.json"));

  assert.equal(show.cover, "images/covers/demo-show.png");
  assert.equal(persistedShows[0].cover, "images/covers/demo-show.png");
  assert.ok(fs.existsSync(path.join(tempRoot, "images", "covers", "demo-show.png")));

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("blank cover with website-only source downloads a managed local cover and persists it", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  seedAssets(tempRoot);
  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      officialLinks: {
        website: "https://example.com/show",
      },
    }),
  ]);

  const fetchStub = createFetchStub(
    new Map([
      [
        "https://example.com/show",
        createResponse({
          url: "https://example.com/show",
          headers: { "content-type": "text/html; charset=utf-8" },
          body: `<html><head><meta name="twitter:image" content="/art/demo-cover.webp"></head></html>`,
        }),
      ],
      [
        "https://example.com/art/demo-cover.webp",
        createResponse({
          url: "https://example.com/art/demo-cover.webp",
          headers: { "content-type": "image/webp" },
          body: Buffer.from([0x52, 0x49, 0x46, 0x46]),
        }),
      ],
    ]),
  );

  const [show] = await loadCatalog(tempRoot, { coverSync: { fetchImpl: fetchStub, logger: createLogger() } });
  const persistedShows = readJson(path.join(dataRoot, "shows.json"));

  assert.equal(show.cover, "images/covers/demo-show.webp");
  assert.equal(persistedShows[0].cover, "images/covers/demo-show.webp");
  assert.ok(fs.existsSync(path.join(tempRoot, "images", "covers", "demo-show.webp")));

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("existing valid local cover remains untouched and does not fetch", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  seedAssets(tempRoot);
  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      cover: "images/Logo.png",
      coverAlt: "Existing alt text",
    }),
  ]);

  const fetchStub = createFetchStub(new Map());
  const [show] = await loadCatalog(tempRoot, { coverSync: { fetchImpl: fetchStub, logger: createLogger() } });
  const persistedShows = readJson(path.join(dataRoot, "shows.json"));

  assert.equal(show.cover, "images/Logo.png");
  assert.equal(show.coverAlt, "Existing alt text");
  assert.equal(persistedShows[0].cover, "images/Logo.png");
  assert.equal(fetchStub.calls.length, 0);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("missing local cover files are re-fetched and corrected to the managed cover path", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  seedAssets(tempRoot);
  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      cover: "old/demo-show.jpg",
      listenLinks: {
        rss: "",
        apple: "https://podcasts.apple.com/us/podcast/demo-show/id999",
        website: "",
      },
    }),
  ]);

  const fetchStub = createFetchStub(
    new Map([
      [
        "https://podcasts.apple.com/us/podcast/demo-show/id999",
        createResponse({
          url: "https://podcasts.apple.com/us/podcast/demo-show/id999",
          headers: { "content-type": "text/html; charset=utf-8" },
          body: `<html><head><meta property="og:image" content="https://assets.example.com/demo-show.png"></head></html>`,
        }),
      ],
      [
        "https://assets.example.com/demo-show.png",
        createResponse({
          url: "https://assets.example.com/demo-show.png",
          headers: { "content-type": "image/png" },
          body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        }),
      ],
    ]),
  );

  const [show] = await loadCatalog(tempRoot, { coverSync: { fetchImpl: fetchStub, logger: createLogger() } });
  const persistedShows = readJson(path.join(dataRoot, "shows.json"));

  assert.equal(show.cover, "images/covers/demo-show.png");
  assert.equal(persistedShows[0].cover, "images/covers/demo-show.png");
  assert.ok(fs.existsSync(path.join(tempRoot, "images", "covers", "demo-show.png")));

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("fetch failures keep catalog load alive and inject the placeholder cover in memory", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  seedAssets(tempRoot);
  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      listenLinks: {
        rss: "https://example.com/failure-feed.xml",
        apple: "",
        website: "",
      },
    }),
  ]);

  const fetchStub = createFetchStub(
    new Map([
      [
        "https://example.com/failure-feed.xml",
        createResponse({
          url: "https://example.com/failure-feed.xml",
          headers: { "content-type": "application/rss+xml" },
          body: `<?xml version="1.0"?><rss><channel><itunes:image href="https://cdn.example.com/broken-cover.jpg" /></channel></rss>`,
        }),
      ],
      ["https://cdn.example.com/broken-cover.jpg", new Error("network down")],
    ]),
  );
  const logger = createLogger();

  const [show] = await loadCatalog(tempRoot, { coverSync: { fetchImpl: fetchStub, logger } });
  const persistedShows = readJson(path.join(dataRoot, "shows.json"));

  assert.equal(show.cover, PLACEHOLDER_COVER);
  assert.equal(show.coverAlt, "Demo Show cover art");
  assert.equal(persistedShows[0].cover, "");
  assert.equal(logger.warnings.length, 1);
  assert.match(logger.warnings[0], /network down/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("active SVG cover content is rejected instead of being written into the public asset tree", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  seedAssets(tempRoot);
  writeJson(path.join(dataRoot, "shows.json"), [
    createShowRecord({
      officialLinks: {
        website: "https://example.com/show",
      },
    }),
  ]);

  const fetchStub = createFetchStub(
    new Map([
      [
        "https://example.com/show",
        createResponse({
          url: "https://example.com/show",
          headers: { "content-type": "text/html; charset=utf-8" },
          body: `<html><head><meta property="og:image" content="https://cdn.example.com/cover.svg"></head></html>`,
        }),
      ],
      [
        "https://cdn.example.com/cover.svg",
        createResponse({
          url: "https://cdn.example.com/cover.svg",
          headers: { "content-type": "image/svg+xml" },
          body: `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
        }),
      ],
    ]),
  );
  const logger = createLogger();

  const [show] = await loadCatalog(tempRoot, { coverSync: { fetchImpl: fetchStub, logger } });
  const persistedShows = readJson(path.join(dataRoot, "shows.json"));

  assert.equal(show.cover, PLACEHOLDER_COVER);
  assert.equal(persistedShows[0].cover, "");
  assert.equal(fs.existsSync(path.join(tempRoot, "images", "covers", "demo-show.svg")), false);
  assert.equal(logger.warnings.length, 1);
  assert.match(logger.warnings[0], /unsupported content type/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("missing source links warn once and use the placeholder cover in memory", async () => {
  const tempRoot = createTempSiteRoot();
  const dataRoot = path.join(tempRoot, "data");
  seedAssets(tempRoot);
  writeJson(path.join(dataRoot, "shows.json"), [createShowRecord()]);
  const logger = createLogger();

  const [show] = await loadCatalog(tempRoot, { coverSync: { fetchImpl: createFetchStub(new Map()), logger } });
  const persistedShows = readJson(path.join(dataRoot, "shows.json"));

  assert.equal(show.cover, PLACEHOLDER_COVER);
  assert.equal(persistedShows[0].cover, "");
  assert.equal(logger.warnings.length, 1);
  assert.match(logger.warnings[0], /no eligible rss, apple, or website source links/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("the current catalog remains a no-op when every existing local cover is present", async () => {
  const fetchStub = createFetchStub(new Map());
  const catalog = await loadCatalog(siteRoot, { coverSync: { fetchImpl: fetchStub, logger: createLogger() } });

  assert.ok(catalog.length > 0);
  assert.equal(fetchStub.calls.length, 0);
});
