const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BACKEND_ROOT = path.join(ROOT, "backend");
const DEFAULT_BACKUP_DIR = path.join(BACKEND_ROOT, "data", "backups");
const REQUIRED_TABLES = [
  "catalog_discovery_sources",
  "catalog_import_candidates",
  "community_profiles",
  "podcasts",
];

function parseArgs(argv) {
  const options = {
    directory: DEFAULT_BACKUP_DIR,
    file: "",
    maxAgeHours: 30,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!["--directory", "--file", "--max-age-hours"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }

    if (argument === "--max-age-hours") {
      options.maxAgeHours = Number(value);
    } else {
      options[argument.slice(2)] = path.resolve(value);
    }
    index += 1;
  }

  if (!Number.isFinite(options.maxAgeHours) || options.maxAgeHours <= 0) {
    throw new Error("--max-age-hours must be a positive number.");
  }
  return options;
}

function findLatestBackup(directory) {
  const candidates = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sqlite"))
    .map((entry) => {
      const filePath = path.join(directory, entry.name);
      return { filePath, stat: fs.statSync(filePath) };
    })
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

  if (candidates.length === 0) {
    throw new Error(`No completed SQLite backups found in ${directory}.`);
  }
  return candidates[0];
}

function getDatabaseConstructor() {
  const modulePath = require.resolve("better-sqlite3", { paths: [BACKEND_ROOT] });
  return require(modulePath);
}

function assertIntegrity(database) {
  const messages = database
    .pragma("integrity_check")
    .map((row) => String(row.integrity_check || "").trim())
    .filter(Boolean);
  if (messages.length !== 1 || messages[0].toLowerCase() !== "ok") {
    throw new Error(`SQLite integrity_check failed: ${messages.join("; ") || "no result"}`);
  }

  const violations = database.pragma("foreign_key_check");
  if (violations.length > 0) {
    throw new Error(`SQLite foreign_key_check returned ${violations.length} violation(s).`);
  }
}

function readRequiredCounts(database) {
  const existingTables = new Set(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all(),
  );
  const missing = REQUIRED_TABLES.filter((table) => !existingTables.has(table));
  if (missing.length > 0) {
    throw new Error(`Backup is missing required table(s): ${missing.join(", ")}`);
  }

  return Object.fromEntries(
    REQUIRED_TABLES.map((table) => [
      table,
      database.prepare(`SELECT COUNT(*) FROM "${table}"`).pluck().get(),
    ]),
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const selected = options.file
    ? { filePath: options.file, stat: fs.statSync(options.file) }
    : findLatestBackup(options.directory);

  if (!selected.stat.isFile() || !selected.filePath.endsWith(".sqlite")) {
    throw new Error(`Backup must be a regular .sqlite file: ${selected.filePath}`);
  }
  if ((selected.stat.mode & 0o077) !== 0) {
    throw new Error(`Backup permissions are too broad; expected no group/world access: ${selected.filePath}`);
  }

  const ageHours = (Date.now() - selected.stat.mtimeMs) / 3_600_000;
  if (ageHours < 0 || ageHours > options.maxAgeHours) {
    throw new Error(
      `Newest backup age ${ageHours.toFixed(2)}h is outside the allowed ${options.maxAgeHours}h window.`,
    );
  }

  const Database = getDatabaseConstructor();
  const database = new Database(selected.filePath, { fileMustExist: true, readonly: true });
  let counts;
  try {
    database.pragma("query_only = ON");
    assertIntegrity(database);
    counts = readRequiredCounts(database);
  } finally {
    database.close();
  }

  console.log(
    JSON.stringify({
      ok: true,
      file: path.basename(selected.filePath),
      ageHours: Number(ageHours.toFixed(2)),
      bytes: selected.stat.size,
      integrity: "ok",
      foreignKeyViolations: 0,
      counts,
    }),
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
