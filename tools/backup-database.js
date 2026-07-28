const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BACKEND_ROOT = path.join(ROOT, "backend");
const ENV_PATH = path.join(BACKEND_ROOT, ".env");
const DEFAULT_DATABASE_PATH = path.join(BACKEND_ROOT, "data", "community.sqlite");
const DEFAULT_BACKUP_DIR = path.join(BACKEND_ROOT, "data", "backups");

function loadBackendEnvironment() {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  if (typeof process.loadEnvFile !== "function") {
    throw new Error("Loading backend/.env requires Node 22.12 or newer.");
  }

  process.loadEnvFile(ENV_PATH);
}

function resolveBackendPath(value, fallback) {
  const candidate = String(value || fallback).trim();
  return path.isAbsolute(candidate) ? path.normalize(candidate) : path.resolve(BACKEND_ROOT, candidate);
}

function parseArgs(argv) {
  const options = {
    source: "",
    destination: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--source" && argument !== "--destination") {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a path.`);
    }

    options[argument.slice(2)] = value;
    index += 1;
  }

  return options;
}

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function getDatabaseConstructor() {
  const modulePath = require.resolve("better-sqlite3", { paths: [BACKEND_ROOT] });
  return require(modulePath);
}

function assertIntegrity(database, label) {
  const rows = database.pragma("integrity_check");
  const messages = rows.map((row) => String(row.integrity_check || "").trim()).filter(Boolean);
  if (messages.length !== 1 || messages[0].toLowerCase() !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check: ${messages.join("; ") || "no result"}`);
  }
}

async function main() {
  loadBackendEnvironment();
  const args = parseArgs(process.argv.slice(2));
  const sourcePath = resolveBackendPath(args.source || process.env.DB_PATH, DEFAULT_DATABASE_PATH);
  const backupDir = resolveBackendPath(process.env.BACKUP_DIR, DEFAULT_BACKUP_DIR);
  const sourceName = path.basename(sourcePath, path.extname(sourcePath));
  const destinationPath = args.destination
    ? resolveBackendPath(args.destination, "")
    : path.join(backupDir, `${sourceName}-${createTimestamp()}.sqlite`);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Database does not exist: ${sourcePath}`);
  }

  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    throw new Error("Backup destination must differ from the source database.");
  }

  if (fs.existsSync(destinationPath)) {
    throw new Error(`Refusing to overwrite an existing backup: ${destinationPath}`);
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true, mode: 0o700 });

  const Database = getDatabaseConstructor();
  let sourceDatabase;
  let backupDatabase;

  try {
    sourceDatabase = new Database(sourcePath, { fileMustExist: true, readonly: true });
    sourceDatabase.pragma("busy_timeout = 5000");
    assertIntegrity(sourceDatabase, "Source database");
    await sourceDatabase.backup(destinationPath);
    sourceDatabase.close();
    sourceDatabase = null;

    fs.chmodSync(destinationPath, 0o600);
    backupDatabase = new Database(destinationPath, { fileMustExist: true, readonly: true });
    assertIntegrity(backupDatabase, "Backup database");
    backupDatabase.close();
    backupDatabase = null;
  } catch (error) {
    sourceDatabase?.close();
    backupDatabase?.close();
    if (fs.existsSync(destinationPath)) {
      fs.rmSync(destinationPath, { force: true });
    }
    throw error;
  }

  const size = fs.statSync(destinationPath).size;
  console.log(`Database backup verified (${size} bytes): ${destinationPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
