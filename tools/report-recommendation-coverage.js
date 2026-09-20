const fs = require("node:fs");
const path = require("node:path");

const { loadEntities } = require("../backend/lib/entities");
const { buildGeneratedSimilarityCollections } = require("../backend/lib/shows-like-routes");
const { resolveShowEntities } = require("../shared/archive-entities");
const { normalizeCollectionRecord, normalizeShowRecord } = require("../shared/archive-record");
const { readCatalogSource } = require("./lib/catalog-source");
const { buildRecommendationCoverageReport } = require("./lib/recommendation-coverage-report");

const DEFAULT_SAMPLE_LIMIT = 12;

function resolveSiteRoot() {
  return path.resolve(__dirname, "..");
}

function parseArguments(argv) {
  const options = { json: false, sampleLimit: DEFAULT_SAMPLE_LIMIT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--limit" || argument.startsWith("--limit=")) {
      const raw = argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) : argv[++index];
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1) throw new Error("--limit must be a positive integer.");
      options.sampleLimit = value;
      continue;
    }
    throw new Error("Unknown argument. Use --json or --limit N.");
  }
  return options;
}

function loadRecommendationCoverageData(siteRoot) {
  const sourceData = readCatalogSource(siteRoot);
  const sourceShows = sourceData.shows.filter((show) => show && show.status === "published");
  const entities = loadEntities(siteRoot, sourceData.shows);
  const shows = sourceShows.map((record) => {
    const show = normalizeShowRecord(record);
    const resolvedEntities = resolveShowEntities(show, entities);
    return resolvedEntities.length ? { ...show, resolvedEntities } : show;
  });
  const sourceCollections = sourceData.collections.map(normalizeCollectionRecord);
  const generatedCollections = buildGeneratedSimilarityCollections({
    shows,
    collections: sourceCollections,
  }).map(normalizeCollectionRecord);

  return {
    shows,
    legacyCollections: sourceCollections,
    collections: [...sourceCollections, ...generatedCollections],
  };
}

function formatLevelCounts(levelCounts) {
  return ["none", "thin", "covered"].map((level) => `${level}=${levelCounts[level] || 0}`).join(", ");
}

function formatRecommendationCoverageReport(report, options = {}) {
  const sampleLimit = Number.isInteger(options.sampleLimit) && options.sampleLimit > 0 ? options.sampleLimit : DEFAULT_SAMPLE_LIMIT;
  const lines = [
    "Recommendation coverage audit",
    "Read-only, deterministic report from authoritative catalogue source files plus runtime-generated Shows Like routes.",
    `Scope: ${report.scope.publishedShows} published shows (${report.scope.enrichmentEligibleShows} enrichment-eligible, ${report.scope.importedShows} imported), ${report.scope.sourceCollections} source collections / ${report.scope.runtimeCollections} runtime collections.`,
    "",
    "## Before / after definition",
    "",
    `- Previous metadata-quality proxy: ${formatLevelCounts(report.beforeAfter.legacyProxy.levelCounts)}; covered=${report.beforeAfter.legacyProxy.coveredPercentage}%.`,
    `- Surface-aware recommendation coverage: ${formatLevelCounts(report.beforeAfter.surfaceAware.levelCounts)}; covered=${report.beforeAfter.surfaceAware.coveredPercentage}%.`,
    "- The surface-aware result counts authored incoming/outgoing routes and public computed Try Next matches separately; it does not treat a broad metadata candidate as a recommendation.",
    "",
    "## Current recommendation surfaces",
    "",
    `- Authored coverage: ${report.coverage.authoredSources} shows have at least one authored relationship or authored similarity route member.`,
    `- Computed Try Next coverage: ${report.coverage.computedSources} shows have at least one public computed match; computed-only sources=${report.coverage.computedOnlySources}.`,
    `- Dedicated Shows Like anchors: ${report.coverage.showsLikeAnchors}; similarity routes=${report.coverage.similarityRouteCount} (${report.coverage.generatedSimilarityRouteCount} generated).`,
    `- Diagnostic candidates exist for ${report.coverage.diagnosticCandidateSources} shows; ${report.coverage.diagnosticCandidateFreeSources} have none even at the broad diagnostic gate.`,
    "",
    "## Remaining blockers",
    "",
  ];

  if (report.blockers.every((group) => group.count === 0)) {
    lines.push("No uncovered or thin records.");
  } else {
    lines.push("| Cause | Records | None | Thin | Share of gaps | Example IDs |", "| --- | ---: | ---: | ---: | ---: | --- | ");
    report.blockers.forEach((group) => {
      lines.push(`| ${group.label} (${group.id}) | ${group.count} | ${group.levelCounts.none || 0} | ${group.levelCounts.thin || 0} | ${group.percentageOfGaps}% | ${group.affectedIds.slice(0, 5).join(", ") || "—"} |`);
    });
  }

  lines.push("", "## Highest-leverage metadata for the remaining gap", "", "| Field | Role | Missing in gap set | Weight | Why it matters |", "| --- | --- | ---: | ---: | --- | ");
  report.metadataLeverage.slice(0, sampleLimit).forEach((field) => {
    const why = field.role === "specific-public-evidence"
      ? "Counts toward the public specific-evidence floor; one field alone is not enough."
      : field.role === "factual-anchor"
        ? "Supports factual anchoring and record coverage; it does not replace specific discovery evidence."
        : "Raises comparable record coverage once the specific-evidence floor is met.";
    lines.push(`| ${field.label} (${field.id}) | ${field.role} | ${field.missingCount}/${field.denominator} (${field.missingPercentage}%) | ${field.weight} | ${why} |`);
  });
  lines.push("", "## Representative gap records", "", "| Show | Level | Cause | Authored | Computed | Diagnostic | Metadata coverage | Missing specific fields |", "| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ");
  report.records
    .filter((record) => record.level !== "covered")
    .sort((left, right) => left.level.localeCompare(right.level) || String(left.title).localeCompare(String(right.title), "en"))
    .slice(0, sampleLimit)
    .forEach((record) => {
      lines.push(`| ${record.title} (${record.id}) | ${record.level} | ${record.causeId || "—"} | ${record.authoredCount} | ${record.computedCount} | ${record.diagnosticCandidateCount} | ${Math.round(record.metadataCoverage * 100)}% | ${record.availableSpecificDimensions.length ? "missing gate context" : "all public-specific fields"} |`);
    });
  if (!report.records.some((record) => record.level !== "covered")) lines.push("| none | — | — | — | — | — | — | — |");

  lines.push(
    "",
    "## Interpretation",
    "",
    "- Imported records are factual-only by policy. Their broad source-derived genre/format/runtime overlap is diagnostic evidence, not public recommendation evidence.",
    "- The remaining imported gap requires reviewed promotion/enrichment; raw source keywords must not be copied into public discovery fields automatically.",
    "- No recommendation thresholds were lowered, no authored links were generated, and dedicated Shows Like route requirements were unchanged.",
    `- Structural issues: ${report.structuralIssues.showCount} shows and ${report.structuralIssues.collectionCount} collections have malformed recommendation references; these should be repaired before enrichment work.`,
    "",
    `Use --json for complete record-level causes and affected IDs. Report version ${report.version}.`,
  );
  return lines.join("\n");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = buildRecommendationCoverageReport(loadRecommendationCoverageData(resolveSiteRoot()));
  process.stdout.write(options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatRecommendationCoverageReport(report, { sampleLimit: options.sampleLimit })}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_SAMPLE_LIMIT,
  formatRecommendationCoverageReport,
  loadRecommendationCoverageData,
  main,
  parseArguments,
  resolveSiteRoot,
};
