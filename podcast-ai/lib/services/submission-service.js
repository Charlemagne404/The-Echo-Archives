function createSubmissionService({
  store,
  throttleWindowMs = 60 * 60 * 1000,
  maxSubmissionsPerWindow = 3,
}) {
  const recentByIp = new Map();

  function trimString(value, maxLength = 2000) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function isValidUrl(value = "") {
    if (!value) {
      return true;
    }

    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_error) {
      return false;
    }
  }

  function isValidEmail(value = "") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function checkThrottle(sourceIp) {
    if (!sourceIp) {
      return;
    }

    const now = Date.now();
    const recent = (recentByIp.get(sourceIp) || []).filter((timestamp) => now - timestamp < throttleWindowMs);

    if (recent.length >= maxSubmissionsPerWindow) {
      const error = new Error("Too many submissions from this address. Try again later.");
      error.statusCode = 429;
      throw error;
    }

    recent.push(now);
    recentByIp.set(sourceIp, recent);
  }

  function submitShow({
    showTitle,
    creatorName,
    contactEmail,
    officialSite,
    rssOrListenLink,
    genres,
    notes,
    honeypot,
    sourceIp,
    userAgent,
  }) {
    if (trimString(honeypot, 200)) {
      return {
        accepted: true,
        filtered: true,
      };
    }

    checkThrottle(sourceIp);

    const normalizedShowTitle = trimString(showTitle, 160);
    const normalizedCreatorName = trimString(creatorName, 160);
    const normalizedContactEmail = trimString(contactEmail, 160).toLowerCase();
    const normalizedOfficialSite = trimString(officialSite, 500);
    const normalizedRssOrListenLink = trimString(rssOrListenLink, 500);
    const normalizedGenres = trimString(genres, 300);
    const normalizedNotes = trimString(notes, 4000);

    if (!normalizedShowTitle) {
      const error = new Error("Show title is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!normalizedContactEmail || !isValidEmail(normalizedContactEmail)) {
      const error = new Error("A valid contact email is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!normalizedOfficialSite && !normalizedRssOrListenLink) {
      const error = new Error("Provide either an official site or an RSS/listen link.");
      error.statusCode = 400;
      throw error;
    }

    if (!isValidUrl(normalizedOfficialSite) || !isValidUrl(normalizedRssOrListenLink)) {
      const error = new Error("Submitted links must be valid http or https URLs.");
      error.statusCode = 400;
      throw error;
    }

    const submission = store.createShowSubmission({
      status: "new",
      showTitle: normalizedShowTitle,
      creatorName: normalizedCreatorName,
      contactEmail: normalizedContactEmail,
      officialSite: normalizedOfficialSite,
      rssOrListenLink: normalizedRssOrListenLink,
      genres: normalizedGenres,
      notes: normalizedNotes,
      sourceIp: sourceIp || "",
      userAgent: trimString(userAgent, 500),
    });

    return {
      accepted: true,
      filtered: false,
      submission,
    };
  }

  return {
    submitShow,
  };
}

module.exports = {
  createSubmissionService,
};
