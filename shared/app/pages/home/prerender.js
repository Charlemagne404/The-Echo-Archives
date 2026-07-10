import { buildHomeCardPreviewId, createShowCard } from "../../render-cards.js";

export function hasPrerenderedHomeContent(elements) {
  return Boolean(
    elements?.archiveGrid?.dataset.homePrerendered === "true" &&
      elements.archiveGrid.querySelector(".podcast-card-shell[data-podcast-id]"),
  );
}

function hydrateExistingArchiveShell(shell, show, { previewMode = "" } = {}) {
  if (!(shell instanceof HTMLElement)) {
    return createShowCard(show, { previewMode });
  }

  const card = shell.querySelector(".podcast-card");
  const title = card?.querySelector("[data-card-title='true'], h2");
  const tags = card?.querySelector("[data-card-meta='true'], .tags");
  if (!(card instanceof HTMLElement) || !(title instanceof HTMLElement) || !(tags instanceof HTMLElement)) {
    return createShowCard(show, { previewMode });
  }

  shell.dataset.podcastId = show.id || "unknown-show";
  card.dataset.podcastId = show.id || "unknown-show";
  card.__cardNodes = { title, tags };

  if (previewMode === "inline-expand") {
    const previewId = buildHomeCardPreviewId(show.id || "unknown-show");
    shell.dataset.previewCard = "true";
    card.classList.add("podcast-card-primary");
    card.setAttribute("aria-controls", previewId);
    card.setAttribute("aria-expanded", "false");
    shell.__homeCardPreviewShow = show;
    shell.__homeCardPreviewId = previewId;
  }

  return shell;
}

export function buildArchiveCardShellsById({ shows, archiveGrid, previewMode = "" }) {
  const existingShellsById = new Map(
    Array.from(archiveGrid.querySelectorAll(".podcast-card-shell[data-podcast-id]"))
      .filter((shell) => shell instanceof HTMLElement)
      .map((shell) => [shell.dataset.podcastId || "", shell]),
  );

  return new Map(
    shows.map((show) => [
      show.id,
      hydrateExistingArchiveShell(existingShellsById.get(show.id) || null, show, {
        previewMode,
      }),
    ]),
  );
}
