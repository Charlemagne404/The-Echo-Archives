const fs = require("node:fs");
const path = require("node:path");

function normalizeTitle(value = "") {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function stripHtml(value = "") {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseCardTags(rawTags = "", body = "") {
  if (rawTags.trim()) {
    return rawTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  const matches = Array.from(body.matchAll(/<span class="tag">([^<]+)<\/span>/g));
  return matches.map((match) => match[1].trim()).filter(Boolean);
}

function parseHomepageCards(indexHtml) {
  const cards = [];
  const cardPattern =
    /<a class="podcast-card" href="([^"]+)"(?:[^>]*?)data-tags="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

  let match;
  while ((match = cardPattern.exec(indexHtml)) !== null) {
    const [, href, rawTags, body] = match;
    const titleMatch = body.match(/<h2>([^<]+)<\/h2>/);
    const imageMatch = body.match(/<img src="([^"]+)" alt="([^"]*)"/);
    const ratingMatch = body.match(/Rating:\s*(\d+(?:\.\d+)?)\/10/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : "";
    const tags = parseCardTags(rawTags, body);

    if (!title) {
      continue;
    }

    cards.push({
      id: normalizeTitle(title),
      title,
      href,
      image: imageMatch ? imageMatch[1] : "",
      imageAlt: imageMatch ? imageMatch[2] : `${title} cover`,
      tags,
      siteRating: ratingMatch ? Number.parseFloat(ratingMatch[1]) : null,
    });
  }

  return cards;
}

function mergeTags(...collections) {
  const merged = new Map();

  collections.flat().forEach((tag) => {
    if (typeof tag !== "string") {
      return;
    }

    const trimmed = tag.trim();
    if (!trimmed) {
      return;
    }

    const key = trimmed.toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, trimmed);
    }
  });

  return Array.from(merged.values());
}

function buildSearchText(record) {
  return [
    record.title,
    ...(record.tags || []),
    record.summary,
    record.thoughts,
    record.bestFor,
    record.length,
    record.structure,
    record.narrator,
    record.ads,
    ...(record.similarTo || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function loadCatalog(siteRoot) {
  const homePath = path.join(siteRoot, "index.html");
  const dataPath = path.join(siteRoot, "podcast-data.json");
  const indexHtml = fs.readFileSync(homePath, "utf8");
  const cards = parseHomepageCards(indexHtml);
  const detailed = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const detailedMap = new Map(
    detailed.map((entry) => {
      const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
      return [
        normalizeTitle(entry.title),
        {
          summary: entry.summary || "",
          thoughts: entry.thoughts || "",
          bestFor: entry.best_for || "",
          similarTo: Array.isArray(entry.similar_to) ? entry.similar_to.filter(Boolean) : [],
          finalRating: typeof entry.final_rating === "number" ? entry.final_rating : null,
          ratings: entry.ratings || {},
          length: entry.length || "",
          structure: entry.structure || "",
          narrator: entry.narrator || "",
          ads: entry.ads || "",
          wouldRelisten: Boolean(entry.would_relisten),
          favoriteEpisodes: entry.favorite_episodes || "",
          quote: entry.quote || "",
          detailedTags: tags,
        },
      ];
    }),
  );

  return cards.map((card) => {
    const detail = detailedMap.get(card.id) || {};
    const tags = mergeTags(detail.detailedTags || [], card.tags || []);
    const absolutePagePath = path.join(siteRoot, card.href);
    const hasPage = fs.existsSync(absolutePagePath);

    const record = {
      id: card.id,
      title: card.title,
      href: hasPage ? card.href : "",
      hasPage,
      image: card.image,
      imageAlt: card.imageAlt,
      tags,
      siteRating: card.siteRating,
      finalRating: detail.finalRating ?? card.siteRating,
      summary: detail.summary || "",
      thoughts: detail.thoughts || "",
      bestFor: detail.bestFor || "",
      similarTo: detail.similarTo || [],
      ratings: detail.ratings || {},
      length: detail.length || "",
      structure: detail.structure || "",
      narrator: detail.narrator || "",
      ads: detail.ads || "",
      wouldRelisten: detail.wouldRelisten || false,
      favoriteEpisodes: detail.favoriteEpisodes || "",
      quote: detail.quote || "",
    };

    return {
      ...record,
      searchText: buildSearchText(record),
    };
  });
}

function tokenizeQuery(message = "") {
  return Array.from(
    new Set(
      message
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1),
    ),
  );
}

function scoreCatalog(catalog, message) {
  const lowered = message.toLowerCase();
  const tokens = tokenizeQuery(message);

  return catalog
    .map((record) => {
      let score = 0;
      const reasons = [];

      if (lowered.includes(record.title.toLowerCase())) {
        score += 10;
        reasons.push(`direct title match for ${record.title}`);
      }

      for (const tag of record.tags) {
        const normalizedTag = tag.toLowerCase();
        if (lowered.includes(normalizedTag)) {
          score += 4;
          reasons.push(`matches ${tag}`);
        }
      }

      for (const token of tokens) {
        if (record.searchText.includes(token)) {
          score += 1;
        }
      }

      if (record.finalRating && record.finalRating >= 9 && /(best|favorite|top|highest|amazing)/i.test(lowered)) {
        score += 3;
        reasons.push("one of the archive's highest rated picks");
      }

      if (record.wouldRelisten && /(relisten|rewatch|comfort|return)/i.test(lowered)) {
        score += 2;
        reasons.push("strong replay value");
      }

      return {
        ...record,
        score,
        reasons: Array.from(new Set(reasons)),
      };
    })
    .filter((record) => record.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (right.finalRating || 0) - (left.finalRating || 0);
    });
}

module.exports = {
  loadCatalog,
  normalizeTitle,
  parseHomepageCards,
  scoreCatalog,
  tokenizeQuery,
};
