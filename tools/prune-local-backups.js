#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  process.stderr.write(`Local backup retention failed: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {
    apply: false,
    offsiteVerified: false,
    retentionDays: 30,
    minimumKeep: 7,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") result.apply = true;
    else if (arg === "--offsite-verified") result.offsiteVerified = true;
    else if (arg === "--directory") result.directory = argv[++index];
    else if (arg === "--retention-days") result.retentionDays = Number(argv[++index]);
    else if (arg === "--minimum-keep") result.minimumKeep = Number(argv[++index]);
    else fail(`unknown argument: ${arg}`);
  }
  return result;
}

const options = parseArgs(process.argv.slice(2));
if (!options.directory) fail("--directory is required");
if (!Number.isInteger(options.retentionDays) || options.retentionDays < 1) {
  fail("--retention-days must be a positive integer");
}
if (!Number.isInteger(options.minimumKeep) || options.minimumKeep < 1) {
  fail("--minimum-keep must be a positive integer");
}
if (options.apply && !options.offsiteVerified) {
  fail("--apply requires --offsite-verified from the completed encrypted backup workflow");
}

const directory = path.resolve(options.directory);
const stat = fs.lstatSync(directory);
if (!stat.isDirectory() || stat.isSymbolicLink()) {
  fail("backup directory must be a real directory, not a symlink");
}

const backups = fs
  .readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^community-\d{4}-\d{2}-\d{2}T[\d-]+Z\.sqlite$/.test(entry.name))
  .map((entry) => {
    const filePath = path.join(directory, entry.name);
    const fileStat = fs.lstatSync(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      fail(`refusing unexpected backup entry: ${entry.name}`);
    }
    return { filePath, name: entry.name, mtimeMs: fileStat.mtimeMs };
  })
  .sort((left, right) => right.mtimeMs - left.mtimeMs);

const cutoffMs = Date.now() - options.retentionDays * 24 * 60 * 60 * 1000;
const removable = backups.filter(
  (backup, index) => index >= options.minimumKeep && backup.mtimeMs < cutoffMs,
);

for (const backup of removable) {
  if (options.apply) fs.unlinkSync(backup.filePath);
}

process.stdout.write(
  `${options.apply ? "Removed" : "Would remove"} ${removable.length} local backup(s); ` +
  `retention=${options.retentionDays}d minimumKeep=${options.minimumKeep} current=${backups.length}.\n`,
);
