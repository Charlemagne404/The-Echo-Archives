const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { renderHomePagePrerender } = require("../../tools/lib/home-page-prerender");

const ROOT = path.resolve(__dirname, "../..");
const HOME_MOST_POPULAR_IDS = ["midnight-burger", "were-alive", "red-valley", "derelict"];
const HOME_FAVORITE_ROUTE_IDS = [
  "shows-like-midnight-burger",
  "shows-like-welcome-to-night-vale",
  "shows-like-derelict",
  "shows-like-the-white-vault",
  "shows-like-midst",
  "shows-like-malevolent",
];

test("homepage prerender injects initial discovery content into the build template", () => {
  const pageBody = fs.readFileSync(path.join(ROOT, "site-src", "pages", "index.html"), "utf8");
  const rendered = renderHomePagePrerender(pageBody, {
    rootDir: ROOT,
    homeMostPopularIds: HOME_MOST_POPULAR_IDS,
    homeFavoriteRouteIds: HOME_FAVORITE_ROUTE_IDS,
  });

  assert.doesNotMatch(rendered, /<p id="resultsSummary" class="results-summary">Loading archive\.\.\.<\/p>/);
  assert.match(rendered, /<div id="podcast-grid" data-home-prerendered="true">[\s\S]*podcast-card-shell/);
  assert.match(rendered, /<div class="popular-grid" id="popularGrid" data-home-prerendered="true">[\s\S]*popular-card/);
  assert.match(rendered, /<div class="collection-grid collection-carousel-track" id="favoriteRoutesGrid" data-home-prerendered="true">[\s\S]*collection-card/);
  assert.match(rendered, /<div class="collection-grid collection-carousel-track" id="collectionGrid" data-home-prerendered="true">[\s\S]*collection-card/);
  assert.match(rendered, /<strong id="homeShowCount">\d+<\/strong>/);
  assert.match(rendered, /<strong id="homeReviewCount">\d+<\/strong>/);
  assert.match(rendered, /<strong id="homeCollectionCount">\d+<\/strong>/);
});
