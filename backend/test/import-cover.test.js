const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { inspectCoverBuffer, stageCover } = require("../lib/import/cover-stage");

const repositoryRoot = path.resolve(__dirname, "../..");
const validCover = fs.readFileSync(path.join(repositoryRoot, "images/covers/archive-81.jpg"));
const alternateCover = fs.readFileSync(path.join(repositoryRoot, "images/covers/alice-isnt-dead.jpg"));

test("cover inspection sniffs raster bytes, dimensions, Apple quality, and stable SHA-256", () => {
  const first = inspectCoverBuffer(validCover, "image/jpeg");
  const second = inspectCoverBuffer(validCover, "image/jpeg");
  assert.equal(first.width, 1200);
  assert.equal(first.height, 1200);
  assert.equal(first.echoPublishable, true);
  assert.equal(first.appleQuality, false);
  assert.equal(first.sha256, second.sha256);
  assert.throws(() => inspectCoverBuffer(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "image/svg+xml"), /SVG covers are unsupported/i);
  assert.throws(() => inspectCoverBuffer(Buffer.from("icns\0\0\0\0\0\0\0\0"), "application/octet-stream"), /ICNS covers are unsupported/i);
  assert.throws(() => inspectCoverBuffer(Buffer.from([0xff, 0x0a, 0, 0, 0, 0, 0, 0]), "application/octet-stream"), /JPEG XL covers are unsupported/i);
  const heif = Buffer.alloc(16);
  heif.write("ftyp", 4, "ascii");
  heif.write("heic", 8, "ascii");
  assert.throws(() => inspectCoverBuffer(heif, "application/octet-stream"), /HEIF covers are unsupported/i);
  assert.throws(() => inspectCoverBuffer(Buffer.from("not an image"), "image/jpeg"), /corrupt|unsupported/i);
  assert.throws(() => inspectCoverBuffer(validCover, "image/png"), /does not match/i);
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
      candidateId: "candidate", coverSources: ["https://example.com/bad", "https://example.com/cover.jpg"],
      stagingRoot, fetchImpl, userAgent: "Echo Tests", maxBytes: 8 * 1024 * 1024,
    });
    assert.equal(first.ready, true);
    assert.equal(first.failures.length, 1);
    assert.ok(fs.existsSync(first.stagedPath));
    bytes = alternateCover;
    const second = await stageCover({
      candidateId: "candidate", coverSources: ["https://example.com/cover.jpg"],
      stagingRoot, fetchImpl, userAgent: "Echo Tests", maxBytes: 8 * 1024 * 1024,
    });
    assert.equal(second.ready, true);
    assert.notEqual(second.sha256, first.sha256);
    assert.equal(fs.readdirSync(path.dirname(second.stagedPath)).length, 1);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
});
