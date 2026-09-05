(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EchoArchiveEntities = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TYPES = ["person", "production-company", "studio", "network"];
  const ROLES = ["creator", "production-company", "studio", "network"];
  const TYPE_LABELS = { person: "Creator", "production-company": "Production company", studio: "Studio", network: "Network" };
  const ROLE_LABELS = { creator: "Created by", "production-company": "Produced by", studio: "Studio", network: "Network" };
  const ROLE_PRIORITY = ["production-company", "studio", "creator", "network"];
  const entityPath = (id) => `/creators/${encodeURIComponent(id)}`;
  const normalizeEntityName = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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
      return related.length ? [{ label: ROLE_LABELS[role], html: related.map((entity) => `<a href="${entityPath(entity.id)}">${escapeHtml(entity.name)}</a>`).join(" · ") }] : [];
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
    return `<section class="detail-section detail-more-from" aria-labelledby="more-from-title"><div class="detail-section-header"><div><h2 id="more-from-title">More from ${escapeHtml(selected.entity.name)}</h2><p>Explore more of their shows in the archive.</p></div><a class="detail-archive-link" href="${entityPath(selected.entity.id)}">View catalogue</a></div><div class="podcast-card-grid">${selected.shows.slice(0, 4).map(renderCard).join("")}</div></section>`;
  }

  function entityStructuredData(entity, siteUrl) {
    const url = new URL(entityPath(entity.id), siteUrl).toString();
    return { "@type": entity.type === "person" ? "Person" : "Organization", "@id": `${url}#entity`, name: entity.name, url };
  }

  function showEntityStructuredData(show, siteUrl) {
    const entities = show.resolvedEntities || [];
    if (!entities.length) return {};
    const creators = entities.filter((entity) => entity.role === "creator");
    const producers = entities.filter((entity) => entity.role === "production-company");
    const legacyCreators = getUnlinkedCreatorNames(show, entities);
    return {
      creator: creators.length ? creators.map((entity) => entityStructuredData(entity, siteUrl)) : legacyCreators.length ? legacyCreators : undefined,
      ...(producers.length ? { producer: producers.map((entity) => entityStructuredData(entity, siteUrl)) } : {}),
    };
  }

  return { TYPES, ROLES, TYPE_LABELS, ROLE_LABELS, entityPath, normalizeEntityName, escapeHtml, getEntityShows, getPublicEntities, isPublicDirectoryEntity, getPublicDirectoryEntities, isIndexableEntity, resolveShowEntities, matchesEntityQuery, selectMoreFrom, renderEntityFacts, renderMoreFrom, entityStructuredData, showEntityStructuredData };
});
