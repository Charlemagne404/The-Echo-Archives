const path = require("node:path");

const { loadEntities } = require("../lib/entities");
const {
  applyDeterministicEntityLinks,
  buildEntityAttributionReport,
} = require("../lib/entity-attribution");
const {
  readCatalogSource,
  writeShowRecordsAtomically,
} = require("../../tools/lib/catalog-source");

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

function loadReport(siteRoot) {
  const source = readCatalogSource(siteRoot);
  const entities = loadEntities(siteRoot, source.shows);
  return {
    source,
    entities,
    report: buildEntityAttributionReport(source.shows, entities, { collections: source.collections }),
  };
}

function formatCandidate(entry) {
  if (entry.candidateEntity) return `${entry.candidateEntity.name} [${entry.candidateEntity.entityId}]`;
  if (Array.isArray(entry.candidateEntities) && entry.candidateEntities.length) {
    return `${entry.candidateName} (ambiguous: ${entry.candidateEntities.map((candidate) => candidate.name).join("; ")})`;
  }
  return entry.candidateName || "no existing entity candidate";
}

function printEvidence(entry) {
  return entry.evidence.slice(0, 3).map((evidence) => `${evidence.field}=${evidence.value}`).join("; ");
}

function printHumanReport(report, limit, applyResult = null) {
  console.log("Entity attribution report");
  console.log("Scope: published shows + public entities; authored repository data only; no external lookups.");
  console.log("");
  console.log("Graph before / planned after:");
  console.log(`- Typed-linked shows: ${report.before.typedLinkedShows} -> ${report.after.typedLinkedShows}`);
  console.log(`- Typed relationships: ${report.before.relationships} -> ${report.after.relationships}`);
  console.log(`- Zero-relationship shows: ${report.before.zeroRelationshipShows} -> ${report.after.zeroRelationshipShows}`);
  console.log(`- Non-infrastructure attribution gaps: ${report.before.nonInfrastructureAttributionGaps} -> ${report.after.nonInfrastructureAttributionGaps}`);
  console.log("");

  console.log(`Automatic links: ${report.automatic.linkCount} across ${report.automatic.showCount} shows; new show/entity pairs: ${report.automatic.newShowEntityPairCount}`);
  Object.entries(report.automatic.roleCounts).forEach(([role, count]) => console.log(`- ${role}: ${count}`));
  report.automatic.links.slice(0, limit).forEach((entry) => {
    console.log(`  - ${entry.show.title} -> ${entry.entity.name} (${entry.role}); ${printEvidence(entry)}`);
  });
  if (report.automatic.links.length > limit) console.log(`  ... ${report.automatic.links.length - limit} more; use --json for the complete plan.`);
  console.log("");

  console.log(`Human-review queue: ${report.review.itemCount} items across ${report.review.showCount} shows`);
  console.log(`- Unresolved unlinked-show items: ${report.review.unresolvedShowItemCount}`);
  console.log(`- Existing-entity candidate items: ${report.review.existingEntityCandidateCount}`);
  console.log(`- Entity-type/role conflicts: ${report.review.roleConflictItemCount}`);
  console.log(`- Compound candidate items: ${report.review.compoundCandidateCount}`);
  console.log(`- Infrastructure-only shows excluded from entity creation: ${report.review.infrastructureOnlyShowCount}`);
  report.review.queue.slice(0, limit).forEach((entry) => {
    console.log(`- [${entry.confidence}] ${entry.show.title} -> ${formatCandidate(entry)}; role=${entry.proposedRelationshipType || "review role"}; ${entry.reason}`);
    if (printEvidence(entry)) console.log(`  evidence: ${printEvidence(entry)}`);
  });
  if (report.review.queue.length > limit) console.log(`  ... ${report.review.queue.length - limit} more; use --json for the complete ranked queue.`);
  console.log("");

  console.log("Top systemic causes:");
  report.systemicCauses.causes.forEach((cause) => console.log(`- ${cause.label}: ${cause.affectedShowCount} shows; ${cause.action}`));
  console.log("");
  console.log("Recurring source patterns:");
  report.systemicCauses.recurringPatterns.unresolvedValues.slice(0, Math.min(limit, 10)).forEach((pattern) => {
    console.log(`- ${pattern.rawValues.join(" / ")} — ${pattern.showCount} unlinked shows; fields=${pattern.fields.join(", ")}`);
  });
  report.systemicCauses.recurringPatterns.infrastructureValues.slice(0, Math.min(limit, 10)).forEach((pattern) => {
    console.log(`- infrastructure ${pattern.rawValues.join(" / ")} — ${pattern.showCount} unlinked shows; keep excluded`);
  });
  console.log("");
  console.log("No entities were created. Existing source URLs and import provenance are retained on queue evidence for human review.");
  if (applyResult) {
    console.log(`Applied ${applyResult.changedShowCount} authored show records.`);
    applyResult.changedPaths.forEach((filePath) => console.log(`- ${filePath}`));
  } else {
    console.log("This command is report-only by default; pass --apply to author only the deterministic links above.");
  }
}

function main() {
  const args = process.argv.slice(2);
  const siteRoot = resolveSiteRoot();
  const initial = loadReport(siteRoot);
  let applyResult = null;

  if (args.includes("--apply")) {
    const applied = applyDeterministicEntityLinks(initial.source.shows, initial.report.automatic.links);
    if (applied.changedShows.length) {
      const writeResult = writeShowRecordsAtomically(siteRoot, applied.changedShows);
      applyResult = {
        changedShowCount: applied.changedShows.length,
        changedPaths: writeResult.changedPaths.map((filePath) => path.relative(siteRoot, filePath)),
      };
    } else {
      applyResult = { changedShowCount: 0, changedPaths: [] };
    }
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify({
      ...initial.report,
      apply: applyResult,
    }, null, 2));
    return initial.report;
  }

  printHumanReport(initial.report, getLimit(args), applyResult);
  return initial.report;
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
