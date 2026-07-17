const test = require("node:test");
const assert = require("node:assert/strict");
const collections = require("../../data/collections.json");
const shows = require("../../data/shows.json");
const { createShowPageMarkup } = require("../lib/show-page-render");

const showMap = new Map(shows.map((show) => [show.id, show]));

test("indexed entries use a community carousel and standalone score breakdown without rendering preserved quote data", () => {
  const markup = createShowPageMarkup(showMap.get("were-alive"), showMap, collections);

  assert.match(markup, /detail-main--indexed/);
  assert.match(markup, /<h2>About this show<\/h2>/);
  assert.match(markup, /<h2>Reviews<\/h2>/);
  assert.match(markup, /detail-review-carousel/);
  assert.match(markup, /Community score breakdown/);
  assert.match(markup, /Archive note/);
  assert.match(markup, /The Echo Archives/);
  assert.match(markup, /detail-facts-links-card--inline/);
  assert.doesNotMatch(markup, /Official summary/);
  assert.doesNotMatch(markup, /<h2>Archive take<\/h2>/);
  assert.doesNotMatch(markup, /data-community-hero/);
  assert.doesNotMatch(markup, /Not verified/);
  assert.doesNotMatch(markup, /0 seasons/);
  assert.doesNotMatch(markup, /detail-quote/);
});

test("full reviews server-render archive first and reserve later listener pages for the carousel", () => {
  const show = showMap.get("impact-winter");
  const markup = createShowPageMarkup(show, showMap, collections, {
    reviews: [{
      id: "listener-1", authorName: "Listener42", title: "A sharp listen", body: "Worth the cold dread.", ratingStars: 4,
      spoilerLevel: "light-spoilers", bestFor: ["Long walks"], workedBest: ["Sound design"], helpfulCount: 2, publishedAt: "2026-07-16T12:00:00.000Z",
    }],
    pagination: { page: 1, pageSize: 1, totalPages: 1, totalReviews: 1 },
    scoreSummary: {
      voiceActing: { averageRating: 8.5, ratingCount: 3, isPublic: true },
      soundDesign: { averageRating: null, ratingCount: 0, isPublic: false },
    },
  });
  const uniqueSpoilerFreeLine = show.spoilerFreeReviewParagraphs[0];

  assert.match(markup, /detail-main--full/);
  assert.match(markup, /<h2>Reviews<\/h2>/);
  assert.match(markup, /Archive verdict/);
  assert.match(markup, /The Echo Archives/);
  assert.match(markup, /data-has-archive="true"/);
  assert.match(markup, /data-listener-total="1"/);
  assert.match(markup, /Review 1 of 2/);
  assert.match(markup, /Community score breakdown/);
  assert.match(markup, /8\.5\/10/);
  assert.doesNotMatch(markup, /Listener42/);
  assert.doesNotMatch(markup, /You make the choices you can live with/);
  assert.match(markup, /detail-side-rail/);
  assert.match(markup, /Listener rating/);
  assert.equal(markup.split(uniqueSpoilerFreeLine).length - 1, 1);
  assert.doesNotMatch(markup, /<h2>Listener reviews<\/h2>/);
  assert.doesNotMatch(markup, /<h2>Archive take<\/h2>/);
  assert.doesNotMatch(markup, /data-community-hero/);
  assert.doesNotMatch(markup, /community-review-link/);
  assert.doesNotMatch(markup, /detail-quote/);
  assert.ok((markup.match(/detail-collection-route-art/g) || []).length > 0);
  assert.ok((markup.match(/collection-cover-frame/g) || []).length >= 4);
});

test("non-archive and empty pages begin with a listener review or clear moderated submission state", () => {
  const nonArchive = {
    ...showMap.get("solar"),
    archiveTake: "",
    spoilerFreeReview: "",
    spoilerFreeReviewParagraphs: [],
    thoughts: "",
    thoughtsParagraphs: [],
  };
  const listenerMarkup = createShowPageMarkup(nonArchive, showMap, collections, {
    reviews: [{
      id: "listener-1", authorName: "Listener42", title: "A first response", body: "Worth hearing.", ratingStars: 5,
      spoilerLevel: "light-spoilers", bestFor: [], workedBest: [], helpfulCount: 0, publishedAt: "2026-07-16T12:00:00.000Z",
    }],
    pagination: { page: 1, pageSize: 1, totalPages: 1, totalReviews: 1 },
    scoreSummary: {},
  });
  const emptyMarkup = createShowPageMarkup(nonArchive, showMap, collections, {
    reviews: [], pagination: { page: 1, pageSize: 1, totalPages: 1, totalReviews: 0 }, scoreSummary: {},
  });

  assert.match(listenerMarkup, /data-has-archive="false"/);
  assert.match(listenerMarkup, /Listener42/);
  assert.match(listenerMarkup, /Reveal spoilers/);
  assert.match(listenerMarkup, /data-review-helpful="listener-1"/);
  assert.doesNotMatch(listenerMarkup, /The Echo Archives/);
  assert.match(emptyMarkup, /No reviews are published for this show yet/);
  assert.match(emptyMarkup, /Submit the first review/);
  assert.match(emptyMarkup, /Community score breakdown/);
});

test("official descriptions and route expansion retain source attribution and each show route", () => {
  const show = {
    ...showMap.get("were-alive"),
    id: "were-alive-route-test",
    officialDescription: {
      text: "Official source wording.", sourceLabel: "Official show site", sourceUrl: "https://example.com", verifiedAt: "2026-07-16",
    },
  };
  const routeCollections = Array.from({ length: 4 }, (_, index) => ({
    id: `route-${index + 1}`,
    title: `Route ${index + 1}`,
    showIds: [show.id],
    showReasons: { [show.id]: `Reason ${index + 1}` },
  }));
  const markup = createShowPageMarkup(show, new Map([[show.id, show]]), routeCollections);

  assert.match(markup, /<h2>Official description<\/h2>/);
  assert.match(markup, /From Official show site/);
  assert.match(markup, /View source/);
  assert.match(markup, /<details class="detail-route-overflow">/);
  assert.match(markup, /Show all routes <span>1<\/span>/);
  assert.equal(markup.split("detail-collection-route-title").length - 1, 4);
  assert.equal(markup.split("detail-collection-route-art").length - 1, 4);
  assert.equal(markup.split("collection-cover-frame").length - 1, 4);
  assert.equal(markup.split('alt="" width="168"').length - 1, 4);
});
