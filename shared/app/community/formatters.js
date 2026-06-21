const EMPTY_COMMUNITY_SCORE_TEXT = "--/10";

function formatDetailCommunitySummary(summary) {
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
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return EMPTY_COMMUNITY_SCORE_TEXT;
  }

  return `${summary.averageRating.toFixed(1)}/10`;
}

function getDetailCommunityMetricCount(summary) {
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
  if (!summary || summary.ratingCount === 0 || summary.averageRating === null) {
    return EMPTY_COMMUNITY_SCORE_TEXT;
  }

  return `${summary.averageRating.toFixed(1)}/10`;
}

function formatCommunityBadgeAriaLabel(summary) {
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
};
