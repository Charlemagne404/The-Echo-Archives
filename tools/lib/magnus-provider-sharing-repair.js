const { assertCatalogIntegrity, collectCatalogIntegrityIssues } = require("../../backend/lib/catalog-integrity");
const { buildCatalog } = require("../build-catalog");
const { readCatalogSource, writeShowRecordsAtomically } = require("./catalog-source");
const { getProviderIdentity } = require("./provider-identity-dispositions");
const { recoverCatalogPublication, runWithCatalogPublication } = require("./catalog-publication-transaction");

const MAGNUS_SHOW_IDS = Object.freeze(["the-magnus-archives", "the-magnus-protocol"]);
const MAGNUS_IDENTITIES = Object.freeze({
  rss: "https://feeds.acast.com/public/shows/b6085bcd-3542-4a43-b6a8-021e3fd251b8",
  apple: "1095138637",
});

const EXPECTED_COLLISION_ERRORS = Object.freeze([
  `Provider identity RSS feed "${MAGNUS_IDENTITIES.rss}" is shared by ${MAGNUS_SHOW_IDS.join(", ")} without a valid reciprocal intentional-sharing disposition.`,
  `Provider identity Apple collection "${MAGNUS_IDENTITIES.apple}" is shared by ${MAGNUS_SHOW_IDS.join(", ")} without a valid reciprocal intentional-sharing disposition.`,
]);

function recordMap(shows, label) {
  const matching = shows.filter((show) => MAGNUS_SHOW_IDS.includes(show?.id));
  if (matching.length !== MAGNUS_SHOW_IDS.length || new Set(matching.map((show) => show.id)).size !== MAGNUS_SHOW_IDS.length) {
    throw new Error(`${label} must contain exactly one record for each Magnus show.`);
  }
  return new Map(matching.map((show) => [show.id, show]));
}

function assertProviderIdentities(showById, label) {
  for (const showId of MAGNUS_SHOW_IDS) {
    const show = showById.get(showId);
    for (const [provider, expected] of Object.entries(MAGNUS_IDENTITIES)) {
      const identity = getProviderIdentity(show, provider);
      if (!identity || identity.normalizedValue !== expected.toLowerCase()) {
        throw new Error(`${label} record "${showId}" no longer has the reviewed ${provider} identity.`);
      }
    }
  }
}

function declarationMatches(declaration, canonicalDeclaration) {
  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)) return false;
  const leftIds = Array.isArray(declaration.showIds) ? [...new Set(declaration.showIds)].sort() : [];
  const rightIds = Array.isArray(canonicalDeclaration.showIds) ? [...new Set(canonicalDeclaration.showIds)].sort() : [];
  return declaration.provider === canonicalDeclaration.provider &&
    declaration.identity === canonicalDeclaration.identity &&
    declaration.intentional === true &&
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index]);
}

function canonicalDeclarations(canonicalShows) {
  const records = recordMap(canonicalShows, "Canonical source");
  assertProviderIdentities(records, "Canonical source");
  const required = [];
  for (const [provider, identity] of Object.entries(MAGNUS_IDENTITIES)) {
    const participantDeclarations = MAGNUS_SHOW_IDS.map((showId) => {
      const research = records.get(showId)?.metadata?.import?.externalResearch;
      const declaration = research?.sharedProviderIdentities?.find((item) =>
        item?.provider === provider && item?.identity === identity);
      if (!declaration || declaration.intentional !== true ||
        !Array.isArray(declaration.showIds) ||
        [...new Set(declaration.showIds)].sort().join("\0") !== [...MAGNUS_SHOW_IDS].sort().join("\0")) {
        throw new Error(`Canonical source is missing the reciprocal ${provider} sharing declaration for the Magnus shows.`);
      }
      const sourceUrls = research.sourceUrls;
      if (!Array.isArray(sourceUrls) || !sourceUrls.some((source) => /^https:\/\/rustyquill\.com\/show\//i.test(source))) {
        throw new Error(`Canonical source is missing reviewed official evidence for the Magnus ${provider} sharing declaration.`);
      }
      return declaration;
    });
    if (!declarationMatches(participantDeclarations[0], participantDeclarations[1])) {
      throw new Error(`Canonical ${provider} sharing declarations are not reciprocal.`);
    }
    required.push(participantDeclarations[0]);
  }
  return { records, required };
}

function mergeUniqueStrings(existing, additions) {
  const result = [];
  const seen = new Set();
  [...existing, ...additions].forEach((value) => {
    if (typeof value !== "string" || !value.trim()) return;
    const cleaned = value.trim();
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    result.push(cleaned);
  });
  return result;
}

function buildPatchedRecords(sourceShows, canonicalShows) {
  const currentById = recordMap(sourceShows, "Production source");
  const canonical = canonicalDeclarations(canonicalShows);
  assertProviderIdentities(currentById, "Production source");

  return MAGNUS_SHOW_IDS.map((showId) => {
    const current = currentById.get(showId);
    const canonicalShow = canonical.records.get(showId);
    const currentImport = current?.metadata?.import;
    const currentResearch = currentImport?.externalResearch;
    const canonicalResearch = canonicalShow?.metadata?.import?.externalResearch;
    if (!currentImport || !currentResearch || !Array.isArray(currentResearch.sourceUrls)) {
      throw new Error(`Production source record "${showId}" is missing its reviewed external research record.`);
    }
    if (typeof currentResearch.reviewedAt !== "string" || !currentResearch.reviewedAt.trim()) {
      throw new Error(`Production source record "${showId}" has no existing external research review timestamp.`);
    }

    const next = JSON.parse(JSON.stringify(current));
    const nextResearch = next.metadata.import.externalResearch;
    const declarations = Array.isArray(nextResearch.sharedProviderIdentities)
      ? [...nextResearch.sharedProviderIdentities]
      : [];
    canonical.required.forEach((declaration) => {
      if (!declarations.some((existing) => declarationMatches(existing, declaration))) declarations.push(declaration);
    });
    nextResearch.sourceUrls = mergeUniqueStrings(nextResearch.sourceUrls, canonicalResearch.sourceUrls);
    nextResearch.sharedProviderIdentities = declarations;
    return next;
  });
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function assertOnlyKnownMagnusConflicts(report) {
  if (report.errors.length === 0) return;
  if (JSON.stringify(sorted(report.errors)) !== JSON.stringify(sorted(EXPECTED_COLLISION_ERRORS))) {
    const error = new Error(`Refusing the Magnus catalogue repair because full-catalogue validation found ${report.errors.length} unexpected error(s):\n- ${report.errors.join("\n- ")}`);
    error.report = report;
    throw error;
  }
}

async function repairMagnusProviderSharing(siteRoot, canonicalRoot, options = {}) {
  if (!siteRoot || !canonicalRoot) throw new TypeError("Production and canonical catalogue roots are required.");
  const recover = options.recoverCatalogPublication || recoverCatalogPublication;
  const readSource = options.readCatalogSource || readCatalogSource;
  const collectIssues = options.collectCatalogIntegrityIssues || collectCatalogIntegrityIssues;
  const writeShows = options.writeShowRecordsAtomically || writeShowRecordsAtomically;
  const build = options.buildCatalog || buildCatalog;
  const assertIntegrity = options.assertCatalogIntegrity || assertCatalogIntegrity;

  const recovery = recover(siteRoot);
  if (recovery?.pendingDatabaseRecovery) {
    throw new Error("The previous publisher transaction still needs its database recovery step; run Echo Publisher recovery before the Magnus repair.");
  }

  const current = readSource(siteRoot);
  const canonical = readSource(canonicalRoot);
  const before = collectIssues({ siteRoot, sourceData: current });
  assertOnlyKnownMagnusConflicts(before);

  const patchedRecords = before.errors.length > 0
    ? buildPatchedRecords(current.shows, canonical.shows)
    : [];
  const changedShowIds = patchedRecords.map((show) => show.id);
  let transaction = null;
  let finalReport = null;

  async function buildAndValidate() {
    await build(siteRoot, { recoverCovers: false });
    finalReport = assertIntegrity(siteRoot);
    const finalSource = readSource(siteRoot);
    const finalById = recordMap(finalSource.shows, "Production source after repair");
    assertProviderIdentities(finalById, "Production source after repair");
    const errors = collectIssues({ siteRoot, sourceData: finalSource }).errors;
    if (errors.length > 0) {
      throw new Error(`Magnus sharing repair did not produce a valid full catalogue: ${errors.join("; ")}`);
    }
  }

  try {
    if (patchedRecords.length > 0) {
      transaction = writeShows(siteRoot, patchedRecords, { deferCommit: true });
      await runWithCatalogPublication(transaction.publicationToken, buildAndValidate);
      transaction.commit();
    } else {
      await buildAndValidate();
    }
  } catch (error) {
    if (transaction) transaction.rollback();
    throw error;
  }

  return {
    changedShowIds,
    catalogueStats: finalReport.stats,
    integrityErrors: finalReport.errors.length,
  };
}

module.exports = {
  EXPECTED_COLLISION_ERRORS,
  MAGNUS_IDENTITIES,
  MAGNUS_SHOW_IDS,
  repairMagnusProviderSharing,
};
