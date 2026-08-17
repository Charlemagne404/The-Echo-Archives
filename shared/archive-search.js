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
  const STRUCTURED_ALIAS_FIELDS = new Map([
    ["sci fi", "genres"],
    ["full cast", "formats"],
    ["single narrator", "formats"],
    ["completed", "completionStatus"],
    ["ongoing", "completionStatus"],
    ["full review", "reviewStatus"],
    ["easy entry", "bestFor"],
    ["funny space disasters", "bestFor"],
    ["cold isolation horror", "bestFor"],
    ["headphones on", "bestFor"],
    ["binge listening", "bestFor"],
    ["transcripts", "transcriptAvailability"],
  ]);
  const STRUCTURED_GENRE_TOKENS = new Set([
    "adventure",
    "comedy",
    "drama",
    "fantasy",
    "horror",
    "mystery",
    "science",
    "supernatural",
    "thriller",
  ]);
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

  function toDisplayTag(value) {
    return String(value || "")
      .split(/[-\s]+/)
      .filter(Boolean)
      .map((part) => {
        if (/^[A-Z0-9]+$/.test(part)) {
          return part;
        }

        if (part.length <= 3 && part === part.toUpperCase()) {
          return part;
        }

        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(" ");
  }

  function tokenizeQuery(value, { minLength = 2 } = {}) {
    const minimumLength = Number.isInteger(minLength) ? Math.max(1, minLength) : 2;

    return Array.from(
      new Set(
        normalizeText(value)
          .split(" ")
          .map((token) => token.trim())
          .filter((token) => token.length >= minimumLength),
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

  function createFieldTokens(values) {
    return Array.from(
      new Set(
        (Array.isArray(values) ? values : [values])
          .flatMap((value) => tokenizeQuery(value))
          .filter(Boolean),
      ),
    );
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
    const fieldTokens = {
      title: createFieldTokens(record.title),
      aliases: createFieldTokens(record.aliases || []),
      tags: createFieldTokens(record.tags || []),
      genres: createFieldTokens(record.genres || []),
      tones: createFieldTokens(record.tones || []),
      formats: createFieldTokens(record.formats || []),
      bestFor: createFieldTokens(record.bestFor || []),
      creators: createFieldTokens(record.creators || []),
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
      fieldTokens,
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

  function prepareQuery(catalog, message, options = {}) {
    const normalizedQuery = normalizeText(message);
    if (!normalizedQuery) {
      return null;
    }

    const explicitSeed =
      options.seedShowId && Array.isArray(catalog)
        ? catalog.find((record) => record.id === options.seedShowId)
        : null;
    const similaritySeed = explicitSeed
      ? { titleQuery: normalizeText(explicitSeed.title), record: explicitSeed }
      : resolveSeedShow(catalog, normalizedQuery);
    const effectiveQuery = similaritySeed ? similaritySeed.titleQuery : normalizedQuery;
    const tokens = tokenizeQuery(effectiveQuery, { minLength: 1 }).filter(
      (token) => token.length > 1 || !QUERY_STOP_WORDS.has(token),
    );
    const phrases = expandAliases(buildNgrams(tokens, 3).concat(effectiveQuery));
    const significantTokens = tokens.filter((token) => !QUERY_STOP_WORDS.has(token));

    return {
      normalizedQuery: effectiveQuery,
      phrases,
      tokens,
      significantTokens: significantTokens.length > 0 ? significantTokens : tokens,
      seedRecord: similaritySeed?.record || null,
    };
  }

  function hasTokenCoverage(recordTokens, tokens) {
    if (tokens.length === 0) {
      return 0;
    }

    return tokens.filter((token) => hasMatchingSearchToken(token, recordTokens)).length;
  }

  function getIdentitySearchTokens(searchIndex) {
    return new Set([
      ...(searchIndex?.fieldTokens?.title || []),
      ...(searchIndex?.fieldTokens?.aliases || []),
      ...(searchIndex?.fieldTokens?.creators || []),
      ...(searchIndex?.fieldTokens?.tags || []),
    ]);
  }

  function hasIdentityTokenCoverage(searchIndex, queryTokens) {
    const identityTokens = getIdentitySearchTokens(searchIndex);
    return queryTokens.every((queryToken) => hasMatchingSearchToken(queryToken, identityTokens));
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

  function getFuzzyDistanceLimit(token) {
    if (!token || token.length < 4) {
      return 0;
    }

    if (token.length >= 8) {
      return 2;
    }

    return 1;
  }

  function calculateEditDistance(left, right, maxDistance) {
    if (left === right) {
      return 0;
    }

    if (Math.abs(left.length - right.length) > maxDistance) {
      return maxDistance + 1;
    }

    const previous = new Array(right.length + 1);
    const current = new Array(right.length + 1);

    for (let index = 0; index <= right.length; index += 1) {
      previous[index] = index;
    }

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      current[0] = leftIndex;
      let rowMinimum = current[0];

      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        current[rightIndex] = Math.min(
          previous[rightIndex] + 1,
          current[rightIndex - 1] + 1,
          previous[rightIndex - 1] + substitutionCost,
        );
        rowMinimum = Math.min(rowMinimum, current[rightIndex]);
      }

      if (rowMinimum > maxDistance) {
        return maxDistance + 1;
      }

      for (let index = 0; index <= right.length; index += 1) {
        previous[index] = current[index];
      }
    }

    return previous[right.length];
  }

  function isFuzzyTokenMatch(queryToken, fieldToken) {
    const maxDistance = getFuzzyDistanceLimit(queryToken);
    if (!maxDistance || !queryToken || !fieldToken) {
      return false;
    }

    if (queryToken === fieldToken || queryToken[0] !== fieldToken[0]) {
      return queryToken === fieldToken;
    }

    return calculateEditDistance(queryToken, fieldToken, maxDistance) <= maxDistance;
  }

  function isPrefixTokenMatch(queryToken, fieldToken) {
    return Boolean(queryToken && fieldToken && fieldToken.startsWith(queryToken));
  }

  function matchesSearchToken(queryToken, fieldToken) {
    return queryToken === fieldToken || isPrefixTokenMatch(queryToken, fieldToken) || isFuzzyTokenMatch(queryToken, fieldToken);
  }

  function hasMatchingSearchToken(queryToken, sourceTokens) {
    for (const sourceToken of sourceTokens || []) {
      if (matchesSearchToken(queryToken, sourceToken)) {
        return true;
      }
    }

    return false;
  }

  function scorePrefixFieldTokens(fieldTokens, queryTokens, prefixWeight) {
    if (!Array.isArray(fieldTokens) || fieldTokens.length === 0 || !Array.isArray(queryTokens) || queryTokens.length === 0) {
      return { score: 0, matchedTokens: [] };
    }

    const matchedTokens = queryTokens
      .map((queryToken) => fieldTokens.find((fieldToken) => isPrefixTokenMatch(queryToken, fieldToken)))
      .filter(Boolean);
    if (matchedTokens.length === 0) {
      return { score: 0, matchedTokens: [] };
    }

    const coverage = matchedTokens.length / Math.max(queryTokens.length, 1);
    if (coverage < 0.5) {
      return { score: 0, matchedTokens: [] };
    }

    return {
      score: Math.round(prefixWeight * coverage),
      matchedTokens: Array.from(new Set(matchedTokens)),
    };
  }

  function scoreFuzzyFieldTokens(fieldTokens, queryTokens, fuzzyWeight) {
    if (!Array.isArray(fieldTokens) || fieldTokens.length === 0 || !Array.isArray(queryTokens) || queryTokens.length === 0) {
      return { score: 0, matchedTokens: [] };
    }

    const matchedTokens = [];
    queryTokens.forEach((queryToken) => {
      const matchedToken = fieldTokens.find((fieldToken) => isFuzzyTokenMatch(queryToken, fieldToken));
      if (matchedToken) {
        matchedTokens.push(matchedToken);
      }
    });

    if (matchedTokens.length === 0) {
      return { score: 0, matchedTokens: [] };
    }

    const coverage = matchedTokens.length / Math.max(queryTokens.length, 1);
    if (coverage < 0.5) {
      return { score: 0, matchedTokens: [] };
    }

    return {
      score: Math.round(fuzzyWeight * coverage),
      matchedTokens: Array.from(new Set(matchedTokens)),
    };
  }

  function getFieldSourceValues(record, fieldName) {
    if (fieldName === "title") {
      return [record.title || ""];
    }

    if (fieldName === "completionStatus" || fieldName === "reviewStatus") {
      return [record[fieldName] || ""];
    }

    const value = record[fieldName];
    return Array.isArray(value) ? value : [value || ""];
  }

  function resolveDisplayValue(record, fieldName, matchedTerm, matchedTokens = []) {
    const values = getFieldSourceValues(record, fieldName)
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (values.length === 0) {
      return String(matchedTerm || "").trim();
    }

    const normalizedMatchedTerm = normalizeText(matchedTerm);
    const exactMatch = values.find((value) => {
      const normalizedValue = normalizeText(value);
      return (
        normalizedValue === normalizedMatchedTerm ||
        normalizedValue.includes(normalizedMatchedTerm) ||
        normalizedMatchedTerm.includes(normalizedValue)
      );
    });
    if (exactMatch) {
      return exactMatch;
    }

    const fuzzyMatch = values.find((value) =>
      tokenizeQuery(value).some((token) =>
        matchedTokens.some((matchedToken) => token === matchedToken || isFuzzyTokenMatch(matchedToken, token)),
      ),
    );

    return fuzzyMatch || values[0];
  }

  function createMetadataLine(fieldName, displayValue) {
    const value = String(displayValue || "").trim();
    if (!value) {
      return "";
    }
    const prettyValue = toDisplayTag(value);

    switch (fieldName) {
      case "aliases":
        return `Also listed as ${displayValue}`;
      case "creators":
        return `Creator: ${displayValue}`;
      case "tags":
        return `Tag: ${prettyValue}`;
      case "bestFor":
        return `Best for: ${prettyValue}`;
      case "genres":
        return `Genre: ${prettyValue}`;
      case "tones":
        return `Tone: ${prettyValue}`;
      case "formats":
        return `Format: ${prettyValue}`;
      default:
        return prettyValue;
    }
  }

  function selectSearchPresentation({ record, titleTerms, metadataMatches }) {
    const sortedMatches = [...metadataMatches].sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.priority - right.priority;
    });
    const bestMetadataMatch = sortedMatches[0] || null;

    return {
      titleTerms: Array.from(new Set((Array.isArray(titleTerms) ? titleTerms : []).filter(Boolean))),
      metaText: bestMetadataMatch?.text || "",
      metaTerms: Array.from(new Set((bestMetadataMatch?.terms || []).filter(Boolean))),
    };
  }

  function hasFuzzyTokenCoverage(searchIndex, queryTokens) {
    const sourceTokens = getIdentitySearchTokens(searchIndex);

    return queryTokens.filter((queryToken) => hasMatchingSearchToken(queryToken, sourceTokens)).length;
  }

  function pushReason(reasons, value) {
    if (value && !reasons.includes(value)) {
      reasons.push(value);
    }
  }

  function buildRequiredClauses(normalizedQuery, tokens) {
    const clauses = [];
    const consumedTokens = new Set();

    ALIAS_GROUPS.forEach(([groupKey, aliases]) => {
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
      clauses.push({
        fieldName: STRUCTURED_ALIAS_FIELDS.get(groupKey) || "",
        options: normalizedAliases
          .map((alias) => tokenizeQuery(alias))
          .filter((aliasTokens) => aliasTokens.length > 0),
      });
    });

    tokens
      .filter((token) => !QUERY_STOP_WORDS.has(token) && !consumedTokens.has(token))
      .forEach((token) => {
        clauses.push({
          fieldName: STRUCTURED_GENRE_TOKENS.has(token) ? "genres" : "",
          options: [[token]],
        });
      });

    return clauses;
  }

  function satisfiesClause(searchIndex, clause) {
    const fieldTokens = clause.fieldName
      ? new Set((searchIndex.fields[clause.fieldName] || []).flatMap((value) => tokenizeQuery(value)))
      : searchIndex.tokenSet;
    return clause.options.some((optionTokens) => optionTokens.every((token) => hasMatchingSearchToken(token, fieldTokens)));
  }

  function toOptionSet(values) {
    if (!values) {
      return new Set();
    }

    return new Set((Array.isArray(values) ? values : [values]).map((value) => String(value)).filter(Boolean));
  }

  function normalizeRequiredFields(requiredFields = {}) {
    return Object.fromEntries(
      Object.entries(requiredFields)
        .map(([fieldName, values]) => [
          fieldName,
          new Set((Array.isArray(values) ? values : [values]).map(normalizeTag).filter(Boolean)),
        ])
        .filter(([, values]) => values.size > 0),
    );
  }

  function getRecordFieldValues(record, fieldName) {
    if (fieldName === "completionStatus") {
      return [record.completionStatus || ""];
    }

    const value = record[fieldName];
    return Array.isArray(value) ? value : [value || ""];
  }

  function satisfiesRequiredFields(record, requiredFields) {
    return Object.entries(requiredFields).every(([fieldName, requiredValues]) => {
      const recordValues = new Set(getRecordFieldValues(record, fieldName).map(normalizeTag).filter(Boolean));
      return Array.from(requiredValues).every((value) => recordValues.has(value));
    });
  }

  function countSharedTerms(leftValues, rightValues) {
    const left = new Set((Array.isArray(leftValues) ? leftValues : []).map(normalizeTag).filter(Boolean));
    const right = new Set((Array.isArray(rightValues) ? rightValues : []).map(normalizeTag).filter(Boolean));

    return Array.from(left).filter((value) => right.has(value)).length;
  }

  function calculateAvoidancePenalty(record, avoidSeedRecords) {
    let penalty = 0;

    avoidSeedRecords.forEach((seed) => {
      if (!seed || seed.id === record.id) {
        return;
      }

      const overlapScore =
        countSharedTerms(record.genres, seed.genres) * 12 +
        countSharedTerms(record.tones, seed.tones) * 8 +
        countSharedTerms(record.formats, seed.formats) * 5 +
        countSharedTerms(record.themes, seed.themes) * 5 +
        countSharedTerms(record.tags, seed.tags) * 4 +
        countSharedTerms(record.bestFor, seed.bestFor) * 4;

      if (overlapScore >= 32) {
        penalty += Math.min(overlapScore, 60);
      }
    });

    return penalty;
  }

  function scoreCatalog(catalog, message, options = {}) {
    const preparedQuery = prepareQuery(catalog, message, options);
    if (!preparedQuery) {
      return [];
    }

    const requiredClauses = buildRequiredClauses(preparedQuery.normalizedQuery, preparedQuery.tokens);
    const isShortPrefixQuery = preparedQuery.normalizedQuery.length < 3;
    const excludeIds = toOptionSet(options.excludeIds);
    const requiredFields = normalizeRequiredFields(options.requiredFields);
    const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((record) => [record.id, record]));
    const avoidSeedRecords = Array.from(toOptionSet(options.avoidSimilaritySeedIds))
      .map((showId) => catalogById.get(showId))
      .filter(Boolean);

    return (Array.isArray(catalog) ? catalog : [])
      .map((record) => {
        const searchIndex = record.searchIndex || buildSearchIndex(record, new Map());
        const reasons = [];
        const metadataMatches = [];
        const titleTerms = [];
        let score = 0;
        let relatedToSeed = false;

        if (excludeIds.has(record.id)) {
          return {
            ...record,
            score: Number.NEGATIVE_INFINITY,
            reasons,
            satisfiesQuery: false,
          };
        }

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
            titleTerms.push(...searchIndex.titleTokens);
          } else if (searchIndex.title.startsWith(preparedQuery.normalizedQuery)) {
            score += 90;
            pushReason(reasons, `title starts with ${preparedQuery.normalizedQuery}`);
            titleTerms.push(...tokenizeQuery(preparedQuery.normalizedQuery, { minLength: 1 }));
          } else if (
            preparedQuery.tokens.length > 0 &&
            preparedQuery.tokens.every((token) => searchIndex.titleTokens.includes(token))
          ) {
            score += 72;
            pushReason(reasons, `title lines up with ${preparedQuery.normalizedQuery}`);
            titleTerms.push(...preparedQuery.tokens);
          } else {
            const titlePrefixMatch = scorePrefixFieldTokens(
              searchIndex.fieldTokens?.title || [],
              preparedQuery.significantTokens,
              66,
            );
            if (titlePrefixMatch.score) {
              score += titlePrefixMatch.score;
              pushReason(reasons, `title matches a prefix of ${preparedQuery.normalizedQuery}`);
              titleTerms.push(...titlePrefixMatch.matchedTokens);
            } else {
              const titleFuzzyMatch = scoreFuzzyFieldTokens(searchIndex.fieldTokens?.title || [], preparedQuery.significantTokens, 66);
              if (titleFuzzyMatch.score) {
                score += titleFuzzyMatch.score;
                pushReason(reasons, `title survives a close spelling for ${preparedQuery.normalizedQuery}`);
                titleTerms.push(...titleFuzzyMatch.matchedTokens);
              }
            }
          }
        }

        const aliasMatch = scoreFieldTerms(searchIndex.fields.aliases, preparedQuery.phrases, 76, 36);
        if (aliasMatch.score) {
          score += aliasMatch.score;
          pushReason(reasons, `alias match for ${aliasMatch.matchedTerm}`);
          metadataMatches.push({
            score: aliasMatch.score,
            priority: 6,
            text: createMetadataLine(
              "aliases",
              resolveDisplayValue(record, "aliases", aliasMatch.matchedTerm, tokenizeQuery(aliasMatch.matchedTerm)),
            ),
            terms: tokenizeQuery(aliasMatch.matchedTerm),
          });
        } else {
          const aliasFuzzyMatch = scoreFuzzyFieldTokens(searchIndex.fieldTokens?.aliases || [], preparedQuery.significantTokens, 34);
          if (aliasFuzzyMatch.score) {
            score += aliasFuzzyMatch.score;
            pushReason(reasons, `alias survives a close spelling for ${preparedQuery.normalizedQuery}`);
            metadataMatches.push({
              score: aliasFuzzyMatch.score,
              priority: 6,
              text: createMetadataLine(
                "aliases",
                resolveDisplayValue(record, "aliases", aliasFuzzyMatch.matchedTokens.join(" "), aliasFuzzyMatch.matchedTokens),
              ),
              terms: aliasFuzzyMatch.matchedTokens,
            });
          }
        }

        const tagMatch = scoreFieldTerms(searchIndex.fields.tags, preparedQuery.phrases, 30, 16);
        if (tagMatch.score) {
          score += tagMatch.score;
          pushReason(reasons, `matches ${tagMatch.matchedTerm}`);
          metadataMatches.push({
            score: tagMatch.score,
            priority: 1,
            text: createMetadataLine("tags", resolveDisplayValue(record, "tags", tagMatch.matchedTerm, tokenizeQuery(tagMatch.matchedTerm))),
            terms: tokenizeQuery(tagMatch.matchedTerm),
          });
        } else {
          const tagFuzzyMatch = scoreFuzzyFieldTokens(searchIndex.fieldTokens?.tags || [], preparedQuery.significantTokens, 18);
          if (tagFuzzyMatch.score) {
            score += tagFuzzyMatch.score;
            pushReason(reasons, `tag survives a close spelling for ${preparedQuery.normalizedQuery}`);
            metadataMatches.push({
              score: tagFuzzyMatch.score,
              priority: 1,
              text: createMetadataLine("tags", resolveDisplayValue(record, "tags", tagFuzzyMatch.matchedTokens.join(" "), tagFuzzyMatch.matchedTokens)),
              terms: tagFuzzyMatch.matchedTokens,
            });
          }
        }

        const bestForMatch = scoreFieldTerms(searchIndex.fields.bestFor, preparedQuery.phrases, 28, 15);
        if (bestForMatch.score) {
          score += bestForMatch.score;
          pushReason(reasons, `good for ${bestForMatch.matchedTerm}`);
          metadataMatches.push({
            score: bestForMatch.score,
            priority: 2,
            text: createMetadataLine(
              "bestFor",
              resolveDisplayValue(record, "bestFor", bestForMatch.matchedTerm, tokenizeQuery(bestForMatch.matchedTerm)),
            ),
            terms: tokenizeQuery(bestForMatch.matchedTerm),
          });
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
          metadataMatches.push({
            score: genreMatch.score,
            priority: 3,
            text: createMetadataLine("genres", resolveDisplayValue(record, "genres", genreMatch.matchedTerm, tokenizeQuery(genreMatch.matchedTerm))),
            terms: tokenizeQuery(genreMatch.matchedTerm),
          });
        }

        const toneMatch = scoreFieldTerms(searchIndex.fields.tones, preparedQuery.phrases, 24, 12);
        if (toneMatch.score) {
          score += toneMatch.score;
          pushReason(reasons, `leans ${toneMatch.matchedTerm}`);
          metadataMatches.push({
            score: toneMatch.score,
            priority: 4,
            text: createMetadataLine("tones", resolveDisplayValue(record, "tones", toneMatch.matchedTerm, tokenizeQuery(toneMatch.matchedTerm))),
            terms: tokenizeQuery(toneMatch.matchedTerm),
          });
        }

        const formatMatch = scoreFieldTerms(searchIndex.fields.formats, preparedQuery.phrases, 24, 12);
        if (formatMatch.score) {
          score += formatMatch.score;
          pushReason(reasons, `${formatMatch.matchedTerm} format`);
          metadataMatches.push({
            score: formatMatch.score,
            priority: 5,
            text: createMetadataLine(
              "formats",
              resolveDisplayValue(record, "formats", formatMatch.matchedTerm, tokenizeQuery(formatMatch.matchedTerm)),
            ),
            terms: tokenizeQuery(formatMatch.matchedTerm),
          });
        }

        const creatorMatch = scoreFieldTerms(searchIndex.fields.creators, preparedQuery.phrases, 24, 12);
        if (creatorMatch.score) {
          score += creatorMatch.score;
          pushReason(reasons, `created by ${creatorMatch.matchedTerm}`);
          metadataMatches.push({
            score: creatorMatch.score,
            priority: 0,
            text: createMetadataLine(
              "creators",
              resolveDisplayValue(record, "creators", creatorMatch.matchedTerm, tokenizeQuery(creatorMatch.matchedTerm)),
            ),
            terms: tokenizeQuery(creatorMatch.matchedTerm),
          });
        } else {
          const creatorFuzzyMatch = scoreFuzzyFieldTokens(searchIndex.fieldTokens?.creators || [], preparedQuery.significantTokens, 16);
          if (creatorFuzzyMatch.score) {
            score += creatorFuzzyMatch.score;
            pushReason(reasons, `creator survives a close spelling for ${preparedQuery.normalizedQuery}`);
            metadataMatches.push({
              score: creatorFuzzyMatch.score,
              priority: 0,
              text: createMetadataLine(
                "creators",
                resolveDisplayValue(record, "creators", creatorFuzzyMatch.matchedTokens.join(" "), creatorFuzzyMatch.matchedTokens),
              ),
              terms: creatorFuzzyMatch.matchedTokens,
            });
          }
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
          !isShortPrefixQuery &&
          preparedQuery.normalizedQuery &&
          searchIndex.subtitleText &&
          searchIndex.subtitleText.includes(preparedQuery.normalizedQuery)
        ) {
          score += 18;
          pushReason(reasons, "subtitle match");
        }

        if (
          !isShortPrefixQuery &&
          preparedQuery.normalizedQuery &&
          searchIndex.descriptionText &&
          searchIndex.descriptionText.includes(preparedQuery.normalizedQuery)
        ) {
          score += 12;
        }

        if (
          !isShortPrefixQuery &&
          preparedQuery.normalizedQuery &&
          searchIndex.archiveText &&
          searchIndex.archiveText.includes(preparedQuery.normalizedQuery)
        ) {
          score += 10;
        }

        const tokenCoverageSource = isShortPrefixQuery ? getIdentitySearchTokens(searchIndex) : searchIndex.tokenSet;
        const matchedTokenCount = hasTokenCoverage(tokenCoverageSource, preparedQuery.tokens);
        if (matchedTokenCount > 0) {
          score += Math.round((matchedTokenCount / Math.max(preparedQuery.tokens.length, 1)) * 20);
        }

        const avoidancePenalty = calculateAvoidancePenalty(record, avoidSeedRecords);
        if (avoidancePenalty > 0) {
          score -= avoidancePenalty;
        }

        const hasExactIdentityMatch = searchIndex.title === preparedQuery.normalizedQuery ||
          (Array.isArray(record.aliases) ? record.aliases : []).some((alias) => normalizeText(alias) === preparedQuery.normalizedQuery);
        if (record.reviewStatus === "imported" && !hasExactIdentityMatch) {
          score -= 6;
        }

        const hasFullClauseCoverage =
          requiredClauses.length === 0 || requiredClauses.every((clause) => satisfiesClause(searchIndex, clause));
        const fuzzyMatchedTokenCount = hasFuzzyTokenCoverage(searchIndex, preparedQuery.significantTokens);
        const hasFuzzyClauseCoverage =
          preparedQuery.significantTokens.length > 0 && fuzzyMatchedTokenCount === preparedQuery.significantTokens.length;
        const hasStructuredClause = requiredClauses.some((clause) => clause.fieldName);
        const hasRequiredFieldCoverage = satisfiesRequiredFields(record, requiredFields);
        const hasRelevantClauseCoverage = isShortPrefixQuery
          ? hasIdentityTokenCoverage(searchIndex, preparedQuery.tokens)
          : hasFullClauseCoverage;
        const satisfiesQuery = preparedQuery.seedRecord
          ? record.id !== preparedQuery.seedRecord.id && relatedToSeed && hasRequiredFieldCoverage
          : (hasRelevantClauseCoverage || (!hasStructuredClause && hasFuzzyClauseCoverage)) && hasRequiredFieldCoverage;

        return {
          ...record,
          score,
          reasons,
          searchPresentation: selectSearchPresentation({
            record,
            titleTerms,
            metadataMatches,
          }),
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
