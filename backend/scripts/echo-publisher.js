#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const RUNNER_PATH = "/usr/local/sbin/echo-publisher-runner";
const MAX_PACKAGE_BYTES = 18 * 1024 * 1024;

function usage() {
  return [
    "Echo Publisher (authorized active-production operator client)",
    "",
    "  echo-publisher plan --package <publication-package.json>",
    "  echo-publisher inspect <plan-id>",
    "  echo-publisher resolve <plan-id> --approve <plan-sha256> --decisions <review-decisions.json> [--reviewer codex]",
    "  echo-publisher apply <plan-id> --approve <plan-sha256> [--review-facts [--reviewer codex]]",
    "  echo-publisher status <plan-id>",
    "  echo-publisher verify <receipt-id>",
    "",
    "An apply digest authorizes only the exact immutable plan. --review-facts records a",
    "batch factual review; --reviewer codex identifies Codex as the delegated reviewer.",
  ].join("\n");
}

function parseOptions(args, valueOptions = []) {
  const parsed = { positional: [], flags: new Set(), values: {} };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      parsed.positional.push(arg);
      continue;
    }
    if (valueOptions.includes(arg)) {
      if (index + 1 >= args.length || args[index + 1].startsWith("--")) throw new Error(`${arg} requires a value.`);
      parsed.values[arg] = args[index + 1];
      index += 1;
    } else {
      parsed.flags.add(arg);
    }
  }
  const allowed = new Set([...valueOptions, ...[...parsed.flags]]);
  for (const arg of args.filter((item) => item.startsWith("--"))) {
    if (!allowed.has(arg)) throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}

function createRequest(command, args) {
  if (command === "plan") {
    const parsed = parseOptions(args, ["--package"]);
    if (parsed.positional.length !== 0 || !parsed.values["--package"] || parsed.flags.size > 0) throw new Error("Usage: echo-publisher plan --package <publication-package.json>");
    const packageBytes = fs.readFileSync(parsed.values["--package"]);
    if (packageBytes.length === 0 || packageBytes.length > MAX_PACKAGE_BYTES) throw new Error(`Package must be between 1 byte and ${MAX_PACKAGE_BYTES} bytes.`);
    const packageData = JSON.parse(packageBytes.toString("utf8"));
    return {
      command: "plan",
      packageBase64: packageBytes.toString("base64"),
      packageSha256: crypto.createHash("sha256").update(packageBytes).digest("hex"),
      packageData,
    };
  }
  if (command === "apply") {
    const parsed = parseOptions(args, ["--approve", "--reviewer"]);
    if (parsed.positional.length !== 1 || !parsed.values["--approve"] || [...parsed.flags].some((flag) => flag !== "--review-facts") ||
      (parsed.values["--reviewer"] && parsed.values["--reviewer"] !== "codex") ||
      (parsed.values["--reviewer"] && !parsed.flags.has("--review-facts"))) {
      throw new Error("Usage: echo-publisher apply <plan-id> --approve <plan-sha256> [--review-facts [--reviewer codex]]");
    }
    return {
      command: "apply",
      planId: parsed.positional[0],
      approveSha256: parsed.values["--approve"],
      ...(parsed.flags.has("--review-facts") ? { reviewFacts: true } : {}),
      ...(parsed.values["--reviewer"] === "codex" ? { factualReviewer: "delegate:codex" } : {}),
    };
  }
  if (command === "resolve") {
    const parsed = parseOptions(args, ["--approve", "--decisions", "--reviewer"]);
    if (parsed.positional.length !== 1 || !parsed.values["--approve"] || !parsed.values["--decisions"] || parsed.flags.size > 0 ||
      (parsed.values["--reviewer"] && parsed.values["--reviewer"] !== "codex")) {
      throw new Error("Usage: echo-publisher resolve <plan-id> --approve <plan-sha256> --decisions <review-decisions.json> [--reviewer codex]");
    }
    const decisions = JSON.parse(fs.readFileSync(parsed.values["--decisions"], "utf8"));
    if (!Array.isArray(decisions)) throw new Error("Review decision file must contain a JSON array.");
    return {
      command,
      planId: parsed.positional[0],
      approveSha256: parsed.values["--approve"],
      decisions,
      ...(parsed.values["--reviewer"] === "codex" ? { reviewer: "delegate:codex" } : {}),
    };
  }
  if (["inspect", "status"].includes(command)) {
    const parsed = parseOptions(args);
    if (parsed.positional.length !== 1 || parsed.flags.size > 0) throw new Error(`Usage: echo-publisher ${command} <plan-id>`);
    return { command, planId: parsed.positional[0] };
  }
  if (command === "verify") {
    const parsed = parseOptions(args);
    if (parsed.positional.length !== 1 || parsed.flags.size > 0) throw new Error("Usage: echo-publisher verify <receipt-id>");
    return { command, receiptId: parsed.positional[0] };
  }
  throw new Error(usage());
}

function formatPlan(plan) {
  const lines = [
    `Echo Publisher plan ${plan.planId}`,
    `Target: ${plan.target.environment} · active release ${plan.target.plannedReleaseId}`,
    `Package SHA-256: ${plan.packageSha256}`,
    `Approval SHA-256: ${plan.approvalSha256}`,
    `Transaction policy: ${plan.operationPolicy}`,
    `Entries: ${plan.entries.length}`,
  ];
  for (const entry of plan.entries) {
    lines.push("");
    lines.push(`${entry.title} — ${entry.action}${entry.mode === "update" ? ` → ${entry.targetShowId || "unresolved target"}` : ""}`);
    lines.push(`  Creator: ${entry.creatorName || "unknown"}`);
    lines.push(`  Submission identity: ${entry.submissionIds.join(", ")}`);
    lines.push(`  Stable provider identities: ${entry.package?.stableIdentities?.join(", ") || "none supplied"}`);
    if (entry.package?.identityProposal) {
      const identity = entry.package.identityProposal;
      lines.push(`  Unverified identity proposal: ${identity.provider}:${identity.id} · ${identity.title} · ${identity.creatorName} · ${identity.url} [${identity.status}]`);
      lines.push(`    Proposed description: ${JSON.stringify(identity.description)}`);
      lines.push(`    Required confirmation: ${identity.verificationRequired}`);
    }
    if (entry.package?.supplementalSources?.length) lines.push(`  Package research sources: ${entry.package.supplementalSources.join("; ")}`);
    if (entry.candidate) lines.push(`  Target candidate: ${entry.candidate.id} · revision ${entry.candidate.inputRevision} · ${entry.candidate.status} · ${entry.candidate.contentHash}`);
    if (entry.fields?.known && Object.keys(entry.fields.known).length) {
      lines.push(`  Known fields: ${Object.entries(entry.fields.known).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("; ")}`);
    }
    if (entry.fields?.unknownOptional?.length) lines.push(`  Unknown optional fields: ${entry.fields.unknownOptional.join(", ")}`);
    if (entry.sources?.length) lines.push(`  Sources: ${entry.sources.map((source) => `${source.sourceType} ${source.sourceUrl} [${source.fetchStatus}]`).join("; ")}`);
    if (entry.fieldEvidence?.length) {
      lines.push(`  Evidence rows: ${entry.fieldEvidence.length}; ${entry.fieldEvidence.filter((item) => item.selected).length} selected`);
      const conflictFields = new Set((entry.conflicts || []).map((conflict) => conflict.fieldName || conflict.field || ""));
      const relevantFields = new Set(["title", "creatorName", "description", "rssUrl", "appleUrl", "externalIdentity", ...conflictFields]);
      entry.fieldEvidence.filter((evidence) => relevantFields.has(evidence.fieldName)).forEach((evidence) => {
        lines.push(`    ${evidence.fieldName} ${evidence.status}${evidence.selected ? "/selected" : ""} · ${evidence.sourceType} · ${evidence.sourceUrl} · ${JSON.stringify(evidence.value)}`);
      });
    }
    if (entry.conflicts?.length) lines.push(`  Conflicts: ${entry.conflicts.map((item) => JSON.stringify(item)).join("; ")}`);
    if (entry.readiness?.warnings?.length) lines.push(`  Readiness warnings: ${entry.readiness.warnings.map((item) => item.message || item.code || JSON.stringify(item)).join("; ")}`);
    if (entry.requiresFactualReview) lines.push("  Review: current factual review required; the apply batch can record the authorized operator review.");
    if (entry.update?.managedDiff?.length) lines.push(`  Managed update fields: ${entry.update.managedDiff.map((item) => item.field).join(", ")}`);
    if (entry.update?.preservedHumanFields?.length) lines.push(`  Preserved human fields: ${entry.update.preservedHumanFields.join(", ")}`);
    if (entry.blockers?.length) entry.blockers.forEach((blocker) => lines.push(`  BLOCKER [${blocker.code}] ${blocker.field}: ${blocker.message}`));
    if (entry.package?.reviewerNeeds?.length) entry.package.reviewerNeeds.forEach((item) => lines.push(`  Review note: ${item}`));
  }
  const reviewFlag = plan.entries.some((entry) => entry.requiresFactualReview) ? " --review-facts" : "";
  lines.push("");
  lines.push(`Single batch command: echo-publisher apply ${plan.planId} --approve ${plan.approvalSha256}${reviewFlag}`);
  if (reviewFlag) lines.push("If Codex performed the source review, add --reviewer codex to record that delegated reviewer separately from the authorizing OS operator.");
  return lines.join("\n");
}

function formatResponse(response, command) {
  if (!response || typeof response !== "object") return "Publisher returned no response.";
  if (!response.ok) return `${response.code || "ERROR"}: ${response.error || "Publisher operation failed."}`;
  const data = response.data || {};
  if (command === "plan") return formatPlan(data.plan);
  if (command === "inspect") return `${formatPlan(data.plan)}\n\nCurrent status:\n${JSON.stringify(data.status, null, 2)}`;
  if (command === "resolve") {
    const lines = [`Batch factual review ${data.review?.reviewId || "completed"}`];
    if (data.review?.reviewedBy) lines.push(`Reviewed by: ${data.review.reviewedBy}`);
    if (data.review?.authorizedBy) lines.push(`Authorized by: ${data.review.authorizedBy}`);
    if (data.review?.reviewedAt) lines.push(`Reviewed at: ${data.review.reviewedAt}`);
    for (const outcome of data.review?.decisions || []) lines.push(`- ${outcome.submissionId}: ${outcome.status}${outcome.error ? ` — ${outcome.error}` : ""}`);
    if (data.replacementPlan) lines.push("\nUpdated plan after the reviewed decisions:\n", formatPlan(data.replacementPlan.plan));
    return lines.join("\n");
  }
  if (command === "apply") return JSON.stringify(data.receipt || data, null, 2);
  if (command === "status") return JSON.stringify(data, null, 2);
  if (command === "verify") return JSON.stringify({ ...data, publicSiteVerification: data.publicSiteVerification || null }, null, 2);
  return JSON.stringify(data, null, 2);
}

function runnerExitCode(response, status) {
  if (!response?.ok) return 1;
  if (status === 2) return 2;
  return status === 0 ? 0 : 1;
}

function run(command, args, { spawn = spawnSync } = {}) {
  const request = createRequest(command, args);
  const runnerRequest = { ...request };
  delete runnerRequest.packageData;
  const result = spawn("/usr/bin/sudo", ["-n", RUNNER_PATH], {
    input: `${JSON.stringify(runnerRequest)}\n`,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 6 * 60 * 1000,
  });
  if (result.error) throw new Error(`Could not invoke the restricted Echo Publisher host runner: ${result.error.message}`);
  let response;
  try {
    response = JSON.parse(result.stdout || "{}");
  } catch (_error) {
    throw new Error(result.stderr || "The local Echo Publisher runner returned invalid JSON.");
  }
  process.stdout.write(`${formatResponse(response, command)}\n`);
  process.exitCode = runnerExitCode(response, result.status);
  if (result.stderr) process.stderr.write(result.stderr);
  return response;
}

if (require.main === module) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (!command || command === "--help" || command === "help") {
      process.stdout.write(`${usage()}\n`);
    } else {
      run(command, args);
    }
  } catch (error) {
    process.stderr.write(`${error.message || error}\n`);
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
  }
}

module.exports = { createRequest, formatPlan, formatResponse, runnerExitCode, run, usage };
