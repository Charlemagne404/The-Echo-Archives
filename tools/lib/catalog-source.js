const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const CATALOG_SOURCE_ROOT = "catalog-src";
const SHOWS_SOURCE_DIR = path.join(CATALOG_SOURCE_ROOT, "shows");
const COLLECTIONS_SOURCE_DIR = path.join(CATALOG_SOURCE_ROOT, "collections");
const REVIEWS_SOURCE_DIR = path.join(CATALOG_SOURCE_ROOT, "reviews");
const ORDER_FILE_NAME = "_order.json";
const RUNTIME_DATA_DIR = "data";
const RUNTIME_REVIEWS_DIR = path.join(RUNTIME_DATA_DIR, "reviews");
const SEARCH_INDEX_PATH = path.join(RUNTIME_DATA_DIR, "search-index.json");
const GENERATED_STATUS_PATH = path.join("docs", "generated", "catalog-status.md");

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonFileAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.import-${process.pid}-${randomUUID()}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function assertRecordBatchIds(records, recordLabel) {
  if (records.length === 0) {
    throw new Error(`At least one ${recordLabel} record is required.`);
  }

  const seenIds = new Set();
  records.forEach((record, index) => {
    const id = record && typeof record === "object" && !Array.isArray(record) ? record.id : null;
    if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`Every ${recordLabel} record needs a valid slug id (record ${index}).`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate ${recordLabel} id "${id}".`);
    }
    seenIds.add(id);
  });
}

function writeShowRecordsAtomically(siteRoot, records = []) {
  const nextRecords = Array.isArray(records) ? records : [];
  assertRecordBatchIds(nextRecords, "show");
  const backups = new Map();
  const changedPaths = [];
  const remember = (filePath) => {
    if (!backups.has(filePath)) backups.set(filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null);
  };
  const rollback = () => {
    [...backups.entries()].reverse().forEach(([filePath, content]) => {
      if (content === null) fs.rmSync(filePath, { force: true });
      else {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
      }
    });
  };

  try {
    if (hasSplitCatalogSource(siteRoot)) {
      const directoryPath = path.join(siteRoot, SHOWS_SOURCE_DIR);
      const orderPath = getOrderFilePath(directoryPath);
      const order = readOrderFile(directoryPath);
      const nextOrder = [...order];
      const orderedIds = new Set(order);
      nextRecords.forEach((record) => {
        const filePath = path.join(directoryPath, `${record.id}.json`);
        const fileExists = fs.existsSync(filePath);
        const isOrdered = orderedIds.has(record.id);
        if (fileExists !== isOrdered) {
          throw new Error(`Show "${record.id}" source file and ${ORDER_FILE_NAME} disagree.`);
        }
        if (fileExists) {
          const existing = readJsonFile(filePath);
          if (!existing || typeof existing !== "object" || Array.isArray(existing) || existing.id !== record.id) {
            throw new Error(`Show "${record.id}" source file is malformed or has a different internal id.`);
          }
        }
      });
      nextRecords.forEach((record) => {
        const filePath = path.join(directoryPath, `${record.id}.json`);
        remember(filePath);
        writeJsonFileAtomic(filePath, record);
        changedPaths.push(filePath);
        if (!nextOrder.includes(record.id)) nextOrder.push(record.id);
      });
      if (nextOrder.length !== order.length) {
        remember(orderPath);
        writeJsonFileAtomic(orderPath, nextOrder);
        changedPaths.push(orderPath);
      }
    } else {
      const showsPath = path.join(siteRoot, RUNTIME_DATA_DIR, "shows.json");
      const source = readCatalogSource(siteRoot);
      const replacements = new Map(nextRecords.map((record) => [record.id, record]));
      const shows = source.shows.map((show) => replacements.get(show.id) || show);
      nextRecords.forEach((record) => {
        if (!source.shows.some((show) => show.id === record.id)) shows.push(record);
      });
      remember(showsPath);
      writeJsonFileAtomic(showsPath, shows);
      changedPaths.push(showsPath);
    }
  } catch (error) {
    rollback();
    throw error;
  }
  return { changedPaths, rollback };
}

function writeCollectionRecordsAtomically(siteRoot, records = []) {
  const nextRecords = Array.isArray(records) ? records : [];
  assertRecordBatchIds(nextRecords, "collection");

  const sourceData = readCatalogSource(siteRoot);
  const replacements = new Map(nextRecords.map((record) => [record.id, record]));

  if (sourceData.mode !== "split") {
    const collections = sourceData.collections.map((record) => replacements.get(record.id) || record);
    replacements.forEach((record, id) => {
      if (!sourceData.collections.some((existing) => existing.id === id)) collections.push(record);
    });
    const targetPath = path.join(siteRoot, RUNTIME_DATA_DIR, "collections.json");
    const previous = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null;
    writeJsonFileAtomic(targetPath, collections);
    return {
      changedPaths: [targetPath],
      rollback: () => {
        if (previous === null) fs.rmSync(targetPath, { force: true });
        else fs.writeFileSync(targetPath, previous);
      },
    };
  }

  const directoryPath = path.join(siteRoot, COLLECTIONS_SOURCE_DIR);
  const orderPath = getOrderFilePath(directoryPath);
  const currentOrder = readOrderFile(directoryPath);
  const nextOrder = [...currentOrder];
  const backups = new Map();
  const changedPaths = [];
  const remember = (filePath) => {
    if (!backups.has(filePath)) backups.set(filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null);
  };
  const rollback = () => {
    [...backups.entries()].reverse().forEach(([filePath, content]) => {
      if (content === null) fs.rmSync(filePath, { force: true });
      else {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
      }
    });
  };

  try {
    replacements.forEach((record, id) => {
      const filePath = path.join(directoryPath, `${id}.json`);
      remember(filePath);
      writeJsonFileAtomic(filePath, record);
      changedPaths.push(filePath);
      if (!nextOrder.includes(id)) nextOrder.push(id);
    });
    if (nextOrder.length !== currentOrder.length) {
      remember(orderPath);
      writeJsonFileAtomic(orderPath, nextOrder);
      changedPaths.push(orderPath);
    }
  } catch (error) {
    rollback();
    throw error;
  }

  return { changedPaths, rollback };
}

function hasSplitCatalogSource(siteRoot) {
  return fs.existsSync(path.join(siteRoot, CATALOG_SOURCE_ROOT));
}

function getOrderFilePath(directoryPath) {
  return path.join(directoryPath, ORDER_FILE_NAME);
}

function readOrderFile(directoryPath) {
  const orderFilePath = getOrderFilePath(directoryPath);
  if (!fs.existsSync(orderFilePath)) {
    throw new Error(`The ${path.basename(directoryPath)} ${ORDER_FILE_NAME} is missing.`);
  }

  const parsed = readJsonFile(orderFilePath);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.relative(directoryPath, orderFilePath)} must contain an array of ids.`);
  }

  const seenIds = new Set();
  return parsed.map((value, index) => {
    if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      throw new Error(`${path.basename(directoryPath)}/${ORDER_FILE_NAME}[${index}] must be a slug id.`);
    }
    if (seenIds.has(value)) {
      throw new Error(`${path.basename(directoryPath)}/${ORDER_FILE_NAME} contains duplicate id "${value}".`);
    }
    seenIds.add(value);
    return value;
  });
}

function listRecordIds(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  return fs.readdirSync(directoryPath)
    .filter((fileName) => fileName.endsWith(".json") && fileName !== ORDER_FILE_NAME)
    .map((fileName) => fileName.replace(/\.json$/i, ""))
    .sort();
}

function readSplitRecordDirectory(directoryPath, recordLabel) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error(`${recordLabel} source directory ${directoryPath} is missing or not a directory.`);
  }

  const recordIds = listRecordIds(directoryPath);
  const discoveredIds = new Set(recordIds);
  const orderedIds = [];
  const seenIds = new Set();

  readOrderFile(directoryPath).forEach((id) => {
    if (!discoveredIds.has(id)) {
      throw new Error(`${recordLabel} order file references missing record "${id}".`);
    }
    if (seenIds.has(id)) {
      throw new Error(`${recordLabel} order file contains duplicate id "${id}".`);
    }

    seenIds.add(id);
    orderedIds.push(id);
  });

  const unlistedIds = recordIds.filter((id) => !seenIds.has(id));
  if (unlistedIds.length > 0) {
    throw new Error(`${recordLabel} ${ORDER_FILE_NAME} is missing source record${unlistedIds.length === 1 ? "" : "s"}: ${unlistedIds.join(", ")}.`);
  }

  return orderedIds.map((id) => {
    const record = readJsonFile(path.join(directoryPath, `${id}.json`));
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`${recordLabel} source record "${id}" must contain an object.`);
    }
    if (record.id !== id) {
      throw new Error(`${recordLabel} source file "${id}.json" has internal id "${record.id}".`);
    }
    return record;
  });
}

function readSplitReviews(siteRoot) {
  const directoryPath = path.join(siteRoot, REVIEWS_SOURCE_DIR);
  const reviewsById = {};

  listRecordIds(directoryPath).forEach((id) => {
    reviewsById[id] = readJsonFile(path.join(directoryPath, `${id}.json`));
  });

  return reviewsById;
}

function readRuntimeReviews(siteRoot) {
  const directoryPath = path.join(siteRoot, RUNTIME_REVIEWS_DIR);
  const reviewsById = {};

  if (!fs.existsSync(directoryPath)) {
    return reviewsById;
  }

  fs.readdirSync(directoryPath)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort()
    .forEach((fileName) => {
      const id = fileName.replace(/\.json$/i, "");
      reviewsById[id] = readJsonFile(path.join(directoryPath, fileName));
    });

  return reviewsById;
}

function readCatalogSource(siteRoot) {
  if (hasSplitCatalogSource(siteRoot)) {
    return {
      mode: "split",
      shows: readSplitRecordDirectory(path.join(siteRoot, SHOWS_SOURCE_DIR), "show"),
      collections: readSplitRecordDirectory(path.join(siteRoot, COLLECTIONS_SOURCE_DIR), "collection"),
      reviewsById: readSplitReviews(siteRoot),
    };
  }

  const runtimeShowsPath = path.join(siteRoot, RUNTIME_DATA_DIR, "shows.json");
  const runtimeCollectionsPath = path.join(siteRoot, RUNTIME_DATA_DIR, "collections.json");
  const shows = fs.existsSync(runtimeShowsPath) ? readJsonFile(runtimeShowsPath) : [];
  const collections = fs.existsSync(runtimeCollectionsPath) ? readJsonFile(runtimeCollectionsPath) : [];

  if (!Array.isArray(shows)) {
    throw new Error("data/shows.json must contain an array.");
  }

  if (!Array.isArray(collections)) {
    throw new Error("data/collections.json must contain an array.");
  }

  return {
    mode: "runtime",
    shows,
    collections,
    reviewsById: readRuntimeReviews(siteRoot),
  };
}

function syncRecordDirectory(directoryPath, records, { preserveOrder = true } = {}) {
  fs.mkdirSync(directoryPath, { recursive: true });

  const ids = records.map((record) => String(record?.id || "").trim()).filter(Boolean);
  const nextIds = preserveOrder ? ids : [...ids].sort();
  const keepFileNames = new Set(nextIds.map((id) => `${id}.json`));

  fs.readdirSync(directoryPath).forEach((fileName) => {
    if (!fileName.endsWith(".json") || fileName === ORDER_FILE_NAME || keepFileNames.has(fileName)) {
      return;
    }

    fs.rmSync(path.join(directoryPath, fileName), { force: true });
  });

  records.forEach((record) => {
    writeJsonFile(path.join(directoryPath, `${record.id}.json`), record);
  });
  writeJsonFile(getOrderFilePath(directoryPath), nextIds);
}

function syncReviewsDirectory(directoryPath, reviewsById) {
  fs.mkdirSync(directoryPath, { recursive: true });

  const nextIds = Object.keys(reviewsById).sort();
  const keepFileNames = new Set(nextIds.map((id) => `${id}.json`));

  fs.readdirSync(directoryPath).forEach((fileName) => {
    if (!fileName.endsWith(".json") || keepFileNames.has(fileName)) {
      return;
    }

    fs.rmSync(path.join(directoryPath, fileName), { force: true });
  });

  nextIds.forEach((id) => {
    writeJsonFile(path.join(directoryPath, `${id}.json`), reviewsById[id]);
  });
}

function writeCatalogSource(siteRoot, sourceData, { mode = sourceData.mode || "split" } = {}) {
  if (mode === "split") {
    syncRecordDirectory(path.join(siteRoot, SHOWS_SOURCE_DIR), sourceData.shows);
    syncRecordDirectory(path.join(siteRoot, COLLECTIONS_SOURCE_DIR), sourceData.collections);
    syncReviewsDirectory(path.join(siteRoot, REVIEWS_SOURCE_DIR), sourceData.reviewsById || {});
    return;
  }

  writeJsonFile(path.join(siteRoot, RUNTIME_DATA_DIR, "shows.json"), sourceData.shows);
  writeJsonFile(path.join(siteRoot, RUNTIME_DATA_DIR, "collections.json"), sourceData.collections);
  syncReviewsDirectory(path.join(siteRoot, RUNTIME_REVIEWS_DIR), sourceData.reviewsById || {});
}

function ensureSplitCatalogSource(siteRoot) {
  if (hasSplitCatalogSource(siteRoot)) {
    return false;
  }

  const sourceData = readCatalogSource(siteRoot);
  writeCatalogSource(siteRoot, sourceData, { mode: "split" });
  return true;
}

function getReviewSourcePath(siteRoot, showId) {
  if (hasSplitCatalogSource(siteRoot)) {
    return path.join(siteRoot, REVIEWS_SOURCE_DIR, `${showId}.json`);
  }

  return path.join(siteRoot, RUNTIME_REVIEWS_DIR, `${showId}.json`);
}

function readGeneratedFileText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

module.exports = {
  CATALOG_SOURCE_ROOT,
  COLLECTIONS_SOURCE_DIR,
  GENERATED_STATUS_PATH,
  REVIEWS_SOURCE_DIR,
  RUNTIME_DATA_DIR,
  RUNTIME_REVIEWS_DIR,
  SEARCH_INDEX_PATH,
  SHOWS_SOURCE_DIR,
  ensureSplitCatalogSource,
  getReviewSourcePath,
  hasSplitCatalogSource,
  readCatalogSource,
  readGeneratedFileText,
  readJsonFile,
  writeCatalogSource,
  writeCollectionRecordsAtomically,
  writeJsonFile,
  writeJsonFileAtomic,
  writeShowRecordsAtomically,
};
