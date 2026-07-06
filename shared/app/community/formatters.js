const EMPTY_COMMUNITY_SCORE_TEXT = "--/10";

function normalizeIntegerInRange(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  const integerValue = Math.trunc(numericValue);
  if (integerValue < min || integerValue > max) {
    return fallback;
  }

  return integerValue;
}

function normalizeRatingValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 10 ? numericValue : null;
}

function normalizeCommunitySummary(summary) {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const ratingCount = normalizeIntegerInRange(summary.ratingCount, { min: 0 });
  const minimumRatingCount = normalizeIntegerInRange(summary.minimumRatingCount, { min: 1, fallback: 3 });
  const averageRating = ratingCount > 0 ? normalizeRatingValue(summary.averageRating) : null;
  const myRating = normalizeIntegerInRange(summary.myRating, { min: 1, max: 10, fallback: 0 }) || null;
  const sourceDistribution =
    summary.distribution && typeof summary.distribution === "object" && !Array.isArray(summary.distribution)
      ? summary.distribution
      : {};
  const distribution = {};

  for (let rating = 1; rating <= 10; rating += 1) {
    distribution[String(rating)] = normalizeIntegerInRange(sourceDistribution[String(rating)], { min: 0 });
  }

  return {
    ...summary,
    averageRating,
    ratingCount,
    minimumRatingCount,
    myRating,
    distribution,
  };
}

function formatDetailCommunitySummary(summary) {
  summary = normalizeCommunitySummary(summary);
  if (!summary || summary.ratingCount === 0) {
    return "No community ratings yet. Listener scores stay separate from the archive rating and only appear once people actually rate the show.";
  }

  if (summary.averageRating === null) {
    const noun = summary.ratingCount === 1 ? "rating" : "ratings";
    const yourRating = summary.myRating ? ` Your rating: ${summary.myRating}/10.` : "";
    const threshold = summary.minimumRatingCount || 3;
    return `Community average appears after ${threshold} verified ratings. ${summary.ratingCount} ${noun} recorded so far.${yourRating}`;
  }

  const noun = summary.ratingCount === 1 ? "rating" : "ratings";
  const yourRating = summary.myRating ? ` Your rating: ${summary.myRating}/10.` : "";
  return `Community average ${summary.averageRating.toFixed(1)}/10 from ${summary.ratingCount} ${noun}.${yourRating}`;
}

function getDetailCommunityMetricValue(summary) {
  summary = normalizeCommunitySummary(summary);
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return EMPTY_COMMUNITY_SCORE_TEXT;
  }

  return `${summary.averageRating.toFixed(1)}/10`;
}

function getDetailCommunityMetricCount(summary) {
  summary = normalizeCommunitySummary(summary);
  if (!summary || summary.ratingCount === 0) {
    return "No ratings yet";
  }

  return `${summary.ratingCount} ${summary.ratingCount === 1 ? "rating" : "ratings"}`;
}

function syncHeroCommunityMetric(widget, summary) {
  if (widget.heroValue) {
    widget.heroValue.textContent = getDetailCommunityMetricValue(summary);
  }

  if (widget.heroCount) {
    widget.heroCount.textContent = getDetailCommunityMetricCount(summary);
  }
}

function formatCommunityBadgeText(summary) {
  summary = normalizeCommunitySummary(summary);
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return EMPTY_COMMUNITY_SCORE_TEXT;
  }

  return `${summary.averageRating.toFixed(1)}/10`;
}

function formatCommunityBadgeAriaLabel(summary) {
  summary = normalizeCommunitySummary(summary);
  if (!summary || summary.ratingCount === 0) {
    return "Community score --/10. No ratings yet.";
  }

  if (summary.averageRating === null) {
    const noun = summary.ratingCount === 1 ? "rating" : "ratings";
    const threshold = summary.minimumRatingCount || 3;
    return `Community score hidden until ${threshold} verified ratings. ${summary.ratingCount} ${noun} recorded.`;
  }

  const noun = summary.ratingCount === 1 ? "rating" : "ratings";
  return `Community score ${summary.averageRating.toFixed(1)}/10 from ${summary.ratingCount} ${noun}.`;
}

export {
  EMPTY_COMMUNITY_SCORE_TEXT,
  formatCommunityBadgeAriaLabel,
  formatCommunityBadgeText,
  formatDetailCommunitySummary,
  getDetailCommunityMetricCount,
  getDetailCommunityMetricValue,
  normalizeCommunitySummary,
};
