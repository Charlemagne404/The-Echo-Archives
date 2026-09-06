const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setupSmoke, teardownSmoke, getSmokeContext, waitForAppReady } = require("./helpers/browser-smoke");
const { readCatalogSource } = require("../../tools/lib/catalog-source");
const { loadEntities } = require("../lib/entities");
const { normalizeShowRecord } = require("../../shared/archive-record");
const { getEntityShows, getPublicDirectoryEntities, isIndexableEntity, resolveShowEntities } = require("../../shared/archive-entities");

const root = path.resolve(__dirname, "../..");
const source = readCatalogSource(root);
const entities = loadEntities(root, source.shows);
const shows = source.shows.map((show) => normalizeShowRecord({ ...show, resolvedEntities: resolveShowEntities(show, entities) }));
const publicDirectoryEntities = getPublicDirectoryEntities(entities, shows);
const expectedDirectoryCards = publicDirectoryEntities.length;
const expectedNetworkCards = publicDirectoryEntities.filter((entity) => entity.type === "network").length;
const expectedMostConnectedEntity = [...publicDirectoryEntities]
  .sort((a, b) => (getEntityShows(b.id, shows).length - getEntityShows(a.id, shows).length) || a.name.localeCompare(b.name, "en"))[0].name;
const expectedIndexableEntities = entities.filter((entity) => isIndexableEntity(entity, shows)).length;

let browser;
let baseUrl;
test.before(async () => { await setupSmoke(); ({ browser, baseUrl } = getSmokeContext()); });
test.after(teardownSmoke);

async function screenshot(page, name) {
  if (process.env.ECHO_ENTITY_SCREENSHOTS !== "true") return;
  const directory = path.resolve(__dirname, "../../.codex-artifacts/creators");
  fs.mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
}

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`Creators directory and detail navigation work at ${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${baseUrl}/creators`);
      await waitForAppReady(page);
      assert.equal(await page.locator(".entity-card").count(), expectedDirectoryCards);
      assert.equal(await page.locator('.entity-card[data-entity-id="k-a-statz"]').count(), 0);
      assert.equal(await page.locator('.entity-card[data-entity-id="travis-vengroff"]').count(), 0);
      assert.equal(await page.locator("#entityEmpty").isVisible(), false);
      assert.equal(await page.locator(".entity-filter-button").count(), 4);
      assert.equal(await page.locator("#entitySort").inputValue(), "name");
      await page.locator('[data-entity-filter="network"]').click();
      assert.equal(await page.locator(".entity-card:visible").count(), expectedNetworkCards);
      await page.locator("#entitySort").selectOption("shows");
      assert.equal(await page.locator(".entity-card:visible h2").first().innerText(), expectedMostConnectedEntity);
      await page.locator('[data-entity-filter="all"]').click();
      assert.ok((await page.getByRole("searchbox").boundingBox()).width > 100);
      assert.equal(await page.locator("h1").innerText(), "Meet the makers behind the stories");
      const nav = width < 960 ? ".site-mobile-primary-nav" : ".site-nav";
      assert.deepEqual(await page.locator(`${nav} a`).allTextContents().then((labels) => labels.map((label) => label.trim()).map((label) => label.replace(/All shows.*|Shows grouped.*|People and studios.*|What the archive.*|Add shows.*|Verification and standards.*/s, ""))), width < 960 ? ["Browse", "Collections", "Creators", "Submit"] : ["Browse", "Collections", "Creators", "About", "Submit", "For creators"]);
      assert.ok(await page.locator(`${nav} a[href="/submit"]`).isVisible());
      assert.ok(await page.locator(`${nav} a[href="/creators"][aria-current="page"]`).isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      if (width < 960) {
        await page.locator("#siteNavToggle").click();
        await page.locator('#siteNavShell a[href="/about"]').waitFor({ state: "visible", timeout: 2000 });
        await page.keyboard.press("Escape");
      }
      await screenshot(page, `creators-${width}`);
      await page.getByRole("searchbox").fill("Fool and Scholar");
      assert.equal(await page.locator(".entity-card:visible").count(), 1);
      await page.getByRole("searchbox").fill("no-such-creator-xyz");
      assert.ok(await page.locator("#entityEmpty").isVisible());
      await page.locator("[data-entity-reset]").click();
      assert.equal(await page.locator(".entity-card:visible").count(), expectedDirectoryCards);
      await page.locator('.entity-card a[href="/creators/7-lamb-productions"]').click();
      await waitForAppReady(page);
      assert.equal(await page.locator("h1").innerText(), "7 Lamb Productions");
      assert.equal(await page.locator(".entity-catalogue .podcast-card").count(), 6);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await screenshot(page, `creator-7-lamb-${width}`);
      await page.locator('.entity-catalogue a[href="/shows/atlas-avenue-beat"]').click();
      await waitForAppReady(page);
      assert.ok(await page.locator('#facts-links a[href="/creators/7-lamb-productions"]').isVisible());
      assert.equal(await page.locator('.detail-more-from a.podcast-card[href="/shows/atlas-avenue-beat"]').count(), 0);
      assert.equal(await page.locator(".detail-more-from .podcast-card").count(), 4);
      if (width < 960) assert.ok((await page.locator(".detail-more-from").boundingBox()).y > (await page.locator("#facts-links").boundingBox()).y);
      assert.doesNotMatch(await page.locator("#facts-links").innerText(), /Spreaker|7 Lamb Productions \|/);
      await screenshot(page, `creator-show-${width}`);
      await page.locator('#facts-links a[href="/creators/7-lamb-productions"]').click();
      await waitForAppReady(page);
      assert.equal(await page.locator(".entity-catalogue .podcast-card").count(), 6);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test("creator pages and search work without JavaScript; unknown and alias routes cannot become duplicates", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/creators/fool-and-scholar-productions`);
    assert.equal(await page.locator(".entity-catalogue .podcast-card").count(), 4);
    assert.match(await page.locator('link[rel="canonical"]').getAttribute("href"), /\/creators\/fool-and-scholar-productions$/);
    await page.goto(`${baseUrl}/creators?q=7%20Lamb`);
    assert.equal(await page.locator(".entity-card:visible").count(), 1);
    await page.goto(`${baseUrl}/creators?type=network&sort=shows`);
    assert.equal(await page.locator(".entity-card:visible").count(), expectedNetworkCards);
    assert.equal(await page.locator(".entity-card:visible h2").first().innerText(), expectedMostConnectedEntity);
    const response = await fetch(`${baseUrl}/creators/buzzsprout`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    assert.equal((await fetch(`${baseUrl}/creators/fool-scholar-productions-podcasts`)).status, 404);
    const alias = await fetch(`${baseUrl}/creators/7-lamb-productions/index.html`, { redirect: "manual" });
    assert.equal(alias.status, 301);
    assert.equal(alias.headers.get("location"), "/creators/7-lamb-productions");
    const xml = await fetch(`${baseUrl}/sitemap.xml`).then((res) => res.text());
    assert.equal((xml.match(/<loc>[^<]*\/creators\//g) || []).length, expectedIndexableEntities);
    for (const route of ["/", "/collections", "/about", "/submit", "/for-creators"]) assert.equal((await fetch(`${baseUrl}${route}`)).status, 200);
  } finally { await context.close(); }
});

test("Browse search discovers creator pages alongside legacy and linked show results", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(`${baseUrl}/?q=Fool%20%26%20Scholar#archive`);
    await waitForAppReady(page);
    assert.equal(await page.locator('.archive-entity-results a[href="/creators/fool-and-scholar-productions"]').count(), 1);
    for (const id of ["dont-mind", "the-liberty-podcast", "the-white-vault", "vast-horizon"]) assert.ok(await page.locator(`#podcast-grid .podcast-card-shell[data-podcast-id="${id}"]`).isVisible());
    await page.goto(`${baseUrl}/shows/the-white-vault`);
    await waitForAppReady(page);
    assert.equal(await page.locator('#facts-links a[href^="/creators/"]').count(), 3);
    const data = JSON.parse(await page.locator("#pageStructuredData").textContent());
    const podcast = data["@graph"].find((entry) => entry["@type"] === "PodcastSeries");
    assert.equal(podcast.creator[0]["@type"], "Person");
    assert.equal(podcast.producer[0]["@type"], "Organization");
    const webPage = data["@graph"].find((entry) => entry["@type"] === "WebPage");
    assert.equal(webPage.mentions.length, 3);
    assert.match(await page.locator("#more-from-title").innerText(), /Fool & Scholar Productions/);
    await page.goto(`${baseUrl}/shows/midnight-burger`);
    await waitForAppReady(page);
    assert.match(await page.locator("#facts-links").innerText(), /Creator \/ network/i);
  } finally { await page.close(); }
});
