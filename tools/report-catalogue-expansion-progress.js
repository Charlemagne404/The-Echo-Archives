const fs = require("node:fs");
const path = require("node:path");

const { createImportContext } = require("../backend/scripts/import-helpers");
const { slugify } = require("../backend/lib/import/utils");
const { readShowsFile } = require("../backend/scripts/review-helpers");

const root = path.resolve(__dirname, "..");
const backlogPath = path.join(root, "docs", "catalogue-expansion", "master-backlog.csv");
const progressPath = path.join(root, "docs", "catalogue-expansion", "import-progress.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function candidateMatchScore(candidate, row) {
  const wantedTitle = slugify(row.title);
  const wantedCreator = slugify(row.creator);
  const titles = [candidate.seedQuery, candidate.objective?.title, candidate.title]
    .filter(Boolean)
    .map(slugify);
  if (!titles.includes(wantedTitle)) return 0;
  if (!wantedCreator) return 1;
  const creators = [candidate.objective?.creatorName, candidate.creatorName].filter(Boolean).map(slugify);
  if (creators.some((creator) => creator === wantedCreator)) return 3;
  if (creators.some((creator) => creator.includes(wantedCreator) || wantedCreator.includes(creator))) return 2;
  return 1;
}

function showMatches(show, row) {
  if (slugify(show.title) !== slugify(row.title)) return false;
  if (!row.creator) return true;
  const creatorText = [
    show.creatorName,
    show.credits?.creatorName,
    ...(show.creators || []),
    show.publisher,
    show.metadata?.publisher,
  ].filter(Boolean).map(slugify).join(" ");
  const wantedCreator = slugify(row.creator);
  return !creatorText || creatorText.includes(wantedCreator) || wantedCreator.includes(creatorText);
}

function blockerText(candidate) {
  const blockers = (candidate.readiness?.blockers || []).map((blocker) => blocker.code || blocker.message).filter(Boolean);
  if (candidate.lastError) blockers.push(`error: ${candidate.lastError}`);
  return [...new Set(blockers)].join("; ");
}

function outcomeFor(candidate, showIds) {
  if (candidate) {
    if (candidate.status === "published") return "published";
    if (candidate.status === "duplicate") return "duplicate";
    if (candidate.status === "needs-review") return "needs-review";
    if (candidate.status === "failed") return "failed";
    if (candidate.status === "ready") return "ready";
    return candidate.status || "queued";
  }
  if (showIds.length > 0) return "already-indexed";
  return "unattempted";
}

function main() {
  const rows = parseCsv(fs.readFileSync(backlogPath, "utf8"))
    .slice(1)
    .map(([priority, title, creator], index) => ({ row: index + 2, priority, title, creator: creator || "" }))
    .filter(({ priority }) => priority === "P0" || priority === "P1");
  const context = createImportContext();
  try {
    const candidates = context.service.listForMaintainer({ page: 1, pageSize: 10_000, includeClosed: true }).items;
    const shows = readShowsFile(root);
    const stateRows = rows.map((row) => {
      const candidate = candidates
        .map((item) => ({ item, score: candidateMatchScore(item, row) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score)[0]?.item;
      const showIds = shows.filter((show) => showMatches(show, row)).map((show) => show.id);
      return {
        row,
        candidate,
        showIds,
        values: [
          row.row,
          row.priority,
          row.title,
          row.creator,
          candidate?.id || "",
          outcomeFor(candidate, showIds),
          candidate?.status || "",
          blockerText(candidate || {}),
          candidate?.updatedAt || "",
        ],
      };
    });
    const output = [
      ["backlog_row", "priority", "title", "creator", "candidate_id", "current_outcome", "importer_status", "blocker", "updated_at"],
      ...stateRows.map(({ values }) => values.map(csvCell).join(",")),
    ];
    fs.writeFileSync(progressPath, `${output.join("\n")}\n`);
    const counts = {};
    for (const { values } of stateRows) {
      const outcome = values[5] || "";
      counts[outcome] = (counts[outcome] || 0) + 1;
    }
    console.log(`Wrote ${rows.length} P0/P1 progress rows to ${path.relative(root, progressPath)}.`);
    console.log(Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(", "));
  } finally {
    context.close();
  }
}

main();
