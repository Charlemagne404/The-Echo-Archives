#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { submissionIdentityKeys, archiveIdentityKeys } = require("../lib/services/import-service");
const { slugify } = require("../lib/import/utils");

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [key, inlineValue] = token.slice(2).split("=", 2);
    const value = inlineValue === undefined ? argv[++index] : inlineValue;
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value.`);
    values[key] = value;
  }
  if (!values.db || !values.catalog) {
    throw new Error("Usage: node scripts/submission-reconciliation-dry-run.js --db <read-only-sqlite-path> --catalog <current-shows-json-path>");
  }
  return values;
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || ""));
  } catch (_error) {
    return fallback;
  }
}

function asText(value) {
  return String(value || "").trim();
}

function identityKey(identity) {
  return `${identity.type}:${identity.value}`;
}

function findTitleMatches(submission, shows) {
  const title = slugify(submission.show_title || "");
  if (!title) return [];
  const creator = slugify(submission.creator_name || "");
  return shows.flatMap((show) => {
    const titles = [show.title, ...(Array.isArray(show.aliases) ? show.aliases : [])].filter(Boolean);
    if (!titles.some((candidate) => slugify(candidate) === title)) return [];
    const creators = [show.credits?.creatorName, show.creatorName, ...(Array.isArray(show.creators) ? show.creators : [])]
      .map(slugify).filter(Boolean);
    if (creator && creators.length && !creators.includes(creator)) return [];
    return [{ showId: show.id, title: show.title, evidence: "exact-title-or-alias" }];
  }).slice(0, 10);
}

function buildManifest({ submissions = [], candidates = [], shows = [], checkedAt = new Date().toISOString() } = {}) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const candidateBySubmissionId = new Map(candidates
    .filter((candidate) => candidate.primary_source_type === "submission" && candidate.primary_source_key)
    .map((candidate) => [candidate.primary_source_key, candidate]));
  const showIdentities = new Map();
  shows.forEach((show) => archiveIdentityKeys(show).forEach((identity) => {
    const rows = showIdentities.get(identityKey(identity)) || [];
    rows.push({ id: show.id, title: show.title, identityType: identity.type });
    showIdentities.set(identityKey(identity), rows);
  }));

  const normalized = submissions.filter((row) => row.submission_type === "show").map((row) => {
    const payload = parseJson(row.payload_json, {});
    const submission = { ...row, payload };
    const candidate = candidateById.get(asText(row.import_candidate_id)) || candidateBySubmissionId.get(row.id) || null;
    const identities = submissionIdentityKeys(submission);
    const identityMatches = new Map();
    identities.forEach((identity) => (showIdentities.get(identityKey(identity)) || []).forEach((show) => {
      const matches = identityMatches.get(show.id) || { id: show.id, title: show.title, identityTypes: new Set() };
      matches.identityTypes.add(identity.type);
      identityMatches.set(show.id, matches);
    }));
    const strongMatches = [...identityMatches.values()].map((match) => ({
      id: match.id,
      title: match.title,
      identityTypes: [...match.identityTypes].sort(),
    }));
    return {
      id: row.id,
      submittedAt: row.submitted_at,
      title: row.show_title || "Submission details redacted",
      moderationStatus: row.status,
      currentResolutionStatus: row.resolution_status || "",
      candidateId: candidate?.id || "",
      candidateStatus: candidate?.status || "",
      candidatePublishedShowId: candidate?.published_show_id || "",
      identities,
      strongMatches,
      potentialTitleMatches: findTitleMatches(submission, shows),
    };
  });

  const duplicateGroups = new Map();
  normalized.forEach((row) => row.identities.forEach((identity) => {
    const key = identityKey(identity);
    const group = duplicateGroups.get(key) || [];
    group.push(row);
    duplicateGroups.set(key, group);
  }));
  const duplicateOf = new Map();
  duplicateGroups.forEach((group, key) => {
    const unique = [...new Map(group.map((row) => [row.id, row])).values()];
    if (unique.length < 2) return;
    const published = unique.filter((row) => row.candidateStatus === "published" && row.candidatePublishedShowId);
    const canonical = [...(published.length ? published : unique)].sort((left, right) => (
      String(left.submittedAt).localeCompare(String(right.submittedAt)) || left.id.localeCompare(right.id)
    ))[0];
    unique.filter((row) => row.id !== canonical.id).forEach((row) => {
      const prior = duplicateOf.get(row.id);
      if (!prior || (canonical.candidatePublishedShowId && !prior.canonicalShowId)) {
        duplicateOf.set(row.id, {
          canonicalSubmissionId: canonical.id,
          canonicalShowId: canonical.candidatePublishedShowId || "",
          identityType: key.split(":", 1)[0],
        });
      }
    });
  });

  const manifestRows = normalized.map((row) => {
    let resolutionStatus = row.currentResolutionStatus || "open";
    let action = "retain-for-review";
    let reason = "no automatic resolution evidence";
    let targetShowId = "";
    let confidence = "low";
    let evidence = {};
    if (row.currentResolutionStatus && row.currentResolutionStatus !== "open") {
      resolutionStatus = row.currentResolutionStatus;
      action = "preserve-existing-resolution";
      reason = "row is already resolved";
    } else if (row.candidateStatus === "published" && row.candidatePublishedShowId) {
      resolutionStatus = "published";
      action = "resolve-published";
      reason = "published importer candidate is tied to this exact submission ID";
      targetShowId = row.candidatePublishedShowId;
      confidence = "high";
      evidence = { candidateId: row.candidateId, source: "primary-source-submission-id" };
    } else if (duplicateOf.has(row.id)) {
      const duplicate = duplicateOf.get(row.id);
      resolutionStatus = "duplicate";
      action = "consolidate-duplicate";
      reason = "shared strong provider identity; preserve both submission rows";
      targetShowId = duplicate.canonicalShowId;
      confidence = "high";
      evidence = { identityType: duplicate.identityType, canonicalSubmissionId: duplicate.canonicalSubmissionId };
    } else if (row.strongMatches.length === 1) {
      resolutionStatus = "already-listed";
      action = "resolve-already-listed";
      reason = "shared strong provider identity with an archive show";
      targetShowId = row.strongMatches[0].id;
      confidence = "high";
      evidence = { identityTypes: row.strongMatches[0].identityTypes };
    } else if (row.strongMatches.length > 1) {
      action = "manual-review";
      reason = "strong provider identities point to more than one archive show";
      confidence = "conflicting";
      evidence = { conflictingShowIds: row.strongMatches.map((match) => match.id) };
    } else if (row.candidateStatus === "needs-review") {
      action = "retain-for-review";
      reason = "linked importer candidate needs maintainer review and no strong archive match exists";
      confidence = "medium-high no-match";
      evidence = { candidateId: row.candidateId, candidateStatus: row.candidateStatus };
    } else if (row.potentialTitleMatches.length) {
      action = "manual-review";
      reason = "title or alias match is not sufficient for automatic resolution";
      confidence = "manual verification required";
      evidence = { potentialShowIds: row.potentialTitleMatches.map((match) => match.showId) };
    } else {
      action = "retain-open";
      reason = "no archive match or linked importer candidate; preserve as unresolved operational work";
      confidence = "no match found";
    }
    return {
      id: row.id,
      submittedAt: row.submittedAt,
      title: row.title,
      before: {
        moderationStatus: row.moderationStatus,
        resolutionStatus: row.currentResolutionStatus || "not-migrated",
        importerCandidateId: row.candidateId,
        importerCandidateStatus: row.candidateStatus,
      },
      after: { resolutionStatus, action, targetShowId, evidence, reason, confidence },
      potentialTitleMatches: row.potentialTitleMatches,
    };
  });
  const counts = manifestRows.reduce((result, row) => {
    result[row.after.action] = (result[row.after.action] || 0) + 1;
    return result;
  }, {});

  return {
    generatedAt: checkedAt,
    mode: "read-only-dry-run",
    writesPerformed: false,
    archiveCount: shows.length,
    submissionCount: manifestRows.length,
    recommendedActions: counts,
    rows: manifestRows,
  };
}

function readCatalog(catalogPath) {
  const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const shows = Array.isArray(parsed) ? parsed : parsed.shows || parsed.records;
  if (!Array.isArray(shows)) throw new Error("Catalog JSON must be a show array or contain a shows array.");
  return shows;
}

function readDatabaseRows(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    db.pragma("query_only = ON");
    const quickCheck = db.pragma("quick_check", { simple: true });
    if (quickCheck !== "ok") throw new Error(`SQLite quick_check failed: ${quickCheck}`);
    const foreignKeyFailures = db.pragma("foreign_key_check");
    if (foreignKeyFailures.length) throw new Error(`SQLite foreign_key_check found ${foreignKeyFailures.length} violations.`);
    const submissionColumns = new Set(db.prepare("PRAGMA table_info(show_submissions)").all().map((column) => column.name));
    const resolutionSelect = submissionColumns.has("resolution_status") ? "resolution_status" : "'' AS resolution_status";
    const submissions = db.prepare(`
      SELECT id, status, submission_type, submitted_at, show_title, creator_name,
        official_site, rss_or_listen_link, payload_json, import_candidate_id,
        ${resolutionSelect}
      FROM show_submissions WHERE submission_type = 'show'
      ORDER BY datetime(submitted_at), id
    `).all();
    const candidates = db.prepare(`
      SELECT id, status, primary_source_type, primary_source_key, published_show_id
      FROM catalog_import_candidates
      WHERE primary_source_type = 'submission' OR id IN (
        SELECT import_candidate_id FROM show_submissions WHERE import_candidate_id <> ''
      )
    `).all();
    return { submissions, candidates };
  } finally {
    db.close();
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const dbPath = path.resolve(args.db);
  const catalogPath = path.resolve(args.catalog);
  const { submissions, candidates } = readDatabaseRows(dbPath);
  const manifest = buildManifest({ submissions, candidates, shows: readCatalog(catalogPath) });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message || String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { buildManifest, readDatabaseRows };
