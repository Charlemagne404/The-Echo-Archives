const fs = require("node:fs");
const path = require("node:path");

function createVisibleStaticRoot(tempRoot, sourceRoot) {
  const staticRoot = path.join(tempRoot, "public-root");
  fs.symlinkSync(sourceRoot, staticRoot, "dir");
  return staticRoot;
}

module.exports = { createVisibleStaticRoot };
