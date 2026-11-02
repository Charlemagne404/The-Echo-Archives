#!/usr/bin/node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const net = require("node:net");

const HOST_ROOT = "/srv/echo-archives";
const STATE_ROOT = "/var/lib/echo-archives";
const DATABASE_PATH = `${STATE_ROOT}/community.sqlite`;
const SERVICE_NAME = "echo-archives.service";
const SERVICE_USER = "echo-archives";
const SERVICE_PORT = 3010;
const SOCKET_PATH = `${STATE_ROOT}/echo-publisher.sock`;
const OPERATOR_GROUP = "echo-publisher-operators";
const DEPLOYMENT_LOCK = `${HOST_ROOT}/shared/state/deployment.lock`;
const MAX_PACKAGE_BYTES = 18 * 1024 * 1024;
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;

function fail(message, code = "ECHO_PUBLISHER_RUNNER_ERROR", statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    fail(`${label} is not valid JSON.`, "ECHO_PUBLISHER_INVALID_JSON");
  }
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validateClientRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.command !== "string") {
    fail("Publisher request must be a JSON object with a command.", "ECHO_PUBLISHER_INVALID_REQUEST");
  }
  switch (value.command) {
    case "plan": {
      if (!hasOnlyKeys(value, ["command", "packageBase64", "packageSha256"]) ||
        typeof value.packageBase64 !== "string" || !/^[0-9a-f]{64}$/i.test(String(value.packageSha256 || ""))) {
        fail("plan accepts only an encoded package and its SHA-256 digest.", "ECHO_PUBLISHER_INVALID_REQUEST");
      }
      const packageBytes = Buffer.from(value.packageBase64, "base64");
      if (packageBytes.length === 0 || packageBytes.length > MAX_PACKAGE_BYTES || packageBytes.toString("base64") !== value.packageBase64) {
        fail("Encoded publication package is empty, too large, or malformed.", "ECHO_PUBLISHER_INVALID_PACKAGE");
      }
      const digest = crypto.createHash("sha256").update(packageBytes).digest("hex");
      if (digest !== value.packageSha256.toLowerCase()) fail("Publication package SHA-256 digest does not match its contents.", "ECHO_PUBLISHER_PACKAGE_HASH_MISMATCH", 409);
      return {
        command: "plan",
        packageData: parseJson(packageBytes.toString("utf8"), "Publication package"),
        packageSha256: digest,
      };
    }
    case "apply":
      if (!hasOnlyKeys(value, ["command", "planId", "approveSha256", "reviewFacts", "factualReviewer"]) ||
        !validPlanId(value.planId) || !validDigest(value.approveSha256) ||
        (value.reviewFacts !== undefined && typeof value.reviewFacts !== "boolean") ||
        (value.factualReviewer !== undefined && value.factualReviewer !== "delegate:codex") ||
        (value.factualReviewer && value.reviewFacts !== true)) {
        fail("apply requires a plan ID, its exact SHA-256 approval digest, and optional reviewFacts boolean.", "ECHO_PUBLISHER_INVALID_REQUEST");
      }
      return {
        command: "apply",
        planId: value.planId,
        approveSha256: value.approveSha256.toLowerCase(),
        reviewFacts: value.reviewFacts === true,
        ...(value.factualReviewer ? { factualReviewer: value.factualReviewer } : {}),
      };
    case "resolve":
      if (!hasOnlyKeys(value, ["command", "planId", "approveSha256", "decisions", "reviewer"]) ||
        !validPlanId(value.planId) || !validDigest(value.approveSha256) || !Array.isArray(value.decisions) ||
        (value.reviewer !== undefined && value.reviewer !== "delegate:codex")) {
        fail("resolve requires a plan ID, exact plan digest, decision array, and optional Codex attribution.", "ECHO_PUBLISHER_INVALID_REQUEST");
      }
      return {
        command: "resolve",
        planId: value.planId,
        approveSha256: value.approveSha256.toLowerCase(),
        decisions: value.decisions,
        ...(value.reviewer ? { reviewer: value.reviewer } : {}),
      };
    case "inspect":
    case "status":
      if (!hasOnlyKeys(value, ["command", "planId"]) || !validPlanId(value.planId)) fail(`${value.command} requires a valid plan ID.`, "ECHO_PUBLISHER_INVALID_REQUEST");
      return { command: value.command, planId: value.planId };
    case "verify":
      if (!hasOnlyKeys(value, ["command", "receiptId"]) || !validReceiptId(value.receiptId)) fail("verify requires a valid receipt ID.", "ECHO_PUBLISHER_INVALID_REQUEST");
      return { command: "verify", receiptId: value.receiptId };
    default:
      fail("Unsupported local publisher command.", "ECHO_PUBLISHER_UNKNOWN_COMMAND");
  }
}

function validDigest(value) { return /^[0-9a-f]{64}$/i.test(String(value || "")); }
function validPlanId(value) { return /^[a-z0-9-]{16,100}$/i.test(String(value || "")); }
function validReceiptId(value) { return /^[a-z0-9-]{16,100}--[a-z0-9-]{16,100}$/i.test(String(value || "")); }

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function assertNoExtraCliArgs(args) {
  if (args.length !== 0) fail("The privileged Echo Publisher runner accepts requests through stdin only.", "ECHO_PUBLISHER_ARGUMENTS_REJECTED", 403);
}

function assertOperatorMembership(username, { spawnImpl = spawnSync } = {}) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(username || "")) || String(username).startsWith("-")) fail("Run the publisher through the authorized local sudo rule.", "ECHO_PUBLISHER_OPERATOR_REQUIRED", 401);
  const result = spawnImpl("/usr/bin/id", ["-nG", username], { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
  if (result.status !== 0 || !result.stdout.split(/\s+/).includes(OPERATOR_GROUP)) {
    fail("The invoking OS account is not a member of echo-publisher-operators.", "ECHO_PUBLISHER_OPERATOR_UNAUTHORIZED", 403);
  }
}

function assertRootRunner(uid = process.getuid?.()) {
  if (uid !== 0) fail("The restricted publisher dispatch can only run through its root-owned sudo runner.", "ECHO_PUBLISHER_SUDO_REQUIRED", 401);
}

function releaseIdFromRoot(releaseRoot) {
  const name = path.basename(releaseRoot);
  return /^[0-9a-f]{40}$/.test(name) ? name : "";
}

function readProductionReleaseMarker(releaseMarkerPath, releaseRoot) {
  const expectedReleaseMarkerPath = path.join(releaseRoot, "release.json");
  let markerStat;
  try {
    markerStat = fs.lstatSync(releaseMarkerPath);
  } catch (_error) {
    fail("The active production overlay has no valid release marker.", "ECHO_PUBLISHER_RELEASE_MARKER_MISSING", 503);
  }

  let markerReadPath = releaseMarkerPath;
  if (markerStat.isSymbolicLink()) {
    let resolvedMarkerPath;
    try {
      resolvedMarkerPath = fs.realpathSync(releaseMarkerPath);
    } catch (_error) {
      fail("The active production overlay release marker path is unsafe.", "ECHO_PUBLISHER_RELEASE_MARKER_INVALID", 403);
    }
    if (resolvedMarkerPath !== expectedReleaseMarkerPath) {
      fail("The active production overlay release marker path is unsafe.", "ECHO_PUBLISHER_RELEASE_MARKER_INVALID", 403);
    }
    markerReadPath = expectedReleaseMarkerPath;
  } else if (!markerStat.isFile()) {
    fail("The active production overlay release marker path is unsafe.", "ECHO_PUBLISHER_RELEASE_MARKER_INVALID", 403);
  }

  let markerFd;
  try {
    markerFd = fs.openSync(markerReadPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    if (!fs.fstatSync(markerFd).isFile()) {
      fail("The active production overlay release marker path is unsafe.", "ECHO_PUBLISHER_RELEASE_MARKER_INVALID", 403);
    }
    return JSON.parse(fs.readFileSync(markerFd, "utf8"));
  } catch (error) {
    if (String(error.code || "").startsWith("ECHO_PUBLISHER_RELEASE_MARKER")) throw error;
    if (error.code === "ELOOP") {
      fail("The active production overlay release marker path is unsafe.", "ECHO_PUBLISHER_RELEASE_MARKER_INVALID", 403);
    }
    fail("The active production overlay has no valid release marker.", "ECHO_PUBLISHER_RELEASE_MARKER_MISSING", 503);
  } finally {
    if (markerFd !== undefined) fs.closeSync(markerFd);
  }
}

function validateProductionHost({ root = HOST_ROOT, stateRoot = STATE_ROOT, socketPath = SOCKET_PATH, systemctl = spawnSync, userLookup = spawnSync } = {}) {
  const currentLink = path.join(root, "current");
  const runtimeLink = path.join(root, "runtime/production/current");
  for (const [label, link] of [["production release", currentLink], ["production runtime overlay", runtimeLink]]) {
    let stat;
    try { stat = fs.lstatSync(link); } catch (_error) { fail(`Active ${label} pointer is unavailable.`, "ECHO_PUBLISHER_PRODUCTION_POINTER_MISSING", 503); }
    if (!stat.isSymbolicLink()) fail(`Active ${label} pointer must be a symbolic link.`, "ECHO_PUBLISHER_PRODUCTION_POINTER_INVALID", 403);
  }
  let releaseRoot;
  let overlayRoot;
  try {
    releaseRoot = fs.realpathSync(currentLink);
    overlayRoot = fs.realpathSync(runtimeLink);
  } catch (_error) {
    fail("Active production pointers must resolve to retained directories.", "ECHO_PUBLISHER_PRODUCTION_POINTER_INVALID", 403);
  }
  const releaseId = releaseIdFromRoot(releaseRoot);
  const overlayReleaseId = path.basename(overlayRoot);
  if (!releaseId || !/^[0-9a-f]{40}$/.test(overlayReleaseId) || releaseId !== overlayReleaseId ||
    releaseRoot !== path.resolve(root, "releases", releaseId) ||
    overlayRoot !== path.resolve(root, "runtime/production", releaseId)) {
    fail("Production release and runtime overlay do not point at the same retained release.", "ECHO_PUBLISHER_PRODUCTION_POINTER_MISMATCH", 409);
  }
  const releaseMarkerPath = path.join(overlayRoot, "release.json");
  const marker = readProductionReleaseMarker(releaseMarkerPath, releaseRoot);
  if (marker.releaseId !== releaseId) fail("Production overlay release marker does not match current release.", "ECHO_PUBLISHER_RELEASE_MISMATCH", 409);
  try {
    const lock = fs.lstatSync(path.join(root, "shared/state/deployment.lock"));
    if (!lock.isFile() || lock.isSymbolicLink()) fail("The Echo release lock path is unsafe.", "ECHO_PUBLISHER_DEPLOYMENT_LOCK_INVALID", 403);
  } catch (error) {
    if (String(error.code || "").startsWith("ECHO_PUBLISHER_DEPLOYMENT_LOCK")) throw error;
    fail("The Echo release lock is missing; complete the release-workflow setup first.", "ECHO_PUBLISHER_DEPLOYMENT_LOCK_MISSING", 503);
  }
  try {
    const stateDirectory = fs.lstatSync(stateRoot);
    if (!stateDirectory.isDirectory() || stateDirectory.isSymbolicLink()) fail("The production state directory is unsafe.", "ECHO_PUBLISHER_DATABASE_INVALID", 403);
    const database = fs.lstatSync(path.join(stateRoot, "community.sqlite"));
    if (!database.isFile() || database.isSymbolicLink()) fail("The production SQLite path is unsafe.", "ECHO_PUBLISHER_DATABASE_INVALID", 403);
  } catch (error) {
    if (String(error.code || "").startsWith("ECHO_PUBLISHER_DATABASE")) throw error;
    fail("The production SQLite database is unavailable.", "ECHO_PUBLISHER_DATABASE_MISSING", 503);
  }
  try {
    const socket = fs.lstatSync(socketPath);
    if (!socket.isSocket() || (socket.mode & 0o777) !== 0o600) fail("The Echo Publisher control socket is unsafe.", "ECHO_PUBLISHER_SOCKET_INVALID", 403);
    const socketDirectory = fs.lstatSync(path.dirname(socketPath));
    const serviceUser = userLookup("/usr/bin/id", ["-u", SERVICE_USER], { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
    const serviceUid = Number(String(serviceUser.stdout || "").trim());
    if (serviceUser.status !== 0 || !Number.isInteger(serviceUid) || socket.uid !== serviceUid) {
      fail("The Echo Publisher socket is not owned by the production service account.", "ECHO_PUBLISHER_SOCKET_OWNER_INVALID", 403);
    }
    if (!socketDirectory.isDirectory() || socketDirectory.isSymbolicLink() ||
      ![0, serviceUid].includes(socketDirectory.uid) || (socketDirectory.mode & 0o022) !== 0) {
      fail("The Echo Publisher socket directory is unsafe.", "ECHO_PUBLISHER_SOCKET_INVALID", 403);
    }
  } catch (error) {
    if (String(error.code || "").startsWith("ECHO_PUBLISHER_SOCKET")) throw error;
    fail("The active production service has not opened its private Echo Publisher socket.", "ECHO_PUBLISHER_SOCKET_MISSING", 503);
  }
  const service = systemctl("/usr/bin/systemctl", ["is-active", "--quiet", SERVICE_NAME], { env: { PATH: "/usr/bin:/bin" } });
  if (service.status !== 0) fail("The production Echo Archives service is not active.", "ECHO_PUBLISHER_SERVICE_INACTIVE", 503);
  return { releaseId, releaseRoot, overlayRoot, databasePath: DATABASE_PATH, socketPath };
}

function requestLocalSocket(request, socketPath = SOCKET_PATH) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let data = "";
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    socket.setEncoding("utf8");
    socket.setTimeout(5 * 60 * 1000);
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data, "utf8") > MAX_REQUEST_BYTES) finish(new Error("Publisher response is too large."));
    });
    socket.on("end", () => {
      try { finish(null, JSON.parse(data.trim())); } catch (_error) { finish(new Error("Production publisher returned an invalid response.")); }
    });
    socket.on("timeout", () => finish(new Error("Timed out waiting for the production publisher.")));
    socket.on("error", (error) => finish(new Error(`Cannot connect to the active production publisher: ${error.message}`)));
  });
}

async function verifyPublicSite(showIds, expectedRecordHashes = {}, fetchImpl = globalThis.fetch) {
  const checkedAt = new Date().toISOString();
  const verificationKey = crypto.randomUUID();
  const url = `https://echoarchives.net/data/shows.json?v=publisher-${verificationKey}`;
  try {
    const response = await fetchImpl(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const bodySha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!response.ok) {
      return { status: "failed", checkedAt, httpStatus: response.status, bodySha256, foundShowIds: [], error: `Public catalog endpoint returned HTTP ${response.status}.` };
    }
    let shows;
    try { shows = JSON.parse(bytes.toString("utf8")); } catch (_error) {
      return { status: "failed", checkedAt, httpStatus: response.status, bodySha256, foundShowIds: [], error: "Public catalog endpoint returned invalid JSON." };
    }
    if (!Array.isArray(shows)) return { status: "failed", checkedAt, httpStatus: response.status, bodySha256, foundShowIds: [], error: "Public catalog response is not an array." };
    const available = new Set(shows.map((show) => show?.id).filter(Boolean));
    const foundShowIds = showIds.filter((id) => available.has(id));
    const missing = showIds.filter((id) => !available.has(id));
    const publicRecords = new Map(shows.filter((show) => show?.id).map((show) => [show.id, show]));
    const contentMismatches = showIds.filter((id) => expectedRecordHashes[id] &&
      hashValue(publicRecords.get(id)) !== expectedRecordHashes[id]);
    const missingHashes = showIds.filter((id) => !/^[0-9a-f]{64}$/i.test(String(expectedRecordHashes[id] || "")));
    return {
      status: missing.length === 0 && contentMismatches.length === 0 && missingHashes.length === 0 ? "verified" : "failed",
      checkedAt,
      httpStatus: response.status,
      bodySha256,
      foundShowIds,
      contentMismatches,
      expectedRecordHashes,
      error: missing.length
        ? `Public catalogue response is missing ${missing.join(", ")}.`
        : contentMismatches.length
          ? `Public catalogue content differs for ${contentMismatches.join(", ")}.`
          : missingHashes.length
            ? "Expected public content hashes are missing from local verification."
            : "",
    };
  } catch (error) {
    return { status: "failed", checkedAt, httpStatus: 0, bodySha256: "", foundShowIds: [], error: error.message || String(error) };
  }
}

async function dispatch(request, operator, { hostOptions, fetchImpl = globalThis.fetch, socketRequest = requestLocalSocket } = {}) {
  const target = validateProductionHost(hostOptions);
  const trustedRequest = { ...request, actor: `operator:${operator}` };
  const response = await socketRequest(trustedRequest, target.socketPath);
  if (!response?.ok) return response;

  let receiptId = "";
  let showIds = [];
  if (request.command === "apply") {
    const receipt = response.data?.receipt;
    if (receipt?.catalogueWrite?.status === "complete") {
      receiptId = receipt.receiptId;
      showIds = receipt.catalogueWrite.showIds || [];
    }
  } else if (request.command === "verify") {
    receiptId = request.receiptId;
    showIds = response.data?.receipt?.catalogueWrite?.showIds || [];
  }
  if (receiptId) {
    const expectedRecordHashes = request.command === "verify"
      ? response.data?.verification?.publicRecordHashes || {}
      : response.data?.receipt?.verification?.publicRecordHashes || {};
    const observation = await verifyPublicSite(showIds, expectedRecordHashes, fetchImpl);
    const recorded = await socketRequest({
      command: "record-public-verification",
      actor: `operator:${operator}`,
      receiptId,
      observation,
    }, target.socketPath);
    if (recorded?.ok) {
      if (response.data?.receipt) response.data.receipt.publicSiteVerification = recorded.data;
      if (response.data) response.data.publicSiteVerification = recorded.data;
    } else if (response.data) {
      response.data.publicSiteVerification = { ...observation, recordingError: recorded?.error || "Verification result could not be recorded." };
    }
  }
  return response;
}

function dispatchExitStatus(response, command) {
  if (!response || response.ok !== true) return 1;
  if (!new Set(["apply", "verify"]).has(command)) return 0;
  const receipt = response.data?.receipt;
  if (!receipt || receipt.catalogueWrite?.status !== "complete") return 1;
  const localVerification = command === "verify" ? response.data?.verification : receipt.verification;
  if (localVerification?.status !== "verified") return 2;
  const publicVerification = receipt.publicSiteVerification || response.data?.publicSiteVerification;
  if (publicVerification?.status !== "verified" || publicVerification.recordingError) return 2;
  return 0;
}

function readStdin(maxBytes = MAX_REQUEST_BYTES) {
  const chunks = [];
  let total = 0;
  const buffer = Buffer.alloc(64 * 1024);
  let count;
  while ((count = fs.readSync(0, buffer, 0, buffer.length, null)) > 0) {
    total += count;
    if (total > maxBytes) fail("Publisher request is too large.", "ECHO_PUBLISHER_REQUEST_TOO_LARGE", 413);
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function writeOutput(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv[0] === "--dispatch") {
    if (argv.length !== 1) fail("Invalid internal publisher dispatch arguments.", "ECHO_PUBLISHER_ARGUMENTS_REJECTED", 403);
    assertRootRunner();
    const internal = parseJson(readStdin(), "Internal publisher request");
    const operator = internal.operator;
    const request = validateClientRequest(internal.request);
    assertOperatorMembership(operator);
    const result = await dispatch(request, operator);
    writeOutput(result);
    return dispatchExitStatus(result, request.command);
  }

  assertNoExtraCliArgs(argv);
  assertRootRunner();
  const operator = String(env.SUDO_USER || "");
  assertOperatorMembership(operator);
  const rawRequest = parseJson(readStdin(), "Publisher request");
  const request = validateClientRequest(rawRequest);
  const child = spawnSync("/usr/bin/flock", [
    "--shared",
    "--nonblock",
    DEPLOYMENT_LOCK,
    "/usr/bin/node",
    __filename,
    "--dispatch",
  ], {
    input: JSON.stringify({ operator, request: rawRequest }),
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: "/root" },
    maxBuffer: 40 * 1024 * 1024,
    timeout: 6 * 60 * 1000,
  });
  if (child.error) fail(`Could not start the restricted publisher operation: ${child.error.message}`, "ECHO_PUBLISHER_RUNNER_FAILED", 503);
  if (child.status !== 0) {
    if (child.status === 1 && /flock|deployment\.lock/i.test(child.stderr || "")) {
      fail("An Echo release operation holds the deployment lock. Retry after it finishes.", "ECHO_PUBLISHER_DEPLOYMENT_BUSY", 409);
    }
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    return child.status || 1;
  }
  process.stdout.write(child.stdout || "{}\n");
  return 0;
}

if (require.main === module) {
  main().then((status) => { process.exitCode = status; }).catch((error) => {
    writeOutput({ ok: false, statusCode: error.statusCode || 500, code: error.code || "ECHO_PUBLISHER_RUNNER_ERROR", error: error.message || String(error) });
    process.exitCode = 1;
  });
}

module.exports = {
  DATABASE_PATH,
  DEPLOYMENT_LOCK,
  HOST_ROOT,
  OPERATOR_GROUP,
  SERVICE_USER,
  SOCKET_PATH,
  assertNoExtraCliArgs,
  assertOperatorMembership,
  assertRootRunner,
  dispatch,
  dispatchExitStatus,
  main,
  validateClientRequest,
  validateProductionHost,
  verifyPublicSite,
};
