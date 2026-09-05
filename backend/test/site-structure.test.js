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
  "copyright.html",
  "404.html",
  "500.html",
  "offline.html",
];
const cleanRouteAliases = [
  "about/index.html",
  "for-creators/index.html",
  "creator-standards/index.html",
  "supporters/index.html",
  "help-center/index.html",
  "collections/index.html",
  "collection/index.html",
  "show/index.html",
  "submit/index.html",
  "privacy/index.html",
  "terms/index.html",
  "cookies/index.html",
  "copyright/index.html",
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

test("public runtime pages defer chat markup and code until the launcher is used", () => {
  runtimePages.forEach((pagePath) => {
    const html = fs.readFileSync(path.join(siteRoot, pagePath), "utf8");
    assert.doesNotMatch(html, /id="chat-container"/, `${pagePath} should not include the chat panel markup.`);
  });

  const appSource = fs.readFileSync(path.join(siteRoot, "shared/app/app.js"), "utf8");
  assert.match(appSource, /import\("\.\/chat-loader\.js"\)/, "The launcher should load the chat only on demand.");
  assert.doesNotMatch(appSource, /import\("\.\/chat\.js"\)/, "The app shell must not import the chat module eagerly.");
  runtimePages.forEach((pagePath) => {
    const html = fs.readFileSync(path.join(siteRoot, pagePath), "utf8");
    assert.match(html, /data-chat-stylesheet="\/chat\.css\?v=[a-z0-9]+"/, `${pagePath} should expose the lazy chat stylesheet URL.`);
    assert.doesNotMatch(html, /<link[^>]+href="\/chat\.css\?v=/, `${pagePath} should not load chat.css eagerly.`);
  });
});

test("the default generated public pages do not expose the deferred Archivist feature", () => {
  runtimePages.forEach((pagePath) => {
    const html = fs.readFileSync(path.join(siteRoot, pagePath), "utf8");
    assert.match(html, /data-archivist-enabled="false"/, `${pagePath} should default the Archivist feature off.`);
    assert.doesNotMatch(html, /Ask the Archivist|data-open-chat|id="chat-toggle"/i, `${pagePath} should not expose Archivist copy or controls.`);
    if (!new Set(["404.html", "500.html", "offline.html"]).has(pagePath)) {
      assert.match(html, /id="backToTop"/, `${pagePath} should retain the back-to-top control.`);
    }
  });
});

test("public runtime pages expose a build-stable search index version", () => {
  runtimePages.forEach((pagePath) => {
    const html = fs.readFileSync(path.join(siteRoot, pagePath), "utf8");
    assert.match(
      html,
      /<body[^>]*data-search-index-version="[a-z0-9]+"/,
      `${pagePath} should expose the current search index version on the body.`,
    );
  });

  const sw = fs.readFileSync(path.join(siteRoot, "sw.js"), "utf8");
  assert.match(sw, /"\/shared\/app\/app\.js\?v=[a-z0-9]+"/, "sw.js should precache the versioned app entry module.");
  assert.match(sw, /"\/offline\.html"/, "sw.js should precache the offline fallback.");
  assert.doesNotMatch(sw, /"\/data\/search-index\.json/, "sw.js should not install the full search index.");
  assert.doesNotMatch(sw, /"\/shared\/app\/pages\/home\.js"/, "sw.js should leave lazy route modules to runtime caching.");
});

test("homepage discovery controls are present before hydration", () => {
  const html = fs.readFileSync(path.join(siteRoot, "index.html"), "utf8");

  assert.match(html, /id="quickFilters"[\s\S]*data-chip-filter="all"/);
  assert.match(html, /id="browseModes"[\s\S]*data-browse-mode="default"/);
  assert.match(html, /id="browseModes"[\s\S]*data-browse-mode="recently-updated"/);
});

test("default new-show submission is present before hydration", () => {
  const html = fs.readFileSync(path.join(siteRoot, "submit.html"), "utf8");

  assert.match(html, /id="submitModeCards"[\s\S]*data-submission-mode="show"/);
  assert.match(html, /id="submitDynamicFields"[\s\S]*id="submitShowTitle"/);
  assert.match(html, /id="submitDynamicFields"[\s\S]*id="submitListenLinks"/);
  assert.match(html, /id="submitDynamicFields"[\s\S]*data-tag-input="selectedTags"/);
  assert.match(html, /id="submitCompletionStatus"[\s\S]*option value="unknown" selected>Unknown/);
  assert.match(html, /class="submit-legal-notice"[\s\S]*href="\/terms"[\s\S]*href="\/privacy"/);
  assert.match(html, /id="submitLegalAcknowledgement"/);
  assert.doesNotMatch(html, /submitArchiveFitNote/);
  assert.doesNotMatch(html, /Nothing submitted yet/);
});

test("privacy and storage pages disclose current passive and edge storage behavior", () => {
  const cookies = fs.readFileSync(path.join(siteRoot, "cookies.html"), "utf8");
  const privacy = fs.readFileSync(path.join(siteRoot, "privacy.html"), "utf8");

  for (const storageName of ["echo-scroll:…", "cf_clearance"]) {
    assert.match(cookies, new RegExp(storageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(privacy, new RegExp(storageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(cookies, /passive show-page browsing does not create a profile/i);
  assert.match(privacy, /Passive show-page browsing does not create a rating profile/i);
  assert.doesNotMatch(cookies, /rating widget initializes[^<]*anonymous profile/i);
  assert.match(privacy, /Charlie Arnerstål/);
  assert.match(privacy, /mailto:privacy@echoarchives\.net/);
  assert.match(privacy, /established in Sweden/i);
  assert.match(privacy, /not specifically directed at children/i);
  assert.match(privacy, /parent or guardian/i);
  assert.match(privacy, /Integritetsskyddsmyndigheten \(IMY\)/);
  assert.match(privacy, /weekly rotating keyed pseudonym/i);
  assert.match(privacy, /retained for 14 days/i);
  assert.match(privacy, /stored rating abuse hashes are redacted after 30 days/i);
  assert.match(privacy, /Cloudflare(?:’s|'s) separate edge processing and retention follow its zone and provider settings/i);
  assert.match(cookies, /Charlie Arnerstål/);
  assert.match(cookies, /mailto:privacy@echoarchives\.net/);
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

test("clean-route static aliases exist for plain file servers", () => {
  cleanRouteAliases.forEach((aliasPath) => {
    const absolutePath = path.join(siteRoot, aliasPath);
    assert.equal(fs.existsSync(absolutePath), true, `${aliasPath} should exist.`);
  });
});

test("public and error pages ship the expected metadata primitives", () => {
  runtimePages.forEach((pagePath) => {
    const html = fs.readFileSync(path.join(siteRoot, pagePath), "utf8");

    assert.match(html, /<meta name="description" content="[^"]+"/, `${pagePath} should include a description meta tag.`);
    assert.match(html, /<link rel="canonical" href="[^"]+"/, `${pagePath} should include a canonical URL.`);
    assert.match(html, /<meta property="og:title" content="[^"]+"/, `${pagePath} should include an OG title.`);
    assert.match(html, /<meta property="og:description" content="[^"]+"/, `${pagePath} should include an OG description.`);
    assert.match(html, /<meta property="og:url" content="[^"]+"/, `${pagePath} should include an OG URL.`);
    assert.match(html, /<meta property="og:image" content="[^"]+"/, `${pagePath} should include an OG image.`);
    assert.match(html, /<meta name="twitter:title" content="[^"]+"/, `${pagePath} should include a Twitter title.`);
    assert.match(html, /<meta name="twitter:description" content="[^"]+"/, `${pagePath} should include a Twitter description.`);
    assert.match(html, /<meta name="twitter:image" content="[^"]+"/, `${pagePath} should include a Twitter image.`);
    assert.match(
      html,
      /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover" \/>/,
      `${pagePath} should use a broadly supported viewport declaration.`,
    );
    assert.doesNotMatch(html, /interactive-widget=/, `${pagePath} should not rely on an unsupported viewport extension.`);
    assert.match(html, /<meta name="theme-color" content="#06080b"/, `${pagePath} should include a theme color.`);
    assert.match(html, /<link rel="manifest" href="\/site\.webmanifest"/, `${pagePath} should link to the manifest.`);
    assert.match(
      html,
      /<link rel="icon" type="image\/x-icon" href="\/favicon\.ico" sizes="16x16 32x32 48x48 64x64 128x128 256x256" \/>/,
      `${pagePath} should link to the multi-size ICO favicon.`,
    );
    assert.match(
      html,
      /<link rel="icon" type="image\/png" href="\/icon-192\.png" sizes="192x192" \/>/,
      `${pagePath} should expose the PNG favicon fallback.`,
    );
    assert.match(
      html,
      /<link rel="shortcut icon" type="image\/x-icon" href="\/favicon\.ico" \/>/,
      `${pagePath} should expose the legacy favicon relationship for older crawlers and browsers.`,
    );
    assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/, `${pagePath} should link to the Apple touch icon.`);
  });

  for (const errorPagePath of ["404.html", "500.html", "offline.html"]) {
    const html = fs.readFileSync(path.join(siteRoot, errorPagePath), "utf8");
    assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/, `${errorPagePath} should stay noindex.`);
  }
});

test("web manifest icons exist on disk", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(siteRoot, "site.webmanifest"), "utf8"));
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];

  assert.ok(icons.length > 0, "site.webmanifest should include at least one icon.");
  icons.forEach((icon) => {
    const relativePath = String(icon?.src || "").replace(/^\//, "");
    assert.equal(fs.existsSync(path.join(siteRoot, relativePath)), true, `${icon.src} should exist.`);
  });
});

test("favicon is a compact PNG-backed ICO with standard browser sizes", () => {
  const favicon = fs.readFileSync(path.join(siteRoot, "favicon.ico"));
  const iconCount = favicon.readUInt16LE(4);
  const entries = [];

  assert.equal(favicon.readUInt16LE(0), 0, "favicon.ico should have a zero reserved field.");
  assert.equal(favicon.readUInt16LE(2), 1, "favicon.ico should declare an icon resource.");
  assert.ok(favicon.length < 32 * 1024, "favicon.ico should stay small enough for crawler compatibility.");

  for (let index = 0; index < iconCount; index += 1) {
    const offset = 6 + index * 16;
    const width = favicon[offset] || 256;
    const height = favicon[offset + 1] || 256;
    const bytesInResource = favicon.readUInt32LE(offset + 8);
    const resourceOffset = favicon.readUInt32LE(offset + 12);

    entries.push({ width, height });
    assert.equal(
      favicon.subarray(resourceOffset, resourceOffset + 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      true,
      `${width}x${height} favicon entry should use PNG encoding.`,
    );
    assert.ok(resourceOffset + bytesInResource <= favicon.length, `${width}x${height} favicon entry should fit the file.`);
  }

  assert.deepEqual(entries, [
    { width: 16, height: 16 },
    { width: 32, height: 32 },
    { width: 48, height: 48 },
    { width: 64, height: 64 },
    { width: 128, height: 128 },
    { width: 256, height: 256 },
  ]);
});

test("committed sitemap includes generated show and collection routes", () => {
  const sitemapXml = fs.readFileSync(path.join(siteRoot, "sitemap.xml"), "utf8");

  assert.match(sitemapXml, /<loc>https:\/\/echoarchives\.net\/shows\/[a-z0-9-]+<\/loc>/);
  assert.match(sitemapXml, /<loc>https:\/\/echoarchives\.net\/collections\/[a-z0-9-]+<\/loc>/);
  assert.doesNotMatch(sitemapXml, /\?(?:id|q)=/);
});
