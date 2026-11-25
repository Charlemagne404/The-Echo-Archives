const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { inspectCoverBuffer, stageCover } = require("../lib/import/cover-stage");

const repositoryRoot = path.resolve(__dirname, "../..");
const validCover = fs.readFileSync(path.join(repositoryRoot, "images/covers/archive-81.jpg"));
const alternateCover = fs.readFileSync(path.join(repositoryRoot, "images/covers/alice-isnt-dead.jpg"));
const echoLogo = fs.readFileSync(path.join(repositoryRoot, "images/Circle2-Logo-S.png"));

test("cover inspection sniffs raster bytes, dimensions, Apple quality, and stable SHA-256", async () => {
  const first = await inspectCoverBuffer(validCover, "image/jpeg");
  const second = await inspectCoverBuffer(validCover, "image/jpeg");
  assert.equal(first.width, 1200);
  assert.equal(first.height, 1200);
  assert.equal(first.echoPublishable, true);
  assert.equal(first.appleQuality, false);
  assert.equal(first.sha256, second.sha256);
  await assert.rejects(() => inspectCoverBuffer(echoLogo, "image/png"), /Echo branding assets cannot be used/i);
  await assert.rejects(() => inspectCoverBuffer(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "image/svg+xml"), /SVG covers are unsupported/i);
  await assert.rejects(() => inspectCoverBuffer(Buffer.from("icns\0\0\0\0\0\0\0\0"), "application/octet-stream"), /ICNS covers are unsupported/i);
  await assert.rejects(() => inspectCoverBuffer(Buffer.from([0xff, 0x0a, 0, 0, 0, 0, 0, 0]), "application/octet-stream"), /JPEG XL covers are unsupported/i);
  const heif = Buffer.alloc(16);
  heif.write("ftyp", 4, "ascii");
  heif.write("heic", 8, "ascii");
  await assert.rejects(() => inspectCoverBuffer(heif, "application/octet-stream"), /HEIF covers are unsupported/i);
  await assert.rejects(() => inspectCoverBuffer(Buffer.from("not an image"), "image/jpeg"), /corrupt|unsupported/i);
  await assert.rejects(() => inspectCoverBuffer(validCover, "image/png"), /does not match/i);
});

test("Echo branding artwork is rejected by official URL and content without rejecting unrelated names", async () => {
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-brand-cover-stage-"));
  const requested = [];
  try {
    const stage = await stageCover({
      candidateId: "candidate",
      coverSources: [
        { url: "https://echoarchives.net/images/Circle2-Logo-S.png", sourceType: "website" },
        { url: "https://cdn.example.com/renamed-show-art.png", sourceType: "rss" },
      ],
      stagingRoot,
      fetchImpl: async (url) => {
        requested.push(String(url));
        return new Response(echoLogo, { status: 200, headers: { "content-type": "image/png" } });
      },
      userAgent: "Echo Tests",
    });

    assert.equal(stage.ready, false);
    assert.equal(requested.length, 1, "a direct Echo branding path is rejected before fetching");
    assert.equal(stage.failures.length, 2);
    assert.ok(stage.failures.every((failure) => /Echo branding assets cannot be used/i.test(failure.error)));
    assert.equal(fs.existsSync(path.join(stagingRoot, "covers", "candidate")), false);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
});

test("cover staging records source failures, replaces changed bytes, and retains one validated file", async () => {
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-cover-stage-"));
  let bytes = validCover;
  const fetchImpl = async (url) => {
    if (String(url).includes("bad")) return new Response("missing", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } });
  };
  try {
    const first = await stageCover({
      candidateId: "candidate", coverSources: [
        { url: "https://example.com/bad", sourceType: "rss" },
        { url: "https://example.com/cover.jpg", sourceType: "apple" },
      ],
      stagingRoot, fetchImpl, userAgent: "Echo Tests", maxBytes: 8 * 1024 * 1024,
    });
    assert.equal(first.ready, true);
    assert.equal(first.sourceType, "apple");
    assert.equal(first.failures.length, 1);
    assert.ok(fs.existsSync(first.stagedPath));
    bytes = alternateCover;
    const second = await stageCover({
      candidateId: "candidate", coverSources: [{ url: "https://example.com/cover.jpg", sourceType: "rss" }],
      stagingRoot, fetchImpl, userAgent: "Echo Tests", maxBytes: 8 * 1024 * 1024,
    });
    assert.equal(second.ready, true);
    assert.equal(second.sourceType, "rss");
    assert.notEqual(second.sha256, first.sha256);
    assert.equal(fs.readdirSync(path.dirname(second.stagedPath)).length, 1);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
});
