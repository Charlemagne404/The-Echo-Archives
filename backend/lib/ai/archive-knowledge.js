const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");
const { normalizeText } = require("../../../shared/archive-search");
const { findTitleMentions } = require("./chat-query");
const { buildRecommendationCard } = require("./chat");

// Only public, authored pages belong in the assistant's site index. In particular,
// maintainer pages, generated templates, and drafts must never become chat context.
const PUBLIC_PAGES = [
  "index", "about", "help-center", "for-creators", "creator-standards", "submit",
  "privacy", "cookies", "terms", "copyright", "supporters", "creators", "collections",
];
const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "can", "do", "does", "for", "from", "how",
  "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "this", "to",
  "what", "when", "where", "which", "who", "why", "with", "you", "your",
  "site", "archive", "echo", "archives", "page", "show", "shows", "podcast",
  "have", "has", "had", "there", "did", "could", "would", "should", "tell",
  "more", "know", "any", "some", "its", "their", "they", "into",
  "use", "uses", "used", "get", "change", "long", "stay",
  "happen", "happens", "want", "need",
]);

function words(value) {
  const aliases = { images: "art", image: "art", artwork: "art", submissions: "submission", deleted: "delete", deletion: "delete", removals: "removal" };
  return [...new Set(normalizeText(value).split(/\s+/).map((word) => aliases[word] || word).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
}

function containsPhrase(haystack, needle) {
  const normalizedHaystack = ` ${normalizeText(haystack)} `;
  const normalizedNeedle = normalizeText(needle);
  return Boolean(normalizedNeedle) && normalizedHaystack.includes(` ${normalizedNeedle} `);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function loadPublicPageKnowledge(siteRoot) {
  const records = [];
  for (const page of PUBLIC_PAGES) {
    const authoredFile = path.join(siteRoot, "site-src", "pages", `${page}.html`);
    const file = fs.existsSync(authoredFile) ? authoredFile : path.join(siteRoot, `${page}.html`);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, "utf8")
      .replace(/\{\{#archivist\}\}[\s\S]*?\{\{\/archivist\}\}/g, "");
    const $ = cheerio.load(source);
    $("script, style, svg, form, nav, template, [aria-hidden='true']").remove();
    const heading = compact($("h1").first().text()) || page.replace(/-/g, " ");
    $("main h2, main h3").each((_index, element) => {
      const title = compact($(element).text());
      if (!title) return;
      const container = $(element).closest("article, section, details");
      const href = `${page === "index" ? "/" : `/${page}`}#${container.attr("id") || $(element).attr("id") || $(element).find("[id]").first().attr("id") || ""}`.replace(/#$/, "");
      const paragraphs = [...new Set(container.find("p, li")
        .filter((_i, node) => !$(node).parents("li").length)
        .map((_i, node) => compact($(node).text())).get())];
      paragraphs.filter((text) => text.length >= 30).forEach((text) => {
        records.push({ title, pageTitle: heading, text: text.slice(0, 1100), href });
      });
    });
    const introduction = compact($("main h1").first().parent().find("p").first().text());
    if (introduction.length > 30) records.push({ title: heading, pageTitle: heading, text: introduction, href: page === "index" ? "/" : `/${page}` });
  }
  return records;
}

function findPublicPageAnswer(message, records = []) {
  const query = words(message);
  if (query.length < 2) return null;
  const asksSubmissionRetention = /\b(submissions?|corrections?|reviews?)\b.*\b(keep|kept|retention|how long|stay|database|deleted?)\b|\b(how long|retention)\b.*\b(submissions?|corrections?|reviews?)\b/i.test(message);
  const relevantRecords = asksSubmissionRetention
    ? records.filter((record) => record.href === "/privacy#privacy-retention" && /Submission content and contact details/i.test(record.text))
    : /\b(delet(?:e|ed|ion)|eras(?:e|ure)|remove my data|privacy request)\b/i.test(message)
    ? records.filter((record) => record.href === "/privacy#privacy-rights")
    : records;
  const ranked = relevantRecords.map((record) => {
    const titleWords = new Set(words(`${record.title} ${record.pageTitle}`));
    const bodyWords = new Set(words(record.text));
    const titleHits = query.filter((word) => titleWords.has(word)).length;
    const bodyHits = query.filter((word) => bodyWords.has(word)).length;
    return { record, score: titleHits * 3 + bodyHits, hits: new Set(query.filter((word) => titleWords.has(word) || bodyWords.has(word))).size };
  }).filter((item) => item.hits >= (relevantRecords === records ? 2 : 1) && item.score >= (relevantRecords === records ? 2 : 1))
    .sort((a, b) => b.score - a.score || b.hits - a.hits || a.record.href.localeCompare(b.record.href));
  if (!ranked.length) return null;
  const best = ranked[0].record;
  if (relevantRecords === records && words(best.text).filter((word) => query.includes(word)).length < 1) return null;
  const sentences = best.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [best.text];
  const selected = sentences.map((sentence, index) => ({ sentence: compact(sentence), index, overlap: words(sentence).filter((word) => query.includes(word)).length }))
    .sort((a, b) => b.overlap - a.overlap || a.index - b.index)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
  return {
    answer: `${best.pageTitle} — ${best.title}: ${selected.join(" ").slice(0, 580)}`,
    actions: [{ label: `Read ${best.pageTitle}`, href: best.href, external: false }],
    recommendations: [],
    suggestedPrompts: ["How do I submit a correction?", "Where can I browse collections?", "Recommend a finished show"],
    source: "archive-knowledge",
  };
}

function findNamedCollection(message, page, collections) {
  const exact = collections.filter((collection) => containsPhrase(message, collection.title) || containsPhrase(message, collection.id.replace(/-/g, " ")))
    .sort((a, b) => b.title.length - a.title.length)[0];
  if (exact) return exact;
  if (page?.collectionId && /\b(this|that|it|here|current|collection|these)\b/i.test(message)) {
    return collections.find((collection) => collection.id === page.collectionId) || null;
  }
  return null;
}

function resolveConversationContext({ message, page, history = [], catalog, collections, recentRecommendationIds = [] }) {
  if (!/\b(it|this|that|these|those|first|second|third|one|show|collection|here)\b/i.test(message) ||
    findTitleMentions(message, catalog).length || findNamedCollection(message, {}, collections)) return page;
  const assistantMessage = [...history].reverse().find((entry) => entry.role === "assistant")?.content || "";
  if (!assistantMessage) return page;
  const next = { ...page };
  const explicitOrdinal = /\b(first|second|third)\b/i.test(message);
  const asksShowMembership = /\b(?:which|what) collections?\b.*\b(?:it|this|that|show)\b/i.test(message);
  const refersToCollection = !asksShowMembership && /\b(collection|in it|inside it|in that|from it|this route|that route)\b/i.test(message);
  if (refersToCollection && !next.collectionId) {
    next.collectionId = findNamedCollection(assistantMessage, {}, collections)?.id || "";
  }
  if (!refersToCollection && (!next.showId || explicitOrdinal)) {
    const ordinal = /\bthird\b/i.test(message) ? 2 : /\bsecond\b/i.test(message) ? 1 : 0;
    const recommendedId = recentRecommendationIds[ordinal];
    const mentionedId = findTitleMentions(assistantMessage, catalog)[ordinal]?.show.id;
    const candidateId = recommendedId || mentionedId;
    if (catalog.some((show) => show.id === candidateId && show.status === "published")) next.showId = candidateId;
  }
  return next;
}

function collectionAction(collection) {
  return { label: `Open ${collection.title}`, href: `/collections/${encodeURIComponent(collection.id)}`, external: false };
}

function answerCollectionQuestion({ message, page, catalog, collections }) {
  const named = findNamedCollection(message, page, collections);
  const mentionsCollections = /\b(collections?|listening paths?|curated routes?)\b/i.test(message);
  if (!named && !mentionsCollections) return null;
  if (!named && mentionsCollections && /\b(in|include|feature|contain|belong|appear)\b/i.test(message)) {
    const referencedShow = findTitleMentions(message, catalog)[0]?.show ||
      (page?.showId && /\b(it|this|that|show)\b/i.test(message) ? catalog.find((show) => show.id === page.showId) : null);
    if (referencedShow) {
      const memberships = collections.filter((collection) => collection.showIds.includes(referencedShow.id));
      const listed = memberships.slice(0, 5);
      return {
        answer: memberships.length
          ? `${referencedShow.title} appears in ${memberships.length} archive ${memberships.length === 1 ? "collection" : "collections"}: ${listed.map((collection) => collection.title).join(", ")}${memberships.length > listed.length ? ", and more" : ""}.`
          : `${referencedShow.title} is not currently listed in an archive collection.`,
        actions: [{ label: `Open ${referencedShow.title}`, href: referencedShow.href, external: false }, ...listed.map(collectionAction)],
        recommendations: [], suggestedPrompts: [`What is ${referencedShow.title} similar to?`, "Show me a curated collection"], source: "archive-knowledge",
      };
    }
  }
  const showsById = new Map(catalog.map((show) => [show.id, show]));
  if (named) {
    const members = named.showIds.map((id) => showsById.get(id)).filter((show) => show?.status === "published");
    const referencedShow = catalog.find((show) => containsPhrase(message, show.title) && !containsPhrase(named.title, show.title));
    const asksMembership = /\b(in|included|include|part of|member|belongs?)\b/i.test(message) && Boolean(referencedShow);
    if (asksMembership) {
      const included = members.some((show) => show.id === referencedShow.id);
      return {
        answer: `${referencedShow.title} is ${included ? "in" : "not listed in"} ${named.title}${included && named.showReasons?.[referencedShow.id] ? `. ${named.showReasons[referencedShow.id]}` : "."}`,
        actions: [collectionAction(named), { label: `Open ${referencedShow.title}`, href: referencedShow.href, external: false }],
        recommendations: [], suggestedPrompts: [`What is ${named.title} for?`, `Recommend a show from ${named.title}`], source: "archive-knowledge",
      };
    }
    const wantsMembers = /\b(which|what|list|contains?|includes?|inside|from|recommend|pick|start)\b/i.test(message);
    const status = /\b(finished|completed)\b/i.test(message) ? "finished" : /\bongoing\b/i.test(message) ? "ongoing" : "";
    const selected = (status ? members.filter((show) => show.completionStatus === status) : members).slice(0, 3);
    const recommendations = wantsMembers ? selected.map((show) => ({
      ...buildRecommendationCard(show),
      why: named.showReasons?.[show.id] || `Included in ${named.title}.`,
    })) : [];
    const memberAnswer = wantsMembers
      ? selected.length ? ` Start with ${selected.map((show) => show.title).join(", ")}.` : ` I don't have a ${status} show listed in it.`
      : "";
    return {
      answer: `${named.title} is a ${named.kind === "curated" ? "curated" : "generated"} listening path with ${members.length} published shows. ${compact(named.description)}${memberAnswer}`,
      actions: [collectionAction(named)], recommendations,
      suggestedPrompts: [`Recommend a show from ${named.title}`, `Which finished shows are in ${named.title}?`, "Show me another collection"], source: "archive-knowledge",
    };
  }
  // A collection search is based on authored title, description and intent tags,
  // never on inferred membership or an invented collection.
  const query = words(message);
  const ranked = collections.map((collection) => {
    const title = new Set(words(collection.title));
    const body = new Set(words(`${collection.description} ${(collection.intentTags || []).join(" ")} ${collection.label || ""}`));
    return { collection, score: query.reduce((score, word) => score + (title.has(word) ? 3 : body.has(word) ? 1 : 0), 0) };
  }).filter((item) => item.score >= 2).sort((a, b) => b.score - a.score || a.collection.title.localeCompare(b.collection.title)).slice(0, 3);
  if (!ranked.length) return null;
  return {
    answer: `These archive collections may fit: ${ranked.map(({ collection }) => `${collection.title} — ${compact(collection.description)}`).join("; ")}.`,
    actions: ranked.map(({ collection }) => collectionAction(collection)), recommendations: [],
    suggestedPrompts: ranked.map(({ collection }) => `What is in ${collection.title}?`), source: "archive-knowledge",
  };
}

function answerShowRecordQuestion({ message, page, catalog }) {
  if (/\b(recommend|suggest|find me|looking for|something like|shows? like|what should i listen)\b|^\s*give me\b/i.test(message)) return null;
  const mentions = findTitleMentions(message, catalog).filter((entry) => !entry.isNegative);
  const compare = /\b(compare|versus|vs\.?|difference between|how do .* differ)\b/i.test(message);
  if (compare && mentions.length >= 2) {
    const [left, right] = mentions.slice(0, 2).map((entry) => entry.show);
    const describe = (show) => [
      show.completionStatus ? `${show.completionStatus} status` : "status unknown",
      ...(show.genres || []).slice(0, 2),
      ...(show.tones || []).slice(0, 2),
      ...(show.formats || []).slice(0, 2),
      Number.isFinite(show.length?.totalHours) ? `${show.length.totalHours} hours` : "",
    ].filter(Boolean).join(", ");
    return {
      answer: `${left.title}: ${describe(left)}. ${right.title}: ${describe(right)}. Those are archive metadata; the show pages have the fuller descriptions and editorial context.`,
      actions: [left, right].map((show) => ({ label: `Open ${show.title}`, href: show.href, external: false })),
      recommendations: [], suggestedPrompts: [`What is ${left.title} about?`, `What is ${right.title} about?`], source: "archive-knowledge",
    };
  }
  const show = mentions[0]?.show || (page?.showId && /\b(this|it|here|the show)\b/i.test(message)
    ? catalog.find((record) => record.id === page.showId) : null);
  if (!show) return null;
  const field = [
    { pattern: /\b(?:ads?|advertisements?|sponsors?)\b/i, label: "advertising", value: show.facts?.ads },
    { pattern: /\blanguages?\b/i, label: "language", value: (show.languages || []).join(", ") },
    { pattern: /\bsetting|set in|takes place\b/i, label: "setting", value: show.content?.setting },
    { pattern: /\bsource material|adaptation|based on\b/i, label: "source material", value: show.content?.sourceMaterial },
    { pattern: /\bintensity|how scary|how intense\b/i, label: "intensity", value: show.content?.intensity || show.discovery?.intensity },
    { pattern: /\bthemes?\b/i, label: "themes", value: (show.themes || []).join(", ") },
    { pattern: /\bgenres?\b/i, label: "genres", value: (show.genres || []).join(", ") },
    { pattern: /\btones?|moods?\b/i, label: "tone", value: (show.tones || []).join(", ") },
    { pattern: /\btags?\b/i, label: "tags", value: (show.tags || []).join(", ") },
    { pattern: /\b(?:best for|good for|listening context)\b/i, label: "best for", value: (show.bestFor || []).map((item) => item.replace(/-/g, " ")).join(", ") },
    { pattern: /\b(?:narrative structure|point of view|pov)\b/i, label: "narrative structure", value: show.content?.pov || show.discovery?.narrativeFocus },
    { pattern: /\b(?:production style|voice style|performed|acted)\b/i, label: "performance style", value: show.discovery?.voiceStyle },
    { pattern: /\b(?:release schedule|cadence|how often|new episodes)\b/i, label: "release cadence", value: [show.metadata?.schedule?.cadence, show.metadata?.schedule?.note].filter(Boolean).join("; ") },
    { pattern: /\brelease date|first released|when did .* (?:start|begin)|latest episode\b/i, label: "release date", value: show.releaseDates?.note || [show.releaseDates?.first && `first released ${show.releaseDates.first}`, show.releaseDates?.latest && `latest main release ${show.releaseDates.latest}`].filter(Boolean).join("; ") },
    { pattern: /\bawards?\b/i, label: "awards", value: (show.metadata?.awards || show.facts?.awards || []).join(", ") },
    { pattern: /\b(?:archive take|editorial take|what do you think|your review|archive review)\b/i, label: "Archive take", value: show.archiveTake || show.spoilerFreeReview },
  ].find((entry) => entry.pattern.test(message));
  if (!field) return null;
  const value = compact(field.value).slice(0, 500);
  const known = value && !/^(unknown|not verified|n\/a)\.?$/i.test(value);
  return {
    answer: known ? `${show.title} — ${field.label}: ${value}.` : `The archive does not currently have verified ${field.label} information for ${show.title}.`,
    actions: [{ label: `Open ${show.title}`, href: show.href, external: false }],
    recommendations: [], suggestedPrompts: [`What is ${show.title} about?`, `What is ${show.title} similar to?`], source: "archive-knowledge",
  };
}

function answerShowEvidenceQuestion({ message, page, catalog }) {
  if (message.length > 240 || !/\?|\b(?:does|is|are|what|how|why|can|tell me|worth)\b/i.test(message)) return null;
  if (/\b(recommend|suggest|find me|looking for|something like|shows? like|what should i listen)\b/i.test(message)) return null;
  const show = findTitleMentions(message, catalog).find((mention) => !mention.isNegative)?.show ||
    (page?.showId && /\b(it|this|that|the show)\b/i.test(message) ? catalog.find((entry) => entry.id === page.showId) : null);
  if (!show) return null;
  const action = { label: `Open ${show.title}`, href: show.href, external: false };
  const aboutQuality = /\b(good|worth|quality|recommendation|opinion|think)\b/i.test(message);
  if (aboutQuality && compact(show.archiveTake)) {
    return {
      answer: `Archive take on ${show.title}: ${compact(show.archiveTake).slice(0, 460)}`,
      actions: [action], recommendations: [], suggestedPrompts: [`What is ${show.title} about?`, `What is ${show.title} similar to?`], source: "archive-knowledge",
    };
  }
  const titleWords = new Set(words(show.title));
  const query = words(message).filter((word) => !titleWords.has(word));
  const passages = [
    ["show description", show.description],
    ["archive take", show.archiveTake],
    ["archive review", show.spoilerFreeReview],
    ["archive review", show.thoughts],
    ["setting note", show.content?.setting],
  ].filter(([, value]) => typeof value === "string" && value.trim());
  const evidence = passages.flatMap(([source, value]) => (value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [value])
    .map((sentence) => {
      const sentenceWords = new Set(words(sentence));
      const hits = query.filter((word) => sentenceWords.has(word)).length;
      return { source, sentence: compact(sentence), hits };
    }))
    .filter((item) => item.sentence.length >= 20 && item.sentence.length <= 500)
    .sort((a, b) => b.hits - a.hits || a.sentence.length - b.sentence.length)[0];
  const enoughEvidence = evidence && (query.length >= 2 ? evidence.hits >= 2 : query.length === 1 && query[0].length >= 5 && evidence.hits === 1);
  return {
    answer: enoughEvidence
      ? `${show.title} — the ${evidence.source} says: ${evidence.sentence}`
      : `I can't confirm that from the published archive record for ${show.title}. The show page has the available details; if you have an official source, you can send a correction.`,
    actions: enoughEvidence ? [action] : [action, { label: "Send a correction", href: "/submit", external: false }],
    recommendations: [], suggestedPrompts: [`What is ${show.title} about?`, `What is ${show.title} similar to?`], source: "archive-knowledge",
  };
}

function answerEntityQuestion({ message, catalog, entities = [] }) {
  if (!/\b(who|what|which|shows?|podcasts?|created|produced|studio|network|creator|made|from|by)\b/i.test(message)) return null;
  const entity = entities
    .filter((record) => record.publication === "public")
    .flatMap((record) => [record.name, ...(record.aliases || [])].map((name) => ({ record, name })))
    .filter(({ name }) => name.length > 3 && containsPhrase(message, name))
    .sort((left, right) => right.name.length - left.name.length)[0]?.record;
  if (!entity) return null;
  const titleMention = findTitleMentions(message, catalog).find((mention) => containsPhrase(message, mention.show.title));
  if (titleMention && !/\b(other|else|more|also|from|by|produced)\b/i.test(message)) return null;
  const related = catalog.filter((show) => show.status === "published" &&
    (show.entityLinks || []).some((link) => link.entityId === entity.id));
  const examples = related.slice(0, 5).map((show) => show.title);
  const roles = [...new Set(related.flatMap((show) => (show.entityLinks || []).filter((link) => link.entityId === entity.id).map((link) => link.role.replace(/-/g, " "))))];
  return {
    answer: `${entity.name} is a reviewed ${entity.type.replace(/-/g, " ")} in the archive${entity.description ? `. ${compact(entity.description)}` : "."} The archive links this entity${roles.length ? ` as ${roles.join(" and ")}` : ""} to ${related.length} published ${related.length === 1 ? "show" : "shows"}${examples.length ? `, including ${examples.join(", ")}` : ""}.`,
    actions: [{ label: `Open ${entity.name}`, href: `/creators/${encodeURIComponent(entity.id)}`, external: false }],
    recommendations: [], suggestedPrompts: examples.slice(0, 2).map((title) => `Tell me about ${title}`), source: "archive-knowledge",
  };
}

module.exports = { loadPublicPageKnowledge, findPublicPageAnswer, answerCollectionQuestion, answerShowRecordQuestion, answerShowEvidenceQuestion, answerEntityQuestion, resolveConversationContext };
