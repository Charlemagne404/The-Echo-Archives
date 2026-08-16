import { MaintainerAuthError } from "./api.js";

const ROOT = "/api/maintainer/collections";

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    ...init,
  });
  const payload = await readJson(response);
  if (response.status === 401) throw new MaintainerAuthError(payload.error || "Maintainer authentication is required.");
  if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

export function fetchMaintainerCollections(options = {}) { return request(ROOT, { signal: options.signal }); }
export function fetchMaintainerCollection(id, options = {}) { return request(`${ROOT}/${encodeURIComponent(id)}`, { signal: options.signal }); }
export function generateMaintainerCollectionCandidates(payload = {}) { return request(`${ROOT}/candidates/generate`, { method: "POST", body: JSON.stringify(payload) }); }
export function patchMaintainerCollectionCandidate(id, payload = {}) { return request(`${ROOT}/candidates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function approveMaintainerCollectionCandidate(id, payload = {}) { return request(`${ROOT}/candidates/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify(payload) }); }
export function rejectMaintainerCollectionCandidate(id, payload = {}) { return request(`${ROOT}/candidates/${encodeURIComponent(id)}/reject`, { method: "POST", body: JSON.stringify(payload) }); }
export function patchMaintainerCollection(id, payload = {}) { return request(`${ROOT}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function regenerateMaintainerCollection(id, payload = {}) { return request(`${ROOT}/${encodeURIComponent(id)}/regenerate`, { method: "POST", body: JSON.stringify(payload) }); }
export function setMaintainerCollectionMembership(id, showId, payload = {}) { return request(`${ROOT}/${encodeURIComponent(id)}/memberships/${encodeURIComponent(showId)}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function clearMaintainerCollectionMembership(id, showId, payload = {}) { return request(`${ROOT}/${encodeURIComponent(id)}/memberships/${encodeURIComponent(showId)}`, { method: "DELETE", body: JSON.stringify(payload) }); }
