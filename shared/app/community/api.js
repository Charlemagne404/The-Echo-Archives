import { COMMUNITY_PROFILE_HEADER, COMMUNITY_PROFILE_KEY, communityState, dataCache } from "../constants.js";
import { normalizeCommunitySummary } from "./formatters.js";

function readStoredProfileId() {
  try {
    return window.localStorage.getItem(COMMUNITY_PROFILE_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function writeStoredProfileId(profileId) {
  if (!profileId) {
    return;
  }

  try {
    window.localStorage.setItem(COMMUNITY_PROFILE_KEY, profileId);
  } catch (_error) {
    // The server cookie still keeps the device-scoped profile stable when localStorage is unavailable.
  }
}

function getExistingCommunityProfileId() {
  return communityState.profileId || readStoredProfileId() || null;
}

async function ensureCommunityProfile() {
  if (communityState.profileId) {
    return communityState.profileId;
  }

  if (!communityState.profilePromise) {
    communityState.profilePromise = (async () => {
      try {
        const existingProfileId = readStoredProfileId();
        const response = await fetch("/api/community/profiles/anonymous", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ existingProfileId }),
        });

        if (!response.ok) {
          throw new Error(`Profile bootstrap failed with ${response.status}`);
        }

        const result = await response.json();
        if (!result || typeof result.profileId !== "string" || !result.profileId.trim()) {
          throw new Error("Profile bootstrap response did not include a profile id.");
        }

        communityState.profileId = result.profileId;
        writeStoredProfileId(result.profileId);
        return result.profileId;
      } catch (error) {
        communityState.profilePromise = null;
        throw error;
      }
    })();
  }

  return communityState.profilePromise;
}

async function fetchCommunityConfig() {
  if (communityState.config) {
    return communityState.config;
  }

  if (!communityState.configPromise) {
    communityState.configPromise = (async () => {
      try {
        const response = await fetch("/api/community/config");
        if (!response.ok) {
          throw new Error(`Community config request failed with ${response.status}`);
        }

        const result = await response.json();
        communityState.config = {
          minPublicRatings: Number.isInteger(result.minPublicRatings) ? result.minPublicRatings : 3,
          ratings: {
            writeEnabled: Boolean(result.ratings?.writeEnabled),
          },
          turnstile: {
            enabled: Boolean(result.turnstile?.enabled),
            siteKey: typeof result.turnstile?.siteKey === "string" ? result.turnstile.siteKey : "",
          },
        };
        return communityState.config;
      } catch (error) {
        communityState.configPromise = null;
        throw error;
      }
    })();
  }

  return communityState.configPromise;
}

async function fetchRatingSummaries(podcastIds, profileId) {
  const query = new URLSearchParams();
  query.set("podcastIds", podcastIds.join(","));

  const response = await fetch(`/api/community/ratings/summary?${query.toString()}`, {
    headers: profileId
      ? {
          [COMMUNITY_PROFILE_HEADER]: profileId,
        }
      : {},
  });

  if (!response.ok) {
    throw new Error(`Summary request failed with ${response.status}`);
  }

  const result = await response.json();
  return result.summaries || {};
}

async function submitCommunityRating(podcastId, rating, turnstileToken = "") {
  const profileId = await ensureCommunityProfile();
  const response = await fetch(`/api/community/podcasts/${encodeURIComponent(podcastId)}/rating`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      [COMMUNITY_PROFILE_HEADER]: profileId,
    },
    body: JSON.stringify({ rating, turnstileToken }),
  });

  if (!response.ok) {
    throw new Error(`Rating request failed with ${response.status}`);
  }

  return response.json();
}

async function clearCommunityRating(podcastId, turnstileToken = "") {
  const profileId = await ensureCommunityProfile();
  const response = await fetch(`/api/community/podcasts/${encodeURIComponent(podcastId)}/rating`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      [COMMUNITY_PROFILE_HEADER]: profileId,
    },
    body: JSON.stringify({ turnstileToken }),
  });

  if (!response.ok) {
    throw new Error(`Rating removal failed with ${response.status}`);
  }

  return response.json();
}

async function loadCommunitySummaries(podcastIds) {
  const ids = Array.from(new Set((Array.isArray(podcastIds) ? podcastIds : []).filter(Boolean)));
  const missingIds = ids.filter(
    (id) => !dataCache.communitySummaries.has(id) && !dataCache.communitySummaryRequests.has(id),
  );

  if (missingIds.length > 0) {
    const request = fetchRatingSummaries(missingIds, null)
      .then((summaries) => {
        missingIds.forEach((id) => {
          const summary = summaries[id];
          dataCache.communitySummaries.set(id, summary ? normalizeCommunitySummary(summary) : null);
        });
      })
      .finally(() => {
        missingIds.forEach((id) => {
          if (dataCache.communitySummaryRequests.get(id) === request) {
            dataCache.communitySummaryRequests.delete(id);
          }
        });
      });

    missingIds.forEach((id) => dataCache.communitySummaryRequests.set(id, request));
  }

  const pendingRequests = Array.from(
    new Set(ids.map((id) => dataCache.communitySummaryRequests.get(id)).filter(Boolean)),
  );
  await Promise.all(pendingRequests);

  return ids.reduce((result, id) => {
    result[id] = dataCache.communitySummaries.get(id) || null;
    return result;
  }, {});
}

export {
  clearCommunityRating,
  ensureCommunityProfile,
  fetchCommunityConfig,
  fetchRatingSummaries,
  getExistingCommunityProfileId,
  loadCommunitySummaries,
  submitCommunityRating,
};
