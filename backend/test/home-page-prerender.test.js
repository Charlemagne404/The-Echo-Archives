const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { renderArchiveCard, renderCollectionDirectoryCard, renderCollectionShowCard, renderHomePagePrerender, renderMostPopularCard } = require("../../tools/lib/home-page-prerender");
const { toPublicLabel } = require("../../shared/archive-record");

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

test("canonical sci-fi labels stay stable between first paint and hydration", () => {
  const source = fs.readFileSync(path.join(ROOT, "site-src", "pages", "index.html"), "utf8");

  assert.match(source, /data-chip-filter="sci-fi"[^>]*>Sci-fi<\/button>/);
  assert.equal(toPublicLabel("sci-fi"), "Sci-fi");
  assert.match(
    renderArchiveCard({
      id: "sci-fi-show",
      title: "Sci-Fi Show",
      status: "published",
      reviewStatus: "indexed-only",
      genres: ["sci-fi"],
      tags: [],
      cover: "images/Circle-S-Logo.png",
    }),
    /Genre: Sci-fi/,
  );
});

test("homepage prerender injects initial discovery content into the build template", () => {
  const pageBody = fs.readFileSync(path.join(ROOT, "site-src", "pages", "index.html"), "utf8");
  const rendered = renderHomePagePrerender(pageBody, {
    rootDir: ROOT,
    homeMostPopularIds: HOME_MOST_POPULAR_IDS,
    homeFavoriteRouteIds: HOME_FAVORITE_ROUTE_IDS,
  });

  assert.doesNotMatch(rendered, /<p id="resultsSummary" class="results-summary">Loading archive\.\.\.<\/p>/);
  assert.match(rendered, /<div id="podcast-grid" data-home-prerendered="true">[\s\S]*podcast-card-shell/);
  const publishedShowCount = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "shows.json"), "utf8")).filter((show) => show.status === "published").length;
  const gridStart = rendered.indexOf('<div id="podcast-grid" data-home-prerendered="true">');
  const loadMoreStart = rendered.indexOf('<div id="archiveLoadMore"', gridStart);
  const initialGridMarkup = rendered.slice(gridStart, loadMoreStart);
  assert.equal((initialGridMarkup.match(/class="podcast-card-shell"/g) || []).length, Math.min(60, publishedShowCount));
  assert.match(rendered, /id="archiveLoadMore" class="archive-load-more"/);
  assert.match(rendered, /<div class="popular-grid" id="popularGrid" data-home-prerendered="true">[\s\S]*popular-card/);
  assert.match(rendered, /<div class="collection-grid collection-carousel-track" id="favoriteRoutesGrid" data-home-prerendered="true">[\s\S]*collection-card/);
  assert.match(rendered, /<div class="collection-grid collection-carousel-track" id="collectionGrid" data-home-prerendered="true">[\s\S]*collection-card/);
  assert.match(rendered, /<strong id="homeShowCount">\d+<\/strong>/);
  assert.match(rendered, /<strong id="homeReviewCount">\d+<\/strong>/);
  assert.match(rendered, /<strong id="homeCollectionCount">\d+<\/strong>/);
  assert.match(rendered, /class="rating-guide-trigger"/);
  assert.match(rendered, /Listener Review Score<\/strong> Average from written listener reviews/);
});

test("Imported cards, collection cards, and popular cards keep visible unrated rating placeholders", () => {
  const show = {
    id: "imported-show",
    title: "Imported Show",
    status: "published",
    reviewStatus: "imported",
    finalRating: null,
    cover: "images/Circle-S-Logo.png",
    genres: ["drama", "sci-fi"],
    tags: ["Mystery", "Found audio"],
    bestFor: [],
    completionStatus: "ongoing",
  };
  [renderArchiveCard(show), renderCollectionShowCard(show, "A manually curated route reason.")].forEach((markup) => {
    assert.match(markup, /editorial-badge-imported">Imported/);
    assert.match(markup, /listener-review-inline-score/);
    assert.match(markup, /listener-review-score-icon/);
    assert.match(markup, /listener-review-inline-score-value">--\/10<\/span>/);
    assert.match(markup, /community-inline-score-value">--\/10<\/span>/);
    assert.match(markup, /<span class="rating-divider" aria-hidden="true"><\/span>/);
    assert.doesNotMatch(markup, /listener-review-inline-score[^>]* hidden/);
    assert.doesNotMatch(markup, /community-inline-score[^>]* hidden/);
    assert.doesNotMatch(markup, /archive-inline-score/);
  });
  const popularMarkup = renderMostPopularCard(show);
  assert.match(popularMarkup, /listener-review-inline-score/);
  assert.match(popularMarkup, /listener-review-inline-score-value">--\/10<\/span>/);
  assert.match(popularMarkup, /community-inline-score-value">--\/10<\/span>/);
  assert.match(popularMarkup, /<span class="rating-divider" aria-hidden="true"><\/span>/);
  assert.doesNotMatch(popularMarkup, /listener-review-inline-score[^>]* hidden/);
  assert.doesNotMatch(popularMarkup, /community-inline-score[^>]* hidden/);
  assert.match(renderArchiveCard(show), /data-discovery-show-id="imported-show"[^>]*data-discovery-surface="home_archive_grid"/);
  assert.match(
    renderCollectionShowCard(show, "", {
      recommendationSource: "similarity_collection",
      collectionId: "shows-like-imported-show",
    }),
    /data-discovery-recommendation-source="similarity_collection"[^>]*data-discovery-collection-id="shows-like-imported-show"/,
  );
  assert.match(renderArchiveCard(show), /Genre: Sci-fi/);
  assert.doesNotMatch(renderArchiveCard(show), /Mystery/);
  assert.match(renderMostPopularCard(show), /Genre: Sci-fi/);
  assert.match(renderMostPopularCard(show), /popular-card-chip is-imported">Imported/);

  const ratedMarkup = renderArchiveCard({ ...show, id: "rated-show", finalRating: 8.5 });
  assert.match(ratedMarkup, /inline-score-value">8\.5\/10<\/span>/);
  assert.match(ratedMarkup, /community-inline-score-value">--\/10<\/span>/);
});

test("Imported cards disclose when only a generic drama mapping is available", () => {
  const markup = renderArchiveCard({
    id: "generic-imported-show",
    title: "Generic Imported Show",
    status: "published",
    reviewStatus: "imported",
    cover: "images/Circle-S-Logo.png",
    genres: ["drama"],
    tags: [],
  });

  assert.match(markup, /data-card-meta-kind="source-genre"/);
  assert.match(markup, /Genre not yet reviewed/);
});

test("reviewed cards continue to prefer approved discovery tags over genres", () => {
  const markup = renderArchiveCard({
    id: "reviewed-show",
    title: "Reviewed Show",
    status: "published",
    reviewStatus: "indexed-only",
    cover: "images/Circle-S-Logo.png",
    genres: ["sci-fi"],
    tags: ["Space"],
  });

  assert.match(markup, />Space<\/p>/);
  assert.doesNotMatch(markup, /Genre: Sci-fi/);
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
