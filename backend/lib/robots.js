const { normalizeSiteUrl } = require("./seo");

const CONTENT_SIGNAL = "Content-Signal: ai-train=no, search=yes, ai-input=yes";

function buildRobotsTxt({ siteUrl, isStaging = false } = {}) {
  const lines = [
    "User-agent: *",
    CONTENT_SIGNAL,
  ];

  if (isStaging) {
    lines.push("Disallow: /");
  } else {
    lines.push(
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /maintainer/",
      "",
      `Sitemap: ${normalizeSiteUrl(siteUrl)}/sitemap.xml`,
    );
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  CONTENT_SIGNAL,
  buildRobotsTxt,
};
