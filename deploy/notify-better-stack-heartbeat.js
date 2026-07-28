const HEARTBEAT_ENV_NAME = "BETTER_STACK_BACKUP_HEARTBEAT_URL";
const VALID_MODES = new Set(["failure", "success", "systemd-result"]);

function parseHeartbeatUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch (_error) {
    throw new Error(`${HEARTBEAT_ENV_NAME} must be a valid Better Stack heartbeat URL.`);
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const validPath =
    pathParts.length === 4 &&
    pathParts[0] === "api" &&
    pathParts[1] === "v1" &&
    pathParts[2] === "heartbeat" &&
    /^[A-Za-z0-9_-]{8,}$/.test(pathParts[3]);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "uptime.betterstack.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !validPath
  ) {
    throw new Error(`${HEARTBEAT_ENV_NAME} must be an HTTPS heartbeat URL on uptime.betterstack.com.`);
  }

  url.pathname = `/${pathParts.join("/")}`;
  return url;
}

function resolveHeartbeatEvent(mode, env = process.env) {
  if (!VALID_MODES.has(mode)) {
    throw new Error("Heartbeat mode must be success, failure, or systemd-result.");
  }
  if (mode !== "systemd-result") {
    return { event: mode, skip: false };
  }

  const serviceResult = String(env.SERVICE_RESULT || "").trim();
  if (!serviceResult) {
    throw new Error("SERVICE_RESULT is required for systemd-result mode.");
  }
  if (serviceResult === "success") {
    return { event: "success", skip: true };
  }
  return { event: "failure", skip: false };
}

function buildHeartbeatEndpoint(baseUrl, event) {
  const endpoint = new URL(baseUrl);
  if (event === "failure") {
    endpoint.pathname = `${endpoint.pathname}/fail`;
  }
  return endpoint.toString();
}

async function requestHeartbeat(endpoint, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "text/plain,*/*;q=0.1",
        "user-agent": "The-Echo-Archives-Backup-Heartbeat/1.0",
      },
    });
    try {
      await response.body?.cancel?.();
    } catch (_error) {
      // Status is sufficient; body cleanup must not expose provider response data.
    }
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, detail: `HTTP ${response.status}` };
    }
    return { ok: true, status: response.status };
  } catch (_error) {
    return { ok: false, detail: timedOut ? "request timeout" : "network error" };
  } finally {
    clearTimeout(timeout);
  }
}

async function notifyBetterStackHeartbeat(
  event,
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    maxAttempts = 3,
    retryDelayMs = 500,
    sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    timeoutMs = 10_000,
  } = {},
) {
  if (!["failure", "success"].includes(event)) {
    throw new Error("Heartbeat event must be success or failure.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const baseUrl = parseHeartbeatUrl(env[HEARTBEAT_ENV_NAME]);
  const endpoint = buildHeartbeatEndpoint(baseUrl, event);
  let lastDetail = "unknown error";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await requestHeartbeat(endpoint, { fetchImpl, timeoutMs });
    if (result.ok) {
      return {
        attemptCount: attempt,
        event,
        status: result.status,
      };
    }
    lastDetail = result.detail;
    if (attempt < maxAttempts && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  throw new Error(
    `Better Stack ${event} heartbeat failed after ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"} (${lastDetail}).`,
  );
}

async function main(args = process.argv.slice(2), options = {}) {
  const mode = String(args[0] || "").trim();
  const resolved = resolveHeartbeatEvent(mode, options.env || process.env);
  if (resolved.skip) {
    console.log("Better Stack failure heartbeat skipped because the systemd service result was successful.");
    return 0;
  }

  const result = await notifyBetterStackHeartbeat(resolved.event, options);
  console.log(
    `Better Stack backup ${result.event} heartbeat delivered in ${result.attemptCount} attempt${result.attemptCount === 1 ? "" : "s"}.`,
  );
  return 0;
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error.message || "Better Stack heartbeat notification failed.");
      process.exitCode = 1;
    });
}

module.exports = {
  HEARTBEAT_ENV_NAME,
  buildHeartbeatEndpoint,
  main,
  notifyBetterStackHeartbeat,
  parseHeartbeatUrl,
  resolveHeartbeatEvent,
};
