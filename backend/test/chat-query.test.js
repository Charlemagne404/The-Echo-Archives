const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { analyzeChatQuery, looksLikeShowDetailQuestion } = require("../lib/ai/chat-query");
const { scoreCatalog, loadCatalog } = require("../lib/catalog");

const siteRoot = path.resolve(__dirname, "../..");

test("Archivist Ollama verification uses an unconstrained prompt with catalog matches", async () => {
  const catalog = await loadCatalog(siteRoot);
  const message = "What should I listen to next?";
  const query = analyzeChatQuery({ message, history: [], catalog });
  const matches = scoreCatalog(catalog, query.scoringMessage, query.scoreOptions);

  assert.equal(query.hasAppliedConstraints, false);
  assert.deepEqual(query.scoreOptions.requiredFields, {});
  assert.equal(query.scoreOptions.unconstrainedRecommendation, true);
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

test("chat detail matching keeps title-specific about questions after apostrophe normalization", () => {
  const catalog = [{ id: "midnight-burger", title: "Midnight Burger" }];

  for (const message of ["What's Midnight Burger about?", "What’s Midnight Burger about?"]) {
    assert.equal(looksLikeShowDetailQuestion(message), true);
    assert.equal(
      analyzeChatQuery({ message, history: [], catalog }).targetShowId,
      "midnight-burger",
    );
  }
});
