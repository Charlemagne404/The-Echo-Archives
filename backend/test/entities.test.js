const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadEntities, validateEntities, publicEntityRecords } = require("../lib/entities");
const { loadCatalog } = require("../lib/catalog");
const { readCatalogSource } = require("../../tools/lib/catalog-source");
const { createSearchIndexRecord, serializeRuntimeShow } = require("../../tools/lib/catalog-artifacts");
const { hydrateCatalogSearch, scoreCatalog } = require("../../shared/archive-search");
const { normalizeShowRecord } = require("../../shared/archive-record");
const { getEntityShows, getPublicEntities, getPublicDirectoryEntities, resolveShowEntities, selectMoreFrom, renderEntityFacts, matchesEntityQuery, entityPath, showEntityStructuredData } = require("../../shared/archive-entities");
const { buildSitemapEntries } = require("../lib/sitemap");
const { buildEntityPageData, renderEntityPage } = require("../lib/entity-page-render");
const { createShowPageMarkup } = require("../lib/show-page-render");

const root = path.resolve(__dirname, "../..");
const source = readCatalogSource(root);
const entities = loadEntities(root, source.shows);
const shows = source.shows.map((show) => normalizeShowRecord({ ...show, resolvedEntities: resolveShowEntities(show, entities) }));
const byId = new Map(shows.map((show) => [show.id, show]));
const fixture = () => ({ id: "sample-studio", name: "Sample Studio", type: "studio", aliases: ["Sample Audio"], publication: "public", indexable: true, reviewedAt: "2026-09-05", sources: ["https://example.com/studio"] });

test("7 Lamb catalogue includes all six explicit shows despite compound legacy IDs", () => {
  assert.deepEqual(getEntityShows("7-lamb-productions", shows).map((show) => show.id).sort(), ["atlas-avenue-beat", "crystal-blue", "end-of-all-hope", "paralyzed", "story", "tower-4"]);
  const atlas = byId.get("atlas-avenue-beat");
  assert.notEqual(atlas.creatorId, "7-lamb-productions");
  const facts = renderEntityFacts(atlas);
  assert.match(facts, /Produced by/);
  assert.match(facts, /Network/);
  assert.doesNotMatch(facts, /Spreaker|\|/);
  assert.equal(atlas.resolvedEntities.length, 2);
});

test("Fool & Scholar preserves both individual creators and the production company", () => {
  assert.equal(getEntityShows("fool-and-scholar-productions", shows).length, 4);
  for (const id of ["the-white-vault", "vast-horizon"]) {
    const show = byId.get(id);
    assert.deepEqual(show.resolvedEntities.filter((entity) => entity.role === "creator").map((entity) => entity.id), ["k-a-statz", "travis-vengroff"]);
    assert.equal(show.resolvedEntities.find((entity) => entity.id === "fool-and-scholar-productions").role, "production-company");
    assert.doesNotMatch(renderEntityFacts(show), /<dt>Network/);
  }
  assert.match(renderEntityFacts(byId.get("from-now")), /Rhys Wakefield · William Day Frank/);
  assert.match(renderEntityFacts(byId.get("borrasca")), /Rebecca Klingel/);
});

test("unmigrated show retains legacy facts and gets no inferred More from section", () => {
  const show = byId.get("midnight-burger");
  assert.equal(renderEntityFacts(show), "");
  assert.equal(selectMoreFrom(show, shows), null);
  const html = createShowPageMarkup(show, byId);
  assert.match(html, /Creator \/ network/);
  assert.doesNotMatch(html, /detail-more-from/);
});

test("More from is deterministic, requires three alternatives, and excludes self and drafts", () => {
  for (const show of shows) {
    const result = selectMoreFrom(show, shows);
    if (result) {
      assert.ok(result.shows.length >= 3);
      assert.ok(result.shows.every((candidate) => candidate.id !== show.id && candidate.status === "published"));
    }
  }
  const show = byId.get("tower-4");
  assert.equal(selectMoreFrom(show, shows).entity.id, "7-lamb-productions");
  assert.deepEqual(selectMoreFrom(show, [...shows].reverse()), selectMoreFrom(show, shows));
  assert.equal(selectMoreFrom(show, [show, { ...byId.get("paralyzed"), status: "draft" }]), null);
});

test("invalid entities and relationships fail instead of being repaired", () => {
  const badEntities = [
    [null, /Malformed/],
    [{ ...fixture(), id: "../escape" }, /stable entity id/],
    [{ ...fixture(), id: "Sample" }, /stable entity id/],
    [{ ...fixture(), type: "host" }, /Malformed/],
    [{ ...fixture(), name: "" }, /Malformed/],
    [{ ...fixture(), indexable: "yes" }, /Malformed/],
    [{ ...fixture(), directory: "yes" }, /directory visibility/],
    [{ ...fixture(), website: "javascript:alert(1)" }, /website/],
    [{ ...fixture(), sources: [] }, /source URLs/],
    [{ ...fixture(), reviewedAt: "2026-02-31" }, /reviewedAt/],
    [{ ...fixture(), aliases: ["Audio", "audio"] }, /Duplicate entity alias/],
    [{ ...fixture(), publication: "draft" }, /Draft entity/],
  ];
  for (const [entity, error] of badEntities) assert.throws(() => validateEntities([entity]), error);
  assert.throws(() => validateEntities({}), /array/);
  assert.throws(() => validateEntities([fixture(), fixture()]), /Duplicate entity id/);
  assert.throws(() => validateEntities([fixture(), { ...fixture(), id: "another", name: "Other", aliases: ["Sample Audio"] }]), /Ambiguous entity alias/);
  assert.throws(() => validateEntities([fixture(), { ...fixture(), id: "another", name: "Sample Studio", aliases: [] }]), /Ambiguous entity alias/);
  for (const [entityLinks, error] of [
    [[{ entityId: "missing", role: "creator" }], /unknown entity id/],
    [[{ entityId: "sample-studio", role: "writer" }], /invalid entity relationship role/],
    [[{ entityId: "sample-studio", role: "studio" }, { entityId: "sample-studio", role: "studio" }], /duplicate entity relationship/],
    ["sample-studio", /must be an array/],
  ]) assert.throws(() => validateEntities([fixture()], [{ id: "show", entityLinks }]), error);
});

test("catalog loader rejects broken IDs before cover work, and authored removal does not use stale output", async () => {
  const show = { ...source.shows[0], entityLinks: [{ entityId: "broken-id", role: "creator" }] };
  await assert.rejects(loadCatalog(root, { sourceData: { ...source, shows: [show] } }), /unknown entity id "broken-id"/);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "echo-entity-test-"));
  try {
    fs.mkdirSync(path.join(temp, "data"));
    fs.writeFileSync(path.join(temp, "data/entities.json"), JSON.stringify([fixture()]));
    assert.equal(loadEntities(temp).length, 1);
    fs.mkdirSync(path.join(temp, "catalog-src"));
    assert.deepEqual(loadEntities(temp), []);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("aliases find one canonical entity and enrich existing show search", () => {
  const company = entities.find((entity) => entity.id === "fool-and-scholar-productions");
  assert.equal(matchesEntityQuery(company, "Fool & Scholar"), true);
  assert.equal(matchesEntityQuery(company, "Fool and Scholar Productions : Podcasts"), true);
  assert.equal(entityPath({ ...company, name: "Renamed" }.id), "/creators/fool-and-scholar-productions");
  const index = hydrateCatalogSearch(shows.map(createSearchIndexRecord).map(normalizeShowRecord));
  for (const query of ["Fool & Scholar", "Fool and Scholar"]) {
    const results = scoreCatalog(index, query);
    for (const id of ["dont-mind", "the-liberty-podcast", "the-white-vault", "vast-horizon"]) assert.ok(results.some((result) => result.id === id), `${query}: ${id}`);
  }
  assert.ok(scoreCatalog(index, "7 Lamb").some((result) => result.id === "atlas-avenue-beat"));
  assert.ok(scoreCatalog(index, "Rebecca Klingel").some((result) => result.id === "borrasca"));
  assert.equal(matchesEntityQuery(entities.find((entity) => entity.id === "gzm-shows"), "Gen-Z Media"), true);
  assert.equal(matchesEntityQuery(entities.find((entity) => entity.id === "rust-belt-studio"), "Rust Belt Studios"), true);
});

test("public output and sitemap exclude drafts, unresolved labels and thin index entries", () => {
  assert.equal(entities.length, 42);
  assert.equal(getPublicDirectoryEntities(entities, shows).length, 40);
  assert.ok(getPublicEntities(entities, shows).some((entity) => entity.id === "k-a-statz"));
  assert.ok(getPublicEntities(entities, shows).some((entity) => entity.id === "travis-vengroff"));
  assert.ok(getPublicDirectoryEntities(entities, shows).every((entity) => entity.type !== "person"));
  assert.ok(!getPublicDirectoryEntities(entities, shows).some((entity) => ["k-a-statz", "travis-vengroff"].includes(entity.id)));
  assert.ok(entities.every((entity) => !/art19|buzzsprout|rss.com|spreaker/i.test(entity.name)));
  const privateEntity = { ...fixture(), publication: "draft", indexable: false };
  const unpublished = { id: "draft-show", status: "draft", entityLinks: [{ entityId: privateEntity.id, role: "studio" }] };
  assert.ok(!publicEntityRecords([...entities, privateEntity], [...shows, unpublished]).some((entity) => entity.id === privateEntity.id));
  assert.deepEqual(serializeRuntimeShow({ ...unpublished, resolvedEntities: [] }).entityLinks, []);
  const single = { ...fixture(), id: "single" };
  const singleShow = { id: "one", status: "published", entityLinks: [{ entityId: "single", role: "studio" }] };
  const sitemap = buildSitemapEntries({ siteUrl: "https://example.com", catalog: [...shows, unpublished, singleShow], collections: [], entities: [...entities, privateEntity, single] });
  assert.equal(sitemap.filter((entry) => entry.loc.includes("/creators/")).length, entities.filter((entity) => entity.publication === "public" && entity.indexable && getEntityShows(entity.id, [...shows, unpublished, singleShow]).length >= 2).length);
  assert.ok(sitemap.some((entry) => entry.loc.endsWith("/creators/7-lamb-productions")));
  assert.ok(!sitemap.some((entry) => /sample-studio|\/single$|fool-scholar-productions-podcasts/.test(entry.loc)));
});

test("directory visibility hides people without hiding their explicit show relationships", () => {
  const directory = getPublicDirectoryEntities(entities, shows);
  assert.ok(directory.some((entity) => entity.id === "fool-and-scholar-productions"));
  assert.ok(!directory.some((entity) => entity.id === "k-a-statz" || entity.id === "travis-vengroff"));
  assert.equal(selectMoreFrom(byId.get("the-white-vault"), shows).entity.id, "fool-and-scholar-productions");
  const template = fs.readFileSync(path.join(root, "creators.html"), "utf8");
  const html = renderEntityPage(template, { entities, shows, siteUrl: "https://example.com" });
  assert.equal((html.match(/class="entity-card"/g) || []).length, 40);
  assert.doesNotMatch(html, /data-entity-id="(?:k-a-statz|travis-vengroff)"/);
});

test("server renderer escapes data, uses Person or Organization and canonical entity references", () => {
  const template = fs.readFileSync(path.join(root, "creators.html"), "utf8");
  const entity = { ...entities[0], name: '</script><script>alert("x")</script>' };
  const html = renderEntityPage(template, { entity, entities, shows, siteUrl: "https://example.com" });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /rel="canonical" href="https:\/\/example.com\/creators\/7-lamb-productions"/);
  assert.doesNotMatch(html, /id="entitySearch"/);
  const data = showEntityStructuredData(byId.get("the-white-vault"), "https://example.com");
  const atlasData = showEntityStructuredData(byId.get("atlas-avenue-beat"), "https://example.com");
  assert.equal(atlasData.creator, undefined);
  assert.equal(atlasData.publisher, undefined, "Network affiliation must not imply publishing ownership");
  assert.equal(data.creator[0]["@type"], "Person");
  assert.equal(data.producer[0]["@type"], "Organization");
  assert.ok(data.producer[0]["@id"].endsWith("/creators/fool-and-scholar-productions#entity"));
});

test("creator SEO exposes unique intent, rich catalogue lists, social images, and review dates", () => {
  const directory = buildEntityPageData({ entities, shows, siteUrl: "https://example.com" });
  assert.equal(directory.metadata.title, "Audio Drama Creators & Production Companies | The Echo Archives");
  assert.match(directory.metadata.description, /40 source-backed audio drama production companies/i);
  assert.match(directory.metadata.description, /172 fiction podcast shows/i);
  assert.match(directory.metadata.imageUrl, /images\/(?:generated\/covers|covers)\//);

  const directoryList = directory.structuredData["@graph"].find((entry) => entry["@type"] === "ItemList");
  assert.equal(directoryList.numberOfItems, 40);
  assert.equal(directoryList.itemListOrder, "https://schema.org/ItemListOrderAscending");
  assert.equal(directoryList.itemListElement[0].item["@type"], "Organization");
  assert.equal(directoryList.itemListElement[0].item.sameAs[0], entities.find((entity) => entity.id === "7-lamb-productions").website);

  const entity = entities.find((record) => record.id === "7-lamb-productions");
  const detail = buildEntityPageData({ entity, entities, shows, collections: [], siteUrl: "https://example.com" });
  assert.equal(detail.metadata.title, "7 Lamb Productions — Audio Drama Production Company | The Echo Archives");
  assert.match(detail.metadata.description, /6 shows/i);
  assert.match(detail.metadata.description, /Atlas Avenue Beat/i);
  assert.match(detail.metadata.imageUrl, /images\/(?:generated\/covers|covers)\//);

  const graph = detail.structuredData["@graph"];
  const page = graph.find((entry) => entry["@type"] === "CollectionPage");
  const list = graph.find((entry) => entry["@type"] === "ItemList");
  const entityData = graph.find((entry) => entry["@type"] === "Organization");
  assert.equal(page.mainEntity["@id"], "https://example.com/creators/7-lamb-productions#entity");
  assert.equal(page.dateModified, entity.reviewedAt);
  assert.equal(entityData.mainEntityOfPage["@id"], page["@id"]);
  assert.equal(entityData.dateModified, entity.reviewedAt);
  assert.equal(list.itemListElement.length, 6);
  assert.equal(list.itemListElement[0].item["@type"], "PodcastSeries");
  assert.match(list.itemListElement[0].item.description, /audio drama|podcast|detective/i);
});
