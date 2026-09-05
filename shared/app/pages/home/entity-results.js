const { entityPath, escapeHtml, matchesEntityQuery, TYPE_LABELS } = globalThis.EchoArchiveEntities;

export function createEntitySearchResults(grid, shows) {
  const byId = new Map();
  shows.forEach((show) => (show.resolvedEntities || []).forEach((entity) => {
    if (!byId.has(entity.id)) byId.set(entity.id, { ...entity, showIds: new Set() });
    byId.get(entity.id).showIds.add(show.id);
  }));
  const entities = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const section = document.createElement("section");
  section.className = "archive-entity-results";
  section.setAttribute("aria-label", "Matching creators, studios, and networks");
  section.hidden = true;
  grid.before(section);
  return (query) => {
    const matches = entities.filter((entity) => matchesEntityQuery(entity, query)).slice(0, 4);
    section.hidden = matches.length === 0;
    section.innerHTML = matches.length ? `<p>Creators in the archive</p><div>${matches.map((entity) => `<a class="collection-action" href="${entityPath(entity.id)}">${escapeHtml(entity.name)} <span>${TYPE_LABELS[entity.type]} · ${entity.showIds.size} shows</span></a>`).join("")}</div>` : "";
  };
}
