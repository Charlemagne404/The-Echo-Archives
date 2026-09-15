const test = require("node:test");
const assert = require("node:assert/strict");
const archiveSearch = require("../../shared/archive-search.js");

let analytics;

test.before(async () => {
  analytics = await import("../../shared/app/discovery-analytics.js");
});

test.afterEach(() => {
  delete globalThis.window;
});

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function installAnalyticsWindow({ enabled = true, href = "https://echoarchives.net/?q=raw%20query#archive", referrer = "", bodyClass = "" } = {}) {
  const requests = [];
  const location = new URL(href);
  globalThis.window = {
    location: {
      href: location.href,
      origin: location.origin,
      pathname: location.pathname,
      search: location.search,
    },
    document: {
      body: { className: bodyClass, dataset: { analyticsEnabled: String(enabled) } },
      documentElement: { dataset: {} },
      referrer,
    },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    fetch: (url, init) => {
      requests.push({ url, init });
      return Promise.resolve({ ok: true });
    },
  };
  return requests;
}

test("analytics disabled is a quiet no-op", () => {
  const calls = installAnalyticsWindow({ enabled: false });

  assert.equal(
    analytics.trackDiscoveryEvent("Search Used", {
      discovery_surface: "home_archive",
      query_kind: "text",
      structured_clause_group: "none",
      result_count_bucket: "1",
      active_filter_count_bucket: "0",
      recovery_context: "none",
    }),
    false,
  );
  assert.equal(analytics.trackDiscoveryPageview(), false);
  assert.equal(calls.length, 0);
});

test("an unavailable first-party transport cannot break the caller", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = undefined;
  try {
    installAnalyticsWindow();
    delete globalThis.window.fetch;
    assert.doesNotThrow(() => analytics.trackDiscoveryPageview());
    assert.equal(analytics.trackDiscoveryPageview(), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public discovery events accept only the controlled scalar contract", () => {
  const requests = installAnalyticsWindow();
  const eventProps = [
    ["Search Used", {
      discovery_surface: "home_archive",
      query_kind: "shows_like_resolved",
      structured_clause_group: "multiple",
      result_count_bucket: "5-9",
      active_filter_count_bucket: "1",
      recovery_context: "after_zero_results",
    }],
    ["Filter Changed", {
      discovery_surface: "home_archive",
      filter_group: "genres",
      filter_action: "added",
      filter_value: "science-fiction",
      active_filter_count_bucket: "1",
      result_count_bucket: "10-24",
      recovery_context: "none",
    }],
    ["Filters Cleared", {
      discovery_surface: "collections_directory",
      clear_scope: "group",
      filter_group: "intent",
      cleared_filter_count_bucket: "1",
      had_search: true,
      result_count_bucket_before: "0",
    }],
    ["Collection Opened", {
      collection_id: "shows-like-derelict",
      collection_kind: "similarity",
      discovery_surface: "home_collection_rail",
    }],
    ["Entity Opened", {
      entity_id: "7-lamb-productions",
      entity_type: "production-company",
      discovery_surface: "entity_directory_card",
    }],
    ["Show Opened", {
      show_id: "midnight-burger",
      discovery_surface: "show_more_from",
      browse_state: "default",
      result_type: "more_from",
      recommendation_source: "creator_more_from",
      result_position_bucket: "2-4",
      content_profile: "full_review",
      entity_id: "7-lamb-productions",
    }],
    ["Listen Link Opened", {
      show_id: "midnight-burger",
      provider: "spotify",
      link_role: "alternate",
      discovery_surface: "show_page_facts",
      content_profile: "full_review",
    }],
  ];

  eventProps.forEach(([eventName, props]) => {
    assert.equal(analytics.trackDiscoveryEvent(eventName, props), true, eventName);
  });
  const payloads = requests.map(({ init }) => JSON.parse(init.body));
  assert.deepEqual(payloads.map(({ eventName }) => eventName), eventProps.map(([eventName]) => eventName));
  payloads.forEach((payload, index) => {
    assert.deepEqual(payload.properties, eventProps[index][1]);
    assert.equal(payload.pagePath, "/");
    assert.ok(payload.visitorId);
    assert.ok(payload.sessionId);
  });

  assert.equal(analytics.trackDiscoveryEvent("Search Used", {
    discovery_surface: "show_page_hero",
    query_kind: "text",
    structured_clause_group: "none",
    result_count_bucket: "1",
    active_filter_count_bucket: "0",
    recovery_context: "none",
  }), false);
});

test("raw search data, forbidden keys, nested values, and query-bearing URLs never leave the browser", () => {
  const requests = installAnalyticsWindow({ href: "https://echoarchives.net/?q=raw%20query#archive" });
  const rawQuery = "raw query with personal detail";

  assert.equal(analytics.trackDiscoveryEvent("Search Used", {
    query: rawQuery,
    discovery_surface: "home_archive",
    query_kind: "text",
    structured_clause_group: "none",
    result_count_bucket: "1",
    active_filter_count_bucket: "0",
    recovery_context: "none",
  }), false);
  assert.equal(analytics.trackDiscoveryEvent("Filter Changed", {
    discovery_surface: "home_archive",
    filter_group: "genres",
    filter_action: "added",
    filter_value: ["raw query"],
    active_filter_count_bucket: "1",
    result_count_bucket: "1",
    recovery_context: "none",
  }), false);
  assert.equal(analytics.trackDiscoveryPageview(), true);
  assert.equal(requests.length, 1);
  const serializedCalls = JSON.stringify(requests.map(({ init }) => JSON.parse(init.body)));
  assert.doesNotMatch(serializedCalls, /raw query/i);
  assert.doesNotMatch(serializedCalls, /\?q=/i);
  assert.doesNotMatch(serializedCalls, /#archive/i);
  assert.equal(analytics.sanitizeDiscoveryUrl({ origin: "https://echoarchives.net", pathname: "/collections", search: "?q=secret", hash: "#archive" }), "https://echoarchives.net/collections");
  assert.equal(analytics.sanitizeDiscoveryUrl({ origin: "https://echoarchives.net", pathname: "/collections?q=secret#archive" }), "https://echoarchives.net/collections");
  assert.equal(analytics.sanitizeDiscoveryUrl({ href: "http://[invalid", origin: "https://echoarchives.net", pathname: "/collections?q=secret#archive" }), "https://echoarchives.net/collections");
});

test("page views keep route-safe content ids while dropping query strings", () => {
  const requests = installAnalyticsWindow({ href: "https://echoarchives.net/shows/impact-winter?utm_source=private" });

  assert.equal(analytics.trackDiscoveryPageview(), true);
  const payload = JSON.parse(requests[0].init.body);
  assert.equal(payload.pagePath, "/shows/impact-winter");
  assert.deepEqual(payload.properties, { page_kind: "show", show_id: "impact-winter" });
  assert.doesNotMatch(JSON.stringify(payload), /utm_source|private/i);
});

test("not-found routes do not attribute route-shaped ids to archive content", () => {
  const requests = installAnalyticsWindow({ href: "https://echoarchives.net/shows/not-a-real-show", bodyClass: "not-found-page" });

  assert.equal(analytics.trackDiscoveryPageview(), true);
  const payload = JSON.parse(requests[0].init.body);
  assert.deepEqual(payload.properties, { page_kind: "not_found" });
});

test("invalid or unknown event contracts fail closed", () => {
  installAnalyticsWindow();
  assert.equal(analytics.trackDiscoveryEvent("Recommendation Opened", {}), false);
  assert.equal(analytics.trackDiscoveryEvent("Entity Opened", {
    entity_id: "raw entity name",
    entity_type: "production-company",
    discovery_surface: "entity_directory_card",
  }), false);
  assert.equal(analytics.trackDiscoveryEvent("Filters Cleared", {
    discovery_surface: "home_archive",
    clear_scope: "all",
    filter_group: "genres",
    cleared_filter_count_bucket: "1",
    had_search: false,
    result_count_bucket_before: "1",
  }), false);
});

test("unknown provider and entity type values collapse to their safe enum values", () => {
  const requests = installAnalyticsWindow();

  assert.equal(analytics.trackDiscoveryEvent("Listen Link Opened", {
    show_id: "midnight-burger",
    provider: "https://provider.example/listen?email=secret@example.com",
    link_role: "alternate",
    discovery_surface: "show_page_facts",
    content_profile: "full_review",
  }), true);
  assert.equal(analytics.trackDiscoveryEvent("Entity Opened", {
    entity_id: "7-lamb-productions",
    entity_type: "Avery Example",
    discovery_surface: "entity_directory_card",
  }), true);
  const payloads = requests.map(({ init }) => JSON.parse(init.body));
  assert.equal(payloads[0].properties.provider, "other");
  assert.equal(payloads[1].properties.entity_type, "unknown");
  assert.doesNotMatch(JSON.stringify(payloads), /provider\.example|email=secret/i);
});

test("query classification stays controlled and never returns the query or seed title", () => {
  const catalog = [
    { id: "derelict", title: "Derelict", genres: ["science-fiction"], formats: ["serialized"] },
  ];
  const resolved = archiveSearch.classifyQueryShape(catalog, "shows like Derelict");
  const unresolved = archiveSearch.classifyQueryShape(catalog, "shows like Unknown Signal");
  const structured = archiveSearch.classifyQueryShape(catalog, "completed science fiction");

  assert.deepEqual(resolved, { queryKind: "shows_like_resolved", structuredClauseGroup: "none" });
  assert.deepEqual(unresolved, { queryKind: "shows_like_unresolved", structuredClauseGroup: "none" });
  assert.equal(structured.queryKind, "text");
  assert.equal(structured.structuredClauseGroup, "multiple");
  assert.doesNotMatch(JSON.stringify({ resolved, unresolved, structured }), /derelict|unknown signal/i);
});
