const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BRANDING_ASSET_FILES = [
  "Circle-S-Logo.png",
  "Circle2-Logo-S.png",
  "Horizontal-Logo-W.png",
  "Horizontal-logo.png",
  "Vertical-Logo-W.png",
  "Vertical-Logo.png",
  "chat-icon.svg",
  "submit-icons.svg",
];

const BRANDING_FILENAMES = new Set(BRANDING_ASSET_FILES.map((fileName) => fileName.toLowerCase()));
const BRANDING_HASHES = new Set(BRANDING_ASSET_FILES.flatMap((fileName) => {
  const assetPath = path.resolve(__dirname, "../../images", fileName);
  if (!fs.existsSync(assetPath)) return [];
  return [createHash("sha256").update(fs.readFileSync(assetPath)).digest("hex")];
}));

function isEchoBrandingArtworkUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw, "https://echoarchives.net");
    const host = url.hostname.toLowerCase();
    if (!new Set(["echoarchives.net", "www.echoarchives.net"]).has(host)) return false;
    const fileName = decodeURIComponent(path.posix.basename(url.pathname)).toLowerCase();
    return url.pathname.toLowerCase().startsWith("/images/") && BRANDING_FILENAMES.has(fileName);
  } catch (_error) {
    return false;
  }
}

function isEchoBrandingArtworkBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  const hash = createHash("sha256").update(buffer).digest("hex");
  return BRANDING_HASHES.has(hash);
}

module.exports = { isEchoBrandingArtworkBuffer, isEchoBrandingArtworkUrl };
