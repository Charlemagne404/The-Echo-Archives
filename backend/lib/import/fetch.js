const dns = require("node:dns").promises;
const http = require("node:http");
const net = require("node:net");
const https = require("node:https");
const { Readable } = require("node:stream");
const zlib = require("node:zlib");

function createFetchLimitError(label, detail, properties = {}) {
  const error = new Error(`${label} ${detail}`);
  error.code = properties.code || "IMPORT_FETCH_FAILED";
  Object.assign(error, properties);
  return error;
}

function addressBytes(value = "") {
  const address = String(value || "").toLowerCase().split("%")[0];
  if (net.isIPv4(address)) return address.split(".").map(Number);
  if (!net.isIPv6(address)) return null;

  let expanded = address;
  const dottedSuffix = expanded.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedSuffix && net.isIPv4(dottedSuffix[2])) {
    const octets = dottedSuffix[2].split(".").map(Number);
    expanded = `${dottedSuffix[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = expanded.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const omitted = halves.length === 2 ? 8 - left.length - right.length : 0;
  if ((halves.length === 1 && left.length !== 8) || (halves.length === 2 && omitted < 1)) return null;
  const words = [
    ...left,
    ...Array.from({ length: Math.max(0, omitted) }, () => "0"),
    ...right,
  ].map((part) => Number.parseInt(part || "0", 16));
  if (words.length !== 8 || words.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return null;
  return words.flatMap((part) => [part >> 8, part & 0xff]);
}

function inCidr(address, cidr) {
  const [network, prefixText] = cidr.split("/");
  const addressBytesValue = addressBytes(address);
  const networkBytes = addressBytes(network);
  if (!addressBytesValue || !networkBytes || addressBytesValue.length !== networkBytes.length) return false;
  let prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > addressBytesValue.length * 8) return false;
  for (let index = 0; prefix > 0; index += 1) {
    const bits = Math.min(8, prefix);
    const mask = (0xff << (8 - bits)) & 0xff;
    if ((addressBytesValue[index] & mask) !== (networkBytes[index] & mask)) return false;
    prefix -= bits;
  }
  return true;
}

function mappedIpv4Address(address = "") {
  const bytes = addressBytes(address);
  if (!bytes || bytes.length !== 16 || bytes.slice(0, 10).some((part) => part !== 0) || bytes[10] !== 0xff || bytes[11] !== 0xff) return "";
  return bytes.slice(12).join(".");
}

function embeddedIpv4Address(address, prefix) {
  const bytes = addressBytes(address);
  if (!bytes || bytes.length !== 16 || !inCidr(address, prefix)) return "";
  const start = prefix === "2002::/16" ? 2 : 12;
  return bytes.slice(start, start + 4).join(".");
}

// Import destinations must be globally reachable unicast addresses. This keeps
// the existing private-network boundary and also excludes reserved, multicast,
// documentation, and other non-global special-purpose ranges.
const IPV4_BLOCKED_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

const IPV6_BLOCKED_CIDRS = [
  "100::/64",
  "2001:2::/48",
  "2001:10::/28",
  "2001:db8::/32",
  "3fff::/20",
  "64:ff9b:1::/48",
  "fc00::/7",
  "fe80::/10",
  "fec0::/10",
];

const IPV6_GLOBAL_EXCEPTIONS_IN_2001_PROTOCOL_SPACE = [
  "2001:1::1/128",
  "2001:1::2/128",
  "2001:1::3/128",
  "2001:3::/32",
  "2001:4:112::/48",
  "2001:20::/28",
  "2001:30::/28",
];

function isPrivateIpv4Address(address) {
  if (IPV4_BLOCKED_CIDRS.some((cidr) => inCidr(address, cidr))) return true;
  if (inCidr(address, "192.0.0.0/24") && !["192.0.0.9", "192.0.0.10"].includes(address)) return true;
  return false;
}

function isPrivateIpAddress(address = "") {
  const value = String(address || "").toLowerCase().split("%")[0];
  if (net.isIPv4(value)) return isPrivateIpv4Address(value);
  if (!net.isIPv6(value)) return false;

  const mappedIpv4 = mappedIpv4Address(value);
  if (mappedIpv4) return isPrivateIpv4Address(mappedIpv4);

  const nat64Ipv4 = embeddedIpv4Address(value, "64:ff9b::/96");
  if (nat64Ipv4) return isPrivateIpv4Address(nat64Ipv4);

  const sixToFourIpv4 = embeddedIpv4Address(value, "2002::/16");
  if (sixToFourIpv4) return isPrivateIpv4Address(sixToFourIpv4);

  if (!inCidr(value, "2000::/3")) return true;
  if (IPV6_BLOCKED_CIDRS.some((cidr) => inCidr(value, cidr))) return true;
  if (
    inCidr(value, "2001::/23") &&
    !IPV6_GLOBAL_EXCEPTIONS_IN_2001_PROTOCOL_SPACE.some((cidr) => inCidr(value, cidr))
  ) return true;
  return false;
}

function normalizeHostname(value = "") {
  return String(value || "").toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
}

function isLocalHostname(hostname) {
  return (
    hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname === "localhost.localdomain" || hostname.endsWith(".localhost.localdomain") ||
    hostname.endsWith(".localdomain") || hostname === "ip6-localhost" || hostname === "ip6-loopback" ||
    hostname.endsWith(".local")
  );
}

async function resolveSafeRemoteUrl(value, {
  resolveDns = true,
  resolver = (hostname) => dns.lookup(hostname, { all: true, verbatim: true }),
  label = "Import request",
} = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch (_error) {
    throw createFetchLimitError(label, "requires a valid HTTP URL.", { code: "IMPORT_UNSAFE_URL", retryable: false });
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw createFetchLimitError(label, "rejected an unsafe URL.", { code: "IMPORT_UNSAFE_URL", retryable: false });
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || isLocalHostname(hostname) || isPrivateIpAddress(hostname)) {
    throw createFetchLimitError(label, "rejected a private-network URL.", { code: "IMPORT_UNSAFE_URL", retryable: false });
  }

  if (!net.isIP(hostname) && parsed.hostname !== hostname) parsed.hostname = hostname;
  let addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : [];
  if (resolveDns && !net.isIP(hostname)) {
    let records;
    try {
      records = await resolver(hostname);
    } catch (error) {
      throw createFetchLimitError(label, `could not resolve ${hostname}.`, { code: "IMPORT_DNS_FAILED", cause: error, retryable: true });
    }
    if (!Array.isArray(records) || records.length === 0) {
      throw createFetchLimitError(label, "could not resolve a usable address.", { code: "IMPORT_DNS_FAILED", retryable: true });
    }
    const uniqueRecords = new Map();
    for (const record of records) {
      const address = String(record?.address || "").toLowerCase().split("%")[0];
      const family = net.isIP(address);
      if (!family) {
        throw createFetchLimitError(label, "received an invalid address during hostname resolution.", { code: "IMPORT_DNS_FAILED", retryable: false });
      }
      uniqueRecords.set(`${family}:${address}`, { address, family });
    }
    addresses = [...uniqueRecords.values()];
    if (addresses.some((record) => isPrivateIpAddress(record.address))) {
      throw createFetchLimitError(label, "rejected a hostname resolving to a private network.", { code: "IMPORT_UNSAFE_URL", retryable: false });
    }
  }
  return { parsed, hostname, addresses };
}

async function assertSafeRemoteUrl(value, options = {}) {
  const result = await resolveSafeRemoteUrl(value, options);
  return result.parsed;
}

function createPinnedLookup(expectedHostname, validatedAddresses) {
  const canonicalHostname = normalizeHostname(expectedHostname);
  const addresses = validatedAddresses.map((record) => ({
    address: String(record.address),
    family: net.isIP(String(record.address)),
  }));

  return (requestedHostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    const host = normalizeHostname(requestedHostname);
    if (host !== canonicalHostname) {
      const error = Object.assign(new Error("Pinned DNS lookup hostname did not match the validated request."), { code: "IMPORT_DNS_PIN_MISMATCH" });
      process.nextTick(() => callback(error));
      return;
    }
    const family = Number(options?.family) || 0;
    const matches = addresses.filter((record) => !family || record.family === family);
    if (matches.length === 0) {
      const error = Object.assign(new Error("No validated address is available for the requested address family."), { code: "ENOTFOUND" });
      process.nextTick(() => callback(error));
      return;
    }
    if (options?.all) {
      process.nextTick(() => callback(null, matches.map((record) => ({ ...record }))));
      return;
    }
    process.nextTick(() => callback(null, matches[0].address, matches[0].family));
  };
}

function responseHeaders(incoming) {
  const headers = new Headers();
  const rawHeaders = Array.isArray(incoming.rawHeaders) ? incoming.rawHeaders : [];
  if (rawHeaders.length > 0) {
    for (let index = 0; index < rawHeaders.length; index += 2) headers.append(rawHeaders[index], rawHeaders[index + 1]);
    return headers;
  }
  for (const [name, value] of Object.entries(incoming.headers || {})) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
  }
  return headers;
}

function responseBody(incoming, status) {
  if ([204, 205, 304].includes(status)) return null;
  const encoding = String(incoming.headers?.["content-encoding"] || "").trim().toLowerCase();
  const decoder = encoding === "gzip" || encoding === "x-gzip"
    ? zlib.createGunzip()
    : encoding === "deflate"
      ? zlib.createInflate()
      : encoding === "br"
        ? zlib.createBrotliDecompress()
        : null;
  if (!decoder) return Readable.toWeb(incoming);
  incoming.pipe(decoder);
  return Readable.toWeb(decoder);
}

function writeRequestBody(request, body) {
  if (body === undefined || body === null) {
    request.end();
  } else if (typeof body === "string" || Buffer.isBuffer(body) || ArrayBuffer.isView(body)) {
    request.end(body);
  } else if (body instanceof ArrayBuffer) {
    request.end(Buffer.from(body));
  } else if (body instanceof Readable) {
    body.pipe(request);
  } else if (body && typeof body.getReader === "function") {
    Readable.fromWeb(body).pipe(request);
  } else {
    throw new TypeError("The pinned network transport does not support this request body type.");
  }
}

function requestWithPinnedAddresses(value, init, addresses, { requestImpl } = {}) {
  const parsed = new URL(String(value));
  const hostname = normalizeHostname(parsed.hostname);
  const literalAddress = net.isIP(hostname);
  const transport = parsed.protocol === "https:" ? https : http;
  const requestFunction = requestImpl || transport.request.bind(transport);
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  if (!headers["accept-encoding"]) headers["accept-encoding"] = "gzip, deflate, br";
  headers.host = parsed.host;
  const options = {
    protocol: parsed.protocol,
    hostname,
    port: parsed.port || undefined,
    path: `${parsed.pathname}${parsed.search}`,
    method: init.method || "GET",
    headers,
    agent: false,
    signal: init.signal,
    ...(literalAddress ? {} : { lookup: createPinnedLookup(hostname, addresses) }),
  };
  if (parsed.protocol === "https:") {
    options.rejectUnauthorized = true;
    if (!literalAddress) options.servername = hostname;
  }

  return new Promise((resolve, reject) => {
    let request;
    try {
      request = requestFunction(options, (incoming) => {
        const status = Number(incoming.statusCode) || 0;
        const body = responseBody(incoming, status);
        resolve({
          status,
          ok: status >= 200 && status < 300,
          url: parsed.href,
          headers: responseHeaders(incoming),
          body,
          async arrayBuffer() { return new ArrayBuffer(0); },
        });
      });
      request.on("error", reject);
      writeRequestBody(request, init.body);
    } catch (error) {
      request?.destroy?.();
      reject(error);
    }
  });
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

async function cancelResponseBody(response) {
  if (!response?.body || typeof response.body.cancel !== "function") return;
  try {
    await response.body.cancel();
  } catch (_error) {
    // A redirect or rejected response is already being discarded.
  }
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
  const requestedMaxRedirects = options.maxRedirects === undefined ? 5 : Number(options.maxRedirects);
  const maxRedirects = Math.min(8, Math.max(0, Number.isFinite(requestedMaxRedirects) ? Math.trunc(requestedMaxRedirects) : 5));
  const label = String(options.label || "Import request");
  const isNetworkFetch = fetchImpl.isNetworkFetch ?? fetchImpl === globalThis.fetch;
  const resolveDns = isNetworkFetch ? true : options.resolveDns ?? false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resolveOptions = { resolveDns, resolver: options.resolver, label };
    let destination = await resolveSafeRemoteUrl(url, resolveOptions);
    let currentUrl = destination.parsed.href;
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      if (controller.signal.aborted) {
        throw controller.signal.reason || new DOMException("Aborted", "AbortError");
      }
      const requestInit = { ...init, redirect: "manual", signal: controller.signal };
      const response = resolveDns
        ? await (typeof fetchImpl.withNetworkRequest === "function"
          ? fetchImpl.withNetworkRequest(currentUrl, () => requestWithPinnedAddresses(currentUrl, requestInit, destination.addresses, { requestImpl: options.requestImpl }))
          : requestWithPinnedAddresses(currentUrl, requestInit, destination.addresses, { requestImpl: options.requestImpl }))
        : await fetchImpl(currentUrl, requestInit);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.get?.("location") || "";
        if (!location || redirectCount === maxRedirects) {
          await cancelResponseBody(response);
          throw createFetchLimitError(label, "encountered an invalid or excessive redirect chain.", { code: "IMPORT_REDIRECT_FAILED", retryable: false });
        }
        let redirectUrl;
        try {
          redirectUrl = new URL(location, currentUrl).href;
        } catch (_error) {
          await cancelResponseBody(response);
          throw createFetchLimitError(label, "encountered an invalid or excessive redirect chain.", { code: "IMPORT_REDIRECT_FAILED", retryable: false });
        }
        await cancelResponseBody(response);
        destination = await resolveSafeRemoteUrl(redirectUrl, resolveOptions);
        currentUrl = destination.parsed.href;
        continue;
      }
      if (response.url) {
        if (resolveDns && response.url !== currentUrl) {
          await cancelResponseBody(response);
          throw createFetchLimitError(label, "changed its destination outside the validated redirect chain.", { code: "IMPORT_REDIRECT_FAILED", retryable: false });
        }
        if (!resolveDns) await assertSafeRemoteUrl(response.url, { resolveDns: false, label });
      }
      const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
      if (Array.isArray(options.allowedContentTypes) && options.allowedContentTypes.length > 0 && contentType && !options.allowedContentTypes.some((type) => contentType.includes(type))) {
        await cancelResponseBody(response);
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
  createPinnedLookup,
  fetchBufferWithLimits,
  fetchJsonWithLimits,
  fetchTextWithLimits,
  isPrivateIpAddress,
  requestWithPinnedAddresses,
  throwForUpstreamStatus,
};
