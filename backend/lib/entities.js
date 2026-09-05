const fs = require("node:fs");
const path = require("node:path");
const { TYPES, ROLES, normalizeEntityName, getPublicEntities } = require("../../shared/archive-entities");

const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isText = (value) => typeof value === "string" && value.trim() === value && value.length > 0;
const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return typeof value === "string" && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
};

function validateEntities(entities, shows = []) {
  if (!Array.isArray(entities)) throw new Error("Entity registry must contain an array.");
  const ids = new Set();
  const names = new Map();
  for (const entity of entities) {
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) throw new Error("Malformed entity record.");
    const { id } = entity;
    if (!isText(id) || !STABLE_ID.test(id) || id.length > 80) throw new Error(`Invalid stable entity id "${id}".`);
    if (ids.has(id)) throw new Error(`Duplicate entity id "${id}".`);
    ids.add(id);
    if (!isText(entity.name) || entity.name.length > 120 || !TYPES.includes(entity.type) || !["public", "draft"].includes(entity.publication) || typeof entity.indexable !== "boolean") {
      throw new Error(`Malformed entity "${id}": name, type, publication and indexable are required.`);
    }
    if (!Array.isArray(entity.aliases) || entity.aliases.some((alias) => !isText(alias) || alias.length > 160)) throw new Error(`Entity "${id}" has invalid aliases.`);
    if (entity.directory !== undefined && typeof entity.directory !== "boolean") throw new Error(`Entity "${id}" has invalid directory visibility.`);
    const aliases = new Set();
    for (const name of [entity.name, ...entity.aliases]) {
      const key = normalizeEntityName(name);
      if (!key) throw new Error(`Entity "${id}" has an empty normalized name or alias.`);
      if (names.has(key) && names.get(key) !== id) throw new Error(`Ambiguous entity alias "${name}" in "${id}" and "${names.get(key)}".`);
      names.set(key, id);
    }
    for (const alias of entity.aliases) {
      const key = normalizeEntityName(alias);
      if (aliases.has(key)) throw new Error(`Duplicate entity alias "${alias}" in "${id}".`);
      aliases.add(key);
    }
    if (entity.website !== undefined && !isHttpUrl(entity.website)) throw new Error(`Entity "${id}" has an invalid website.`);
    if (entity.description !== undefined && (!isText(entity.description) || entity.description.length > 500)) throw new Error(`Entity "${id}" has an invalid description.`);
    if (entity.publication === "public") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entity.reviewedAt || "") || !Number.isFinite(Date.parse(entity.reviewedAt)) || new Date(entity.reviewedAt).toISOString().slice(0, 10) !== entity.reviewedAt || !Array.isArray(entity.sources) || !entity.sources.length || !entity.sources.every(isHttpUrl)) {
        throw new Error(`Public entity "${id}" requires a valid reviewedAt date and source URLs.`);
      }
    } else if (entity.indexable) throw new Error(`Draft entity "${id}" cannot be indexable.`);
  }
  for (const show of shows) {
    if (show.entityLinks === undefined) continue;
    if (!Array.isArray(show.entityLinks)) throw new Error(`Show "${show.id}" entityLinks must be an array.`);
    const relationships = new Set();
    for (const link of show.entityLinks) {
      if (!link || !ids.has(link.entityId)) throw new Error(`Show "${show.id}" references unknown entity id "${link?.entityId}".`);
      if (!ROLES.includes(link.role)) throw new Error(`Show "${show.id}" has invalid entity relationship role "${link.role}".`);
      const entity = entities.find((entry) => entry.id === link.entityId);
      if (entity.type === "person" && link.role !== "creator") throw new Error(`Person "${entity.id}" must use the creator role on "${show.id}".`);
      const key = `${link.entityId}:${link.role}`;
      if (relationships.has(key)) throw new Error(`Show "${show.id}" has duplicate entity relationship "${key}".`);
      relationships.add(key);
    }
  }
  return entities;
}

function loadEntities(siteRoot, shows = []) {
  // Authored mode must never fall back to stale generated data after removal.
  const directory = fs.existsSync(path.join(siteRoot, "catalog-src")) ? "catalog-src" : "data";
  const filePath = path.join(siteRoot, directory, "entities.json");
  const records = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : [];
  return validateEntities(records, shows);
}

function publicEntityRecords(entities, shows) {
  return getPublicEntities(entities, shows).map(({ id, name, type, aliases, website, description, publication, indexable, reviewedAt, sources, directory }) => ({
    id, name, type, aliases, ...(website ? { website } : {}), ...(description ? { description } : {}), publication, indexable, reviewedAt, sources, ...(directory !== undefined ? { directory } : {}),
  }));
}

module.exports = { loadEntities, validateEntities, publicEntityRecords };
