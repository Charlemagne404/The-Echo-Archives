const path = require("node:path");

const { loadEntities } = require("../lib/entities");
const { buildEntityGraphReport } = require("../lib/entity-graph-report");
const { readCatalogSource } = require("../../tools/lib/catalog-source");

function resolveSiteRoot() {
  return path.resolve(__dirname, "../..");
}

function getLimit(args) {
  const inline = args.find((argument) => argument.startsWith("--limit="));
  const separateIndex = args.indexOf("--limit");
  const raw = inline ? inline.slice("--limit=".length) : separateIndex >= 0 ? args[separateIndex + 1] : "";
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 20;
}

function formatMetric(metric, denominator) {
  return `${metric.showCount}/${denominator} (${metric.percent}%)`;
}

function printQueue(label, ids, report, limit) {
  console.log(`${label}: ${ids.length}`);
  ids.slice(0, limit).forEach((id) => {
    const show = report.showCoverage.find((entry) => entry.id === id);
    console.log(`- ${id}${show?.title && show.title !== id ? ` — ${show.title}` : ""}`);
  });
  if (ids.length > limit) console.log(`  ... ${ids.length - limit} more; use --json for the complete list.`);
}

function printHumanReport(report, limit, includeAll) {
  const { summary, coverage, relationshipDensity, relationshipTypeCounts, suspiciousRelationships } = report;
  const scopeLabel = includeAll ? "all authored shows + all authored entities" : "published shows + public entities";

  console.log("Entity graph report");
  console.log(`Scope: ${scopeLabel}; authored source only; no external lookups.`);
  console.log(`Shows: ${summary.showCount}`);
  console.log(`Entities: ${summary.entityCount}`);
  console.log(`Known relationship records: ${summary.relationshipCount}`);
  console.log(`Collections: ${summary.collectionCount}`);
  console.log(`Collection memberships: ${summary.collectionMembershipCount} valid of ${report.collectionCoverage.summary.rawMembershipCount} authored entries; shows with membership: ${summary.showsWithCollectionMembership}/${summary.showCount} (${report.collectionCoverage.summary.showsWithMembershipPercent}%)`);
  console.log(`Connected shows: ${summary.connectedShowCount}/${summary.showCount} (${summary.connectedShowPercent}%)`);
  console.log(`Zero-relationship shows: ${summary.zeroRelationshipShowCount}`);
  console.log(`Weakly linked shows (<= ${report.scope.weakShowMaxRelationshipCount} relationship): ${summary.weaklyLinkedShowCount}`);
  console.log(`Bipartite density: ${relationshipDensity.bipartitePercent}% (${relationshipDensity.uniqueShowEntityPairCount} unique show/entity pairs of ${relationshipDensity.possibleShowEntityPairs} possible)`);
  console.log(`Average relationships per connected show: ${relationshipDensity.averageRelationshipsPerConnectedShow}`);
  console.log(`Relationship multiplicity: ${relationshipDensity.relationshipMultiplicityPercent}% of records reuse a show/entity pair through another role or duplicate record.`);
  console.log("");

  console.log("Coverage:");
  [
    ["Any relationship", coverage.anyRelationship],
    ["Creator role", coverage.creatorRelationship],
    ["Production-company role", coverage.productionCompanyRelationship],
    ["Studio role", coverage.studioRelationship],
    ["Network role", coverage.networkRelationship],
    ["Creator evidence in legacy fields", coverage.creatorEvidence],
    ["Creator evidence without a creator relationship", coverage.creatorEvidenceWithoutRelationship],
    ["Only organization relationships", coverage.onlyOrganizationRelationships],
  ].forEach(([label, metric]) => console.log(`- ${label}: ${formatMetric(metric, summary.showCount)}`));
  console.log("");

  console.log("Relationship types:");
  relationshipTypeCounts.forEach((entry) => console.log(`- ${entry.role}: ${entry.relationships} records across ${entry.showCount} shows and ${entry.entityCount} entities (${entry.showPercent}% of shows)`));
  console.log("");

  console.log("Top connected entities:");
  report.topConnectedEntities.slice(0, limit).forEach((entity) => console.log(`- ${entity.name} [${entity.entityId}] — ${entity.showCount} shows, ${entity.relationshipCount} relationships (${entity.type})`));
  console.log("");

  console.log("Entity coverage by type:");
  report.entityCoverageByType.forEach((entry) => console.log(`- ${entry.type}: ${entry.linkedEntityCount}/${entry.entityCount} entities linked (${entry.linkedEntityPercent}%), ${entry.relationshipCount} relationships`));
  console.log("");

  console.log(`Weakly connected entities (<= ${report.scope.weakEntityMaxShowCount} show): ${summary.weakEntityCount}`);
  report.weaklyConnectedEntities.slice(0, limit).forEach((entity) => console.log(`- ${entity.name} [${entity.entityId}] — ${entity.showCount} shows (${entity.type})`));
  if (summary.weakEntityCount > limit) console.log(`  ... ${summary.weakEntityCount - limit} more; use --json for the complete list.`);
  console.log(`Orphan entities: ${summary.orphanEntityCount}`);
  console.log(`Orphan collections: ${report.collectionCoverage.summary.orphanCollectionCount}`);
  console.log(`Shows without collection membership: ${report.collectionCoverage.summary.showsWithoutMembership}`);
  report.collectionCoverage.topCollections.slice(0, Math.min(limit, 5)).forEach((collection) => console.log(`- Collection ${collection.title} [${collection.id}] — ${collection.showCount} shows`));
  console.log("");

  console.log("Enrichment queues:");
  printQueue("Review exact registry-match candidates", report.priorityQueues.reviewRegistryMatch, report, limit);
  printQueue("Review unknown entity links", report.priorityQueues.reviewUnknownLink, report, limit);
  printQueue("Review non-public entity links", report.priorityQueues.reviewNonPublicLink, report, limit);
  printQueue("Research source and add a deliberate link", report.priorityQueues.researchSourceAndLink, report, limit);
  printQueue("Compound legacy evidence", report.priorityQueues.compoundEvidence, report, limit);
  printQueue("No known creator/entity evidence", report.priorityQueues.noKnownEvidence, report, limit);
  console.log("");

  console.log("Legacy evidence coverage:");
  report.evidence.byField.forEach((entry) => console.log(`- ${entry.field}: ${entry.unlinkedShowCount} unlinked shows, ${entry.uniqueValueCount} unique values`));
  console.log("");

  console.log("Most repeated unresolved evidence values (manual review only):");
  report.evidence.unresolvedLegacyValues.slice(0, limit).forEach((entry) => console.log(`- ${entry.field}=${entry.value} — ${entry.showCount} shows`));
  if (report.evidence.unresolvedLegacyValues.length > limit) console.log(`  ... ${report.evidence.unresolvedLegacyValues.length - limit} more; use --json for the complete list.`);
  console.log("");

  console.log("Relationship review signals:");
  console.log(`- Duplicate show/entity/role groups: ${suspiciousRelationships.duplicateRelationshipGroups.length}`);
  console.log(`- Same entity used under multiple roles on one show: ${suspiciousRelationships.sameEntityMultipleRoleGroups.length}`);
  console.log(`- Entity type/relationship-role divergences: ${suspiciousRelationships.roleTypeDivergences.length}`);
  console.log(`- Linked legacy evidence conflicts: ${suspiciousRelationships.linkedEvidenceConflicts.length}`);
  console.log(`- Unknown entity references: ${suspiciousRelationships.unknownEntityReferences.length}`);
  console.log(`- Non-public entity references: ${suspiciousRelationships.nonPublicEntityReferences.length}`);
  console.log(`- Invalid relationship records: ${suspiciousRelationships.invalidRelationshipRecords.length}`);
  console.log("");
  console.log(`Unresolved legacy evidence values: ${report.evidence.unresolvedLegacyValueCount} unique field/value combinations across unlinked shows.`);
  console.log("Legacy evidence is a review queue only; this report never creates or recommends an automatic relationship.");
  console.log("Use --json for show-level evidence, entity show IDs, unresolved values, and complete queues.");
}

function loadReport(siteRoot, includeAll) {
  const sourceData = readCatalogSource(siteRoot);
  const entities = loadEntities(siteRoot, sourceData.shows);
  return buildEntityGraphReport(sourceData.shows, entities, {
    collections: sourceData.collections,
    showStatuses: includeAll ? null : ["published"],
    entityPublications: includeAll ? null : ["public"],
  });
}

function main() {
  const args = process.argv.slice(2);
  const includeAll = args.includes("--all");
  const report = loadReport(resolveSiteRoot(), includeAll);

  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  printHumanReport(report, getLimit(args), includeAll);
  return report;
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
  getLimit,
  loadReport,
  main,
  printHumanReport,
  resolveSiteRoot,
};
