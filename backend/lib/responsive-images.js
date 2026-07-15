const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const COVER_OUTPUT_DIRECTORY = path.posix.join("images", "generated", "covers");
const STATIC_OUTPUT_DIRECTORY = path.posix.join("images", "generated", "info");
const COVER_TARGETS = [
  { width: 320, maxBytes: 100 * 1024 },
  { width: 640, maxBytes: 220 * 1024 },
];
const STATIC_IMAGE_TARGETS = [
  {
    source: "images/about-discovery-panel-v2.png",
    outputStem: "about-discovery-panel",
    widths: [480, 960],
  },
  {
    source: "images/about-continental-orbit.png",
    outputStem: "about-continental-orbit",
    widths: [480, 960],
  },
];
const STATIC_IMAGE_MAX_BYTES = 350 * 1024;
const WEBP_QUALITIES = [80, 74, 68, 62];
const AVIF_QUALITIES = [58, 52, 46, 40];

function toPublicPath(relativePath) {
  return `/${String(relativePath || "").replaceAll(path.sep, "/").replace(/^\/+/, "")}`;
}

function resolveLocalImagePath(siteRoot, cover = "") {
  const normalized = String(cover || "").trim();
  if (!normalized || /^(?:https?:)?\/\//i.test(normalized) || /^data:image\//i.test(normalized)) {
    return null;
  }

  const absolutePath = path.resolve(siteRoot, normalized.replace(/^\/+/, ""));
  const relativePath = path.relative(siteRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || !fs.existsSync(absolutePath)) {
    return null;
  }

  return absolutePath;
}

function listGeneratedFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name));
}

function removeUnexpectedFiles(directory, expectedPaths) {
  const expected = new Set(expectedPaths.map((filePath) => path.resolve(filePath)));
  listGeneratedFiles(directory).forEach((filePath) => {
    if (!expected.has(path.resolve(filePath))) {
      fs.rmSync(filePath, { force: true });
    }
  });
}

function applyGeneratedCoverVariants(siteRoot, catalog) {
  let runtimeShows = [];
  try {
    runtimeShows = JSON.parse(fs.readFileSync(path.join(siteRoot, "data", "shows.json"), "utf8"));
  } catch (_error) {
    return catalog;
  }

  const variantsById = new Map(
    runtimeShows
      .filter((show) => show?.id && Array.isArray(show.coverVariants))
      .map((show) => [show.id, show.coverVariants]),
  );
  (Array.isArray(catalog) ? catalog : []).forEach((show) => {
    const variants = variantsById.get(show?.id);
    if (variants?.length) {
      show.coverVariants = variants;
    }
  });
  return catalog;
}

function reuseExistingOutput(outputPath, maxBytes) {
  if (!fs.existsSync(outputPath)) {
    return null;
  }

  const stats = fs.statSync(outputPath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > maxBytes) {
    return null;
  }

  return stats.size;
}

async function writeWithinBudget(createPipeline, outputPath, qualities, maxBytes) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const existingSize = reuseExistingOutput(outputPath, maxBytes);
  if (existingSize !== null) {
    return existingSize;
  }

  for (const quality of qualities) {
    const buffer = await createPipeline(quality).toBuffer();
    if (buffer.byteLength <= maxBytes) {
      fs.writeFileSync(outputPath, buffer);
      return buffer.byteLength;
    }
  }

  throw new Error(
    `Responsive image ${path.basename(outputPath)} exceeds its ${Math.round(maxBytes / 1024)} KiB budget at the minimum quality.`,
  );
}

async function generateCoverVariants(siteRoot, catalog, { sharpModule = null } = {}) {
  const sharp = sharpModule || require("sharp");
  const outputDirectory = path.join(siteRoot, COVER_OUTPUT_DIRECTORY);
  const expectedPaths = [];

  for (const show of Array.isArray(catalog) ? catalog : []) {
    delete show.coverVariants;
    const sourcePath = resolveLocalImagePath(siteRoot, show.cover);
    if (!sourcePath) {
      continue;
    }

    let metadata;
    try {
      metadata = await sharp(sourcePath, { failOn: "error" }).metadata();
    } catch (_error) {
      continue;
    }

    const sourceWidth = Number(metadata.width) || 0;
    const sourceHeight = Number(metadata.height) || 0;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      continue;
    }

    const sourceHash = crypto.createHash("sha1").update(fs.readFileSync(sourcePath)).digest("hex").slice(0, 10);

    const variants = [];
    for (const target of COVER_TARGETS) {
      if (sourceWidth < target.width || sourceHeight < target.width) {
        continue;
      }

      const relativePath = path.posix.join(COVER_OUTPUT_DIRECTORY, `${show.id}-${sourceHash}-${target.width}.webp`);
      const outputPath = path.join(siteRoot, relativePath);
      await writeWithinBudget(
        (quality) => sharp(sourcePath, { failOn: "error" })
          .rotate()
          .resize(target.width, target.width, { fit: "cover", position: "centre", withoutEnlargement: true })
          .webp({ quality, effort: 5, smartSubsample: true }),
        outputPath,
        WEBP_QUALITIES,
        target.maxBytes,
      );
      expectedPaths.push(outputPath);
      variants.push({ src: toPublicPath(relativePath), width: target.width });
    }

    if (variants.length > 0) {
      show.coverVariants = variants;
    }
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  removeUnexpectedFiles(outputDirectory, expectedPaths);
  return { generated: expectedPaths.length, directory: outputDirectory };
}

async function generateStaticImageVariants(siteRoot, { sharpModule = null } = {}) {
  const sharp = sharpModule || require("sharp");
  const outputDirectory = path.join(siteRoot, STATIC_OUTPUT_DIRECTORY);
  const expectedPaths = [];
  const manifest = {};

  for (const target of STATIC_IMAGE_TARGETS) {
    const sourcePath = resolveLocalImagePath(siteRoot, target.source);
    if (!sourcePath) {
      continue;
    }

    const variants = [];
    for (const width of target.widths) {
      for (const format of ["avif", "webp"]) {
        const relativePath = path.posix.join(STATIC_OUTPUT_DIRECTORY, `${target.outputStem}-${width}.${format}`);
        const outputPath = path.join(siteRoot, relativePath);
        const qualities = format === "avif" ? AVIF_QUALITIES : WEBP_QUALITIES;
        await writeWithinBudget(
          (quality) => {
            const pipeline = sharp(sourcePath, { failOn: "error" })
              .rotate()
              .resize({ width, withoutEnlargement: true });
            return format === "avif"
              ? pipeline.avif({ quality, effort: 5 })
              : pipeline.webp({ quality, effort: 5, smartSubsample: true });
          },
          outputPath,
          qualities,
          STATIC_IMAGE_MAX_BYTES,
        );
        expectedPaths.push(outputPath);
        variants.push({ format, src: toPublicPath(relativePath), width });
      }
    }
    manifest[target.source] = variants;
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  removeUnexpectedFiles(outputDirectory, expectedPaths);
  return { generated: expectedPaths.length, directory: outputDirectory, manifest };
}

module.exports = {
  COVER_OUTPUT_DIRECTORY,
  COVER_TARGETS,
  STATIC_IMAGE_MAX_BYTES,
  STATIC_IMAGE_TARGETS,
  applyGeneratedCoverVariants,
  generateCoverVariants,
  generateStaticImageVariants,
  resolveLocalImagePath,
};
