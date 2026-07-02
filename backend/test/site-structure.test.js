const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const siteRoot = path.resolve(projectRoot, "..");
const runtimePages = [
  "index.html",
  "about.html",
  "for-creators.html",
  "creator-standards.html",
  "supporters.html",
  "help-center.html",
  "collections.html",
  "collection.html",
  "show.html",
  "submit.html",
  "privacy.html",
  "terms.html",
  "cookies.html",
];
const legacyRedirectManifestPath = path.join(siteRoot, "shared/config/legacy-redirects.json");
const legacyRedirects = JSON.parse(fs.readFileSync(legacyRedirectManifestPath, "utf8"));

test("public runtime pages load archive-search before the module entry script", () => {
  runtimePages.forEach((pagePath) => {
    const html = fs.readFileSync(path.join(siteRoot, pagePath), "utf8");
    const searchScriptPattern = /<script src="\/shared\/archive-search\.js\?v=[a-z0-9]+"><\/script>/;
    const runtimeScriptPattern = /<script type="module" src="\/script\.js\?v=[a-z0-9]+"><\/script>/;
    const runtimeScriptMatch = html.match(runtimeScriptPattern);
    const searchScriptMatch = html.match(searchScriptPattern);

    assert.ok(searchScriptMatch, `${pagePath} should include the shared archive search helper.`);
    assert.ok(runtimeScriptMatch, `${pagePath} should include the module runtime entry.`);
    assert.ok(
      html.indexOf(searchScriptMatch[0]) < html.indexOf(runtimeScriptMatch[0]),
      `${pagePath} should load archive-search before the runtime entry.`,
    );
  });
});

test("legacy redirect manifest matches redirect shim files", () => {
  assert.ok(Array.isArray(legacyRedirects));
  assert.ok(legacyRedirects.length > 0);

  legacyRedirects.forEach(({ path: redirectPath, target }) => {
    const absolutePath = path.join(siteRoot, redirectPath);
    const html = fs.readFileSync(absolutePath, "utf8");

    assert.match(
      html,
      new RegExp(`meta http-equiv="refresh" content="0; url=${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `${redirectPath} should refresh to ${target}.`,
    );
    assert.match(
      html,
      new RegExp(`href="${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `${redirectPath} should link to ${target}.`,
    );
  });
});
