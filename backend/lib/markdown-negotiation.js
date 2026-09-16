const MARKDOWN_MEDIA_TYPE = "text/markdown";

function clampQuality(value) {
  const quality = Number(value);
  if (!Number.isFinite(quality)) {
    return 0;
  }

  return Math.max(0, Math.min(1, quality));
}

function parseAcceptHeader(value = "") {
  const header = String(value || "").trim();
  if (!header) {
    return [];
  }

  return header
    .split(",")
    .map((entry, index) => {
      const segments = entry.split(";");
      const mediaRange = String(segments.shift() || "").trim().toLowerCase();
      const match = /^([!#$%&'*+.^_`|~0-9a-z-]+)\/([!#$%&'*+.^_`|~0-9a-z-]+|\*)$/.exec(mediaRange);
      if (!match) {
        return null;
      }

      let quality = 1;
      for (const parameter of segments) {
        const separator = parameter.indexOf("=");
        if (separator < 0) {
          continue;
        }

        const name = parameter.slice(0, separator).trim().toLowerCase();
        if (name !== "q") {
          continue;
        }

        const rawQuality = parameter.slice(separator + 1).trim().replace(/^"|"$/g, "");
        quality = /^(?:0(?:\.\d*)?|1(?:\.0*)?)$/.test(rawQuality) ? clampQuality(rawQuality) : 0;
        break;
      }

      const type = match[1];
      const subtype = match[2];
      return {
        index,
        mediaRange: `${type}/${subtype}`,
        quality,
        specificity: subtype === "*" ? (type === "*" ? 0 : 1) : 2,
        subtype,
        type,
      };
    })
    .filter(Boolean);
}

function getMediaTypeQuality(parsedAccept, mediaType) {
  const [type, subtype] = String(mediaType || "").toLowerCase().split("/");
  if (!type || !subtype) {
    return { matched: false, quality: 0, specificity: -1 };
  }

  const matchingRanges = parsedAccept
    .filter((entry) => (entry.type === "*" || entry.type === type) && (entry.subtype === "*" || entry.subtype === subtype))
    .sort((left, right) => right.specificity - left.specificity || left.index - right.index);

  const match = matchingRanges[0];
  return match
    ? { matched: true, mediaRange: match.mediaRange, quality: match.quality, specificity: match.specificity }
    : { matched: false, quality: 0, specificity: -1 };
}

/**
 * The archive has two representations for supported public pages. HTML wins
 * ties so a generic browser Accept header keeps the existing response. A
 * text/* wildcard is the exception: it is the agent-facing text preference,
 * while the all-media wildcard remains the HTML default. An explicit
 * text/markdown preference
 * wins whenever it is more acceptable than text/html.
 */
function negotiateRepresentation(value = "") {
  const parsedAccept = parseAcceptHeader(value);
  if (parsedAccept.length === 0) {
    return "html";
  }

  const html = getMediaTypeQuality(parsedAccept, "text/html");
  const markdown = getMediaTypeQuality(parsedAccept, MARKDOWN_MEDIA_TYPE);
  if (markdown.quality > 0 && markdown.quality > html.quality) {
    return "markdown";
  }
  if (markdown.quality > 0 && markdown.quality === html.quality && markdown.mediaRange === "text/*" && html.mediaRange === "text/*") {
    return "markdown";
  }
  return "html";
}

function prefersMarkdown(value = "") {
  return negotiateRepresentation(value) === "markdown";
}

function markNegotiatedResponse(res) {
  res.vary("Accept");
  return res;
}

function normalizeMarkdownResponseBody(value = "") {
  const body = String(value || "").replace(/^\uFEFF/, "").trim();
  return body ? `${body}\n` : "\n";
}

function estimateMarkdownTokens(value = "") {
  return Math.max(1, Math.ceil(String(value || "").length / 4));
}

function sendMarkdown(res, markdown, statusCode = 200) {
  const body = normalizeMarkdownResponseBody(markdown);
  res.set({
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Markdown-Tokens": String(estimateMarkdownTokens(body)),
  });
  return res.status(statusCode).send(body);
}

module.exports = {
  MARKDOWN_MEDIA_TYPE,
  estimateMarkdownTokens,
  getMediaTypeQuality,
  markNegotiatedResponse,
  negotiateRepresentation,
  normalizeMarkdownResponseBody,
  parseAcceptHeader,
  prefersMarkdown,
  sendMarkdown,
};
