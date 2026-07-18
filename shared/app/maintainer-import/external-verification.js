const EDITABLE_FIELDS = [
  "title",
  "creatorName",
  "networkName",
  "description",
  "categories",
  "tags",
  "language",
  "rssUrl",
  "websiteUrl",
  "appleUrl",
  "spotifyUrl",
  "episodeCount",
  "seasonCount",
  "avgEpisodeMinutes",
  "firstPublicationDate",
  "latestPublicationDate",
  "completionStatus",
];

const FIELD_LABELS = {
  title: "Title",
  creatorName: "Creator",
  networkName: "Network",
  description: "Description",
  categories: "Genres",
  tags: "Discovery tags",
  language: "Language",
  rssUrl: "RSS feed",
  websiteUrl: "Official website",
  appleUrl: "Apple Podcasts",
  spotifyUrl: "Spotify",
  episodeCount: "Episode count",
  seasonCount: "Season count",
  avgEpisodeMinutes: "Average runtime (minutes)",
  firstPublicationDate: "First release date",
  latestPublicationDate: "Latest release date",
  completionStatus: "Completion status",
};

const FIELD_ALIASES = {
  creator_name: "creatorName",
  network_name: "networkName",
  rss_url: "rssUrl",
  website_url: "websiteUrl",
  apple_url: "appleUrl",
  spotify_url: "spotifyUrl",
  episode_count: "episodeCount",
  season_count: "seasonCount",
  avg_episode_minutes: "avgEpisodeMinutes",
  first_publication_date: "firstPublicationDate",
  latest_publication_date: "latestPublicationDate",
  completion_status: "completionStatus",
  genres: "categories",
};

const CANONICAL_GENRES = new Set([
  "sci-fi", "fantasy", "horror", "mystery", "thriller", "comedy", "drama", "adventure", "science", "supernatural",
]);

const GENRE_ALIASES = new Map([
  ["science fiction", "sci-fi"], ["science-fiction", "sci-fi"], ["sci fi", "sci-fi"], ["scifi", "sci-fi"],
]);

const TAG_ALIASES = new Map([
  ["science fiction", "Sci-fi"], ["science-fiction", "Sci-fi"], ["sci fi", "Sci-fi"], ["scifi", "Sci-fi"], ["sci-fi", "Sci-fi"],
]);

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBadge(label, tone) {
  return `<span class="maintainer-badge is-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function trimText(value, maxLength = 4_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function valuesFromList(value) {
  if (!Array.isArray(value) && typeof value !== "string") return [];
  return (Array.isArray(value) ? value : value.split(","))
    .map((item) => trimText(String(item), 80))
    .filter(Boolean);
}

function normalizeGenres(value) {
  return [...new Set(valuesFromList(value)
    .map((item) => GENRE_ALIASES.get(item.toLowerCase()) || item.toLowerCase())
    .filter((item) => CANONICAL_GENRES.has(item)))].join(", ");
}

function normalizeTags(value) {
  return [...new Set(valuesFromList(value)
    .map((item) => TAG_ALIASES.get(item.toLowerCase()) || item)
    .map((item) => item.toLowerCase() === "ai" ? "AI" : `${item.charAt(0).toUpperCase()}${item.slice(1).toLowerCase()}`)
    .filter(Boolean))].join(", ");
}

function fieldValue(objective, candidate, field) {
  if (field === "title") return objective.title || candidate.title || "";
  if (field === "creatorName") return objective.creatorName || candidate.creatorName || "";
  if (field === "categories") return Array.isArray(objective.categories) ? objective.categories : [];
  if (field === "tags") return Array.isArray(objective.manualTags) ? objective.manualTags : candidate.preparedRecord?.tags || [];
  if (field === "completionStatus") {
    return objective.manualReleaseState || (objective.complete ? "finished" : "unknown");
  }
  return objective[field] ?? "";
}

function buildVerificationSnapshot(candidate = {}) {
  const objective = candidate.objective || {};
  const details = Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, fieldValue(objective, candidate, field)]));
  const sources = [
    candidate.primarySourceUrl && { type: candidate.primarySourceType || "primary", url: candidate.primarySourceUrl },
    ...(candidate.sources || []).map((source) => source.sourceUrl && ({
      type: source.sourceType || "source",
      url: source.sourceUrl,
      fetchedAt: source.fetchedAt || "",
    })),
  ].filter(Boolean);

  return {
    candidate: {
      id: candidate.id || "",
      seedQuery: candidate.seedQuery || "",
      status: candidate.status || "",
      scopeStatus: candidate.scopeStatus || "",
      mode: candidate.mode || "create",
    },
    editableShowDetails: details,
    automaticPreparation: {
      blockers: candidate.readiness?.blockers || [],
      warnings: candidate.readiness?.warnings || [],
      conflicts: candidate.conflicts || [],
      researchGaps: objective.researchGaps || [],
    },
    knownSources: sources,
  };
}

export function buildExternalVerificationBrief(candidate = {}) {
  const snapshot = buildVerificationSnapshot(candidate);
  return `You are verifying factual show metadata for The Echo Archives, an audio-drama discovery archive. Browse the web before answering and prefer the official show site, the RSS feed, and official platform pages.

Check the editable show details below against reliable sources. Do not guess, infer, or invent missing facts. Do not comment on ratings, reviews, recommendations, or whether the show is good. If a value cannot be verified, omit it from \"verified\" and name it in \"uncertain_fields\".

The \"description\" field has a strict rule: it must be the complete official show description from the current official RSS feed or official show website. Copy that source text faithfully, only normalizing whitespace or stripping source HTML. Never write, shorten, expand, summarize, paraphrase, combine, or infer a description. If you cannot find a current official description, omit \"description\" and add it to \"uncertain_fields\". Include the official description page or feed URL in \"field_sources.description\".

Genre and tag rules: return one or more source-supported values in \"categories\" using only the archive's normalized genre vocabulary: \"sci-fi\" (never \"science fiction\", \"science-fiction\", or \"sci fi\"), \"fantasy\", \"horror\", \"mystery\", \"thriller\", \"comedy\", \"drama\", \"adventure\", \"science\", or \"supernatural\". Separately, always return 2 to 6 distinct source-supported values in \"tags\". Tags are concise listener discovery labels in title case, such as \"Sci-fi\", \"Space\", \"Time travel\", \"Found footage\", \"Survival\", \"Post-apocalyptic\", \"Dystopian\", \"Anthology\", \"Full cast\", \"Serialized\", \"Narrated\", \"Historical\", or \"Queer\". You may add a new concise tag when none of these captures a clearly supported discovery trait. Do not use duplicate synonyms, vague labels, ratings, quality claims, or unverified plot assumptions. Never use \"Science Fiction\" as a tag; use \"Sci-fi\" instead.

Return exactly one JSON object, with no Markdown fences or commentary, in this shape:
{
  "echo_archives_verification": "v1",
  "verified": {
    "title": "Only include fields you verified",
    "creatorName": "",
    "networkName": "",
    "description": "Complete official description copied from the official RSS feed or show website only",
    "categories": ["Normalized archive genre values, such as sci-fi or horror"],
    "tags": ["At least two source-supported, title-case discovery tags, such as Sci-fi and Space"],
    "language": "",
    "rssUrl": "",
    "websiteUrl": "",
    "appleUrl": "",
    "spotifyUrl": "",
    "episodeCount": 0,
    "seasonCount": 0,
    "avgEpisodeMinutes": 0,
    "firstPublicationDate": "YYYY-MM-DD",
    "latestPublicationDate": "YYYY-MM-DD",
    "completionStatus": "unknown | ongoing | finished"
  },
  "source_urls": ["Every URL used to support the verified fields"],
  "field_sources": { "description": ["Official RSS feed or official show page used for the description"] },
  "notes": "Short factual caveats only",
  "uncertain_fields": ["Fields you could not verify"]
}

CURRENT IMPORT DATA (automatic values may be incomplete or wrong; verify independently):
${JSON.stringify(snapshot, null, 2)}`;
}

export function renderExternalVerificationWorkspace(candidate) {
  const brief = buildExternalVerificationBrief(candidate);
  return `
    <section class="maintainer-detail-section import-verification-workspace">
      <div class="import-source-card-top">
        <div>
          <p class="maintainer-kicker">External verification</p>
          <h3>Verify details with ChatGPT</h3>
          <p>Copy the factual brief, ask ChatGPT to check it with web access, then paste its JSON response here. Descriptions must come from official show copy, not an AI rewrite. Pasted values only fill the editor for your review; they are never saved or published automatically.</p>
        </div>
        ${renderBadge("Source review required", "warning")}
      </div>
      <div class="maintainer-review-actions">
        <button class="maintainer-primary-button" type="button" data-import-verification-copy>Copy verification brief</button>
        <p class="maintainer-panel-meta" data-import-verification-copy-status>Includes the current editable details, import blockers, and known source URLs.</p>
      </div>
      <details class="import-verification-brief">
        <summary>View or manually copy the verification text</summary>
        <label class="maintainer-field">
          <span>Verification brief</span>
          <textarea data-import-verification-brief rows="16" readonly>${escapeHtml(brief)}</textarea>
        </label>
      </details>
      <label class="maintainer-field">
        <span>Paste ChatGPT’s verification response</span>
        <textarea data-import-verification-response rows="10" placeholder='Paste the JSON response here, for example { "verified": { "title": "…" } }'></textarea>
      </label>
      <div class="maintainer-review-actions">
        <button class="maintainer-ghost-button" type="button" data-import-verification-preview>Preview verified fields</button>
        <button class="maintainer-primary-button" type="button" data-import-verification-apply disabled>Apply verified fields to editor</button>
        <p class="maintainer-panel-meta" data-import-verification-status>Preview the response before it can change any editor fields.</p>
      </div>
      <div data-import-verification-preview-result aria-live="polite"></div>
    </section>
  `;
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Paste the JSON response from ChatGPT first.");

  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch (_error) {
      // Try the next likely JSON block.
    }
  }
  throw new Error("I could not find a valid JSON object. Ask ChatGPT to return the JSON format from the copied brief.");
}

function normalizeValue(field, value) {
  if (value === null || value === undefined || value === "") return "";
  if (field === "categories") return normalizeGenres(value);
  if (field === "tags") return normalizeTags(value);
  if (["episodeCount", "seasonCount", "avgEpisodeMinutes"].includes(field)) {
    if (typeof value !== "number" && typeof value !== "string") return "";
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? String(number) : "";
  }
  if (field === "completionStatus") {
    const status = trimText(String(value), 20).toLowerCase();
    return ["unknown", "ongoing", "finished"].includes(status) ? status : "";
  }
  const text = trimText(String(value), field === "description" ? 4_000 : 2_000);
  if (["rssUrl", "websiteUrl", "appleUrl", "spotifyUrl"].includes(field)) {
    return /^https?:\/\//i.test(text) ? text : "";
  }
  if (["firstPublicationDate", "latestPublicationDate"].includes(field)) {
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) ? text : "";
  }
  return text;
}

function sourceUrls(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => trimText(String(item), 2_000))
    .filter((item) => /^https?:\/\//i.test(item)))].slice(0, 12);
}

export function parseExternalVerificationResponse(text) {
  const response = extractJson(text);
  const submitted = response.verified || response.details || response.fields || response;
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    throw new Error("The verification response needs a verified object with show details.");
  }

  const details = {};
  EDITABLE_FIELDS.forEach((field) => {
    const rawValue = submitted[field] ?? submitted[Object.keys(FIELD_ALIASES).find((alias) => FIELD_ALIASES[alias] === field) || ""];
    const value = normalizeValue(field, rawValue);
    if (value) details[field] = value;
  });

  if (Object.keys(details).length === 0) {
    throw new Error("No usable verified show details were found. Fields with null, empty, or invalid values are left unchanged.");
  }
  if (!details.tags || details.tags.split(", ").length < 2) {
    throw new Error("The verification response needs at least two source-supported discovery tags in verified.tags.");
  }

  return {
    details,
    sourceUrls: sourceUrls(response.source_urls || response.sourceUrls || response.sources),
    notes: trimText(response.notes || response.note, 1_200),
    uncertainFields: Array.isArray(response.uncertain_fields || response.uncertainFields)
      ? (response.uncertain_fields || response.uncertainFields).map((field) => trimText(String(field), 120)).filter(Boolean).slice(0, 20)
      : [],
  };
}

export function renderExternalVerificationPreview(result) {
  const changes = Object.entries(result.details || {});
  return `
    <div class="import-verification-preview" role="status">
      <p><strong>${changes.length} verified ${changes.length === 1 ? "field" : "fields"} ready to place in the editor.</strong> Nothing has been saved or published.</p>
      <dl class="maintainer-detail-grid">
        ${changes.map(([field, value]) => `<div class="maintainer-detail-row"><dt>${escapeHtml(FIELD_LABELS[field] || field)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
      ${result.sourceUrls?.length ? `<p><strong>Sources supplied:</strong> ${result.sourceUrls.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`).join(" · ")}</p>` : ""}
      ${result.notes ? `<p><strong>Verification note:</strong> ${escapeHtml(result.notes)}</p>` : ""}
      ${result.uncertainFields?.length ? `<p><strong>Still uncertain:</strong> ${escapeHtml(result.uncertainFields.join(", "))}</p>` : ""}
    </div>
  `;
}

export function applyExternalVerificationToForm(form, result) {
  Object.entries(result.details || {}).forEach(([field, value]) => {
    const input = form.elements.namedItem(field);
    if (input && "value" in input) input.value = value;
  });

  const reviewNotes = form.elements.namedItem("reviewNotes");
  if (reviewNotes && "value" in reviewNotes && (result.notes || result.sourceUrls?.length || result.uncertainFields?.length)) {
    const annotation = [
      "External AI verification — source review still required.",
      result.notes ? `Notes: ${result.notes}` : "",
      result.sourceUrls?.length ? `Sources: ${result.sourceUrls.join(" ")}` : "",
      result.uncertainFields?.length ? `Uncertain: ${result.uncertainFields.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    if (!reviewNotes.value.includes(annotation)) reviewNotes.value = [reviewNotes.value.trim(), annotation].filter(Boolean).join("\n\n");
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.append(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied) throw new Error("Your browser could not copy the brief. Open the text area below and copy it manually.");
}

export function bindExternalVerificationWorkspace({ container, reviewForm, runAction }) {
  const brief = container.querySelector("[data-import-verification-brief]");
  const response = container.querySelector("[data-import-verification-response]");
  const preview = container.querySelector("[data-import-verification-preview]");
  const apply = container.querySelector("[data-import-verification-apply]");
  const previewResult = container.querySelector("[data-import-verification-preview-result]");
  const copyStatus = container.querySelector("[data-import-verification-copy-status]");
  const status = container.querySelector("[data-import-verification-status]");
  let verification = null;

  container.querySelector("[data-import-verification-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement) || !(brief instanceof HTMLTextAreaElement)) return;
    await runAction({
      control: button,
      region: container,
      action: async () => {
        try {
          await copyText(brief.value);
          if (copyStatus) copyStatus.textContent = "Verification brief copied. Paste it into ChatGPT with web access enabled.";
        } catch (error) {
          if (copyStatus) copyStatus.textContent = error instanceof Error ? error.message : "Could not copy the verification brief.";
        }
      },
    });
  });

  response?.addEventListener("input", () => {
    verification = null;
    if (apply instanceof HTMLButtonElement) apply.disabled = true;
    if (previewResult) previewResult.innerHTML = "";
    if (status) status.textContent = "Preview the updated response before applying it to the editor.";
  });

  preview?.addEventListener("click", () => {
    if (!(response instanceof HTMLTextAreaElement)) return;
    try {
      verification = parseExternalVerificationResponse(response.value);
      if (previewResult) previewResult.innerHTML = renderExternalVerificationPreview(verification);
      if (apply instanceof HTMLButtonElement) apply.disabled = false;
      if (status) status.textContent = "Review the proposed values and sources, then apply them to the editor below.";
    } catch (error) {
      verification = null;
      if (previewResult) previewResult.innerHTML = "";
      if (apply instanceof HTMLButtonElement) apply.disabled = true;
      if (status) status.textContent = error instanceof Error ? error.message : "Could not read the verification response.";
    }
  });

  apply?.addEventListener("click", () => {
    if (!reviewForm || !verification) return;
    applyExternalVerificationToForm(reviewForm, verification);
    if (status) status.textContent = "Verified values are now in the editor. Check the linked sources, then use Save show details to keep them.";
    reviewForm.querySelector('[name="title"]')?.focus({ preventScroll: true });
  });
}
