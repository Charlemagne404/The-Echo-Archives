const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { renderArchiveCard, renderCollectionDirectoryCard, renderCollectionShowCard, renderHomePagePrerender, renderMostPopularCard } = require("../../tools/lib/home-page-prerender");

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
  assert.match(rendered, /class="rating-guide-trigger"/);
  assert.match(rendered, /Listener Review Score<\/strong> Average from written listener reviews/);
});

test("Imported cards, collection cards, and popular cards carry a compact tier signal and intentional unrated state", () => {
  const show = {
    id: "imported-show",
    title: "Imported Show",
    status: "published",
    reviewStatus: "imported",
    finalRating: null,
    cover: "images/Logo.png",
    tags: ["Mystery", "Found audio"],
    bestFor: [],
    completionStatus: "ongoing",
  };
  [renderArchiveCard(show), renderCollectionShowCard(show, "A manually curated route reason.")].forEach((markup) => {
    assert.match(markup, /editorial-badge-imported">Imported/);
    assert.match(markup, /listener-review-inline-score/);
    assert.match(markup, /listener-review-score-icon/);
    assert.match(markup, /listener-review-inline-score-value">--\/10/);
    assert.doesNotMatch(markup, /archive-inline-score/);
  });
  assert.match(renderMostPopularCard(show), /popular-card-chip is-imported">Imported/);
});

test("prerendered compact collection cards retain the four-cover collage and anchor show", () => {
  const shows = [
    { id: "anchor", title: "Anchor", status: "published", cover: "images/anchor.jpg", accent: { hex: "#123456" } },
    { id: "one", title: "One", status: "published", cover: "images/one.jpg" },
    { id: "two", title: "Two", status: "published", cover: "images/two.jpg" },
    { id: "three", title: "Three", status: "published", cover: "images/three.jpg" },
  ];
  const markup = renderCollectionDirectoryCard(
    {
      id: "shows-like-anchor",
      title: "Shows like Anchor",
      anchorShowId: "anchor",
      coverShowIds: ["one", "two", "three"],
      showIds: shows.map((show) => show.id),
    },
    new Map(shows.map((show) => [show.id, show])),
    { compact: true },
  );

  assert.match(markup, /collection-cover-collage-rail/);
  assert.equal((markup.match(/collection-cover-frame/g) || []).length, 4);
  assert.match(markup, /data-anchor-show-id="anchor"/);
  assert.match(markup, /data-cover-index="1"><img src="\/images\/anchor\.jpg"/);
  assert.match(markup, /style="--collection-accent: #123456"/);
});
