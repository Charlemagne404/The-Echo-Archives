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

test("Imported show pages disclose automation, preserve community routes, and omit archive editorial claims", async () => {
  const base = showMap.get("solar");
  const show = {
    ...base,
    id: "imported-solar",
    title: "Imported Solar",
    reviewStatus: "imported",
    finalRating: null,
    ratings: {},
    tones: [],
    themes: [],
    bestFor: [],
    similarTo: [],
    similarReasons: {},
    archiveTake: "",
    spoilerFreeReview: "",
    spoilerFreeReviewParagraphs: [],
    thoughts: "",
    thoughtsParagraphs: [],
    verification: { status: "automated-source-checked" },
  };
  const map = new Map([[show.id, show]]);
  const serverMarkup = createShowPageMarkup(show, map, [], { reviews: [], pagination: { totalReviews: 0 }, scoreSummary: {} });
  assert.match(serverMarkup, /detail-status-chip is-imported">Imported/);
  assert.match(serverMarkup, /Imported · source checked by automation/);
  assert.match(serverMarkup, /has not yet been individually checked/);
  assert.match(serverMarkup, /Be the first to review/);
  assert.doesNotMatch(serverMarkup, /Archive verdict|detail-archive-review/);
  assert.match(serverMarkup, /Listener Review Score/);
  assert.match(serverMarkup, />--\/10</);

  global.document = { body: { dataset: {} }, getElementById: () => null, querySelector: () => null };
  global.EchoArchiveSearch = {};
  global.EchoArchiveRecord = require("../../shared/archive-record.js");
  try {
    const { createShowPageMarkup: createClientShowPageMarkup } = await import("../../shared/app/render-show.js");
    const clientMarkup = createClientShowPageMarkup(show, map, [], { reviews: [], pagination: { totalReviews: 0 }, scoreSummary: {} });
    ["detail-status-chip is-imported", "Imported · source checked by automation", "Listener Review Score"].forEach((fragment) => {
      assert.match(clientMarkup, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    });
  } finally {
    delete global.document;
    delete global.EchoArchiveSearch;
    delete global.EchoArchiveRecord;
  }
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
    listenerReviewScore: { averageRating: 8.25, reviewCount: 6 },
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
  assert.match(markup, /Written review score breakdown/);
  assert.match(markup, /8\.5\/10/);
  assert.match(markup, /Listener Review Score/);
  assert.match(markup, />8\.3\/10</);
  assert.match(markup, /from 6 reviews/);
  assert.doesNotMatch(markup, /Listener42/);
  assert.doesNotMatch(markup, /You make the choices you can live with/);
  assert.match(markup, /detail-side-rail/);
  assert.match(markup, /Community Rating/);
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
  assert.doesNotMatch(listenerMarkup, /Written review score breakdown/);
  assert.match(emptyMarkup, /detail-first-review-card/);
  assert.match(emptyMarkup, /Be the first to review/);
  assert.doesNotMatch(emptyMarkup, /<h2>Reviews<\/h2>/);
  assert.doesNotMatch(emptyMarkup, /Written review score breakdown/);
  assert.match(publicScoresMarkup, /Written review score breakdown/);
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
  assert.match(markup, /Show 1 more/);
  assert.equal(markup.split("detail-collection-route-title").length - 1, 4);
  assert.equal(markup.split("detail-collection-route-art").length - 1, 4);
  assert.equal(markup.split("collection-cover-frame").length - 1, 4);
  assert.equal(markup.split('alt="" width="168"').length - 1, 4);
});

test("public detail facts use singular counts and one listener-friendly status", () => {
  const markup = createShowPageMarkup({
    ...showMap.get("were-alive"),
    length: { seasons: 1, episodes: 1 },
    releaseStatus: "completed",
    completionStatus: "finished",
    verification: { status: "source-verified-with-feed-note" },
  }, showMap, collections);

  assert.match(markup, /1 season • 1 episode/);
  assert.match(markup, /<span class="detail-fact-pill">Completed<\/span>/);
  assert.match(markup, /Source checked/);
  assert.doesNotMatch(markup, /Completed<\/span><span[^>]*>Finished/);
  assert.doesNotMatch(markup, /Source Verified With Feed Note/);

  const unknownStatusMarkup = createShowPageMarkup({
    ...showMap.get("were-alive"), releaseStatus: "unknown", completionStatus: "unclear",
  }, showMap, collections);
  assert.match(unknownStatusMarkup, /Status not confirmed/);
  assert.doesNotMatch(unknownStatusMarkup, /Unknown<\/span><span[^>]*>Unclear/);
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

test("server-rendered show pages never coerce missing or invalid archive ratings to zero", () => {
  const baseShow = showMap.get("impact-winter");
  const unratedValues = [null, undefined, "", "   ", "not rated", "8.5", Number.NaN];

  unratedValues.forEach((finalRating) => {
    const show = { ...baseShow, finalRating };
    const markup = createShowPageMarkup(show, new Map([[show.id, show]]), []);

    assert.match(markup, /<strong class="detail-hero-score-value">--\/10<\/strong>/);
    assert.match(markup, /No published listener reviews yet/);
    assert.match(markup, /<span class="detail-review-rating">Unrated<\/span>/);
    assert.doesNotMatch(markup, /\b0(?:\.0)?\/10\b/);
    assert.doesNotMatch(markup, /detail-score-card-archive/);
    assert.doesNotMatch(markup, /Echo score/);
    assert.doesNotMatch(markup, />Top rated<\/span>/);
  });
});

test("server-rendered show pages preserve genuine numeric archive ratings", () => {
  const baseShow = showMap.get("impact-winter");
  const show = { ...baseShow, finalRating: 8.5 };
  const markup = createShowPageMarkup(show, new Map([[show.id, show]]), []);

  assert.equal((markup.match(/>8\.5\/10</g) || []).length, 2);
  assert.match(markup, /<span class="detail-meta-note">Echo score<\/span>/);
  assert.doesNotMatch(markup, /No archive rating yet/);
  assert.doesNotMatch(markup, />Top rated<\/span>/);
});

test("client-rendered show pages use the same strict archive-rating behavior", async () => {
  global.document = {
    body: { dataset: {} },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
  };
  global.EchoArchiveSearch = {};
  global.EchoArchiveRecord = require("../../shared/archive-record.js");

  try {
    const { createShowPageMarkup: createClientShowPageMarkup } = await import("../../shared/app/render-show.js");
    const baseShow = showMap.get("impact-winter");
    const unratedValues = [null, undefined, "", "   ", "not rated", "8.5", Number.NaN];

    unratedValues.forEach((finalRating) => {
      const show = { ...baseShow, finalRating };
      const markup = createClientShowPageMarkup(show, new Map([[show.id, show]]), []);

      assert.match(markup, /<strong class="detail-hero-score-value">--\/10<\/strong>/);
      assert.match(markup, /No published listener reviews yet/);
      assert.match(markup, /<span class="detail-review-rating">Unrated<\/span>/);
      assert.doesNotMatch(markup, /\b0(?:\.0)?\/10\b/);
      assert.doesNotMatch(markup, /detail-score-card-archive/);
      assert.doesNotMatch(markup, /Echo score/);
      assert.doesNotMatch(markup, />Top rated<\/span>/);
    });

    const ratedShow = { ...baseShow, finalRating: 8.5 };
    const ratedMarkup = createClientShowPageMarkup(ratedShow, new Map([[ratedShow.id, ratedShow]]), []);

    assert.equal((ratedMarkup.match(/>8\.5\/10</g) || []).length, 2);
    assert.match(ratedMarkup, /<span class="detail-meta-note">Echo score<\/span>/);
    assert.doesNotMatch(ratedMarkup, /No archive rating yet/);
  } finally {
    delete global.document;
    delete global.EchoArchiveSearch;
    delete global.EchoArchiveRecord;
  }
});
