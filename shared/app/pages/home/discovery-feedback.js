import { toDisplayTag } from "../../utils.js";

export function getDiscoveryFeedback(discoverySearch, filters = {}) {
  if (!discoverySearch?.result) return "";
  const { intent, result } = discoverySearch;
  const details = [];
  const criterionGroups = [
    ["genreIds", "genres"],
    ["formatIds", "formats"],
    ["toneIds", "tones"],
    ["catalogueStatusIds", "completionStatus"],
    ["releaseStatusIds", "releaseStatus"],
    ["bestForIds", "bestFor"],
    ["tagIds", "tags"],
    ["themeIds", "themes"],
    ["commitmentIds", "commitment"],
  ];
  const valuesFor = (group, key, filterGroup = "") => {
    const values = Array.isArray(intent[group]?.[key]) ? intent[group][key] : [];
    return values.filter((value) => !filterGroup || !filters[filterGroup]?.has(value)).map(toDisplayTag);
  };
  const required = criterionGroups.flatMap(([key, filterGroup]) => valuesFor("required", key, filterGroup));
  const preferred = criterionGroups.flatMap(([key, filterGroup]) => valuesFor("preferred", key, filterGroup).map((label) => `Prefer ${label}`));
  const avoided = criterionGroups.flatMap(([key, filterGroup]) => valuesFor("avoid", key, filterGroup).map((label) => `Not ${label}`));
  const runtimeRange = intent.required?.runtimeHours;
  const runtimeTarget = intent.preferred?.runtimeTargetHours;
  const hasRuntimeCriterion = Boolean(runtimeRange || runtimeTarget);
  const criterionCount = required.length + preferred.length + avoided.length + Number(hasRuntimeCriterion);
  const hasUnresolved = Boolean(intent.residual?.unresolvedPhrases?.length || intent.ambiguities?.length);
  const shouldSummarizeCriteria = criterionCount >= 2 || (hasUnresolved && intent.ambiguities?.[0]?.kind !== "taxonomy-title-collision");
  const criteria = [...required, ...preferred, ...avoided];

  if (runtimeRange) {
    if (runtimeRange.min !== null && runtimeRange.min !== undefined && runtimeRange.max !== null && runtimeRange.max !== undefined) {
      const minOperator = runtimeRange.minExclusive ? ">" : "≥";
      const maxOperator = runtimeRange.maxExclusive ? "<" : "≤";
      criteria.push(`${minOperator}${runtimeRange.min} to ${maxOperator}${runtimeRange.max} h`);
    } else if (runtimeRange.min !== null && runtimeRange.min !== undefined) {
      criteria.push(`${runtimeRange.minExclusive ? ">" : "≥"}${runtimeRange.min} h`);
    } else if (runtimeRange.max !== null && runtimeRange.max !== undefined) {
      criteria.push(`${runtimeRange.maxExclusive ? "<" : "≤"}${runtimeRange.max} h`);
    }
  } else if (runtimeTarget) {
    criteria.push(`Around ${runtimeTarget.hours} h`);
  }

  if ((shouldSummarizeCriteria || (hasRuntimeCriterion && criterionCount > 0)) && criteria.length) {
    details.push(criteria.join(" · "));
  }

  if (hasRuntimeCriterion || intent.runtimeRequest) {
    const runtimeEntries = [
      ...(result.sections?.shows || []),
      ...(result.sections?.authoredSimilarity || []),
      ...(result.sections?.computedSimilarity || []),
    ];
    const runtimeKinds = [...new Set(runtimeEntries.map((entry) => entry.runtime?.kind).filter(Boolean))];
    const qualifierLabels = {
      "observed-exact": "observed",
      "observed-reported": "reported",
      "derived-estimate": "estimated",
      unknown: "unknown",
    };
    if (intent.runtimeRequest) {
      const runtime = runtimeEntries[0]?.runtime;
      details.push(runtime?.kind === "unknown"
        ? "Runtime unknown"
        : runtime?.hours !== undefined
          ? `${runtime.hours} h ${qualifierLabels[runtime.kind] || "reported"}`
          : "Runtime unknown");
    } else if (runtimeKinds.length) {
      const qualifierOrder = ["observed-exact", "observed-reported", "derived-estimate", "unknown"];
      const orderedKinds = qualifierOrder.filter((kind) => runtimeKinds.includes(kind));
      details.push(`Runtime evidence: ${orderedKinds.map((kind) => qualifierLabels[kind]).join(", ")}`);
    }
  }

  if (intent.kind === "similarity") {
    const authoredCount = result.sections?.authoredSimilarity?.length || 0;
    const computedCount = result.sections?.computedSimilarity?.length || 0;
    details.push(`${authoredCount} archive picks · ${computedCount} computed matches`);
  }

  if (intent.personalIntent) {
    details.push("Private listening history is not used in public search");
  }

  const firstAmbiguity = intent.ambiguities?.[0];
  if (firstAmbiguity?.kind === "taxonomy-title-collision") {
    details.push(`“${firstAmbiguity.phrase}” can be a genre or title fragment; using genre`);
  } else if (firstAmbiguity) {
    details.push(`“${firstAmbiguity.phrase}” needs clarification`);
  }

  const unresolved = [...new Set(intent.residual?.unresolvedPhrases || [])].slice(0, 2);
  unresolved.forEach((phrase) => details.push(`“${phrase}” wasn’t used as a filter`));
  if ((intent.residual?.unresolvedPhrases || []).length > unresolved.length) {
    details.push("Other unsupported phrases remain in the search text");
  }

  return [...new Set(details)].slice(0, 4).join(" · ");
}
