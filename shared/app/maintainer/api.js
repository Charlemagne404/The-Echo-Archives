const MAINTAINER_API_ROOT = "/api/maintainer";

export class MaintainerAuthError extends Error {
  constructor(message = "Maintainer authentication is required.") {
    super(message);
    this.name = "MaintainerAuthError";
  }
}

function createSearch(value = "") {
  const search = new URLSearchParams();
  Object.entries(value).forEach(([key, rawValue]) => {
    if (rawValue === undefined || rawValue === null || rawValue === "" || rawValue === false) {
      return;
    }

    search.set(key, String(rawValue));
  });
  return search.toString();
}

async function readJsonResponse(response) {
  return response.json().catch(() => ({}));
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    ...init,
  });

  if (response.status === 401) {
    const payload = await readJsonResponse(response);
    throw new MaintainerAuthError(payload.error || "Maintainer authentication is required.");
  }

  if (!response.ok) {
    const payload = await readJsonResponse(response);
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return readJsonResponse(response);
}

export async function createMaintainerSession(passphrase) {
  const response = await fetch(`${MAINTAINER_API_ROOT}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ passphrase }),
  });

  if (!response.ok) {
    const payload = await readJsonResponse(response);
    throw new Error(payload.error || "Maintainer sign-in failed.");
  }
}

export async function destroyMaintainerSession() {
  await fetch(`${MAINTAINER_API_ROOT}/session`, {
    method: "DELETE",
  });
}

export function createMaintainerListHref(filters = {}) {
  const search = createSearch(filters);
  return `${MAINTAINER_API_ROOT}/submissions${search ? `?${search}` : ""}`;
}

export async function fetchMaintainerSubmissions(filters = {}, options = {}) {
  return requestJson(createMaintainerListHref(filters), { signal: options.signal });
}

export async function fetchMaintainerSubmission(id, options = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/submissions/${encodeURIComponent(id)}`, { signal: options.signal });
}

export async function patchMaintainerSubmission(id, updates) {
  return requestJson(`${MAINTAINER_API_ROOT}/submissions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function createMaintainerImportListHref(filters = {}) {
  const search = createSearch(filters);
  return `${MAINTAINER_API_ROOT}/imports${search ? `?${search}` : ""}`;
}

export async function fetchMaintainerImports(filters = {}, options = {}) {
  return requestJson(createMaintainerImportListHref(filters), { signal: options.signal });
}

export async function fetchMaintainerImportCandidate(id, options = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/${encodeURIComponent(id)}`, { signal: options.signal });
}

export async function searchMaintainerImportSources(filters = {}) {
  const search = createSearch(filters);
  return requestJson(`${MAINTAINER_API_ROOT}/imports/search${search ? `?${search}` : ""}`);
}

export async function seedMaintainerImportCandidates(payload = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function hydrateMaintainerImportCandidate(id, payload = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/${encodeURIComponent(id)}/hydrate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchMaintainerImportRun(runId, options = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/runs/${encodeURIComponent(runId)}`, { signal: options.signal });
}

export async function retryMaintainerImportCandidate(id, payload = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function selectMaintainerImportEvidence(id, payload = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/${encodeURIComponent(id)}/evidence`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function auditMaintainerImportCatalog(payload = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/audit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function batchPublishMaintainerImports(payload = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/batch-publish`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchMaintainerImportCandidateReview(id, updates = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/${encodeURIComponent(id)}/review`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function draftMaintainerImportCandidate(id, payload = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/${encodeURIComponent(id)}/draft`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function publishMaintainerImportCandidate(id, payload = {}) {
  return requestJson(`${MAINTAINER_API_ROOT}/imports/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
