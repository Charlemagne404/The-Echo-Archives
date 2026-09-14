const test = require("node:test");
const assert = require("node:assert/strict");
const archiveSearch = require("../../shared/archive-search.js");

let analytics;

test.before(async () => {
  analytics = await import("../../shared/app/discovery-analytics.js");
});

test.afterEach(() => {
  delete globalThis.window;
  delete globalThis.plausible;
});

function installAnalyticsWindow({ enabled = true, plausible = null, href = "https://echoarchives.net/?q=raw%20query#archive" } = {}) {
  const calls = [];
  globalThis.window = {
    location: {
      href,
      origin: "https://echoarchives.net",
      pathname: "/",
    },
    document: {
      body: { dataset: { analyticsEnabled: String(enabled) } },
      documentElement: { dataset: {} },
    },
    plausible: plausible || ((...args) => calls.push(args)),
  };
  return calls;
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

test("an unavailable or throwing Plausible provider cannot break the caller", () => {
  installAnalyticsWindow({ plausible: null });
  delete globalThis.window.plausible;
  assert.doesNotThrow(() => analytics.trackDiscoveryPageview());
  assert.equal(analytics.trackDiscoveryPageview(), false);

  installAnalyticsWindow({ plausible: () => { throw new Error("blocked"); } });
  assert.doesNotThrow(() => analytics.trackDiscoveryEvent("Collection Opened", {
    collection_id: "best-for-long-walks",
    collection_kind: "curated",
    discovery_surface: "collections_directory",
  }));
  assert.equal(analytics.trackDiscoveryEvent("Collection Opened", {
    collection_id: "best-for-long-walks",
    collection_kind: "curated",
    discovery_surface: "collections_directory",
  }), false);
});

test("the seven v1 events accept only the controlled scalar contract", () => {
  const calls = installAnalyticsWindow();
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
  assert.deepEqual(calls.map(([eventName]) => eventName), eventProps.map(([eventName]) => eventName));
  calls.forEach(([, options], index) => {
    assert.deepEqual(options.props, eventProps[index][1]);
    assert.equal(options.url, "https://echoarchives.net/");
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
  const calls = installAnalyticsWindow({ href: "https://echoarchives.net/?q=raw%20query#archive" });
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
  assert.equal(calls.length, 1);
  const serializedCalls = JSON.stringify(calls);
  assert.doesNotMatch(serializedCalls, /raw query/i);
  assert.doesNotMatch(serializedCalls, /\?q=/i);
  assert.doesNotMatch(serializedCalls, /#archive/i);
  assert.equal(analytics.sanitizeDiscoveryUrl({ origin: "https://echoarchives.net", pathname: "/collections", search: "?q=secret", hash: "#archive" }), "https://echoarchives.net/collections");
  assert.equal(analytics.sanitizeDiscoveryUrl({ origin: "https://echoarchives.net", pathname: "/collections?q=secret#archive" }), "https://echoarchives.net/collections");
  assert.equal(analytics.sanitizeDiscoveryUrl({ href: "http://[invalid", origin: "https://echoarchives.net", pathname: "/collections?q=secret#archive" }), "https://echoarchives.net/collections");
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
  const calls = installAnalyticsWindow();

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
  assert.equal(calls[0][1].props.provider, "other");
  assert.equal(calls[1][1].props.entity_type, "unknown");
  assert.doesNotMatch(JSON.stringify(calls), /provider\.example|email=secret/i);
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
