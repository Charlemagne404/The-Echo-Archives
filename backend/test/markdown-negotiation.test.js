const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getMediaTypeQuality,
  markNegotiatedResponse,
  negotiateRepresentation,
  parseAcceptHeader,
  prefersMarkdown,
} = require("../lib/markdown-negotiation");
const { renderShowMarkdown } = require("../lib/public-markdown-render");
const express = require("express");

test("Accept negotiation defaults to HTML and honors explicit media-type quality", () => {
  for (const [accept, expected] of [
    ["", "html"],
    ["text/markdown", "markdown"],
    ["text/markdown, text/html;q=0.9", "markdown"],
    ["text/html, text/markdown;q=0.9", "html"],
    ["text/*", "markdown"],
    ["*/*", "html"],
    ["text/markdown;q=0", "html"],
  ]) {
    assert.equal(negotiateRepresentation(accept), expected, accept || "missing Accept");
  }
  assert.equal(negotiateRepresentation("text/markdown;q=0.9, text/html;q=0.5"), "markdown");
  assert.equal(negotiateRepresentation("text/html;q=0.9, text/markdown;q=0.5"), "html");
  assert.equal(negotiateRepresentation("text/*;q=0.5, text/markdown;q=0.8"), "markdown");
  assert.equal(negotiateRepresentation("text/html;q=0.4, text/*;q=0.8"), "markdown");
  assert.equal(prefersMarkdown("text/markdown, text/html;q=0.1"), true);
  assert.equal(prefersMarkdown("text/html, text/markdown;q=0.1"), false);
});

test("more specific Accept ranges override wildcards, including q=0", () => {
  const parsed = parseAcceptHeader("*/*;q=0.8, text/*;q=0.6, text/markdown;q=0");
  assert.equal(getMediaTypeQuality(parsed, "text/markdown").quality, 0);
  assert.equal(getMediaTypeQuality(parsed, "text/html").quality, 0.6);
  assert.equal(negotiateRepresentation("*/*;q=0.8, text/*;q=0.6, text/markdown;q=0"), "html");
});

test("Vary negotiation appends Accept without replacing existing values", async () => {
  const app = express();
  app.get("/", (_req, res) => {
    res.set("Vary", "Origin, User-Agent");
    markNegotiatedResponse(res);
    res.type("text").send("ok");
  });
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.deepEqual(
      (response.headers.get("vary") || "").split(",").map((value) => value.trim()),
      ["Origin", "User-Agent", "Accept"],
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Markdown content normalizes and escapes catalogue text", () => {
  const markdown = renderShowMarkdown({
    show: {
      id: "unsafe-content",
      title: "# [A *show*]\n`name`",
      subtitle: "A\n- line",
      status: "published",
      reviewStatus: "indexed-only",
      officialDescription: {
        sourceLabel: "Official <source>",
        text: "<script> & `details`",
      },
      creators: ["Creator [One]"],
      genres: ["sci-fi"],
    },
    siteUrl: "https://echoarchives.net",
  });

  assert.ok(markdown.includes("# \\# \\[A \\*show\\*\\] \\`name\\`"));
  assert.match(markdown, /A - line/);
  assert.match(markdown, /\\<script\\> & \\`details\\`/);
  assert.ok(markdown.includes("Creator \\[One\\]"));
  assert.doesNotMatch(markdown, /<script>/i);
});
