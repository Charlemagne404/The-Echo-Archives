const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadArchiveContext } = require("../lib/ai/archive-context");
const { loadCatalog, loadCollections } = require("../lib/catalog");
const { buildSiteHelpResponse, loadSiteHelpContext } = require("../lib/ai/site-help");

const siteRoot = path.resolve(__dirname, "../..");

async function createContext() {
  const catalog = await loadCatalog(siteRoot);
  const collections = loadCollections(siteRoot, new Set(catalog.map((show) => show.id)));
  const archiveContext = await loadArchiveContext(siteRoot, catalog, collections);
  const siteHelpContext = loadSiteHelpContext({ catalog, collections, archiveContext });

  return { catalog, collections, siteHelpContext };
}

test("site help answers privacy questions with grounded storage details and actions", async () => {
  const context = await createContext();
  const response = buildSiteHelpResponse({
    message: "Does the site store chat history?",
    helpTopic: "privacy",
    page: { pageType: "privacy", path: "/privacy.html" },
    catalog: context.catalog,
    collections: context.collections,
    siteHelpContext: context.siteHelpContext,
  });

  assert.match(response.answer, /session storage/i);
  assert.match(response.answer, /local profile id|local profile/i);
  assert.deepEqual(response.actions, [{ label: "Read Privacy", href: "/privacy.html", external: false }]);
});

test("site help answers creator verification questions for a specific show page", async () => {
  const context = await createContext();
  const verifiedShow = context.catalog.find((show) => Boolean(show.verification?.status));
  assert.ok(verifiedShow, "Expected at least one creator-verified show fixture.");

  const response = buildSiteHelpResponse({
    message: "What does creator verified mean?",
    helpTopic: "creator-verification",
    page: { pageType: "show", path: "/show.html", showId: verifiedShow.id },
    catalog: context.catalog,
    collections: context.collections,
    siteHelpContext: context.siteHelpContext,
  });

  assert.match(response.answer, new RegExp(verifiedShow.title, "i"));
  assert.match(response.answer, /creator verified in the archive|factual metadata/i);
  assert.equal(response.actions[0].href, "/submit.html");
});

test("site help keeps external platform problems bounded", async () => {
  const context = await createContext();
  const response = buildSiteHelpResponse({
    message: "Apple Podcasts is not playing this episode",
    helpTopic: "external-platform",
    page: { pageType: "home", path: "/" },
    catalog: context.catalog,
    collections: context.collections,
    siteHelpContext: context.siteHelpContext,
  });

  assert.match(response.answer, /cannot diagnose|cannot/i);
  assert.match(response.answer, /platform/i);
});

test("site help recognizes the creators page context", async () => {
  const context = await createContext();
  const response = buildSiteHelpResponse({
    message: "What can you do here?",
    helpTopic: "assistant-capabilities",
    page: { pageType: "creators", path: "/for-creators.html" },
    catalog: context.catalog,
    collections: context.collections,
    siteHelpContext: context.siteHelpContext,
  });

  assert.match(response.answer, /creators page|verification|editorially independent/i);
  assert.equal(response.actions[0].href, "/submit.html");
  assert.equal(response.actions[1].href, "/for-creators.html");
});

test("site help can answer direct-title status questions with a referenced show", async () => {
  const context = await createContext();
  const finishedShow = context.catalog.find((show) => show.completionStatus === "finished");
  assert.ok(finishedShow, "Expected at least one finished show fixture.");

  const response = buildSiteHelpResponse({
    message: `Is ${finishedShow.title} finished?`,
    helpTopic: "show-status",
    page: { pageType: "home", path: "/" },
    catalog: context.catalog,
    collections: context.collections,
    siteHelpContext: context.siteHelpContext,
    matches: [
      {
        ...finishedShow,
        reasons: [`direct title match for ${finishedShow.title}`],
      },
    ],
  });

  assert.match(response.answer, new RegExp(finishedShow.title, "i"));
  assert.match(response.answer, /finished|ongoing|unclear|cancelled/i);
});

test("site help can answer direct-title runtime questions from catalog metadata", async () => {
  const context = await createContext();
  const runtimeShow = context.catalog.find((show) => Number.isFinite(Number(show.length?.episodes)));
  assert.ok(runtimeShow, "Expected at least one show with runtime metadata.");

  const response = buildSiteHelpResponse({
    message: `How long is ${runtimeShow.title}?`,
    helpTopic: "show-runtime",
    page: { pageType: "home", path: "/" },
    catalog: context.catalog,
    collections: context.collections,
    siteHelpContext: context.siteHelpContext,
    matches: [
      {
        ...runtimeShow,
        reasons: [`direct title match for ${runtimeShow.title}`],
      },
    ],
  });

  assert.match(response.answer, new RegExp(runtimeShow.title, "i"));
  assert.match(response.answer, /episode|season|hour|runtime/i);
});

test("site help reports archive counts for overview questions", async () => {
  const context = await createContext();
  const response = buildSiteHelpResponse({
    message: "How many shows are in the archive?",
    helpTopic: "archive-stats",
    page: { pageType: "home", path: "/" },
    catalog: context.catalog,
    collections: context.collections,
    siteHelpContext: context.siteHelpContext,
  });

  assert.match(response.answer, /published shows/i);
  assert.match(response.answer, new RegExp(String(context.catalog.length), "i"));
});

test("site help can list creator-verified shows", async () => {
  const context = await createContext();
  const verifiedShow = context.catalog.find((show) => Boolean(show.verification?.status));
  assert.ok(verifiedShow, "Expected at least one creator-verified show fixture.");

  const response = buildSiteHelpResponse({
    message: "Which shows are creator verified?",
    helpTopic: "creator-verified-list",
    page: { pageType: "home", path: "/" },
    catalog: context.catalog,
    collections: context.collections,
    siteHelpContext: context.siteHelpContext,
  });

  assert.match(response.answer, /creator verified/i);
  assert.match(response.answer, new RegExp(verifiedShow.title, "i"));
});
