const fs = require("node:fs");
const path = require("node:path");

const config = require("../lib/config");
const { openDatabase } = require("../lib/store/database");
const { createImportStore } = require("../lib/store/import-store");
const { createImportService } = require("../lib/services/import-service");

function resolveSiteRoot() {
  return path.resolve(process.cwd(), process.env.STATIC_ROOT || "..");
}

function createImportContext() {
  const db = openDatabase(config.DB_PATH);
  const store = createImportStore({ db });
  const service = createImportService({
    store,
    staticRoot: resolveSiteRoot(),
    config,
  });

  return {
    db,
    store,
    service,
    close() {
      db.close();
    },
  };
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.resume();
  });
}

async function readSeedInput(args = []) {
  const [firstArg, ...rest] = args;
  if (firstArg && fs.existsSync(firstArg) && fs.statSync(firstArg).isFile()) {
    return fs.readFileSync(firstArg, "utf8");
  }

  if (args.length > 0) {
    return [firstArg, ...rest].join("\n");
  }

  if (process.stdin.isTTY) {
    return "";
  }

  return readStdin();
}

function parseSeedEntries(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

module.exports = {
  createImportContext,
  parseSeedEntries,
  readSeedInput,
};
