const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const opentype = require("opentype.js");
const { socialPreview } = require("../../shared/archive-social");
const { getEntityShows, TYPE_LABELS } = require("../../shared/archive-entities");
const { resolveLocalImagePath } = require("./responsive-images");
const { toPublicLabel } = require("../../shared/archive-record");

const WIDTH = 1200;
const HEIGHT = 630;
const PUBLIC_TOKENS_PATH = path.resolve(__dirname, "../../shared/styles/home/cards/01-surface.css");
const publicTokens = fs.readFileSync(PUBLIC_TOKENS_PATH, "utf8");
function publicColorToken(name) {
  const value = publicTokens.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})\\s*;`, "i"))?.[1];
  if (!value) throw new Error(`Missing public social-card colour token: ${name}`);
  return value;
}
const PALETTE = {
  background: publicColorToken("page-bg"),
  surface: publicColorToken("surface-strong"),
  text: publicColorToken("text-primary"),
  accent: publicColorToken("accent"),
  // Warmer end of the public collection CTA gradient (01-page.css).
  warmHighlight: "#ff6c4d",
};
const FONT_PATH = path.resolve(__dirname, "../../tools/assets/social/Lato-Bold.ttf");
const font = opentype.loadSync(FONT_PATH);
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
// Use the authored vector wordmark from the public header. Embedding it keeps
// generation offline and avoids host font substitutions.
const WORDMARK_BYTES = fs.readFileSync(path.resolve(__dirname, "../../echo-wordmark-nosub1.svg"));
const WORDMARK_URI = `data:image/svg+xml;base64,${WORDMARK_BYTES.toString("base64")}`;
const WORDMARK_SUBTITLE_BYTES = fs.readFileSync(path.resolve(__dirname, "../../echo-wordmark-sub1.svg"));
const WORDMARK_SUBTITLE_URI = `data:image/svg+xml;base64,${WORDMARK_SUBTITLE_BYTES.toString("base64")}`;
// Outlined type avoids host font lookup and platform-dependent line wrapping.
const RENDER_VERSION = digest(Buffer.concat([
  fs.readFileSync(__filename), fs.readFileSync(FONT_PATH), WORDMARK_BYTES, WORDMARK_SUBTITLE_BYTES,
  Buffer.from(JSON.stringify({ libraries: sharp.versions, palette: PALETTE })),
]));

function cleanText(value) {
  return String(value || "").normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function measure(text, size) {
  return font.getAdvanceWidth(text, size);
}

// Break at words when possible, at grapheme boundaries otherwise. Work is bounded
// even for an imported record containing an enormous unbroken title.
function wrapText(value, size, maxWidth, maxLines) {
  const text = cleanText(value);
  const segments = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].slice(0, 600).map(({ segment }) => segment);
  const lines = [];
  let cursor = 0;
  while (cursor < segments.length && lines.length < maxLines) {
    let end = cursor;
    let lastSpace = -1;
    while (end < segments.length && measure(segments.slice(cursor, end + 1).join(""), size) <= maxWidth) {
      if (segments[end] === " ") lastSpace = end;
      end += 1;
    }
    if (end === cursor) end += 1;
    if (end < segments.length && lastSpace > cursor) end = lastSpace;
    let line = segments.slice(cursor, end).join("").trim();
    cursor = end;
    while (segments[cursor] === " ") cursor += 1;
    if (lines.length === maxLines - 1 && (cursor < segments.length || text.length > segments.join("").length)) {
      const chars = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(line)].map(({ segment }) => segment);
      while (chars.length && measure(`${chars.join("")}…`, size) > maxWidth) chars.pop();
      line = `${chars.join("").trimEnd()}…`;
    }
    lines.push(line);
  }
  return lines;
}

function textPath(text, x, baseline, size, color, opacity = 1) {
  const label = cleanText(text);
  const glyphPath = font.getPath(label, x, baseline, size);
  const escapedLabel = label.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<path aria-label="${escapedLabel}" d="${glyphPath.toPathData(2)}" fill="${color}" fill-opacity="${opacity}"/>`;
}

function titleLayout(title, width) {
  for (const size of [82, 76, 70, 64, 56]) {
    const lines = wrapText(title, size, width, 2);
    if (!lines.at(-1)?.endsWith("…")) return { size, lines };
  }
  return { size: 56, lines: wrapText(title, 56, width, 2) };
}

function renderSvg({ kind = "default", title = "The Echo Archives", descriptor = "Audio Drama Discovery" }, covers = []) {
  const generic = kind === "default";
  const textWidth = 650;
  const layout = generic ? { size: 86, lines: ["Audio Drama Discovery"] } : titleLayout(title, textWidth);
  const lineHeight = layout.size * 1.08;
  const blockHeight = layout.lines.length * lineHeight;
  const baseline = generic ? 386 : 345 - blockHeight / 2 + layout.size;
  const kicker = { default: "AUDIO DRAMA DISCOVERY", show: "AUDIO DRAMA DISCOVERY", collection: "CURATED COLLECTION", entity: "CREATORS IN THE ARCHIVE" }[kind];
  const wordmark = generic
    ? `<image aria-label="The Echo Archives wordmark" x="108" y="235" width="984" height="147.6" href="${WORDMARK_SUBTITLE_URI}"/>`
    : `<image aria-label="The Echo Archives wordmark" x="54" y="40" width="548" height="82" href="${WORDMARK_URI}"/>`;
  const copy = generic ? "" : layout.lines.map((line, index) => textPath(line, 56, baseline + index * lineHeight, layout.size, PALETTE.text)).join("");
  const subtitleY = baseline + (layout.lines.length - 1) * lineHeight + 50;
  const subtitle = generic ? "" : wrapText(descriptor, 27, textWidth, 1)[0] || "";
  const coverSet = generic ? [] : covers.slice(0, 3);
  const placements = kind === "show" ? [[770, 110, 392]]
    : coverSet.length > 2 ? [[760, 152, 306], [812, 118, 306], [864, 84, 306]]
      : coverSet.length === 2 ? [[786, 144, 316], [850, 110, 316]]
        : [[820, 128, 328]];
  const clipDefinitions = coverSet.map((_, index) => {
    const [x, y, size] = placements[index];
    return `<clipPath id="coverClip${index}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="7"/></clipPath>`;
  }).join("");
  const artwork = coverSet.map((cover, index) => {
    const [x, y, size] = placements[index];
    return `<rect x="${x + 5}" y="${y + 8}" width="${size}" height="${size}" rx="7" fill="#000000" opacity=".28"/><image data-cover="true" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${cover.toString("base64")}" clip-path="url(#coverClip${index})"/><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="7" fill="none" stroke="${PALETTE.text}" stroke-opacity=".18" stroke-width="1.5"/>`;
  }).reverse().join("");
  const categoryBaseline = generic ? 214 : 184;
  const domainSize = 27;
  const domainX = WIDTH - 54 - measure("echoarchives.net", domainSize);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="canvasTone" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${PALETTE.background}"/>
        <stop offset=".66" stop-color="${PALETTE.background}"/>
        <stop offset="1" stop-color="#120908"/>
      </linearGradient>
      <radialGradient id="warmWash" cx="84%" cy="52%" r="68%">
        <stop offset="0" stop-color="${PALETTE.accent}" stop-opacity=".17"/>
        <stop offset=".56" stop-color="${PALETTE.accent}" stop-opacity=".065"/>
        <stop offset="1" stop-color="${PALETTE.accent}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="vignette" cx="50%" cy="45%" r="76%">
        <stop offset=".48" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity=".4"/>
      </radialGradient>
      ${clipDefinitions}
    </defs>
    <rect width="1200" height="630" fill="url(#canvasTone)"/>
    <rect width="1200" height="630" fill="url(#warmWash)"/>
    <rect width="1200" height="630" fill="url(#vignette)"/>
    <g fill="none" stroke="${PALETTE.warmHighlight}" stroke-width="1.3">
      <circle cx="1006" cy="335" r="224" opacity=".04"/>
      <circle cx="1080" cy="410" r="342" opacity=".02"/>
    </g>
    <g fill="none" stroke="#c45a49" stroke-width="1.25" stroke-linecap="round" opacity=".34">
      <path d="M-64 83 C56 111 92 27 210 37 C334 48 351 121 475 109 C592 98 623 31 750 56 C865 78 914 136 1030 110 C1121 90 1174 48 1263 77"/>
      <path d="M-70 112 C52 138 99 58 215 67 C337 76 358 149 479 137 C600 126 630 61 752 84 C874 107 920 165 1035 139 C1132 117 1183 79 1268 107"/>
      <path d="M-78 55 C56 80 112 8 231 17 C351 27 376 97 493 87 C613 76 652 18 770 42 C890 67 933 119 1050 94 C1151 73 1194 34 1270 58"/>
      <path d="M-83 299 C16 268 76 285 161 309 C253 335 324 337 400 303 C479 267 537 244 631 269 C713 291 770 331 864 314"/>
      <path d="M-78 328 C18 296 82 314 167 338 C259 365 328 365 407 332 C486 298 543 274 636 299 C718 322 776 360 870 344"/>
      <path d="M-92 260 C13 224 85 245 173 272 C269 302 337 306 420 274 C505 241 560 219 650 243 C742 267 791 311 891 291"/>
      <path d="M-74 517 C49 481 94 432 204 451 C314 470 347 546 471 540 C598 534 650 466 778 476 C901 486 931 555 1055 540 C1157 528 1198 486 1276 505"/>
      <path d="M-78 548 C45 511 98 463 208 481 C320 501 355 575 477 569 C604 563 657 496 783 506 C904 516 941 585 1062 570 C1164 557 1203 516 1280 535"/>
      <path d="M-84 590 C39 553 101 501 219 520 C340 540 378 603 501 592 C631 580 676 526 794 535 C843 539 870 554 916 558"/>
    </g>
    ${artwork}
    ${wordmark}
    ${generic ? "" : textPath(kicker || "", 56, categoryBaseline, 22, PALETTE.warmHighlight, .96)}
    ${copy}
    ${subtitle ? textPath(subtitle, 56, subtitleY, 27, "#b9b7bd", .95) : ""}
    ${textPath("echoarchives.net", domainX, 584, domainSize, PALETTE.text, .88)}
  </svg>`;
}

function localCoverPath(root, show) {
  // Authored originals avoid coupling previews to responsive-variant filenames.
  const source = String(show?.cover || show?.imageSrc || "").replace(/^\/+/, "");
  if (!source || source === "images/TEA-Logo-S.png" || /^(?:https?:|data:)/i.test(source) || source.includes("\\")) return null;
  const resolved = resolveLocalImagePath(root, source);
  if (!resolved || !fs.statSync(resolved).isFile()) return null;
  const real = fs.realpathSync(resolved);
  // Both directories are established public artwork sources in Echo.
  const allowed = ["images", "shows"].some((directory) => {
    const base = path.join(root, directory);
    return fs.existsSync(base) && real.startsWith(fs.realpathSync(base) + path.sep);
  });
  if (!allowed) return null;
  return real;
}

function cardSpecs({ shows = [], collections = [], entities = [] }) {
  const published = shows.filter((show) => show.status === "published");
  const showMap = new Map(published.map((show) => [show.id, show]));
  const specs = [{ kind: "default", title: "The Echo Archives", descriptor: "Audio Drama Discovery", covers: [] }];
  published.forEach((show) => specs.push({ kind: "show", record: show, title: show.title, descriptor: (show.genres || []).slice(0, 2).map(toPublicLabel).join(" · "), covers: [show] }));
  collections.forEach((collection) => {
    const members = new Set(collection.showIds || []);
    const ids = [...new Set([collection.anchorShowId, ...(collection.coverShowIds || []), ...(collection.showIds || [])])].filter((id) => members.has(id) || id === collection.anchorShowId);
    specs.push({ kind: "collection", record: collection, title: collection.title, descriptor: "", covers: ids.map((id) => showMap.get(id)).filter(Boolean) });
  });
  entities.forEach((entity) => {
    const connected = getEntityShows(entity.id, published).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    specs.push({ kind: "entity", record: entity, title: entity.name, descriptor: TYPE_LABELS[entity.type] || "", covers: connected });
  });
  return specs;
}

async function renderCard(spec, covers = []) {
  const png = await sharp(Buffer.from(renderSvg(spec, covers)), { limitInputPixels: WIDTH * HEIGHT }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  const metadata = await sharp(png).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) throw new Error("Invalid social card dimensions");
  return png;
}

function writeChanged(file, bytes) {
  if (fs.existsSync(file) && fs.readFileSync(file).equals(Buffer.from(bytes))) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, bytes);
  fs.renameSync(`${file}.tmp`, file);
}

async function generateSocialCards(root, data, { warn = console.warn } = {}) {
  const directory = path.join(root, "images/generated/social");
  const cacheFile = path.join(directory, "manifest.json");
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch (_) { /* A clean build has no cache. */ }
  const next = {};
  const artCache = new Map();
  const sourceHashes = new Map();
  let rendered = 0;
  let reused = 0;
  for (const spec of cardSpecs(data)) {
    const preview = socialPreview(spec.kind, spec.record);
    const output = path.join(root, preview.path.slice(1));
    const sources = [];
    // Read/hash local inputs once; a broken cover is diagnosed once per build.
    for (const show of spec.covers) {
      const file = localCoverPath(root, show);
      if (!file) continue;
      if (!sourceHashes.has(file)) sourceHashes.set(file, digest(fs.readFileSync(file)));
      if (!sources.some((entry) => entry.hash === sourceHashes.get(file))) sources.push({ file, hash: sourceHashes.get(file) });
      if (sources.length === 3) break;
    }
    const input = digest(JSON.stringify({ version: RENDER_VERSION, kind: spec.kind, title: spec.title, descriptor: spec.descriptor, covers: sources.map(({ hash }) => hash) }));
    const cached = previous[preview.path];
    if (cached?.input === input && fs.existsSync(output) && digest(fs.readFileSync(output)) === cached.output) {
      next[preview.path] = cached;
      reused += 1;
      continue;
    }
    const covers = [];
    for (const { file } of sources) {
      let art = artCache.get(file);
      if (art === undefined) {
        try {
          art = await sharp(file, { failOn: "error", limitInputPixels: 40_000_000 }).rotate().resize(640, 640, { fit: "cover", position: "centre" }).flatten({ background: PALETTE.surface }).png().toBuffer();
        } catch (error) {
          warn(`Social card cover fallback: ${path.relative(root, file)} (${error.message})`);
          art = null;
        }
        artCache.set(file, art);
        // Keep raster buffers bounded as the catalogue grows.
        if (artCache.size > 64) artCache.delete(artCache.keys().next().value);
      }
      if (art) covers.push(art);
    }
    const png = await renderCard(spec, covers);
    writeChanged(output, png);
    next[preview.path] = { input, output: digest(png) };
    rendered += 1;
  }
  // This directory is exclusively generated. Remove records no longer public.
  function prune(current) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) prune(file);
      else if (entry.name.endsWith(".png") && !next[`/${path.relative(root, file).split(path.sep).join("/")}`]) fs.rmSync(file);
    }
  }
  prune(directory);
  writeChanged(cacheFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Social cards: ${rendered} rendered, ${reused} reused (${WIDTH}×${HEIGHT}).`);
  return next;
}

module.exports = { WIDTH, HEIGHT, PALETTE, wrapText, measure, titleLayout, renderSvg, renderCard, cardSpecs, generateSocialCards };
