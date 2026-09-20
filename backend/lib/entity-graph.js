const { getPublicEntities, isEntityRoleCompatible } = require("../../shared/archive-entities");

const ENTITY_GRAPH_SCHEMA = "echo-archives/entity-graph/v1";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function entityProjection(entity, showIds) {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
    ...(entity.website ? { website: entity.website } : {}),
    ...(entity.description ? { description: entity.description } : {}),
    publication: entity.publication,
    indexable: entity.indexable,
    ...(entity.reviewedAt ? { reviewedAt: entity.reviewedAt } : {}),
    ...(Array.isArray(entity.sources) ? { sources: entity.sources } : {}),
    ...(entity.directory !== undefined ? { directory: entity.directory } : {}),
    showIds,
    showCount: showIds.length,
  };
}

function buildEntityGraphData({ shows = [], entities = [] } = {}) {
  const publishedShows = (Array.isArray(shows) ? shows : [])
    .filter((show) => isRecord(show) && show.status === "published" && typeof show.id === "string")
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  const publicEntities = getPublicEntities(
    Array.isArray(entities) ? entities.filter(isRecord) : [],
    publishedShows,
  ).sort((left, right) => left.id.localeCompare(right.id, "en"));
  const publicEntityById = new Map(publicEntities.map((entity) => [entity.id, entity]));
  const showIdsByEntity = new Map(publicEntities.map((entity) => [entity.id, new Set()]));
  const edgeKeys = new Set();
  const edges = [];
  const showIdsByEntityPair = new Map();

  publishedShows.forEach((show) => {
    (Array.isArray(show.entityLinks) ? show.entityLinks : []).forEach((link) => {
      if (!isRecord(link) || !publicEntityById.has(link.entityId) || !isEntityRoleCompatible(publicEntityById.get(link.entityId).type, link.role)) {
        return;
      }

      const edgeKey = `${show.id}\u0000${link.entityId}\u0000${link.role}`;
      if (edgeKeys.has(edgeKey)) return;
      edgeKeys.add(edgeKey);
      edges.push({ showId: show.id, entityId: link.entityId, role: link.role });
      showIdsByEntity.get(link.entityId).add(show.id);
    });
  });

  edges.sort((left, right) => left.showId.localeCompare(right.showId, "en") || left.entityId.localeCompare(right.entityId, "en") || left.role.localeCompare(right.role, "en"));

  const validEdgesByShow = new Map();
  edges.forEach((edge) => {
    if (!validEdgesByShow.has(edge.showId)) validEdgesByShow.set(edge.showId, []);
    validEdgesByShow.get(edge.showId).push(edge.entityId);
  });
  validEdgesByShow.forEach((entityIds, showId) => {
    [...new Set(entityIds)].sort((left, right) => left.localeCompare(right, "en")).forEach((left, index, sortedIds) => {
      sortedIds.slice(index + 1).forEach((right) => {
        const pairKey = `${left}\u0000${right}`;
        if (!showIdsByEntityPair.has(pairKey)) showIdsByEntityPair.set(pairKey, new Set());
        showIdsByEntityPair.get(pairKey).add(showId);
      });
    });
  });

  const entityConnections = [...showIdsByEntityPair.entries()]
    .map(([pairKey, showIds]) => {
      const [fromEntityId, toEntityId] = pairKey.split("\u0000");
      const sortedShowIds = [...showIds].sort();
      return {
        fromEntityId,
        toEntityId,
        relation: "shared-show",
        showIds: sortedShowIds,
        showCount: sortedShowIds.length,
      };
    })
    .sort((left, right) => left.fromEntityId.localeCompare(right.fromEntityId, "en") || left.toEntityId.localeCompare(right.toEntityId, "en"));

  const graphEntities = publicEntities.map((entity) => entityProjection(entity, [...showIdsByEntity.get(entity.id)].sort()));
  const graphShows = publishedShows.map((show) => ({
    id: show.id,
    title: show.title || show.id,
  }));

  return {
    schema: ENTITY_GRAPH_SCHEMA,
    semantics: {
      edges: "Authored, source-backed show-to-entity relationships with a role.",
      reverseIndex: "Derived entity-to-show membership from the same authored edges; it is not a second source of truth.",
      entityConnections: "Derived shared-show co-occurrence. It does not assert a direct affiliation between entities.",
    },
    entities: graphEntities,
    shows: graphShows,
    edges,
    entityConnections,
  };
}

module.exports = {
  ENTITY_GRAPH_SCHEMA,
  buildEntityGraphData,
};
