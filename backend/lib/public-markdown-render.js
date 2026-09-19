const cheerio = require("cheerio");

const archiveRecord = require("../../shared/archive-record");
const {
  ROLE_LABELS,
  TYPE_LABELS,
  entityPath,
  getEntityShows,
  getPublicDirectoryEntities,
  matchesEntityQuery,
  selectMoreFrom,
} = require("../../shared/archive-entities");
const { compareRecentlyAdded, getArchiveStats, getCollectionShows } = require("../../tools/lib/home-page-prerender");
const {
  buildCollectionPageMetadata,
  buildShowPageMetadata,
  getRelatedCollections,
} = require("./public-page-render");
const {
  buildEntityPageData,
  getEntityPageProfile,
  getEntityShowRoles,
  normalizeDirectoryFilter,
  normalizeDirectorySort,
  orderedShows,
  sortDirectoryEntities,
} = require("./entity-page-render");
const {
  getCollectionMemberships,
  getHeroRuntimeValue,
  getListenerReviewScore,
  getSimilarShowGroups,
  getSummaryDescriptor,
  hasArchiveReviewContent,
} = require("./show-page-render");
const {
  buildAbsoluteUrl,
  buildCollectionPath,
  buildShowPath,
} = require("./seo");

const STATIC_MARKDOWN_FILES = new Set([
  "about.html",
  "for-creators.html",
  "creator-standards.html",
  "supporters.html",
  "help-center.html",
  "privacy.html",
  "terms.html",
  "cookies.html",
  "copyright.html",
]);

const CATEGORY_LABELS = {
  ads: "Ad experience",
  characters: "Characters",
  length: "Episode length and pacing",
  soundDesign: "Sound design",
  story: "Story",
  voiceActing: "Voice acting",
};

const LINK_LABELS = {
  apple: "Apple Podcasts",
  discord: "Discord",
  facebook: "Facebook",
  instagram: "Instagram",
  merch: "Merch",
  patreon: "Patreon",
  rss: "RSS feed",
  spotify: "Spotify",
  start: "Start listening",
  website: "Official website",
  youtube: "YouTube",
};

function normalizeText(value = "") {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMarkdownText(value = "") {
  const text = normalizeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_\[\]{}])/g, "\\$1")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>");
  return text.replace(/^(#{1,6}|>|[-+*]|\d+[.)])(?=\s)/, "\\$1");
}

function escapeMarkdownTableCell(value = "") {
  return escapeMarkdownText(value).replace(/\|/g, "\\|");
}

function asList(value, { splitPipes = false } = {}) {
  const entries = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return entries
    .flatMap((entry) => {
      const text = normalizeText(entry);
      return splitPipes ? text.split(/[|/]\s*/g) : [text];
    })
    .map(normalizeText)
    .filter(Boolean);
}

function uniqueText(values) {
  const seen = new Set();
  return asList(values).filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSuppressedValue(value = "") {
  return /^(?:unknown|unclear|n\/a|none|not[-\s]?verified|not listed yet)$/i.test(normalizeText(value));
}

function usefulValue(value = "") {
  const text = normalizeText(value);
  return text && !isSuppressedValue(text) ? text : "";
}

function toLabel(value = "") {
  return archiveRecord.toPublicLabel(normalizeText(value));
}

function displayList(values, { labels = true } = {}) {
  return uniqueText(values).map((value) => (labels ? toLabel(value) : value)).filter(Boolean);
}

function normalizeSiteUrl(siteUrl = "") {
  return String(siteUrl || "").replace(/\/+$/, "");
}

function absoluteUrl(siteUrl, value, basePath = "/") {
  const raw = normalizeText(value);
  if (!raw) return "";

  try {
    const base = new URL(basePath, `${normalizeSiteUrl(siteUrl)}/`);
    const resolved = new URL(raw, base);
    if (!["http:", "https:", "mailto:"].includes(resolved.protocol)) return "";
    return resolved.toString();
  } catch (_error) {
    return "";
  }
}

function markdownLink(label, href, siteUrl, basePath = "/") {
  const text = escapeMarkdownText(label) || "Open link";
  const url = absoluteUrl(siteUrl, href, basePath);
  return url ? `[${text}](<${url}>)` : text;
}

function formatDate(value, { fallback = "Not listed" } = {}) {
  const text = normalizeText(value);
  if (!text) return fallback;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00Z`)
    : new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-US").format(number) : "0";
}

function formatRating(value, scale = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Unrated";
  return `${Number.isInteger(number) ? number : number.toFixed(1)}/${scale}`;
}

function yamlString(value) {
  return JSON.stringify(normalizeText(value));
}

function renderFrontmatter(metadata = {}) {
  const lines = [
    "---",
    `title: ${yamlString(metadata.title || "The Echo Archives")}`,
    `description: ${yamlString(metadata.description || "")}`,
  ];
  if (metadata.imageUrl) lines.push(`image: ${yamlString(metadata.imageUrl)}`);
  if (metadata.canonicalUrl) lines.push(`canonical_url: ${yamlString(metadata.canonicalUrl)}`);
  lines.push("---");
  return lines.join("\n");
}

function renderDocument(metadata, sections = []) {
  return [renderFrontmatter(metadata), ...sections.filter(Boolean)]
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderParagraphs(values) {
  return asList(values).map(escapeMarkdownText).filter(Boolean).join("\n\n");
}

function renderBulletList(items) {
  return items.filter(Boolean).map((item) => String(item).startsWith("- ") ? String(item) : `- ${item}`).join("\n");
}

function renderLabeledSection(title, items) {
  const rendered = items.filter(Boolean);
  return rendered.length ? `## ${escapeMarkdownText(title)}\n\n${renderBulletList(rendered)}` : "";
}

function renderKeyValue(label, value) {
  const text = usefulValue(value);
  return text ? `- **${escapeMarkdownText(label)}:** ${escapeMarkdownText(text)}` : "";
}

function renderLinkList(entries, siteUrl, basePath = "/") {
  const seen = new Set();
  return entries
    .map(({ label, href }) => {
      const url = absoluteUrl(siteUrl, href, basePath);
      if (!url || seen.has(url)) return "";
      seen.add(url);
      return `- ${markdownLink(label, url, siteUrl, basePath)}`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildStaticPageMetadata({ routePath, siteUrl, manifestEntry = {} }) {
  const canonicalPath = routePath === "/" ? "/" : String(routePath || "").replace(/\/+$/, "");
  return {
    canonicalUrl: buildAbsoluteUrl(siteUrl, canonicalPath || "/"),
    description: normalizeText(manifestEntry.description),
    imageUrl: buildAbsoluteUrl(siteUrl, "/echo-wordmark1.png"),
    title: normalizeText(manifestEntry.title) || "The Echo Archives",
  };
}

function renderConditionals(source, archivistEnabled = false) {
  let rendered = String(source || "");
  for (let pass = 0; pass < 4; pass += 1) {
    const next = rendered.replace(/\{\{#archivist\}\}([\s\S]*?)\{\{\/archivist\}\}/g, (_match, content) => archivistEnabled ? content : "");
    if (next === rendered) break;
    rendered = next;
  }
  return rendered.replace(/\{\{[^}]+\}\}/g, "");
}

function tagName(node) {
  return String(node?.name || "").toLowerCase();
}

function childNodes(node) {
  return Array.isArray(node?.children) ? node.children : [];
}

function renderInline(node, $, siteUrl, basePath) {
  if (!node) return "";
  if (node.type === "text") return escapeMarkdownText(node.data || "");
  if (node.type === "comment") return "";

  const tag = tagName(node);
  if (["img", "picture", "source", "svg", "script", "style", "noscript"].includes(tag)) return "";
  if (tag === "br") return "  \n";
  if (tag === "a") {
    const label = childNodes(node).map((child) => renderInline(child, $, siteUrl, basePath)).join("").trim();
    return markdownLink(label || $(node).text(), $(node).attr("href"), siteUrl, basePath);
  }
  if (tag === "strong" || tag === "b") {
    const text = childNodes(node).map((child) => renderInline(child, $, siteUrl, basePath)).join("").trim();
    return text ? `**${text}**` : "";
  }
  if (tag === "em" || tag === "i") {
    const text = childNodes(node).map((child) => renderInline(child, $, siteUrl, basePath)).join("").trim();
    return text ? `*${text}*` : "";
  }
  if (tag === "code") {
    const text = normalizeText($(node).text()).replace(/`/g, "\\`");
    return text ? `\`${text}\`` : "";
  }
  return childNodes(node).map((child) => renderInline(child, $, siteUrl, basePath)).join("");
}

function renderList(node, $, siteUrl, basePath, depth = 0) {
  const ordered = tagName(node) === "ol";
  const items = childNodes(node).filter((child) => tagName(child) === "li");
  return items.map((item, index) => {
    const prefix = ordered ? `${index + 1}.` : "-";
    const inlineChildren = childNodes(item).filter((child) => !["ul", "ol"].includes(tagName(child)));
    const text = inlineChildren.map((child) => renderInline(child, $, siteUrl, basePath)).join("").trim();
    const nested = childNodes(item)
      .filter((child) => ["ul", "ol"].includes(tagName(child)))
      .map((child) => renderList(child, $, siteUrl, basePath, depth + 1))
      .filter(Boolean)
      .join("\n")
      .split("\n")
      .filter(Boolean)
      .map((line) => `${"  ".repeat(depth + 1)}${line}`)
      .join("\n");
    return [`${"  ".repeat(depth)}${prefix} ${text}`, nested].filter(Boolean).join("\n");
  }).join("\n");
}

function renderTable(node, $, siteUrl, basePath) {
  const rows = $(node).find("tr").toArray().map((row) => $(row).find("th, td").toArray().map((cell) => {
    const content = renderInlineChildren(cell, $, siteUrl, basePath).replace(/\s*\n\s*/g, " ").trim();
    return escapeMarkdownTableCell(content);
  })).filter((row) => row.length > 0);
  if (rows.length === 0) return "";

  const width = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
  const header = normalizedRows[0];
  const separator = header.map(() => "---");
  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...normalizedRows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderInlineChildren(node, $, siteUrl, basePath) {
  return childNodes(node).map((child) => renderInline(child, $, siteUrl, basePath)).join("");
}

function renderDefinitionList(node, $, siteUrl, basePath) {
  const terms = childNodes(node).filter((child) => ["dt", "dd"].includes(tagName(child)));
  const lines = [];
  for (let index = 0; index < terms.length; index += 1) {
    if (tagName(terms[index]) !== "dt") continue;
    const term = renderInlineChildren(terms[index], $, siteUrl, basePath).trim();
    const definitionNode = terms[index + 1];
    const definition = tagName(definitionNode) === "dd" ? renderInlineChildren(definitionNode, $, siteUrl, basePath).trim() : "";
    if (term && definition) lines.push(`- **${term}:** ${definition}`);
  }
  return lines.join("\n");
}

function renderBlock(node, $, siteUrl, basePath) {
  if (!node) return "";
  if (node.type === "text") return escapeMarkdownText(node.data || "");
  if (node.type === "comment") return "";

  const tag = tagName(node);
  if (["script", "style", "noscript", "svg", "picture", "source", "img", "nav", "form", "button", "input", "select", "textarea", "footer"].includes(tag)) return "";
  if (/^(h[1-6])$/.test(tag)) {
    const level = Number(tag.slice(1));
    const text = renderInlineChildren(node, $, siteUrl, basePath).trim();
    return text ? `${"#".repeat(level)} ${text}` : "";
  }
  if (tag === "p") {
    return renderInlineChildren(node, $, siteUrl, basePath).trim();
  }
  if (tag === "ul" || tag === "ol") return renderList(node, $, siteUrl, basePath).trim();
  if (tag === "blockquote") {
    const text = renderInlineChildren(node, $, siteUrl, basePath).trim();
    return text ? text.split("\n").map((line) => `> ${line}`).join("\n") : "";
  }
  if (tag === "table") return renderTable(node, $, siteUrl, basePath);
  if (tag === "dl") return renderDefinitionList(node, $, siteUrl, basePath);
  if (tag === "hr") return "---";
  if (tag === "details") {
    const summary = childNodes(node).find((child) => tagName(child) === "summary");
    const summaryText = summary ? renderInlineChildren(summary, $, siteUrl, basePath).trim() : "Details";
    const body = childNodes(node)
      .filter((child) => child !== summary)
      .map((child) => renderBlock(child, $, siteUrl, basePath))
      .filter(Boolean)
      .join("\n\n");
    return [`### ${summaryText}`, body].filter(Boolean).join("\n\n");
  }

  const blocks = childNodes(node)
    .map((child) => renderBlock(child, $, siteUrl, basePath))
    .filter(Boolean)
    .join("\n\n");
  if (blocks) return blocks;
  return renderInlineChildren(node, $, siteUrl, basePath).trim();
}

function renderStaticPageMarkdown({ sourceHtml, metadata, siteUrl, routePath, dynamicValues = {}, archivistEnabled = false }) {
  const source = renderConditionals(sourceHtml, archivistEnabled);
  const $ = cheerio.load(source, { decodeEntities: true }, false);
  const main = $("main").first();
  if (main.length === 0) return renderDocument(metadata, []);

  Object.entries(dynamicValues).forEach(([id, value]) => {
    $(`#${id}`).text(String(value ?? ""));
  });
  main.find("script, style, noscript, svg, picture, source, img, nav, form, button, input, select, textarea, footer, [aria-hidden=\"true\"], [hidden], [data-copy-link-status]").remove();
  main.find("a[data-history-back], a.about-cta, a.creator-action-link").remove();

  const sections = childNodes(main[0])
    .map((node) => renderBlock(node, $, siteUrl, routePath || "/"))
    .map((section) => section.replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean);
  return renderDocument(metadata, sections);
}

function getStaticPageValues(fileName, { shows = [], collections = [] } = {}) {
  const publishedShows = Array.isArray(shows) ? shows.filter((show) => show.status === "published") : [];
  const archiveStats = getArchiveStats(publishedShows, collections);
  const values = {
    aboutCollectionCount: archiveStats.collectionCount,
    aboutLastUpdated: formatDate(archiveStats.latestUpdatedAt, { fallback: "Unknown" }),
    aboutReviewCount: archiveStats.fullReviewCount,
    aboutShowCount: archiveStats.showCount,
    creatorsCreatorCount: archiveStats.creatorCount,
    creatorsLastUpdated: formatDate(archiveStats.latestUpdatedAt, { fallback: "Unknown" }),
    creatorsMetadataCount: archiveStats.metadataCheckedCount,
    creatorsReviewCount: archiveStats.fullReviewCount,
    creatorsShowCount: archiveStats.showCount,
  };
  return Object.fromEntries(Object.entries(values).filter(([id]) => fileName === "about.html" ? id.startsWith("about") : fileName === "for-creators.html" ? id.startsWith("creators") : false));
}

function renderShowEntities(show, siteUrl) {
  const grouped = new Map();
  const add = (role, value, href = "") => {
    const text = normalizeText(value);
    if (!text || isSuppressedValue(text)) return;
    const entry = href ? markdownLink(text, href, siteUrl, buildShowPath(show.id)) : escapeMarkdownText(text);
    const current = grouped.get(role) || [];
    if (!current.some((candidate) => candidate.toLocaleLowerCase() === text.toLocaleLowerCase())) current.push(entry);
    grouped.set(role, current);
  };

  (Array.isArray(show.resolvedEntities) ? show.resolvedEntities : []).forEach((entity) => {
    add(ROLE_LABELS[entity.role] || toLabel(entity.role) || "Entity", entity.name, entityPath(entity.id));
  });

  const hasRole = (role) => grouped.has(role);
  if (!hasRole("Created by")) asList(show.creators, { splitPipes: true }).forEach((value) => add("Created by", value));
  if (!hasRole("Created by")) asList(show.credits?.creatorName, { splitPipes: true }).forEach((value) => add("Created by", value));
  if (!hasRole("Produced by")) asList(show.credits?.productionCompany, { splitPipes: true }).forEach((value) => add("Produced by", value));
  if (!hasRole("Network")) asList(show.credits?.network, { splitPipes: true }).forEach((value) => add("Network", value));

  return [...grouped.entries()].flatMap(([role, values]) => values.length ? [`- **${escapeMarkdownText(role)}:** ${values.join(" · ")}`] : []);
}

function renderShowFacts(show) {
  const facts = [];
  const seasonsEpisodes = [
    typeof show.length?.seasons === "number" && show.length.seasons > 0 ? `${show.length.seasons} ${show.length.seasons === 1 ? "season" : "seasons"}` : "",
    typeof show.length?.episodes === "number" && show.length.episodes > 0 ? `${show.length.episodes} ${show.length.episodes === 1 ? "episode" : "episodes"}` : "",
  ].filter(Boolean).join("; ");
  const content = show.content || {};
  const rawFacts = show.facts || {};
  const availability = show.availability || {};

  facts.push(renderKeyValue("Status", archiveRecord.derivePublicStatus(show)));
  facts.push(renderKeyValue("Runtime", getHeroRuntimeValue(show)));
  facts.push(renderKeyValue("Seasons and episodes", seasonsEpisodes));
  facts.push(renderKeyValue("First release", show.releaseDates?.first ? formatDate(show.releaseDates.first) : ""));
  facts.push(renderKeyValue("Latest release", show.releaseDates?.latest ? formatDate(show.releaseDates.latest) : ""));
  facts.push(renderKeyValue("Release cadence", show.metadata?.schedule?.label));
  facts.push(renderKeyValue("Source material", content.sourceMaterial));
  facts.push(renderKeyValue("Setting", content.setting));
  facts.push(renderKeyValue("Point of view", content.pov));
  facts.push(renderKeyValue("Intensity", content.intensity));
  facts.push(renderKeyValue("Structure", rawFacts.structure));
  facts.push(renderKeyValue("Narrator", rawFacts.narrator));
  facts.push(renderKeyValue("Ads", rawFacts.ads));
  facts.push(renderKeyValue("Transcripts", availability.transcripts));
  facts.push(renderKeyValue("Transcript languages", asList(availability.transcriptLanguages).join(", ")));
  facts.push(renderKeyValue("Region notes", availability.regionNotes));
  return facts.filter(Boolean);
}

function renderShowLinks(show, siteUrl) {
  const entries = [];
  ["start", "website", "apple", "spotify", "rss"].forEach((key) => {
    if (show.listenLinks?.[key]) entries.push({ href: show.listenLinks[key], label: LINK_LABELS[key] || toLabel(key) });
  });
  ["website", "patreon", "discord", "youtube", "merch", "instagram", "facebook"].forEach((key) => {
    if (show.officialLinks?.[key]) entries.push({ href: show.officialLinks[key], label: `Official ${LINK_LABELS[key] || toLabel(key)}` });
  });
  return renderLinkList(entries, siteUrl, buildShowPath(show.id));
}

function renderShowReviews(show, reviewData = {}) {
  const sections = [];
  const hasArchive = hasArchiveReviewContent(show);
  if (hasArchive) {
    const archiveParts = [];
    if (usefulValue(show.archiveTake)) archiveParts.push(`### Archive verdict\n\n${escapeMarkdownText(show.archiveTake)}`);
    const reviewParagraphs = asList(show.spoilerFreeReviewParagraphs || show.spoilerFreeReview);
    if (reviewParagraphs.length) archiveParts.push(`### Review notes\n\n${renderParagraphs(reviewParagraphs)}`);
    const thoughts = asList(show.thoughtsParagraphs || show.thoughts);
    if (thoughts.length) archiveParts.push(`### Archive thoughts\n\n${renderParagraphs(thoughts)}`);
    if (usefulValue(show.quote?.text)) {
      const attribution = usefulValue(show.quote?.attribution);
      archiveParts.push(`> ${escapeMarkdownText(show.quote.text)}${attribution ? `\n> — ${escapeMarkdownText(attribution)}` : ""}`);
    }
    sections.push(["## Archive review", archiveParts.join("\n\n")].join("\n\n"));
  }

  const listenerScore = getListenerReviewScore(reviewData.listenerReviewScore);
  const reviewPage = reviewData && typeof reviewData === "object" ? reviewData : {};
  const totalReviews = Number(reviewPage.pagination?.totalReviews || 0);
  const reviews = Array.isArray(reviewPage.reviews) ? reviewPage.reviews : [];
  const scoreSummary = Object.entries(reviewPage.scoreSummary || {})
    .filter(([, summary]) => summary?.isPublic && Number.isFinite(Number(summary.averageRating)))
    .map(([key, summary]) => `- **${escapeMarkdownText(CATEGORY_LABELS[key] || toLabel(key))}:** ${formatRating(summary.averageRating)} from ${formatNumber(summary.ratingCount)} ratings`);
  const listenerParts = [];
  if (listenerScore.hasScore) listenerParts.push(`Listener Review Score: **${escapeMarkdownText(listenerScore.value)}** from ${escapeMarkdownText(listenerScore.note.replace(/^from\s+/i, ""))}.`);
  if (scoreSummary.length) listenerParts.push(`Category averages:\n${scoreSummary.join("\n")}`);
  reviews.forEach((review) => {
    const title = normalizeText(review.title) || "Listener review";
    const byline = [normalizeText(review.authorName) || "Anonymous listener", review.publishedAt ? formatDate(review.publishedAt) : ""].filter(Boolean).join(" · ");
    const reviewParts = [`### ${escapeMarkdownText(title)}`, `_${escapeMarkdownText(byline)}_`, `${formatRating(review.ratingStars, 5)}`, escapeMarkdownText(review.body)];
    if (usefulValue(review.spoilerLevel) && review.spoilerLevel !== "spoiler-free") reviewParts.push(`Spoiler level: ${escapeMarkdownText(toLabel(review.spoilerLevel))}`);
    const context = [
      asList(review.bestFor).length ? `Best for: ${displayList(review.bestFor).join(" · ")}` : "",
      asList(review.workedBest).length ? `Worked best: ${displayList(review.workedBest).join(" · ")}` : "",
    ].filter(Boolean);
    if (context.length) reviewParts.push(context.map(escapeMarkdownText).join("\n"));
    listenerParts.push(reviewParts.join("\n\n"));
  });
  if (totalReviews > reviews.length) listenerParts.push(`Showing ${reviews.length} of ${totalReviews} published listener reviews.`);
  if (listenerParts.length) sections.push(["## Listener reviews", listenerParts.join("\n\n")].join("\n\n"));
  return sections;
}

function renderShowMarkdown({ show, collections = [], shows = [], siteUrl, reviewData = {}, communitySummary = {}, similarityIndex = null }) {
  const metadata = buildShowPageMetadata({ siteUrl, show });
  const sections = [`# ${escapeMarkdownText(show.title)}`];
  if (usefulValue(show.subtitle)) sections.push(escapeMarkdownText(show.subtitle));

  const overview = [];
  const archiveRating = Number(show.finalRating);
  if (Number.isFinite(archiveRating) && archiveRating >= 0 && archiveRating <= 10) overview.push(`- **Archive Rating (editorial):** ${formatRating(archiveRating)}`);
  const listenerScore = getListenerReviewScore(reviewData.listenerReviewScore);
  if (listenerScore.hasScore) overview.push(`- **Listener Review Score:** ${escapeMarkdownText(listenerScore.value)} (${escapeMarkdownText(listenerScore.note)})`);
  const communityRating = Number(communitySummary.averageRating);
  const communityCount = Number(communitySummary.ratingCount);
  const minimumCommunityCount = Number(communitySummary.minimumRatingCount || 0);
  if (Number.isFinite(communityRating) && communityCount > 0 && communityCount >= minimumCommunityCount) overview.push(`- **Community Rating (listener response):** ${formatRating(communityRating)} from ${formatNumber(communityCount)} ratings`);
  const verificationLabel = archiveRecord.getPublicVerificationLabel(show.verification);
  if (verificationLabel) overview.push(`- **${escapeMarkdownText(verificationLabel)}:** Factual metadata only; this does not imply approval of ratings or reviews.`);
  overview.push(renderKeyValue("Status", archiveRecord.derivePublicStatus(show)));
  overview.push(renderKeyValue("Review coverage", archiveRecord.getReviewStatusLabel(show.reviewStatus)));
  overview.push(renderKeyValue("Runtime", getHeroRuntimeValue(show)));
  if (overview.filter(Boolean).length) sections.push(["## At a glance", overview.filter(Boolean).join("\n")].join("\n\n"));

  const summary = getSummaryDescriptor(show);
  if (summary) {
    const sourceNote = summary.sourceUrl ? `\n\nSource: ${markdownLink(summary.sourceLabel || "Official source", summary.sourceUrl, siteUrl, buildShowPath(show.id))}` : "";
    sections.push([`## ${escapeMarkdownText(summary.title)}`, escapeMarkdownText(summary.text), sourceNote].filter(Boolean).join("\n\n"));
  }

  const entities = renderShowEntities(show, siteUrl);
  if (entities.length) sections.push(renderLabeledSection("Creators and entities", entities));

  const taxonomySections = [
    ["Genres", displayList(show.genres)],
    ["Tones", displayList(show.tones)],
    ["Formats", displayList(show.formats)],
    ["Tags", displayList(show.tags, { labels: false })],
    ["Best for", displayList(show.bestFor)],
    ["Themes", displayList(show.themes)],
    ["Content notes", displayList(show.contentNotes, { labels: false })],
  ];
  taxonomySections.forEach(([title, values]) => {
    if (values.length) sections.push(renderLabeledSection(title, values.map(escapeMarkdownText)));
  });

  const facts = renderShowFacts(show);
  if (facts.length) sections.push(renderLabeledSection("Facts and availability", facts));

  sections.push(...renderShowReviews(show, reviewData));

  const showMap = new Map((Array.isArray(shows) ? shows : []).map((entry) => [entry.id, entry]));
  const similar = getSimilarShowGroups(show, showMap, collections, similarityIndex);
  const similarItems = [];
  if (similar.authoredNeighbors.length) {
    similarItems.push(`### Curated by the archive\n\n${renderBulletList(similar.authoredNeighbors.map(({ neighbor, reason }) => `${markdownLink(neighbor.title, buildShowPath(neighbor.id), siteUrl)} — ${escapeMarkdownText(reason)}`))}`);
  }
  if (similar.computedNeighbors.length) {
    similarItems.push(`### Computed archive matches\n\n${renderBulletList(similar.computedNeighbors.map(({ neighbor, reason }) => `${markdownLink(neighbor.title, buildShowPath(neighbor.id), siteUrl)} — ${escapeMarkdownText(reason)}`))}`);
  }
  if (similarItems.length) sections.push(["## Similar shows", "Curated relationships and computed matches are separate signals.", similarItems.join("\n\n")].join("\n\n"));

  const memberships = getCollectionMemberships(show, collections).map((collection) => {
    const reason = usefulValue(collection.showReasons?.[show.id]) || "Collection in the archive.";
    return `${markdownLink(collection.title, buildCollectionPath(collection.id), siteUrl)} — ${escapeMarkdownText(reason)}`;
  });
  if (memberships.length) sections.push(renderLabeledSection("Collections", memberships.map((item) => `- ${item}`)));

  const moreFrom = selectMoreFrom(show, shows);
  if (moreFrom) {
    const items = moreFrom.shows.slice(0, 8).map((entry) => markdownLink(entry.title, buildShowPath(entry.id), siteUrl));
    if (items.length) sections.push([`## More from ${escapeMarkdownText(moreFrom.entity.name)}`, `Browse the [${escapeMarkdownText(moreFrom.entity.name)} creator page](<${absoluteUrl(siteUrl, entityPath(moreFrom.entity.id))}>).`, renderBulletList(items)].join("\n\n"));
  }

  if (show.cast?.length || show.credits?.cast?.length) {
    sections.push(renderLabeledSection("Cast", displayList(show.cast?.length ? show.cast : show.credits.cast, { labels: false }).map(escapeMarkdownText)));
  }

  const links = renderShowLinks(show, siteUrl);
  if (links) sections.push(`## Official and listening links\n\n${links}`);
  sections.push(`Canonical page: ${markdownLink(metadata.canonicalUrl, metadata.canonicalUrl, siteUrl)}`);
  return renderDocument(metadata, sections);
}

function renderMissingMarkdown({ title, description, siteUrl, routePath }) {
  const metadata = {
    canonicalUrl: "",
    description,
    imageUrl: buildAbsoluteUrl(siteUrl, "/echo-wordmark1.png"),
    title,
  };
  return renderDocument(metadata, [
    `# ${escapeMarkdownText(title)}`,
    escapeMarkdownText(description),
    `Browse the [archive](<${absoluteUrl(siteUrl, "/", routePath || "/")}>) for published shows and collections.`,
  ]);
}

function renderCollectionMarkdown({ collection, collectionShows = [], anchorShow = null, collections = [], siteUrl, recommendationView = null }) {
  const metadata = buildCollectionPageMetadata({ siteUrl, collection, collectionShows, anchorShow });
  const sections = [`# ${escapeMarkdownText(collection.title)}`, escapeMarkdownText(collection.description)];
  const detail = [
    renderKeyValue("Collection type", collection.kind === "similarity" ? "Similar shows" : "Curated collection"),
    renderKeyValue("Commitment", collection.commitment),
    renderKeyValue("Label", collection.label),
    renderKeyValue("Shows", collectionShows.length),
    renderKeyValue("Updated", collection.updatedAt ? formatDate(collection.updatedAt) : ""),
  ].filter(Boolean);
  if (anchorShow) detail.push(`- **Anchor show:** ${markdownLink(anchorShow.title, buildShowPath(anchorShow.id), siteUrl)}`);
  if (detail.length) sections.push(["## Collection details", detail.join("\n")].join("\n\n"));
  if (displayList(collection.intentTags).length) sections.push(renderLabeledSection("Intent and mood", displayList(collection.intentTags).map(escapeMarkdownText)));

  const showReasons = collection.showReasons || {};
  const recommendationSections = Array.isArray(recommendationView?.sections) && recommendationView.sections.length
    ? recommendationView.sections
    : [{ id: "all", label: "Shows in this collection", recommendations: collectionShows.map((show) => ({ show, reason: showReasons[show.id], source: "authored" })) }];
  recommendationSections.forEach((recommendationSection) => {
    const showItems = recommendationSection.recommendations.map((recommendation) => {
      const show = recommendation.show;
      const detailParts = [
        markdownLink(show.title, buildShowPath(show.id), siteUrl),
        usefulValue(recommendation.reason) ? escapeMarkdownText(recommendation.reason) : "",
        Number.isFinite(Number(show.finalRating)) ? `Archive Rating ${formatRating(show.finalRating)}` : "",
      ].filter(Boolean);
      return detailParts.length > 1 ? `${detailParts[0]} — ${detailParts.slice(1).join(" · ")}` : detailParts[0];
    });
    if (showItems.length) sections.push(renderLabeledSection(recommendationSection.label, showItems));
  });

  const related = getRelatedCollections(collection, collections).map((candidate) => markdownLink(candidate.title, buildCollectionPath(candidate.id), siteUrl));
  if (related.length) sections.push(renderLabeledSection("Related collections", related));
  sections.push(`Canonical page: ${markdownLink(metadata.canonicalUrl, metadata.canonicalUrl, siteUrl)}`);
  return renderDocument(metadata, sections);
}

function renderEntityMarkdown({ entity, entities = [], shows = [], collections = [], siteUrl }) {
  const metadata = buildEntityPageData({ entity, entities, shows, collections, siteUrl }).metadata;
  const profile = getEntityPageProfile(entity, shows, collections);
  const sections = [`# ${escapeMarkdownText(entity.name)}`];
  const typeLabel = TYPE_LABELS[entity.type] || "Creator";
  sections.push(`**${escapeMarkdownText(typeLabel)}**`);
  if (usefulValue(entity.description)) sections.push(escapeMarkdownText(entity.description));
  const details = [
    renderKeyValue("Shows in archive", profile.catalogue.length),
    renderKeyValue("Reviewed", entity.reviewedAt ? formatDate(entity.reviewedAt) : ""),
    entity.website ? `- **Official website:** ${markdownLink(entity.website, entity.website, siteUrl)}` : "",
    entity.aliases?.length ? `- **Also indexed as:** ${displayList(entity.aliases, { labels: false }).map(escapeMarkdownText).join(" · ")}` : "",
  ].filter(Boolean);
  if (details.length) sections.push(["## Entity details", details.join("\n")].join("\n\n"));

  const taxonomy = [
    profile.genres.length ? `- **Genres represented:** ${displayList(profile.genres).map(escapeMarkdownText).join(" · ")}` : "",
    profile.tags.length ? `- **Tags represented:** ${displayList(profile.tags, { labels: false }).map(escapeMarkdownText).join(" · ")}` : "",
    profile.statuses.length ? `- **Statuses:** ${profile.statuses.map(escapeMarkdownText).join(" · ")}` : "",
  ].filter(Boolean);
  if (taxonomy.length) sections.push(["## Catalogue signals", taxonomy.join("\n")].join("\n\n"));

  const catalogueItems = profile.catalogue.map((show) => {
    const roles = getEntityShowRoles(entity, show).map(escapeMarkdownText).join(" · ");
    const metadataParts = [roles, displayList(show.genres).slice(0, 2).map(escapeMarkdownText).join(" · "), Number.isFinite(Number(show.finalRating)) ? `Archive Rating ${formatRating(show.finalRating)}` : ""].filter(Boolean);
    return `${markdownLink(show.title, buildShowPath(show.id), siteUrl)}${metadataParts.length ? ` — ${metadataParts.join(" · ")}` : ""}`;
  });
  if (catalogueItems.length) sections.push(renderLabeledSection("Connected shows", catalogueItems));

  const relatedCollections = profile.linkedCollections.slice(0, 8).map(({ collection, count }) => `${markdownLink(collection.title, buildCollectionPath(collection.id), siteUrl)} — ${formatNumber(count)} connected ${count === 1 ? "show" : "shows"}`);
  if (relatedCollections.length) sections.push(renderLabeledSection("Collections with these shows", relatedCollections));

  const sources = asList(entity.sources).map((source) => ({ href: source, label: source }));
  const sourceLinks = renderLinkList(sources, siteUrl, entityPath(entity.id));
  if (sourceLinks) sections.push(`## Source links\n\n${sourceLinks}`);
  sections.push(`Canonical page: ${markdownLink(metadata.canonicalUrl, metadata.canonicalUrl, siteUrl)}`);
  return renderDocument(metadata, sections);
}

function getDirectoryEntities({ entities = [], shows = [], query = "", entityType = "all", sort = "name" }) {
  const directoryEntities = getPublicDirectoryEntities(entities, shows).sort((left, right) => left.name.localeCompare(right.name, "en"));
  const catalogues = new Map(directoryEntities.map((entity) => [entity.id, orderedShows(entity, shows)]));
  const activeType = normalizeDirectoryFilter(entityType);
  const activeSort = normalizeDirectorySort(sort);
  return sortDirectoryEntities(directoryEntities, catalogues, activeSort).filter((entity) => (activeType === "all" || entity.type === activeType) && (!query || matchesEntityQuery(entity, query)));
}

function renderEntityDirectoryMarkdown({ entities = [], shows = [], collections = [], siteUrl, query = "", entityType = "all", sort = "name" }) {
  const metadata = buildEntityPageData({ entity: null, entities, shows, collections, siteUrl }).metadata;
  const visible = getDirectoryEntities({ entities, shows, query, entityType, sort });
  const publicEntities = getPublicDirectoryEntities(entities, shows);
  const connectedShowCount = shows.filter((show) => show.status === "published" && (show.entityLinks || []).some((link) => publicEntities.some((entity) => entity.id === link.entityId))).length;
  const sections = [
    "# Production companies, studios and networks",
    "Trace a favorite show back to the production companies, studios, and networks behind it. Individual creators remain linked from their shows.",
    ["## Directory snapshot", `- **Creator organizations:** ${formatNumber(publicEntities.length)}`, `- **Connected published shows:** ${formatNumber(connectedShowCount)}`, `- **Visible results:** ${formatNumber(visible.length)}`].join("\n"),
  ];
  if (query || normalizeDirectoryFilter(entityType) !== "all" || normalizeDirectorySort(sort) !== "name") {
    sections.push(`Filter state: ${[query ? `search ${escapeMarkdownText(query)}` : "", entityType && normalizeDirectoryFilter(entityType) !== "all" ? toLabel(entityType) : "", sort && normalizeDirectorySort(sort) !== "name" ? toLabel(sort) : ""].filter(Boolean).join(" · ")}.`);
  }
  const items = visible.map((entity) => {
    const count = getEntityShows(entity.id, shows).length;
    const website = entity.website ? ` · ${markdownLink("website", entity.website, siteUrl)}` : "";
    return `${markdownLink(entity.name, entityPath(entity.id), siteUrl)} — ${escapeMarkdownText(TYPE_LABELS[entity.type] || "Creator")}; ${formatNumber(count)} ${count === 1 ? "show" : "shows"}${website}`;
  });
  if (items.length) sections.push(renderLabeledSection("Organizations", items));
  else sections.push("No creator organizations matched this directory state.");
  sections.push(`Canonical page: ${markdownLink(metadata.canonicalUrl, metadata.canonicalUrl, siteUrl)}`);
  return renderDocument(metadata, sections);
}

function collectionMatches(collection, collectionShows, query, intent) {
  if (intent && !asList(collection.intentTags).includes(intent)) return false;
  if (!query) return true;
  const searchText = [
    collection.title,
    collection.description,
    collection.label,
    collection.commitment,
    collection.kind,
    ...asList(collection.intentTags),
    ...collectionShows.flatMap((show) => [show.title, ...asList(show.genres), ...asList(show.tones), ...asList(show.tags)]),
  ].join(" ").toLocaleLowerCase();
  return searchText.includes(query.toLocaleLowerCase());
}

function renderCollectionDirectoryMarkdown({ collections = [], shows = [], siteUrl, query = "", intent = "", metadata: providedMetadata = null }) {
  const metadata = providedMetadata || buildStaticPageMetadata({
    manifestEntry: {
      description: "Find audio dramas and fiction podcasts by mood, genre, listening time, completion status, and similar shows.",
      title: "Audio Drama & Fiction Podcast Collections | The Echo Archives",
    },
    routePath: "/collections",
    siteUrl,
  });
  const showMap = new Map(shows.filter((show) => show.status === "published").map((show) => [show.id, show]));
  const visible = collections.filter((collection) => collectionMatches(collection, getCollectionShows(collection, showMap), normalizeText(query), normalizeText(intent)));
  const sections = [
    "# Audio drama and fiction podcast collections",
    escapeMarkdownText(metadata.description),
    ["## Directory snapshot", `- **Collections:** ${formatNumber(collections.length)}`, `- **Visible results:** ${formatNumber(visible.length)}`].join("\n"),
  ];
  if (query || intent) sections.push(`Filter state: ${[query ? `search ${escapeMarkdownText(query)}` : "", intent ? toLabel(intent) : ""].filter(Boolean).join(" · ")}.`);
  const items = visible.map((collection) => {
    const collectionShows = getCollectionShows(collection, showMap);
    const tags = displayList(collection.intentTags).slice(0, 4);
    return `${markdownLink(collection.title, buildCollectionPath(collection.id), siteUrl)} — ${escapeMarkdownText(collection.description)} (${formatNumber(collectionShows.length)} ${collectionShows.length === 1 ? "show" : "shows"}${tags.length ? `; ${tags.map(escapeMarkdownText).join(", ")}` : ""})`;
  });
  if (items.length) sections.push(renderLabeledSection("Collections", items));
  else sections.push("No collections matched this directory state.");
  sections.push(`Canonical page: ${markdownLink(metadata.canonicalUrl, metadata.canonicalUrl, siteUrl)}`);
  return renderDocument(metadata, sections);
}

function renderHomeMarkdown({ shows = [], collections = [], siteUrl, metadata: providedMetadata = {} }) {
  const publishedShows = shows.filter((show) => show.status === "published");
  const metadata = {
    ...providedMetadata,
    canonicalUrl: providedMetadata.canonicalUrl || buildAbsoluteUrl(siteUrl, "/"),
    imageUrl: providedMetadata.imageUrl || buildAbsoluteUrl(siteUrl, "/echo-wordmark1.png"),
  };
  const stats = getArchiveStats(publishedShows, collections);
  const showMap = new Map(publishedShows.map((show) => [show.id, show]));
  const featuredCollections = collections.filter((collection) => collection.featured);
  const recentShows = [...publishedShows]
    .filter((show) => archiveRecord.getCatalogPublicationDate(show) || show.updatedAt)
    .sort(compareRecentlyAdded)
    .slice(0, 20);
  const ratedShows = [...publishedShows]
    .filter((show) => Number.isFinite(Number(show.finalRating)))
    .sort((left, right) => Number(right.finalRating) - Number(left.finalRating) || left.title.localeCompare(right.title, "en"))
    .slice(0, 20);
  const sections = [
    "# The Echo Archives",
    "A curated discovery archive for audio dramas and fiction podcasts. Browse by mood, tone, sound, format, and the time you have.",
    ["## Archive snapshot", `- **Published shows:** ${formatNumber(stats.showCount)}`, `- **Full archive reviews:** ${formatNumber(stats.fullReviewCount)}`, `- **Collections:** ${formatNumber(stats.collectionCount)}`, `- **Latest update:** ${escapeMarkdownText(formatDate(stats.latestUpdatedAt, { fallback: "Unknown" }))}`].join("\n"),
  ];
  const collectionItems = featuredCollections.map((collection) => {
    const count = getCollectionShows(collection, showMap).length;
    return `${markdownLink(collection.title, buildCollectionPath(collection.id), siteUrl)} — ${escapeMarkdownText(collection.description)} (${formatNumber(count)} ${count === 1 ? "show" : "shows"})`;
  });
  if (collectionItems.length) sections.push(renderLabeledSection("Featured collection routes", collectionItems));
  if (ratedShows.length) sections.push(renderLabeledSection("Highest archive ratings", ratedShows.map((show) => `${markdownLink(show.title, buildShowPath(show.id), siteUrl)} — ${formatRating(show.finalRating)}${usefulValue(show.subtitle) ? `; ${escapeMarkdownText(show.subtitle)}` : ""}`)));
  if (recentShows.length) sections.push(renderLabeledSection("Recently added or updated", recentShows.map((show) => `${markdownLink(show.title, buildShowPath(show.id), siteUrl)} — ${escapeMarkdownText(show.subtitle || show.description || "Show record in the archive.")}`)));
  sections.push(["## More ways to browse", renderBulletList([
    `${markdownLink("Browse all shows", "/#archive", siteUrl)}`,
    `${markdownLink("Browse all collections", "/collections", siteUrl)}`,
    `${markdownLink("Browse creators and production companies", "/creators", siteUrl)}`,
    `${markdownLink("Learn how the archive works", "/about", siteUrl)}`,
  ])].join("\n\n"));
  sections.push(`Canonical page: ${markdownLink(metadata.canonicalUrl, metadata.canonicalUrl, siteUrl)}`);
  return renderDocument(metadata, sections);
}

module.exports = {
  STATIC_MARKDOWN_FILES,
  buildStaticPageMetadata,
  getStaticPageValues,
  renderCollectionDirectoryMarkdown,
  renderCollectionMarkdown,
  renderConditionals,
  renderEntityDirectoryMarkdown,
  renderEntityMarkdown,
  renderHomeMarkdown,
  renderMissingMarkdown,
  renderShowMarkdown,
  renderStaticPageMarkdown,
};
