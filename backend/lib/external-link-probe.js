const { assertSafeRemoteUrl } = require("./import/fetch");

const BOT_BLOCK_STATUSES = new Set([401, 403, 406, 429]);
const DNS_ERROR_CODES = new Set(["EAI_AGAIN", "ENODATA", "ENOTFOUND"]);
const TIMEOUT_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
]);
const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function normalizeExternalUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch (_error) {
    return "";
  }
}

function resolveRedirectUrl(location, currentUrl) {
  try {
    return normalizeExternalUrl(new URL(location, currentUrl).toString());
  } catch (_error) {
    return "";
  }
}

function readHeader(response, name) {
  return String(response?.headers?.get?.(name) || "").trim();
}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch (_error) {
    // The health check only needs status and headers. Ignore cleanup failures.
  }
}

function isBotBlockResponse(response) {
  if (BOT_BLOCK_STATUSES.has(response.status)) {
    return true;
  }

  return (
    response.status === 503 &&
    (
      readHeader(response, "cf-mitigated").toLowerCase() === "challenge" ||
      readHeader(response, "x-sucuri-block").length > 0
    )
  );
}

function collectErrorDetails(error) {
  const codes = new Set();
  const messages = [];
  const seen = new Set();
  let current = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current.code) {
      codes.add(String(current.code).toUpperCase());
    }
    if (current.message) {
      messages.push(String(current.message));
    }
    current = current.cause;
  }

  return {
    codes,
    message: messages.join(" | "),
    name: String(error?.name || ""),
  };
}

function classifyNetworkError(error, timedOut = false) {
  const details = collectErrorDetails(error);

  if (timedOut || details.name === "AbortError" || [...details.codes].some((code) => TIMEOUT_ERROR_CODES.has(code))) {
    return { classification: "timeout", reason: "request-timeout" };
  }
  if ([...details.codes].some((code) => DNS_ERROR_CODES.has(code))) {
    return { classification: "dns-error", reason: [...details.codes].find((code) => DNS_ERROR_CODES.has(code)) };
  }
  if (
    [...details.codes].some(
      (code) => TLS_ERROR_CODES.has(code) || code.startsWith("ERR_SSL_") || code.startsWith("ERR_TLS_") || code.startsWith("CERT_"),
    ) ||
    /\b(?:certificate|ssl|tls)\b/i.test(details.message)
  ) {
    return {
      classification: "tls-error",
      reason: [...details.codes].find((code) => TLS_ERROR_CODES.has(code) || /^(?:CERT_|ERR_(?:SSL|TLS)_)/.test(code)) || "tls-error",
    };
  }

  return {
    classification: "inconclusive",
    reason: [...details.codes][0] || details.name || "network-error",
  };
}

async function requestExternalLink(
  url,
  {
    fetchImpl,
    timeoutMs,
    maxRedirects,
    userAgent,
  },
) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let currentUrl = url;
  const redirects = [];

  try {
    currentUrl = (await assertSafeRemoteUrl(currentUrl, {
      label: "External link health request",
      resolveDns: false,
    })).href;

    for (let redirectCount = 0; ; redirectCount += 1) {
      const response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "user-agent": userAgent,
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = readHeader(response, "location");
        await cancelResponseBody(response);
        if (!location) {
          return {
            classification: "inconclusive",
            reason: "redirect-without-location",
            status: response.status,
            finalUrl: currentUrl,
            redirects,
          };
        }
        if (redirectCount >= maxRedirects) {
          return {
            classification: "inconclusive",
            reason: "too-many-redirects",
            status: response.status,
            finalUrl: currentUrl,
            redirects,
          };
        }

        const nextUrl = resolveRedirectUrl(location, currentUrl);
        if (!nextUrl) {
          return {
            classification: "inconclusive",
            reason: "invalid-redirect-destination",
            status: response.status,
            finalUrl: currentUrl,
            redirects,
          };
        }
        await assertSafeRemoteUrl(nextUrl, {
          label: "External link health redirect",
          resolveDns: false,
        });
        if (redirects.includes(nextUrl) || nextUrl === url) {
          return {
            classification: "inconclusive",
            reason: "redirect-loop",
            status: response.status,
            finalUrl: currentUrl,
            redirects,
          };
        }

        redirects.push(nextUrl);
        currentUrl = nextUrl;
        continue;
      }

      await cancelResponseBody(response);
      if (response.status >= 200 && response.status < 300) {
        return {
          classification: "healthy",
          reason: "http-success",
          status: response.status,
          finalUrl: currentUrl,
          redirects,
        };
      }
      if (isBotBlockResponse(response)) {
        return {
          classification: "bot-block",
          reason: "access-control-or-bot-challenge",
          status: response.status,
          finalUrl: currentUrl,
          redirects,
        };
      }
      if (response.status >= 500 && response.status < 600) {
        return {
          classification: "inconclusive",
          reason: `upstream-http-${response.status}`,
          status: response.status,
          finalUrl: currentUrl,
          redirects,
        };
      }
      if (response.status >= 400 && response.status < 600) {
        return {
          classification: "http-failure",
          reason: `http-${response.status}`,
          status: response.status,
          finalUrl: currentUrl,
          redirects,
        };
      }

      return {
        classification: "inconclusive",
        reason: `unexpected-http-${response.status}`,
        status: response.status,
        finalUrl: currentUrl,
        redirects,
      };
    }
  } catch (error) {
    return {
      ...classifyNetworkError(error, timedOut),
      status: null,
      finalUrl: currentUrl,
      redirects,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  classifyNetworkError,
  normalizeExternalUrl,
  requestExternalLink,
};
