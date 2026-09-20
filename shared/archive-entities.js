(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EchoArchiveEntities = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TYPES = ["person", "production-company", "studio", "network"];
  const ROLES = ["creator", "production-company", "studio", "network"];
  const ORGANIZATION_ROLES = Object.freeze([...ROLES]);
  const ROLE_COMPATIBILITY = Object.freeze({
    person: Object.freeze(["creator"]),
    "production-company": ORGANIZATION_ROLES,
    studio: ORGANIZATION_ROLES,
    network: ORGANIZATION_ROLES,
  });
  const ENTITY_IDENTITY_SUFFIXES = new Set([
    "audio",
    "company",
    "companies",
    "corporation",
    "corp",
    "co",
    "entertainment",
    "inc",
    "limited",
    "llc",
    "ltd",
    "media",
    "network",
    "networks",
    "podcast",
    "podcasts",
    "production",
    "productions",
    "show",
    "shows",
    "studio",
    "studios",
  ]);
  const TYPE_LABELS = { person: "Creator", "production-company": "Production company", studio: "Studio", network: "Network" };
  const ROLE_LABELS = { creator: "Created by", "production-company": "Produced by", studio: "Studio", network: "Network" };
  const ROLE_PRIORITY = ["production-company", "studio", "creator", "network"];
  const entityPath = (id) => `/creators/${encodeURIComponent(id)}`;
  const normalizeEntityName = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const normalizeEntityIdentityKey = (value) => normalizeEntityName(value)
    .split(" ")
    .filter((token) => token && !ENTITY_IDENTITY_SUFFIXES.has(token))
    .join(" ");
  const isEntityRoleCompatible = (type, role) => ROLE_COMPATIBILITY[type]?.includes(role) === true;
  const escapeHtml = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function getEntityShows(entityId, shows = []) {
    return shows.filter((show) => show.status === "published" && (show.entityLinks || []).some((link) => link.entityId === entityId));
  }

  function getPublicEntities(entities = [], shows = []) {
    return entities.filter((entity) => entity.publication === "public" && getEntityShows(entity.id, shows).length > 0);
  }

  // The public directory is an organization-led discovery surface. People can
  // remain public, searchable, and linked from shows without becoming equal
  // directory cards. An explicit opt-in keeps the rule useful for exceptional
  // creator brands that happen to be represented as people.
  function isPublicDirectoryEntity(entity) {
    return entity.directory === true || (entity.directory !== false && entity.type !== "person");
  }

  function getPublicDirectoryEntities(entities = [], shows = []) {
    return getPublicEntities(entities, shows).filter(isPublicDirectoryEntity);
  }

  function getEntityConnections(entityId, entities = [], shows = [], { limit = 12 } = {}) {
    const publicEntities = new Map(entities
      .filter((entity) => entity?.publication === "public")
      .map((entity) => [entity.id, entity]));
    const connections = new Map();

    getEntityShows(entityId, shows).forEach((show) => {
      (Array.isArray(show.entityLinks) ? show.entityLinks : []).forEach((link) => {
        if (!link || link.entityId === entityId) return;
        const entity = publicEntities.get(link.entityId);
        if (!entity) return;
        if (!connections.has(entity.id)) {
          connections.set(entity.id, { entity, showIds: new Set(), roles: new Set() });
        }
        const connection = connections.get(entity.id);
        connection.showIds.add(show.id);
        if (link.role) connection.roles.add(link.role);
      });
    });

    return [...connections.values()]
      .map(({ entity, showIds, roles }) => ({
        entity,
        showIds: [...showIds].sort(),
        showCount: showIds.size,
        roles: [...roles].sort(),
      }))
      .sort((left, right) => right.showCount - left.showCount || left.entity.name.localeCompare(right.entity.name, "en") || left.entity.id.localeCompare(right.entity.id, "en"))
      .slice(0, Math.max(0, limit));
  }

  function isIndexableEntity(entity, shows = []) {
    return entity.publication === "public" && entity.indexable === true && getEntityShows(entity.id, shows).length >= 2;
  }

  function resolveShowEntities(show, entities = []) {
    const byId = new Map(entities.filter((entity) => entity.publication === "public").map((entity) => [entity.id, entity]));
    return (show.entityLinks || []).flatMap((link) => {
      const entity = byId.get(link.entityId);
      return entity ? [{ id: entity.id, name: entity.name, type: entity.type, aliases: entity.aliases, role: link.role }] : [];
    });
  }

  function matchesEntityQuery(entity, query) {
    const tokens = normalizeEntityName(query).split(" ").filter(Boolean);
    return tokens.length > 0 && [entity.name, ...(entity.aliases || [])].some((name) => {
      const normalized = normalizeEntityName(name);
      return tokens.every((token) => normalized.includes(token));
    });
  }

  function selectMoreFrom(show, shows = []) {
    return (show.resolvedEntities || []).map((entity) => ({
      entity,
      shows: getEntityShows(entity.id, shows).filter((candidate) => candidate.id !== show.id)
        .sort((a, b) => a.title.localeCompare(b.title, "en") || a.id.localeCompare(b.id, "en")),
    })).filter((entry) => entry.shows.length >= 3)
      .sort((a, b) => ROLE_PRIORITY.indexOf(a.entity.role) - ROLE_PRIORITY.indexOf(b.entity.role) || b.shows.length - a.shows.length || a.entity.id.localeCompare(b.entity.id, "en"))[0] || null;
  }

  function getUnlinkedCreatorNames(show, entities) {
    const knownNames = new Set(entities.flatMap((entity) => [entity.name, ...(entity.aliases || [])]).map(normalizeEntityName));
    const source = show.credits?.creatorName || show.creators || [];
    return (Array.isArray(source) ? source : [source]).filter((name) => name && !knownNames.has(normalizeEntityName(name)) && !/[|/]/.test(name) && !/^(unknown|not verified)$/i.test(name));
  }

  function renderEntityFacts(show) {
    const entities = show.resolvedEntities || [];
    if (!entities.length) return "";
    const rows = ROLES.flatMap((role) => {
      const related = entities.filter((entity) => entity.role === role);
      return related.length ? [{ label: ROLE_LABELS[role], html: related.map((entity) => `<a href="${entityPath(entity.id)}" data-discovery-entity-id="${escapeHtml(entity.id)}" data-discovery-entity-type="${escapeHtml(entity.type || "unknown")}" data-discovery-surface="show_page_credit">${escapeHtml(entity.name)}</a>`).join(" · ") }] : [];
    });
    // Keep unmigrated individual credits when only the company/network was linked.
    // This is display fallback only; it never creates a relationship or public URL.
    if (!entities.some((entity) => entity.role === "creator")) {
      const names = getUnlinkedCreatorNames(show, entities);
      if (names.length) rows.unshift({ label: "Created by", html: names.map(escapeHtml).join(" · ") });
    }
    return rows.map((row) => `<div class="detail-fact-row"><dt>${row.label}</dt><dd class="detail-fact-value">${row.html}</dd></div>`).join("");
  }

  function renderMoreFrom(show, shows, renderCard) {
    const selected = selectMoreFrom(show, shows);
    if (!selected) return "";
    return `<section class="detail-section detail-more-from" aria-labelledby="more-from-title"><div class="detail-section-header"><h2 id="more-from-title">From ${escapeHtml(selected.entity.name)}</h2><a class="detail-archive-link" href="${entityPath(selected.entity.id)}" data-discovery-entity-id="${escapeHtml(selected.entity.id)}" data-discovery-entity-type="${escapeHtml(selected.entity.type || "unknown")}" data-discovery-surface="entity_page_related">View all ${selected.shows.length}</a></div><div class="podcast-card-grid">${selected.shows.slice(0, 4).map((entry) => renderCard(entry, selected.entity)).join("")}</div></section>`;
  }

  function entityStructuredData(entity, siteUrl) {
    const url = new URL(entityPath(entity.id), siteUrl).toString();
    const aliases = Array.isArray(entity.aliases) ? entity.aliases.filter(Boolean) : [];
    return {
      "@type": entity.type === "person" ? "Person" : "Organization",
      "@id": `${url}#entity`,
      identifier: entity.id,
      name: entity.name,
      url,
      ...(aliases.length ? { alternateName: aliases } : {}),
      ...(entity.description ? { description: entity.description } : {}),
      ...(entity.website ? { sameAs: [entity.website] } : {}),
    };
  }

  function showEntityStructuredData(show, siteUrl) {
    const entities = show.resolvedEntities || [];
    if (!entities.length) return {};
    const creators = entities.filter((entity) => entity.role === "creator");
    const producers = entities.filter((entity) => ["production-company", "studio"].includes(entity.role));
    const providers = entities.filter((entity) => entity.role === "network");
    const legacyCreators = getUnlinkedCreatorNames(show, entities);
    return {
      creator: creators.length ? creators.map((entity) => entityStructuredData(entity, siteUrl)) : legacyCreators.length ? legacyCreators : undefined,
      ...(producers.length ? { producer: producers.map((entity) => entityStructuredData(entity, siteUrl)) } : {}),
      ...(providers.length ? { provider: providers.map((entity) => entityStructuredData(entity, siteUrl)) } : {}),
    };
  }

  return { TYPES, ROLES, ROLE_COMPATIBILITY, TYPE_LABELS, ROLE_LABELS, entityPath, normalizeEntityName, normalizeEntityIdentityKey, isEntityRoleCompatible, escapeHtml, getEntityShows, getPublicEntities, isPublicDirectoryEntity, getPublicDirectoryEntities, getEntityConnections, isIndexableEntity, resolveShowEntities, matchesEntityQuery, selectMoreFrom, renderEntityFacts, renderMoreFrom, entityStructuredData, showEntityStructuredData };
});
