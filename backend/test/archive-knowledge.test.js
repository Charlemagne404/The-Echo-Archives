const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { isGroundedRecommendationAnswer } = require("../lib/ai/chat");
const { loadCatalog, loadCollections } = require("../lib/catalog");
const {
  answerCollectionQuestion,
  answerEntityQuestion,
  answerShowRecordQuestion,
  answerShowEvidenceQuestion,
  findPublicPageAnswer,
  loadPublicPageKnowledge,
  resolveConversationContext,
} = require("../lib/ai/archive-knowledge");

const catalog = [
  { id: "one", title: "The First Signal", status: "published", href: "/shows/one", tags: [], tones: ["tense"], genres: ["sci-fi"], formats: ["full-cast"], bestFor: [], length: {}, facts: { ads: "Unknown." }, completionStatus: "finished", finalRating: 8 },
  { id: "two", title: "The Second Signal", status: "published", href: "/shows/two", tags: [], tones: ["warm"], genres: ["comedy"], formats: ["narrated"], bestFor: [], length: {}, facts: { ads: "No ads." }, completionStatus: "ongoing", finalRating: 7 },
];
const collections = [{ id: "cold-signals", title: "Cold Signals", kind: "curated", description: "Isolation and mystery.", showIds: ["one", "two"], showReasons: { one: "Its remote setting drives the tension." }, intentTags: ["isolation"] }];

test("public page retrieval answers from the relevant authored section and excludes maintainer pages", () => {
  const pages = loadPublicPageKnowledge(path.resolve(__dirname, "../.."));
  assert.ok(pages.length > 50);
  assert.ok(pages.every((entry) => !entry.href.includes("maintainer")));
  const copyright = findPublicPageAnswer("How do I request copyright removal?", pages);
  assert.match(copyright.answer, /rights holders|removal/i);
  assert.equal(copyright.actions[0].href, "/copyright#copyright-requests");
  const privacy = findPublicPageAnswer("How do I request my data be deleted?", pages);
  assert.match(privacy.answer, /deletion|deleted/i);
  assert.equal(privacy.actions[0].href, "/privacy#privacy-rights");
  const retention = findPublicPageAnswer("How long do submissions stay in the database?", pages);
  assert.match(retention.answer, /180 days/);
  assert.equal(retention.actions[0].href, "/privacy#privacy-retention");
  const cover = findPublicPageAnswer("Can I use the cover images?", pages);
  assert.match(cover.answer, /property of their respective owners/);
  assert.equal(cover.actions[0].href, "/copyright#copyright-ownership");
});

test("public page knowledge can load a deployed generated page without site-src", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-chat-pages-"));
  try {
    fs.writeFileSync(path.join(root, "copyright.html"), '<main><h1>Copyright & Takedown</h1><section id="copyright-requests"><h2>What rights holders can request</h2><p>You may request copyright removal by contacting the archive with the affected page and your relationship to the work.</p></section></main>');
    const pages = loadPublicPageKnowledge(root);
    const answer = findPublicPageAnswer("How do I request copyright removal?", pages);
    assert.equal(answer.actions[0].href, "/copyright#copyright-requests");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("named collections expose real membership and authored reasons", () => {
  const detail = answerCollectionQuestion({ message: "Recommend a finished show from Cold Signals", page: {}, catalog, collections });
  assert.equal(detail.recommendations.length, 1);
  assert.equal(detail.recommendations[0].id, "one");
  assert.match(detail.recommendations[0].why, /remote setting/);
  const membership = answerCollectionQuestion({ message: "Is The Second Signal in Cold Signals?", page: {}, catalog, collections });
  assert.match(membership.answer, /is in Cold Signals/);
  assert.equal(membership.recommendations.length, 0);
  const appearances = answerCollectionQuestion({ message: "Which collections include The First Signal?", page: {}, catalog, collections });
  assert.match(appearances.answer, /Cold Signals/);
  assert.equal(appearances.actions[1].href, "/collections/cold-signals");
});

test("every published collection title resolves to its own route", async () => {
  const siteRoot = path.resolve(__dirname, "../..");
  const publishedCatalog = (await loadCatalog(siteRoot)).filter((show) => show.status === "published");
  const publishedCollections = loadCollections(siteRoot, new Set(publishedCatalog.map((show) => show.id)));
  for (const collection of publishedCollections) {
    const result = answerCollectionQuestion({
      message: `What is in ${collection.title}?`, page: {}, catalog: publishedCatalog, collections: publishedCollections,
    });
    assert.equal(result.actions[0].href, `/collections/${collection.id}`, collection.title);
    assert.match(result.answer, new RegExp(collection.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("every published show title can resolve a factual show question", async () => {
  const publishedCatalog = (await loadCatalog(path.resolve(__dirname, "../.."))).filter((show) => show.status === "published");
  for (const show of publishedCatalog) {
    const result = answerShowRecordQuestion({ message: `What genres does ${show.title} have?`, page: {}, catalog: publishedCatalog });
    assert.ok(result?.answer.startsWith(`${show.title} — genres:`), show.title);
  }
});

test("show facts and comparisons stay within published record fields", () => {
  const unknownAds = answerShowRecordQuestion({ message: "Does The First Signal have ads?", page: {}, catalog });
  assert.match(unknownAds.answer, /does not currently have verified advertising information/);
  const compare = answerShowRecordQuestion({ message: "Compare The First Signal and The Second Signal", page: {}, catalog });
  assert.match(compare.answer, /finished status/);
  assert.match(compare.answer, /ongoing status/);
  assert.equal(compare.actions.length, 2);
  assert.equal(answerShowRecordQuestion({ message: "Recommend something less intense than The First Signal", page: {}, catalog }), null);
  const thematic = answerShowRecordQuestion({
    message: "What themes does The First Signal have?", page: {},
    catalog: [{ ...catalog[0], themes: ["isolation", "survival"] }, catalog[1]],
  });
  assert.match(thematic.answer, /isolation, survival/);
});

test("creator answers use only reviewed public entities and explicit show links", () => {
  const linked = [{ ...catalog[0], entityLinks: [{ entityId: "signal-studio", role: "production-company" }] }];
  const entities = [
    { id: "signal-studio", name: "Signal Studio", type: "production-company", publication: "public", aliases: [] },
    { id: "private-studio", name: "Private Studio", type: "studio", publication: "draft", aliases: [] },
  ];
  const answer = answerEntityQuestion({ message: "What shows are from Signal Studio?", catalog: linked, entities });
  assert.match(answer.answer, /The First Signal/);
  assert.match(answer.answer, /production company/);
  assert.equal(answer.actions[0].href, "/creators/signal-studio");
  assert.equal(answerEntityQuestion({ message: "What shows are from Private Studio?", catalog: linked, entities }), null);
});

test("model recommendation copy cannot add unseen titles, links, or unsupported numbers", () => {
  const matches = [catalog[0]];
  assert.equal(isGroundedRecommendationAnswer("The First Signal is a strong fit.", matches, catalog), true);
  assert.equal(isGroundedRecommendationAnswer("The Second Signal is a strong fit.", matches, catalog), false);
  assert.equal(isGroundedRecommendationAnswer("The First Signal has 500 episodes.", matches, catalog), false);
  assert.equal(isGroundedRecommendationAnswer("The First Signal is at https://example.com.", matches, catalog), false);
});

test("short follow-ups resolve the last collection or recommended show", () => {
  const collectionPage = resolveConversationContext({
    message: "What is in it?", page: { pageType: "home" },
    history: [{ role: "assistant", content: "Cold Signals is a curated path. Start with The First Signal." }],
    catalog, collections, recentRecommendationIds: ["one"],
  });
  assert.equal(collectionPage.collectionId, "cold-signals");

  const secondShowPage = resolveConversationContext({
    message: "How long is the second one?", page: { pageType: "home" },
    history: [{ role: "assistant", content: "The First Signal is the strongest fit." }],
    catalog, collections, recentRecommendationIds: ["one", "two"],
  });
  assert.equal(secondShowPage.showId, "two");
  const showMembership = resolveConversationContext({
    message: "Which collections is it in?", page: { pageType: "home" },
    history: [{ role: "assistant", content: "The First Signal is the strongest fit." }],
    catalog, collections, recentRecommendationIds: ["one"],
  });
  assert.equal(showMembership.showId, "one");
  assert.match(answerCollectionQuestion({ message: "Which collections is it in?", page: showMembership, catalog, collections }).answer, /Cold Signals/);
});

test("unmapped show questions use public prose evidence or report an unknown", () => {
  const detailedCatalog = [{ ...catalog[0], description: "A giant door lies under the sea. The crew must decide whether to open the ancient vault." }, catalog[1]];
  const found = answerShowEvidenceQuestion({ message: "Does The First Signal have a giant door?", page: {}, catalog: detailedCatalog });
  assert.match(found.answer, /show description says: A giant door lies under the sea/);
  const unknown = answerShowEvidenceQuestion({ message: "Does The First Signal have a villain?", page: {}, catalog: detailedCatalog });
  assert.match(unknown.answer, /can't confirm/);
  assert.equal(unknown.actions[1].href, "/submit");
  assert.equal(answerShowEvidenceQuestion({ message: "Recommend something like The First Signal", page: {}, catalog: detailedCatalog }), null);
});
