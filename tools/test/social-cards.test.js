const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const sharp = require("../../backend/node_modules/sharp");
const { PALETTE, cardSpecs, generateSocialCards, renderCard, renderSvg, titleLayout, wrapText, measure } = require("../../backend/lib/social-cards");
const { socialPreview } = require("../../shared/archive-social");

test("public cards use the real wordmark, restrained circular background, public palette and visible address", async () => {
  const root = path.resolve(__dirname, "../..");
  const publicStyle = fs.readFileSync(path.join(root, "shared/styles/home/cards/01-surface.css"), "utf8");
  for (const [key, token] of [["background", "page-bg"], ["surface", "surface-strong"], ["text", "text-primary"], ["accent", "accent"]]) {
    assert.equal(PALETTE[key], publicStyle.match(new RegExp(`--${token}:\\s*(#[a-f0-9]{6})`))[1]);
  }
  assert.match(fs.readFileSync(path.join(root, "shared/styles/home/collections/01-page.css"), "utf8"), /rgba\(255, 108, 77, 0\.92\)/);
  for (const kind of ["default", "show", "entity", "collection"]) {
    const svg = renderSvg({ kind, title: "A Page Title", descriptor: kind === "entity" ? "Production company" : "" });
    assert.equal((svg.match(/aria-label="echoarchives\.net"/g) || []).length, 1);
    assert.equal((svg.match(/aria-label="The Echo Archives wordmark"/g) || []).length, 1, "one actual wordmark, no footer brand repetition");
    const wordmark = svg.match(/href="data:image\/svg\+xml;base64,([^"]+)"/)[1];
    const wordmarkAsset = kind === "default" ? "echo-wordmark-sub1.svg" : "echo-wordmark-nosub1.svg";
    assert.deepEqual(Buffer.from(wordmark, "base64"), fs.readFileSync(path.join(root, wordmarkAsset)), `embed the authored ${kind} wordmark asset unchanged`);
    if (kind === "default") {
      assert.doesNotMatch(svg, /aria-label="(?:The Echo|Archives)"/, "default identity uses the asset rather than recreated title text");
    }
    const categoryLabels = svg.match(/aria-label="(?:AUDIO DRAMA DISCOVERY|CREATORS IN THE ARCHIVE|CURATED COLLECTION)"/g) || [];
    assert.equal(categoryLabels.length, kind === "default" ? 0 : 1, "the default card carries discovery identity in its authored subtitle wordmark");
    assert.equal((svg.match(/<circle\b/g) || []).length, 2, "use only faint background circles");
    assert.doesNotMatch(svg, /data:image\/png;base64,|waveformInk|Oversized Echo waveform|data-wave-bar|corner-bracket|hud/i, "do not add a separate icon or dashboard decoration");
    assert.doesNotMatch(svg, /radio telescope|transmission arc|hero-archive-dish|#82bf91|#213e2b|#a8b8ad/, "no dish illustration or former community palette");
    // The PNG's lower-right address area must contain actual visible glyphs.
    const png = await renderCard({ kind, title: "A Page Title", descriptor: "" });
    const brandArea = kind === "default"
      ? { left: 108, top: 235, width: 984, height: 148 }
      : { left: 54, top: 40, width: 548, height: 82 };
    const brandPixels = await sharp(png).extract(brandArea).removeAlpha().raw().toBuffer();
    let visibleBrandPixels = 0;
    for (let index = 0; index < brandPixels.length; index += 3) if (brandPixels[index] > 150 && brandPixels[index + 1] > 150 && brandPixels[index + 2] > 150) visibleBrandPixels += 1;
    assert.ok(visibleBrandPixels > 900, `${kind}: the embedded SVG wordmark must rasterize visibly`);
    const crop = await sharp(png).extract({ left: 920, top: 548, width: 230, height: 50 }).removeAlpha().raw().toBuffer();
    let brightPixels = 0;
    for (let index = 0; index < crop.length; index += 3) if (crop[index] > 100 && crop[index + 1] > 100 && crop[index + 2] > 100) brightPixels += 1;
    assert.ok(brightPixels > 500, `${kind}: the website address must be legible in the raster output`);
  }
  assert.ok(titleLayout("7 Lamb Productions", 620).lines.length <= 2);
  assert.ok(titleLayout("Best for long walks", 620).lines.length <= 2);
});

test("titles wrap and truncate to measured bounds with Unicode and punctuation", () => {
  for (const title of ["Midnight Burger", "Échos — ‘München’ & Ω / Київ", "Extremely long title ".repeat(60), "W".repeat(1000), "The Very Long Production Company Name ".repeat(10)]) {
    const { size, lines } = titleLayout(title, 610);
    assert.ok(lines.length <= 4);
    assert.ok(lines.every((line) => measure(line, size) <= 610), JSON.stringify(lines));
  }
  assert.equal(wrapText("Word ".repeat(400), 46, 610, 4).at(-1).endsWith("…"), true);
  const svg = renderSvg({ kind: "show", title: '</svg><script>"&', descriptor: "Échos" });
  assert.doesNotMatch(svg, /<script>/);
  assert.equal((svg.match(/<svg\b/g) || []).length, 1);
});

test("spec selection uses published records and explicit relationships without changing source order", () => {
  const shows = [
    { id: "one", title: "One", status: "published", entityLinks: [{ entityId: "studio", role: "creator" }] },
    { id: "two", title: "Two", status: "published" },
    { id: "draft", title: "Draft", status: "draft", entityLinks: [{ entityId: "studio", role: "creator" }] },
  ];
  const collection = { id: "path", title: "Path", anchorShowId: "one", showIds: ["two"], coverShowIds: ["draft", "two"] };
  const data = { shows, collections: [collection], entities: [{ id: "studio", name: "Studio", type: "studio" }] };
  const before = JSON.stringify(data);
  const specs = cardSpecs(data);
  assert.deepEqual(specs.filter((spec) => spec.kind === "show").map((spec) => spec.record.id), ["one", "two"]);
  assert.deepEqual(specs.find((spec) => spec.kind === "collection").covers.map((show) => show.id), ["one", "two"]);
  assert.deepEqual(specs.find((spec) => spec.kind === "entity").covers.map((show) => show.id), ["one"]);
  assert.equal(JSON.stringify(data), before);
  assert.throws(() => socialPreview("show", { id: "../escape" }), /Invalid/);
});

test("clean generation, caching, corruption repair, cover fallback, pruning and bytes are deterministic", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-social-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "images"));
  fs.mkdirSync(path.join(root, "shows"));
  const bright = await sharp({ create: { width: 900, height: 160, channels: 3, background: "#ffffed" } }).png().toBuffer();
  const dark = await sharp({ create: { width: 170, height: 950, channels: 3, background: "#010203" } }).png().toBuffer();
  fs.writeFileSync(path.join(root, "shows/bright.png"), bright);
  fs.writeFileSync(path.join(root, "images/dark.png"), dark);
  fs.writeFileSync(path.join(root, "images/broken.png"), "not an image");
  const show = (id, cover, title = id) => ({ id, cover, title, genres: ["sci-fi"], status: "published", entityLinks: [{ entityId: "studio", role: "production-company" }] });
  const data = {
    shows: [show("bright", "shows/bright.png"), show("dark", "images/dark.png"), show("broken", "images/broken.png"), show("missing", "images/missing.png"), show("unicode", "https://example.invalid/no-network.png", "Écho — Ω & ‘Stories’")],
    collections: [{ id: "collection", title: "Shows like Écho", showIds: ["bright", "dark", "bright"] }],
    entities: [{ id: "studio", name: "A Long Studio Name ".repeat(8), type: "studio" }],
  };
  const warnings = [];
  const manifest = await generateSocialCards(root, data, { warn: (warning) => warnings.push(warning) });
  assert.ok(warnings.some((warning) => warning.includes("broken.png")));
  assert.equal(Object.keys(manifest).length, 8);
  const bytes = new Map();
  for (const publicPath of Object.keys(manifest)) {
    const file = path.join(root, publicPath.slice(1));
    bytes.set(publicPath, fs.readFileSync(file));
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 630);
    assert.equal(metadata.format, "png");
  }
  const art = await sharp(bright).resize(400, 400, { fit: "cover" }).png().toBuffer();
  assert.equal((renderSvg({ kind: "entity", title: "One" }, [art]).match(/data-cover="true"/g) || []).length, 1);
  assert.equal((renderSvg({ kind: "entity", title: "Two" }, [art, art]).match(/data-cover="true"/g) || []).length, 2);
  const cachedFile = path.join(root, "images/generated/social/shows/bright.png");
  const originalTime = fs.statSync(cachedFile).mtimeMs;
  assert.deepEqual(await generateSocialCards(root, data), manifest);
  assert.equal(fs.statSync(cachedFile).mtimeMs, originalTime, "unchanged cards must not be rewritten");
  fs.writeFileSync(cachedFile, "corrupt");
  assert.deepEqual(await generateSocialCards(root, data), manifest);
  assert.deepEqual(fs.readFileSync(cachedFile), bytes.get("/images/generated/social/shows/bright.png"));
  fs.rmSync(path.join(root, "images/generated/social"), { recursive: true });
  assert.deepEqual(await generateSocialCards(root, data, { warn: () => {} }), manifest);
  for (const [publicPath, expected] of bytes) assert.deepEqual(fs.readFileSync(path.join(root, publicPath.slice(1))), expected, publicPath);
  const reduced = { ...data, shows: data.shows.filter((record) => record.id !== "unicode") };
  await generateSocialCards(root, reduced);
  assert.equal(fs.existsSync(path.join(root, "images/generated/social/shows/unicode.png")), false);
  assert.deepEqual(await renderCard({ kind: "show", title: "Sparse record", descriptor: "" }), await renderCard({ kind: "show", title: "Sparse record", descriptor: "" }));
});

test("generated production cards all exist at 1200×630", async () => {
  const root = path.resolve(__dirname, "../..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "images/generated/social/manifest.json")));
  for (const name of ["default.png", "shows/midnight-burger.png", "collections/shows-like-midnight-burger.png", "creators/fool-and-scholar-productions.png"]) assert.ok(manifest[`/images/generated/social/${name}`], name);
  const shows = JSON.parse(fs.readFileSync(path.join(root, "data/shows.json")));
  for (const show of shows.filter((show) => show.status === "published")) assert.ok(manifest[socialPreview("show", show).path], show.id);
  for (const publicPath of Object.keys(manifest)) {
    const metadata = await sharp(path.join(root, publicPath.slice(1))).metadata();
    assert.equal(metadata.width, 1200, publicPath);
    assert.equal(metadata.height, 630, publicPath);
  }
});
