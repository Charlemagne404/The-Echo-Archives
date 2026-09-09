const fs = require("node:fs");
const path = require("node:path");

const { readCatalogSource } = require("../../tools/lib/catalog-source");
const {
  COMPLETION_STATUSES,
  RELEASE_STATUSES,
  REVIEW_STATUSES,
  SHOW_STATUSES,
} = require("../../tools/lib/catalog-schema");
const { ROLES, TYPES, normalizeEntityName } = require("../../shared/archive-entities");

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLLECTION_KINDS = new Set(["curated", "editorial", "similarity", "rule-based", "semantic"]);
const URL_KEY = /(?:url|website|rss|apple|spotify|patreon|discord|youtube|facebook|instagram|twitter|bluesky|tiktok|threads|tumblr|merch)$/i;
const URL_ARRAY_KEYS = new Set(["objectiveSources", "socialUrls", "feedRedirects", "sourceUrls"]);
const STRING_ARRAY_FIELDS = [
  "genres",
  "tags",
  "tones",
  "formats",
  "aliases",
  "themes",
  "contentNotes",
  "languages",
  "transcriptLanguages",
  "cast",
  "creators",
  "bestFor",
  "similarTo",
];
const SHOW_OBJECT_FIELDS = [
  "listenLinks",
  "officialLinks",
  "releaseDates",
  "length",
  "ratings",
  "facts",
  "quote",
  "officialDescription",
  "credits",
  "verification",
  "availability",
  "content",
  "metadata",
  "popularity",
  "provenance",
  "similarReasons",
];
const DATE_PATHS = [
  "createdAt",
  "updatedAt",
  "releaseDates.first",
  "releaseDates.latest",
  "releaseDates.latestFeedItem",
  "releaseDates.next",
  "verification.verifiedAt",
  "officialDescription.verifiedAt",
  "metadata.objectiveVerifiedAt",
  "metadata.import.importedAt",
  "metadata.import.lastCheckedAt",
  "metadata.import.sourceCheckedAt",
  "metadata.import.verifiedAt",
  "metadata.import.factualReview.reviewedAt",
];
const NON_NEGATIVE_LENGTH_FIELDS = [
  "seasons",
  "episodes",
  "feedEntries",
  "feedEntriesApprox",
  "avgEpisodeMinutes",
  "medianEpisodeMinutes",
  "minEpisodeMinutes",
  "maxEpisodeMinutes",
  "totalHours",
  "totalObservedHours",
  "upcomingSeasons",
];
const INTEGER_LENGTH_FIELDS = new Set([
  "seasons",
  "episodes",
  "feedEntries",
  "feedEntriesApprox",
  "upcomingSeasons",
]);
const EPISODE_COUNT_FIELDS = ["full", "bonus", "trailer", "totalObserved"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isRecord(value) && Object.hasOwn(value, key);
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isSlug(value) {
  return typeof value === "string" && SLUG.test(value);
}

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value !== value.trim()) return Number.NaN;

  const text = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return Number.NaN;
    }
    return Date.UTC(year, month - 1, day);
  }

  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function isHttpUrl(value) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) return false;
  if ([" ", "\t", "\n", "\r", "<", ">"].some((character) => value.includes(character))) return false;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch (_error) {
    return false;
  }
}

function addIssue(issues, message) {
  issues.push(message);
}

function readOptionalArray(siteRoot, relativePath, options, optionKey, errors) {
  if (Object.hasOwn(options, optionKey)) {
    const value = options[optionKey];
    if (value !== null && !Array.isArray(value)) {
      addIssue(errors, `${relativePath} must contain an array.`);
      return [];
    }
    return value || [];
  }

  if (!siteRoot) return [];
  const filePath = path.join(siteRoot, relativePath);
  if (!fs.existsSync(filePath)) return [];

  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(value)) {
      addIssue(errors, `${relativePath} must contain an array.`);
      return [];
    }
    return value;
  } catch (error) {
    addIssue(errors, `Could not parse ${relativePath}: ${error.message}`);
    return [];
  }
}

function getPathValue(record, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], record);
}

function getWildcardPathValues(record, pathParts, prefix = "") {
  if (pathParts.length === 0) return [{ value: record, path: prefix }];
  const [part, ...rest] = pathParts;
  if (part === "*") {
    if (!Array.isArray(record)) return [];
    return record.flatMap((value, index) => getWildcardPathValues(value, rest, `${prefix}[${index}]`));
  }
  if (!isRecord(record) || !Object.hasOwn(record, part)) return [];
  return getWildcardPathValues(record[part], rest, prefix ? `${prefix}.${part}` : part);
}

function checkDatePath(record, recordLabel, dottedPath, errors) {
  const pathParts = dottedPath.split(".");
  const values = getWildcardPathValues(record, pathParts);
  values.forEach(({ value, path: resolvedPath }) => {
    if (value === "" || value === undefined || value === null) return;
    if (Number.isNaN(parseDate(value))) {
      addIssue(errors, `${recordLabel}.${resolvedPath} is not a valid date: "${value}".`);
    }
  });
}

function checkRequiredString(record, recordLabel, fieldName, errors, { allowBlank = false } = {}) {
  if (!hasOwn(record, fieldName)) {
    addIssue(errors, `${recordLabel} is missing required field "${fieldName}".`);
    return;
  }
  if (typeof record[fieldName] !== "string" || (!allowBlank && !record[fieldName].trim())) {
    addIssue(errors, `${recordLabel}.${fieldName} must be a non-empty string.`);
  }
}

function checkStringArray(record, recordLabel, fieldName, errors, { required = false } = {}) {
  if (!hasOwn(record, fieldName)) {
    if (required) addIssue(errors, `${recordLabel} is missing required field "${fieldName}".`);
    return;
  }

  const values = record[fieldName];
  if (!Array.isArray(values)) {
    addIssue(errors, `${recordLabel}.${fieldName} must be an array.`);
    return;
  }

  const seen = new Set();
  values.forEach((value, index) => {
    if (typeof value !== "string" || !value.trim()) {
      addIssue(errors, `${recordLabel}.${fieldName}[${index}] must be a non-empty string.`);
      return;
    }

    const key = normalized(value);
    if (seen.has(key)) addIssue(errors, `${recordLabel}.${fieldName} contains duplicate value "${value}".`);
    seen.add(key);
  });
}

function checkObjectField(record, recordLabel, fieldName, errors) {
  if (hasOwn(record, fieldName) && record[fieldName] !== undefined && !isRecord(record[fieldName])) {
    addIssue(errors, `${recordLabel}.${fieldName} must be an object.`);
  }
}

function checkUrlValue(value, label, errors) {
  if (value === "" || value === undefined || value === null) return;
  if (!isHttpUrl(value)) addIssue(errors, `${label} must be an absolute HTTP(S) URL: "${value}".`);
}

function checkUrlTree(value, label, errors) {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => checkUrlTree(entry, `${label}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;

  Object.entries(value).forEach(([key, entry]) => {
    const entryLabel = `${label}.${key}`;
    if (typeof entry === "string" && key !== "source" && URL_KEY.test(key)) {
      checkUrlValue(entry, entryLabel, errors);
      return;
    }
    if (key === "source" && typeof entry === "string" && /\.verification$/.test(label)) {
      entry.split(/;\s*/).filter(Boolean).forEach((part, index) => checkUrlValue(part, `${entryLabel}[${index}]`, errors));
      return;
    }
    if (URL_ARRAY_KEYS.has(key)) {
      if (key === "socialUrls" && isRecord(entry)) {
        checkUrlTree(entry, entryLabel, errors);
        return;
      }
      if (!Array.isArray(entry)) {
        addIssue(errors, `${entryLabel} must be an array.`);
      } else {
        const seenUrls = new Set();
        entry.forEach((url, index) => checkUrlValue(url, `${entryLabel}[${index}]`, errors));
        entry.forEach((url) => {
          if (typeof url !== "string" || !url.trim()) return;
          const key = normalized(url);
          if (seenUrls.has(key)) addIssue(errors, `${entryLabel} contains duplicate URL "${url}".`);
          seenUrls.add(key);
        });
      }
      return;
    }
    checkUrlTree(entry, entryLabel, errors);
  });
}

function checkUniqueIds(records, label, errors) {
  const seen = new Set();
  records.forEach((record, index) => {
    if (!isRecord(record)) {
      addIssue(errors, `Every ${label} record must be an object (index ${index}).`);
      return;
    }
    if (!isSlug(record.id)) {
      addIssue(errors, `${label} at index ${index} has invalid id "${record.id}".`);
      return;
    }
    if (seen.has(record.id)) addIssue(errors, `Duplicate ${label} id "${record.id}".`);
    seen.add(record.id);
  });
}

function checkKnownDateOrdering(record, recordLabel, errors) {
  const createdAt = parseDate(record.createdAt);
  const updatedAt = parseDate(record.updatedAt);
  if (Number.isFinite(createdAt) && Number.isFinite(updatedAt) && createdAt > updatedAt) {
    addIssue(errors, `${recordLabel} has createdAt after updatedAt.`);
  }

  const firstRelease = parseDate(record.releaseDates?.first);
  const latestRelease = parseDate(record.releaseDates?.latest);
  if (Number.isFinite(firstRelease) && Number.isFinite(latestRelease) && firstRelease > latestRelease) {
    addIssue(errors, `${recordLabel} has releaseDates.first after releaseDates.latest.`);
  }
}

function checkNumericField(record, recordLabel, fieldName, errors, { min = 0, max = Number.POSITIVE_INFINITY, integer = false } = {}) {
  if (!hasOwn(record, fieldName) || record[fieldName] === "" || record[fieldName] === null || record[fieldName] === undefined) return null;
  const value = parseNumber(record[fieldName]);
  if (value === null || value < min || value > max || (integer && !Number.isInteger(value))) {
    const range = max === Number.POSITIVE_INFINITY ? `at least ${min}` : `between ${min} and ${max}`;
    addIssue(errors, `${recordLabel}.${fieldName} must be a finite ${integer ? "integer" : "number"} ${range}.`);
    return null;
  }
  return value;
}

function checkShowNumbers(show, recordLabel, errors) {
  if (hasOwn(show, "ratings") && isRecord(show.ratings)) {
    Object.entries(show.ratings).forEach(([key, value]) => checkNumericField({ [key]: value }, `${recordLabel}.ratings`, key, errors, { min: 0, max: 10 }));
  }
  if (hasOwn(show, "popularity") && isRecord(show.popularity) && hasOwn(show.popularity, "score")) {
    checkNumericField(show.popularity, `${recordLabel}.popularity`, "score", errors, { min: 0 });
  }

  if (hasOwn(show, "length") && isRecord(show.length)) {
    const length = show.length;
    const numericValues = {};
    NON_NEGATIVE_LENGTH_FIELDS.forEach((fieldName) => {
      numericValues[fieldName] = checkNumericField(length, `${recordLabel}.length`, fieldName, errors, {
        integer: INTEGER_LENGTH_FIELDS.has(fieldName),
      });
    });

    ["durationCoverage"].forEach((fieldName) => {
      if (hasOwn(length, fieldName)) checkNumericField(length, `${recordLabel}.length`, fieldName, errors, { min: 0, max: 1 });
    });

    if (hasOwn(length, "episodeCounts") && isRecord(length.episodeCounts)) {
      EPISODE_COUNT_FIELDS.forEach((fieldName) => checkNumericField(length.episodeCounts, `${recordLabel}.length.episodeCounts`, fieldName, errors, { integer: true }));
    }

    const min = numericValues.minEpisodeMinutes;
    const median = numericValues.medianEpisodeMinutes;
    const max = numericValues.maxEpisodeMinutes;
    if (min !== null && median !== null && min > median) addIssue(errors, `${recordLabel}.length has minEpisodeMinutes above medianEpisodeMinutes.`);
    if (median !== null && max !== null && median > max) addIssue(errors, `${recordLabel}.length has medianEpisodeMinutes above maxEpisodeMinutes.`);
  }

  if (hasOwn(show, "availability") && isRecord(show.availability) && hasOwn(show.availability, "transcriptCoverage")) {
    checkNumericField(show.availability, `${recordLabel}.availability`, "transcriptCoverage", errors, { min: 0, max: 1 });
  }
}

function checkEntityRecords(entities, shows, errors, warnings) {
  if (!Array.isArray(entities)) {
    addIssue(errors, "Entity registry must contain an array.");
    return new Set();
  }

  checkKnownIdsAndAliases(entities, "entity", errors);
  const entityIds = new Set();
  const entityById = new Map();
  entities.forEach((entity, index) => {
    if (!isRecord(entity)) return;
    const label = `Entity "${entity.id || `index ${index}`}"`;
    if (!isSlug(entity.id)) return;
    entityIds.add(entity.id);
    entityById.set(entity.id, entity);
    if (typeof entity.name !== "string" || !entity.name.trim()) addIssue(errors, `${label} needs a non-empty name.`);
    if (!TYPES.includes(entity.type)) addIssue(errors, `${label} has invalid type "${entity.type}".`);
    if (!["public", "draft"].includes(entity.publication)) addIssue(errors, `${label} has invalid publication "${entity.publication}".`);
    if (typeof entity.indexable !== "boolean") addIssue(errors, `${label}.indexable must be boolean.`);
    if (entity.publication === "draft" && entity.indexable === true) addIssue(errors, `${label} is draft but indexable.`);
    if (hasOwn(entity, "directory") && typeof entity.directory !== "boolean") addIssue(errors, `${label}.directory must be boolean.`);
    if (!Array.isArray(entity.aliases)) addIssue(errors, `${label}.aliases must be an array.`);
    else entity.aliases.forEach((alias, aliasIndex) => {
      if (typeof alias !== "string" || !alias.trim()) addIssue(errors, `${label}.aliases[${aliasIndex}] must be a non-empty string.`);
    });
    checkUrlValue(entity.website, `${label}.website`, errors);
    if (hasOwn(entity, "sources")) {
      if (!Array.isArray(entity.sources) || entity.sources.length === 0) addIssue(errors, `${label}.sources must be a non-empty array.`);
      else {
        const seenSources = new Set();
        entity.sources.forEach((source, sourceIndex) => {
          checkUrlValue(source, `${label}.sources[${sourceIndex}]`, errors);
          if (typeof source === "string") {
            const key = normalized(source);
            if (seenSources.has(key)) addIssue(errors, `${label}.sources contains duplicate URL "${source}".`);
            seenSources.add(key);
          }
        });
      }
    }
    if (entity.publication === "public") {
      if (Number.isNaN(parseDate(entity.reviewedAt))) addIssue(errors, `${label}.reviewedAt must be a valid date for a public entity.`);
      if (!Array.isArray(entity.sources) || entity.sources.length === 0) addIssue(errors, `${label} needs source URLs for public publication.`);
    } else if (entity.reviewedAt !== undefined && Number.isNaN(parseDate(entity.reviewedAt))) {
      addIssue(errors, `${label}.reviewedAt is not a valid date.`);
    }
  });

  const linked = new Set();
  shows.forEach((show) => {
    if (!hasOwn(show, "entityLinks")) return;
    const label = `Show "${show.id}".entityLinks`;
    if (!Array.isArray(show.entityLinks)) {
      addIssue(errors, `${label} must be an array.`);
      return;
    }
    const relationships = new Set();
    show.entityLinks.forEach((link, index) => {
      if (!isRecord(link)) {
        addIssue(errors, `${label}[${index}] must be an object.`);
        return;
      }
      if (!entityIds.has(link.entityId)) addIssue(errors, `Show "${show.id}" references unknown entity id "${link.entityId}".`);
      else linked.add(link.entityId);
      if (!ROLES.includes(link.role)) addIssue(errors, `Show "${show.id}" has invalid entity relationship role "${link.role}".`);
      const key = `${link.entityId}:${link.role}`;
      if (relationships.has(key)) addIssue(errors, `Show "${show.id}" has duplicate entity relationship "${key}".`);
      relationships.add(key);
      const entity = entityById.get(link.entityId);
      if (entity?.type === "person" && link.role !== "creator") {
        addIssue(errors, `Person "${link.entityId}" must use the creator role on "${show.id}".`);
      }
    });
  });

  entities.forEach((entity) => {
    if (isRecord(entity) && entity.publication === "public" && isSlug(entity.id) && !linked.has(entity.id)) {
      warnings.push(`Public entity "${entity.id}" is not linked from any show.`);
    }
  });
  return entityIds;
}

function checkKnownIdsAndAliases(records, label, errors) {
  const seenIds = new Set();
  const seenNames = new Map();
  records.forEach((record) => {
    if (!isRecord(record) || !isSlug(record.id)) return;
    if (seenIds.has(record.id)) addIssue(errors, `Duplicate ${label} id "${record.id}".`);
    seenIds.add(record.id);
    const names = [record.name, ...(Array.isArray(record.aliases) ? record.aliases : [])];
    const aliasNames = new Set();
    names.forEach((name, index) => {
      const key = normalizeEntityName(name);
      if (!key) return;
      if (index > 0 && aliasNames.has(key)) addIssue(errors, `${label} "${record.id}" contains duplicate alias "${name}".`);
      if (index > 0) aliasNames.add(key);
      if (seenNames.has(key) && seenNames.get(key) !== record.id) {
        addIssue(errors, `Ambiguous ${label} name or alias "${name}" in "${record.id}" and "${seenNames.get(key)}".`);
      }
      seenNames.set(key, record.id);
    });
  });
}

function checkShowRecord(show, index, showIds, entityIds, errors) {
  const label = `Show "${show?.id || `index ${index}`}"`;
  if (!isRecord(show)) {
    addIssue(errors, `Every show record must be an object (index ${index}).`);
    return;
  }

  ["id", "title", "description", "cover", "coverAlt", "status", "reviewStatus", "updatedAt"].forEach((fieldName) => {
    checkRequiredString(show, label, fieldName, errors, { allowBlank: fieldName === "cover" });
  });
  ["genres", "tags"].forEach((fieldName) => checkStringArray(show, label, fieldName, errors, { required: true }));
  STRING_ARRAY_FIELDS.filter((fieldName) => !["genres", "tags"].includes(fieldName)).forEach((fieldName) => checkStringArray(show, label, fieldName, errors));
  SHOW_OBJECT_FIELDS.forEach((fieldName) => checkObjectField(show, label, fieldName, errors));

  if (!isSlug(show.id)) return;
  if (!SHOW_STATUSES.includes(show.status)) addIssue(errors, `${label} has invalid status "${show.status}".`);
  if (!REVIEW_STATUSES.includes(show.reviewStatus)) addIssue(errors, `${label} has invalid reviewStatus "${show.reviewStatus}".`);
  if (show.releaseStatus !== undefined && !RELEASE_STATUSES.includes(show.releaseStatus)) addIssue(errors, `${label} has invalid releaseStatus "${show.releaseStatus}".`);
  if (show.completionStatus !== undefined && !COMPLETION_STATUSES.includes(show.completionStatus)) addIssue(errors, `${label} has invalid completionStatus "${show.completionStatus}".`);
  if (show.creatorId !== undefined && !isSlug(show.creatorId)) addIssue(errors, `${label} has invalid creatorId "${show.creatorId}".`);
  if (show.networkId !== undefined && !isSlug(show.networkId)) addIssue(errors, `${label} has invalid networkId "${show.networkId}".`);

  if (show.cover && (path.isAbsolute(show.cover) || show.cover.includes("\\") || show.cover.split("/").includes(".."))) {
    addIssue(errors, `${label}.cover must be a safe repository-relative path.`);
  }
  if (show.similarReasons !== undefined && isRecord(show.similarReasons)) {
    Object.entries(show.similarReasons).forEach(([targetId, reason]) => {
      if (!isSlug(targetId)) addIssue(errors, `${label}.similarReasons has invalid show id "${targetId}".`);
      if (typeof reason !== "string" || !reason.trim()) addIssue(errors, `${label}.similarReasons.${targetId} must be a non-empty string.`);
    });
  }

  if (Array.isArray(show.similarTo)) {
    const seen = new Set();
    show.similarTo.forEach((targetId) => {
      if (!isSlug(targetId)) addIssue(errors, `${label}.similarTo contains invalid show id "${targetId}".`);
      if (seen.has(targetId)) addIssue(errors, `${label}.similarTo contains duplicate relationship "${targetId}".`);
      seen.add(targetId);
      if (targetId === show.id) addIssue(errors, `${label}.similarTo cannot reference itself.`);
      if (isSlug(targetId) && !showIds.has(targetId)) addIssue(errors, `${label} references unknown similarTo id "${targetId}".`);
      if (isRecord(show.similarReasons) && hasOwn(show.similarReasons, targetId) === false) {
        if (show.status === "published") addIssue(errors, `${label}.similarTo relationship "${targetId}" is missing a reason.`);
      }
    });
    if (isRecord(show.similarReasons)) {
      Object.keys(show.similarReasons).forEach((targetId) => {
        if (!show.similarTo.includes(targetId)) addIssue(errors, `${label} defines a similarReason for "${targetId}" without listing it in similarTo.`);
        if (isSlug(targetId) && !showIds.has(targetId)) addIssue(errors, `${label}.similarReasons references unknown show "${targetId}".`);
      });
    }
  }

  if (Array.isArray(show.entityLinks) && entityIds.size === 0 && show.entityLinks.length > 0) {
    addIssue(errors, `${label} contains entityLinks but no entity registry is available.`);
  }

  DATE_PATHS.forEach((datePath) => checkDatePath(show, label, datePath, errors));
  checkKnownDateOrdering(show, label, errors);
  checkShowNumbers(show, label, errors);
  checkUrlTree(show, label, errors);
}

function checkCollectionRecord(collection, index, showIds, publishedShowIds, errors) {
  const label = `Collection "${collection?.id || `index ${index}`}"`;
  if (!isRecord(collection)) {
    addIssue(errors, `Every collection record must be an object (index ${index}).`);
    return;
  }

  ["id", "title", "description", "updatedAt"].forEach((fieldName) => checkRequiredString(collection, label, fieldName, errors));
  checkStringArray(collection, label, "showIds", errors, { required: true });
  ["coverShowIds", "intentTags"].forEach((fieldName) => checkStringArray(collection, label, fieldName, errors));
  ["showReasons", "automation"].forEach((fieldName) => checkObjectField(collection, label, fieldName, errors));
  if (hasOwn(collection, "createdAt") && Number.isNaN(parseDate(collection.createdAt))) addIssue(errors, `${label}.createdAt is not a valid date.`);
  if (Number.isNaN(parseDate(collection.updatedAt))) addIssue(errors, `${label}.updatedAt is not a valid date.`);
  checkKnownDateOrdering(collection, label, errors);

  if (!isSlug(collection.id)) return;
  if (collection.kind !== undefined && !COLLECTION_KINDS.has(collection.kind)) addIssue(errors, `${label} has invalid kind "${collection.kind}".`);
  if (hasOwn(collection, "order") && checkNumericField(collection, label, "order", errors, { min: 0 }) === null) {
    // The helper emits the useful detail; this branch only documents that order is checked.
  }
  const membership = Array.isArray(collection.showIds) ? collection.showIds : [];
  const seenMembership = new Set();
  membership.forEach((showId) => {
    if (!isSlug(showId)) addIssue(errors, `${label}.showIds contains invalid show id "${showId}".`);
    if (seenMembership.has(showId)) addIssue(errors, `${label}.showIds contains duplicate relationship "${showId}".`);
    seenMembership.add(showId);
    if (isSlug(showId) && !showIds.has(showId)) addIssue(errors, `${label} references unknown show "${showId}".`);
    if (isSlug(showId) && publishedShowIds.has(showId) === false && showIds.has(showId)) {
      // Draft memberships are intentionally tolerated by the runtime resolver, but are surfaced as a warning by the caller.
    }
  });

  const coverShowIds = collection.coverShowIds === undefined ? [] : collection.coverShowIds;
  if (Array.isArray(coverShowIds)) coverShowIds.forEach((showId) => {
    if (!showIds.has(showId)) addIssue(errors, `${label} references unknown coverShowId "${showId}".`);
    if (!membership.includes(showId)) addIssue(errors, `${label} defines a coverShowId for a show outside showIds: "${showId}".`);
  });

  if (collection.kind === "similarity" && !collection.anchorShowId) addIssue(errors, `${label} must include anchorShowId.`);
  if (collection.anchorShowId !== undefined) {
    if (!isSlug(collection.anchorShowId)) addIssue(errors, `${label} has invalid anchorShowId "${collection.anchorShowId}".`);
    else if (!showIds.has(collection.anchorShowId)) addIssue(errors, `${label} references unknown anchorShowId "${collection.anchorShowId}".`);
  }

  if (isRecord(collection.showReasons)) {
    Object.entries(collection.showReasons).forEach(([showId, reason]) => {
      if (!showIds.has(showId)) addIssue(errors, `${label}.showReasons references unknown show "${showId}".`);
      if (!membership.includes(showId)) addIssue(errors, `${label} defines a showReason for a show outside showIds: "${showId}".`);
      if (typeof reason !== "string" || !reason.trim()) addIssue(errors, `${label}.showReasons.${showId} must be a non-empty string.`);
    });
  }
}

function checkOptionalDirectory(records, label, relationField, showRecords, errors, warnings) {
  if (!Array.isArray(records)) return new Set();
  checkKnownIdsAndAliases(records, label, errors);
  const ids = new Set();
  records.forEach((record, index) => {
    const recordLabel = `${label} "${record?.id || `index ${index}`}"`;
    if (!isRecord(record)) return;
    if (!isSlug(record.id)) return;
    ids.add(record.id);
    if (typeof record.name !== "string" || !record.name.trim()) addIssue(errors, `${recordLabel} is missing a name.`);
    checkUrlValue(record.website, `${recordLabel}.website`, errors);
  });

  const used = new Set(showRecords.map((show) => show?.[relationField]).filter(Boolean));
  records.forEach((record) => {
    if (isRecord(record) && isSlug(record.id) && !used.has(record.id)) warnings.push(`${label} "${record.id}" is not referenced by any show.`);
  });
  return ids;
}

function checkChangelog(records, showIds, errors) {
  if (!Array.isArray(records)) return;
  checkKnownIdsAndAliases(records, "changelog entry", errors);
  records.forEach((record, index) => {
    const label = `Changelog entry "${record?.id || `index ${index}`}"`;
    if (!isRecord(record)) return;
    checkRequiredString(record, label, "title", errors);
    checkRequiredString(record, label, "summary", errors);
    if (record.status !== undefined && !["draft", "published"].includes(record.status)) addIssue(errors, `${label} has invalid status "${record.status}".`);
    if (record.publishedAt !== undefined && Number.isNaN(parseDate(record.publishedAt))) addIssue(errors, `${label}.publishedAt is not a valid date.`);
    if (record.showIds !== undefined) {
      if (!Array.isArray(record.showIds)) addIssue(errors, `${label}.showIds must be an array.`);
      else {
        const seen = new Set();
        record.showIds.forEach((showId) => {
          if (seen.has(showId)) addIssue(errors, `${label}.showIds contains duplicate relationship "${showId}".`);
          seen.add(showId);
          if (!showIds.has(showId)) addIssue(errors, `${label} references unknown show "${showId}".`);
        });
      }
    }
  });
}

function checkSourceDirectory(siteRoot, relativeDirectory, records, label, errors, { reviews = false } = {}) {
  if (!siteRoot) return;
  const directory = path.join(siteRoot, relativeDirectory);
  if (!fs.existsSync(directory)) {
    addIssue(errors, `${relativeDirectory} is missing.`);
    return;
  }

  const files = fs.readdirSync(directory).filter((fileName) => fileName.endsWith(".json") && fileName !== "_order.json").sort();
  const fileIds = files.map((fileName) => fileName.replace(/\.json$/i, ""));
  const duplicateFileIds = new Set(fileIds.filter((id, index) => fileIds.indexOf(id) !== index));
  duplicateFileIds.forEach((id) => addIssue(errors, `${relativeDirectory} contains duplicate file id "${id}".`));

  const orderPath = path.join(directory, "_order.json");
  if (reviews) {
    return;
  }
  if (!fs.existsSync(orderPath)) {
    addIssue(errors, `${relativeDirectory}/_order.json is missing.`);
  } else {
    let order;
    try {
      order = JSON.parse(fs.readFileSync(orderPath, "utf8"));
    } catch (error) {
      addIssue(errors, `Could not parse ${path.relative(siteRoot, orderPath)}: ${error.message}`);
      order = [];
    }
    if (!Array.isArray(order)) {
      addIssue(errors, `${path.relative(siteRoot, orderPath)} must contain an array.`);
    } else {
      const seen = new Set();
      order.forEach((id, index) => {
        if (!isSlug(id)) addIssue(errors, `${path.relative(siteRoot, orderPath)}[${index}] must be a slug id.`);
        if (seen.has(id)) addIssue(errors, `${path.relative(siteRoot, orderPath)} contains duplicate id "${id}".`);
        seen.add(id);
        if (!fileIds.includes(id)) addIssue(errors, `${path.relative(siteRoot, orderPath)} references missing ${label} "${id}".`);
      });
      fileIds.filter((id) => !seen.has(id)).forEach((id) => addIssue(errors, `${relativeDirectory}/${id}.json is missing from _order.json.`));
      if (order.length !== fileIds.length) addIssue(errors, `${path.relative(siteRoot, orderPath)} and ${relativeDirectory} have different record counts.`);
    }
  }

  const recordById = new Map(records.filter((record) => isRecord(record)).map((record) => [record.id, record]));
  files.forEach((fileName) => {
    const fileId = fileName.replace(/\.json$/i, "");
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(directory, fileName), "utf8"));
      if (!isRecord(parsed)) addIssue(errors, `${relativeDirectory}/${fileName} must contain an object.`);
      else if (parsed.id !== fileId) addIssue(errors, `${relativeDirectory}/${fileName} has internal id "${parsed.id}".`);
    } catch (error) {
      addIssue(errors, `Could not parse ${path.relative(siteRoot, path.join(directory, fileName))}: ${error.message}`);
    }
    if (!recordById.has(fileId)) addIssue(errors, `${relativeDirectory}/${fileName} has no loaded record.`);
  });
}

function checkReviewRecords(reviewsById, showIds, errors) {
  if (!isRecord(reviewsById)) {
    addIssue(errors, "Review records must be keyed by show id.");
    return;
  }
  Object.entries(reviewsById).forEach(([showId, review]) => {
    if (!isSlug(showId)) addIssue(errors, `Review file has invalid show id "${showId}".`);
    if (!showIds.has(showId)) addIssue(errors, `Review "${showId}" does not resolve to a show.`);
    if (!isRecord(review)) {
      addIssue(errors, `Review "${showId}" must contain an object.`);
      return;
    }
    if (review.archiveTake !== undefined && typeof review.archiveTake !== "string") addIssue(errors, `Review "${showId}".archiveTake must be a string.`);
    ["spoilerFreeReview", "thoughts"].forEach((fieldName) => {
      if (review[fieldName] !== undefined && !Array.isArray(review[fieldName]) && typeof review[fieldName] !== "string") {
        addIssue(errors, `Review "${showId}".${fieldName} must be a string or array.`);
      }
    });
    if (review.quote !== undefined && !isRecord(review.quote)) addIssue(errors, `Review "${showId}".quote must be an object.`);
  });
}

function buildReport(errors, warnings, stats) {
  return {
    errors,
    warnings,
    ok: errors.length === 0,
    stats,
  };
}

function collectCatalogIntegrityIssues(options = {}) {
  const siteRoot = options.siteRoot ? path.resolve(options.siteRoot) : null;
  const errors = [];
  const warnings = [];
  let sourceData = options.sourceData;

  if (!sourceData) {
    try {
      sourceData = readCatalogSource(siteRoot || process.cwd());
    } catch (error) {
      addIssue(errors, `Could not read catalog source: ${error.message}`);
      return buildReport(errors, warnings, { shows: 0, collections: 0, entities: 0, reviews: 0 });
    }
  }

  const shows = Array.isArray(sourceData.shows) ? sourceData.shows : [];
  const collections = Array.isArray(sourceData.collections) ? sourceData.collections : [];
  if (!Array.isArray(sourceData.shows)) addIssue(errors, "Catalog source shows must contain an array.");
  if (!Array.isArray(sourceData.collections)) addIssue(errors, "Catalog source collections must contain an array.");

  checkUniqueIds(shows, "show", errors);
  checkUniqueIds(collections, "collection", errors);
  const showIds = new Set(shows.filter((show) => isRecord(show) && isSlug(show.id)).map((show) => show.id));
  const publishedShowIds = new Set(shows.filter((show) => isRecord(show) && show.status === "published").map((show) => show.id));

  let entities = options.entities;
  if (entities === undefined) {
    const entityPath = siteRoot && fs.existsSync(path.join(siteRoot, "catalog-src", "entities.json"))
      ? path.join(siteRoot, "catalog-src", "entities.json")
      : siteRoot && fs.existsSync(path.join(siteRoot, "data", "entities.json"))
        ? path.join(siteRoot, "data", "entities.json")
        : null;
    if (entityPath) {
      try {
        entities = JSON.parse(fs.readFileSync(entityPath, "utf8"));
      } catch (error) {
        addIssue(errors, `Could not parse ${path.relative(siteRoot, entityPath)}: ${error.message}`);
        entities = [];
      }
    }
  }
  entities = entities || [];
  const entityIds = checkEntityRecords(entities, shows, errors, warnings);

  shows.forEach((show, index) => checkShowRecord(show, index, showIds, entityIds, errors));
  collections.forEach((collection, index) => checkCollectionRecord(collection, index, showIds, publishedShowIds, errors));

  const reviewsById = sourceData.reviewsById || {};
  checkReviewRecords(reviewsById, showIds, errors);
  const creatorRecords = readOptionalArray(siteRoot, "data/creators.json", options, "creators", errors);
  const networkRecords = readOptionalArray(siteRoot, "data/networks.json", options, "networks", errors);
  const changelogRecords = readOptionalArray(siteRoot, "data/changelog.json", options, "changelog", errors);
  const creatorIds = checkOptionalDirectory(creatorRecords, "Creator", "creatorId", shows, errors, warnings);
  const networkIds = checkOptionalDirectory(networkRecords, "Network", "networkId", shows, errors, warnings);
  checkChangelog(changelogRecords, showIds, errors);

  if (creatorRecords.length > 0) {
    shows.forEach((show) => {
      if (show?.creatorId && !creatorIds.has(show.creatorId)) addIssue(errors, `Show "${show.id}" references unknown creatorId "${show.creatorId}".`);
    });
  }
  if (networkRecords.length > 0) {
    shows.forEach((show) => {
      if (show?.networkId && !networkIds.has(show.networkId)) addIssue(errors, `Show "${show.id}" references unknown networkId "${show.networkId}".`);
    });
  }

  if (siteRoot && sourceData.mode === "split") {
    checkSourceDirectory(siteRoot, "catalog-src/shows", shows, "show", errors);
    checkSourceDirectory(siteRoot, "catalog-src/collections", collections, "collection", errors);
    checkSourceDirectory(siteRoot, "catalog-src/reviews", Object.entries(reviewsById).map(([id]) => ({ id })), "review", errors, { reviews: true });
  }

  const collectionMemberships = new Set(collections.flatMap((collection) => Array.isArray(collection?.showIds) ? collection.showIds : []));
  const uncollectedPublishedShows = shows.filter((show) => show?.status === "published" && !collectionMemberships.has(show.id)).length;

  return buildReport(errors, warnings, {
    shows: shows.length,
    collections: collections.length,
    entities: entities.length,
    reviews: Object.keys(reviewsById).length,
    uncollectedPublishedShows,
  });
}

function assertCatalogIntegrity(siteRoot, options = {}) {
  const report = collectCatalogIntegrityIssues({ ...options, siteRoot });
  if (!report.ok) {
    const error = new Error(`Catalog integrity validation failed (${report.errors.length} error${report.errors.length === 1 ? "" : "s"}):\n- ${report.errors.join("\n- ")}`);
    error.report = report;
    throw error;
  }
  return report;
}

module.exports = {
  assertCatalogIntegrity,
  collectCatalogIntegrityIssues,
  isHttpUrl,
  isValidDate: (value) => !Number.isNaN(parseDate(value)),
};
