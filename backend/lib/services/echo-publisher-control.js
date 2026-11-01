const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const MAX_REQUEST_BYTES = 24 * 1024 * 1024;
const OPERATOR_ID_PATTERN = /^operator:[A-Za-z0-9._-]{1,64}$/;

function controlError(message, statusCode = 400, code = "ECHO_PUBLISHER_CONTROL_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function handlePublisherRequest(publisher, request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw controlError("Publisher request must be a JSON object.");
  }
  const actor = String(request.actor || "");
  if (!OPERATOR_ID_PATTERN.test(actor)) throw controlError("Publisher operator identity is missing or invalid.", 401, "ECHO_PUBLISHER_OPERATOR_REQUIRED");
  switch (request.command) {
    case "plan": {
      if (!/^[0-9a-f]{64}$/i.test(String(request.packageSha256 || "")) || !request.packageData || typeof request.packageData !== "object") {
        throw controlError("Plan requests require a package and its SHA-256 digest.");
      }
      return publisher.createPlan({ packageData: request.packageData, packageSha256: request.packageSha256, actor });
    }
    case "inspect":
      return publisher.inspect(request.planId);
    case "resolve":
      return publisher.resolveReviews({
        planId: request.planId,
        approveSha256: request.approveSha256,
        decisions: request.decisions,
        actor,
        reviewer: request.reviewer || "",
      });
    case "apply":
      return publisher.applyPlan({
        planId: request.planId,
        approveSha256: request.approveSha256,
        reviewFacts: request.reviewFacts === true,
        factualReviewer: request.factualReviewer || "",
        actor,
      });
    case "status":
      return publisher.status(request.planId);
    case "verify":
      return publisher.verifyReceipt(request.receiptId);
    case "record-public-verification":
      return publisher.recordPublicVerification(request.receiptId, request.observation || {});
    default:
      throw controlError("Unsupported local publisher command.", 400, "ECHO_PUBLISHER_UNKNOWN_COMMAND");
  }
}

function createEchoPublisherControlServer({ publisher, socketPath = "/var/lib/echo-archives/echo-publisher.sock" } = {}) {
  if (!publisher) throw new TypeError("A publisher service is required for its control socket.");
  const resolvedSocketPath = path.resolve(socketPath);
  if (!resolvedSocketPath.startsWith("/var/lib/echo-archives/")) {
    throw new Error("Echo Publisher control socket must be inside /var/lib/echo-archives.");
  }
  let server = null;

  async function start() {
    fs.mkdirSync(path.dirname(resolvedSocketPath), { recursive: true, mode: 0o750 });
    try {
      const existing = fs.lstatSync(resolvedSocketPath);
      if (!existing.isSocket() || existing.uid !== process.getuid()) {
        throw new Error("Refusing to replace an unsafe Echo Publisher control socket path.");
      }
      fs.unlinkSync(resolvedSocketPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      let input = "";
      let handled = false;
      socket.on("data", async (chunk) => {
        if (handled) return;
        input += chunk;
        if (Buffer.byteLength(input, "utf8") > MAX_REQUEST_BYTES) {
          handled = true;
          socket.end(`${JSON.stringify({ ok: false, error: "Publisher request is too large.", code: "ECHO_PUBLISHER_REQUEST_TOO_LARGE" })}\n`);
          return;
        }
        const newline = input.indexOf("\n");
        if (newline < 0) return;
        handled = true;
        try {
          const request = JSON.parse(input.slice(0, newline));
          const data = await handlePublisherRequest(publisher, request);
          socket.end(`${JSON.stringify({ ok: true, data })}\n`);
        } catch (error) {
          socket.end(`${JSON.stringify({
            ok: false,
            statusCode: Number(error.statusCode) || 500,
            code: error.code || "ECHO_PUBLISHER_CONTROL_ERROR",
            error: error.message || String(error),
          })}\n`);
        }
      });
      socket.on("error", () => {});
    });

    const previousUmask = process.umask(0o077);
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(resolvedSocketPath, resolve);
      });
    } finally {
      process.umask(previousUmask);
    }
    fs.chmodSync(resolvedSocketPath, 0o600);
    return { socketPath: resolvedSocketPath };
  }

  async function close() {
    if (!server) return;
    const current = server;
    server = null;
    await new Promise((resolve) => current.close(resolve));
    try {
      const stat = fs.lstatSync(resolvedSocketPath);
      if (stat.isSocket() && stat.uid === process.getuid()) fs.unlinkSync(resolvedSocketPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return { close, start };
}

module.exports = {
  MAX_REQUEST_BYTES,
  createEchoPublisherControlServer,
  handlePublisherRequest,
};
