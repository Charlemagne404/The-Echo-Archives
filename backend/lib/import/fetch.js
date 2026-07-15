const dns = require("node:dns").promises;
const net = require("node:net");

function createFetchLimitError(label, detail, properties = {}) {
  const error = new Error(`${label} ${detail}`);
  error.code = properties.code || "IMPORT_FETCH_FAILED";
  Object.assign(error, properties);
  return error;
}

function isPrivateIpAddress(address = "") {
  const value = String(address || "").toLowerCase().split("%")[0];
  if (net.isIPv4(value)) {
    const [a, b] = value.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(value)) {
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
  }
  return false;
}

async function assertSafeRemoteUrl(value, { resolveDns = true, label = "Import request" } = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch (_error) {
    throw createFetchLimitError(label, "requires a valid HTTP URL.", { code: "IMPORT_UNSAFE_URL", retryable: false });
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw createFetchLimitError(label, "rejected an unsafe URL.", { code: "IMPORT_UNSAFE_URL", retryable: false });
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateIpAddress(hostname)) {
    throw createFetchLimitError(label, "rejected a private-network URL.", { code: "IMPORT_UNSAFE_URL", retryable: false });
  }
  if (resolveDns && !net.isIP(hostname)) {
    let records;
    try {
      records = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw createFetchLimitError(label, `could not resolve ${hostname}.`, { code: "IMPORT_DNS_FAILED", cause: error, retryable: true });
    }
    if (records.length === 0 || records.some((record) => isPrivateIpAddress(record.address))) {
      throw createFetchLimitError(label, "rejected a hostname resolving to a private network.", { code: "IMPORT_UNSAFE_URL", retryable: false });
    }
  }
  return parsed;
}

async function readResponseBuffer(response, { maxBytes, label }) {
  const contentLength = Number.parseInt(response.headers?.get?.("content-length") || "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw createFetchLimitError(label, `exceeded the ${maxBytes}-byte response limit.`, { code: "IMPORT_RESPONSE_TOO_LARGE", retryable: false });
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw createFetchLimitError(label, `exceeded the ${maxBytes}-byte response limit.`, { code: "IMPORT_RESPONSE_TOO_LARGE", retryable: false });
    }
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw createFetchLimitError(label, `exceeded the ${maxBytes}-byte response limit.`, { code: "IMPORT_RESPONSE_TOO_LARGE", retryable: false });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, totalBytes);
}

function retryAfterMilliseconds(response) {
  const value = response.headers?.get?.("retry-after") || "";
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

async function fetchBufferWithLimits(fetchImpl, url, init = {}, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 15_000);
  const maxBytes = Math.max(1, Number(options.maxBytes) || 5 * 1024 * 1024);
  const maxRedirects = Math.min(8, Math.max(0, Number(options.maxRedirects) || 5));
  const label = String(options.label || "Import request");
  const resolveDns = options.resolveDns ?? fetchImpl.isNetworkFetch ?? fetchImpl === globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let currentUrl = (await assertSafeRemoteUrl(url, { resolveDns, label })).href;
  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const response = await fetchImpl(currentUrl, { ...init, redirect: "manual", signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.get?.("location") || "";
        if (!location || redirectCount === maxRedirects) {
          throw createFetchLimitError(label, "encountered an invalid or excessive redirect chain.", { code: "IMPORT_REDIRECT_FAILED", retryable: false });
        }
        currentUrl = (await assertSafeRemoteUrl(new URL(location, currentUrl).href, { resolveDns, label })).href;
        continue;
      }
      if (response.url) {
        await assertSafeRemoteUrl(response.url, { resolveDns, label });
      }
      const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
      if (Array.isArray(options.allowedContentTypes) && options.allowedContentTypes.length > 0 && contentType && !options.allowedContentTypes.some((type) => contentType.includes(type))) {
        throw createFetchLimitError(label, `returned unsupported content type ${contentType}.`, { code: "IMPORT_INVALID_MIME", retryable: false });
      }
      const buffer = await readResponseBuffer(response, { maxBytes, label });
      return { response, buffer, resolvedUrl: response.url || currentUrl };
    }
    throw createFetchLimitError(label, "exceeded its redirect limit.", { retryable: false });
  } catch (error) {
    if (controller.signal.aborted) {
      throw createFetchLimitError(label, `timed out after ${timeoutMs}ms.`, { code: "IMPORT_TIMEOUT", retryable: true });
    }
    if (error && error.retryable === undefined) {
      const status = Number(error.upstreamStatus || error.status);
      error.retryable = !Number.isFinite(status) || status === 408 || status === 429 || status >= 500;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithLimits(fetchImpl, url, init = {}, options = {}) {
  const result = await fetchBufferWithLimits(fetchImpl, url, init, options);
  return { response: result.response, text: result.buffer.toString("utf8"), resolvedUrl: result.resolvedUrl };
}

async function fetchJsonWithLimits(fetchImpl, url, init = {}, options = {}) {
  const result = await fetchTextWithLimits(fetchImpl, url, init, {
    ...options,
    allowedContentTypes: options.allowedContentTypes || ["application/json", "text/json", "text/javascript"],
  });
  try {
    return { response: result.response, json: JSON.parse(result.text), text: result.text, resolvedUrl: result.resolvedUrl };
  } catch (_error) {
    throw createFetchLimitError(String(options.label || "Import request"), "returned invalid JSON.", { code: "IMPORT_INVALID_JSON", retryable: false });
  }
}

function throwForUpstreamStatus(response, label) {
  if (response.ok) return;
  const error = createFetchLimitError(label, `failed with ${response.status}.`, {
    code: "IMPORT_HTTP_ERROR",
    upstreamStatus: response.status,
    retryable: response.status === 408 || response.status === 429 || response.status >= 500,
    retryAfterMs: retryAfterMilliseconds(response),
  });
  throw error;
}

module.exports = {
  assertSafeRemoteUrl,
  fetchBufferWithLimits,
  fetchJsonWithLimits,
  fetchTextWithLimits,
  isPrivateIpAddress,
  throwForUpstreamStatus,
};
