const { appleCollectionIdFromUrl } = require("../../shared/archive-quality");

const SHARED_PROVIDER_IDENTITIES_PATH = "metadata.import.externalResearch.sharedProviderIdentities";

const PROVIDER_IDENTITY_TYPES = Object.freeze({
  rss: Object.freeze({ field: "rssUrl", label: "RSS feed" }),
  apple: Object.freeze({ field: "appleCollectionId", label: "Apple collection" }),
  "podcast-guid": Object.freeze({ field: "podcastGuid", label: "Podcast GUID" }),
  "podcast-index": Object.freeze({ field: "podcastIndexFeedId", label: "Podcast Index feed" }),
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function normalizeUrl(value) {
  try {
    const parsed = new URL(text(value));
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch (_error) {
    return text(value).toLowerCase().replace(/\/$/, "");
  }
}

function normalizeProviderIdentity(provider, value) {
  return provider === "rss" ? normalizeUrl(value) : text(value).toLowerCase();
}

function isHttpUrl(value) {
  try {
    const url = new URL(text(value));
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch (_error) {
    return false;
  }
}

function getProviderIdentityValue(show, provider) {
  const identifiers = isRecord(show?.metadata?.import?.identifiers) ? show.metadata.import.identifiers : {};
  if (provider === "rss") return identifiers.rssUrl || show?.listenLinks?.rss;
  if (provider === "apple") return identifiers.appleCollectionId || appleCollectionIdFromUrl(show?.listenLinks?.apple);
  if (provider === "podcast-guid") return identifiers.podcastGuid;
  if (provider === "podcast-index") return identifiers.podcastIndexFeedId;
  return "";
}

function getProviderIdentity(show, provider) {
  const definition = PROVIDER_IDENTITY_TYPES[provider];
  if (!definition) return null;
  const value = text(getProviderIdentityValue(show, provider));
  const normalizedValue = normalizeProviderIdentity(provider, value);
  if (!value || !normalizedValue) return null;
  return {
    provider,
    field: definition.field,
    label: definition.label,
    value,
    normalizedValue,
  };
}

function getProviderIdentities(show) {
  return Object.keys(PROVIDER_IDENTITY_TYPES)
    .map((provider) => getProviderIdentity(show, provider))
    .filter(Boolean);
}

function buildIdentityGroups(shows) {
  const groups = new Map();
  (Array.isArray(shows) ? shows : []).forEach((show) => {
    getProviderIdentities(show).forEach((identity) => {
      const key = `${identity.provider}:${identity.normalizedValue}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          provider: identity.provider,
          field: identity.field,
          label: identity.label,
          value: identity.value,
          normalizedValue: identity.normalizedValue,
          showIds: [],
        });
      }
      groups.get(key).showIds.push(text(show.id));
    });
  });

  return new Map([...groups.entries()].map(([key, entry]) => [key, {
    ...entry,
    showIds: [...new Set(entry.showIds.filter(Boolean))].sort((left, right) => left.localeCompare(right, "en")),
  }]));
}

function sameIds(left = [], right = []) {
  const leftIds = [...new Set(left)].sort((a, b) => a.localeCompare(b, "en"));
  const rightIds = [...new Set(right)].sort((a, b) => a.localeCompare(b, "en"));
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
}

function readDeclarations(show) {
  const value = show?.metadata?.import?.externalResearch?.sharedProviderIdentities;
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [{ index: 0, declaration: value, containerError: "must be an array" }];
  }
  return value.map((declaration, index) => ({ index, declaration }));
}

function inspectDeclaration(entry, showById, identityGroups) {
  const owner = entry.owner;
  const declaration = entry.declaration;
  const errors = [];
  let provider = "";
  let identity = "";
  let normalizedValue = "";
  let showIds = [];

  if (entry.containerError) errors.push(entry.containerError);
  if (!isRecord(declaration)) {
    errors.push("must be an object");
  } else {
    provider = text(declaration.provider);
    const providerDefinition = PROVIDER_IDENTITY_TYPES[provider];
    if (!providerDefinition) {
      errors.push(`unsupported provider "${provider || "(empty)"}"`);
    }

    if (typeof declaration.identity !== "string" || !declaration.identity.trim()) {
      errors.push("identity must be a non-empty string");
    } else {
      identity = declaration.identity.trim();
      normalizedValue = normalizeProviderIdentity(provider, identity);
      if (!normalizedValue) errors.push("identity is not usable");
    }

    if (!Array.isArray(declaration.showIds) || declaration.showIds.length < 2) {
      errors.push("showIds must name at least two records");
    } else {
      showIds = declaration.showIds.map(text);
      if (showIds.some((showId) => !showId)) errors.push("showIds must contain non-empty record IDs");
      if (new Set(showIds).size !== showIds.length) errors.push("showIds must not contain duplicates");
      if (!showIds.includes(text(owner.id))) errors.push(`showIds must include declaring record "${owner.id}"`);
      showIds.filter((showId) => !showById.has(showId)).forEach((showId) => errors.push(`references unknown show "${showId}"`));
    }

    if (declaration.intentional !== true) errors.push("intentional must be true");
  }

  const externalResearch = owner?.metadata?.import?.externalResearch;
  const sourceUrls = externalResearch?.sourceUrls;
  if (!Array.isArray(sourceUrls) || !sourceUrls.some(isHttpUrl)) {
    errors.push("requires at least one reviewed externalResearch.sourceUrls HTTP(S) source");
  }
  if (!text(externalResearch?.reviewedAt)) {
    errors.push("requires externalResearch.reviewedAt");
  }

  const identityKey = provider && normalizedValue ? `${provider}:${normalizedValue}` : "";
  const actualGroup = identityKey ? identityGroups.get(identityKey) : null;
  if (identityKey && (!actualGroup || actualGroup.showIds.length < 2)) {
    errors.push("does not describe a currently repeated provider identity");
  }

  if (actualGroup && !sameIds(showIds, actualGroup.showIds)) {
    errors.push(`showIds must exactly match current identity participants (${actualGroup.showIds.join(", ")})`);
  }

  showIds.filter((showId) => showById.has(showId)).forEach((showId) => {
    const actualIdentity = getProviderIdentity(showById.get(showId), provider);
    if (!actualIdentity) {
      errors.push(`show "${showId}" has no ${PROVIDER_IDENTITY_TYPES[provider]?.label || provider} identity`);
    } else if (actualIdentity.normalizedValue !== normalizedValue) {
      errors.push(`show "${showId}" does not have the declared ${PROVIDER_IDENTITY_TYPES[provider]?.label || provider} identity`);
    }
  });

  return {
    owner,
    index: entry.index,
    declaration,
    provider,
    identity,
    normalizedValue,
    identityKey,
    showIds,
    errors,
    preliminaryValid: errors.length === 0,
  };
}

function auditProviderIdentityDispositions(shows, options = {}) {
  const allShows = (Array.isArray(shows) ? shows : []).filter(isRecord);
  const selectedShows = Array.isArray(options.selectedShows)
    ? options.selectedShows.filter(isRecord)
    : allShows;
  const showById = new Map(allShows.map((show) => [text(show.id), show]).filter(([id]) => id));
  const identityGroups = buildIdentityGroups(allShows);
  const selectedIdentityGroups = buildIdentityGroups(selectedShows);
  const entries = [];

  selectedShows.forEach((owner) => {
    readDeclarations(owner).forEach((declarationEntry) => {
      entries.push(inspectDeclaration({ ...declarationEntry, owner }, showById, identityGroups));
    });
  });

  const entriesByOwnerAndKey = new Map();
  entries.filter((entry) => entry.preliminaryValid).forEach((entry) => {
    const key = `${entry.owner.id}:${entry.identityKey}:${[...entry.showIds].sort((a, b) => a.localeCompare(b, "en")).join(",")}`;
    if (!entriesByOwnerAndKey.has(key)) entriesByOwnerAndKey.set(key, []);
    entriesByOwnerAndKey.get(key).push(entry);
  });
  entries.filter((entry) => entry.preliminaryValid).forEach((entry) => {
    const participantKeys = entry.showIds.map((showId) => `${showId}:${entry.identityKey}:${[...entry.showIds].sort((a, b) => a.localeCompare(b, "en")).join(",")}`);
    const missingParticipants = participantKeys
      .filter((key) => !entriesByOwnerAndKey.has(key))
      .map((key) => key.split(":", 1)[0]);
    if (missingParticipants.length > 0) {
      entry.errors.push(`every participant must repeat the same disposition; missing: ${[...new Set(missingParticipants)].join(", ")}`);
    }
  });

  const validDispositions = new Map();
  entries.filter((entry) => entry.errors.length === 0).forEach((entry) => {
    if (!validDispositions.has(entry.identityKey)) {
      validDispositions.set(entry.identityKey, {
        provider: entry.provider,
        field: PROVIDER_IDENTITY_TYPES[entry.provider].field,
        label: PROVIDER_IDENTITY_TYPES[entry.provider].label,
        value: entry.identity,
        normalizedValue: entry.normalizedValue,
        showIds: [...entry.showIds].sort((a, b) => a.localeCompare(b, "en")),
        declarationPath: SHARED_PROVIDER_IDENTITIES_PATH,
      });
    }
  });

  const acknowledged = [];
  const unresolvedCollisions = [];
  selectedIdentityGroups.forEach((group, key) => {
    if (group.showIds.length < 2) return;
    const disposition = validDispositions.get(key);
    if (disposition && sameIds(disposition.showIds, group.showIds)) {
      acknowledged.push({ ...group, disposition });
    } else {
      unresolvedCollisions.push({ ...group });
    }
  });

  return {
    providerTypes: Object.fromEntries(Object.entries(PROVIDER_IDENTITY_TYPES).map(([provider, definition]) => [provider, { ...definition }])),
    identityGroups,
    selectedIdentityGroups,
    declarations: entries,
    validDispositions: [...validDispositions.values()],
    invalidDispositions: entries.filter((entry) => entry.errors.length > 0),
    acknowledged,
    unresolvedCollisions,
  };
}

function getProviderIdentityStructuralErrors(shows, options = {}) {
  const allShows = Array.isArray(shows) ? shows.filter(isRecord) : [];
  const selectedShows = Array.isArray(options.selectedShows)
    ? options.selectedShows.filter(isRecord)
    : allShows.filter((show) => show.status === "published");
  const audit = auditProviderIdentityDispositions(allShows, { selectedShows });
  const errors = [
    ...audit.invalidDispositions.map((entry) => `Show "${entry.owner.id}" has invalid ${SHARED_PROVIDER_IDENTITIES_PATH}[${entry.index}]: ${entry.errors.join("; ")}.`),
    ...audit.unresolvedCollisions.map((entry) => `Provider identity ${entry.label} "${entry.value}" is shared by ${entry.showIds.join(", ")} without a valid reciprocal intentional-sharing disposition.`),
  ];
  return { ...audit, errors };
}

module.exports = {
  PROVIDER_IDENTITY_TYPES,
  SHARED_PROVIDER_IDENTITIES_PATH,
  auditProviderIdentityDispositions,
  getProviderIdentity,
  getProviderIdentityStructuralErrors,
};
