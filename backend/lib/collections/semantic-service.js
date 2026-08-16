const { fetchJsonWithLimits } = require("../import/fetch");

function extractJson(value = "") {
  const text = String(value || "").trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_error) {
    return null;
  }
}

function compactShow(show = {}) {
  return {
    id: show.id,
    title: show.title,
    description: String(show.officialDescription?.text || show.description || "").slice(0, 900),
    genres: show.genres || [],
    tones: show.tones || [],
    formats: show.formats || [],
    tags: show.tags || [],
    themes: show.themes || [],
    content: show.content || {},
    facts: {
      structure: show.facts?.structure || "",
      narrator: show.facts?.narrator || "",
    },
  };
}

function cleanMatches(value, knownIds) {
  const matches = Array.isArray(value) ? value : [];
  const seen = new Set();
  return matches.map((entry) => {
    const showId = String(entry?.showId || entry?.id || "").trim();
    const confidence = Number(entry?.confidence);
    const reason = String(entry?.reason || "").trim().slice(0, 400);
    if (!showId || !knownIds.has(showId) || seen.has(showId) || !Number.isFinite(confidence)) return null;
    seen.add(showId);
    return { showId, confidence: Math.max(0, Math.min(1, confidence)), reason };
  }).filter(Boolean);
}

function cleanConcepts(value, knownIds) {
  const concepts = Array.isArray(value) ? value : [];
  return concepts.map((entry) => {
    const title = String(entry?.title || "").trim().slice(0, 100);
    const query = String(entry?.query || "").trim().slice(0, 240);
    const description = String(entry?.description || "").trim().slice(0, 280);
    const confidence = Number(entry?.confidence);
    if (!title || !query || !description || !Number.isFinite(confidence)) return null;
    return {
      title,
      query,
      description,
      confidence: Math.max(0, Math.min(1, confidence)),
      matches: cleanMatches(entry?.matches, knownIds),
      rationale: String(entry?.rationale || "").trim().slice(0, 500),
    };
  }).filter(Boolean);
}

function createDisabledSemanticService() {
  return {
    enabled: false,
    async suggestConcepts() { return []; },
    async scoreMemberships() { return []; },
  };
}

function createOllamaSemanticService({ config, fetchImpl = globalThis.fetch }) {
  const request = async (prompt) => {
    const { response, json } = await fetchJsonWithLimits(fetchImpl, config.OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.COLLECTION_SUGGESTION_MODEL, prompt, stream: false }),
    }, {
      timeoutMs: config.IMPORT_FETCH_TIMEOUT_MS || config.REQUEST_TIMEOUT_MS || 15_000,
      maxBytes: config.IMPORT_DOCUMENT_MAX_BYTES || 5 * 1024 * 1024,
      label: "Collection semantic suggestion request",
    });
    if (!response.ok) throw new Error(`Collection semantic suggestion request failed with ${response.status}`);
    return extractJson(json.response) || {};
  };

  return {
    enabled: true,
    async scoreMemberships({ query, shows }) {
      const compact = (Array.isArray(shows) ? shows : []).map(compactShow);
      const knownIds = new Set(compact.map((show) => show.id));
      const parsed = await request([
        "Return strict JSON only. You evaluate a proposed fiction-podcast collection.",
        "Use only supplied show metadata. Never infer details missing from it.",
        "A high confidence means the show clearly and centrally fits the concept; uncertain or incidental references must stay low.",
        "JSON schema: { matches: [{ showId: string, confidence: number from 0 to 1, reason: string }] }.",
        `Collection concept: ${query}`,
        `Shows: ${JSON.stringify(compact)}`,
      ].join("\n"));
      return cleanMatches(parsed.matches, knownIds);
    },
    async suggestConcepts({ shows, existingCollections = [] }) {
      const compact = (Array.isArray(shows) ? shows : []).map(compactShow);
      const knownIds = new Set(compact.map((show) => show.id));
      const parsed = await request([
        "Return strict JSON only. Propose at most six durable fiction-podcast collection concepts for a human maintainer.",
        "Use only supplied metadata. Do not propose a plain genre label, a renamed existing collection, a one-show niche, or a complicated mash-up.",
        "Each concept needs at least four clear matches and must be more useful than a normal metadata filter.",
        "These are private review proposals, not publication decisions.",
        "JSON schema: { concepts: [{ title: string, query: string, description: string, confidence: number 0-1, rationale: string, matches: [{ showId: string, confidence: number 0-1, reason: string }] }] }.",
        `Existing collection titles: ${JSON.stringify(existingCollections.map((collection) => collection.title))}`,
        `Shows: ${JSON.stringify(compact)}`,
      ].join("\n"));
      return cleanConcepts(parsed.concepts, knownIds);
    },
  };
}

function createSemanticCollectionService({ config, fetchImpl = globalThis.fetch } = {}) {
  const provider = String(config?.COLLECTION_SUGGESTION_PROVIDER || "").trim().toLowerCase();
  const model = String(config?.COLLECTION_SUGGESTION_MODEL || config?.OLLAMA_MODEL || "").trim();
  if (provider !== "ollama" || !model) return createDisabledSemanticService();
  return createOllamaSemanticService({ config: { ...config, COLLECTION_SUGGESTION_MODEL: model }, fetchImpl });
}

module.exports = {
  createSemanticCollectionService,
};
