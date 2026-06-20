(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.EchoArchiveSearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ALIAS_GROUPS = [
    ["sci fi", ["sci fi", "sci-fi", "science fiction", "scifi"]],
    ["full cast", ["full cast", "full-cast", "fullcast"]],
    ["single narrator", ["single narrator", "single-narrator", "solo narrator", "one narrator"]],
    ["completed", ["completed", "complete", "finished"]],
    ["ongoing", ["ongoing", "active", "unfinished"]],
    ["full review", ["full review", "reviewed", "review first"]],
    ["easy entry", ["easy entry", "easy-entry", "easy to jump into", "easy to get into"]],
    ["funny space disasters", ["funny space disasters", "funny-space-disasters", "funny space disaster"]],
    ["cold isolation horror", ["cold isolation horror", "cold-isolation-horror"]],
    ["headphones on", ["headphones on", "headphones-on"]],
    ["binge listening", ["binge listening", "binge-listening", "bingeable"]],
    ["transcripts", ["transcript", "transcripts", "captioned", "captions"]],
  ];

  const ALIAS_LOOKUP = buildAliasLookup(ALIAS_GROUPS);
  const QUERY_STOP_WORDS = new Set([
    "a",
    "an",
    "and",
    "for",
    "give",
    "how",
    "i",
    "im",
    "into",
    "is",
    "it",
    "long",
    "made",
    "many",
    "me",
    "of",
    "podcast",
    "recommend",
    "show",
    "shows",
    "something",
    "that",
    "this",
    "the",
    "to",
    "what",
    "who",
    "with",
    "where",
    "when",
    "why",
    "does",
    "do",
    "did",
    "are",
    "can",
    "tell",
    "about",
    "created",
    "creator",
    "written",
    "write",
    "to",
    "want",
  ]);

  function buildAliasLookup(groups) {
    const lookup = new Map();

    groups.forEach((group) => {
      const normalizedTerms = Array.from(
        new Set(
          group[1]
            .map((term) => normalizeText(term))
            .filter(Boolean),
        ),
      );

      normalizedTerms.forEach((term) => {
        lookup.set(term, normalizedTerms);
      });
    });

    return lookup;
  }

  function normalizeTag(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, "-");
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[_./]+/g, " ")
      .replace(/-/g, " ")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenizeQuery(value) {
    return Array.from(
      new Set(
        normalizeText(value)
          .split(" ")
          .map((token) => token.trim())
          .filter((token) => token.length > 1),
      ),
    );
  }

  function buildNgrams(tokens, maxLength = 3) {
    const phrases = [];

    for (let size = 1; size <= Math.min(maxLength, tokens.length); size += 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        phrases.push(tokens.slice(index, index + size).join(" "));
      }
    }

    return phrases;
  }

  function expandAliases(phrases) {
    const expanded = new Set();

    phrases.forEach((phrase) => {
      const normalized = normalizeText(phrase);
      if (!normalized) {
        return;
      }

      expanded.add(normalized);
      const aliases = ALIAS_LOOKUP.get(normalized) || [];
      aliases.forEach((alias) => expanded.add(alias));
    });

    return Array.from(expanded);
  }

  function createFieldTerms(values) {
    const phrases = new Set();

    (Array.isArray(values) ? values : [values]).forEach((value) => {
      const normalized = normalizeText(value);
      const slugPhrase = normalizeTag(value).replace(/-/g, " ").trim();

      if (normalized) {
        phrases.add(normalized);
      }

      if (slugPhrase) {
        phrases.add(slugPhrase);
      }
    });

    return expandAliases(Array.from(phrases));
  }

  function createTextBlob(parts) {
    return normalizeText(
      parts
        .flat()
        .filter(Boolean)
        .join(" "),
    );
  }

  function flattenStructuredValues(value) {
    const values = [];

    function visit(entry) {
      if (entry === null || entry === undefined) {
        return;
      }

      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        values.push(String(entry));
        return;
      }

      if (Array.isArray(entry)) {
        entry.forEach(visit);
        return;
      }

      if (typeof entry === "object") {
        Object.values(entry).forEach(visit);
      }
    }

    visit(value);
    return values;
  }

  function buildSearchIndex(record, catalogById) {
    const similarTitles = (Array.isArray(record.similarTo) ? record.similarTo : [])
      .map((showId) => catalogById.get(showId)?.title || "")
      .filter(Boolean);
    const reviewText = [
      record.archiveTake,
      record.spoilerFreeReview,
      record.thoughts,
      ...(record.spoilerFreeReviewParagraphs || []),
      ...(record.thoughtsParagraphs || []),
    ];

    const fields = {
      title: createFieldTerms(record.title),
      subtitle: createFieldTerms(record.subtitle),
      aliases: createFieldTerms(record.aliases || []),
      tags: createFieldTerms(record.tags || []),
      genres: createFieldTerms(record.genres || []),
      tones: createFieldTerms(record.tones || []),
      formats: createFieldTerms(record.formats || []),
      bestFor: createFieldTerms(record.bestFor || []),
      themes: createFieldTerms(record.themes || []),
      contentNotes: createFieldTerms(record.contentNotes || []),
      creators: createFieldTerms(record.creators || []),
      cast: createFieldTerms(record.cast || []),
      languages: createFieldTerms(record.languages || []),
      transcriptLanguages: createFieldTerms(record.transcriptLanguages || []),
      narrator: createFieldTerms(record.facts?.narrator || ""),
      transcriptAvailability: createFieldTerms(
        flattenStructuredValues({
          transcripts: record.availability?.transcripts,
          captions: record.availability?.captions,
        }),
      ),
      content: createFieldTerms(flattenStructuredValues(record.content)),
      facts: createFieldTerms(flattenStructuredValues(record.facts)),
      credits: createFieldTerms(flattenStructuredValues(record.credits)),
      completionStatus: createFieldTerms(record.completionStatus || ""),
      reviewStatus: createFieldTerms(record.reviewStatus || ""),
      similarTitles: createFieldTerms(similarTitles),
    };

    const subtitleText = createTextBlob([record.subtitle]);
    const descriptionText = createTextBlob([record.description]);
    const archiveText = createTextBlob(reviewText);
    const fullText = createTextBlob([
      record.title,
      record.subtitle,
      record.description,
      reviewText,
      record.tags || [],
      record.genres || [],
      record.tones || [],
      record.formats || [],
      record.bestFor || [],
      record.aliases || [],
      record.themes || [],
      record.contentNotes || [],
      record.creators || [],
      record.cast || [],
      record.languages || [],
      record.transcriptLanguages || [],
      similarTitles,
      record.completionStatus,
      record.reviewStatus,
      flattenStructuredValues(record.facts),
      flattenStructuredValues(record.credits),
      flattenStructuredValues(record.availability),
      flattenStructuredValues(record.content),
      flattenStructuredValues(record.metadata?.objectiveNote),
    ]);

    const tokenSource = [
      fullText,
      ...Object.values(fields).flat(),
    ]
      .filter(Boolean)
      .join(" ");

    return {
      title: normalizeText(record.title),
      titleTokens: tokenizeQuery(record.title),
      subtitleText,
      descriptionText,
      archiveText,
      fullText,
      tokenSet: new Set(tokenizeQuery(tokenSource)),
      fields,
    };
  }

  function hydrateCatalogSearch(catalog) {
    const records = Array.isArray(catalog) ? catalog : [];
    const catalogById = new Map(records.map((record) => [record.id, record]));

    records.forEach((record) => {
      const searchIndex = buildSearchIndex(record, catalogById);
      record.searchIndex = searchIndex;
      record.searchText = searchIndex.fullText;
    });

    return records;
  }

  function resolveSeedShow(catalog, normalizedQuery) {
    const patterns = [
      /(?:^|\s)(?:shows? like|like|similar to)\s+(.+)$/,
      /^what(?:'s| is)\s+(.+?)\s+similar to$/,
      /^(.+?)\s+like$/,
    ];

    let titleCandidate = "";
    for (const pattern of patterns) {
      const match = normalizedQuery.match(pattern);
      if (match?.[1]) {
        titleCandidate = normalizeText(match[1]);
        break;
      }
    }

    if (!titleCandidate) {
      return null;
    }

    const matches = (Array.isArray(catalog) ? catalog : [])
      .map((record) => ({
        record,
        title: record.searchIndex?.title || normalizeText(record.title),
      }))
      .filter(({ title }) => title === titleCandidate || title.includes(titleCandidate) || titleCandidate.includes(title))
      .sort((left, right) => right.title.length - left.title.length);

    if (matches.length === 0) {
      return null;
    }

    return {
      titleQuery: titleCandidate,
      record: matches[0].record,
    };
  }

  function prepareQuery(catalog, message) {
    const normalizedQuery = normalizeText(message);
    if (!normalizedQuery) {
      return null;
    }

    const similaritySeed = resolveSeedShow(catalog, normalizedQuery);
    const effectiveQuery = similaritySeed ? similaritySeed.titleQuery : normalizedQuery;
    const tokens = tokenizeQuery(effectiveQuery);
    const phrases = expandAliases(buildNgrams(tokens, 3).concat(effectiveQuery));

    return {
      normalizedQuery: effectiveQuery,
      phrases,
      tokens,
      seedRecord: similaritySeed?.record || null,
    };
  }

  function hasTokenCoverage(recordTokens, tokens) {
    if (tokens.length === 0) {
      return 0;
    }

    return tokens.filter((token) => recordTokens.has(token)).length;
  }

  function scoreFieldTerms(terms, queryPhrases, exactWeight, partialWeight) {
    let score = 0;
    let matchedTerm = "";

    terms.forEach((term) => {
      if (!term) {
        return;
      }

      if (queryPhrases.includes(term)) {
        if (exactWeight > score) {
          score = exactWeight;
          matchedTerm = term;
        }
        return;
      }

      if (queryPhrases.some((phrase) => phrase.length > 2 && (term.includes(phrase) || phrase.includes(term)))) {
        if (partialWeight > score) {
          score = partialWeight;
          matchedTerm = term;
        }
      }
    });

    return { score, matchedTerm };
  }

  function pushReason(reasons, value) {
    if (value && !reasons.includes(value)) {
      reasons.push(value);
    }
  }

  function buildRequiredClauses(normalizedQuery, tokens) {
    const clauses = [];
    const consumedTokens = new Set();

    ALIAS_GROUPS.forEach(([, aliases]) => {
      const normalizedAliases = Array.from(
        new Set(
          aliases.map((alias) => normalizeText(alias)).filter(Boolean),
        ),
      );
      const matchedAlias = normalizedAliases.find((alias) =>
        new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`).test(normalizedQuery),
      );

      if (!matchedAlias) {
        return;
      }

      tokenizeQuery(matchedAlias).forEach((token) => consumedTokens.add(token));
      clauses.push(
        normalizedAliases
          .map((alias) => tokenizeQuery(alias))
          .filter((aliasTokens) => aliasTokens.length > 0),
      );
    });

    tokens
      .filter((token) => !QUERY_STOP_WORDS.has(token) && !consumedTokens.has(token))
      .forEach((token) => {
        clauses.push([[token]]);
      });

    return clauses;
  }

  function satisfiesClause(recordTokens, clause) {
    return clause.some((optionTokens) => optionTokens.every((token) => recordTokens.has(token)));
  }

  function scoreCatalog(catalog, message) {
    const preparedQuery = prepareQuery(catalog, message);
    if (!preparedQuery) {
      return [];
    }

    const requiredClauses = buildRequiredClauses(preparedQuery.normalizedQuery, preparedQuery.tokens);

    return (Array.isArray(catalog) ? catalog : [])
      .map((record) => {
        const searchIndex = record.searchIndex || buildSearchIndex(record, new Map());
        const reasons = [];
        let score = 0;
        let relatedToSeed = false;

        if (preparedQuery.seedRecord) {
          const seedId = preparedQuery.seedRecord.id;
          relatedToSeed =
            (Array.isArray(record.similarTo) && record.similarTo.includes(seedId)) ||
            (Array.isArray(preparedQuery.seedRecord.similarTo) && preparedQuery.seedRecord.similarTo.includes(record.id));

          if (relatedToSeed) {
            score += 90;
            pushReason(reasons, `similar to ${preparedQuery.seedRecord.title}`);
          }

          if (record.id === seedId) {
            score -= 80;
          }
        }

        if (record.id !== preparedQuery.seedRecord?.id) {
          if (searchIndex.title === preparedQuery.normalizedQuery) {
            score += 120;
            pushReason(reasons, `direct title match for ${record.title}`);
          } else if (searchIndex.title.startsWith(preparedQuery.normalizedQuery)) {
            score += 90;
            pushReason(reasons, `title starts with ${preparedQuery.normalizedQuery}`);
          } else if (
            preparedQuery.tokens.length > 0 &&
            preparedQuery.tokens.every((token) => searchIndex.titleTokens.includes(token))
          ) {
            score += 72;
            pushReason(reasons, `title lines up with ${preparedQuery.normalizedQuery}`);
          }
        }

        const aliasMatch = scoreFieldTerms(searchIndex.fields.aliases, preparedQuery.phrases, 76, 36);
        if (aliasMatch.score) {
          score += aliasMatch.score;
          pushReason(reasons, `alias match for ${aliasMatch.matchedTerm}`);
        }

        const tagMatch = scoreFieldTerms(searchIndex.fields.tags, preparedQuery.phrases, 30, 16);
        if (tagMatch.score) {
          score += tagMatch.score;
          pushReason(reasons, `matches ${tagMatch.matchedTerm}`);
        }

        const bestForMatch = scoreFieldTerms(searchIndex.fields.bestFor, preparedQuery.phrases, 28, 15);
        if (bestForMatch.score) {
          score += bestForMatch.score;
          pushReason(reasons, `good for ${bestForMatch.matchedTerm}`);
        }

        const themeMatch = scoreFieldTerms(searchIndex.fields.themes, preparedQuery.phrases, 24, 12);
        if (themeMatch.score) {
          score += themeMatch.score;
          pushReason(reasons, `tracks ${themeMatch.matchedTerm}`);
        }

        const genreMatch = scoreFieldTerms(searchIndex.fields.genres, preparedQuery.phrases, 26, 14);
        if (genreMatch.score) {
          score += genreMatch.score;
          pushReason(reasons, `fits ${genreMatch.matchedTerm}`);
        }

        const toneMatch = scoreFieldTerms(searchIndex.fields.tones, preparedQuery.phrases, 24, 12);
        if (toneMatch.score) {
          score += toneMatch.score;
          pushReason(reasons, `leans ${toneMatch.matchedTerm}`);
        }

        const formatMatch = scoreFieldTerms(searchIndex.fields.formats, preparedQuery.phrases, 24, 12);
        if (formatMatch.score) {
          score += formatMatch.score;
          pushReason(reasons, `${formatMatch.matchedTerm} format`);
        }

        const creatorMatch = scoreFieldTerms(searchIndex.fields.creators, preparedQuery.phrases, 24, 12);
        if (creatorMatch.score) {
          score += creatorMatch.score;
          pushReason(reasons, `created by ${creatorMatch.matchedTerm}`);
        }

        const castMatch = scoreFieldTerms(searchIndex.fields.cast, preparedQuery.phrases, 18, 10);
        if (castMatch.score) {
          score += castMatch.score;
          pushReason(reasons, `cast includes ${castMatch.matchedTerm}`);
        }

        const narratorMatch = scoreFieldTerms(searchIndex.fields.narrator, preparedQuery.phrases, 18, 10);
        if (narratorMatch.score) {
          score += narratorMatch.score;
          pushReason(reasons, `narration fits ${narratorMatch.matchedTerm}`);
        }

        const transcriptMatch = scoreFieldTerms(searchIndex.fields.transcriptAvailability, preparedQuery.phrases, 18, 10);
        if (transcriptMatch.score) {
          score += transcriptMatch.score;
          pushReason(reasons, `transcript notes match ${transcriptMatch.matchedTerm}`);
        }

        const contentNoteMatch = scoreFieldTerms(searchIndex.fields.contentNotes, preparedQuery.phrases, 18, 10);
        if (contentNoteMatch.score) {
          score += contentNoteMatch.score;
          pushReason(reasons, `content notes match ${contentNoteMatch.matchedTerm}`);
        }

        const completionMatch = scoreFieldTerms(searchIndex.fields.completionStatus, preparedQuery.phrases, 24, 12);
        if (completionMatch.score) {
          score += completionMatch.score;
          pushReason(reasons, `${completionMatch.matchedTerm} listen`);
        }

        const reviewMatch = scoreFieldTerms(searchIndex.fields.reviewStatus, preparedQuery.phrases, 22, 10);
        if (reviewMatch.score) {
          score += reviewMatch.score;
          pushReason(reasons, "has a full review");
        }

        const similarTitleMatch = scoreFieldTerms(searchIndex.fields.similarTitles, preparedQuery.phrases, 24, 12);
        if (similarTitleMatch.score) {
          score += similarTitleMatch.score;
          pushReason(reasons, `linked to ${similarTitleMatch.matchedTerm}`);
        }

        if (
          preparedQuery.normalizedQuery &&
          searchIndex.subtitleText &&
          searchIndex.subtitleText.includes(preparedQuery.normalizedQuery)
        ) {
          score += 18;
          pushReason(reasons, "subtitle match");
        }

        if (
          preparedQuery.normalizedQuery &&
          searchIndex.descriptionText &&
          searchIndex.descriptionText.includes(preparedQuery.normalizedQuery)
        ) {
          score += 12;
        }

        if (
          preparedQuery.normalizedQuery &&
          searchIndex.archiveText &&
          searchIndex.archiveText.includes(preparedQuery.normalizedQuery)
        ) {
          score += 10;
        }

        const matchedTokenCount = hasTokenCoverage(searchIndex.tokenSet, preparedQuery.tokens);
        if (matchedTokenCount > 0) {
          score += Math.round((matchedTokenCount / Math.max(preparedQuery.tokens.length, 1)) * 20);
        }

        const hasFullClauseCoverage =
          requiredClauses.length === 0 || requiredClauses.every((clause) => satisfiesClause(searchIndex.tokenSet, clause));
        const satisfiesQuery = preparedQuery.seedRecord
          ? record.id !== preparedQuery.seedRecord.id && relatedToSeed
          : hasFullClauseCoverage;

        return {
          ...record,
          score,
          reasons,
          satisfiesQuery,
        };
      })
      .filter((record) => record.score > 0 && record.satisfiesQuery)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if ((right.finalRating || 0) !== (left.finalRating || 0)) {
          return (right.finalRating || 0) - (left.finalRating || 0);
        }

        return left.title.localeCompare(right.title);
      });
  }

  return {
    buildSearchIndex,
    hydrateCatalogSearch,
    normalizeTag,
    normalizeText,
    scoreCatalog,
    tokenizeQuery,
  };
});
