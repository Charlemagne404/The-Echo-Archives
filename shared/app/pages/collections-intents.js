import { normalizeTag, toDisplayTag } from "../utils.js";
import { prefersReducedMotion, restartAnimationClass } from "./collections-motion.js";

const CURATED_INTENT_FILTERS = [
  { id: "long-walks", label: "Long walks", compactLabel: "Long walks", icon: "M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" },
  { id: "easy-first-step", label: "Easy first step", compactLabel: "Easy start", icon: "M5 12h14M13 6l6 6-6 6" },
  { id: "late-night", label: "Late night", compactLabel: "Late night", icon: "M18 15.5A6.5 6.5 0 1 1 8.5 6 7 7 0 0 0 18 15.5Z" },
  {
    id: "headphones-on",
    label: "Headphones on",
    compactLabel: "Headphones",
    icon: "M4 13a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-2v-7h4M4 13h4v7H6a2 2 0 0 1-2-2v-5Z",
  },
  { id: "serious-sci-fi", label: "Serious sci-fi", compactLabel: "Serious sci-fi", icon: "M12 3v18M4 12h16M7 7l10 10M17 7 7 17" },
  { id: "funny-space", label: "Funny space", compactLabel: "Funny space", icon: "M7 15c2 3 8 3 10 0M8 9h.01M16 9h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" },
  { id: "cold-horror", label: "Cold horror", compactLabel: "Cold horror", icon: "M12 3v18M5 7l14 10M19 7 5 17M4 12h16" },
  { id: "time-bent", label: "Time-bent", compactLabel: "Time-bent", icon: "M12 7v5l3 2M4 12a8 8 0 1 0 3-6.25M4 5v5h5" },
  { id: "finished", label: "Completed", compactLabel: "Completed", icon: "M5.5 12.5 10 17l8.5-9" },
  { id: "quick-listens", label: "Quick listens", compactLabel: "Quick listens", icon: "M12 5.25v6l3.75 2.25M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z" },
  { id: "warm-weird", label: "Warm weird", compactLabel: "Warm weird", icon: "M12 4.75v14.5M7.25 9.5h9.5M8.7 15.3c1 .9 2.08 1.35 3.3 1.35 1.2 0 2.3-.45 3.3-1.35" },
  { id: "binge-listening", label: "Binge listening", compactLabel: "Binge listening", icon: "M6 6.5v11l8.75-5.5L6 6.5ZM17.5 7.5v9" },
  { id: "worldbuilding", label: "Worldbuilding", compactLabel: "Worldbuilding", icon: "M12 3.75c4.56 0 8.25 3.69 8.25 8.25S16.56 20.25 12 20.25 3.75 16.56 3.75 12 7.44 3.75 12 3.75Zm0 0c2.1 2.2 3.25 5.15 3.25 8.25S14.1 18.05 12 20.25m0-16.5c-2.1 2.2-3.25 5.15-3.25 8.25S9.9 18.05 12 20.25m-7.9-5.25h15.8M4.1 9h15.8" },
];
const GENERIC_INTENT_ICON = "M12 4.5 19.5 12 12 19.5 4.5 12 12 4.5Z";
const CURATED_INTENT_FILTER_MAP = new Map(CURATED_INTENT_FILTERS.map((filter) => [filter.id, filter]));

export function buildIntentFilters(collections) {
  const intentIds = new Set();

  collections.forEach((collection) => {
    (collection.intentTags || []).forEach((tag) => {
      const normalized = normalizeTag(tag);
      if (normalized) {
        intentIds.add(normalized);
      }
    });
  });

  const knownFilters = CURATED_INTENT_FILTERS.filter((filter) => intentIds.has(filter.id));
  const fallbackFilters = [...intentIds]
    .filter((intentId) => !CURATED_INTENT_FILTER_MAP.has(intentId))
    .sort((left, right) => toDisplayTag(left).localeCompare(toDisplayTag(right)))
    .map((intentId) => ({
      id: intentId,
      label: toDisplayTag(intentId),
      compactLabel: toDisplayTag(intentId),
      icon: GENERIC_INTENT_ICON,
    }));

  return [...knownFilters, ...fallbackFilters];
}

export function buildIntentCounts(collections) {
  const intentCounts = new Map();

  collections.forEach((collection) => {
    (collection.intentTags || []).forEach((tag) => {
      const normalized = normalizeTag(tag);
      if (!normalized) {
        return;
      }

      intentCounts.set(normalized, (intentCounts.get(normalized) || 0) + 1);
    });
  });

  return intentCounts;
}

function createMoodChip(filter, count, activeIntent, onSelect, { compact = false } = {}) {
  const button = document.createElement("button");
  button.className = compact ? "collections-mood-chip collections-mood-chip-compact" : "collections-mood-chip";
  button.type = "button";
  button.dataset.intent = filter.id;
  button.setAttribute("aria-pressed", String(activeIntent === filter.id));
  button.setAttribute("aria-label", `${filter.label} (${count} ${count === 1 ? "collection" : "collections"})`);
  if (compact) {
    button.title = filter.label;
  }

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", filter.icon);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "1.8");
  icon.appendChild(path);

  const label = document.createElement("span");
  label.className = compact ? "collections-mood-chip-label collections-mood-chip-label-compact" : "collections-mood-chip-label";
  label.textContent = compact ? filter.compactLabel || filter.label : filter.label;

  button.append(icon, label);
  if (!compact) {
    const countNode = document.createElement("strong");
    countNode.textContent = String(count);
    button.appendChild(countNode);
  }
  button.addEventListener("click", () => onSelect(filter.id));
  return button;
}

export function mountMoodChips({ moodChips, intentFilters, intentCounts, onSelect, compact = false }) {
  const chipMap = new Map();
  moodChips.textContent = "";
  intentFilters.forEach((filter) => {
    const count = intentCounts.get(filter.id) || 0;
    const chip = createMoodChip(filter, count, "", (intentId) => onSelect(intentId, compact ? "sticky" : "hero"), { compact });
    chipMap.set(filter.id, chip);
    moodChips.appendChild(chip);
  });

  return chipMap;
}

export function syncMoodChipState(chipMap, activeIntent, { scrollActiveIntoView = false } = {}) {
  chipMap.forEach((chip, intent) => {
    const isActive = activeIntent === intent;
    const wasActive = chip.getAttribute("aria-pressed") === "true";
    chip.setAttribute("aria-pressed", String(isActive));

    if (!isActive || wasActive) {
      return;
    }

    restartAnimationClass(chip, "is-activating", 340);
    if (scrollActiveIntoView) {
      chip.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  });
}

export function createStickyMoodBarController({ observedSurface, stickyBar }) {
  let observer = null;

  const setStickyMoodBarVisibility = (isVisible) => {
    const nextVisibility = isVisible ? "visible" : "hidden";
    if (stickyBar.dataset.visibility === nextVisibility) {
      return;
    }

    stickyBar.dataset.visibility = nextVisibility;
    stickyBar.setAttribute("aria-hidden", String(!isVisible));
  };

  const start = () => {
    setStickyMoodBarVisibility(false);
    if (!(observedSurface instanceof HTMLElement) || !(stickyBar instanceof HTMLElement) || typeof IntersectionObserver !== "function") {
      return;
    }

    observer = new IntersectionObserver(
      ([entry]) => {
        const isMeaningfullyVisible = Boolean(entry?.isIntersecting) && (entry?.intersectionRatio || 0) >= 0.35;
        setStickyMoodBarVisibility(!isMeaningfullyVisible);
      },
      {
        threshold: [0, 0.2, 0.35, 0.6, 0.85],
        rootMargin: "-12px 0px 0px 0px",
      },
    );

    observer.observe(observedSurface);
  };

  return {
    start,
    disconnect() {
      observer?.disconnect();
    },
  };
}
