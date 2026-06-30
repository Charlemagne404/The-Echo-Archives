const { cleanDescription, trimText } = require("./utils");

function extractJsonObject(value = "") {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch (_error) {
    return null;
  }
}

function normalizeListSuggestions(values = [], limit = 8) {
  return (Array.isArray(values) ? values : [])
    .map((entry) => {
      const value = trimText(entry?.value || entry, 120);
      return value
        ? {
            value,
            confidence: Number.isFinite(Number(entry?.confidence)) ? Number(entry.confidence) : 0.5,
            evidence: Array.isArray(entry?.evidence) ? entry.evidence.map((item) => trimText(item, 240)).filter(Boolean) : [],
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, limit);
}

function createDisabledSuggestionService() {
  return {
    enabled: false,
    async suggest() {
      return {};
    },
  };
}

function createOllamaSuggestionService({ config, fetchImpl = globalThis.fetch }) {
  return {
    enabled: true,
    async suggest({ objective = {}, sources = [], existingCatalog = [] }) {
      const prompt = [
        "Return strict JSON only.",
        "You are preparing non-binding editorial suggestions for a fiction podcast catalog maintainer.",
        "Do not invent facts. Use only the supplied metadata.",
        "If unsure, return empty arrays or low confidence.",
        "JSON schema:",
        JSON.stringify({
          shortDescription: { value: "", confidence: 0.5, evidence: [] },
          tags: [{ value: "", confidence: 0.5, evidence: [] }],
          tones: [{ value: "", confidence: 0.5, evidence: [] }],
          formats: [{ value: "", confidence: 0.5, evidence: [] }],
          completionStatus: { value: "", confidence: 0.5, evidence: [] },
          similarShowIds: [{ value: "", confidence: 0.5, evidence: [] }],
        }),
        "Objective metadata:",
        JSON.stringify(objective),
        "Source types:",
        JSON.stringify(sources.map((source) => source.sourceType)),
        "Existing catalog ids and titles for similar-show suggestions:",
        JSON.stringify(existingCatalog.map((show) => ({ id: show.id, title: show.title, genres: show.genres, tags: show.tags }))),
      ].join("\n");

      const response = await fetchImpl(config.OLLAMA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.IMPORT_SUGGESTION_MODEL,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama suggestion request failed with ${response.status}`);
      }

      const payload = await response.json();
      const parsed = extractJsonObject(payload.response);
      if (!parsed) {
        return {};
      }

      const shortDescriptionValue = cleanDescription(parsed.shortDescription?.value || "", 240);

      return {
        provider: "ollama",
        model: config.IMPORT_SUGGESTION_MODEL,
        generatedAt: new Date().toISOString(),
        shortDescription: shortDescriptionValue
          ? {
              value: shortDescriptionValue,
              confidence: Number.isFinite(Number(parsed.shortDescription?.confidence))
                ? Number(parsed.shortDescription.confidence)
                : 0.5,
              evidence: Array.isArray(parsed.shortDescription?.evidence)
                ? parsed.shortDescription.evidence.map((item) => trimText(item, 240)).filter(Boolean)
                : [],
            }
          : null,
        tags: normalizeListSuggestions(parsed.tags, 10),
        tones: normalizeListSuggestions(parsed.tones, 6),
        formats: normalizeListSuggestions(parsed.formats, 6),
        completionStatus: trimText(parsed.completionStatus?.value, 80)
          ? {
              value: trimText(parsed.completionStatus.value, 80),
              confidence: Number.isFinite(Number(parsed.completionStatus?.confidence))
                ? Number(parsed.completionStatus.confidence)
                : 0.5,
              evidence: Array.isArray(parsed.completionStatus?.evidence)
                ? parsed.completionStatus.evidence.map((item) => trimText(item, 240)).filter(Boolean)
                : [],
            }
          : null,
        similarShowIds: normalizeListSuggestions(parsed.similarShowIds, 5),
      };
    },
  };
}

function createSuggestionService({ config, fetchImpl = globalThis.fetch }) {
  const provider = trimText(config.IMPORT_SUGGESTION_PROVIDER, 80).toLowerCase();
  const model = trimText(config.IMPORT_SUGGESTION_MODEL || config.OLLAMA_MODEL, 120);

  if (provider !== "ollama" || !model) {
    return createDisabledSuggestionService();
  }

  return createOllamaSuggestionService({
    config: {
      ...config,
      IMPORT_SUGGESTION_MODEL: model,
    },
    fetchImpl,
  });
}

module.exports = {
  createSuggestionService,
};
