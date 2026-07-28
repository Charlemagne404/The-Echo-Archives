const {
  classifyNetworkError,
  normalizeExternalUrl,
  requestExternalLink,
} = require("./external-link-probe");

const HEALTH_CLASSIFICATIONS = Object.freeze([
  "healthy",
  "confirmed-http-failure",
  "dns-error",
  "tls-error",
  "timeout",
  "bot-block",
  "inconclusive",
]);

function collectCatalogExternalLinks(catalog) {
  const linksByUrl = new Map();

  (Array.isArray(catalog) ? catalog : [])
    .filter((show) => show?.status === "published")
    .forEach((show) => {
      ["listenLinks", "officialLinks"].forEach((fieldName) => {
        const linkMap = show?.[fieldName];
        if (!linkMap || typeof linkMap !== "object" || Array.isArray(linkMap)) {
          return;
        }

        Object.entries(linkMap).forEach(([key, value]) => {
          const url = normalizeExternalUrl(value);
          if (!url) {
            return;
          }

          if (!linksByUrl.has(url)) {
            linksByUrl.set(url, {
              url,
              references: [],
            });
          }
          linksByUrl.get(url).references.push({
            showId: String(show.id || ""),
            showTitle: String(show.title || show.id || "Untitled show"),
            field: `${fieldName}.${key}`,
          });
        });
      });
    });

  return [...linksByUrl.values()]
    .map((entry) => ({
      ...entry,
      references: entry.references.sort(
        (left, right) => left.showId.localeCompare(right.showId) || left.field.localeCompare(right.field),
      ),
    }))
    .sort((left, right) => left.url.localeCompare(right.url));
}

function summarizeAttempts(attempts) {
  const classifications = new Set(attempts.map((attempt) => attempt.classification));
  if (classifications.size === 1) {
    const [classification] = classifications;
    return classification === "http-failure" ? "confirmed-http-failure" : classification;
  }
  return "inconclusive";
}

async function verifyExternalLink(
  url,
  {
    fetchImpl = globalThis.fetch,
    retries = 2,
    retryDelayMs = 750,
    timeoutMs = 12_000,
    maxRedirects = 8,
    userAgent = "The-Echo-Archives-Link-Health/1.0",
    sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("verifyExternalLink requires a fetch implementation.");
  }

  const attempts = [];
  for (let attemptNumber = 0; attemptNumber <= retries; attemptNumber += 1) {
    const result = await requestExternalLink(url, {
      fetchImpl,
      timeoutMs,
      maxRedirects,
      userAgent,
    });
    attempts.push(result);
    if (result.classification === "healthy") {
      break;
    }
    if (attemptNumber < retries && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  const lastAttempt = attempts.at(-1);
  const classification = summarizeAttempts(attempts);
  return {
    url,
    classification,
    reason:
      classification === "inconclusive" && new Set(attempts.map((attempt) => attempt.classification)).size > 1
        ? `mixed-results:${[...new Set(attempts.map((attempt) => attempt.classification))].join(",")}`
        : lastAttempt.reason,
    status: lastAttempt.status,
    finalUrl: lastAttempt.finalUrl,
    redirects: lastAttempt.redirects,
    attemptCount: attempts.length,
    attempts,
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function summarizeHealthResults(results) {
  const summary = Object.fromEntries(HEALTH_CLASSIFICATIONS.map((classification) => [classification, 0]));
  results.forEach((result) => {
    summary[result.classification] = (summary[result.classification] || 0) + 1;
  });
  return summary;
}

async function checkCatalogExternalLinks(
  catalog,
  {
    concurrency = 4,
    ...verificationOptions
  } = {},
) {
  const links = collectCatalogExternalLinks(catalog);
  const results = await mapWithConcurrency(links, concurrency, async (link) => ({
    ...(await verifyExternalLink(link.url, verificationOptions)),
    references: link.references,
  }));

  return {
    total: links.length,
    summary: summarizeHealthResults(results),
    results,
  };
}

module.exports = {
  HEALTH_CLASSIFICATIONS,
  checkCatalogExternalLinks,
  classifyNetworkError,
  collectCatalogExternalLinks,
  mapWithConcurrency,
  summarizeHealthResults,
  verifyExternalLink,
};
