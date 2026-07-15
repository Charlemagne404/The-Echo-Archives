const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const sharp = require("../../backend/node_modules/sharp");
const {
  applyGeneratedCoverVariants,
  generateCoverVariants,
  generateStaticImageVariants,
} = require("../../backend/lib/responsive-images");
const { createSearchIndexRecord } = require("../lib/catalog-artifacts");

test("server catalog records receive optional generated cover variants without authored changes", (t) => {
  const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-runtime-cover-variants-"));
  t.after(() => fs.rmSync(siteRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(siteRoot, "data"), { recursive: true });
  fs.writeFileSync(path.join(siteRoot, "data", "shows.json"), JSON.stringify([
    {
      id: "fixture",
      coverVariants: [{ src: "/images/generated/covers/fixture-hash-320.webp", width: 320 }],
    },
  ]));

  const catalog = [{ id: "fixture", cover: "images/covers/fixture.png" }];
  applyGeneratedCoverVariants(siteRoot, catalog);
  assert.equal(catalog[0].cover, "images/covers/fixture.png");
  assert.deepEqual(catalog[0].coverVariants, [
    { src: "/images/generated/covers/fixture-hash-320.webp", width: 320 },
  ]);
});

test("search runtime records carry generated cover variants for hydrated collection imagery", () => {
  const variants = [{ src: "/images/generated/covers/fixture-hash-320.webp", width: 320 }];
  const record = createSearchIndexRecord({
    id: "fixture",
    title: "Fixture",
    cover: "images/covers/fixture.png",
    coverVariants: variants,
  });

  assert.deepEqual(record.coverVariants, variants);
});

test("responsive image generation preserves authored covers and enforces deterministic budgets", async (t) => {
  const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-responsive-images-"));
  t.after(() => fs.rmSync(siteRoot, { recursive: true, force: true }));

  const coversDirectory = path.join(siteRoot, "images", "covers");
  fs.mkdirSync(coversDirectory, { recursive: true });
  const sourcePath = path.join(coversDirectory, "fixture.png");
  await sharp({
    create: {
      width: 1000,
      height: 1000,
      channels: 3,
      background: { r: 31, g: 73, b: 109 },
    },
  }).png().toFile(sourcePath);

  const catalog = [{ id: "fixture", cover: "images/covers/fixture.png" }];
  const first = await generateCoverVariants(siteRoot, catalog);
  assert.equal(first.generated, 2);
  assert.equal(catalog[0].cover, "images/covers/fixture.png");
  assert.equal(catalog[0].coverVariants.length, 2);
  assert.match(catalog[0].coverVariants[0].src, /^\/images\/generated\/covers\/fixture-[a-f0-9]{10}-320\.webp$/);
  assert.match(catalog[0].coverVariants[1].src, /^\/images\/generated\/covers\/fixture-[a-f0-9]{10}-640\.webp$/);
  assert.equal(catalog[0].coverVariants[0].src.replace(/-320\.webp$/, ""), catalog[0].coverVariants[1].src.replace(/-640\.webp$/, ""));
  assert.ok(fs.statSync(path.join(siteRoot, catalog[0].coverVariants[0].src.replace(/^\/+/, ""))).size <= 100 * 1024);
  assert.ok(fs.statSync(path.join(siteRoot, catalog[0].coverVariants[1].src.replace(/^\/+/, ""))).size <= 220 * 1024);

  fs.writeFileSync(path.join(siteRoot, "images/generated/covers/orphan.webp"), "orphan");
  await generateCoverVariants(siteRoot, catalog);
  assert.equal(fs.existsSync(path.join(siteRoot, "images/generated/covers/orphan.webp")), false);
});

test("static information illustrations receive WebP and AVIF variants", async (t) => {
  const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-static-images-"));
  t.after(() => fs.rmSync(siteRoot, { recursive: true, force: true }));

  const imagesDirectory = path.join(siteRoot, "images");
  fs.mkdirSync(imagesDirectory, { recursive: true });
  for (const fileName of ["about-discovery-panel-v2.png", "about-continental-orbit.png"]) {
    await sharp({
      create: {
        width: 1200,
        height: 700,
        channels: 3,
        background: { r: 8, g: 13, b: 21 },
      },
    }).png().toFile(path.join(imagesDirectory, fileName));
  }

  const result = await generateStaticImageVariants(siteRoot);
  assert.equal(result.generated, 8);
  Object.values(result.manifest).flat().forEach((variant) => {
    const outputPath = path.join(siteRoot, variant.src.replace(/^\/+/, ""));
    assert.ok(fs.existsSync(outputPath));
    assert.ok(fs.statSync(outputPath).size <= 350 * 1024);
  });
});
