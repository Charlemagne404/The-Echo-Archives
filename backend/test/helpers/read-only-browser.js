const READ_ONLY_METHODS = new Set(["GET", "HEAD"]);

function summarizeRequest(request) {
  const requestUrl = new URL(request.url());
  return {
    method: request.method().toUpperCase(),
    origin: requestUrl.origin,
    pathname: requestUrl.pathname || "/",
    resourceType: request.resourceType(),
  };
}

function formatMutationAttempt(attempt) {
  return `${attempt.method} ${attempt.origin}${attempt.pathname}`;
}

/**
 * Create a browser context that is safe for read-only production verification.
 *
 * The context must be created before any page is opened. Service workers are
 * disabled because Playwright routing does not cover requests handled by a
 * service worker. The route is context-wide so popups and every page share the
 * same fail-closed guard. Analytics is disabled before document scripts run so
 * normal pageviews do not become expected production writes.
 */
async function createReadOnlyBrowserContext(browser, options = {}) {
  if (!browser || typeof browser.newContext !== "function") {
    throw new TypeError("A Playwright browser instance is required.");
  }
  if (Object.hasOwn(options, "serviceWorkers") && options.serviceWorkers !== "block") {
    throw new Error('Read-only browser contexts require serviceWorkers: "block".');
  }

  const context = await browser.newContext({
    ...options,
    serviceWorkers: "block",
  });
  const mutationAttempts = [];

  await context.addInitScript(() => {
    // initializeApp() checks this before it sends the first pageview.
    const disableAnalytics = () => {
      if (!document.documentElement) return false;
      document.documentElement.setAttribute("data-analytics-enabled", "false");
      return true;
    };

    if (!disableAnalytics()) {
      const observer = new MutationObserver(() => {
        if (disableAnalytics()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  });

  const routeHandler = async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    if (READ_ONLY_METHODS.has(method)) {
      await route.continue();
      return;
    }

    const attempt = summarizeRequest(request);
    mutationAttempts.push(attempt);
    await route.abort("blockedbyclient");
  };

  // Install this before creating a page or navigating. Page-level routes are
  // too narrow for popups and can be bypassed by service-worker requests.
  await context.route("**/*", routeHandler);

  return {
    context,
    getMutationAttempts() {
      return mutationAttempts.map((attempt) => ({ ...attempt }));
    },
    assertNoMutationAttempts() {
      if (mutationAttempts.length === 0) return;
      const details = mutationAttempts.map(formatMutationAttempt).join(", ");
      throw new Error(`Read-only browser guard blocked unexpected mutation request(s): ${details}`);
    },
    async close() {
      await context.unroute("**/*", routeHandler);
      await context.close();
    },
  };
}

module.exports = {
  READ_ONLY_METHODS,
  createReadOnlyBrowserContext,
  formatMutationAttempt,
  summarizeRequest,
};
