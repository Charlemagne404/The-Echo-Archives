const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { imageSize } = require("image-size");

const { fetchBufferWithLimits, throwForUpstreamStatus } = require("./fetch");
const { mergeUniqueStrings, normalizeUrl, trimText } = require("./utils");

const MIME_TO_EXTENSION = new Map([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/avif", ".avif"],
]);
const TYPE_TO_MIME = new Map([
  ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"],
  ["webp", "image/webp"], ["gif", "image/gif"], ["avif", "image/avif"],
]);

function inspectCoverBuffer(buffer, declaredContentType = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Cover download returned an empty body.");
  }
  if (buffer.subarray(0, 256).toString("utf8").match(/<svg\b/i)) {
    throw new Error("SVG covers are unsupported; a raster image is required.");
  }
  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch (_error) {
    throw new Error("Cover bytes are corrupt or use an unsupported image format.");
  }
  const sniffedContentType = TYPE_TO_MIME.get(String(dimensions.type || "").toLowerCase()) || "";
  const declared = String(declaredContentType || "").split(";", 1)[0].trim().toLowerCase();
  if (!sniffedContentType || !MIME_TO_EXTENSION.has(sniffedContentType)) {
    throw new Error(`Cover format ${dimensions.type || declared || "unknown"} is unsupported.`);
  }
  if (declared && declared !== "application/octet-stream" && declared !== sniffedContentType && !(declared === "image/jpg" && sniffedContentType === "image/jpeg")) {
    throw new Error(`Cover content type ${declared} does not match its ${sniffedContentType} bytes.`);
  }
  const width = Number(dimensions.width) || 0;
  const height = Number(dimensions.height) || 0;
  const square = width === height;
  const echoPublishable = square && width >= 600;
  const appleQuality = square && width >= 1400 && width <= 3000 && ["image/jpeg", "image/png"].includes(sniffedContentType);
  return {
    contentType: sniffedContentType,
    extension: MIME_TO_EXTENSION.get(sniffedContentType),
    byteSize: buffer.length,
    width,
    height,
    square,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    echoPublishable,
    appleQuality,
    qualityWarnings: [
      ...(!square ? ["Cover must be square."] : []),
      ...(Math.min(width, height) < 600 ? ["Cover must be at least 600 x 600 pixels for Echo publication."] : []),
      ...(!appleQuality ? ["Cover does not meet Apple's 1400-3000px JPG/PNG quality target."] : []),
    ],
  };
}

async function stageCover({
  candidateId,
  coverSources = [],
  stagingRoot,
  fetchImpl = globalThis.fetch,
  userAgent,
  timeoutMs = 15_000,
  maxBytes = 8 * 1024 * 1024,
}) {
  const failures = [];
  const sources = mergeUniqueStrings(coverSources.map((source) => source?.url || source).filter(Boolean));
  for (const url of sources) {
    try {
      const { response, buffer, resolvedUrl } = await fetchBufferWithLimits(fetchImpl, url, {
        headers: { Accept: "image/jpeg,image/png,image/webp,image/gif,image/avif", "User-Agent": userAgent },
      }, {
        timeoutMs, maxBytes, label: "Cover request",
        allowedContentTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/avif", "application/octet-stream"],
      });
      throwForUpstreamStatus(response, "Cover request");
      const inspection = inspectCoverBuffer(buffer, response.headers.get("content-type") || "");
      if (!inspection.echoPublishable) {
        throw new Error(inspection.qualityWarnings.filter((warning) => !warning.startsWith("Cover does not meet Apple's")).join(" "));
      }
      const directory = path.join(stagingRoot, "covers", candidateId);
      fs.mkdirSync(directory, { recursive: true });
      for (const fileName of fs.readdirSync(directory)) fs.rmSync(path.join(directory, fileName), { force: true });
      const filePath = path.join(directory, `${inspection.sha256}${inspection.extension}`);
      fs.writeFileSync(filePath, buffer);
      return {
        ready: true,
        sourceUrl: normalizeUrl(resolvedUrl || url),
        stagedPath: filePath,
        ...inspection,
        checkedAt: new Date().toISOString(),
        failures,
      };
    } catch (error) {
      failures.push({ url: trimText(url, 1_000), error: trimText(error.message || error, 1_000) });
    }
  }
  return { ready: false, failures, checkedAt: new Date().toISOString() };
}

function promoteStagedCover(stage, staticRoot, showId) {
  if (!stage?.ready || !stage.stagedPath || !fs.existsSync(stage.stagedPath)) {
    throw new Error("The staged cover is missing.");
  }
  const relativePath = path.posix.join("images/covers", `${showId}${stage.extension}`);
  const targetPath = path.join(staticRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.import-${process.pid}-${Date.now()}`;
  fs.copyFileSync(stage.stagedPath, tempPath);
  fs.renameSync(tempPath, targetPath);
  return { relativePath, targetPath };
}

module.exports = { inspectCoverBuffer, promoteStagedCover, stageCover };
