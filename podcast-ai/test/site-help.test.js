const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { loadArchiveContext } = require("../lib/archive-context");
const { loadCatalog, loadCollections } = require("../lib/catalog");
const { buildSiteHelpResponse, loadSiteHelpContext } = require("../lib/site-help");

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
