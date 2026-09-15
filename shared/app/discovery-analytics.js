import { createAnonymousId, getAnalyticsPageProps, getAnalyticsSource, getAnonymousContext, sendAnalyticsPayload } from "./analytics-transport.js";

const EVENT_CONTRACTS = Object.freeze({
  "Page Viewed": {
    required: ["page_kind"],
    allowed: ["page_kind", "show_id", "collection_id", "entity_id"],
  },
  "Search Used": {
    required: [
      "discovery_surface",
      "query_kind",
      "structured_clause_group",
      "result_count_bucket",
      "active_filter_count_bucket",
      "recovery_context",
    ],
    allowed: [
      "discovery_surface",
      "query_kind",
      "structured_clause_group",
      "result_count_bucket",
      "active_filter_count_bucket",
      "recovery_context",
    ],
  },
  "Filter Changed": {
    required: [
      "discovery_surface",
      "filter_group",
      "filter_action",
      "filter_value",
      "active_filter_count_bucket",
      "result_count_bucket",
      "recovery_context",
    ],
    allowed: [
      "discovery_surface",
      "filter_group",
      "filter_action",
      "filter_value",
      "active_filter_count_bucket",
      "result_count_bucket",
      "recovery_context",
    ],
  },
  "Filters Cleared": {
    required: ["discovery_surface", "clear_scope", "cleared_filter_count_bucket", "had_search", "result_count_bucket_before"],
    allowed: [
      "discovery_surface",
      "clear_scope",
      "filter_group",
      "cleared_filter_count_bucket",
      "had_search",
      "result_count_bucket_before",
    ],
  },
  "Collection Opened": {
    required: ["collection_id", "collection_kind", "discovery_surface"],
    allowed: ["collection_id", "collection_kind", "discovery_surface"],
  },
  "Entity Opened": {
    required: ["entity_id", "entity_type", "discovery_surface"],
    allowed: ["entity_id", "entity_type", "discovery_surface"],
  },
  "Show Opened": {
    required: [
      "show_id",
      "discovery_surface",
      "browse_state",
      "result_type",
      "recommendation_source",
      "result_position_bucket",
      "content_profile",
    ],
    allowed: [
      "show_id",
      "discovery_surface",
      "browse_state",
      "result_type",
      "recommendation_source",
      "result_position_bucket",
      "content_profile",
      "collection_id",
      "entity_id",
    ],
  },
  "Listen Link Opened": {
    required: ["show_id", "provider", "link_role", "discovery_surface", "content_profile"],
    allowed: ["show_id", "provider", "link_role", "discovery_surface", "content_profile"],
  },
});

const FORBIDDEN_PROPERTY_NAMES = new Set([
  "query",
  "search",
  "search_text",
  "normalized_query",
  "url",
  "href",
  "referrer",
  "title",
  "description",
  "review",
  "review_text",
  "submission",
  "submission_text",
  "email",
  "alias",
  "creator_name",
  "evidence",
  "ip",
  "user_agent",
  "device_id",
  "profile_id",
  "voter_cookie",
  "session_id",
  "fingerprint",
]);

const ENUMS = Object.freeze({
  page_kind: new Set(["home", "collections", "collection", "show", "entity_directory", "entity", "submit", "info", "not_found", "other"]),
  discovery_surface: new Set([
    "home_archive",
    "collections_directory",
    "entity_directory",
    "home_collection_rail",
    "collections_featured",
    "show_page_membership",
    "entity_page_related",
    "collection_page_related",
    "internal_navigation",
    "home_entity_results",
    "entity_directory_featured",
    "entity_directory_card",
    "show_page_credit",
    "home_archive_grid",
    "home_popular_rail",
    "home_recent_rail",
    "collection_page_grid",
    "entity_page_grid",
    "show_similar",
    "show_more_from",
    "collection_membership",
    "unknown_internal",
    "show_page_hero",
    "show_page_facts",
  ]),
  query_kind: new Set(["text", "shows_like_resolved", "shows_like_unresolved"]),
  structured_clause_group: new Set(["none", "genre", "format", "completion", "review", "best_for", "transcript", "multiple"]),
  result_count_bucket: new Set(["0", "1", "2-4", "5-9", "10-24", "25+"]),
  active_filter_count_bucket: new Set(["0", "1", "2-3", "4+"]),
  recovery_context: new Set(["none", "after_zero_results", "unknown"]),
  filter_group: new Set(["genres", "tones", "formats", "bestFor", "completionStatus", "reviewStatus", "tags", "intent", "entityType"]),
  filter_action: new Set(["added", "removed"]),
  clear_scope: new Set(["all", "group"]),
  cleared_filter_count_bucket: new Set(["1", "2-3", "4+"]),
  collection_kind: new Set(["curated", "rule-based", "similarity"]),
  entity_type: new Set(["person", "production-company", "studio", "network", "unknown"]),
  browse_state: new Set(["default", "search", "filtered", "search_and_filtered"]),
  result_type: new Set(["show_card", "search_result", "collection_member", "entity_member", "similar_show", "more_from"]),
  recommendation_source: new Set([
    "none",
    "authored_similarity",
    "computed_similarity",
    "similarity_collection",
    "collection_membership",
    "creator_more_from",
    "homepage_collection",
    "unknown",
  ]),
  result_position_bucket: new Set(["1", "2-4", "5-9", "10-24", "25+", "unknown"]),
  content_profile: new Set(["full_review", "imported", "indexed_only", "unknown"]),
  provider: new Set(["start", "website", "apple", "spotify", "rss", "other"]),
  link_role: new Set(["primary", "alternate"]),
});

const EVENT_ENUMS = Object.freeze({
  "Search Used": Object.freeze({
    discovery_surface: new Set(["home_archive", "collections_directory", "entity_directory"]),
  }),
  "Filter Changed": Object.freeze({
    discovery_surface: new Set(["home_archive", "collections_directory", "entity_directory"]),
  }),
  "Filters Cleared": Object.freeze({
    discovery_surface: new Set(["home_archive", "collections_directory", "entity_directory"]),
  }),
  "Collection Opened": Object.freeze({
    discovery_surface: new Set([
      "home_collection_rail",
      "collections_featured",
      "collections_directory",
      "show_page_membership",
      "entity_page_related",
      "collection_page_related",
      "internal_navigation",
    ]),
  }),
  "Entity Opened": Object.freeze({
    discovery_surface: new Set([
      "home_entity_results",
      "entity_directory_featured",
      "entity_directory_card",
      "show_page_credit",
      "entity_page_related",
      "internal_navigation",
    ]),
  }),
  "Show Opened": Object.freeze({
    discovery_surface: new Set([
      "home_archive_grid",
      "home_popular_rail",
      "home_recent_rail",
      "home_collection_rail",
      "collection_page_grid",
      "entity_page_grid",
      "show_similar",
      "show_more_from",
      "collection_membership",
      "internal_link",
      "unknown_internal",
    ]),
  }),
  "Listen Link Opened": Object.freeze({
    discovery_surface: new Set(["show_page_hero", "show_page_facts"]),
  }),
});

const CONTROLLED_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const CONTROLLED_FILTER_VALUE_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export const DISCOVERY_EVENTS = Object.freeze(Object.keys(EVENT_CONTRACTS));

export function bucketDiscoveryResultCount(count) {
  const numericCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
  if (numericCount === 0) return "0";
  if (numericCount === 1) return "1";
  if (numericCount <= 4) return "2-4";
  if (numericCount <= 9) return "5-9";
  if (numericCount <= 24) return "10-24";
  return "25+";
}

export function bucketDiscoveryFilterCount(count) {
  const numericCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
  if (numericCount === 0) return "0";
  if (numericCount === 1) return "1";
  if (numericCount <= 3) return "2-3";
  return "4+";
}

export function bucketDiscoveryClearedFilterCount(count) {
  const numericCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
  if (numericCount <= 1) return "1";
  if (numericCount <= 3) return "2-3";
  return "4+";
}

export function bucketDiscoveryPosition(position) {
  const numericPosition = Number.isFinite(Number(position)) ? Math.max(1, Number(position)) : 0;
  if (numericPosition === 1) return "1";
  if (numericPosition <= 4) return "2-4";
  if (numericPosition <= 9) return "5-9";
  if (numericPosition <= 24) return "10-24";
  if (numericPosition > 24) return "25+";
  return "unknown";
}

export function getDiscoveryContentProfile(reviewStatus) {
  switch (String(reviewStatus || "").trim().toLowerCase()) {
    case "full-review":
    case "full_review":
      return "full_review";
    case "imported":
      return "imported";
    case "indexed-only":
    case "indexed_only":
      return "indexed_only";
    default:
      return "unknown";
  }
}

export function sanitizeDiscoveryUrl(locationLike = globalThis.location) {
  if (!locationLike) {
    return "";
  }

  if (typeof locationLike === "object" && !locationLike.href) {
    const origin = String(locationLike.origin || "").trim().replace(/\/+$/, "");
    const pathname = String(locationLike.pathname || "/").trim().split(/[?#]/, 1)[0] || "/";
    if (origin && /^https?:\/\//i.test(origin) && pathname.startsWith("/")) {
      return `${origin}${pathname}`;
    }
    return "";
  }

  try {
    const locationUrl = new URL(String(locationLike.href || locationLike), String(locationLike.origin || "http://localhost"));
    if (!/^https?:$/i.test(locationUrl.protocol)) {
      return "";
    }
    return `${locationUrl.origin}${locationUrl.pathname || "/"}`;
  } catch (_error) {
    const origin = String(locationLike.origin || "").trim().replace(/\/+$/, "");
    const pathname = String(locationLike.pathname || "/").trim().split(/[?#]/, 1)[0] || "/";
    if (!origin || !/^https?:\/\//i.test(origin) || !pathname.startsWith("/")) {
      return "";
    }
    return `${origin}${pathname}`;
  }
}

function getRuntimeWindow() {
  if (typeof window !== "undefined") {
    return window;
  }
  return globalThis.window || null;
}

function isDiscoveryAnalyticsEnabled() {
  const runtimeWindow = getRuntimeWindow();
  const body = runtimeWindow?.document?.body || (typeof document !== "undefined" ? document.body : null);
  const root = runtimeWindow?.document?.documentElement || (typeof document !== "undefined" ? document.documentElement : null);
  return body?.dataset?.analyticsEnabled !== "false" && root?.dataset?.analyticsEnabled !== "false";
}

function isSafeScalar(value) {
  return typeof value === "string" || typeof value === "boolean";
}

function isControlledId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && CONTROLLED_ID_PATTERN.test(value);
}

function isControlledFilterValue(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 80 && CONTROLLED_FILTER_VALUE_PATTERN.test(value);
}

function hasOnlyAllowedKeys(eventName, props) {
  const contract = EVENT_CONTRACTS[eventName];
  return Object.keys(props).every((key) => contract.allowed.includes(key) && !FORBIDDEN_PROPERTY_NAMES.has(key));
}

function hasRequiredKeys(eventName, props) {
  return EVENT_CONTRACTS[eventName].required.every((key) => Object.hasOwn(props, key));
}

function validateEnum(eventName, key, value) {
  const eventEnum = EVENT_ENUMS[eventName]?.[key];
  if (eventEnum) {
    return eventEnum.has(value);
  }
  return ENUMS[key]?.has(value) ?? true;
}

function normalizeDiscoveryProps(eventName, props) {
  const contract = EVENT_CONTRACTS[eventName];
  if (!contract || !props || typeof props !== "object" || Array.isArray(props)) {
    return null;
  }

  const inputKeys = Object.keys(props);
  if (inputKeys.length !== new Set(inputKeys).size || !hasOnlyAllowedKeys(eventName, props) || !hasRequiredKeys(eventName, props)) {
    return null;
  }

  if (inputKeys.some((key) => !isSafeScalar(props[key]))) {
    return null;
  }

  const safeProps = {};
  for (const key of inputKeys) {
    const value = props[key];
    if (typeof value === "string") {
      const trimmedValue = value.trim();
      let normalizedValue = trimmedValue;
      if (key === "provider" && !ENUMS.provider.has(normalizedValue)) {
        normalizedValue = "other";
      }
      if (key === "entity_type" && !ENUMS.entity_type.has(normalizedValue)) {
        normalizedValue = "unknown";
      }
      if (!normalizedValue || normalizedValue.length > 160 || !validateEnum(eventName, key, normalizedValue)) {
        return null;
      }
      safeProps[key] = normalizedValue;
    } else {
      safeProps[key] = value;
    }
  }

  if (eventName === "Filters Cleared") {
    if (safeProps.clear_scope === "group" && !ENUMS.filter_group.has(safeProps.filter_group)) return null;
    if (safeProps.clear_scope === "all" && Object.hasOwn(safeProps, "filter_group")) return null;
  }

  for (const key of ["collection_id", "entity_id", "show_id"]) {
    if (Object.hasOwn(safeProps, key) && !isControlledId(safeProps[key])) return null;
  }

  if (Object.hasOwn(safeProps, "filter_value") && !isControlledFilterValue(safeProps.filter_value)) {
    return null;
  }

  if (eventName === "Show Opened") {
    const collectionSources = new Set(["similarity_collection", "collection_membership", "homepage_collection"]);
    const entityResult = safeProps.result_type === "entity_member" || safeProps.discovery_surface === "entity_page_grid";
    if (collectionSources.has(safeProps.recommendation_source) && !safeProps.collection_id) return null;
    if (safeProps.recommendation_source === "creator_more_from" && !safeProps.entity_id) return null;
    if (entityResult && !safeProps.entity_id) return null;
    if (safeProps.collection_id && !collectionSources.has(safeProps.recommendation_source) && safeProps.discovery_surface !== "collection_page_grid") {
      return null;
    }
    if (safeProps.entity_id && !entityResult && safeProps.recommendation_source !== "creator_more_from") {
      return null;
    }
  }

  return safeProps;
}

export function trackDiscoveryEvent(eventName, props) {
  if (!isDiscoveryAnalyticsEnabled()) {
    return false;
  }
  const safeProps = normalizeDiscoveryProps(eventName, props);
  const { pathname } = getAnalyticsPageProps();
  if (!safeProps || !pathname) return false;
  const context = getAnonymousContext();
  return sendAnalyticsPayload({
    eventId: createAnonymousId(),
    eventName,
    visitorId: context.visitorId,
    sessionId: context.sessionId,
    pagePath: pathname,
    source: getAnalyticsSource(),
    properties: safeProps,
  });
}

export function trackDiscoveryPageview() {
  if (!isDiscoveryAnalyticsEnabled()) {
    return false;
  }
  const { pathname, props } = getAnalyticsPageProps();
  const safeProps = normalizeDiscoveryProps("Page Viewed", props);
  if (!safeProps || !pathname) return false;
  const context = getAnonymousContext();
  return sendAnalyticsPayload({
    eventId: createAnonymousId(),
    eventName: "Page Viewed",
    visitorId: context.visitorId,
    sessionId: context.sessionId,
    pagePath: pathname,
    source: getAnalyticsSource(),
    properties: safeProps,
  });
}

export function getDiscoveryAnalyticsHeaders() {
  if (!isDiscoveryAnalyticsEnabled()) return {};
  const { pathname } = getAnalyticsPageProps();
  if (!pathname) return {};
  const context = getAnonymousContext();
  return {
    "X-Echo-Analytics-Visitor": context.visitorId,
    "X-Echo-Analytics-Session": context.sessionId,
    "X-Echo-Analytics-Event-Id": createAnonymousId(),
    "X-Echo-Analytics-Path": pathname,
    "X-Echo-Analytics-Source": getAnalyticsSource(),
  };
}

export function validateDiscoveryProps(eventName, props) {
  return normalizeDiscoveryProps(eventName, props);
}
