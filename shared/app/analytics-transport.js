const VISITOR_STORAGE_KEY = "echo-analytics-visitor-v1";
const SESSION_STORAGE_KEY = "echo-analytics-session-v1";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CONTROLLED_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const MAX_PATH_LENGTH = 240;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let memoryVisitorId = "";
let memorySession = null;

function getRuntimeWindow() {
  if (typeof window !== "undefined") return window;
  return globalThis.window || null;
}

export function createAnonymousId() {
  const runtimeWindow = getRuntimeWindow();
  const randomUuid = runtimeWindow?.crypto?.randomUUID || globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") {
    try {
      return randomUuid.call(runtimeWindow?.crypto || globalThis.crypto).replaceAll("-", "");
    } catch (_error) {
      // Fall through to the local random fallback.
    }
  }
  const randomPart = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}${randomPart}`.padEnd(24, "0").slice(0, 64);
}

function readTokenStorage(storage, key) {
  try {
    const value = storage?.getItem(key) || "";
    return TOKEN_PATTERN.test(value) ? value : "";
  } catch (_error) {
    return "";
  }
}

function readSessionStorage(storage, now) {
  try {
    const rawValue = storage?.getItem(SESSION_STORAGE_KEY) || "";
    if (TOKEN_PATTERN.test(rawValue)) {
      return { id: rawValue, createdAt: now, lastSeenAt: now };
    }
    const value = JSON.parse(rawValue);
    if (!TOKEN_PATTERN.test(value?.id)) return null;
    const createdAt = Number(value.createdAt);
    const lastSeenAt = Number(value.lastSeenAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(lastSeenAt)) return null;
    if (now - lastSeenAt > SESSION_IDLE_TIMEOUT_MS || now - createdAt > SESSION_MAX_AGE_MS) return null;
    return { id: value.id, createdAt, lastSeenAt };
  } catch (_error) {
    return null;
  }
}

function writeSessionStorage(storage, session) {
  writeStorage(storage, SESSION_STORAGE_KEY, JSON.stringify(session));
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch (_error) {
    // Private browsing and storage policies should not interrupt page work.
  }
}

export function getAnonymousContext() {
  const runtimeWindow = getRuntimeWindow();
  const now = Date.now();
  let visitorId = readTokenStorage(runtimeWindow?.localStorage, VISITOR_STORAGE_KEY) || memoryVisitorId;
  let session = readSessionStorage(runtimeWindow?.sessionStorage, now) || memorySession;

  if (!visitorId) {
    visitorId = createAnonymousId();
    memoryVisitorId = visitorId;
    writeStorage(runtimeWindow?.localStorage, VISITOR_STORAGE_KEY, visitorId);
  }
  if (!session || now - session.lastSeenAt > SESSION_IDLE_TIMEOUT_MS || now - session.createdAt > SESSION_MAX_AGE_MS) {
    session = { id: createAnonymousId(), createdAt: now, lastSeenAt: now };
  } else {
    session = { ...session, lastSeenAt: now };
  }
  memorySession = session;
  writeSessionStorage(runtimeWindow?.sessionStorage, session);

  return { visitorId, sessionId: session.id };
}

export function sanitizeAnalyticsPath(value = "") {
  const path = String(value || "").trim().split(/[?#]/, 1)[0] || "/";
  if (
    !path.startsWith("/")
    || path.length > MAX_PATH_LENGTH
    || /[\u0000-\u001f\u007f\s]/.test(path)
    || path.includes("..")
  ) {
    return "";
  }
  return path;
}

function decodeControlledId(value) {
  try {
    const decoded = decodeURIComponent(String(value || "")).trim().toLowerCase();
    return decoded.length <= 160 && CONTROLLED_ID_PATTERN.test(decoded) ? decoded : "";
  } catch (_error) {
    return "";
  }
}

function getPathId(pathname, routeName) {
  const match = String(pathname || "").match(new RegExp(`^/${routeName}/([^/]+)/?$`, "i"));
  return match ? decodeControlledId(match[1]) : "";
}

function getQueryId(location, key) {
  try {
    return decodeControlledId(new URLSearchParams(String(location?.search || "")).get(key));
  } catch (_error) {
    return "";
  }
}

function hasClass(body, className) {
  return Boolean(body?.classList?.contains?.(className) || String(body?.className || "").split(/\s+/).includes(className));
}

export function getAnalyticsPageProps() {
  const runtimeWindow = getRuntimeWindow();
  const location = runtimeWindow?.location || globalThis.location || {};
  const pathname = sanitizeAnalyticsPath(location.pathname || "/") || "/";
  const body = runtimeWindow?.document?.body || (typeof document !== "undefined" ? document.body : null);
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const showId = getPathId(pathname, "shows") || (normalizedPath === "/show" ? getQueryId(location, "id") : "");
  const collectionId = getPathId(pathname, "collections") || (normalizedPath === "/collection" ? getQueryId(location, "id") : "");
  const entityId = getPathId(pathname, "creators");

  let pageKind = "other";
  if (hasClass(body, "not-found-page") || normalizedPath === "/404.html") pageKind = "not_found";
  else if (showId || hasClass(body, "show-page") || normalizedPath === "/show") pageKind = "show";
  else if (collectionId || hasClass(body, "collection-page") || normalizedPath === "/collection") pageKind = "collection";
  else if (entityId) pageKind = "entity";
  else if (hasClass(body, "entity-directory-page") || normalizedPath === "/creators") pageKind = "entity_directory";
  else if (hasClass(body, "collections-page") || normalizedPath === "/collections") pageKind = "collections";
  else if (hasClass(body, "submit-page") || normalizedPath === "/submit") pageKind = "submit";
  else if (hasClass(body, "home-page") && (normalizedPath === "/" || normalizedPath === "")) pageKind = "home";
  else if (hasClass(body, "info-page")) pageKind = "info";

  const props = { page_kind: pageKind };
  if (pageKind === "show" && showId) props.show_id = showId;
  if (pageKind === "collection" && collectionId) props.collection_id = collectionId;
  if (pageKind === "entity" && entityId) props.entity_id = entityId;
  return { pathname, props };
}

export function getAnalyticsSource() {
  const runtimeWindow = getRuntimeWindow();
  const referrer = String(runtimeWindow?.document?.referrer || "").trim();
  if (!referrer) return "direct";
  try {
    const referrerUrl = new URL(referrer);
    const currentOrigin = String(runtimeWindow?.location?.origin || "").toLowerCase();
    if (currentOrigin && referrerUrl.origin.toLowerCase() === currentOrigin) return "internal";
    const hostname = referrerUrl.hostname.toLowerCase().replace(/^www\./, "");
    return hostname || "unknown";
  } catch (_error) {
    return "unknown";
  }
}

export function sendAnalyticsPayload(payload) {
  const runtimeWindow = getRuntimeWindow();
  const fetcher = runtimeWindow?.fetch || globalThis.fetch;
  if (typeof fetcher !== "function") return false;

  try {
    const request = fetcher.call(runtimeWindow, "/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify(payload),
    });
    Promise.resolve(request).catch(() => {});
    return true;
  } catch (_error) {
    return false;
  }
}
