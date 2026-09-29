const fs = require("node:fs");
const path = require("node:path");

function createStaticRootAlias(parentDirectory, sourceRoot) {
  const alias = path.join(parentDirectory, "static-root");
  fs.symlinkSync(path.resolve(sourceRoot), alias, "dir");
  return alias;
}

module.exports = { createStaticRootAlias };
