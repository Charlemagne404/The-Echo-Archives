(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EchoDiscoveryUrlState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VERSION = 1;
  const PARAM_ORDER = [
    "q", "collection", "seed", "entity", "role", "intent", "type", "sort",
    "genre", "tones", "formats", "reviewStatus", "completionStatus", "releaseStatus", "bestFor", "tags", "themes",
    "preferGenre", "preferFormat", "preferTone", "preferTag", "preferTheme", "preferBestFor", "preferCommitment",
    "avoidGenre", "avoidFormat", "avoidTone", "avoidTag", "avoidTheme", "avoidBestFor",
    "runtimeMinHours", "runtimeMaxHours", "runtimeMinExclusive", "runtimeMaxExclusive", "hours", "hoursMode",
  ];
  const ALLOWED_PARAMS = new Set(PARAM_ORDER);
  const ALLOWED_HASHES = new Set(["archive", "collectionsDirectorySection", "directory"]);
  const MULTI_PARAMS = new Set(PARAM_ORDER.filter((name) => !["q", "collection", "seed", "entity", "role", "intent", "type", "sort", "runtimeMinHours", "runtimeMaxHours", "runtimeMinExclusive", "runtimeMaxExclusive", "hours", "hoursMode"].includes(name)));
  const SORT_VALUES = new Set(["default", "recently-updated", "editorial", "newest", "updated", "rating", "popularity", "shows"]);
  const ENTITY_TYPES = new Set(["person", "production-company", "studio", "network"]);
  const PATHS = new Set(["/", "/collections", "/creators"]);

  function cleanValue(value) {
    return String(value ?? "").trim();
  }
  function sortedUnique(values) {
    return [...new Set((Array.isArray(values) ? values : [values]).map(cleanValue).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
  }
  function validPath(pathname) {
    const path = cleanValue(pathname);
    return PATHS.has(path) ? path : "/";
  }
  function validHash(hash) {
    const value = cleanValue(hash).replace(/^#/, "");
    return ALLOWED_HASHES.has(value) ? value : "";
  }

  function stateFromIntent(intent) {
    const values = new Map();
    const add = (name, value) => {
      if (!ALLOWED_PARAMS.has(name)) return;
      const entries = values.get(name) || [];
      entries.push(value);
      values.set(name, entries);
    };
    const addMany = (name, list) => sortedUnique(list).forEach((value) => add(name, value));
    const params = Array.isArray(intent?.url?.params) ? intent.url.params : Array.isArray(intent?.params) ? intent.params : [];
    const privateIntent = Boolean(intent?.personalIntent || intent?.kind === "personal-library-status");
    for (const entry of params) {
      const name = cleanValue(entry?.name);
      if (!ALLOWED_PARAMS.has(name) || (privateIntent && name === "q")) continue;
      add(name, entry?.value);
    }
    if (!values.has("q") && intent?.query && !privateIntent) add("q", intent.query);
    if (!values.has("collection") && intent?.identity?.kind === "collection") add("collection", intent.identity.id);
    if (!values.has("collection") && intent?.collectionResolution?.id) add("collection", intent.collectionResolution.id);
    if (!values.has("intent") && intent?.collectionResolution?.intentTag) add("intent", intent.collectionResolution.intentTag);
    if (!values.has("seed") && intent?.identity?.kind === "show" && intent.identity.match === "seed") add("seed", intent.identity.id);
    if (!values.has("entity") && intent?.identity?.kind === "entity") {
      add("entity", intent.identity.id);
      if (intent.identity.role) add("role", intent.identity.role);
      if (intent.identity.type) add("type", intent.identity.type);
    }

    const required = intent?.required || {};
    const preferred = intent?.preferred || {};
    const avoid = intent?.avoid || {};
    const criterionParams = [
      [required.genreIds, "genre"], [required.formatIds, "formats"], [required.toneIds, "tones"],
      [required.catalogueStatusIds, "completionStatus"], [required.releaseStatusIds, "releaseStatus"],
      [required.bestForIds, "bestFor"], [required.tagIds, "tags"], [required.themeIds, "themes"],
      [preferred.genreIds, "preferGenre"], [preferred.formatIds, "preferFormat"], [preferred.toneIds, "preferTone"],
      [preferred.tagIds, "preferTag"], [preferred.themeIds, "preferTheme"], [preferred.bestForIds, "preferBestFor"],
      [preferred.commitmentIds, "preferCommitment"],
      [avoid.genreIds, "avoidGenre"], [avoid.formatIds, "avoidFormat"], [avoid.toneIds, "avoidTone"],
      [avoid.tagIds, "avoidTag"], [avoid.themeIds, "avoidTheme"], [avoid.bestForIds, "avoidBestFor"],
    ];
    for (const [list, name] of criterionParams) if (!values.has(name)) addMany(name, list || []);
    if (required.runtimeHours) {
      if (required.runtimeHours.min !== null && required.runtimeHours.min !== undefined) add("runtimeMinHours", required.runtimeHours.min);
      if (required.runtimeHours.max !== null && required.runtimeHours.max !== undefined) add("runtimeMaxHours", required.runtimeHours.max);
      if (required.runtimeHours.minExclusive) add("runtimeMinExclusive", "true");
      if (required.runtimeHours.maxExclusive) add("runtimeMaxExclusive", "true");
    }
    if (preferred.runtimeTargetHours && !values.has("hours")) {
      add("hours", preferred.runtimeTargetHours.hours);
      add("hoursMode", preferred.runtimeTargetHours.mode || "around");
    }
    const path = validPath(intent?.url?.pathname || intent?.pathname || intent?.path || "/");
    const hash = validHash(intent?.url?.hash || intent?.hash || "");
    if (intent?.sort && !values.has("sort")) add("sort", intent.sort);
    return { path, hash, values };
  }

  function serializePublicUrlState(intent, options = {}) {
    const { path: intentPath, hash: intentHash, values } = stateFromIntent(intent || {});
    const pathname = validPath(options.pathname || intentPath);
    const hash = validHash(options.hash || intentHash);
    const params = new URLSearchParams();
    for (const name of PARAM_ORDER) {
      const entries = values.get(name);
      if (!entries?.length) continue;
      const unique = MULTI_PARAMS.has(name) ? sortedUnique(entries) : [cleanValue(entries[entries.length - 1])];
      for (const value of unique) {
        if (!value) continue;
        if (name === "sort" && !SORT_VALUES.has(value)) continue;
        if (name === "role" && !["creator", "production-company", "studio", "network"].includes(value)) continue;
        if (name === "type" && !ENTITY_TYPES.has(value)) continue;
        if (name === "hoursMode" && !["around", "range"].includes(value)) continue;
        if (["runtimeMinHours", "runtimeMaxHours", "hours"].includes(name) && finitePositive(value) === null) continue;
        if (name === "runtimeMinExclusive" && !(values.get("runtimeMinHours") || []).some((entry) => finitePositive(entry) !== null)) continue;
        if (name === "runtimeMaxExclusive" && !(values.get("runtimeMaxHours") || []).some((entry) => finitePositive(entry) !== null)) continue;
        if (["runtimeMinExclusive", "runtimeMaxExclusive"].includes(name) && value !== "true") continue;
        params.append(name, value);
      }
    }
    const search = params.toString();
    return pathname + (search ? "?" + search : "") + (hash ? "#" + hash : "");
  }

  function parsePublicDiscoveryUrl(input, options = {}) {
    const raw = String(input || "/");
    let url;
    try { url = new URL(raw, options.baseUrl || "https://echo-archives.invalid/"); }
    catch { url = new URL("/", "https://echo-archives.invalid/"); }
    const params = new URLSearchParams();
    for (const name of PARAM_ORDER) {
      const entries = url.searchParams.getAll(name).map(cleanValue).filter(Boolean);
      if (!entries.length) continue;
      const values = MULTI_PARAMS.has(name) ? sortedUnique(entries) : [entries[entries.length - 1]];
      for (const value of values) {
        if (name === "sort" && !SORT_VALUES.has(value)) continue;
        if (name === "role" && !["creator", "production-company", "studio", "network"].includes(value)) continue;
        if (name === "type" && !ENTITY_TYPES.has(value)) continue;
        if (name === "hoursMode" && !["around", "range"].includes(value)) continue;
        if (["runtimeMinHours", "runtimeMaxHours", "hours"].includes(name) && finitePositive(value) === null) continue;
        if (name === "runtimeMinExclusive" && !params.has("runtimeMinHours")) continue;
        if (name === "runtimeMaxExclusive" && !params.has("runtimeMaxHours")) continue;
        if (["runtimeMinExclusive", "runtimeMaxExclusive"].includes(name) && value !== "true") continue;
        params.append(name, value);
      }
    }
    const filters = {
      genres: params.getAll("genre"),
      tones: params.getAll("tones"),
      formats: params.getAll("formats"),
      reviewStatus: params.getAll("reviewStatus"),
      completionStatus: params.getAll("completionStatus"),
      releaseStatus: params.getAll("releaseStatus"),
      bestFor: params.getAll("bestFor"),
      tags: params.getAll("tags"),
      themes: params.getAll("themes"),
      preferred: {
        genres: params.getAll("preferGenre"), formats: params.getAll("preferFormat"), tones: params.getAll("preferTone"),
        tags: params.getAll("preferTag"), themes: params.getAll("preferTheme"), bestFor: params.getAll("preferBestFor"), commitment: params.getAll("preferCommitment"),
      },
      avoid: {
        genres: params.getAll("avoidGenre"), formats: params.getAll("avoidFormat"), tones: params.getAll("avoidTone"),
        tags: params.getAll("avoidTag"), themes: params.getAll("avoidTheme"), bestFor: params.getAll("avoidBestFor"),
      },
      runtimeHours: {
        min: finitePositive(params.get("runtimeMinHours")),
        max: finitePositive(params.get("runtimeMaxHours")),
        minExclusive: params.get("runtimeMinExclusive") === "true",
        maxExclusive: params.get("runtimeMaxExclusive") === "true",
      },
      runtimeTargetHours: finitePositive(params.get("hours")) !== null ? { hours: finitePositive(params.get("hours")), mode: params.get("hoursMode") || "around", strength: "soft" } : null,
    };
    return {
      version: VERSION,
      pathname: validPath(url.pathname),
      query: params.get("q") || "",
      collectionId: params.get("collection") || "",
      seedShowId: params.get("seed") || "",
      entityId: params.get("entity") || "",
      entityRole: params.get("role") || "",
      collectionIntent: params.get("intent") || "",
      entityType: params.get("type") || "",
      sort: params.get("sort") || "",
      filters,
      params: [...params.entries()].map(([name, value]) => ({ name, value })),
      hash: validHash(url.hash),
    };
  }

  function finitePositive(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  return { VERSION, PARAM_ORDER, serializePublicUrlState, parsePublicDiscoveryUrl, stateFromIntent };
});
