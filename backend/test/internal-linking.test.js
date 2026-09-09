const test = require("node:test");
const assert = require("node:assert/strict");
const collections = require("../../data/collections.json");
const shows = require("../../data/shows.json");
const { injectCollectionSummary } = require("../lib/public-page-render");

test("collection detail preserves intent-filter routes without creator connections", () => {
  const collection = collections.find((entry) => entry.id === "serious-sci-fi");
  const collectionShows = shows.filter((show) => collection.showIds.includes(show.id));
  const template = [
    '<h1 id="collectionTitle"></h1>',
    '<span id="collectionBreadcrumbTitle"></span>',
    '<p id="collectionDescription"></p>',
    '<div id="collectionHeroTags"></div>',
    '<div id="collectionHeroArt"></div>',
    '<div id="collectionOverviewMetaLine"></div>',
    '<div id="collectionOverviewChips"></div>',
    '<section id="collectionRoot" class="page-card collection-detail-overview" aria-label="Collection at a glance" hidden></section>',
    '<p id="collectionShowsSummary"></p>',
    '<div id="collectionRelatedGrid"></div>',
    '<section id="collectionRelatedSection" class="page-card collection-detail-related-section" aria-labelledby="collection-related-title" hidden></section>',
  ].join("");

  const rendered = injectCollectionSummary(template, {
    collection,
    collectionShows,
    collections,
    allShows: shows,
  });

  assert.match(rendered, /class="collection-intent-tag-link" href="\/collections\?intent=/);
  assert.doesNotMatch(rendered, /collectionEntitySection|collectionEntityLinks|collection-detail-entity-link/);
});
