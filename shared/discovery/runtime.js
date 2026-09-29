(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EchoDiscoveryRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const roundOneDecimal = (value) => Math.round(value * 10) / 10;
  const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

  function getRuntimeEvidence(show) {
    const length = show?.length || {};
    const episodes = Number(length.episodes);
    const averageMinutes = Number(length.avgEpisodeMinutes);
    const calculatedHours = isPositiveNumber(episodes) && isPositiveNumber(averageMinutes)
      ? roundOneDecimal(episodes * averageMinutes / 60)
      : null;
    const statedHours = Number(length.totalHours);
    const hasStatedHours = Number.isFinite(statedHours) && statedHours > 0;
    const researchGaps = Array.isArray(show?.metadata?.researchGaps) ? show.metadata.researchGaps : [];
    const runtimeGap = show?.runtimeGap === true || researchGaps.some((gap) => /runtime|total duration/i.test(String(gap)));
    const estimateMatches = hasStatedHours && calculatedHours !== null && Math.abs(statedHours - calculatedHours) < 0.051;

    if (estimateMatches && runtimeGap) {
      return {
        kind: "derived-estimate",
        hours: roundOneDecimal(calculatedHours),
        scope: "Estimated from the listed episode count and average episode length; not an exact episode-duration sum.",
        basis: { episodeCount: episodes, averageEpisodeMinutes: averageMinutes },
      };
    }
    if (hasStatedHours && length.durationCoverage === 1) {
      const scope = "Observed full-episode set";
      const completionUnclear = show.completionStatus === "unclear" || show.completionStatus === undefined;
      return {
        kind: "observed-exact",
        hours: statedHours,
        scope: completionUnclear ? scope + "; completion is unclear, so this is not a final whole-series runtime." : scope + ".",
        durationCoverage: 1,
      };
    }
    if (hasStatedHours) {
      return {
        kind: "observed-reported",
        hours: statedHours,
        scope: length.durationCoverage > 0
          ? "Catalogue-reported runtime with partial episode-duration coverage."
          : "Catalogue-reported runtime; episode-duration coverage is unspecified.",
        durationCoverage: Number.isFinite(Number(length.durationCoverage)) ? Number(length.durationCoverage) : null,
      };
    }
    if (calculatedHours !== null) {
      return {
        kind: "derived-estimate",
        hours: calculatedHours,
        scope: "Estimated for the listed episode inventory from episode count and average episode length; this may not cover the whole series.",
        basis: { episodeCount: episodes, averageEpisodeMinutes: averageMinutes },
      };
    }
    return { kind: "unknown", hours: null, scope: "No comparable aggregate runtime is supported by the catalogue evidence." };
  }

  function isComparableRuntime(evidence) {
    return Boolean(evidence && ["observed-exact", "observed-reported", "derived-estimate"].includes(evidence.kind) && Number.isFinite(evidence.hours));
  }

  function explainRuntime(evidence) {
    if (!isComparableRuntime(evidence)) return { kind: "runtime-unknown", text: evidence?.scope || "Runtime unknown." };
    const qualifier = evidence.kind === "derived-estimate" ? "Estimated" : evidence.kind === "observed-exact" ? "Observed" : "Reported";
    return { kind: evidence.kind, hours: evidence.hours, scope: evidence.scope, text: qualifier + " runtime: about " + evidence.hours + " hours. " + evidence.scope };
  }

  return { getRuntimeEvidence, isComparableRuntime, explainRuntime };
});
