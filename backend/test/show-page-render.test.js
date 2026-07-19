const test = require("node:test");
const assert = require("node:assert/strict");
const collections = require("../../data/collections.json");
const shows = require("../../data/shows.json");
const { createShowPageMarkup } = require("../lib/show-page-render");

const showMap = new Map(shows.map((show) => [show.id, show]));

test("empty indexed entries move editorial context out of Reviews and invite the first listener review", () => {
  const markup = createShowPageMarkup(showMap.get("were-alive"), showMap, collections);

  assert.match(markup, /detail-main--indexed/);
  assert.match(markup, /<h2>Official description<\/h2>/);
  assert.match(markup, /detail-indexed-archive-note/);
  assert.match(markup, /id="archive-note" tabindex="-1"/);
  assert.match(markup, /Archive note/);
  assert.match(markup, /detail-first-review-card/);
  assert.match(markup, /Add your take to help listeners find their next show\./);
  assert.match(markup, /href="\/submit\?submissionType=listener-review&amp;showId=were-alive">Be the first to review/);
  assert.match(markup, /detail-facts-links-card--inline/);
  assert.match(markup, /id="facts-links" tabindex="-1"/);
  assert.match(markup, /detail-best-for-icon" aria-hidden="true"><svg/);
  assert.doesNotMatch(markup, /<h2>Reviews<\/h2>/);
  assert.doesNotMatch(markup, /detail-review-carousel/);
  assert.doesNotMatch(markup, /Community score breakdown/);
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
  assert.match(markup, /id="review-notes" tabindex="-1"/);
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

test("indexed listener reviews and public category scores appear only when they have real published content", () => {
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
  const publicScoresMarkup = createShowPageMarkup(nonArchive, showMap, collections, {
    reviews: [{
      id: "listener-1", authorName: "Listener42", title: "A first response", body: "Worth hearing.", ratingStars: 5,
      spoilerLevel: "spoiler-free", bestFor: [], workedBest: [], helpfulCount: 0, publishedAt: "2026-07-16T12:00:00.000Z",
    }],
    pagination: { page: 1, pageSize: 1, totalPages: 1, totalReviews: 1 },
    scoreSummary: {
      voiceActing: { averageRating: 8.5, ratingCount: 3, isPublic: true },
      soundDesign: { averageRating: 7.5, ratingCount: 2, isPublic: false },
    },
  });

  assert.match(listenerMarkup, /data-has-archive="false"/);
  assert.match(listenerMarkup, /Listener42/);
  assert.match(listenerMarkup, /Reveal spoilers/);
  assert.match(listenerMarkup, /data-review-helpful="listener-1"/);
  assert.doesNotMatch(listenerMarkup, /The Echo Archives/);
  assert.doesNotMatch(listenerMarkup, /Community score breakdown/);
  assert.match(emptyMarkup, /detail-first-review-card/);
  assert.match(emptyMarkup, /Be the first to review/);
  assert.doesNotMatch(emptyMarkup, /<h2>Reviews<\/h2>/);
  assert.doesNotMatch(emptyMarkup, /Community score breakdown/);
  assert.match(publicScoresMarkup, /Community score breakdown/);
  assert.match(publicScoresMarkup, /Voice acting/);
  assert.doesNotMatch(publicScoresMarkup, /Building/);
  assert.equal((publicScoresMarkup.match(/detail-community-rating-card/g) || []).length, 1);
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

test("verified start links become the primary handoff without changing provider fallback", () => {
  const verifiedStartMarkup = createShowPageMarkup({
    ...showMap.get("spectre"),
    listenLinks: {
      ...showMap.get("spectre").listenLinks,
      start: "https://example.com/episode-one",
    },
  }, showMap, collections);
  const fallbackMarkup = createShowPageMarkup({
    ...showMap.get("spectre"),
    listenLinks: {
      ...showMap.get("spectre").listenLinks,
      start: "",
    },
  }, showMap, collections);

  assert.equal((verifiedStartMarkup.match(/>Start listening</g) || []).length, 2);
  assert.match(verifiedStartMarkup, /href="https:\/\/example\.com\/episode-one"/);
  assert.doesNotMatch(verifiedStartMarkup, /Open Start listening/);
  assert.match(fallbackMarkup, /Open Website/);
});

test("Derelict's primary listen handoff uses its verified Apple show page", () => {
  const markup = createShowPageMarkup(showMap.get("derelict"), showMap, collections);

  assert.match(markup, /href="https:\/\/podcasts\.apple\.com\/us\/podcast\/derelict\/id1473460202"[^>]*>Start listening<\/a>/);
  assert.doesNotMatch(markup, /derelictpodcast\.com\/season-one/);
});
