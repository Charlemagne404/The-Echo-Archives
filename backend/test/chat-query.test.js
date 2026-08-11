const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { analyzeChatQuery } = require("../lib/ai/chat-query");
const { scoreCatalog, loadCatalog } = require("../lib/catalog");

const siteRoot = path.resolve(__dirname, "../..");

test("Archivist Ollama verification uses an unconstrained prompt with catalog matches", async () => {
  const catalog = await loadCatalog(siteRoot);
  const message = "What should I listen to next?";
  const query = analyzeChatQuery({ message, history: [], catalog });
  const matches = scoreCatalog(catalog, query.scoringMessage, query.scoreOptions);

  assert.equal(query.hasAppliedConstraints, false);
  assert.deepEqual(query.scoreOptions.requiredFields, {});
  assert.ok(matches.length > 0);
});

test("the retired Archivist probe is constrained and therefore intentionally falls back", async () => {
  const catalog = await loadCatalog(siteRoot);
  const query = analyzeChatQuery({
    message: "Recommend one completed science-fiction audio drama.",
    history: [],
    catalog,
  });

  assert.equal(query.hasAppliedConstraints, true);
  assert.deepEqual(query.scoreOptions.requiredFields.completionStatus, ["finished"]);
  assert.ok(query.scoreOptions.requiredFields.genres.length > 0);
});
