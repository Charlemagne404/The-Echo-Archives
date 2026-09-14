const path = require("node:path");
const readline = require("node:readline/promises");

const {
  EDITABLE_FIELDS,
  PREFERRED_BEST_FOR,
  PREFERRED_TONES,
  SHORT_OPTION_FIELDS,
  applyEnrichmentUpdates,
  buildEnrichmentUpdates,
  buildShowContext,
  formatDiffValue,
  loadEnrichmentData,
  parseAssignment,
  selectNextCandidate,
  writeEnrichedShow,
} = require("./lib/discovery-enrichment");
const { DISCOVERY_PROFILE_VALUES } = require("./lib/catalog-schema");
const { getPublishedShows } = require("./lib/discovery-quality-report");

const SITE_ROOT = path.resolve(__dirname, "..");

function readOptionValue(argv, index, argument) {
  if (argument.includes("=")) return { value: argument.slice(argument.indexOf("=") + 1), nextIndex: index };
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${argument} needs a value.`);
  return { value, nextIndex: index + 1 };
}

function parseArguments(argv = []) {
  const options = {
    allFields: false,
    assignments: [],
    clears: [],
    help: false,
    interactive: false,
    json: false,
    list: false,
    limit: 10,
    next: true,
    showId: "",
    similar: [],
    skip: false,
    write: false,
    yes: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--next") {
      options.next = true;
      options.showId = "";
      continue;
    }
    if (argument === "--interactive") {
      options.interactive = true;
      continue;
    }
    if (argument === "--all-fields") {
      options.allFields = true;
      continue;
    }
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--write") {
      options.write = true;
      continue;
    }
    if (argument === "--yes") {
      options.yes = true;
      continue;
    }
    if (argument === "--skip") {
      options.skip = true;
      continue;
    }
    if (argument === "--list" || argument.startsWith("--list=")) {
      options.list = true;
      const inline = argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) : "";
      if (inline) {
        options.limit = Number(inline);
      } else if (argv[index + 1] && /^\d+$/.test(argv[index + 1])) {
        options.limit = Number(argv[index + 1]);
        index += 1;
      }
      continue;
    }
    if (argument === "--limit" || argument.startsWith("--limit=")) {
      const result = readOptionValue(argv, index, argument);
      options.limit = Number(result.value);
      index = result.nextIndex;
      continue;
    }
    if (argument === "--id" || argument.startsWith("--id=") || argument === "--show" || argument.startsWith("--show=")) {
      const result = readOptionValue(argv, index, argument);
      options.showId = result.value.trim();
      options.next = false;
      index = result.nextIndex;
      continue;
    }
    if (argument === "--set" || argument.startsWith("--set=")) {
      const result = readOptionValue(argv, index, argument);
      options.assignments.push(result.value);
      index = result.nextIndex;
      continue;
    }
    if (argument === "--clear" || argument.startsWith("--clear=")) {
      const result = readOptionValue(argv, index, argument);
      options.clears.push(result.value);
      index = result.nextIndex;
      continue;
    }
    if (argument === "--similar" || argument.startsWith("--similar=")) {
      const result = readOptionValue(argv, index, argument);
      options.similar.push(result.value);
      index = result.nextIndex;
      continue;
    }

    const shortOption = argument.startsWith("--") ? argument.slice(2).split("=")[0] : "";
    if (SHORT_OPTION_FIELDS[shortOption]) {
      const result = readOptionValue(argv, index, argument);
      options.assignments.push(`${SHORT_OPTION_FIELDS[shortOption]}=${result.value}`);
      index = result.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument "${argument}". Use --help for usage.`);
  }

  if (!options.help) {
    if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error("--limit must be a positive integer.");
    if (options.yes && !options.write) throw new Error("--yes requires --write.");
    if (options.list && (options.showId || options.interactive || options.write || options.skip || options.assignments.length || options.clears.length || options.similar.length)) {
      throw new Error("--list only displays the queue; remove editing, writing, or selection options.");
    }
    if (options.skip && (options.assignments.length || options.clears.length || options.similar.length || options.write)) {
      throw new Error("--skip cannot be combined with edits or --write.");
    }
    if (options.json && options.interactive) throw new Error("--json cannot be combined with --interactive.");
  }

  return options;
}

function printHelp(output = process.stdout) {
  output.write(`Discovery enrichment workflow\n\n`);
  output.write(`Inspect the next quality-prioritized show:\n`);
  output.write(`  npm run catalog:enrich:discovery -- --next\n`);
  output.write(`  npm run catalog:enrich:discovery -- --list 10\n\n`);
  output.write(`Edit from arguments (dry-run unless --write is supplied):\n`);
  output.write(`  npm run catalog:enrich:discovery -- --id SHOW_ID \\\n    --voice-style primarily-acted --narrative-focus balanced \\\n    --intensity medium --commitment short \\\n    --tones dark,cinematic --themes survival,found-family \\\n    --best-for headphones-on,long-walks --write\n\n`);
  output.write(`Use repeatable --set FIELD=VALUE for the same fields. Arrays are comma-separated.\n`);
  output.write(`Similarity relationships require explicit reasons, for example:\n`);
  output.write(`  --similar=other-show=Reason this is a useful adjacent route\n`);
  output.write(`Interactive editing:\n`);
  output.write(`  npm run catalog:enrich:discovery -- --next --interactive --write\n`);
  output.write(`  Add --all-fields to revisit already-populated fields; use --skip to leave a target untouched.\n\n`);
  output.write(`Controlled profile values:\n`);
  Object.entries(DISCOVERY_PROFILE_VALUES).forEach(([fieldName, values]) => output.write(`  ${fieldName}: ${values.join(", ")}\n`));
  output.write(`  tones: ${PREFERRED_TONES.join(", ")}\n`);
  output.write(`  bestFor: ${PREFERRED_BEST_FOR.join(", ")}\n`);
  output.write(`\nThe tool edits only the canonical show source record. It never generates subjective values or public artifacts.\n`);
}

function labelForField(fieldPath) {
  return fieldPath
    .replace(/^discovery\./, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (value) => value.toUpperCase());
}

function inline(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(missing)";
  if (value && typeof value === "object") return Object.keys(value).length ? JSON.stringify(value) : "(missing)";
  return String(value ?? "").trim() || "(missing)";
}

function wrapText(value, width = 96) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ["(missing)"];
  const lines = [];
  let line = "";
  words.forEach((word) => {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function printShowContext(context, output = process.stdout) {
  const { show, priority } = context;
  const priorityText = priority
    ? `#${priority.position}/${priority.total} · opportunity ${priority.opportunityScore}`
    : "not currently in the quality enrichment queue";
  output.write(`\n${show.title || show.id} [${show.id}]\n`);
  output.write(`${"─".repeat(Math.min(96, Math.max(24, (show.title || show.id).length + 10)))}\n`);
  output.write(`Priority: ${priorityText}\n`);
  output.write(`Status: ${inline(show.status)} · review: ${inline(show.reviewStatus)} · release: ${inline(show.releaseStatus)} · completion: ${inline(show.completionStatus)}\n`);
  output.write(`\nDescription:\n`);
  wrapText(show.description).forEach((line) => output.write(`  ${line}\n`));

  output.write(`\nCurated discovery:\n`);
  Object.keys(DISCOVERY_PROFILE_VALUES).forEach((fieldName) => {
    const value = show.discovery?.[fieldName];
    output.write(`  ${fieldName}: ${inline(value)}${context.missingDiscoveryFields.includes(fieldName) ? "  ← missing" : ""}\n`);
  });
  ["tones", "themes", "bestFor"].forEach((fieldName) => {
    output.write(`  ${fieldName}: ${inline(show[fieldName])}${!Array.isArray(show[fieldName]) || !show[fieldName].length ? "  ← missing" : ""}\n`);
  });

  output.write(`\nFactual context:\n`);
  output.write(`  Genres: ${inline(show.genres)}\n`);
  output.write(`  Formats: ${inline(show.formats)}\n`);
  output.write(`  Creators: ${inline(context.creators.length ? context.creators : show.credits?.creatorName)}\n`);
  if (show.credits && typeof show.credits === "object") {
    const creditSummary = Object.entries(show.credits)
      .filter(([key]) => key !== "creatorName")
      .map(([key, value]) => `${key}: ${inline(value)}`)
      .slice(0, 6);
    if (creditSummary.length) output.write(`  Credits: ${creditSummary.join(" · ")}\n`);
  }
  output.write(`  Runtime: ${inline(show.length?.label)}${show.length?.episodes ? ` · ${show.length.episodes} episodes` : ""}${show.length?.avgEpisodeMinutes ? ` · ${show.length.avgEpisodeMinutes} min average` : ""}${show.length?.totalHours ? ` · ${show.length.totalHours} hours declared` : ""}${show.length?.totalObservedHours ? ` · ${show.length.totalObservedHours} hours observed` : ""}\n`);
  output.write(`  Release dates: ${inline(show.releaseDates?.first)} → ${inline(show.releaseDates?.latest)}\n`);
  if (show.content && typeof show.content === "object") {
    const contentSummary = ["sourceMaterial", "setting", "pov", "intensity"]
      .filter((key) => show.content[key])
      .map((key) => `${key}: ${inline(show.content[key])}`);
    if (contentSummary.length) output.write(`  Content facts (not auto-translated): ${contentSummary.join(" · ")}\n`);
  }

  output.write(`\nCollections (${context.collections.length}):\n`);
  if (context.collections.length) context.collections.forEach((collection) => output.write(`  - ${collection.title || collection.id} [${collection.id}] (${collection.kind || "uncategorized"})\n`));
  else output.write(`  (none)\n`);

  output.write(`\nEntity relationships (${context.entityRelationships.length}):\n`);
  if (context.entityRelationships.length) context.entityRelationships.forEach((relationship) => output.write(`  - ${relationship.name} [${relationship.role}]${relationship.resolved ? "" : " · unresolved"}\n`));
  else output.write(`  (none)\n`);

  output.write(`\nSimilarity relationships:\n`);
  if (context.outgoingSimilarity.length) context.outgoingSimilarity.forEach((relationship) => output.write(`  - out: ${relationship.title} [${relationship.id}]${relationship.reason ? ` — ${relationship.reason}` : ""}\n`));
  else output.write(`  - out: (none)  ← missing\n`);
  if (context.incomingSimilarity.length) context.incomingSimilarity.forEach((relationship) => output.write(`  - in: ${relationship.title} [${relationship.id}]${relationship.reason ? ` — ${relationship.reason}` : ""}\n`));
  if (context.similarityCandidates.length) {
    output.write(`  Read-only candidates; nothing will be added automatically:\n`);
    context.similarityCandidates.forEach((candidate) => output.write(`  - ${candidate.title} [${candidate.id}] — ${candidate.score}/${candidate.maxScore}; ${candidate.reasons.join("; ")}\n`));
  }

  output.write(`\nMissing quality dimensions from the existing report: ${context.qualityMissing.length ? context.qualityMissing.join(", ") : "none"}\n`);
  output.write(`Editable gaps: ${context.missingEditableFields.length ? context.missingEditableFields.join(", ") : "none"}\n`);
}

function serializeContext(context) {
  const { show, priority } = context;
  return {
    show: {
      id: show.id,
      title: show.title,
      description: show.description,
      status: show.status,
      reviewStatus: show.reviewStatus,
      releaseStatus: show.releaseStatus,
      completionStatus: show.completionStatus,
      genres: show.genres || [],
      formats: show.formats || [],
      creators: context.creators,
      credits: show.credits || {},
      tones: show.tones || [],
      themes: show.themes || [],
      bestFor: show.bestFor || [],
      tags: show.tags || [],
      contentNotes: show.contentNotes || [],
      content: show.content || {},
      discovery: show.discovery || {},
      length: show.length || {},
      releaseDates: show.releaseDates || {},
    },
    priority,
    missingDiscoveryFields: context.missingDiscoveryFields,
    missingEditableFields: context.missingEditableFields,
    collections: context.collections.map(({ id, title, kind }) => ({ id, title, kind })),
    entities: context.entityRelationships,
    outgoingSimilarity: context.outgoingSimilarity,
    incomingSimilarity: context.incomingSimilarity,
    similarityCandidates: context.similarityCandidates,
    qualityMissing: context.qualityMissing,
  };
}

function printDiff(changes, output = process.stdout) {
  output.write(`\nProposed source-record diff:\n`);
  if (!changes.length) {
    output.write(`  (no changes)\n`);
    return;
  }
  changes.forEach((change) => output.write(`  ${change.path}: ${formatDiffValue(change.before)} → ${formatDiffValue(change.after)}\n`));
}

function hasAssignmentForField(options, fieldPath) {
  return options.assignments.some((assignment) => {
    try {
      const parsedField = parseAssignment(assignment).field;
      return parsedField === fieldPath || (fieldPath === "similarTo" && parsedField.startsWith("similarReasons."));
    } catch {
      return false;
    }
  }) || options.clears.includes(fieldPath) || (fieldPath === "similarTo" && options.similar.length > 0);
}

function promptLabel(fieldPath, show) {
  const current = fieldPath.startsWith("discovery.")
    ? show.discovery?.[fieldPath.slice("discovery.".length)]
    : show[fieldPath];
  const allowed = fieldPath === "tones"
    ? ` Allowed: ${PREFERRED_TONES.join(", ")}.`
    : fieldPath === "bestFor"
      ? ` Allowed: ${PREFERRED_BEST_FOR.join(", ")}.`
      : fieldPath.startsWith("discovery.")
        ? ` Allowed: ${DISCOVERY_PROFILE_VALUES[fieldPath.slice("discovery.".length)].join(", ")}.`
        : fieldPath === "similarTo"
          ? " Use SHOW_ID=REASON; separate entries with semicolons."
          : " Comma-separated values are accepted.";
  return `${labelForField(fieldPath)} [${inline(current)}].${allowed}\n  > `;
}

async function promptInteractiveUpdates({ context, options, reader, output }) {
  const assignments = [...options.assignments];
  const clears = [...options.clears];
  const similar = [...options.similar];
  const fields = options.allFields ? [...EDITABLE_FIELDS] : [...context.missingEditableFields];

  output.write(`\nLeave a field blank to keep its current value. Enter - to clear a field.\n`);
  for (const fieldPath of fields) {
    if (hasAssignmentForField({ ...options, assignments, clears, similar }, fieldPath)) continue;
    const answer = (await reader.question(promptLabel(fieldPath, context.show))).trim();
    if (!answer) continue;
    if (answer === "-") {
      clears.push(fieldPath);
    } else if (fieldPath === "similarTo") {
      answer.split(";").map((entry) => entry.trim()).filter(Boolean).forEach((entry) => similar.push(entry));
    } else {
      assignments.push(`${fieldPath}=${answer}`);
    }
  }

  return { assignments, clears, similar };
}

async function promptSelectionAction(reader) {
  const answer = (await reader.question("\n[e]dit, [s]kip, or [q]uit? [e] ")).trim().toLocaleLowerCase();
  if (!answer || answer === "e" || answer === "edit") return "edit";
  if (answer === "s" || answer === "skip") return "skip";
  if (answer === "q" || answer === "quit") return "quit";
  throw new Error(`Unknown action "${answer}". Choose edit, skip, or quit.`);
}

async function createInteractiveReader(input, output) {
  if (input.isTTY) return readline.createInterface({ input, output });

  let bufferedInput = "";
  for await (const chunk of input) bufferedInput += String(chunk);
  const answers = bufferedInput.split(/\r?\n/);
  let answerIndex = 0;
  return {
    question(prompt) {
      output.write(prompt);
      return Promise.resolve(answers[answerIndex++] ?? "");
    },
    close() {},
  };
}

async function confirmWrite({ input, output, yes, reader: existingReader = null }) {
  if (yes) return true;
  if (!input.isTTY) throw new Error("Refusing to write without confirmation. Re-run with --yes --write.");
  const reader = existingReader || readline.createInterface({ input, output });
  try {
    const answer = (await reader.question("\nWrite this one source record? [y/N] ")).trim().toLocaleLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    if (!existingReader) reader.close();
  }
}

function buildContext(data, selection) {
  return buildShowContext({
    show: selection.show,
    priority: selection.priority,
    report: data.report,
    shows: data.sourceData.shows,
    collections: data.sourceData.collections,
    entities: data.entities,
  });
}

function validateSelection(selection) {
  if (!selection?.show) throw new Error("No enrichment-eligible show is currently queued.");
  if (selection.show.status !== "published") throw new Error(`Show "${selection.show.id}" is not published and cannot be selected by this workflow.`);
  if (selection.show.reviewStatus === "imported") throw new Error(`Show "${selection.show.id}" is imported/factual-only and cannot receive curated discovery values.`);
}

async function editSelection({ data, selection, options, input, output }) {
  validateSelection(selection);
  const context = buildContext(data, selection);
  if (!options.json) printShowContext(context, output);
  const interactiveReader = options.interactive ? await createInteractiveReader(input, output) : null;

  try {
    if (options.skip) {
      const skipped = { skipped: true, context: serializeContext(context) };
      if (options.json) output.write(`${JSON.stringify(skipped, null, 2)}\n`);
      else output.write(`\nSkipped ${selection.show.title || selection.show.id}; no source files changed.\n`);
      return skipped;
    }

    if (options.interactive) {
      const action = await promptSelectionAction(interactiveReader);
      if (action === "skip") {
        output.write(`Skipped ${selection.show.title || selection.show.id}; no source files changed.\n`);
        return { skipped: true, context: serializeContext(context) };
      }
      if (action === "quit") {
        output.write(`Quit without changing source files.\n`);
        return { skipped: true, context: serializeContext(context) };
      }
    }

    const requested = options.interactive
      ? await promptInteractiveUpdates({ context, options, reader: interactiveReader, output })
      : { assignments: options.assignments, clears: options.clears, similar: options.similar };
    const knownShowIds = new Set(getPublishedShows(data.sourceData.shows).map((show) => show.id));
    const updates = buildEnrichmentUpdates(requested, selection.show, { knownShowIds });
    const result = applyEnrichmentUpdates(selection.show, updates);
    const summary = { context: serializeContext(context), changes: result.changes };

    if (!result.changes.length) {
      if (options.json) output.write(`${JSON.stringify({ ...summary, written: false }, null, 2)}\n`);
      else {
        printDiff(result.changes, output);
        output.write(`No source record was changed.\n`);
      }
      return { skipped: false, ...summary, written: false };
    }
    if (!options.write) {
      if (options.json) output.write(`${JSON.stringify({ ...summary, written: false, dryRun: true }, null, 2)}\n`);
      else {
        printDiff(result.changes, output);
        output.write(`Dry run only. Add --write to persist this exact show source record.\n`);
      }
      return { skipped: false, ...summary, written: false, dryRun: true };
    }

    if (!options.json) printDiff(result.changes, output);

    const confirmed = await confirmWrite({ input, output, yes: options.yes, reader: interactiveReader });
    if (!confirmed) {
      const notWritten = { skipped: false, ...summary, written: false };
      if (options.json) output.write(`${JSON.stringify(notWritten, null, 2)}\n`);
      else output.write(`Not written.\n`);
      return notWritten;
    }

    const writeResult = writeEnrichedShow({
      siteRoot: data.siteRoot,
      sourceData: data.sourceData,
      entities: data.entities,
      originalShow: selection.show,
      updatedShow: result.record,
    });
    const written = { skipped: false, ...summary, written: true, changedPaths: writeResult.changedPaths };
    if (options.json) output.write(`${JSON.stringify(written, null, 2)}\n`);
    else {
      output.write(`Wrote ${selection.show.id} only: ${writeResult.changedPaths.join(", ")}\n`);
      output.write(`Generated data was not rebuilt. Run npm run build:catalog after reviewing the source diff.\n`);
    }
    return written;
  } finally {
    if (interactiveReader) interactiveReader.close();
  }
}

function printQueue(data, limit, output = process.stdout, json = false) {
  const entries = data.report.enrichmentPriorities.candidateIds.slice(0, limit).map((id, index) => {
    const candidate = data.report.enrichmentPriorities.sample.find((entry) => entry.id === id) || { id };
    return {
      position: index + 1,
      id,
      title: candidate.title,
      opportunityScore: candidate.opportunityScore,
      score: candidate.score,
      maxScore: candidate.maxScore,
      missing: candidate.missing || [],
    };
  });
  if (json) output.write(`${JSON.stringify({ total: data.report.enrichmentPriorities.candidateCount, entries }, null, 2)}\n`);
  else {
    output.write(`Discovery enrichment queue (existing discovery-quality priority order)\n`);
    output.write(`Candidates: ${data.report.enrichmentPriorities.candidateCount}\n\n`);
    entries.forEach((entry) => output.write(`${entry.position}. ${entry.title} [${entry.id}] — opportunity ${entry.opportunityScore}; quality ${entry.score}/${entry.maxScore}; missing ${entry.missing.join(", ") || "none"}\n`));
  }
}

async function run(argv = process.argv.slice(2), {
  siteRoot = SITE_ROOT,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  const options = parseArguments(argv);
  if (options.help) {
    printHelp(output);
    return { help: true };
  }

  const data = loadEnrichmentData(siteRoot);
  if (options.list) {
    printQueue(data, options.limit, output, options.json);
    return { list: true };
  }

  const selection = selectNextCandidate({
    report: data.report,
    shows: data.sourceData.shows,
    showId: options.showId,
  });
  validateSelection(selection);

  return editSelection({ data, selection, options, input, output });
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArguments,
  printHelp,
  printQueue,
  printShowContext,
  run,
  serializeContext,
};
