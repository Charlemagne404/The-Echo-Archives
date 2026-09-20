const assert = require("node:assert/strict");
const test = require("node:test");

const { buildEntityGraphData, ENTITY_GRAPH_SCHEMA } = require("../lib/entity-graph");

function entity(id, type, overrides = {}) {
  return {
    id,
    name: id,
    type,
    aliases: [],
    publication: "public",
    indexable: true,
    ...overrides,
  };
}

test("entity graph derives stable reverse membership and shared-show connections from authored edges", () => {
  const graph = buildEntityGraphData({
    entities: [
      entity("company", "production-company"),
      entity("creator", "person"),
      entity("network", "network"),
      entity("unlinked", "studio"),
    ],
    shows: [
      {
        id: "show-two",
        title: "Show Two",
        status: "published",
        entityLinks: [
          { entityId: "company", role: "production-company" },
          { entityId: "network", role: "network" },
        ],
      },
      {
        id: "show-one",
        title: "Show One",
        status: "published",
        entityLinks: [
          { entityId: "company", role: "production-company" },
          { entityId: "creator", role: "creator" },
          { entityId: "missing", role: "creator" },
          { entityId: "creator", role: "studio" },
        ],
      },
      {
        id: "draft-show",
        title: "Draft Show",
        status: "draft",
        entityLinks: [{ entityId: "unlinked", role: "studio" }],
      },
    ],
  });

  assert.equal(graph.schema, ENTITY_GRAPH_SCHEMA);
  assert.deepEqual(graph.shows, [
    { id: "show-one", title: "Show One" },
    { id: "show-two", title: "Show Two" },
  ]);
  assert.deepEqual(graph.edges, [
    { showId: "show-one", entityId: "company", role: "production-company" },
    { showId: "show-one", entityId: "creator", role: "creator" },
    { showId: "show-two", entityId: "company", role: "production-company" },
    { showId: "show-two", entityId: "network", role: "network" },
  ]);

  const company = graph.entities.find((entry) => entry.id === "company");
  const creator = graph.entities.find((entry) => entry.id === "creator");
  const network = graph.entities.find((entry) => entry.id === "network");
  assert.deepEqual(company.showIds, ["show-one", "show-two"]);
  assert.equal(company.showCount, 2);
  assert.deepEqual(creator.showIds, ["show-one"]);
  assert.deepEqual(network.showIds, ["show-two"]);
  assert.equal(graph.entities.some((entry) => entry.id === "unlinked"), false);

  assert.deepEqual(graph.entityConnections, [
    { fromEntityId: "company", toEntityId: "creator", relation: "shared-show", showIds: ["show-one"], showCount: 1 },
    { fromEntityId: "company", toEntityId: "network", relation: "shared-show", showIds: ["show-two"], showCount: 1 },
  ]);
  assert.match(graph.semantics.entityConnections, /does not assert a direct affiliation/);
});
